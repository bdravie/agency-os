export const when = (d: Date | string) => new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
export const dateOnly = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { dateStyle: "medium" });

/** "5 min ago", "3 h ago", "2 days ago"; falls back to a date after a month. */
export function ago(d: Date | string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) { const n = Math.floor(s / 86400); return `${n} day${n === 1 ? "" : "s"} ago`; }
  return dateOnly(d);
}
