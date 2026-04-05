import fs from "fs";
import path from "path";
import { LOG_FILE_PATH } from "./logger.js";

const MAX_READ_BYTES = 5 * 1024 * 1024; // 5MB tail window

const PINO_LEVELS: Record<number, string> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

type ParsedLogEntry = {
  timestamp: string;
  level: string;
  levelNumber: number;
  module?: string;
  message: string;
  requestId?: string;
  source?: string;
  context?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeString(value: string): string {
  return value
    .replace(/(apikey=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(token=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(password=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/("?(?:api[_-]?key|token|password|authorization)"?\s*:\s*")([^"]+)"/gi, '$1[REDACTED]"');
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (!isRecord(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("password") ||
      lower.includes("token") ||
      lower.includes("authorization") ||
      lower.includes("apikey") ||
      lower === "cookie"
    ) {
      out[key] = "[REDACTED]";
      continue;
    }
    out[key] = sanitizeValue(raw);
  }
  return out;
}

function normalizeTimestamp(raw: unknown): string {
  if (typeof raw === "string") {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  if (typeof raw === "number") {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function parseLine(line: string): ParsedLogEntry | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;

    const levelNumber =
      typeof parsed.level === "number" ? parsed.level : 30;
    const level = PINO_LEVELS[levelNumber] ?? "info";
    const timestamp = normalizeTimestamp(parsed.time);
    const message =
      typeof parsed.msg === "string" ? sanitizeString(parsed.msg) : sanitizeString(line);

    const context: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (["level", "time", "msg", "pid", "hostname", "module", "requestId", "source"].includes(key)) {
        continue;
      }
      context[key] = sanitizeValue(value);
    }

    return {
      timestamp,
      level,
      levelNumber,
      module: typeof parsed.module === "string" ? parsed.module : undefined,
      message,
      requestId: typeof parsed.requestId === "string" ? parsed.requestId : undefined,
      source: typeof parsed.source === "string" ? parsed.source : undefined,
      context: Object.keys(context).length > 0 ? context : undefined,
    };
  } catch {
    return {
      timestamp: new Date().toISOString(),
      level: "info",
      levelNumber: 30,
      message: sanitizeString(line),
    };
  }
}

async function readTail(filePath: string): Promise<{ lines: string[]; truncated: boolean }> {
  const resolvedPath = path.resolve(filePath);
  try {
    const stat = await fs.promises.stat(resolvedPath);
    const start = Math.max(0, stat.size - MAX_READ_BYTES);
    const length = stat.size - start;
    const fileHandle = await fs.promises.open(resolvedPath, "r");
    const buffer = Buffer.alloc(length);
    await fileHandle.read(buffer, 0, length, start);
    await fileHandle.close();

    const text = buffer.toString("utf-8");
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (start > 0 && lines.length > 0) {
      lines.shift();
    }

    return { lines, truncated: start > 0 };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { lines: [], truncated: false };
    }
    throw error;
  }
}

export async function queryLogs(options: {
  limit: number;
  levels?: Set<string>;
  module?: string;
  search?: string;
}): Promise<{ filePath: string; truncated: boolean; entries: ParsedLogEntry[] }> {
  const filePath = path.resolve(LOG_FILE_PATH);
  const { lines, truncated } = await readTail(filePath);
  const levelFilter = options.levels;
  const moduleFilter = options.module?.toLowerCase();
  const searchFilter = options.search?.toLowerCase();

  const entries: ParsedLogEntry[] = [];

  for (let index = lines.length - 1; index >= 0; index--) {
    const parsed = parseLine(lines[index]);
    if (!parsed) continue;

    if (levelFilter && !levelFilter.has(parsed.level)) continue;
    if (moduleFilter && parsed.module?.toLowerCase() !== moduleFilter) continue;
    if (searchFilter) {
      const haystack = `${parsed.message} ${JSON.stringify(parsed.context ?? {})}`.toLowerCase();
      if (!haystack.includes(searchFilter)) continue;
    }

    entries.push(parsed);
    if (entries.length >= options.limit) break;
  }

  return {
    filePath,
    truncated,
    entries,
  };
}

