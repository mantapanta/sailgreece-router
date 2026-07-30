/** Shared test fixtures — pure data, built by hand (no adapters involved). */

import type { Place } from '../schema/place.ts';
import type { Polar } from '../schema/polar.ts';
import type { Leg, Route } from '../schema/route.ts';
import type {
  PlanningSnapshot,
  PointForecast,
} from '../schema/snapshot.ts';
import { DEFAULT_PARAMS } from '../schema/params.ts';

export const TRIP_START = '2026-08-08';

/** Hourly UTC axis over `days` days starting at trip start 00:00 UTC. */
export function makeTimes(days = 5): string[] {
  const start = Date.parse(`${TRIP_START}T00:00:00Z`);
  const times: string[] = [];
  for (let h = 0; h < days * 24; h++) {
    times.push(new Date(start + h * 3600_000).toISOString());
  }
  return times;
}

/** Constant forecast series over the whole axis. */
export function constantForecast(
  hours: number,
  windKn: number | null,
  windDirDeg: number | null,
  waveM: number | null = 0.3,
  waveDirDeg: number | null = windDirDeg,
): PointForecast {
  return {
    windKn: Array(hours).fill(windKn),
    windDirDeg: Array(hours).fill(windDirDeg),
    gustKn: Array(hours).fill(windKn === null ? null : windKn * 1.3),
    waveM: Array(hours).fill(waveM),
    waveDirDeg: Array(hours).fill(waveDirDeg),
    wavePeriodS: Array(hours).fill(waveM === null ? null : 4),
  };
}

export function makePlace(overrides: Partial<Place> & { id: string }): Place {
  return {
    islandId: 'testinsel',
    name: overrides.id,
    type: 'bucht',
    coordinates: { lat: 37.0, lon: 24.5 },
    qualities: { schoenheit: 3, restaurant: 2, badestrand: 2 },
    shelter: {
      windSectors: [{ fromDeg: 0, toDeg: 360, maxKn: 40 }],
      waveSectors: [{ fromDeg: 0, toDeg: 360, maxM: 2 }],
      sourceNote: 'fixture',
    },
    ...overrides,
  };
}

/** Small analytic polar for interpolation tests. */
export const TEST_POLAR: Polar = {
  twaDeg: [0, 60, 90, 120, 180],
  twsKn: [4, 10, 25],
  speeds: [
    [0.0, 0.0, 0.0],
    [3.4, 6.8, 7.7],
    [3.9, 7.8, 9.6],
    [3.6, 7.5, 9.8],
    [1.5, 4.1, 6.0],
  ],
  sourceNote: 'fixture',
};

export function makeLeg(overrides: Partial<Leg> = {}): Leg {
  return {
    id: 'start--ziel',
    fromIslandId: 'startinsel',
    toIslandId: 'zielinsel',
    fromPlaceId: 'start-hafen',
    toPlaceId: 'ziel-bucht',
    distanceNm: 20,
    waypoints: [],
    windWarnings: [],
    ...overrides,
  };
}

export function makeSnapshot(
  overrides: Partial<PlanningSnapshot> = {},
): PlanningSnapshot {
  const times = overrides.times ?? makeTimes();
  return {
    fetchedAtIso: '2026-08-08T05:00:00Z',
    modelRunIso: '2026-08-08T00:00:00Z',
    model: 'ecmwf_ifs025',
    times,
    forecast: {},
    library: { islands: [], places: [], invalidPlaces: [], routes: [] },
    polar: null,
    params: { ...DEFAULT_PARAMS, tripStartDate: TRIP_START },
    trip: {
      currentDay: 1,
      position: null,
      trackedRouteId: null,
      departureHourOverride: null,
    },
    ...overrides,
  };
}

/**
 * North-south leg fixture: start at lat 37.4, destination due south at 37.0
 * (course ~180). With wind from N (0) that is downwind; sailing NORTH on the
 * reversed leg against a northerly is beating.
 */
export function northSouthScenario(opts: {
  windKn: number;
  windFromDeg: number;
  distanceNm?: number;
  polar?: Polar | null;
  southbound?: boolean;
}): { snapshot: PlanningSnapshot; leg: Leg } {
  const distance = opts.distanceNm ?? 20;
  const north = makePlace({
    id: 'start-hafen',
    islandId: 'startinsel',
    coordinates: { lat: 37.4, lon: 24.5 },
  });
  const south = makePlace({
    id: 'ziel-bucht',
    islandId: 'zielinsel',
    coordinates: { lat: 37.0, lon: 24.5 },
  });
  const southbound = opts.southbound ?? true;
  const leg = makeLeg({
    fromPlaceId: southbound ? north.id : south.id,
    toPlaceId: southbound ? south.id : north.id,
    fromIslandId: southbound ? 'startinsel' : 'zielinsel',
    toIslandId: southbound ? 'zielinsel' : 'startinsel',
    distanceNm: distance,
  });
  const times = makeTimes();
  const fc = constantForecast(times.length, opts.windKn, opts.windFromDeg);
  const snapshot = makeSnapshot({
    times,
    polar: opts.polar === undefined ? TEST_POLAR : opts.polar,
    forecast: { [north.id]: fc, [south.id]: fc },
    library: {
      islands: [
        { id: 'startinsel', name: 'Startinsel', coordinates: north.coordinates },
        { id: 'zielinsel', name: 'Zielinsel', coordinates: south.coordinates },
      ],
      places: [north, south],
      invalidPlaces: [],
      routes: [] as Route[],
    },
  });
  return { snapshot, leg };
}
