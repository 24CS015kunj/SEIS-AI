"""Unit tests for app/core/evolution/commit_impact_analyzer.py (Task #4)."""

from __future__ import annotations

from app.core.evolution.commit_impact_analyzer import CommitImpactAnalyzer
from app.domain.enums import DocumentType
from app.domain.models import CommitInfo, Document


def test_commit_impact_analyzer_calculates_low_risk_for_small_non_core_commit() -> None:
    analyzer = CommitImpactAnalyzer()
    commit = CommitInfo(
        commit_sha="sha-123",
        message="docs: update readme",
        files_changed=["README.md"],
    )

    result = analyzer.analyze_commit_impact("repo-1", commit)

    assert result.repository_id == "repo-1"
    assert result.commit_sha == "sha-123"
    assert result.risk_level == "LOW"
    assert result.risk_score <= 25.0
    assert result.files_changed_count == 1
    assert result.breaking_changes == []


def test_commit_impact_analyzer_detects_high_risk_and_core_infra_changes() -> None:
    analyzer = CommitImpactAnalyzer()
    commit = CommitInfo(
        commit_sha="sha-456",
        message="feat(auth): refactor security middleware",
        files_changed=["src/auth/jwt.py", "src/config/settings.py", "src/api/routes.py"],
    )

    result = analyzer.analyze_commit_impact("repo-1", commit)

    assert result.risk_level in ("MEDIUM", "HIGH", "CRITICAL")
    assert result.risk_score > 25.0
    assert "src/auth" in result.affected_modules or "src/config" in result.affected_modules
    assert len(result.recommendations) > 0


def test_commit_impact_analyzer_detects_breaking_changes_in_documents() -> None:
    analyzer = CommitImpactAnalyzer()
    commit = CommitInfo(
        commit_sha="sha-789",
        message="refactor: remove legacy API method",
        files_changed=["src/api/legacy.py"],
    )
    files = [
        Document(
            repository_id="repo-1",
            commit_sha="sha-789",
            file_path="src/api/legacy.py",
            content="// DEPRECATED BREAKING REMOVE method",
            language="python",
            document_type=DocumentType.SOURCE_CODE,
        )
    ]

    result = analyzer.analyze_commit_impact("repo-1", commit, files)

    assert len(result.breaking_changes) == 1
    assert "Potential breaking API modification" in result.breaking_changes[0]
