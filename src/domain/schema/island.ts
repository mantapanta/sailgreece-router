import { z } from 'zod';
import { CoordinatesSchema } from './common.ts';

export const IslandSchema = z.object({
  /** Kebab-case slug, e.g. 'sifnos'. Stable, never renamed. */
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  coordinates: CoordinatesSchema,
  /** Short atmospheric sentence (German, Y.CO narrative tone). */
  description: z.string().optional(),
  /**
   * FR31 guest pickup: can the guests reach this island by ferry on
   * `params.pickupDate`? Curated data (AD-4) — a MISSING field counts as NOT
   * reachable, never as silent optimism, because reaching the pickup is a
   * hard validity condition that is never relaxed (AD-13).
   */
  guestPickup: z
    .object({
      ferryReachable: z.boolean(),
      sourceNote: z.string().min(1),
    })
    .optional(),
});
export type Island = z.infer<typeof IslandSchema>;
