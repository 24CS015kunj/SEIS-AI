"""Chunker.

Splits normalized document content into semantically coherent Chunk
objects using type-aware (AST/heading/key-aware) strategies, honoring
the chunking configuration in §19.5 (§5.3).

Task 14: language-aware AST chunking for Python (stdlib ``ast``),
heading-aware chunking for Markdown, and a sliding-window fallback for
everything else -- matching the task's explicit scope (``Dependencies:
app.domain`` only; no ``tree-sitter``/multi-language AST support and no
real tokenizer dependency are listed in ``requirements.txt``, so token
counts here are a documented character-based approximation, not exact
model-tokenizer output).
"""

from __future__ import annotations

import ast
import hashlib
import re
from dataclasses import dataclass

import structlog

from app.domain.enums import ChunkType, DocumentType
from app.domain.models import Chunk, ChunkMetadata, Document

logger = structlog.get_logger("seis.core.processing")

# §19.5's own literal example ("e.g. 512 tokens with 50-token overlap").
_MAX_CHUNK_TOKENS = 512
_CHUNK_OVERLAP_TOKENS = 50

# No tokenizer dependency is available to this task (Dependencies:
# app.domain only) -- 4 characters/token is the standard rough estimate
# for English/code text, sufficient to keep chunks in the right order
# of magnitude until a real tokenizer (§21.8 Tokenizer Wrapper, or
# Gemini's own count_tokens in Task 15) replaces it.
_CHARS_PER_TOKEN_ESTIMATE = 4

_HEADER_PATTERN = re.compile(r"^(#{1,6})\s+(.*)$")


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // _CHARS_PER_TOKEN_ESTIMATE)


def _chunk_id(document: Document, chunk_index: int) -> str:
    """Deterministic chunk ID (§21.8 Chunk-ID Hasher / §14.2 idempotency):
    ``hash(repositoryId + filePath + commitSha + chunkIndex)``. Re-chunking
    unchanged content always yields the same IDs, so re-running a job is
    a safe upsert rather than a duplicate insert.
    """
    raw = f"{document.repository_id}:{document.file_path}:{document.commit_sha}:{chunk_index}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _contiguous_runs(numbers: list[int]) -> list[list[int]]:
    runs: list[list[int]] = []
    current: list[int] = []
    for number in numbers:
        if current and number != current[-1] + 1:
            runs.append(current)
            current = []
        current.append(number)
    if current:
        runs.append(current)
    return runs


def _sliding_window_lines(content: str, start_line: int) -> list[tuple[str, int, int]]:
    """Fixed-window fallback chunking (§21.4 GENERIC_TEXT) with overlap,
    operating on whole lines so every window keeps accurate start/end
    line metadata.
    """
    # Only reached from `_split_oversized`'s oversized branch, which
    # requires content well past the token budget -- `lines` is never
    # empty here.
    lines = content.splitlines()

    max_chars = _MAX_CHUNK_TOKENS * _CHARS_PER_TOKEN_ESTIMATE
    overlap_chars = _CHUNK_OVERLAP_TOKENS * _CHARS_PER_TOKEN_ESTIMATE

    windows: list[tuple[str, int, int]] = []
    index = 0
    total = len(lines)
    while index < total:
        begin = index
        char_count = 0
        while index < total and (char_count == 0 or char_count < max_chars):
            char_count += len(lines[index]) + 1
            index += 1
        end = index - 1
        windows.append(("\n".join(lines[begin : end + 1]), start_line + begin, start_line + end))

        if index >= total:
            break

        # Step back ~overlap_chars worth of trailing lines, but always
        # leave at least one line of forward progress so this loop
        # terminates.
        back = index
        consumed = 0
        while back > begin + 1 and consumed < overlap_chars:
            back -= 1
            consumed += len(lines[back]) + 1
        index = back

    return windows


@dataclass(frozen=True)
class _RawChunk:
    content: str
    start_line: int
    end_line: int
    chunk_type: ChunkType
    symbol_name: str | None


def _split_oversized(
    content: str, start_line: int, chunk_type: ChunkType, symbol_name: str | None
) -> list[_RawChunk]:
    """Keep a semantic segment (an AST symbol, a Markdown section, ...)
    whole when it already fits the token budget; otherwise fall back to
    the sliding window so no single chunk is unboundedly large.
    """
    if _estimate_tokens(content) <= _MAX_CHUNK_TOKENS:
        line_count = len(content.splitlines())
        end_line = start_line + max(line_count - 1, 0)
        return [_RawChunk(content, start_line, end_line, chunk_type, symbol_name)]

    return [
        _RawChunk(text, s, e, chunk_type, symbol_name)
        for text, s, e in _sliding_window_lines(content, start_line)
    ]


class ASTChunker:
    """Splits a :class:`Document` into semantically bounded :class:`Chunk`
    objects (Task 14, §5.3).
    """

    def __init__(self) -> None:
        self._log = logger.bind(component="ast_chunker")

    def chunk(self, document: Document) -> list[Chunk]:
        if document.language == "python":
            raw_chunks = self._chunk_python(document)
        elif document.document_type in (DocumentType.MARKDOWN_DOC, DocumentType.CHANGELOG):
            raw_chunks = self._chunk_markdown(document)
        else:
            raw_chunks = self._chunk_generic(document)

        # §19.5's min-chunk-tokens purpose ("filters out near-empty noise
        # chunks") is honored as whitespace-emptiness only: AST symbol
        # chunks must stay whole even when tiny (never split a function
        # mid-body), so no separate numeric floor is applied on top.
        raw_chunks = [raw for raw in raw_chunks if raw.content.strip()]
        raw_chunks.sort(key=lambda raw: raw.start_line)

        chunks = [self._finalize(document, raw, index) for index, raw in enumerate(raw_chunks)]
        self._log.info(
            "document_chunked",
            file_path=document.file_path,
            language=document.language,
            chunk_count=len(chunks),
        )
        return chunks

    def _finalize(self, document: Document, raw: _RawChunk, index: int) -> Chunk:
        metadata = ChunkMetadata(
            repository_id=document.repository_id,
            file_path=document.file_path,
            language=document.language,
            commit_sha=document.commit_sha,
            chunk_type=raw.chunk_type,
            document_type=document.document_type,
            symbol_name=raw.symbol_name,
            start_line=raw.start_line,
            end_line=raw.end_line,
        )
        return Chunk(chunk_id=_chunk_id(document, index), content=raw.content, metadata=metadata)

    def _chunk_python(self, document: Document) -> list[_RawChunk]:
        try:
            tree = ast.parse(document.content)
        except SyntaxError:
            self._log.warning(
                "python_ast_parse_failed_falling_back_to_generic", file_path=document.file_path
            )
            return self._chunk_generic(document)

        source_lines = document.content.splitlines()
        symbol_nodes = [
            node
            for node in tree.body
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef)
        ]

        raw_chunks: list[_RawChunk] = []
        covered: set[int] = set()

        for node in symbol_nodes:
            segment = ast.get_source_segment(document.content, node)
            if not segment:
                continue
            start_line = node.lineno
            end_line = node.end_lineno or start_line
            covered.update(range(start_line, end_line + 1))

            if isinstance(node, ast.ClassDef):
                chunk_type = ChunkType.CODE_CLASS
            elif document.document_type is DocumentType.TEST_FILE:
                chunk_type = ChunkType.TEST_CASE
            else:
                chunk_type = ChunkType.CODE_FUNCTION

            raw_chunks.extend(_split_oversized(segment, start_line, chunk_type, node.name))

        header_line_numbers = [
            line_no for line_no in range(1, len(source_lines) + 1) if line_no not in covered
        ]
        for run in _contiguous_runs(header_line_numbers):
            run_lines = [source_lines[line_no - 1] for line_no in run]
            if not any(line.strip() for line in run_lines):
                continue
            raw_chunks.extend(
                _split_oversized("\n".join(run_lines), run[0], ChunkType.CODE_MODULE_HEADER, None)
            )

        return raw_chunks

    def _chunk_markdown(self, document: Document) -> list[_RawChunk]:
        lines = document.content.splitlines()
        if not lines:
            return []

        boundaries = [i for i, line in enumerate(lines) if _HEADER_PATTERN.match(line)]
        if not boundaries:
            return self._chunk_generic(document)

        raw_chunks: list[_RawChunk] = []

        if boundaries[0] > 0:
            preamble_lines = lines[: boundaries[0]]
            if any(line.strip() for line in preamble_lines):
                raw_chunks.extend(
                    _split_oversized("\n".join(preamble_lines), 1, ChunkType.MARKDOWN_SECTION, None)
                )

        for position, start in enumerate(boundaries):
            end = boundaries[position + 1] if position + 1 < len(boundaries) else len(lines)
            section_lines = lines[start:end]
            header_match = _HEADER_PATTERN.match(lines[start])
            title = header_match.group(2).strip() if header_match else None
            raw_chunks.extend(
                _split_oversized(
                    "\n".join(section_lines), start + 1, ChunkType.MARKDOWN_SECTION, title
                )
            )

        return raw_chunks

    def _chunk_generic(self, document: Document) -> list[_RawChunk]:
        return _split_oversized(document.content, 1, ChunkType.GENERIC_TEXT, None)
