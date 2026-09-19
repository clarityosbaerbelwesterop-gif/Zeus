import { describe, expect, it } from "vitest";
import { mockDbInstance } from "../packages/db/src/mock-store.ts";

describe("in-memory run leases", () => {
  it("returns updated rows from UPDATE ... RETURNING when the lease is free", () => {
    mockDbInstance.getTable("runs").push({
      id: "run_lease_test",
      lease_owner: null,
      lease_expires_at: null,
    });
    const result = mockDbInstance.query({
      text: `update "zeus"."runs" set "lease_owner" = $1, "lease_expires_at" = $2 where "id" = $3 and ("lease_owner" is null or "lease_expires_at" < now() or "lease_owner" = $1) returning "id"`,
      values: ["worker-1", new Date(Date.now() + 30_000), "run_lease_test"],
    });
    expect(result.rowCount).toBe(1);
    expect(result.rows).toEqual([{ id: "run_lease_test" }]);
  });
});
