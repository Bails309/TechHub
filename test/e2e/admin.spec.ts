import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'admin@techhub.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password-123';

test.describe('Admin Management Flow', () => {
    test.beforeEach(async ({ page }: { page: any }) => {
        // Increase timeout for the login process in CI
        test.setTimeout(90000);

        // Perform login once before each test in this block
        await page.goto('/auth/signin', { waitUntil: 'load' });

        // Fill credentials
        await page.fill('input[name="email"]', ADMIN_EMAIL);
        await page.fill('input[name="password"]', ADMIN_PASSWORD);

        // Submit
        await page.click('button[type="submit"]');

        // Verification of successful login:
        // 1. Wait for URL to leave sign-in page
        await page.waitForURL((url: URL) => !url.pathname.includes('/auth/signin'), {
            timeout: 45000,
            waitUntil: 'networkidle'
        });

        // 2. Definitive check for authenticated state - wait for the portal to actually load
        // and for the "Admin" link to be INTERACTABLE.
        const adminLink = page.getByRole('link', { name: /Admin/i });
        await expect(adminLink).toBeVisible({ timeout: 20000 });

        // Ensure we are in a stable state before returning
        await page.waitForLoadState('networkidle');
    });

    test('should allow creating a new category', async ({ page }: { page: any }) => {
        // Navigate to Category Management from a stable base state (the portal)
        // Using 'load' instead of 'networkidle' here to avoid over-waiting if some small asset is slow
        await page.goto('/admin/category-mgmt', { waitUntil: 'load' });

        const categoryName = `Test Category ${Date.now()}`;
        const categoryDesc = 'Automated test category description';

        // Fill out the form
        await page.fill('input[name="name"]', categoryName);
        await page.fill('textarea[name="description"]', categoryDesc);
        await page.fill('input[name="order"]', '99');

        // Submit the form
        await page.click('button[type="submit"]:has-text("Create Category")');

        // Verify the new category appears in the list
        await expect(page.getByText(categoryName)).toBeVisible({ timeout: 15000 });
    });
});
