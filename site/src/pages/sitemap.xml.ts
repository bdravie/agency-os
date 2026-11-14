// The sitemap lists only the pages meant to be found: the landing page, the blog, each post and the privacy page.
// It is written from this fixed list, never from the pages folder, so the private post-purchase page and the split-test
// versions (/v/a ...) can never end up in it. tests/thanks.test.mjs checks that.
import { posts } from "../blog";

export function GET({ site }: { site: URL }) {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const rows = [
    { path: "/" }, { path: "/blog", mod: posts[0]?.date }, { path: "/privacy" },
    ...posts.map((p) => ({ path: `/blog/${p.slug}`, mod: p.date })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows
    .map((r) => `  <url><loc>${new URL(r.path, site).href}</loc>${r.mod ? `<lastmod>${day(r.mod)}</lastmod>` : ""}</url>`)
    .join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8" } });
}
