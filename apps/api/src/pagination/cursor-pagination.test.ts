import { describe, expect, it } from "vitest";
import { encodePaginationCursor, parsePaginationQuery } from "./cursor-pagination.js";

const id = "33333333-3333-4333-8333-333333333333";

describe("cursor pagination", () => {
  it("defaults to a bounded first page", () => {
    expect(parsePaginationQuery({})).toEqual({
      success: true,
      data: { limit: 50, after: null }
    });
  });

  it("parses a canonical continuation cursor", () => {
    const cursor = encodePaginationCursor({ name: "Operations", id });
    expect(parsePaginationQuery({ limit: "25", cursor })).toEqual({
      success: true,
      data: { limit: 25, after: { name: "Operations", id } }
    });
  });

  it.each(["0", "-1", "1.5", "101", "01", "abc"])("rejects invalid page size %s", (limit) => {
    expect(parsePaginationQuery({ limit }).success).toBe(false);
  });

  it.each(["not-a-cursor", "====", "eyJ2ZXJzaW9uIjoyfQ", ""])("rejects invalid cursor %s", (cursor) => {
    expect(parsePaginationQuery({ cursor }).success).toBe(false);
  });

  it("rejects a cursor whose decoded ID is not a UUID", () => {
    const cursor = Buffer.from(JSON.stringify({ version: 1, name: "Operations", id: "not-a-uuid" })).toString("base64url");
    expect(parsePaginationQuery({ cursor }).success).toBe(false);
  });
});
