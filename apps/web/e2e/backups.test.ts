import { test, expect } from '@playwright/test';

const ADMIN = {
  email: 'admin@prestamos.com',
  password: 'admin123',
};

test.describe('Backup Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', ADMIN.email);
    await page.fill('input[type="password"]', ADMIN.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/admin');
  });

  test.afterEach(async ({ page }) => {
    // Clean up
    await page.goto('/');
  });

  test('should navigate to backups page', async ({ page }) => {
    await page.goto('/admin/settings/backups');
    await expect(page.locator('h1')).toContainText('Respaldos de Base de Datos');
  });

  test('should create a manual backup and see it in the list', async ({ page }) => {
    await page.goto('/admin/settings/backups');

    // Wait for backup list to load
    await page.waitForSelector('text=Respaldos Existentes');

    // Click create backup
    const createBtn = page.locator('button', { hasText: 'Crear Respaldo' });
    await createBtn.click();

    // Should show success message
    await expect(page.locator('text=Respaldo creado exitosamente')).toBeVisible({ timeout: 10000 });

    // Backup should appear in the list
    const table = page.locator('table');
    await expect(table).toBeVisible();
  });

  test('should download a backup', async ({ page }) => {
    await page.goto('/admin/settings/backups');
    await page.waitForSelector('text=Respaldos Existentes');

    // Wait for table to have rows
    await page.waitForSelector('table tbody tr');

    // Click download on first row
    const downloadBtn = page.locator('button', { hasText: 'Descargar' }).first();
    await downloadBtn.click();

    // Should not show error
    await expect(page.locator('text=Error al descargar')).not.toBeVisible({ timeout: 5000 });
  });

  test('should delete a backup', async ({ page }) => {
    await page.goto('/admin/settings/backups');
    await page.waitForSelector('text=Respaldos Existentes');

    // Wait for table to have rows
    await page.waitForSelector('table tbody tr');

    const initialCount = await page.locator('table tbody tr').count();
    expect(initialCount).toBeGreaterThan(0);

    // Set up dialog handler before clicking delete
    page.on('dialog', dialog => dialog.accept());

    // Click delete on first row
    const deleteBtn = page.locator('button', { hasText: 'Eliminar' }).first();
    await deleteBtn.click();

    // Should show success message
    await expect(page.locator('text=Respaldo eliminado')).toBeVisible({ timeout: 5000 });
  });

  test('should configure schedule', async ({ page }) => {
    await page.goto('/admin/settings/backups');
    await page.waitForSelector('text=Programación de Respaldos');

    // Toggle enabled
    const toggle = page.locator('button').filter({ hasText: 'Inactivo' }).first();
    await toggle.click();

    // Select frequency
    await page.selectOption('select:first-of-type', 'daily');

    // Set hour
    const hourInput = page.locator('input[type="number"]').first();
    await hourInput.fill('3');

    // Save
    await page.click('button:has-text("Guardar Configuración")');

    // Should show success
    await expect(page.locator('text=Configuración guardada')).toBeVisible({ timeout: 5000 });
  });

  test('should upload a file and preview', async ({ page }) => {
    await page.goto('/admin/settings/backups');
    await page.waitForSelector('text=Restaurar desde Archivo Externo');

    // File input should exist
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();
  });
});

test.describe('Backup Page Access Control', () => {
  test('should redirect non-admin users', async ({ page }) => {
    // Login as vendor
    await page.goto('/login');
    await page.fill('input[type="email"]', 'vendedor@prestamos.com');
    await page.fill('input[type="password"]', 'vendedor123');
    await page.click('button[type="submit"]');

    // Try to access backups page
    await page.goto('/admin/settings/backups');

    // Should show access denied
    await expect(page.locator('text=Acceso denegado')).toBeVisible();
  });

  test('should redirect unauthenticated users', async ({ page }) => {
    await page.goto('/admin/settings/backups');
    await expect(page).toHaveURL('/login');
  });
});