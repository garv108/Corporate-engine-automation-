import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./app.js";

describe("CIAS API", () => {
  it("returns service metadata", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.body.name).toBe("CIAS API");
  });

  it("exposes a liveness endpoint without requiring database access", async () => {
    const response = await request(app).get("/api/v1/health/live");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("returns a structured 404 for unknown routes", async () => {
    const response = await request(app).get("/missing");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});


  it("requires authentication for workforce routes", async () => {
    const response = await request(app).get("/api/v1/workforce/employees");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("requires authentication for process model routes", async () => {
    const response = await request(app).get("/api/v1/business-processes/00000000-0000-4000-8000-000000000001/models");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });
