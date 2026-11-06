import ToastForm from "./ToastForm";
import { updateProposalDetails } from "@/lib/proposalActions";
import { COMPANY_MAX, JOB_MAX, TITLE_MAX, URL_MAX } from "@/lib/proposalEdit";

// Edit what the proposal is about: the title, company, Upwork link and the job post itself. The draft and Connects are in the tracking box.
export default function EditProposalForm({ p }: { p: { id: number; job_title: string | null; company_name: string | null; job_url: string | null; job_text: string; fit_score: number | null; plan: unknown; loom_pitch: unknown } }) {
  const written = p.fit_score !== null || !!p.plan || !!p.loom_pitch;
  return (
    <details className="card prop-edit" id="edit">
      <summary>Edit details</summary>
      <ToastForm action={updateProposalDetails} success="Details saved" className="stack" style={{ gap: 10, marginTop: 12 }}>
        <input type="hidden" name="id" value={p.id} />
        <label>Job title<input name="job_title" defaultValue={p.job_title ?? ""} maxLength={TITLE_MAX} /></label>
        <label>Company<input name="company_name" defaultValue={p.company_name ?? ""} maxLength={COMPANY_MAX} /></label>
        <label>Upwork link<input name="job_url" type="url" defaultValue={p.job_url ?? ""} maxLength={URL_MAX} placeholder="https://www.upwork.com/jobs/…" /></label>
        <label>Job post<textarea name="job_text" rows={10} defaultValue={p.job_text} maxLength={JOB_MAX} required /></label>
        {written && <p className="muted" style={{ margin: 0 }}>If you change the job post, the fit score, plan and Loom pitch were written from the old text. Re-run them from their own panels when you want them to match.</p>}
        <div className="row"><button>Save details</button></div>
      </ToastForm>
    </details>
  );
}
