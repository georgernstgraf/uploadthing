import puppeteer, { Browser, Page } from "puppeteer";
import { BrowserConfig, ScreenshotOptions, ScrapeOptions, PDFOptions, FormAutomationOptions, defaultBrowserConfig } from "../lib/browser_config.ts";

export class BrowserService {
    private browser: Browser | null = null;
    private config: BrowserConfig;
    private initialized = false;

    constructor(config?: Partial<BrowserConfig>) {
        this.config = { ...defaultBrowserConfig, ...config };
    }

    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            // Ensure cache directory exists
            await Deno.mkdir(this.config.cacheDir, { recursive: true });

            const launchOptions: any = {
                headless: this.config.headless ? "new" : false,
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-accelerated-2d-canvas",
                    "--no-first-run",
                    "--no-zygote",
                    "--disable-gpu",
                ],
                defaultViewport: {
                    width: this.config.viewport.width,
                    height: this.config.viewport.height,
                },
                timeout: this.config.timeout,
                userDataDir: this.config.cacheDir,
            };

            if (this.config.userAgent) {
                launchOptions.userAgent = this.config.userAgent;
            }

            if (this.config.slowMo && this.config.slowMo > 0) {
                launchOptions.slowMo = this.config.slowMo;
            }

            this.browser = await puppeteer.launch(launchOptions);
            this.initialized = true;

            console.log("Browser service initialized successfully");
        } catch (error) {
            console.error("Failed to initialize browser:", error);
            throw new Error(`Browser initialization failed: ${(error as Error).message}`);
        }
    }

    private async ensureBrowser(): Promise<Browser> {
        if (!this.initialized || !this.browser) {
            await this.initialize();
        }
        if (!this.browser) {
            throw new Error("Browser not available after initialization");
        }
        return this.browser;
    }

    async getPage(): Promise<Page> {
        const browser = await this.ensureBrowser();
        const page = await browser.newPage();

        // Set default timeout
        page.setDefaultTimeout(this.config.timeout);

        return page;
    }

    async closePage(page: Page): Promise<void> {
        try {
            await page.close();
        } catch (error) {
            console.warn("Error closing page:", error);
        }
    }

    async close(): Promise<void> {
        if (this.browser) {
            try {
                await this.browser.close();
                console.log("Browser service closed successfully");
            } catch (error) {
                console.warn("Error closing browser:", error);
            } finally {
                this.browser = null;
                this.initialized = false;
            }
        }
    }

    // Utility method to close page automatically
    async withPage<T>(callback: (page: Page) => Promise<T>): Promise<T> {
        const page = await this.getPage();
        try {
            return await callback(page);
        } finally {
            await this.closePage(page);
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            if (!this.browser && !this.initialized) {
                return false;
            }

            const pages = await this.browser?.pages() || [];
            return this.browser?.isConnected() || false;
        } catch (error) {
            console.warn("Browser health check failed:", error);
            return false;
        }
    }

    async getBrowserInfo(): Promise<any> {
        try {
            const browser = await this.ensureBrowser();
            const version = await browser.version();
            const userAgent = await browser.userAgent();
            
            return {
                initialized: this.initialized,
                connected: browser.isConnected(),
                version,
                userAgent,
                config: this.config,
            };
        } catch (error) {
            return {
                initialized: this.initialized,
                connected: false,
                error: (error as Error).message,
            };
        }
    }
}

// Singleton instance for the application
let browserServiceInstance: BrowserService | null = null;

export function getBrowserService(config?: Partial<BrowserConfig>): BrowserService {
    if (!browserServiceInstance) {
        browserServiceInstance = new BrowserService(config);
    }
    return browserServiceInstance;
}

// Cleanup on process exit
Deno.addSignalListener("SIGINT", async () => {
    if (browserServiceInstance) {
        await browserServiceInstance.close();
    }
    Deno.exit(0);
});

Deno.addSignalListener("SIGTERM", async () => {
    if (browserServiceInstance) {
        await browserServiceInstance.close();
    }
    Deno.exit(0);
});