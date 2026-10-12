import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Router } from "express";
import { isDatabaseUnavailable } from "../middleware/error-handler.js";
import type { RecurringProcessingInput, RecurringProcessingResult } from "../services/recurring-processor.js";
import { cairoToday } from "../validators/transaction.js";

export const RECURRING_CRON_PATH = "/internal/recurring/process";
// backend/vercel.json sets 60 seconds. This cooperative deadline leaves 15 seconds
// for an in-flight transaction, the final backlog query and the HTTP response.
export const RECURRING_CRON_BUDGET_MS = 45_000;
export interface RecurringCronOptions {
  processor: { processDueRecurring(input: RecurringProcessingInput): Promise<RecurringProcessingResult> };
  secret?: () => string | undefined;
  now?: () => Date;
  monotonicNow?: () => number;
  log?: (metadata: Readonly<Record<string, string | number | boolean>>) => void;
}

export function createRecurringCronRouter(options: RecurringCronOptions) {
  const router = Router();
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  const log = options.log ?? (metadata => console.log(JSON.stringify(metadata)));
  router.all(RECURRING_CRON_PATH, async (request, response) => {
    response.set("Cache-Control", "no-store");
    const requestId = randomUUID();
    response.set("X-Request-ID", requestId);
    const reject = (status: number, code: string, message: string) =>
      response.status(status).json({ error: { code, message, details: [] } });
    // Lazy validation keeps cron configuration independent of normal API startup.
    const secret = (options.secret ?? (() => process.env.CRON_SECRET))();
    if (!secret || secret.length < 32 || /[^\x21-\x7e]/.test(secret)) {
      reject(503, "CRON_UNAVAILABLE", "Scheduled processing is not configured."); return;
    }
    const authorization = request.headers.authorization ?? "";
    const authCount = request.rawHeaders.filter((_, index) => index % 2 === 0 && request.rawHeaders[index].toLowerCase() === "authorization").length;
    const digest = (value: string) => createHash("sha256").update(value).digest();
    if (authCount !== 1 || !timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`))) {
      reject(401, "UNAUTHORIZED", "Scheduler authorization is required."); return;
    }
    // Explicitly reject HEAD: Express otherwise treats GET as supporting HEAD.
    if (request.method !== "GET") {
      response.set("Allow", "GET"); reject(405, "METHOD_NOT_ALLOWED", "Use GET for scheduled processing."); return;
    }
    if (request.path !== RECURRING_CRON_PATH || request.originalUrl.includes("?") ||
        request.headers["transfer-encoding"] !== undefined ||
        (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0")) {
      reject(400, "VALIDATION_ERROR", "Scheduled processing accepts no query parameters or body."); return;
    }
    const started = monotonicNow();
    const invocationTime = (options.now ?? (() => new Date()))();
    const referenceDate = cairoToday(invocationTime);
    const base = { event: "recurring_cron", requestId, invocationTime: invocationTime.toISOString(), referenceDate };
    try {
      const result = await options.processor.processDueRecurring({
        referenceDate, maxPerDefinition: 100, maxAttempts: 1000,
        shouldStop: () => monotonicNow() - started >= RECURRING_CRON_BUDGET_MS,
      });
      // Explicit projection prevents internal additions from exposing row data.
      const { definitionsVisited, attempts, posted, skipped, alreadyTerminal, failed, conflicts,
        recordedFailures, failureRecordingErrors, limitReached, deadlineReached, hasRemaining } = result;
      const counters = { definitionsVisited, attempts, posted, skipped, alreadyTerminal, failed, conflicts,
        recordedFailures, failureRecordingErrors, limitReached, deadlineReached, hasRemaining };
      const processed = failed === 0 && failureRecordingErrors === 0;
      const summary = { requestId, referenceDate, processed, ...counters };
      log({ ...base, durationMs: Math.max(0, Math.round(monotonicNow() - started)), outcome: processed ? "completed" : "processing_failed", ...counters });
      if (!processed) {
        response.status(500).json({ error: { code: "PROCESSING_FAILED", message: "Some recurring work could not be processed. Review the execution summary.", details: [] }, meta: summary });
      } else response.json({ data: summary });
    } catch (error) {
      const unavailable = isDatabaseUnavailable(error);
      log({ ...base, durationMs: Math.max(0, Math.round(monotonicNow() - started)), outcome: unavailable ? "database_unavailable" : "internal_error" });
      reject(unavailable ? 503 : 500, unavailable ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR",
        unavailable ? "Database is temporarily unavailable. Please try again later." : "An unexpected error occurred. Please try again later.");
    }
  });
  return router;
}
