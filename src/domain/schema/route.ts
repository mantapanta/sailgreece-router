import { z } from 'zod';
import { CoordinatesSchema } from './common.ts';

/**
 * A leg from island to island (concretely: place to place).
 * IDs: 'paros--naxos'. Distances in nm, already Alimos-rebased where
 * applicable (AD-10); `rebasedFrom` documents the original reference point.
 */
export const LegSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+(--[a-z0-9-]+)$/),
  fromIslandId: z.string(),
  toIslandId: z.string(),
  fromPlaceId: z.string(),
  toPlaceId: z.string(),
  distanceNm: z.number().positive(),
  /** Intermediate waypoints (forecast is fetched for these too, AD-3). */
  waypoints: z.array(CoordinatesSchema).default([]),
  /**
   * Normative forecast keys per waypoint, overriding the default
   * `leg:<id>:<n>`. NEVER curated: set only by domain code for DERIVED legs
   * (e.g. reversed connectors), whose waypoints must keep the forecast keys
   * of the ORIGINAL stored leg — the snapshot only ever fetches keys of the
   * stored direction (AD-3).
   */
  waypointKeys: z.array(z.string()).optional(),
  /**
   * Static wind-planning warnings for known acceleration zones
   * (FR10: Kea-Kanal, Kafireas, Paros-Antiparos, Paros-Naxos, ...).
   * Independent of the model value — models smooth these zones.
   */
  windWarnings: z.array(z.string()).default([]),
  /** Distance originally referenced to another base (e.g. 'lavrion'). */
  rebasedFrom: z.string().optional(),
});
export type Leg = z.infer<typeof LegSchema>;

export const RouteSchema = z.object({
  /** e.g. 'sued-route-naxos'; the fallback chain has the fixed id 'rueckfallkette-west'. */
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string().optional(),
  /**
   * FR9 escalation levels: lower rank = more conservative. When the forecast
   * worsens, the next LOWER rank is the natural alternative.
   */
  escalationRank: z.number().int().min(0),
  /** Ordered island sequence, implied by the legs. */
  legs: z.array(LegSchema).min(1),
  /** True for the westward fallback chain used by the PPR (AD-10). */
  isReturnChain: z.boolean().default(false),
  /** Map color hint (CSS color) for the route polyline. */
  color: z.string().optional(),
});
export type Route = z.infer<typeof RouteSchema>;

/**
 * AD-4 — a curated round-trip variant as an ORDERED SEQUENCE OF LEG IDS.
 * Legs are first-class and deduplicated; variants reference them and never
 * copy their content (the old shape stored the same leg up to four times, so
 * a waypoint correction had to be made in four places or silently drifted).
 *
 * The solver treats the union of all variant legs as its search GRAPH rather
 * than replaying a variant verbatim — otherwise FR28 (skipper picks a
 * different island for one day, rest recomputed) would only work for days
 * that happen to lie on a curated variant.
 */
export const VariantSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string().optional(),
  /** FR9 escalation levels: lower rank = more conservative. */
  escalationRank: z.number().int().min(0),
  legIds: z.array(z.string()).min(1),
  /** True for the westward fallback chain used by the return check (AD-10). */
  isReturnChain: z.boolean().default(false),
  color: z.string().optional(),
});
export type Variant = z.infer<typeof VariantSchema>;

/** Fixed id of the normative fallback-harbour chain (AD-10). */
export const RETURN_CHAIN_ROUTE_ID = 'rueckfallkette-west';
