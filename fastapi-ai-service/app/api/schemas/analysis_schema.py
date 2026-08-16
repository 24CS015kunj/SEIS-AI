"""Request/response DTOs for the evolution analysis API (§11.2, §7)."""

from datetime import datetime
from pydantic import BaseModel, Field

from app.domain.models import (
    CommitInfo,
    Document,
    EngineeringInsight,
    EvolutionReport,
    HotspotMetrics,
    StructuralTrends,
)


class EvolutionAnalysisRequest(BaseModel):
    """Payload to trigger software evolution and hotspot analysis."""

    commit_history: list[CommitInfo] = Field(
        ..., description="List of commit records to analyze for churn & evolution"
    )
    files: list[Document] = Field(
        default_factory=list,
        description="Repository file snapshots with line counts to calculate size-weighted hotspot risk",
    )


class EvolutionAnalysisResponse(BaseModel):
    """Response containing computed evolution report and hotspot metrics."""

    repository_id: str
    markdown: str
    generated_at: datetime
    indexed_chunk_count: int
    hotspots: list[HotspotMetrics] = Field(default_factory=list)
    trends: StructuralTrends | None = None
    insights: list[EngineeringInsight] = Field(default_factory=list)
