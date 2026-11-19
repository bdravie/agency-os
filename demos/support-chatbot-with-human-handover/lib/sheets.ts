// Sends a ticket to the Google Sheet. The sheet has a small Apps Script (apps-script/Code.gs) published as a
// web app; we POST the ticket as JSON with a shared secret and it appends one row to the Tickets tab.
// No Google Cloud project, service account or key file is needed: the script runs as the sheet's owner.
import { REASON_TEXT, type Ticket } from "./types";

export type SheetResult = { status: Ticket["sheet"]; error?: string };

/** Only Apps Script web app addresses (or a local stand-in while testing) may receive tickets. */
export function allowedSheetUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && u.hostname === "script.google.com" && /^\/macros\/s\/[\w-]+\/exec$/.test(u.pathname)) return true;
    return process.env.SUPPORT_DEMO_LOCAL_SHEET === "1" && u.protocol === "http:" && u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/** The row, in the same column order as the Tickets tab (see TICKET_HEADERS in Code.gs). */
export function sheetRow(t: Ticket) {
  return {
    ticket_id: t.id,
    created: t.createdAt,
    reason: REASON_TEXT[t.reason],
    topic: t.topic,
    first_name: t.firstName,
    order_number: t.orderNumber,
    summary: t.summary,
    last_question: t.lastQuestion,
    articles_tried: t.articlesTried.join(", "),
    flow: t.flow ?? "",
    transcript: t.transcript,
    status: "Open",
  };
}

export async function sendToSheet(t: Ticket): Promise<SheetResult> {
  const url = process.env.SHEETS_WEBHOOK_URL?.trim();
  const secret = process.env.SHEETS_WEBHOOK_SECRET?.trim();
  if (!url || !secret) return { status: "not_set_up" };
  if (!allowedSheetUrl(url)) return { status: "failed", error: "SHEETS_WEBHOOK_URL must be the Apps Script web app address ending in /exec" };
  try {
    // Apps Script answers a POST with a redirect to a one-time script.googleusercontent.com address that
    // holds the reply, so the request must follow redirects (fetch's default). Apps Script cannot read
    // request headers, which is why the secret travels in the body.
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret, row: sheetRow(t) }),
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let body: { ok?: boolean; error?: string } = {};
    try { body = JSON.parse(text); } catch { /* an HTML error page from Google */ }
    if (res.ok && body.ok) return { status: "sent" };
    return { status: "failed", error: body.error ?? `HTTP ${res.status}: the sheet did not confirm the row` };
  } catch (e) {
    return { status: "failed", error: (e as Error).message };
  }
}
