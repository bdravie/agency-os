"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// On a phone, a table that is wider than the screen becomes a stack of cards: each row a card, each cell "Heading: value"
// (the CSS is `table.stacked` in globals.css). Tables that already fit are left alone. Headings are copied from the table's
// own <th> into data-label, so no page needs changing. A table can opt out with class "keep-table".
const PHONE = "(max-width: 640px)";

function label(table: HTMLTableElement) {
  const heads = [...table.querySelectorAll<HTMLTableCellElement>("thead th")];
  if (!heads.length) return;
  for (const row of table.querySelectorAll<HTMLTableRowElement>("tbody tr")) {
    let col = 0;
    for (const cell of row.cells) {
      const text = (heads[col]?.textContent ?? "").trim();
      if (cell.dataset.label !== text) cell.dataset.label = text;
      col += cell.colSpan || 1;
    }
  }
}

function fit(main: HTMLElement) {
  const phone = window.matchMedia(PHONE).matches;
  for (const table of main.querySelectorAll<HTMLTableElement>("table")) {
    if (table.classList.contains("keep-table")) continue;
    if (!phone) { table.classList.remove("stacked"); continue; }
    if (table.classList.contains("stacked")) { label(table); continue; }
    const box = table.parentElement?.clientWidth ?? main.clientWidth;
    if (table.scrollWidth > box + 2) { label(table); table.classList.add("stacked"); }
  }
}

export default function MobileTables() {
  const pathname = usePathname();
  useEffect(() => {
    const main = document.getElementById("main");
    if (!main) return;
    let queued = 0;
    const run = () => { cancelAnimationFrame(queued); queued = requestAnimationFrame(() => fit(main)); };
    run();
    const watch = new MutationObserver(run);
    watch.observe(main, { childList: true, subtree: true });
    const media = window.matchMedia(PHONE);
    media.addEventListener("change", run);
    window.addEventListener("orientationchange", run);
    return () => { cancelAnimationFrame(queued); watch.disconnect(); media.removeEventListener("change", run); window.removeEventListener("orientationchange", run); };
  }, [pathname]);
  return null;
}
