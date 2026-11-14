"use server";

import { revalidatePath } from "next/cache";
import { requireLogin } from "./auth";
import { logActivity } from "./activity";
import { nicheTable } from "./nicheGate";
import { checkOwnerPassword, passwordLocked } from "./ownerPassword";
import { checkOffer, checkOverrideReason, checkPromise, pickChannels, pickPlatforms, statusChangeCheck, statusLogText, wordingChanges } from "./nicheChange";
import { configProblems, type NicheStatus } from "./nicheStatus";
import { freshTable, payingClients, saveNiche } from "./nicheScreen";

// The Niches screen's actions (docs/NICHE_FOCUS_PLAN.md, N3). Rules in nicheChange.ts; where a change is saved in nicheScreen.ts.
// Moving a niche to seeding, audience or parked only tightens, so it needs no password. Moving one to active is refused while 2 are active,
// and needs the owner's password and reason unless an active niche already has 2 paying clients (the unlock rule).
// Nothing here sends anything: a status only decides what the CRM lets you draft and log, on top of lead_gate.

export type NicheActionResult = { ok?: string; error?: string; needsOverride?: string };

function refresh() { revalidatePath("/", "layout"); }

export async function changeNicheStatusAction(key: string, to: string, override?: { reason: string; password: string }): Promise<NicheActionResult> {
  await requireLogin();
  try {
    const t = await nicheTable();
    const n = t[key];
    const check = statusChangeCheck(t, key, to, await payingClients());
    if ("refuse" in check) return { error: check.refuse };
    let reason: string | undefined;
    if ("needsOverride" in check) {
      if (!override) return { needsOverride: check.needsOverride };
      const locked = passwordLocked("Unlocking a niche early");
      if (locked) return { error: locked };
      const r = checkOverrideReason(override.reason);
      if (r.error) return { error: r.error };
      const wrong = await checkOwnerPassword(override.password, "Unlocking a niche early");
      if (wrong) return { error: wrong === "Wrong password." ? `Wrong password. ${n.label} was not made active.` : wrong };
      reason = r.reason;
    }
    const from = n.status, status = to as NicheStatus;
    const failed = await saveNiche(n, { status });
    if (failed) return { error: failed };
    const after = await freshTable();   // also copies the new status into niche_rules, so the send guard follows at once
    const body = statusLogText(n.label, from, status, reason);
    if (reason) await logActivity("niche_unlock_override", { channel: "manual", body, meta: { niche: key, from, to: status, reason } });
    else await logActivity("niche_status_changed", { channel: "manual", body, meta: { niche: key, from, to: status } });
    refresh();
    const warn = configProblems(after).filter((p) => p.startsWith(n.label));
    return { ok: `${n.label} is now ${status}.${warn.length ? ` ${warn.join(" ")}` : ""}` };
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}

/** The promise, offer, channels and platforms of a niche. A parked niche's channels and platforms are not shown, so they are left as they are. */
export async function saveNicheDetailsAction(key: string, form: { promise: string; offer: string; channels?: string[]; platforms?: string[] }): Promise<NicheActionResult> {
  await requireLogin();
  try {
    const n = (await nicheTable())[key];
    if (!n) return { error: "That niche is not in your list." };
    const p = checkPromise(form.promise);
    if (p.error) return { error: p.error };
    const o = checkOffer(form.offer);
    if (o.error) return { error: o.error };
    const lists = n.status !== "parked";
    const channels = lists ? pickChannels(form.channels ?? []) : n.channels, platforms = lists ? pickPlatforms(form.platforms ?? []) : n.platforms;
    const diff = wordingChanges(n, { promise: p.value!, offer: o.value!, channels, platforms });
    if (!diff.text.length) return { ok: "Nothing changed." };
    const failed = await saveNiche(n, {
      promise: n.promise !== p.value ? p.value : undefined, offer: n.offer !== o.value ? o.value : undefined,
      channels: lists && diff.lists ? channels : undefined, platforms: lists && diff.lists ? platforms : undefined,
    });
    if (failed) return { error: failed };
    await freshTable();
    // An offer or promise change is logged on its own (the stop rule in N4 counts touches from the latest one); channel changes separately.
    const offerLines = diff.text.filter((l) => l.startsWith("Promise") || l.startsWith("Offer")), listLines = diff.text.filter((l) => !offerLines.includes(l));
    if (offerLines.length) await logActivity("niche_offer_changed", { channel: "manual", body: `${n.label}: ${offerLines.join("; ")}`, meta: { niche: key } });
    if (listLines.length) await logActivity("niche_channels_changed", { channel: "manual", body: `${n.label}: ${listLines.join("; ")}`, meta: { niche: key } });
    refresh();
    return { ok: `Saved ${n.label}.` };
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}
