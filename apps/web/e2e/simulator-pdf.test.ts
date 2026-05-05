import { test, expect } from '@playwright/test';

test.describe('Simulator PDF Generation', () => {
  test('should show PDF button after simulation', async ({ page }) => {
    await page.goto('/simulator');

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Simulador de Préstamos');

    // Click calculate button
    await page.click('button:has-text("Calcular")');

    // Wait for results to appear
    await expect(page.locator('text=Resultado')).toBeVisible();

    // PDF button should be visible
    const pdfButton = page.locator('button:has-text("Descargar PDF")');
    await expect(pdfButton).toBeVisible();
  });

  test('should be disabled without simulation', async ({ page }) => {
    await page.goto('/simulator');

    // PDF button should exist but be disabled
    const pdfButton = page.locator('button:has-text("Descargar PDF")');
    await expect(pdfButton).toBeVisible();
    await expect(pdfButton).toBeDisabled();
  });

  test('should trigger download on click', async ({ page }) => {
    await page.goto('/simulator');

    // Run a simulation
    await page.click('button:has-text("Calcular")');
    await expect(page.locator('text=Resultado')).toBeVisible();

    // Set up download listener
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 });

    // Click PDF button
    const pdfButton = page.locator('button:has-text("Descargar PDF")');
    await pdfButton.click();

    // Wait for download to start
    const download = await downloadPromise;

    // Verify filename
    expect(download.suggestedFilename()).toBe('simulacion-prestamo.pdf');
  });
});
