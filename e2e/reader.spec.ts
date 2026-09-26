import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';

const CH4 = YAML.parse(readFileSync('content/reader/ch04.yaml', 'utf8')) as { sections: { id: string; title: string; paragraphs: { id: string; say: string }[] }[] };
const say = (sec: number, n: number) => CH4.sections[sec].paragraphs[n].say.replace(/\s+/g, ' ').trim();
const firstWords = (s: string) => s.split(' ').slice(0, 6).join(' ');

/** Records every clip that starts playing, and keeps the last media element for seeking. */
const hook = () => {
  (window as any).plays = [];
  const op = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    (window as any).media = this;
    (window as any).plays.push(this.src.split('/').pop()!.split('?')[0]); // drop the ?v=<hash> version query
    return op.call(this);
  };
};
const plays = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).plays.slice());
const where = (page: Page) => page.locator('.reader-where');
const caption = (page: Page) => page.locator('.reader-cap');
const listen = (page: Page) => page.getByRole('button', { name: /Listen to the manual/ });
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const playedSince = async (page: Page, clip: string, since: number) =>
  expect.poll(async () => (await plays(page)).slice(since), { timeout: 20_000 }).toContain(clip);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('Listen plays paragraph 1, Next advances, Home then Listen resumes there (also after a reload)', async ({ page }) => {
  await listen(page).click();
  await expect(where(page)).toHaveText('Chapter 4 · Signs');
  await expect(caption(page)).toContainText(firstWords(say(0, 0)));
  await playedSince(page, 'reader-ch04-signs-1.mp3', 0);
  await btn(page, 'Next').click();
  await expect(caption(page)).toContainText(firstWords(say(0, 1)));
  await playedSince(page, 'reader-ch04-signs-2.mp3', 0);
  await btn(page, 'Home').click();
  const before = (await plays(page)).length;
  await listen(page).click();
  await expect(caption(page)).toContainText(firstWords(say(0, 1)));
  await playedSince(page, 'reader-ch04-signs-2.mp3', before);
  await page.reload();
  await listen(page).click();
  await expect(caption(page)).toContainText(firstWords(say(0, 1)));
});

test('Back: previous paragraph within 2 seconds, else restart this one', async ({ page }) => {
  await listen(page).click();
  await btn(page, 'Next').click();
  await expect(caption(page)).toContainText(firstWords(say(0, 1)));
  await btn(page, 'Back').click();
  await expect(caption(page)).toContainText(firstWords(say(0, 0)));
  await btn(page, 'Next').click();
  await expect(caption(page)).toContainText(firstWords(say(0, 1)));
  await playedSince(page, 'reader-ch04-signs-2.mp3', 0);
  await page.waitForTimeout(3000);
  const before = (await plays(page)).length;
  await btn(page, 'Back').click();
  await expect(caption(page)).toContainText(firstWords(say(0, 1)));
  await playedSince(page, 'reader-ch04-signs-2.mp3', before);
});

test('Pause and Play continue the same clip', async ({ page }) => {
  await listen(page).click();
  await playedSince(page, 'reader-ch04-signs-1.mp3', 0);
  await btn(page, 'Pause').click();
  await expect(btn(page, 'Play')).toBeVisible();
  expect(await page.evaluate(() => (window as any).media.paused)).toBe(true);
  const before = (await plays(page)).length;
  await btn(page, 'Play').click();
  await expect(btn(page, 'Pause')).toBeVisible();
  expect((await plays(page)).slice(before)).toEqual(['reader-ch04-signs-1.mp3']);
  await expect(caption(page)).toContainText(firstWords(say(0, 0)));
});

test('a clip that ends starts the next paragraph', async ({ page }) => {
  await listen(page).click();
  await playedSince(page, 'reader-ch04-signs-1.mp3', 0);
  await expect.poll(() => page.evaluate(() => Number.isFinite((window as any).media.duration))).toBe(true);
  await page.evaluate(() => { const m = (window as any).media; m.currentTime = m.duration - 0.3; });
  await expect(caption(page)).toContainText(firstWords(say(0, 1)), { timeout: 10_000 });
  await playedSince(page, 'reader-ch04-signs-2.mp3', 0);
});

test('Chapters menu jumps to a section and plays', async ({ page }) => {
  await listen(page).click();
  await btn(page, 'Chapters').click();
  await page.getByRole('button', { name: 'Pavement Markings' }).click();
  await expect(where(page)).toHaveText('Chapter 4 · Pavement Markings');
  await playedSince(page, 'reader-ch04-markings-1.mp3', 0);
});

test('a clip that fails shows a note, does not advance, and Next still works', async ({ page }) => {
  await page.route(/\/audio\/reader\/reader-ch04-signs-1\.mp3(\?|$)/, (r) => r.abort()); // clips carry a ?v=<hash> query
  await listen(page).click();
  await expect(page.locator('.reader-note')).toBeVisible();
  await expect(page.locator('.reader-note')).toHaveText("Can't play this part right now");
  await page.waitForTimeout(3000);
  await expect(caption(page)).toContainText(firstWords(say(0, 0)));
  await btn(page, 'Next').click();
  await playedSince(page, 'reader-ch04-signs-2.mp3', 0);
});

test('the last paragraph leads to the finished card', async ({ page }) => {
  await listen(page).click();
  await btn(page, 'Chapters').click();
  await page.getByRole('button', { name: 'Traffic Officers' }).click();
  await btn(page, 'Next').click();
  await expect(caption(page)).toContainText(firstWords(say(3, 1)));
  await btn(page, 'Next').click();
  await expect(page.locator('.caption')).toHaveText('You finished the manual. Great job!');
  await page.getByRole('button', { name: /Start over/ }).click();
  await expect(caption(page)).toContainText(firstWords(say(0, 0)));
});

test('screenshots to look at', async ({ page }) => {
  for (const [name, size] of [['desktop', { width: 1250, height: 900 }], ['phone', { width: 360, height: 740 }]] as const) {
    await page.setViewportSize(size);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.screenshot({ path: `screenshots/reader-home-${name}.png`, fullPage: true });
    await listen(page).click();
    await expect(page.locator('.reader-title')).toBeVisible();
    await page.screenshot({ path: `screenshots/reader-title-${name}.png`, fullPage: true });
    // What she actually sees (Signs 1 is the longest paragraph): the controls must be on screen without scrolling.
    await page.screenshot({ path: `screenshots/reader-title-${name}-viewport.png` });
    const bar = await page.locator('.reader-bar').boundingBox();
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(size.height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await btn(page, 'Chapters').click();
    await page.screenshot({ path: `screenshots/reader-menu-${name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Traffic Signals' }).click();
    await expect(page.locator('.reader-pic img')).toHaveJSProperty('complete', true);
    await expect(page.locator('.reader-cap .w.hl')).toBeVisible({ timeout: 10_000 }); // a highlighted word in the shot
    await page.screenshot({ path: `screenshots/reader-picture-${name}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await btn(page, 'Home').click();
  }
});
