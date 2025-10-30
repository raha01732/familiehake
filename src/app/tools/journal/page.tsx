import { RoleGate } from "@/components/RoleGate";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { encryptString, decryptString } from "@/lib/crypto";
import { reportError } from "@/lib/sentry";

export const metadata = { title: "Journal" };

type DbRow = {
  id: string;
  user_id: string;
  title_enc: string | null;
  content_enc: string | null;
  iv: string | null; // bytea -> Supabase liefert Base64-String
  created_at: string;
  updated_at: string;
  enc_version: number;
};

async function listEntries(userId: string) {
  const sb = createAdminClient();
  try {
    const { data, error } = await sb
      .from("journal_entries")
      .select("id, user_id, title_enc, content_enc, iv, created_at, updated_at, enc_version")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const key = process.env.JOURNAL_ENC_KEY!;
    const out: Array<{ id: string; title: string; content: string; created_at: string; updated_at: string }> = [];

    for (const row of (data as DbRow[])) {
      try {
        const ivB64 = asB64(row.iv);
        const title =
          row.title_enc && ivB64
            ? await decryptString(row.title_enc, ivB64, key)
            : "(ohne Titel)";
        const content =
          row.content_enc && ivB64
            ? await decryptString(row.content_enc, ivB64, key)
            : "";
        out.push({ id: row.id, title, content, created_at: row.created_at, updated_at: row.updated_at });
      } catch (e) {
        // Sentry: Entschlüsselungsfehler eines Datensatzes melden
        reportError(e, { where: "journal:listEntries:decrypt", entryId: row.id });
        out.push({
          id: row.id,
          title: "⚠️ Entschlüsselung fehlgeschlagen",
          content: "",
          created_at: row.created_at,
          updated_at: row.updated_at,
        });
      }
    }
    return out;
  } catch (e) {
    // Sentry: genereller List-Fehler (DB etc.)
    reportError(e, { where: "journal:listEntries", userId });
    return [];
  }

  function asB64(iv: string | null) {
    return typeof iv === "string" ? iv : "";
  }
}

async function createEntry(formData: FormData) {
  "use server";
  const { userId } = auth();
  if (!userId) return;

  const titlePlain = (formData.get("title") as string)?.trim() || "Ohne Titel";
  const contentPlain = (formData.get("content") as string)?.trim() || "";

  try {
    const key = process.env.JOURNAL_ENC_KEY!;
    // Erst normal verschlüsseln, um IV zu bekommen
    const c = await encryptString(contentPlain, key);
    const commonIv = c.iv; // base64

    // Titel & Content konsistent mit gleicher IV (vereinfachter Ansatz)
    const titleWithCommonIv = await encryptStringWithIv(titlePlain, key, commonIv);
    const contentWithCommonIv = await encryptStringWithIv(contentPlain, key, commonIv);

    const sb = createAdminClient();
    const { error } = await sb.from("journal_entries").insert({
      user_id: userId,
      title_enc: titleWithCommonIv.ciphertext,
      content_enc: contentWithCommonIv.ciphertext,
      iv: Buffer.from(commonIv, "base64"), // bytea
      enc_version: 1,
    });
    if (error) throw error;

    await logAudit({
      action: "journal_create",
      actorUserId: userId,
      actorEmail: null,
      target: null,
      detail: { title_len: titlePlain.length, content_len: contentPlain.length },
    });
  } catch (e) {
    reportError(e, { where: "journal:createEntry" });
    // Fehler bewusst nicht weiterwerfen, um UX nicht hart zu brechen;
    // falls gewünscht: throw e; damit Error-Boundary greift.
  }

  revalidatePath("/tools/journal");
}

async function deleteEntry(formData: FormData) {
  "use server";
  const { userId } = auth();
  if (!userId) return;

  const id = formData.get("id") as string;
  const sb = createAdminClient();

  try {
    // Ownership prüfen
    const { data: row, error: selErr } = await sb
      .from("journal_entries")
      .select("user_id")
      .eq("id", id)
      .single();
    if (selErr) throw selErr;
    if (!row || row.user_id !== userId) return;

    const { error: delErr } = await sb.from("journal_entries").delete().eq("id", id);
    if (delErr) throw delErr;

    await logAudit({
      action: "journal_delete",
      actorUserId: userId,
      actorEmail: null,
      target: id,
      detail: null,
    });
  } catch (e) {
    reportError(e, { where: "journal:deleteEntry", entryId: id });
  }

  revalidatePath("/tools/journal");
}

/** Util: mit vorgegebener IV (Base64) verschlüsseln */
async function encryptStringWithIv(plaintext: string, base64Key: string, ivB64: string) {
  const subtle = (globalThis.crypto?.subtle ?? require("crypto").webcrypto.subtle) as SubtleCrypto;
  const keyBytes = Buffer.from(base64Key, "base64");
  const key = await subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = Buffer.from(ivB64, "base64");
  const enc = new TextEncoder().encode(plaintext);
  const cipher = await subtle.encrypt({ name: "AES-GCM", iv }, key, enc);
  return { ciphertext: Buffer.from(new Uint8Array(cipher)).toString("base64") };
}

export default async function JournalPage() {
  const { userId } = auth();
  if (!userId) {
    return (
      <RoleGate routeKey="tools/journal">
        <div className="card p-6">Bitte anmelden.</div>
      </RoleGate>
    );
  }

  const entries = await listEntries(userId);

  return (
    <RoleGate routeKey="tools/journal">
      <section className="grid gap-6">
        <div className="card p-6">
          <h1 className="text-xl font-semibold text-zinc-100 mb-3">Neuer Eintrag (verschlüsselt)</h1>
          <form action={createEntry} className="grid gap-3">
            <input
              name="title"
              placeholder="Titel"
              className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
            />
            <textarea
              name="content"
              rows={6}
              placeholder="Was möchtest du festhalten?"
              className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
            />
            <div>
              <button className="rounded-xl border border-zinc-700 text-zinc-200 text-sm px-3 py-2 hover:bg-zinc-800/60">
                Speichern
              </button>
            </div>
          </form>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-zinc-100 mb-3">Deine Einträge</h2>
          <div className="grid gap-3">
            {entries.map((e) => (
              <div key={e.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-zinc-100 font-medium">{e.title}</div>
                    <div className="text-[11px] text-zinc-500">
                      {new Date(e.created_at).toLocaleString()}
                    </div>
                  </div>
                  <form action={deleteEntry}>
                    <input type="hidden" name="id" value={e.id} />
                    <button className="rounded-lg border border-red-700 text-red-300 text-xs px-2 py-1 hover:bg-red-900/30">
                      Löschen
                    </button>
                  </form>
                </div>
                <div className="text-sm text-zinc-300 mt-3 whitespace-pre-wrap">{e.content}</div>
              </div>
            ))}
            {entries.length === 0 && (
              <div className="text-[12px] text-zinc-500">Noch keine Einträge.</div>
            )}
          </div>
        </div>
      </section>
    </RoleGate>
  );
}
