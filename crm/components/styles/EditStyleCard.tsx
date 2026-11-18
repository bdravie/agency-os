import Link from "next/link";
import ToastForm from "../ToastForm";
import CopyButton from "../CopyButton";
import { TemplateStrip } from "./StylesPanel";
import { setItemTemplateAction } from "@/lib/editStyleActions";
import { editBrief, type BriefItem, type Catalogue, type Template } from "@/lib/editStylesMath";

// On a video's page: choose the edit template, see its beats, and copy the brief to give to Claude. The brief is written by code from the
// template, the saved script and the catalogue's rules (editBrief), so it is the same every time. The CRM edits nothing and sends nothing.
export default function EditStyleCard({ id, item, cat, chosen, chosenKey }: { id: number; item: BriefItem; cat: Catalogue; chosen: Template | null; chosenKey: string | null }) {
  return (
    <section className="card es-pickcard" aria-labelledby="edit-style-h">
      <h3 id="edit-style-h">Edit style</h3>
      <ToastForm key={chosenKey ?? "none"} action={setItemTemplateAction} success="Edit style saved" className="row">
        <input type="hidden" name="id" value={id} />
        <select name="template" defaultValue={chosen?.key ?? ""} aria-label="Edit template" style={{ flex: 1, minWidth: 0 }}>
          <option value="">No template yet</option>
          {cat.templates.map((t) => <option key={t.key} value={t.key}>{t.name}{t.custom ? " (yours)" : ""}</option>)}
        </select>
        <button className="secondary">Save</button>
      </ToastForm>
      {chosenKey && !chosen && <p className="es-warn">The template this video was set to no longer exists. Pick another.</p>}
      {chosen ? (
        <>
          <TemplateStrip t={chosen} cat={cat} small />
          <textarea id="edit-brief" className="es-brief" readOnly rows={7} value={editBrief(item, chosen, cat)} aria-label="Edit brief" />
          <div className="row">
            <CopyButton targetId="edit-brief" label="Copy edit brief" />
            <span className="muted" style={{ fontSize: 12.5 }}>Paste it to Claude with your footage to get the edit.</span>
          </div>
        </>
      ) : (
        <p className="muted" style={{ margin: 0 }}>Pick a template to see its beats and get the edit brief. <Link href="/content?tab=styles&view=templates">See the templates</Link></p>
      )}
    </section>
  );
}
