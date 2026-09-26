import { z } from 'zod';

export const Id = z.string().regex(/^[a-z0-9-]+$/, 'ids use lowercase letters, digits and dashes');

export const SourceSchema = z.object({
  page: z.number().int().positive(),
  quote: z.string().min(10).optional(),
  figure: z.string().min(3).optional(),
}).refine((s) => s.quote || s.figure, { message: 'source needs a quote (or a figure description for facts shown only in a manual picture)' });

export const CardSchema = z.object({
  id: Id, say: z.string().min(1), scene: z.string(), step: z.string(), source: SourceSchema,
});

export const QuestionSchema = z.object({
  id: Id,
  ask: z.string().min(1),
  scene: z.string(),
  step: z.string(),
  choices: z.array(z.string().min(1)).min(2).max(4),
  answer: z.number().int().min(0),
  explainCard: z.string(),
  signQuestion: z.boolean().default(false),
  source: SourceSchema,
});

export const LessonSchema = z.object({
  id: Id,
  order: z.number().int().positive(),
  title: z.string().min(1).max(20),
  icon: z.string().min(1),
  /** Reader section that "📖 Learn more" opens (a section id in content/reader/ch*.yaml). */
  readerStart: Id.optional(),
  cards: z.array(CardSchema).min(1),
  questions: z.array(QuestionSchema).min(1),
});

export type Source = z.infer<typeof SourceSchema>;
export type Card = z.infer<typeof CardSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
