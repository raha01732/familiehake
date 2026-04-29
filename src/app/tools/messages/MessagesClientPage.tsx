// /workspace/familiehake/src/app/tools/messages/MessagesClientPage.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { decryptWith, encryptFor, generateRSA, importPrivateKey, importPublicKey } from "@/lib/crypto";
import { PreviewPlaceholder } from "@/components/PreviewNotice";

type Msg = { id: string; sender_id: string; recipient_id: string; ciphertext: string; created_at: string };

type RevealFn = (ciphertext: string) => Promise<string>;

export default function MessagesPage() {
  const isPreview = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
  const { userId } = useAuth();
  const { user } = useUser();
  const [privPEM, setPrivPEM] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("e2e_private_pem");
  });
  const [recipientId, setRecipientId] = useState<string>("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [plain, setPlain] = useState("");

  // RSA-Schlüssel erzeugen & öffentlichen Schlüssel publizieren
  async function ensureKey() {
    if (privPEM) return;
    const kp = await generateRSA();
    localStorage.setItem("e2e_private_pem", kp.privatePEM);
    setPrivPEM(kp.privatePEM);
    await fetch("/api/keys", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_key_pem: kp.publicPEM }),
    });
  }

  async function loadChat(peerId: string) {
    if (!peerId) return;
    const res = await fetch(`/api/messages?peer=${encodeURIComponent(peerId)}`);
    const json = await res.json();
    setMessages(json?.ok ? (json.data ?? []) : []);
  }

  async function send() {
    if (!plain.trim() || !recipientId) return;

    // Public Key des Empfängers holen
    const keyRes = await fetch(`/api/keys?userId=${encodeURIComponent(recipientId)}`);
    const keyJson = await keyRes.json();
    const publicPem = keyJson?.data?.public_key_pem as string | undefined;

    if (!publicPem) {
      alert("Empfänger hat keinen öffentlichen Schlüssel publiziert.");
      return;
    }

    const pubKey = await importPublicKey(publicPem);
    const ciphertext = await encryptFor(pubKey, plain.trim());

    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: recipientId, ciphertext }),
    });
    const json = await res.json();

    if (json?.ok && json.data) {
      setMessages((m) => [...m, json.data]);
      setPlain("");
    }
  }

  const me = user?.primaryEmailAddress?.emailAddress ?? userId ?? "ich";

  const decrypted = useMemo(() => {
    return messages.map((m) => ({ m, mine: m.sender_id === userId }));
  }, [messages, userId]);

  async function reveal(ciphertext: string) {
    if (!privPEM) return "—";
    const privKey = await importPrivateKey(privPEM);
    try {
      return await decryptWith(privKey, ciphertext);
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

  if (isPreview) {
    return (
      <section className="p-6">
        <PreviewPlaceholder
          title="Nachrichten (Preview)"
          description="E2E-Nachrichten und Schlüsselverwaltung sind in Preview nur als Demo sichtbar."
          fields={["Unterhaltungen", "Schlüsselmaterial", "Sende-/Empfangsdaten"]}
        />
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
          Hinweis: Der Empfänger muss vorher einen öffentlichen Schlüssel publiziert haben (Button oben).
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

function AsyncText({ ciphertext, reveal }: { ciphertext: string; reveal: RevealFn }) {
  const [txt, setTxt] = useState("…entschlüsseln…");

  useEffect(() => {
    (async () => setTxt(await reveal(ciphertext)))();
  }, [ciphertext, reveal]);

  return <div className="mt-1 text-zinc-200 whitespace-pre-wrap">{txt}</div>;
}
