// Turns the parts of the lead_suitability view into the plain-words reasons shown in the tooltip. The score and the tier come from the database, never from here.
export type SuitabilityRow = { suitability: number; tier: string; excluded: boolean; fit_pts: number; eligible_pts: number; website_pts: number; email_pts: number; phone_pts: number; rating_pts: number; reviews_pts: number; fit_score: number | null; maps_rating: number | null; maps_reviews: number | null };

export function explainSuitability(r: SuitabilityRow): string[] {
  if (r.excluded) return ["Skipped: it can't be contacted (not an eligible company, opted out or suppressed) or has filing problems"];
  const out: string[] = [];
  const add = (pts: number, text: string) => out.push(pts > 0 ? `+${pts} ${text}` : text);
  add(r.fit_pts, r.fit_score === null ? "Companies House size and health not checked yet" : `Companies House size and filing health (fit ${r.fit_score}/100)`);
  add(r.eligible_pts, r.eligible_pts ? "verified active limited company" : "not verified as a limited company yet");
  add(r.email_pts, r.email_pts ? "generic email on file" : "no generic email yet");
  add(r.website_pts, r.website_pts ? "has a website" : "no website saved");
  add(r.phone_pts, r.phone_pts ? "phone number on file" : "no phone saved");
  if (r.maps_rating !== null) add(r.rating_pts, `Google rating ${r.maps_rating}`);
  if (r.maps_reviews !== null) add(r.reviews_pts, `${r.maps_reviews} Google reviews`);
  return out;
}

export const TIER_TONE: Record<string, "good" | "blue" | "neutral" | "bad"> = { A: "good", B: "blue", C: "neutral", Skip: "bad" };
