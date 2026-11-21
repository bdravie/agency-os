"use client";

import { useNeedsYou } from "@/components/NeedsYouFeed";
import { badgeText } from "@/lib/needsYouMath";

// What is waiting on the owner in these pages, from the same live counts as the sidebar. Nothing is drawn while the count
// is zero or unknown (with JavaScript off it is never known), so the brain never claims all is clear.
export default function LobeCount({ hrefs }: { hrefs: string[] }) {
  const counts = useNeedsYou();
  const n = hrefs.reduce((sum, h) => sum + (counts[h]?.n ?? 0), 0);
  if (!n) return null;
  const words = hrefs.map((h) => counts[h]?.text).filter(Boolean).join("; ");
  return <span className="badge brain-count" title={words || undefined} aria-label={`${n} waiting on you`}>{badgeText(n)}</span>;
}
