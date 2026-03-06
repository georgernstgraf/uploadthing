# CONVENTIONS

## Runtime And Tooling

- Use Deno tasks from `deno.json` as the source of truth for development commands.
- Prefer Deno-native workflows; do not use `npm` and do not create `node_modules`.
- Use `gh` for GitHub operations.
- Use `agent-browser` with `http://localhost:8000/` for browser verification when needed.

## Deno Task Execution

- You may run `deno task` commands without asking for separate approval.
- Common safe tasks are `deno task check`, `deno task lint`, `deno task test`, `deno task dev`, `deno task start`, `deno task pg`, `deno task pv`, `deno task pmD`, `deno task pmd`, `deno task pms`, `deno task pmr`, and `deno task ps`.
- Treat `deno.json` as the source of truth if task names change.

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
- Shared types and helpers belong under `lib/`.
- Template rendering is server-side via Handlebars in `lib/handlebars.ts` and `templates/`.

## Validation And Parsing

- Prefer schema validation with Zod and `zod-form-data` where the project already uses it.
- Reject invalid input early in routes.
- Keep user-facing validation text consistent with the existing German UI tone.
- New user-facing UI text should be German for both student and admin flows.
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

## Documentation Maintenance

- Keep durable guidance in `docs/ai/` instead of growing `AGENTS.md` again.
- Update `HANDOFF.md` when pausing with unfinished work.
- Update the relevant doc in `docs/ai/` whenever repository conventions or architecture meaningfully change.
