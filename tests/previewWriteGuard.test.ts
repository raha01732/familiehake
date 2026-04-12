// /workspace/familiehake/tests/previewWriteGuard.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { PREVIEW_WRITE_BLOCK_MESSAGE, wrapPreviewWriteGuard } from "../src/lib/supabase/preview-guard";

test("wrapPreviewWriteGuard blocks insert on non-allowed table in preview", async () => {
  const previousVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "preview";

  try {
    const client = {
      from: () => ({
        insert: async () => ({ error: null }),
      }),
    };
    const guarded = wrapPreviewWriteGuard(client);

    assert.throws(() => guarded.from("files_meta").insert({}), {
      message: /Live-Version möglich/,
    });
  } finally {
    process.env.VERCEL_ENV = previousVercelEnv;
  }
});

test("wrapPreviewWriteGuard allows user_roles writes in preview", async () => {
  const previousVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "preview";

  try {
    const client = {
      from: () => ({
        insert: async () => ({ error: null }),
      }),
    };
    const guarded = wrapPreviewWriteGuard(client);
    const result = await guarded.from("user_roles").insert({});
    assert.equal(result.error, null);
  } finally {
    process.env.VERCEL_ENV = previousVercelEnv;
  }
});

test("preview write error uses user-facing message", () => {
  assert.match(PREVIEW_WRITE_BLOCK_MESSAGE, /Live-Version/);
});
