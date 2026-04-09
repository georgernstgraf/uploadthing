# Project Agent Guide

## Role

- Act as a senior developer.
- Prefer pragmatic, minimal, production-quality changes.
- Follow the repository's existing architecture and libraries instead of inventing parallel patterns.

## Working Style

- Execute the user's request directly.
- Keep responses concise and focused.
- Prefer the smallest correct change.
- Reuse existing libraries, helpers, and project patterns when they already solve the problem.
- Eliminate duplication when touching related code.

## Testing

- Tests are mandatory for code changes.
- Put tests next to the source file with the `_test.ts` suffix.
- A task is only complete when these succeed unless an external dependency prevents it:
  - `deno task check`
  - `deno task lint`
  - `deno task test`

## Knowledge Persistence

- Durable project knowledge belongs in `docs/ai/`.
- When persisting context, update the relevant `docs/ai/*.md` file directly.
- Use `docs/ai/HANDOFF.md` only for unfinished work, blockers, or explicit handoff notes.
- Do not create or use `memory/`, `.openclaw/`, `SOUL.md`, `USER.md`, `IDENTITY.md`, `HEARTBEAT.md`, or `TOOLS.md`.
- If a local `skills/` directory exists in this workspace, use only those project-local skills.

## Knowledge Bootstrap

Before starting work, read these files in order:

1. `docs/ai/HANDOFF.md`
2. `docs/ai/CONVENTIONS.md`
3. `docs/ai/DECISIONS.md`
4. `docs/ai/PITFALLS.md`
5. `docs/ai/STATE.md`
6. `docs/ai/DOMAIN.md` when the task involves business logic

If `docs/ai/HANDOFF.md` contains open tasks, finish them before new work unless the user says otherwise.
