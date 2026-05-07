export const SEVERITY_RANK = Object.freeze({
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
});

export function calibrateSeverity({ impact = "medium", confidence = 0.7, userBlocking = false } = {}) {
  if (userBlocking && confidence >= 0.85) return "critical";
  if (impact === "high" && confidence >= 0.78) return "high";
  if (impact === "medium" && confidence >= 0.62) return "medium";
  return "low";
}

export function severityRank(severity) {
  return SEVERITY_RANK[severity] || 0;
}
