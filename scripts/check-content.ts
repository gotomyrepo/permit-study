import { existsSync } from 'node:fs';
import { readChapters, readFigures, readLessons, readPages, readPictureIds } from './lib';
import { validateLessons, validateReader } from '../src/content/validate';
import { audioLines, audioPath } from '../src/content/audioLines';
import { readerStats } from '../src/reader/playlist';
import { sceneIndex } from '../src/scenes/registry';

const errors: string[] = [];
const lessons = readLessons(errors);
const chapters = readChapters(errors);
const pages = readPages();
const pictures = readPictureIds();
errors.push(...validateLessons(lessons, pages, sceneIndex()));
const figures = readFigures(errors);
errors.push(...validateReader(chapters, pages, pictures, new Set(figures.map((f) => f.id)), lessons));
for (const f of figures) if (!pictures.has(f.id)) errors.push(`figure ${f.id} has no PNG (run: npm run figures)`);
if (process.argv.includes('--audio')) {
  for (const line of audioLines(lessons, chapters))
    if (!existsSync(`public/audio/${audioPath(line)}.mp3`)) errors.push(`missing audio for ${audioPath(line)} (run: npm run audio)`);
}
const pictureOnly = lessons.flatMap((l) => [...l.cards, ...l.questions]).filter((x) => !x.source.quote).length;
const questions = lessons.reduce((n, l) => n + l.questions.length, 0);
const signs = lessons.reduce((n, l) => n + l.questions.filter((q) => q.signQuestion).length, 0);
const r = readerStats(chapters);
const readerFigures = chapters.flatMap((c) => c.sections.flatMap((s) => s.paragraphs)).filter((p) => !p.source.quote).length;
if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`OK: ${lessons.length} lessons, ${questions} questions (${signs} sign questions), ${pictureOnly} picture-only sources for parent review`);
console.log(`Reader: ${r.chapters} chapters, ${r.sections} sections, ${r.paragraphs} paragraphs, ${r.words} words, about ${r.minutes} minutes of listening, ${readerFigures} picture-only sources`);
