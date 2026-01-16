import { Page } from "puppeteer";
import { getBrowserService } from "./browser.ts";
import { FormAutomationOptions } from "../lib/browser_config.ts";

export interface FormResult {
    success: boolean;
    message: string;
    data?: any;
    screenshot?: Uint8Array;
    errors?: string[];
}

export class FormAutomationService {
    private browserService = getBrowserService();

    async automateForm(url: string, options: FormAutomationOptions): Promise<FormResult> {
        return await this.browserService.withPage(async (page: Page) => {
            try {
                await page.goto(url, { waitUntil: "networkidle2" });

                if (options.waitForSelector) {
                    await page.waitForSelector(options.waitForSelector);
                }

                // Fill form fields
                for (const [fieldName, fieldValue] of Object.entries(options.fields)) {
                    await this.fillFormField(page, fieldName, fieldValue as string | string[]);
                }

                // Take screenshot before submission (optional)
                let screenshot: Uint8Array | undefined;
                try {
                    screenshot = await page.screenshot() as Uint8Array;
                } catch (error) {
                    console.warn("Failed to capture pre-submission screenshot:", error);
                }

                // Submit form if requested
                if (options.submit) {
                    await this.submitForm(page);
                    
                    // Wait after submission
                    if (options.waitAfterSubmit && options.waitAfterSubmit > 0) {
                        await new Promise(resolve => setTimeout(resolve, options.waitAfterSubmit));
                    }
                }

                // Extract result data
                const resultData = await this.extractPageData(page);

                return {
                    success: true,
                    message: "Form automation completed successfully",
                    data: resultData,
                    screenshot,
                };
            } catch (error) {
                const errorMessage = (error as Error).message;
                return {
                    success: false,
                    message: `Form automation failed: ${errorMessage}`,
                    errors: [errorMessage],
                };
            }
        });
    }

    private async fillFormField(page: Page, fieldName: string, fieldValue: string | string[]): Promise<void> {
        try {
            if (Array.isArray(fieldValue)) {
                // Handle radio buttons or checkboxes
                for (const value of fieldValue) {
                    const selector = `input[name="${fieldName}"][value="${value}"]`;
                    await page.click(selector);
                }
            } else {
                // Handle regular input fields
                const inputSelector = `input[name="${fieldName}"], textarea[name="${fieldName}"], select[name="${fieldName}"]`;
                
                const element = await page.$(inputSelector);
                if (element) {
                    const tagName = await element.evaluate((el: any) => el.tagName.toLowerCase());
                    
                    if (tagName === 'select') {
                        await page.select(inputSelector, fieldValue);
                    } else {
                        await page.focus(inputSelector);
                        await page.keyboard.down('Control');
                        await page.keyboard.press('a');
                        await page.keyboard.up('Control');
                        await page.type(inputSelector, fieldValue);
                    }
                } else {
                    console.warn(`Field not found: ${fieldName}`);
                }
            }
        } catch (error) {
            console.error(`Failed to fill field ${fieldName}:`, error);
        }
    }

    private async submitForm(page: Page): Promise<void> {
        try {
            // Try to find and click submit button
            const submitSelectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button:contains("Submit")',
                'button:contains("Send")',
                'button:contains("Absenden")',
                '.submit-button',
                '#submit',
            ];

            let submitted = false;
            for (const selector of submitSelectors) {
                try {
                    const button = await page.$(selector);
                    if (button) {
                        await button.click();
                        submitted = true;
                        break;
                    }
                } catch (error) {
                    // Continue to next selector
                }
            }

            if (!submitted) {
                // Try form submission via JavaScript
                await page.evaluate(() => {
                    // @ts-ignore - DOM types in browser context
                    const forms = document.querySelectorAll('form');
                    if (forms.length > 0) {
                        forms[0].submit();
                    }
                });
            }
        } catch (error) {
            console.error("Failed to submit form:", error);
        }
    }

    private async extractPageData(page: Page): Promise<any> {
        try {
            return await page.evaluate(() => {
                // DOM types available in browser context
                // @ts-ignore
                const data: any = {};

                // Extract title
                // @ts-ignore
                data.title = document.title;

                // Extract main content
                // @ts-ignore
                const mainContent = document.querySelector('main, .content, #content, .main-content');
                // @ts-ignore
                data.content = mainContent ? mainContent.textContent : document.body.textContent;

                // Extract success/error messages
                // @ts-ignore
                const successMessages = document.querySelectorAll(
                    '.success, .alert-success, .message-success, [class*="success"]'
                );
                // @ts-ignore
                data.successMessages = Array.from(successMessages).map((el: any) => el.textContent);

                // @ts-ignore
                const errorMessages = document.querySelectorAll(
                    '.error, .alert-error, .message-error, [class*="error"]'
                );
                // @ts-ignore
                data.errorMessages = Array.from(errorMessages).map((el: any) => el.textContent);

                // Extract current URL
                // @ts-ignore
                data.url = window.location.href;

                return data;
            });
        } catch (error) {
            console.warn("Failed to extract page data:", error);
            return null;
        }
    }

    async fillMultiStepForm(url: string, steps: FormAutomationOptions[], options: { waitBetweenSteps?: number } = {}): Promise<FormResult[]> {
        const results: FormResult[] = [];
        const waitTime = options.waitBetweenSteps || 1000;

        return await this.browserService.withPage(async (page: Page) => {
            await page.goto(url, { waitUntil: "networkidle2" });

            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                
                try {
                    // Fill current step form
                    for (const [fieldName, fieldValue] of Object.entries(step.fields)) {
                        await this.fillFormField(page, fieldName, fieldValue as string | string[]);
                    }

                    // Take screenshot of step
                    let screenshot: Uint8Array | undefined;
                    try {
                        screenshot = await page.screenshot() as Uint8Array;
                    } catch (error) {
                        console.warn(`Failed to capture screenshot for step ${i + 1}:`, error);
                    }

                    // Submit if requested
                    if (step.submit) {
                        await this.submitForm(page);
                    }

                    // Extract step data
                    const resultData = await this.extractPageData(page);

                    results.push({
                        success: true,
                        message: `Step ${i + 1} completed`,
                        data: resultData,
                        screenshot,
                    });

                    // Wait between steps
                    if (i < steps.length - 1 && waitTime > 0) {
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    }
                } catch (error) {
                    results.push({
                        success: false,
                        message: `Step ${i + 1} failed: ${(error as Error).message}`,
                        errors: [(error as Error).message],
                    });
                    break; // Stop on first failure
                }
            }

            return results;
        });
    }

    async validateForm(url: string, validationRules: Record<string, string>): Promise<{
        valid: boolean;
        errors: string[];
        fields: Record<string, boolean>;
    }> {
        return await this.browserService.withPage(async (page: Page) => {
            await page.goto(url, { waitUntil: "networkidle2" });

            const results = await page.evaluate((validationRules: any) => {
                // @ts-ignore - DOM types in browser context
                const fields: Record<string, boolean> = {};
                const errors: string[] = [];

                for (const [fieldName, pattern] of Object.entries(validationRules)) {
                    // @ts-ignore - DOM types in browser context
                    const field = document.querySelector(`[name="${fieldName}"]`);
                    if (field) {
                        // @ts-ignore - DOM types in browser context
                        const value = (field as any).value || '';
                        const regex = new RegExp(pattern as string);
                        fields[fieldName] = regex.test(value);
                        
                        if (!regex.test(value)) {
                            errors.push(`Field ${fieldName} does not match pattern ${pattern}`);
                        }
                    } else {
                        errors.push(`Field ${fieldName} not found`);
                    }
                }

                return { fields, errors };
            }, validationRules);

            return {
                valid: (results as any).errors.length === 0,
                errors: (results as any).errors,
                fields: (results as any).fields,
            };
        });
    }
}

export const formAutomationService = new FormAutomationService();