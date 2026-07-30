import { describe, expect, it } from 'vitest';
import { assessRouteOption, deriveDayOptions, restPlanFeasible } from '../options.ts';
import { predictedPointOfReturn } from '../ppr.ts';
import type { Route } from '../schema/route.ts';
import {
  constantForecast,
  makeLeg,
  makePlace,
  makeSnapshot,
  makeTimes,
} from './fixtures.ts';
import { TEST_POLAR } from './fixtures.ts';
import type { PlanningSnapshot } from '../schema/snapshot.ts';

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
  const routes: Route[] = [
    {
      id: 'sued-route',
      name: 'Süd-Route',
      escalationRank: 1,
      legs: [outLeg],
      isReturnChain: false,
    },
    {
      id: 'rueckfallkette-west',
      name: 'Rückfallkette West',
      escalationRank: 0,
      legs: [backLeg],
      isReturnChain: true,
    },
  ];
  const times = makeTimes(12);
  const fc = constantForecast(times.length, opts.windKn, opts.windFromDeg);
  const snapshot = makeSnapshot({
    times,
    polar: TEST_POLAR,
    forecast: { [base.id]: fc, [target.id]: fc },
    library: {
      islands: [
        { id: 'athen', name: 'Athen', coordinates: base.coordinates },
        { id: 'zielinsel', name: 'Zielinsel', coordinates: target.coordinates },
      ],
      places: [base, target],
      invalidPlaces: [],
      routes,
    },
    trip: {
      currentDay: opts.currentDay ?? 1,
      position: { source: 'manual', lat: base.coordinates.lat, lon: base.coordinates.lon, placeId: base.id },
      trackedRouteId: null,
      departureHourOverride: null,
    },
  });
  if (opts.tripLengthDays) {
    snapshot.params = {
      ...snapshot.params,
      tripLengthDays: opts.tripLengthDays,
      disembarkDay: opts.tripLengthDays,
    };
  }
  return snapshot;
}

describe('options — FR18 open / closes / closed', () => {
  it('gentle broad-reach wind, full forecast axis: option closes on the last startable day (FR18)', () => {
    // Axis covers the whole trip, so the calendar limit is computable: the
    // last day to sail out AND still return by the deadline (day 10) is day 9.
    const snapshot = twoIslandSnapshot({ windKn: 12, windFromDeg: 90 });
    const route = snapshot.library.routes[0]!;
    const result = assessRouteOption(route, 'athen', snapshot);
    expect(result.state).toBe('schliesst');
    expect(result.closesOnDay).toBe(9);
  });

  it('feasible now, closing-day scan hits the horizon: offen-horizont with visible caveat', () => {
    const snapshot = twoIslandSnapshot({ windKn: 12, windFromDeg: 90 });
    snapshot.times = snapshot.times.slice(0, 4 * 24); // horizon: 4 days only
    for (const key of Object.keys(snapshot.forecast)) {
      const fc = snapshot.forecast[key]!;
      for (const k of Object.keys(fc) as (keyof typeof fc)[]) {
        fc[k] = fc[k].slice(0, 4 * 24);
      }
    }
    const route = snapshot.library.routes[0]!;
    const result = assessRouteOption(route, 'athen', snapshot);
    // Today's rest plan is fully computable within the horizon, but the
    // closing day may lie just beyond it — that is NOT an unqualified
    // 'offen' (I/O-Matrix: horizon cases need a visible caveat).
    expect(result.state).toBe('offen-horizont');
    expect(result.closesOnDay).toBeNull();
    expect(result.reasons.join(' ')).toContain('Schließtag');
  });

  it("today's rest plan itself crosses the horizon: offen-horizont (first-class state)", () => {
    const snapshot = twoIslandSnapshot({ windKn: 12, windFromDeg: 90 });
    snapshot.times = snapshot.times.slice(0, 30); // horizon: 30 h only
    for (const key of Object.keys(snapshot.forecast)) {
      const fc = snapshot.forecast[key]!;
      for (const k of Object.keys(fc) as (keyof typeof fc)[]) {
        fc[k] = fc[k].slice(0, 30);
      }
    }
    const route = snapshot.library.routes[0]!;
    const result = assessRouteOption(route, 'athen', snapshot);
    // Outbound today fits the axis, the return leg does not: the whole rest
    // plan is only assessable up to the horizon.
    expect(result.state).toBe('offen-horizont');
    expect(result.reasons.join(' ')).toContain('Horizont');
  });

  it('permanent 28 kn northerly makes the northbound return impossible: option zu', () => {
    // Outbound south is fine, but the return leg north beats against 28 kn.
    const snapshot = twoIslandSnapshot({ windKn: 28, windFromDeg: 0 });
    const route = snapshot.library.routes[0]!;
    const result = assessRouteOption(route, 'athen', snapshot);
    expect(result.state).toBe('zu');
  });

  it('no position => zu with reason', () => {
    const snapshot = twoIslandSnapshot({ windKn: 12, windFromDeg: 90 });
    const route = snapshot.library.routes[0]!;
    const result = assessRouteOption(route, null, snapshot);
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
    const route: Route = {
      id: 'heimweg',
      name: 'Heimweg',
      escalationRank: 1,
      legs: [leg1, leg2],
      isReturnChain: false,
    };
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
        routes: [route],
      },
      trip: {
        currentDay: 10, // = effective deadline (disembark 12 - 1 - buffer 1)
        position: { source: 'manual', lat: sued.coordinates.lat, lon: sued.coordinates.lon, placeId: sued.id },
        trackedRouteId: null,
        departureHourOverride: null,
      },
    });
    // One leg per day would need days 10+11 (> deadline). packLegsFeasible
    // allows two short legs on one day — the arrival-day scan must start at
    // startDay + ceil(legs/2) - 1 = day 10, not at day 11.
    expect(restPlanFeasible(route, 'sued', 10, snapshot)).toBe('feasible');
  });
});

describe('options — deriveDayOptions dedupe over the leg id (FR21)', () => {
  it('identical next leg merges servesRouteIds; a DIFFERENT leg to the same island stays a separate option', () => {
    const snapshot = twoIslandSnapshot({ windKn: 12, windFromDeg: 90 });
    const base = snapshot.library.places[0]!;
    const target = snapshot.library.places[1]!;
    const sharedLeg = snapshot.library.routes[0]!.legs[0]!; // athen--zielinsel
    const otherLeg = makeLeg({
      id: 'athen--zielinsel-b',
      fromIslandId: 'athen',
      toIslandId: 'zielinsel',
      fromPlaceId: base.id,
      toPlaceId: target.id,
      distanceNm: 26, // different definition, same target island
    });
    snapshot.library.routes = [
      { id: 'r1', name: 'R1', escalationRank: 1, legs: [sharedLeg], isReturnChain: false },
      { id: 'r2', name: 'R2', escalationRank: 2, legs: [sharedLeg], isReturnChain: false },
      { id: 'r3', name: 'R3', escalationRank: 3, legs: [otherLeg], isReturnChain: false },
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
    // deadline = disembarkDay(12) - 1 - buffer(1) = 10; leg takes ~3 h.
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
