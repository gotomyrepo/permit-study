import { existsSync, readdirSync, readFileSync } from 'node:fs';
import YAML from 'yaml';
import { LessonSchema, type Lesson } from '../src/content/types';
import type { ManualPage } from '../src/content/validate';

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
