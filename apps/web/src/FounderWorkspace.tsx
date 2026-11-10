import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow,
  Handle, Position, useEdgesState, useNodesState, type Node, type NodeProps, type Edge, type NodeTypes
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./founder-workspace.css";

type Department = { id: string; name: string; color: string; icon: string; };
type Employee = { id: string; name: string; role: string; departmentId: string; skills: string[]; level: string; color: string; bio: string; };
type TaskStatus = "proposed" | "todo" | "in_progress" | "done" | "rejected";
type Task = {
  id: string; title: string; description: string; ownerId: string; requestedBy: string;
  dueDate: string; priority: "Low" | "Normal" | "High" | "Urgent"; status: TaskStatus;
  estimatedMinutes: number; trackedSeconds: number; startedAt: number | null; createdAt: number;
};
type PersonNodeData = { kind: "person"; employee: Employee; department: string; };
type ZoneNodeData = { kind: "zone"; department: Department; count: number; };
type WorldNodeData = PersonNodeData | ZoneNodeData;
type WorldNode = Node<WorldNodeData>;
const KEY = "cias-founder-workspace-v1";
const starterDepartments: Department[] = [
  { id: "leadership", name: "Leadership", color: "violet", icon: "✦" },
  { id: "operations", name: "Operations", color: "cyan", icon: "◈" },
  { id: "product", name: "Product & Tech", color: "blue", icon: "⌘" },
  { id: "growth", name: "Growth", color: "rose", icon: "↗" }
];
const starterEmployees: Employee[] = [
  { id: "e1", name: "Aarav Mehta", role: "Founder / CEO", departmentId: "leadership", skills: ["Strategy", "Decision making", "Leadership"], level: "Lead", color: "violet", bio: "Owns company direction, priorities and final decisions." },
  { id: "e2", name: "Mira Shah", role: "Operations Lead", departmentId: "operations", skills: ["Operations", "Coordination", "Planning"], level: "Lead", color: "cyan", bio: "Coordinates daily operations and cross-team delivery." },
  { id: "e3", name: "Dev Kapoor", role: "Engineering Lead", departmentId: "product", skills: ["React", "Node.js", "System design"], level: "Lead", color: "blue", bio: "Owns technical delivery and product implementation." },
  { id: "e4", name: "Isha Rao", role: "Product Designer", departmentId: "product", skills: ["UI design", "Figma", "Prototyping"], level: "Specialist", color: "rose", bio: "Turns requirements into usable product experiences." },
  { id: "e5", name: "Anaya Singh", role: "Operations Associate", departmentId: "operations", skills: ["Documentation", "Research", "Coordination"], level: "Associate", color: "cyan", bio: "Supports operational execution and documentation." },
  { id: "e6", name: "Tara Joshi", role: "Growth Executive", departmentId: "growth", skills: ["Marketing", "Outreach", "Communication"], level: "Specialist", color: "rose", bio: "Builds relationships and supports growth activities." }
];
const starterTasks: Task[] = [
  { id: "t1", title: "Prepare weekly operations report", description: "Collect team updates, identify delays and prepare a concise weekly report.", ownerId: "e2", requestedBy: "Founder / CEO", dueDate: "2026-11-13", priority: "High", status: "todo", estimatedMinutes: 90, trackedSeconds: 0, startedAt: null, createdAt: Date.now() },
  { id: "t2", title: "Review onboarding screen flow", description: "Review the current onboarding experience and list usability improvements.", ownerId: "e4", requestedBy: "Engineering Lead", dueDate: "2026-11-14", priority: "Normal", status: "in_progress", estimatedMinutes: 120, trackedSeconds: 1800, startedAt: Date.now() - 1800000, createdAt: Date.now() },
  { id: "t3", title: "Research potential partners", description: "Build a shortlist of relevant partners and record contact details.", ownerId: "e6", requestedBy: "Founder / CEO", dueDate: "2026-11-15", priority: "Normal", status: "proposed", estimatedMinutes: 180, trackedSeconds: 0, startedAt: null, createdAt: Date.now() }
];
function readStore<T>(key: keyof typeof starterState, fallback: T): T {
  try { const raw = localStorage.getItem(KEY); if (!raw) return fallback; const parsed = JSON.parse(raw) as Partial<typeof starterState>; return (parsed[key] as T) ?? fallback; } catch { return fallback; }
}
const starterState = { departments: starterDepartments, employees: starterEmployees, tasks: starterTasks, positions: {} as Record<string, { x: number; y: number }> };
function id(prefix: string) { return prefix + "-" + Math.random().toString(36).slice(2, 9); }
function formatTime(seconds: number) { const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = seconds % 60; return [h, m, s].map(v => String(v).padStart(2, "0")).join(":"); }
function Avatar({ employee, size = "normal" }: { employee: Employee; size?: "normal" | "large" }) {
  return <div className={"fw-avatar fw-avatar-" + employee.color + " " + (size === "large" ? "fw-avatar-large" : "")}>
    <span className="fw-hair" /><span className="fw-face"><i /><i /><b /></span><span className="fw-body" /><span className="fw-avatar-initials">{employee.name.split(" ").map(p => p[0]).slice(0, 2).join("")}</span>
  </div>;
}
function WorldNode({ data, selected }: NodeProps<WorldNode>) {
  if (data.kind === "zone") return <div className={"fw-zone-node zone-" + data.department.color}>
    <Handle type="target" position={Position.Top} />
    <div className="fw-zone-top"><span className="fw-zone-icon">{data.department.icon}</span><span className="fw-zone-count">{data.count} MEMBERS</span></div>
    <strong>{data.department.name}</strong><small>DEPARTMENT ZONE</small><div className="fw-zone-building"><i /><i /><i /></div>
    <Handle type="source" position={Position.Bottom} />
  </div>;
  return <div className={"fw-person-node " + (selected ? "selected" : "")}>
    <Handle type="target" position={Position.Top} />
    <Avatar employee={data.employee} />
    <div className="fw-person-label"><strong>{data.employee.name}</strong><span>{data.employee.role}</span></div>
    <span className="fw-person-presence" />
    <Handle type="source" position={Position.Bottom} />
  </div>;
}
const nodeTypes: NodeTypes = { world: WorldNode };

function buildWorld(departments: Department[], employees: Employee[], savedPositions: Record<string, { x: number; y: number }>): WorldNode[] {
  const positions: Record<string, { x: number; y: number }> = {
    leadership: { x: 470, y: 65 }, operations: { x: 80, y: 330 }, product: { x: 470, y: 330 }, growth: { x: 860, y: 330 }
  };
  const result: WorldNode[] = departments.map((department) => {
    const pos = savedPositions["zone-" + department.id] ?? positions[department.id] ?? { x: 80 + departments.indexOf(department) * 300, y: 100 };
    return { id: "zone-" + department.id, type: "world", position: pos, data: { kind: "zone", department, count: employees.filter(e => e.departmentId === department.id).length }, draggable: false };
  });
  const offsets: Record<string, Array<{ x: number; y: number }>> = {
    leadership: [{ x: 420, y: 215 }, { x: 570, y: 215 }, { x: 495, y: 255 }],
    operations: [{ x: 30, y: 505 }, { x: 180, y: 505 }, { x: 105, y: 600 }],
    product: [{ x: 420, y: 505 }, { x: 570, y: 505 }, { x: 495, y: 600 }],
    growth: [{ x: 810, y: 505 }, { x: 960, y: 505 }, { x: 885, y: 600 }]
  };
  const indexByDepartment: Record<string, number> = {};
  employees.forEach((employee) => {
    const i = indexByDepartment[employee.departmentId] ?? 0; indexByDepartment[employee.departmentId] = i + 1;
    const p = savedPositions[employee.id] ?? offsets[employee.departmentId]?.[i] ?? { x: 80 + i * 145, y: 700 };
    const department = departments.find(d => d.id === employee.departmentId)?.name ?? "Unassigned";
    result.push({ id: employee.id, type: "world", position: p, data: { kind: "person", employee, department } });
  });
  return result;
}
function makeEdges(departments: Department[], employees: Employee[]): Edge[] {
  return employees.map(employee => ({
    id: "member-" + employee.id, source: "zone-" + employee.departmentId, target: employee.id,
    type: "smoothstep", animated: true, style: { stroke: "#7862b8", strokeWidth: 1.5, strokeDasharray: "5 5" }
  })).filter(edge => departments.some(d => "zone-" + d.id === edge.source));
}

export default function FounderWorkspace() {
  const [departments, setDepartments] = useState<Department[]>(() => readStore("departments", starterDepartments));
  const [employees, setEmployees] = useState<Employee[]>(() => readStore("employees", starterEmployees));
  const [tasks, setTasks] = useState<Task[]>(() => readStore("tasks", starterTasks));
  const [worldPositions, setWorldPositions] = useState<Record<string, { x: number; y: number }>>(() => readStore("positions", {}));
  const [tab, setTab] = useState<"world" | "people" | "tasks" | "insights">("world");
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskFilter, setTaskFilter] = useState("all");
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState("");
  const [employeeDraft, setEmployeeDraft] = useState({ name: "", role: "", departmentId: "operations", skills: "", bio: "" });
  const [taskDraft, setTaskDraft] = useState({ title: "", description: "", ownerId: "e2", requestedBy: "Manager", dueDate: "", priority: "Normal" as Task["priority"], estimatedMinutes: "60" });
  const [employeeEditId, setEmployeeEditId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify({ departments, employees, tasks, positions: worldPositions })); }, [departments, employees, tasks, worldPositions]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const activeTask = tasks.find(t => t.startedAt !== null);
  const selected = employees.find(e => e.id === selectedEmployee) ?? null;
  const worldNodes = useMemo(() => buildWorld(departments, employees, worldPositions), [departments, employees, worldPositions]);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorldNode>(worldNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(makeEdges(departments, employees));
  useEffect(() => { setNodes(worldNodes); setEdges(makeEdges(departments, employees)); }, [worldNodes, departments, employees, setNodes, setEdges]);
  const counts = { proposed: tasks.filter(t => t.status === "proposed").length, todo: tasks.filter(t => t.status === "todo").length, active: tasks.filter(t => t.status === "in_progress").length, done: tasks.filter(t => t.status === "done").length };
  const totalTracked = tasks.reduce((sum, t) => sum + t.trackedSeconds + (t.startedAt ? Math.floor((now - t.startedAt) / 1000) : 0), 0);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };

  function addEmployee(event: FormEvent) {
    event.preventDefault();
    const employee: Employee = { id: id("emp"), name: employeeDraft.name.trim(), role: employeeDraft.role.trim(), departmentId: employeeDraft.departmentId, skills: employeeDraft.skills.split(",").map(s => s.trim()).filter(Boolean), level: "Team member", color: ["violet", "cyan", "blue", "rose"][employees.length % 4] ?? "violet", bio: employeeDraft.bio.trim() };
    if (!employee.name || !employee.role) return;
    setEmployees(current => [...current, employee]); setSelectedEmployee(employee.id); setShowEmployeeForm(false); setEmployeeEditId(null);
    setEmployeeDraft({ name: "", role: "", departmentId: "operations", skills: "", bio: "" }); notify("Employee added to your organization world");
  }
  function saveEmployee(event: FormEvent) {
    event.preventDefault();
    if (!employeeEditId) return;
    setEmployees(current => current.map(e => e.id === employeeEditId ? { ...e, name: employeeDraft.name.trim(), role: employeeDraft.role.trim(), departmentId: employeeDraft.departmentId, skills: employeeDraft.skills.split(",").map(s => s.trim()).filter(Boolean), bio: employeeDraft.bio.trim() } : e));
    setShowEmployeeForm(false); setEmployeeEditId(null); notify("Employee profile updated");
  }
  function editEmployee(employee: Employee) {
    setSelectedEmployee(employee.id); setEmployeeEditId(employee.id); setEmployeeDraft({ name: employee.name, role: employee.role, departmentId: employee.departmentId, skills: employee.skills.join(", "), bio: employee.bio }); setShowEmployeeForm(true);
  }
  function createTask(event: FormEvent) {
    event.preventDefault();
    const task: Task = { id: editingTaskId ?? id("task"), title: taskDraft.title.trim(), description: taskDraft.description.trim(), ownerId: taskDraft.ownerId, requestedBy: taskDraft.requestedBy.trim() || "Manager", dueDate: taskDraft.dueDate, priority: taskDraft.priority, status: "proposed", estimatedMinutes: Number(taskDraft.estimatedMinutes) || 60, trackedSeconds: editingTaskId ? (tasks.find(t => t.id === editingTaskId)?.trackedSeconds ?? 0) : 0, startedAt: null, createdAt: editingTaskId ? (tasks.find(t => t.id === editingTaskId)?.createdAt ?? Date.now()) : Date.now() };
    if (!task.title || !task.dueDate) return;
    if (editingTaskId) setTasks(current => current.map(t => t.id === editingTaskId ? task : t)); else setTasks(current => [task, ...current]);
    setEditingTaskId(null); setShowTaskForm(false); setTab("tasks");
    setTaskDraft({ title: "", description: "", ownerId: employees[0]?.id ?? "", requestedBy: "Manager", dueDate: "", priority: "Normal", estimatedMinutes: "60" });
    notify(editingTaskId ? "Task correction saved for review" : "Task submitted for manager approval");
  }
  function approveTask(taskId: string) {
    setTasks(current => current.map(t => t.id === taskId ? { ...t, status: "todo" } : t)); notify("Task approved and added to employee's work list");
  }
  function rejectTask(taskId: string) {
    setTasks(current => current.map(t => t.id === taskId ? { ...t, status: "rejected" } : t)); notify("Task request rejected");
  }
  function startTask(taskId: string) {
    if (activeTask && activeTask.id !== taskId) { notify("Pause the running task before starting another"); return; }
    setTasks(current => current.map(t => t.id === taskId ? { ...t, status: "in_progress", startedAt: t.startedAt ?? Date.now() } : t)); notify("Task timer started");
  }
  function pauseTask(taskId: string) {
    setTasks(current => current.map(t => t.id === taskId && t.startedAt ? { ...t, trackedSeconds: t.trackedSeconds + Math.floor((Date.now() - t.startedAt) / 1000), startedAt: null } : t)); notify("Work timer paused");
  }
  function completeTask(taskId: string) {
    setTasks(current => current.map(t => t.id === taskId ? { ...t, status: "done", trackedSeconds: t.trackedSeconds + (t.startedAt ? Math.floor((Date.now() - t.startedAt) / 1000) : 0), startedAt: null } : t)); notify("Task completed and time recorded");
  }
  function resetDemo() {
    if (!window.confirm("Reset this browser prototype to the original sample organization and tasks?")) return;
    setDepartments(starterDepartments); setEmployees(starterEmployees); setTasks(starterTasks); setWorldPositions({}); setSelectedEmployee(null); notify("Sample workspace restored");
  }

  const taskCards = (status: TaskStatus, title: string, icon: string) => <section className="fw-task-column" key={status}>
    <header><span>{icon} {title}</span><b>{tasks.filter(t => t.status === status).length}</b></header>
    {tasks.filter(t => t.status === status).map(task => {
      const owner = employees.find(e => e.id === task.ownerId);
      const seconds = task.trackedSeconds + (task.startedAt ? Math.floor((now - task.startedAt) / 1000) : 0);
      return <article className="fw-task-card" key={task.id}>
        <div className="fw-task-card-top"><span className={"fw-priority priority-" + task.priority.toLowerCase()}>{task.priority}</span><span className="fw-task-date">Due {task.dueDate}</span></div>
        <strong>{task.title}</strong><p>{task.description || "No description added."}</p>
        <div className="fw-task-owner">{owner && <Avatar employee={owner} />}<span>{owner?.name ?? "Unassigned"}<small>Requested by {task.requestedBy}</small></span></div>
        <div className="fw-task-progress"><span>TIME LOGGED</span><strong>{formatTime(seconds)}</strong><small>Estimate {task.estimatedMinutes} min</small></div>
        {status === "proposed" && <div className="fw-task-actions"><button onClick={() => approveTask(task.id)} className="fw-button fw-button-primary">Approve</button><button onClick={() => { setEditingTaskId(task.id); setTaskDraft({ title: task.title, description: task.description, ownerId: task.ownerId, requestedBy: task.requestedBy, dueDate: task.dueDate, priority: task.priority, estimatedMinutes: String(task.estimatedMinutes) }); setShowTaskForm(true); }} className="fw-button fw-button-quiet">Correct</button><button onClick={() => rejectTask(task.id)} className="fw-button fw-button-quiet">Reject</button></div>}
        {status === "todo" && <div className="fw-task-actions"><button onClick={() => startTask(task.id)} className="fw-button fw-button-primary">▶ Start work</button></div>}
        {status === "in_progress" && <div className="fw-task-actions"><button onClick={() => pauseTask(task.id)} className="fw-button fw-button-quiet">Ⅱ Pause</button><button onClick={() => completeTask(task.id)} className="fw-button fw-button-primary">✓ Complete</button></div>}
        {status === "rejected" && <div className="fw-task-rejected">Not approved · Can be resubmitted</div>}
      </article>;
    })}
    {tasks.filter(t => t.status === status).length === 0 && <div className="fw-empty-column">Nothing here yet</div>}
  </section>;

  return <div className="fw-app">
    <aside className="fw-sidebar">
      <div className="fw-brand"><div className="fw-brand-mark">C</div><div><strong>CIAS</strong><span>ORGANIZATION WORLD</span></div></div>
      <div className="fw-workspace-caption">YOUR WORKSPACE</div>
      <nav className="fw-nav">
        <button className={tab === "world" ? "active" : ""} onClick={() => setTab("world")}><span>◈</span> Organization World</button>
        <button className={tab === "people" ? "active" : ""} onClick={() => setTab("people")}><span>♙</span> People & Skills</button>
        <button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}><span>▤</span> Task Command</button>
        <button className={tab === "insights" ? "active" : ""} onClick={() => setTab("insights")}><span>⌁</span> Performance</button>
      </nav>
      <div className="fw-sidebar-bottom"><span className="fw-live-dot" /> Local prototype <small>Founder workspace</small></div>
    </aside>
    <main className="fw-main">
      <header className="fw-topbar"><div><span>CIAS</span><i>/</i>{tab === "world" ? "Organization World" : tab === "people" ? "People & Skills" : tab === "tasks" ? "Task Command" : "Performance"}</div><div className="fw-top-actions"><span className="fw-local-tag">● LOCAL DATA</span><button onClick={resetDemo} title="Restore sample data">↺ Reset demo</button><div className="fw-owner-chip">G<span>Founder</span></div></div></header>
      {tab === "world" && <section className="fw-content">
        <div className="fw-page-head"><div><div className="fw-eyebrow">YOUR COMPANY · ONE CONNECTED WORLD</div><h1>Organization World</h1><p>Build your team, explore the people behind the work, and shape how your company operates.</p></div><button className="fw-button fw-button-primary" onClick={() => { setEmployeeEditId(null); setSelectedEmployee(null); setEmployeeDraft({ name: "", role: "", departmentId: departments[0]?.id ?? "", skills: "", bio: "" }); setShowEmployeeForm(true); }}>＋ Add employee</button></div>
        <div className="fw-kpis"><div><span>TEAM MEMBERS</span><strong>{employees.length.toString().padStart(2, "0")}</strong><small>People in your world</small></div><div><span>DEPARTMENTS</span><strong>{departments.length.toString().padStart(2, "0")}</strong><small>Connected zones</small></div><div><span>OPEN TASKS</span><strong>{(counts.todo + counts.active + counts.proposed).toString().padStart(2, "0")}</strong><small>Across the organization</small></div><div><span>AWAITING REVIEW</span><strong>{counts.proposed.toString().padStart(2, "0")}</strong><small>Need your approval</small></div></div>
        <div className="fw-world-toolbar"><div><strong>THE PLAYGROUND</strong><span>Drag people to arrange your world · Select an avatar to open their profile</span></div><div className="fw-world-legend"><span><i className="legend-violet" />Leadership</span><span><i className="legend-cyan" />Operations</span><span><i className="legend-blue" />Product</span><span><i className="legend-rose" />Growth</span></div></div>
        <div className="fw-world-layout">
          <div className="fw-world-canvas">
            <div className="fw-world-sky"><span className="fw-world-sun" /><span className="fw-cloud cloud-one" /><span className="fw-cloud cloud-two" /></div>
            <div className="fw-world-land" />
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeDragStop={(_, node) => setWorldPositions(current => ({ ...current, [node.id]: node.position }))} onNodeClick={(_, node) => { if (node.data.kind === "person") setSelectedEmployee(node.data.employee.id); }} fitView fitViewOptions={{ padding: 0.12, minZoom: 0.5, maxZoom: 0.9 }} minZoom={0.3} maxZoom={1.4} nodesDraggable nodesConnectable={false} elementsSelectable proOptions={{ hideAttribution: true }}>
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#6c6991" />
              <Controls position="bottom-left" showInteractive={false} />
              <MiniMap position="bottom-right" nodeColor={n => n.data.kind === "zone" ? "#9678d9" : "#5dc6bf"} maskColor="rgba(10,9,27,.65)" />
              <Panel position="top-right" className="fw-map-hint">✥ DRAG TO REARRANGE · CLICK TO INSPECT</Panel>
            </ReactFlow>
          </div>
          {selected && <aside className="fw-profile-panel">
            <button className="fw-panel-close" onClick={() => setSelectedEmployee(null)}>×</button><div className="fw-profile-avatar"><Avatar employee={selected} size="large" /></div>
            <div className="fw-profile-label">TEAM MEMBER</div><h2>{selected.name}</h2><p>{selected.role}</p>
            <div className="fw-profile-dept">{departments.find(d => d.id === selected.departmentId)?.name ?? "Unassigned"}</div>
            <div className="fw-profile-block"><label>ABOUT</label><p>{selected.bio || "No introduction added yet."}</p></div>
            <div className="fw-profile-block"><label>SKILLS & CAPABILITIES</label><div className="fw-skill-pills">{selected.skills.map(skill => <span key={skill}>{skill}</span>)}</div></div>
            <div className="fw-profile-block"><label>WORK SNAPSHOT</label><div className="fw-profile-stats"><div><strong>{tasks.filter(t => t.ownerId === selected.id && t.status !== "done").length}</strong><small>Open tasks</small></div><div><strong>{tasks.filter(t => t.ownerId === selected.id && t.status === "done").length}</strong><small>Completed</small></div></div></div>
            <div className="fw-profile-block"><label>ASSIGNED WORK</label><div className="fw-profile-task-list">{tasks.filter(t => t.ownerId === selected.id).map(task => <div key={task.id}><strong>{task.title}</strong><span>{task.status.replace("_", " ")} · Due {task.dueDate}</span></div>)}{tasks.filter(t => t.ownerId === selected.id).length === 0 && <small>No tasks assigned yet.</small>}</div></div><button className="fw-button fw-button-primary fw-full" onClick={() => editEmployee(selected)}>Edit profile</button>
            <button className="fw-button fw-button-quiet fw-full" onClick={() => { setEditingTaskId(null); setTaskDraft(d => ({ ...d, ownerId: selected.id })); setShowTaskForm(true); setTab("tasks"); }}>＋ Create task for {selected.name.split(" ")[0]}</button>
          </aside>}
        </div>
        <div className="fw-world-foot"><span>✦ Your organization, visualized</span><span>Changes are saved in this browser automatically</span></div>
      </section>}
      {tab === "people" && <section className="fw-content">
        <div className="fw-page-head"><div><div className="fw-eyebrow">THE PEOPLE BEHIND THE OUTPUT</div><h1>People & Skills</h1><p>Build each employee profile from your one-to-one conversations.</p></div><button className="fw-button fw-button-primary" onClick={() => { setEmployeeEditId(null); setSelectedEmployee(null); setEmployeeDraft({ name: "", role: "", departmentId: departments[0]?.id ?? "", skills: "", bio: "" }); setShowEmployeeForm(true); }}>＋ Add employee</button></div>
        <div className="fw-search-row"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people, roles or skills..." /><span>{employees.length} team members</span></div>
        <div className="fw-people-grid">{employees.filter(e => (e.name + e.role + e.skills.join(" ")).toLowerCase().includes(search.toLowerCase())).map(employee => <button className="fw-person-card" key={employee.id} onClick={() => { setSelectedEmployee(employee.id); setTab("world"); }}><Avatar employee={employee} size="large" /><div><strong>{employee.name}</strong><span>{employee.role}</span><small>{departments.find(d => d.id === employee.departmentId)?.name}</small></div><div className="fw-card-skills">{employee.skills.slice(0, 3).map(skill => <i key={skill}>{skill}</i>)}</div><b>↗</b></button>)}</div>
      </section>}
      {tab === "tasks" && <section className="fw-content">
        <div className="fw-page-head"><div><div className="fw-eyebrow">FROM REQUEST TO RESULT</div><h1>Task Command</h1><p>Capture work, approve it, track execution and record the result.</p></div><button className="fw-button fw-button-primary" onClick={() => setShowTaskForm(true)}>＋ Submit a task</button></div>
        <div className="fw-task-summary"><div><span>NEEDS APPROVAL</span><strong>{counts.proposed}</strong></div><div><span>READY TO START</span><strong>{counts.todo}</strong></div><div><span>IN PROGRESS</span><strong>{counts.active}</strong></div><div><span>COMPLETED</span><strong>{counts.done}</strong></div></div>
        <div className="fw-task-filters"><span>WORK QUEUE</span><select value={taskFilter} onChange={e => setTaskFilter(e.target.value)}><option value="all">All task states</option><option value="proposed">Needs approval</option><option value="todo">Ready</option><option value="in_progress">In progress</option><option value="done">Completed</option><option value="rejected">Rejected</option></select></div>
        <div className="fw-task-board">{taskFilter === "all" ? <>{taskCards("proposed","Needs approval","◷")}{taskCards("todo","Ready","○")}{taskCards("in_progress","In progress","◉")}{taskCards("done","Completed","✓")}{taskCards("rejected","Rejected","×")}</> : taskCards(taskFilter as TaskStatus,"Filtered tasks","▤")}</div>
        <div className="fw-task-note"><span>◷</span><div><strong>Time tracking is manual and transparent</strong><p>Start, pause and complete tasks to build a reliable record of time spent. Only one task timer can run at a time in this prototype.</p></div></div>
      </section>}
      {tab === "insights" && <section className="fw-content">
        <div className="fw-page-head"><div><div className="fw-eyebrow">TURN ACTIVITY INTO IMPROVEMENT</div><h1>Performance Overview</h1><p>A live snapshot based on the tasks and time recorded in this workspace.</p></div><span className="fw-local-tag">SAMPLE WORKSPACE DATA</span></div>
        <div className="fw-insight-kpis"><div><span>COMPLETED TASKS</span><strong>{counts.done}</strong></div><div><span>ACTIVE WORK</span><strong>{counts.active}</strong></div><div><span>TIME RECORDED</span><strong>{Math.floor(totalTracked / 3600)}h {Math.floor((totalTracked % 3600) / 60)}m</strong></div><div><span>AWAITING APPROVAL</span><strong>{counts.proposed}</strong></div></div>
        <div className="fw-insight-grid"><div className="fw-insight-panel"><h3>Team workload</h3><p>Open tasks assigned to each team member.</p>{employees.map(employee => { const count = tasks.filter(t => t.ownerId === employee.id && ["todo","in_progress","proposed"].includes(t.status)).length; return <div className="fw-workload-row" key={employee.id}><Avatar employee={employee} /><span>{employee.name}</span><div><i style={{ width: Math.min(100, count * 20) + "%" }} /></div><b>{count}</b></div>; })}</div><div className="fw-insight-panel"><h3>Delivery snapshot</h3><p>Current distribution of tasks by state.</p>{[["Completed",counts.done,"#67c7a2"],["In progress",counts.active,"#7aa6ee"],["Ready",counts.todo,"#aa8cf0"],["Needs approval",counts.proposed,"#e3b66d"]].map(([label,value,color]) => <div className="fw-delivery-row" key={label as string}><span>{label}</span><strong>{value}</strong><i style={{ background: color as string, width: Math.max(4, Number(value) * 25) + "%" }} /></div>)}</div></div>
        <div className="fw-insight-disclaimer">Early prototype metrics only. Reliable productivity comparisons require consistent task descriptions, estimates, deadlines and time logging across the team.</div>
      </section>}
    </main>
    {showEmployeeForm && <div className="fw-modal-backdrop" onClick={() => setShowEmployeeForm(false)}><form className="fw-modal" onSubmit={employeeEditId ? saveEmployee : addEmployee} onClick={e => e.stopPropagation()}>
      <div className="fw-modal-head"><div><span>FOUNDER EDITOR</span><h2>{employeeEditId ? "Edit employee" : "Add team member"}</h2></div><button type="button" onClick={() => { setShowEmployeeForm(false); setEmployeeEditId(null); }}>×</button></div>
      <label>Full name<input required value={employeeDraft.name} onChange={e => setEmployeeDraft(d => ({ ...d, name: e.target.value }))} placeholder="Employee name" /></label>
      <label>Role / designation<input required value={employeeDraft.role} onChange={e => setEmployeeDraft(d => ({ ...d, role: e.target.value }))} placeholder="e.g. Operations Executive" /></label>
      <label>Department<select value={employeeDraft.departmentId} onChange={e => setEmployeeDraft(d => ({ ...d, departmentId: e.target.value }))}>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label>Skills (comma separated)<input value={employeeDraft.skills} onChange={e => setEmployeeDraft(d => ({ ...d, skills: e.target.value }))} placeholder="Communication, Excel, Research" /></label>
      <label>Interview notes / introduction<textarea rows={3} value={employeeDraft.bio} onChange={e => setEmployeeDraft(d => ({ ...d, bio: e.target.value }))} placeholder="What does this person do well? What are their responsibilities?" /></label>
      <div className="fw-modal-actions"><button type="button" className="fw-button fw-button-quiet" onClick={() => setShowEmployeeForm(false)}>Cancel</button><button className="fw-button fw-button-primary">{employeeEditId ? "Save changes" : "Add to world"}</button></div>
    </form></div>}
    {showTaskForm && <div className="fw-modal-backdrop" onClick={() => { setShowTaskForm(false); setEditingTaskId(null); }}><form className="fw-modal" onSubmit={createTask} onClick={e => e.stopPropagation()}>
      <div className="fw-modal-head"><div><span>TASK INTAKE</span><h2>{editingTaskId ? "Correct task details" : "Submit a task"}</h2></div><button type="button" onClick={() => { setShowTaskForm(false); setEditingTaskId(null); }}>×</button></div>
      <p className="fw-modal-intro">Record the work, who requested it and who is responsible. It enters the approval queue before becoming active.</p>
      <label>Task title<input required value={taskDraft.title} onChange={e => setTaskDraft(d => ({ ...d, title: e.target.value }))} placeholder="What needs to get done?" /></label>
      <label>Description<textarea rows={3} value={taskDraft.description} onChange={e => setTaskDraft(d => ({ ...d, description: e.target.value }))} placeholder="Expected output and context..." /></label>
      <div className="fw-form-grid"><label>Assign to<select value={taskDraft.ownerId} onChange={e => setTaskDraft(d => ({ ...d, ownerId: e.target.value }))}>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label>Requested by<input value={taskDraft.requestedBy} onChange={e => setTaskDraft(d => ({ ...d, requestedBy: e.target.value }))} placeholder="Manager / person" /></label></div>
      <div className="fw-form-grid"><label>Deadline<input required type="date" value={taskDraft.dueDate} onChange={e => setTaskDraft(d => ({ ...d, dueDate: e.target.value }))} /></label><label>Priority<select value={taskDraft.priority} onChange={e => setTaskDraft(d => ({ ...d, priority: e.target.value as Task["priority"] }))}><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option></select></label></div>
      <label>Estimated effort (minutes)<input type="number" min="1" value={taskDraft.estimatedMinutes} onChange={e => setTaskDraft(d => ({ ...d, estimatedMinutes: e.target.value }))} /></label>
      <div className="fw-modal-actions"><button type="button" className="fw-button fw-button-quiet" onClick={() => setShowTaskForm(false)}>Cancel</button><button className="fw-button fw-button-primary">{editingTaskId ? "Save correction" : "Send for approval"}</button></div>
    </form></div>}
    {toast && <div className="fw-toast">✓ {toast}</div>}
  </div>;
}
