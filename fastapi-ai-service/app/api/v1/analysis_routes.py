"""Software evolution analysis endpoints.

Exposes evolution reports and hotspot calculation produced by the
Software Evolution Analysis Engine (§5.2, §7) for consumption by Express/React dashboards.
"""

from fastapi import APIRouter, Depends, Path, status
import structlog

from app.api.deps import get_evolution_analysis_service, verify_service_token
from app.api.schemas.analysis_schema import (
    EvolutionAnalysisRequest,
    EvolutionAnalysisResponse,
)
from app.core.evolution.churn_calculator import ChurnCalculator
from app.core.evolution.commit_analyzer import CommitAnalyzer
from app.core.intelligence.insights_generator import InsightsGenerator
from app.core.intelligence.trend_detector import TrendDetector
from app.domain.models import EvolutionReport
from app.services.evolution_analysis_service import EvolutionAnalysisService

logger = structlog.get_logger("seis.api.evolution")

router = APIRouter(prefix="/repositories", tags=["evolution-analysis"])


@router.post(
    "/{repository_id}/evolution",
    response_model=EvolutionAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute and return software evolution and hotspot analysis",
)
async def analyze_repository_evolution(
    repository_id: str = Path(..., description="The repository ID"),
    payload: EvolutionAnalysisRequest = ...,
    evolution_service: EvolutionAnalysisService = Depends(get_evolution_analysis_service),
    _token: str = Depends(verify_service_token),
) -> EvolutionAnalysisResponse:
    """Calculates code churn, Hotspot Risk = (Change Frequency x Line Count),
    detects structural module trends, generates actionable engineering insights,
    and indexes the resulting report into ChromaDB.
    """
    logger.info(
        "evolution_analysis.request_received",
        repository_id=repository_id,
        commit_count=len(payload.commit_history),
        file_count=len(payload.files),
    )

    # 1. Run evolution pipeline and index report into ChromaDB / Redis cache
    report: EvolutionReport = await evolution_service.analyze_evolution(
        repository_id=repository_id,
        commit_history=payload.commit_history,
        files=payload.files,
    )

    # 2. Extract direct granular models for frontend visualization
    commit_analyzer = CommitAnalyzer()
    churn_calculator = ChurnCalculator()
    trend_detector = TrendDetector()
    insights_generator = InsightsGenerator()

    commit_analysis = commit_analyzer.analyze_commits(payload.commit_history)
    hotspots = churn_calculator.calculate_hotspots(commit_analysis, payload.files)
    trends = trend_detector.detect_trends(hotspots)
    insights = insights_generator.generate_insights(hotspots, trends)

    return EvolutionAnalysisResponse(
        repository_id=repository_id,
        markdown=report.markdown,
        generated_at=report.generated_at,
        indexed_chunk_count=report.indexed_chunk_count,
        hotspots=hotspots,
        trends=trends,
        insights=insights,
    )
