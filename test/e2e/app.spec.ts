import { test, expect } from '@playwright/test';

test.describe('App Interaction Flow', () => {
    test.beforeEach(async ({ context }: { context: any }) => {
        // Higher default timeout for E2E interactions in CI
        test.setTimeout(60000);

        // Mock external domains to prevent DNS errors in CI
        await context.route('**/*.example.com/**', (route: any) => route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: '<html><body><h1>Mock External Page</h1></body></html>'
        }));

        await context.route('**/github.com/**', (route: any) => route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: '<html><body><h1>Mock GitHub Page</h1></body></html>'
        }));
    });

    test('should allow launching a public app without login', async ({ page, context }: { page: any; context: any }) => {
        // Navigate to portal
        await page.goto('/', { waitUntil: 'networkidle' });

        // Find a public app (e.g. "Status Page" from seeds)
        const appName = 'Status Page';
        const appLink = page.getByRole('link', { name: appName });

        // Verify app is visible
        await expect(appLink).toBeVisible({ timeout: 15000 });

        // Click and handle potential "Launch Confirmation" page in the new tab
        const pagePromise = context.waitForEvent('page');
        await appLink.click();
        const newPage = await pagePromise;

        // Wait for potential redirect or confirmation page
        await newPage.waitForLoadState();

        // If we are on the launch confirmation page, click "Proceed"
        if (newPage.url().includes('/launch-confirm/')) {
            console.log('Launch confirmation page detected, proceeding...');
            const proceedBtn = newPage.getByRole('link', { name: /Proceed/i });
            await expect(proceedBtn).toBeVisible({ timeout: 10000 });
            await proceedBtn.click();
        }

        // Verify the final page URL pattern
        // Note: With mocking, it might land on the mock page quickly
        await expect(newPage).toHaveURL(/status\.example\.com/, { timeout: 20000 });
        await expect(newPage.locator('h1')).toHaveText('Mock External Page', { timeout: 10000 });
    });

    test('should allow launching an authenticated app after login', async ({ page, context }: { page: any; context: any }) => {
        // Login first
        await page.goto('/auth/signin', { waitUntil: 'networkidle' });
        await page.fill('input[name="email"]', 'admin@techhub.local');
        await page.fill('input[name="password"]', process.env.ADMIN_PASSWORD || 'test-admin-password-123');
        await page.click('button[type="submit"]');

        // Wait for login to complete and stable state
        await page.waitForURL((url: URL) => !url.pathname.includes('/auth/signin'), { timeout: 30000 });
        await expect(page.getByRole('link', { name: /Admin/i })).toBeVisible({ timeout: 15000 });

        // Navigate to root/portal
        await page.goto('/', { waitUntil: 'networkidle' });

        // Find an authenticated app (e.g. "GitHub Enterprise" from seeds)
        const appName = 'GitHub Enterprise';
        const appLink = page.getByRole('link', { name: appName });

        await expect(appLink).toBeVisible({ timeout: 15000 });

        // Click and handle new tab
        const pagePromise = context.waitForEvent('page');
        await appLink.click();
        const newPage = await pagePromise;

        await newPage.waitForLoadState();

        // If we land on Launch Confirmation, click proceed
        if (newPage.url().includes('/launch-confirm/')) {
            console.log('Launch confirmation page detected, proceeding...');
            const proceedBtn = newPage.getByRole('link', { name: /Proceed/i });
            await expect(proceedBtn).toBeVisible({ timeout: 10000 });
            await proceedBtn.click();
        }

        // Verify final redirection
        await expect(newPage).toHaveURL(/github\.com/, { timeout: 20000 });
        await expect(newPage.locator('h1')).toHaveText('Mock GitHub Page', { timeout: 10000 });
    });
});
