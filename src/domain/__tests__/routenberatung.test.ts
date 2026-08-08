/**
 * DER SCHALTER DER ROUTENBERATUNG (domain/features.ts) — die Zusicherung, an
 * der die freie Handplanung hängt.
 *
 * Zwei Aussagen, und beide müssen halten, sonst ist der Schalter wertlos:
 *
 *  1. AUS heisst wirklich aus. Optionsraum, Vorschlag, Alternativen,
 *     Tagesoptionen, Entscheidungspunkte und die Rest-Trip-Ampel liefern
 *     nichts mehr — ein einziges übrig gebliebenes Urteil wäre genau die
 *     Empfehlung, die der Skipper abbestellt hat.
 *  2. Was er sehen WILL, bleibt vollständig: seine Etappen samt Wind-,
 *     Stunden- und Ampel-Rechnung und die Nacht-Ampeln der Plätze.
 *
 * Der Default ist unverändert `true` — jeder andere Test in diesem Verzeichnis
 * ruft `assessPlanning` ohne Optionen und sieht die volle Bewertung.
 */

import { describe, expect, it } from 'vitest';
import { assessPlanning } from '../assess.ts';
import type { PlanningSnapshot } from '../schema/snapshot.ts';
import { DEFAULT_PARAMS } from '../schema/params.ts';
import {
  TEST_POLAR,
  TRIP_START,
  constantForecast,
  makeHarbourDay,
  makeLeg,
  makePlace,
  makePlan,
  makeSnapshot,
  makeStage,
  makeTimes,
} from './fixtures.ts';

function scenario(): PlanningSnapshot {
  const basis = makePlace({
    id: 'basis-hafen',
    islandId: 'basis',
    coordinates: { lat: 37.9, lon: 23.7 },
  });
  const ziel = makePlace({
    id: 'ziel-hafen',
    islandId: 'ziel',
    coordinates: { lat: 37.4, lon: 24.4 },
  });
  const leg = makeLeg({
    id: 'basis--ziel',
    fromIslandId: 'basis',
    toIslandId: 'ziel',
    fromPlaceId: basis.id,
    toPlaceId: ziel.id,
    distanceNm: 32,
  });
  const times = makeTimes(4);
  return makeSnapshot({
    times,
    polar: TEST_POLAR,
    forecast: {
      [basis.id]: constantForecast(times.length, 12, 20),
      [ziel.id]: constantForecast(times.length, 12, 20),
    },
    params: {
      ...DEFAULT_PARAMS,
      tripStartDate: TRIP_START,
      tripLengthDays: 2,
      baseIslandId: 'basis',
    },
    library: {
      islands: [
        { id: 'basis', name: 'Basis', coordinates: basis.coordinates },
        { id: 'ziel', name: 'Ziel', coordinates: ziel.coordinates },
      ],
      places: [basis, ziel],
      invalidPlaces: [],
      legs: [leg],
      variants: [],
    },
    trip: {
      currentDay: 1,
      position: { source: 'manual', lat: 37.9, lon: 23.7, placeId: basis.id },
      plan: makePlan([
        makeStage(1, [leg.id], 'ziel', 'skipper'),
        makeHarbourDay(2, 'ziel', 'skipper'),
      ]),
      departureHourByDay: {},
      empfohleneAbfahrtByDay: {},
      stopHoursByDay: {},
    },
  });
}

describe('assessPlanning ohne Routenberatung', () => {
  const assessment = assessPlanning(scenario(), { routenberatung: false });

  it('liefert keine Routen-Optionen, keinen Vorschlag, keine Alternativen', () => {
    expect(assessment.routeOptions).toEqual([]);
    expect(assessment.proposal).toBeNull();
    expect(assessment.alternatives).toEqual([]);
    expect(assessment.dayOptions).toEqual([]);
    expect(assessment.decisionPoints).toEqual([]);
    expect(assessment.rueckwegEmpfehlung).toEqual([]);
  });

  it('fällt kein Urteil über den ganzen Törn', () => {
    expect(assessment.restTripAmpel).toBe('unbewertet');
  });

  it('bewertet den Plan des Skippers weiterhin vollständig', () => {
    const stages = assessment.mainRoute!.stages;
    expect(stages.map((s) => s.day)).toEqual([1, 2]);
    const etappe = stages.find((s) => s.day === 1)!;
    expect(etappe.kind).toBe('stage');
    expect(etappe.ampel).not.toBe('unbewertet');
    expect(etappe.legs[0]!.totalHours).toBeGreaterThan(0);
    expect(etappe.legs[0]!.avgTwsKn).not.toBeNull();
    expect(etappe.abfahrtHourAthens).toBeGreaterThanOrEqual(0);
  });

  it('behält die Nacht-Ampeln der Plätze', () => {
    expect(assessment.nightAmpeln['ziel-hafen']?.[1]?.ampel).toBeDefined();
    expect(assessment.bestPlaceByIsland['ziel']?.[1]).toBe('ziel-hafen');
  });
});

describe('assessPlanning mit Routenberatung (Default)', () => {
  it('rechnet die Routen-Ebene weiterhin', () => {
    const assessment = assessPlanning(scenario());
    expect(assessment.routeOptions.length).toBeGreaterThan(0);
  });
});
