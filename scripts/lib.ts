import { existsSync, readdirSync, readFileSync } from 'node:fs';
import YAML from 'yaml';
import { LessonSchema, type Lesson } from '../src/content/types';
import type { ManualPage } from '../src/content/validate';
import { ChapterSchema, FiguresSchema, type Chapter, type Figure } from '../src/reader/types';

export function readLessons(errors: string[]): Lesson[] {
  const dir = 'content/lessons';
  if (!existsSync(dir)) return [];
  const lessons: Lesson[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort()) {
    try { lessons.push(LessonSchema.parse(YAML.parse(readFileSync(`${dir}/${f}`, 'utf8')))); }
    catch (e) { errors.push(`${f}: ${(e as Error).message}`); }
  }
  return lessons.sort((a, b) => a.order - b.order);
}

export function readPages(): ManualPage[] {
  return JSON.parse(readFileSync('content/manual/pages.json', 'utf8')) as ManualPage[];
}

export function readChapters(errors: string[]): Chapter[] {
  const dir = 'content/reader';
  if (!existsSync(dir)) return [];
  const chapters: Chapter[] = [];
  for (const f of readdirSync(dir).filter((f) => /^ch\d+\.yaml$/.test(f)).sort()) {
    try { chapters.push(ChapterSchema.parse(YAML.parse(readFileSync(`${dir}/${f}`, 'utf8')))); }
    catch (e) { errors.push(`${f}: ${(e as Error).message}`); }
  }
  return chapters.sort((a, b) => a.number - b.number);
}

export function readFigures(errors: string[]): Figure[] {
  const f = 'content/reader/figures.yaml';
  if (!existsSync(f)) return [];
  try { return FiguresSchema.parse(YAML.parse(readFileSync(f, 'utf8')) ?? []); }
  catch (e) { errors.push(`figures.yaml: ${(e as Error).message}`); return []; }
}

/** Picture ids that have a PNG: fig-<id> in public/reader/figures, scene:<id> in public/reader/scenes. */
export function readPictureIds(): Set<string> {
  const pngs = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)) : []);
  return new Set([...pngs('public/reader/figures'), ...pngs('public/reader/scenes').map((id) => `scene:${id}`)]);
}
