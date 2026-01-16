// Browser service configuration and management
export interface BrowserConfig {
    headless: boolean;
    viewport: {
        width: number;
        height: number;
    };
    timeout: number;
    cacheDir: string;
    userAgent?: string;
    slowMo?: number;
}

export const defaultBrowserConfig: BrowserConfig = {
    headless: Deno.env.get("BROWSER_HEADLESS") !== "false",
    viewport: {
        width: parseInt(Deno.env.get("BROWSER_VIEWPORT_WIDTH") || "1920"),
        height: parseInt(Deno.env.get("BROWSER_VIEWPORT_HEIGHT") || "1080"),
    },
    timeout: parseInt(Deno.env.get("BROWSER_TIMEOUT") || "30000"),
    cacheDir: Deno.env.get("BROWSER_CACHE_DIR") || "./browser_cache",
    userAgent: Deno.env.get("BROWSER_USER_AGENT"),
    slowMo: parseInt(Deno.env.get("BROWSER_SLOW_MO") || "0"),
};

export interface ScreenshotOptions {
    fullPage?: boolean;
    quality?: number;
    format?: "png" | "jpeg" | "webp";
    selector?: string;
    waitForSelector?: string;
}

export interface ScrapeOptions {
    waitUntil?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
    timeout?: number;
    selectors?: Record<string, string>;
    waitForSelector?: string;
}

export interface PDFOptions {
    format?: "A4" | "A3" | "A0" | "Letter";
    landscape?: boolean;
    printBackground?: boolean;
    margin?: {
        top?: string;
        bottom?: string;
        left?: string;
        right?: string;
    };
}

export interface FormField {
    name: string;
    value: string;
    type?: "input" | "textarea" | "select" | "checkbox" | "radio";
}

export interface FormAutomationOptions {
    fields: Record<string, string | FormField[]>;
    submit?: boolean;
    waitForSelector?: string;
    waitAfterSubmit?: number;
}