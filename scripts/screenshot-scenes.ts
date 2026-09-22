import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { SCENES } from '../src/scenes/registry';

const only = process.argv.slice(2);
const ids = only.length ? only : Object.keys(SCENES);
const server = await createServer({ server: { port: 5199, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1250, height: 900 } });
mkdirSync('screenshots', { recursive: true });
try {
  for (const id of ids) {
    if (!SCENES[id]) { console.error(`unknown scene ${id}`); process.exitCode = 1; continue; }
    await page.goto(`http://localhost:5199/permit-study/scene-preview.html?scene=${id}`);
    await page.waitForSelector('.preview-cell svg');
    await page.screenshot({ path: `screenshots/${id}.png`, fullPage: true });
    console.log(`screenshots/${id}.png`);
  }
} finally {
  await browser.close();
  await server.close();
}
