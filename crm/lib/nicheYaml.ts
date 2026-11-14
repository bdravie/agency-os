import { parse } from "yaml";

// Writes a change to one niche back into config/niches.yaml (docs/NICHE_FOCUS_PLAN.md, N3). Pure: text in, text out, so it can be tested.
// The yaml stays the one place a yaml niche's status is set: the database (niche_rules) and the Python tools read it from there.
// Only the lines of the changed fields on that niche are touched (a yaml library would reformat the whole file), their trailing comments
// are kept, and the result is read back: if the niche does not carry exactly the new values, or anything else moved, nothing is written.

export type NichePatch = { status?: string; promise?: string; offer?: string; channels?: string[]; platforms?: string[] };

/** A value as this file writes it: plain words for status, a one-line list for channels and platforms, a double-quoted sentence otherwise. */
function render(field: string, value: string | string[]): string {
  if (Array.isArray(value)) return `[${value.join(", ")}]`;
  return field === "status" ? value : JSON.stringify(value);
}

/** Where a one-line yaml value ends (so a trailing comment after it can be kept), or -1 if it is not one we can safely replace. */
function valueEnd(s: string): number {
  let i = 0;
  while (s[i] === " ") i++;
  if (i >= s.length || s[i] === "#") return -1;                 // empty, or the value is on the following lines
  if (s[i] === '"' || s[i] === "'") {
    const q = s[i];
    for (let j = i + 1; j < s.length; j++) {
      if (q === '"' && s[j] === "\\") { j++; continue; }
      if (s[j] === q) { if (q === "'" && s[j + 1] === "'") { j++; continue; } return j + 1; }
    }
    return -1;
  }
  if (s[i] === "[") {
    let inQ: string | null = null;
    for (let j = i + 1; j < s.length; j++) {
      const c = s[j];
      if (inQ) { if (c === "\\" && inQ === '"') j++; else if (c === inQ) inQ = null; continue; }
      if (c === '"' || c === "'") inQ = c; else if (c === "[" || c === "{") return -1; else if (c === "]") return j + 1;
    }
    return -1;
  }
  const hash = s.search(/\s#/);
  return hash < 0 ? s.trimEnd().length : s.slice(0, hash).trimEnd().length;
}

export function applyNicheEdit(text: string, key: string, patch: NichePatch): { text?: string; error?: string } {
  let before: any;
  try { before = parse(text); } catch (e) { return { error: `config/niches.yaml does not parse (${String((e as Error).message).split("\n")[0]}), so nothing was changed. Fix it by hand first.` }; }
  if (!before?.niches?.[key] || typeof before.niches[key] !== "object") return { error: `“${key}” is not a niche in config/niches.yaml.` };

  const lines = text.split("\n");
  const top = lines.findIndex((l) => /^niches:\s*(#.*)?$/.test(l));
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = top < 0 ? -1 : lines.findIndex((l, i) => i > top && new RegExp(`^  ${esc}:\\s*(#.*)?$`).test(l));
  if (start < 0) return { error: `Could not find the block for “${key}” in config/niches.yaml, so nothing was changed. Edit it by hand.` };
  let end = start + 1;
  while (end < lines.length && !/^ {0,2}\S/.test(lines[end])) end++;   // the block runs until the next niche or top-level key

  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const at = lines.findIndex((l, i) => i > start && i < end && l.startsWith(`    ${field}:`));
    const line = `    ${field}: ${render(field, value)}`;
    if (at < 0) { lines.splice(start + 1, 0, line); end++; continue; }
    const rest = lines[at].slice(`    ${field}:`.length);
    const stop = valueEnd(rest);
    if (stop < 0) return { error: `${key}.${field} in config/niches.yaml is not written on one line, so it was not changed. Edit it by hand.` };
    lines[at] = line + rest.slice(stop);
  }
  const out = lines.join("\n");

  let after: any;
  try { after = parse(out); } catch { return { error: "The change would have broken config/niches.yaml, so nothing was changed." }; }
  for (const [field, value] of Object.entries(patch)) {
    if (value !== undefined && JSON.stringify(after?.niches?.[key]?.[field]) !== JSON.stringify(value)) return { error: `Writing ${field} for ${key} did not read back the same, so nothing was changed.` };
  }
  const strip = (y: any) => { const c = structuredClone(y); for (const f of Object.keys(patch)) delete c.niches[key][f]; return JSON.stringify(c); };
  if (strip(before) !== strip(after)) return { error: "Writing the change would have altered other parts of config/niches.yaml, so nothing was changed." };
  return { text: out };
}
