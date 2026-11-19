// Turns a chat into a ticket: masked transcript, a short summary for the team, saved locally and
// (once set up) added as a row in the Google Sheet through its Apps Script web app.
import { askJson, hasKey, prompt, SHOP } from "./claude";
import { sendToSheet } from "./sheets";
import { addTicket, updateTicket } from "./store";
import { clip, maskContactDetails } from "./text";
import { REASON_TEXT, type Ticket, type Turn } from "./types";

export const TOPICS = ["Delivery", "Returns", "Account", "Payments", "Opening hours", "Other"] as const;

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    topic: { type: "string", enum: [...TOPICS] },
    next_step: { type: "string" },
  },
  required: ["summary", "topic", "next_step"],
  additionalProperties: false,
} as const;

export function transcriptText(turns: Turn[]): string {
  return turns
    .map((t) => {
      const who = t.who === "customer" ? "Customer" : "Bot";
      const src = t.sources?.length ? ` [source: ${t.sources.join(", ")}]` : "";
      return `${who}: ${maskContactDetails(t.text).text}${src}`;
    })
    .join("\n");
}

/** Without an API key the summary is put together from the chat itself, so the handover still works offline. */
function plainSummary(turns: Turn[], reason: Ticket["reason"]) {
  const asked = turns.filter((t) => t.who === "customer").map((t) => t.text);
  return {
    summary: `${REASON_TEXT[reason]}. Customer's last message: "${maskContactDetails(asked.at(-1) ?? "").text}".`,
    topic: "Other",
    next_step: "Read the chat below and reply to the customer.",
  };
}

export async function createTicket(input: {
  turns: Turn[];
  reason: Ticket["reason"];
  firstName: string;
  orderNumber: string;
  flow?: string;
}): Promise<Ticket> {
  const transcript = clip(transcriptText(input.turns));
  const articlesTried = [...new Set(input.turns.flatMap((t) => t.sources ?? []))];
  const lastQuestion = maskContactDetails([...input.turns].reverse().find((t) => t.who === "customer")?.text ?? "").text;

  let note = plainSummary(input.turns, input.reason);
  if (hasKey()) {
    try {
      const system = prompt("summary", { SHOP, REASON: REASON_TEXT[input.reason], TRANSCRIPT: transcript });
      note = (await askJson<typeof note>(system, "Write the handover note.", SCHEMA)).data;
    } catch {
      // Keep the plain summary: a handover must never fail because the AI step did.
    }
  }
  // The prompt asks for 2 sentences; code makes sure, so the Sheet's summary column stays scannable.
  const short = note.summary.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  const summary = maskContactDetails(`${short} Next step: ${note.next_step}`).text;

  const ticket = addTicket({
    reason: input.reason,
    firstName: input.firstName,
    orderNumber: input.orderNumber,
    topic: note.topic,
    summary,
    lastQuestion,
    articlesTried,
    flow: input.flow,
    transcript,
    sheet: "not_set_up",
    status: "open",
  });

  const sheet = await sendToSheet(ticket);
  updateTicket(ticket.id, { sheet: sheet.status, sheetError: sheet.error });
  return { ...ticket, sheet: sheet.status, sheetError: sheet.error };
}
