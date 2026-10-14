import Link from "next/link";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const when = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { dateStyle: "medium" });

export default async function Proposals({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "" } = await searchParams;
  const rows = await query<any>(
    `SELECT id, job_title, fit_score, status, created_at, connects_used FROM proposals
      WHERE ($1 = '' OR status = $1) ORDER BY created_at DESC LIMIT 200`, [status]);
  return (
    <>
      <h1>Proposals</h1>
      <p className="muted">
        Drafts come from <code>uv run python -m agency.proposal job.txt</code>. Filter:{" "}
        {["", "Draft", "Sent", "Interview", "Won", "Lost"].map((s) => (
          <Link key={s} href={s ? `/proposals?status=${s}` : "/proposals"} style={{ marginRight: 10, fontWeight: s === status ? 700 : 400 }}>{s || "All"}</Link>
        ))}
      </p>
      <div className="card">
        <table>
          <thead><tr><th>Job</th><th>Fit</th><th>Status</th><th>Connects</th><th>Created</th></tr></thead>
          <tbody>
            {rows.map((p: any) => (
              <tr key={p.id}>
                <td><Link href={`/proposals/${p.id}`}>{p.job_title || `Proposal #${p.id}`}</Link></td>
                <td>{p.fit_score}/10</td><td>{p.status}</td><td>{p.connects_used}</td><td>{when(p.created_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="muted">No proposals yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
