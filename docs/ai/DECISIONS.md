# DECISIONS

## Deno-First Execution

- The project uses Deno tasks and Deno runtime APIs as the primary execution model.
- Even when npm packages are imported, they are resolved through Deno's package support, not a Node package install workflow.

## Layered Web App

- The application is organized as middleware -> routes -> service -> repo -> database to separate HTTP concerns, business logic, and persistence.
- `main.ts` mounts routers and middleware, while `service/service.ts` and `repo/repo.ts` act as aggregators.

## Server-Rendered UI

- The frontend is intentionally server-rendered with Handlebars templates and Bootstrap, with HTMX-style partial responses for lighter interactions.
- This keeps the exam workflow simple, fast to load, and easy to operate in constrained environments.

## Hybrid Persistence Strategy

- Prisma is used for the `users` model and client generation.
- Direct SQLite access is still used for `ipfact`, `registrations`, `forensic_registrations`, and `abgaben`.
- This hybrid approach is intentional for now and should remain unless there is a deliberate migration plan.

## Exam-Oriented Authentication

- The app does not use a conventional username/password flow for students.
- Authentication is a hybrid of operational verification and a signed session cookie.
- The session cookie stores minimal data and is re-hydrated into a user record on each request.

## Socket IP As Ground Truth

- The system treats `c.env.info.remoteAddr` as the authoritative client IP.
- Proxy headers such as `X-Forwarded-For` are intentionally not trusted because auditability matters more than generic proxy compatibility in this environment.

## Local-Time Service, UTC Persistence

- UI and service behavior are expressed in local-time terms for humans.
- Persistence uses UTC timestamps so storage and range queries stay consistent.

## Archival Instead Of Full Deletion For Registrations

- Exam-start operations archive `registrations` into `forensic_registrations` before clearing the active registration table.
- This preserves audit history across exams while resetting the live working set.

## AI Knowledge Persistence

- `AGENTS.md` is the bootstrap document.
- Long-lived agent knowledge belongs in `docs/ai/`.
