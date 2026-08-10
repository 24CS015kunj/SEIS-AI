"""Unit tests for app/core/retrieval/retriever.py (Task 19).

Uses real `ChromaClient`/`NemotronEmbedder` instances with their public
methods monkeypatched (same pattern as tests/unit/test_synchronizer.py)
-- exercises `VectorRetriever`'s own embed-then-search-then-filter
logic without needing a live ChromaDB server or NVIDIA API key.
"""

from __future__ import annotations

import pytest

from app.config.settings import Settings
from app.core.embedding.embedder import NemotronEmbedder
from app.core.retrieval.retriever import VectorRetriever
from app.domain.enums import ChunkType, DocumentType
from app.domain.models import ChunkMetadata, SearchResultItem
from app.infra.vectorstore.chroma_client import ChromaClient


def _result(chunk_id: str, score: float, file_path: str = "src/app.py") -> SearchResultItem:
    return SearchResultItem(
        chunk_id=chunk_id,
        content=f"content for {chunk_id}",
        score=score,
        metadata=ChunkMetadata(
            repository_id="repo-1",
            file_path=file_path,
            language="python",
            commit_sha="sha-1",
            chunk_type=ChunkType.CODE_FUNCTION,
            document_type=DocumentType.SOURCE_CODE,
            start_line=1,
            end_line=2,
        ),
    )


class Harness:
    def __init__(self) -> None:
        self.query_calls: list[dict[str, object]] = []
        self.embed_query_calls: list[str] = []
        self.next_results: list[SearchResultItem] = []

        self.chroma = ChromaClient(settings=Settings())
        self.embedder = NemotronEmbedder(settings=Settings())

    def wire(self, monkeypatch: pytest.MonkeyPatch) -> VectorRetriever:
        async def _query_similarity(
            repository_id: str,
            query_vector: list[float],
            top_k: int,
            metadata_filter: dict[str, str] | None = None,
        ) -> list[SearchResultItem]:
            self.query_calls.append(
                {
                    "repository_id": repository_id,
                    "query_vector": query_vector,
                    "top_k": top_k,
                    "metadata_filter": metadata_filter,
                }
            )
            return self.next_results

        async def _embed_query(query: str) -> list[float]:
            self.embed_query_calls.append(query)
            return [0.1, 0.2, 0.3]

        monkeypatch.setattr(self.chroma, "query_similarity", _query_similarity)
        monkeypatch.setattr(self.embedder, "embed_query", _embed_query)

        return VectorRetriever(chroma_client=self.chroma, embedder=self.embedder)


@pytest.fixture
def harness() -> Harness:
    return Harness()


async def test_retrieve_embeds_the_query_and_searches_the_repository_collection(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    retriever = harness.wire(monkeypatch)
    harness.next_results = [_result("c1", 0.9)]

    results = await retriever.retrieve("how does auth work?", "repo-1", top_k=5)

    assert harness.embed_query_calls == ["how does auth work?"]
    assert harness.query_calls[0]["repository_id"] == "repo-1"
    assert harness.query_calls[0]["query_vector"] == [0.1, 0.2, 0.3]
    assert harness.query_calls[0]["top_k"] == 5
    assert [r.chunk_id for r in results] == ["c1"]


async def test_chunks_below_score_threshold_are_filtered_out(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    retriever = harness.wire(monkeypatch)
    harness.next_results = [_result("high", 0.9), _result("low", 0.4), _result("borderline", 0.7)]

    results = await retriever.retrieve("query", "repo-1", score_threshold=0.7)

    assert {r.chunk_id for r in results} == {"high", "borderline"}


async def test_results_are_sorted_descending_by_score(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    retriever = harness.wire(monkeypatch)
    # Deliberately out of order, as if the SDK/collection didn't sort.
    harness.next_results = [_result("mid", 0.8), _result("top", 0.95), _result("bottom", 0.75)]

    results = await retriever.retrieve("query", "repo-1", score_threshold=0.0)

    assert [r.chunk_id for r in results] == ["top", "mid", "bottom"]


async def test_default_top_k_and_score_threshold_are_used_when_not_specified(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    retriever = harness.wire(monkeypatch)
    harness.next_results = [_result("c1", 0.75)]

    await retriever.retrieve("query", "repo-1")

    assert harness.query_calls[0]["top_k"] == 5


async def test_all_results_below_threshold_returns_empty_list(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    retriever = harness.wire(monkeypatch)
    harness.next_results = [_result("c1", 0.1), _result("c2", 0.2)]

    results = await retriever.retrieve("query", "repo-1", score_threshold=0.7)

    assert results == []


async def test_no_results_from_chromadb_returns_empty_list_without_error(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    retriever = harness.wire(monkeypatch)
    harness.next_results = []

    results = await retriever.retrieve("query", "repo-1")

    assert results == []
