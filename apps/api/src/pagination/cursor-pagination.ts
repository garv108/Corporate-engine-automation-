import { z } from "zod";

export type CursorPosition = { name: string; id: string };
export type PaginationOptions = { limit: number; after: CursorPosition | null };
export type Page<T> = { items: T[]; hasMore: boolean };

const querySchema = z.object({
  limit: z.string().optional(),
  cursor: z.string().max(512).optional()
});
const cursorSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1).max(200),
  id: z.string().uuid()
}).strict();

export function encodePaginationCursor(position: CursorPosition): string {
  return Buffer.from(JSON.stringify({ version: 1, ...position }), "utf8").toString("base64url");
}

export function parsePaginationQuery(query: unknown):
  | { success: true; data: PaginationOptions }
  | { success: false; message: string } {
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) return { success: false, message: "Pagination query is invalid" };

  let limit = 50;
  if (parsed.data.limit !== undefined) {
    if (!/^(?:[1-9]|[1-9][0-9]|100)$/.test(parsed.data.limit)) {
      return { success: false, message: "limit must be an integer between 1 and 100" };
    }
    limit = Number(parsed.data.limit);
  }

  const cursor = parsed.data.cursor;
  if (cursor === undefined) return { success: true, data: { limit, after: null } };
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) return { success: false, message: "cursor is invalid" };

  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64url") !== cursor) {
      return { success: false, message: "cursor is invalid" };
    }
    const payload = cursorSchema.safeParse(JSON.parse(decoded));
    if (!payload.success) return { success: false, message: "cursor is invalid" };
    return {
      success: true,
      data: { limit, after: { name: payload.data.name, id: payload.data.id } }
    };
  } catch {
    return { success: false, message: "cursor is invalid" };
  }
}
