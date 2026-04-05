import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { z } from "zod";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats bytes to a human-readable string (e.g., "1.5 GB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Creates a type-safe wrapper for zodResolver to work with drizzle-zod 0.8.x schemas.
 */
export function asZodType<T>(schema: unknown): z.ZodType<T> {
  return schema as z.ZodType<T>;
}

export type EnabledPriorityNamed = {
  enabled: boolean;
  priority: number;
  name: string;
};

export function compareEnabledPriorityName<T extends EnabledPriorityNamed>(
  a: T,
  b: T,
): number {
  if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;

  const priorityDiff = a.priority - b.priority;
  if (priorityDiff !== 0) return priorityDiff;

  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}
