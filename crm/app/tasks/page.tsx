import Link from "next/link";
import { query } from "@/lib/db";
import { addLooseTask, completeTask } from "@/lib/actions";

export const dynamic = "force-dynamic";

const when = (d: Date | string) => new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default async function Tasks() {
  const tasks = await query<any>(
    `SELECT t.id, t.title, t.due_at, t.company_id, c.name AS company_name,
            (t.due_at IS NOT NULL AND t.due_at < now()) AS overdue
       FROM tasks t LEFT JOIN companies c ON c.id = t.company_id
      WHERE t.done_at IS NULL ORDER BY t.due_at NULLS LAST, t.created_at`);
  return (
    <>
      <h1>Tasks</h1>
      <form action={addLooseTask} className="card" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input name="title" placeholder="New task" required autoFocus style={{ flex: 1 }} />
        <input name="due" type="datetime-local" />
        <button>Add</button>
      </form>
      <div className="card">
        <ul>
          {tasks.map((t: any) => (
            <li key={t.id}>
              <form action={completeTask} style={{ display: "inline" }}>
                <input type="hidden" name="task_id" value={t.id} />
                <button className="link" title="Mark done">☐</button>
              </form>{" "}
              {t.title}{" "}
              {t.company_id && <Link href={`/companies/${t.company_id}`}>{t.company_name}</Link>}{" "}
              {t.due_at && <span className={t.overdue ? "error" : "muted"}>{t.overdue ? "overdue · " : "due "}{when(t.due_at)}</span>}
            </li>
          ))}
          {tasks.length === 0 && <li className="muted">No open tasks.</li>}
        </ul>
      </div>
    </>
  );
}
