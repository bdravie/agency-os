"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, FileText, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { archiveContent, deleteContent, moveContent, restoreContent } from "@/lib/actions";
import { scriptOneAction } from "@/lib/contentFilmActions";
import { ARCHIVED, ARCHIVED_META, CONTENT_META, CONTENT_STATUSES, contentLabel, type ContentStatus } from "@/lib/stages";
import { useToast } from "./Toast";
import ContentDrawer from "./ContentDrawer";
import NewIdeaDialog from "./NewIdeaDialog";
import PostedDialog from "./PostedDialog";
import SectionTabs from "./SectionTabs";
import NicheFilter from "./NicheFilter";
import { LaneTab } from "./ui";

export type Item = {
  id: number;
  idea: string;
  hook: string | null;
  hookAlt?: string | null;
  format: string | null;
  status: string;
  keyword: string | null;
  day: string | null;
  scoreLines: string[];
};

const shortDate = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function ContentBoard({
  initial,
  platforms,
  niches,
  currentStage = "all",
  niche = "all",
  override = false,
  nicheCounts = {},
  generator = null,
  openItem = null,
  openNumbers = null,
}: {
  initial: Item[];
  platforms: string[];
  niches: string[];
  currentStage?: string;
  niche?: string;
  override?: boolean;
  nicheCounts?: Record<string, number>;
  generator?: React.ReactNode;
  openItem?: number | null;
  openNumbers?: { post: number; bucket: number } | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [stage, setStage] = useState(currentStage);
  const [over, setOver] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(openItem);
  const [creating, setCreating] = useState(false);
  const [posting, setPosting] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, start] = useTransition();
  const [scripting, setScripting] = useState<string | null>(null);

  useEffect(() => setItems(initial), [initial]);
  useEffect(() => setStage(currentStage), [currentStage]);
  useEffect(() => {
    if (openItem !== null) setOpenId(openItem);
  }, [openItem, openNumbers?.post, openNumbers?.bucket]);

  const closeDrawer = () => {
    setOpenId(null);
    const q = new URLSearchParams(window.location.search);
    if (!q.has("open")) return;
    ["open", "post", "bucket"].forEach((k) => q.delete(k));
    router.replace(q.size ? `/content?${q}` : "/content", { scroll: false });
  };

  const needle = filter.trim().toLowerCase();
  const matches = (i: Item) =>
    !needle || `${i.idea} ${i.format ?? ""} ${i.keyword ?? ""}`.toLowerCase().includes(needle);

  const liveItems = items.filter((i) => i.status !== ARCHIVED);
  const archivedCount = items.filter((i) => i.status === ARCHIVED).length;
  const countOf = (status: string) => items.filter((i) => i.status === status).length;

  const pickedItems = items.filter((i) => picked.has(i.id));
  const pickedIdeas = pickedItems.filter((i) => i.status === "Idea");
  const pickedArchived = pickedItems.filter((i) => i.status === ARCHIVED);
  const visibleIdeas = items.filter((i) => i.status === "Idea" && matches(i));

  const clear = () => {
    setPicked(new Set());
    setConfirmDelete(false);
  };
  const toggle = (id: number) =>
    setPicked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = (list: Item[]) =>
    setPicked((p) =>
      list.every((i) => p.has(i.id))
        ? new Set([...p].filter((id) => !list.some((i) => i.id === id)))
        : new Set([...p, ...list.map((i) => i.id)])
    );

  async function scriptThem() {
    const ids = pickedIdeas.slice(0, 5).map((i) => i.id);
    let done = 0;
    for (const id of ids) {
      setScripting(`Writing script ${done + 1} of ${ids.length}… (about 15 seconds each)`);
      const r = await scriptOneAction(id);
      if (!r.ok) {
        toast(r.error, "bad");
        break;
      }
      done++;
    }
    setScripting(null);
    clear();
    router.refresh();
    if (done) toast(`${done} script${done === 1 ? "" : "s"} ready. Open Filming day when you are set up.`);
  }

  function bulk(kind: "archive" | "restore" | "delete", only?: number[]) {
    const list =
      kind === "archive" ? pickedIdeas : kind === "restore" ? pickedArchived : pickedItems.filter((i) => i.status === "Idea" || i.status === ARCHIVED);
    const ids = only ?? list.map((i) => i.id);
    start(async () => {
      try {
        const n = await (kind === "archive"
          ? archiveContent(ids)
          : kind === "restore"
          ? restoreContent(ids)
          : deleteContent(ids));
        toast(`${kind === "archive" ? "Archived" : kind === "restore" ? "Restored" : "Deleted"} ${n} ${n === 1 ? "idea" : "ideas"}`);
        clear();
        router.refresh();
      } catch (err) {
        toast(`Could not do that: ${err instanceof Error ? err.message : err}`, "bad");
      }
    });
  }

  function move(id: number, status: string) {
    const item = items.find((i) => i.id === id);
    if (!item || item.status === status) return;
    if (status === "Posted") {
      setPosting(id);
      return;
    }
    const before = items;
    setItems(items.map((i) => (i.id === id ? { ...i, status } : i)));
    start(async () => {
      try {
        await moveContent(id, status);
        toast(`Moved to ${contentLabel(status)}`);
      } catch (err) {
        setItems(before);
        toast(`Could not move it: ${err instanceof Error ? err.message : err}`, "bad");
      }
    });
  }

  const stageSlug = (s: string) => {
    if (s === "Idea") return "ideas";
    if (s === "Scripted") return "script-ready";
    if (s === "Filmed") return "filmed";
    if (s === "Posted") return "posted";
    if (s === "Archived") return "archived";
    return "all";
  };

  const stageHref = (s: string) => {
    const q = new URLSearchParams();
    q.set("tab", "board");
    if (s !== "all") q.set("stage", stageSlug(s));
    if (niche && niche !== "all") q.set("niche", niche);
    if (override) q.set("more", "1");
    return `/content?${q.toString()}`;
  };

  const searchPlaceholder =
    stage === "Idea"
      ? "Filter ideas…"
      : stage === "Scripted"
      ? "Filter ready scripts…"
      : stage === "Filmed"
      ? "Filter filmed videos…"
      : stage === "Posted"
      ? "Filter posted videos…"
      : stage === ARCHIVED
      ? "Filter archived…"
      : "Filter content…";

  const renderCard = (i: Item, selectable: boolean, isArchive: boolean) => {
    const statusIdx = CONTENT_STATUSES.indexOf(i.status as ContentStatus);
    return (
      <article
        key={i.id}
        className={`deal${openId === i.id ? " active" : ""}`}
        draggable
        tabIndex={0}
        role="button"
        style={{ minHeight: 110, display: "flex", flexDirection: "column", justifyContent: "space-between", margin: 0 }}
        aria-label={`${i.idea}. Press Enter to open.`}
        onClick={() => setOpenId(i.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpenId(i.id);
          }
        }}
        onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i.id))}
      >
        <div>
          <div className="deal-top">
            {selectable && (
              <input
                type="checkbox"
                checked={picked.has(i.id)}
                onChange={() => toggle(i.id)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                aria-label={`Select: ${i.idea}`}
              />
            )}
            <b>{i.idea}</b>
          </div>
          {i.status === "Posted" && i.scoreLines.length > 0 && (
            <div className="muted" style={{ marginTop: 4 }}>
              {i.scoreLines.join(" · ")}
            </div>
          )}
          {(i.format || i.keyword) && (
            <div className="muted" style={{ marginTop: 4 }}>
              {[i.format, i.keyword && `keyword ${i.keyword}`].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <div className="deal-foot" style={{ marginTop: 8 }}>
          {i.day ? (
            <span className="age">
              <CalendarDays size={12} aria-hidden /> {shortDate(i.day)}
            </span>
          ) : (
            <span className="age">Not scheduled</span>
          )}
          <div className="deal-actions" onClick={(e) => e.stopPropagation()}>
            {isArchive ? (
              <button
                type="button"
                onClick={() => bulk("restore", [i.id])}
                aria-label="Restore to Ideas"
                title="Restore to Ideas"
              >
                <RotateCcw size={14} />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={statusIdx <= 0}
                  onClick={() => move(i.id, CONTENT_STATUSES[statusIdx - 1])}
                  aria-label={`Move back to ${contentLabel(CONTENT_STATUSES[statusIdx - 1] ?? "")}`}
                  title={statusIdx > 0 ? `Back to ${contentLabel(CONTENT_STATUSES[statusIdx - 1])}` : ""}
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  disabled={statusIdx < 0 || statusIdx >= CONTENT_STATUSES.length - 1}
                  onClick={() => move(i.id, CONTENT_STATUSES[statusIdx + 1])}
                  aria-label={`Move on to ${contentLabel(CONTENT_STATUSES[statusIdx + 1] ?? "")}`}
                  title={statusIdx < CONTENT_STATUSES.length - 1 ? `On to ${contentLabel(CONTENT_STATUSES[statusIdx + 1])}` : ""}
                >
                  <ChevronRight size={14} />
                </button>
              </>
            )}
            <a href={`/content/${i.id}`} target="_blank" rel="noreferrer" title="Open in a new tab" aria-label="Open in a new tab">
              <ExternalLink size={13} />
            </a>
          </div>
        </div>
      </article>
    );
  };

  return (
    <>
      <SectionTabs
        label="Content board stages"
        current={stage}
        tabs={[
          { key: "all", label: "All", href: stageHref("all"), count: liveItems.length },
          { key: "Idea", label: "Ideas", href: stageHref("Idea"), count: countOf("Idea") },
          { key: "Scripted", label: "Script ready", href: stageHref("Scripted"), count: countOf("Scripted") },
          { key: "Filmed", label: "Filmed", href: stageHref("Filmed"), count: countOf("Filmed") },
          { key: "Posted", label: "Posted", href: stageHref("Posted"), count: countOf("Posted") },
        ]}
        right={
          archivedCount > 0 || stage === ARCHIVED
            ? [{ key: ARCHIVED, label: "Archived", href: stageHref(ARCHIVED), count: archivedCount }]
            : []
        }
      />

      {generator}

      {niches.length > 0 && (
        <NicheFilter
          base="/content"
          niches={niches}
          current={niche}
          counts={nicheCounts}
          keep={{
            tab: "board",
            ...(stage !== "all" ? { stage: stageSlug(stage) } : {}),
            ...(override ? { more: "1" } : {}),
          }}
        />
      )}

      <div className="board-toolbar">
        <div className="search-field">
          <Search size={15} aria-hidden />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </div>
        {stage === "all" && (
          <label className="muted row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => {
                setShowArchived(e.target.checked);
                clear();
              }}
            />{" "}
            Show archived and low scores ({archivedCount})
          </label>
        )}
        <button type="button" onClick={() => setCreating(true)}>
          <Plus size={16} aria-hidden /> New idea
        </button>
      </div>

      {picked.size > 0 && (
        <div
          className="card row"
          role="region"
          aria-label="Selected ideas"
          style={{ gap: 8, marginBottom: 12, padding: "8px 12px", flexWrap: "wrap" }}
        >
          <b>{picked.size} selected</b>
          {pickedIdeas.length > 0 && (
            <button type="button" className="secondary" disabled={busy} onClick={() => bulk("archive")}>
              <Archive size={15} aria-hidden /> Archive {pickedIdeas.length}
            </button>
          )}
          {pickedIdeas.length > 0 && (
            <button
              type="button"
              disabled={busy || scripting !== null || pickedIdeas.length > 5}
              title={pickedIdeas.length > 5 ? "Pick no more than 5 for one filming day" : undefined}
              onClick={scriptThem}
            >
              <FileText size={15} aria-hidden />{" "}
              {scripting ?? `Script ${Math.min(pickedIdeas.length, 5)}${pickedIdeas.length > 5 ? " (max 5)" : ""}`}
            </button>
          )}
          {pickedArchived.length > 0 && (
            <button type="button" className="secondary" disabled={busy} onClick={() => bulk("restore")}>
              <RotateCcw size={15} aria-hidden /> Restore {pickedArchived.length}
            </button>
          )}
          {!confirmDelete && (
            <button
              type="button"
              className="secondary"
              disabled={busy || pickedIdeas.length + pickedArchived.length === 0}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={15} aria-hidden /> Delete…
            </button>
          )}
          {confirmDelete && (
            <span className="row" style={{ gap: 8 }} role="alertdialog" aria-label="Confirm delete">
              <span>
                Delete {pickedIdeas.length + pickedArchived.length}{" "}
                {pickedIdeas.length + pickedArchived.length === 1 ? "idea" : "ideas"} for good? This cannot be undone.
              </span>
              <button type="button" disabled={busy} onClick={() => bulk("delete")}>
                Yes, delete
              </button>
              <button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </span>
          )}
          {pickedItems.length > pickedIdeas.length + pickedArchived.length && !confirmDelete && (
            <span className="muted">Scripted, filmed and posted items can't be archived or deleted here.</span>
          )}
          <button type="button" className="secondary" onClick={clear} style={{ marginLeft: "auto" }}>
            Clear
          </button>
        </div>
      )}

      {stage === "all" ? (
        <div
          className="board scroll-cols"
          style={{ gridTemplateColumns: `repeat(${showArchived ? 5 : 4}, minmax(220px, 1fr))` }}
        >
          {[...CONTENT_STATUSES, ...(showArchived ? [ARCHIVED] : [])].map((status) => {
            const isArchive = status === ARCHIVED;
            const meta = isArchive ? ARCHIVED_META : CONTENT_META[status as ContentStatus];
            const col = items.filter((i) => i.status === status && matches(i));
            const selectable = status === "Idea" || isArchive;
            return (
              <section
                key={status}
                aria-label={`${meta.label}, ${col.length} items`}
                className={`lane${over === status ? " over" : ""}`}
                onDragOver={isArchive ? undefined : (e) => {
                  e.preventDefault();
                  setOver(status);
                }}
                onDragLeave={() => setOver(null)}
                onDrop={isArchive ? undefined : (e) => {
                  e.preventDefault();
                  setOver(null);
                  move(Number(e.dataTransfer.getData("text/plain")), status);
                }}
              >
                <LaneTab colour={meta.colour} label={meta.label} count={col.length} hint={meta.hint} />
                {selectable && col.length > 0 && (
                  <label className="muted row" style={{ gap: 6, padding: "0 4px 6px" }}>
                    <input
                      type="checkbox"
                      checked={col.every((i) => picked.has(i.id))}
                      onChange={() => toggleAll(isArchive ? col : visibleIdeas)}
                      aria-label={`Select all ${col.length} in ${meta.label}`}
                    />
                    Select all {col.length}
                  </label>
                )}
                <div className="lane-body">
                  {col.length === 0 && <div className="drop-hint">{needle ? "No matches" : "Drop an item here"}</div>}
                  {col.map((i) => renderCard(i, selectable, isArchive))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        (() => {
          const isArchive = stage === ARCHIVED;
          const meta = isArchive ? ARCHIVED_META : CONTENT_META[stage as ContentStatus] ?? ARCHIVED_META;
          const col = items.filter((i) => i.status === stage && matches(i));
          const selectable = stage === "Idea" || isArchive;
          return (
            <section aria-label={`${meta.label}, ${col.length} items`} className="stage-screen">
              <LaneTab colour={meta.colour} label={meta.label} count={col.length} hint={meta.hint} />
              {selectable && col.length > 0 && (
                <div className="row" style={{ padding: "0 4px 10px" }}>
                  <label className="muted row" style={{ gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={col.every((i) => picked.has(i.id))}
                      onChange={() => toggleAll(isArchive ? col : visibleIdeas)}
                      aria-label={`Select all ${col.length} in ${meta.label}`}
                    />
                    Select all {col.length}
                  </label>
                </div>
              )}
              {col.length === 0 ? (
                <div className="card" style={{ padding: "48px 16px", textAlign: "center", background: "var(--surface)" }}>
                  <p style={{ fontWeight: 600, margin: "0 0 6px" }}>
                    {needle ? "No matching items found" : `No items in ${meta.label}`}
                  </p>
                  <p className="muted" style={{ margin: 0 }}>
                    {stage === "Idea" && "Generate new ideas above or add one with 'New idea'."}
                    {stage === "Scripted" && "Pick ideas in the Ideas tab and click 'Script' to prepare them for filming."}
                    {stage === "Filmed" && "Once you record an idea on Filming day, move it here."}
                    {stage === "Posted" && "When a video is published, move it here to track performance."}
                    {stage === ARCHIVED && "Ideas set aside or archived appear here."}
                  </p>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12, alignItems: "stretch" }}>
                  {col.map((i) => renderCard(i, selectable, isArchive))}
                </div>
              )}
            </section>
          );
        })()
      )}

      {openId !== null && (
        <ContentDrawer
          itemId={openId}
          status={items.find((i) => i.id === openId)?.status}
          openNumbers={openId === openItem ? openNumbers : null}
          onMove={move}
          onClose={closeDrawer}
          onChanged={() => router.refresh()}
        />
      )}
      {posting !== null &&
        (() => {
          const it = items.find((x) => x.id === posting);
          return it ? (
            <PostedDialog
              itemId={it.id}
              idea={it.idea}
              hook={it.hook}
              hookAlt={it.hookAlt ?? null}
              platforms={platforms}
              onClose={() => setPosting(null)}
              onDone={() => {
                setPosting(null);
                router.refresh();
              }}
            />
          ) : null;
        })()}
      {creating && (
        <NewIdeaDialog
          niches={niches}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.refresh();
            setOpenId(id);
          }}
        />
      )}
    </>
  );
}
