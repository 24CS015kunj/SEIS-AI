"""Unit tests for app/core/processing/document_processor.py (Task 13)."""

from __future__ import annotations

from app.core.processing.document_processor import DocumentProcessor
from app.domain.enums import DocumentType
from app.domain.models import ManifestFile, RepositoryManifest


def _manifest(*files: ManifestFile) -> RepositoryManifest:
    return RepositoryManifest(
        repository_id="repo-1",
        workspace_id="ws-1",
        commit_sha="abc123",
        files=list(files),
    )


def test_source_code_file_is_processed_and_classified() -> None:
    manifest = _manifest(
        ManifestFile(path="src/app.py", content=b"def foo():\n    return 1\n", size_bytes=25)
    )
    documents = DocumentProcessor().process_manifest(manifest)

    assert len(documents) == 1
    doc = documents[0]
    assert doc.file_path == "src/app.py"
    assert doc.content == "def foo():\n    return 1\n"
    assert doc.document_type == DocumentType.SOURCE_CODE
    assert doc.language == "python"
    assert doc.repository_id == "repo-1"
    assert doc.commit_sha == "abc123"


def test_manifest_supplied_language_takes_precedence_over_extension_detection() -> None:
    manifest = _manifest(
        ManifestFile(path="script.sh", content=b"echo hi", language="Bash", size_bytes=7)
    )
    documents = DocumentProcessor().process_manifest(manifest)
    assert documents[0].language == "bash"


def test_binary_extension_is_excluded() -> None:
    manifest = _manifest(
        ManifestFile(path="assets/logo.png", content=b"\x89PNG\r\n\x1a\n", size_bytes=8),
        ManifestFile(path="src/app.py", content=b"x = 1\n", size_bytes=6),
    )
    documents = DocumentProcessor().process_manifest(manifest)
    assert [d.file_path for d in documents] == ["src/app.py"]


def test_ignored_directories_are_excluded() -> None:
    manifest = _manifest(
        ManifestFile(path=".git/HEAD", content=b"ref: refs/heads/main\n", size_bytes=21),
        ManifestFile(
            path="node_modules/left-pad/index.js", content=b"module.exports = {}", size_bytes=20
        ),
        ManifestFile(path="src/app.py", content=b"x = 1\n", size_bytes=6),
    )
    documents = DocumentProcessor().process_manifest(manifest)
    assert [d.file_path for d in documents] == ["src/app.py"]


def test_generated_lockfile_is_excluded() -> None:
    manifest = _manifest(
        ManifestFile(path="package-lock.json", content=b"{}", size_bytes=2),
        ManifestFile(path="src/app.py", content=b"x = 1\n", size_bytes=6),
    )
    documents = DocumentProcessor().process_manifest(manifest)
    assert [d.file_path for d in documents] == ["src/app.py"]


def test_file_with_no_inlined_content_is_excluded() -> None:
    manifest = _manifest(
        ManifestFile(path="huge_binary.bin", content=None, size_bytes=999_999_999),
        ManifestFile(path="src/app.py", content=b"x = 1\n", size_bytes=6),
    )
    documents = DocumentProcessor().process_manifest(manifest)
    assert [d.file_path for d in documents] == ["src/app.py"]


def test_non_utf8_content_falls_back_to_exclusion() -> None:
    manifest = _manifest(
        # .dat is not a recognized binary extension, but the bytes aren't
        # valid UTF-8 -- exercises the explicit decoding-fallback path.
        ManifestFile(path="data/blob.dat", content=b"\xff\xfe\x00\xff", size_bytes=4),
        ManifestFile(path="src/app.py", content=b"x = 1\n", size_bytes=6),
    )
    documents = DocumentProcessor().process_manifest(manifest)
    assert [d.file_path for d in documents] == ["src/app.py"]


def test_markdown_file_is_classified_as_markdown_doc() -> None:
    manifest = _manifest(ManifestFile(path="README.md", content=b"# Title\n", size_bytes=8))
    documents = DocumentProcessor().process_manifest(manifest)
    assert documents[0].document_type == DocumentType.MARKDOWN_DOC
    assert documents[0].language == "markdown"


def test_changelog_file_is_classified_as_changelog() -> None:
    manifest = _manifest(ManifestFile(path="CHANGELOG.md", content=b"## 1.0.0\n", size_bytes=9))
    documents = DocumentProcessor().process_manifest(manifest)
    assert documents[0].document_type == DocumentType.CHANGELOG


def test_config_file_is_classified_as_config_file() -> None:
    manifest = _manifest(
        ManifestFile(path="config/settings.yaml", content=b"debug: true\n", size_bytes=12)
    )
    documents = DocumentProcessor().process_manifest(manifest)
    assert documents[0].document_type == DocumentType.CONFIG_FILE


def test_test_file_is_classified_as_test_file_by_path() -> None:
    manifest = _manifest(
        ManifestFile(path="tests/unit/test_app.py", content=b"def test_foo(): ...\n", size_bytes=21)
    )
    documents = DocumentProcessor().process_manifest(manifest)
    assert documents[0].document_type == DocumentType.TEST_FILE


def test_test_file_is_classified_as_test_file_by_filename_prefix() -> None:
    manifest = _manifest(
        ManifestFile(path="src/test_helpers.py", content=b"def test_x(): ...\n", size_bytes=18)
    )
    documents = DocumentProcessor().process_manifest(manifest)
    assert documents[0].document_type == DocumentType.TEST_FILE


def test_extensionless_config_filename_is_classified_and_language_falls_back_to_text() -> None:
    manifest = _manifest(
        ManifestFile(path="Dockerfile", content=b"FROM python:3.13\n", size_bytes=17)
    )
    documents = DocumentProcessor().process_manifest(manifest)
    assert documents[0].document_type == DocumentType.CONFIG_FILE
    assert documents[0].language == "text"


def test_empty_manifest_returns_empty_document_list() -> None:
    documents = DocumentProcessor().process_manifest(_manifest())
    assert documents == []
