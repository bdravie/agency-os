// Pure rules for reading a workflow file (no AI, no database, no network), so they can be tested on their own.
// An n8n export or a Make blueprint becomes one small outline: ordered steps (trigger, actions, branches), the apps used and how
// the steps connect. Only that outline is ever kept. Settings inside a node (webhook paths, credential names, message text, email
// addresses) are never read into it, apart from the plain resource and operation names that say what a step does.

export type Platform = "n8n" | "make";
export type StepKind = "trigger" | "action" | "branch" | "logic" | "ai";
export type Step = {
  id: string; name: string; kind: StepKind;
  app: string | null;            // the product the step talks to, or null for built-in logic
  action: string | null;         // what it does there, when the file says so in plain words
  uses: string[];                // things attached to an AI step (its model, memory, tools)
  next: { to: string; label: string | null }[];
};
export type ParsedWorkflow = { platform: Platform; name: string; steps: Step[]; apps: string[]; dropped: number };

export const MAX_STEPS = 40;
export const MAX_FILE_CHARS = 1_500_000;

const CONTACT = /[\w.+-]+@[\w-]+\.[\w.-]+|\+?\d[\d\s().-]{8,}\d|https?:\/\/\S+/g;
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(CONTACT, "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Names that do not read well when split at their capitals. */
const APP_NAMES: Record<string, string> = {
  openai: "OpenAI", openaiassistant: "OpenAI", lmchatopenai: "OpenAI", lmchatanthropic: "Anthropic", anthropic: "Anthropic", lmchatgooglegemini: "Google Gemini",
  googlegemini: "Google Gemini", hubspot: "HubSpot", github: "GitHub", gitlab: "GitLab", whatsapp: "WhatsApp", linkedin: "LinkedIn", youtube: "YouTube",
  tiktok: "TikTok", quickbooks: "QuickBooks", clickup: "ClickUp", activecampaign: "ActiveCampaign", woocommerce: "WooCommerce", wordpress: "WordPress",
  mysql: "MySQL", postgres: "Postgres", mongodb: "MongoDB", awss3: "Amazon S3", s3: "Amazon S3", microsoftoutlook: "Microsoft Outlook", microsoftexcel: "Microsoft Excel",
  microsoftteams: "Microsoft Teams", microsoftonedrive: "Microsoft OneDrive", gohighlevel: "GoHighLevel", highlevel: "GoHighLevel", elevenlabs: "ElevenLabs",
  emailsend: "Email", emailreadimap: "Email inbox", email: "Email", imap: "Email inbox", smtp: "Email", twilio: "Twilio", gmail: "Gmail", xero: "Xero",
  calcom: "Cal.com", calendly: "Calendly", typeform: "Typeform", jotform: "Jotform", pipedrive: "Pipedrive", salesforce: "Salesforce", zohocrm: "Zoho CRM",
  mailchimp: "Mailchimp", hubspotcrm: "HubSpot", openrouter: "OpenRouter", googlesheets: "Google Sheets", googledrive: "Google Drive", sendgrid: "SendGrid", shopify: "Shopify", stripe: "Stripe", paypal: "PayPal", notion: "Notion", airtable: "Airtable", slack: "Slack",
  telegram: "Telegram", discord: "Discord", trello: "Trello", asana: "Asana", jira: "Jira", supabase: "Supabase", baserow: "Baserow", nocodb: "NocoDB",
  rssfeedread: "RSS feed", rss: "RSS feed", ftp: "FTP", ssh: "SSH", graphql: "GraphQL", facebookleadads: "Facebook Lead Ads", facebookgraphapi: "Facebook",
  agent: "AI agent", chainllm: "AI step", chainsummarization: "AI summary", informationextractor: "AI extraction", textclassifier: "AI classifier",
  sentimentanalysis: "AI sentiment check", outputparserstructured: "Structured output", memorybufferwindow: "Conversation memory",
};
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const words = (s: string) => s.replace(/[-_.]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/\s+/g, " ").trim();
const sentence = (s: string) => { const w = words(s).toLowerCase(); return w ? w[0].toUpperCase() + w.slice(1) : ""; };
const title = (s: string) => words(s).split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");

/** "googleSheetsTrigger" is Google Sheets, "google-sheets" is Google Sheets. */
export function appName(raw: string): string {
  const base = raw.replace(/(?:Trigger|Tool)$/i, "").replace(/^(?:lmChat|lm|embeddings|vectorStore)(?=[A-Z])/, "") || raw;
  return APP_NAMES[key(base)] ?? title(base);
}

// Built-in n8n nodes that shape or route data and talk to nothing outside the workflow.
const N8N_LOGIC = new Set(["set", "editfields", "code", "function", "functionitem", "merge", "noop", "splitinbatches", "wait", "itemlists", "aggregate", "filter", "sort",
  "limit", "removeduplicates", "splitout", "datetime", "crypto", "html", "markdown", "xml", "comparedatasets", "executeworkflow", "respondtowebhook", "stopanderror",
  "summarize", "renamekeys", "converttofile", "extractfromfile", "readwritefile", "executiondata", "debughelper", "movebinarydata", "spreadsheetfile", "compression"]);
const N8N_BRANCH = new Set(["if", "switch"]);
// A trigger that belongs to n8n itself and says how the workflow starts.
const N8N_STARTS: Record<string, string> = {
  webhook: "Webhook", scheduletrigger: "Schedule", cron: "Schedule", interval: "Schedule", manualtrigger: "Manual start", start: "Manual start",
  formtrigger: "Form", chattrigger: "Chat message", executeworkflowtrigger: "Called by another workflow", errortrigger: "Error in another workflow",
  emailreadimap: "Email inbox", rssfeedreadtrigger: "RSS feed",
};
const NOT_AN_APP = new Set([...Object.values(N8N_STARTS), "HTTP request", "Structured output", "Conversation memory"]);
const plainWord = (v: unknown) => (typeof v === "string" && /^[A-Za-z][A-Za-z ]{0,29}$/.test(v) ? v : "");

type N8nNode = { name: string; type: string; base: string; pkg: string; position: [number, number]; action: string | null };

function readN8n(file: any): ParsedWorkflow | null {
  const nodes: N8nNode[] = [];
  const seen = new Set<string>();
  for (const n of Array.isArray(file?.nodes) ? file.nodes : []) {
    if (typeof n?.name !== "string" || typeof n?.type !== "string" || n.disabled === true || seen.has(n.name)) continue;
    const dot = n.type.lastIndexOf(".");
    const base = n.type.slice(dot + 1), pkg = n.type.slice(0, Math.max(0, dot));
    if (key(base) === "stickynote") continue;
    seen.add(n.name);
    const op = plainWord(n.parameters?.operation), res = plainWord(n.parameters?.resource);
    const pos = Array.isArray(n.position) ? [Number(n.position[0]) || 0, Number(n.position[1]) || 0] : [0, 0];
    nodes.push({ name: n.name, type: n.type, base, pkg, position: pos as [number, number], action: op ? sentence(`${op} ${res}`) : null });
  }
  if (!nodes.length) return null;
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const main = new Map<string, { to: string; output: number }[]>(), incoming = new Set<string>(), attached = new Map<string, string[]>(), helpers = new Set<string>();
  for (const [from, kinds] of Object.entries((file?.connections ?? {}) as Record<string, any>)) {
    if (!byName.has(from) || !kinds || typeof kinds !== "object") continue;
    for (const [kind, outputs] of Object.entries(kinds as Record<string, any>)) {
      (Array.isArray(outputs) ? outputs : []).forEach((targets: any, output: number) => {
        for (const t of Array.isArray(targets) ? targets : []) {
          if (typeof t?.node !== "string" || !byName.has(t.node) || t.node === from) continue;
          if (kind === "main") { main.set(from, [...(main.get(from) ?? []), { to: t.node, output }]); incoming.add(t.node); }
          else { helpers.add(from); attached.set(t.node, [...(attached.get(t.node) ?? []), from]); }   // a model, memory or tool plugged into an AI step
        }
      });
    }
  }
  const flow = nodes.filter((n) => !helpers.has(n.name) || main.has(n.name) || incoming.has(n.name));
  const isStart = (n: N8nNode) => /trigger$/i.test(n.base) || key(n.base) in N8N_STARTS;
  const byPlace = (a: N8nNode, b: N8nNode) => a.position[0] - b.position[0] || a.position[1] - b.position[1];
  // A node with nothing in and nothing out is left over from editing, unless it is a trigger.
  const roots = flow.filter((n) => !incoming.has(n.name) && (main.has(n.name) || isStart(n))).sort((a, b) => Number(isStart(b)) - Number(isStart(a)) || byPlace(a, b));
  const order: N8nNode[] = [], visited = new Set<string>();
  const walk = (n: N8nNode) => {
    if (visited.has(n.name)) return;
    visited.add(n.name); order.push(n);
    for (const e of [...(main.get(n.name) ?? [])].sort((a, b) => a.output - b.output)) walk(byName.get(e.to)!);
  };
  roots.forEach(walk);
  if (!order.length) flow.sort(byPlace).forEach(walk);
  const kept = order.slice(0, MAX_STEPS), ids = new Map(kept.map((n, i) => [n.name, `s${i + 1}`]));
  const steps = kept.map((n): Step => {
    const k = key(n.base), edges = (main.get(n.name) ?? []).filter((e) => ids.has(e.to));
    const outputs = new Set(edges.map((e) => e.output));
    const start = !incoming.has(n.name) && isStart(n), ai = /langchain/i.test(n.pkg);
    const branch = N8N_BRANCH.has(k) || outputs.size > 1;
    const kind: StepKind = start ? "trigger" : branch ? "branch" : ai ? "ai" : N8N_LOGIC.has(k) ? "logic" : "action";
    const app = start && k in N8N_STARTS ? N8N_STARTS[k] : N8N_LOGIC.has(k) || N8N_BRANCH.has(k) ? null : k === "httprequest" ? "HTTP request" : appName(n.base);
    const label = (output: number) => (!branch ? null : k === "if" ? (output === 0 ? "Yes" : "No") : `Route ${output + 1}`);
    const next: Step["next"] = [];
    for (const e of [...edges].sort((a, b) => a.output - b.output)) if (!next.some((x) => x.to === ids.get(e.to))) next.push({ to: ids.get(e.to)!, label: label(e.output) });
    const uses = [...new Set((attached.get(n.name) ?? []).map((h) => appName(byName.get(h)!.base)))].slice(0, 6);
    return { id: ids.get(n.name)!, name: clean(n.name, 80) || app || "Step", kind, app, action: n.action, uses, next };
  });
  return finish("n8n", clean(file?.name, 120), steps, order.length - kept.length);
}

const MAKE_LOGIC = new Set(["builtin", "util", "json", "regexp", "math", "tools"]);

function readMake(file: any): ParsedWorkflow | null {
  if (!Array.isArray(file?.flow) || !file.flow.length) return null;
  const steps: Step[] = [];
  let dropped = 0;
  /** Adds a run of modules in order and returns the id of its first step, so a router can point at each of its routes. */
  const add = (flow: any[], top: boolean): string | null => {
    let first: string | null = null, prev: Step | null = null;
    for (const m of Array.isArray(flow) ? flow : []) {
      if (typeof m?.module !== "string") continue;
      if (steps.length >= MAX_STEPS) { dropped++; continue; }
      const [pkg, op = ""] = m.module.split(":");
      const router = /router/i.test(op), logic = MAKE_LOGIC.has(pkg.toLowerCase());
      const trigger: boolean = top && !steps.length;
      const app = pkg.toLowerCase() === "gateway" ? "Webhook" : pkg.toLowerCase() === "http" ? "HTTP request" : logic ? null : appName(pkg);
      const action = sentence(op.replace(/^(?:Action|Trigger|Custom|Basic)(?=[A-Z])/, "").replace(/\d+$/, "")) || null;
      const same = !!app && !!action && key(app) === key(action);
      const step: Step = {
        id: `s${steps.length + 1}`, kind: trigger ? "trigger" : router ? "branch" : logic ? "logic" : "action", app, action: router || same ? null : action, uses: [], next: [],
        name: clean(m.metadata?.designer?.name, 80) || (router ? "Router" : (same ? app : [app, action].filter(Boolean).join(": ")) || "Step"),
      };
      steps.push(step);
      first ??= step.id;
      if (prev) prev.next.push({ to: step.id, label: null });
      (Array.isArray(m.routes) ? m.routes : []).forEach((r: any, i: number) => {
        const to = add(r?.flow, false);
        if (to) step.next.push({ to, label: `Route ${i + 1}` });
      });
      prev = router ? null : step;      // a router ends its run: what follows lives inside its routes
    }
    return first;
  };
  add(file.flow, true);
  return steps.length ? finish("make", clean(file?.name, 120), steps, dropped) : null;
}

function finish(platform: Platform, name: string, steps: Step[], dropped: number): ParsedWorkflow {
  const apps = [...new Set(steps.flatMap((s) => [s.app, ...s.uses]).filter((a): a is string => !!a && !NOT_AN_APP.has(a) && !a.startsWith("AI ")))];
  return { platform, name, steps, apps, dropped: Math.max(0, dropped) };
}

/**
 * Reads pasted or uploaded text as an n8n export or a Make blueprint. Also accepts the wrappers each tool puts around its
 * files (n8n's template library, Make's blueprint download).
 */
export function parseWorkflowText(raw: string): { workflow?: ParsedWorkflow; error?: string } {
  const text = raw.trim();
  if (!text) return { error: "Paste the workflow's JSON, or choose its file." };
  if (text.length > MAX_FILE_CHARS) return { error: "That file is too large to read here (over 1.5 MB)." };
  let data: any;
  try { data = JSON.parse(text); } catch { return { error: "That isn't valid JSON. Export the workflow again (n8n: Download; Make: Export blueprint) and paste the whole file." }; }
  return parseWorkflow(data);
}

export function parseWorkflow(data: any): { workflow?: ParsedWorkflow; error?: string } {
  for (const d of [data, data?.workflow, data?.workflow?.workflow, data?.blueprint, data?.response?.blueprint, Array.isArray(data) ? data[0] : null]) {
    if (!d || typeof d !== "object") continue;
    const outer = typeof data?.name === "string" ? data.name : typeof data?.workflow?.name === "string" ? data.workflow.name : "";
    const named = typeof d.name === "string" && d.name ? d : { ...d, name: outer };
    const w = Array.isArray(d.nodes) ? readN8n(named) : Array.isArray(d.flow) ? readMake(named) : null;
    if (w) return w.steps.length >= 2 ? { workflow: w } : { error: "That workflow has only one step, so there is nothing to walk through." };
  }
  return { error: "That doesn't look like an n8n workflow or a Make blueprint (no nodes or flow found)." };
}

/** Tidies an outline read back from the database or the browser, so a saved or edited one can never hold anything but the outline. */
export function cleanParsed(v: any): ParsedWorkflow | null {
  if (!v || !Array.isArray(v.steps)) return null;
  const kinds: StepKind[] = ["trigger", "action", "branch", "logic", "ai"];
  const raw = v.steps.slice(0, MAX_STEPS).filter((s: any) => /^s\d{1,3}$/.test(s?.id ?? ""));
  const ids = new Set(raw.map((s: any) => s.id));
  const steps = raw.map((s: any): Step => ({
    id: s.id, name: clean(s.name, 80) || "Step", kind: kinds.includes(s.kind) ? s.kind : "action", app: clean(s.app, 40) || null, action: clean(s.action, 60) || null,
    uses: (Array.isArray(s.uses) ? s.uses : []).map((u: unknown) => clean(u, 40)).filter(Boolean).slice(0, 6),
    next: (Array.isArray(s.next) ? s.next : []).filter((n: any) => ids.has(n?.to) && n.to !== s.id).map((n: any) => ({ to: n.to, label: clean(n.label, 20) || null })).slice(0, 8),
  }));
  if (steps.length < 2) return null;
  return finish(v.platform === "make" ? "make" : "n8n", clean(v.name, 120), steps, Number(v.dropped) || 0);
}

const label = (s: string) => s.replace(/["[\]{}()<>|#;`\\]/g, "").replace(/\s+/g, " ").trim();

/** The outline as a Mermaid flowchart. Built in code so it always draws: a rounded box starts it, a diamond is a decision. */
export function workflowMermaid(w: ParsedWorkflow): string {
  const text = (s: Step) => { const name = label(s.name).slice(0, 48), app = s.app && s.app !== "HTTP request" && !name.toLowerCase().includes(s.app.toLowerCase()) ? label(s.app) : ""; return app ? `${name}<br/>${app}` : name; };
  const node = (s: Step) => (s.kind === "trigger" ? `${s.id}(["${text(s)}"])` : s.kind === "branch" ? `${s.id}{"${text(s)}"}` : `${s.id}["${text(s)}"]`);
  return [`flowchart ${w.steps.length > 12 ? "TD" : "LR"}`, ...w.steps.map((s) => `  ${node(s)}`),
    ...w.steps.flatMap((s) => s.next.map((n) => `  ${s.id} ${n.label ? `-->|"${label(n.label)}"|` : "-->"} ${n.to}`))].join("\n");
}

/** One plain line for a step, written by code. It is what the walkthrough shows until the AI (or the owner) words it better. */
export function plainStep(s: Step): string {
  const what = s.action && s.app ? `${s.action.toLowerCase()} in ${s.app}` : s.app ? `uses ${s.app}` : (s.action ?? "").toLowerCase();
  const lead = { trigger: "starts the workflow", branch: "decides which way to go", ai: "an AI step", logic: "", action: "" }[s.kind];
  const detail = [lead, what].filter(Boolean).join(", ");
  return `${s.name}${detail ? `: ${detail}` : ""}${s.uses.length ? ` (with ${s.uses.join(", ")})` : ""}.`;
}

/** The words a search can match a workflow on. */
export const workflowWords = (w: ParsedWorkflow) => [w.name, ...w.apps, ...w.steps.map((s) => `${s.name} ${s.action ?? ""}`)].join(" ");
