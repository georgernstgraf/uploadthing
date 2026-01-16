import { Page } from "puppeteer";
import { getBrowserService } from "./browser.ts";
import { ScreenshotOptions } from "../lib/browser_config.ts";

export class ScreenshotService {
    private browserService = getBrowserService();

    async captureScreenshot(url: string, options: ScreenshotOptions = {}): Promise<Uint8Array> {
        return await this.browserService.withPage(async (page: Page) => {
            await page.goto(url, { waitUntil: "networkidle2" });

            if (options.waitForSelector) {
                await page.waitForSelector(options.waitForSelector);
            }

            let screenshotBuffer: Uint8Array;

            if (options.selector) {
                // Screenshot specific element
                const element = await page.$(options.selector);
                if (!element) {
                    throw new Error(`Element not found: ${options.selector}`);
                }
                screenshotBuffer = await element.screenshot({
                    type: options.format || "png",
                    quality: options.quality,
                }) as Uint8Array;
            } else {
                // Screenshot full page or viewport
                screenshotBuffer = await page.screenshot({
                    fullPage: options.fullPage || false,
                    type: options.format || "png",
                    quality: options.quality,
                }) as Uint8Array;
            }

            return screenshotBuffer;
        });
    }

    async captureElementScreenshot(url: string, selector: string, options: ScreenshotOptions = {}): Promise<Uint8Array> {
        return this.captureScreenshot(url, { ...options, selector });
    }

    async captureFullPageScreenshot(url: string, options: ScreenshotOptions = {}): Promise<Uint8Array> {
        return this.captureScreenshot(url, { ...options, fullPage: true });
    }

    async compareScreenshots(url1: string, url2: string, options: ScreenshotOptions = {}): Promise<{
        screenshot1: Uint8Array;
        screenshot2: Uint8Array;
        similarity?: number;
    }> {
        const [screenshot1, screenshot2] = await Promise.all([
            this.captureScreenshot(url1, options),
            this.captureScreenshot(url2, options),
        ]);

        // Basic similarity comparison (simplified)
        // In a real implementation, you might want to use image comparison libraries
        const similarity = this.calculateSimilarity(screenshot1, screenshot2);

        return {
            screenshot1,
            screenshot2,
            similarity,
        };
    }

    private calculateSimilarity(img1: Uint8Array, img2: Uint8Array): number {
        // Very basic similarity calculation
        // In production, you'd want to use proper image comparison
        if (img1.length !== img2.length) {
            return 0;
        }

        let differences = 0;
        for (let i = 0; i < img1.length; i++) {
            if (img1[i] !== img2[i]) {
                differences++;
            }
        }

        return Math.max(0, 100 - (differences / img1.length) * 100);
    }

    async captureMultipleScreenshots(urls: string[], options: ScreenshotOptions = {}): Promise<Uint8Array[]> {
        const screenshots = await Promise.allSettled(
            urls.map(url => this.captureScreenshot(url, options))
        );

        return screenshots
            .filter((result): result is PromiseFulfilledResult<Uint8Array> => result.status === "fulfilled")
            .map(result => result.value);
    }

    async captureScreenshotWithDelay(url: string, delayMs: number = 1000, options: ScreenshotOptions = {}): Promise<Uint8Array> {
        return await this.browserService.withPage(async (page: Page) => {
            await page.goto(url, { waitUntil: "networkidle2" });

            // Wait for additional content to load
            await new Promise(resolve => setTimeout(resolve, delayMs));

            if (options.waitForSelector) {
                await page.waitForSelector(options.waitForSelector);
            }

            return await page.screenshot({
                fullPage: options.fullPage || false,
                type: options.format || "png",
                quality: options.quality,
            }) as Uint8Array;
        });
    }
}

export const screenshotService = new ScreenshotService();