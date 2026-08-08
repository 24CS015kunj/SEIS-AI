"""Document Processor.

Normalizes heterogeneous repository content (source, markdown,
config) into clean, typed content before chunking. Pure in-process
transformation with no external I/O (§5.3).

Task 13: converts an Express-supplied :class:`RepositoryManifest` into
a clean list of :class:`Document` objects -- filtering vendored/binary
noise and classifying each remaining file by :class:`DocumentType`.
"""

from __future__ import annotations

import structlog

from app.domain.enums import DocumentType
from app.domain.models import Document, ManifestFile, RepositoryManifest

logger = structlog.get_logger("seis.core.processing")

# Directories whose contents are never processed, regardless of file
# extension (§6.1 filter stage: "skip binaries, vendored, oversized").
# ".git" and "node_modules" are the two examples Task 13 names
# explicitly; the rest operationalize the master spec's broader
# "vendored, generated code" language (week1-ai-system-design.md §13).
_IGNORED_DIR_NAMES = frozenset(
    {
        ".git",
        "node_modules",
        "__pycache__",
        ".venv",
        "venv",
        "dist",
        "build",
        ".next",
        "vendor",
    }
)

# Binary asset extensions -- excluded outright (§21.5 BINARY_ASSET: No).
# ".png", ".exe", ".zip" are Task 13's named examples; extended to
# cover the other common binary families (images, archives, fonts,
# compiled artifacts, media) in the same spirit.
_BINARY_EXTENSIONS = frozenset(
    {
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".ico",
        ".bmp",
        ".webp",
        ".exe",
        ".dll",
        ".so",
        ".dylib",
        ".class",
        ".jar",
        ".pyc",
        ".pyd",
        ".zip",
        ".tar",
        ".gz",
        ".7z",
        ".rar",
        ".pdf",
        ".woff",
        ".woff2",
        ".ttf",
        ".eot",
        ".mp3",
        ".mp4",
        ".mov",
        ".avi",
    }
)

# Generated lockfiles -- excluded outright (§21.5 GENERATED_LOCKFILE: No).
_LOCKFILE_NAMES = frozenset(
    {
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "pipfile.lock",
        "poetry.lock",
        "cargo.lock",
        "gemfile.lock",
        "composer.lock",
    }
)

_MARKDOWN_EXTENSIONS = frozenset({".md", ".mdx"})
_CONFIG_EXTENSIONS = frozenset({".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".env"})
_CONFIG_FILENAMES = frozenset({"dockerfile", "makefile"})

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


def _extension(filename: str) -> str:
    if "." not in filename:
        return ""
    return "." + filename.rsplit(".", 1)[-1].lower()


def _is_test_path(path: str, filename: str) -> bool:
    bounded = f"/{path}/"
    if "/tests/" in bounded or "/test/" in bounded:
        return True
    stem = filename.rsplit(".", 1)[0] if "." in filename else filename
    return (
        stem.startswith("test_")
        or stem.endswith("_test")
        or stem.endswith(".test")
        or stem.endswith(".spec")
    )


class DocumentProcessor:
    """Normalizes a :class:`RepositoryManifest` into a clean list of
    :class:`Document` objects (Task 13, §5.3, §6.2).
    """

    def __init__(self) -> None:
        self._log = logger.bind(component="document_processor")

    def process_manifest(self, manifest: RepositoryManifest) -> list[Document]:
        """Filter, decode, and classify every file in ``manifest``,
        returning only the subset that survives as indexable text.
        """
        documents: list[Document] = []
        for file in manifest.files:
            document = self._process_file(manifest, file)
            if document is not None:
                documents.append(document)

        self._log.info(
            "manifest_processed",
            repository_id=manifest.repository_id,
            file_count=len(manifest.files),
            document_count=len(documents),
        )
        return documents

    def _process_file(self, manifest: RepositoryManifest, file: ManifestFile) -> Document | None:
        if self._is_ignored_path(file.path):
            return None
        if file.content is None:
            return None

        document_type = self._classify(file.path)
        if document_type in (DocumentType.GENERATED_LOCKFILE, DocumentType.BINARY_ASSET):
            return None

        text = self._decode_text(file.content)
        if text is None:
            # Not classified as binary by extension, but not valid UTF-8
            # either -- the explicit decoding-fallback case Task 13
            # calls out. Treat as an unindexable binary asset.
            return None

        language = (file.language or self._detect_language(file.path)).lower()

        return Document(
            repository_id=manifest.repository_id,
            commit_sha=manifest.commit_sha,
            file_path=file.path,
            content=text,
            language=language,
            document_type=document_type,
        )

    @staticmethod
    def _is_ignored_path(path: str) -> bool:
        parts = path.replace("\\", "/").split("/")
        return any(part in _IGNORED_DIR_NAMES for part in parts[:-1])

    @staticmethod
    def _decode_text(content: bytes) -> str | None:
        try:
            return content.decode("utf-8")
        except UnicodeDecodeError:
            return None

    @staticmethod
    def _classify(path: str) -> DocumentType:
        normalized = path.replace("\\", "/")
        filename = normalized.rsplit("/", 1)[-1]
        lower_filename = filename.lower()
        suffix = _extension(filename)

        if lower_filename in _LOCKFILE_NAMES:
            return DocumentType.GENERATED_LOCKFILE
        if suffix in _BINARY_EXTENSIONS:
            return DocumentType.BINARY_ASSET
        if lower_filename in ("changelog.md", "changelog"):
            return DocumentType.CHANGELOG
        if _is_test_path(normalized, lower_filename):
            return DocumentType.TEST_FILE
        if suffix in _MARKDOWN_EXTENSIONS:
            return DocumentType.MARKDOWN_DOC
        if suffix in _CONFIG_EXTENSIONS or lower_filename in _CONFIG_FILENAMES:
            return DocumentType.CONFIG_FILE
        # Fallback: any other UTF-8-decodable file is treated as source
        # code content (§21.5 lists no catch-all "other text" type, and
        # every explicitly-named type is either code-shaped or excluded).
        return DocumentType.SOURCE_CODE

    @staticmethod
    def _detect_language(path: str) -> str:
        return _LANGUAGE_BY_EXTENSION.get(_extension(path), "text")
