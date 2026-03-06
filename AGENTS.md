# AGENTS.md - Repository Guidelines for Coding Agents

This document is the entry point for AI agents working in this repository.

## Knowledge Bootstrap

Before starting any task, read the following files in order:

1. `docs/ai/HANDOFF.md` - read first and act on it
2. `docs/ai/CONVENTIONS.md`
3. `docs/ai/DECISIONS.md`
4. `docs/ai/PITFALLS.md`
5. `docs/ai/STATE.md`
6. `docs/ai/DOMAIN.md` (if the task touches business logic or exam workflows)

If the user says "continue", "resume", or "finish where we left off", read and act on `docs/ai/HANDOFF.md` immediately. If it lists open tasks, finish them before starting unrelated work unless the user explicitly says otherwise.

## Project Snapshot

- Runtime: Deno with TypeScript
- Framework: Hono
- Frontend: Handlebars templates + Bootstrap 5 + HTMX
- Database: SQLite with Prisma-generated client plus direct SQLite access
- Architecture: middleware -> routes -> service -> repo -> database

## Core Commands

```bash
deno task dev        # Development server with file watching
deno task start      # Production-style local start
deno task check      # Type checking
deno task lint       # Linting
deno task test       # Automated test suite
deno task fullcheck  # check + lint + test
```

## Database Commands

```bash
deno task pg         # Generate Prisma client
deno task pv         # Validate Prisma schema
deno task pmD        # Deploy migrations
deno task pmd        # Create and run migrations (dev)
deno task pms        # Migration status
deno task pmr        # Reset database
deno task ps         # Prisma Studio
```

## Completion Criteria

- Automated testing is mandatory before a task is considered complete.
- Before finishing, run `deno task check`, `deno task lint`, and `deno task test`.
- Do not report success if any of those commands fail.
- If a required validation step is blocked by missing environment, external services, or another hard dependency, stop and report the blocker explicitly.

## Repository Constraints

- Do not use `npm` commands in this repository.
- Do not create a `node_modules` directory.
- Use `gh` for GitHub operations.
- Use `agent-browser` against `http://localhost:8000/` for browser-based verification when needed.

## Documentation Layout

Long-lived project knowledge lives in `docs/ai/`:

- `docs/ai/HANDOFF.md` - current handoff status and immediate next actions
- `docs/ai/CONVENTIONS.md` - coding, testing, and workflow conventions
- `docs/ai/DECISIONS.md` - architectural decisions and rationale
- `docs/ai/PITFALLS.md` - common mistakes and sharp edges
- `docs/ai/STATE.md` - current implementation and operational state
- `docs/ai/DOMAIN.md` - business and exam-domain context

`docs/ai/` is the canonical location for agent knowledge in this repository. Keep this file focused on bootstrap and completion rules, and do not duplicate the same guidance under tool-specific folders.
