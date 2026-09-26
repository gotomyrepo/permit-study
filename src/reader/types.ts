import { z } from 'zod';
import { Id, SourceSchema } from '../content/types';

/** `fig-<id>`: a manual figure from content/reader/figures.yaml. `scene:<scene-id>`: a still of a lesson scene. */
export const PICTURE_RE = /^(fig-[a-z0-9-]+|scene:[a-z0-9-]+)$/;

export const ParagraphSchema = z.object({
  id: Id,
  say: z.string().min(1),
  source: SourceSchema,
  picture: z.string().regex(PICTURE_RE, 'picture is fig-<id> or scene:<scene-id>').optional(),
});

export const SectionSchema = z.object({
  id: Id,
  title: z.string().min(1).max(40),
  paragraphs: z.array(ParagraphSchema).min(1),
});

export const ChapterSchema = z.object({
  id: Id,
  number: z.number().int().positive(),
  title: z.string().min(1).max(40),
  sections: z.array(SectionSchema).min(1),
});

/** A crop of the manual PDF: box is [x0, y0, x1, y1] in PDF points, origin at the top left (PyMuPDF). */
export const FigureSchema = z.object({
  id: z.string().regex(/^fig-[a-z0-9-]+$/, 'figure ids start with fig-'),
  page: z.number().int().positive(),
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
}).refine((f) => f.box[0] < f.box[2] && f.box[1] < f.box[3], { message: 'box is [x0, y0, x1, y1] with x0 < x1 and y0 < y1' });
export const FiguresSchema = z.array(FigureSchema);

export type Paragraph = z.infer<typeof ParagraphSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type Figure = z.infer<typeof FigureSchema>;

/** Her place in the reader, saved in localStorage. */
export interface ReaderPlace { chapter: string; section: string; paragraph: string }

/** Where a picture's PNG is served from, relative to the app's base URL. */
export function picturePath(picture: string): string {
  return picture.startsWith('scene:') ? `reader/scenes/${picture.slice('scene:'.length)}.png` : `reader/figures/${picture}.png`;
}
