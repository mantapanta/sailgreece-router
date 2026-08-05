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

/** Leg lookup by id — only what the library really stores. */
export function legIndex(library: Library): Map<string, Leg> {
  const byId = new Map<string, Leg>();
  for (const leg of library.legs) if (!byId.has(leg.id)) byId.set(leg.id, leg);
  return byId;
}

/**
 * Eine Etappe rückwärts gesegelt.
 *
 * Der Snapshot holt Forecast-Werte nur für die GESPEICHERTE Richtung
 * (collectLocations, AD-3). Eine umgedrehte Etappe behält deshalb die
 * Wegpunkt-Keys ihres Originals, gespiegelt — sonst geht jeder
 * Wegpunkt-Zugriff ins Leere und die ganze Rückweg-Etappe fiele auf
 * 'unbewertet', obwohl die Abdeckung vollständig ist.
 */
export function reverseLeg(leg: Leg): Leg {
  const lastIdx = leg.waypoints.length - 1;
  const originalKeyOf = (n: number): string =>
    leg.waypointKeys?.[n] ?? `leg:${leg.id}:${n}`;
  return {
    ...leg,
    id: `${leg.toIslandId}--${leg.fromIslandId}`,
    fromIslandId: leg.toIslandId,
    toIslandId: leg.fromIslandId,
    fromPlaceId: leg.toPlaceId,
    toPlaceId: leg.fromPlaceId,
    waypoints: [...leg.waypoints].reverse(),
    waypointKeys: leg.waypoints.map((_, n) => originalKeyOf(lastIdx - n)),
  };
}

/**
 * Leg lookup INKLUSIVE der Gegenrichtungen — der Index, gegen den ein PLAN
 * aufgelöst werden muss.
 *
 * Der Solver baut den Heimweg teils aus umgedrehten Etappen (ppr.ts,
 * `remainingReturnLegs`): von Santorin führt keine gespeicherte Etappe zurück
 * auf die Rückfallkette, wohl aber `naxos--santorin` rückwärts. Ein Plan
 * speichert aber nur IDs — und `santorin--naxos` stand in keinem Index. Jede
 * Prüfung meldete daraufhin "Etappe nicht mehr in der Bibliothek", der Tag
 * galt als unbewertbar, und der Plan konnte nie gültig werden.
 *
 * Folge: JEDE Route, die über einen umgedrehten Verbinder heimfährt — also
 * Santorin, Amorgos, Ios — war strukturell ungültig und wurde nie vorgeschlagen.
 * Nicht weil das Wetter oder das Zeitbudget dagegen sprachen, sondern weil die
 * Etappe beim Nachschlagen fehlte.
 *
 * Gespeicherte Etappen gewinnen gegen erzeugte: steht eine Richtung kuratiert
 * in der Bibliothek, gilt sie, nicht die Spiegelung der Gegenrichtung.
 */
export function legIndexWithReverses(library: Library): Map<string, Leg> {
  const byId = legIndex(library);
  for (const leg of library.legs) {
    const reversed = reverseLeg(leg);
    if (!byId.has(reversed.id)) byId.set(reversed.id, reversed);
  }
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
