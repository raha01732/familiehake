// /workspace/familiehake/src/app/tools/messages/MessagesClientPage.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Loader2, Lock, MessageSquare, Send, ShieldAlert } from "lucide-react";
import { decryptWith, encryptFor, importPrivateKey, importPublicKey } from "@/lib/crypto";
import { ensureKeyPublished, getLocalPrivateKey } from "@/lib/e2e-keys";
import { PreviewPlaceholder } from "@/components/PreviewNotice";
import type { UserDirectoryEntry } from "@/app/api/users/list/route";
import type { ConversationEntry } from "@/app/api/messages/conversations/route";

type Msg = { id: string; sender_id: string; recipient_id: string; ciphertext: string; created_at: string };

type KeyStatus = "checking" | "ready" | "error";

// Envelope-Verschlüsselung (AES-GCM + RSA-OAEP, siehe src/lib/crypto.ts) hat
// praktisch keine Längenbegrenzung mehr. Grenze hier ist nur eine UI-Leitplanke,
// weit unter dem Server-Limit von 64.000 Zeichen Ciphertext (inkl. Envelope-Overhead).
const MAX_MESSAGE_CHARS = 4000;

const POLL_INTERVAL_MS = 8000;

function initials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export default function MessagesPage() {
  const isPreview = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
  const { userId } = useAuth();
  const [privPEM, setPrivPEM] = useState<string | null>(() => getLocalPrivateKey());
  const [keyStatus, setKeyStatus] = useState<KeyStatus>("checking");

  const [directory, setDirectory] = useState<UserDirectoryEntry[]>([]);
  const [conversations, setConversations] = useState<ConversationEntry[]>([]);
  const [activePeerId, setActivePeerId] = useState<string>("");
  const [newPeerId, setNewPeerId] = useState<string>("");
  const [peerHasKey, setPeerHasKey] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [decryptedText, setDecryptedText] = useState<Record<string, string>>({});
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

  // Schlüsselpaar (RSA-OAEP-2048) einrichten – die eigentliche Logik ist in
  // src/lib/e2e-keys.ts geteilt, damit MessagingKeyBootstrap sie auch global
  // (für jeden eingeloggten Nutzer, unabhängig vom Besuch dieses Tools)
  // anstoßen kann. Hier wird sie zusätzlich erneut ausgeführt und das
  // Ergebnis für die Status-Anzeige übernommen.
  const ensureKey = useCallback(async () => {
    const result = await ensureKeyPublished();
    setPrivPEM(result.privPEM);
    setKeyStatus(result.ok ? "ready" : "error");
  }, []);

  // Adressbuch, bisherige Unterhaltungen & Schlüssel-Einrichtung einmalig
  // laden (gewolltes Fetch-on-mount, kein externes Subscription-Ziel vorhanden).
  useEffect(() => {
    void loadDirectory();
    void loadConversations();
    void ensureKey();
  }, [loadDirectory, loadConversations, ensureKey]);

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

  // Nachrichten direkt beim Laden entschlüsseln, statt jede einzeln per Klick
  // aufdecken zu müssen.
  useEffect(() => {
    if (!privPEM) return;
    let cancelled = false;
    (async () => {
      const privKey = await importPrivateKey(privPEM);
      for (const m of messages) {
        if (decryptedText[m.id] !== undefined) continue;
        let text: string;
        try {
          text = await decryptWith(privKey, m.ciphertext);
        } catch {
          text = "Entschlüsselung fehlgeschlagen";
        }
        if (cancelled) return;
        setDecryptedText((prev) => ({ ...prev, [m.id]: text }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, privPEM]);

  if (!userId) {
    return (
      <section>
        <div className="text-sm text-muted-foreground">Bitte anmelden.</div>
      </section>
    );
  }

  if (isPreview) {
    return (
      <section>
        <PreviewPlaceholder
          title="Nachrichten (Preview)"
          description="E2E-Nachrichten und Schlüsselverwaltung sind in Preview nur als Demo sichtbar."
          fields={["Unterhaltungen", "Schlüsselmaterial", "Sende-/Empfangsdaten"]}
        />
      </section>
    );
  }

  const directoryOptions = directory.filter((u) => u.id !== userId);
  const activePeerName = activePeerId ? nameFor(activePeerId) : "";

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Nachrichten</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Ende-zu-Ende-verschlüsselter Chat</p>
        </div>

        {keyStatus === "checking" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <Loader2 size={11} className="animate-spin" aria-hidden />
            Schlüssel wird eingerichtet…
          </span>
        )}
        {keyStatus === "ready" && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{
              background: "hsl(142 71% 45% / 0.1)",
              color: "hsl(142 71% 45%)",
              border: "1px solid hsl(142 71% 45% / 0.25)",
            }}
          >
            <Lock size={11} aria-hidden />
            Sicherer Schlüssel aktiv
          </span>
        )}
        {keyStatus === "error" && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold text-destructive">
              <ShieldAlert size={11} aria-hidden />
              Schlüssel nicht veröffentlicht
            </span>
            <button
              onClick={() => void ensureKey()}
              className="rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary"
            >
              Erneut versuchen
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[260px_1fr]">
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Unterhaltungen
            </div>
            {conversations.length === 0 ? (
              <div className="px-1 py-1 text-xs text-muted-foreground">Noch keine Unterhaltungen.</div>
            ) : (
              <div className="flex flex-col gap-1">
                {conversations.map((c) => (
                  <button
                    key={c.peerId}
                    onClick={() => openChat(c.peerId)}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                      activePeerId === c.peerId
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-secondary"
                    }`}
                  >
                    <span
                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                      style={{ background: "hsl(var(--primary) / 0.15)", color: "hsl(var(--primary))" }}
                    >
                      {initials(nameFor(c.peerId))}
                    </span>
                    <span className="truncate">{nameFor(c.peerId)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-3 flex flex-col gap-2">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Neue Unterhaltung
            </div>
            <select
              value={newPeerId}
              onChange={(e) => setNewPeerId(e.target.value)}
              className="input-field"
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
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Chat öffnen
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {!activePeerId ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-10 text-center">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-2xl"
                style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
              >
                <MessageSquare size={20} aria-hidden />
              </div>
              <p className="text-sm text-muted-foreground">
                Wähle links eine Unterhaltung oder starte eine neue.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                    style={{ background: "hsl(var(--primary) / 0.15)", color: "hsl(var(--primary))" }}
                  >
                    {initials(activePeerName)}
                  </span>
                  <div className="text-sm font-medium text-foreground">{activePeerName}</div>
                </div>
                {peerHasKey === false && (
                  <span className="text-[11px] font-medium" style={{ color: "hsl(27 96% 50%)" }}>
                    Kein öffentlicher Schlüssel veröffentlicht
                  </span>
                )}
              </div>

              {loadError && <div className="text-xs text-destructive">{loadError}</div>}

              <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto rounded-2xl border border-border bg-card p-3">
                {decrypted.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Noch keine Nachrichten.</div>
                ) : (
                  decrypted.map(({ m, mine }) => (
                    <div
                      key={m.id}
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "self-end" : "self-start"}`}
                      style={
                        mine
                          ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }
                          : { background: "hsl(var(--secondary))", color: "hsl(var(--secondary-foreground))" }
                      }
                    >
                      <div
                        className="mb-1 text-[10px] opacity-70"
                      >
                        {mine ? "Ich" : nameFor(m.sender_id)} · {new Date(m.created_at).toLocaleString("de-DE")}
                      </div>
                      <div className="whitespace-pre-wrap">{decryptedText[m.id] ?? "…entschlüsseln…"}</div>
                    </div>
                  ))
                )}
              </div>

              {sendError && <div className="text-xs text-destructive">{sendError}</div>}

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
                  className="input-field flex-1 resize-none"
                />
                <button
                  onClick={send}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
                >
                  <Send size={13} aria-hidden />
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
