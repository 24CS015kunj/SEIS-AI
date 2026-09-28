"""Unit tests for app/core/generation/conversation_store.py (Task 65).

Exercises ConversationStore against a stub standing in for RedisClient
(same test-double pattern as test_lexical_retriever.py's
_StubChromaClient) -- no real Redis call is made.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.config.settings import Settings
from app.core.generation.conversation_store import ConversationStore
from app.domain.enums import ConversationRole
from app.domain.exceptions import CacheError
from app.domain.models import StoredChatMessage, StoredConversation


class _StubRedisClient:
    def __init__(
        self, *, get_error: Exception | None = None, set_error: Exception | None = None
    ) -> None:
        self._store: dict[str, str] = {}
        self._get_error = get_error
        self._set_error = set_error
        self.set_calls: list[dict[str, object]] = []

    async def get_cache(self, key: str) -> str | None:
        if self._get_error is not None:
            raise self._get_error
        return self._store.get(key)

    async def set_cache(self, key: str, value: str, ttl_seconds: int) -> None:
        if self._set_error is not None:
            raise self._set_error
        self._store[key] = value
        self.set_calls.append({"key": key, "value": value, "ttl_seconds": ttl_seconds})

    def seed(self, key: str, value: str) -> None:
        self._store[key] = value


def _store(
    redis: _StubRedisClient, *, ttl: int = 86_400, max_messages: int = 12
) -> ConversationStore:
    settings = Settings(
        conversation_history_ttl_seconds=ttl, conversation_history_max_messages=max_messages
    )
    return ConversationStore(cache_client=redis, settings=settings)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Key design / repository isolation
# ---------------------------------------------------------------------------
async def test_key_is_scoped_by_repository_id_and_conversation_id() -> None:
    redis = _StubRedisClient()
    store = _store(redis)

    await store.append_turn("repo-a", "conv-x", "hello", "hi")

    assert list(redis._store.keys()) == ["conversation:repo-a:conv-x"]


async def test_same_conversation_id_under_a_different_repository_cannot_access_history() -> None:
    redis = _StubRedisClient()
    store = _store(redis)

    await store.append_turn("repo-a", "shared-id", "question about repo A", "answer A")
    history_b = await store.load_history("repo-b", "shared-id")

    assert history_b == []


async def test_same_conversation_id_under_a_different_repository_writes_a_separate_record() -> None:
    redis = _StubRedisClient()
    store = _store(redis)

    await store.append_turn("repo-a", "shared-id", "question A", "answer A")
    await store.append_turn("repo-b", "shared-id", "question B", "answer B")

    history_a = await store.load_history("repo-a", "shared-id")
    history_b = await store.load_history("repo-b", "shared-id")

    assert [m.content for m in history_a] == ["question A", "answer A"]
    assert [m.content for m in history_b] == ["question B", "answer B"]


async def test_a_stored_record_whose_own_repository_id_disagrees_is_rejected() -> None:
    """Defense in depth: even if a record somehow ended up under the wrong
    key, load_history never trusts its own repository_id field blindly."""
    redis = _StubRedisClient()
    mismatched = StoredConversation(
        repository_id="repo-a",
        conversation_id="conv-x",
        messages=[
            StoredChatMessage(role=ConversationRole.USER, content="hi", timestamp=datetime.now(UTC))
        ],
    )
    redis.seed("conversation:repo-b:conv-x", mismatched.model_dump_json())
    store = _store(redis)

    history = await store.load_history("repo-b", "conv-x")

    assert history == []


# ---------------------------------------------------------------------------
# New / unknown conversation
# ---------------------------------------------------------------------------
async def test_unknown_conversation_returns_empty_history() -> None:
    redis = _StubRedisClient()
    store = _store(redis)

    assert await store.load_history("repo-a", "never-seen") == []


# ---------------------------------------------------------------------------
# Persistence / multi-turn behavior
# ---------------------------------------------------------------------------
async def test_second_request_receives_the_previously_persisted_history() -> None:
    redis = _StubRedisClient()
    store = _store(redis)

    await store.append_turn("repo-a", "conv-x", "what does maze.py do?", "it generates mazes")
    history = await store.load_history("repo-a", "conv-x")

    assert [m.role for m in history] == [ConversationRole.USER, ConversationRole.ASSISTANT]
    assert [m.content for m in history] == ["what does maze.py do?", "it generates mazes"]


async def test_same_conversation_id_works_across_multiple_turns() -> None:
    redis = _StubRedisClient()
    store = _store(redis)

    await store.append_turn("repo-a", "conv-x", "turn 1 question", "turn 1 answer")
    await store.append_turn("repo-a", "conv-x", "turn 2 question", "turn 2 answer")
    history = await store.load_history("repo-a", "conv-x")

    assert [m.content for m in history] == [
        "turn 1 question",
        "turn 1 answer",
        "turn 2 question",
        "turn 2 answer",
    ]


async def test_set_cache_is_called_with_the_configured_ttl() -> None:
    redis = _StubRedisClient()
    store = _store(redis, ttl=3600)

    await store.append_turn("repo-a", "conv-x", "q", "a")

    assert redis.set_calls[0]["ttl_seconds"] == 3600


# ---------------------------------------------------------------------------
# History limit (Task 65 Step 6)
# ---------------------------------------------------------------------------
async def test_history_limit_is_enforced_on_persisted_messages() -> None:
    redis = _StubRedisClient()
    store = _store(redis, max_messages=4)

    for i in range(5):
        await store.append_turn("repo-a", "conv-x", f"q{i}", f"a{i}")

    history = await store.load_history("repo-a", "conv-x")

    assert len(history) == 4


async def test_history_limit_retains_the_newest_messages() -> None:
    redis = _StubRedisClient()
    store = _store(redis, max_messages=4)

    for i in range(5):
        await store.append_turn("repo-a", "conv-x", f"q{i}", f"a{i}")

    history = await store.load_history("repo-a", "conv-x")

    assert [m.content for m in history] == ["q3", "a3", "q4", "a4"]


async def test_history_limit_is_also_enforced_defensively_on_load() -> None:
    """Even if a stored record somehow held more messages than the current
    limit allows (e.g. the limit was lowered after data was written),
    load_history never returns more than the configured maximum."""
    redis = _StubRedisClient()
    oversized = StoredConversation(
        repository_id="repo-a",
        conversation_id="conv-x",
        messages=[
            StoredChatMessage(
                role=ConversationRole.USER, content=f"m{i}", timestamp=datetime.now(UTC)
            )
            for i in range(20)
        ],
    )
    redis.seed("conversation:repo-a:conv-x", oversized.model_dump_json())
    store = _store(redis, max_messages=4)

    history = await store.load_history("repo-a", "conv-x")

    assert len(history) == 4
    assert [m.content for m in history] == ["m16", "m17", "m18", "m19"]


# ---------------------------------------------------------------------------
# Error handling (Task 65 Step 9)
# ---------------------------------------------------------------------------
async def test_storage_read_failure_gracefully_falls_back_to_empty_history() -> None:
    redis = _StubRedisClient(get_error=CacheError("Redis unreachable"))
    store = _store(redis)

    history = await store.load_history("repo-a", "conv-x")

    assert history == []


async def test_storage_write_failure_does_not_raise() -> None:
    redis = _StubRedisClient(set_error=CacheError("Redis unreachable"))
    store = _store(redis)

    await store.append_turn("repo-a", "conv-x", "q", "a")  # must not raise


async def test_malformed_stored_json_falls_back_to_empty_history() -> None:
    redis = _StubRedisClient()
    redis.seed("conversation:repo-a:conv-x", "{not valid json")
    store = _store(redis)

    assert await store.load_history("repo-a", "conv-x") == []


async def test_stored_json_missing_required_fields_falls_back_to_empty_history() -> None:
    redis = _StubRedisClient()
    redis.seed("conversation:repo-a:conv-x", '{"repository_id": "repo-a"}')
    store = _store(redis)

    assert await store.load_history("repo-a", "conv-x") == []


async def test_stored_json_that_is_a_valid_but_unrelated_shape_falls_back_to_empty_history() -> (
    None
):
    redis = _StubRedisClient()
    redis.seed("conversation:repo-a:conv-x", "[1, 2, 3]")
    store = _store(redis)

    assert await store.load_history("repo-a", "conv-x") == []


# ---------------------------------------------------------------------------
# No fabricated data (schema-level guarantee)
# ---------------------------------------------------------------------------
def test_stored_message_schema_carries_no_secrets_or_vectors() -> None:
    field_names = set(StoredChatMessage.model_fields.keys())
    assert field_names == {"role", "content", "timestamp"}
