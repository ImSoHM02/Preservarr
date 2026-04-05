import type { Response } from "express";
import { routesLogger } from "./logger.js";

type ErrorDetails = Record<string, unknown>;

type NodeErrorLike = {
  code?: string;
  errno?: number;
  syscall?: string;
  hostname?: string;
  address?: string;
  port?: number;
  message?: string;
};

export interface ErrorSummary {
  message: string;
  code?: string;
  hint?: string;
  details?: ErrorDetails;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNodeErrorLike(error: unknown): NodeErrorLike | null {
  if (!isRecord(error)) return null;

  const cause = isRecord(error.cause) ? error.cause : error;
  const out: NodeErrorLike = {};

  if (typeof cause.code === "string") out.code = cause.code;
  if (typeof cause.errno === "number") out.errno = cause.errno;
  if (typeof cause.syscall === "string") out.syscall = cause.syscall;
  if (typeof cause.hostname === "string") out.hostname = cause.hostname;
  if (typeof cause.address === "string") out.address = cause.address;
  if (typeof cause.port === "number") out.port = cause.port;
  if (typeof cause.message === "string") out.message = cause.message;

  return Object.keys(out).length > 0 ? out : null;
}

function getHint(message: string, code?: string): string | undefined {
  const lower = message.toLowerCase();
  const upperCode = code?.toUpperCase();

  if (upperCode === "ECONNREFUSED" || lower.includes("econnrefused")) {
    return "Connection refused. In Docker, avoid localhost; use the target container name or host.docker.internal.";
  }
  if (upperCode === "ENOTFOUND" || lower.includes("failed to resolve hostname")) {
    return "Hostname could not be resolved. Check DNS/container network and the URL host.";
  }
  if (upperCode === "ETIMEDOUT" || lower.includes("timed out") || lower.includes("timeout")) {
    return "Connection timed out. Check host, port, and firewall/network routing.";
  }
  if (lower.includes("authentication failed") || lower.includes("unauthorized")) {
    return "Authentication failed. Verify username/password or API key.";
  }
  if (lower.includes("invalid or unsafe url")) {
    return "URL was blocked for safety. Check the URL format, host, and protocol.";
  }

  return undefined;
}

export function summarizeError(error: unknown, fallbackMessage: string): ErrorSummary {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const nodeError = getNodeErrorLike(error);
  const details: ErrorDetails = {};

  if (nodeError?.code) details.code = nodeError.code;
  if (nodeError?.errno !== undefined) details.errno = nodeError.errno;
  if (nodeError?.syscall) details.syscall = nodeError.syscall;
  if (nodeError?.hostname) details.hostname = nodeError.hostname;
  if (nodeError?.address) details.address = nodeError.address;
  if (nodeError?.port !== undefined) details.port = nodeError.port;
  if (nodeError?.message) details.cause = nodeError.message;

  if (error instanceof Error && error.name && error.name !== "Error") {
    details.errorName = error.name;
  }

  const code =
    (typeof (error as NodeErrorLike | undefined)?.code === "string"
      ? (error as NodeErrorLike).code
      : nodeError?.code) || undefined;

  return {
    message: message || fallbackMessage,
    code,
    hint: getHint(message || fallbackMessage, code),
    details: Object.keys(details).length > 0 ? details : undefined,
  };
}

export function sendRouteError(
  res: Response,
  error: unknown,
  options: {
    status?: number;
    fallbackMessage: string;
    route: string;
    context?: Record<string, unknown>;
  }
): void {
  const { status = 500, fallbackMessage, route, context } = options;
  const summary = summarizeError(error, fallbackMessage);
  const requestId = typeof res.locals.requestId === "string" ? res.locals.requestId : undefined;

  routesLogger.error(
    {
      route,
      requestId,
      status,
      error: summary.message,
      code: summary.code,
      details: summary.details,
      ...context,
    },
    "API route failed"
  );

  res.status(status).json({
    error: summary.message,
    code: summary.code,
    hint: summary.hint,
    details: summary.details,
    requestId,
  });
}

