"""Retrieval Query Rewriter (Task 66).

Task 65 wired real conversation history into ``PromptBuilder``, but
retrieval (``VectorRetriever``/``LexicalRetriever``) still only ever saw
``request.message`` verbatim -- a follow-up like "Where is that
implemented?" carries no retrievable signal on its own, even though the
LLM can resolve "that" from history once it reaches the prompt. This
module is the fix: it builds a self-contained *retrieval* query from the
current question plus recent history, used only for retrieval/reranking
-- the original question still reaches ``PromptBuilder`` unchanged (see
``RepositoryChatService.chat``), so the model's own conversational
understanding is untouched; only what gets *retrieved* improves.

Deterministic, not LLM-based (Task 66's own explicit design constraint):
an extra NVIDIA call just to rewrite a query would double generation
latency/cost on every single turn and add a second failure mode to a
pipeline that has already seen live NVIDIA timeouts (Tasks 60-61) -- for
a bounded, low-stakes text transform like this, a local heuristic is a
safer trade than a second network round-trip on the critical path of
every chat turn. This mirrors ``RAGOptimizer.expand_query``'s own
precedent (module docstring, Task 24): query variants are already
produced by cheap deterministic heuristics elsewhere in this exact
pipeline, not an LLM call.

Reference detection (§Rewriting Rules 1-2): a fixed, conservative list of
conversational-reference words/phrases (``it``, ``this``, ``that``,
``they``, ``them``, ``there``, ``here``, and multi-word phrases like
``the implementation``). A query matching none of these is already
self-contained and is returned unchanged -- this is also what correctly
leaves an off-topic question (e.g. a billing/pricing question with no
repository entities and no reference words) untouched: nothing here
attaches repository history to a query that never asked for it.

Entity extraction (§Rule 3-4): scans the most recent history messages
(most recent first) for filename tokens (``word.ext``) and code-shaped
identifiers (``snake_case`` or ``camelCase``) -- the same *shape* of
entity :func:`app.core.retrieval.lexical_retriever.extract_lexical_terms`
recognizes, but deliberately **stricter**: this module never accepts a
bare lowercase English word the way that function does. Lexical
retrieval can afford that looseness because the reranker filters false
positives out afterward (its own module docstring: "the reranker
remains the authoritative relevance-ranking stage"); a query rewrite has
no such downstream filter, so appending an ordinary word like "project"
or "there" here would just add noise to every retrieval call. A term
only ever enters the rewritten query if it already literally appeared in
a prior turn's real text **and** is unambiguously code/file-shaped.
Nothing is invented: if a reference is detected but no such entity
exists in recent history, the rewrite is judged unsafe (§Rule 5) and the
original query is used unchanged.

Repository/conversation isolation (§Rule 7): this module takes no
``repository_id`` or ``conversation_id`` at all -- it operates purely on
the ``history: list[ChatMessage]`` it is handed, which is already scoped
correctly by :meth:`ConversationStore.load_history` before it ever
reaches here (Task 65's own key-per-repository-per-conversation
isolation). There is structurally no way for this module to reach into
another repository's or conversation's data; it never looks anything up
itself.

Bounding (§Rule 8): scans at most the last ``_MAX_HISTORY_MESSAGES_SCANNED``
messages (3 turns) and appends at most ``_MAX_ENTITIES`` terms, with a
hard ``_MAX_QUERY_LENGTH`` character cap on the result -- the rewritten
query is always a small, bounded addition to the original question, never
a history dump.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import structlog

from app.domain.models import ChatMessage

logger = structlog.get_logger("seis.core.retrieval")

# How far back to look for concrete entities. 3 turns (6 messages) --
# "recent" conversation context, not the whole (already capped at 12
# messages by ConversationStore) history.
_MAX_HISTORY_MESSAGES_SCANNED = 6
_MAX_ENTITIES = 5
_MAX_QUERY_LENGTH = 300

_BARE_REFERENCE_WORDS = frozenset({"it", "this", "that", "they", "them", "there", "here"})
_REFERENCE_PHRASES = (
    "this function",
    "that function",
    "this file",
    "that file",
    "this class",
    "that class",
    "the function",
    "the file",
    "the implementation",
    "where is it",
    "where is that implemented",
)

_WORD_TOKEN = re.compile(r"\b[a-zA-Z]+\b")

# Entity-shape patterns -- see module docstring's "Entity extraction"
# section for why these are deliberately stricter than
# lexical_retriever.extract_lexical_terms's own patterns (no bare-word
# fallback here). Filename base must start with a letter/underscore
# (unlike lexical_retriever's own equivalent pattern) so a plain decimal
# number in prose -- e.g. "wall_probability (default 0.3)" -- is never
# misread as a filename; live-verified during Task 66's own testing that
# omitting this let "0.3"/"1.0" leak into a rewritten query.
_FILENAME_TOKEN = re.compile(r"\b[A-Za-z_][\w\-]*\.[A-Za-z0-9]{1,10}\b")
_FUNCTION_CALL_TOKEN = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*)\s*\(\)")
_CAMEL_CASE_BOUNDARY = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")
_IDENTIFIER_TOKEN = re.compile(r"\b[A-Za-z_][A-Za-z0-9_]*\b")


@dataclass(frozen=True)
class RewrittenQuery:
    """Result of a rewrite attempt -- always has a usable ``text``, plus
    ``rewritten`` so the caller can log/observe whether anything changed."""

    text: str
    rewritten: bool


class QueryRewriter:
    """Builds a self-contained retrieval query from the current question
    and recent conversation history (Task 66). Deterministic, no I/O, no
    LLM call -- see module docstring.
    """

    def __init__(self) -> None:
        self._log = logger.bind(component="query_rewriter")

    def rewrite(self, query: str, history: list[ChatMessage]) -> RewrittenQuery:
        """Returns a retrieval-ready query: ``query`` unchanged unless it
        contains an unresolved conversational reference AND recent
        history contains a concrete entity to resolve it with.
        """
        if not history or not _has_reference(query):
            return RewrittenQuery(text=query, rewritten=False)

        entities = _recent_entities(history)
        if not entities:
            # A reference was detected but nothing safe to resolve it
            # with exists in recent history (§Rule 5) -- never guess.
            return RewrittenQuery(text=query, rewritten=False)

        rewritten_text = f"{query} {' '.join(entities)}".strip()[:_MAX_QUERY_LENGTH]
        return RewrittenQuery(text=rewritten_text, rewritten=True)


def _has_reference(query: str) -> bool:
    lowered = query.lower()
    if any(phrase in lowered for phrase in _REFERENCE_PHRASES):
        return True
    words = {match.group(0) for match in _WORD_TOKEN.finditer(lowered)}
    return bool(words & _BARE_REFERENCE_WORDS)


def _extract_concrete_entities(text: str) -> list[str]:
    """Filenames and code-shaped identifiers only -- never a bare English
    word. Order-preserving, deduplicated. See module docstring."""
    found: list[str] = []

    for match in _FILENAME_TOKEN.finditer(text):
        found.append(match.group(0))

    for match in _FUNCTION_CALL_TOKEN.finditer(text):
        found.append(match.group(1))

    for match in _IDENTIFIER_TOKEN.finditer(text):
        word = match.group(0)
        if "_" in word or _CAMEL_CASE_BOUNDARY.search(word):
            found.append(word)

    return list(dict.fromkeys(found))


def _recent_entities(history: list[ChatMessage]) -> list[str]:
    recent = history[-_MAX_HISTORY_MESSAGES_SCANNED:]
    entities: list[str] = []
    for message in reversed(recent):
        for term in _extract_concrete_entities(message.content):
            if term not in entities:
                entities.append(term)
        if len(entities) >= _MAX_ENTITIES:
            break
    return entities[:_MAX_ENTITIES]
