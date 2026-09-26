import { describe, expect, it } from "vitest";
import { invalidateReadCache, readThroughCache } from "../../server/lib/readCache.js";

describe("read-through cache", () => {
  it("coalesces identical reads and invalidates them after a write", async () => {
    invalidateReadCache();
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return { statusCode: 200, body: { success: true, calls } };
    };

    const [first, second] = await Promise.all([
      readThroughCache("test-read", { unique: "coalesce" }, loader),
      readThroughCache("test-read", { unique: "coalesce" }, loader),
    ]);

    expect(calls).toBe(1);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(false);
    expect((await readThroughCache("test-read", { unique: "coalesce" }, loader)).cacheHit).toBe(true);

    invalidateReadCache();
    expect((await readThroughCache("test-read", { unique: "coalesce" }, loader)).cacheHit).toBe(false);
    expect(calls).toBe(2);
  });
});
