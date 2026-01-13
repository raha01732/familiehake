// tests/checkDatabaseLive.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { checkDatabaseLiveWithClient } from "../src/lib/check-database-live";

test("checkDatabaseLiveWithClient returns live when query succeeds", async () => {
  const client = {
    from: () => ({
      select: async () => ({ error: null }),
    }),
  };

  const result = await checkDatabaseLiveWithClient(client);

  assert.equal(result.live, true);
  assert.equal(result.error, undefined);
});

test("checkDatabaseLiveWithClient returns non-live when query fails", async () => {
  const client = {
    from: () => ({
      select: async () => ({ error: { message: "db down" } }),
    }),
  };

  const result = await checkDatabaseLiveWithClient(client);

  assert.equal(result.live, false);
  assert.equal(result.error, "db down");
});
