"""Code Intelligence Engine.

Computes deterministic code-level complexity, method sizing, role classification,
and maintainability index signals feeding the SEIS Quality Gate (§2, §3).
"""

from __future__ import annotations

import ast
from dataclasses import dataclass, field
from pathlib import PurePosixPath
import re
from typing import Any

import structlog

logger = structlog.get_logger("seis.core.code_intelligence")

# Regex patterns for complexity decision points across languages (JS/TS/Python)
_DECISION_POINT_REGEX = re.compile(
    r"\b(if|elif|else\s+if|for|while|case|catch|except)\b|(\?\s*[^:]+\s*:)|(&&|\|\|)",
    re.IGNORECASE,
)

# Common architectural layer patterns by directory/filename
_ROLE_PATTERNS = {
    "controller": re.compile(r"(controller|handler|endpoint)", re.IGNORECASE),
    "service": re.compile(r"(service|manager|usecase|interactor)", re.IGNORECASE),
    "repository": re.compile(r"(repository|dao|store|data_access)", re.IGNORECASE),
    "model": re.compile(r"(model|schema|entity|dto)", re.IGNORECASE),
    "route": re.compile(r"(route|router|url)", re.IGNORECASE),
    "ui_component": re.compile(r"(component|view|page|screen|widget)", re.IGNORECASE),
    "middleware": re.compile(r"(middleware|interceptor|filter|guard)", re.IGNORECASE),
    "util": re.compile(r"(util|helper|common|shared)", re.IGNORECASE),
}


@dataclass(frozen=True)
class CodeQualitySignals:
    """Deterministic structural and maintainability signals for a single source file."""

    file_path: str
    total_lines: int
    code_lines: int
    comment_lines: int
    blank_lines: int
    cyclomatic_complexity: int
    estimated_functions: int
    oversized_functions_count: int
    architectural_role: str
    maintainability_index: float  # Normalized 0.0 - 100.0 (100 = cleanest)
    smells: list[str] = field(default_factory=list)


class CodeIntelligenceEngine:
    """Analyzes source file text to extract code structure, complexity, and role."""

    def __init__(self) -> None:
        self._log = logger.bind(component="code_intelligence_engine")

    def detect_architectural_role(self, file_path: str, content: str = "") -> str:
        """Infers the architectural role of a file from its path and declarations."""
        posix_path = PurePosixPath(file_path)
        path_str = f"{posix_path.parent}/{posix_path.name}".lower()

        for role, pattern in _ROLE_PATTERNS.items():
            if pattern.search(path_str):
                return role

        # Fallback inspection on content
        content_sample = content[:1500].lower()
        if "router" in content_sample or "@app.get" in content_sample or "@router." in content_sample:
            return "route"
        if "class " in content_sample and "service" in content_sample:
            return "service"
        if "react" in content_sample or "export default function" in content_sample:
            return "ui_component"

        return "module"

    def analyze_source_file(self, file_path: str, content: str) -> CodeQualitySignals:
        """Parses and computes code metrics, complexity points, and quality smells."""
        lines = content.splitlines()
        total_lines = len(lines)

        code_lines = 0
        comment_lines = 0
        blank_lines = 0

        in_multiline_comment = False

        for line in lines:
            trimmed = line.strip()
            if not trimmed:
                blank_lines += 1
                continue

            # Multi-line comment tracking
            if "/*" in trimmed and "*/" in trimmed:
                comment_lines += 1
                continue
            if "/*" in trimmed or '"""' in trimmed or "'''" in trimmed:
                in_multiline_comment = not in_multiline_comment
                comment_lines += 1
                continue
            if in_multiline_comment:
                comment_lines += 1
                continue

            if trimmed.startswith(("//", "#", "*")):
                comment_lines += 1
            else:
                code_lines += 1

        # Complexity approximation via branching points
        decision_matches = _DECISION_POINT_REGEX.findall(content)
        cyclomatic_complexity = 1 + len(decision_matches)

        # Function counting & oversized function detection
        func_matches = re.findall(
            r"(function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|def\s+\w+\s*\(|class\s+\w+)",
            content,
        )
        estimated_functions = max(1, len(func_matches))

        # Average lines per function heuristic
        avg_lines_per_func = code_lines / estimated_functions if estimated_functions > 0 else code_lines
        oversized_functions_count = 0
        if avg_lines_per_func > 60:
            oversized_functions_count = max(1, int(avg_lines_per_func // 50))

        # Architectural role
        role = self.detect_architectural_role(file_path, content)

        # Detect code smells
        smells: list[str] = []
        if total_lines > 400:
            smells.append(f"Oversized file ({total_lines} lines exceeds 400 lines guideline)")
        if cyclomatic_complexity > 30:
            smells.append(f"High cyclomatic complexity ({cyclomatic_complexity} decision branches)")
        if oversized_functions_count > 0:
            smells.append(f"Potential oversized methods detected (avg lines/function ~ {int(avg_lines_per_func)})")
        if total_lines > 50 and comment_lines / max(1, total_lines) < 0.03:
            smells.append("Under-documented complex module (<3% comment density)")

        # Maintainability Index Calculation (Adapted Halstead/McCabe formula scaled 0-100)
        # Higher is better: 100 = very clean, < 50 = difficult to maintain
        raw_mi = 171.0 - 5.2 * (code_lines**0.35) - 0.23 * cyclomatic_complexity
        maintainability_index = round(max(5.0, min(100.0, raw_mi)), 1)

        return CodeQualitySignals(
            file_path=file_path,
            total_lines=total_lines,
            code_lines=code_lines,
            comment_lines=comment_lines,
            blank_lines=blank_lines,
            cyclomatic_complexity=cyclomatic_complexity,
            estimated_functions=estimated_functions,
            oversized_functions_count=oversized_functions_count,
            architectural_role=role,
            maintainability_index=maintainability_index,
            smells=smells,
        )
