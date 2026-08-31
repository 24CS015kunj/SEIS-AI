"""Repository-Structure Intent Detection (Task 67).

Task 63 found that a purely semantic/lexical + reranker path can under-
rank a structurally relevant file even when it was actually retrieved
(the reranker's own cross-encoder judgment is about *content* relevance
to a query, not "is this file literally inside this directory" -- a
question the reranker was never asked to answer and has no way to
answer reliably). For a small, specific class of questions --
"what files are in X", "does Y exist", "where is Z" -- the repository's
own indexed file metadata already has a deterministic, always-correct
answer that doesn't need a relevance judgment at all.

This module is the first stage of that path: given a raw user question,
decide whether it is one of those deterministic structure questions and,
if so, extract the target (directory/file/symbol) into a
:class:`StructureIntent`. Returns ``None`` for everything else, which
must always fall through to the existing, unchanged Task 66 RAG
pipeline -- this module is a pure filter/extractor, never a router that
owns the decision to skip retrieval (that decision lives in
``RepositoryChatService``, which only *acts* on a non-``None`` result).

Deterministic, not LLM-based (same constraint and reasoning as Task 66's
``QueryRewriter``): classifying "is this a structure question" from a
short, template-shaped phrase is exactly the kind of bounded pattern
match a regex handles reliably, without a second network round-trip on
the critical path of every chat turn.

Conservative by construction, not by a blocklist alone (§"Do not
over-interpret"): every pattern here is anchored to the *start* of the
(stripped, lowercased) question and requires a specific, narrow lead
phrase ("what files are in", "list files in", "where is", "does ...
exist", ...) -- a conceptual question like "Explain the files in
backend" or "What does backend/maze.py do?" simply never matches any of
them, because those phrasings were never in the template set to begin
with. On top of that, every captured path/filename/symbol candidate must
independently pass :func:`_looks_like_path`/:func:`_looks_like_symbol`
(no embedded whitespace) before an intent is ever returned -- this is
what keeps "Where is that implemented?" (Task 66's own conversation-
reference example) from ever being misread as a literal file-location
question: "that implemented" contains a space, so it fails the path
shape check and this function returns ``None``, exactly as it did before
this task existed (Task 66's RAG + query-rewriting path is what
correctly answers that question, unchanged).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum

# Words that, anywhere in the question, veto any structure-intent match
# regardless of which template otherwise matched -- defense in depth on
# top of the template anchoring itself (see module docstring). None of
# the whitelisted templates below actually contain these words, so this
# is a belt-and-suspenders safety net, not the primary mechanism.
_CONCEPTUAL_VETO_WORDS = ("explain", "describe", "algorithm", "why")


class StructureIntentKind(str, Enum):
    LIST_DIRECTORY = "list_directory"
    LIST_DIRECTORIES = "list_directories"
    FILE_EXISTS = "file_exists"
    FILE_LOCATION = "file_location"
    DIRECTORY_EXISTS = "directory_exists"
    SYMBOL_IN_FILE = "symbol_in_file"


@dataclass(frozen=True)
class StructureIntent:
    """A detected deterministic repository-structure question.

    ``path`` is ``None`` for a root-level ``LIST_DIRECTORY`` ("what
    files are in the root/repository?") and for ``LIST_DIRECTORIES``
    (which always lists every directory, not one). ``language`` is only
    ever set on ``LIST_DIRECTORY`` (an extension/language-filtered
    listing). ``symbol`` is only ever set on ``SYMBOL_IN_FILE``.
    """

    kind: StructureIntentKind
    path: str | None = None
    language: str | None = None
    symbol: str | None = None


_DIR_SUFFIX = r"(?: directory| folder)?"
_I = re.IGNORECASE

_LIST_ROOT_PATTERNS = (
    re.compile(r"^what files (?:are|exist) in (?:the )?root$", _I),
    re.compile(r"^what files (?:are|exist) in (?:the )?repository$", _I),
    re.compile(r"^what files (?:are|exist) in (?:the )?repository root$", _I),
    re.compile(r"^what files (?:are|exist) at (?:the )?(?:root|top level)$", _I),
    re.compile(r"^list (?:the )?(?:root )?files$", _I),
)

_LIST_DIRECTORIES_PATTERNS = (
    re.compile(r"^what directories (?:are|exist) in (?:the )?repository$", _I),
    re.compile(r"^what folders (?:are|exist) in (?:the )?repository$", _I),
    re.compile(r"^list (?:the )?directories$", _I),
    re.compile(r"^list (?:the )?folders$", _I),
)

# The negative lookahead is load-bearing, not decorative: without it,
# "List the files in frontend" can match here with the optional "(?:the
# )?" article left un-consumed and "the" itself captured as `language`
# -- a real bug live-verified during Task 67's own testing (it silently
# turned a legitimate directory listing into a filtered-by-nonexistent-
# language query that always resolves to "not found"). Excluding common
# articles from ever being read as a language name is what forces the
# match to correctly fail here and fall through to the plain
# (unfiltered) _LIST_DIR_PATTERNS below instead.
_NOT_AN_ARTICLE = r"(?!(?:the|a|an)\b)"
_LANG_GROUP = rf"{_NOT_AN_ARTICLE}(?P<language>\w+)"
_PATH_TAIL = rf"(?:the )?(?P<path>.+?){_DIR_SUFFIX}$"

_LIST_DIR_FILTERED_PATTERNS = (
    re.compile(rf"^list (?:the )?{_LANG_GROUP} files in {_PATH_TAIL}", _I),
    re.compile(rf"^show (?:me )?(?:the )?{_LANG_GROUP} files in {_PATH_TAIL}", _I),
    re.compile(rf"^what {_LANG_GROUP} files (?:are|exist) in {_PATH_TAIL}", _I),
)

_LIST_DIR_PATTERNS = (
    re.compile(rf"^what files (?:are|exist) in (?:the )?(?P<path>.+?){_DIR_SUFFIX}$", _I),
    re.compile(rf"^what are the files in (?:the )?(?P<path>.+?){_DIR_SUFFIX}$", _I),
    re.compile(rf"^list (?:the )?files in (?:the )?(?P<path>.+?){_DIR_SUFFIX}$", _I),
    re.compile(
        rf"^show (?:me )?(?:the )?files (?:in|under) (?:the )?(?P<path>.+?){_DIR_SUFFIX}$", _I
    ),
    re.compile(rf"^what'?s inside (?:the )?(?P<path>.+?){_DIR_SUFFIX}$", _I),
    re.compile(rf"^what is inside (?:the )?(?P<path>.+?){_DIR_SUFFIX}$", _I),
)

_DOES_EXIST_PATTERNS = (
    re.compile(r"^does (?P<path>.+?) exist$", _I),
    re.compile(r"^does (?P<path>.+?) exist in (?:the )?repository$", _I),
    re.compile(r"^is (?P<path>.+?) in (?:the )?repository$", _I),
)

_FILE_LOCATION_PATTERNS = (
    re.compile(r"^where is (?P<path>.+)$", _I),
    re.compile(r"^where'?s (?P<path>.+)$", _I),
)

_SYMBOL_IN_FILE_PATTERN = re.compile(r"^is (?P<subject>.+?) in (?P<target>.+)$", _I)

_LANGUAGE_ALIASES = {
    "py": "python",
    "js": "javascript",
    "jsx": "javascript",
    "ts": "typescript",
    "tsx": "typescript",
}

# Real path/filename/symbol candidates never contain whitespace -- a
# conceptual phrase captured by an over-eager regex group always does
# ("that implemented", "the maze algorithm"). This single check is what
# keeps every pattern above conservative without an exhaustive blocklist.
_PATH_SHAPE = re.compile(r"^[\w][\w\-./]*$")
_SYMBOL_SHAPE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(?:\(\))?$")


def detect_structure_intent(query: str) -> StructureIntent | None:
    """Returns a :class:`StructureIntent` if ``query`` is a deterministic
    repository-structure question, else ``None`` (always fall through to
    the existing RAG pipeline)."""
    normalized = _normalize(query)
    lowered = normalized.lower()
    if not normalized or any(word in lowered for word in _CONCEPTUAL_VETO_WORDS):
        return None

    for pattern in _LIST_ROOT_PATTERNS:
        if pattern.match(normalized):
            return StructureIntent(kind=StructureIntentKind.LIST_DIRECTORY, path=None)

    for pattern in _LIST_DIRECTORIES_PATTERNS:
        if pattern.match(normalized):
            return StructureIntent(kind=StructureIntentKind.LIST_DIRECTORIES)

    for pattern in _LIST_DIR_FILTERED_PATTERNS:
        match = pattern.match(normalized)
        if match:
            path = _clean_path(match.group("path"))
            language_raw = match.group("language").lower()
            language = _LANGUAGE_ALIASES.get(language_raw, language_raw)
            if path and _PATH_SHAPE.match(path):
                return StructureIntent(
                    kind=StructureIntentKind.LIST_DIRECTORY, path=path, language=language
                )

    for pattern in _LIST_DIR_PATTERNS:
        match = pattern.match(normalized)
        if match:
            path = _clean_path(match.group("path"))
            if path and _PATH_SHAPE.match(path):
                return StructureIntent(kind=StructureIntentKind.LIST_DIRECTORY, path=path)

    symbol_match = _SYMBOL_IN_FILE_PATTERN.match(normalized)
    if symbol_match:
        subject = symbol_match.group("subject").strip()
        target = _clean_path(symbol_match.group("target"))
        if (
            target.lower() not in {"the repository", "repository"}
            and _PATH_SHAPE.match(target)
            and "." in target.split("/")[-1]
            and _SYMBOL_SHAPE.match(subject)
        ):
            return StructureIntent(
                kind=StructureIntentKind.SYMBOL_IN_FILE,
                path=target,
                symbol=subject.rstrip("()"),
            )

    for pattern in _DOES_EXIST_PATTERNS:
        match = pattern.match(normalized)
        if not match:
            continue
        path = _clean_path(match.group("path"))
        if not path:
            continue
        is_directory_query = False
        for suffix in (" directory", " folder"):
            if path.lower().endswith(suffix):
                path = path[: -len(suffix)].strip()
                is_directory_query = True
                break
        if not path or not _PATH_SHAPE.match(path):
            continue
        kind = (
            StructureIntentKind.DIRECTORY_EXISTS
            if is_directory_query
            else StructureIntentKind.FILE_EXISTS
        )
        return StructureIntent(kind=kind, path=path)

    for pattern in _FILE_LOCATION_PATTERNS:
        match = pattern.match(normalized)
        if match:
            path = _clean_path(match.group("path"))
            if path and _PATH_SHAPE.match(path) and "." in path.split("/")[-1]:
                return StructureIntent(kind=StructureIntentKind.FILE_LOCATION, path=path)

    return None


def _normalize(query: str) -> str:
    """Whitespace/punctuation normalization only -- casing is
    deliberately preserved (patterns match case-insensitively via
    ``re.IGNORECASE``) so a captured symbol like ``solveMaze`` or a
    path's real casing survives into the returned :class:`StructureIntent`
    unchanged."""
    stripped = query.strip().rstrip("?.! ").strip()
    return re.sub(r"\s+", " ", stripped)


def _clean_path(raw: str) -> str:
    """Strips a trailing slash and normalizes Windows-style separators --
    ``backend/``, ``backend\\``, and ``backend`` must all resolve the same
    way (Task 67 §path normalization)."""
    cleaned = raw.strip().replace("\\", "/")
    return cleaned.rstrip("/")
