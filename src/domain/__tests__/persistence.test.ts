/**
 * Fixtures for the persistence assumption (domain/persistence.ts).
 *
 * AD-13 REVISED: the far range is computed instead of silenced. What these
 * fixtures guard is that the assumption stays HONEST — it declares itself per
 * hour, it never overwrites real data, and it invents nothing where there is
 * no basis at all. Those three properties are what separate a usable estimate
 * from the false precision the original rule was protecting against.
 */

import { describe, expect, it } from 'vitest';
import { applyPersistenceAssumption } from '../persistence.ts';
import { assessPlanning } from '../assess.ts';
import { assessLeg } from '../scoring.ts';
import type { PlanningSnapshot, PointForecast } from '../schema/snapshot.ts';
import { RETURN_CHAIN_ROUTE_ID } from '../schema/route.ts';
import {
  TEST_POLAR,
  TRIP_START,
  constantForecast,
  makeLeg,
  makePlace,
  makeSnapshot,
  makeTimes,
  makeVariant,
} from './fixtures.ts';

/** Hourly series from a callback over (hour-of-day, day index). */
function forecastFrom(
  hours: number,
  wind: (hourOfDay: number, dayIdx: number) => number | null,
  dir: (hourOfDay: number, dayIdx: number) => number | null,
): PointForecast {
  const build = (fn: (h: number, d: number) => number | null) =>
    Array.from({ length: hours }, (_, i) => fn(i % 24, Math.floor(i / 24)));
  return {
    windKn: build(wind),
    windDirDeg: build(dir),
    waveM: build(() => 0.3),
    waveDirDeg: build(dir),
    wavePeriodS: build(() => 4),
    windAssumed: Array(hours).fill(false),
    waveAssumed: Array(hours).fill(false),
  };
}

/** Base plus one island south; forecast axis covers only `days` of the 12-day trip. */
function shortAxis(
  opts: {
    days?: number;
    windAt?: (hourOfDay: number, dayIdx: number) => number | null;
    dirAt?: (hourOfDay: number, dayIdx: number) => number | null;
  } = {},
) {
  const days = opts.days ?? 4;
  const base = makePlace({
    id: 'athen-alimos',
    islandId: 'athen',
    coordinates: { lat: 37.9, lon: 23.7 },
  });
  const south = makePlace({
    id: 'kea-vourkari',
    islandId: 'kea',
    coordinates: { lat: 37.5, lon: 23.7 },
  });
  const out = makeLeg({
    id: 'athen--kea',
    fromIslandId: 'athen',
    toIslandId: 'kea',
    fromPlaceId: base.id,
    toPlaceId: south.id,
    distanceNm: 24,
  });
  const back = makeLeg({
    id: 'kea--athen',
    fromIslandId: 'kea',
    toIslandId: 'athen',
    fromPlaceId: south.id,
    toPlaceId: base.id,
    distanceNm: 24,
  });
  const times = makeTimes(days);
  const fc = forecastFrom(
    times.length,
    opts.windAt ?? (() => 12),
    opts.dirAt ?? (() => 90),
  );
  const snapshot = makeSnapshot({
    times,
    polar: TEST_POLAR,
    forecast: { [base.id]: fc, [south.id]: fc },
    library: {
      islands: [
        { id: 'athen', name: 'Athen (Basis)', coordinates: base.coordinates },
        { id: 'kea', name: 'Kea', coordinates: south.coordinates },
      ],
      places: [base, south],
      invalidPlaces: [],
      legs: [out, back],
      variants: [
        makeVariant('sued', [out], { escalationRank: 1 }),
        makeVariant(RETURN_CHAIN_ROUTE_ID, [back], {
          escalationRank: 0,
          isReturnChain: true,
        }),
      ],
    },
  });
  snapshot.trip = {
    ...snapshot.trip,
    position: {
      source: 'manual',
      lat: base.coordinates.lat,
      lon: base.coordinates.lon,
      placeId: base.id,
    },
  };
  return { snapshot, out, back };
}

describe('persistence assumption', () => {
  it('extends the hour axis over the whole trip', () => {
    const { snapshot } = shortAxis();
    expect(snapshot.times).toHaveLength(4 * 24);

    const { snapshot: ext, info } = applyPersistenceAssumption(snapshot);
    // Elf-Tage-Rahmen (Zielmodell v3): die Achse wird bis zum Stichtag
    // verlängert, nicht bis zu einer festen Zahl.
    expect(ext.times.length).toBeGreaterThan(10 * 24);
    expect(info.appendedHours).toBeGreaterThan(0);
    expect(info.horizonIso).toBe(snapshot.times[snapshot.times.length - 1]);
    expect(info.profileDays).toBe(4);
  });

  it('THE point: a leg past the horizon gets a real verdict, declared as assumption', () => {
    const { snapshot, out } = shortAxis();
    const { snapshot: ext } = applyPersistenceAssumption(snapshot);
    const assessed = assessLeg(out, 9, ext);
    expect(assessed.ampel).not.toBe('unbewertet');
    expect(assessed.totalHours).toBeGreaterThan(0);
    expect(assessed.basis).toBe('annahme');
    expect(assessed.reasons.join(' ')).toMatch(/Annahme/);
  });

  it('keeps the diurnal cycle instead of flattening it (the Meltemi builds in the afternoon)', () => {
    // 8 kn in the morning, 20 kn from midday — the shape that decides legs.
    const { snapshot } = shortAxis({ windAt: (h) => (h < 12 ? 8 : 20) });
    const { snapshot: ext } = applyPersistenceAssumption(snapshot);
    const fc = ext.forecast['athen-alimos']!;
    const morning = 8 * 24 + 3;
    const afternoon = 8 * 24 + 15;
    expect(fc.windAssumed[morning]).toBe(true);
    expect(fc.windAssumed[afternoon]).toBe(true);
    expect(fc.windKn[morning]).toBeCloseTo(8, 5);
    expect(fc.windKn[afternoon]).toBeCloseTo(20, 5);
  });

  it('averages directions as vectors, so 350° and 10° give north — not south', () => {
    // Same hour-of-day, alternating direction ACROSS days: that is what lands
    // in one profile bucket. A naive arithmetic mean would answer 180°.
    const { snapshot } = shortAxis({ dirAt: (_h, d) => (d % 2 === 0 ? 350 : 10) });
    const { snapshot: ext } = applyPersistenceAssumption(snapshot);
    const dir = ext.forecast['athen-alimos']!.windDirDeg[9 * 24 + 6]!;
    expect(Math.min(dir, 360 - dir)).toBeLessThan(1);
  });

  it('never overwrites real hours and never flags them as assumed', () => {
    const { snapshot } = shortAxis({ windAt: (h) => (h < 12 ? 8 : 20) });
    const before = snapshot.forecast['athen-alimos']!.windKn.slice();
    const { snapshot: ext } = applyPersistenceAssumption(snapshot);
    const after = ext.forecast['athen-alimos']!;
    for (let i = 0; i < before.length; i++) {
      expect(after.windKn[i]).toBe(before[i]);
      expect(after.windAssumed[i]).toBe(false);
    }
  });

  it('fills marine gaps INSIDE the axis (the marine horizon is the shorter one)', () => {
    const { snapshot } = shortAxis();
    const fc = snapshot.forecast['athen-alimos']!;
    for (let i = 2 * 24; i < fc.waveM.length; i++) {
      fc.waveM[i] = null;
      fc.waveDirDeg[i] = null;
    }
    const { snapshot: ext, info } = applyPersistenceAssumption(snapshot);
    const filled = ext.forecast['athen-alimos']!;
    expect(filled.waveM[3 * 24 + 5]).toBeCloseTo(0.3, 5);
    expect(filled.waveAssumed[3 * 24 + 5]).toBe(true);
    // The wind of that same hour is real and must stay unflagged.
    expect(filled.windAssumed[3 * 24 + 5]).toBe(false);
    // Both horizons are reported separately — the wave one ends earlier.
    expect(Date.parse(info.waveHorizonIso!)).toBeLessThan(
      Date.parse(info.horizonIso!),
    );
  });

  it('invents nothing without a basis: an all-null location stays unbewertet', () => {
    const { snapshot, out } = shortAxis();
    snapshot.forecast['kea-vourkari'] = constantForecast(
      snapshot.times.length,
      null,
      null,
      null,
      null,
    );
    const { snapshot: ext } = applyPersistenceAssumption(snapshot);
    expect(ext.forecast['kea-vourkari']!.windKn[10]).toBeNull();
    expect(ext.forecast['kea-vourkari']!.windAssumed[10]).toBe(false);
    expect(assessLeg(out, 1, ext).ampel).toBe('unbewertet');
  });

  it('leaves an axis alone that already covers the trip', () => {
    const { snapshot } = shortAxis({ days: 16 });
    expect(applyPersistenceAssumption(snapshot).info.appendedHours).toBe(0);
  });

  it('covers the configured trip length, not a fixed number of days', () => {
    const { snapshot } = shortAxis();
    const { snapshot: ext } = applyPersistenceAssumption(snapshot);
    const lastMs = Date.parse(ext.times[ext.times.length - 1]!);
    const tripEndMs =
      Date.parse(`${TRIP_START}T00:00:00Z`) +
      snapshot.params.tripLengthDays * 24 * 3600_000;
    expect(lastMs).toBeGreaterThanOrEqual(tripEndMs);
  });
});

describe('assessPlanning wires the assumption in', () => {
  function planningSnapshot(): PlanningSnapshot {
    return shortAxis().snapshot;
  }

  it('reports both horizons, the first assumed day and a description', () => {
    const a = assessPlanning(planningSnapshot());
    expect(a.forecastHorizonIso).not.toBeNull();
    expect(a.waveHorizonIso).not.toBeNull();
    expect(a.assumedFromDay).not.toBeNull();
    expect(a.assumptionNote).toContain('Tagesgang');
  });

  it('decides night ampeln past the horizon instead of leaving them blank', () => {
    const a = assessPlanning(planningSnapshot());
    const night = a.nightAmpeln['athen-alimos']?.[9];
    expect(night).toBeDefined();
    expect(night!.ampel).not.toBe('unbewertet');
    expect(night!.basis).toBe('annahme');
    expect(night!.reasons.join(' ')).toContain('Persistenz-Annahme');
  });

  it('an assumption never makes a plan green, and never makes it red either', () => {
    // The load-bearing guarantee of the whole change: extrapolation blocks
    // green (horizonDependent) but its violations are not safety violations,
    // so a mean value can neither certify nor condemn the trip.
    const a = assessPlanning(planningSnapshot());
    expect(a.restTripAmpel).not.toBe('gruen');
    for (const opt of a.routeOptions) {
      for (const l of opt.legAssessments) {
        if (l.basis === 'annahme') expect(l.ampel).not.toBe('unbewertet');
      }
    }
    const assumedViolations = (a.mainRoute ?? a.proposal)?.validity.violations.filter(
      (v) => v.assumed,
    ) ?? [];
    const safety = (a.mainRoute ?? a.proposal)?.validity.safetyViolations ?? [];
    for (const v of assumedViolations) expect(safety).not.toContain(v);
  });
});
