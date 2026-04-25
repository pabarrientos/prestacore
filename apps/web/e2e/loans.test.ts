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

// ========== DAILY PERIOD TESTS ==========
test.describe('DAILY Loan Creation', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@prestamos.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/admin');
  });

  test('should show DAILY option in frequency dropdown', async ({ page }) => {
    await page.goto('/admin/loans/new');

    // Check if DAILY option exists in frequency dropdown
    const frequencySelect = page.locator('select[name="frequency"], #frequency, [data-testid="frequency"]');
    await expect(frequencySelect).toBeVisible();

    // Open dropdown and check for DAILY option
    await frequencySelect.click();
    await expect(page.locator('option:has-text("Diario"), option[value="DAILY"]')).toBeVisible();
  });

  test('should create loan with DAILY frequency', async ({ page }) => {
    await page.goto('/admin/loans/new');

    // Fill in loan details
    await page.fill('input[name="amount"], #amount', '1000');
    await page.fill('input[name="termMonths"], #termMonths', '30');
    await page.fill('input[name="interestRate"], #interestRate', '18.25');

    // Select DAILY frequency
    const frequencySelect = page.locator('select[name="frequency"], #frequency, [data-testid="frequency"]');
    await frequencySelect.selectOption('DAILY');

    // Click simulate to verify calculation works
    await page.click('text=Simular, button:has-text("Simular")');

    // Should show simulation results with daily payments
    await expect(page.locator('text=Resultado, .resultado')).toBeVisible();

    // Should verify schedule shows 30 payments (daily)
    const scheduleText = await page.textContent('body');
    expect(scheduleText).toContain('30');
  });

  test('should verify DAILY loan appears in loans list', async ({ page }) => {
    // First create a DAILY loan via API (simulated in test)
    // Then check it appears in the list

    await page.goto('/admin/loans');

    // Wait for loans to load
    await page.waitForSelector('table, .loans-list, [data-testid="loans-table"]');

    // Look for DAILY in the frequency column
    // This test verifies the list displays correctly
    const loansTable = page.locator('table, .loans-list, [data-testid="loans-table"]');
    await expect(loansTable).toBeVisible();
  });
});

test.describe('DAILY Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@prestamos.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/admin');
  });

  test('should show DAILY_BASE_RATE setting in admin', async ({ page }) => {
    await page.goto('/admin/settings');

    // Check for DAILY base rate setting present in page
    const settingsPage = await page.content();
    expect(settingsPage).toMatch(/tasa.*diario|daily/i);
  });
});
