import { createMiddleware } from "hono/factory";
import { getCookie, setCookie } from "hono/cookie";
import config, { isProduction } from "../lib/config.ts";
import type { Bindings, HonoContextVars, UserType } from "../lib/types.ts";
import * as service from "../service/service.ts";

export type SessionData = {
    email: string;
    createdAt: number;
};

async function hmacSign(data: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function hmacVerify(
    data: string,
    signature: string,
    secret: string,
): Promise<boolean> {
    const expected = await hmacSign(data, secret);
    if (signature.length !== expected.length) return false;
    let result = 0;
    for (let i = 0; i < signature.length; i++) {
        result |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return result === 0;
}

function encodeSessionData(data: SessionData): string {
    const json = JSON.stringify(data);
    return btoa(json);
}

function decodeSessionData(encoded: string): SessionData | null {
    try {
        const json = atob(encoded);
        return JSON.parse(json) as SessionData;
    } catch {
        return null;
    }
}

function signCookieValue(data: SessionData, signature: string): string {
    const encoded = encodeSessionData(data);
    return `${encoded}.${signature}`;
}

function parseSignedCookie(
    cookie: string,
): { data: SessionData; signature: string } | null {
    const parts = cookie.split(".");
    if (parts.length !== 2) return null;
    const data = decodeSessionData(parts[0]);
    if (!data) return null;
    return { data, signature: parts[1] };
}

export class Session {
    private data: SessionData | null = null;
    private modified = false;
    private isNew = false;
    private shouldDelete = false;

    constructor(data: SessionData | null, isNew: boolean) {
        this.data = data;
        this.isNew = isNew;
        if (isNew && data) {
            this.modified = true;
        }
    }

    get email(): string | undefined {
        return this.data?.email;
    }

    get createdAt(): number | undefined {
        return this.data?.createdAt;
    }

    setData(data: SessionData): void {
        this.data = data;
        this.modified = true;
    }

    login(email: string): void {
        this.data = {
            email,
            createdAt: Date.now(),
        };
        this.modified = true;
        this.isNew = true;
    }

    refreshTimestamp(): void {
        if (this.data) {
            this.data.createdAt = Date.now();
            this.modified = true;
        }
    }

    logout(): void {
        this.shouldDelete = true;
        this.data = null;
    }

    isModified(): boolean {
        return this.modified;
    }

    isNewSession(): boolean {
        return this.isNew;
    }

    needsDelete(): boolean {
        return this.shouldDelete;
    }

    getData(): SessionData | null {
        return this.data;
    }

    isLoggedIn(): boolean {
        return this.data !== null && !this.shouldDelete;
    }
}

export function getSession(c: { get: (key: string) => unknown }): Session {
    return c.get("session") as Session;
}

export const sessionMiddleware = createMiddleware<{ Variables: HonoContextVars }>(
    async (c, next) => {
        let sessionData: SessionData | null = null;

        const cookieValue = getCookie(c, config.COOKIE_NAME);
        if (cookieValue && config.COOKIE_SECRET) {
            const parsed = parseSignedCookie(cookieValue);
            if (parsed) {
                const encoded = encodeSessionData(parsed.data);
                const isValid = await hmacVerify(
                    encoded,
                    parsed.signature,
                    config.COOKIE_SECRET,
                );
                if (isValid) {
                    sessionData = parsed.data;
                }
            }
        }

        const isNew = sessionData === null;
        const session = new Session(sessionData, isNew);
        c.set("session", session);

        await next();

        if (session.needsDelete()) {
            setCookie(c, config.COOKIE_NAME, "", {
                path: "/",
                httpOnly: true,
                secure: isProduction,
                sameSite: "Strict",
                maxAge: 0,
            });
        } else if (session.isModified() && session.isLoggedIn()) {
            const data = session.getData()!;
            const encoded = encodeSessionData(data);
            const signature = await hmacSign(encoded, config.COOKIE_SECRET);
            setCookie(c, config.COOKIE_NAME, signCookieValue(data, signature), {
                path: "/",
                httpOnly: true,
                secure: isProduction,
                sameSite: "Strict",
                maxAge: config.COOKIE_MAX_AGE_S,
            });
        }
    },
);

export const remoteIPMiddleware = createMiddleware<
    { Bindings: Bindings; Variables: HonoContextVars }
>(async (c, next) => {
    const addr = c.env.info.remoteAddr;
    const remoteip = addr.transport === "tcp" || addr.transport === "udp"
        ? addr.hostname
        : "unix-socket";
    c.set("remoteip", remoteip);

        const session = getSession(c);
        let remoteuser: UserType | null = null;

        if (session.isLoggedIn() && session.email) {
            const user = await service.user.getUserByEmail(session.email);
            if (user) {
                remoteuser = user;

                const createdAt = session.createdAt;
                const now = Date.now();
                if (createdAt && now - createdAt > config.SESSION_REFRESH_THRESHOLD_MS) {
                    session.refreshTimestamp();
                }

                const existingReg = await service.registrations.getLatestIPForEmail(
                    session.email,
                );
                if (!existingReg || existingReg !== remoteip) {
                    await service.user.register(user, remoteip);
                }
            }
        }

        c.set("remoteuser", remoteuser);
        await next();
    },
);
