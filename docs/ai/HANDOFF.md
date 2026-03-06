# HANDOFF

Read this file first. If it lists open tasks, finish them before starting unrelated work unless the user explicitly says otherwise.

## Current Status

- `AGENTS.md` points agents to `docs/ai/` for durable repository knowledge.
- Task completion requires `deno task check`, `deno task lint`, and `deno task test`.

## Open Tasks

- None currently.

## Working Rules For Resume

- Re-read `AGENTS.md`, then this file, then the remaining `docs/ai/*.md` files in bootstrap order.
- Record durable discoveries in the relevant `docs/ai/` file before finishing.
- If work stops mid-task, replace `Open Tasks` with a concrete checklist, blockers, and any commands not yet run.

## Validation Before Finish

Run these commands unless a hard blocker prevents them:

```bash
deno task check
deno task lint
deno task test
```

If any command is skipped, record the reason here before handing off.
