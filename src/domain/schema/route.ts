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

/** Fixed id of the normative fallback-harbour chain (AD-10). */
export const RETURN_CHAIN_ROUTE_ID = 'rueckfallkette-west';
