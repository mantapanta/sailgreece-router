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
import { derivePlanRationale } from './overview.ts';
import { applyPersistenceAssumption } from './persistence.ts';
import { predictedPointOfReturn } from './ppr.ts';
import { distanceNm } from './geo.ts';

/**
 * Island the boat is currently at, derived from the injected position, plus
 * a visible note when the derivation cannot name an island. A GPS fix is
 * snapped to the nearest library place only within params.maxSnapNm — a fix
 * far outside the cruising area must NOT silently claim the closest island.
 */
export function deriveCurrentIsland(snapshot: PlanningSnapshot): {
  islandId: string | null;
  note: string | null;
} {
  const { trip, library, params } = snapshot;
  const pos = trip.position;
  if (!pos) {
    // Before the first fix the boat is at the base — but only on day 1.
    return trip.currentDay === 1
      ? { islandId: params.baseIslandId, note: null }
      : {
          islandId: null,
          note: 'Keine Position gesetzt — GPS abfragen oder Platz wählen',
        };
  }
  if (pos.placeId) {
    const place = library.places.find((p) => p.id === pos.placeId);
    if (place) return { islandId: place.islandId, note: null };
  }
  let best: { islandId: string; nm: number } | null = null;
  for (const place of library.places) {
    const nm = distanceNm({ lat: pos.lat, lon: pos.lon }, place.coordinates);
    if (!best || nm < best.nm) best = { islandId: place.islandId, nm };
  }
  if (!best) return { islandId: null, note: 'Keine Plätze in der Bibliothek' };
  if (best.nm > params.maxSnapNm) {
    return {
      islandId: null,
      note: `Position liegt ${Math.round(best.nm)} sm vom nächsten Bibliotheksplatz entfernt (Limit ${params.maxSnapNm} sm) — keiner Insel zugeordnet`,
    };
  }
  return { islandId: best.islandId, note: null };
}

/** Backwards-compatible shorthand (islandId only). */
export function deriveCurrentIslandId(snapshot: PlanningSnapshot): string | null {
  return deriveCurrentIsland(snapshot).islandId;
}

export function assessPlanning(rawSnapshot: PlanningSnapshot): Assessment {
  // FIRST step, before anything is judged: extend the hour axis over the whole
  // trip and fill the gaps with the persistence assumption. A missing forecast
  // for the second week must not mean "no route" — it means "route under a
  // stated assumption", flagged per hour and reported per verdict.
  const { snapshot, info: persistence } = applyPersistenceAssumption(rawSnapshot);
  const { library, trip, params } = snapshot;
  const { islandId: currentIslandId, note: positionNote } =
    deriveCurrentIsland(snapshot);

  // --- place night ampeln (valid places; invalid ones stay 'unbewertet') ---
  const nightAmpeln: Record<string, Record<number, PlaceNightAssessment>> = {};
  const nights: number[] = [];
  for (let n = trip.currentDay; n < trip.currentDay + params.nightLookaheadDays; n++) {
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
        basis: 'forecast',
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
  // Ordering by escalation rank is a domain criterion (AD-2): the assessment
  // delivers routeOptions ORDERED (conservative first); views only consume.
  const routesByRank = [...library.routes].sort(
    (a, b) => a.escalationRank - b.escalationRank,
  );
  const routeOptions = routesByRank.map((route) =>
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

  // First trip day resting on the assumption — taken from the verdicts
  // themselves (exact) rather than re-derived from the horizon timestamp.
  const assumedDays: number[] = [];
  for (const opt of routeOptions) {
    for (const la of opt.legAssessments) {
      if (la.basis === 'annahme') assumedDays.push(la.day);
    }
  }
  for (const opt of dayOptions) {
    if (opt.leg?.basis === 'annahme') assumedDays.push(opt.leg.day);
  }
  for (const byNight of Object.values(nightAmpeln)) {
    for (const a of Object.values(byNight)) {
      if (a.basis === 'annahme') assumedDays.push(a.nightDay);
    }
  }

  const assumedFromDay = assumedDays.length > 0 ? Math.min(...assumedDays) : null;

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
    // Derived LAST: the overall reasoning reads the finished parts (AD-2).
    planRationale: derivePlanRationale({
      snapshot,
      currentIslandId,
      positionNote,
      routeOptions,
      ppr,
      decisionPoints,
      dayOptions,
      forecastHorizonIso: persistence.horizonIso,
      waveHorizonIso: persistence.waveHorizonIso,
      assumedFromDay,
    }),
    currentIslandId,
    positionNote,
    forecastHorizonIso: persistence.horizonIso,
    waveHorizonIso: persistence.waveHorizonIso,
    assumedFromDay,
    assumptionNote: persistence.note,
  };
}
