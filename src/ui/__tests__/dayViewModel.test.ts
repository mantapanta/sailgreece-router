/**
 * Story 1.2 — pure Tagesansicht view-model derivations (AD-2: display
 * aggregation lives in a tested helper, never inline in JSX).
 */

import { describe, expect, it } from 'vitest';
import type { StageAssessment } from '../../domain/schema/snapshot.ts';
import {
  dayViewStages,
  optionsSummary,
  restTripVerdictLabel,
  staleForecastLabel,
} from '../dayViewModel.ts';

const TTL = 3_600_000; // = STALE_TIME_MS (FR13/AD-7)
const FETCHED = '2026-08-05T06:00:00Z';
const FETCHED_MS = Date.parse(FETCHED);

function makeStage(
  day: number,
  over: Partial<StageAssessment> = {},
): StageAssessment {
  return {
    day,
    stageNumber: day,
    kind: 'stage',
    toIslandId: `insel-${day}`,
    placeId: null,
    placeIsSuggestion: false,
    placeAmpel: 'unbewertet',
    ampel: 'gruen',
    legs: [],
    pinned: false,
    stopHoursPerStop: 0,
    stopHoursTotal: 0,
    reachableIslandIds: [],
    abfahrtsEmpfehlung: null,
    torCheck: null,
    ...over,
  };
}

describe('staleForecastLabel', () => {
  it('bleibt null, solange das Alter die TTL nicht überschreitet (Grenze inklusive)', () => {
    expect(staleForecastLabel(FETCHED, FETCHED_MS, TTL)).toBeNull();
    expect(staleForecastLabel(FETCHED, FETCHED_MS + TTL, TTL)).toBeNull();
  });

  it('meldet "Stand vor 1 h" ab 1 ms über der TTL', () => {
    expect(staleForecastLabel(FETCHED, FETCHED_MS + TTL + 1, TTL)).toBe(
      'Stand vor 1 h',
    );
  });

  it('zählt ganze Stunden ("Stand vor 4 h" bei 4,5 h Alter)', () => {
    expect(
      staleForecastLabel(FETCHED, FETCHED_MS + 4.5 * 3_600_000, TTL),
    ).toBe('Stand vor 4 h');
  });

  it('bleibt null bei unlesbarem Zeitstempel statt NaN anzuzeigen', () => {
    expect(staleForecastLabel('kaputt', FETCHED_MS, TTL)).toBeNull();
  });
});

describe('dayViewStages — Hero-Switch und Listen-Split', () => {
  const stages = [
    makeStage(1),
    makeStage(2),
    makeStage(3, { kind: 'harbour', stageNumber: null }),
    makeStage(4),
  ];
  const main = { stages };

  it('liefert leere Mengen ohne Hauptroute', () => {
    expect(dayViewStages(null, 2, 'insel-2')).toEqual({
      hero: null,
      rest: [],
      past: [],
    });
  });

  it('zeigt heute als Hero, solange die Position nicht dem Tagesziel entspricht', () => {
    const { hero, rest, past } = dayViewStages(main, 2, 'insel-1');
    expect(hero?.day).toBe(2);
    expect(rest.map((s) => s.day)).toEqual([3, 4]);
    expect(past.map((s) => s.day)).toEqual([1]);
  });

  it('zeigt heute als Hero bei unbekannter Position (null)', () => {
    expect(dayViewStages(main, 2, null).hero?.day).toBe(2);
  });

  it('schaltet auf Tag N+1, sobald die Position dem heutigen Ziel entspricht', () => {
    const { hero, rest, past } = dayViewStages(main, 2, 'insel-2');
    expect(hero?.day).toBe(3);
    expect(rest.map((s) => s.day)).toEqual([4]);
    // Der übersprungene Tag zählt zu "Bereits gefahren".
    expect(past.map((s) => s.day)).toEqual([1, 2]);
  });

  it('schaltet an Hafentagen nie — der Hafentag IST der Tag', () => {
    const { hero } = dayViewStages(main, 3, 'insel-3');
    expect(hero?.day).toBe(3);
  });

  it('bleibt am letzten Törntag auf heute, wenn kein Tag N+1 existiert', () => {
    const { hero, rest, past } = dayViewStages(main, 4, 'insel-4');
    expect(hero?.day).toBe(4);
    expect(rest).toEqual([]);
    expect(past.map((s) => s.day)).toEqual([1, 2, 3]);
  });
});

describe('optionsSummary', () => {
  it('zählt jede Option ausser Zustand "zu" als offen', () => {
    expect(
      optionsSummary([
        { state: 'offen', closesOnDay: null },
        { state: 'offen-horizont', closesOnDay: 7 },
        { state: 'schliesst', closesOnDay: 5 },
        { state: 'zu', closesOnDay: 2 },
      ]),
    ).toEqual({ openCount: 3, nextDeadlineDay: 5 });
  });

  it('meldet null als Deadline, wenn keine offene Option eine Frist trägt', () => {
    expect(
      optionsSummary([{ state: 'offen', closesOnDay: null }]),
    ).toEqual({ openCount: 1, nextDeadlineDay: null });
  });

  it('ist leer bei ausschliesslich geschlossenen Optionen', () => {
    expect(
      optionsSummary([
        { state: 'zu', closesOnDay: 3 },
        { state: 'zu', closesOnDay: null },
      ]),
    ).toEqual({ openCount: 0, nextDeadlineDay: null });
  });

  it('ist leer ohne Optionen', () => {
    expect(optionsSummary([])).toEqual({ openCount: 0, nextDeadlineDay: null });
  });
});

describe('restTripVerdictLabel', () => {
  it('benennt alle vier Ampelzustände', () => {
    expect(restTripVerdictLabel('gruen')).toBe('Round-Trip trägt');
    expect(restTripVerdictLabel('gelb')).toBe('Round-Trip unter Vorbehalt');
    expect(restTripVerdictLabel('rot')).toBe('Kein gültiger Round-Trip');
    expect(restTripVerdictLabel('unbewertet')).toBe('Round-Trip unbewertet');
  });
});
