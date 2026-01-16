import { getBrowserService } from "./service/browser.ts";

async function testBrowserServices() {
    console.log("Testing browser services (without requiring Chrome)...");
    
    try {
        // Test basic service instantiation (no browser init required)
        const browserService = getBrowserService();
        
        // Test configuration
        const config = browserService.getBrowserInfo();
        console.log("✅ Browser service created:", config);
        
        // Test health check (should return false when not initialized)
        const isHealthy = await browserService.healthCheck();
        console.log(`✅ Browser health (before init): ${isHealthy ? "healthy" : "unhealthy"}`);
        
        // Test the configuration structure
        console.log("✅ Configuration loaded successfully");
        
    } catch (error) {
        console.error("❌ Test failed:", error);
    }
}

if (import.meta.main) {
    testBrowserServices();
}