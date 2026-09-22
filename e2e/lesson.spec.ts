import { test, expect } from '@playwright/test';

test('yield lesson: cards unlock Next, wrong answer replays, right answer confirms', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /Yield/ }).click();
  await expect(page.getByRole('img', { name: /This is a yield sign/ })).toBeVisible();

  for (let i = 0; i < 3; i++) {
    const next = page.getByRole('button', { name: /Next/ });
    await expect(next).toBeDisabled();
    await expect(next).toBeEnabled({ timeout: 30_000 });
    await next.click();
  }

  await expect(page.locator('.ask-row .caption')).toContainText('Who goes first?');
  await page.locator('.tile', { hasText: 'The blue car' }).click();
  await expect(page.locator('.feedback')).toContainText('Not quite', { timeout: 10_000 });
  await expect(page.locator('.tile', { hasText: 'The blue car' })).toBeDisabled();
  await page.locator('.tile', { hasText: 'The red car' }).click({ timeout: 40_000 });
  await expect(page.locator('.feedback')).toContainText('Yes!');
});

test('home button leaves a lesson', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Yield/ }).click();
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByRole('button', { name: /Keep going/ })).toBeVisible();
});
