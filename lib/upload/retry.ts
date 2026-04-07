const TRANSIENT_ERROR_PATTERNS = [
  /blob file not found/i,
  /econnreset/i,
  /econnrefused/i,
  /enotfound/i,
  /eai_again/i,
  /etimedout/i,
  /timeout/i,
  /timed out/i,
  /temporary/i,
  /temporarily/i,
  /network/i,
  /socket/i,
  /connection/i,
  /fetch failed/i,
  /too many requests/i,
  /rate limit/i,
  /deadlock/i,
  /serialization/i,
];

const TRANSIENT_PRISMA_CODES = new Set(["P1001", "P1002", "P2024", "P2034"]);

export type RetryOptions = {
  retries?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number) => void | Promise<void>;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

export function isTransientUploadError(error: unknown): boolean {
  if (error && typeof error === "object") {
    const row = error as { code?: unknown; statusCode?: unknown; status?: unknown };
    if (typeof row.code === "string" && TRANSIENT_PRISMA_CODES.has(row.code)) {
      return true;
    }
    const statusCode =
      typeof row.statusCode === "number"
        ? row.statusCode
        : typeof row.status === "number"
          ? row.status
          : null;
    if (statusCode === 408 || statusCode === 425 || statusCode === 429) {
      return true;
    }
    if (typeof statusCode === "number" && statusCode >= 500) {
      return true;
    }
  }

  const message = errorMessage(error);
  return TRANSIENT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export async function retryAsync<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = Math.max(0, Math.floor(options.retries ?? 0));

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      const canRetry =
        attempt <= retries &&
        (options.shouldRetry ? options.shouldRetry(error, attempt) : true);

      if (!canRetry) {
        throw error;
      }

      await options.onRetry?.(error, attempt);
    }
  }

  throw new Error("retryAsync reached an unexpected state");
}
