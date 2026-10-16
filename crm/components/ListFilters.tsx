"use client";

import { useRef } from "react";
import Link from "next/link";
import { FILTERS, SORTS, type FilterKey } from "@/lib/companyFilters";

type Current = { q: string; niche: string; view: string; sort: string; area: string } & Record<FilterKey, string>;

// Search, sort and filters for the Companies list. Choosing anything applies it straight away; typing an area applies on Enter.
export default function ListFilters({ niches, current }: { niches: string[]; current: Current }) {
  const form = useRef<HTMLFormElement>(null);
  const apply = () => form.current?.requestSubmit();
  const active = (Object.keys(FILTERS) as FilterKey[]).filter((k) => current[k]).length + (current.area ? 1 : 0) + (current.sort ? 1 : 0);
  const clear = `/companies${current.view ? `?view=${encodeURIComponent(current.view)}` : ""}`;
  return (
    <form ref={form} className="stack" style={{ gap: 10, marginBottom: 16 }} role="search" aria-label="Search, sort and filter companies">
      {current.view && <input type="hidden" name="view" value={current.view} />}
      <div className="filters">
        <input name="q" defaultValue={current.q} placeholder="Search name or website" aria-label="Search companies" />
        <select name="niche" defaultValue={current.niche} aria-label="Niche" onChange={apply}><option value="">All niches</option>{niches.map((n) => <option key={n}>{n}</option>)}</select>
        <select name="sort" defaultValue={current.sort} aria-label="Sort by" onChange={apply}>{SORTS.map((s) => <option key={s.key} value={s.key}>{s.key ? `Sort: ${s.label}` : "Sort: default"}</option>)}</select>
        <button className="secondary">Search</button>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
          <label key={k} className="stack" style={{ gap: 3 }}>
            <span className="field-label">{FILTERS[k].label}</span>
            <select name={k} defaultValue={current[k]} onChange={apply} aria-label={FILTERS[k].label}>{FILTERS[k].options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>
          </label>
        ))}
        <label className="stack" style={{ gap: 3 }}><span className="field-label">Area (town or postcode)</span><input name="area" defaultValue={current.area} placeholder="e.g. Leeds or LS1" maxLength={40} style={{ width: 170 }} /></label>
        {active > 0 && <Link href={clear} className="muted" style={{ alignSelf: "flex-end", paddingBottom: 8 }}>Clear {active} filter{active === 1 ? "" : "s"}</Link>}
      </div>
    </form>
  );
}
