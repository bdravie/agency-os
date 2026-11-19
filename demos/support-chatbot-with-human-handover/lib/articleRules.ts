import { maskContactDetails } from "./text";

/** What a help article must look like before the bot may use it. Returns the problem, or null. */
export function articleProblem(a: { title: string; body: string; tags: string[] }): string | null {
  if (a.title.length < 4 || a.title.length > 100) return "Give the article a title of 4 to 100 characters.";
  if (a.body.length < 20 || a.body.length > 4000) return "The article needs 20 to 4,000 characters of text.";
  // Help articles are the shop's own information: no customer's email address or phone number belongs in one.
  if (maskContactDetails(`${a.title}\n${a.body}\n${a.tags.join(" ")}`).masked) return "Remove email addresses and phone numbers: help articles should not hold anyone's contact details.";
  return null;
}

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "article";
}
