"""Unit tests for app/core/processing/metadata_generator.py (Task 17)."""

from __future__ import annotations

import pytest

from app.core.processing.metadata_generator import MetadataGenerator
from app.domain.enums import ChunkType, DocumentType
from app.domain.exceptions import DomainValidationError
from app.domain.models import Chunk, ChunkMetadata, Document


def _document(**overrides: object) -> Document:
    defaults: dict[str, object] = {
        "repository_id": "repo-1",
        "commit_sha": "sha-1",
        "file_path": "src/App.py",
        "content": "def foo(): ...",
        "language": "unknown",  # deliberately wrong -- language is re-derived, not trusted
        "document_type": DocumentType.SOURCE_CODE,
    }
    defaults.update(overrides)
    return Document(**defaults)


def _chunk(**metadata_overrides: object) -> Chunk:
    defaults: dict[str, object] = {
        "repository_id": "repo-1",
        "file_path": "src/App.py",
        "language": "unknown",
        "commit_sha": "sha-1",
        "chunk_type": ChunkType.CODE_FUNCTION,
        "document_type": DocumentType.SOURCE_CODE,
        "symbol_name": "foo",
        "start_line": 1,
        "end_line": 2,
    }
    defaults.update(metadata_overrides)
    return Chunk(chunk_id="c1", content="def foo(): ...", metadata=ChunkMetadata(**defaults))


def test_generate_metadata_composes_tenant_and_chunk_fields() -> None:
    document = _document()
    chunk = _chunk()
    metadata = MetadataGenerator().generate_metadata(document, chunk)

    assert metadata.repository_id == "repo-1"
    assert metadata.commit_sha == "sha-1"
    assert metadata.document_type == DocumentType.SOURCE_CODE
    assert metadata.chunk_type == ChunkType.CODE_FUNCTION
    assert metadata.symbol_name == "foo"
    assert metadata.start_line == 1
    assert metadata.end_line == 2


def test_language_is_independently_redetected_from_extension() -> None:
    # document.language and chunk.metadata.language both say "unknown";
    # generate_metadata must not trust either verbatim.
    document = _document(file_path="src/App.py")
    chunk = _chunk(file_path="src/App.py")
    metadata = MetadataGenerator().generate_metadata(document, chunk)
    assert metadata.language == "python"


@pytest.mark.parametrize(
    ("file_path", "expected_language"),
    [
        ("src/app.py", "python"),
        ("src/app.ts", "typescript"),
        ("src/App.TSX", "typescript"),
        ("README.md", "markdown"),
        ("config/settings.yaml", "yaml"),
        ("Dockerfile", "text"),
        ("data.unknownext", "text"),
    ],
)
def test_language_detection_across_extensions(file_path: str, expected_language: str) -> None:
    document = _document(file_path=file_path)
    chunk = _chunk(file_path=file_path)
    metadata = MetadataGenerator().generate_metadata(document, chunk)
    assert metadata.language == expected_language


def test_file_path_is_lowercased_and_normalized() -> None:
    document = _document(file_path="Src\\App.py")
    chunk = _chunk(file_path="Src\\App.py")
    metadata = MetadataGenerator().generate_metadata(document, chunk)
    assert metadata.file_path == "src/app.py"


@pytest.mark.parametrize(
    "document_type",
    [
        DocumentType.SOURCE_CODE,
        DocumentType.MARKDOWN_DOC,
        DocumentType.CONFIG_FILE,
        DocumentType.TEST_FILE,
        DocumentType.CHANGELOG,
    ],
)
def test_document_type_is_carried_through_for_every_document_type(
    document_type: DocumentType,
) -> None:
    document = _document(document_type=document_type)
    chunk = _chunk(document_type=document_type)
    metadata = MetadataGenerator().generate_metadata(document, chunk)
    assert metadata.document_type == document_type


def test_embedding_fields_are_carried_forward_from_the_chunk() -> None:
    document = _document()
    chunk = _chunk(embedding_model_version="text-embedding-004")
    metadata = MetadataGenerator().generate_metadata(document, chunk)
    assert metadata.embedding_model_version == "text-embedding-004"


def test_missing_repository_id_raises_domain_validation_error() -> None:
    document = _document(repository_id="")
    chunk = _chunk()
    with pytest.raises(DomainValidationError, match="missing mandatory field"):
        MetadataGenerator().generate_metadata(document, chunk)


def test_blank_commit_sha_raises_domain_validation_error() -> None:
    document = _document(commit_sha="   ")
    chunk = _chunk()
    with pytest.raises(DomainValidationError, match="missing mandatory field"):
        MetadataGenerator().generate_metadata(document, chunk)


def test_invalid_line_range_raises_domain_validation_error() -> None:
    document = _document()
    chunk = _chunk(start_line=5, end_line=2)
    with pytest.raises(DomainValidationError, match="invalid line range"):
        MetadataGenerator().generate_metadata(document, chunk)
