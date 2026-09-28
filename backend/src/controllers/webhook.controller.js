import Repository from "../models/repositories.model.js";
import { getFastapiConfig } from "../config/fastapi.config.js";

/**
 * Webhook handler for FastAPI ingestion status callbacks (Task #2).
 *
 * Receives server-to-server push notifications when an ingestion job transitions
 * through PROCESSING, READY (completed), or FAILED states, updating the
 * corresponding Repository document in MongoDB.
 *
 * Route: POST /api/webhooks/fastapi/ingestion-status
 */
export async function handleFastApiIngestionStatus(req, res, next) {
  try {
    const config = getFastapiConfig();

    // Validate authorization header if internal API key is configured
    if (config.internalApiKey) {
      const authHeader = req.headers.authorization || "";
      const expectedHeader = `Bearer ${config.internalApiKey}`;
      if (authHeader !== expectedHeader) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized webhook caller: Invalid or missing internal API key.",
        });
      }
    }

    const {
      repository_id,
      status,
      stage,
      chunk_count = 0,
      file_count = 0,
      error = null,
      timestamp,
    } = req.body || {};

    if (!repository_id) {
      return res.status(400).json({
        success: false,
        message: "Missing required field: repository_id",
      });
    }

    // Map FastAPI ProcessingStatus to Express Repository.ingestionStatus
    let mappedStatus = "pending";
    const statusLower = String(status || "").toLowerCase();
    if (statusLower === "ready" || statusLower === "completed") {
      mappedStatus = "completed";
    } else if (statusLower === "failed") {
      mappedStatus = "failed";
    } else if (statusLower === "processing") {
      mappedStatus = "processing";
    }

    const repository = await Repository.findById(repository_id);
    if (!repository) {
      return res.status(404).json({
        success: false,
        message: `Repository '${repository_id}' not found.`,
      });
    }

    repository.ingestionStatus = mappedStatus;
    repository.ingestionStage = stage || null;
    if (chunk_count > 0) {
      repository.chunkCount = chunk_count;
    }
    if (mappedStatus === "completed") {
      repository.lastIngestedAt = timestamp ? new Date(timestamp) : new Date();
      repository.ingestionError = null;
    } else if (mappedStatus === "failed") {
      repository.ingestionError = error || "Ingestion job failed.";
    }

    await repository.save();

    return res.status(200).json({
      success: true,
      repositoryId: repository_id,
      ingestionStatus: repository.ingestionStatus,
      chunkCount: repository.chunkCount,
      updatedAt: repository.updatedAt,
    });
  } catch (err) {
    next(err);
  }
}
