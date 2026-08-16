"""Unit tests for app/core/retrieval/metadata_filter.py (Task 20)."""

from __future__ import annotations

import pytest

from app.core.retrieval.metadata_filter import MetadataFilterBuilder
from app.domain.exceptions import DomainValidationError


def test_build_scope_filter_with_no_document_types_returns_bare_repository_clause() -> None:
    result = MetadataFilterBuilder.build_scope_filter("ws-1", "repo-1")

    assert result == {"repository_id": "repo-1"}


def test_build_scope_filter_with_document_types_returns_and_clause() -> None:
    result = MetadataFilterBuilder.build_scope_filter(
        "ws-1", "repo-1", document_types=["source_code", "markdown_doc"]
    )

    assert result == {
        "$and": [
            {"repository_id": "repo-1"},
            {"document_type": {"$in": ["source_code", "markdown_doc"]}},
        ]
    }


def test_build_scope_filter_with_empty_document_types_list_returns_bare_repository_clause() -> None:
    result = MetadataFilterBuilder.build_scope_filter("ws-1", "repo-1", document_types=[])

    assert result == {"repository_id": "repo-1"}


def test_build_scope_filter_never_includes_a_workspace_id_key() -> None:
    """Regression test locking in the documented reconciliation: Chroma
    metadata never stores workspace_id, so a where-clause key for it
    would silently match zero results on every real query."""
    result = MetadataFilterBuilder.build_scope_filter(
        "ws-1", "repo-1", document_types=["source_code"]
    )

    flattened = str(result)
    assert "workspace_id" not in flattened


@pytest.mark.parametrize("workspace_id", ["", "   "])
def test_empty_or_blank_workspace_id_raises(workspace_id: str) -> None:
    with pytest.raises(DomainValidationError):
        MetadataFilterBuilder.build_scope_filter(workspace_id, "repo-1")


@pytest.mark.parametrize("repository_id", ["", "   "])
def test_empty_or_blank_repository_id_raises(repository_id: str) -> None:
    with pytest.raises(DomainValidationError):
        MetadataFilterBuilder.build_scope_filter("ws-1", repository_id)


def test_unknown_document_type_raises_domain_validation_error() -> None:
    with pytest.raises(DomainValidationError):
        MetadataFilterBuilder.build_scope_filter("ws-1", "repo-1", document_types=["not_a_type"])


def test_missing_repository_id_error_details_include_workspace_id_for_debugging() -> None:
    with pytest.raises(DomainValidationError) as exc_info:
        MetadataFilterBuilder.build_scope_filter("ws-1", "")

    assert exc_info.value.details["workspace_id"] == "ws-1"
