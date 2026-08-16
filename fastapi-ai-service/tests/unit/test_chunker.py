"""Unit tests for app/core/processing/chunker.py (Task 14)."""

from __future__ import annotations

from app.core.processing.chunker import ASTChunker
from app.domain.enums import ChunkType, DocumentType
from app.domain.models import Document


def _document(content: str, **overrides: object) -> Document:
    defaults: dict[str, object] = {
        "repository_id": "repo-1",
        "commit_sha": "sha-1",
        "file_path": "src/app.py",
        "content": content,
        "language": "python",
        "document_type": DocumentType.SOURCE_CODE,
    }
    defaults.update(overrides)
    return Document(**defaults)


def test_single_function_becomes_one_code_function_chunk() -> None:
    document = _document("def add(a, b):\n    return a + b\n")
    chunks = ASTChunker().chunk(document)

    assert len(chunks) == 1
    chunk = chunks[0]
    assert chunk.metadata.chunk_type == ChunkType.CODE_FUNCTION
    assert chunk.metadata.symbol_name == "add"
    assert chunk.metadata.start_line == 1
    assert chunk.metadata.end_line == 2
    assert "return a + b" in chunk.content
    assert chunk.metadata.repository_id == "repo-1"
    assert chunk.metadata.file_path == "src/app.py"


def test_class_function_and_module_header_are_all_captured() -> None:
    content = (
        "import os\n"
        "\n"
        "CONST = 1\n"
        "\n"
        "def helper():\n"
        "    return os.getcwd()\n"
        "\n"
        "class Widget:\n"
        "    def render(self):\n"
        "        return CONST\n"
    )
    document = _document(content)
    chunks = ASTChunker().chunk(document)

    types = [c.metadata.chunk_type for c in chunks]
    assert ChunkType.CODE_MODULE_HEADER in types
    assert ChunkType.CODE_FUNCTION in types
    assert ChunkType.CODE_CLASS in types

    header = next(c for c in chunks if c.metadata.chunk_type == ChunkType.CODE_MODULE_HEADER)
    assert "import os" in header.content
    assert "CONST = 1" in header.content

    func = next(c for c in chunks if c.metadata.chunk_type == ChunkType.CODE_FUNCTION)
    assert func.metadata.symbol_name == "helper"

    cls = next(c for c in chunks if c.metadata.chunk_type == ChunkType.CODE_CLASS)
    assert cls.metadata.symbol_name == "Widget"
    assert "def render" in cls.content

    # Chunks are returned in source order.
    assert [c.metadata.start_line for c in chunks] == sorted(c.metadata.start_line for c in chunks)


def test_functions_in_a_test_file_are_tagged_test_case() -> None:
    document = _document(
        "def test_addition():\n    assert 1 + 1 == 2\n",
        document_type=DocumentType.TEST_FILE,
    )
    chunks = ASTChunker().chunk(document)

    assert len(chunks) == 1
    assert chunks[0].metadata.chunk_type == ChunkType.TEST_CASE
    assert chunks[0].metadata.symbol_name == "test_addition"


def test_unparseable_python_falls_back_to_generic_chunking() -> None:
    document = _document("def broken(:\n    this is not valid python\n")
    chunks = ASTChunker().chunk(document)

    assert len(chunks) == 1
    assert chunks[0].metadata.chunk_type == ChunkType.GENERIC_TEXT


def test_markdown_headers_split_into_separate_sections() -> None:
    content = (
        "# Title\n"
        "Intro text.\n"
        "\n"
        "## Section One\n"
        "Body one.\n"
        "\n"
        "## Section Two\n"
        "Body two.\n"
    )
    document = _document(
        content, file_path="README.md", language="markdown", document_type=DocumentType.MARKDOWN_DOC
    )
    chunks = ASTChunker().chunk(document)

    assert len(chunks) == 3
    assert all(c.metadata.chunk_type == ChunkType.MARKDOWN_SECTION for c in chunks)
    assert chunks[0].metadata.symbol_name == "Title"
    assert chunks[1].metadata.symbol_name == "Section One"
    assert "Body one." in chunks[1].content
    assert chunks[2].metadata.symbol_name == "Section Two"
    assert "Body two." in chunks[2].content


def test_markdown_preamble_before_first_header_becomes_its_own_chunk() -> None:
    content = "Some preamble text with no heading.\n\n# First Heading\nBody.\n"
    document = _document(
        content, file_path="README.md", language="markdown", document_type=DocumentType.MARKDOWN_DOC
    )
    chunks = ASTChunker().chunk(document)

    assert len(chunks) == 2
    assert chunks[0].metadata.symbol_name is None
    assert "preamble" in chunks[0].content
    assert chunks[1].metadata.symbol_name == "First Heading"


def test_markdown_without_headers_falls_back_to_generic_chunking() -> None:
    document = _document(
        "Just a plain paragraph with no markdown headings at all.\n",
        file_path="NOTES.md",
        language="markdown",
        document_type=DocumentType.MARKDOWN_DOC,
    )
    chunks = ASTChunker().chunk(document)

    assert len(chunks) == 1
    assert chunks[0].metadata.chunk_type == ChunkType.GENERIC_TEXT


def test_non_python_source_uses_generic_sliding_window_chunking() -> None:
    document = _document(
        "function add(a, b) {\n  return a + b;\n}\n",
        file_path="src/app.js",
        language="javascript",
    )
    chunks = ASTChunker().chunk(document)

    assert len(chunks) == 1
    assert chunks[0].metadata.chunk_type == ChunkType.GENERIC_TEXT
    assert chunks[0].metadata.language == "javascript"


def test_oversized_function_is_split_with_overlap_and_shares_symbol_name() -> None:
    # ~600 lines of body, each line ~20 chars -> well past the 512-token
    # (~2048 char) budget, forcing the sliding-window split path even
    # though the segment is a single AST function.
    body_lines = "\n".join(f"    x{i} = {i}  # padding" for i in range(600))
    content = f"def big():\n{body_lines}\n    return x0\n"
    document = _document(content)
    chunks = ASTChunker().chunk(document)

    assert len(chunks) > 1
    assert all(c.metadata.chunk_type == ChunkType.CODE_FUNCTION for c in chunks)
    assert all(c.metadata.symbol_name == "big" for c in chunks)

    # Adjacent windows overlap: the tail of one chunk reappears at the
    # head of the next.
    first_tail = chunks[0].content.splitlines()[-1]
    assert first_tail in chunks[1].content


def test_chunk_ids_are_deterministic_across_repeated_chunking() -> None:
    document = _document("def add(a, b):\n    return a + b\n")
    first_run = [c.chunk_id for c in ASTChunker().chunk(document)]
    second_run = [c.chunk_id for c in ASTChunker().chunk(document)]
    assert first_run == second_run


def test_chunk_ids_differ_for_different_commit_shas() -> None:
    document_a = _document("def add(a, b):\n    return a + b\n", commit_sha="sha-a")
    document_b = _document("def add(a, b):\n    return a + b\n", commit_sha="sha-b")
    ids_a = [c.chunk_id for c in ASTChunker().chunk(document_a)]
    ids_b = [c.chunk_id for c in ASTChunker().chunk(document_b)]
    assert ids_a != ids_b


def test_empty_document_content_returns_no_chunks() -> None:
    document = _document("")
    assert ASTChunker().chunk(document) == []


def test_empty_markdown_content_returns_no_chunks() -> None:
    document = _document(
        "", file_path="README.md", language="markdown", document_type=DocumentType.MARKDOWN_DOC
    )
    assert ASTChunker().chunk(document) == []


def test_blank_only_content_produces_no_chunks() -> None:
    document = _document(
        "   \n\n\t\n",
        file_path="config.yaml",
        language="yaml",
        document_type=DocumentType.CONFIG_FILE,
    )
    assert ASTChunker().chunk(document) == []
