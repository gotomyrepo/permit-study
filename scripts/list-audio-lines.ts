import { writeFileSync } from 'node:fs';
import { readChapters, readLessons } from './lib';
import { audioLines } from '../src/content/audioLines';

const errors: string[] = [];
const lessons = readLessons(errors);
const chapters = readChapters(errors);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const lines = audioLines(lessons, chapters);
writeFileSync('content/audio-lines.json', JSON.stringify(lines, null, 1));
console.log(`${lines.length} audio lines`);
