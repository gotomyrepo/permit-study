import YAML from 'yaml';
import { LessonSchema, type Lesson } from './types';

const raw = import.meta.glob('../../content/lessons/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function loadLessons(): Lesson[] {
  return Object.values(raw).map((r) => LessonSchema.parse(YAML.parse(r))).sort((a, b) => a.order - b.order);
}
