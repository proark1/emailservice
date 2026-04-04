import { describe, it, expect } from "vitest";
import { buildPaginatedResponse } from "../pagination.js";

describe("buildPaginatedResponse", () => {
  it("returns all items when count <= limit", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const result = buildPaginatedResponse(items, 5);
    expect(result.data).toEqual(items);
    expect(result.pagination.has_more).toBe(false);
    expect(result.pagination.cursor).toBeNull();
  });

  it("truncates and provides cursor when count > limit", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const result = buildPaginatedResponse(items, 2);
    expect(result.data).toEqual([{ id: "a" }, { id: "b" }]);
    expect(result.pagination.has_more).toBe(true);
    expect(result.pagination.cursor).toBe("b");
  });

  it("handles empty array", () => {
    const result = buildPaginatedResponse([], 10);
    expect(result.data).toEqual([]);
    expect(result.pagination.has_more).toBe(false);
    expect(result.pagination.cursor).toBeNull();
  });

  it("handles exactly limit items (no extra)", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const result = buildPaginatedResponse(items, 2);
    expect(result.data).toEqual(items);
    expect(result.pagination.has_more).toBe(false);
    expect(result.pagination.cursor).toBeNull();
  });

  it("handles limit of 1", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const result = buildPaginatedResponse(items, 1);
    expect(result.data).toEqual([{ id: "a" }]);
    expect(result.pagination.has_more).toBe(true);
    expect(result.pagination.cursor).toBe("a");
  });
});
