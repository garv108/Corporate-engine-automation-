import { useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  Handle,
  Position,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes
} from "@xyflow/react";
import { useRive } from "@rive-app/react-canvas";
import "@xyflow/react/dist/style.css";
import "./organization-twin.css";

type EmployeeData = {
  kind: "employee";
  name: string;
  role: string;
  department: string;
  manager: string;
  status: "Active" | "Away" | "Onboarding";
  skills: string[];
  activeTasks: number;
  completedTasks: number;
  initials: string;
  accent: string;
  demo: true;
  riveSrc?: string;
};
type DepartmentData = {
  kind: "department";
  name: string;
  description: string;
  headcount: number;
  accent: string;
  demo: true;
};
type OrgData = { kind: "org"; name: string; description: string; demo: true };
type TaskData = {
  kind: "task";
  name: string;
  status: "In progress" | "Review" | "Blocked";
  priority: "High" | "Medium";
  owner: string;
  department: string;
  due: string;
  demo: true;
};
type TwinData = EmployeeData | DepartmentData | OrgData | TaskData;
type TwinNode = Node<TwinData>;

function RiveCharacter({ src }: { src: string }) {
  const { RiveComponent } = useRive({ src, autoplay: true });
  return <RiveComponent className="ot-rive-character" />;
}

function Character({ data }: { data: EmployeeData }) {
  return (
    <div className="ot-character-wrap">
      {data.riveSrc ? <RiveCharacter src={data.riveSrc} /> : (
        <div className={"ot-bot ot-bot-" + data.accent} aria-hidden="true">
          <span className="ot-antenna" />
          <span className="ot-bot-head"><i /><i /></span>
          <span className="ot-bot-body"><i /><i /></span>
          <span className="ot-bot-shadow" />
        </div>
      )}
    </div>
  );
}

function OrgNode({ data }: NodeProps<TwinNode>) {
  if (data.kind !== "org") return null;
  return (
    <div className="ot-org-node">
      <div className="ot-org-orbit"><span>✳</span></div>
      <div>
        <div className="ot-node-kicker">CIAS · CONTROL PLANE</div>
        <strong>{data.name}</strong>
        <small>{data.description}</small>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function DepartmentNode({ data }: NodeProps<TwinNode>) {
  if (data.kind !== "department") return null;
  return (
    <div className="ot-department-node" style={{ ["--dept-accent" as string]: data.accent }}>
      <Handle type="target" position={Position.Top} />
      <div className="ot-dept-icon"><span /></div>
      <div className="ot-dept-copy">
        <span className="ot-node-kicker">DEPARTMENT</span>
        <strong>{data.name}</strong>
        <small>{data.description}</small>
      </div>
      <div className="ot-dept-count"><strong>{data.headcount}</strong><small>PEOPLE</small></div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function EmployeeNode({ data, selected }: NodeProps<TwinNode>) {
  if (data.kind !== "employee") return null;
  return (
    <div className={"ot-employee-node" + (selected ? " is-selected" : "")}>
      <Handle type="target" position={Position.Top} />
      <div className="ot-employee-visual"><Character data={data} /></div>
      <div className="ot-employee-copy">
        <strong>{data.name}</strong>
        <span>{data.role}</span>
        <small><i className={"ot-status-dot status-" + data.status.toLowerCase()} />{data.status}</small>
      </div>
      <div className="ot-employee-task-count">{data.activeTasks} <small>active</small></div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function TaskNode({ data }: NodeProps<TwinNode>) {
  if (data.kind !== "task") return null;
  return (
    <div className="ot-task-node">
      <Handle type="target" position={Position.Top} />
      <div className="ot-task-topline"><span>TASK</span><b className={"priority-" + data.priority.toLowerCase()}>{data.priority}</b></div>
      <strong>{data.name}</strong>
      <small>{data.owner} · {data.department}</small>
      <div className="ot-task-bottom"><span className={"task-" + data.status.toLowerCase().replace(" ", "-")}>{data.status}</span><span>Due {data.due}</span></div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  organization: OrgNode,
  department: DepartmentNode,
  employee: EmployeeNode,
  task: TaskNode
};

const departments = [
  { id: "dept-exec", name: "Executive Office", description: "Strategy & governance", headcount: 2, accent: "violet", x: 60 },
  { id: "dept-product", name: "Product & Engineering", description: "Product, platform & delivery", headcount: 3, accent: "blue", x: 390 },
  { id: "dept-ops", name: "Operations", description: "People, finance & process", headcount: 2, accent: "cyan", x: 720 },
  { id: "dept-growth", name: "Growth & Partnerships", description: "Marketing & customer success", headcount: 2, accent: "pink", x: 1050 }
];

const people: Array<Omit<EmployeeData, "kind" | "demo"> & { id: string; x: number; y: number }> = [
  { id: "p-01", name: "Aarav Mehta", role: "Chief Executive Officer", department: "Executive Office", manager: "Board / Founder", status: "Active", skills: ["Strategy", "Leadership", "Operations"], activeTasks: 3, completedTasks: 42, initials: "AM", accent: "violet", x: 70, y: 365 },
  { id: "p-02", name: "Mira Shah", role: "Chief of Staff", department: "Executive Office", manager: "Aarav Mehta", status: "Active", skills: ["Program management", "Planning", "Communication"], activeTasks: 5, completedTasks: 31, initials: "MS", accent: "blue", x: 70, y: 535 },
  { id: "p-03", name: "Dev Kapoor", role: "Engineering Lead", department: "Product & Engineering", manager: "Aarav Mehta", status: "Active", skills: ["TypeScript", "Architecture", "APIs"], activeTasks: 4, completedTasks: 28, initials: "DK", accent: "cyan", x: 400, y: 365 },
  { id: "p-04", name: "Isha Rao", role: "Product Designer", department: "Product & Engineering", manager: "Dev Kapoor", status: "Active", skills: ["UX", "Prototyping", "Research"], activeTasks: 2, completedTasks: 19, initials: "IR", accent: "pink", x: 400, y: 535 },
  { id: "p-05", name: "Kabir Nair", role: "Platform Engineer", department: "Product & Engineering", manager: "Dev Kapoor", status: "Away", skills: ["Node.js", "PostgreSQL", "Security"], activeTasks: 3, completedTasks: 24, initials: "KN", accent: "violet", x: 400, y: 705 },
  { id: "p-06", name: "Anaya Singh", role: "Operations Manager", department: "Operations", manager: "Mira Shah", status: "Active", skills: ["Process design", "Compliance", "People ops"], activeTasks: 4, completedTasks: 36, initials: "AS", accent: "blue", x: 730, y: 365 },
  { id: "p-07", name: "Rohan Das", role: "People & Culture", department: "Operations", manager: "Anaya Singh", status: "Onboarding", skills: ["Recruitment", "Enablement", "HR systems"], activeTasks: 2, completedTasks: 11, initials: "RD", accent: "cyan", x: 730, y: 535 },
  { id: "p-08", name: "Tara Joshi", role: "Growth Lead", department: "Growth & Partnerships", manager: "Aarav Mehta", status: "Active", skills: ["Marketing", "Partnerships", "Analytics"], activeTasks: 6, completedTasks: 33, initials: "TJ", accent: "pink", x: 1060, y: 365 },
  { id: "p-09", name: "Neel Verma", role: "Customer Success", department: "Growth & Partnerships", manager: "Tara Joshi", status: "Active", skills: ["Customer success", "Research", "CRM"], activeTasks: 3, completedTasks: 17, initials: "NV", accent: "violet", x: 1060, y: 535 }
];

const taskRecords: Array<{ id: string; name: string; status: TaskData["status"]; priority: TaskData["priority"]; owner: string; department: string; due: string; x: number; y: number }> = [
  { id: "t-01", name: "Approve quarterly roadmap", status: "Review", priority: "High", owner: "Mira Shah", department: "Executive Office", due: "Nov 14", x: 75, y: 930 },
  { id: "t-02", name: "Release onboarding flow", status: "In progress", priority: "High", owner: "Dev Kapoor", department: "Product & Engineering", due: "Nov 16", x: 405, y: 930 },
  { id: "t-03", name: "Complete team access review", status: "Blocked", priority: "Medium", owner: "Anaya Singh", department: "Operations", due: "Nov 18", x: 735, y: 930 },
  { id: "t-04", name: "Launch partner campaign", status: "In progress", priority: "Medium", owner: "Tara Joshi", department: "Growth & Partnerships", due: "Nov 20", x: 1065, y: 930 }
];

const initialNodes: TwinNode[] = [
  { id: "org-root", type: "organization", position: { x: 500, y: 25 }, data: { kind: "org", name: "Organization Brain", description: "Strategy · governance · shared context", demo: true } },
  ...departments.map((d) => ({
    id: d.id, type: "department", position: { x: d.x, y: 190 },
    data: { kind: "department" as const, name: d.name, description: d.description, headcount: d.headcount, accent: d.accent, demo: true as const }
  })),
  ...people.map((p) => ({
    id: p.id, type: "employee", position: { x: p.x, y: p.y },
    data: { kind: "employee" as const, name: p.name, role: p.role, department: p.department, manager: p.manager, status: p.status, skills: p.skills, activeTasks: p.activeTasks, completedTasks: p.completedTasks, initials: p.initials, accent: p.accent, demo: true as const }
  })),
  ...taskRecords.map((t) => ({
    id: t.id, type: "task", position: { x: t.x, y: t.y },
    data: { kind: "task" as const, name: t.name, status: t.status, priority: t.priority, owner: t.owner, department: t.department, due: t.due, demo: true as const }
  }))
];

const initialEdges: Edge[] = [
  ...departments.map((d) => ({ id: "org-" + d.id, source: "org-root", target: d.id, type: "smoothstep", animated: true, style: { stroke: "#9b76ff", strokeWidth: 2 }, label: "governance" })),
  ...people.map((p) => ({ id: "dept-" + p.id, source: departments.find((d) => d.name === p.department)!.id, target: p.id, type: "smoothstep", animated: true, style: { stroke: "#6252a8", strokeWidth: 1.6 } })),
  { id: "manager-mira", source: "p-01", target: "p-02", type: "smoothstep", animated: true, label: "reports to", style: { stroke: "#b18bff", strokeDasharray: "5 4" } },
  { id: "manager-dev", source: "p-01", target: "p-03", type: "smoothstep", animated: true, label: "reports to", style: { stroke: "#b18bff", strokeDasharray: "5 4" } },
  { id: "manager-anaya", source: "p-02", target: "p-06", type: "smoothstep", animated: true, label: "reports to", style: { stroke: "#b18bff", strokeDasharray: "5 4" } },
  { id: "manager-tara", source: "p-01", target: "p-08", type: "smoothstep", animated: true, label: "reports to", style: { stroke: "#b18bff", strokeDasharray: "5 4" } },
  ...taskRecords.map((t, i) => ({ id: "assign-" + t.id, source: people.find((p) => p.name === t.owner)!.id, target: t.id, type: "smoothstep", animated: true, style: { stroke: "#3bc9d5", strokeDasharray: "4 5" }, label: "assigned" })),
  { id: "dependency-roadmap-release", source: "t-01", target: "t-02", type: "smoothstep", animated: true, label: "blocks", style: { stroke: "#ffb45f", strokeWidth: 2 } },
  { id: "dependency-access-campaign", source: "t-03", target: "t-04", type: "smoothstep", animated: true, label: "enables", style: { stroke: "#ffb45f", strokeWidth: 2 } }
];

function DetailPanel({ node, onClose }: { node: TwinNode | null; onClose: () => void }) {
  if (!node) return null;
  const data = node.data;
  return (
    <aside className="ot-detail-panel">
      <div className="ot-panel-head">
        <div><span className="ot-node-kicker">INSPECTOR</span><h3>{data.kind === "org" ? "Organization" : data.kind === "task" ? "Task details" : data.kind === "department" ? "Department profile" : "Employee profile"}</h3></div>
        <button type="button" className="ot-close" onClick={onClose} aria-label="Close details">×</button>
      </div>
      {data.kind === "employee" && <>
        <div className="ot-profile-hero"><Character data={data} /><div><h2>{data.name}</h2><p>{data.role}</p><span className={"ot-profile-status status-" + data.status.toLowerCase()}>{data.status}</span></div></div>
        <div className="ot-detail-section"><label>ORGANIZATION</label><div className="ot-detail-row"><span>Department</span><strong>{data.department}</strong></div><div className="ot-detail-row"><span>Reports to</span><strong>{data.manager}</strong></div></div>
        <div className="ot-detail-section"><label>CAPABILITY PROFILE</label><div className="ot-skills">{data.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></div>
        <div className="ot-detail-metrics"><div><strong>{data.activeTasks}</strong><span>Active tasks</span></div><div><strong>{data.completedTasks}</strong><span>Completed</span></div></div>
        <p className="ot-demo-note">Demo profile · Not a real employee record</p>
      </>}
      {data.kind === "department" && <>
        <div className="ot-detail-section"><label>DEPARTMENT</label><h2>{data.name}</h2><p>{data.description}</p><div className="ot-detail-row"><span>Demo headcount</span><strong>{data.headcount}</strong></div></div>
        <p className="ot-demo-note">Demo department · Replace with tenant-scoped CIAS data</p>
      </>}
      {data.kind === "task" && <>
        <div className="ot-detail-section"><label>TASK</label><h2>{data.name}</h2><div className="ot-detail-row"><span>Status</span><strong>{data.status}</strong></div><div className="ot-detail-row"><span>Priority</span><strong>{data.priority}</strong></div><div className="ot-detail-row"><span>Owner</span><strong>{data.owner}</strong></div><div className="ot-detail-row"><span>Department</span><strong>{data.department}</strong></div><div className="ot-detail-row"><span>Due date</span><strong>{data.due}</strong></div></div>
        <p className="ot-demo-note">Demo task · No live task is changed from this canvas</p>
      </>}
      {data.kind === "org" && <div className="ot-detail-section"><label>CONTROL PLANE</label><h2>{data.name}</h2><p>{data.description}</p><p className="ot-demo-note">Organization-level view of strategy, governance and shared context.</p></div>}
    </aside>
  );
}

export default function OrganizationTwin() {
  const [nodes, setNodes, onNodesChange] = useNodesState<TwinNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<TwinNode | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState("All departments");
  const [search, setSearch] = useState("");
  const [showTasks, setShowTasks] = useState(true);

  const visibleNodes = useMemo(() => nodes.filter((node) => {
    const data = node.data;
    if (data.kind === "task" && !showTasks) return false;
    if (departmentFilter !== "All departments" && data.kind !== "org" &&
      data.kind !== "department" && data.department !== departmentFilter) return false;
    if (departmentFilter !== "All departments" && data.kind === "department" && data.name !== departmentFilter) return false;
    if (search.trim() && data.kind === "employee" &&
      !(data.name + " " + data.role + " " + data.department).toLowerCase().includes(search.toLowerCase())) return false;
    if (search.trim() && data.kind === "task" &&
      !(data.name + " " + data.owner).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [nodes, departmentFilter, search, showTasks]);

  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(() => edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)), [edges, visibleIds]);

  function resetLayout() {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setSelectedNode(null);
    setDepartmentFilter("All departments");
    setSearch("");
    setShowTasks(true);
  }

  return (
    <section className="org-twin-page">
      <div className="ot-heading">
        <div>
          <p className="ot-eyebrow">CIAS · WORKFORCE INTELLIGENCE</p>
          <h1>Organization Twin</h1>
          <p className="ot-subtitle">Explore the people, structure and work that connect your organization.</p>
        </div>
        <div className="ot-demo-pill"><span /> DEMO ENVIRONMENT · SAMPLE DATA</div>
      </div>
      <div className="ot-stats">
        <div><span>DEPARTMENTS</span><strong>04</strong><small>Illustrative structure</small></div>
        <div><span>PEOPLE</span><strong>09</strong><small>Fictional profiles</small></div>
        <div><span>ACTIVE TASKS</span><strong>32</strong><small>Sample workload</small></div>
        <div><span>DEPENDENCIES</span><strong>02</strong><small>Illustrative links</small></div>
      </div>
      <div className="ot-workspace">
        <div className="ot-canvas-shell">
          <div className="ot-toolbar">
            <div className="ot-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find an employee or task..." aria-label="Search employees and tasks" /></div>
            <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} aria-label="Filter department">
              <option>All departments</option>
              {departments.map((department) => <option key={department.id}>{department.name}</option>)}
            </select>
            <button type="button" className={showTasks ? "ot-toggle active" : "ot-toggle"} onClick={() => setShowTasks((value) => !value)}>Task layer <span>{showTasks ? "ON" : "OFF"}</span></button>
            <button type="button" className="ot-reset" onClick={resetLayout}>Reset canvas</button>
          </div>
          <div className="ot-canvas">
            <ReactFlow
              nodes={visibleNodes}
              edges={visibleEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={(_, node) => setSelectedNode(node as TwinNode)}
              onPaneClick={() => setSelectedNode(null)}
              fitView
              fitViewOptions={{ padding: 0.16, minZoom: 0.45, maxZoom: 0.9 }}
              minZoom={0.25}
              maxZoom={1.4}
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{ type: "smoothstep" }}
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#2b2450" />
              <Controls position="bottom-left" showInteractive={false} />
              <MiniMap position="bottom-right" pannable zoomable nodeColor={(node) => node.type === "department" ? "#7153c9" : node.type === "employee" ? "#3b9ca9" : node.type === "task" ? "#b77c3e" : "#9a75f5"} maskColor="rgba(8,7,22,0.75)" />
              <Panel position="top-left" className="ot-canvas-legend">
                <span><i className="legend-org" /> Organization</span><span><i className="legend-dept" /> Department</span><span><i className="legend-person" /> Employee</span>{showTasks && <span><i className="legend-task" /> Task</span>}
              </Panel>
              <Panel position="top-right" className="ot-canvas-hint">DRAG TO REPOSITION · CLICK TO INSPECT</Panel>
            </ReactFlow>
          </div>
          <div className="ot-canvas-footer"><span>◉ Live canvas interactions</span><span>Positions are local until a future save-layout feature is connected</span></div>
        </div>
        <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
      </div>
      <div className="ot-architecture-note"><strong>Architecture boundary</strong><span>This prototype uses sample records. The production adapter will read tenant-scoped departments, employees, manager relationships, skills and tasks from the existing CIAS APIs. Moving a node changes only its canvas position; it does not change reporting lines or employee permissions.</span></div>
    </section>
  );
}
