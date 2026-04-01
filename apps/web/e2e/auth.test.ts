import { test, expect } from '@playwright/test';

const TEST_USER = {
  email: `test-${Date.now()}@example.com`,
  password: 'test123456',
  firstName: 'Test',
  lastName: 'User',
};

test.describe('Authentication', () => {
  test.afterEach(async ({ page }) => {
    // Clean up - logout if logged in
    await page.goto('/');
  });

  test('should register a new user', async ({ page }) => {
    await page.goto('/register');

    // Fill registration form
    await page.fill('input[name="firstName"]', TEST_USER.firstName);
    await page.fill('input[name="lastName"]', TEST_USER.lastName);
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.fill('input[name="confirmPassword"]', TEST_USER.password);

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to admin dashboard
    await expect(page).toHaveURL('/admin');
  });

  test('should login with existing credentials', async ({ page }) => {
    // First register
    await page.goto('/register');
    await page.fill('input[name="firstName"]', TEST_USER.firstName);
    await page.fill('input[name="lastName"]', TEST_USER.lastName);
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.fill('input[name="confirmPassword"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/admin');

    // Logout
    await page.click('text=Cerrar sesión');
    await expect(page).toHaveURL('/');

    // Login again
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    // Should redirect to admin
    await expect(page).toHaveURL('/admin');
  });

  test('should show error with wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', 'wrong-password');
    await page.click('button[type="submit"]');

    // Should show error
    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });

  test('should navigate between login and register', async ({ page }) => {
    await page.goto('/login');
    await page.click('text=¿No tienes cuenta? Regístrate');
    await expect(page).toHaveURL('/register');

    await page.click('text=¿Ya tienes cuenta? Inicia sesión');
    await expect(page).toHaveURL('/login');
  });
});

test.describe('Protected Routes', () => {
  test('should redirect to login when accessing admin without auth', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL('/login');
  });

  test('should show dashboard when logged in', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@prestamos.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');

    // Should show dashboard
    await expect(page).toHaveURL('/admin');
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });
});
