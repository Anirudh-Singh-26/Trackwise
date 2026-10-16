const DAY_MS = 24 * 60 * 60 * 1000;

function parseBound(value, fallback, edge) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T${edge === "end" ? "23:59:59.999" : "00:00:00.000"}Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return new Date(NaN);
    return parsed;
  }
  return new Date(value);
}

export function parseDateRange(fromValue, toValue, { defaultDays = 7, now = new Date(), defaultFrom = null } = {}) {
  const endFallback = new Date(now);
  const startFallback = defaultFrom ? new Date(defaultFrom) : new Date(now.getTime() - defaultDays * DAY_MS);
  const from = parseBound(fromValue, startFallback, "start");
  const to = parseBound(toValue, endFallback, "end");
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) return null;
  return { from, to };
}
