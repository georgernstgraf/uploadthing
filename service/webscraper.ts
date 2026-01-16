import { Page } from "puppeteer";
import { getBrowserService } from "./browser.ts";
import { ScrapeOptions } from "../lib/browser_config.ts";

export interface ScrapeResult {
    url: string;
    title: string;
    content: string;
    metadata: {
        timestamp: string;
        loadTime: number;
        selectors: Record<string, string>;
    };
}

export class WebScraperService {
    private browserService = getBrowserService();

    async scrapePage(url: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
        const startTime = Date.now();

        return await this.browserService.withPage(async (page: Page) => {
            const waitUntil = options.waitUntil || "networkidle2";
            const timeout = options.timeout || 30000;

            await page.goto(url, { waitUntil, timeout });

            if (options.waitForSelector) {
                await page.waitForSelector(options.waitForSelector);
            }

            const title = await page.title();
            
            // Extract content based on selectors
            const extractedData: Record<string, string> = {};
            if (options.selectors) {
                for (const [key, selector] of Object.entries(options.selectors)) {
                    try {
                        const element = await page.$(selector);
                        if (element) {
                        const text = await element.getProperty('textContent').then((prop: any) => prop.jsonValue());
                        extractedData[key] = text || "";
                        }
                    } catch (error) {
                        console.warn(`Failed to extract ${key} using selector ${selector}:`, error);
                        extractedData[key] = "";
                    }
                }
            }

            // Get full page content if no specific selectors
            const content = options.selectors && Object.keys(options.selectors).length > 0
                ? JSON.stringify(extractedData, null, 2)
                : await page.evaluate(() => {
                    // @ts-ignore - DOM types in browser context
                    return document.body.innerText;
                });

            const loadTime = Date.now() - startTime;

            return {
                url,
                title,
                content,
                metadata: {
                    timestamp: new Date().toISOString(),
                    loadTime,
                    selectors: extractedData,
                },
            };
        });
    }

    async scrapeMultiplePages(urls: string[], options: ScrapeOptions = {}): Promise<ScrapeResult[]> {
        const results = await Promise.allSettled(
            urls.map(url => this.scrapePage(url, options))
        );

        return results
            .filter((result): result is PromiseFulfilledResult<ScrapeResult> => result.status === "fulfilled")
            .map(result => result.value);
    }

    async scrapeWithPagination(url: string, nextPageSelector: string, maxPages: number = 10, options: ScrapeOptions = {}): Promise<ScrapeResult[]> {
        const results: ScrapeResult[] = [];
        let currentPage = 1;

        return await this.browserService.withPage(async (page: Page) => {
            let currentUrl = url;

            while (currentPage <= maxPages) {
                const waitUntil = options.waitUntil || "networkidle2";
                const timeout = options.timeout || 30000;

                await page.goto(currentUrl, { waitUntil, timeout });

                if (options.waitForSelector) {
                    await page.waitForSelector(options.waitForSelector);
                }

                const title = await page.title();
                
                const extractedData: Record<string, string> = {};
                if (options.selectors) {
                    for (const [key, selector] of Object.entries(options.selectors)) {
                        try {
                            const element = await page.$(selector);
                            if (element) {
                                const text = await element.getProperty('textContent').then((prop: any) => prop.jsonValue());
                                extractedData[key] = text || "";
                            }
                        } catch (error) {
                            console.warn(`Failed to extract ${key} on page ${currentPage}:`, error);
                            extractedData[key] = "";
                        }
                    }
                }

                const content = options.selectors && Object.keys(options.selectors).length > 0
                    ? JSON.stringify(extractedData, null, 2)
                    : await page.evaluate(() => {
                        // @ts-ignore - DOM types in browser context
                        return document.body.innerText;
                    });

                const result: ScrapeResult = {
                    url: currentUrl,
                    title,
                    content,
                    metadata: {
                        timestamp: new Date().toISOString(),
                        loadTime: 0, // Not tracking per page in pagination mode
                        selectors: extractedData,
                    },
                };

                results.push(result);

                // Check if next page exists
                try {
                    const nextButton = await page.$(nextPageSelector);
                    if (!nextButton) {
                        break;
                    }

                    const nextUrl = await page.evaluate((selector: string) => {
                        // @ts-ignore - DOM types in browser context
                        const element = document.querySelector(selector) as any;
                        return element?.href;
                    }, nextPageSelector);

                    if (!nextUrl) {
                        break;
                    }

                    currentUrl = nextUrl;
                    currentPage++;
                } catch (error) {
                    console.warn(`Failed to navigate to next page from ${currentUrl}:`, error);
                    break;
                }
            }

            return results;
        });
    }

    async scrapeLinks(url: string, linkSelector: string = "a[href]", options: ScrapeOptions = {}): Promise<string[]> {
        return await this.browserService.withPage(async (page: Page) => {
            const waitUntil = options.waitUntil || "networkidle2";
            const timeout = options.timeout || 30000;

            await page.goto(url, { waitUntil, timeout });

            if (options.waitForSelector) {
                await page.waitForSelector(options.waitForSelector);
            }

            const links = await page.evaluate((selector: string) => {
                // @ts-ignore - DOM types in browser context
                const elements = document.querySelectorAll(selector);
                return Array.from(elements).map((element: any) => element.href);
            }, linkSelector);

            return links;
        });
    }

    async scrapeWithRetry(url: string, options: ScrapeOptions = {}, retries: number = 3): Promise<ScrapeResult> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await this.scrapePage(url, options);
            } catch (error) {
                lastError = error as Error;
                console.warn(`Scraping attempt ${attempt} failed for ${url}:`, error);
                
                if (attempt < retries) {
                    // Exponential backoff
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError || new Error(`Failed to scrape ${url} after ${retries} attempts`);
    }
}

export const webScraperService = new WebScraperService();