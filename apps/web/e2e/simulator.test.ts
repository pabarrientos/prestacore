import { test, expect } from '@playwright/test';

test.describe('Public Simulator', () => {
  test('should calculate loan correctly', async ({ page }) => {
    await page.goto('/simulator');

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Simulador de Préstamos');

    // Default values should be shown
    await expect(page.locator('text=$10,000')).toBeVisible();
    await expect(page.locator('text=15%')).toBeVisible();
    await expect(page.locator('text=12 meses')).toBeVisible();

    // Click calculate
    await page.click('button:has-text("Calcular")');

    // Results should appear
    await expect(page.locator('text=Resultado')).toBeVisible();
    
    // Check calculation: $10,000 at 15% for 12 months
    // Monthly payment ≈ $902.58
    // Total interest ≈ $830.96
    // Total payment ≈ $10,830.96
    await expect(page.locator('text=$902')).toBeVisible();
  });

  test('should update calculation when sliders change', async ({ page }) => {
    await page.goto('/simulator');

    // Change amount slider
    const amountSlider = page.locator('input[type="range"]').first();
    await amountSlider.fill('20000');
    await page.click('button:has-text("Calcular")');

    // New calculation should be different
    // $20,000 at 15% for 12 months ≈ $1,805/month
    await expect(page.locator('text=$1,805')).toBeVisible();
  });

  test('should have working link to registration', async ({ page }) => {
    await page.goto('/simulator');

    // Click "Solicitar este préstamo" link
    await page.click('text=Solicitar este préstamo');

    // Should navigate to register page
    await expect(page).toHaveURL('/register');
  });
});

test.describe('Landing Page', () => {
  test('should display main sections', async ({ page }) => {
    await page.goto('/');

    // Should show title
    await expect(page.locator('h1')).toContainText('Sistema de Préstamos');

    // Should show three feature cards
    await expect(page.locator('text=Simulador')).toBeVisible();
    await expect(page.locator('text=Solicita')).toBeVisible();
    await expect(page.locator('text=Gestiona')).toBeVisible();

    // Should show CTA buttons
    await expect(page.locator('text=Probar Simulador')).toBeVisible();
    await expect(page.locator('text=Iniciar Sesión')).toBeVisible();
  });

  test('should navigate to simulator', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Probar Simulador');
    await expect(page).toHaveURL('/simulator');
  });

  test('should navigate to login', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Iniciar Sesión');
    await expect(page).toHaveURL('/login');
  });
});
