import { test, expect } from '@playwright/test';

test.describe('App Interaction Flow', () => {
    test.beforeEach(async () => {
        // Higher default timeout for E2E interactions in CI
        test.setTimeout(60000);
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
        await expect(newPage).toHaveURL(/status\.example\.com/, { timeout: 20000 });
    });

    test('should allow launching an authenticated app after login', async ({ page, context }: { page: any; context: any }) => {
        // Login first
        await page.goto('/auth/signin', { waitUntil: 'networkidle' });
        await page.fill('input[name="email"]', 'admin@techhub.local');
        await page.fill('input[name="password"]', process.env.ADMIN_PASSWORD || 'test-admin-password-123');
        await page.click('button[type="submit"]');

        // Wait for login to complete
        await page.waitForURL((url: URL) => !url.pathname.includes('/auth/signin'), { timeout: 30000 });

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
    });
});
