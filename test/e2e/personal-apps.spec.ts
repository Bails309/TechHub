import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'admin@techhub.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password-123';

test.describe('Personal Apps Management', () => {
    test.beforeEach(async ({ page }: { page: any }) => {
        test.setTimeout(90000);

        // Login
        await page.goto('/auth/signin', { waitUntil: 'load' });
        await page.fill('input[name="email"]', ADMIN_EMAIL);
        await page.fill('input[name="password"]', ADMIN_PASSWORD);
        await page.click('button[type="submit"]');

        // Wait for authenticated state
        await page.waitForURL((url: URL) => !url.pathname.includes('/auth/signin'), {
            timeout: 45000,
            waitUntil: 'networkidle'
        });

        // Confirm we're logged in by verifying the sidebar has loaded
        const profileLink = page.getByRole('link', { name: 'Profile', exact: true });
        await expect(profileLink).toBeVisible({ timeout: 20000 });
        await page.waitForLoadState('networkidle');
    });

    test('should create, display, and delete a personal app', async ({ page }: { page: any }) => {
        const appName = `E2E Test App ${Date.now()}`;
        const appUrl = 'https://e2e-test.example.com';
        const appDesc = 'Created by E2E test';

        // ── Navigate to Profile ──
        await page.goto('/profile', { waitUntil: 'networkidle' });

        // Verify the "My Apps" section is visible
        await expect(page.getByText('My Apps')).toBeVisible({ timeout: 15000 });

        // ── Create a personal app ──
        await page.click('button:has-text("Add App")');

        // Fill the form
        await page.fill('#pa-name', appName);
        await page.fill('#pa-url', appUrl);
        await page.fill('#pa-desc', appDesc);

        // Submit
        await page.click('button:has-text("Create App")');

        // Verify the app appears in the list (page revalidates)
        await expect(page.getByText(appName)).toBeVisible({ timeout: 15000 });

        // Verify success feedback toast appears
        await expect(page.getByText('App created successfully')).toBeVisible({ timeout: 5000 });

        // ── Verify app appears on the Portal dashboard ──
        await page.goto('/', { waitUntil: 'networkidle' });
        await expect(page.getByText(appName)).toBeVisible({ timeout: 15000 });

        // ── Navigate back to Profile and delete the app ──
        await page.goto('/profile', { waitUntil: 'networkidle' });
        await expect(page.getByText(appName)).toBeVisible({ timeout: 15000 });

        // Use a more specific selector: target only app list items (not the parent section)
        // App rows use .card-panel.!p-0 while the section uses .card-panel.p-8
        const appRow = page.locator('.card-panel.group', { hasText: appName });
        await appRow.hover();
        await appRow.getByTitle('Delete').click();

        // Confirm inline delete
        const confirmBar = page.locator('.bg-rose-500\\/10', { hasText: appName });
        await expect(confirmBar).toBeVisible({ timeout: 5000 });
        await confirmBar.getByRole('button', { name: 'Delete' }).click();

        // Verify the app is removed
        await expect(page.getByText(appName)).not.toBeVisible({ timeout: 15000 });
    });

    test('should enforce URL scheme validation', async ({ page }: { page: any }) => {
        await page.goto('/profile', { waitUntil: 'networkidle' });

        // Open the create form
        await page.click('button:has-text("Add App")');

        // Try to create an app with a javascript: URL
        await page.fill('#pa-name', 'XSS Test');
        // Bypass type=url browser validation by changing input type temporarily
        await page.evaluate(() => {
            const urlInput = document.getElementById('pa-url') as HTMLInputElement;
            if (urlInput) {
                urlInput.type = 'text';
            }
        });
        await page.fill('#pa-url', 'javascript:alert(1)');
        await page.click('button:has-text("Create App")');

        // Server should reject with scheme error
        await expect(page.getByText(/URL must use http/i)).toBeVisible({ timeout: 10000 });
    });

    test('should allow editing a personal app', async ({ page }: { page: any }) => {
        const originalName = `Edit Test ${Date.now()}`;
        const updatedName = `Updated ${Date.now()}`;

        await page.goto('/profile', { waitUntil: 'networkidle' });

        // Create an app first
        await page.click('button:has-text("Add App")');
        await page.fill('#pa-name', originalName);
        await page.fill('#pa-url', 'https://original.example.com');
        await page.click('button:has-text("Create App")');
        await expect(page.getByText(originalName)).toBeVisible({ timeout: 15000 });

        // Edit the app — use specific selector for the app list item
        const appRow = page.locator('.card-panel.group', { hasText: originalName });
        await appRow.hover();
        await appRow.getByTitle('Edit').click();

        // Verify edit form opens
        await expect(page.getByText(`Editing: ${originalName}`)).toBeVisible({ timeout: 5000 });

        // Update the name
        await page.fill('#pa-edit-name', updatedName);
        await page.click('button:has-text("Save Changes")');

        // Verify the update
        await expect(page.getByText(updatedName)).toBeVisible({ timeout: 15000 });
        await expect(page.getByText('App updated successfully')).toBeVisible({ timeout: 5000 });

        // Cleanup: delete the app
        const updatedRow = page.locator('.card-panel.group', { hasText: updatedName });
        await updatedRow.hover();
        await updatedRow.getByTitle('Delete').click();
        const confirmBar = page.locator('.bg-rose-500\\/10', { hasText: updatedName });
        await confirmBar.getByRole('button', { name: 'Delete' }).click();
        await expect(page.getByText(updatedName)).not.toBeVisible({ timeout: 15000 });
    });
});
