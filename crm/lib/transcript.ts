// Turning an uploaded transcript into clean, privacy-safe text. Pure functions (no database, no AI).
//
// What happens before anything is stored or sent to Claude:
//   1. .vtt / .srt subtitle files become plain "Speaker: text" lines (timestamps and tags removed)
//   2. email addresses and phone numbers are masked
//   3. speaker names become "Me" / "Prospect" (not for pasted notes)
// The original upload is never kept.

export type Source = "transcript" | "vtt" | "notes";

const TIMESTAMP = /^\s*(?:\d+\s*)?\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}.*$/;

/** WebVTT / SRT -> plain lines. Handles <v Name>text</v> cues, "Name: text" cues, cue numbers, NOTE blocks and tags. */
export function parseSubtitles(raw: string): string {
  const blocks = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split(/\n{2,}/);
  const lines: { who: string | null; text: string }[] = [];
  for (const block of blocks) {
    const rows = block.split("\n").filter((r) => r.trim() !== "");
    if (rows.length === 0 || /^(WEBVTT|NOTE|STYLE|REGION)\b/.test(rows[0])) continue;
    const at = rows.findIndex((r) => TIMESTAMP.test(r) || /-->/.test(r));
    const cue = at >= 0 ? rows.slice(at + 1) : rows;
    for (const row of cue) {
      let who: string | null = null;
      let text = row;
      const v = text.match(/^<v(?:\.[^ >]+)?\s+([^>]+)>/);
      if (v) { who = v[1].trim(); text = text.replace(/^<v[^>]*>/, ""); }
      text = text.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
      if (!text) continue;
      const m = !who ? text.match(/^([A-Za-z][A-Za-z' .-]{0,40}):\s+(.*)$/) : null;
      if (m) { who = m[1].trim(); text = m[2]; }
      lines.push({ who, text });
    }
  }
  // Merge consecutive lines from the same speaker into one paragraph.
  const out: string[] = [];
  let cur: { who: string | null; text: string } | null = null;
  for (const l of lines) {
    if (cur && (l.who === null || l.who === cur.who)) cur.text += ` ${l.text}`;
    else { if (cur) out.push(cur.who ? `${cur.who}: ${cur.text}` : cur.text); cur = { ...l }; }
  }
  if (cur) out.push(cur.who ? `${cur.who}: ${cur.text}` : cur.text);
  return out.join("\n");
}

export const looksLikeSubtitles = (raw: string, filename?: string) => /\.(vtt|srt)$/i.test(filename ?? "") || /^﻿?WEBVTT/.test(raw.trimStart()) || /\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}\s*-->/.test(raw);

/** Mask email addresses and phone numbers. Returns the text and how many were masked. */
export function maskContacts(text: string): { text: string; masked: number } {
  let masked = 0;
  const out = text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, () => { masked++; return "[email]"; })
    .replace(/(?:\+\d{1,3}[\s-]?\(?\d{1,4}\)?|\(?\b0\d{2,4}\)?)(?:[\s-]?\d){6,10}\b/g, () => { masked++; return "[phone]"; });
  return { text: out, masked };
}

const LABEL = /^(\s*[\[(]?\d{1,2}:\d{2}(?::\d{2})?[\])]?\s*)?([A-Za-z][A-Za-z' .-]{0,40}):\s+/;

/** Replace speaker labels: your own name becomes "Me", everyone else "Prospect" (or "Prospect 1", "Prospect 2"...). */
export function anonymiseSpeakers(text: string, ownName: string | null): { text: string; speakers: number } {
  const lines = text.split("\n");
  const counts = new Map<string, number>();
  for (const l of lines) { const m = l.match(LABEL); if (m) counts.set(m[2].trim(), (counts.get(m[2].trim()) ?? 0) + 1); }
  // A real speaker label appears more than once; "Note:" or "Action:" in a single line is left alone.
  const speakers = [...counts.entries()].filter(([, n]) => n >= 2).map(([name]) => name);
  const own = (ownName ?? "").toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  const isMe = (name: string) => own.length > 0 && name.toLowerCase().split(/\s+/).some((t) => own.includes(t));
  const others = speakers.filter((s) => !isMe(s));
  const label = new Map<string, string>(speakers.map((s) => [s, isMe(s) ? "Me" : others.length === 1 ? "Prospect" : `Prospect ${others.indexOf(s) + 1}`]));
  const next = lines.map((l) => {
    const m = l.match(LABEL);
    if (!m || !label.has(m[2].trim())) return l;
    return `${label.get(m[2].trim())}: ${l.slice(m[0].length)}`;
  });
  // The speakers' names also get said out loud ("Thanks for joining, Sarah"). We know them from the labels, so mask them there too.
  const tokens = [...new Set(speakers.flatMap((s) => s.split(/[\s.-]+/)).filter((t) => t.length >= 3))].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const spoken = tokens.length ? new RegExp(`\\b(?:${tokens.join("|")})\\b`, "g") : null;
  const masked = spoken ? next.map((l) => { const m = l.match(/^(Me|Prospect(?: \d+)?): /); return m ? m[0] + l.slice(m[0].length).replace(spoken, "[name]") : l.replace(spoken, "[name]"); }) : next;
  return { text: masked.join("\n"), speakers: speakers.length };
}

export type Prepared = { text: string; source: Source; chars: number; masked: number; speakers: number; tooLong: boolean };
export const MAX_CHARS = 80_000;

/** Everything done before saving: parse, mask contact details, replace speaker names. */
export function prepareTranscript(raw: string, o: { filename?: string; asNotes?: boolean; anonymise?: boolean; ownName?: string | null }): Prepared {
  const isSubs = !o.asNotes && looksLikeSubtitles(raw, o.filename);
  const source: Source = o.asNotes ? "notes" : isSubs ? "vtt" : "transcript";
  let text = (isSubs ? parseSubtitles(raw) : raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n")).trim();
  const m = maskContacts(text);
  text = m.text;
  let speakers = 0;
  if (source !== "notes" && o.anonymise !== false) { const a = anonymiseSpeakers(text, o.ownName ?? null); text = a.text; speakers = a.speakers; }
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, source, chars: text.length, masked: m.masked, speakers, tooLong: text.length > MAX_CHARS };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9£%\s]/g, " ").replace(/\s+/g, " ").trim();

/** A quote only counts if it really appears in the transcript (ignoring case and punctuation). Guards against invented quotes. */
export function verifyQuote(quote: string | null | undefined, transcript: string): string | null {
  if (!quote) return null;
  const q = norm(quote);
  return q.length >= 8 && norm(transcript).includes(q) ? quote.trim().slice(0, 300) : null;
}
