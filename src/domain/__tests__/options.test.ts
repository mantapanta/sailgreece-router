import { describe, expect, it } from 'vitest';
import {
  assessTargetOption,
  deriveDayOptions,
  deriveDecisionPoints,
  restPlanFeasible,
} from '../options.ts';
import { predictedPointOfReturn } from '../ppr.ts';
import { stagesOf } from '../schema/plan.ts';

import {
  constantForecast,
  makeLeg,
  makePlace,
  makeSnapshot,
  makeTimes,
  TRIP_START,
  makeVariant,
  truncateForecast,
} from './fixtures.ts';
import { TEST_POLAR } from './fixtures.ts';
import { dateForTripDay } from '../time.ts';
import type {
  PlanningSnapshot,
  RouteOptionAssessment,
} from '../schema/snapshot.ts';
import type { Island } from '../schema/island.ts';

/**
 * Basis, eine Zwischeninsel und eine ferne Insel — plus ein RUNDKURS, der
 * wieder an der Basis endet. Genau die Form, an der sich zeigt, ob der
 * Wendepunkt als fernste oder als letzte Insel gelesen wird.
 */
function rundkursScenario() {
  const athen = makePlace({ id: 'athen-alimos', islandId: 'athen', coordinates: { lat: 37.9, lon: 23.7 } });
  const mitte = makePlace({ id: 'mitte-bucht', islandId: 'mitte', coordinates: { lat: 37.6, lon: 24.2 } });
  const fern = makePlace({ id: 'fern-hafen', islandId: 'fern', coordinates: { lat: 37.3, lon: 24.6 } });
  const leg = (f: typeof athen, t: typeof athen) =>
    makeLeg({
      id: `${f.islandId}--${t.islandId}`,
      fromIslandId: f.islandId, toIslandId: t.islandId,
      fromPlaceId: f.id, toPlaceId: t.id, distanceNm: 18,
    });
  const legs = [leg(athen, mitte), leg(mitte, fern), leg(fern, mitte), leg(mitte, athen)];
  const hinweg = makeVariant('hinweg', [legs[0]!, legs[1]!], { escalationRank: 1, name: 'Hinweg bis Fern' });
  const rundkurs = makeVariant('rundkurs', legs, { escalationRank: 2, name: 'Runde über Fern' });
  const kette = makeVariant('rueckfallkette-west', [legs[2]!, legs[3]!], {
    escalationRank: 0, isReturnChain: true, name: 'Rückfallkette',
  });
  const islands: Island[] = [
    { id: 'athen', name: 'Athen', coordinates: athen.coordinates, guestPickup: { ferryReachable: true, sourceNote: 'f' } },
    { id: 'mitte', name: 'Mitte', coordinates: mitte.coordinates, guestPickup: { ferryReachable: true, sourceNote: 'f' } },
    { id: 'fern', name: 'Fern', coordinates: fern.coordinates, guestPickup: { ferryReachable: true, sourceNote: 'f' } },
  ];
  const times = makeTimes(14);
  const fc = constantForecast(times.length, 10, 90);
  const snapshot = makeSnapshot({
    times, polar: TEST_POLAR,
    forecast: { [athen.id]: fc, [mitte.id]: fc, [fern.id]: fc },
    library: { islands, places: [athen, mitte, fern], invalidPlaces: [], legs, variants: [hinweg, rundkurs, kette] },
    trip: {
      currentDay: 1,
      position: { source: 'manual', lat: athen.coordinates.lat, lon: athen.coordinates.lon, placeId: athen.id },
      plan: null, departureHourByDay: {}, empfohleneAbfahrtByDay: {}, stopHoursByDay: {},
    },
  });
  snapshot.params = {
    ...snapshot.params, tripStartDate: TRIP_START, tripLengthDays: 5,
    returnDeadlineDate: '2026-08-12', reliableHorizonDays: 14,
  };
  return { snapshot, hinweg, rundkurs };
}

/**
 * Two-island world: base (athen) and 'zielinsel' 20 nm south.
 * Outbound route athen -> zielinsel; return chain zielinsel -> athen.
 */
function twoIslandSnapshot(opts: {
  windKn: number;
  windFromDeg: number;
  currentDay?: number;
  tripLengthDays?: number;
}): PlanningSnapshot {
  const base = makePlace({
    id: 'athen-alimos',
    islandId: 'athen',
    coordinates: { lat: 37.9, lon: 23.7 },
  });
  const target = makePlace({
    id: 'zielinsel-bucht',
    islandId: 'zielinsel',
    coordinates: { lat: 37.55, lon: 23.7 },
  });
  const outLeg = makeLeg({
    id: 'athen--zielinsel',
    fromIslandId: 'athen',
    toIslandId: 'zielinsel',
    fromPlaceId: base.id,
    toPlaceId: target.id,
    distanceNm: 20,
  });
  const backLeg = makeLeg({
    id: 'zielinsel--athen',
    fromIslandId: 'zielinsel',
    toIslandId: 'athen',
    fromPlaceId: target.id,
    toPlaceId: base.id,
    distanceNm: 20,
  });
  const legs = [outLeg, backLeg];
  const variants = [
    makeVariant('sued-route', [outLeg], { escalationRank: 1, name: 'Süd-Route' }),
    makeVariant('rueckfallkette-west', [backLeg], {
      escalationRank: 0,
      isReturnChain: true,
      name: 'Rückfallkette West',
    }),
  ];
  const times = makeTimes(12);
  const fc = constantForecast(times.length, opts.windKn, opts.windFromDeg);
  const snapshot = makeSnapshot({
    times,
    polar: TEST_POLAR,
    // These cases probe the CALENDAR limit (when does an option close?), so
    // the reliable horizon must not be the binding constraint — the horizon
    // rule itself has its own tests. Default is 7 days (AD-13).
    params: {
      ...makeSnapshot().params,
      reliableHorizonDays: 14,
    },
    forecast: { [base.id]: fc, [target.id]: fc },
    library: {
      islands: [
        // Fähr-Daten der Inseln: seit dem Wegfall von FR31 (2026-08-06) reine
        // Information — keine Bewertung liest sie mehr. Sie stehen hier, weil
        // die Bibliothek sie trägt, nicht weil der Test sie bräuchte.
        {
          id: 'athen',
          name: 'Athen',
          coordinates: base.coordinates,
          guestPickup: { ferryReachable: true, sourceNote: 'fixture' },
        },
        {
          id: 'zielinsel',
          name: 'Zielinsel',
          coordinates: target.coordinates,
          guestPickup: { ferryReachable: true, sourceNote: 'fixture' },
        },
      ],
      places: [base, target],
      invalidPlaces: [],
      legs,
      variants,
    },
    trip: {
      currentDay: opts.currentDay ?? 1,
      position: { source: 'manual', lat: base.coordinates.lat, lon: base.coordinates.lon, placeId: base.id },
      plan: null,
      departureHourByDay: {},
      empfohleneAbfahrtByDay: {},
      stopHoursByDay: {},
    },
  });
  if (opts.tripLengthDays) {
    snapshot.params = {
      ...snapshot.params,
      tripLengthDays: opts.tripLengthDays,
      returnDeadlineDate: dateForTripDay(TRIP_START, opts.tripLengthDays),
    };
  }
  return snapshot;
}

describe('options — FR18 open / closes / closed', () => {
  it('gentle broad-reach wind, full forecast axis: option closes on the last startable day (FR18)', () => {
    // Axis covers the whole trip, so the calendar limit is computable.
    // Zielmodell v3: der Törnrahmen sind elf Tage, und der Vertrag heisst
    // "ein Törntag, eine Etappe". Der Plan zu diesem Ziel hat zwei Etappen
    // (hin und zurück), der letzte Tag zum Auslaufen ist also Tag 10.
    const snapshot = twoIslandSnapshot({ windKn: 12, windFromDeg: 90 });
    const result = assessTargetOption('zielinsel', 'athen', snapshot);
    expect(result.state).toBe('schliesst');
    expect(result.closesOnDay).toBe(10);
  });

  it('feasible now, closing-day scan hits the horizon: offen-horizont with visible caveat', () => {
    const snapshot = twoIslandSnapshot({ windKn: 12, windFromDeg: 90 });
    truncateForecast(snapshot, 4 * 24); // horizon: 4 days only
    const result = assessTargetOption('zielinsel', 'athen', snapshot);
    // Today's rest plan is fully computable within the horizon, but the
    // closing day may lie just beyond it — that is NOT an unqualified
    // 'offen' (I/O-Matrix: horizon cases need a visible caveat).
    expect(result.state).toBe('offen-horizont');
    expect(result.closesOnDay).toBeNull();
    expect(result.reasons.join(' ')).toContain('Schließtag');
  });

  it("today's rest plan itself crosses the horizon: offen-horizont (first-class state)", () => {
    const snapshot = twoIslandSnapshot({ windKn: 12, windFromDeg: 90 });
    truncateForecast(snapshot, 30); // horizon: 30 h only
    const result = assessTargetOption('zielinsel', 'athen', snapshot);
    // Outbound today fits the axis, the return leg does not: the whole rest
    // plan is only assessable up to the horizon.
    expect(result.state).toBe('offen-horizont');
    expect(result.reasons.join(' ')).toContain('Horizont');
  });

  it('permanent 28 kn northerly makes the northbound return impossible: option zu', () => {
    // Outbound south is fine, but the return leg north beats against 28 kn.
    const snapshot = twoIslandSnapshot({ windKn: 28, windFromDeg: 0 });
    const result = assessTargetOption('zielinsel', 'athen', snapshot);
    expect(result.state).toBe('zu');
  });

  it('no position => zu with reason', () => {
    const snapshot = twoIslandSnapshot({ windKn: 12, windFromDeg: 90 });
    const result = assessTargetOption('zielinsel', null, snapshot);
    expect(result.state).toBe('zu');
    expect(result.reasons.join(' ')).toContain('Position');
  });
});

describe('options — restPlanFeasible searches double-leg arrival days at the deadline edge', () => {
  it('two short legs on the very deadline day: feasible via a double-leg day', () => {
    const sued = makePlace({
      id: 'sued-hafen',
      islandId: 'sued',
      coordinates: { lat: 37.5, lon: 23.7 },
    });
    const mitte = makePlace({
      id: 'mitte-hafen',
      islandId: 'mitte',
      coordinates: { lat: 37.7, lon: 23.7 },
    });
    const base = makePlace({
      id: 'athen-alimos',
      islandId: 'athen',
      coordinates: { lat: 37.9, lon: 23.7 },
    });
    const leg1 = makeLeg({
      id: 'sued--mitte',
      fromIslandId: 'sued',
      toIslandId: 'mitte',
      fromPlaceId: sued.id,
      toPlaceId: mitte.id,
      distanceNm: 12,
    });
    const leg2 = makeLeg({
      id: 'mitte--athen',
      fromIslandId: 'mitte',
      toIslandId: 'athen',
      fromPlaceId: mitte.id,
      toPlaceId: base.id,
      distanceNm: 12,
    });
    const homeVariant = makeVariant('heimweg', [leg1, leg2], {
      escalationRank: 1,
      name: 'Heimweg',
    });
    const times = makeTimes(12);
    const fc = constantForecast(times.length, 12, 0);
    const snapshot = makeSnapshot({
      times,
      polar: TEST_POLAR,
      forecast: { [sued.id]: fc, [mitte.id]: fc, [base.id]: fc },
      library: {
        islands: [
          { id: 'sued', name: 'Süd', coordinates: sued.coordinates },
          { id: 'mitte', name: 'Mitte', coordinates: mitte.coordinates },
          { id: 'athen', name: 'Athen', coordinates: base.coordinates },
        ],
        places: [sued, mitte, base],
        invalidPlaces: [],
        legs: [leg1, leg2],
        variants: [homeVariant],
      },
      trip: {
        currentDay: 10, // = effective deadline (disembark 12 - 1 - buffer 1)
        position: { source: 'manual', lat: sued.coordinates.lat, lon: sued.coordinates.lon, placeId: sued.id },
        plan: null,
        departureHourByDay: {},
        empfohleneAbfahrtByDay: {},
      stopHoursByDay: {},
      },
    });
    // One leg per day would need days 10+11 (> deadline). packLegsFeasible
    // allows two short legs on one day — the arrival-day scan must start at
    // startDay + ceil(legs/2) - 1 = day 10, not at day 11.
    expect(restPlanFeasible([leg1, leg2], 'sued', 10, snapshot)).toBe('feasible');
  });
});

describe('options — deriveDayOptions dedupe over the leg id (FR21)', () => {
  it('identical next leg merges servesRouteIds; a DIFFERENT leg to the same island stays a separate option', () => {
    const snapshot = twoIslandSnapshot({ windKn: 12, windFromDeg: 90 });
    const base = snapshot.library.places[0]!;
    const target = snapshot.library.places[1]!;
    const sharedLeg = snapshot.library.legs[0]!; // athen--zielinsel
    const otherLeg = makeLeg({
      id: 'athen--zielinsel-b',
      fromIslandId: 'athen',
      toIslandId: 'zielinsel',
      fromPlaceId: base.id,
      toPlaceId: target.id,
      distanceNm: 26, // different definition, same target island
    });
    snapshot.library.legs = [sharedLeg, otherLeg];
    snapshot.library.variants = [
      makeVariant('r1', [sharedLeg], { escalationRank: 1, name: 'R1' }),
      makeVariant('r2', [sharedLeg], { escalationRank: 2, name: 'R2' }),
      makeVariant('r3', [otherLeg], { escalationRank: 3, name: 'R3' }),
    ];
    const options = deriveDayOptions(snapshot, 'athen', {}, {});
    const legOptions = options.filter((o) => o.kind === 'leg');
    expect(legOptions).toHaveLength(2);
    const shared = legOptions.find((o) => o.legId === sharedLeg.id)!;
    expect(shared.servesRouteIds.sort()).toEqual(['r1', 'r2']);
    const other = legOptions.find((o) => o.legId === otherLeg.id)!;
    expect(other.servesRouteIds).toEqual(['r3']);
  });
});

describe('ppr — FR19 predicted point of return', () => {
  it('at the base the PPR equals the deadline', () => {
    const snapshot = twoIslandSnapshot({ windKn: 12, windFromDeg: 90 });
    const ppr = predictedPointOfReturn(snapshot, 'athen');
    expect(ppr.latestReturnStartDay).toBe(ppr.effectiveDeadlineDay);
    expect(ppr.remainingDistanceNm).toBe(0);
  });

  it('away from base: latest return start day = deadline (one easy day-leg home)', () => {
    const snapshot = twoIslandSnapshot({ windKn: 12, windFromDeg: 90, currentDay: 3 });
    const ppr = predictedPointOfReturn(snapshot, 'zielinsel');
    // Deadline semantics per review finding H3 (2026-08-02): arrival is due ON
    // the return deadline date. Elf-Tage-Rahmen (Zielmodell v3, 2026-08-07):
    // Stichtag ist Törntag 11, und der PoR hält zusätzlich den Puffertag in
    // Reserve => Tag 10.
    expect(ppr.effectiveDeadlineDay).toBe(10);
    expect(ppr.latestReturnStartDay).toBe(10);
    expect(ppr.remainingDistanceNm).toBe(20);
  });

  it('permanent 28 kn on the nose: return not feasible => latest day null', () => {
    const snapshot = twoIslandSnapshot({ windKn: 28, windFromDeg: 0, currentDay: 3 });
    const ppr = predictedPointOfReturn(snapshot, 'zielinsel');
    expect(ppr.latestReturnStartDay).toBeNull();
  });
});

/**
 * FR9/FR18/FR20 — eine Option ohne Preisschild und ohne Frist ist keine
 * Entscheidungsgrundlage. Diese Fälle halten fest, was jede Option mitbringen
 * muss, damit der Skipper sie überhaupt abwägen kann.
 */
describe('Optionsraum — Ziel, Reichweite, Preis, Frist', () => {
  it('das Ziel IST die Insel — Reichweite ist die Distanz dorthin', () => {
    // ZIELMODELL V3: eine Option ist keine Variante mehr, sondern eine
    // Ziel-Insel. Damit kann der Wendepunkt nicht mehr von der angebotenen
    // Kette abweichen — er IST die Frage.
    const { snapshot } = rundkursScenario();
    const opt = assessTargetOption('fern', 'athen', snapshot);
    expect(opt.turnIslandId).toBe('fern');
    expect(opt.reachNm).toBeGreaterThan(0);
  });

  it('trägt den Namen der ZIEL-INSEL, nicht eine Routen-Id', () => {
    const { snapshot } = rundkursScenario();
    expect(assessTargetOption('fern', 'athen', snapshot).name).toBe('Fern');
  });

  it('ein Plan zu einem Ziel läuft dieses Ziel wirklich an', () => {
    /**
     * DIE INVARIANTE gegen den beanstandeten Fehler ("die Verlängerung nach
     * Santorin führt nicht nach Santorin"): entweder der Plan enthält das
     * Ziel, oder es gibt keinen Plan. Ein Etikett auf einer fremden Kette ist
     * keine dritte Möglichkeit mehr.
     */
    const { snapshot } = rundkursScenario();
    for (const ziel of ['fern', 'mitte']) {
      const opt = assessTargetOption(ziel, 'athen', snapshot);
      if (!opt.plan) continue;
      const ziele = stagesOf(opt.plan).map((s) => s.toIslandId);
      expect(ziele).toContain(ziel);
    }
  });

  it('eine offene Option bringt Preis UND Plan mit', () => {
    const { snapshot } = rundkursScenario();
    const opt = assessTargetOption('mitte', 'athen', snapshot);
    expect(opt.state).not.toBe('zu');
    expect(opt.costLevel).not.toBeNull();
    expect(opt.costNote).toBeTruthy();
    // Der Plan ist da, damit "verfolgen" nicht heisst, ihn selbst zu bauen.
    expect(opt.plan).not.toBeNull();
    expect(opt.turnDay).not.toBeNull();
  });

  it('ohne Position gibt es keine Option und keinen erfundenen Preis', () => {
    const { snapshot } = rundkursScenario();
    const opt = assessTargetOption('fern', null, snapshot);
    expect(opt.state).toBe('zu');
    expect(opt.costLevel).toBeNull();
    expect(opt.plan).toBeNull();
  });
});

/**
 * Die Vorwarnung ist der eigentliche Zweck von FR20. Eine Option, die heute
 * schliesst, ist keine Entscheidung mehr, sondern eine Mitteilung.
 */
describe('Entscheidungspunkte — Vorwarnung statt Nachruf', () => {
  const option = (
    over: Partial<RouteOptionAssessment>,
  ): RouteOptionAssessment => ({
    routeId: 'sued', name: 'Süd-Route', konzeptId: 'klassik', konzeptWarnung: null,
    empfehlung: 'empfohlen', abratenGruende: [],
    state: 'schliesst', closesOnDay: 7,
    ampel: 'gruen', legAssessments: [], reasons: [],
    turnIslandId: 'fern', reachNm: 100, costLevel: 'none',
    costNote: null, plan: null, turnDay: 3, previewIndex: null, ...over,
  });
  const ppr = {
    latestReturnStartDay: null, remainingDistanceNm: null,
    effectiveDeadlineDay: 11, reasons: [],
  };

  it('warnt innerhalb der Vorwarnzeit mit der Zahl der verbleibenden Tage', () => {
    const points = deriveDecisionPoints([option({})], ppr, 4, 4);
    expect(points[0]!.text).toContain('Noch 3 Tage');
    expect(points[0]!.text).toContain('Süd-Route');
  });

  it('am letzten Tag heisst es HEUTE, nicht "noch 0 Tage"', () => {
    const points = deriveDecisionPoints([option({})], ppr, 7, 4);
    expect(points[0]!.text).toContain('HEUTE entscheiden');
  });

  it('ausserhalb der Vorwarnzeit bleibt es der schlichte Termin', () => {
    const points = deriveDecisionPoints([option({})], ppr, 1, 4);
    expect(points[0]!.text).toContain('Bis Tag 7 entscheiden');
    expect(points[0]!.text).not.toContain('Noch');
  });

  it('die Warnung nennt den Preis mit — wer jetzt zieht, soll wissen wofür', () => {
    const points = deriveDecisionPoints(
      [option({ costNote: 'nur mit zwei Nachtetappen' })], ppr, 5, 4,
    );
    expect(points[0]!.text).toContain('nur mit zwei Nachtetappen');
  });

  it('ohne Vorwarnzeit-Angabe verhält sich alles wie bisher', () => {
    const points = deriveDecisionPoints([option({})], ppr);
    expect(points[0]!.text).toContain('Bis Tag 7 entscheiden');
  });
});
