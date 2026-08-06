/**
 * DER DEFAULT DER ABFAHRT IST DIE EMPFEHLUNG (Skipper 2026-08-06).
 *
 * Bis hierher stand "Empfohlene Abfahrt 12:00" neben einer Kachel, die 9:00
 * zeigte und auch mit 9:00 rechnete. Diese Datei hält den Durchstich fest:
 * was `assessPlanning` als Abfahrt eines Tages ausweist, ist dessen Empfehlung
 * — und es ist DIESELBE Stunde, ab der die Etappe simuliert wurde. Setzt der
 * Skipper eine eigene, gewinnt sie, und die Empfehlung bleibt trotzdem
 * sichtbar stehen.
 */

import { describe, expect, it } from 'vitest';
import { assessPlanning } from '../assess.ts';
import { empfehleAbfahrt } from '../abfahrt.ts';
import { departureHourChoices, departureHourForDay } from '../scoring.ts';
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
  northSouthScenario,
} from './fixtures.ts';

/** Zwei kurze Kykladen-Schläge als Hauptroute — genug für zwei Etappentage. */
function zweiTageSnapshot(): PlanningSnapshot {
  const ornos = makePlace({
    id: 'mykonos-ornos',
    islandId: 'mykonos',
    coordinates: { lat: 37.4142, lon: 25.3283 },
  });
  const naoussa = makePlace({
    id: 'paros-naoussa',
    islandId: 'paros',
    coordinates: { lat: 37.1236, lon: 25.2394 },
  });
  const kamares = makePlace({
    id: 'sifnos-kamares',
    islandId: 'sifnos',
    coordinates: { lat: 36.9903, lon: 24.6708 },
  });

  const mykonosParos = makeLeg({
    id: 'mykonos--paros',
    fromIslandId: 'mykonos',
    toIslandId: 'paros',
    fromPlaceId: ornos.id,
    toPlaceId: naoussa.id,
    distanceNm: 20,
  });
  const parosSifnos = makeLeg({
    id: 'paros--sifnos',
    fromIslandId: 'paros',
    toIslandId: 'sifnos',
    fromPlaceId: naoussa.id,
    toPlaceId: kamares.id,
    distanceNm: 26,
  });

  const times = makeTimes(8);
  const fc = constantForecast(times.length, 12, 20);
  const places = [ornos, naoussa, kamares];

  return makeSnapshot({
    times,
    polar: TEST_POLAR,
    forecast: Object.fromEntries(places.map((p) => [p.id, fc])),
    library: {
      islands: [
        { id: 'mykonos', name: 'Mykonos', coordinates: ornos.coordinates },
        { id: 'paros', name: 'Paros', coordinates: naoussa.coordinates },
        { id: 'sifnos', name: 'Sifnos', coordinates: kamares.coordinates },
      ],
      places,
      invalidPlaces: [],
      legs: [mykonosParos, parosSifnos],
      variants: [makeVariant('test-route', [mykonosParos, parosSifnos])],
    },
    trip: {
      currentDay: 1,
      position: {
        source: 'manual',
        lat: ornos.coordinates.lat,
        lon: ornos.coordinates.lon,
        placeId: ornos.id,
      },
      plan: makePlan([
        makeStage(1, ['mykonos--paros'], 'paros'),
        makeStage(2, ['paros--sifnos'], 'sifnos'),
      ]),
      departureHourByDay: {},
      empfohleneAbfahrtByDay: {},
      stopHoursByDay: {},
    },
  });
}

/** Abfahrtsstunde (Athen) aus der ersten Punktpassage der Etappe. */
function simulierteAbfahrt(etaIso: string): number {
  // August in Griechenland: UTC+3. Dieselbe Umrechnung wie in time.ts, nur
  // rückwärts und für genau diesen Törn.
  return (new Date(etaIso).getUTCHours() + 3) % 24;
}

describe('assessPlanning — die Abfahrt eines Tages IST seine Empfehlung', () => {
  it('jeder Etappentag fährt zur empfohlenen Stunde ab, nicht zum Standard', () => {
    const snapshot = zweiTageSnapshot();
    const stages = assessPlanning(snapshot).mainRoute!.stages;
    expect(stages.length).toBeGreaterThan(0);

    for (const stage of stages) {
      expect(stage.abfahrtsEmpfehlung).not.toBeNull();
      // Der Default ist die Empfehlung — und keine Skipper-Entscheidung.
      expect(stage.abfahrtHourAthens).toBe(
        stage.abfahrtsEmpfehlung!.abfahrtHourAthens,
      );
      expect(stage.abfahrtVomSkipper).toBe(false);
      // Und die Rechnung folgt ihr: die erste Punktpassage IST die Abfahrt.
      const start = stage.legs[0]!.pointPassages[0]!.etaIso!;
      expect(simulierteAbfahrt(start)).toBe(stage.abfahrtHourAthens);
    }
    // Der Test wäre wertlos, wenn die Empfehlung zufällig der Standard wäre.
    expect(
      stages.some(
        (s) => s.abfahrtHourAthens !== snapshot.params.departureHourAthens,
      ),
    ).toBe(true);
  });

  it('die Wahl des Skippers schlägt die Empfehlung — und blendet sie nicht aus', () => {
    const snapshot = zweiTageSnapshot();
    snapshot.trip.departureHourByDay = { 2: 7 };
    const tag2 = assessPlanning(snapshot).mainRoute!.stages.find((s) => s.day === 2)!;

    expect(tag2.abfahrtHourAthens).toBe(7);
    expect(tag2.abfahrtVomSkipper).toBe(true);
    expect(simulierteAbfahrt(tag2.legs[0]!.pointPassages[0]!.etaIso!)).toBe(7);
    // Die Empfehlung steht weiter da: sie ist der Weg zurück.
    expect(tag2.abfahrtsEmpfehlung).not.toBeNull();
  });

  it('eine Abfahrt am NACHBARTAG verschiebt diesen Tag nicht', () => {
    const snapshot = zweiTageSnapshot();
    const ohne = assessPlanning(snapshot).mainRoute!.stages.find((s) => s.day === 1)!;
    snapshot.trip.departureHourByDay = { 2: 6 };
    const mit = assessPlanning(snapshot).mainRoute!.stages.find((s) => s.day === 1)!;
    expect(mit.abfahrtHourAthens).toBe(ohne.abfahrtHourAthens);
  });
});

describe('departureHourForDay — Rangfolge Wahl > Empfehlung > Standard', () => {
  it('ohne Wahl und ohne Empfehlung gilt der Standard', () => {
    const { snapshot } = northSouthScenario({ windKn: 15, windFromDeg: 0 });
    expect(departureHourForDay(snapshot, 2)).toBe(snapshot.params.departureHourAthens);
  });

  it('die Empfehlung schlägt den Standard, die Wahl schlägt die Empfehlung', () => {
    const { snapshot } = northSouthScenario({ windKn: 15, windFromDeg: 0 });
    snapshot.trip.empfohleneAbfahrtByDay = { 2: 11 };
    expect(departureHourForDay(snapshot, 2)).toBe(11);
    snapshot.trip.departureHourByDay = { 2: 8 };
    expect(departureHourForDay(snapshot, 2)).toBe(8);
  });

  it('eine späte Empfehlung gilt — wie eine späte Wahl — nur an Törntag 1', () => {
    const { snapshot } = northSouthScenario({ windKn: 15, windFromDeg: 0 });
    snapshot.trip.empfohleneAbfahrtByDay = { 1: 15, 2: 15 };
    expect(departureHourForDay(snapshot, 1)).toBe(15);
    expect(departureHourForDay(snapshot, 2)).toBe(snapshot.params.departureHourAthens);
  });
});

describe('empfehleAbfahrt — empfiehlt nur Stunden, die der Tag zur Wahl stellt', () => {
  it('die empfohlene Stunde steht auch im Menü des Tages', () => {
    const { snapshot, leg } = northSouthScenario({ windKn: 15, windFromDeg: 0 });
    for (const day of [1, 2]) {
      const e = empfehleAbfahrt([leg], day, snapshot);
      if (!e) continue;
      expect(departureHourChoices(day)).toContain(e.abfahrtHourAthens);
    }
  });
});
