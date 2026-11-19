import { NextResponse } from "next/server";
import { createTicket } from "@/lib/handover";
import { cleanFirstName, cleanOrderNumber } from "@/lib/text";
import type { Ticket, Turn } from "@/lib/types";

export const dynamic = "force-dynamic";

const REASONS: Ticket["reason"][] = ["asked_for_person", "two_failed_answers", "unhappy", "flow_not_fixed"];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    turns?: Turn[]; reason?: Ticket["reason"]; firstName?: string; orderNumber?: string; flow?: string;
  };
  const firstName = cleanFirstName(String(body.firstName ?? ""));
  if (firstName === null) return NextResponse.json({ error: "Please give a first name only (letters, up to 30)." }, { status: 400 });
  const orderNumber = cleanOrderNumber(String(body.orderNumber ?? ""));
  if (orderNumber === null) return NextResponse.json({ error: "Order numbers look like TH-10482." }, { status: 400 });
  const reason = REASONS.includes(body.reason as Ticket["reason"]) ? (body.reason as Ticket["reason"]) : "asked_for_person";
  const turns = (Array.isArray(body.turns) ? body.turns : [])
    .slice(-40)
    .map((t) => ({ who: t.who === "bot" ? "bot" : "customer", text: String(t.text ?? "").slice(0, 2000), sources: t.sources }) as Turn);
  const ticket = await createTicket({ turns, reason, firstName, orderNumber, flow: body.flow ? String(body.flow).slice(0, 200) : undefined });
  return NextResponse.json({ ticket: { id: ticket.id, sheet: ticket.sheet } });
}
