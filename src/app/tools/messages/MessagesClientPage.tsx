// /workspace/familiehake/src/app/tools/messages/MessagesClientPage.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { decryptWith, encryptFor, generateRSA, importPrivateKey, importPublicKey } from "@/lib/crypto";
import { PreviewPlaceholder } from "@/components/PreviewNotice";
import type { UserDirectoryEntry } from "@/app/api/users/list/route";
import type { ConversationEntry } from "@/app/api/messages/conversations/route";

type Msg = { id: string; sender_id: string; recipient_id: string; ciphertext: string; created_at: string };

type RevealFn = (ciphertext: string) => Promise<string>;

type KeyStatus = "checking" | "ready" | "error";

// Envelope-Verschlüsselung (AES-GCM + RSA-OAEP, siehe src/lib/crypto.ts) hat
// praktisch keine Längenbegrenzung mehr. Grenze hier ist nur eine UI-Leitplanke,
// weit unter dem Server-Limit von 64.000 Zeichen Ciphertext (inkl. Envelope-Overhead).
const MAX_MESSAGE_CHARS = 4000;

const POLL_INTERVAL_MS = 8000;

export default function MessagesPage() {
  const isPreview = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
  const { userId } = useAuth();
  const [privPEM, setPrivPEM] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("e2e_private_pem");
  });
  const [keyStatus, setKeyStatus] = useState<KeyStatus>("checking");

  const [directory, setDirectory] = useState<UserDirectoryEntry[]>([]);
  const [conversations, setConversations] = useState<ConversationEntry[]>([]);
  const [activePeerId, setActivePeerId] = useState<string>("");
  const [newPeerId, setNewPeerId] = useState<string>("");
  const [peerHasKey, setPeerHasKey] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [plain, setPlain] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const directoryMap = useMemo(
    () => new Map(directory.map((u) => [u.id, u.displayName])),
    [directory]
  );

  function nameFor(id: string): string {
    return directoryMap.get(id) ?? id;
  }

  const loadDirectory = useCallback(async () => {
    try {
      const res = await fetch("/api/users/list");
      const json = await res.json();
      if (json?.ok) setDirectory(json.data ?? []);
    } catch {
      // Adressbuch ist eine Komfortfunktion – bei Fehler bleibt die Auswahl leer.
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/messages/conversations");
      const json = await res.json();
      if (json?.ok) setConversations(json.data ?? []);
    } catch {
      // still, wird beim nächsten Öffnen erneut versucht
    }
  }, []);

  // Schlüsselpaar (RSA-OAEP-2048) automatisch einrichten: einmalig lokal
  // erzeugen (privater Teil verlässt nie den Browser, localStorage) und den
  // öffentlichen Teil bei jedem Besuch (erneut) veröffentlichen – idempotent,
  // holt eine zuvor fehlgeschlagene Veröffentlichung automatisch nach.
  const ensureKeyPublished = useCallback(async () => {
    let priv = localStorage.getItem("e2e_private_pem");
    let pub = localStorage.getItem("e2e_public_pem");
    if (!priv || !pub) {
      const kp = await generateRSA();
      priv = kp.privatePEM;
      pub = kp.publicPEM;
      localStorage.setItem("e2e_private_pem", priv);
      localStorage.setItem("e2e_public_pem", pub);
      setPrivPEM(priv);
    }
    try {
      const res = await fetch("/api/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_key_pem: pub }),
      });
      const json = await res.json();
      setKeyStatus(json?.ok ? "ready" : "error");
    } catch {
      setKeyStatus("error");
    }
  }, []);

  // Adressbuch, bisherige Unterhaltungen & Schlüssel-Einrichtung einmalig
  // laden (gewolltes Fetch-on-mount, kein externes Subscription-Ziel vorhanden).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadDirectory();
    void loadConversations();
    void ensureKeyPublished();
  }, [loadDirectory, loadConversations, ensureKeyPublished]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function loadChat(peerId: string) {
    if (!peerId) return;
    try {
      const res = await fetch(`/api/messages?peer=${encodeURIComponent(peerId)}`);
      const json = await res.json();
      if (!json?.ok) {
        setLoadError("Nachrichten konnten nicht geladen werden.");
        return;
      }
      setLoadError(null);
      setMessages(json.data ?? []);
    } catch {
      setLoadError("Nachrichten konnten nicht geladen werden.");
    }
  }

  async function checkPeerKey(peerId: string) {
    setPeerHasKey(null);
    try {
      const res = await fetch(`/api/keys?userId=${encodeURIComponent(peerId)}`);
      const json = await res.json();
      setPeerHasKey(Boolean(json?.data?.public_key_pem));
    } catch {
      setPeerHasKey(null);
    }
  }

  function openChat(peerId: string) {
    if (!peerId) return;
    setActivePeerId(peerId);
    setSendError(null);
    void loadChat(peerId);
    void checkPeerKey(peerId);
  }

  // Chat des aktiven Partners regelmäßig neu laden, solange einer offen ist.
  useEffect(() => {
    if (!activePeerId) return;
    const id = setInterval(() => void loadChat(activePeerId), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [activePeerId]);

  async function send() {
    const text = plain.trim();
    if (!text || !activePeerId) return;
    setSendError(null);

    if (text.length > MAX_MESSAGE_CHARS) {
      setSendError(`Nachricht ist zu lang (max. ${MAX_MESSAGE_CHARS} Zeichen).`);
      return;
    }

    // Public Key des Empfängers holen
    const keyRes = await fetch(`/api/keys?userId=${encodeURIComponent(activePeerId)}`);
    const keyJson = await keyRes.json();
    const publicPem = keyJson?.data?.public_key_pem as string | undefined;

    if (!publicPem) {
      setPeerHasKey(false);
      setSendError(`${nameFor(activePeerId)} hat noch keinen Schlüssel veröffentlicht.`);
      return;
    }
    setPeerHasKey(true);

    try {
      const pubKey = await importPublicKey(publicPem);
      const ciphertext = await encryptFor(pubKey, text);

      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_id: activePeerId, ciphertext }),
      });
      const json = await res.json();

      if (!json?.ok || !json.data) {
        setSendError("Nachricht konnte nicht gesendet werden.");
        return;
      }

      setMessages((m) => [...m, json.data]);
      setPlain("");
      setConversations((prev) => [
        { peerId: activePeerId, lastMessageAt: json.data.created_at },
        ...prev.filter((c) => c.peerId !== activePeerId),
      ]);
    } catch {
      setSendError("Nachricht konnte nicht verschlüsselt werden.");
    }
  }

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

  const directoryOptions = directory.filter((u) => u.id !== userId);

  return (
    <section className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">Nachrichten (E2E)</h1>
        {keyStatus === "checking" && (
          <div className="text-[11px] text-zinc-500">Schlüssel wird eingerichtet…</div>
        )}
        {keyStatus === "ready" && (
          <div className="text-[11px] text-emerald-400">Sicherer Schlüssel aktiv</div>
        )}
        {keyStatus === "error" && (
          <div className="flex items-center gap-2">
            <div className="text-[11px] text-red-400">Schlüssel konnte nicht veröffentlicht werden</div>
            <button
              onClick={() => void ensureKeyPublished()}
              className="rounded-lg border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-900"
            >
              Erneut versuchen
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 flex flex-col gap-1.5">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">Unterhaltungen</div>
            {conversations.length === 0 ? (
              <div className="text-xs text-zinc-500">Noch keine Unterhaltungen.</div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.peerId}
                  onClick={() => openChat(c.peerId)}
                  className={`rounded-lg px-2 py-1.5 text-left text-sm truncate ${
                    activePeerId === c.peerId ? "bg-zinc-800 text-zinc-100" : "text-zinc-300 hover:bg-zinc-900"
                  }`}
                >
                  {nameFor(c.peerId)}
                </button>
              ))
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 flex flex-col gap-2">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">Neue Unterhaltung</div>
            <select
              value={newPeerId}
              onChange={(e) => setNewPeerId(e.target.value)}
              className="rounded bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-sm text-zinc-200"
            >
              <option value="">Person wählen…</option>
              {directoryOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
            <button
              disabled={!newPeerId}
              onClick={() => {
                openChat(newPeerId);
                setNewPeerId("");
              }}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Chat öffnen
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {!activePeerId ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-500">
              Wähle links eine Unterhaltung oder starte eine neue.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-100">{nameFor(activePeerId)}</div>
                {peerHasKey === false && (
                  <div className="text-[11px] text-amber-400">Kein öffentlicher Schlüssel veröffentlicht</div>
                )}
              </div>

              {loadError && <div className="text-xs text-red-400">{loadError}</div>}

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
                        <div className="text-[10px] text-zinc-500 mb-1">
                          {mine ? "Ich" : nameFor(m.sender_id)} ·{" "}
                          {new Date(m.created_at).toLocaleString("de-DE")}
                        </div>
                        <details>
                          <summary className="cursor-pointer text-zinc-300">Nachricht anzeigen</summary>
                          <AsyncText ciphertext={m.ciphertext} reveal={reveal} />
                        </details>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {sendError && <div className="text-xs text-red-400">{sendError}</div>}

              <div className="flex items-end gap-2">
                <textarea
                  placeholder="Nachricht… (Enter zum Senden, Umschalt+Enter für Zeilenumbruch)"
                  value={plain}
                  onChange={(e) => setPlain(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={3}
                  maxLength={MAX_MESSAGE_CHARS}
                  className="flex-1 resize-none rounded bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm"
                />
                <button onClick={send} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-900">
                  Senden
                </button>
              </div>
            </>
          )}
        </div>
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
