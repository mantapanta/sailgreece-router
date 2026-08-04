/**
 * Fixtures for the persistence assumption (domain/persistence.ts).
 * Core requirement: a forecast that does not cover the second half of the trip
 * must NOT silence the router. It must produce a route under a stated,
 * per-hour-flagged assumption — and it must never invent data where there is
 * no basis at all.
 */

import { describe, expect, it } from 'vitest';
import { applyPersistenceAssumption } from '../persistence.ts';
import { assessPlanning } from '../assess.ts';
import { assessLeg } from '../scoring.ts';
import type { PlanningSnapshot, PointForecast } from '../schema/snapshot.ts';
import {
  TEST_POLAR,
  TRIP_START,
  constantForecast,
  makeLeg,
  makePlace,
  makeSnapshot,
  makeTimes,
} from './fixtures.ts';

/** Hourly series built from a callback over the UTC hour-of-day. */
function seriesByHourOfDay(
  hours: number,
  fn: (hourOfDay: number, dayIdx: number) => number | null,
): (number | null)[] {
  return Array.from({ length: hours }, (_, i) => fn(i % 24, Math.floor(i / 24)));
}

function forecastFrom(
  hours: number,
  wind: (h: number, d: number) => number | null,
  dir: (h: number, d: number) => number | null,
): PointForecast {
  return {
    windKn: seriesByHourOfDay(hours, wind),
    windDirDeg: seriesByHourOfDay(hours, dir),
    gustKn: seriesByHourOfDay(hours, (h, d) => {
      const v = wind(h, d);
      return v === null ? null : v * 1.3;
    }),
    waveM: seriesByHourOfDay(hours, () => 0.3),
    waveDirDeg: seriesByHourOfDay(hours, dir),
    wavePeriodS: seriesByHourOfDay(hours, () => 4),
    windAssumed: Array(hours).fill(false),
    waveAssumed: Array(hours).fill(false),
  };
}

/** North-south leg with a SHORT forecast axis (4 of 12 trip days covered). */
function shortAxisScenario(opts: {
  windAt?: (hourOfDay: number, dayIdx: number) => number | null;
  dirAt?: (hourOfDay: number, dayIdx: number) => number | null;
  forecastDays?: number;
}) {
  const days = opts.forecastDays ?? 4;
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
  const times = makeTimes(days);
  const fc = forecastFrom(
    times.length,
    opts.windAt ?? (() => 12),
    opts.dirAt ?? (() => 90),
  );
  const leg = makeLeg({
    fromPlaceId: north.id,
    toPlaceId: south.id,
    fromIslandId: 'startinsel',
    toIslandId: 'zielinsel',
    distanceNm: 24,
  });
  const snapshot = makeSnapshot({
    times,
    polar: TEST_POLAR,
    forecast: { [north.id]: fc, [south.id]: fc },
    library: {
      islands: [
        { id: 'startinsel', name: 'Startinsel', coordinates: north.coordinates },
        { id: 'zielinsel', name: 'Zielinsel', coordinates: south.coordinates },
      ],
      places: [north, south],
      invalidPlaces: [],
      routes: [],
    },
  });
  return { snapshot, leg, north, south };
}

describe('persistence assumption', () => {
  it('extends the hour axis over the whole trip', () => {
    const { snapshot } = shortAxisScenario({});
    expect(snapshot.times).toHaveLength(4 * 24);

    const { snapshot: extended, info } = applyPersistenceAssumption(snapshot);
    // Trip is 12 days: the axis must reach past the last trip day.
    expect(extended.times.length).toBeGreaterThan(12 * 24);
    expect(info.appendedHours).toBeGreaterThan(0);
    expect(info.horizonIso).toBe(snapshot.times[snapshot.times.length - 1]);
    expect(info.profileDays).toBe(4);
  });

  it('THE point of the whole thing: a leg beyond the horizon gets a real verdict, flagged as assumption', () => {
    const { snapshot, leg } = shortAxisScenario({});

    // Without the assumption: no statement at all.
    expect(assessLeg(leg, 9, snapshot).ampel).toBe('unbewertet');

    // With it: a real ampel, marked as resting on the assumption.
    const { snapshot: extended } = applyPersistenceAssumption(snapshot);
    const assessed = assessLeg(leg, 9, extended);
    expect(assessed.ampel).not.toBe('unbewertet');
    expect(assessed.basis).toBe('annahme');
    expect(assessed.totalHours).toBeGreaterThan(0);
    expect(assessed.reasons.join(' ')).toContain('Persistenz-Annahme');
  });

  it('keeps the diurnal cycle instead of flattening it (Meltemi builds in the afternoon)', () => {
    // 8 kn in the morning, 20 kn in the afternoon — the shape that decides legs.
    const { snapshot } = shortAxisScenario({
      windAt: (hourOfDay) => (hourOfDay < 12 ? 8 : 20),
    });
    const { snapshot: extended } = applyPersistenceAssumption(snapshot);

    // Trip day 9 (0-based hour offset 8*24) is entirely assumed.
    const morningIdx = 8 * 24 + 3;
    const afternoonIdx = 8 * 24 + 15;
    const fc = extended.forecast['start-hafen']!;
    expect(fc.windAssumed[morningIdx]).toBe(true);
    expect(fc.windAssumed[afternoonIdx]).toBe(true);
    expect(fc.windKn[morningIdx]).toBeCloseTo(8, 5);
    expect(fc.windKn[afternoonIdx]).toBeCloseTo(20, 5);
  });

  it('averages wind direction as a vector, so 350° and 10° give north — not south', () => {
    // Same hour-of-day, alternating direction ACROSS days: 350° on even days,
    // 10° on odd ones. That is what lands in one profile bucket.
    const { snapshot } = shortAxisScenario({
      dirAt: (_hourOfDay, dayIdx) => (dayIdx % 2 === 0 ? 350 : 10),
    });
    const { snapshot: extended } = applyPersistenceAssumption(snapshot);
    const dir = extended.forecast['start-hafen']!.windDirDeg[9 * 24 + 6]!;
    // Vector mean of 350/10 is 0; a naive arithmetic mean would say 180.
    const offNorth = Math.min(dir, 360 - dir);
    expect(offNorth).toBeLessThan(1);
  });

  it('never overwrites real forecast hours and never flags them as assumed', () => {
    const { snapshot } = shortAxisScenario({
      windAt: (hourOfDay) => (hourOfDay < 12 ? 8 : 20),
    });
    const before = snapshot.forecast['start-hafen']!.windKn.slice();
    const { snapshot: extended } = applyPersistenceAssumption(snapshot);
    const after = extended.forecast['start-hafen']!;
    for (let i = 0; i < before.length; i++) {
      expect(after.windKn[i]).toBe(before[i]);
      expect(after.windAssumed[i]).toBe(false);
    }
  });

  it('fills marine gaps INSIDE the axis (marine horizon < weather horizon)', () => {
    const { snapshot } = shortAxisScenario({});
    // Waves only for the first two days, wind for all four.
    const fc = snapshot.forecast['start-hafen']!;
    for (let i = 2 * 24; i < fc.waveM.length; i++) {
      fc.waveM[i] = null;
      fc.waveDirDeg[i] = null;
    }
    const { snapshot: extended } = applyPersistenceAssumption(snapshot);
    const filled = extended.forecast['start-hafen']!;
    expect(filled.waveM[3 * 24 + 5]).toBeCloseTo(0.3, 5);
    expect(filled.waveAssumed[3 * 24 + 5]).toBe(true);
    // The wind of that same hour is real and must stay unflagged.
    expect(filled.windAssumed[3 * 24 + 5]).toBe(false);
  });

  it('invents nothing where there is no basis: an all-null location stays unbewertet', () => {
    const { snapshot, leg } = shortAxisScenario({});
    snapshot.forecast['ziel-bucht'] = constantForecast(
      snapshot.times.length,
      null,
      null,
      null,
      null,
    );
    const { snapshot: extended } = applyPersistenceAssumption(snapshot);
    expect(extended.forecast['ziel-bucht']!.windKn[10]).toBeNull();
    expect(extended.forecast['ziel-bucht']!.windAssumed[10]).toBe(false);
    // The leg touches that place, so it cannot be judged — visibly, not silently.
    expect(assessLeg(leg, 1, extended).ampel).toBe('unbewertet');
  });

  it('a forecast covering the whole trip is left alone (basis stays forecast)', () => {
    const { snapshot, leg } = shortAxisScenario({ forecastDays: 14 });
    const { info } = applyPersistenceAssumption(snapshot);
    expect(info.appendedHours).toBe(0);
    const { snapshot: extended } = applyPersistenceAssumption(snapshot);
    expect(assessLeg(leg, 9, extended).basis).toBe('forecast');
  });
});

describe('assessPlanning wires the assumption in', () => {
  function planningSnapshot(): PlanningSnapshot {
    const { snapshot, north, south, leg } = shortAxisScenario({});
    snapshot.library.routes = [
      {
        id: 'testroute',
        name: 'Testroute',
        escalationRank: 1,
        isReturnChain: false,
        legs: [leg],
      },
    ];
    snapshot.trip = {
      currentDay: 1,
      position: { source: 'manual', lat: north.coordinates.lat, lon: north.coordinates.lon, placeId: north.id },
      trackedRouteId: 'testroute',
      departureHourOverride: null,
    };
    void south;
    return snapshot;
  }

  it('reports the horizon, the first assumed day and a description', () => {
    const assessment = assessPlanning(planningSnapshot());
    expect(assessment.forecastHorizonIso).not.toBeNull();
    expect(assessment.assumedFromDay).not.toBeNull();
    expect(assessment.assumptionNote).toContain('Tagesgang');
  });

  it('night ampeln beyond the horizon are decided, not blank', () => {
    const assessment = assessPlanning(planningSnapshot());
    // Night 8 lies far beyond the 4-day forecast.
    const night = assessment.nightAmpeln['start-hafen']?.[8];
    expect(night).toBeDefined();
    expect(night!.ampel).not.toBe('unbewertet');
    expect(night!.basis).toBe('annahme');
  });

  it('every leg assessment carries a non-empty derivation', () => {
    const assessment = assessPlanning(planningSnapshot());
    const legs = assessment.routeOptions.flatMap((o) => o.legAssessments);
    expect(legs.length).toBeGreaterThan(0);
    for (const la of legs) {
      expect(la.rationale.length).toBeGreaterThan(3);
      expect(la.rationale.join(' ')).toContain('Tagesbudget');
      expect(la.rationale.join(' ')).toContain('Datenbasis');
    }
  });

  it('day options and route options expose their reasoning', () => {
    const assessment = assessPlanning(planningSnapshot());
    expect(assessment.routeOptions[0]!.rationale.join(' ')).toContain('Restplan');
    expect(assessment.ppr.rationale.join(' ')).toContain('Stichtag');
    const legOption = assessment.dayOptions.find((o) => o.kind === 'leg');
    expect(legOption?.leg?.rationale.length).toBeGreaterThan(0);
  });
});

describe('leg rationale content', () => {
  it('names window, wind band, speed model, governing point and data basis', () => {
    const { snapshot, leg } = shortAxisScenario({ forecastDays: 14 });
    const text = assessLeg(leg, 2, snapshot).rationale.join('\n');
    expect(text).toContain('Fenster: Abfahrt an Törntag 2');
    expect(text).toContain('Generalkurs');
    expect(text).toContain('Wind im Etappenfenster');
    expect(text).toContain('Polare');
    expect(text).toContain('Tagesbudget');
    expect(text).toContain('Strengste Stelle der Windregel');
    expect(text).toContain('Gesamt-Ampel');
    expect(text).toContain('Datenbasis: alle');
  });

  it('names the point AND hour that turns a leg red (25 kn upwind rule)', () => {
    // Beating north against a 28 kn northerly: red, and the rationale must say
    // where that verdict comes from.
    const { snapshot } = shortAxisScenario({
      forecastDays: 14,
      windAt: () => 28,
      dirAt: () => 0,
    });
    const northbound = makeLeg({
      fromPlaceId: 'ziel-bucht',
      toPlaceId: 'start-hafen',
      fromIslandId: 'zielinsel',
      toIslandId: 'startinsel',
      distanceNm: 24,
    });
    const assessed = assessLeg(northbound, 2, snapshot);
    expect(assessed.ampel).toBe('rot');
    const text = assessed.rationale.join('\n');
    expect(text).toContain('Strengste Stelle der Windregel');
    expect(text).toContain('28 kn');
    expect(text).toContain('Windregel');
  });
});

describe('trip start date is respected', () => {
  it('the extended axis covers the configured trip length, not a fixed 10 days', () => {
    const { snapshot } = shortAxisScenario({});
    snapshot.params = { ...snapshot.params, tripLengthDays: 12, disembarkDay: 12 };
    const { snapshot: extended } = applyPersistenceAssumption(snapshot);
    const lastMs = Date.parse(extended.times[extended.times.length - 1]!);
    const tripEndMs = Date.parse(`${TRIP_START}T00:00:00Z`) + 12 * 24 * 3600_000;
    expect(lastMs).toBeGreaterThanOrEqual(tripEndMs);
  });
});
