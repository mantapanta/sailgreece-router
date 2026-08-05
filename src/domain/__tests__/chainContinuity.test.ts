/**
 * Der Plan als Kette — durch die ganze Bewertung hindurch.
 *
 * Die Einzelteile prüfen legGeometry.test.ts (Verankerung) und
 * searoute.test.ts (Landfreiheit). Hier steht der Durchstich: was
 * `assessPlanning` ausliefert, muss eine fahrbare, lückenlose Kette sein — denn
 * genau das liest die Karte. Beide Befunde des Skippers sind hier als Zusicherung
 * formuliert:
 *   „Man kann mit einem Segelboot nicht durch eine Insel durchsegeln"
 *   „Jeder Endpunkt eines Tages muss auch der neue Startpunkt sein"
 */

import { describe, expect, it } from 'vitest';
import { assessPlanning } from '../assess.ts';
import { pathCrossesLand } from '../searoute.ts';
import type { PlanningSnapshot, StageAssessment } from '../schema/snapshot.ts';
import type { Coordinates } from '../schema/common.ts';
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
} from './fixtures.ts';

/**
 * Echte Reviergeometrie mit dem echten Befund: Mykonos → Paros endet in
 * NAOUSSA (Nordseite), Paros → Sifnos beginnt laut Bibliothek in PARIKIA
 * (Westseite). 8 sm dazwischen, die niemand segelt.
 */
function snapshotWithJump(): PlanningSnapshot {
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
  const parikia = makePlace({
    id: 'paros-parikia',
    islandId: 'paros',
    coordinates: { lat: 37.0853, lon: 25.1519 },
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
        makeStage(1, ['mykonos--paros'], 'paros'),
        makeStage(2, ['paros--sifnos'], 'sifnos'),
        makeHarbourDay(3, 'sifnos'),
      ]),
      departureHourOverride: null,
      stopHoursByDay: {},
    },
  });
}

const placeCoords = (
  snapshot: PlanningSnapshot,
  placeId: string,
): Coordinates => snapshot.library.places.find((p) => p.id === placeId)!.coordinates;

/** Der gesegelte Kurs eines Tages, so wie die Karte ihn zeichnet. */
function stagePathOf(snapshot: PlanningSnapshot, stage: StageAssessment): Coordinates[] {
  const out: Coordinates[] = [];
  for (const leg of stage.legs) {
    const sailed = leg.sailedLeg;
    if (!sailed) continue;
    const from = placeCoords(snapshot, sailed.fromPlaceId);
    if (out.length === 0) out.push(from);
    out.push(...sailed.waypoints, placeCoords(snapshot, sailed.toPlaceId));
  }
  return out;
}

describe('assessPlanning — die Kette des Plans', () => {
  const snapshot = snapshotWithJump();
  const assessment = assessPlanning(snapshot);
  const stages = assessment.mainRoute!.stages.filter((s) => s.kind === 'stage');

  it('bewertet beide Etappentage', () => {
    expect(stages.map((s) => s.day)).toEqual([1, 2]);
  });

  it('gibt jeder bewerteten Etappe ihre gesegelte Geometrie mit', () => {
    for (const stage of stages) {
      for (const leg of stage.legs) expect(leg.sailedLeg).not.toBeNull();
    }
  });

  it('lässt Tag 2 dort beginnen, wo Tag 1 endete', () => {
    const day1 = stages.find((s) => s.day === 1)!;
    const day2 = stages.find((s) => s.day === 2)!;
    const ende = day1.legs[day1.legs.length - 1]!.sailedLeg!.toPlaceId;
    const start = day2.legs[0]!.sailedLeg!.fromPlaceId;
    expect(start).toBe(ende);
  });

  it('endet jeden Tag an dem Platz, den die Tageskarte als Liegeplatz nennt', () => {
    for (const stage of stages) {
      const ende = stage.legs[stage.legs.length - 1]!.sailedLeg!.toPlaceId;
      expect(ende).toBe(stage.placeId);
    }
  });

  it('führt keinen Tageskurs über Land', () => {
    for (const stage of stages) {
      expect(pathCrossesLand(stagePathOf(snapshot, stage))).toBe(false);
    }
  });

  it('rechnet die Etappe gegen genau diese Geometrie', () => {
    // Die Punktschlüssel der Rechnung (FR30) sind die Punkte des gesegelten
    // Kurses — sonst erklärte die Tabelle einen anderen Weg als die Linie.
    for (const stage of stages) {
      for (const leg of stage.legs) {
        const sailed = leg.sailedLeg!;
        if (leg.pointPassages.length === 0) continue;
        expect(leg.pointPassages.length).toBe(sailed.waypoints.length + 2);
        expect(leg.pointPassages[0]!.pointKey).toBe(sailed.fromPlaceId);
        expect(leg.pointPassages[leg.pointPassages.length - 1]!.pointKey).toBe(
          sailed.toPlaceId,
        );
      }
    }
  });
});
