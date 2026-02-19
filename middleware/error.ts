import { Context } from "hono";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "../lib/errors.ts";
import { localTimeString } from "../lib/timefunc.ts";

export function errorHandler(err: Error, c: Context) {
    const timestamp = localTimeString();

    if (err instanceof AppError && err.isOperational && err.statusCode < 500) {
        console.error(`[${timestamp}] ${err.statusCode} ${c.req.path}: ${err.message}`);
    } else {
        console.error(`[${timestamp}] Error handling request to ${c.req.path}:`);
        console.error(err);
    }

    // Special handling for /activeips to ensure JSON format if it ever bubbles up here
    if (c.req.path === "/activeips") {
         return c.json({ "ok": "false", "message": err.message }, 400);
    }

    if (err instanceof AppError) {
        return c.text(err.message, err.statusCode as ContentfulStatusCode);
    }

    // Default to 500 for unknown errors and hide details in production
    // For now, we are simpler:
    return c.text("Ein unerwarteter Fehler ist aufgetreten.", 500);
}
