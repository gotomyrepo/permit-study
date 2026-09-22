import { test, expect, type Page } from '@playwright/test';

const CARD1 = 'This is a yield sign';
const CARD2 = 'When you see a yield sign, slow down';

const hook = () => {
  (window as any).plays = [];
  const op = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { (window as any).plays.push(this.src.split('/').pop()); return op.call(this); };
};
const plays = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).plays.slice());
const caption = (page: Page) => page.locator('.caption').first();
const next = (page: Page) => page.getByRole('button', { name: /Next/ });
const back = (page: Page) => page.getByRole('button', { name: /Back/ });
const nextCard = async (page: Page) => { await expect(next(page)).toBeEnabled({ timeout: 30_000 }); await next(page).click(); };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /Yield/ }).click();
  await expect(caption(page)).toContainText(CARD1);
});

test('resume: tile, Keep going and a reload all return to the saved card', async ({ page }) => {
  await expect(back(page)).toHaveCount(0);
  await nextCard(page);
  await expect(caption(page)).toContainText(CARD2);
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: /Yield/ }).click();
  await expect(caption(page)).toContainText(CARD2);
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: /Keep going/ }).click();
  await expect(caption(page)).toContainText(CARD2);
  await page.reload();
  await page.getByRole('button', { name: /Yield/ }).click();
  await expect(caption(page)).toContainText(CARD2);
});

test('Back stops the current card and replays the previous one', async ({ page }) => {
  await nextCard(page);
  await expect(caption(page)).toContainText(CARD2);
  await expect.poll(() => plays(page)).toContain('card-yield-2.mp3');
  const before = (await plays(page)).length;
  await back(page).click(); // while card 2 is still playing
  await expect(caption(page)).toContainText(CARD1);
  await expect(next(page)).toBeDisabled();
  await expect(back(page)).toHaveCount(0);
  await expect(next(page)).toBeEnabled({ timeout: 30_000 });
  await expect(next(page)).toBeFocused();
  expect((await plays(page)).slice(before)).toEqual(['card-yield-1.mp3']);
});

test('Start over jumps to card 1 and clears the saved place', async ({ page }) => {
  await nextCard(page);
  await expect(caption(page)).toContainText(CARD2);
  await page.getByRole('button', { name: /Start over/ }).click();
  await expect(caption(page)).toContainText(CARD1);
  await expect(back(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: /Yield/ }).click();
  await expect(caption(page)).toContainText(CARD1);
});
