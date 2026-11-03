"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { NAV_GROUPS } from "./nav-items";
import { useReplyFeed } from "./ReplyFeed";
import ThemeToggle from "./ThemeToggle";

export default function Sidebar({ demo, signOut, onSearch, theme }: { demo: boolean; signOut: () => Promise<void>; onSearch: () => void; theme: "light" | "dark" }) {
  const pathname = usePathname();
  const { unread } = useReplyFeed();
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
            {g.items.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={`nav-link${active(href) ? " active" : ""}`} aria-current={active(href) ? "page" : undefined}>
                <Icon size={17} aria-hidden /> {label}{href === "/inbox" && unread > 0 && <span className="badge" style={{ marginLeft: "auto" }} aria-label={`${unread} unread`}>{unread}</span>}
              </Link>
            ))}
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
