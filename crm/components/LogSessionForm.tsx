"use client";

import { useState } from "react";
import { logSession } from "@/lib/enablementActions";
import { SKILL_LEVELS, parseAttendeeLines } from "@/lib/enablementMath";
import ToastForm from "./ToastForm";

type Staff = { id: number; name: string; role: string | null; skill_level: number | null };
type Schedule = { id: number; title: string; next_on: string; duration_minutes: number };

const LevelSelect = ({ name, current, label }: { name: string; current?: number | null; label: string }) => (
  <select name={name} defaultValue="" aria-label={label} style={{ width: 170 }}>
    <option value="">{current ? `Level stays ${current}` : "Level: not rated"}</option>
    {SKILL_LEVELS.map((l) => <option key={l.level} value={l.level}>{l.level} · {l.label}</option>)}
  </select>
);

// Log a held session: who came and their skill level afterwards. Brand-new attendees can be typed in, one per line.
export default function LogSessionForm({ companyId, staff, schedules, today }: { companyId: number; staff: Staff[]; schedules: Schedule[]; today: string }) {
  const [fresh, setFresh] = useState(0);
  const [newText, setNewText] = useState("");
  const [title, setTitle] = useState("");
  const people = parseAttendeeLines(newText);
  return (
    <ToastForm key={fresh} action={logSession} success="Session logged" className="stack" style={{ gap: 12 }} onDone={() => { setFresh((n) => n + 1); setNewText(""); setTitle(""); }}>
      <input type="hidden" name="company_id" value={companyId} />
      <div className="row">
        <label className="stack" style={{ gap: 4, flex: 1, minWidth: 240 }}><span className="field-label">Title</span><input name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Writing good prompts for client emails" required /></label>
        <label className="stack" style={{ gap: 4 }}><span className="field-label">Date held</span><input type="date" name="held_on" defaultValue={today} max={today} required /></label>
        <label className="stack" style={{ gap: 4 }}><span className="field-label">Minutes</span><input type="number" name="duration" min="5" max="600" defaultValue="60" style={{ width: 90 }} /></label>
        <label className="stack" style={{ gap: 4 }}><span className="field-label">Type</span><select name="kind"><option value="workshop">Workshop</option><option value="follow_up">Follow-up</option><option value="office_hours">Office hours</option><option value="other">Other</option></select></label>
      </div>
      {schedules.length > 0 && (
        <label className="stack" style={{ gap: 4, alignSelf: "flex-start" }}><span className="field-label">Part of a recurring schedule?</span>
          <select name="schedule_id" defaultValue="" onChange={(e) => { const s = schedules.find((x) => String(x.id) === e.target.value); if (s && !title) setTitle(s.title); }}>
            <option value="">No</option>{schedules.map((s) => <option key={s.id} value={s.id}>{s.title} (was due {s.next_on})</option>)}
          </select>
        </label>
      )}
      <label className="stack" style={{ gap: 4 }}><span className="field-label">What was covered (no personal details)</span><textarea name="topics" rows={2} maxLength={2000} placeholder="Topics, what people practised, what to try before next time." /></label>

      <div className="stack" style={{ gap: 8 }}>
        <div className="field-label">Who attended, and their skill level now</div>
        {staff.length === 0 && <p className="muted" style={{ margin: 0 }}>No staff on the list yet. Add the people below.</p>}
        {staff.map((s) => (
          <div key={s.id} className="row" style={{ gap: 12 }}>
            <label className="row" style={{ gap: 8, flex: 1, minWidth: 220 }}><input type="checkbox" name={`at_${s.id}`} /> <span>{s.name}{s.role && <span className="muted"> · {s.role}</span>}</span></label>
            <LevelSelect name={`lv_${s.id}`} current={s.skill_level} label={`Skill level for ${s.name} after this session`} />
          </div>
        ))}
        <label className="stack" style={{ gap: 4 }}><span className="field-label">New attendees (one per line: name, role)</span>
          <textarea rows={2} name="new_attendees" value={newText} onChange={(e) => setNewText(e.target.value)} placeholder={"Sam Taylor, Office manager\nPriya, Sales"} />
        </label>
        {people.map((p, i) => (
          <div key={p.name} className="row" style={{ gap: 12 }}><span style={{ flex: 1, minWidth: 220 }}>{p.name}{p.role && <span className="muted"> · {p.role}</span>}</span><LevelSelect name={`new_lv_${i}`} label={`Skill level for ${p.name}`} /></div>
        ))}
      </div>
      <p className="muted" style={{ margin: 0 }}>1 = {SKILL_LEVELS[0].label} ({SKILL_LEVELS[0].hint.toLowerCase()}) · 2 = {SKILL_LEVELS[1].label} · 3 = {SKILL_LEVELS[2].label} ({SKILL_LEVELS[2].hint.toLowerCase()}). Leave a level alone to keep what is already recorded.</p>
      <button style={{ alignSelf: "flex-start" }}>Log session</button>
    </ToastForm>
  );
}
