import { z } from 'zod';
import { CoordinatesSchema } from './common.ts';

export const IslandSchema = z.object({
  /** Kebab-case slug, e.g. 'sifnos'. Stable, never renamed. */
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  coordinates: CoordinatesSchema,
  /** Short atmospheric sentence (German, Y.CO narrative tone). */
  description: z.string().optional(),
});
export type Island = z.infer<typeof IslandSchema>;
