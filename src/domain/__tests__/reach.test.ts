/**
 * Fixtures for the day-range context filter (domain/reach.ts).
 *
 * The rule, verbatim from the skipper (feedback 2026-08-05): a day target is
 * what is reachable "im best case Szenario (8 Stunden zzgl. nachttrip =
 * 100 sm range, Wind von hinten oder von der Seite) … bzw 50 sm Range Wind
 * von vorne". What these fixtures pin down: the range depends on the COURSE
 * to the destination relative to the wind, unknown wind falls back to the
 * conservative limit, and the whole thing lands per stage in the assessment.
 */

import { describe, expect, it } from 'vitest';
import { reachableIslands } from '../reach.ts';
import { assessPlanning } from '../assess.ts';
import { RETURN_CHAIN_ROUTE_ID } from '../schema/route.ts';
import type { Island } from '../schema/island.ts';
import type { PlanningSnapshot } from '../schema/snapshot.ts';
import {
  TEST_POLAR,
  constantForecast,
  makeLeg,
  makePlace,
  makePlan,
  makeSnapshot,
  makeStage,
  makeTimes,
  makeVariant,
} from './fixtures.ts';

/**
 * Geometry: base "athen" at 37.9 N. One degree of latitude is 60 nm, so
 *   - "nah-sued"  at −1.0°  ≈  60 nm south (inside 100, outside 50)
 *   - "nah-nord"  at +1.0°  ≈  60 nm north
 *   - "fern-sued" at −2.0°  ≈ 120 nm south (outside even the 100 nm range)
 *   - "dicht"     at −0.5°  ≈  30 nm south (inside both limits)
 */
function scenario(opts: { windFromDeg?: number | null } = {}) {
  const mk = (id: string, dLat: number) => ({
    island: {
      id,
      name: id,
      coordinates: { lat: 37.9 + dLat, lon: 23.7 },
    } as Island,
    place: makePlace({
      id: `${id}-hafen`,
      islandId: id,
      coordinates: { lat: 37.9 + dLat, lon: 23.7 },
    }),
  });
  const athen = mk('athen', 0);
  const dicht = mk('dicht', -0.5);
  const nahSued = mk('nah-sued', -1.0);
  const nahNord = mk('nah-nord', +1.0);
  const fernSued = mk('fern-sued', -2.0);
  const all = [athen, dicht, nahSued, nahNord, fernSued];

  const times = makeTimes(14);
  const fc =
    opts.windFromDeg === null
      ? constantForecast(times.length, null, null, null, null)
      : constantForecast(times.length, 15, opts.windFromDeg ?? 0);

  const legAthenDicht = makeLeg({
    id: 'athen--dicht',
    fromIslandId: 'athen',
    toIslandId: 'dicht',
    fromPlaceId: athen.place.id,
    toPlaceId: dicht.place.id,
    distanceNm: 30,
  });
  const legDichtAthen = makeLeg({
    id: 'dicht--athen',
    fromIslandId: 'dicht',
    toIslandId: 'athen',
    fromPlaceId: dicht.place.id,
    toPlaceId: athen.place.id,
    distanceNm: 30,
  });

  const snapshot: PlanningSnapshot = makeSnapshot({
    times,
    polar: TEST_POLAR,
    forecast: Object.fromEntries(all.map((x) => [x.place.id, fc])),
    library: {
      islands: all.map((x) => x.island),
      places: all.map((x) => x.place),
      invalidPlaces: [],
      legs: [legAthenDicht, legDichtAthen],
      variants: [
        makeVariant('hin', [legAthenDicht], { escalationRank: 1 }),
        makeVariant(RETURN_CHAIN_ROUTE_ID, [legDichtAthen], {
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
      lat: athen.island.coordinates.lat,
      lon: athen.island.coordinates.lon,
      placeId: athen.place.id,
    },
  };
  return snapshot;
}

describe('reachableIslands', () => {
  it('downwind targets get the 100 nm range, upwind targets only 50 nm', () => {
    // Northerly wind: south lies downwind (range 100), north lies upwind (50).
    const reachable = reachableIslands(scenario({ windFromDeg: 0 }), 'athen', 1);
    expect(reachable).toContain('nah-sued'); //  60 nm downwind < 100
    expect(reachable).not.toContain('nah-nord'); // 60 nm upwind  > 50
  });

  it('the same island flips in and out when the wind turns around', () => {
    // Southerly wind: now north is downwind and south is the beat.
    const reachable = reachableIslands(scenario({ windFromDeg: 180 }), 'athen', 1);
    expect(reachable).toContain('nah-nord');
    expect(reachable).not.toContain('nah-sued');
  });

  it('beyond the best-case range nothing is offered, regardless of wind', () => {
    // 120 nm exceeds even the downwind range — "mehrere Tagesreisen entfernt".
    expect(reachableIslands(scenario({ windFromDeg: 0 }), 'athen', 1)).not.toContain(
      'fern-sued',
    );
  });

  it('close targets are offered in both directions', () => {
    const reachable = reachableIslands(scenario({ windFromDeg: 0 }), 'athen', 1);
    expect(reachable).toContain('dicht'); // 30 nm < 50, even upwind
    expect(reachable).toContain('athen'); // own island always selectable
  });

  it('unknown wind falls back to the CONSERVATIVE range, not the generous one', () => {
    // No wind data at all: an unknown direction must not double the window.
    const reachable = reachableIslands(scenario({ windFromDeg: null }), 'athen', 1);
    expect(reachable).toContain('dicht'); //  30 nm ≤ 50
    expect(reachable).not.toContain('nah-sued'); // 60 nm > 50
  });

  it('lands per stage in the assessment, measured from the PREVIOUS plan island', () => {
    const snapshot = scenario({ windFromDeg: 0 });
    snapshot.trip = {
      ...snapshot.trip,
      plan: makePlan([
        makeStage(1, ['athen--dicht'], 'dicht', 'solver'),
        makeStage(2, ['dicht--athen'], 'athen', 'solver'),
      ]),
    };
    const a = assessPlanning(snapshot);
    const day2 = a.mainRoute!.stages.find((s) => s.day === 2)!;
    // Day 2 starts at "dicht" (37.4 N): "fern-sued" at 35.9 N is ~90 nm off —
    // inside the 100 nm downwind range from THERE, though not from Athens.
    expect(day2.reachableIslandIds).toContain('fern-sued');
    const day1 = a.mainRoute!.stages.find((s) => s.day === 1)!;
    expect(day1.reachableIslandIds).not.toContain('fern-sued');
  });
});
