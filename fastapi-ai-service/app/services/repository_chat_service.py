"""Repository Chat orchestration service.

Coordinates Query Rewriter -> Retriever -> RAG Optimizer -> Context
Builder -> Prompt Builder -> LLM Gateway -> Citation Engine for a single
chat turn (Task 54, §5.11, §10). No component here is reimplemented --
every step delegates to the existing, already-tested module named in
that pipeline. Since Task 60/ADR-008 the LLM Gateway calls NVIDIA's
hosted Nemotron 3 Ultra rather than Gemini -- this orchestration is
unchanged; only the injected gateway's own internals moved provider.

Query rewriting (Task 66): ``QueryRewriter.rewrite`` runs right after
history is loaded and before retrieval. It only ever affects what is
searched/reranked with -- ``retrieval_query.text`` feeds
``VectorRetriever``/``LexicalRetriever``/``RAGOptimizer`` in place of
the raw message, but ``request.message`` (never the rewritten text)
still reaches ``PromptBuilder`` and ``ConversationStore.append_turn``
unchanged, so the model's own conversational understanding and what
gets persisted as "what the user asked" are both untouched by this.

Deterministic structure queries (Task 67): right after history is
loaded, ``detect_structure_intent(request.message)`` checks whether this
is one of a narrow, conservative set of repository-structure questions
("what files are in X", "does Y exist", "where is Z") -- see
``app.core.retrieval.structure_intent``'s own module docstring for why
this is regex-based, not LLM-based, and why it is safe against
misclassifying a conceptual question. When it matches,
``_answer_structure_query`` resolves the answer from
``RepositoryStructureService`` (real, already-indexed ChromaDB chunk
metadata -- never a relevance judgment) and reuses the *exact same*
``ContextBuilder``/``PromptBuilder``/``NemotronGateway``/
``CitationEngine`` tail this method already uses for RAG answers --
only ``VectorRetriever``/``LexicalRetriever``/``RAGOptimizer`` (the
embedding call, and the reranking call) are skipped, since a structural
listing needs no relevance ranking. Every other question -- anything
``detect_structure_intent`` returns ``None`` for -- continues through
the unchanged Task 66 pipeline below.

Conversation handling (Task 54 §4, superseded by Task 65): the frozen
``app.domain.models.ChatRequest`` still requires ``conversation_id`` and
still carries a ``history`` field, but that field is now vestigial --
the route (``chat_routes.py``) has always constructed it as ``[]`` (no
wire support for client-supplied history ever existed) and this service
no longer reads it. As of Task 65, real conversation history is loaded
from and persisted to :class:`~app.core.generation.conversation_store.
ConversationStore` (Redis-backed, ADR-005) instead --
``request.history`` is left on the frozen model rather than removed
(narrowing a stable contract is out of scope for a persistence task),
but is intentionally unused here now. ``conversation_id`` is still
accepted and echoed back on ``ChatResponse`` exactly as received, never
generated or substituted.
"""

from __future__ import annotations

import structlog

from app.config.settings import Settings, get_settings
from app.core.generation.citation_engine import CitationEngine
from app.core.generation.conversation_store import ConversationStore
from app.core.generation.prompt_builder import PromptBuilder
from app.core.retrieval.context_builder import ContextBuilder
from app.core.retrieval.lexical_retriever import LexicalRetriever
from app.core.retrieval.query_rewriter import QueryRewriter
from app.core.retrieval.rag_optimizer import RAGOptimizer
from app.core.retrieval.repository_structure import RepositoryStructureService, StructureMatch
from app.core.retrieval.retriever import VectorRetriever
from app.core.retrieval.structure_intent import (
    StructureIntent,
    StructureIntentKind,
    detect_structure_intent,
)
from app.domain.exceptions import DomainValidationError, VectorDBError
from app.domain.models import ChatMessage, ChatRequest, ChatResponse, Citation, SearchResultItem
from app.infra.llm.gemini_client import NemotronGateway

logger = structlog.get_logger("seis.services.repository_chat")

# RAGOptimizer's own module docstring describes a "top-20 in, top-5
# out" responsibility split (Task 24): the retriever pulls a wide
# candidate pool, reranking narrows it. RAGOptimizer.rerank_chunks'
# own default top_k (5) already supplies the "out" half, so only the
# "in" half needs a constant here.
_RETRIEVAL_CANDIDATE_POOL = 20

# Task 63: bounded pool for the second, lexical retrieval signal (exact
# filename/identifier lookup -- see app.core.retrieval.lexical_retriever).
# No NVIDIA API call is involved, so this adds no external request --
# only, at most, a few extra passages in the one existing rerank call.
_LEXICAL_CANDIDATE_POOL = 10

# Ceiling on the merged candidate set handed to the reranker. Comfortably
# above _RETRIEVAL_CANDIDATE_POOL (20) so every semantic candidate is
# always kept -- lexical retrieval can only add recall, never displace an
# already-found semantic match (see `_merge_candidates`).
_MERGED_CANDIDATE_POOL = 30

# Grounded chat should read as a careful assistant, not a creative
# one -- low but nonzero temperature, consistent with the existing
# PromptBuilder system prompt's "answer strictly from context" rule.
_CHAT_TEMPERATURE = 0.2


class RepositoryChatService:
    """Orchestrates grounded retrieval-augmented chat generation."""

    def __init__(
        self,
        retriever: VectorRetriever,
        lexical_retriever: LexicalRetriever,
        rag_optimizer: RAGOptimizer,
        context_builder: ContextBuilder,
        prompt_builder: PromptBuilder,
        llm_gateway: NemotronGateway,
        citation_engine: CitationEngine,
        conversation_store: ConversationStore,
        query_rewriter: QueryRewriter,
        structure_service: RepositoryStructureService,
        settings: Settings | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self._retriever = retriever
        self._lexical_retriever = lexical_retriever
        self._rag_optimizer = rag_optimizer
        self._context_builder = context_builder
        self._prompt_builder = prompt_builder
        self._llm = llm_gateway
        self._citation_engine = citation_engine
        self._conversation_store = conversation_store
        self._query_rewriter = query_rewriter
        self._structure_service = structure_service
        self._log = logger.bind(component="repository_chat_service")

    async def chat(self, request: ChatRequest) -> ChatResponse:
        """Answers ``request.message`` grounded in
        ``request.repository_id``'s indexed repository content, citing
        the retrieved sources actually used.

        An empty/low-signal retrieval result is not special-cased here:
        it flows through to an near-empty context block, and the
        existing ``PromptBuilder`` system prompt's own instruction --
        respond with its ``NO_ANSWER_PHRASE`` when the context is
        insufficient -- is what produces the correct "I don't know"
        answer, exactly as it would for any other under-grounded query.

        Raises:
            DomainValidationError: ``repository_id``, ``conversation_id``,
                or ``message`` is blank/whitespace-only.
            EmbeddingError / VectorDBError: retrieval failed.
            RerankError: reranking failed.
            LLMError: generation failed.
        """
        self._validate(request)

        history = await self._conversation_store.load_history(
            request.repository_id, request.conversation_id
        )

        structure_intent = detect_structure_intent(request.message)
        if structure_intent is not None:
            return await self._answer_structure_query(request, history, structure_intent)

        retrieval_query = self._query_rewriter.rewrite(request.message, history)
        self._log.info(
            "repository_chat.retrieval_query_built",
            repository_id=request.repository_id,
            conversation_id=request.conversation_id,
            query_rewritten=retrieval_query.rewritten,
            retrieval_query_original=request.message,
            retrieval_query_rewritten=retrieval_query.text if retrieval_query.rewritten else None,
        )

        semantic_candidates = await self._retriever.retrieve(
            retrieval_query.text,
            request.repository_id,
            top_k=_RETRIEVAL_CANDIDATE_POOL,
            score_threshold=self.settings.retriever_similarity_threshold,
        )
        try:
            lexical_candidates = await self._lexical_retriever.retrieve(
                retrieval_query.text, request.repository_id, top_k=_LEXICAL_CANDIDATE_POOL
            )
        except VectorDBError as exc:
            # Lexical retrieval is a recall enhancement on top of the
            # already-verified semantic path (Tasks 51-62), not a
            # correctness requirement -- a failure here must never make
            # chat *less* reliable than it was before Task 63. Semantic
            # retrieval already succeeded by this point (it's awaited
            # first), so degrading to semantic-only here is a strict
            # regression-safe fallback, not silent data loss.
            self._log.warning(
                "repository_chat.lexical_retrieval_failed",
                repository_id=request.repository_id,
                error=str(exc),
            )
            lexical_candidates = []
        candidates = _merge_candidates(
            semantic_candidates, lexical_candidates, max_total=_MERGED_CANDIDATE_POOL
        )
        reranked = await self._rag_optimizer.rerank_chunks(retrieval_query.text, candidates)

        context_block = await self._context_builder.build_context(reranked)
        prompt = self._prompt_builder.build_chat_prompt(
            context_block.text, history, request.message
        )
        answer = await self._llm.generate_text(
            prompt.user_prompt, prompt.system_instruction, temperature=_CHAT_TEMPERATURE
        )
        cleaned_answer, citations = self._citation_engine.extract_citations(
            answer, context_block.citation_map
        )

        # Persisted only now -- after generation *and* citation extraction
        # have both succeeded (Task 65 §Step 5/9). If either raised above,
        # this line is never reached, so a failed LLM call can never
        # persist a fabricated/partial assistant response. A storage
        # failure here is handled entirely inside ConversationStore
        # (logged and swallowed) -- it never turns a correct answer that
        # already reached this point into a failed request.
        await self._conversation_store.append_turn(
            request.repository_id, request.conversation_id, request.message, cleaned_answer
        )

        self._log.info(
            "repository_chat.completed",
            repository_id=request.repository_id,
            conversation_id=request.conversation_id,
            history_turns=len(history),
            semantic_candidate_count=len(semantic_candidates),
            lexical_candidate_count=len(lexical_candidates),
            candidate_count=len(candidates),
            reranked_count=len(reranked),
            citation_count=len(citations),
        )
        return ChatResponse(
            conversation_id=request.conversation_id,
            answer=cleaned_answer,
            citations=citations,
        )

    async def _answer_structure_query(
        self,
        request: ChatRequest,
        history: list[ChatMessage],
        intent: StructureIntent,
    ) -> ChatResponse:
        """Answers a detected deterministic structure question (Task 67).

        Skips ``VectorRetriever``/``LexicalRetriever``/``RAGOptimizer``
        entirely (no embedding call, no reranking call) -- resolves the
        answer from real, already-indexed ChromaDB metadata instead, then
        reuses the exact same ``ContextBuilder``/``PromptBuilder``/
        ``NemotronGateway``/``CitationEngine`` tail the RAG path below
        uses, so citation behavior is identical: every citation still
        comes from ``context_block.citation_map``, built from real
        chunks, never fabricated.

        A not-found result skips the LLM call too -- there is nothing a
        generation call could add to "this file/directory/symbol is not
        in the indexed repository" that isn't already a complete,
        correct, zero-fabrication-risk answer on its own.
        """
        result = await self._structure_service.resolve(request.repository_id, intent)

        if not result.found:
            cleaned_answer = _structure_not_found_message(intent.kind)
            citations: list[Citation] = []
        else:
            candidate_chunks = [_to_search_result_item(match) for match in result.matches]
            context_block = await self._context_builder.build_context(candidate_chunks)
            prompt = self._prompt_builder.build_chat_prompt(
                context_block.text, history, request.message
            )
            answer = await self._llm.generate_text(
                prompt.user_prompt, prompt.system_instruction, temperature=_CHAT_TEMPERATURE
            )
            cleaned_answer, citations = self._citation_engine.extract_citations(
                answer, context_block.citation_map
            )

        # Same "persist only after a successful/complete answer" rule as
        # the RAG path (Task 65 §Step 5/9) -- both branches above always
        # reach here with a final, real answer (never partial).
        await self._conversation_store.append_turn(
            request.repository_id, request.conversation_id, request.message, cleaned_answer
        )

        self._log.info(
            "repository_chat.structure_query_completed",
            repository_id=request.repository_id,
            conversation_id=request.conversation_id,
            history_turns=len(history),
            intent_kind=intent.kind.value,
            found=result.found,
            match_count=len(result.matches),
            citation_count=len(citations),
        )
        return ChatResponse(
            conversation_id=request.conversation_id,
            answer=cleaned_answer,
            citations=citations,
        )

    def _validate(self, request: ChatRequest) -> None:
        if not request.repository_id.strip():
            raise DomainValidationError(
                "repository_id must not be blank.",
                details={"repository_id": request.repository_id},
            )
        if not request.conversation_id.strip():
            raise DomainValidationError("conversation_id must not be blank.", details={})
        if not request.message.strip():
            raise DomainValidationError("message must not be blank.", details={})


def _merge_candidates(
    semantic: list[SearchResultItem],
    lexical: list[SearchResultItem],
    max_total: int,
) -> list[SearchResultItem]:
    """Merges the semantic and lexical candidate pools before reranking,
    deduplicated by stable chunk identity (``chunk_id``) -- Task 63.

    Every semantic candidate is kept (assumes ``max_total >=`` the
    semantic pool size, true by construction here): lexical retrieval is
    a pure recall addition and must never displace a chunk the
    already-verified semantic path (Tasks 51-62) already found.
    Lexical-only chunks are appended after, in the lexical retriever's
    own best-match-first order, until ``max_total`` is reached. The
    existing Nemotron reranker decides final relevance/order; this only
    decides which chunks are eligible to reach it.
    """
    seen: set[str] = set()
    merged: list[SearchResultItem] = []

    for item in semantic:
        if item.chunk_id not in seen:
            seen.add(item.chunk_id)
            merged.append(item)

    for item in lexical:
        if len(merged) >= max_total:
            break
        if item.chunk_id not in seen:
            seen.add(item.chunk_id)
            merged.append(item)

    return merged


def _to_search_result_item(match: StructureMatch) -> SearchResultItem:
    """Wraps a real :class:`StructureMatch` as a :class:`SearchResultItem`
    so it can flow through the existing, unmodified ``ContextBuilder`` /
    ``CitationEngine`` pipeline (Task 67). ``chunk_id``/``metadata``
    (hence every citation's ``file_path``/``start_line``/``end_line``)
    are the real chunk's own -- only ``content`` is replaced with a short
    synthetic description (path + language, not the file's actual code)
    so a directory listing stays compact and on-topic instead of dumping
    unrelated file contents the user never asked to see; ``score=1.0``
    is a fixed placeholder ContextBuilder never filters on (packing order
    is already exactly ``result.matches``' own, deterministic order).
    """
    description = (
        f"Directory: {match.file_path}"
        if match.is_directory
        else f"File: {match.file_path} (language: {match.language})"
    )
    return SearchResultItem(
        chunk_id=match.chunk.chunk_id,
        content=description,
        score=1.0,
        metadata=match.chunk.metadata,
    )


def _structure_not_found_message(kind: StructureIntentKind) -> str:
    if kind in (StructureIntentKind.FILE_EXISTS, StructureIntentKind.FILE_LOCATION):
        return "I could not find that file in the indexed repository."
    if kind == StructureIntentKind.DIRECTORY_EXISTS:
        return "I could not find that directory in the indexed repository."
    if kind == StructureIntentKind.SYMBOL_IN_FILE:
        return "I could not find that symbol in the indexed repository."
    return "I could not find that in the indexed repository."
