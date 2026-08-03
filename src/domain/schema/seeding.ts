import { z } from 'zod';
import { IslandSchema } from './island.ts';
import { PlaceSchema } from './place.ts';
import { LegSchema, RouteSchema, VariantSchema } from './route.ts';
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

/**
 * @deprecated Superseded by the leg/variant split (AD-4). Kept so an older
 * routes.json still parses during the transition; new data goes into
 * legs.json + variants.json.
 */
export const RoutesStagingFileSchema = z.object({
  approved: z.boolean(),
  sourceNote: z.string().min(1),
  routes: z.array(RouteSchema).min(1),
});
export type RoutesStagingFile = z.infer<typeof RoutesStagingFileSchema>;

/** Deduplicated leg library (seeding/data/legs.json) — legs are first-class (AD-4). */
export const LegsStagingFileSchema = z.object({
  approved: z.boolean(),
  sourceNote: z.string().min(1),
  legs: z.array(LegSchema).min(1),
});
export type LegsStagingFile = z.infer<typeof LegsStagingFileSchema>;

/**
 * Curated round-trip variants (seeding/data/variants.json) as ORDERED LEG-ID
 * SEQUENCES. Referential integrity against legs.json is checked at import time,
 * not here — the schema alone cannot see the other file.
 */
export const VariantsStagingFileSchema = z.object({
  approved: z.boolean(),
  sourceNote: z.string().min(1),
  variants: z.array(VariantSchema).min(1),
});
export type VariantsStagingFile = z.infer<typeof VariantsStagingFileSchema>;

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
