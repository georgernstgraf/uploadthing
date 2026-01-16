# Headless Browser Service

This application now includes comprehensive headless browser automation capabilities using Puppeteer.

## Features

### Core Services
- **Browser Service** - Centralized browser management with singleton pattern
- **Screenshot Service** - Capture screenshots and element-specific images
- **Web Scraper Service** - Extract content from web pages
- **PDF Generation Service** - Convert HTML/URLs to PDF
- **Form Automation Service** - Fill and submit web forms

### API Endpoints

#### Browser Management
- `GET /browser/status` - Check browser health and status
- `POST /browser/initialize` - Initialize browser instance
- `POST /browser/close` - Close browser instance

#### Screenshot Endpoints
- `POST /browser/screenshot` - Capture page screenshot
- `POST /browser/screenshot/multiple` - Capture multiple screenshots

#### Web Scraping Endpoints
- `POST /browser/scrape` - Scrape single page
- `POST /browser/scrape/multiple` - Scrape multiple pages
- `POST /browser/scrape/links` - Extract links from page

#### PDF Generation Endpoints
- `POST /browser/pdf` - Generate PDF from URL
- `POST /browser/pdf/from-html` - Generate PDF from HTML content

#### Form Automation Endpoints
- `POST /browser/form/automate` - Fill and submit forms
- `POST /browser/form/multistep` - Handle multi-step forms
- `POST /browser/form/validate` - Validate form fields

## Environment Configuration

```bash
# Browser Configuration
BROWSER_HEADLESS=true          # Run browser in headless mode
BROWSER_VIEWPORT_WIDTH=1920    # Browser viewport width
BROWSER_VIEWPORT_HEIGHT=1080   # Browser viewport height
BROWSER_TIMEOUT=30000          # Request timeout in milliseconds
BROWSER_CACHE_DIR=./browser_cache # Browser cache directory
BROWSER_USER_AGENT=""           # Custom user agent string
BROWSER_SLOW_MO=0              # Slow down operations (ms)
```

## Initial Setup

First time usage requires Chrome download (one-time setup):

```bash
# Method 1: Automatic installation (recommended)
npx puppeteer browsers install chrome

# Method 2: Through your application (first run will auto-install)
deno task dev
# Then make a request to browser API which will trigger Chrome install

# After Chrome is installed, normal operation works
```

### Configuration Options

You can customize browser behavior with environment variables:

```bash
# Browser Configuration
BROWSER_HEADLESS=true          # Run browser in headless mode
BROWSER_VIEWPORT_WIDTH=1920    # Browser viewport width
BROWSER_VIEWPORT_HEIGHT=1080   # Browser viewport height
BROWSER_TIMEOUT=30000          # Request timeout in milliseconds
BROWSER_CACHE_DIR=./browser_cache # Browser cache directory
BROWSER_USER_AGENT=""           # Custom user agent string
BROWSER_SLOW_MO=0              # Slow down operations (ms)
```

## Usage Examples

### Take a Screenshot
```bash
curl -X POST http://localhost:8000/browser/screenshot \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "options": {
      "fullPage": true,
      "format": "png"
    }
  }' \
  --output screenshot.png
```

### Scrape Web Content
```bash
curl -X POST http://localhost:8000/browser/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "options": {
      "selectors": {
        "title": "h1",
        "description": "p"
      }
    }
  }'
```

### Generate PDF
```bash
curl -X POST http://localhost:8000/browser/pdf \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "options": {
      "format": "A4",
      "printBackground": true
    }
  }' \
  --output document.pdf
```

### Form Automation
```bash
curl -X POST http://localhost:8000/browser/form/automate \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/form",
    "options": {
      "fields": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "submit": true
    }
  }'
```

## Testing

Run the test script to verify all services:

```bash
deno run -A --env-file browser_test.ts
```

## Security Considerations

- Browser runs with sandboxing disabled for compatibility
- All browser operations are logged
- Automatic cleanup on process exit
- Resource limits and timeouts enforced
- Input validation on all endpoints

## Performance

- Singleton browser instance management
- Connection pooling and reuse
- Configurable timeouts and caching
- Parallel operation support where applicable