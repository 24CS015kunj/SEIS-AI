"""Conversation Persistence (Task 65).

Repository Chat's ``conversation_id`` has always been accepted and
echoed back unchanged, but until this task nothing durable was ever
associated with it -- ``RepositoryChatService`` always called
``PromptBuilder.build_chat_prompt`` with ``history=[]``, so a second
message using the same ``conversation_id`` was indistinguishable from a
brand-new conversation. This module is the storage layer that fixes
that.

Storage decision: Redis, via the already-existing, already-verified-
healthy :class:`~app.infra.cache.cache_client.RedisClient` (Task 10,
ADR-005) -- no new infrastructure, no new database, no new container.
Conversation history is exactly the kind of
data Redis is already used for elsewhere in this codebase (the
Embedding Cache, RAG response caching): short-lived, keyed, replaceable
state, not durable system-of-record data the way a MongoDB document
would be. ``Settings.cache_backend`` (``"memory" | "redis"``) is a
pre-existing but currently-unbranched-on field -- ``RedisClient`` is
already unconditionally what ``app.api.deps.get_cache_client`` returns,
already a live singleton, already health-checked at ``/health/ready``.
Adding a MongoDB dependency to this service (a new driver, a new
connection pool, new settings, and a concern this service has never
owned -- Express/MongoDB is a completely separate process) would be a
far larger footprint for the same outcome, and nothing about
conversation history needs cross-process durability guarantees a TTL'd
cache can't provide.

Key design (§Task 65 Step 4): ``conversation:{repository_id}:
{conversation_id}`` -- repository isolation is encoded directly into
the storage key itself, the same "isolation via a required, explicit
scoping parameter" pattern ``ChromaClient``'s ``repo_{repository_id}``
collection naming already establishes (ADR-004). A ``conversation_id``
alone is never sufficient to address a stored conversation: the exact
same ``conversation_id`` string under two different repositories maps
to two entirely different Redis keys and therefore two independent,
non-overlapping histories. ``load_history`` additionally verifies the
stored record's own ``repository_id`` field matches the caller's before
trusting it (§Step 9) -- defense in depth, not merely trusting a key
that was built correctly.

Schema: :class:`~app.domain.models.StoredConversation` (frozen list of
:class:`~app.domain.models.StoredChatMessage`: ``role``, ``content``,
``timestamp`` only) serialized via Pydantic's own
``model_dump_json``/``model_validate_json`` -- no embeddings, vectors,
API keys, or raw retrieval chunks are ever part of this shape, so none
can end up in Redis by construction.

Bounding (§Step 6): ``Settings.conversation_history_max_messages``
(default 12 -- 6 user/assistant turns) caps both what is persisted
(oldest messages are dropped first on every write) and what
``load_history`` ever returns to be sent to Nemotron 3 Ultra --
unbounded growth is impossible even if a caller sent hundreds of
messages under one ``conversation_id``. TTL (default 24h,
``Settings.conversation_history_ttl_seconds``) bounds retention the
same mandatory-expiry way every other value ``RedisClient.set_cache``
writes already does.

Error handling (§Step 9): a storage-read failure (Redis unreachable,
malformed JSON, a schema mismatch, or a repository_id that disagrees
with the requested one) degrades to an **empty history**, never a
failed request. Conversation history is a continuity/UX enhancement on
top of an already-fully-grounded RAG answer (retrieval, reranking,
citations are completely independent of history -- see
``RepositoryChatService.chat``) -- losing it costs the model a pronoun
resolution, never a fact. Failing the whole chat turn over a Redis
hiccup would make the product less available for zero correctness or
security benefit. This is graceful, not silent, in one specific case: a
stored record whose own ``repository_id`` doesn't match the requested
one is logged at ``error`` (never ``warning``/``debug``) precisely
because that would indicate the key-isolation invariant was somehow
violated -- the response to the user is still just "no history" (safe:
it can never leak another repository's content into this answer), but
the event itself is never hidden from the logs. A write (persist)
failure is likewise swallowed after a warning -- the user already
received a correct, fully-grounded answer by that point; only the
*next* turn's continuity is at risk, not this turn's correctness.
"""

from __future__ import annotations

from datetime import UTC, datetime

import structlog
from pydantic import ValidationError

from app.config.settings import Settings
from app.domain.enums import ConversationRole
from app.domain.exceptions import CacheError
from app.domain.models import ChatMessage, StoredChatMessage, StoredConversation
from app.infra.cache.cache_client import RedisClient

logger = structlog.get_logger("seis.core.generation")


def _key(repository_id: str, conversation_id: str) -> str:
    return f"conversation:{repository_id}:{conversation_id}"


class ConversationStore:
    """Loads and persists Repository Chat conversation history in Redis (Task 65)."""

    def __init__(self, cache_client: RedisClient, settings: Settings) -> None:
        self._cache = cache_client
        self._settings = settings
        self._log = logger.bind(component="conversation_store")

    async def load_history(self, repository_id: str, conversation_id: str) -> list[ChatMessage]:
        """Returns prior turns for ``(repository_id, conversation_id)`` as
        plain :class:`ChatMessage` (role, content) ready for
        ``PromptBuilder.build_chat_prompt``, newest-bounded to
        ``Settings.conversation_history_max_messages``. Returns ``[]`` --
        never raises -- for an unknown conversation, a storage failure,
        malformed stored JSON, or a repository_id mismatch (see module
        docstring).
        """
        record = await self._load_record(repository_id, conversation_id)
        if record is None:
            return []

        max_messages = self._settings.conversation_history_max_messages
        bounded = record.messages[-max_messages:]
        return [ChatMessage(role=message.role, content=message.content) for message in bounded]

    async def append_turn(
        self, repository_id: str, conversation_id: str, user_message: str, assistant_message: str
    ) -> None:
        """Persists one completed turn (user message + assistant answer).

        Must only ever be called after generation *and* citation
        extraction have both succeeded (§Step 5/9) -- callers must never
        invoke this with a fabricated or partial assistant response. A
        storage failure here is logged and swallowed, never raised: the
        caller already has a correct answer to return to the user by the
        time this runs.
        """
        record = await self._load_record(repository_id, conversation_id)
        if record is None:
            record = StoredConversation(
                repository_id=repository_id, conversation_id=conversation_id
            )

        now = datetime.now(UTC)
        record.messages.append(
            StoredChatMessage(role=ConversationRole.USER, content=user_message, timestamp=now)
        )
        record.messages.append(
            StoredChatMessage(
                role=ConversationRole.ASSISTANT, content=assistant_message, timestamp=now
            )
        )

        max_messages = self._settings.conversation_history_max_messages
        if len(record.messages) > max_messages:
            record.messages = record.messages[-max_messages:]

        try:
            await self._cache.set_cache(
                _key(repository_id, conversation_id),
                record.model_dump_json(),
                ttl_seconds=self._settings.conversation_history_ttl_seconds,
            )
        except CacheError as exc:
            self._log.warning(
                "conversation_store.persist_failed",
                repository_id=repository_id,
                conversation_id=conversation_id,
                error=str(exc),
            )

    async def _load_record(
        self, repository_id: str, conversation_id: str
    ) -> StoredConversation | None:
        try:
            raw = await self._cache.get_cache(_key(repository_id, conversation_id))
        except CacheError as exc:
            self._log.warning(
                "conversation_store.load_failed",
                repository_id=repository_id,
                conversation_id=conversation_id,
                error=str(exc),
            )
            return None

        if raw is None:
            return None

        try:
            record = StoredConversation.model_validate_json(raw)
        except (ValidationError, ValueError) as exc:
            self._log.warning(
                "conversation_store.malformed_record",
                repository_id=repository_id,
                conversation_id=conversation_id,
                error=str(exc),
            )
            return None

        if record.repository_id != repository_id:
            # Should be unreachable -- the key itself already scopes by
            # repository_id -- but a stored record is never trusted
            # blindly for an isolation-critical property. Logged at
            # `error`, not `warning`: this is the one condition in this
            # module that would indicate the isolation invariant itself
            # was somehow violated, not just an ordinary cache miss.
            self._log.error(
                "conversation_store.repository_mismatch",
                requested_repository_id=repository_id,
                stored_repository_id=record.repository_id,
                conversation_id=conversation_id,
            )
            return None

        return record
