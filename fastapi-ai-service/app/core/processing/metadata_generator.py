"""Metadata Generator.

Populates the canonical chunk metadata schema (repositoryId, filePath,
language, commitSha, chunkType, documentType, symbolName, line range)
defined in §21.6.

Task 17: ``MetadataGenerator.generate_metadata(document, chunk) ->
ChunkMetadata`` -- the final normalization/validation pass a chunk's
metadata goes through before vector storage. Tenant/file-level fields
(``repository_id``, ``commit_sha``, ``file_path``, ``document_type``)
come from the authoritative ``Document``; chunk-shape fields
(``chunk_type``, ``symbol_name``, ``start_line``, ``end_line``,
``embedding_model_version``, ``indexed_at``) are carried forward from
the ``Chunk`` the Chunker (Task 14) already produced -- that's its own
declared responsibility per §21.6 and isn't re-derived here.
``language`` is the one field independently re-derived from the file
extension (subtask 3), rather than trusted verbatim from either input,
since extension mapping is this step's one deterministic,
always-available ground truth for the schema's most retrieval-critical
filter field. Every mandatory field is then validated before the
metadata is returned (subtask 4).

This is additive, not a replacement for Task 14's own metadata
construction: ``ASTChunker`` already builds a complete, valid
``ChunkMetadata`` per chunk (necessary since ``Chunk.metadata`` is a
required field), and that code is untouched here. A future Service
(Task 30+) is expected to call ``MetadataGenerator`` as a final
normalization/validation pass before a chunk reaches ChromaDB --
consistent with Tasks 13-16's precedent of Core-layer pipeline classes
not being wired into ``app/api/deps.py``.
"""

from __future__ import annotations

from app.domain.exceptions import DomainValidationError
from app.domain.models import Chunk, ChunkMetadata, Document

# Task 17's own literal examples (".py -> python", ".ts -> typescript"),
# extended with the other common languages named elsewhere in this
# phase (§21.4/§21.5). Deliberately not imported from
# ``app.core.processing.document_processor`` -- Task 17's own
# ``Dependencies`` line is ``app.domain`` only, so this module keeps an
# independently-scoped copy rather than reaching into a sibling Core
# module the spec doesn't list as a dependency.
_LANGUAGE_BY_EXTENSION = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".java": "java",
    ".go": "go",
    ".rs": "rust",
    ".rb": "ruby",
    ".php": "php",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".kt": "kotlin",
    ".swift": "swift",
    ".scala": "scala",
    ".sql": "sql",
    ".sh": "shell",
    ".md": "markdown",
    ".mdx": "markdown",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".ini": "ini",
    ".cfg": "ini",
}


def _detect_language(file_path: str) -> str:
    filename = file_path.replace("\\", "/").rsplit("/", 1)[-1]
    if "." not in filename:
        return "text"
    suffix = "." + filename.rsplit(".", 1)[-1].lower()
    return _LANGUAGE_BY_EXTENSION.get(suffix, "text")


class MetadataGenerator:
    """Generates and validates the canonical :class:`ChunkMetadata` for
    a chunk (Task 17, §21.6).
    """

    def generate_metadata(self, document: Document, chunk: Chunk) -> ChunkMetadata:
        metadata = ChunkMetadata(
            repository_id=document.repository_id,
            # Best Practice: lowercase file_path/language for consistent
            # metadata-filter matching (§21.6, ChromaDB read path).
            file_path=document.file_path.replace("\\", "/").lower(),
            language=_detect_language(document.file_path),
            commit_sha=document.commit_sha,
            chunk_type=chunk.metadata.chunk_type,
            document_type=document.document_type,
            symbol_name=chunk.metadata.symbol_name,
            start_line=chunk.metadata.start_line,
            end_line=chunk.metadata.end_line,
            embedding_model_version=chunk.metadata.embedding_model_version,
            indexed_at=chunk.metadata.indexed_at,
        )
        self._validate(metadata)
        return metadata

    @staticmethod
    def _validate(metadata: ChunkMetadata) -> None:
        # Pydantic already enforces field types and `Field(ge=1)` on the
        # line numbers at construction time; this covers the invariants
        # a bare schema can't express (§Common Mistakes, §Review
        # Checklist): mandatory fields present as non-blank strings, and
        # a structurally sane line range. `workspace_id` is not part of
        # this frozen schema (Task 7) -- resolved the same way as Task
        # 9: tenant isolation is transitive via `repository_id`, not a
        # separate metadata field.
        mandatory = {
            "repository_id": metadata.repository_id,
            "file_path": metadata.file_path,
            "language": metadata.language,
            "commit_sha": metadata.commit_sha,
        }
        missing = [name for name, value in mandatory.items() if not value.strip()]
        if missing:
            raise DomainValidationError(
                "ChunkMetadata is missing mandatory field(s)",
                details={"missing_fields": missing},
            )
        if metadata.end_line < metadata.start_line:
            raise DomainValidationError(
                "ChunkMetadata has an invalid line range (end_line < start_line)",
                details={"start_line": metadata.start_line, "end_line": metadata.end_line},
            )
