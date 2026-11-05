"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AUTOSAVE_MS, type FlowchartFields } from "@/lib/flowchartMath";
import type { FlowchartRow } from "@/lib/flowchartApi";

export type SaveState =
  | { status: "saved" } | { status: "unsaved" } | { status: "saving" }
  | { status: "refused"; message: string }    // the server said no, and saying it again won't help until something changes
  | { status: "failed"; message: string }     // network or server trouble: retried by itself
  | { status: "conflict" };                   // changed somewhere else since this tab loaded it

const RETRY_MS = 10_000;
const KEEPALIVE_MAX = 60_000;   // browsers refuse keepalive requests over 64 KB

/** Saves the fields a few seconds after the last change, one request at a time. Nothing is lost if a change arrives while a save is under way. */
export function useAutosave(id: number, initial: FlowchartFields, initialVersion: string) {
  const [state, setState] = useState<SaveState>({ status: "saved" });
  const latest = useRef(initial);
  const savedText = useRef(JSON.stringify(initial));
  const version = useRef(initialVersion);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef(false);
  const inConflict = useRef(false);
  const theirs = useRef<FlowchartRow | null>(null);

  const isUnsaved = useCallback(() => JSON.stringify(latest.current) !== savedText.current, []);

  const save = useCallback(async ({ overwrite = false } = {}) => {
    clearTimeout(timer.current);
    if (inFlight.current || !isUnsaved() || (inConflict.current && !overwrite)) return;
    const text = JSON.stringify(latest.current);
    inFlight.current = true;
    setState({ status: "saving" });
    try {
      const res = await fetch(`/api/flowcharts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...latest.current, ...(overwrite ? {} : { baseVersion: version.current }) }),
        keepalive: new TextEncoder().encode(text).length < KEEPALIVE_MAX,   // lets a last save finish as the page closes
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        version.current = body.flowchart.version;
        savedText.current = text;
        inConflict.current = false;
        setState({ status: isUnsaved() ? "unsaved" : "saved" });
      } else if (res.status === 409) {
        inConflict.current = true;
        theirs.current = body.flowchart;
        setState({ status: "conflict" });
      } else if (res.status >= 500) {
        setState({ status: "failed", message: body.error ?? "The server had a problem." });
        timer.current = setTimeout(() => void save(), RETRY_MS);
      } else {
        setState({ status: "refused", message: body.error ?? "This could not be saved." });
      }
    } catch {
      setState({ status: "failed", message: "Can't reach the CRM." });
      timer.current = setTimeout(() => void save(), RETRY_MS);
    } finally {
      inFlight.current = false;
    }
    // Typed during that save, whatever its answer: the timer for it may have fired and been ignored while the save was under way.
    if (JSON.stringify(latest.current) !== text && isUnsaved() && !inConflict.current) void save();
  }, [id, isUnsaved]);

  const change = useCallback((patch: Partial<FlowchartFields>) => {
    latest.current = { ...latest.current, ...patch };
    clearTimeout(timer.current);
    if (inConflict.current) return;
    if (!isUnsaved()) { setState({ status: "saved" }); return; }
    setState({ status: "unsaved" });
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
  }, [isUnsaved, save]);

  /** Takes the other copy and drops this tab's changes. Returns it so the editor can show it. */
  const acceptTheirs = useCallback(() => {
    const row = theirs.current;
    if (!row) return null;
    const fields: FlowchartFields = { title: row.title, code: row.code, theme: row.theme };
    latest.current = fields;
    savedText.current = JSON.stringify(fields);
    version.current = row.version;
    inConflict.current = false;
    setState({ status: "saved" });
    return fields;
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { state, change, save, isUnsaved, acceptTheirs };
}
