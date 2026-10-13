# Project State

Current status as of 2026-10-13.

## Current Focus
Issue #131 (vorgegebene Prüfungsdauer) — completed.

## Completed (this cycle)
- [x] Prisma model `examstate` + migration, direct-SQLite repo with upsert singleton (#131)
- [x] Exam state machine `start/pause/resume/stop/addExtra` with injectable clock in `service/exam.ts` (#131)
- [x] `requireAdmin` middleware replacing 8 inline admin checks (#131)
- [x] Router split: `machineRouter` at root (`POST /activeips` only), `apiRouter` under `/api` only (#131)
- [x] Exam admin API `/api/exam/{start,pause,resume,stop,extra}` + public-to-login `GET /api/exam/state` (#131)
- [x] Startup reset to exam mode off / internet free, examstate forced to stopped (#131)
- [x] Exam-time gating for `POST /upload` and `GET /unterlagen/*` (#131)
- [x] Admin exam control panel (duration, start/pause/resume/stop/extra) and student countdown with early-submission encouragement (#131)

## Pending
- [ ] #133 — Prisma → Drizzle Migration (Engines/Linuxulator/Pin eliminieren)
- [ ] #134 — Admin-Upload für Unterlagen (SSH-Handgriff ersetzen)
- [ ] #135 — Playwright-Smoke-Suite für examkritische Browser-Flows (vor der htmx-4-Migration)

## Blockers
None.

## Next Session Suggestion
Possible follow-ups from #131 (not part of the issue scope): admin exemption from Unterlagen gating, student countdown polling after resume.
