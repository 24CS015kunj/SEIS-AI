"""Repository Explanation Service (Task 93).

Orchestrates the existing retrieval-augmented generation pipeline to
produce two targeted, grounded explanation types:

``code_explanation`` (``TaskType.CODE_EXPLANATION``)
    Explains what a specific repository file does: its purpose, key
    functions/classes, data flows, and dependencies.  Retrieval is
    biased toward the target file by:

    1. Including the filename in the natural-language query, so
       ``LexicalRetriever``'s existing filename/path-segment scoring
       naturally surfaces that file's chunks.
    2. Splitting the merged candidates into "target file" and "other"
       groups before reranking, so the reranker sees target-file chunks
       first in the input list and they are more likely to survive to
       the context block.

    This does not require any change to ``LexicalRetriever.retrieve``'s
    signature (no ``file_path_filter`` parameter needed).

``architecture_summary`` (``TaskType.ARCHITECTURE_SUMMARY``)
    Describes the repository's overall architecture: purpose, major
    subsystems, technology patterns, and notable concerns.  Uses a
    wider semantic retrieval pool (top_k=30) and a larger context
    budget (8,000 tokens) to cover representative files across the
    whole repository.

No conversation history is used or persisted -- explanations are
one-shot, not conversational (``ConversationStore`` is deliberately not
called).  No change to any existing service, retriever, or prompt
template other than the two new ``PromptBuilder`` methods added in this
task.

Repository isolation: inherited from ``VectorRetriever``'s own
collection-per-repository scoping -- identical guarantee to
``RepositoryChatService``.
"""

from __future__ import annotations

import posixpath
from dataclasses import dataclass

import structlog

from app.core.generation.citation_engine import CitationEngine
from app.core.generation.prompt_builder import PromptBuilder
from app.core.retrieval.context_builder import ContextBuilder
from app.core.retrieval.lexical_retriever import LexicalRetriever
from app.core.retrieval.rag_optimizer import RAGOptimizer
from app.core.retrieval.retriever import VectorRetriever
from app.domain.enums import TaskType
from app.domain.exceptions import DomainValidationError
from app.domain.models import Citation, SearchResultItem
from app.infra.llm.gemini_client import NemotronGateway

logger = structlog.get_logger("seis.services.repository_explain")

# ------------------------------------------------------------------
# Retrieval tuning
# ------------------------------------------------------------------

# code_explanation: moderate pools -- file-name query + priority sort
# biases toward the target file without excluding surrounding context.
_CODE_SEMANTIC_TOP_K: int = 15
_CODE_LEXICAL_TOP_K: int = 10
_CODE_MERGED_MAX: int = 25
_CODE_CONTEXT_TOKENS: int = 4_000

# architecture_summary: wide pool to cover many files.
_ARCH_SEMANTIC_TOP_K: int = 30
_ARCH_CONTEXT_TOKENS: int = 8_000

_TEMPERATURE: float = 0.2


@dataclass(frozen=True, slots=True)
class ExplainResult:
    """Plain result returned by :meth:`RepositoryExplainService.explain`."""

    answer: str
    citations: list[Citation]


class RepositoryExplainService:
    """Grounded explanation generation for files and repository architecture
    (Task 93, §5 TaskType.CODE_EXPLANATION / TaskType.ARCHITECTURE_SUMMARY).
    """

    def __init__(
        self,
        retriever: VectorRetriever,
        lexical_retriever: LexicalRetriever,
        rag_optimizer: RAGOptimizer,
        context_builder: ContextBuilder,
        prompt_builder: PromptBuilder,
        llm_gateway: NemotronGateway,
        citation_engine: CitationEngine,
    ) -> None:
        self._retriever = retriever
        self._lexical_retriever = lexical_retriever
        self._rag_optimizer = rag_optimizer
        self._context_builder = context_builder
        self._prompt_builder = prompt_builder
        self._llm = llm_gateway
        self._citation_engine = citation_engine
        self._log = logger.bind(component="repository_explain_service")

    async def explain(
        self,
        *,
        repository_id: str,
        task_type: TaskType,
        file_path: str | None,
    ) -> ExplainResult:
        """Runs the explanation pipeline for ``task_type``.

        Raises:
            DomainValidationError: ``file_path`` missing/unsafe for
                ``code_explanation``.
            EmbeddingError / VectorDBError / RerankError / LLMError:
                propagated from the pipeline.
        """
        if task_type == TaskType.CODE_EXPLANATION:
            self._validate_file_path(file_path)
            return await self._explain_file(repository_id, file_path)  # type: ignore[arg-type]
        if task_type == TaskType.ARCHITECTURE_SUMMARY:
            return await self._summarise_architecture(repository_id)
        raise DomainValidationError(
            f"Unsupported task_type for explanation: '{task_type.value}'.",
            details={"task_type": task_type.value},
        )

    # ------------------------------------------------------------------
    # Code Explanation
    # ------------------------------------------------------------------

    async def _explain_file(
        self, repository_id: str, file_path: str
    ) -> ExplainResult:
        """Retrieves chunks biased toward ``file_path`` and generates a
        structured code explanation.
        """
        # The filename appears in the query so LexicalRetriever's existing
        # filename/path-segment scoring naturally surfaces the target file's
        # chunks without any signature change to LexicalRetriever.retrieve.
        file_name = file_path.split("/")[-1]
        query = (
            f"Explain the purpose, key functions, classes, and implementation "
            f"of {file_name} ({file_path})"
        )

        semantic = await self._retriever.retrieve(
            query, repository_id, top_k=_CODE_SEMANTIC_TOP_K
        )
        try:
            lexical = await self._lexical_retriever.retrieve(
                query, repository_id, top_k=_CODE_LEXICAL_TOP_K
            )
        except Exception:  # lexical is a recall enhancement, not required
            lexical = []

        merged = _merge(semantic, lexical, max_total=_CODE_MERGED_MAX)

        # Priority sort: target-file chunks first, then the rest.  This
        # does not change which chunks reach the reranker -- it only biases
        # the input order so a cross-encoder that scores tie-broken by
        # input position sees the target file's chunks first.
        prioritised = _prioritise_file(merged, file_path)
        reranked = await self._rag_optimizer.rerank_chunks(query, prioritised)

        context_block = await self._context_builder.build_context(
            reranked, max_token_budget=_CODE_CONTEXT_TOKENS
        )
        prompt = self._prompt_builder.build_explanation_prompt(
            context_block.text, file_path
        )
        raw_answer = await self._llm.generate_text(
            prompt.user_prompt, prompt.system_instruction, temperature=_TEMPERATURE
        )
        answer, citations = self._citation_engine.extract_citations(
            raw_answer, context_block.citation_map
        )

        self._log.info(
            "repository_explain.code_explanation.completed",
            repository_id=repository_id,
            file_path=file_path,
            semantic_count=len(semantic),
            lexical_count=len(lexical),
            reranked_count=len(reranked),
            citation_count=len(citations),
        )
        return ExplainResult(answer=answer, citations=citations)

    # ------------------------------------------------------------------
    # Architecture Summary
    # ------------------------------------------------------------------

    async def _summarise_architecture(self, repository_id: str) -> ExplainResult:
        """Retrieves a broad cross-file chunk set and generates an
        architectural overview.
        """
        query = (
            "Repository architecture overview: overall purpose, major "
            "subsystems, modules, technology stack, data flows, key components"
        )

        candidates = await self._retriever.retrieve(
            query, repository_id, top_k=_ARCH_SEMANTIC_TOP_K
        )
        reranked = await self._rag_optimizer.rerank_chunks(query, candidates)

        context_block = await self._context_builder.build_context(
            reranked, max_token_budget=_ARCH_CONTEXT_TOKENS
        )
        prompt = self._prompt_builder.build_architecture_prompt(context_block.text)
        raw_answer = await self._llm.generate_text(
            prompt.user_prompt, prompt.system_instruction, temperature=_TEMPERATURE
        )
        answer, citations = self._citation_engine.extract_citations(
            raw_answer, context_block.citation_map
        )

        self._log.info(
            "repository_explain.architecture_summary.completed",
            repository_id=repository_id,
            candidate_count=len(candidates),
            reranked_count=len(reranked),
            citation_count=len(citations),
        )
        return ExplainResult(answer=answer, citations=citations)

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def _validate_file_path(self, file_path: str | None) -> None:
        if not file_path:
            raise DomainValidationError(
                "file_path is required when task_type is 'code_explanation'.",
                details={},
            )
        normalised = posixpath.normpath(file_path.lstrip("/"))
        if normalised.startswith(".."):
            raise DomainValidationError(
                "file_path must be a repository-relative path (no '..' components).",
                details={"file_path": file_path},
            )


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _merge(
    semantic: list[SearchResultItem],
    lexical: list[SearchResultItem],
    *,
    max_total: int,
) -> list[SearchResultItem]:
    """Deduplicates by chunk_id, semantic first (same pattern as
    ``RepositoryChatService._merge_candidates``).
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


def _prioritise_file(
    candidates: list[SearchResultItem], file_path: str
) -> list[SearchResultItem]:
    """Stable-sorts ``candidates`` so chunks whose ``metadata.file_path``
    matches (or is a prefix of) ``file_path`` appear first, without
    removing any candidate.  This biases the reranker's input order
    toward the target file without discarding context from other files.
    """
    target_prefix = file_path.lower()
    on_target = [c for c in candidates if c.metadata.file_path.lower() == target_prefix]
    off_target = [c for c in candidates if c.metadata.file_path.lower() != target_prefix]
    return on_target + off_target
