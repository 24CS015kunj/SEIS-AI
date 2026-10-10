"""Quality Intelligence & Evolution Diagnosis Service.

Orchestrates code intelligence, architectural boundary checking, and Git commit
evolution history to produce multi-dimensional quality scores and structured
SEIS diagnostic issue cards (§2, §3, §7, §10).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import PurePosixPath
import re
from typing import Any

import structlog

from app.core.evolution.commit_analyzer import CommitAnalyzer
from app.core.intelligence.architecture_intelligence import (
    ArchitectureIntelligenceEngine,
    ArchitecturalViolation,
    ModuleCouplingMetrics,
)
from app.core.intelligence.code_intelligence import CodeIntelligenceEngine, CodeQualitySignals
from app.domain.models import CommitInfo, Document

logger = structlog.get_logger("seis.core.quality_intelligence")

_BUG_FIX_KEYWORDS = re.compile(r"\b(fix|bug|patch|hotfix|revert|regression|error|crash|issue)\b", re.IGNORECASE)


@dataclass(frozen=True)
class SEISEvidence:
    """Quantitative evidence backing a SEIS diagnosis issue."""

    lines: int
    fan_in: int
    fan_out: int
    churn_count: int
    bug_fix_count: int
    cyclomatic_complexity: int
    violations: list[str] = field(default_factory=list)
    smells: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class SEISDiagnosisIssue:
    """A formal, structured SEIS diagnostic finding (Milestone 3, §7)."""

    issue_id: str  # e.g. "SEIS-101"
    target_path: str
    component_name: str
    category: str  # "Architecture", "EvolutionRisk", "Maintainability", "Coupling"
    severity: str  # "CRITICAL", "HIGH", "MEDIUM", "LOW"
    confidence: float  # 0.0 - 1.0
    problem: str
    evidence: dict[str, Any]
    evolution_evidence: str
    recommendation: str
    action_level: int  # 0: Observe, 1: Recommend, 2: Propose Patch


@dataclass(frozen=True)
class QualityGateSummary:
    """The multi-dimensional software quality gate score (§2, §10)."""

    overall_score: float  # 0.0 - 100.0
    architecture_score: float  # 0.0 - 100.0
    maintainability_score: float  # 0.0 - 100.0
    evolution_risk_score: float  # 0.0 - 100.0 (lower risk = higher score)
    decision: str  # "PASS" | "WARN" | "REVIEW_REQUIRED" | "BLOCK"
    total_files_analyzed: int
    total_issues_found: int
    issues: list[SEISDiagnosisIssue] = field(default_factory=list)


class QualityIntelligenceService:
    """Unified service combining static code, architecture graph, and git history."""

    def __init__(self) -> None:
        self._code_engine = CodeIntelligenceEngine()
        self._arch_engine = ArchitectureIntelligenceEngine()
        self._commit_analyzer = CommitAnalyzer()
        self._log = logger.bind(component="quality_intelligence_service")

    def analyze_repository_quality(
        self,
        repository_id: str,
        files: list[Document],
        commits: list[CommitInfo],
    ) -> QualityGateSummary:
        """Executes full multi-dimensional quality intelligence analysis.

        Zero LLM tokens required for scoring: 100% deterministic, reproducible,
        and instant.
        """
        if not files:
            return QualityGateSummary(
                overall_score=100.0,
                architecture_score=100.0,
                maintainability_score=100.0,
                evolution_risk_score=100.0,
                decision="PASS",
                total_files_analyzed=0,
                total_issues_found=0,
                issues=[],
            )

        # 1. Per-file code intelligence
        code_signals_map: dict[str, CodeQualitySignals] = {}
        roles_map: dict[str, str] = {}
        files_dict: dict[str, str] = {}

        for doc in files:
            signals = self._code_engine.analyze_source_file(doc.file_path, doc.content or "")
            code_signals_map[doc.file_path] = signals
            roles_map[doc.file_path] = signals.architectural_role
            files_dict[doc.file_path] = doc.content or ""

        # 2. Architecture coupling & boundary violations
        coupling_map = self._arch_engine.build_dependency_graph(files_dict, roles_map)

        # 3. Evolution churn & bug regression frequency
        file_commit_counts: dict[str, int] = {}
        file_bug_fix_counts: dict[str, int] = {}

        for commit in commits:
            is_bug_fix = bool(_BUG_FIX_KEYWORDS.search(commit.message or ""))
            for changed_path in commit.files_changed or []:
                file_commit_counts[changed_path] = file_commit_counts.get(changed_path, 0) + 1
                if is_bug_fix:
                    file_bug_fix_counts[changed_path] = file_bug_fix_counts.get(changed_path, 0) + 1

        # 4. Generate structured diagnosis issues (#SEIS-xxx)
        issues: list[SEISDiagnosisIssue] = []
        issue_counter = 101

        # Cumulative scoring trackers
        total_maintainability = 0.0
        architecture_penalty = 0.0
        evolution_risk_penalty = 0.0

        for file_path, signals in code_signals_map.items():
            coupling = coupling_map.get(file_path)
            fan_in = coupling.fan_in if coupling else 0
            fan_out = coupling.fan_out if coupling else 0
            violations = coupling.violations if coupling else []

            churn = file_commit_counts.get(file_path, 0)
            bug_fixes = file_bug_fix_counts.get(file_path, 0)

            total_maintainability += signals.maintainability_index

            # Track penalties
            if violations:
                architecture_penalty += len(violations) * 15.0
            if signals.cyclomatic_complexity > 25:
                architecture_penalty += 5.0

            if churn > 5 and bug_fixes > 1:
                evolution_risk_penalty += min(25.0, churn * 2.0 + bug_fixes * 4.0)

            # DIAGNOSIS 1: Architectural Boundary Violation
            if violations:
                violation = violations[0]
                ev = SEISEvidence(
                    lines=signals.total_lines,
                    fan_in=fan_in,
                    fan_out=fan_out,
                    churn_count=churn,
                    bug_fix_count=bug_fixes,
                    cyclomatic_complexity=signals.cyclomatic_complexity,
                    violations=[v.description for v in violations],
                    smells=signals.smells,
                )
                evo_context = (
                    f"Component modified {churn} times in repository history with {bug_fixes} corrective hotfixes. "
                    f"Direct coupling to {violation.target_path} threatens layer isolation."
                )
                issues.append(
                    SEISDiagnosisIssue(
                        issue_id=f"SEIS-{issue_counter}",
                        target_path=file_path,
                        component_name=PurePosixPath(file_path).name,
                        category="Architecture",
                        severity=violation.severity,
                        confidence=0.94,
                        problem=violation.description,
                        evidence=asdict(ev),
                        evolution_evidence=evo_context,
                        recommendation=(
                            f"Decouple '{PurePosixPath(file_path).name}' from '{PurePosixPath(violation.target_path).name}'. "
                            "Introduce a domain service interface to encapsulate data access."
                        ),
                        action_level=1,  # Level 1: Recommend
                    )
                )
                issue_counter += 1

            # DIAGNOSIS 2: High Evolution Churn + High Complexity Hotspot
            elif churn >= 4 and signals.cyclomatic_complexity >= 15:
                ev = SEISEvidence(
                    lines=signals.total_lines,
                    fan_in=fan_in,
                    fan_out=fan_out,
                    churn_count=churn,
                    bug_fix_count=bug_fixes,
                    cyclomatic_complexity=signals.cyclomatic_complexity,
                    violations=[],
                    smells=signals.smells,
                )
                evo_context = (
                    f"Frequent modifications ({churn} commits) with {bug_fixes} bug regressions. "
                    f"Cyclomatic complexity ({signals.cyclomatic_complexity}) increases change risk."
                )
                issues.append(
                    SEISDiagnosisIssue(
                        issue_id=f"SEIS-{issue_counter}",
                        target_path=file_path,
                        component_name=PurePosixPath(file_path).name,
                        category="EvolutionRisk",
                        severity="HIGH" if bug_fixes >= 2 else "MEDIUM",
                        confidence=0.91,
                        problem=(
                            f"Active hotspot experiencing unstable evolution churn combined with high branch complexity "
                            f"({signals.cyclomatic_complexity} branches)."
                        ),
                        evidence=asdict(ev),
                        evolution_evidence=evo_context,
                        recommendation=(
                            f"Decompose complex conditional branches in '{PurePosixPath(file_path).name}'. "
                            "Add comprehensive unit test coverage before applying next feature changes."
                        ),
                        action_level=1,
                    )
                )
                issue_counter += 1

            # DIAGNOSIS 3: Severe Coupling Centrality (High Blast Radius)
            elif fan_in >= 6 and signals.total_lines > 250:
                ev = SEISEvidence(
                    lines=signals.total_lines,
                    fan_in=fan_in,
                    fan_out=fan_out,
                    churn_count=churn,
                    bug_fix_count=bug_fixes,
                    cyclomatic_complexity=signals.cyclomatic_complexity,
                    violations=[],
                    smells=signals.smells,
                )
                issues.append(
                    SEISDiagnosisIssue(
                        issue_id=f"SEIS-{issue_counter}",
                        target_path=file_path,
                        component_name=PurePosixPath(file_path).name,
                        category="Coupling",
                        severity="MEDIUM",
                        confidence=0.88,
                        problem=(
                            f"High architectural fan-in ({fan_in} dependent modules). "
                            "Any modification creates a wide downstream blast radius."
                        ),
                        evidence=asdict(ev),
                        evolution_evidence=(
                            f"{fan_in} modules depend directly on this file. "
                            f"Modified {churn} times historically."
                        ),
                        recommendation=(
                            f"Stabilize API exports of '{PurePosixPath(file_path).name}'. "
                            "Extract cohesive sub-responsibilities into dedicated helper modules."
                        ),
                        action_level=0,  # Level 0: Observe
                    )
                )
                issue_counter += 1

        # 5. Compute Final Composite Scores (0.0 - 100.0)
        n = max(1, len(files))
        avg_maintainability = round(total_maintainability / n, 1)

        arch_score = round(max(20.0, 100.0 - (architecture_penalty / max(1, n * 0.15))), 1)
        evo_score = round(max(25.0, 100.0 - (evolution_risk_penalty / max(1, n * 0.15))), 1)

        overall = round(0.35 * arch_score + 0.35 * avg_maintainability + 0.30 * evo_score, 1)

        # Quality Gate Decision
        if overall >= 80.0 and len([i for i in issues if i.severity == "CRITICAL"]) == 0:
            decision = "PASS"
        elif overall >= 65.0:
            decision = "WARN"
        elif overall >= 50.0:
            decision = "REVIEW_REQUIRED"
        else:
            decision = "BLOCK"

        # Sort issues by severity priority
        severity_weight = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
        sorted_issues = sorted(issues, key=lambda x: severity_weight.get(x.severity, 4))

        return QualityGateSummary(
            overall_score=overall,
            architecture_score=arch_score,
            maintainability_score=avg_maintainability,
            evolution_risk_score=evo_score,
            decision=decision,
            total_files_analyzed=len(files),
            total_issues_found=len(sorted_issues),
            issues=sorted_issues,
        )
