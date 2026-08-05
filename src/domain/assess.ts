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
import { islandAtEndOfDay, stageNumber, stagesOf } from './schema/plan.ts';
import { worstAmpel } from './schema/common.ts';
import { placeNightAmpel, rankPlacesForNight } from './ampel.ts';
import { reachableIslands } from './reach.ts';
import { applyPersistenceAssumption } from './persistence.ts';
import { assessRouteOption, deriveDayOptions, deriveDecisionPoints } from './options.ts';
import { predictedPointOfReturn } from './ppr.ts';
import { assessLeg, stopHoursForDay } from './scoring.ts';
import { sailedLegsByDay } from './legGeometry.ts';
import {
  completePlan,
  deriveReturnChecks,
  existsValidPlan,
  legLibrary,
  meltemiSafeUntilDay,
  planKey,
  planTurnDay,
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
  const ordered = plan.days.slice().sort((a, b) => a.day - b.day);

  /**
   * Aufenthalts-bewusste Platzvorschläge (Zielmodell v2 — nie derselbe
   * Liegeplatz zweimal): läuft die Route eine Insel ein zweites Mal an, wird
   * für den zweiten Aufenthalt der beste noch UNBENUTZTE Platz vorgeschlagen
   * statt wieder derselbe. Innerhalb EINES Aufenthalts (aufeinanderfolgende
   * Nächte) bleibt der Vorschlag stehen — das Boot verholt nicht, nur weil
   * der Forecast über Nacht einen anderen Platz nach vorn sortiert. Die Basis
   * ist ausgenommen (Start, Ziel, Puffertage liegen dort mehrfach).
   */
  const suggestionByDay = new Map<number, string | null>();
  {
    const usedByIsland = new Map<string, Set<string>>();
    let prevIsland: string | null = null;
    let staySuggestion: string | null = null;
    for (const entry of ordered) {
      const islandId = entry.kind === 'stage' ? entry.toIslandId : entry.islandId;
      const chosen = entry.kind === 'stage' ? entry.toPlaceId : entry.placeId;
      if (islandId !== prevIsland) {
        prevIsland = islandId;
        const used = usedByIsland.get(islandId) ?? new Set<string>();
        usedByIsland.set(islandId, used);
        if (chosen) {
          staySuggestion = chosen;
        } else if (islandId === snapshot.params.baseIslandId) {
          staySuggestion = bestPlaceByIsland[islandId]?.[entry.day] ?? null;
        } else {
          const islandPlaces = snapshot.library.places.filter(
            (p) => p.islandId === islandId,
          );
          const ampelByPlace: Record<string, Ampel> = {};
          for (const p of islandPlaces) {
            ampelByPlace[p.id] = nightAmpeln[p.id]?.[entry.day]?.ampel ?? 'unbewertet';
          }
          const ranked = rankPlacesForNight(islandPlaces, ampelByPlace);
          const pick = ranked.find((p) => !used.has(p.id)) ?? ranked[0] ?? null;
          staySuggestion = pick?.id ?? null;
        }
        if (staySuggestion) used.add(staySuggestion);
      } else if (chosen) {
        usedByIsland.get(islandId)?.add(chosen);
        staySuggestion = chosen;
      }
      suggestionByDay.set(entry.day, staySuggestion);
    }
  }

  /** Der Platz, an dem ein Tag endet: gewählt (AD-12) oder vorgeschlagen. */
  const placeIdOf = (entry: (typeof ordered)[number]): string | null => {
    const islandId = entry.kind === 'stage' ? entry.toIslandId : entry.islandId;
    const chosen = entry.kind === 'stage' ? entry.toPlaceId : entry.placeId;
    return (
      chosen ??
      suggestionByDay.get(entry.day) ??
      bestPlaceByIsland[islandId]?.[entry.day] ??
      null
    );
  };

  /**
   * Die Kette, wie sie wirklich gesegelt wird — EINMAL für den ganzen Plan,
   * chronologisch (legGeometry.ts): jeder Tag startet dort, wo der vorige
   * endete, und jeder Kurs liegt landfrei. Bewertung und Karte lesen von hier,
   * damit die Rechnung nicht einem anderen Kurs folgt als die Linie.
   *
   * An einem HAFENTAG zählt nur ein gewählter Platz, nie der vorgeschlagene:
   * ein Hafentag segelt keine Etappe, also wird auch keine gezeichnet. Würde
   * der Vorschlag die Position verschieben, stünde das Boot am nächsten Morgen
   * in einer Bucht, in die es nie gefahren ist — genau der Sprung, den diese
   * Kette abschafft. Verlegt der Skipper am Hafentag, sagt er es (AD-12), und
   * dann gilt sein Platz.
   */
  const sailed = sailedLegsByDay(
    ordered.map((entry) => ({
      day: entry.day,
      legIds: entry.kind === 'stage' ? entry.legIds : [],
      placeId: entry.kind === 'stage' ? placeIdOf(entry) : (entry.placeId ?? null),
    })),
    legs,
    snapshot.library.places,
  );

  const stages: StageAssessment[] = ordered.map((entry) => {
    const islandId = entry.kind === 'stage' ? entry.toIslandId : entry.islandId;
    const chosen = entry.kind === 'stage' ? entry.toPlaceId : entry.placeId;
    const placeId = placeIdOf(entry);
    const stopHoursPerStop = stopHoursForDay(snapshot, entry.day);
    const legAssessments =
      entry.kind === 'stage'
        ? (() => {
            let offset = 0;
            const stopHours = stopHoursPerStop;
            const dayLegs = sailed.get(entry.day) ?? [];
            return entry.legIds.map((legId, i) => {
              const leg = dayLegs[i];
              if (!leg) {
                return {
                  legId,
                  sailedLeg: null,
                  day: entry.day,
                  ampel: 'unbewertet' as Ampel,
                  sailHours: null,
                  motorHours: null,
                  totalHours: null,
                  avgTwsKn: null,
                  avgTwaDeg: null,
                  avgTwdDeg: null,
                  avgSpeedKn: null,
                  upwind: false,
                  basis: 'forecast' as const,
                  reasons: [`Etappe ${legId} nicht in der Bibliothek`],
                  nightLeg: null,
                  arrivalHourAthens: null,
                  breakdown: [],
                  pointPassages: [],
                };
              }
              const a = assessLeg(leg, entry.day, snapshot, {
                departureOffsetHours: offset || undefined,
              });
              // Nach jeder Etappe die Liegezeit des Zwischenstopps: die
              // Folge-Etappe startet nach der Pause, nicht direkt bei
              // Ankunft. Nach der LETZTEN Etappe ist der Offset unbenutzt,
              // deshalb hier ohne Sonderfall.
              offset += (a.totalHours ?? 0) + stopHours;
              return a;
            });
          })()
        : [];
    // Ausgangsinsel dieses Tages: wo der Plan das Schiff am Vorabend hat.
    // Für den ersten Plantag gibt es keinen Vortag — dann die Basis.
    const fromIslandId =
      islandAtEndOfDay(plan, entry.day - 1) ?? snapshot.params.baseIslandId;
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
      stopHoursPerStop,
      stopHoursTotal:
        Math.max(0, legAssessments.length - 1) * stopHoursPerStop,
      reachableIslandIds: reachableIslands(snapshot, fromIslandId, entry.day),
    };
  });

  // Zielmodell v2 — die tägliche Abbruch-Notation: für jeden zukünftigen
  // Plantag der Heimweg-Status (meltemi-fest / wetterfenster / kritisch).
  const returnChecks = deriveReturnChecks(plan, snapshot);

  return {
    plan,
    // Geprüft wird die gesegelte Kette, nicht die kuratierte: sonst könnte die
    // Anzeige einen Tag rot rechnen, den die Gültigkeit für grün hält.
    validity: validatePlan(plan, snapshot, { sailedLegsByDay: sailed }),
    stages,
    variantId: meta.variantId,
    turnIslandId: meta.turnIslandId,
    // Aus der Kette selbst, nicht aus meta: meta.turnIslandId kann beim
    // Hauptrouten-Assessment vom Solver-Vorschlag stammen (siehe Schema).
    turnDay: planTurnDay(plan, snapshot),
    relaxedTo: meta.relaxedTo,
    returnChecks,
    meltemiSafeUntilDay: meltemiSafeUntilDay(returnChecks),
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

const futurePinsEmpty = (pins: { day: number }[]): boolean => pins.length === 0;

/**
 * Dieselbe Prüfung, die `existsValidPlan` an sein Ergebnis anlegt: der Zeuge
 * muss sicher sein UND tatsächlich segeln. "Zwölf Tage im Hafen liegen" ist
 * kein Round-Trip und darf ein Gelb nicht tragen.
 */
const witnessOf = (r: SolveResult | null): SolveResult | null => {
  if (!r) return null;
  const sails = stagesOf(r.plan).length > 0;
  return sails && r.validity.safetyViolations.length === 0 ? r : null;
};

export function assessPlanning(rawSnapshot: PlanningSnapshot): Assessment {
  // FIRST step, before anything is judged: extend the hour axis over the whole
  // trip and fill the gaps with the persistence assumption. A forecast that
  // does not reach the second week must not mean "no statement" — it means
  // "statement under a named assumption", flagged per hour and reported per
  // verdict. Everything downstream therefore sees a complete axis.
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
  // Die Rückfallkette ist der Heimweg, kein Ziel — sie als Option zu listen
  // hiesse, dem Skipper "nach Hause fahren" als Alternative anzubieten.
  const routesByRank = [...library.variants]
    .filter((v) => !v.isReturnChain)
    .sort((a, b) => a.escalationRank - b.escalationRank);
  const routeOptions = routesByRank.map((route) =>
    assessRouteOption(route, currentIslandId, snapshot),
  );
  const ppr = predictedPointOfReturn(snapshot, currentIslandId);
  const decisionPoints = deriveDecisionPoints(
    routeOptions,
    ppr,
    library.variants,
    trip.currentDay,
    params.decisionLookaheadDays,
  );
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
  /**
   * FR2-Existenznachweis. Ohne Pins ist das buchstäblich derselbe Aufruf wie
   * `solved` oben — und der Solver ist der teuerste Schritt der ganzen
   * Bewertung. Ihn zweimal zu rechnen kostete die Hälfte der Ladezeit für ein
   * Ergebnis, das schon dasteht.
   */
  const witness = !currentIslandId
    ? null
    : futurePinsEmpty(pins)
      ? witnessOf(solved)
      : existsValidPlan(snapshot, currentIslandId);

  /**
   * VERSCHMELZUNG Optionsraum + Alternativ-Routen: die Alternativen SIND die
   * konkreten Pläne der Optionen. Vorher standen zwei Listen nebeneinander —
   * der Optionsraum mit Reichweite/Preis/Frist und daneben solver-eigene
   * "andere Round-Trips", die dieselben Ziele noch einmal nannten, mit
   * womöglich anderem Plan. Jetzt zeigt jede Option per `previewIndex` auf
   * ihren eigenen bewerteten Plan: angesehen (Tagesansicht), eingeblendet
   * (Karte, gleiche Farbe = gleicher Index) und übernommen wird ein und
   * dieselbe Route — nie zweierlei Behauptungen (AD-3).
   *
   * Dedupliziert über den Plan-INHALT (planKey): zwei Optionen mit identischem
   * Plan teilen sich den Eintrag, und ein Plan, der der Hauptroute entspricht,
   * ist keine "andere" Route (previewIndex bleibt null — bei vorhandenem
   * `plan` heisst das genau: entspricht der Hauptroute). Der FR2-Zeuge wird
   * angehängt, falls ihn keine Option abdeckt — ein gelbes Licht bleibt
   * einlösbar (AD-13 Invariante).
   */
  const alternatives: PlanAssessment[] = [];
  const altKeys: string[] = [];
  const mainKey = trip.plan ? planKey(trip.plan) : null;
  const routeOptionsMerged = routeOptions.map((opt) => {
    if (!opt.plan) return opt;
    const key = planKey(opt.plan);
    if (key === mainKey) return opt;
    const existing = altKeys.indexOf(key);
    if (existing >= 0) return { ...opt, previewIndex: existing };
    alternatives.push(
      assessPlan(opt.plan, snapshot, bestPlaceByIsland, nightAmpeln, {
        variantId: opt.routeId,
        turnIslandId: opt.turnIslandId,
        relaxedTo: opt.costLevel ?? 'none',
      }),
    );
    altKeys.push(key);
    return { ...opt, previewIndex: alternatives.length - 1 };
  });
  if (witness) {
    const key = planKey(witness.plan);
    if (key !== mainKey && !altKeys.includes(key)) {
      alternatives.push(
        toPlanAssessment(witness, snapshot, bestPlaceByIsland, nightAmpeln),
      );
      altKeys.push(key);
    }
  }

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
    routeOptions: routeOptionsMerged,
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
    forecastHorizonIso: persistence.horizonIso,
    waveHorizonIso: persistence.waveHorizonIso,
    // Taken from the verdicts themselves rather than re-derived from the
    // horizon timestamp: the leg basis already folds in BOTH reasons a day can
    // be untrusted (extrapolated hours, and days past reliableHorizonDays).
    assumedFromDay: (() => {
      const days: number[] = [];
      for (const st of mainRoute?.stages ?? []) {
        for (const l of st.legs) if (l.basis === 'annahme') days.push(l.day);
      }
      for (const opt of routeOptions) {
        for (const l of opt.legAssessments) if (l.basis === 'annahme') days.push(l.day);
      }
      for (const byNight of Object.values(nightAmpeln)) {
        for (const a of Object.values(byNight)) {
          if (a.basis === 'annahme') days.push(a.nightDay);
        }
      }
      return days.length > 0 ? Math.min(...days) : null;
    })(),
    assumptionNote: persistence.note,
  };
}
