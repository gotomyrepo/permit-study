import { readFileSync } from 'node:fs';

const sw = readFileSync('dist/sw.js', 'utf8');
const audio = sw.match(/url:"audio\/[^"]+"/g) ?? [];
const reader = audio.filter((u) => u.startsWith('url:"audio/reader/'));
const problems: string[] = [];
if (!audio.some((u) => u.startsWith('url:"audio/card-'))) problems.push('lesson audio is not precached');
if (reader.length) problems.push(`${reader.length} reader files are precached (e.g. ${reader[0]})`);
if (!sw.includes('reader-audio-v1')) problems.push('no reader-audio-v1 runtime cache');
if (problems.length) { console.error(problems.map((p) => `✗ ${p}`).join('\n')); process.exit(1); }
console.log(`OK: ${audio.length} precached audio files, none under audio/reader/; reader-audio-v1 runtime cache present`);
