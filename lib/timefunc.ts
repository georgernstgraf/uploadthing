import config from "./config.ts";

/**
 * Timezone for all display operations.
 * Vienna handles CET (UTC+1) and CEST (UTC+2) automatically.
 */
const DISPLAY_TIMEZONE = "Europe/Vienna";

/**
 * Temporal-based time formatting functions.
 * These replace the legacy Date-based functions and handle timezone correctly.
 */

// ============================================================================
// Temporal API Helpers
// ============================================================================

/**
 * Parse an ISO string (from database) to a Temporal.ZonedDateTime in Vienna timezone.
 * Input should be UTC ISO string like "2026-03-27T21:00:00.000Z"
 */
export function parseISOString(isoString: string): Temporal.ZonedDateTime {
    return Temporal.Instant.from(isoString).toZonedDateTimeISO(DISPLAY_TIMEZONE);
}

/**
 * Get current time as Temporal.ZonedDateTime in Vienna timezone.
 */
export function nowZoned(): Temporal.ZonedDateTime {
    return Temporal.Now.zonedDateTimeISO(DISPLAY_TIMEZONE);
}

/**
 * Convert a Temporal.ZonedDateTime to ISO string for database storage (UTC).
 */
export function toISOString(zoned: Temporal.ZonedDateTime | Temporal.Instant): string {
    if (zoned instanceof Temporal.Instant) {
        return zoned.toString();
    }
    return zoned.toInstant().toString();
}

// ============================================================================
// Display Formatting (Temporal-based)
// ============================================================================

/**
 * Format a time as HH:MM in Vienna timezone.
 * Accepts ISO string, Temporal.ZonedDateTime, or Temporal.Instant.
 */
export function timeString(input: string | Temporal.ZonedDateTime | Temporal.Instant | undefined): string {
    const zoned = input === undefined
        ? nowZoned()
        : typeof input === "string"
            ? parseISOString(input)
            : input instanceof Temporal.Instant
                ? input.toZonedDateTimeISO(DISPLAY_TIMEZONE)
                : input;

    const { hour, minute } = zoned;
    return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

/**
 * Format a date as YYYY-MM-DD in Vienna timezone.
 * Accepts ISO string, Temporal.ZonedDateTime, or Temporal.Instant.
 */
export function dateString(input: string | Temporal.ZonedDateTime | Temporal.Instant): string {
    const zoned = typeof input === "string"
        ? parseISOString(input)
        : input instanceof Temporal.Instant
            ? input.toZonedDateTimeISO(DISPLAY_TIMEZONE)
            : input;

    const { year, month, day } = zoned;
    return `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

/**
 * Format a datetime as YYYY-MM-DD HH:MM in Vienna timezone.
 * Accepts ISO string, Temporal.ZonedDateTime, or Temporal.Instant.
 */
export function dateTimeString(input: string | Temporal.ZonedDateTime | Temporal.Instant): string {
    const zoned = typeof input === "string"
        ? parseISOString(input)
        : input instanceof Temporal.Instant
            ? input.toZonedDateTimeISO(DISPLAY_TIMEZONE)
            : input;

    return `${dateString(zoned)} ${timeString(zoned)}`;
}

/**
 * Auto-format: time only if recent, otherwise full datetime.
 * Uses 15-hour cutoff by default for admin display.
 */
export function autoString(
    input: string | Temporal.ZonedDateTime | Temporal.Instant,
    cutoffHours: number = 15,
    nowZoned_: Temporal.ZonedDateTime = nowZoned(),
): string {
    const zoned = typeof input === "string"
        ? parseISOString(input)
        : input instanceof Temporal.Instant
            ? input.toZonedDateTimeISO(DISPLAY_TIMEZONE)
            : input;

    const cutoffEpochMs = zoned.toInstant().epochMilliseconds + cutoffHours * 3600 * 1000;

    if (cutoffEpochMs >= nowZoned_.toInstant().epochMilliseconds) {
        return timeString(zoned);
    } else {
        return dateTimeString(zoned);
    }
}

/**
 * Admin IP display: show time or datetime based on age.
 * Uses 15-hour cutoff for deciding between time-only and full datetime.
 */
export function adminIpString(
    input: string | Temporal.ZonedDateTime | Temporal.Instant,
    nowZoned_: Temporal.ZonedDateTime = nowZoned(),
): string {
    return autoString(input, 15, nowZoned_);
}

// ============================================================================
// Legacy Date-based Functions (deprecated, kept for backward compatibility)
// ============================================================================

export async function sleep_seconds(s: number) {
    await new Promise((resolve) => setTimeout(resolve, s * 1000));
}

/** @deprecated Use timeString() with Temporal instead */
export function localTimeString(date?: Date): string {
    const mydate = date ? date : new Date();
    return timeString(mydate.toISOString());
}

/** @deprecated Use dateTimeString() with Temporal instead */
export function localDateTimeString(date: Date): string {
    return dateTimeString(date.toISOString());
}

/** @deprecated Use dateString() with Temporal instead */
export function localDateString(date: Date): string {
    return dateString(date.toISOString());
}

/** @deprecated Use autoString() with Temporal instead */
export function localAutoString(
    date: Date,
    cutoffHours = config.TODAY_HOURS_CUTOFF,
    nowMs = Date.now(),
): string {
    const zoned = parseISOString(date.toISOString());
    const nowZoned_ = Temporal.Instant.fromEpochMilliseconds(nowMs).toZonedDateTimeISO(DISPLAY_TIMEZONE);
    return autoString(zoned, cutoffHours, nowZoned_);
}

/** @deprecated Use adminIpString() with Temporal instead */
export function localAdminIpString(date: Date, nowMs = Date.now()): string {
    return localAutoString(date, 15, nowMs);
}