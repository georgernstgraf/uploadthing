# Project State

Current status as of 2026-10-16.

## Current Focus
Sister repo `examsense` (OPNsense appliance scripts) integrated into this
repo as `appliance/` (squashed subtree import, docs consolidated into
`docs/ai/OPERATIONS.md` + `CONVENTIONS.md`, examsense archived on GitHub).
Issue #137 (TLS-Betrieb auf sense) — **Host-Arbeit erledigt 2026-10-16**:
`.env` final auf dem Host (`DENO_ENV=production`, Listener loopback 8000,
TLS-Pfade gesetzt), Restart-Prozedur verifiziert, OPNsense-GUI → 8443
mit echtem LE-Zertifikat, DNAT 443 → 127.0.0.1:8000 (pf rdr, kein SNAT),
Smoke-Tests von 192.168.21.2 bestanden (Clean-URL 200, valides Zertifikat,
echte Client-IPs, Port 8000 vom Netz aus nicht erreichbar). `ssh sense`
funktioniert inzwischen (Alias vorhanden).

## Completed (this cycle)
- [x] `.env.example` (git-tracked, Platzhalter, TLS-Block mit Beides-oder-keins-Hinweis) (#137)
- [x] TLS-Deploy-Abschnitt in `docs/ai/OPERATIONS.md` (#137)
- [x] Prisma model `examstate` + migration, direct-SQLite repo with upsert singleton (#131)
- [x] Exam state machine `start/pause/resume/stop/addExtra` with injectable clock in `service/exam.ts` (#131)
- [x] `requireAdmin` middleware replacing 8 inline admin checks (#131)
- [x] Router split: `machineRouter` at root (`POST /activeips` only), `apiRouter` under `/api` only (#131)
- [x] Exam admin API `/api/exam/{start,pause,resume,stop,extra}` + public-to-login `GET /api/exam/state` (#131)
- [x] Native TLS via `Deno.serve` (Code-Seite, #136)
- [x] Startup reset to exam mode off / internet free, examstate forced to stopped (#131)
- [x] #137 Host-Arbeit auf `sense`: `.env` final (loopback 8000, `DENO_ENV=production`), Service-Restart-Prozedur verifiziert, OPNsense-GUI → 8443 mit LE-Zertifikat, DNAT 443→127.0.0.1:8000, Smoke-Tests von 192.168.21.2
- [x] Exam-time gating for `POST /upload` and `GET /unterlagen/*` (#131)
- [x] Admin exam control panel (duration, start/pause/resume/stop/extra) and student countdown with early-submission encouragement (#131)

## Pending
- [x] #137 — TLS-Betrieb auf sense: Host-Arbeit abgeschlossen 2026-10-16 (`.env` final, Restart-Prozedur, GUI 8443 + LE-Zertifikat, DNAT 443→8000, Smoke-Tests bestanden). Verbleibt operativ: Zertifikats-Renewal (Ernte auf `kik` + `scp` nach `sense`)
- [ ] #133 — Prisma → Drizzle Migration (Engines/Linuxulator/Pin eliminieren)
- [ ] #134 — Admin-Upload für Unterlagen (SSH-Handgriff ersetzen)
- [ ] #136 — Native TLS (Code fertig; Deployment: scp der geernteten Zertifikate, Ziel-Maschine + Split-DNS offen) → Deployment läuft jetzt als #137
- [ ] #135 — Playwright-Smoke-Suite für examkritische Browser-Flows (vor der htmx-4-Migration)

## Blockers
None.

## Next Session Suggestion
Possible follow-ups from #131 (not part of the issue scope): admin exemption from Unterlagen gating, student countdown polling after resume.
