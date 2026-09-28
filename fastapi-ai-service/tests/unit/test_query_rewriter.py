"""Unit tests for app/core/retrieval/query_rewriter.py (Task 66).

Pure/deterministic -- no stubs or fakes needed, just ChatMessage input.
"""

from __future__ import annotations

from app.core.retrieval.query_rewriter import _MAX_QUERY_LENGTH, QueryRewriter
from app.domain.enums import ConversationRole
from app.domain.models import ChatMessage


def _msg(role: ConversationRole, content: str) -> ChatMessage:
    return ChatMessage(role=role, content=content)


def _history(*pairs: tuple[str, str]) -> list[ChatMessage]:
    """Builds alternating user/assistant history from (user, assistant) pairs."""
    messages: list[ChatMessage] = []
    for user_content, assistant_content in pairs:
        messages.append(_msg(ConversationRole.USER, user_content))
        messages.append(_msg(ConversationRole.ASSISTANT, assistant_content))
    return messages


# ---------------------------------------------------------------------------
# 1. Self-contained question remains unchanged
# ---------------------------------------------------------------------------
def test_self_contained_question_remains_unchanged() -> None:
    history = _history(("What does maze.py do?", "maze.py generates and solves mazes."))
    result = QueryRewriter().rewrite("What files are in the backend directory?", history)

    assert result.text == "What files are in the backend directory?"
    assert result.rewritten is False


def test_example_4_no_history_needed_stays_unchanged() -> None:
    result = QueryRewriter().rewrite("What does maze.py do?", [])

    assert result.text == "What does maze.py do?"
    assert result.rewritten is False


def test_example_3_already_specific_question_is_not_rewritten() -> None:
    """'Where is BFS implemented?' already names BFS -- no reference word,
    so it must not be unnecessarily rewritten even with relevant history."""
    history = _history(
        ("What algorithms are implemented in maze.py?", "BFS, DFS and A* are implemented.")
    )
    result = QueryRewriter().rewrite("Where is BFS implemented?", history)

    assert result.text == "Where is BFS implemented?"
    assert result.rewritten is False


# ---------------------------------------------------------------------------
# 2-4. Reference resolution via history
# ---------------------------------------------------------------------------
def test_where_is_it_implemented_resolves_using_previous_turn() -> None:
    history = _history(
        ("What does maze.py do?", "maze.py contains generate_random_maze and bfs_solve.")
    )
    result = QueryRewriter().rewrite("Where is that implemented?", history)

    assert result.rewritten is True
    assert "maze.py" in result.text
    assert result.text.startswith("Where is that implemented?")


def test_what_does_it_do_resolves_to_previous_referenced_file() -> None:
    history = _history(("Where is bfs_solve implemented?", "It's implemented in backend/maze.py."))
    result = QueryRewriter().rewrite("What does it do?", history)

    assert result.rewritten is True
    assert "maze.py" in result.text


def test_where_is_that_function_resolves_correctly() -> None:
    history = _history(("What does solveMaze() do?", "solveMaze() sends a request to /solve."))
    result = QueryRewriter().rewrite("Where is that function?", history)

    assert result.rewritten is True
    assert "solveMaze" in result.text


# ---------------------------------------------------------------------------
# 5-6. Concrete entities preserved
# ---------------------------------------------------------------------------
def test_function_name_reference_is_preserved() -> None:
    history = _history(("What does solveMaze() do?", "solveMaze() runs in frontend/app.js."))
    result = QueryRewriter().rewrite("Where is it implemented?", history)

    assert "solveMaze" in result.text


def test_filename_reference_is_preserved() -> None:
    history = _history(("What does maze.py do?", "maze.py generates and solves mazes."))
    result = QueryRewriter().rewrite("Where is that implemented?", history)

    assert "maze.py" in result.text


# ---------------------------------------------------------------------------
# 7. Multi-turn history uses the most relevant (most recent) context
# ---------------------------------------------------------------------------
def test_multi_turn_history_prefers_the_most_recent_entity() -> None:
    history = _history(
        ("What does maze.py do?", "maze.py generates mazes."),
        ("What does solveMaze() do?", "solveMaze() runs in frontend/app.js."),
    )
    result = QueryRewriter().rewrite("Where is it implemented?", history)

    assert result.rewritten is True
    # The most recent turn's entity (solveMaze) must appear before the
    # older turn's entity (maze.py) in the rewritten query.
    assert result.text.index("solveMaze") < result.text.index("maze.py")


# ---------------------------------------------------------------------------
# 8-9. Missing / empty / invalid history -> original query
# ---------------------------------------------------------------------------
def test_empty_history_returns_original_query() -> None:
    result = QueryRewriter().rewrite("Where is that implemented?", [])

    assert result.text == "Where is that implemented?"
    assert result.rewritten is False


def test_history_with_no_extractable_entities_returns_original_query() -> None:
    """History exists and is about the repository, but contains nothing
    filename/symbol-shaped -- an unresolved reference must fall back to
    the original query rather than guessing."""
    history = _history(("What is this repository about?", "It is a maze solving project."))
    result = QueryRewriter().rewrite("Where is that implemented?", history)

    assert result.text == "Where is that implemented?"
    assert result.rewritten is False


# ---------------------------------------------------------------------------
# 10. Ambiguous reference that cannot be safely resolved -> original query
# ---------------------------------------------------------------------------
def test_ambiguous_reference_with_unhelpful_history_is_not_rewritten() -> None:
    history = _history(("Hello", "Hi there, how can I help?"))
    result = QueryRewriter().rewrite("What does it do?", history)

    assert result.text == "What does it do?"
    assert result.rewritten is False


# ---------------------------------------------------------------------------
# 11. Off-topic question is not contaminated by repository history
# ---------------------------------------------------------------------------
def test_off_topic_question_is_not_contaminated_by_repository_history() -> None:
    history = _history(("What does maze.py do?", "maze.py generates and solves mazes."))
    result = QueryRewriter().rewrite("What is the billing/pricing?", history)

    assert result.text == "What is the billing/pricing?"
    assert result.rewritten is False
    assert "maze.py" not in result.text


# ---------------------------------------------------------------------------
# 12. No invented filename/function/class
# ---------------------------------------------------------------------------
def test_no_entity_is_invented_beyond_what_history_actually_contains() -> None:
    history = _history(("What does maze.py do?", "maze.py generates and solves mazes."))
    result = QueryRewriter().rewrite("Where is that implemented?", history)

    # Only entities that literally appeared in history may appear --
    # nothing named "solver.py"/"MazeSolver" etc. was ever said, so it
    # must never appear here.
    assert "solver.py" not in result.text
    assert "MazeSolver" not in result.text


# ---------------------------------------------------------------------------
# 13. Query length remains bounded
# ---------------------------------------------------------------------------
def test_query_length_remains_bounded_even_with_many_entities() -> None:
    long_answer = " ".join(f"file_{i}.py" for i in range(50))
    history = _history(("What files exist?", long_answer))
    result = QueryRewriter().rewrite("Where is that implemented?", history)

    assert len(result.text) <= _MAX_QUERY_LENGTH


# ---------------------------------------------------------------------------
# Regression: a plain decimal number in prose must never be misread as a
# filename (live-discovered during Task 66's own verification -- see the
# _FILENAME_TOKEN comment in query_rewriter.py).
# ---------------------------------------------------------------------------
def test_decimal_numbers_in_history_are_never_treated_as_filenames() -> None:
    history = _history(
        (
            "What does maze.py do?",
            "It takes wall_probability (default 0.3) in the range [0.0, 1.0).",
        )
    )
    result = QueryRewriter().rewrite("Where is that implemented?", history)

    assert "0.3" not in result.text
    assert "0.0" not in result.text
    assert "1.0" not in result.text
    assert "maze.py" in result.text


# ---------------------------------------------------------------------------
# 14. Repository ID is never taken from conversation history
# ---------------------------------------------------------------------------
def test_rewriter_has_no_repository_or_conversation_id_parameter() -> None:
    """Structural isolation guarantee (Task 66 §Rule 7): QueryRewriter
    never accepts a repository_id/conversation_id -- it can only ever see
    the history list ConversationStore already scoped correctly."""
    import inspect

    signature = inspect.signature(QueryRewriter.rewrite)
    assert "repository_id" not in signature.parameters
    assert "conversation_id" not in signature.parameters


# ---------------------------------------------------------------------------
# Reference-word detection edge cases
# ---------------------------------------------------------------------------
def test_bare_the_does_not_trigger_a_rewrite() -> None:
    """'the' alone (not 'the function'/'the file'/'the implementation')
    is too common to safely treat as a conversational reference."""
    history = _history(("What does maze.py do?", "maze.py generates and solves mazes."))
    result = QueryRewriter().rewrite("What does the maze algorithm do?", history)

    assert result.rewritten is False


def test_the_implementation_phrase_triggers_a_rewrite() -> None:
    history = _history(("What does maze.py do?", "maze.py generates and solves mazes."))
    result = QueryRewriter().rewrite("Show me the implementation.", history)

    assert result.rewritten is True
    assert "maze.py" in result.text
