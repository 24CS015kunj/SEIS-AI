"""Unit tests for app/core/retrieval/lexical_retriever.py (Task 63).

Exercises term extraction and chunk matching against a stub standing in
for ChromaClient (same test-double pattern as test_retriever.py's
_StubChromaClient) -- no real ChromaDB call is made.
"""

from __future__ import annotations

from app.core.retrieval.lexical_retriever import LexicalRetriever, extract_lexical_terms
from app.domain.enums import ChunkType, DocumentType
from app.domain.models import Chunk, ChunkMetadata


def _chunk(
    chunk_id: str,
    file_path: str,
    content: str = "some content",
    symbol_name: str | None = None,
    repository_id: str = "repo-1",
) -> Chunk:
    return Chunk(
        chunk_id=chunk_id,
        content=content,
        metadata=ChunkMetadata(
            repository_id=repository_id,
            file_path=file_path,
            language="python",
            commit_sha="sha-1",
            chunk_type=ChunkType.CODE_FUNCTION,
            document_type=DocumentType.SOURCE_CODE,
            symbol_name=symbol_name,
            start_line=1,
            end_line=10,
        ),
    )


class _StubChromaClient:
    def __init__(self, chunks_by_repo: dict[str, list[Chunk]] | None = None) -> None:
        self._chunks_by_repo = chunks_by_repo or {}
        self.calls: list[dict[str, object]] = []

    async def get_all_chunks(self, repository_id: str, limit: int = 2000) -> list[Chunk]:
        self.calls.append({"repository_id": repository_id, "limit": limit})
        return self._chunks_by_repo.get(repository_id, [])


# ---------------------------------------------------------------------------
# extract_lexical_terms
# ---------------------------------------------------------------------------
def test_extracts_exact_filename_tokens() -> None:
    assert "maze.py" in extract_lexical_terms("What does maze.py do?")


def test_extracts_function_call_identifier_without_parens() -> None:
    assert "solveMaze" in extract_lexical_terms("What does solveMaze() do?")


def test_extracts_snake_case_identifier() -> None:
    assert "bfs_solve" in extract_lexical_terms("Where is bfs_solve implemented?")


def test_extracts_bare_directory_word() -> None:
    assert "backend" in extract_lexical_terms("What files are in the backend directory?")


def test_stopwords_and_question_scaffolding_are_not_extracted() -> None:
    terms = extract_lexical_terms("What is this repository about?")
    assert "what" not in [t.lower() for t in terms]
    assert "repository" not in [t.lower() for t in terms]
    assert "about" not in [t.lower() for t in terms]


def test_purely_descriptive_question_yields_no_terms() -> None:
    assert extract_lexical_terms("What is this repository about?") == []


def test_duplicate_terms_are_deduplicated_preserving_order() -> None:
    terms = extract_lexical_terms("does maze.py import maze.py again")
    assert terms.count("maze.py") == 1


# ---------------------------------------------------------------------------
# LexicalRetriever.retrieve
# ---------------------------------------------------------------------------
async def test_exact_filename_match_is_returned() -> None:
    chunk = _chunk("c1", "backend/maze.py")
    chroma = _StubChromaClient({"repo-1": [chunk, _chunk("c2", "readme.md")]})
    retriever = LexicalRetriever(chroma_client=chroma)  # type: ignore[arg-type]

    results = await retriever.retrieve("What does maze.py do?", "repo-1")

    assert [r.chunk_id for r in results] == ["c1"]


async def test_exact_symbol_match_is_returned() -> None:
    chunk = _chunk("c1", "backend/solver.py", symbol_name="bfs_solve")
    chroma = _StubChromaClient({"repo-1": [chunk, _chunk("c2", "readme.md")]})
    retriever = LexicalRetriever(chroma_client=chroma)  # type: ignore[arg-type]

    results = await retriever.retrieve("Where is bfs_solve implemented?", "repo-1")

    assert [r.chunk_id for r in results] == ["c1"]


async def test_path_segment_match_returns_every_chunk_under_that_directory() -> None:
    chunks = [
        _chunk("c1", "backend/app.py"),
        _chunk("c2", "backend/maze.py"),
        _chunk("c3", "frontend/app.js"),
    ]
    chroma = _StubChromaClient({"repo-1": chunks})
    retriever = LexicalRetriever(chroma_client=chroma)  # type: ignore[arg-type]

    results = await retriever.retrieve("What files are in the backend directory?", "repo-1")

    assert {r.chunk_id for r in results} == {"c1", "c2"}


async def test_content_substring_match_is_a_lower_tier_than_symbol_match() -> None:
    symbol_match = _chunk("c1", "backend/solver.py", symbol_name="bfs_solve")
    content_match = _chunk("c2", "backend/other.py", content="calls bfs_solve internally")
    chroma = _StubChromaClient({"repo-1": [content_match, symbol_match]})
    retriever = LexicalRetriever(chroma_client=chroma)  # type: ignore[arg-type]

    results = await retriever.retrieve("bfs_solve", "repo-1")

    assert [r.chunk_id for r in results] == ["c1", "c2"]
    assert results[0].score > results[1].score


async def test_no_lexical_match_returns_empty_list() -> None:
    chroma = _StubChromaClient({"repo-1": [_chunk("c1", "readme.md")]})
    retriever = LexicalRetriever(chroma_client=chroma)  # type: ignore[arg-type]

    results = await retriever.retrieve("Where is nonexistentFunctionXyz implemented?", "repo-1")

    assert results == []


async def test_no_semantic_shaped_query_short_circuits_without_calling_chromadb() -> None:
    chroma = _StubChromaClient({"repo-1": [_chunk("c1", "readme.md")]})
    retriever = LexicalRetriever(chroma_client=chroma)  # type: ignore[arg-type]

    results = await retriever.retrieve("What is this repository about?", "repo-1")

    assert results == []
    assert chroma.calls == []


async def test_empty_repository_returns_empty_list() -> None:
    chroma = _StubChromaClient({"repo-1": []})
    retriever = LexicalRetriever(chroma_client=chroma)  # type: ignore[arg-type]

    results = await retriever.retrieve("What does maze.py do?", "repo-1")

    assert results == []


async def test_repository_isolation_never_returns_another_repositorys_chunks() -> None:
    chroma = _StubChromaClient(
        {
            "repo-a": [_chunk("a1", "backend/maze.py", repository_id="repo-a")],
            "repo-b": [_chunk("b1", "backend/maze.py", repository_id="repo-b")],
        }
    )
    retriever = LexicalRetriever(chroma_client=chroma)  # type: ignore[arg-type]

    results_a = await retriever.retrieve("What does maze.py do?", "repo-a")

    assert [r.chunk_id for r in results_a] == ["a1"]
    assert chroma.calls == [{"repository_id": "repo-a", "limit": 2000}]


async def test_top_k_bounds_the_returned_result_count() -> None:
    chunks = [_chunk(f"c{i}", f"backend/mod{i}.py", content="bfs_solve here") for i in range(5)]
    chroma = _StubChromaClient({"repo-1": chunks})
    retriever = LexicalRetriever(chroma_client=chroma)  # type: ignore[arg-type]

    results = await retriever.retrieve("bfs_solve", "repo-1", top_k=2)

    assert len(results) == 2


async def test_matched_chunks_carry_real_content_and_metadata_not_fabricated() -> None:
    chunk = _chunk("c1", "backend/maze.py", content="def solve(): ...")
    chroma = _StubChromaClient({"repo-1": [chunk]})
    retriever = LexicalRetriever(chroma_client=chroma)  # type: ignore[arg-type]

    results = await retriever.retrieve("What does maze.py do?", "repo-1")

    assert results[0].content == "def solve(): ..."
    assert results[0].metadata.file_path == "backend/maze.py"
