import { Hono } from "hono";
import { getBrowserService } from "../service/browser.ts";
import { screenshotService } from "../service/screenshots.ts";
import { webScraperService, ScrapeResult } from "../service/webscraper.ts";
import { pdfService } from "../service/pdfgen.ts";
import { formAutomationService, FormResult } from "../service/formautomation.ts";

const router = new Hono();

// Browser status and health check
router.get("/status", async (c) => {
    try {
        const browserInfo = await getBrowserService().getBrowserInfo();
        const healthCheck = await getBrowserService().healthCheck();
        
        return c.json({
            status: "ok",
            healthy: healthCheck,
            browser: browserInfo,
        });
    } catch (error) {
        return c.json({
            status: "error",
            message: (error as Error).message,
        }, 500);
    }
});

// Screenshot endpoints
router.post("/screenshot", async (c) => {
    try {
        const body = await c.req.json();
        const { url, options = {} } = body;

        if (!url) {
            return c.json({ error: "URL is required" }, 400);
        }

        const screenshot = await screenshotService.captureScreenshot(url, options);
        
        // Set appropriate content type
        const contentType = options.format === "jpeg" ? "image/jpeg" : "image/png";
        
        return new Response(screenshot as any, {
            headers: {
                "Content-Type": contentType,
                "Content-Disposition": `attachment; filename="screenshot-${Date.now()}.${options.format || "png"}"`,
            },
        });
    } catch (error) {
        return c.json({
            error: "Screenshot capture failed",
            message: (error as Error).message,
        }, 500);
    }
});

router.post("/screenshot/multiple", async (c) => {
    try {
        const body = await c.req.json();
        const { urls, options = {} } = body;

        if (!urls || !Array.isArray(urls)) {
            return c.json({ error: "URLs array is required" }, 400);
        }

        const screenshots = await screenshotService.captureMultipleScreenshots(urls, options);
        
        return c.json({
            success: true,
            count: screenshots.length,
            screenshots: screenshots.map((_, index) => `/browser/screenshot/download/${Date.now()}-${index}`),
        });
    } catch (error) {
        return c.json({
            error: "Multiple screenshots failed",
            message: (error as Error).message,
        }, 500);
    }
});

// Web scraping endpoints
router.post("/scrape", async (c) => {
    try {
        const body = await c.req.json();
        const { url, options = {} } = body;

        if (!url) {
            return c.json({ error: "URL is required" }, 400);
        }

        const result: ScrapeResult = await webScraperService.scrapePage(url, options);
        
        return c.json({
            success: true,
            result,
        });
    } catch (error) {
        return c.json({
            error: "Scraping failed",
            message: (error as Error).message,
        }, 500);
    }
});

router.post("/scrape/multiple", async (c) => {
    try {
        const body = await c.req.json();
        const { urls, options = {} } = body;

        if (!urls || !Array.isArray(urls)) {
            return c.json({ error: "URLs array is required" }, 400);
        }

        const results = await webScraperService.scrapeMultiplePages(urls, options);
        
        return c.json({
            success: true,
            count: results.length,
            results,
        });
    } catch (error) {
        return c.json({
            error: "Multiple scraping failed",
            message: (error as Error).message,
        }, 500);
    }
});

router.post("/scrape/links", async (c) => {
    try {
        const body = await c.req.json();
        const { url, linkSelector = "a[href]", options = {} } = body;

        if (!url) {
            return c.json({ error: "URL is required" }, 400);
        }

        const links = await webScraperService.scrapeLinks(url, linkSelector, options);
        
        return c.json({
            success: true,
            count: links.length,
            links,
        });
    } catch (error) {
        return c.json({
            error: "Link scraping failed",
            message: (error as Error).message,
        }, 500);
    }
});

// PDF generation endpoints
router.post("/pdf", async (c) => {
    try {
        const body = await c.req.json();
        const { url, options = {} } = body;

        if (!url) {
            return c.json({ error: "URL is required" }, 400);
        }

        const pdf = await pdfService.generatePDF(url, options);
        
        return new Response(pdf as any, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="document-${Date.now()}.pdf"`,
            },
        });
    } catch (error) {
        return c.json({
            error: "PDF generation failed",
            message: (error as Error).message,
        }, 500);
    }
});

router.post("/pdf/from-html", async (c) => {
    try {
        const body = await c.req.json();
        const { html, options = {} } = body;

        if (!html) {
            return c.json({ error: "HTML content is required" }, 400);
        }

        const pdf = await pdfService.generatePDFWithContent(html, options);
        
        return new Response(pdf as any, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="document-${Date.now()}.pdf"`,
            },
        });
    } catch (error) {
        return c.json({
            error: "PDF generation from HTML failed",
            message: (error as Error).message,
        }, 500);
    }
});

// Form automation endpoints
router.post("/form/automate", async (c) => {
    try {
        const body = await c.req.json();
        const { url, options } = body;

        if (!url || !options) {
            return c.json({ error: "URL and options are required" }, 400);
        }

        const result: FormResult = await formAutomationService.automateForm(url, options);
        
        return c.json(result);
    } catch (error) {
        return c.json({
            error: "Form automation failed",
            message: (error as Error).message,
        }, 500);
    }
});

router.post("/form/multistep", async (c) => {
    try {
        const body = await c.req.json();
        const { url, steps, options = {} } = body;

        if (!url || !steps || !Array.isArray(steps)) {
            return c.json({ error: "URL and steps array are required" }, 400);
        }

        const results = await formAutomationService.fillMultiStepForm(url, steps, options);
        
        return c.json({
            success: true,
            count: results.length,
            results,
        });
    } catch (error) {
        return c.json({
            error: "Multi-step form automation failed",
            message: (error as Error).message,
        }, 500);
    }
});

router.post("/form/validate", async (c) => {
    try {
        const body = await c.req.json();
        const { url, validationRules } = body;

        if (!url || !validationRules) {
            return c.json({ error: "URL and validation rules are required" }, 400);
        }

        const result = await formAutomationService.validateForm(url, validationRules);
        
        return c.json(result);
    } catch (error) {
        return c.json({
            error: "Form validation failed",
            message: (error as Error).message,
        }, 500);
    }
});

// Initialize browser endpoint
router.post("/initialize", async (c) => {
    try {
        await getBrowserService().initialize();
        
        return c.json({
            success: true,
            message: "Browser initialized successfully",
        });
    } catch (error) {
        return c.json({
            error: "Browser initialization failed",
            message: (error as Error).message,
        }, 500);
    }
});

// Close browser endpoint
router.post("/close", async (c) => {
    try {
        await getBrowserService().close();
        
        return c.json({
            success: true,
            message: "Browser closed successfully",
        });
    } catch (error) {
        return c.json({
            error: "Browser close failed",
            message: (error as Error).message,
        }, 500);
    }
});

export default router;