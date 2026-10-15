import Link from "next/link";
import ToastForm from "@/components/ToastForm";
import { Check, CheckCheck } from "lucide-react";
import { query } from "@/lib/db";
import { addLooseTask, completeTask } from "@/lib/actions";
import { when } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tasks" };

export default async function Tasks() {
  const tasks = await query<any>(
    `SELECT t.id, t.title, t.due_at, t.company_id, c.name AS company_name,
            CASE WHEN t.due_at IS NULL THEN 'none' WHEN t.due_at < now()::date THEN 'overdue'
                 WHEN t.due_at < now()::date + 1 THEN 'today' ELSE 'later' END AS bucket
       FROM tasks t LEFT JOIN companies c ON c.id = t.company_id
      WHERE t.done_at IS NULL ORDER BY t.due_at NULLS LAST, t.created_at`);
  const groups: { key: string; title: string; tone?: string }[] = [
    { key: "overdue", title: "Overdue", tone: "error" }, { key: "today", title: "Today" },
    { key: "later", title: "Upcoming" }, { key: "none", title: "No date" },
  ];

  return (
    <>
      <PageHeader title="Tasks" description={`${tasks.length} open`} />
      <ToastForm action={addLooseTask} success="Task added" reset className="card row" style={{ marginBottom: 20 }}>
        <input name="title" placeholder="Add a task…" aria-label="New task" required autoFocus style={{ flex: 1, minWidth: 200 }} />
        <input name="due" type="datetime-local" aria-label="Due date" />
        <button>Add task</button>
      </ToastForm>

      {tasks.length === 0 && <div className="card"><EmptyState title="Nothing to do" icon={<CheckCheck size={22} />}>You&apos;re all caught up.</EmptyState></div>}
      <div className="stack">
        {groups.map((g) => {
          const items = tasks.filter((t: any) => t.bucket === g.key);
          if (!items.length) return null;
          return (
            <section key={g.key} className="card">
              <h2 className={g.tone}>{g.title} · {items.length}</h2>
              <ul>{items.map((t: any) => (
                <li key={t.id} className="row">
                  <ToastForm action={completeTask} success="Task done">
                    <input type="hidden" name="task_id" value={t.id} />
                    <button className="link" title="Mark done" aria-label={`Mark done: ${t.title}`}><Check size={16} /></button>
                  </ToastForm>
                  <span style={{ flex: 1 }}>{t.title}{t.company_id && <> <Link href={`/companies/${t.company_id}`} className="muted">{t.company_name}</Link></>}</span>
                  {t.due_at && <span className={g.key === "overdue" ? "badge tone-bad" : "muted"}>{when(t.due_at)}</span>}
                </li>
              ))}</ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
