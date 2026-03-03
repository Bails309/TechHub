import { test, expect } from '@playwright/test';

test.describe('App Interaction Flow', () => {
    test('should allow launching a public app without login', async ({ page, context }: { page: any; context: any }) => {
        // Navigate to portal
        await page.goto('/');

        // Find a public app (e.g. "Status Page" from seeds)
        const appName = 'Status Page';
        const appLink = page.getByRole('link', { name: appName });

        // Verify app is visible
        await expect(appLink).toBeVisible();

        // Click the app link and wait for the new tab (popup)
        const pagePromise = context.waitForEvent('page');
        await appLink.click();
        const newPage = await pagePromise;

        // Verify the new page URL
        await expect(newPage).toHaveURL(/status\.example\.com/);
    });

    test('should allow launching an authenticated app after login', async ({ page, context }: { page: any; context: any }) => {
        // Login first
        await page.goto('/auth/signin');
        await page.fill('input[name="email"]', 'admin@techhub.local');
        await page.fill('input[name="password"]', process.env.ADMIN_PASSWORD || 'test-admin-password-123');
        await page.click('button[type="submit"]');

        // Wait for login to complete
        await page.waitForURL((url: URL) => !url.pathname.includes('/auth/signin'));
        await expect(page.getByRole('link', { name: /Admin/i })).toBeVisible();

        // Navigate to root/portal if not already there
        await page.goto('/');

        // Find an authenticated app (e.g. "GitHub Enterprise" from seeds)
        const appName = 'GitHub Enterprise';
        const appLink = page.getByRole('link', { name: appName });

        await expect(appLink).toBeVisible();

        // Click and wait for new tab
        const pagePromise = context.waitForEvent('page');
        await appLink.click();
        const newPage = await pagePromise;

        // Verify redirection
        await expect(newPage).toHaveURL(/github\.com/);
    });
});
