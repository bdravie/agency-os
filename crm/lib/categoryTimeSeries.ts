export type TimePoint = {
  period: string; // e.g. "2026-06", "2026-07"
  label: string;  // e.g. "Jun", "Jul"
  categories: Record<string, { count: number; totalViews: number; avgMultiple: number }>;
};

export type PostRecord = {
  niche: string | null;
  postedAt: string;
  views72?: number | null;
  multiple?: number | null;
};

export function slugifyNicheKey(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "niche";
}

/** Groups posts by calendar month and calculates totals and multiples per niche. */
export function buildCategoryTimeSeries(posts: PostRecord[], monthsBack = 6): TimePoint[] {
  const now = new Date();
  const periods: { key: string; label: string }[] = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", { month: "short" });
    periods.push({ key, label });
  }

  return periods.map(({ key, label }) => {
    const matching = posts.filter((p) => {
      if (!p.postedAt) return false;
      const d = new Date(p.postedAt);
      const postKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return postKey === key;
    });

    const categories: Record<string, { count: number; totalViews: number; avgMultiple: number }> = {};
    for (const post of matching) {
      const niche = post.niche || "untagged";
      const curr = categories[niche] || { count: 0, totalViews: 0, avgMultiple: 0 };
      const views = Number(post.views72) || 0;
      const mult = Number(post.multiple) || 1.0;
      categories[niche] = {
        count: curr.count + 1,
        totalViews: curr.totalViews + views,
        avgMultiple: Number(((curr.avgMultiple * curr.count + mult) / (curr.count + 1)).toFixed(2)),
      };
    }

    return { period: key, label, categories };
  });
}
