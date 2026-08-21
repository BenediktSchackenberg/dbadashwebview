import { expect, test, type Page } from '@playwright/test';

const authStatus = {
  localAuthEnabled: true,
  adEnabled: false,
  bootstrapRequired: false,
  supportedRoles: ['Admin', 'Operator', 'Viewer'],
};

async function mockShellApis(page: Page) {
  await page.route('**/api/instances', async (route) => {
    await route.fulfill({
      json: [
        {
          InstanceID: 7,
          InstanceDisplayName: 'sql-prod-01',
          Instance: 'sql-prod-01',
          Edition: 'Enterprise',
          ProductVersion: '16.0',
          cpu_count: 8,
          physical_memory_kb: 33554432,
        },
      ],
    });
  });

  await page.route('**/api/jobs/recent', async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route('**/api/tree', async (route) => {
    await route.fulfill({
      json: [
        {
          instanceId: 7,
          instanceName: 'sql-prod-01',
          productVersion: '16.0',
          productMajorVersion: 16,
          databases: [
            { databaseId: 1, name: 'master', isSystem: true },
            { databaseId: 42, name: 'sales', isSystem: false },
          ],
        },
      ],
    });
  });

  await page.route('**/api/dashboard/summary', async (route) => {
    await route.fulfill({
      json: [
        {
          InstanceID: 7,
          InstanceDisplayName: 'sql-prod-01',
          FullBackupStatus: 4,
          DriveStatus: 4,
          JobStatus: 4,
          AGStatus: 3,
          CorruptionStatus: 4,
          LastGoodCheckDBStatus: 4,
          LogBackupStatus: 4,
        },
      ],
    });
  });
}

test('signs in and loads the protected dashboard shell', async ({ page }) => {
  await page.route('**/api/auth/status', async (route) => {
    await route.fulfill({ json: authStatus });
  });

  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      json: {
        token: 'test-jwt',
        username: 'admin',
        displayName: 'Administrator',
        role: 'Admin',
        source: 'local',
      },
    });
  });

  await mockShellApis(page);

  await page.goto('/login');
  await page.getByPlaceholder('Enter username').fill('admin');
  await page.getByPlaceholder('Enter password').fill('dev-admin-change-me');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible();
  await expect(page.locator('text=Administrator')).toBeVisible();
});

test('redirects viewers away from admin settings routes', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('auth-session', JSON.stringify({
      token: 'viewer-jwt',
      username: 'viewer',
      displayName: 'Viewer User',
      role: 'Viewer',
      source: 'local',
    }));
  });

  await mockShellApis(page);

  await page.goto('/settings/users');

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible();
});

test('shows the installed application version on the About page', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('auth-session', JSON.stringify({
      token: 'admin-jwt',
      username: 'admin',
      displayName: 'Administrator',
      role: 'Admin',
      source: 'local',
    }));
  });

  await mockShellApis(page);
  await page.route('**/api/version', async (route) => {
    await route.fulfill({ json: { version: 'v0.2.6', source: 'version-file' } });
  });

  await page.goto('/about');

  await expect(page.getByRole('heading', { name: 'About DBA Dash WebView' })).toBeVisible();
  await expect(page.getByText('v0.2.6', { exact: true })).toBeVisible();
  await expect(page.getByText('Release package', { exact: true })).toBeVisible();
});
