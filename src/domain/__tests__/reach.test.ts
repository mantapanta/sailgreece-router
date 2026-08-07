/**
 * Fixtures for the day-range context filter (domain/reach.ts).
 *
 * The rule, verbatim from the skipper (feedback 2026-08-05): a day target is
 * what is reachable "im best case Szenario (8 Stunden zzgl. nachttrip =
 * 100 sm range, Wind von hinten oder von der Seite) … bzw 50 sm Range Wind
 * von vorne". What these fixtures pin down: the range depends on the COURSE
 * to the destination relative to the wind, unknown wind falls back to the
 * conservative limit, and the whole thing lands per stage in the assessment.
 *
 * SECOND rule (bug report 2026-08-05): the leg library must be able to
 * DELIVER the day — an island in range but without a library path from the
 * previous island is not offered, because the solver would reject the pin
 * every time ("Mykonos stand im Dropdown, blieb aber im Kea-State hängen").
 */

import { describe, expect, it } from 'vitest';
import { reachableIslands, stopoverIslands } from '../reach.ts';
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
 *   - "nah-sued"     at −1.0°  ≈  60 nm south (inside 100, outside 50)
 *   - "nah-nord"     at +1.0°  ≈  60 nm north
 *   - "fern-sued"    at −2.0°  ≈ 120 nm south (outside even the 100 nm range)
 *   - "dicht"        at −0.5°  ≈  30 nm south (inside both limits)
 *   - "ohne-etappe"  at −0.5°, lon +0.1 ≈ 30 nm — in range, but NO leg leads
 *     there (the Mykonos case)
 *   - "uebermorgen"  at −1.5°  ≈  90 nm south — in downwind range, reachable
 *     only via dicht (2 legs: a Doppelschlag day)
 *   - "dritter-schlag" at −1.6°, lon +0.1 ≈ 97 nm — in downwind range, but
 *     THREE legs away (athen → dicht → uebermorgen → dritter-schlag)
 *
 * Every island except "ohne-etappe" is wired into the leg graph, so the
 * sm-rule tests keep testing the sm rule and not the library condition.
 */
function scenario(opts: { windFromDeg?: number | null } = {}) {
  const mk = (id: string, dLat: number, dLon = 0) => ({
    island: {
      id,
      name: id,
      coordinates: { lat: 37.9 + dLat, lon: 23.7 + dLon },
    } as Island,
    place: makePlace({
      id: `${id}-hafen`,
      islandId: id,
      coordinates: { lat: 37.9 + dLat, lon: 23.7 + dLon },
    }),
  });
  const athen = mk('athen', 0);
  const dicht = mk('dicht', -0.5);
  const nahSued = mk('nah-sued', -1.0);
  const nahNord = mk('nah-nord', +1.0);
  const fernSued = mk('fern-sued', -2.0);
  const ohneEtappe = mk('ohne-etappe', -0.5, +0.1);
  const uebermorgen = mk('uebermorgen', -1.5);
  const dritterSchlag = mk('dritter-schlag', -1.6, +0.1);
  const all = [athen, dicht, nahSued, nahNord, fernSued, ohneEtappe, uebermorgen, dritterSchlag];

  const times = makeTimes(14);
  const fc =
    opts.windFromDeg === null
      ? constantForecast(times.length, null, null, null, null)
      : constantForecast(times.length, 15, opts.windFromDeg ?? 0);

  const connect = (
    a: ReturnType<typeof mk>,
    b: ReturnType<typeof mk>,
    distanceNm: number,
  ) =>
    makeLeg({
      id: `${a.island.id}--${b.island.id}`,
      fromIslandId: a.island.id,
      toIslandId: b.island.id,
      fromPlaceId: a.place.id,
      toPlaceId: b.place.id,
      distanceNm,
    });

  const legAthenDicht = connect(athen, dicht, 30);
  const legDichtAthen = connect(dicht, athen, 30);
  // The remaining wiring keeps the sm-rule fixtures on the leg graph:
  // "ohne-etappe" is deliberately ABSENT from every leg.
  const furtherLegs = [
    connect(athen, nahSued, 60),
    connect(athen, nahNord, 60),
    connect(dicht, fernSued, 90),
    connect(dicht, uebermorgen, 60),
    connect(uebermorgen, dritterSchlag, 8),
  ];

  const snapshot: PlanningSnapshot = makeSnapshot({
    times,
    polar: TEST_POLAR,
    forecast: Object.fromEntries(all.map((x) => [x.place.id, fc])),
    library: {
      islands: all.map((x) => x.island),
      places: all.map((x) => x.place),
      invalidPlaces: [],
      legs: [legAthenDicht, legDichtAthen, ...furtherLegs],
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

  it('an island in range but WITHOUT a library path is not offered (Mykonos-Fall)', () => {
    // 30 nm away — comfortably in range in any wind. But no leg leads there,
    // so the solver would reject the pin every single time (Bug 2026-08-05:
    // offered in the dropdown, snapped back to Kea on selection).
    const reachable = reachableIslands(scenario({ windFromDeg: 0 }), 'athen', 1);
    expect(reachable).not.toContain('ohne-etappe');
  });

  it('two library legs (a Doppelschlag day) still count as reachable', () => {
    // "uebermorgen" has no direct leg from athen, but athen→dicht→uebermorgen
    // exists and the packer may put two legs on one day (doppelschlag).
    const reachable = reachableIslands(scenario({ windFromDeg: 0 }), 'athen', 1);
    expect(reachable).toContain('uebermorgen'); // 90 nm downwind, 2 hops
  });

  it('with the Doppelschlag capped to zero, only ONE leg per day counts', () => {
    const snapshot = scenario({ windFromDeg: 0 });
    snapshot.params = { ...snapshot.params, doppelschlagMaxPerTrip: 0 };
    const reachable = reachableIslands(snapshot, 'athen', 1);
    expect(reachable).toContain('nah-sued'); // direct leg — still offered
    expect(reachable).not.toContain('uebermorgen'); // needs 2 legs on one day
  });

  it('three legs away is no day target, even inside the sm range', () => {
    // ~97 nm downwind — the sm rule alone would offer it, but no day carries
    // three legs (ppr.ts LEGS_PER_DAY_POSSIBLE), so no pin could ever hold.
    const reachable = reachableIslands(scenario({ windFromDeg: 0 }), 'athen', 1);
    expect(reachable).not.toContain('dritter-schlag');
  });

  it('reversed legs open the way back — the graph is not one-directional', () => {
    // From "nah-sued" home to athen only the stored leg athen--nah-sued
    // exists; its reverse must carry the offer (legIndexWithReverses).
    const reachable = reachableIslands(scenario({ windFromDeg: 180 }), 'nah-sued', 1);
    expect(reachable).toContain('athen'); // 60 nm downwind via reversed leg
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
    // inside the 100 nm downwind range from THERE (and one leg away), though
    // not from Athens.
    expect(day2.reachableIslandIds).toContain('fern-sued');
    const day1 = a.mainRoute!.stages.find((s) => s.day === 1)!;
    expect(day1.reachableIslandIds).not.toContain('fern-sued');
  });
});

/**
 * ZWISCHENSTOPPS (domain/reach.ts `stopoverIslands`) — die zweite Kontextmenge
 * desselben Editors, mit einer anderen Frage: nicht "wo kann der Tag ENDEN",
 * sondern "wo kann er unterwegs anhalten, ohne sein Ziel aufzugeben".
 *
 * Beide Hälften des Umwegs müssen die Bibliothek liefern — damit bleibt der
 * Suchraum kuratiert. Keine Ampel- und keine Reichweiten-Regel: am
 * Zwischenstopp muss das Boot nicht sicher liegen (Skipper 2026-08-07).
 */
describe('stopoverIslands', () => {
  it('nennt die Insel, die beide Hälften des Umwegs trägt', () => {
    // athen→uebermorgen geht nur über dicht (athen--dicht + dicht--uebermorgen).
    expect(stopoverIslands(scenario(), 'athen', 'uebermorgen')).toEqual(['dicht']);
  });

  it('lässt Ausgangs- und Zielinsel des Tages selbst weg', () => {
    const stops = stopoverIslands(scenario(), 'athen', 'dicht');
    expect(stops).not.toContain('athen');
    expect(stops).not.toContain('dicht');
  });

  it('verlangt BEIDE Hälften — eine Insel am Weg zu nichts zählt nicht', () => {
    // nah-sued liegt zwischen athen und uebermorgen, hängt aber nur an athen:
    // von dort führt keine Etappe weiter, also ist es kein Stopp auf DEM Weg.
    expect(stopoverIslands(scenario(), 'athen', 'uebermorgen')).not.toContain(
      'nah-sued',
    );
  });

  it('nutzt Gegenrichtungen — der Graph ist nicht einseitig', () => {
    // Heim von uebermorgen: gespeichert ist nur dicht--uebermorgen und
    // athen--dicht; beide müssen umgedreht tragen.
    expect(stopoverIslands(scenario(), 'uebermorgen', 'athen')).toEqual(['dicht']);
  });

  it('sortiert nach dem Umweg — der naheliegendste Stopp steht oben', () => {
    const snapshot = scenario();
    const zusatz = (fromIslandId: string, toIslandId: string, distanceNm: number) =>
      makeLeg({
        id: `${fromIslandId}--${toIslandId}`,
        fromIslandId,
        toIslandId,
        fromPlaceId: `${fromIslandId}-hafen`,
        toPlaceId: `${toIslandId}-hafen`,
        distanceNm,
      });

    // Über dicht: 30 + 60 = 90 sm. Über nah-sued: 60 + 35 = 95 sm.
    snapshot.library.legs = [
      ...snapshot.library.legs,
      zusatz('nah-sued', 'uebermorgen', 35),
    ];
    expect(stopoverIslands(snapshot, 'athen', 'uebermorgen')).toEqual([
      'dicht',
      'nah-sued',
    ]);

    // Wird die zweite Hälfte kurz (60 + 10 = 70 sm), dreht sich die Reihenfolge.
    snapshot.library.legs = [
      ...snapshot.library.legs.filter((l) => l.id !== 'nah-sued--uebermorgen'),
      zusatz('nah-sued', 'uebermorgen', 10),
    ];
    expect(stopoverIslands(snapshot, 'athen', 'uebermorgen')).toEqual([
      'nah-sued',
      'dicht',
    ]);
  });

  it('lässt weg, was selbst im besten Fall kein Tag mehr ist', () => {
    const snapshot = scenario();
    // Über nah-sued wären es 60 + 60 = 120 sm — mehr als die
    // Best-Case-Tagesreichweite (100 sm). Das ist kein Zwischenstopp mehr,
    // sondern ein anderes Tagesziel.
    snapshot.library.legs = [
      ...snapshot.library.legs,
      makeLeg({
        id: 'nah-sued--uebermorgen',
        fromIslandId: 'nah-sued',
        toIslandId: 'uebermorgen',
        fromPlaceId: 'nah-sued-hafen',
        toPlaceId: 'uebermorgen-hafen',
        distanceNm: 60,
      }),
    ];
    expect(stopoverIslands(snapshot, 'athen', 'uebermorgen')).toEqual(['dicht']);
  });

  it('landet je Etappentag in der Bewertung, gemessen ab der VORTAGS-Insel', () => {
    const snapshot = scenario();
    snapshot.trip = {
      ...snapshot.trip,
      plan: makePlan([
        makeStage(1, ['athen--dicht'], 'dicht', 'solver'),
        makeStage(2, ['dicht--uebermorgen'], 'uebermorgen', 'solver'),
      ]),
    };
    const a = assessPlanning(snapshot);
    const day2 = a.mainRoute!.stages.find((s) => s.day === 2)!;
    // Tag 2 fährt dicht → uebermorgen: dazwischen liegt in dieser Welt nichts.
    expect(day2.stopoverIslandIds).toEqual([]);
    // Tag 1 fährt athen → dicht, und auch dort gibt es keinen Umweg — beide
    // Aussagen kommen aus der Bewertung, nicht aus der Ansicht (AD-2).
    const day1 = a.mainRoute!.stages.find((s) => s.day === 1)!;
    expect(day1.stopoverIslandIds).toEqual([]);
    expect(day1.zwischenstopps).toEqual([]);
  });
});
