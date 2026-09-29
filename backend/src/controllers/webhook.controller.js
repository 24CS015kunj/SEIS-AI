import Repository from "../models/repositories.model.js";
import { getFastapiConfig } from "../config/fastapi.config.js";

const VALID_STATUSES = new Set(["pending", "queued", "processing", "ready", "completed", "failed"]);

/**
 * Webhook handler for FastAPI ingestion status callbacks (Task #2 / Task T5).
 *
 * Receives server-to-server push notifications when an ingestion job transitions
 * through QUEUED, PROCESSING, READY (completed), or FAILED states, updating the
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
      job_id = null,
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

    // 1. Strict status validation (allows pending, queued, processing, ready, completed, failed)
    const statusLower = String(status || "").toLowerCase().trim();
    if (!VALID_STATUSES.has(statusLower)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status value '${status}'. Expected one of: pending, queued, processing, ready, completed, failed.`,
      });
    }

    let mappedStatus = statusLower;
    if (statusLower === "ready") {
      mappedStatus = "completed";
    }

    // 2. Strict timestamp validation
    let validTimestamp = new Date();
    if (timestamp !== undefined && timestamp !== null) {
      const parsed = new Date(timestamp);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid timestamp format. Must be a valid ISO-8601 or date string.",
        });
      }
      validTimestamp = parsed;
    }

    const repository = await Repository.findById(repository_id);
    if (!repository) {
      return res.status(404).json({
        success: false,
        message: `Repository '${repository_id}' not found.`,
      });
    }

    // 3. Attempt Ownership & Fencing
    // If a modern attempt owns the repository record, reject missing or mismatched attempt IDs
    if (repository.activeJobId) {
      if (!job_id) {
        return res.status(200).json({
          success: true,
          ignored: true,
          reason: "missing_attempt_id",
          repositoryId: repository_id,
          ingestionStatus: repository.ingestionStatus,
        });
      }
      if (repository.activeJobId !== job_id) {
        if (["completed", "failed"].includes(repository.ingestionStatus)) {
          // Repository is marked terminal under a prior attempt.
          // An incoming callback for an unestablished attempt cannot claim ownership unilaterally,
          // nor is it proven to be superseded. Return 409 retryable so durable callbacks are preserved.
          return res.status(409).json({
            success: false,
            retryable: true,
            reason: "attempt_ownership_not_settled",
            message: `Repository activeJobId '${repository.activeJobId}' is terminal; ownership for '${job_id}' not yet settled.`,
            repositoryId: repository_id,
            activeJobId: repository.activeJobId,
            incomingJobId: job_id,
            ingestionStatus: repository.ingestionStatus,
          });
        }

        return res.status(200).json({
          success: true,
          ignored: true,
          reason: "stale_attempt_superseded",
          repositoryId: repository_id,
          activeJobId: repository.activeJobId,
          incomingJobId: job_id,
          ingestionStatus: repository.ingestionStatus,
        });
      }
    }

    // 4. Monotonic State Rule: Do not allow delayed progress callbacks to resurrect terminal states
    if (
      ["completed", "failed"].includes(repository.ingestionStatus) &&
      ["processing", "queued", "pending"].includes(mappedStatus)
    ) {
      return res.status(200).json({
        success: true,
        ignored: true,
        reason: "terminal_state_preserved",
        repositoryId: repository_id,
        ingestionStatus: repository.ingestionStatus,
        activeJobId: repository.activeJobId,
      });
    }

    // 5. Atomic Conditional Mongo Update
    const query = {
      _id: repository._id,
      $or: [
        { activeJobId: job_id },
        { activeJobId: null },
        { activeJobId: { $exists: false } },
      ],
    };

    if (["processing", "queued", "pending"].includes(mappedStatus)) {
      query.ingestionStatus = { $nin: ["completed", "failed"] };
    }

    let targetStatus = mappedStatus;
    // Prevent downgrading an already-processing repository back to queued or pending
    if (repository.ingestionStatus === "processing" && ["queued", "pending"].includes(mappedStatus)) {
      targetStatus = "processing";
    }

    const updateSet = {
      ingestionStatus: targetStatus,
      lastHeartbeatAt: validTimestamp,
    };

    if (stage) {
      updateSet.ingestionStage = stage;
    } else if (mappedStatus === "queued" && !repository.ingestionStage) {
      updateSet.ingestionStage = "queued";
    }

    if (job_id) {
      updateSet.activeJobId = job_id;
    }
    if (chunk_count > 0) {
      updateSet.chunkCount = chunk_count;
    }
    if (mappedStatus === "completed") {
      updateSet.lastIngestedAt = validTimestamp;
      updateSet.ingestionError = null;
    } else if (mappedStatus === "failed") {
      updateSet.ingestionError = error || "Ingestion job failed.";
    }

    const updated = await Repository.findOneAndUpdate(
      query,
      { $set: updateSet },
      { new: true }
    );

    if (!updated) {
      const latest = await Repository.findById(repository_id);
      return res.status(200).json({
        success: true,
        ignored: true,
        reason: "atomic_condition_mismatch",
        repositoryId: repository_id,
        ingestionStatus: latest ? latest.ingestionStatus : repository.ingestionStatus,
        activeJobId: latest ? latest.activeJobId : repository.activeJobId,
      });
    }

    return res.status(200).json({
      success: true,
      applied: true,
      repositoryId: repository_id,
      ingestionStatus: updated.ingestionStatus,
      chunkCount: updated.chunkCount,
      activeJobId: updated.activeJobId,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    next(err);
  }
}

