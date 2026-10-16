"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { NAV_GROUPS } from "./nav-items";

export default function Sidebar({ demo, signOut, onSearch }: { demo: boolean; signOut: () => Promise<void>; onSearch: () => void }) {
  const pathname = usePathname();
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
                <Icon size={17} aria-hidden /> {label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-foot">
        {demo && <span className="badge tone-warn">Demo mode</span>}
        <form action={signOut}><button className="nav-link signout"><LogOut size={16} aria-hidden /> Sign out</button></form>
      </div>
    </div>
  );
}
