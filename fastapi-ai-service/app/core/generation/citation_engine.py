"""Citation Engine & Grounding Validator.

Task 23 (Phase 4, follows Task 22): parses inline citation tags out of a
generated chat answer and cross-references each one against Task 21's
numeric ``citation_map`` (``ContextBlock.citation_map``) before trusting
it (§5.7). An LLM can produce a citation number that looks plausible but
was never actually retrieved -- this module is the only place that
converts "the model said [3]" into "chunk 3 is a real, retrieved source"
or rejects the claim.

Tag format reconciliation: the Phase 4 spec text mentions two possible
citation tag shapes, ``[1]`` and ``[file:path]``. The Grounded Prompt
Builder's (Task 22) system prompt only ever instructs the model to use
the first form -- the bracketed number matching a context-block header
(``[1] File: ...``) -- so that is the only shape this module parses.
Bracketed text that isn't purely digits (e.g. a markdown link
``[label](url)`` or a literal ``[file:auth.py]``) is left untouched: it
was never a citation tag this system produces, so treating it as one
would be guessing at a format nothing in this codebase emits.

Best Practices ("strip invalid citation tags from user-facing text if
validation fails"): only *invalid* tags -- ones whose number isn't a key
in ``citation_map`` -- are removed from the returned text, along with
one immediately-preceding space so removal doesn't leave a stray double
space. Valid tags are left exactly as the model wrote them; they are the
inline markers a UI renders as clickable citations.

Flagging ungrounded responses (subtask 4): the frozen return type is
``tuple[str, list[Citation]]`` -- there is no separate boolean channel
to carry a "this answer is ungrounded" signal to the caller. Consistent
with every other module in this codebase (e.g. Task 21's ``truncated``
outcome, Task 12's rate-limit outcome), "flagging" here means a
structured log event a caller or dashboard can act on, not a return
value: an answer that cites nothing valid produces a distinct log event
from one that cites nothing at all, since a fabricated citation number
is a more actionable signal than a citation-free answer (which may
simply be the model's honest "I do not know" response, Task 22's
``NO_ANSWER_PHRASE``).

Dependencies: ``app.domain`` only (per Task 23's own spec) -- reuses the
frozen Task 7 ``Citation`` model as its output DTO rather than inventing
a duplicate shape.
"""

from __future__ import annotations

import re

import structlog

from app.domain.models import Citation

logger = structlog.get_logger("seis.core.generation")

# Captures an optional single leading space so an invalid tag's removal
# doesn't leave a stray double space behind; valid tags are re-emitted
# with that same leading space untouched (see _replace below).
_CITATION_TAG_PATTERN = re.compile(r"\s?\[(\d+)\]")


class CitationEngine:
    """Extracts and validates inline citation tags in a chat answer (Task 23, §5.7)."""

    def __init__(self) -> None:
        self._log = logger.bind(component="citation_engine")

    def extract_citations(
        self,
        llm_response: str,
        citation_map: dict[int, Citation],
    ) -> tuple[str, list[Citation]]:
        """Parses every ``[N]`` tag in ``llm_response``, validates each
        against ``citation_map``, strips invalid tags from the text, and
        returns ``(cleaned_text, validated_citations)``.

        ``validated_citations`` lists each distinct valid index's
        :class:`Citation` once, in the order it first appears in the
        response -- a citation repeated later in the answer is not
        duplicated in the output list, though every occurrence of its
        tag is left in the text.
        """
        valid_citations: list[Citation] = []
        seen_valid_indices: set[int] = set()
        invalid_indices: set[int] = set()

        def _replace(match: re.Match[str]) -> str:
            index = int(match.group(1))
            if index in citation_map:
                if index not in seen_valid_indices:
                    seen_valid_indices.add(index)
                    valid_citations.append(citation_map[index])
                return match.group(0)
            invalid_indices.add(index)
            return ""

        cleaned_text = _CITATION_TAG_PATTERN.sub(_replace, llm_response)

        self._log_outcome(seen_valid_indices, invalid_indices)
        return cleaned_text, valid_citations

    def _log_outcome(self, valid_indices: set[int], invalid_indices: set[int]) -> None:
        if not valid_indices and not invalid_indices:
            self._log.info("citation_engine.no_citations_found")
        elif not valid_indices:
            self._log.warning(
                "citation_engine.response_ungrounded",
                invalid_indices=sorted(invalid_indices),
            )
        elif invalid_indices:
            self._log.warning(
                "citation_engine.invalid_citations_stripped",
                invalid_indices=sorted(invalid_indices),
                valid_indices=sorted(valid_indices),
            )
        else:
            self._log.info(
                "citation_engine.citations_validated",
                valid_indices=sorted(valid_indices),
            )
