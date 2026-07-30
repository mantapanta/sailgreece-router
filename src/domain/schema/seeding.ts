import { z } from 'zod';
import { IslandSchema } from './island.ts';
import { PlaceSchema } from './place.ts';
import { RouteSchema } from './route.ts';
import { ParamsSchema } from './params.ts';
import { PolarSchema } from './polar.ts';

/**
 * Staging file per island (seeding/data/islands/<id>.json).
 * `approved` gates the import (AD-10): only Philipp sets it to true after
 * reviewing the generated FR24 markdown in seeding/review/.
 */
export const IslandStagingFileSchema = z.object({
  approved: z.boolean(),
  /** Provenance of the whole file, e.g. 'Brief-Addendum 2026-07-30'. */
  sourceNote: z.string().min(1),
  island: IslandSchema,
  places: z.array(PlaceSchema).min(1),
});
export type IslandStagingFile = z.infer<typeof IslandStagingFileSchema>;

export const RoutesStagingFileSchema = z.object({
  approved: z.boolean(),
  sourceNote: z.string().min(1),
  routes: z.array(RouteSchema).min(1),
});
export type RoutesStagingFile = z.infer<typeof RoutesStagingFileSchema>;

export const ConfigStagingFileSchema = z.object({
  approved: z.boolean(),
  sourceNote: z.string().min(1),
  parameters: ParamsSchema,
});
export type ConfigStagingFile = z.infer<typeof ConfigStagingFileSchema>;

export const PolarStagingFileSchema = z.object({
  approved: z.boolean(),
  sourceNote: z.string().min(1),
  polar: PolarSchema,
});
export type PolarStagingFile = z.infer<typeof PolarStagingFileSchema>;
