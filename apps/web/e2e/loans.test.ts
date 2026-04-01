import { test, expect } from '@playwright/test';

test.describe('Loan Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@prestamos.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/admin');
  });

  test('should navigate to loans page', async ({ page }) => {
    await page.goto('/admin/loans');
    await expect(page.locator('h1')).toContainText('Préstamos');
  });

  test('should navigate to create loan page', async ({ page }) => {
    await page.goto('/admin/loans/new');
    await expect(page.locator('h1')).toContainText('Nuevo Préstamo');
  });

  test('should show simulation when configuring loan', async ({ page }) => {
    await page.goto('/admin/loans/new');

    // Click simulate button
    await page.click('text=Simular');

    // Should show simulation results
    await expect(page.locator('text=Resultado')).toBeVisible();
  });

  test('should access dashboard metrics', async ({ page }) => {
    await page.goto('/admin');

    // Should show dashboard metrics
    await expect(page.locator('text=Total Préstamos')).toBeVisible();
    await expect(page.locator('text=Préstamos Activos')).toBeVisible();
  });
});

test.describe('Client View', () => {
  test('should allow client to view their profile', async ({ page }) => {
    // Login as client
    await page.goto('/login');
    await page.fill('input[type="email"]', 'cliente@prestamos.com');
    await page.fill('input[type="password"]', 'cliente123');
    await page.click('button[type="submit"]');

    // Should have access to system
    await expect(page).toHaveURL('/admin');
  });
});
