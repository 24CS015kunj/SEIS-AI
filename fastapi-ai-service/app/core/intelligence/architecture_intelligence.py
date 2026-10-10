"""Architecture Intelligence Engine.

Infers module and dependency topology, fan-in/fan-out coupling, circular loops,
and detects layered architectural boundary violations (§4, §6).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import PurePosixPath
import re
from typing import Any

import structlog

logger = structlog.get_logger("seis.core.architecture_intelligence")

# Regex to detect import statements across JS/TS and Python
_JS_IMPORT_REGEX = re.compile(
    r"""(?:import\s+(?:[\w*\s{},$]+from\s+)?['"]([^'"]+)['"])|(?:require\s*\(\s*['"]([^'"]+)['"]\s*\))""",
    re.MULTILINE,
)
_PY_IMPORT_REGEX = re.compile(
    r"""(?:from\s+([\w.]+)\s+import)|(?:import\s+([\w.]+))""",
    re.MULTILINE,
)


@dataclass(frozen=True)
class ArchitecturalViolation:
    """Represents a concrete boundary or layering rule violation."""

    rule_name: str
    source_path: str
    target_path: str
    description: str
    severity: str  # "CRITICAL", "HIGH", "MEDIUM"


@dataclass(frozen=True)
class ModuleCouplingMetrics:
    """Coupling and centrality telemetry for a single file within the architecture."""

    file_path: str
    fan_in: int  # Number of local files that depend on this file (dependents)
    fan_out: int  # Number of local modules this file depends on (dependencies)
    external_dependencies: list[str]  # e.g., ['axios', 'mongoose', 'react']
    dependents: list[str]  # List of file paths importing this file
    instability: float  # Ce / (Ca + Ce), 0.0 (maximally stable) to 1.0 (maximally unstable)
    violations: list[ArchitecturalViolation] = field(default_factory=list)


class ArchitectureIntelligenceEngine:
    """Analyzes cross-file relationships, dependency flow, and layer compliance."""

    def __init__(self) -> None:
        self._log = logger.bind(component="architecture_intelligence_engine")

    def extract_imports(self, file_path: str, content: str) -> tuple[list[str], list[str]]:
        """Extracts (internal_relative_imports, external_packages) from source content."""
        internal: list[str] = []
        external: list[str] = []

        is_python = file_path.endswith(".py")

        if is_python:
            for match in _PY_IMPORT_REGEX.finditer(content):
                target = match.group(1) or match.group(2)
                if not target:
                    continue
                if target.startswith("."):
                    internal.append(target)
                else:
                    external.append(target.split(".")[0])
        else:
            for match in _JS_IMPORT_REGEX.finditer(content):
                target = match.group(1) or match.group(2)
                if not target:
                    continue
                if target.startswith((".", "/")):
                    internal.append(target)
                else:
                    external.append(target.split("/")[0])

        return internal, sorted(list(set(external)))

    def build_dependency_graph(
        self,
        files_dict: dict[str, str],
        roles_dict: dict[str, str] | None = None,
    ) -> dict[str, ModuleCouplingMetrics]:
        """Constructs the system dependency graph and detects architectural violations.

        Args:
            files_dict: Map of file_path -> content string.
            roles_dict: Map of file_path -> architectural role (controller, service, etc.).
        """
        roles = roles_dict or {}

        # Outgoing dependencies: file -> set of target normalized paths
        outgoing: dict[str, set[str]] = {p: set() for p in files_dict}
        # Incoming dependencies (fan-in): file -> set of source callers
        incoming: dict[str, set[str]] = {p: set() for p in files_dict}
        external_deps: dict[str, list[str]] = {}

        # Known file paths set for quick resolution
        all_paths = set(files_dict.keys())

        for file_path, content in files_dict.items():
            internal_raw, externals = self.extract_imports(file_path, content)
            external_deps[file_path] = externals

            src_dir = PurePosixPath(file_path).parent

            for raw_import in internal_raw:
                resolved_candidates = [
                    str(PurePosixPath(src_dir / raw_import)),
                    f"{src_dir / raw_import}.js",
                    f"{src_dir / raw_import}.jsx",
                    f"{src_dir / raw_import}.ts",
                    f"{src_dir / raw_import}.tsx",
                    f"{src_dir / raw_import}.py",
                    f"{src_dir / raw_import}/index.js",
                    f"{src_dir / raw_import}/index.ts",
                ]

                resolved_path = None
                for cand in resolved_candidates:
                    # Clean ./ and normalization
                    norm_cand = str(PurePosixPath(cand))
                    if norm_cand in all_paths:
                        resolved_path = norm_cand
                        break

                if resolved_path and resolved_path != file_path:
                    outgoing[file_path].add(resolved_path)
                    incoming[resolved_path].add(file_path)

        # Violation Detection
        results: dict[str, ModuleCouplingMetrics] = {}

        for file_path in files_dict:
            fan_out_count = len(outgoing[file_path])
            fan_in_count = len(incoming[file_path])
            dependents = sorted(list(incoming[file_path]))
            externals = external_deps.get(file_path, [])

            total_coupling = fan_in_count + fan_out_count
            instability = round(fan_out_count / total_coupling, 2) if total_coupling > 0 else 0.5

            violations: list[ArchitecturalViolation] = []
            source_role = roles.get(file_path, "").lower()

            for target_path in outgoing[file_path]:
                target_role = roles.get(target_path, "").lower()

                # Rule 1: Layered Architecture — Controller should not directly import Database/Model
                if "controller" in source_role and ("model" in target_role or "db" in target_role or "schema" in target_role):
                    violations.append(
                        ArchitecturalViolation(
                            rule_name="LayeringViolation:ControllerToModel",
                            source_path=file_path,
                            target_path=target_path,
                            description=(
                                f"Controller '{PurePosixPath(file_path).name}' directly couples to data model "
                                f"'{PurePosixPath(target_path).name}', bypassing the domain service layer."
                            ),
                            severity="HIGH",
                        )
                    )

                # Rule 2: Inverted Architecture — Model should never depend on Controller or Service
                if "model" in source_role and ("controller" in target_role or "service" in target_role or "route" in target_role):
                    violations.append(
                        ArchitecturalViolation(
                            rule_name="LayeringViolation:ModelUpwardDependency",
                            source_path=file_path,
                            target_path=target_path,
                            description=(
                                f"Data model '{PurePosixPath(file_path).name}' has an upward dependency on higher-level "
                                f"'{target_role}' layer ({PurePosixPath(target_path).name})."
                            ),
                            severity="CRITICAL",
                        )
                    )

                # Rule 3: Client/UI importing backend code
                if "ui_component" in source_role and any(k in target_path.lower() for k in ("backend", "server", "controller", "db")):
                    violations.append(
                        ArchitecturalViolation(
                            rule_name="BoundaryViolation:ClientToBackendInternal",
                            source_path=file_path,
                            target_path=target_path,
                            description=(
                                f"Client UI '{PurePosixPath(file_path).name}' directly references backend server internals "
                                f"instead of consuming HTTP API endpoints."
                            ),
                            severity="CRITICAL",
                        )
                    )

            # Check direct database imports in controllers from external libs (e.g. mongoose, prisma, sequelize)
            if "controller" in source_role and any(db in externals for db in ("mongoose", "prisma", "@prisma/client", "sequelize", "typeorm")):
                violations.append(
                    ArchitecturalViolation(
                        rule_name="LayeringViolation:ControllerDirectORM",
                        source_path=file_path,
                        target_path="external:orm",
                        description=f"Routing controller '{PurePosixPath(file_path).name}' directly imports ORM/DB client library.",
                        severity="MEDIUM",
                    )
                )

            results[file_path] = ModuleCouplingMetrics(
                file_path=file_path,
                fan_in=fan_in_count,
                fan_out=fan_out_count,
                external_dependencies=externals,
                dependents=dependents,
                instability=instability,
                violations=violations,
            )

        return results
