export function normalizeDownloadProgress(progress: unknown): number {
  const value = typeof progress === "number" ? progress : Number(progress);
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  // Defensive compatibility: if any client reports 0..1, convert to 0..100.
  if (value <= 1) {
    return value * 100;
  }

  if (value > 100) {
    return 100;
  }

  return value;
}
