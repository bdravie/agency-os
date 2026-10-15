import { Trash2 } from "lucide-react";
import { deleteTask, saveTask } from "@/lib/auditActions";
import { DEFAULT_EASE, FREQUENCIES, IMPACTS, SENSITIVITIES, type Frequency } from "@/lib/audit";
import ToastForm from "./ToastForm";

type T = { id?: number; name?: string; performed_by?: string | null; hours_per_week?: number; frequency?: string; error_rate_pct?: number; revenue_impact?: string; data_sensitivity?: string; ease?: number | null };

// One recurring task from the client's intake. The same form adds a new task or edits an existing one.
export default function AuditTaskForm({ auditId, task }: { auditId: number; task?: T }) {
  const isNew = !task?.id;
  return (
    <div className={isNew ? "task-new" : "task-row"}>
      <ToastForm action={saveTask} success={isNew ? "Task added" : "Task saved"} reset={isNew} className="task-grid">
        <input type="hidden" name="audit_id" value={auditId} />
        {task?.id && <input type="hidden" name="id" value={task.id} />}
        <label className="t-name">Task<input name="name" defaultValue={task?.name ?? ""} placeholder="e.g. Chasing overdue invoices" required maxLength={200} /></label>
        <label className="t-who">Done by (role or team)<input name="performed_by" defaultValue={task?.performed_by ?? ""} placeholder="e.g. Office manager" maxLength={100} /></label>
        <label>Hours / week<input name="hours_per_week" type="number" min="0" max="200" step="0.5" defaultValue={task?.hours_per_week ?? ""} required /></label>
        <label>How often
          <select name="frequency" defaultValue={task?.frequency ?? "weekly"}>{FREQUENCIES.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}</select>
        </label>
        <label>Error rate %<input name="error_rate_pct" type="number" min="0" max="100" step="1" defaultValue={task?.error_rate_pct ?? 0} /></label>
        <label>Revenue impact
          <select name="revenue_impact" defaultValue={task?.revenue_impact ?? "medium"}>{IMPACTS.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}</select>
        </label>
        <label>Data sensitivity
          <select name="data_sensitivity" defaultValue={task?.data_sensitivity ?? "none"}>{SENSITIVITIES.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}</select>
        </label>
        <label>Ease to automate
          <select name="ease" defaultValue={task?.ease ?? ""}>
            <option value="">Auto{task?.frequency ? ` (${DEFAULT_EASE[task.frequency as Frequency]})` : ""}</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}{n === 1 ? " (hard)" : n === 5 ? " (easy)" : ""}</option>)}
          </select>
        </label>
        <div className="t-actions"><button className={isNew ? "" : "secondary"}>{isNew ? "Add task" : "Save"}</button></div>
      </ToastForm>
      {task?.id && (
        <ToastForm action={deleteTask} success="Task removed" confirm={`Remove "${task.name}" from this audit?`} className="t-delete">
          <input type="hidden" name="id" value={task.id} />
          <button className="link" aria-label={`Remove ${task.name}`} title="Remove task"><Trash2 size={15} /></button>
        </ToastForm>
      )}
    </div>
  );
}
