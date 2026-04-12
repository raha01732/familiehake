<!-- /workspace/familiehake/docs/clerk-preview-und-local.md -->
# Clerk in Preview stabil halten + lokal testen

## Was wurde im Code angepasst?

- CSP erlaubt jetzt zusätzlich `https://*.clerk.accounts.dev` (relevant für Clerk-Preview/Dev-Instanzen).
- Login-Weiterleitungen laufen jetzt standardmäßig über `"/sign-in"` auf **derselben Domain**.
- Optional kann ein stage-spezifischer Login-Endpunkt über `NEXT_PUBLIC_CLERK_SIGN_IN_URL` gesetzt werden.
- Clerk ist für lokale Builds jetzt **optional**, solange `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` und `CLERK_SECRET_KEY` beide leer sind.
- Wenn nur einer der beiden Clerk-Keys gesetzt ist, bricht die App mit einer klaren Fehlermeldung ab.
- Neuer Debug-Endpunkt: `GET /api/health/auth` für Stage-/Host-/Clerk-Mismatch-Diagnose.

## Schneller Check bei Login-Schleife

Rufe im Browser oder via `curl` auf:

```bash
curl https://<deine-stage-domain>/api/health/auth
```

Wichtige Felder in der Antwort:

- `issues`: enthält Problemcodes wie `PREVIEW_SIGNIN_HOST_MISMATCH` oder `CLERK_KEYS_INCOMPLETE`
- `configured_sign_in_url`: effektive Sign-In-URL, die aufgelöst wird
- `sign_in_host_matches_request_host`: sollte in Preview normalerweise `true` sein

## Empfohlene Vercel-Variablen pro Stage

Setze die Werte getrennt für `Production`, `Preview` und `Development`:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
- `NEXT_PUBLIC_CLERK_FRONTEND_API` (falls eure Instanz diesen Host nutzt)

Empfehlung:

- Production: `NEXT_PUBLIC_CLERK_SIGN_IN_URL=https://accounts.familiehake.de/sign-in`
- Preview: `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in` (oder eigenes Preview-Auth-Frontend)
- Development: `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`

## Lokal deployen/testen (ohne Clerk)

Für lokales Testen ohne externe Auth:

1. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` **nicht setzen**
2. `CLERK_SECRET_KEY` **nicht setzen**
3. App starten (`npm run dev` oder lokaler Build)

Die App läuft dann ohne Clerk-Schutz (nur für lokale Nutzung gedacht).

## Lokal mit echtem Clerk testen

Wenn du lokalen Login mit echtem Clerk brauchst, verwende einen Tunnel und trage die URL in Clerk als erlaubte Redirect-URL ein.

Kostenfreie Optionen:

- `cloudflared tunnel` (Cloudflare Tunnel, kostenlos)
- `ngrok` Free Tier

Dann z. B. setzen:

- `NEXT_PUBLIC_APP_URL=https://<dein-tunnel>.trycloudflare.com`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`

und diese Tunnel-URL in Clerk als Redirect/Origin für die passende Instanz (Dev/Preview) hinterlegen.
