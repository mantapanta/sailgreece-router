/**
 * Die Etappen-Überschrift folgt der gesegelten Kette, nicht der Bibliothek.
 *
 * Der Befund vom Wasser (chainContinuity.test.ts prüft ihn für Geometrie und
 * Rechnung): Tag 2 endete in Grammata, die Überschrift von Tag 3 begann in
 * Ermoupoli — weil `syros--mykonos` in der Bibliothek ab Ermoupoli gespeichert
 * ist. „Der Endpunkt einer Etappe ist auch immer der Startpunkt der neuen
 * Etappe" — das muss auch in der Überschrift stehen, nicht nur in der Karte.
 */

import { describe, expect, it } from 'vitest';
import { assessPlanning } from '../../domain/assess.ts';
import type { PlanningSnapshot, StageAssessment } from '../../domain/schema/snapshot.ts';
import {
  TEST_POLAR,
  constantForecast,
  makeHarbourDay,
  makeLeg,
  makePlace,
  makePlan,
  makeSnapshot,
  makeStage,
  makeTimes,
  makeVariant,
} from '../../domain/__tests__/fixtures.ts';
import { stageFrom, stageTitle } from '../stageText.ts';

/**
 * Tag 1 endet am GEWÄHLTEN Platz Naoussa (Nordseite von Paros); die Etappe
 * `paros--sifnos` ist in der Bibliothek ab Parikia (Westseite) gespeichert.
 */
function snapshotWithJump(): PlanningSnapshot {
  const ornos = makePlace({
    id: 'mykonos-ornos',
    name: 'Ornos',
    islandId: 'mykonos',
    coordinates: { lat: 37.4142, lon: 25.3283 },
  });
  const naoussa = makePlace({
    id: 'paros-naoussa',
    name: 'Naoussa',
    islandId: 'paros',
    coordinates: { lat: 37.1236, lon: 25.2394 },
  });
  const parikia = makePlace({
    id: 'paros-parikia',
    name: 'Parikia',
    islandId: 'paros',
    coordinates: { lat: 37.0853, lon: 25.1519 },
  });
  const kamares = makePlace({
    id: 'sifnos-kamares',
    name: 'Kamares',
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
    fromPlaceId: parikia.id,
    toPlaceId: kamares.id,
    distanceNm: 26,
  });

  const times = makeTimes(8);
  const fc = constantForecast(times.length, 12, 20);
  const places = [ornos, naoussa, parikia, kamares];

  return makeSnapshot({
    times,
    polar: TEST_POLAR,
    forecast: Object.fromEntries(places.map((p) => [p.id, fc])),
    library: {
      islands: [
        { id: 'mykonos', name: 'Mykonos', coordinates: ornos.coordinates },
        { id: 'paros', name: 'Paros', coordinates: parikia.coordinates },
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
        makeStage(1, ['mykonos--paros'], 'paros', 'skipper', naoussa.id),
        makeStage(2, ['paros--sifnos'], 'sifnos'),
        makeHarbourDay(3, 'sifnos'),
      ]),
      departureHourOverride: null,
      stopHoursByDay: {},
    },
  });
}

describe('stageTitle — die Überschrift der Kette', () => {
  const snapshot = snapshotWithJump();
  const assessment = assessPlanning(snapshot);
  const stages = assessment
    .mainRoute!.stages.filter((s) => s.kind === 'stage')
    .sort((a, b) => a.day - b.day) as StageAssessment[];

  it('beginnt Tag 2 in der Überschrift dort, wo Tag 1 endete — nicht am Bibliothekshafen', () => {
    const [day1, day2] = stages;
    expect(stageTitle(snapshot, day1!)).toBe('Mykonos (Ornos) → Paros (Naoussa)');
    expect(stageTitle(snapshot, day2!)).toBe('Paros (Naoussa) → Sifnos (Kamares)');
  });

  it('nennt als Aufbruch jedes Tages den Ankunftsplatz des Vortags', () => {
    for (let i = 1; i < stages.length; i++) {
      const arrival = stageTitle(snapshot, stages[i - 1]!).split(' → ').pop();
      const departure = stageTitle(snapshot, stages[i]!).split(' → ')[0];
      expect(departure).toBe(arrival);
    }
  });
});

describe('stageFrom — die Hero-Herkunftszeile (Story 1.2)', () => {
  const snapshot = snapshotWithJump();
  const assessment = assessPlanning(snapshot);
  const allStages = assessment.mainRoute!.stages
    .slice()
    .sort((a, b) => a.day - b.day);

  it('nennt den Startplatz der gesegelten Kette, nicht den Bibliothekshafen', () => {
    const [day1, day2] = allStages.filter((s) => s.kind === 'stage');
    expect(stageFrom(snapshot, day1!)).toBe('Mykonos (Ornos)');
    expect(stageFrom(snapshot, day2!)).toBe('Paros (Naoussa)');
  });

  it('liefert null, wenn keine erste Etappe auflösbar ist (Hafentag)', () => {
    const harbour = allStages.find((s) => s.kind === 'harbour')!;
    expect(stageFrom(snapshot, harbour)).toBeNull();
  });
});
