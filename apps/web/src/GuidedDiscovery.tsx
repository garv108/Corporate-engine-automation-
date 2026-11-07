import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { buildLinearProcessGraph } from "./discovery-form";
import {
  createDiscoveryApi,
  DiscoveryApiError,
  type DiscoveryFactUpdate,
  type DiscoverySession,
  type DiscoverySessionSummary
} from "./discovery-api";

const api = createDiscoveryApi();

type OptionalContext = {
  scope: string;
  systems: string;
  inputs: string;
  outputs: string;
  decisions: string;
  exceptions: string;
  humanJudgement: string;
  volume: string;
  timing: string;
  baseline: string;
  dataHandling: string;
  constraints: string;
};

const blankOptionalContext = (): OptionalContext => ({
  scope: "", systems: "", inputs: "", outputs: "", decisions: "", exceptions: "",
  humanJudgement: "", volume: "", timing: "", baseline: "", dataHandling: "", constraints: ""
});

const uncertaintyFields = [
  "purpose", "trigger", "expectedOutcome", "steps", "context.scope", "context.systems",
  "context.inputs", "context.outputs", "context.decisions", "context.exceptions",
  "context.volume", "context.timing", "context.baseline", "context.dataHandling", "context.constraints"
];

function splitLines(value: string): string[] {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function describeApiError(error: unknown): string {
  if (error instanceof DiscoveryApiError) {
    if (error.status === 401) {
      return "Sign-in is not available yet. The API is deny-by-default until a real OIDC provider is configured. No demo login or authentication bypass is enabled.";
    }
    if (error.status === 403) return "Your authenticated account does not have permission to use discovery sessions.";
    if (error.status === 409 && error.code === "REVISION_CONFLICT") {
      return "This session changed in another tab or request. Reload the session to get the latest revision before continuing.";
    }
    if (error.status === 409 && error.code === "COMPLETENESS_GATE_BLOCKED") {
      return "The minimum information gate is not satisfied yet. Resolve the required missing items before confirmation.";
    }
    if (error.status === 409 && error.code === "UNCERTAINTIES_NOT_ACKNOWLEDGED") {
      return "There are unresolved uncertainty items. Acknowledge them explicitly or resolve them before confirming.";
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function statusLabel(status: DiscoverySession["status"]): string {
  switch (status) {
    case "active": return "In discovery";
    case "ready_for_review": return "Ready for review";
    case "confirmed": return "Confirmed snapshot";
    case "abandoned": return "Abandoned";
  }
}

function GuidedDiscovery() {
  const [sessions, setSessions] = useState<DiscoverySessionSummary[]>([]);
  const [session, setSession] = useState<DiscoverySession | null>(null);
  const [initialDescription, setInitialDescription] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [optionalContext, setOptionalContext] = useState<OptionalContext>(blankOptionalContext);
  const [uncertaintyField, setUncertaintyField] = useState("context.volume");
  const [uncertaintyDescription, setUncertaintyDescription] = useState("");
  const [uncertaintyReason, setUncertaintyReason] = useState("");
  const [acknowledgeUnresolved, setAcknowledgeUnresolved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canEdit = session !== null && (session.status === "active" || session.status === "ready_for_review");
  const question = session?.nextQuestion ?? null;
  const unresolved = session?.completeness.openUncertainties ?? [];

  const refreshSessions = useCallback(async () => {
    try {
      const list = await api.list();
      setSessions(list);
    } catch (cause) {
      setError(describeApiError(cause));
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    if (!session) {
      setOptionalContext(blankOptionalContext());
      setAnswerText("");
      return;
    }
    const { context, scope, steps } = session.currentDraft;
    setOptionalContext({
      scope: scope ?? "",
      systems: context.systems.join("\n"),
      inputs: context.inputs.join("\n"),
      outputs: context.outputs.join("\n"),
      decisions: context.decisions.join("\n"),
      exceptions: context.exceptions.join("\n"),
      humanJudgement: context.humanJudgement ?? "",
      volume: context.volume ?? "",
      timing: context.timing ?? "",
      baseline: context.baseline ?? "",
      dataHandling: context.dataHandling ?? "",
      constraints: context.constraints.join("\n")
    });
    setAnswerText(session.nextQuestion?.id === "steps" ? steps.map((step) => step.name).join("\n") : "");
    setAcknowledgeUnresolved(false);
    setNotice(null);
  }, [session?.id, session?.revision, session?.nextQuestion?.id]);

  const requiredProgress = useMemo(() => {
    if (!session) return { complete: 0, total: 4 };
    return { complete: 4 - session.completeness.requiredMissing.length, total: 4 };
  }, [session]);

  async function openSession(sessionId: string) {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const loaded = await api.get(sessionId);
      setSession(loaded);
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setLoading(false);
    }
  }

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (initialDescription.trim().length < 10) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.create(initialDescription.trim());
      setSession(created);
      setInitialDescription("");
      setNotice("Discovery session created. CIAS has retained your original description and is starting with the first required question.");
      await refreshSessions();
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setSaving(false);
    }
  }

  function buildRequiredUpdates(): DiscoveryFactUpdate[] {
    if (!question) return [];
    const value = answerText.trim();
    if (question.id === "steps") {
      const graph = buildLinearProcessGraph(answerText);
      return [
        { fieldPath: "steps", value: graph.steps },
        { fieldPath: "transitions", value: graph.transitions }
      ];
    }
    if (!value) return [];
    return [{ fieldPath: question.fieldPath, value }];
  }

  async function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !question) return;
    let updates: DiscoveryFactUpdate[];
    try {
      updates = buildRequiredUpdates();
    } catch (cause) {
      setError(describeApiError(cause));
      return;
    }
    if (!updates.length) {
      setError("Enter an answer before continuing.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const message = question.id === "steps"
        ? "The main activities are:\n" + splitLines(answerText).map((line, index) => (index + 1) + ". " + line).join("\n")
        : answerText.trim();
      const updated = await api.turn(session.id, {
        message,
        factUpdates: updates,
        expectedRevision: session.revision,
        answerToQuestionId: question.id
      });
      setSession(updated);
      await refreshSessions();
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setSaving(false);
    }
  }

  function buildOptionalUpdates(): DiscoveryFactUpdate[] {
    const updates: DiscoveryFactUpdate[] = [];
    if (optionalContext.scope.trim()) updates.push({ fieldPath: "scope", value: optionalContext.scope.trim() });
    const arrayFields = [
      ["context.systems", optionalContext.systems],
      ["context.inputs", optionalContext.inputs],
      ["context.outputs", optionalContext.outputs],
      ["context.decisions", optionalContext.decisions],
      ["context.exceptions", optionalContext.exceptions],
      ["context.constraints", optionalContext.constraints]
    ] as const;
    for (const [fieldPath, value] of arrayFields) {
      const parsed = splitLines(value);
      if (parsed.length) updates.push({ fieldPath, value: parsed });
    }
    const scalarFields = [
      ["context.humanJudgement", optionalContext.humanJudgement],
      ["context.volume", optionalContext.volume],
      ["context.timing", optionalContext.timing],
      ["context.baseline", optionalContext.baseline],
      ["context.dataHandling", optionalContext.dataHandling]
    ] as const;
    for (const [fieldPath, value] of scalarFields) {
      if (value.trim()) updates.push({ fieldPath, value: value.trim() });
    }
    return updates;
  }

  async function saveOptionalContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !canEdit) return;
    const updates = buildOptionalUpdates();
    if (!updates.length) {
      setError("Add at least one optional detail before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.turn(session.id, {
        message: "I added more context about systems, data, decisions and operating constraints.",
        factUpdates: updates,
        expectedRevision: session.revision
      });
      setSession(updated);
      setNotice("Additional process context saved.");
      await refreshSessions();
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setSaving(false);
    }
  }

  async function addUncertainty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !canEdit || !uncertaintyDescription.trim()) return;
    const next = [
      ...session.currentDraft.uncertainties,
      {
        fieldPath: uncertaintyField,
        description: uncertaintyDescription.trim(),
        ...(uncertaintyReason.trim() ? { whyItMatters: uncertaintyReason.trim() } : {})
      }
    ];
    setSaving(true);
    setError(null);
    try {
      const updated = await api.turn(session.id, {
        message: "I recorded an unresolved uncertainty that needs review.",
        factUpdates: [{ fieldPath: "uncertainties", value: next }],
        expectedRevision: session.revision
      });
      setSession(updated);
      setUncertaintyDescription("");
      setUncertaintyReason("");
      setNotice("Uncertainty recorded. It will remain visible until resolved or explicitly acknowledged.");
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setSaving(false);
    }
  }

  async function resolveUncertainty(index: number) {
    if (!session || !canEdit) return;
    const next = session.currentDraft.uncertainties.filter((_, itemIndex) => itemIndex !== index);
    setSaving(true);
    setError(null);
    try {
      const updated = await api.turn(session.id, {
        message: "I reviewed and resolved one uncertainty item.",
        factUpdates: [{ fieldPath: "uncertainties", value: next }],
        expectedRevision: session.revision
      });
      setSession(updated);
      setNotice("Uncertainty marked as resolved in the current draft. Its prior fact event remains in history.");
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setSaving(false);
    }
  }

  async function confirmSession() {
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const confirmed = await api.confirm(session.id, {
        expectedRevision: session.revision,
        acknowledgeUnresolved: acknowledgeUnresolved || unresolved.length === 0
      });
      setSession(confirmed);
      setNotice("Discovery snapshot confirmed. This does not publish an official process or authorize automation.");
      await refreshSessions();
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setSaving(false);
    }
  }

  const accessBlocked = error?.startsWith("Sign-in is not available yet.") ?? false;

  return (
    <section className="discovery-workspace">
      <div className="discovery-heading">
        <div>
          <p className="eyebrow">M1 · WORK MAPPING AND GUIDED DISCOVERY</p>
          <h1>Understand how work actually happens.</h1>
          <p className="subtitle">Describe a process. Capture the facts. See what is known, missing and uncertain before considering improvements.</p>
        </div>
        <span className="environment-tag">DISCOVERY · BACKEND CONNECTED</span>
      </div>

      <div className="discovery-principles">
        <div><strong>Evidence before inference</strong><span>Facts keep their source and review state.</span></div>
        <div><strong>Human confirmation</strong><span>Review is separate from publication or execution.</span></div>
        <div><strong>Industry-neutral</strong><span>People, teams, systems and external actors fit the same model.</span></div>
      </div>

      {error && (
        <div className={accessBlocked ? "discovery-alert auth-alert" : "discovery-alert"} role="alert">
          <strong>{accessBlocked ? "Authentication required" : "Action could not be completed"}</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && <div className="discovery-success" role="status">{notice}</div>}

      {!session ? (
        <div className="discovery-entry-grid">
          <article className="discovery-panel start-panel">
            <div className="panel-kicker">START A NEW DISCOVERY</div>
            <h2>What work should CIAS understand?</h2>
            <p>Start with a recurring procedure, request or activity. Use a real example without personal or sensitive information.</p>
            <form onSubmit={createSession}>
              <label htmlFor="process-description">Describe how it works today</label>
              <textarea
                id="process-description"
                value={initialDescription}
                onChange={(event) => setInitialDescription(event.target.value)}
                placeholder="Example: When a customer requests a refund, our support team checks the order, verifies eligibility, asks for approval when required, and records the outcome in our system..."
                minLength={10}
                maxLength={10000}
                rows={7}
              />
              <div className="form-footer">
                <span>{initialDescription.trim().length} characters · minimum 10</span>
                <button className="primary-button" type="submit" disabled={saving || initialDescription.trim().length < 10}>
                  {saving ? "Creating..." : "Start discovery"}
                </button>
              </div>
            </form>
            <div className="classification-note">
              <span className="classification-dot" />
              New sessions are classified <strong>unknown</strong> and handled as restricted. Do not enter sensitive workforce or personal data yet.
            </div>
          </article>

          <article className="discovery-panel recent-panel">
            <div className="panel-title-row">
              <div>
                <div className="panel-kicker">YOUR DISCOVERIES</div>
                <h2>Recent sessions</h2>
              </div>
              <button className="text-button" type="button" onClick={() => void refreshSessions()} disabled={loading}>
                Refresh
              </button>
            </div>
            {loading ? <p className="empty-state">Loading sessions...</p> : sessions.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">◎</span>
                <strong>No discovery sessions yet</strong>
                <p>Your saved sessions will appear here so you can resume them later.</p>
              </div>
            ) : (
              <div className="session-list">
                {sessions.map((item) => (
                  <button className="session-list-item" type="button" key={item.id} onClick={() => void openSession(item.id)}>
                    <span className="session-list-main">
                      <strong>{item.initialDescription}</strong>
                      <small>{new Date(item.updatedAt).toLocaleString()}</small>
                    </span>
                    <span className={"session-status " + item.status}>{statusLabel(item.status)}</span>
                  </button>
                ))}
              </div>
            )}
          </article>
        </div>
      ) : (
        <>
          <div className="active-session-bar">
            <div className="active-session-title">
              <button className="back-button" type="button" onClick={() => { setSession(null); setError(null); setNotice(null); }}>
                ← All discoveries
              </button>
              <div>
                <span className={"session-status " + session.status}>{statusLabel(session.status)}</span>
                <h2>{session.initialDescription}</h2>
                <small>Revision {session.revision} · Data classification: {session.classification} (unknown is restricted)</small>
              </div>
            </div>
            <div className="progress-block">
              <div className="progress-copy"><strong>{requiredProgress.complete}/{requiredProgress.total}</strong><span>minimum facts captured</span></div>
              <div className="progress-track"><span style={{ width: (requiredProgress.complete / requiredProgress.total) * 100 + "%" }} /></div>
            </div>
          </div>

          <div className="discovery-columns">
            <div className="discovery-left-column">
              <article className="discovery-panel conversation-panel">
                <div className="panel-title-row">
                  <div>
                    <div className="panel-kicker">GUIDED INTERVIEW</div>
                    <h2>Discovery conversation</h2>
                  </div>
                  <span className="revision-label">Saved · Rev {session.revision}</span>
                </div>
                <div className="conversation-thread">
                  {session.turns.map((turn) => (
                    <div className={"conversation-turn " + turn.speaker} key={turn.id}>
                      <span className="turn-avatar">{turn.speaker === "user" ? "You" : "C"}</span>
                      <div className="turn-bubble">
                        <span className="turn-speaker">{turn.speaker === "user" ? "YOU" : "CIAS"}</span>
                        <p>{turn.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {question && canEdit && (
                  <form className="answer-form" onSubmit={submitAnswer}>
                    <div className="question-label">NEXT REQUIRED QUESTION</div>
                    <h3>{question.prompt}</h3>
                    <p>{question.rationale}</p>
                    {question.id === "steps" ? (
                      <>
                        <label htmlFor="discovery-answer">Main activities · one step per line</label>
                        <textarea
                          id="discovery-answer"
                          rows={5}
                          value={answerText}
                          onChange={(event) => setAnswerText(event.target.value)}
                          placeholder={"Receive the request\nCheck required information\nReview and make a decision\nRecord the result"}
                        />
                        <span className="field-hint">These will be saved as structured activities with a simple sequence. Decision branches can be refined later.</span>
                      </>
                    ) : (
                      <>
                        <label htmlFor="discovery-answer">Your answer</label>
                        <textarea
                          id="discovery-answer"
                          rows={4}
                          value={answerText}
                          onChange={(event) => setAnswerText(event.target.value)}
                          placeholder="Describe what actually happens. Keep unknown details unknown."
                        />
                      </>
                    )}
                    <div className="form-footer">
                      <span>Saved as a user statement · revision protected</span>
                      <button className="primary-button" type="submit" disabled={saving || !answerText.trim()}>
                        {saving ? "Saving..." : "Save answer"}
                      </button>
                    </div>
                  </form>
                )}
                {!question && session.status === "ready_for_review" && (
                  <div className="ready-message">
                    <strong>Minimum information captured.</strong>
                    <p>Review the map and unresolved items before confirming this snapshot.</p>
                  </div>
                )}
                {session.status === "confirmed" && (
                  <div className="ready-message confirmed-message">
                    <strong>Discovery snapshot confirmed.</strong>
                    <p>The snapshot is frozen. It has not been published as an official process or authorized for automation.</p>
                  </div>
                )}
              </article>

              {canEdit && (
                <article className="discovery-panel context-panel">
                  <div className="panel-kicker">MORE PROCESS CONTEXT</div>
                  <h2>Capture details that improve analysis</h2>
                  <p className="panel-description">These areas are recommended, not universal blockers. Add only what is known.</p>
                  <form onSubmit={saveOptionalContext}>
                    <div className="context-fields">
                      <label>Scope<textarea rows={2} value={optionalContext.scope} onChange={(event) => setOptionalContext({ ...optionalContext, scope: event.target.value })} placeholder="What is included or excluded?" /></label>
                      <label>Systems and tools<textarea rows={2} value={optionalContext.systems} onChange={(event) => setOptionalContext({ ...optionalContext, systems: event.target.value })} placeholder="One tool per line" /></label>
                      <label>Inputs<textarea rows={2} value={optionalContext.inputs} onChange={(event) => setOptionalContext({ ...optionalContext, inputs: event.target.value })} placeholder="One input per line" /></label>
                      <label>Outputs<textarea rows={2} value={optionalContext.outputs} onChange={(event) => setOptionalContext({ ...optionalContext, outputs: event.target.value })} placeholder="One output per line" /></label>
                      <label>Rules and decisions<textarea rows={2} value={optionalContext.decisions} onChange={(event) => setOptionalContext({ ...optionalContext, decisions: event.target.value })} placeholder="One rule or decision per line" /></label>
                      <label>Exceptions and rework<textarea rows={2} value={optionalContext.exceptions} onChange={(event) => setOptionalContext({ ...optionalContext, exceptions: event.target.value })} placeholder="One exception per line" /></label>
                      <label>Human judgement<textarea rows={2} value={optionalContext.humanJudgement} onChange={(event) => setOptionalContext({ ...optionalContext, humanJudgement: event.target.value })} placeholder="Where is discretion or approval required?" /></label>
                      <label>Volume and seasonality<textarea rows={2} value={optionalContext.volume} onChange={(event) => setOptionalContext({ ...optionalContext, volume: event.target.value })} placeholder="Frequency, approximate volume, peaks" /></label>
                      <label>Time and waiting<textarea rows={2} value={optionalContext.timing} onChange={(event) => setOptionalContext({ ...optionalContext, timing: event.target.value })} placeholder="Active handling, elapsed time, waiting" /></label>
                      <label>Current baseline<textarea rows={2} value={optionalContext.baseline} onChange={(event) => setOptionalContext({ ...optionalContext, baseline: event.target.value })} placeholder="Current time, rework, delay, quality" /></label>
                      <label>Data handling<textarea rows={2} value={optionalContext.dataHandling} onChange={(event) => setOptionalContext({ ...optionalContext, dataHandling: event.target.value })} placeholder="Sources, destinations, sensitivity, retention" /></label>
                      <label>Constraints<textarea rows={2} value={optionalContext.constraints} onChange={(event) => setOptionalContext({ ...optionalContext, constraints: event.target.value })} placeholder="One constraint per line" /></label>
                    </div>
                    <div className="form-footer">
                      <span>Unknown fields stay unknown; no inferred defaults.</span>
                      <button className="secondary-button" type="submit" disabled={saving}>Save additional context</button>
                    </div>
                  </form>
                </article>
              )}
            </div>

            <div className="discovery-right-column">
              <article className="discovery-panel map-panel">
                <div className="panel-kicker">LIVE STRUCTURED DRAFT</div>
                <h2>Current work map</h2>
                <div className="map-fact">
                  <span>PROCESS PURPOSE</span>
                  <strong>{session.currentDraft.purpose || "Not captured yet"}</strong>
                </div>
                <div className="map-fact">
                  <span>TRIGGER</span>
                  <strong>{session.currentDraft.trigger || "Not captured yet"}</strong>
                </div>
                <div className="map-fact">
                  <span>EXPECTED OUTCOME</span>
                  <strong>{session.currentDraft.expectedOutcome || "Not captured yet"}</strong>
                </div>
                <div className="map-steps-heading">
                  <span>ACTIVITIES</span>
                  <small>{session.currentDraft.steps.length} captured</small>
                </div>
                {session.currentDraft.steps.length ? (
                  <div className="process-step-list">
                    {session.currentDraft.steps.map((step, index) => (
                      <div className="process-step" key={step.key}>
                        <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
                        <div><strong>{step.name}</strong><small>{step.kind}{step.participant?.label ? " · " + step.participant.label : ""}</small></div>
                      </div>
                    ))}
                  </div>
                ) : <p className="empty-inline">Steps will appear here as the interview progresses.</p>}
                {session.currentDraft.context.systems.length > 0 && (
                  <div className="map-fact"><span>SYSTEMS & TOOLS</span><div className="tag-list">{session.currentDraft.context.systems.map((item) => <span key={item}>{item}</span>)}</div></div>
                )}
              </article>

              <article className="discovery-panel completeness-panel">
                <div className="panel-kicker">DETERMINISTIC CHECK</div>
                <h2>Completeness</h2>
                <div className={session.completeness.canConfirm ? "gate-state ready" : "gate-state blocked"}>
                  <span>{session.completeness.canConfirm ? "✓" : "!"}</span>
                  <div><strong>{session.completeness.canConfirm ? "Ready for review" : "More information required"}</strong><small>Required fields are checked by rules, not an LLM.</small></div>
                </div>
                {session.completeness.requiredMissing.length > 0 && (
                  <div className="check-section">
                    <span className="check-heading">REQUIRED · MISSING</span>
                    {session.completeness.requiredMissing.map((field) => <div className="check-item missing" key={field}>○ {field}</div>)}
                  </div>
                )}
                {session.completeness.recommendedMissing.length > 0 && (
                  <div className="check-section">
                    <span className="check-heading">RECOMMENDED · OPTIONAL</span>
                    {session.completeness.recommendedMissing.map((field) => <div className="check-item" key={field}>· {field}</div>)}
                  </div>
                )}
                {session.completeness.blockingIssues.length > 0 && (
                  <div className="check-section">
                    <span className="check-heading">STRUCTURE ISSUES</span>
                    {session.completeness.blockingIssues.map((issue, index) => <div className="check-item missing" key={index}>{issue}</div>)}
                  </div>
                )}
              </article>

              {canEdit && (
                <article className="discovery-panel uncertainty-panel">
                  <div className="panel-kicker">EVIDENCE GAPS</div>
                  <h2>Unresolved uncertainties</h2>
                  <p className="panel-description">Record what is not yet known and why it matters. CIAS will not invent the answer.</p>
                  {unresolved.length > 0 ? (
                    <div className="uncertainty-list">
                      {unresolved.map((item, index) => (
                        <div className="uncertainty-item" key={item.fieldPath + index}>
                          <strong>{item.fieldPath}</strong>
                          <p>{item.description}</p>
                          {item.whyItMatters && <small>Why it matters: {item.whyItMatters}</small>}
                          <button className="text-button" type="button" onClick={() => void resolveUncertainty(index)} disabled={saving}>Mark resolved</button>
                        </div>
                      ))}
                    </div>
                  ) : <p className="empty-inline">No explicit uncertainty has been recorded.</p>}
                  <form className="uncertainty-form" onSubmit={addUncertainty}>
                    <label>Related area
                      <select value={uncertaintyField} onChange={(event) => setUncertaintyField(event.target.value)}>
                        {uncertaintyFields.map((field) => <option key={field} value={field}>{field}</option>)}
                      </select>
                    </label>
                    <label>What is unknown?
                      <input value={uncertaintyDescription} onChange={(event) => setUncertaintyDescription(event.target.value)} maxLength={1000} placeholder="e.g. Peak monthly request volume is unknown" />
                    </label>
                    <label>Why does it matter? · optional
                      <input value={uncertaintyReason} onChange={(event) => setUncertaintyReason(event.target.value)} maxLength={1000} placeholder="e.g. Capacity estimate may be unreliable" />
                    </label>
                    <button className="secondary-button full-width" type="submit" disabled={saving || !uncertaintyDescription.trim()}>Record uncertainty</button>
                  </form>
                </article>
              )}

              {session.status === "ready_for_review" && (
                <article className="discovery-panel confirm-panel">
                  <div className="panel-kicker">HUMAN REVIEW</div>
                  <h2>Confirm this snapshot</h2>
                  <p className="panel-description">This freezes the discovery record. It does not publish an official process or approve automation.</p>
                  {unresolved.length > 0 && (
                    <label className="acknowledge-check">
                      <input type="checkbox" checked={acknowledgeUnresolved} onChange={(event) => setAcknowledgeUnresolved(event.target.checked)} />
                      <span>I reviewed and acknowledge the {unresolved.length} unresolved uncertainty item(s).</span>
                    </label>
                  )}
                  <button className="primary-button full-width" type="button" disabled={saving || (unresolved.length > 0 && !acknowledgeUnresolved)} onClick={() => void confirmSession()}>
                    {saving ? "Confirming..." : "Confirm discovery snapshot"}
                  </button>
                </article>
              )}
            </div>
          </div>
        </>
      )}

      <div className="discovery-footnote">
        <strong>Current capability boundary:</strong> this workspace stores the conversation and structured answers. It does not yet infer facts from free text or call an AI model. Those capabilities will be added only after the deterministic path and data policies are verified.
      </div>
    </section>
  );
}

export default GuidedDiscovery;
