import { test, expect, type Page } from '@playwright/test';

/** Records every clip that starts playing, in order. */
const hook = () => {
  (window as any).plays = [];
  const op = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { (window as any).plays.push(this.src.split('/').pop()); return op.call(this); };
};
const plays = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).plays.slice());

test.beforeEach(async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('home focuses the main button', async ({ page }) => {
  await expect(page.getByRole('button', { name: /Keep going/ })).toBeFocused();
});

test('question 🔊 is locked during the replay, then works again', async ({ page }) => {
  await page.getByRole('button', { name: /Yield/ }).click();
  for (let i = 0; i < 3; i++) {
    const next = page.getByRole('button', { name: /Next/ });
    await expect(next).toBeEnabled({ timeout: 30_000 });
    await next.click();
  }
  await page.locator('.tile', { hasText: 'The blue car' }).click();
  await expect(page.locator('.feedback')).toContainText('Not quite');
  const askSay = page.getByRole('button', { name: 'Hear the question' });
  await expect(askSay).toBeDisabled(); // tapping it would cut off "Not quite" and the replay
  await expect(askSay).toBeEnabled({ timeout: 30_000 });
  // Let the automatic re-reading finish, then tap: the question plays again.
  const reread = (await plays(page)).length;
  await expect.poll(async () => (await plays(page)).slice(reread), { timeout: 20_000 }).toContain('q-yield-q1-c1.mp3');
  const before = (await plays(page)).length;
  await askSay.click();
  await expect.poll(async () => (await plays(page)).slice(before)).toContain('q-yield-q1.mp3');
});

test('results verdict does not play over the review screen', async ({ page }) => {
  await page.getByRole('button', { name: /Practice test/ }).click();
  await page.getByRole('button', { name: /Start/ }).click();
  // Every yield question's first choice is wrong, so this fails the test and offers a review.
  for (let k = 0; k < 3; k++) {
    await page.locator('.tile').first().click();
    await expect(page.locator('.tile.picked')).toHaveCount(0);
  }
  const review = page.getByRole('button', { name: /missed/ });
  // Note how many clips had started at the moment of the tap, inside the page (no race with the test runner).
  await review.evaluate((b) => b.addEventListener('click', () => { (window as any).atTap = (window as any).plays.length; }, { capture: true }));
  await review.click();
  await page.waitForTimeout(4000);
  const before = await page.evaluate(() => (window as any).atTap as number);
  const after = (await plays(page)).slice(before);
  expect(after[0]).toBe('phrase-review-missed.mp3');
  expect(after).not.toContain('phrase-not-yet.mp3');
});
