/**
 * AD-4 — resolving the leg library.
 *
 * Legs are first-class and deduplicated; variants reference them by id. This
 * module is the ONE place that turns an id sequence back into legs, so a dead
 * reference is handled identically everywhere instead of each consumer
 * inventing its own fallback.
 */

import type { Leg, Variant } from './schema/route.ts';
import type { Library } from './schema/snapshot.ts';

/** Leg lookup by id. */
export function legIndex(library: Library): Map<string, Leg> {
  const byId = new Map<string, Leg>();
  for (const leg of library.legs) if (!byId.has(leg.id)) byId.set(leg.id, leg);
  return byId;
}

/**
 * The legs of a variant, in order. Dead references are SKIPPED rather than
 * throwing: a reimport may drop a leg while a persisted plan or an older
 * variant still names it, and the app must stay usable and say so elsewhere
 * (the plan validity reports it as `incomplete`).
 */
export function legsOfVariant(variant: Variant, library: Library): Leg[] {
  const byId = legIndex(library);
  return variant.legIds
    .map((id) => byId.get(id))
    .filter((l): l is Leg => l !== undefined);
}

/** True when a variant names legs the library no longer contains. */
export function variantIsIncomplete(variant: Variant, library: Library): boolean {
  return legsOfVariant(variant, library).length !== variant.legIds.length;
}

/** Island sequence implied by an ordered leg list. */
export function islandSequence(legs: Leg[]): string[] {
  if (legs.length === 0) return [];
  return [legs[0]!.fromIslandId, ...legs.map((l) => l.toIslandId)];
}

/** Island sequence of a variant. */
export function variantIslandSequence(variant: Variant, library: Library): string[] {
  return islandSequence(legsOfVariant(variant, library));
}
