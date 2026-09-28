"""Unit tests for app/core/retrieval/repository_structure.py (Task 67).

Exercises RepositoryStructureService against a stub standing in for
ChromaClient (same test-double pattern as test_lexical_retriever.py's
_StubChromaClient) -- no real ChromaDB call is made.
"""

from __future__ import annotations

from app.core.retrieval.repository_structure import RepositoryStructureService
from app.core.retrieval.structure_intent import StructureIntent, StructureIntentKind
from app.domain.enums import ChunkType, DocumentType
from app.domain.models import Chunk, ChunkMetadata


def _chunk(
    chunk_id: str,
    file_path: str,
    language: str = "python",
    content: str = "some content",
    symbol_name: str | None = None,
    start_line: int = 1,
    end_line: int = 10,
    repository_id: str = "repo-1",
) -> Chunk:
    return Chunk(
        chunk_id=chunk_id,
        content=content,
        metadata=ChunkMetadata(
            repository_id=repository_id,
            file_path=file_path,
            language=language,
            commit_sha="sha-1",
            chunk_type=ChunkType.CODE_FUNCTION,
            document_type=DocumentType.SOURCE_CODE,
            symbol_name=symbol_name,
            start_line=start_line,
            end_line=end_line,
        ),
    )


class _StubChromaClient:
    def __init__(self, chunks_by_repo: dict[str, list[Chunk]] | None = None) -> None:
        self._chunks_by_repo = chunks_by_repo or {}
        self.calls: list[dict[str, object]] = []

    async def get_all_chunks(self, repository_id: str, limit: int = 2000) -> list[Chunk]:
        self.calls.append({"repository_id": repository_id, "limit": limit})
        return self._chunks_by_repo.get(repository_id, [])


_MAZESOLVER_CHUNKS = [
    _chunk("c1", "backend/app.py", language="python", start_line=1, end_line=14),
    _chunk(
        "c2",
        "backend/maze.py",
        language="python",
        start_line=10,
        end_line=20,
        symbol_name="generate_random_maze",
    ),
    _chunk(
        "c3",
        "backend/maze.py",
        language="python",
        start_line=23,
        end_line=64,
        symbol_name="bfs_solve",
        content="def bfs_solve(): ...",
    ),
    _chunk("c4", "backend/readme.md", language="markdown", start_line=1, end_line=5),
    _chunk("c5", "frontend/app.js", language="javascript", start_line=1, end_line=59),
    _chunk(
        "c6",
        "frontend/app.js",
        language="javascript",
        start_line=256,
        end_line=318,
        symbol_name="solveMaze",
        content="async function solveMaze() { ... }",
    ),
    _chunk("c7", "frontend/index.html", language="html", start_line=1, end_line=44),
    _chunk("c8", "readme.md", language="markdown", start_line=1, end_line=6),
]


def _service(chunks: list[Chunk], repository_id: str = "repo-1") -> RepositoryStructureService:
    chroma = _StubChromaClient({repository_id: chunks})
    return RepositoryStructureService(chroma_client=chroma)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# 1. Directory listing
# ---------------------------------------------------------------------------
async def test_directory_listing_returns_all_distinct_files_under_backend() -> None:
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.LIST_DIRECTORY, path="backend")
    )

    assert result.found is True
    assert {m.file_path for m in result.matches} == {
        "backend/app.py",
        "backend/maze.py",
        "backend/readme.md",
    }


async def test_directory_listing_includes_maze_py_task_63_regression() -> None:
    """Task 63's own documented failure: a semantic+reranker path missed
    backend/maze.py. The deterministic path must never miss it."""
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.LIST_DIRECTORY, path="backend")
    )

    assert "backend/maze.py" in {m.file_path for m in result.matches}


# ---------------------------------------------------------------------------
# 2. Root directory listing
# ---------------------------------------------------------------------------
async def test_root_listing_returns_only_top_level_files() -> None:
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.LIST_DIRECTORY, path=None)
    )

    assert result.found is True
    assert {m.file_path for m in result.matches} == {"readme.md"}


# ---------------------------------------------------------------------------
# 3. Nested directory listing
# ---------------------------------------------------------------------------
async def test_nested_directory_listing() -> None:
    chunks = [
        *_MAZESOLVER_CHUNKS,
        _chunk("c9", "backend/utils/helpers.py", language="python"),
    ]
    service = _service(chunks)
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.LIST_DIRECTORY, path="backend/utils")
    )

    assert result.found is True
    assert [m.file_path for m in result.matches] == ["backend/utils/helpers.py"]


# ---------------------------------------------------------------------------
# 4. File existence
# ---------------------------------------------------------------------------
async def test_file_exists_by_full_path() -> None:
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.FILE_EXISTS, path="backend/maze.py")
    )

    assert result.found is True
    assert result.matches[0].file_path == "backend/maze.py"


async def test_file_exists_by_bare_filename() -> None:
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.FILE_EXISTS, path="maze.py")
    )

    assert result.found is True
    assert result.matches[0].file_path == "backend/maze.py"


# ---------------------------------------------------------------------------
# 5. File location
# ---------------------------------------------------------------------------
async def test_file_location_returns_the_real_path() -> None:
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.FILE_LOCATION, path="app.py")
    )

    assert result.found is True
    assert result.matches[0].file_path == "backend/app.py"


async def test_file_location_with_ambiguous_basename_returns_every_real_match() -> None:
    chunks = [
        *_MAZESOLVER_CHUNKS,
        _chunk("c9", "frontend/utils/helpers.py", language="python"),
        _chunk("c10", "backend/helpers.py", language="python"),
    ]
    service = _service(chunks)
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.FILE_LOCATION, path="helpers.py")
    )

    assert result.found is True
    assert {m.file_path for m in result.matches} == {
        "frontend/utils/helpers.py",
        "backend/helpers.py",
    }


# ---------------------------------------------------------------------------
# 6. Directory existence
# ---------------------------------------------------------------------------
async def test_directory_exists_true() -> None:
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.DIRECTORY_EXISTS, path="backend")
    )

    assert result.found is True


async def test_directory_exists_false_for_nonexistent_directory() -> None:
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.DIRECTORY_EXISTS, path="nonexistent")
    )

    assert result.found is False
    assert result.matches == []


# ---------------------------------------------------------------------------
# 7. Extension/language-filtered listing
# ---------------------------------------------------------------------------
async def test_filtered_listing_only_returns_matching_language() -> None:
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1",
        StructureIntent(kind=StructureIntentKind.LIST_DIRECTORY, path="backend", language="python"),
    )

    assert result.found is True
    assert {m.file_path for m in result.matches} == {"backend/app.py", "backend/maze.py"}


# ---------------------------------------------------------------------------
# 8. Nonexistent file
# ---------------------------------------------------------------------------
async def test_nonexistent_file_is_not_found() -> None:
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.FILE_EXISTS, path="nonexistent.py")
    )

    assert result.found is False
    assert result.matches == []


# ---------------------------------------------------------------------------
# 9. Nonexistent directory
# ---------------------------------------------------------------------------
async def test_nonexistent_directory_listing_is_empty() -> None:
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.LIST_DIRECTORY, path="nonexistent")
    )

    assert result.found is False
    assert result.matches == []


# ---------------------------------------------------------------------------
# 12. Repository isolation
# ---------------------------------------------------------------------------
async def test_repository_isolation_never_returns_another_repositorys_files() -> None:
    chroma = _StubChromaClient(
        {
            "repo-a": [_chunk("a1", "backend/maze.py", repository_id="repo-a")],
            "repo-b": [_chunk("b1", "backend/other.py", repository_id="repo-b")],
        }
    )
    service = RepositoryStructureService(chroma_client=chroma)  # type: ignore[arg-type]

    result_a = await service.resolve(
        "repo-a", StructureIntent(kind=StructureIntentKind.LIST_DIRECTORY, path="backend")
    )

    assert [m.file_path for m in result_a.matches] == ["backend/maze.py"]
    assert chroma.calls == [{"repository_id": "repo-a", "limit": 2000}]


# ---------------------------------------------------------------------------
# 13. Empty repository
# ---------------------------------------------------------------------------
async def test_empty_repository_returns_not_found_for_any_intent() -> None:
    service = _service([])
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.LIST_DIRECTORY, path=None)
    )

    assert result.found is False
    assert result.matches == []


# ---------------------------------------------------------------------------
# 14. Duplicate file metadata handling
# ---------------------------------------------------------------------------
async def test_a_file_with_multiple_chunks_appears_exactly_once_in_a_listing() -> None:
    """backend/maze.py has 2 chunks (c2, c3) in the fixture -- a listing
    must dedupe to exactly one entry."""
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.LIST_DIRECTORY, path="backend")
    )

    maze_entries = [m for m in result.matches if m.file_path == "backend/maze.py"]
    assert len(maze_entries) == 1


async def test_duplicate_dedup_keeps_the_earliest_chunk_deterministically() -> None:
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.FILE_EXISTS, path="backend/maze.py")
    )

    assert result.matches[0].chunk.chunk_id == "c2"  # start_line=10, earlier than c3's 23


# ---------------------------------------------------------------------------
# 15-17. Path normalization already covered by structure_intent.py's own
# tests (trailing slash / backslash / whitespace) -- these confirm the
# service correctly resolves the ALREADY-NORMALIZED path it receives.
# ---------------------------------------------------------------------------
async def test_service_resolves_a_path_without_trailing_slash() -> None:
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.LIST_DIRECTORY, path="backend")
    )
    assert result.found is True


# ---------------------------------------------------------------------------
# 18. Case behavior
# ---------------------------------------------------------------------------
async def test_lookup_is_case_insensitive_but_returns_real_casing() -> None:
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.FILE_EXISTS, path="BACKEND/MAZE.PY")
    )

    assert result.found is True
    # The real, actually-indexed casing is returned -- never the query's own casing.
    assert result.matches[0].file_path == "backend/maze.py"


# ---------------------------------------------------------------------------
# 20. Deterministic result never fabricates content
# ---------------------------------------------------------------------------
async def test_every_match_wraps_a_real_chunk_from_the_fixture() -> None:
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.LIST_DIRECTORY, path="backend")
    )

    real_ids = {c.chunk_id for c in _MAZESOLVER_CHUNKS}
    assert all(m.chunk.chunk_id in real_ids for m in result.matches)


# ---------------------------------------------------------------------------
# 24. No ChromaDB writes -- the stub has no upsert/write method at all,
# so any accidental write call would raise AttributeError, not silently
# succeed. Passing tests above are themselves the proof.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# List all directories
# ---------------------------------------------------------------------------
async def test_list_directories_returns_distinct_top_level_directories() -> None:
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1", StructureIntent(kind=StructureIntentKind.LIST_DIRECTORIES)
    )

    assert result.found is True
    assert {m.file_path for m in result.matches} == {"backend", "frontend"}
    assert all(m.is_directory for m in result.matches)


# ---------------------------------------------------------------------------
# Symbol-in-file
# ---------------------------------------------------------------------------
async def test_symbol_in_file_found_by_symbol_name_metadata() -> None:
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1",
        StructureIntent(
            kind=StructureIntentKind.SYMBOL_IN_FILE, path="frontend/app.js", symbol="solveMaze"
        ),
    )

    assert result.found is True
    assert result.matches[0].chunk.chunk_id == "c6"


async def test_symbol_in_file_not_found_when_symbol_absent() -> None:
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1",
        StructureIntent(
            kind=StructureIntentKind.SYMBOL_IN_FILE,
            path="frontend/app.js",
            symbol="nonexistentSymbol",
        ),
    )

    assert result.found is False


async def test_symbol_in_file_not_found_when_file_itself_does_not_exist() -> None:
    service = _service(_MAZESOLVER_CHUNKS)
    result = await service.resolve(
        "repo-1",
        StructureIntent(
            kind=StructureIntentKind.SYMBOL_IN_FILE, path="backend/nonexistent.py", symbol="foo"
        ),
    )

    assert result.found is False
