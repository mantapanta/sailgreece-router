import { z } from 'zod';
import { IslandSchema } from './island.ts';
import { KiteSpotSchema } from './kite.ts';
import { PlaceSchema } from './place.ts';
import { LegSchema, RouteSchema, VariantSchema } from './route.ts';
import { ParamsSchema } from './params.ts';
import { PolarSchema } from './polar.ts';
import { WindTopoZoneSchema } from './windTopo.ts';

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

/**
 * Kite-Spots (seeding/data/kitespots.json) — EINE Datei, ein Freigabe-Gate.
 *
 * Bewusst nicht je Insel wie die Plätze: ein Kite-Spot gehört nicht zum Hafen
 * (schema/kite.ts), die Sammlung ist klein, und sie kommt aus einer anderen
 * Quelle als die nautische Kuratierung. Eine Datei heisst: eine Review, eine
 * Freigabe — und niemand muss 42 Insel-Dateien anfassen, um einen Strand
 * nachzutragen. Referenzielle Integrität gegen Inseln und Plätze prüft der
 * Import, nicht das Schema: es sieht die anderen Dateien nicht.
 */
export const KiteSpotsStagingFileSchema = z.object({
  approved: z.boolean(),
  sourceNote: z.string().min(1),
  kiteSpots: z.array(KiteSpotSchema).min(1),
});
export type KiteSpotsStagingFile = z.infer<typeof KiteSpotsStagingFileSchema>;

/**
 * TOPOGRAFISCHE WINDZONEN (seeding/data/windtopo.json) — Windschatten und
 * Kanaldüsen des Reviers, eine Datei, ein Freigabe-Gate.
 *
 * `zones` darf LEER sein, anders als bei allen anderen Staging-Dateien: eine
 * leere Kuration ist hier ein gültiger Zustand ("noch nicht kalibriert") und
 * schaltet die Korrektur schlicht ab (domain/windTopo.ts). Eine Datei, die
 * mindestens eine Zone verlangte, zwänge zum Erfinden einer Zone, nur damit die
 * Datei existieren darf — genau die Sorte Zahl, die diese Codebasis nicht will.
 */
export const WindTopoStagingFileSchema = z.object({
  approved: z.boolean(),
  sourceNote: z.string().min(1),
  zones: z.array(WindTopoZoneSchema),
});
export type WindTopoStagingFile = z.infer<typeof WindTopoStagingFileSchema>;

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
