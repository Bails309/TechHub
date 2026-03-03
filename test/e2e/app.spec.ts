import { test, expect } from '@playwright/test';

test.describe('App Interaction Flow', () => {
    test('should allow launching a public app without login', async ({ page }: { page: any }) => {
        // Navigate to portal
        await page.goto('/');

        // Find a public app (e.g. "Status Page" from seeds)
        const appName = 'Status Page';
        const appLink = page.getByRole('link', { name: appName });

        // Verify app is visible
        await expect(appLink).toBeVisible();

        // Click the app link
        // We expect it to redirect to the sample URL (https://status.example.com)
        // or to the launch confirmation if referer is somehow bypassed, 
        // but normally clicking from UI sets referer.
        await appLink.click();

        // Check if we reached the destination (or at least the URL redirected)
        // Note: Playwright might not be able to load external sites in CI, 
        // so we check the URL pattern.
        await expect(page).toHaveURL(/status\.example\.com/);
    });

    test('should allow launching an authenticated app after login', async ({ page }: { page: any }) => {
        // Login first
        await page.goto('/auth/signin');
        await page.fill('input[name="email"]', 'admin@techhub.local');
        await page.fill('input[name="password"]', process.env.ADMIN_PASSWORD || 'test-admin-password-123');
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL(/\//);

        // Find an authenticated app (e.g. "GitHub Enterprise" from seeds)
        const appName = 'GitHub Enterprise';
        const appLink = page.getByRole('link', { name: appName });

        await expect(appLink).toBeVisible();
        await appLink.click();

        // Verify redirection
        await expect(page).toHaveURL(/github\.com/);
    });
});
