import { existsSync } from 'node:fs';
import { readLessons, readPages } from './lib';
import { validateLessons } from '../src/content/validate';
import { audioLines } from '../src/content/audioLines';
import { sceneIndex } from '../src/scenes/registry';

const errors: string[] = [];
const lessons = readLessons(errors);
errors.push(...validateLessons(lessons, readPages(), sceneIndex()));
if (process.argv.includes('--audio')) {
  for (const line of audioLines(lessons))
    if (!existsSync(`public/audio/${line.id}.mp3`)) errors.push(`missing audio for ${line.id} (run: npm run audio)`);
}
const figures = lessons.flatMap((l) => [...l.cards, ...l.questions]).filter((x) => !x.source.quote).length;
const questions = lessons.reduce((n, l) => n + l.questions.length, 0);
const signs = lessons.reduce((n, l) => n + l.questions.filter((q) => q.signQuestion).length, 0);
if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`OK: ${lessons.length} lessons, ${questions} questions (${signs} sign questions), ${figures} picture-only sources for parent review`);
