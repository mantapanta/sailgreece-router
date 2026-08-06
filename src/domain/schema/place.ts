import { z } from 'zod';
import { CoordinatesSchema } from './common.ts';
import { ShelterProfileSchema } from './shelter.ts';
import { BerthingDetailsSchema, ConfidenceSchema } from './berthing.ts';
import { RestaurantSchema } from './gastro.ts';

export const PlaceTypeSchema = z.enum(['hafen', 'bucht', 'marina']);
export type PlaceType = z.infer<typeof PlaceTypeSchema>;

/**
 * Qualities on a 1-5 scale (curated).
 *
 * `restaurant` is the CONDENSED gastronomy score and the only one the sorting
 * reads; the named tavernas behind it live in `Place.restaurants` (gastro.ts).
 */
export const PlaceQualitiesSchema = z.object({
  schoenheit: z.number().int().min(1).max(5),
  restaurant: z.number().int().min(0).max(5),
  badestrand: z.number().int().min(0).max(5),
});
export type PlaceQualities = z.infer<typeof PlaceQualitiesSchema>;

export const PlaceSchema = z.object({
  /** Island-prefixed kebab-case slug, e.g. 'sifnos-kamares'. */
  id: z.string().regex(/^[a-z0-9-]+$/),
  islandId: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  type: PlaceTypeSchema,
  coordinates: CoordinatesSchema,
  qualities: PlaceQualitiesSchema,
  /** Mandatory: uncurated places do not pass the import (NFR6, AD-4). */
  shelter: ShelterProfileSchema,
  photoUrl: z.string().url().optional(),
  /** Short atmospheric sentence (German). */
  description: z.string().optional(),
  /** Static warning notes, e.g. Vlychada size limits. */
  warnings: z.array(z.string()).optional(),
  /** Berth-level facts (depth, holding ground, size limit) — see berthing.ts. */
  berthingDetails: BerthingDetailsSchema.optional(),
  /**
   * Gastronomie-Subebene: die kuratierten Tavernen/Restaurants, die von DIESEM
   * Liegeplatz aus erreichbar sind (gastro.ts). Rein informativ — weder Ampel
   * noch Solver lesen sie. Fehlt der Block, ist der Platz gastronomisch nicht
   * recherchiert; das ist etwas anderes als „dort gibt es nichts".
   */
  restaurants: z.array(RestaurantSchema).optional(),
  /**
   * How well the CURATION of this place is backed by sources. Drives nothing in
   * the solver; it tells the reviewer where to look first before `approved`.
   */
  confidence: ConfidenceSchema.optional(),
  /** Sources for the place as a whole (shelter sources live in shelter.sourceNote). */
  sources: z.array(z.string().min(1)).optional(),
});
export type Place = z.infer<typeof PlaceSchema>;

/** A place whose document failed the tolerant parse — shown as 'unbewertet'. */
export interface InvalidPlace {
  id: string;
  name?: string;
  islandId?: string;
  error: string;
}
