/**
 * AD-3 — the single engine entry point: one snapshot in, one assessment out.
 * Every forecast refresh triggers a COMPLETE recomputation; the assessment
 * carries the model-run and retrieval timestamps of its snapshot (FR13).
 * There is NO recommendation field for route options (FR22).
 */

import type {
  Assessment,
  PlanningSnapshot,
  PlaceNightAssessment,
} from './schema/snapshot.ts';
import type { Ampel } from './schema/common.ts';
import { placeNightAmpel, rankPlacesForNight } from './ampel.ts';
import { assessRouteOption, deriveDayOptions, deriveDecisionPoints } from './options.ts';
import { predictedPointOfReturn } from './ppr.ts';
import { distanceNm } from './geo.ts';

/** Nights ahead of the current day assessed for display. */
const NIGHT_LOOKAHEAD_DAYS = 7;

/** Island the boat is currently at, derived from the injected position. */
export function deriveCurrentIslandId(snapshot: PlanningSnapshot): string | null {
  const { trip, library, params } = snapshot;
  const pos = trip.position;
  if (!pos) {
    // Before the first fix the boat is at the base.
    return trip.currentDay === 1 ? params.baseIslandId : null;
  }
  if (pos.placeId) {
    const place = library.places.find((p) => p.id === pos.placeId);
    if (place) return place.islandId;
  }
  let best: { islandId: string; nm: number } | null = null;
  for (const place of library.places) {
    const nm = distanceNm({ lat: pos.lat, lon: pos.lon }, place.coordinates);
    if (!best || nm < best.nm) best = { islandId: place.islandId, nm };
  }
  return best?.islandId ?? null;
}

export function assessPlanning(snapshot: PlanningSnapshot): Assessment {
  const { library, trip } = snapshot;
  const currentIslandId = deriveCurrentIslandId(snapshot);

  // --- place night ampeln (valid places; invalid ones stay 'unbewertet') ---
  const nightAmpeln: Record<string, Record<number, PlaceNightAssessment>> = {};
  const nights: number[] = [];
  for (let n = trip.currentDay; n < trip.currentDay + NIGHT_LOOKAHEAD_DAYS; n++) {
    nights.push(n);
  }
  for (const place of library.places) {
    nightAmpeln[place.id] = {};
    for (const n of nights) {
      nightAmpeln[place.id]![n] = placeNightAmpel(place, n, snapshot);
    }
  }
  for (const invalid of library.invalidPlaces) {
    nightAmpeln[invalid.id] = {};
    for (const n of nights) {
      nightAmpeln[invalid.id]![n] = {
        placeId: invalid.id,
        nightDay: n,
        ampel: 'unbewertet',
        maxWindKn: null,
        windDirDeg: null,
        maxWaveM: null,
        reasons: [`Platz-Dokument ungültig: ${invalid.error}`],
      };
    }
  }

  // --- best place per island per night (ranking is domain, AD-2) -----------
  const bestPlaceByIsland: Record<string, Record<number, string | null>> = {};
  for (const island of library.islands) {
    bestPlaceByIsland[island.id] = {};
    const islandPlaces = library.places.filter((p) => p.islandId === island.id);
    for (const n of nights) {
      const ampelByPlace: Record<string, Ampel> = {};
      for (const p of islandPlaces) {
        ampelByPlace[p.id] = nightAmpeln[p.id]?.[n]?.ampel ?? 'unbewertet';
      }
      const ranked = rankPlacesForNight(islandPlaces, ampelByPlace);
      bestPlaceByIsland[island.id]![n] = ranked[0]?.id ?? null;
    }
  }

  // --- option space, PPR, decision points, day options ---------------------
  const routeOptions = library.routes.map((route) =>
    assessRouteOption(route, currentIslandId, snapshot),
  );
  const ppr = predictedPointOfReturn(snapshot, currentIslandId);
  const decisionPoints = deriveDecisionPoints(routeOptions, ppr, library.routes);
  const dayOptions = deriveDayOptions(
    snapshot,
    currentIslandId,
    bestPlaceByIsland,
    nightAmpeln,
  );

  return {
    fetchedAtIso: snapshot.fetchedAtIso,
    modelRunIso: snapshot.modelRunIso,
    model: snapshot.model,
    nightAmpeln,
    bestPlaceByIsland,
    dayOptions,
    routeOptions,
    ppr,
    decisionPoints,
    currentIslandId,
  };
}
