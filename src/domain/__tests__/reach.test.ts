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
 *   - "nah-sued"     at −1.0°  ≈  60 nm south (inside 100, outside 50)
 *   - "nah-nord"     at +1.0°  ≈  60 nm north
 *   - "fern-sued"    at −2.0°  ≈ 120 nm south (outside even the 100 nm range)
 *   - "dicht"        at −0.5°  ≈  30 nm south (inside both limits)
 *   - "ohne-etappe"  at −0.5°, lon +0.1 ≈ 30 nm — in range, but NO leg leads
 *     there (the Mykonos case)
 *   - "uebermorgen"  at −1.5°  ≈  90 nm south — in downwind range, but only at
 *     the SECOND chain position (a Doppelschlag day)
 *   - "dritter-schlag" at −1.6°, lon +0.1 ≈ 97 nm — hangs off "uebermorgen"
 *     as a dead end whose only neighbour has a single berth, so no round trip
 *     can pick it up at all
 *
 * DER GRAPH IST EIN RUNDKURS, kein Stern — seit reach.ts denselben
 * Kandidatenraum liest wie der Solver (`roundTripLayers`), muss die Fixture
 * auch geschlossene Runden hergeben. Sonst prüfte sie eine Menge, die im
 * echten Revier nie leer ist, hier aber immer:
 *
 *   athen → dicht → uebermorgen → nah-sued → athen   (und rückwärts)
 *   athen → nah-nord → athen                          (Sackgasse, Grad 1)
 *   athen → fern-sued → athen                         (Sackgasse, Grad 1)
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
    // Der Rundkurs: athen → dicht → uebermorgen → nah-sued → athen.
    connect(dicht, uebermorgen, 60),
    connect(uebermorgen, nahSued, 30),
    connect(nahSued, athen, 60),
    // Zwei Sackgassen mit Grad 1 — sie dürfen als athen → X → athen gefahren
    // werden (die Pendel-Ausnahme in roundTrips.dfs).
    connect(athen, nahNord, 60),
    connect(athen, fernSued, 120),
    // Und eine Sackgasse HINTER der Sackgasse: der Rückweg müsste
    // "uebermorgen" ein zweites Mal anlaufen, und die Insel hat nur einen
    // Liegeplatz. Keine Runde kann sie deshalb tragen.
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
    const reachable = reachableIslands(scenario({ windFromDeg: 0 }), 'athen', 1, 'athen');
    expect(reachable).toContain('nah-sued'); //  60 nm downwind < 100
    expect(reachable).not.toContain('nah-nord'); // 60 nm upwind  > 50
  });

  it('the same island flips in and out when the wind turns around', () => {
    // Southerly wind: now north is downwind and south is the beat.
    const reachable = reachableIslands(scenario({ windFromDeg: 180 }), 'athen', 1, 'athen');
    expect(reachable).toContain('nah-nord');
    expect(reachable).not.toContain('nah-sued');
  });

  it('beyond the best-case range nothing is offered, regardless of wind', () => {
    // 120 nm exceeds even the downwind range — "mehrere Tagesreisen entfernt".
    expect(reachableIslands(scenario({ windFromDeg: 0 }), 'athen', 1, 'athen')).not.toContain(
      'fern-sued',
    );
  });

  it('close targets are offered in both directions', () => {
    const reachable = reachableIslands(scenario({ windFromDeg: 0 }), 'athen', 1, 'athen');
    expect(reachable).toContain('dicht'); // 30 nm < 50, even upwind
  });

  it('die BASIS ist Tagesziel, wenn die Runde dort schliesst — nicht vorher', () => {
    // Sie stand hier einmal bedingungslos ("eigene Insel immer wählbar") und
    // war damit der Menüeintrag, den der Solver an Tag 1 sicher ablehnte: eine
    // Runde, die an Tag 1 schon wieder zu Hause ist, gibt es nicht. Am ENDE
    // des Rahmens ist sie dagegen genau das richtige Ziel.
    // Südwind, damit die 60 sm heim von "nah-sued" raumschots liegen — die
    // sm-Regel ist hier nicht die Frage.
    const snapshot = scenario({ windFromDeg: 180 });
    expect(reachableIslands(snapshot, 'athen', 1, 'athen')).not.toContain('athen');
    expect(reachableIslands(snapshot, 'nah-sued', 11, 'athen')).toContain('athen');
  });

  it('unknown wind falls back to the CONSERVATIVE range, not the generous one', () => {
    // No wind data at all: an unknown direction must not double the window.
    const reachable = reachableIslands(scenario({ windFromDeg: null }), 'athen', 1, 'athen');
    expect(reachable).toContain('dicht'); //  30 nm ≤ 50
    expect(reachable).not.toContain('nah-sued'); // 60 nm > 50
  });

  it('an island in range but WITHOUT a library path is not offered (Mykonos-Fall)', () => {
    // 30 nm away — comfortably in range in any wind. But no leg leads there,
    // also keine Runde, die sie anläuft: der Solver würde den Pin jedes Mal
    // ablehnen (Bug 2026-08-05: im Dropdown angeboten, bei der Auswahl auf Kea
    // zurückgesprungen).
    const reachable = reachableIslands(scenario({ windFromDeg: 0 }), 'athen', 1, 'athen');
    expect(reachable).not.toContain('ohne-etappe');
  });

  it('die ZWEITE Kettenposition ist Tagesziel von MORGEN, nicht von heute', () => {
    // "uebermorgen" hat keine Etappe ab athen, steht in der Runde aber an
    // zweiter Position. Der Vertrag ist "ein Törntag, eine Etappe" — die Insel
    // gehört also an Tag 2, nicht an Tag 1. Ein Doppelschlag könnte sie
    // theoretisch vorziehen; das Menü rechnet damit bewusst NICHT (reach.ts
    // Kopfkommentar: 20 Ziele mehr, 19 davon vom Solver abgelehnt).
    const snapshot = scenario({ windFromDeg: 0 });
    expect(reachableIslands(snapshot, 'athen', 1, 'athen')).not.toContain('uebermorgen');
    // 90 sm raumschots ab athen — an Tag 2 in Reichweite UND in der Runde.
    expect(reachableIslands(snapshot, 'athen', 2, 'athen')).toContain('uebermorgen');
  });

  it('three legs away is no day target, even inside the sm range', () => {
    // ~97 nm downwind — die sm-Regel allein böte die Insel an. Sie liegt aber
    // hinter "uebermorgen", und der Rückweg müsste diese Insel ein zweites Mal
    // anlaufen, als einzigen Liegeplatz. KEINE Runde trägt sie, also darf sie
    // auch nicht im Menü stehen.
    const reachable = reachableIslands(scenario({ windFromDeg: 0 }), 'athen', 1, 'athen');
    expect(reachable).not.toContain('dritter-schlag');
  });

  it('reversed legs open the way back — the graph is not one-directional', () => {
    // Heim von "nah-sued" nach athen gibt es nur als UMGEDREHTE Etappe
    // (gespeichert ist nah-sued--athen); die Aufzählung fährt Etappen in beide
    // Richtungen, sonst stünde am Ende des Törns nichts mehr im Menü.
    // Vierte Kettenposition: dort schliesst der Ring wieder an der Basis.
    const reachable = reachableIslands(scenario({ windFromDeg: 180 }), 'nah-sued', 4, 'athen');
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
