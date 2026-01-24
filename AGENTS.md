# AGENTS.md - Repository Guidelines for Coding Agents

This document provides essential guidelines for coding agents working in this repository.

## Project Overview

- **Runtime**: Deno with TypeScript
- **Framework**: Hono web framework
- **Database**: SQLite with Prisma 6 ORM
- **Frontend**: Handlebars templates + Bootstrap 5 + HTMX
- **Architecture**: Layered (middleware → routes → service → repo → database)

## Build & Development Commands

### Core Commands

```bash
deno task dev          # Development server with file watching and env file
deno task start        # Production server with env file
deno task check        # TypeScript checking across all modules
```

### Testing Commands

```bash
deno task test         # Run integration tests (main_test.ts)
deno task testdb       # Database-specific tests (main_test_db.ts)
```

### Database Commands (Prisma)

```bash
deno task pg           # Generate Prisma client
deno task pv           # Validate Prisma schema
deno task pd           # Deploy migrations
deno task pmd          # Create and run migrations (dev)
deno task pms          # Migration status
deno task pmr          # Reset database
deno task ps           # Open Prisma Studio
```

### Tool calls

- **github**: use the `gh` command, it is authorized.
- **browser**: use the `agent-browser` command on `http://localhost:8000/` to test the application. Run `agent-browser -h` for comprehensive usage instructions.
- **forensic page testing**: To view a good amount of forensic items, use start date December 1, 2025.

## Code Style Guidelines

### Formatting

- **Indentation**: 4 spaces (configured in deno.json; use also for .hbs, .html, and .css files)
- **Line endings**: LF
- **File extensions**: Always include `.ts` for imports
- **Language**: Mixed German (comments/variables) and English (functions/types)

### Import Organization

```typescript
// External dependencies first
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

// Local lib imports
import { UserType, Variables } from "../lib/types.ts";
import { localDateString } from "../lib/timefunc.ts";

// Service/feature imports
import * as service from "../service/service.ts";
import cf from "../lib/config.ts";
```

### Naming Conventions

- **Files**: lowercase with underscores (`remoteip.ts`, `timefunc.ts`)
- **Variables**: camelCase (`remote_user`, `remote_ip`)
- **Functions**: camelCase (`get_unterlagen`, `safeFileComponent`)
- **Types**: PascalCase with descriptive suffixes (`UserType`, `LdapUserType`)
- **Constants**: SCREAMING_SNAKE_CASE or camelCase based on scope

### Type Definitions

```typescript
// Use interfaces for complex objects
export type UserType = {
    ip?: string;
    name: string;
    email: string;
    klasse: string;
};

// Use generic Hono types for middleware
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
```

## Error Handling Patterns

### Standard Error Handling

```typescript
try {
    // Operation that might fail
    const result = await someOperation();
    return c.json(result);
} catch (e) {
    console.error("Operation failed:", e);
    return c.text((e as Error).message, 500);
} finally {
    // Cleanup operations
    await cleanup();
}
```

### Resource Management

- Always clean up resources in `finally` blocks
- Use `Deno.close()` for file handles
- Properly close database connections

## Database Patterns

### Prisma Usage

```typescript
// Use the generated client from lib/prismaclient/
import { PrismaClient } from "../lib/prismaclient/client.ts";

// Service layer: Business logic with local time
export async function getRecentActivity() {
    const now = new Date();
    const localTime = localDateTimeString(now);
    // Business logic here
}

// Repository layer: Direct database access
export async function findIPsInTimeRange(startTime: Date, endTime: Date) {
    return await prisma.ipfact.findMany({
        where: {
            timestamp: {
                gte: startTime,
                lte: endTime
            }
        }
    });
}
```

### Exam Data Retention

- The `user` table is wiped before each exam.
- For forensics on older exams, use the `registrations` table to map historical IPs to user data.

### Time Zone Handling

- **Service Layer**: Work with local time for user display
- **Repository Layer**: Store and query with UTC Date objects
- **Database**: Store UTC timestamps
- Use `lib/timefunc.ts` utilities for consistent formatting

## Architecture Patterns

### Technology Constraints

- Avoid calling npm by any means
- make sure no node_modules directory gets created

### Route Handler Structure

```typescript
router.get("/endpoint", (c) => {
    const remote_user = c.get("remoteuser");
    if (!remote_user) {
        return c.text("Unauthorized", 401);
    }

    // Extract and validate query parameters
    const param = c.req.query("param") || defaultValue;

    // Business logic through service layer
    const data = service.someMethod(param);

    // Template rendering
    return c.html(hbs.renderTemplate("template", { data }));
});
```

### Middleware Usage

```typescript
export const someMiddleware = createMiddleware(async (c, next) => {
    // Pre-processing
    c.set("variable", value);

    await next();

    // Post-processing if needed
});
```

## Testing Guidelines

### Current Testing Approach

- No formal testing framework (use direct script execution)
- Focus on integration testing over unit testing
- Test files: `main_test.ts`, `main_test_db.ts`
- Use environment files for test configuration

### Running Single Tests

```bash
# Run specific test scenarios
deno run -A --env-file main_test.ts
deno run -A --env-file main_test_db.ts
```

## Security Considerations

### Input Validation

```typescript
// Use safeFileComponent for path sanitization
import { safeFileComponent } from "../lib/utils.ts";

// IP-based authentication via middleware
const remoteuser = service.user.getbyip(remoteip);
if (!remoteuser) {
    return c.text("Unauthorized", 401);
}
```

### Environment Variables

- Use `Deno.env.get()` for configuration
- Never commit sensitive data to repository
- Use `.env` files for local development

## Language & Documentation

### Mixed Language Usage

- **Code**: English (functions, types, external libraries)
- **Comments**: German (business logic explanations)
- **Templates**: German (user-facing content)
- **Variable Names**: Often German domain-specific terms

### Comment Style

```typescript
// German comments for domain-specific logic
// Hier keine Template Types, bitte!
const start_ms_earlier = 3.6 * 1.5e6; // 1.5 Stunden zuvor
```

## Module Organization

### Directory Structure

```console
lib/           # Utilities, types, configuration
middleware/    # Hono middleware functions
routes/        # Route handlers
service/       # Business logic layer
repo/          # Data access layer
prisma/        # Database schema and migrations
static/        # Static assets (CSS, JS)
templates/     # Handlebars templates
```

### Module Re-exports

```typescript
// service/service.ts aggregates all services
export * from "./user.ts";
export * from "./ipfact.ts";
export * from "./history.ts";

// Use star imports for clean boundaries
import * as service from "../service/service.ts";
```

## Common Pitfalls to Avoid

1. **Forgetting .ts extensions** in import paths
2. **Mixing time zones** - always use lib/timefunc.ts utilities
3. **Missing cleanup** in async operations
4. **Hardcoding paths** - use safeFileComponent for file operations
5. **Ignoring middleware order** - auth/compression before routes
6. **Environment variables** - use Deno.env.get() for populating the config module

## Development Workflow

1. **Before coding**: Run `deno task check` to ensure type safety
2. **During development**: Use `deno task dev` with file watching
3. **After changes**:
   - Check with `deno task check` to ensure type safety
   - Lint with `deno task lint` to ensure code quality
   - Test with `deno task test` and `deno task testdb`
4. **Database changes**: Use Prisma commands (`pg`, `pmd`, `pd`)
5. **Before stopping**: Run full check, lint, and test suite
6. **handling git**: never commit or push unless asked to do so
7. **working on issues**: If work on an issue is completed, make a comment containing it.

> **IMPORTANT**: Linting must always succeed before the completion of any task. Run `deno task lint` and fix all issues before marking work as complete.

> **IMPORTANT**: Every commit message must include a reference to the GitHub issue it addresses (e.g., "issue #13"). If there is no existing issue for the task, ask the user to create one or provide the issue number.

## Special Notes

- **Prisma Client**: Custom output directory in `lib/prismaclient/`
- **Time Handling**: Critical distinction between service (local) and repo (UTC) layers
- **Authentication**: IP-based via middleware, no session management
- **Templates**: Handlebars with Bootstrap 5 and HTMX integration
- **File Upload**: Primary feature with security considerations
