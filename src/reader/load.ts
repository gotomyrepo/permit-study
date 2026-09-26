import YAML from 'yaml';
import { ChapterSchema, type Chapter } from './types';

const raw = import.meta.glob('../../content/reader/ch*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function loadChapters(): Chapter[] {
  return Object.values(raw).map((r) => ChapterSchema.parse(YAML.parse(r))).sort((a, b) => a.number - b.number);
}
