# CONVENTIONS

## Runtime And Tooling

- Use Deno tasks from `deno.json` as the source of truth for development commands.
- Prefer Deno-native workflows; do not use `npm` and do not create `node_modules`.
- Use `gh` for GitHub operations.
- Use `agent-browser` with `http://localhost:8000/` for browser verification when needed.

## Deno Task Execution

- You may run `deno task` commands without asking for separate approval.
- Common safe tasks are `deno task check`, `deno task lint`, `deno task test`, `deno task dev`, `deno task start`, `deno task pv`, `deno task pmD`, `deno task pmd`, `deno task pms`, `deno task pmr`, and `deno task ps`.
- Treat `deno.json` as the source of truth if task names change.
- For schema/index changes, treat `prisma/schema.prisma` as the source of truth and prefer the Prisma workflow: edit the schema first, then run `deno task pmd --name <migration_name>`, then inspect the generated migration instead of hand-authoring migration SQL.

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

## Validation And Parsing

- Prefer schema validation with Zod and `zod-form-data` where the project already uses it.
- Reject invalid input early in routes.
- Keep user-facing validation text consistent with the existing German UI tone.
- User-facing UI text must be German-only for both student and admin flows; do not leave English empty states, headings, helper text, or status labels in templates.
- HTMX admin controls should return plain response text with non-2xx status on failure so the global toast handler in `templates/index.hbs` can surface the error.

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

## Documentation Maintenance

- Keep durable guidance in `docs/ai/` instead of growing `AGENTS.md` again.
- Update `HANDOFF.md` when pausing with unfinished work.
- Update the relevant doc in `docs/ai/` whenever repository conventions or architecture meaningfully change.

## Badge Color Logic for Missed Count

- On student IP cards, the missed count badge uses conditional Bootstrap classes based on priority:
  1. `text-bg-warning` (yellow/orange) when `missed_count >= 1` (student was absent at least once)
  2. `text-bg-danger` (red) when `missed_count == 0` AND `is_stale == true` (student is currently offline)
  3. `bg-light text-dark border` (neutral) when neither condition applies
- The badge text format is "Fehlte X mal" (with space, not hyphen).
