import { describe, expect, it } from 'vitest';
import {
  packLegsFeasible,
  predictedPointOfReturn,
  returnFeasibleStarting,
} from '../ppr.ts';

import type { PlanningSnapshot, PointForecast } from '../schema/snapshot.ts';
import {
  constantForecast,
  makeLeg,
  makePlace,
  makeSnapshot,
  makeTimes,
  TEST_POLAR,
  makeVariant,
} from './fixtures.ts';

/**
 * Three-island world for the reversed-connector regression:
 * base athen — chain island naxos — extension island amorgos.
 * The curated leg naxos--amorgos (WITH a waypoint) is stored in OUTBOUND
 * direction only; the return chain is naxos -> athen. Full forecast coverage
 * exists for every place and for the stored waypoint key leg:naxos--amorgos:0
 * — and for NOTHING else (exactly what collectLocations fetches).
 */
function amorgosWorld(): PlanningSnapshot {
  const base = makePlace({
    id: 'athen-alimos',
    islandId: 'athen',
    coordinates: { lat: 37.9, lon: 23.7 },
  });
  const naxos = makePlace({
    id: 'naxos-hafen',
    islandId: 'naxos',
    coordinates: { lat: 37.1, lon: 25.37 },
  });
  const amorgos = makePlace({
    id: 'amorgos-katapola',
    islandId: 'amorgos',
    coordinates: { lat: 36.83, lon: 25.86 },
  });
  const naxosAmorgos = makeLeg({
    id: 'naxos--amorgos',
    fromIslandId: 'naxos',
    toIslandId: 'amorgos',
    fromPlaceId: naxos.id,
    toPlaceId: amorgos.id,
    distanceNm: 15,
    waypoints: [{ lat: 36.95, lon: 25.6 }],
  });
  const naxosAthen = makeLeg({
    id: 'naxos--athen',
    fromIslandId: 'naxos',
    toIslandId: 'athen',
    fromPlaceId: naxos.id,
    toPlaceId: base.id,
    distanceNm: 20,
  });
  const legs = [naxosAmorgos, naxosAthen];
  const variants = [
    makeVariant('verlaengerung-amorgos', [naxosAmorgos], {
      escalationRank: 3,
      name: 'Verlängerung Amorgos',
    }),
    makeVariant('rueckfallkette-west', [naxosAthen], {
      escalationRank: 0,
      isReturnChain: true,
      name: 'Rückfallkette West',
    }),
  ];
  const times = makeTimes(12);
  const fc = constantForecast(times.length, 12, 90);
  return makeSnapshot({
    times,
    polar: TEST_POLAR,
    forecast: {
      [base.id]: fc,
      [naxos.id]: fc,
      [amorgos.id]: fc,
      // ONLY the stored direction's waypoint key exists (AD-3):
      'leg:naxos--amorgos:0': fc,
    },
    library: {
      islands: [
        { id: 'athen', name: 'Athen', coordinates: base.coordinates },
        { id: 'naxos', name: 'Naxos', coordinates: naxos.coordinates },
        { id: 'amorgos', name: 'Amorgos', coordinates: amorgos.coordinates },
      ],
      places: [base, naxos, amorgos],
      invalidPlaces: [],
      legs,
      variants,
    },
    trip: {
      currentDay: 2,
      position: {
        source: 'manual',
        lat: amorgos.coordinates.lat,
        lon: amorgos.coordinates.lon,
        placeId: amorgos.id,
      },
      plan: null,
      departureHourByDay: {},
      empfohleneAbfahrtByDay: {},
      stopHoursByDay: {},
    },
  });
}

describe('ppr — reversed connector legs keep the ORIGINAL forecast keys', () => {
  it('regression: return from Amorgos with FULL forecast coverage is feasible (not horizon)', () => {
    const snapshot = amorgosWorld();
    // Amorgos is not on the chain: the connector naxos--amorgos is used
    // REVERSED. Its waypoint must be looked up under leg:naxos--amorgos:0
    // (mirrored index), never under the never-fetched leg:amorgos--naxos:0.
    expect(returnFeasibleStarting('amorgos', 2, snapshot)).toBe('feasible');
  });

  it('regression: PPR from Amorgos carries no horizon caveat and finds a return day', () => {
    const snapshot = amorgosWorld();
    const ppr = predictedPointOfReturn(snapshot, 'amorgos');
    expect(ppr.latestReturnStartDay).not.toBeNull();
    expect(ppr.reasons.join(' ')).not.toContain('Horizont');
    expect(ppr.remainingDistanceNm).toBe(35);
  });
});

/**
 * Double-leg-day world: three islands stacked south -> north, two short
 * northbound legs. Wind always FROM north (beating), so afternoon build-up
 * hits the second leg only if it is simulated from the REAL arrival time.
 */
function doubleLegWorld(opts: { afternoon28kn: boolean }): {
  snapshot: PlanningSnapshot;
  legs: [ReturnType<typeof makeLeg>, ReturnType<typeof makeLeg>];
} {
  const a = makePlace({
    id: 'sued-hafen',
    islandId: 'sued',
    coordinates: { lat: 37.0, lon: 24.5 },
  });
  const b = makePlace({
    id: 'mitte-hafen',
    islandId: 'mitte',
    coordinates: { lat: 37.2, lon: 24.5 },
  });
  const c = makePlace({
    id: 'nord-hafen',
    islandId: 'nord',
    coordinates: { lat: 37.4, lon: 24.5 },
  });
  const legAB = makeLeg({
    id: 'sued--mitte',
    fromIslandId: 'sued',
    toIslandId: 'mitte',
    fromPlaceId: a.id,
    toPlaceId: b.id,
    distanceNm: 12,
  });
  const legBC = makeLeg({
    id: 'mitte--nord',
    fromIslandId: 'mitte',
    toIslandId: 'nord',
    fromPlaceId: b.id,
    toPlaceId: c.id,
    distanceNm: 12,
  });
  const times = makeTimes(12);
  const mkFc = (): PointForecast => {
    const fc = constantForecast(times.length, 12, 0);
    if (opts.afternoon28kn) {
      for (let i = 0; i < times.length; i++) {
        if (i % 24 >= 9) fc.windKn[i] = 28; // from 09:00 UTC (12:00 Athens)
      }
    }
    return fc;
  };
  const snapshot = makeSnapshot({
    times,
    polar: TEST_POLAR,
    forecast: { [a.id]: mkFc(), [b.id]: mkFc(), [c.id]: mkFc() },
    library: {
      islands: [
        { id: 'sued', name: 'Süd', coordinates: a.coordinates },
        { id: 'mitte', name: 'Mitte', coordinates: b.coordinates },
        { id: 'nord', name: 'Nord', coordinates: c.coordinates },
      ],
      places: [a, b, c],
      invalidPlaces: [],
      legs: [],
      variants: [],
    },
  });
  return { snapshot, legs: [legAB, legBC] };
}

describe('ppr — packLegsFeasible simulates the second day-leg from the REAL arrival time', () => {
  it('all-day gentle wind: two short legs fit into one day (deadline forces the double day)', () => {
    const { snapshot, legs } = doubleLegWorld({ afternoon28kn: false });
    expect(packLegsFeasible(legs, 3, 3, snapshot)).toBe('feasible');
  });

  it('afternoon 28 kn on the nose kills the SECOND leg although a 09:00 start would look fine', () => {
    const { snapshot, legs } = doubleLegWorld({ afternoon28kn: true });
    // First leg (dep. 09:00 Athens = 06:00 UTC, ~3 h) stays in gentle morning
    // wind. The second leg starts at the real arrival (~09:00 UTC) and runs
    // straight into the 28-kn build-up => beating rot => no double day, and
    // the deadline leaves no single-leg alternative.
    expect(packLegsFeasible(legs, 3, 3, snapshot)).toBe('infeasible');
  });
});
