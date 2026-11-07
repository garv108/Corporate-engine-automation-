export type DiscoverySessionStatus = "active" | "ready_for_review" | "confirmed" | "abandoned";

export type DiscoveryQuestion = {
  id: string;
  fieldPath: string;
  prompt: string;
  rationale: string;
  required: boolean;
};

export type DiscoveryCompleteness = {
  state: "incomplete" | "ready_for_review";
  canConfirm: boolean;
  requiredMissing: string[];
  recommendedMissing: string[];
  blockingIssues: string[];
  openUncertainties: Array<{
    fieldPath: string;
    description: string;
    whyItMatters?: string;
  }>;
};

export type DiscoveryStep = {
  id?: string;
  key: string;
  kind: "start" | "end" | "activity" | "decision" | "event" | "handoff" | "subprocess";
  name: string;
  description?: string;
  participant?: {
    kind: "person" | "role" | "team" | "system" | "external_party" | "unknown";
    label?: string;
    reference?: string;
  } | null;
  systems: string[];
  inputs: Array<{ key: string; label: string; description?: string; dataType?: string; classification?: string }>;
  outputs: Array<{ key: string; label: string; description?: string; dataType?: string; classification?: string }>;
  rules: Array<{ key: string; label: string; description?: string; condition?: string }>;
  exceptions: Array<{ key: string; label: string; description?: string; condition?: string }>;
  humanJudgement?: string;
  layout?: { x: number; y: number };
};

export type DiscoveryDraft = {
  purpose: string | null;
  scope: string | null;
  trigger: string | null;
  expectedOutcome: string | null;
  steps: DiscoveryStep[];
  transitions: Array<{
    id?: string;
    fromStepKey: string;
    toStepKey: string;
    kind: "sequence" | "conditional" | "exception" | "default" | "parallel";
    label?: string;
    condition?: string;
  }>;
  evidence: unknown[];
  uncertainties: Array<{
    fieldPath: string;
    description: string;
    whyItMatters?: string;
  }>;
  context: {
    systems: string[];
    inputs: string[];
    outputs: string[];
    decisions: string[];
    exceptions: string[];
    humanJudgement: string | null;
    volume: string | null;
    timing: string | null;
    baseline: string | null;
    dataHandling: string | null;
    constraints: string[];
  };
};

export type DiscoveryTurn = {
  id: string;
  sequenceNumber: number;
  speaker: "user" | "assistant" | "system";
  content: string;
  questionId: string | null;
  actorId: string | null;
  createdAt: string;
};

export type DiscoveryFactEvent = {
  id: string;
  sourceTurnId: string;
  fieldPath: string;
  value: unknown;
  provenanceKind: string;
  reviewState: string;
  isCurrent: boolean;
  recordedBy: string;
  recordedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export type DiscoverySessionSummary = {
  id: string;
  status: DiscoverySessionStatus;
  initialDescription: string;
  completeness: DiscoveryCompleteness;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type DiscoverySession = DiscoverySessionSummary & {
  tenantId: string;
  classification: "unknown" | "public" | "internal" | "confidential" | "sensitive_workforce" | "restricted";
  currentDraft: DiscoveryDraft;
  currentQuestionId: string | null;
  nextQuestion: DiscoveryQuestion | null;
  schemaVersion: number;
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdBy: string;
  turns: DiscoveryTurn[];
  factEvents: DiscoveryFactEvent[];
};

export type DiscoveryFactUpdate = { fieldPath: string; value: unknown };

export class DiscoveryApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "DiscoveryApiError";
  }
}

export type DiscoveryApi = ReturnType<typeof createDiscoveryApi>;
export type DiscoveryConversionResult = {
  sessionId: string;
  processId: string;
  processName: string;
  modelVersionId: string;
  modelVersion: number;
  modelStatus: "draft";
  createdAt: string;
  alreadyConverted: boolean;
};

export type AccessTokenProvider = () => Promise<string | null>;

export function createDiscoveryApi(
  fetcher: typeof fetch = fetch,
  accessTokenProvider: AccessTokenProvider = async () => null
) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await accessTokenProvider();
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", "Bearer " + token);

    let response: Response;
    try {
      response = await fetcher("/api/v1/process-discovery/sessions" + path, {
        ...init,
        headers,
        credentials: "same-origin"
      });
    } catch {
      throw new DiscoveryApiError(0, "NETWORK_ERROR", "CIAS could not reach the API. Check that the API service is running.");
    }

    const body = await response.json().catch(() => null) as {
      data?: T;
      error?: { code?: string; message?: string; [key: string]: unknown };
      pagination?: { limit: number; nextCursor: string | null };
    } | null;

    if (!response.ok) {
      const code = body?.error?.code ?? "REQUEST_FAILED";
      const message = body?.error?.message ?? "The request could not be completed.";
      throw new DiscoveryApiError(response.status, code, message, body?.error);
    }
    if (!body || !("data" in body)) {
      throw new DiscoveryApiError(response.status, "INVALID_RESPONSE", "The API returned an unexpected response.");
    }
    return body as T;
  }

  return {
    async list(): Promise<DiscoverySessionSummary[]> {
      const response = await request<{ data: DiscoverySessionSummary[] }>("");
      return response.data;
    },
    async create(initialDescription: string): Promise<DiscoverySession> {
      const response = await request<{ data: DiscoverySession }>("", {
        method: "POST",
        body: JSON.stringify({ initialDescription })
      });
      return response.data;
    },
    async get(sessionId: string): Promise<DiscoverySession> {
      const response = await request<{ data: DiscoverySession }>("/" + encodeURIComponent(sessionId));
      return response.data;
    },
    async turn(
      sessionId: string,
      input: {
        message: string;
        factUpdates: DiscoveryFactUpdate[];
        expectedRevision: number;
        answerToQuestionId?: string;
      }
    ): Promise<DiscoverySession> {
      const response = await request<{ data: DiscoverySession }>("/" + encodeURIComponent(sessionId) + "/turns", {
        method: "POST",
        body: JSON.stringify(input)
      });
      return response.data;
    },
    async confirm(
      sessionId: string,
      input: { expectedRevision: number; acknowledgeUnresolved: boolean }
    ): Promise<DiscoverySession> {
      const response = await request<{ data: DiscoverySession }>("/" + encodeURIComponent(sessionId) + "/confirm", {
        method: "POST",
        body: JSON.stringify(input)
      });
      return response.data;
    },
    async convert(
      sessionId: string,
      input: { name: string; description?: string | null }
    ): Promise<DiscoveryConversionResult> {
      const response = await request<{ data: DiscoveryConversionResult }>("/" + encodeURIComponent(sessionId) + "/convert", {
        method: "POST",
        body: JSON.stringify(input)
      });
      return response.data;
    }
  };
}
