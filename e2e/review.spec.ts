import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';

const CH4 = YAML.parse(readFileSync('content/reader/ch04.yaml', 'utf8')) as { sections: { paragraphs: unknown[] }[] };
const PARAGRAPHS = CH4.sections.reduce((n, s) => n + s.paragraphs.length, 0);

test('Manual reader tab lists every paragraph beside its quote', async ({ page }) => {
  await page.goto('review.html#reader');
  await expect(page.getByRole('heading', { name: 'Chapter 4: Traffic Control' })).toBeVisible();
  await expect(page.locator('.reader-pane .row')).toHaveCount(PARAGRAPHS);
  await expect(page.locator('.lessons-pane')).toBeHidden();
  await expect(page.locator('.reader-pane .row').first().getByRole('link', { name: 'Manual page 29' })).toBeVisible();
  await page.getByRole('link', { name: 'Lessons' }).click();
  await expect(page.locator('.lessons-pane')).toBeVisible();
  await expect(page.locator('.reader-pane')).toBeHidden();
});
