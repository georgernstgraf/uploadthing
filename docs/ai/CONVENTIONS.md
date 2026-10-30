# CONVENTIONS

## Runtime And Tooling

- Use Deno tasks from `deno.json` as the source of truth for development commands.
- Prefer Deno-native workflows; do not use `npm` and do not create `node_modules`.
- Use `gh` for GitHub operations.
- Use `agent-browser` with `http://localhost:8000/` for browser verification when needed.

## Deno Task Execution

- You may run `deno task` commands without asking for separate approval.
- Common safe tasks are `deno task check`, `deno task lint`, `deno task test`, `deno task dev`, `deno task start`, `deno task db:generate`, and `deno task db:migrate`.
- Treat `deno.json` as the source of truth if task names change.
- Drizzle is the schema and migration authority: `drizzle/schema.ts` describes the database, `drizzle/*.sql` are the migrations. For schema/index changes, edit the schema first, then run `deno task db:generate --name <migration_name>` **on the development machine**, then inspect the generated SQL instead of hand-authoring it. `drizzle-kit` never runs on `sense`/Dell.
- Migrations are applied at app start by `lib/migrate.ts` (idempotent, `BEGIN EXCLUSIVE`, forward-only). There is no separate deploy step, and a migration is never marked as applied by hand.
- When raw SQLite code needs the database file path, derive it from `DATABASE_URL` via `lib/dbpath.ts` (Prisma-compatible `file:` semantics, relative to the former `prisma/` directory) rather than introducing a separate runtime DB path setting.

## Coding Style

- Indentation: 4 spaces, including `.ts`, `.hbs`, `.html`, and `.css`.
- Line endings: LF.
- Always include `.ts` in local TypeScript imports.
- Naming is mixed-domain: English for general code and types, German where the domain already uses it.
- Files are lowercase, typically with underscores where that matches existing naming.

## Structural Conventions

- Follow the existing layering: middleware -> routes -> service -> repo -> database.
- Keep route handlers thin; validation and orchestration belong in services.
- Repositories own persistence details and time conversion for stored timestamps.
- For direct SQLite repositories, hoist fixed `db.prepare(...)` statements to module scope and only prepare per call when the SQL shape is genuinely dynamic.
- Shared types and helpers belong under `lib/`.
- Template rendering is server-side via Handlebars in `lib/handlebars.ts` and `templates/`.
- In Handlebars templates, prefer native Bootstrap component structure (`card-header`, `card-body`, `card-footer`, `list-group`, `badge`, `btn`) over generic wrapper classes when the element already matches a Bootstrap component concept.
- For repeated shell/layout sizing in Handlebars templates, move the rule into `static/ui-shell.css` and reuse scoped classes instead of inline `style="..."` attributes.
- For icon-and-label buttons in templates, prefer a small reusable flex wrapper with text-relative icon sizing (`em`) over fixed pixel `width`/`height` attributes on the image.
- Give meaningful one-off structural UI elements in Handlebars templates a clear unique `id`, and update any HTMX targets, CSS selectors, JS selectors, `aria-controls`, or anchor references when those IDs change.
- Admin route naming is now split by responsibility: use `/admin/students` for the student/IP forensics page and `/admin/application` for runtime admin settings such as themes, file types, downloads, and cleanup.

## Fail-Strict Configuration

- Security-relevant and operation-critical env vars must use `requireEnv()` to fail at startup with a descriptive German error message.
- IP whitelists (`ADMIN_IPS`) must use `parseRequiredIpList()`.
- MAC lists (`ADMIN_MACS`) are optional by design (missing = no approval via env, not a startup error) but every entry must be a valid MAC; parse them with `parseAdminMacList()` so a typo aborts startup instead of silently disabling an approval. Store and compare MACs only in the canonical form from `lib/mac.ts` (`aa:bb:cc:dd:ee:ff`).
- Connection settings that need multiple secrets are all-or-nothing: `OPNSENSE_*` and `TIK_*` are either fully set or fully absent; partial settings abort startup with a German message. Never add a fallback that silently disables a security- or operations-relevant integration.
- Do not add new optional env vars with silent fallbacks for anything that affects security or runtime behavior.
- The old `!` non-null assertion pattern on `Deno.env.get()` is no longer sufficient; convert to `requireEnv()`.

## Validation And Parsing

- Prefer schema validation with Zod and `zod-form-data` where the project already uses it.
- Reject invalid input early in routes.
- Keep user-facing validation text consistent with the existing German UI tone.
- User-facing UI text must be German-only for both student and admin flows; do not leave English empty states, headings, helper text, or status labels in templates.
- HTMX admin controls should return plain response text with non-2xx status on failure so the global toast handler in `templates/index.hbs` can surface the error.
- Invalid or missing `DATABASE_URL` values should fail fast at startup instead of silently falling back to a hardcoded SQLite filename.

## Time Handling

- UI-facing inputs and displays use local time semantics.
- Services should work with `Date` objects.
- Repositories persist UTC timestamps, typically via `date.toISOString()`.
- Use helpers in `lib/timefunc.ts` for formatting.

## Testing And Completion

- A task is not complete until `deno task check`, `deno task lint`, and `deno task test` succeed.
- `deno task test` is the automated test command; ignore older references such as `main_test_db.ts`.
- If a command cannot run because of missing env, LDAP, filesystem, or another dependency, report that explicitly.
- For admin forensics database work, verify index usage directly against `uploadthing.db` with `sqlite3 "uploadthing.db" "EXPLAIN QUERY PLAN ..."`; capture the exact hot queries being evaluated and compare plans before and after schema/query changes.
- For admin/student forensics bugs, prefer both a service-level regression in `service/ipadmin_test.ts` and a rendered-page regression in `test/endpoints_test.ts` when the failure is visible in the HTML.
- For localhost-dependent forensic tests, use the shared helpers in `test/helpers/forensics_fixture.ts` to reset and seed deterministic DB state instead of relying on ambient rows already present in `uploadthing.db`.
- Keep `127.0.0.1` as the canonical local test IP for forensic endpoint scenarios unless the project intentionally changes that policy.

## Appliance Scripts (appliance/)

> **Stand 2026-10-30:** Auf der Sense läuft nichts Eigenes mehr (#143), und
> die Appliance-Skripte sind mit #144 entfernt. Es bleibt nur noch
> Nachschlage- und Belegmaterial: `bin/redact-opnsense.sed`,
> `files/usr_local_etc_devd_usb_persist.conf`, `Mikrotik/`,
> `current/config.redacted.xml` und `legacy-rules-2026-10-30.csv`.
> Neuer Code gehört **nicht** mehr hierher.

- `appliance/files/` mirrors `/usr/local/...` target paths 1:1 (slashes
  replaced by underscores). Do not rename files there without a
  deployment migration note.
- `bin/redact-opnsense.sed` is a POSIX `sed` script; keep it
  line-oriented and dependency-free so it runs with the appliance's base
  `sed`. Any new redaction rule must be verified against a snapshot
  before the snapshot lands in the repo.
- Never commit secrets, real MACs, or credentials; treat
  `appliance/Mikrotik/` exports as sensitive material (pre-shared keys,
  backup passwords, serial numbers). Only redacted exports are allowed.
- ASCII only unless the file already contains non-ASCII characters.
- There is no test suite for these artifacts; sanity-check changes ad hoc
  and document behavior changes in `appliance/README.md` or
  `docs/ai/OPERATIONS.md`.

## Documentation Maintenance

- Keep durable guidance in `docs/ai/` instead of growing `AGENTS.md` again.
- Update `HANDOFF.md` when pausing with unfinished work.
- Update the relevant doc in `docs/ai/` whenever repository conventions or architecture meaningfully change.
- Keep the root `AGENTS.md` concise and project-specific; avoid reintroducing framework-specific scaffold guidance there.

## Badge Color Logic for Missed Count

- On student IP cards, the missed count badge uses conditional Bootstrap classes based on priority:
  1. `text-bg-warning` (yellow/orange) when `missed_count >= 1` (student was absent at least once)
  2. `text-bg-danger` (red) when `missed_count == 0` AND `is_stale == true` (student is currently offline)
  3. `text-bg-light` (neutral) when neither condition applies
- The badge text format is "Fehlte X mal" (with space, not hyphen).
- Submission badge ("Abgabe") appears above the missed count badge.

## Scroll Container Layout

- Body has `overflow: hidden` and `height: 100vh` — no body scrolling.
- `#app-main` is the internal scroll container with `overflow-y: auto` and constrained height.
- Scrollbar is hidden via `scrollbar-width: none` (Firefox) and `::-webkit-scrollbar { display: none }` (Chrome/Safari/Edge/Opera).
- This keeps content from sliding behind the fixed glassmorphism navbar while preserving scroll functionality.

## External Library Management

- All external JS/CSS libraries must be stored as non-minified, readable source files.
- Use versioned filenames with symlinks: `static/htmx.js` → `static/htmx-2.0.10.js`, `static/alpine.js` → `static/alpine-3.15.12.js`, `static/bootstrap.css` → `static/bootstrap-5.3.8.css`, `static/bootstrap.bundle.js` → `static/bootstrap-5.3.8.bundle.js`.
- When upgrading, download the new versioned file, update the symlink target. Old versioned files remain for rollback.
- Bootstrap JS (`bootstrap.bundle.js`) must be loaded for modals, tooltips, and `data-bs-*` attributes to work. `bootstrap.css` alone is not enough.

## HTMX Event and Attribute Rules

- When using `hx-on:` attributes, always use kebab-case event names. HTML attribute names are case-insensitive and get lowercased by the browser, breaking camelCase matches.
- `hx-disinherit` must be placed on an ANCESTOR of elements that should not inherit, never on the element itself. HTMX's disinherit check only runs on ancestors differing from the initial element.
- Prefer global `document` event listeners over per-element `hx-on` for cross-element effects (e.g., showing a modal after a content swap). Check `evt.detail.target.id` in the listener to identify which swap occurred.
- `htmx:afterSwap` fires on swap target elements (the new content), not the requesting element. For per-request effects, use `htmx:afterRequest` or listen on `document`.
- `hx-disabled-elt="this"` only works when the element carrying the attribute is the **requesting** element. With `hx-post` on a `<form>`, put `hx-disabled-elt="find button[type='submit']"` on the form — an attribute on the submit button is never found, because htmx's attribute lookup walks upwards from the requesting element. `find` returns only the **first** match, so a form with several submit buttons needs an explicit selector.
- New structural UI elements need a stable `id` if any browser test touches them; `test/e2e` selects exclusively by `id` (plus ARIA roles where an element deliberately has none).
