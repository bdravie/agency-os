// The blog's posts: one Markdown file each in src/blog/. The file name is the address (/blog/<file-name>).
// A file starting with "_" (the template) or marked `draft: true` is never built. Newest first.
// Front matter is checked by scripts/checkContent.mjs, so a release build fails on a post with a missing title, description or date.
export const NICHES: Record<string, string> = { dental: "Dental practices", aesthetics: "Aesthetics clinics", clinics: "Clinics" };

type Mod = { frontmatter: { title: string; description: string; date: string | Date; niche?: string; draft?: boolean }; rawContent(): string; Content: any };
export type Post = { slug: string; title: string; description: string; date: Date; niche: string; minutes: number; Content: any };

const files = import.meta.glob("./blog/*.md", { eager: true }) as Record<string, Mod>;

export const posts: Post[] = Object.entries(files)
  .map(([path, m]) => ({ slug: path.split("/").pop()!.replace(/\.md$/, ""), m }))
  .filter(({ slug, m }) => !slug.startsWith("_") && !m.frontmatter.draft)
  .map(({ slug, m }) => ({
    slug,
    title: m.frontmatter.title,
    description: m.frontmatter.description,
    date: new Date(m.frontmatter.date),
    niche: NICHES[m.frontmatter.niche ?? ""] ? m.frontmatter.niche! : "clinics",
    minutes: Math.max(1, Math.round(m.rawContent().split(/\s+/).length / 200)),
    Content: m.Content,
  }))
  .sort((a, b) => b.date.getTime() - a.date.getTime());

export const longDate = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
