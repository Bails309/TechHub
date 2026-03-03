import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'admin@techhub.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password-123';

test.describe('Admin Management Flow', () => {
    test.beforeEach(async ({ page }: { page: any }) => {
        // Increase timeout for the login process in CI
        test.setTimeout(60000);

        // Perform login once before each test in this block
        await page.goto('/auth/signin', { waitUntil: 'networkidle' });

        // Fill credentials
        await page.fill('input[name="email"]', ADMIN_EMAIL);
        await page.fill('input[name="password"]', ADMIN_PASSWORD);

        // Submit
        await page.click('button[type="submit"]');

        // Verification of successful login:
        // Wait for sign-in redirect to complete (should land on post-login or portal)
        await page.waitForURL((url: URL) => !url.pathname.includes('/auth/signin'), { timeout: 30000 });

        // Final sanity check for presence of Admin link
        const adminLink = page.getByRole('link', { name: /Admin/i });
        await expect(adminLink).toBeVisible({ timeout: 15000 });
    });

    test('should allow creating a new category', async ({ page }: { page: any }) => {
        // Navigate to Category Management
        await page.goto('/admin/category-mgmt', { waitUntil: 'networkidle' });

        const categoryName = `Test Category ${Date.now()}`;
        const categoryDesc = 'Automated test category description';

        // Fill out the form
        await page.fill('input[name="name"]', categoryName);
        await page.fill('textarea[name="description"]', categoryDesc);
        await page.fill('input[name="order"]', '99');

        // Submit the form
        await page.click('button[type="submit"]:has-text("Create Category")');

        // Verify the new category appears in the list
        await expect(page.getByText(categoryName)).toBeVisible({ timeout: 10000 });
    });
});
