# Project Agent Guide

## Scope

- This repository covers **both halves of the exam system**: the Deno
  web app (`lib/`, `routes/`, `service/`, `repo/`, `templates/`, …) and
  the OPNsense/FreeBSD appliance-side scripts under `appliance/`
  (imported from the archived `examsense` repo).
- Appliance scripts follow their own conventions — see
  `docs/ai/CONVENTIONS.md`, section "Appliance Scripts".

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
4. `docs/ai/ARCHITECTURE.md`
5. `docs/ai/PITFALLS.md`
6. `docs/ai/STATE.md`
7. `docs/ai/OPERATIONS.md` when the task touches deployment, network, DNS or certificates
8. `docs/ai/DOMAIN.md` when the task involves business logic
9. `docs/ai/HISTORY.md` only as reference (superseded entries)

If `docs/ai/HANDOFF.md` contains open tasks, finish them before new work unless the user says otherwise.
