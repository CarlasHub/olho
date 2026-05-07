import { buildReviewReport } from "./review-report-builder.js";

export function buildJsonReviewReport(session = {}) {
  return JSON.stringify(buildReviewReport(session), null, 2);
}
