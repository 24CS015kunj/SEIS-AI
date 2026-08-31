"""Unit tests for app/core/retrieval/structure_intent.py (Task 67).

Pure/deterministic -- no fakes needed.
"""

from __future__ import annotations

from app.core.retrieval.structure_intent import (
    StructureIntentKind,
    detect_structure_intent,
)


# ---------------------------------------------------------------------------
# 1. Directory listing
# ---------------------------------------------------------------------------
def test_what_files_are_in_backend() -> None:
    intent = detect_structure_intent("What files are in backend?")
    assert intent is not None
    assert intent.kind == StructureIntentKind.LIST_DIRECTORY
    assert intent.path == "backend"


def test_list_files_in_backend_with_trailing_slash() -> None:
    intent = detect_structure_intent("List files in backend/")
    assert intent is not None
    assert intent.kind == StructureIntentKind.LIST_DIRECTORY
    assert intent.path == "backend"


def test_whats_inside_the_frontend_directory() -> None:
    intent = detect_structure_intent("What is inside the frontend directory?")
    assert intent is not None
    assert intent.kind == StructureIntentKind.LIST_DIRECTORY
    assert intent.path == "frontend"


def test_show_me_the_files_under_backend() -> None:
    intent = detect_structure_intent("Show me the files under backend")
    assert intent is not None
    assert intent.kind == StructureIntentKind.LIST_DIRECTORY
    assert intent.path == "backend"


# ---------------------------------------------------------------------------
# 2. Root directory listing
# ---------------------------------------------------------------------------
def test_what_files_are_in_the_root() -> None:
    intent = detect_structure_intent("What files are in the root?")
    assert intent is not None
    assert intent.kind == StructureIntentKind.LIST_DIRECTORY
    assert intent.path is None


def test_what_directories_are_in_the_repository() -> None:
    intent = detect_structure_intent("What directories are in the repository?")
    assert intent is not None
    assert intent.kind == StructureIntentKind.LIST_DIRECTORIES


# ---------------------------------------------------------------------------
# 3. Nested directory listing
# ---------------------------------------------------------------------------
def test_nested_directory_path_is_preserved() -> None:
    intent = detect_structure_intent("What files are in backend/utils?")
    assert intent is not None
    assert intent.path == "backend/utils"


# ---------------------------------------------------------------------------
# 4. File existence
# ---------------------------------------------------------------------------
def test_does_backend_maze_py_exist() -> None:
    intent = detect_structure_intent("Does backend/maze.py exist?")
    assert intent is not None
    assert intent.kind == StructureIntentKind.FILE_EXISTS
    assert intent.path == "backend/maze.py"


def test_is_maze_py_in_the_repository() -> None:
    intent = detect_structure_intent("Is maze.py in the repository?")
    assert intent is not None
    assert intent.kind == StructureIntentKind.FILE_EXISTS
    assert intent.path == "maze.py"


# ---------------------------------------------------------------------------
# 5. File location
# ---------------------------------------------------------------------------
def test_where_is_maze_py() -> None:
    intent = detect_structure_intent("Where is maze.py?")
    assert intent is not None
    assert intent.kind == StructureIntentKind.FILE_LOCATION
    assert intent.path == "maze.py"


def test_where_is_app_py() -> None:
    intent = detect_structure_intent("Where is app.py?")
    assert intent is not None
    assert intent.kind == StructureIntentKind.FILE_LOCATION
    assert intent.path == "app.py"


# ---------------------------------------------------------------------------
# 6. Directory existence
# ---------------------------------------------------------------------------
def test_does_backend_directory_exist() -> None:
    intent = detect_structure_intent("Does backend directory exist?")
    assert intent is not None
    assert intent.kind == StructureIntentKind.DIRECTORY_EXISTS
    assert intent.path == "backend"


# ---------------------------------------------------------------------------
# 7. Extension/language-filtered listing
# ---------------------------------------------------------------------------
def test_list_the_python_files_in_backend() -> None:
    intent = detect_structure_intent("List the Python files in backend/")
    assert intent is not None
    assert intent.kind == StructureIntentKind.LIST_DIRECTORY
    assert intent.path == "backend"
    assert intent.language == "python"


def test_show_javascript_files_in_frontend() -> None:
    intent = detect_structure_intent("Show JavaScript files in frontend/")
    assert intent is not None
    assert intent.path == "frontend"
    assert intent.language == "javascript"


def test_py_alias_normalizes_to_python() -> None:
    intent = detect_structure_intent("List py files in backend")
    assert intent is not None
    assert intent.language == "python"


# ---------------------------------------------------------------------------
# Regression: "List the files in X" (unfiltered, but starts with "list
# the") must never be misread as a filtered listing with "the" captured
# as the language -- live-discovered during Task 67's own verification.
# ---------------------------------------------------------------------------
def test_list_the_files_in_frontend_is_an_unfiltered_listing_not_language_the() -> None:
    intent = detect_structure_intent("List the files in frontend.")
    assert intent is not None
    assert intent.kind == StructureIntentKind.LIST_DIRECTORY
    assert intent.path == "frontend"
    assert intent.language is None


def test_show_the_files_in_backend_is_unfiltered() -> None:
    intent = detect_structure_intent("Show the files in backend")
    assert intent is not None
    assert intent.language is None
    assert intent.path == "backend"


# ---------------------------------------------------------------------------
# Symbol-in-file
# ---------------------------------------------------------------------------
def test_is_solvemaze_in_frontend_app_js() -> None:
    intent = detect_structure_intent("Is solveMaze() in frontend/app.js?")
    assert intent is not None
    assert intent.kind == StructureIntentKind.SYMBOL_IN_FILE
    assert intent.path == "frontend/app.js"
    assert intent.symbol == "solveMaze"


# ---------------------------------------------------------------------------
# 10-11. Ambiguous / conceptual questions fall back to RAG (None)
# ---------------------------------------------------------------------------
def test_what_does_backend_do_is_not_a_directory_listing() -> None:
    assert detect_structure_intent("What does backend do?") is None


def test_what_is_the_backend_is_not_a_structure_question() -> None:
    assert detect_structure_intent("What is the backend?") is None


def test_explain_the_files_in_backend_falls_back_to_rag() -> None:
    assert detect_structure_intent("Explain the files in backend") is None


def test_explain_every_file_in_backend_falls_back_to_rag() -> None:
    assert detect_structure_intent("Explain every file in backend") is None


def test_what_does_maze_py_do_falls_back_to_rag() -> None:
    """A content question naming a file must NOT be treated as a
    deterministic lookup -- it needs RAG (Task 67's own explicit example)."""
    assert detect_structure_intent("What does maze.py do?") is None


def test_what_does_backend_maze_py_do_falls_back_to_rag() -> None:
    assert detect_structure_intent("What does backend/maze.py do?") is None


def test_explain_how_the_maze_algorithm_works_falls_back_to_rag() -> None:
    assert detect_structure_intent("Explain how the maze algorithm works") is None


def test_how_does_bfs_work_falls_back_to_rag() -> None:
    assert detect_structure_intent("How does BFS work?") is None


def test_billing_question_falls_back_to_rag() -> None:
    assert detect_structure_intent("What is the billing/pricing?") is None


def test_task_66_where_is_that_implemented_still_falls_back_to_rag() -> None:
    """Critical regression guard: this exact phrase is Task 66's own
    conversation-reference example and must keep using query rewriting +
    RAG, never be misread as a literal FILE_LOCATION lookup for a file
    named "that implemented"."""
    assert detect_structure_intent("Where is that implemented?") is None


def test_where_is_it_implemented_still_falls_back_to_rag() -> None:
    assert detect_structure_intent("Where is it implemented?") is None


def test_where_is_bfs_implemented_falls_back_to_rag() -> None:
    """Names a concrete symbol but not a filename -- "BFS implemented"
    has no dot-extension shape, so this remains a RAG question (real
    symbol lookup goes through hybrid retrieval, not this module)."""
    assert detect_structure_intent("Where is BFS implemented?") is None


# ---------------------------------------------------------------------------
# 15-17. Path normalization
# ---------------------------------------------------------------------------
def test_trailing_slash_is_stripped() -> None:
    a = detect_structure_intent("What files are in backend/?")
    b = detect_structure_intent("What files are in backend?")
    assert a is not None and b is not None
    assert a.path == b.path == "backend"


def test_windows_style_backslash_is_normalized() -> None:
    intent = detect_structure_intent("Does backend\\maze.py exist?")
    assert intent is not None
    assert intent.path == "backend/maze.py"


def test_extra_whitespace_is_normalized() -> None:
    intent = detect_structure_intent("What   files are   in backend?")
    assert intent is not None
    assert intent.path == "backend"


# ---------------------------------------------------------------------------
# Case-insensitivity of the phrasing itself (actual path-vs-real-data
# case handling is RepositoryStructureService's job, tested separately)
# ---------------------------------------------------------------------------
def test_detection_is_case_insensitive() -> None:
    intent = detect_structure_intent("WHAT FILES ARE IN BACKEND?")
    assert intent is not None
    assert intent.kind == StructureIntentKind.LIST_DIRECTORY
