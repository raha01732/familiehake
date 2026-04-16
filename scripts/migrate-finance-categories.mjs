#!/usr/bin/env node
/**
 * scripts/migrate-finance-categories.mjs
 *
 * Migrates plain-text `category_enc` values in finance_transactions
 * to AES-256-GCM encrypted ciphertext (same scheme as amount_enc / description_enc).
 *
 * Run this AFTER the ALTER TABLE … RENAME COLUMN statement has been applied in Supabase.
 *
 * Usage (Node ≥ 20.6 — reads .env.local automatically):
 *   node --env-file=.env.local scripts/migrate-finance-categories.mjs
 *
 * For older Node versions, set env vars manually first:
 *   set NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
 *   set SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   set FINANCE_ENCRYPTION_KEY=your-key
 *   node scripts/migrate-finance-categories.mjs
 */

import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// ─── Crypto (mirrors src/lib/finance-crypto.ts) ───────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_LEN    = 12;
const KEY_LEN   = 32;
const SALT      = "familiehake-finance-v1";

let _key = null;
function getKey() {
  if (_key) return _key;
  const secret =
    process.env.FINANCE_ENCRYPTION_KEY ??
    "familiehake-dev-placeholder-key-unsafe";
  _key = scryptSync(secret, SALT, KEY_LEN);
  return _key;
}

function encryptValue(plaintext, userId) {
  const key = getKey();
  const iv  = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag   = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

/**
 * Returns true when the value already looks like an AES-GCM token
 * (iv.authTag.ciphertext — all base64, separated by exactly 2 dots).
 * Plain-text category IDs like "wohnen" or "lebensmittel" will never match.
 */
function isAlreadyEncrypted(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const b64 = /^[A-Za-z0-9+/]+=*$/;
  return parts.every((p) => p.length >= 8 && b64.test(p));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "❌  Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY"
    );
    process.exit(1);
  }

  if (!process.env.FINANCE_ENCRYPTION_KEY) {
    console.warn(
      "⚠️  FINANCE_ENCRYPTION_KEY not set — using dev placeholder.\n" +
      "    Only run this without the key if your data was also written without it."
    );
  }

  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Fetch all rows (id, user_id, category_enc)
  console.log("📥  Fetching rows from finance_transactions …");
  const { data: rows, error } = await sb
    .from("finance_transactions")
    .select("id, user_id, category_enc");

  if (error) {
    console.error("❌  Supabase select error:", error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("✅  No rows found — nothing to migrate.");
    return;
  }

  console.log(`📊  Found ${rows.length} row(s). Checking which need migration …\n`);

  let skipped  = 0;
  let migrated = 0;
  let failed   = 0;

  for (const row of rows) {
    const { id, user_id, category_enc } = row;

    if (!category_enc) {
      console.log(`  ⏭  [${id}] — category_enc is null, skipping`);
      skipped++;
      continue;
    }

    if (isAlreadyEncrypted(category_enc)) {
      console.log(`  ⏭  [${id}] — already encrypted, skipping`);
      skipped++;
      continue;
    }

    // Plain-text value — encrypt it
    try {
      const encrypted = encryptValue(category_enc, user_id);
      const { error: updateError } = await sb
        .from("finance_transactions")
        .update({ category_enc: encrypted })
        .eq("id", id);

      if (updateError) {
        console.error(`  ❌  [${id}] — update failed: ${updateError.message}`);
        failed++;
      } else {
        console.log(`  ✅  [${id}] — "${category_enc}" encrypted`);
        migrated++;
      }
    } catch (err) {
      console.error(`  ❌  [${id}] — encryption threw: ${err.message}`);
      failed++;
    }
  }

  console.log(`
─────────────────────────────────
  Migrated : ${migrated}
  Skipped  : ${skipped}
  Failed   : ${failed}
─────────────────────────────────`);

  if (failed > 0) {
    console.error("❌  Some rows failed. Check output above.");
    process.exit(1);
  }

  console.log("✅  Migration complete.");
}

main();
