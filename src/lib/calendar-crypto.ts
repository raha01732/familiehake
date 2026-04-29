// src/lib/calendar-crypto.ts
// AES-256-GCM encryption for calendar event content (title, location, description).
// Dates (starts_at, ends_at) remain plaintext so that filtering and sorting
// on them is possible at the DB level.
// Independent key from other features.
import { createAead } from "./aead-crypto";

const aead = createAead({
  keyEnv: "CALENDAR_ENCRYPTION_KEY",
  salt: "familiehake-calendar-v1",
});

export const encryptCalendar = aead.encrypt;
export const decryptCalendar = aead.decrypt;
