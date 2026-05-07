export class AiReviewError extends Error {
  constructor(message, { code = "ai-review-error", cause = null, details = null } = {}) {
    super(message);
    this.name = "AiReviewError";
    this.code = code;
    this.cause = cause;
    this.details = details;
  }
}

export class AiReviewDisabledError extends AiReviewError {
  constructor(message = "AI review is disabled.") {
    super(message, { code: "ai-review-disabled" });
    this.name = "AiReviewDisabledError";
  }
}

export class AiProviderConfigurationError extends AiReviewError {
  constructor(message, details = null) {
    super(message, { code: "ai-provider-configuration", details });
    this.name = "AiProviderConfigurationError";
  }
}

export class AiProviderRequestError extends AiReviewError {
  constructor(message, { cause = null, details = null } = {}) {
    super(message, { code: "ai-provider-request", cause, details });
    this.name = "AiProviderRequestError";
  }
}

export class AiReviewValidationError extends AiReviewError {
  constructor(message, details = null) {
    super(message, { code: "ai-review-validation", details });
    this.name = "AiReviewValidationError";
  }
}

export class AiReviewCancelledError extends AiReviewError {
  constructor(message = "AI review was cancelled.") {
    super(message, { code: "ai-review-cancelled" });
    this.name = "AiReviewCancelledError";
  }
}

export function isAbortError(error) {
  return error?.name === "AbortError" || error?.code === "ABORT_ERR";
}

export function toAiReviewError(error, fallbackMessage = "AI review failed.") {
  if (error instanceof AiReviewError) return error;
  if (isAbortError(error)) return new AiReviewCancelledError();
  return new AiProviderRequestError(error?.message || fallbackMessage, { cause: error });
}

export function aiReviewErrorMessage(error) {
  if (!error) return "AI review failed.";
  if (error instanceof AiReviewError) return error.message;
  return error.message || "AI review failed.";
}
