"""Unit tests for app/services/semantic_search_service.py (Task 53).

Exercises SemanticSearchService's own orchestration logic in isolation
via a stub VectorRetriever (same test-double pattern as
test_ingest_routes.py's _StubService) -- no real ChromaDB/NVIDIA call
is made.

No test exercises RAGOptimizer reranking: SemanticSearchService
deliberately does not call it (see the service module's own
docstring for why), so there is nothing to test here.
"""

from __future__ import annotations

import pytest

from app.config.settings import Settings
from app.domain.enums import ChunkType, DocumentType
from app.domain.exceptions import DomainValidationError, VectorDBError
from app.domain.models import ChunkMetadata, SearchResultItem
from app.services.semantic_search_service import SemanticSearchService


def _result(chunk_id: str, score: float = 0.8) -> SearchResultItem:
    return SearchResultItem(
        chunk_id=chunk_id,
        content=f"content for {chunk_id}",
        score=score,
        metadata=ChunkMetadata(
            repository_id="repo-1",
            file_path="src/app.py",
            language="python",
            commit_sha="sha-1",
            chunk_type=ChunkType.CODE_FUNCTION,
            document_type=DocumentType.SOURCE_CODE,
            start_line=1,
            end_line=2,
        ),
    )


class _StubRetriever:
    """Test double standing in for VectorRetriever -- records every
    call and either returns a canned result list or raises a
    pre-configured exception."""

    def __init__(
        self,
        *,
        results: list[SearchResultItem] | None = None,
        error: Exception | None = None,
    ) -> None:
        self._results = results if results is not None else []
        self._error = error
        self.calls: list[dict[str, object]] = []

    async def retrieve(
        self,
        query: str,
        repository_id: str,
        top_k: int = 5,
        score_threshold: float = 0.7,
    ) -> list[SearchResultItem]:
        self.calls.append(
            {
                "query": query,
                "repository_id": repository_id,
                "top_k": top_k,
                "score_threshold": score_threshold,
            }
        )
        if self._error is not None:
            raise self._error
        return self._results


async def test_successful_search_returns_a_search_response() -> None:
    retriever = _StubRetriever(results=[_result("c1", 0.9), _result("c2", 0.8)])
    service = SemanticSearchService(retriever=retriever, settings=Settings())  # type: ignore[arg-type]

    response = await service.search(repository_id="repo-1", query="how does auth work?")

    assert response.repository_id == "repo-1"
    assert response.query == "how does auth work?"
    assert [r.chunk_id for r in response.results] == ["c1", "c2"]


async def test_repository_id_is_propagated_to_the_retriever() -> None:
    retriever = _StubRetriever(results=[])
    service = SemanticSearchService(retriever=retriever, settings=Settings())  # type: ignore[arg-type]

    await service.search(repository_id="repo-42", query="query")

    assert retriever.calls[0]["repository_id"] == "repo-42"


async def test_query_is_propagated_to_the_retriever() -> None:
    retriever = _StubRetriever(results=[])
    service = SemanticSearchService(retriever=retriever, settings=Settings())  # type: ignore[arg-type]

    await service.search(repository_id="repo-1", query="find the maze solver")

    assert retriever.calls[0]["query"] == "find the maze solver"


async def test_top_k_and_score_threshold_come_from_settings() -> None:
    retriever = _StubRetriever(results=[])
    settings = Settings(retriever_default_top_k=3, retriever_similarity_threshold=0.5)
    service = SemanticSearchService(retriever=retriever, settings=settings)  # type: ignore[arg-type]

    await service.search(repository_id="repo-1", query="query")

    assert retriever.calls[0]["top_k"] == 3
    assert retriever.calls[0]["score_threshold"] == 0.5


async def test_empty_results_returns_empty_list_not_an_error() -> None:
    retriever = _StubRetriever(results=[])
    service = SemanticSearchService(retriever=retriever, settings=Settings())  # type: ignore[arg-type]

    response = await service.search(repository_id="repo-1", query="query")

    assert response.results == []


async def test_retriever_failure_propagates() -> None:
    retriever = _StubRetriever(error=VectorDBError("ChromaDB unreachable"))
    service = SemanticSearchService(retriever=retriever, settings=Settings())  # type: ignore[arg-type]

    with pytest.raises(VectorDBError):
        await service.search(repository_id="repo-1", query="query")


async def test_blank_repository_id_raises_domain_validation_error() -> None:
    retriever = _StubRetriever(results=[])
    service = SemanticSearchService(retriever=retriever, settings=Settings())  # type: ignore[arg-type]

    with pytest.raises(DomainValidationError):
        await service.search(repository_id="   ", query="query")

    assert retriever.calls == []


async def test_blank_query_raises_domain_validation_error() -> None:
    retriever = _StubRetriever(results=[])
    service = SemanticSearchService(retriever=retriever, settings=Settings())  # type: ignore[arg-type]

    with pytest.raises(DomainValidationError):
        await service.search(repository_id="repo-1", query="   ")

    assert retriever.calls == []


class _StubLexicalRetriever:
    def __init__(self, results: list[SearchResultItem]) -> None:
        self._results = results

    async def retrieve(self, query: str, repository_id: str, top_k: int = 10) -> list[SearchResultItem]:
        return self._results


async def test_hybrid_search_merges_semantic_and_lexical_results() -> None:
    semantic_retriever = _StubRetriever(results=[_result("c1", 0.9)])
    lexical_retriever = _StubLexicalRetriever(results=[_result("c2", 0.95)])

    service = SemanticSearchService(
        retriever=semantic_retriever,  # type: ignore[arg-type]
        lexical_retriever=lexical_retriever,  # type: ignore[arg-type]
        settings=Settings(),
    )

    response = await service.search(repository_id="repo-1", query="solveMaze()")

    assert len(response.results) == 2
    assert [r.chunk_id for r in response.results] == ["c1", "c2"]

