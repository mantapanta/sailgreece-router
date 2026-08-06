import { describe, expect, it } from 'vitest';
import { buildLegsById, stageEndMarkers } from '../mapPath.ts';
import type { Leg } from '../../domain/schema/route.ts';
import type {
  PlanningSnapshot,
  StageAssessment,
} from '../../domain/schema/snapshot.ts';
import { makeLeg, makePlace, makeSnapshot } from '../../domain/__tests__/fixtures.ts';

/**
 * Ein Round-Trip über dieselbe Kette: Athen → Kea → Serifos und zurück.
 * Genau die Form, in der die Rückreise die Hinreise zudeckte.
 */
function roundTrip(): { stages: StageAssessment[]; snapshot: PlanningSnapshot; legs: Leg[] } {
  const places = [
    makePlace({ id: 'athen-alimos', islandId: 'athen', coordinates: { lat: 37.9, lon: 23.7 } }),
    makePlace({ id: 'kea-vourkari', islandId: 'kea', coordinates: { lat: 37.66, lon: 24.32 } }),
    makePlace({
      id: 'serifos-livadi',
      islandId: 'serifos',
      coordinates: { lat: 37.14, lon: 24.52 },
    }),
  ];
  const leg = (from: string, to: string): Leg => {
    const f = places.find((p) => p.id === from)!;
    const t = places.find((p) => p.id === to)!;
    return makeLeg({
      id: `${f.islandId}--${t.islandId}`,
      fromIslandId: f.islandId,
      toIslandId: t.islandId,
      fromPlaceId: f.id,
      toPlaceId: t.id,
    });
  };
  const legs = [
    leg('athen-alimos', 'kea-vourkari'),
    leg('kea-vourkari', 'serifos-livadi'),
    leg('serifos-livadi', 'kea-vourkari'),
    leg('kea-vourkari', 'athen-alimos'),
  ];
  const snapshot = makeSnapshot({
    library: { islands: [], places, invalidPlaces: [], legs, variants: [] },
  });

  const stage = (
    day: number,
    stageNumber: number,
    legId: string,
    toIslandId: string,
  ): StageAssessment => ({
    day,
    stageNumber,
    kind: 'stage',
    toIslandId,
    placeId: null,
    placeIsSuggestion: true,
    placeAmpel: 'unbewertet',
    ampel: 'gruen',
    legs: [
      {
        legId,
        // Diese Tests prüfen den Fallback auf die Bibliothek: die Bewertung
        // gibt hier keine gesegelte Geometrie mit.
        sailedLeg: null,
        day,
        ampel: 'gruen',
        sailHours: 3,
        motorHours: 0,
        totalHours: 3,
        avgTwsKn: 12,
        avgTwaDeg: 90,
        avgTwdDeg: 0,
        avgSpeedKn: 6,
        upwind: false,
        kreuzHours: 0,
        kreuzExtraNm: 0,
        wenden: 0,
        kreuzTrack: [],
        basis: 'forecast',
        reasons: [],
        nightLeg: false,
        arrivalHourAthens: 12,
        breakdown: [],
        pointPassages: [],
        kursAbschnitte: [],
      },
    ],
    kursAbschnitte: [],
    reachableIslandIds: [],
    pinned: false,
    stopHoursPerStop: 3,
    abfahrtHourAthens: 9,
    abfahrtVomSkipper: false,
    stopHoursTotal: 0,
    abfahrtsEmpfehlung: null,
    torCheck: null,
    kiteHinweise: [],
  });

  return {
    snapshot,
    legs,
    stages: [
      stage(1, 1, 'athen--kea', 'kea'),
      stage(2, 2, 'kea--serifos', 'serifos'),
      stage(3, 3, 'serifos--kea', 'kea'),
      stage(4, 4, 'kea--athen', 'athen'),
    ],
  };
}

/**
 * Der gemeldete Fehler: auf der Karte waren nur die Nummern der Rückreise zu
 * sehen (6…12), der Hinweg fehlte scheinbar. Gezeichnet war er — aber Tag 2
 * und Tag 10 enden auf derselben Insel, und die später gezeichnete Nummer lag
 * exakt über der früheren.
 */
describe('stageEndMarkers — Hin- und Rückweg teilen sich einen Ort', () => {
  it('macht aus zwei Anläufen derselben Insel EINE Markierung', () => {
    const { stages, legs, snapshot } = roundTrip();
    const markers = stageEndMarkers(stages, buildLegsById(legs), snapshot);
    const kea = markers.find((m) => m.islandId === 'kea')!;
    expect(kea.stops.map((s) => s.stageNumber)).toEqual([1, 3]);
    expect(kea.label).toBe('1·3');
  });

  it('verliert dabei keine einzige Etappe', () => {
    const { stages, legs, snapshot } = roundTrip();
    const markers = stageEndMarkers(stages, buildLegsById(legs), snapshot);
    const gezeigt = markers.flatMap((m) => m.stops.map((s) => s.stageNumber));
    expect(gezeigt.sort()).toEqual([1, 2, 3, 4]);
  });

  it('eine Insel, ein Marker — die Rückreise deckt die Hinreise nicht mehr zu', () => {
    const { stages, legs, snapshot } = roundTrip();
    const markers = stageEndMarkers(stages, buildLegsById(legs), snapshot);
    expect(markers.map((m) => m.islandId)).toEqual(['kea', 'serifos', 'athen']);
    expect(new Set(markers.map((m) => m.key)).size).toBe(markers.length);
  });

  it('einmal angelaufene Inseln behalten die schlichte Zahl', () => {
    const { stages, legs, snapshot } = roundTrip();
    const markers = stageEndMarkers(stages, buildLegsById(legs), snapshot);
    expect(markers.find((m) => m.islandId === 'serifos')!.label).toBe('2');
  });

  it('die Stopps stehen chronologisch, egal wie die Etappen hereinkommen', () => {
    const { stages, legs, snapshot } = roundTrip();
    const markers = stageEndMarkers([...stages].reverse(), buildLegsById(legs), snapshot);
    const kea = markers.find((m) => m.islandId === 'kea')!;
    expect(kea.stops.map((s) => s.day)).toEqual([1, 3]);
  });

  it('die Markierung sitzt am ERSTEN Anlauf und springt nicht zur Rückreise', () => {
    const { stages, legs, snapshot } = roundTrip();
    const markers = stageEndMarkers(stages, buildLegsById(legs), snapshot);
    const kea = markers.find((m) => m.islandId === 'kea')!;
    expect(kea.position).toEqual({ lat: 37.66, lng: 24.32 });
  });

  it('eine Etappe ohne Geometrie erfindet keine Markierung', () => {
    const { stages, snapshot } = roundTrip();
    // Leere Leg-Bibliothek: es gibt keine Koordinaten für die Etappen.
    expect(stageEndMarkers(stages, {}, snapshot)).toEqual([]);
  });
});

/**
 * Story 1.3, AC 7 — die Kapsel ist tastaturbedienbar und öffnet das
 * Platzdetail ihres Zielhafens: `endPlaceId` ist der Platz, an dem die
 * Geometrie des ERSTEN Anlaufs endet; null, wenn sie nicht an einem Platz
 * endet (dann bleibt die Kapsel nicht-interaktiv).
 */
describe('stageEndMarkers — endPlaceId als Aktivierungsziel der Kapsel', () => {
  it('trägt den Zielhafen des ersten Anlaufs', () => {
    const { stages, legs, snapshot } = roundTrip();
    const markers = stageEndMarkers(stages, buildLegsById(legs), snapshot);
    expect(markers.find((m) => m.islandId === 'kea')!.endPlaceId).toBe(
      'kea-vourkari',
    );
    expect(markers.find((m) => m.islandId === 'serifos')!.endPlaceId).toBe(
      'serifos-livadi',
    );
  });

  it('bleibt beim ersten Anlauf, auch wenn die Rückreise anders endet', () => {
    const { stages, legs, snapshot } = roundTrip();
    // Rückreise zuerst hereingereicht — chronologisch gewinnt trotzdem Tag 1.
    const markers = stageEndMarkers(
      [...stages].reverse(),
      buildLegsById(legs),
      snapshot,
    );
    expect(markers.find((m) => m.islandId === 'kea')!.endPlaceId).toBe(
      'kea-vourkari',
    );
  });

  it('ist null, wenn die Geometrie nicht an einem Platz endet', () => {
    const { stages, legs, snapshot } = roundTrip();
    // Zielplatz nicht in der Bibliothek: die Etappe endet auf ihrem letzten
    // Wegpunkt statt an einem Platz.
    const ghostLeg = makeLeg({
      id: 'kea--geisterinsel',
      fromIslandId: 'kea',
      toIslandId: 'geisterinsel',
      fromPlaceId: 'kea-vourkari',
      toPlaceId: 'geist-bucht',
      waypoints: [{ lat: 37.5, lon: 24.4 }],
    });
    const ghostStage: StageAssessment = {
      ...stages[0]!,
      day: 5,
      stageNumber: 5,
      toIslandId: 'geisterinsel',
      legs: [{ ...stages[0]!.legs[0]!, legId: 'kea--geisterinsel', day: 5 }],
    };
    const markers = stageEndMarkers(
      [ghostStage],
      buildLegsById([...legs, ghostLeg]),
      snapshot,
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]!.endPlaceId).toBeNull();
  });
});
