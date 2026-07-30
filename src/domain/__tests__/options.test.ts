import { describe, expect, it } from 'vitest';
import { assessRouteOption } from '../options.ts';
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
      returnByEveOfDay: opts.tripLengthDays,
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

  it('feasible now, later days beyond the horizon: offen (mit Vorbehalt erst, wenn heute unklar)', () => {
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
    // Today's rest plan is fully computable within the horizon => offen;
    // no closing day can be claimed because later starts are unassessed.
    expect(result.state).toBe('offen');
    expect(result.closesOnDay).toBeNull();
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
    // deadline = returnByEveOfDay(12) - 1 - buffer(1) = 10; leg takes ~3 h.
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
