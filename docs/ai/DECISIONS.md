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

## Manual Theme Deployment

- Uploadthing uses a fixed theme infrastructure derived from `color-tool`, but deployed as static assets inside `uploadthing/static/`.
- Users can only toggle light versus dark mode for the currently installed theme.
- The active palette is shipped as a generic `/static/theme.css` file that should remain a direct copy of a color-tool theme CSS.
- Theme replacement is an administrator task: replace `/static/theme.css` plus `/static/img/bg-light.jpg` and `/static/img/bg-dark.jpg`, then recommit.
- Uploadthing keeps only one small local stylesheet, `/static/app.css`, on top of the color-tool stack.
- The old multi-file local CSS layer (`base.css`, `theme-bridge.css`, `utilities.css`, `components.css`) is intentionally removed.
- `app.css` should stay structural and behavioral; palette and contrast decisions should come from Bootstrap variables and the imported color-tool files rather than app-owned color overrides.

## Dual API Mounting

- `apiRouter` is mounted at both `/` and `/api`.
- This preserves existing root-level endpoints such as `/activeips` while allowing explicit API-style paths such as `/api/exammode` for new HTMX controls.

## Runtime-Editable Upload Policy

- Allowed upload file types are initialized from env but can be changed by admins while the process is running.
- Upload validation reads the current in-memory config value rather than treating the env-derived startup value as immutable.

## Hybrid Persistence Strategy

- Prisma is used for the `users` model and client generation.
- Direct SQLite access is still used for `ipfact`, `registrations`, `cookiepresents`, and `abgaben`.
- This hybrid approach is intentional for now and should remain unless there is a deliberate migration plan.

## Exam-Oriented Authentication

- The app does not use a conventional username/password flow for students.
- Authentication is a hybrid of operational verification and a signed session cookie.
- The session cookie stores minimal data and is re-hydrated into a user record on each request.

## Cookie Presence Versus Explicit Registration

- Explicit registration events and ongoing cookie-based presence are distinct concepts.
- `registrations` records deliberate registration actions.
- `cookiepresents` records each request that arrives with a valid cookie and resolved user.
- The admin forensics view treats cookie presence as the current user attribution for an IP while still showing explicit registration history separately.

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
