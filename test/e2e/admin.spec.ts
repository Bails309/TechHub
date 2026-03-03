import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'admin@techhub.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password-123';

test.describe('Admin Management Flow', () => {
    test.beforeEach(async ({ page }) => {
        // Perform login once before each test in this block
        await page.goto('/auth/signin');

        // Fill credentials
        await page.fill('input[name="email"]', ADMIN_EMAIL);
        await page.fill('input[name="password"]', ADMIN_PASSWORD);

        // Submit
        await page.click('button[type="submit"]');

        // Wait for redirect to portal or dashboard
        await expect(page).toHaveURL(/\//);
    });

    test('should allow creating a new category', async ({ page }) => {
        // Navigate to Category Management
        await page.goto('/admin/category-mgmt');

        const categoryName = `Test Category ${Date.now()}`;
        const categoryDesc = 'Automated test category description';

        // Fill out the form
        await page.fill('input[name="name"]', categoryName);
        await page.fill('textarea[name="description"]', categoryDesc);
        await page.fill('input[name="order"]', '99');

        // Submit the form
        await page.click('button[type="submit"]:has-text("Create Category")');

        // Verify the new category appears in the list
        // CategoryList component renders categories in a list/table
        await expect(page.getByText(categoryName)).toBeVisible();
        await expect(page.getByText(categoryDesc)).toBeVisible();
    });
});
