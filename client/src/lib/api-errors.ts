import { ApiError } from "./queryClient";

interface ErrorPayload {
  error?: string;
  message?: string;
  hint?: string;
  requestId?: string;
  details?: unknown;
}

export function getApiErrorPayload(error: unknown): ErrorPayload | null {
  if (!(error instanceof ApiError)) return null;
  if (!error.data || typeof error.data !== "object") return null;
  return error.data as ErrorPayload;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const payload = getApiErrorPayload(error);
  if (payload?.error) return payload.error;
  if (payload?.message) return payload.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function getApiErrorDescription(error: unknown): string | undefined {
  const payload = getApiErrorPayload(error);
  if (!payload) return undefined;

  const segments: string[] = [];
  if (payload.hint) segments.push(payload.hint);
  if (payload.requestId) segments.push(`Request ID: ${payload.requestId}`);
  return segments.length > 0 ? segments.join(" | ") : undefined;
}

