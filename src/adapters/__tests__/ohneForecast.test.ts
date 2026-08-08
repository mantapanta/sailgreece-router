/**
 * DER WINDFREIE STAND (adapters/openMeteo.OHNE_FORECAST) — der Vertrag
 * zwischen Adapter und Domäne für den Fall "Open-Meteo antwortet nicht".
 *
 * Die eine Zusage, die hier festgenagelt wird: OHNE WINDDATEN LÄSST SICH DER
 * TÖRN TROTZDEM PLANEN. Bis 2026-08-08 war es umgekehrt — ein HTTP 429 des
 * Forecasts liess `snapshot` null bleiben, und mit ihm verschwand die gesamte
 * Planung hinter dem Fehlerpanel. Inseln, Etappen und Distanzen hängen aber an
 * der Bibliothek, nicht am Wetter.
 *
 * Die zweite Zusage ist die Kehrseite: es wird nichts ERFUNDEN. Jede Ampel
 * bleibt 'unbewertet', und `forecastHorizonIso` bleibt null — daran erkennt die
 * Anzeige die Lage, ohne den Query-Zustand zu kennen.
 */

import { describe, expect, it } from 'vitest';
import { OHNE_FORECAST } from '../openMeteo.ts';
import { assessPlanning } from '../../domain/assess.ts';
import { emptyManualPlan, setDayTarget } from '../../domain/manualPlan.ts';
import { DEFAULT_PARAMS } from '../../domain/schema/params.ts';
import type { Island } from '../../domain/schema/island.ts';
import type { PlanningSnapshot } from '../../domain/schema/snapshot.ts';
import {
  makeLeg,
  makePlace,
  TRIP_START,
} from '../../domain/__tests__/fixtures.ts';

const PARAMS = {
  ...DEFAULT_PARAMS,
  tripStartDate: TRIP_START,
  tripLengthDays: 4,
  baseIslandId: 'basis',
};

/** Drei Inseln im offenen Wasser — die Kurse dazwischen liegen landfrei. */
const ISLANDS: Island[] = [
  { id: 'basis', name: 'Basis', coordinates: { lat: 37.9, lon: 23.7 } },
  { id: 'alpha', name: 'Alpha', coordinates: { lat: 37.5, lon: 24.3 } },
  { id: 'beta', name: 'Beta', coordinates: { lat: 37.1, lon: 24.7 } },
];

/**
 * Der Snapshot, wie ihn `usePlanning` im Ausfall baut: Bibliothek und
 * Parameter aus Firestore, der Forecast-Teil aus OHNE_FORECAST.
 */
function snapshot(): PlanningSnapshot {
  return {
    ...OHNE_FORECAST,
    library: {
      islands: ISLANDS,
      places: ISLANDS.map((i) =>
        makePlace({ id: `${i.id}-hafen`, islandId: i.id, coordinates: i.coordinates }),
      ),
      invalidPlaces: [],
      legs: [
        makeLeg({
          id: 'basis--alpha',
          fromIslandId: 'basis',
          toIslandId: 'alpha',
          fromPlaceId: 'basis-hafen',
          toPlaceId: 'alpha-hafen',
          distanceNm: 30,
        }),
      ],
      variants: [],
    },
    polar: null,
    params: PARAMS,
    trip: {
      currentDay: 1,
      position: null,
      plan: null,
      departureHourByDay: {},
      empfohleneAbfahrtByDay: {},
      stopHoursByDay: {},
    },
  };
}

describe('OHNE_FORECAST', () => {
  it('trägt keine Stunde, keinen Ort und kein Modell', () => {
    expect(OHNE_FORECAST.times).toEqual([]);
    expect(OHNE_FORECAST.forecast).toEqual({});
    // Leer, nicht gefüllt: es wurde nichts abgerufen, also gibt es weder
    // Abrufzeitpunkt noch Modell noch Herkunft.
    expect(OHNE_FORECAST.fetchedAtIso).toBe('');
    expect(OHNE_FORECAST.model).toBe('');
    expect(OHNE_FORECAST.modelRunIso).toBeNull();
    expect(OHNE_FORECAST.provenance).toBeUndefined();
  });

  it('DIE PLANUNG LÄUFT: Tagesziele lassen sich ohne Winddaten setzen', () => {
    const snap = snapshot();
    // Der leere Törn ist der Start jeder Handplanung — er entsteht aus den
    // Parametern und braucht keinen Forecast.
    const leer = emptyManualPlan(PARAMS);
    expect(leer.days).toHaveLength(4);

    // Kuratierte Verbindung …
    const tag1 = setDayTarget(leer, 1, { islandId: 'alpha' }, snap);
    expect(tag1).not.toBeNull();
    // … und eine, die erst erzeugt werden muss: beides ist Geometrie, nicht
    // Wetter.
    const tag2 = setDayTarget(tag1!.plan, 2, { islandId: 'beta' }, snap);
    expect(tag2).not.toBeNull();
    expect(tag2!.customLegs.map((l) => l.id)).toEqual(['alpha--beta']);

    snap.trip.plan = tag2!.plan;
    snap.library.legs.push(...tag2!.customLegs);

    const a = assessPlanning(snap, { routenberatung: false });
    expect(a.mainRoute).not.toBeNull();
    // Jeder Tag steht da, mit Ziel und vorgeschlagenem Platz — das ist der
    // Plan, den der Skipper weiterbearbeitet.
    expect(a.mainRoute!.stages.map((s) => s.toIslandId)).toEqual([
      'alpha',
      'beta',
      'beta',
      'beta',
    ]);
    expect(a.mainRoute!.stages[0]!.placeId).toBe('alpha-hafen');
    // Und die Ziel-Auswahl des nächsten Tages steht ebenfalls bereit.
    expect(a.mainRoute!.stages[1]!.reachableIslandIds.length).toBeGreaterThan(0);
  });

  it('ES WIRD NICHTS ERFUNDEN: alles bleibt unbewertet', () => {
    const snap = snapshot();
    const change = setDayTarget(emptyManualPlan(PARAMS), 1, { islandId: 'alpha' }, snap);
    snap.trip.plan = change!.plan;

    const a = assessPlanning(snap, { routenberatung: false });
    expect(a.mainRoute!.stages.every((s) => s.ampel === 'unbewertet')).toBe(true);
    expect(a.mainRoute!.stages.every((s) => s.placeAmpel === 'unbewertet')).toBe(true);
    expect(a.restTripAmpel).toBe('unbewertet');
    // DAS Feld, an dem die Anzeige "keine Winddaten" erkennt (App.tsx).
    expect(a.forecastHorizonIso).toBeNull();
    expect(a.waveHorizonIso).toBeNull();
    // Die Fortschreibung greift bewusst NICHT: ohne eine einzige echte Stunde
    // gäbe es keinen Tagesgang, aus dem sie schöpfen könnte.
    expect(a.assumptionNote).toBe('Kein Forecast vorhanden — keine Fortschreibung möglich');
  });
});
