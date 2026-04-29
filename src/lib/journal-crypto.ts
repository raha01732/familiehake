// src/lib/journal-crypto.ts
// AES-256-GCM encryption for journal entries.
// Independent key from other features — compromise here does not leak Calendar/Finance/Vault.
import { createAead } from "./aead-crypto";

const aead = createAead({
  keyEnv: "JOURNAL_ENCRYPTION_KEY",
  salt: "familiehake-journal-v1",
});

export const encryptJournal = aead.encrypt;
export const decryptJournal = aead.decrypt;
