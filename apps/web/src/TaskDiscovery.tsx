import { useEffect, useState, type FormEvent } from "react";

type Employee = { id: string; name: string; role: string; department: string };
export type DiscoveryRecord = {
  id: string; employeeId: string; taskName: string; workType: "Recurring" | "Ad hoc"; cadence: string;
  requester: string; trigger: string; purpose: string; workShape: string; inputs: string[]; tools: string[];
  steps: string[]; outputs: string[]; handoffs: string[]; deadline: string; effort: string;
  approvals: string; quality: string; blockers: string[]; exceptions: string[]; variability: string;
  capturedAt: number; convertedAt?: number;
};
const STORE = "cias-task-discovery-v1";
const DRAFT_STORE = "cias-task-discovery-draft-v1";
const blank = (employeeId = ""): DiscoveryRecord => ({ id: "", employeeId, taskName: "", workType: "Recurring", cadence: "Daily", requester: "", trigger: "", purpose: "", workShape: "Standalone task", inputs: [], tools: [], steps: [], outputs: [], handoffs: [], deadline: "", effort: "", approvals: "", quality: "", blockers: [], exceptions: [], variability: "", capturedAt: Date.now() });
const list = (v: string) => v.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
const read = (): DiscoveryRecord[] => { try { return JSON.parse(localStorage.getItem(STORE) ?? "[]") as DiscoveryRecord[]; } catch { return []; } };
const readDraft = (employeeId = ""): DiscoveryRecord => { try { const raw = localStorage.getItem(DRAFT_STORE); return raw ? { ...blank(employeeId), ...JSON.parse(raw) as DiscoveryRecord } : blank(employeeId); } catch { return blank(employeeId); } };

export default function TaskDiscovery({ employees, onPromote }: { employees: Employee[]; onPromote: (record: DiscoveryRecord) => void }) {
  const [records, setRecords] = useState<DiscoveryRecord[]>(read);
  const [draft, setDraft] = useState<DiscoveryRecord>(() => readDraft(employees[0]?.id));
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { localStorage.setItem(STORE, JSON.stringify(records)); }, [records]);
  useEffect(() => { localStorage.setItem(DRAFT_STORE, JSON.stringify(draft)); }, [draft]);
  function update<K extends keyof DiscoveryRecord>(key: K, value: DiscoveryRecord[K]) { setDraft(d => ({ ...d, [key]: value })); setSaved(false); }
  function save(event: FormEvent) {
    event.preventDefault(); if (!draft.taskName.trim() || !draft.employeeId) return;
    const record = { ...draft, id: draft.id || `discovery-${Date.now().toString(36)}`, taskName: draft.taskName.trim(), capturedAt: draft.capturedAt || Date.now() };
    setRecords(current => draft.id ? current.map(r => r.id === draft.id ? record : r) : [record, ...current]);
    setDraft(blank(draft.employeeId)); setEditing(false); setSaved(true);
  }
  function edit(record: DiscoveryRecord) { setDraft(record); setEditing(true); setSaved(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  return <section className="fw-content fw-discovery">
    <div className="fw-page-head"><div><div className="fw-eyebrow">LEARN HOW WORK REALLY MOVES</div><h1>Task &amp; Process Discovery</h1><p>You lead the conversation and capture what employees already know. They don’t need another system to maintain.</p></div><span className="fw-local-tag">● SAVED IN THIS BROWSER</span></div>
    <div className="fw-discovery-intro"><strong>A practical interview, one task at a time</strong><span>Capture several tasks for each person. Save as you go, then review and turn a finding into proposed work when it should enter Task Command.</span></div>
    <form className="fw-discovery-form" onSubmit={save}>
      <div className="fw-discovery-form-head"><div><small>{editing ? "REVIEW & EDIT" : "INTERVIEW CAPTURE"}</small><h2>{editing ? "Update this finding" : "Start with one piece of work"}</h2></div><span>Fields can stay blank when the answer is unknown.</span></div>
      <div className="fw-discovery-grid">
        <label>Employee<select value={draft.employeeId} onChange={e => update("employeeId", e.target.value)}>{employees.map(p => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select></label>
        <label>Task or activity<input required value={draft.taskName} onChange={e => update("taskName", e.target.value)} placeholder="What do you do?" /></label>
        <label>Work pattern<select value={draft.workType} onChange={e => update("workType", e.target.value as DiscoveryRecord["workType"])}><option>Recurring</option><option>Ad hoc</option></select></label>
        {draft.workType === "Recurring" && <label>How often?<input value={draft.cadence} onChange={e => update("cadence", e.target.value)} placeholder="Daily, weekly, month-end…" /></label>}
        <label>Who assigns or requests it?<input value={draft.requester} onChange={e => update("requester", e.target.value)} placeholder="Person, team, customer, or system" /></label>
        <label>What starts it, and where does it come from?<textarea value={draft.trigger} onChange={e => update("trigger", e.target.value)} /></label>
        <label>Why is it done?<textarea value={draft.purpose} onChange={e => update("purpose", e.target.value)} /></label>
        <label>How does it fit into the work?<select value={draft.workShape} onChange={e => update("workShape", e.target.value)}><option>Standalone task</option><option>Part of a larger process</option><option>Subtask</option><option>Support work for another task</option></select></label>
        <label>Inputs, files, information, or systems needed<textarea value={draft.inputs.join("\n")} onChange={e => update("inputs", list(e.target.value))} placeholder="One item per line" /></label>
        <label>Tools or systems used<textarea value={draft.tools.join("\n")} onChange={e => update("tools", list(e.target.value))} placeholder="One item per line" /></label>
        <label>Steps, in the order they happen<textarea value={draft.steps.join("\n")} onChange={e => update("steps", list(e.target.value))} placeholder="One step per line" /></label>
        <label>Outputs and who receives them<textarea value={draft.outputs.join("\n")} onChange={e => update("outputs", list(e.target.value))} placeholder="Deliverable — recipient" /></label>
        <label>Hand-offs, dependencies, or next owner<textarea value={draft.handoffs.join("\n")} onChange={e => update("handoffs", list(e.target.value))} placeholder="Who waits for whom? What passes between them?" /></label>
        <label>Deadline, service expectation, or timing<textarea value={draft.deadline} onChange={e => update("deadline", e.target.value)} /></label>
        <label>Typical time spent, including waiting if known<input value={draft.effort} onChange={e => update("effort", e.target.value)} placeholder="Active effort and elapsed time" /></label>
        <label>Approvals and quality checks<textarea value={draft.approvals} onChange={e => update("approvals", e.target.value)} /></label>
        <label>How do you know it is done well?<textarea value={draft.quality} onChange={e => update("quality", e.target.value)} /></label>
        <label>Blockers, waits, or resource conflicts<textarea value={draft.blockers.join("\n")} onChange={e => update("blockers", list(e.target.value))} placeholder="One item per line" /></label>
        <label>Exceptions, busy periods, or seasonal changes<textarea value={draft.exceptions.join("\n")} onChange={e => update("exceptions", list(e.target.value))} placeholder="One item per line" /></label>
        <label>What changes from day to day?<textarea value={draft.variability} onChange={e => update("variability", e.target.value)} /></label>
      </div>
      <div className="fw-modal-actions"><button type="button" className="fw-button fw-button-quiet" onClick={() => { setDraft(blank(draft.employeeId)); setEditing(false); }}>New task</button><button className="fw-button fw-button-primary">{editing ? "Save changes" : "Save interview finding"}</button></div>
    </form>
    {saved && <p className="fw-discovery-saved" role="status">Finding saved locally. Continue with another task or review it below.</p>}
    <section className="fw-discovery-records"><div className="fw-studio-head"><div><span>CAPTURED WORK</span><h2>Interview findings <small>{records.length}</small></h2></div></div>
      {records.length === 0 ? <div className="fw-studio-empty">Your saved findings will appear here for review.</div> : records.map(record => <article className="fw-discovery-record" key={record.id}>
        <div><small>{employees.find(e => e.id === record.employeeId)?.name ?? "Former employee"} · {record.workType}{record.workType === "Recurring" && record.cadence ? ` · ${record.cadence}` : ""}</small><h3>{record.taskName}</h3><p>{record.purpose || "Purpose not captured yet."}</p><div className="fw-discovery-tags">{record.workShape}{record.inputs.length ? ` · ${record.inputs.length} inputs` : ""}{record.outputs.length ? ` · ${record.outputs.length} outputs` : ""}{record.handoffs.length ? ` · ${record.handoffs.length} hand-offs` : ""}</div></div>
        <div className="fw-discovery-actions"><button className="fw-button fw-button-quiet" onClick={() => edit(record)}>Review / edit</button>{!record.convertedAt && <button className="fw-button fw-button-primary" onClick={() => { onPromote(record); setRecords(current => current.map(r => r.id === record.id ? { ...r, convertedAt: Date.now() } : r)); }}>Propose as task</button>}{record.convertedAt && <span>Added to Task Command</span>}</div>
      </article>)}
    </section>
  </section>;
}
