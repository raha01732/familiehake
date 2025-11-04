"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { createClient } from "@/lib/supabase/browser";
import { decryptWith, encryptFor, generateRSA, importPrivateKey, importPublicKey } from "@/lib/crypto";

type Msg = { id: string; sender_id: string; recipient_id: string; ciphertext: string; created_at: string };

export default function MessagesPage() {
  const sb = createClient();
  const { userId } = useAuth();
  const { user } = useUser();
  const [privPEM, setPrivPEM] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState<string>("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [plain, setPlain] = useState("");

  // Private Key lokal laden (nur Client)
  useEffect(() => {
    setPrivPEM(localStorage.getItem("e2e_private_pem"));
  }, []);

  // RSA-Schlüssel erzeugen & öffentlichen Schlüssel publizieren
  async function ensureKey() {
    if (privPEM) return;
    const kp = await generateRSA();
    localStorage.setItem("e2e_private_pem", kp.privatePEM);
    setPrivPEM(kp.privatePEM);
    await sb.from("user_keys").upsert({ user_id: userId, public_key_pem: kp.publicPEM }, { onConflict: "user_id" });
  }

  async function loadChat(peerId: string) {
    if (!peerId) return;
    const { data } = await sb
      .from("messages")
      .select("id,sender_id,recipient_id,ciphertext,created_at")
      .or(
        `and(sender_id.eq.${userId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${userId})`
      )
      .order("created_at", { ascending: true });
    setMessages(data ?? []);
  }

  async function send() {
    if (!plain.trim() || !recipientId) return;

    // Public Key des Empfängers holen
    const { data: keyRows } = await sb
      .from("user_keys")
      .select("public_key_pem")
      .eq("user_id", recipientId)
      .single();

    if (!keyRows?.public_key_pem) {
      alert("Empfänger hat keinen öffentlichen Schlüssel publiziert.");
      return;
    }

    const pubKey = await importPublicKey(keyRows.public_key_pem);
    const ciphertext = await encryptFor(pubKey, plain.trim());

    const { data } = await sb
      .from("messages")
      .insert({ sender_id: userId, recipient_id: recipientId, ciphertext })
      .select("*")
      .single();

    if (data) {
      setMessages((m) => [...m, data]);
      setPlain("");
    }
  }

  const me = user?.primaryEmailAddress?.emailAddress ?? userId ?? "ich";

  const decrypted = useMemo(() => {
    return messages.map((m) => ({ m, mine: m.sender_id === userId }));
  }, [messages, userId]);

  async function reveal(ct: string) {
    if (!privPEM) return "—";
    const privKey = await importPrivateKey(privPEM);
    try {
      return await decryptWith(privKey, ct);
    } catch {
      return "Entschlüsselung fehlgeschlagen";
    }
  }

  if (!userId) {
    return (
      <section className="p-6">
        <div className="text-sm text-zinc-400">Bitte anmelden.</div>
      </section>
    );
  }

  return (
    <section className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">Nachrichten (E2E)</h1>
        {!privPEM ? (
          <button
            onClick={ensureKey}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-900"
          >
            Schlüssel erzeugen & veröffentlichen
          </button>
        ) : (
          <div className="text-[11px] text-emerald-400">Privater Schlüssel lokal vorhanden</div>
        )}
      </div>

      <div className="card p-4 flex flex-col gap-2">
        <div className="text-sm text-zinc-400">Chat öffnen</div>
        <div className="flex gap-2">
          <input
            placeholder="Empfänger (Clerk user_id)"
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            className="flex-1 rounded bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm"
          />
          <button
            onClick={() => loadChat(recipientId)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-900"
          >
            Laden
          </button>
        </div>
        <div className="text-[11px] text-zinc-500">
          Hinweis: Adressbuch/Auto-Complete bauen wir später. Der Empfänger muss vorher einen öffentlichen Schlüssel
          publiziert haben (Button oben).
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
        {decrypted.length === 0 ? (
          <div className="text-sm text-zinc-500">Noch keine Nachrichten.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {decrypted.map(({ m, mine }) => (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  mine ? "self-end bg-zinc-800" : "self-start bg-zinc-950 border border-zinc-800"
                }`}
              >
                <div className="text-[10px] text-zinc-500 mb-1">{mine ? me : "Partner"}</div>
                <details>
                  <summary className="cursor-pointer text-zinc-300">Nachricht anzeigen</summary>
                  <AsyncText ciphertext={m.ciphertext} reveal={reveal} />
                </details>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          placeholder="Nachricht…"
          value={plain}
          onChange={(e) => setPlain(e.target.value)}
          className="flex-1 rounded bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm"
        />
        <button onClick={send} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-900">
          Senden
        </button>
      </div>
    </section>
  );
}

function AsyncText({ ciphertext, reveal }: { ciphertext: string; reveal: (c: string) => Promise<string> }) {
  const [txt, setTxt] = useState("…entschlüsseln…");
  useEffect(() => {
    (async () => setTxt(await reveal(ciphertext)))();
  }, [ciphertext, reveal]);
  return <div className="mt-1 text-zinc-200 whitespace-pre-wrap">{txt}</div>;
}
