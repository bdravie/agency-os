import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { loadNeedsFor, type NeedItem } from "@/lib/needsYou";

const SHOWN = 3;   // enough to act on, without pushing the page's own work out of view

function Row({ item, page }: { item: NeedItem; page: string }) {
  const inner = (
    <>
      <span className="needs-text"><span className="needs-title">{item.title}</span>{item.detail && <span className="muted">{item.detail}</span>}</span>
      <span className="needs-go">{item.action} <ChevronRight size={15} aria-hidden /></span>
    </>
  );
  // A link to a section of this same page is a plain anchor: it fires hashchange, which is what HashScroll scrolls and flashes on. Next's Link does not.
  return <li>{item.href.startsWith(`${page}#`) ? <a href={item.href} className="needs-row">{inner}</a> : <Link href={item.href} className="needs-row">{inner}</Link>}</li>;
}

// Top of a page: what the number beside it in the sidebar is counting, each row one click from doing it. Nothing outstanding, nothing shown.
export default async function NeedsYouCard({ href }: { href: string }) {
  const groups = await loadNeedsFor(href);
  if (groups.length === 0) return null;
  return (
    <section className="card needs" aria-label="Needs you">
      {groups.map((g) => (
        <div key={g.heading} className="needs-group">
          <h2 className="needs-head">{g.heading} <span className="badge">{g.items.length}</span></h2>
          <ul className="needs-list">{g.items.slice(0, SHOWN).map((item) => <Row key={item.key} item={item} page={href} />)}</ul>
          {g.items.length > SHOWN && (
            <details className="needs-more">
              <summary>Show {g.items.length - SHOWN} more</summary>
              <ul className="needs-list">{g.items.slice(SHOWN).map((item) => <Row key={item.key} item={item} page={href} />)}</ul>
            </details>
          )}
        </div>
      ))}
    </section>
  );
}
