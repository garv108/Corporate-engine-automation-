import { describe, expect, it, vi } from "vitest";
import { createDiscoveryApi } from "./discovery-api";

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("discovery API client", () => {
  it("creates a session using the same-origin API without inventing authentication", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(201, { data: { id: "session-1" } }));
    const api = createDiscoveryApi(fetcher);
    await api.create("We manually process service requests.");

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("/api/v1/process-discovery/sessions");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("same-origin");
    expect(new Headers(init?.headers).get("Authorization")).toBeNull();
    expect(JSON.parse(String(init?.body))).toEqual({ initialDescription: "We manually process service requests." });
  });

  it("adds a bearer token only when a configured token provider supplies one", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(200, { data: [] }));
    const api = createDiscoveryApi(fetcher, async () => "signed-access-token");
    await api.list();
    expect(new Headers(fetcher.mock.calls[0]![1]?.headers).get("Authorization")).toBe("Bearer signed-access-token");
  });

  it("surfaces authentication denial as a typed API error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(401, {
      error: { code: "UNAUTHENTICATED", message: "Authentication is required" }
    }));
    const api = createDiscoveryApi(fetcher);
    await expect(api.list()).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED"
    });
  });

  it("sends the current revision and question identifier on turn submission", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(200, { data: { id: "session-1" } }));
    const api = createDiscoveryApi(fetcher);
    await api.turn("session-1", {
      message: "The process resolves requests.",
      factUpdates: [{ fieldPath: "purpose", value: "Resolve service requests" }],
      expectedRevision: 4,
      answerToQuestionId: "purpose"
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("/api/v1/process-discovery/sessions/session-1/turns");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      expectedRevision: 4,
      answerToQuestionId: "purpose"
    });
  });

  it("converts a confirmed discovery session using the explicit catalogue name", async () => {
    const result = {
      sessionId: "session-1",
      processId: "process-1",
      processName: "Service request handling",
      modelVersionId: "model-1",
      modelVersion: 1,
      modelStatus: "draft" as const,
      createdAt: "2026-11-07T00:00:00.000Z",
      alreadyConverted: false
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(201, { data: result }));
    const api = createDiscoveryApi(fetcher);
    await expect(api.convert("session-1", { name: "Service request handling" })).resolves.toEqual(result);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("/api/v1/process-discovery/sessions/session-1/convert");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ name: "Service request handling" });
  });

  it("surfaces network failures without leaking implementation details", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("socket detail"));
    const api = createDiscoveryApi(fetcher);
    await expect(api.list()).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
      message: expect.stringContaining("could not reach the API")
    });
  });
});
