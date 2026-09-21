"""Commit & PR Change Impact Analyzer.

Evaluates architectural change risk score (0-100), risk tier (LOW, MEDIUM, HIGH, CRITICAL),
breaking API export modifications, affected downstream modules, and architectural recommendations
for a commit or pull request (Task #4).
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import PurePosixPath
import re
import structlog

from app.domain.models import CommitImpactAnalysis, CommitInfo, Document

logger = structlog.get_logger("seis.core.commit_impact_analyzer")

_CORE_MODULE_KEYWORDS = {"auth", "config", "settings", "main", "app", "core", "database", "db", "api", "server", "security"}
_TEST_MODULE_KEYWORDS = {"test", "tests", "spec", "specs", "__tests__"}


class CommitImpactAnalyzer:
    """Analyzes commit risk, breaking API changes, and downstream architectural impact."""

    def __init__(self) -> None:
        self._log = logger.bind(component="commit_impact_analyzer")

    def analyze_commit_impact(
        self,
        repository_id: str,
        commit: CommitInfo,
        files: list[Document] | None = None,
    ) -> CommitImpactAnalysis:
        """Evaluates commit impact, breaking API changes, and architectural risk."""
        files_changed = commit.files_changed or []
        files_count = len(files_changed)

        affected_modules_set: set[str] = set()
        core_files_count = 0
        test_files_count = 0

        for file_path in files_changed:
            posix_path = PurePosixPath(file_path)
            if posix_path.parent != PurePosixPath("."):
                affected_modules_set.add(str(posix_path.parent))
            else:
                affected_modules_set.add(posix_path.name)

            path_parts = [part.lower() for part in posix_path.parts]
            if any(keyword in path_parts or any(keyword in part for part in path_parts) for keyword in _CORE_MODULE_KEYWORDS):
                core_files_count += 1
            if any(keyword in path_parts or any(keyword in part for part in path_parts) for keyword in _TEST_MODULE_KEYWORDS):
                test_files_count += 1

        breaking_changes: list[str] = []
        if files:
            for doc in files:
                if doc.content and ("REMOVE" in doc.content or "DEPRECATED" in doc.content or "BREAKING" in doc.content):
                    breaking_changes.append(f"Potential breaking API modification in {doc.file_path}")

        # Risk scoring logic: 0 - 100
        score = min(files_count * 5.0, 35.0)
        score += min(core_files_count * 15.0, 30.0)
        score += min(len(breaking_changes) * 25.0, 35.0)

        if test_files_count > 0:
            score = max(0.0, score - 10.0)

        risk_score = round(min(100.0, score), 1)

        if risk_score <= 25.0:
            risk_level = "LOW"
        elif risk_score <= 55.0:
            risk_level = "MEDIUM"
        elif risk_score <= 80.0:
            risk_level = "HIGH"
        else:
            risk_level = "CRITICAL"

        recommendations: list[str] = []
        if core_files_count > 0 and test_files_count == 0:
            recommendations.append("Core infrastructure modified without test updates. Add unit tests before merging.")
        if breaking_changes:
            recommendations.append("Potential breaking API changes detected. Ensure downstream consumers are notified.")
        if files_count > 10:
            recommendations.append("Large commit changeset. Consider breaking into smaller scoped PRs.")
        if not recommendations:
            recommendations.append("Low architectural risk change. Proceed with standard code review.")

        return CommitImpactAnalysis(
            repository_id=repository_id,
            commit_sha=commit.commit_sha,
            risk_score=risk_score,
            risk_level=risk_level,
            files_changed_count=files_count,
            breaking_changes=breaking_changes,
            affected_modules=sorted(list(affected_modules_set)),
            recommendations=recommendations,
            analyzed_at=datetime.now(UTC),
        )
