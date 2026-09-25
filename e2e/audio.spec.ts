import { test, expect, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import YAML from 'yaml';

const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
/** A question's ask and choices, as one key (some questions share an ask, e.g. "What does this sign mean?"). */
const key = (ask: string | null, choices: (string | null)[]) => [ask, ...choices].map(norm).join(' | ');
/** Every lesson question's key → the index of its right answer. */
const ANSWERS = new Map(
  readdirSync('content/lessons').flatMap((f) =>
    (YAML.parse(readFileSync(`content/lessons/${f}`, 'utf8')).questions as { ask: string; choices: string[]; answer: number }[])
      .map((q) => [key(q.ask, q.choices), q.answer] as const)),
);

/** Records every clip that starts playing, in order. */
const hook = () => {
  (window as any).plays = [];
  (window as any).ended = [];
  const op = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (!(this as any).hooked) {
      (this as any).hooked = true;
      this.addEventListener('ended', () => (window as any).ended.push(this.src.split('/').pop()));
    }
    (window as any).plays.push(this.src.split('/').pop());
    return op.call(this);
  };
};
const plays = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).plays.slice());
/** Clips that played to their end, in order. */
const ended = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).ended.slice());

const toFirstQuestion = async (page: Page) => {
  await page.getByRole('button', { name: /Yield/ }).click();
  for (let i = 0; i < 3; i++) {
    const next = page.getByRole('button', { name: /Next/ });
    await expect(next).toBeEnabled({ timeout: 30_000 });
    await next.click();
  }
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('home focuses the main button', async ({ page }) => {
  await expect(page.getByRole('button', { name: /Keep going/ })).toBeFocused();
});

test('question and answer choices are spoken, not just the numbers', async ({ page }) => {
  await toFirstQuestion(page);
  // Each clip must play to its end, in order (a missing file errors instead of ending).
  const want = ['q-yield-q1.mp3', 'phrase-num-1.mp3', 'q-yield-q1-c0.mp3'];
  await expect.poll(async () => {
    const e = await ended(page);
    const at = e.indexOf('q-yield-q1.mp3');
    return at < 0 ? [] : e.slice(at, at + 3);
  }, { timeout: 30_000 }).toEqual(want);
  const p = await plays(page);
  const at = p.indexOf('q-yield-q1.mp3');
  expect(p.slice(at, at + 3)).toEqual(want);
});

test('question 🔊 is locked during the replay, then works again', async ({ page }) => {
  await toFirstQuestion(page);
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
  // Pick a wrong choice for every question, so the test is failed and a review is offered.
  const review = page.getByRole('button', { name: /missed/ });
  for (let k = 0; k < 20; k++) {
    const q = key(await page.locator('.ask-row .caption').textContent(), await page.locator('.tile .choice-text').allTextContents());
    const answer = ANSWERS.get(q);
    expect(answer, `no lesson question matches "${q}"`).toBeDefined();
    await page.locator('.tile').nth(answer === 0 ? 1 : 0).click();
    await expect(page.locator('.tile.picked')).toHaveCount(0);
  }
  // Note how many clips had started at the moment of the tap, inside the page (no race with the test runner).
  await review.evaluate((b) => b.addEventListener('click', () => { (window as any).atTap = (window as any).plays.length; }, { capture: true }));
  await review.click();
  await page.waitForTimeout(4000);
  const before = await page.evaluate(() => (window as any).atTap as number);
  const after = (await plays(page)).slice(before);
  expect(after[0]).toBe('phrase-review-missed.mp3');
  expect(after).not.toContain('phrase-not-yet.mp3');
});
