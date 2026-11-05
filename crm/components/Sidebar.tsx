"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { badgeText } from "@/lib/needsYouMath";
import { NAV_GROUPS } from "./nav-items";
import { useNeedsYou } from "./NeedsYouFeed";
import { useReplyFeed } from "./ReplyFeed";
import ThemeToggle from "./ThemeToggle";

export default function Sidebar({ demo, signOut, onSearch, theme }: { demo: boolean; signOut: () => Promise<void>; onSearch: () => void; theme: "light" | "dark" }) {
  const pathname = usePathname();
  const { unread } = useReplyFeed();
  const needs = useNeedsYou();
  const count = (href: string) => (href === "/inbox" ? { n: unread, text: `${unread} unread ${unread === 1 ? "reply" : "replies"}` } : needs[href] ?? { n: 0, text: "" });
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  return (
    <div className="sidebar-inner">
      <Link href="/" className="brand"><span className="brand-mark" aria-hidden>A</span> Agency OS</Link>
      <button type="button" className="search-btn" onClick={onSearch}>
        <Search size={15} aria-hidden /> <span>Search…</span> <kbd>⌘K</kbd>
      </button>
      <nav aria-label="Main">
        {NAV_GROUPS.map((g) => (
          <div key={g.title} className="nav-group">
            <div className="nav-title">{g.title}</div>
            {g.items.map(({ href, label, icon: Icon }) => {
              const { n, text } = count(href);
              return (
                <Link key={href} href={href} title={n > 0 ? text : undefined} className={`nav-link${active(href) ? " active" : ""}`} aria-current={active(href) ? "page" : undefined}>
                  <Icon size={17} aria-hidden /> {label}
                  {/* The key restarts the small pop whenever the number changes. */}
                  {n > 0 && <span key={n} className="badge nav-count"><span aria-hidden>{badgeText(n)}</span><span className="sr-only">: {text}</span></span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar-foot">
        {demo && <span className="badge tone-warn">Demo mode</span>}
        <ThemeToggle initial={theme} />
        <form action={signOut}><button className="nav-link signout"><LogOut size={16} aria-hidden /> Sign out</button></form>
      </div>
    </div>
  );
}
