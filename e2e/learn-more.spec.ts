import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';

const hook = () => {
  (window as any).plays = [];
  const op = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { (window as any).plays.push(this.src.split('/').pop()!.split('?')[0]); return op.call(this); }; // drop the ?v=<hash> version query
};
const plays = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).plays.slice());
const learnMore = (page: Page) => page.getByRole('button', { name: 'Learn more' });
const nextCard = async (page: Page) => {
  const next = page.getByRole('button', { name: /Next/ });
  await expect(next).toBeEnabled({ timeout: 30_000 });
  await next.click();
};
const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
const YIELD = YAML.parse(readFileSync('content/lessons/yield.yaml', 'utf8')) as { questions: { ask: string; choices: string[]; answer: number }[] };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('Learn more on a card opens the mapped section and keeps her card', async ({ page }) => {
  await page.getByRole('button', { name: /Yield/ }).click();
  await nextCard(page);
  await expect(page.locator('.caption').first()).toContainText('When you see a yield sign, slow down');
  await learnMore(page).click();
  await expect(page.locator('.reader-where')).toHaveText('Chapter 4 · Signs');
  await expect.poll(() => plays(page), { timeout: 20_000 }).toContain('reader-ch04-signs-1.mp3');
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: /Yield/ }).click();
  await expect(page.locator('.caption').first()).toContainText('When you see a yield sign, slow down');
});

test('Traffic lights opens Traffic Signals', async ({ page }) => {
  await page.getByRole('button', { name: /Traffic lights/ }).click();
  await learnMore(page).click();
  await expect(page.locator('.reader-where')).toHaveText('Chapter 4 · Traffic Signals');
});

test('no Learn more for a lesson without readerStart', async ({ page }) => {
  await page.getByRole('button', { name: /Parking$/ }).click(); // not "Parking signs"
  await expect(page.locator('.caption').first()).toBeVisible();
  await expect(learnMore(page)).toHaveCount(0);
});

test('the lesson-end screen offers Learn more', async ({ page }) => {
  await page.getByRole('button', { name: /Yield/ }).click();
  for (let k = 0; k < 3; k++) await nextCard(page);
  for (let k = 0; k < YIELD.questions.length; k++) {
    const ask = norm(await page.locator('.ask-row .caption').textContent());
    const q = YIELD.questions.find((x) => norm(x.ask) === ask)!;
    await page.locator('.tile').nth(q.answer).click();
    await expect(page.locator('.feedback.good')).toBeVisible();
    if (k < YIELD.questions.length - 1) await expect(page.locator('.ask-row .caption')).not.toHaveText(ask, { timeout: 20_000 });
  }
  await expect(page.getByRole('button', { name: /Home/ }).last()).toBeVisible({ timeout: 20_000 });
  await learnMore(page).click();
  await expect(page.locator('.reader-where')).toHaveText('Chapter 4 · Signs');
});

test('phone: Learn more shrinks to its icon and nothing scrolls sideways', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.getByRole('button', { name: /Yield/ }).click();
  await expect(learnMore(page)).toBeVisible();
  await expect(page.locator('.learn-more .lm-text')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('learn-more-phone.png'), fullPage: true });
});

test('double-tap Learn more opens the reader once, then Home returns Home (not the reader again)', async ({ page }) => {
  await page.getByRole('button', { name: /Yield/ }).click();
  const btn = learnMore(page);
  await btn.dblclick();
  await expect(page.locator('.reader-where')).toHaveText('Chapter 4 · Signs');
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.locator('.home-grid')).toBeVisible();
  await expect(page.locator('.reader-where')).toHaveCount(0);
});
