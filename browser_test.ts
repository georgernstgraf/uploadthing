import { getBrowserService } from "./service/browser.ts";
import { screenshotService } from "./service/screenshots.ts";
import { webScraperService } from "./service/webscraper.ts";
import { pdfService } from "./service/pdfgen.ts";
import { formAutomationService } from "./service/formautomation.ts";

async function testBrowserServices() {
    console.log("Testing browser services...");
    
    try {
        // Initialize browser
        await getBrowserService().initialize();
        console.log("✅ Browser initialized");
        
        // Test screenshot service
        console.log("Testing screenshot service...");
        const screenshot = await screenshotService.captureScreenshot("https://example.com", {
            fullPage: true,
            format: "png"
        });
        console.log(`✅ Screenshot captured: ${screenshot.length} bytes`);
        
        // Test web scraping
        console.log("Testing web scraper service...");
        const scrapeResult = await webScraperService.scrapePage("https://example.com", {
            selectors: {
                title: "h1",
                description: "p"
            }
        });
        console.log(`✅ Page scraped: ${scrapeResult.title}`);
        
        // Test PDF generation
        console.log("Testing PDF service...");
        const pdf = await pdfService.generatePDFWithContent("<html><body><h1>Test PDF</h1></body></html>", {
            format: "A4"
        });
        console.log(`✅ PDF generated: ${pdf.length} bytes`);
        
        // Test form automation (simplified example)
        console.log("Testing form automation service...");
        const formResult = await formAutomationService.validateForm("https://example.com", {
            test: ".*" // simple pattern
        });
        console.log(`✅ Form validation: ${formResult.valid}`);
        
        // Get browser info
        const browserInfo = await getBrowserService().getBrowserInfo();
        console.log(`✅ Browser info:`, browserInfo);
        
        // Health check
        const isHealthy = await getBrowserService().healthCheck();
        console.log(`✅ Browser health: ${isHealthy ? "healthy" : "unhealthy"}`);
        
        // Close browser
        await getBrowserService().close();
        console.log("✅ Browser closed");
        
    } catch (error) {
        console.error("❌ Test failed:", error);
    }
}

if (import.meta.main) {
    testBrowserServices();
}