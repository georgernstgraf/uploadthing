import { Page } from "puppeteer";
import { getBrowserService } from "./browser.ts";
import { PDFOptions } from "../lib/browser_config.ts";

export class PDFService {
    private browserService = getBrowserService();

    async generatePDF(url: string, options: PDFOptions = {}): Promise<Uint8Array> {
        return await this.browserService.withPage(async (page: Page) => {
            await page.goto(url, { waitUntil: "networkidle2" });

            const pdfOptions: any = {
                format: options.format || "A4",
                landscape: options.landscape || false,
                printBackground: options.printBackground || true,
            };

            if (options.margin) {
                pdfOptions.margin = {
                    top: options.margin.top || "1cm",
                    bottom: options.margin.bottom || "1cm",
                    left: options.margin.left || "1cm",
                    right: options.margin.right || "1cm",
                };
            }

            return await page.pdf(pdfOptions) as Uint8Array;
        });
    }

    async generatePDFWithContent(htmlContent: string, options: PDFOptions = {}): Promise<Uint8Array> {
        return await this.browserService.withPage(async (page: Page) => {
            await page.setContent(htmlContent, { waitUntil: "networkidle2" });

            const pdfOptions: any = {
                format: options.format || "A4",
                landscape: options.landscape || false,
                printBackground: options.printBackground || true,
            };

            if (options.margin) {
                pdfOptions.margin = {
                    top: options.margin.top || "1cm",
                    bottom: options.margin.bottom || "1cm",
                    left: options.margin.left || "1cm",
                    right: options.margin.right || "1cm",
                };
            }

            return await page.pdf(pdfOptions) as Uint8Array;
        });
    }

    async generateMultiplePDFs(urls: string[], options: PDFOptions = {}): Promise<Uint8Array[]> {
        const pdfs = await Promise.allSettled(
            urls.map(url => this.generatePDF(url, options))
        );

        return pdfs
            .filter((result): result is PromiseFulfilledResult<Uint8Array> => result.status === "fulfilled")
            .map(result => result.value);
    }

    async generatePDFWithHeaderFooter(
        url: string, 
        headerHtml?: string, 
        footerHtml?: string, 
        options: PDFOptions = {}
    ): Promise<Uint8Array> {
        return await this.browserService.withPage(async (page: Page) => {
            await page.goto(url, { waitUntil: "networkidle2" });

            const pdfOptions: any = {
                format: options.format || "A4",
                landscape: options.landscape || false,
                printBackground: options.printBackground || true,
            };

            if (headerHtml) {
                pdfOptions.headerTemplate = headerHtml;
            }

            if (footerHtml) {
                pdfOptions.footerTemplate = footerHtml;
            }

            if (options.margin) {
                pdfOptions.margin = {
                    top: options.margin.top || "1cm",
                    bottom: options.margin.bottom || "1cm",
                    left: options.margin.left || "1cm",
                    right: options.margin.right || "1cm",
                };
            }

            return await page.pdf(pdfOptions) as Uint8Array;
        });
    }

    async generatePDFWithWatermark(
        url: string, 
        watermarkText: string, 
        options: PDFOptions = {}
    ): Promise<Uint8Array> {
        return await this.browserService.withPage(async (page: Page) => {
            await page.goto(url, { waitUntil: "networkidle2" });

            // Add watermark using page.evaluate
            await page.evaluate((text: string) => {
                // @ts-ignore - DOM types in browser context
                const watermark = document.createElement('div');
                watermark.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) rotate(-45deg);
                    font-size: 72px;
                    color: rgba(200, 200, 200, 0.5);
                    font-weight: bold;
                    z-index: 9999;
                    pointer-events: none;
                    user-select: none;
                `;
                watermark.textContent = text;
                // @ts-ignore - DOM types in browser context
                document.body.appendChild(watermark);
            }, watermarkText);

            const pdfOptions: any = {
                format: options.format || "A4",
                landscape: options.landscape || false,
                printBackground: options.printBackground || true,
            };

            if (options.margin) {
                pdfOptions.margin = {
                    top: options.margin.top || "1cm",
                    bottom: options.margin.bottom || "1cm",
                    left: options.margin.left || "1cm",
                    right: options.margin.right || "1cm",
                };
            }

            return await page.pdf(pdfOptions) as Uint8Array;
        });
    }
}

export const pdfService = new PDFService();