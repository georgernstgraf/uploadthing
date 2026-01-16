---
description: Run deno tasks (check, lint, test, dev, etc.)
---

# Deno Task Execution

The user has granted permission to auto-run all `deno task` commands without asking for approval.

## Auto-Run Permission

// turbo-all

All `deno task` commands are safe to auto-run:

1. `deno task check` - TypeScript type checking
2. `deno task lint` - Code linting
3. `deno task test` - Run tests
4. `deno task dev` - Development server
5. `deno task start` - Production server
6. `deno task testdb` - Database tests
7. `deno task pg` - Generate Prisma client
8. `deno task pv` - Validate Prisma schema
9. `deno task pd` - Deploy migrations
10. `deno task pmd` - Create and run migrations (dev)
11. `deno task pms` - Migration status
12. `deno task pmr` - Reset database
13. `deno task ps` - Open Prisma Studio

## Usage

When executing any `deno task` command, set `SafeToAutoRun: true`.
