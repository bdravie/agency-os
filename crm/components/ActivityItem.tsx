"use client";

import { useRouter } from "next/navigation";
import { jumpTo, tabForSection } from "@/lib/jump";
import type { Target } from "@/lib/activityTarget";
import { ActivityIcon } from "./activity";

// One line of an activity timeline. When it has somewhere to go, clicking it (or pressing Enter) scrolls to the part of the page that changed,
// or opens the right page. Links inside the line (for example the company name) keep working on their own.
export default function ActivityItem({ type, target, children }: { type: string; target: Target; children: React.ReactNode }) {
  const router = useRouter();
  const go = () => {
    if (!target) return;
    if ("href" in target) { router.push(target.href); return; }
    if (jumpTo(target.id, target.fallback)) return;
    const tab = tabForSection(window.location.pathname, target.id, target.fallback);
    if (tab) router.push(`${window.location.pathname}?tab=${tab}#${target.id}`, { scroll: false });
  };
  const label = !target ? undefined : "href" in target ? "Open the page for this change" : "Jump to what changed";
  return (
    <li
      className={target ? "tl-click" : undefined}
      {...(target ? {
        role: "button", tabIndex: 0, title: label,
        onClick: (e: React.MouseEvent) => { if (!(e.target as HTMLElement).closest("a, button")) go(); },
        onKeyDown: (e: React.KeyboardEvent) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); go(); } },
      } : {})}
    >
      <span className="tl-dot"><ActivityIcon type={type} /></span>
      <div>{children}</div>
    </li>
  );
}
