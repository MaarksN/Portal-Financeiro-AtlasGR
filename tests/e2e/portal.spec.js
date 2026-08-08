const { expect, test } = require('@playwright/test');

test('portal financeiro abre', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
});
