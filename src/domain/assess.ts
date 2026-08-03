/**
 * AD-3 — the single engine entry point: one snapshot in, one assessment out.
 * Every forecast refresh triggers a COMPLETE recomputation; the assessment
 * carries the model-run and retrieval timestamps of its snapshot (FR13).
 * There is NO recommendation field for route options (FR22).
 */

import type {
  Assessment,
  PlanAssessment,
  PlanningSnapshot,
  PlaceNightAssessment,
  StageAssessment,
} from './schema/snapshot.ts';
import type { Ampel } from './schema/common.ts';
import type { Plan } from './schema/plan.ts';
import { stageNumber, stagesOf } from './schema/plan.ts';
import { worstAmpel } from './schema/common.ts';
import { placeNightAmpel, rankPlacesForNight } from './ampel.ts';
import { assessRouteOption, deriveDayOptions, deriveDecisionPoints } from './options.ts';
import { predictedPointOfReturn } from './ppr.ts';
import { assessLeg } from './scoring.ts';
import {
  completePlan,
  deriveAlternatives,
  existsValidPlan,
  legLibrary,
  validatePlan,
  type SolveResult,
} from './solver.ts';
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

/**
 * Assess one plan day by day: leg ampeln, the FR2 leg number and the berth —
 * skipper-chosen berths are shown as-is, solver stages get the current
 * `bestPlace` suggestion, declared as such (AD-12).
 */
function assessPlan(
  plan: Plan,
  snapshot: PlanningSnapshot,
  bestPlaceByIsland: Record<string, Record<number, string | null>>,
  nightAmpeln: Record<string, Record<number, PlaceNightAssessment>>,
  meta: { variantId: string; turnIslandId: string; relaxedTo: string },
): PlanAssessment {
  const legs = legLibrary(snapshot);
  const stages: StageAssessment[] = plan.days
    .slice()
    .sort((a, b) => a.day - b.day)
    .map((entry) => {
      const islandId = entry.kind === 'stage' ? entry.toIslandId : entry.islandId;
      const chosen = entry.kind === 'stage' ? entry.toPlaceId : entry.placeId;
      const suggestion = bestPlaceByIsland[islandId]?.[entry.day] ?? null;
      const placeId = chosen ?? suggestion;
      const legAssessments =
        entry.kind === 'stage'
          ? (() => {
              let offset = 0;
              return entry.legIds.map((legId) => {
                const leg = legs.get(legId);
                if (!leg) {
                  return {
                    legId,
                    day: entry.day,
                    ampel: 'unbewertet' as Ampel,
                    sailHours: null,
                    motorHours: null,
                    totalHours: null,
                    avgTwsKn: null,
                    avgTwaDeg: null,
                    upwind: false,
                    reasons: [`Etappe ${legId} nicht in der Bibliothek`],
                    nightLeg: null,
                    arrivalHourAthens: null,
                    breakdown: [],
                  };
                }
                const a = assessLeg(leg, entry.day, snapshot, {
                  departureOffsetHours: offset || undefined,
                });
                offset += a.totalHours ?? 0;
                return a;
              });
            })()
          : [];
      return {
        day: entry.day,
        stageNumber: stageNumber(plan, entry.day),
        kind: entry.kind,
        toIslandId: islandId,
        placeId,
        placeIsSuggestion: chosen === undefined || chosen === null,
        placeAmpel: placeId
          ? (nightAmpeln[placeId]?.[entry.day]?.ampel ?? 'unbewertet')
          : 'unbewertet',
        ampel:
          entry.kind === 'harbour'
            ? (placeId ? (nightAmpeln[placeId]?.[entry.day]?.ampel ?? 'unbewertet') : 'unbewertet')
            : worstAmpel(legAssessments.map((l) => l.ampel)),
        legs: legAssessments,
        pinned: entry.source === 'skipper',
      };
    });

  return {
    plan,
    validity: validatePlan(plan, snapshot),
    stages,
    variantId: meta.variantId,
    turnIslandId: meta.turnIslandId,
    relaxedTo: meta.relaxedTo,
  };
}

const toPlanAssessment = (
  r: SolveResult,
  snapshot: PlanningSnapshot,
  bestPlaceByIsland: Record<string, Record<number, string | null>>,
  nightAmpeln: Record<string, Record<number, PlaceNightAssessment>>,
): PlanAssessment =>
  assessPlan(r.plan, snapshot, bestPlaceByIsland, nightAmpeln, {
    variantId: r.variantId,
    turnIslandId: r.turnIslandId,
    relaxedTo: r.relaxedTo,
  });

export function assessPlanning(snapshot: PlanningSnapshot): Assessment {
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
  const routesByRank = [...library.variants].sort(
    (a, b) => a.escalationRank - b.escalationRank,
  );
  const routeOptions = routesByRank.map((route) =>
    assessRouteOption(route, currentIslandId, snapshot),
  );
  const ppr = predictedPointOfReturn(snapshot, currentIslandId);
  const decisionPoints = deriveDecisionPoints(routeOptions, ppr, library.variants);
  const dayOptions = deriveDayOptions(
    snapshot,
    currentIslandId,
    bestPlaceByIsland,
    nightAmpeln,
  );

  // --- round trip: main route, proposal, alternatives, FR2 light -----------
  // The persisted main route is only RE-ASSESSED here; the proposal is a
  // separate object and never overwrites it (AD-12).
  const pins = (trip.plan?.days ?? [])
    .filter((d) => d.source === 'skipper')
    .map((d) => ({
      day: d.day,
      toIslandId: d.kind === 'stage' ? d.toIslandId : null,
      toPlaceId: d.kind === 'stage' ? d.toPlaceId : d.placeId,
    }));

  // Off-plan position: the boat is somewhere the plan did not expect (weather,
  // a change of mind, a night at anchor elsewhere). Everything downstream is
  // computed from the REAL position, so the plan is what needs correcting —
  // but the divergence has to be visible instead of silently reinterpreted.
  const expectedIsland = trip.plan
    ? (() => {
        const yesterday = trip.plan.days.find((d) => d.day === trip.currentDay - 1);
        if (!yesterday) return null;
        return yesterday.kind === 'stage' ? yesterday.toIslandId : yesterday.islandId;
      })()
    : null;
  const offPlan =
    currentIslandId !== null &&
    expectedIsland !== null &&
    currentIslandId !== expectedIsland;

  const solved = currentIslandId
    ? completePlan(snapshot, currentIslandId, pins)
    : null;
  const proposal = solved
    ? toPlanAssessment(solved, snapshot, bestPlaceByIsland, nightAmpeln)
    : null;

  const mainRoute = trip.plan
    ? assessPlan(trip.plan, snapshot, bestPlaceByIsland, nightAmpeln, {
        variantId: solved?.variantId ?? 'hauptroute',
        turnIslandId: solved?.turnIslandId ?? (currentIslandId ?? ''),
        relaxedTo: 'none',
      })
    : null;

  // FR2 existence predicate: pins deliberately NOT binding, because the way
  // to cash a yellow in is the check-in — and that releases pins (AD-13).
  const witness = currentIslandId ? existsValidPlan(snapshot, currentIslandId) : null;
  const alternatives = currentIslandId
    ? deriveAlternatives(
        snapshot,
        currentIslandId,
        witness,
        trip.plan ?? undefined,
      ).map((r) => toPlanAssessment(r, snapshot, bestPlaceByIsland, nightAmpeln))
    : [];

  const restTripReasons: string[] = [];
  let restTripAmpel: Ampel;
  if (!currentIslandId) {
    // No position, no verdict: a missing fix is a data gap, and painting the
    // rest trip red would cry wolf (NFR6: never green, never silently hidden).
    restTripAmpel = 'unbewertet';
    restTripReasons.push(
      positionNote ?? 'Ohne Position ist der Rest-Trip nicht bewertbar',
    );
  } else if (!mainRoute) {
    restTripAmpel = 'unbewertet';
    restTripReasons.push('Noch keine Hauptroute — Vorschlag der App übernehmen');
  } else if (
    mainRoute.validity.valid &&
    !mainRoute.validity.horizonDependent &&
    stagesOf(mainRoute.plan).length > 0
  ) {
    // Green requires an actual round trip: a plan that only lies in port has
    // no violations either, and reporting that as green would tell the skipper
    // his trip is fine while the boat never leaves Alimos.
    restTripAmpel = 'gruen';
  } else if (witness) {
    // Yellow: the main route is not provably valid — it violates something,
    // hangs on the horizon or falls short structurally — but a round trip that
    // is safe, on time and actually sails still exists in the search space.
    restTripAmpel = 'gelb';
    restTripReasons.push(
      mainRoute.validity.valid
        ? 'Hauptroute hängt an Etappen jenseits des Forecast-Horizonts'
        : 'Hauptroute erfüllt die Kriterien nicht vollständig — ein tragfähiger Round-Trip existiert',
    );
    mainRoute.validity.violations.forEach((v) => restTripReasons.push(v.text));
  } else {
    restTripAmpel = 'rot';
    restTripReasons.push('Kein sicherer Round-Trip mehr darstellbar');
    (proposal ?? mainRoute).validity.violations.forEach((v) =>
      restTripReasons.push(v.text),
    );
  }

  return {
    fetchedAtIso: snapshot.fetchedAtIso,
    modelRunIso: snapshot.modelRunIso,
    model: snapshot.model,
    nightAmpeln,
    bestPlaceByIsland,
    dayOptions,
    routeOptions,
    mainRoute,
    proposal,
    alternatives,
    restTripAmpel,
    restTripReasons,
    ppr,
    decisionPoints,
    currentIslandId,
    positionNote: offPlan
      ? `Position (${currentIslandId}) weicht vom Plan ab — erwartet war ${expectedIsland}. Der Rest-Trip ist ab der echten Position gerechnet.${positionNote ? ` ${positionNote}` : ''}`
      : positionNote,
    offPlan,
  };
}
