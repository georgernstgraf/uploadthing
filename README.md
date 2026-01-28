# Uploadthing

Webserver on examdns-router

## Time Handling

This project uses the following conventions for time handling:

### 1. UI Layer (Local Time)
- All time-related inputs and displays in the UI are in **Local Time**.
- User input strings (e.g., from datetime-local or separate date/time inputs) are handled as local time strings.

### 2. Service Layer (Date Objects)
- As soon as time-related data enters the **Service Layer**, it must be converted into JavaScript `Date` objects.
- Business logic should primarily work with `Date` objects.
- When formatting for the UI, use utilities in `lib/timefunc.ts`.

### 3. Repository Layer (UTC/ISO Strings)
- The **Repository Layer** receives `Date` objects and is responsible for persisting them.
- SQLite does not have a native `DateTime` type; we store dates as **ISO 8601 strings in UTC** (e.g., `2023-01-01T12:00:00.000Z`).
- When saving to SQLite, always use `date.toISOString()`.
- When reading from SQLite, wrap the stored string in `new Date(row.at)` to return a proper `Date` object.
- Prisma handles `DateTime` fields automatically, ensuring they are mapped to/from `Date` objects correctly.

### 4. Utilities (`lib/timefunc.ts`)
- Use `localDateString`, `localTimeString`, and `localDateTimeString` for consistent local time formatting.
- `Date.toISOString()` is the standard for UTC representation.
