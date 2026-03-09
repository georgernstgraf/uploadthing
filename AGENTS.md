# AGENTS.md - Repository Guidelines for Coding Agents

This file is the bootstrap entry point for AI agents working in this repository.

## Knowledge Bootstrap

Before starting any task, read the following files in order:

1. `docs/ai/HANDOFF.md` - read first and act on it
2. `docs/ai/CONVENTIONS.md`
3. `docs/ai/DECISIONS.md`
4. `docs/ai/PITFALLS.md`
5. `docs/ai/STATE.md`
6. `docs/ai/DOMAIN.md` (if the task touches business logic or exam workflows)

If the user says "continue", "resume", or "finish where we left off", read and act on `docs/ai/HANDOFF.md` immediately. If it lists open tasks, finish them before starting unrelated work unless the user explicitly says otherwise.

## Source Of Truth

- `docs/ai/` is the canonical location for durable project knowledge, conventions, decisions, pitfalls, and current state.
- Keep `AGENTS.md` focused on bootstrap only; add lasting project guidance to the appropriate file under `docs/ai/` instead of duplicating it here.
