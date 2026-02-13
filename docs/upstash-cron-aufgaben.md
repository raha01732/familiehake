<!-- docs/upstash-cron-aufgaben.md -->
# Upstash Cron-Aufgaben für dieses Projekt

## Warum das zu deinem Projekt passt
Dein Projekt nutzt bereits Upstash Redis als Cache (`src/lib/redis.ts`) und optional für Rate-Limits (`src/lib/ratelimit.ts`). Zusätzlich laufen bereits Vercel Crons über `vercel.json`.

Darum ist die sinnvollste Strategie:
1. **Nicht nur Keep-Alive**, sondern echte Wartungs-/Betriebsjobs.
2. **Supabase bleibt Source of Truth**, Upstash bleibt schnell und flüchtig für Cache, Quotas und Zähler.
3. **Sentry** bekommt Fehler/Job-Health, damit man Ausfälle sofort sieht.

## Priorisierte regelmäßige Aufgaben (empfohlen)

### 1) Cache-Vorwärmung für Dashboard-Statistiken (alle 5–15 Minuten)
- Hintergrund: `src/lib/stats.ts` cached bereits Kennzahlen in Redis (`cache:stats:storage`, `cache:stats:journal`) mit 60s TTL.
- Cron kann diese Werte proaktiv neu berechnen, damit Nutzer auf dem Dashboard weniger Cold-Start-Latenz sehen.
- Vorteil: besseres UX, geringe Redis-Kosten.

### 2) Ratelimit-Hygiene / Missbrauchs-Detektion (stündlich)
- Hintergrund: `src/lib/ratelimit.ts` nutzt Prefix `rl`.
- Job-Idee:
  - Top-IPs/Keys zählen (nur aggregiert, DSGVO-sparsam)
  - bei Schwellwerten Sentry-Event senden
- Vorteil: frühzeitiges Erkennen von Bot-Traffic.

### 3) Share-Link-Index pflegen (alle 10 Minuten)
- Hintergrund: in `src/lib/stats.ts` und Share-APIs gibt es aktive/abgelaufene/revokte Shares.
- Job-Idee:
  - Redis-Set mit „bald ablaufenden Shares“ (z. B. <48h)
  - optional Reminder/Badge im UI vorbereiten
- Vorteil: schnellere Prüfungen im UI/API ohne teure DB-Abfragen.

### 4) Audit-Metriken aggregieren (stündlich/täglich)
- Hintergrund: `src/lib/audit.ts` schreibt viele Event-Typen in `audit_events` (Supabase).
- Job-Idee:
  - stündliche Counter in Redis (`metrics:audit:<action>:<yyyy-mm-dd-hh>`)
  - täglicher Rollup nach Supabase (persistente Historie)
- Vorteil: schnelles Monitoring + langfristige Auswertung.

### 5) Health-Heartbeat für Observability (alle 15 Minuten)
- Hintergrund: Es gibt bereits `/api/keepalive` für Supabase.
- Job-Idee für Upstash:
  - `SET ops:heartbeat:upstash <timestamp> EX 3600`
  - bei Fehlern `captureException` an Sentry
- Vorteil: klarer Nachweis, dass Cron + Redis erreichbar sind.

## Was **nicht** sinnvoll ist
- Nur künstliche Schreibzugriffe ohne fachlichen Zweck.
- Unbegrenzte Key-Erzeugung ohne TTL.
- PII in Redis speichern (besser anonymisierte IDs/Hashes).

## Konkretes Setup auf Vercel (Free/Low-Cost freundlich)

### Cron-Frequenzen (Startwerte)
- `*/10 * * * *` → cache warmup
- `0 * * * *` → audit aggregationen
- `*/15 * * * *` → upstash heartbeat

### Redis-Key-Konvention
- `cache:*` für kurzlebige Antworten
- `metrics:*` für Zähler/Analytik
- `ops:*` für Betriebszustände/Heartbeat
- Immer TTL setzen, außer bewusst persistente Metrik-Keys.

## Zusammenspiel der von dir gewünschten Tools
- **Vercel**: Cron-Ausführung + API Routes.
- **Upstash**: Cache, Counter, Queue/Retry-Marker.
- **Supabase**: persistente Business-Daten + Rollups.
- **Sentry**: Fehler, Alerts, Cron-Health.
- **Clerk**: nur wenn Job nutzerbezogene Aktionen ausführt (IDs minimal halten).

## Kostenfreie Ergänzungen mit Sinn
- **Uptime Kuma (self-hosted)** oder **Better Stack Free** für externes Endpoint-Monitoring.
- **Grafana Cloud Free** (optional), falls ihr Metriken zentral visualisieren wollt.

## Nächster pragmatischer Schritt
1. Bestehenden `/api/keepalive` um Upstash-Heartbeat erweitern (oder zweite Route `/api/keepalive/upstash`).
2. Einen neuen Cron für `cache warmup` einführen.
3. Fehlerpfade konsequent an Sentry melden.
