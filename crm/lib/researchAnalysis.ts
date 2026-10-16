// Pure functions for the offer-suggestion research: read facts out of a web page, merge pages, and turn facts into findings.
// No network or database here, so it is all testable. Wording is careful: absence means "not found on the pages read", never "doesn't have".

export type Social = "facebook" | "instagram" | "linkedin" | "x" | "youtube" | "tiktok";
export type PageFacts = {
  title: string | null; description: string | null; h1: string[]; h2: string[]; words: number;
  viewport: boolean; copyrightYear: number | null;
  forms: number; formKinds: string[]; telLink: boolean; phoneVisible: boolean; mailto: boolean; whatsapp: boolean;
  booking: string[]; chat: string[]; emailTools: string[]; reviewWidgets: string[]; platform: string | null;
  social: Record<Social, boolean>; ctas: string[]; blogLink: boolean; privacyLink: boolean; testimonials: boolean;
};
export type SiteSignals = { ga4?: boolean; gtm?: boolean; meta_pixel?: boolean; google_ads?: boolean; linkedin_insight?: boolean; tiktok_pixel?: boolean; hubspot?: boolean; runs_ads?: boolean };
export type PageRead = { path: string; ok: boolean; note?: string };
export type SiteFacts = PageFacts & { signals: SiteSignals; pagesRead: PageRead[] };

const BOOKING: [string, RegExp][] = [["Calendly", /calendly\.com/i], ["Cal.com", /cal\.com\//i], ["Acuity", /acuityscheduling|squarespacescheduling/i], ["Setmore", /setmore\.com/i], ["Fresha", /fresha\.com/i],
  ["Treatwell", /treatwell/i], ["Phorest", /phorest/i], ["SimplyBook.me", /simplybook/i], ["Square Appointments", /squareup\.com\/appointments|square\.site/i], ["Mindbody", /mindbody/i], ["Booksy", /booksy/i],
  ["Timely", /gettimely/i], ["OpenTable", /opentable/i], ["ResDiary", /resdiary/i], ["Microsoft Bookings", /bookings\.microsoft|outlook\.office365\.com\/owa\/calendar/i], ["Google appointment booking", /calendar\.google\.com\/calendar\/appointments/i]];
const CHAT: [string, RegExp][] = [["Intercom", /widget\.intercom\.io|intercomSettings/i], ["Drift", /js\.driftt\.com/i], ["Tidio", /code\.tidio\.co/i], ["LiveChat", /cdn\.livechatinc\.com/i], ["Crisp", /client\.crisp\.chat/i],
  ["Tawk.to", /embed\.tawk\.to/i], ["HubSpot chat", /js\.usemessages\.com/i], ["Zendesk chat", /static\.zdassets\.com|zopim/i], ["Freshchat", /wchat\.freshchat\.com/i]];
const EMAIL_TOOLS: [string, RegExp][] = [["Mailchimp", /list-manage\.com|mailchimp/i], ["Klaviyo", /klaviyo/i], ["ActiveCampaign", /activehosted|activecampaign/i], ["MailerLite", /mailerlite/i], ["Brevo", /sibforms|sendinblue|brevo/i]];
const REVIEWS: [string, RegExp][] = [["Trustpilot", /trustpilot\.com|tp\.widget/i], ["Reviews.io", /reviews\.io|reviews\.co\.uk/i], ["Feefo", /feefo/i], ["Checkatrade", /checkatrade/i], ["TrustATrader", /trustatrader/i],
  ["Which? Trusted Trader", /trustedtraders\.which/i], ["Google reviews widget", /elfsight|sociablekit|featurable/i]];
const PLATFORMS: [string, RegExp][] = [["Shopify", /cdn\.shopify\.com|Shopify\.theme/i], ["WooCommerce", /woocommerce/i], ["Wix", /wixstatic\.com|static\.parastorage\.com/i], ["Squarespace", /squarespace/i],
  ["Webflow", /webflow/i], ["GoDaddy Website Builder", /godaddysites|wsimg\.com/i], ["WordPress", /wp-content|wp-includes/i]];
const CTA_PHRASES = ["get a quote", "free quote", "request a quote", "book online", "book now", "book an appointment", "book a call", "request a callback", "call us", "get in touch", "contact us", "enquire now", "whatsapp us"];
const SOCIAL_HOSTS: Record<Social, RegExp> = { facebook: /facebook\.com\/(?!sharer|share|tr\?)/i, instagram: /instagram\.com\//i, linkedin: /linkedin\.com\/(company|in)\//i, x: /(?:twitter|x)\.com\/(?!intent|share)/i, youtube: /youtube\.com\/(?:@|channel|c\/|user)/i, tiktok: /tiktok\.com\/@/i };

const names = (list: [string, RegExp][], html: string) => list.filter(([, re]) => re.test(html)).map(([n]) => n);
const clean = (s: string, n: number) => s.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim().slice(0, n);
const strip = (html: string) => html.replace(/<!--[\s\S]*?-->|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>/gi, " ");
export const visibleText = (html: string) => clean(strip(html).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " "), 400_000);
const tagText = (html: string, tag: string, max: number) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))].map((m) => clean(m[1].replace(/<[^>]+>/g, " "), 90)).filter((t) => t.length > 2).slice(0, max);

export function analysePage(html: string): PageFacts {
  const text = visibleText(html), lower = text.toLowerCase();
  const meta = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
  const forms = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map((m) => `${m[1]} ${m[2]}`.toLowerCase());
  const kinds = new Set<string>();
  let counted = 0;
  for (const f of forms) {
    const inputs = (f.match(/<input\b/g) ?? []).length + (f.match(/<textarea\b/g) ?? []).length;
    if (/type=["']search["']|role=["']search["']|name=["']s["']|woocommerce-product-search/.test(f) || (inputs <= 1 && /search/.test(f))) continue;   // a search box is not an enquiry form
    counted++;
    kinds.add(/quote|estimate/.test(f) ? "quote" : /book|appointment|reserv/.test(f) ? "booking" : /newsletter|subscribe|sign.?up/.test(f) && !/message|enquir/.test(f) ? "newsletter" : "contact");
  }
  const years = [...html.matchAll(/(?:©|&copy;|copyright)\s*(?:20\d{2}\s*[-–]\s*)?(20\d{2})/gi)].map((m) => Number(m[1]));
  const social = Object.fromEntries((Object.keys(SOCIAL_HOSTS) as Social[]).map((k) => [k, hrefs.some((h) => SOCIAL_HOSTS[k].test(h))])) as Record<Social, boolean>;
  return {
    title: clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""), 120) || null, description: meta ? clean(meta[1], 200) || null : null,
    h1: tagText(html, "h1", 4), h2: tagText(html, "h2", 8), words: text.split(" ").filter(Boolean).length,
    viewport: /<meta[^>]+name=["']viewport["']/i.test(html), copyrightYear: years.length ? Math.max(...years) : null,
    forms: counted, formKinds: [...kinds],
    telLink: /href=["']tel:/i.test(html), phoneVisible: /(?:\+44\s?\(?0?\)?\s?|\b0)\d[\d\s-]{8,12}\d/.test(text), mailto: /href=["']mailto:/i.test(html), whatsapp: /wa\.me\/|api\.whatsapp\.com\/send|href=["']whatsapp:/i.test(html),
    booking: names(BOOKING, html), chat: names(CHAT, html), emailTools: names(EMAIL_TOOLS, html), reviewWidgets: names(REVIEWS, html),
    platform: PLATFORMS.find(([, re]) => re.test(html))?.[0] ?? null, social,
    ctas: CTA_PHRASES.filter((p) => lower.includes(p)), blogLink: hrefs.some((h) => /\/(blog|news|articles|insights)(\/|$|\?)/i.test(h)),
    privacyLink: hrefs.some((h) => /privacy/i.test(h)), testimonials: /testimonial|what our (customers|clients) say|\b5[- ]star|★★/i.test(text),
  };
}

const uniq = <T,>(a: T[]) => [...new Set(a)];
/** Combine several pages of one site into one set of facts. The first page (the home page) provides title, description, headings and word count. */
export function mergePages(pages: { path: string; facts: PageFacts }[], signals: SiteSignals, pagesRead: PageRead[]): SiteFacts | null {
  if (pages.length === 0) return null;
  const home = pages[0].facts, all = pages.map((p) => p.facts);
  const years = all.map((f) => f.copyrightYear).filter((y): y is number => y !== null);
  return {
    ...home, forms: all.reduce((n, f) => n + f.forms, 0), formKinds: uniq(all.flatMap((f) => f.formKinds)), copyrightYear: years.length ? Math.max(...years) : null,
    telLink: all.some((f) => f.telLink), phoneVisible: all.some((f) => f.phoneVisible), mailto: all.some((f) => f.mailto), whatsapp: all.some((f) => f.whatsapp),
    booking: uniq(all.flatMap((f) => f.booking)), chat: uniq(all.flatMap((f) => f.chat)), emailTools: uniq(all.flatMap((f) => f.emailTools)), reviewWidgets: uniq(all.flatMap((f) => f.reviewWidgets)),
    platform: all.map((f) => f.platform).find(Boolean) ?? null,
    social: Object.fromEntries((Object.keys(home.social) as Social[]).map((k) => [k, all.some((f) => f.social[k])])) as Record<Social, boolean>,
    ctas: uniq(all.flatMap((f) => f.ctas)), blogLink: all.some((f) => f.blogLink), privacyLink: all.some((f) => f.privacyLink), testimonials: all.some((f) => f.testimonials),
    signals, pagesRead,
  };
}

/** Which internal links are worth reading after the home page: contact, services, booking, about, reviews. */
export function pickLinks(html: string, host: string, max = 3): string[] {
  const want: [RegExp, number][] = [[/contact/i, 1], [/quote|book|appointment|enquir/i, 2], [/services?|what-we-do|treatments?|products?/i, 3], [/about/i, 4], [/review|testimonial/i, 5]];
  const found = new Map<string, number>();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    let u: URL;
    try { u = new URL(m[1], `https://${host}/`); } catch { continue; }
    if (u.hostname.replace(/^www\./, "") !== host.replace(/^www\./, "") || u.pathname === "/" || /\.(pdf|jpe?g|png|gif|zip|docx?)$/i.test(u.pathname) || u.pathname.length > 60) continue;
    const rank = want.find(([re]) => re.test(u.pathname))?.[1];
    if (rank && !found.has(u.pathname) && ![...found.keys()].some((p) => p.replace(/\/$/, "") === u.pathname.replace(/\/$/, ""))) found.set(u.pathname, rank);
  }
  return [...found.entries()].sort((a, b) => a[1] - b[1]).slice(0, max).map(([p]) => p);
}

// ---------- findings ----------
export type Area = "Website" | "Enquiries and booking" | "Marketing" | "Social media" | "Reputation";
export type Finding = { id: string; area: Area; kind: "gap" | "strength" | "note"; severity: "high" | "medium" | "low"; title: string; detail: string; evidence: string };
export type FindingContext = { hasDomain: boolean; thisYear: number; storedSocial: { facebook: boolean; instagram: boolean; linkedin: boolean }; siteError: string | null };
const SEV = { high: 0, medium: 1, low: 2 } as const;

export function deriveFindings(site: SiteFacts | null, ctx: FindingContext): Finding[] {
  const out: Omit<Finding, "id">[] = [];
  const add = (area: Area, kind: Finding["kind"], severity: Finding["severity"], title: string, detail: string, evidence: string) => out.push({ area, kind, severity, title, detail, evidence });
  const storedAny = ctx.storedSocial.facebook || ctx.storedSocial.instagram || ctx.storedSocial.linkedin;

  if (!ctx.hasDomain) {
    add("Website", "gap", "high", "No website on record", "There is no website saved for this company. Check with a quick search first: if they really have none, anyone looking for them has nothing of theirs to land on.", "No domain saved in the CRM");
    if (!storedAny) add("Social media", "gap", "medium", "No social pages on record", "No Facebook, Instagram or LinkedIn page is saved. Check for one before assuming they have none.", "No social links saved in the CRM");
    return finish(out);
  }
  if (!site) {
    add("Website", "note", "low", "The website couldn't be read", `${ctx.siteError ?? "The site could not be loaded"}. Findings below are limited to what is already in the CRM.`, ctx.siteError ?? "Fetch failed");
    return finish(out);
  }
  const pages = site.pagesRead.filter((p) => p.ok).map((p) => p.path);
  const seen = `Checked ${pages.length} page${pages.length === 1 ? "" : "s"}: ${pages.join(", ")}`;
  const hasEnquiryRoute = site.forms > 0 || site.booking.length > 0;
  const hasLive = site.chat.length > 0 || site.whatsapp;
  const analytics = !!(site.signals.ga4 || site.signals.gtm);
  const runsAds = !!site.signals.runs_ads;

  // Website
  if (!site.viewport) add("Website", "gap", "medium", "May not be mobile-friendly", "No mobile viewport setting was found, which usually means the site looks cramped on a phone. Most local customers search on mobile.", `No viewport tag. ${seen}`);
  if (site.copyrightYear !== null && site.copyrightYear <= ctx.thisYear - 2) add("Website", "gap", "low", "Site looks out of date", `The footer says © ${site.copyrightYear}, so the site may not have been touched for a while.`, `Footer year ${site.copyrightYear}`);
  if (site.words < 120) add("Website", "gap", "low", "Very little text on the home page", `Only about ${site.words} words were found, so it may not explain services or answer common questions.`, `${site.words} words on the home page`);
  if (!site.privacyLink) add("Website", "gap", "low", "No privacy policy link found", "A privacy policy is expected on a UK business site that collects enquiries.", seen);
  if (site.platform) add("Website", "note", "low", `Built on ${site.platform}`, `The site appears to use ${site.platform}, which affects how easily forms and booking can be connected.`, `${site.platform} markers in the page`);

  // Enquiries and booking
  if (!hasEnquiryRoute && !hasLive && (site.phoneVisible || site.mailto)) add("Enquiries and booking", "gap", "high", "Enquiries depend on phone or email only", "No enquiry form, online booking or chat was found: customers must ring or email. Out of hours, and when the phone is busy, those enquiries can be lost.", seen);
  else if (!hasEnquiryRoute) add("Enquiries and booking", "gap", "medium", "No enquiry form or online booking found", "The pages read had no contact form, quote form or booking tool.", seen);
  if (site.booking.length) add("Enquiries and booking", "strength", "low", `Online booking in place (${site.booking.join(", ")})`, "They already take bookings online, so the gain is more likely in reminders, follow-up and reporting than in booking itself.", `${site.booking.join(", ")} found`);
  if (site.phoneVisible && !site.telLink) add("Enquiries and booking", "gap", "low", "Phone number isn't tap-to-call", "A phone number is shown, but not as a tap-to-call link, which adds friction on mobile.", "No tel: link found");
  if (!hasLive) add("Enquiries and booking", "gap", "low", "No live chat or WhatsApp option found", "There is no instant way to ask a quick question, so some visitors will leave without asking.", seen);
  else add("Enquiries and booking", "strength", "low", `Has ${[...site.chat, site.whatsapp ? "WhatsApp" : ""].filter(Boolean).join(", ")}`, "An instant-contact option is already there.", "Chat or WhatsApp widget found");

  // Marketing
  if (!analytics) add("Marketing", "gap", "medium", "No website analytics found", "No Google Analytics or Tag Manager was found, so it is hard for them to know where enquiries come from or which marketing works.", seen);
  if (runsAds) add("Marketing", hasEnquiryRoute ? "strength" : "gap", hasEnquiryRoute ? "low" : "high", hasEnquiryRoute ? "Invests in advertising" : "Pays for ads but makes enquiring hard",
    hasEnquiryRoute ? "Ad tracking was found, so they spend money to get visitors and care about conversions." : "Advertising tracking was found, but no easy way to enquire: ad spend may be leaking.", "Ad pixel or tag found");
  if (!site.emailTools.length && !site.formKinds.includes("newsletter")) add("Marketing", "gap", "low", "No email list sign-up found", "There is no sign-up form or email tool, so past visitors and customers may not be getting regular contact.", seen);
  if (!site.blogLink) add("Marketing", "gap", "low", "No blog or news section found", "No regular content on the site, so little for search engines or social posts to draw on.", seen);

  // Social media
  const missing = (["facebook", "instagram", "linkedin"] as const).filter((k) => !site.social[k]);
  if (!site.social.facebook && !site.social.instagram && !site.social.linkedin && !site.social.x && !site.social.youtube && !site.social.tiktok) {
    add("Social media", "gap", storedAny ? "low" : "medium", storedAny ? "Social pages exist but the site doesn't link to them" : "No social media links found", storedAny ? "The CRM has a social page for them, but the pages read didn't link to it." : "No social links were found on the pages read, and none are saved in the CRM. They may not be active on social media, or just not linking it.", seen);
  } else if (missing.length) add("Social media", "gap", "low", `Not linked: ${missing.map((m) => m[0].toUpperCase() + m.slice(1)).join(", ")}`, "The site links to some social pages but not these, which may mean those channels aren't used.", `Linked: ${(Object.keys(site.social) as Social[]).filter((k) => site.social[k]).join(", ")}`);

  // Reputation
  if (!site.reviewWidgets.length && !site.testimonials) add("Reputation", "gap", "low", "No reviews or testimonials found", "No review widget or testimonials appeared on the pages read, so good feedback may not be on show to new visitors.", seen);
  else add("Reputation", "strength", "low", "Shows reviews or testimonials", `Social proof is on the site${site.reviewWidgets.length ? ` (${site.reviewWidgets.join(", ")})` : ""}.`, "Reviews or testimonials found");

  return finish(out);
  function finish(list: Omit<Finding, "id">[]): Finding[] {
    const kindOrder = { gap: 0, note: 1, strength: 2 } as const;
    return list.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || SEV[a.severity] - SEV[b.severity]).map((f, i) => ({ ...f, id: `F${i + 1}` }));
  }
}
