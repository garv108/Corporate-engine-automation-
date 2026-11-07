import { useEffect, useState } from "react";
import { navigation } from "./navigation";
import GuidedDiscovery from "./GuidedDiscovery";

type ApiStatus = "checking" | "online" | "offline";

function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [activePage, setActivePage] = useState<(typeof navigation)[number]>("Overview");

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/v1/health/live", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable");
        setApiStatus("online");
      })
      .catch(() => {
        if (!controller.signal.aborted) setApiStatus("offline");
      });

    return () => controller.abort();
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <strong>CIAS</strong>
            <span>INTELLIGENCE SYSTEM</span>
          </div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map((item) => {
            const available = item === "Overview" || item === "Work Discovery";
            return (
              <button
                className={activePage === item ? "nav-item active" : "nav-item"}
                key={item}
                type="button"
                disabled={!available}
                title={available ? item : "Available in a later milestone"}
                aria-current={activePage === item ? "page" : undefined}
                onClick={() => { if (available) setActivePage(item); }}
              >
                <span className="nav-dot" />
                {item}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span className="status-indicator" />
          Development environment
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> {activePage}</div>
          <div className="topbar-right">
            <span className={apiStatus === "online" ? "api-status online" : "api-status"}>
              <span /> API {apiStatus}
            </span>
            <div className="avatar">GP</div>
          </div>
        </header>

        {activePage === "Work Discovery" ? <GuidedDiscovery /> : <section className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">CORPORATE INTELLIGENCE & AUTOMATION</p>
              <h1>Command Center</h1>
              <p className="subtitle">A governed workspace for understanding operations and building reliable automation.</p>
            </div>
            <span className="environment-tag">LOCAL DEVELOPMENT</span>
          </div>

          <div className="notice">
            <div className="notice-icon">i</div>
            <div>
              <strong>Foundation environment</strong>
              <p>CIAS is being assembled. No production systems are connected and no live automations are running.</p>
            </div>
          </div>

          <div className="section-heading">
            <div>
              <h2>System overview</h2>
              <p>Live service checks from the local development environment.</p>
            </div>
          </div>

          <div className="metrics-grid">
            <article className="metric-card">
              <span className="metric-label">API SERVICE</span>
              <strong>{apiStatus === "online" ? "Online" : apiStatus === "offline" ? "Offline" : "Checking"}</strong>
              <span className="metric-foot">Express · TypeScript</span>
            </article>
            <article className="metric-card">
              <span className="metric-label">DATABASE</span>
              <strong>Not connected</strong>
              <span className="metric-foot">PostgreSQL · pgvector</span>
            </article>
            <article className="metric-card">
              <span className="metric-label">AGENT RUNTIME</span>
              <strong>Not configured</strong>
              <span className="metric-foot">LangGraph</span>
            </article>
            <article className="metric-card">
              <span className="metric-label">WORKFLOW ENGINE</span>
              <strong>Not connected</strong>
              <span className="metric-foot">n8n</span>
            </article>
          </div>

          <div className="section-heading">
            <div>
              <h2>Implementation sequence</h2>
              <p>Build status is explicit; planned components are not presented as operational.</p>
            </div>
          </div>

          <div className="milestone-list">
            {[
              ["01", "Engineering foundation", "Repository, TypeScript workspace and local services", "In progress"],
              ["02", "Core API and data layer", "Tenant-aware persistence and service contracts", "Planned"],
              ["03", "Intelligence runtime", "Research pipeline and controlled agent execution", "Planned"],
              ["04", "Workflow engineering", "Capability discovery, generation and validation", "Planned"]
            ].map(([number, title, description, status]) => (
              <div className="milestone" key={number}>
                <span className="milestone-number">{number}</span>
                <div className="milestone-copy">
                  <strong>{title}</strong>
                  <span>{description}</span>
                </div>
                <span className={status === "In progress" ? "milestone-status current" : "milestone-status"}>{status}</span>
              </div>
            ))}
          </div>
        </section> }
      </main>
    </div>
  );
}

export default App;
