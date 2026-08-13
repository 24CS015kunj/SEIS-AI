"""Integration test for app/core/evolution/evolution_indexer.py (Task 29).

Requires both a real, reachable ChromaDB server (chromadb is not
installed in the native Windows venv, see ADR-004/Task 9) and a real
``NVIDIA_API_KEY`` (embedding provider, ADR-007) -- compiling and
indexing a report touches both. Neither is available in this
environment/session, so this module is skipped here with an explicit
reason, not a fabricated pass. Written to run for real inside the Task
14 Linux/Docker environment once both are configured.
"""

from __future__ import annotations

import uuid

import pytest

from app.config.settings import Settings, get_settings
from app.core.embedding.embedder import NemotronEmbedder
from app.core.evolution.evolution_indexer import EvolutionIndexer
from app.domain.enums import ChunkType, DocumentType, InsightCategory, InsightSeverity
from app.domain.models import (
    EngineeringInsight,
    HotspotMetrics,
    ModuleTrend,
    StructuralTrends,
)
from app.infra.vectorstore.chroma_client import _CHROMADB_AVAILABLE, ChromaClient

_settings_for_skip_check = get_settings()

pytestmark = pytest.mark.skipif(
    not _CHROMADB_AVAILABLE or not _settings_for_skip_check.nvidia_api_key.get_secret_value(),
    reason=(
        "Requires both chromadb (not installed in the native Windows venv, "
        "ADR-004) and a real NVIDIA_API_KEY (ADR-007) -- neither is "
        "available in this environment. Run inside the Task 14 Linux/Docker "
        "environment with NVIDIA_API_KEY set to verify against live "
        "infrastructure."
    ),
)


@pytest.fixture
def settings() -> Settings:
    return get_settings()


def _analysis_data() -> dict[str, object]:
    return {
        "hotspots": [
            HotspotMetrics(
                file_path="src/auth.py", commit_count=20, line_count=500, hotspot_score=95.0
            )
        ],
        "trends": StructuralTrends(
            module_trends=[
                ModuleTrend(
                    module="app/core",
                    file_count=3,
                    commit_count=20,
                    churn_share=0.8,
                    is_high_churn=True,
                )
            ],
            high_churn_modules=["app/core"],
        ),
        "insights": [
            EngineeringInsight(
                category=InsightCategory.HIGH_RISK_MODULE,
                severity=InsightSeverity.CRITICAL,
                subject="src/auth.py",
                summary="src/auth.py is a top hotspot risk file in this analysis.",
                recommendation="Add test coverage and review changes here carefully.",
            )
        ],
    }


async def test_compiled_report_is_retrievable_via_a_real_chromadb_search(
    settings: Settings,
) -> None:
    """§7.5 Validation: "searching ChromaDB with 'hotspot risk files'
    retrieves evolution report chunks" -- verified against the real
    NVIDIA embedding API and a real ChromaDB collection, not simulated."""
    repository_id = f"itest-evolution-{uuid.uuid4().hex[:8]}"
    chroma = ChromaClient(settings=settings)
    embedder = NemotronEmbedder(settings=settings)
    indexer = EvolutionIndexer(chroma_client=chroma, embedder=embedder)

    try:
        report = await indexer.compile_and_index_report(repository_id, _analysis_data())
        assert report.indexed_chunk_count == 3

        query_vector = await embedder.embed_query("hotspot risk files")
        results = await chroma.query_similarity(repository_id, query_vector, top_k=3)

        assert len(results) > 0
        assert all(r.metadata.document_type == DocumentType.EVOLUTION_REPORT for r in results)
        assert all(r.metadata.chunk_type == ChunkType.EVOLUTION_SECTION for r in results)
    finally:
        await chroma.delete_collection(repository_id)
        await embedder.close()
