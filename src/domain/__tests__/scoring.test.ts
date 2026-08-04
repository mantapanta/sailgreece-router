import { describe, expect, it } from 'vitest';
import {
  assessLeg,
  budgetVerdict,
  legWaypointKey,
  stopHoursForDay,
  upwindWindVerdict,
} from '../scoring.ts';
import { DEFAULT_PARAMS } from '../schema/params.ts';
import { constantForecast, northSouthScenario } from './fixtures.ts';

const params = DEFAULT_PARAMS;

describe('FR16 wind rule: no beating upwind above 25 kn', () => {
  it('upwind course at 27 kn TWS => rot', () => {
    expect(upwindWindVerdict(30, 27, params)).toBe('rot');
  });

  it('upwind course near the threshold (reserve band) => gelb', () => {
    expect(upwindWindVerdict(30, 24, params)).toBe('gelb');
  });

  it('upwind course in moderate wind => gruen', () => {
    expect(upwindWindVerdict(30, 15, params)).toBe('gruen');
  });

  it('downwind course at 27 kn is not the beating rule => gruen', () => {
    expect(upwindWindVerdict(150, 27, params)).toBe('gruen');
  });
});

describe('FR16 day budgets: target 5+1 / 6+0, hard max 6+2', () => {
  it('5 h sail + 1 h motor => gruen (target)', () => {
    expect(budgetVerdict(5, 1, 15, params).ampel).toBe('gruen');
  });

  it('6 h pure sailing => gruen (target)', () => {
    expect(budgetVerdict(6, 0, 15, params).ampel).toBe('gruen');
  });

  it('between target and hard max (e.g. 6 h sail + 1.5 h motor) => gelb', () => {
    expect(budgetVerdict(6, 1.5, 15, params).ampel).toBe('gelb');
  });

  it('hard max boundary 6 h sail + 2 h motor => gelb (inclusive)', () => {
    expect(budgetVerdict(6, 2, 15, params).ampel).toBe('gelb');
  });

  it('beyond hard max => rot', () => {
    expect(budgetVerdict(7, 2, 15, params).ampel).toBe('rot');
    expect(budgetVerdict(6, 2.5, 15, params).ampel).toBe('rot');
  });

  it('light wind exception: 11 h at 5 kn TWS => gelb, not rot (night legs)', () => {
    expect(budgetVerdict(4, 7, 5, params).ampel).toBe('gelb');
  });

  it('light wind exception capped at 12 h', () => {
    expect(budgetVerdict(6, 7, 5, params).ampel).toBe('rot');
  });
});

describe('assessLeg — integration against a synthetic snapshot (AD-3)', () => {
  it('beating against 27 kn from the north => leg ampel rot', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 27,
      windFromDeg: 0,
      southbound: false, // sailing north, against the meltemi
    });
    const a = assessLeg(leg, 1, snapshot);
    expect(a.ampel).toBe('rot');
    expect(a.reasons.join(' ')).toContain('Aufkreuzen');
  });

  it('running south before 18 kn from the north => gruen, sensible duration', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 18,
      windFromDeg: 0,
      southbound: true,
      distanceNm: 20,
    });
    const a = assessLeg(leg, 1, snapshot);
    expect(a.ampel).toBe('gruen');
    // Dead downwind (TWA 180): TEST_POLAR gives ~5.1-6.0 kn + 0.5 offset.
    expect(a.totalHours).not.toBeNull();
    expect(a.totalHours!).toBeGreaterThan(2.5);
    expect(a.totalHours!).toBeLessThan(4.5);
    expect(a.sailHours).toBeGreaterThan(0);
  });

  it('assesses the future window of trip day N, not today (FR15)', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 18,
      windFromDeg: 0,
      southbound: false,
    });
    // Day 1+2 calm from the south, day 3 heavy northerly: only day 3 is rot.
    for (const key of Object.keys(snapshot.forecast)) {
      const fc = snapshot.forecast[key]!;
      for (let i = 0; i < snapshot.times.length; i++) {
        const dayOffset = Math.floor(i / 24);
        fc.windKn[i] = dayOffset < 2 ? 12 : 28;
        fc.windDirDeg[i] = 0;
      }
    }
    expect(assessLeg(leg, 1, snapshot).ampel).not.toBe('rot');
    expect(assessLeg(leg, 3, snapshot).ampel).toBe('rot');
  });

  it('leg reaching beyond the forecast horizon => unbewertet (never gruen/rot)', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 15,
      windFromDeg: 0,
    });
    const a = assessLeg(leg, 30, snapshot); // far beyond the axis
    expect(a.ampel).toBe('unbewertet');
    expect(a.totalHours).toBeNull();
  });

  it('null hours inside the leg window => unbewertet', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 15,
      windFromDeg: 0,
    });
    for (const key of Object.keys(snapshot.forecast)) {
      const fc = snapshot.forecast[key]!;
      for (let i = 0; i < snapshot.times.length; i++) {
        fc.windKn[i] = null;
        fc.windDirDeg[i] = null;
      }
    }
    expect(assessLeg(leg, 1, snapshot).ampel).toBe('unbewertet');
  });

  it('departureHourOverride applies ONLY to the current day, never to simulated future days', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 12,
      windFromDeg: 0,
      southbound: false, // northbound = beating against the northerly
    });
    // Every day: 28 kn from N between 03:00 and 05:59 UTC (early morning),
    // gentle 12 kn otherwise. Only a 06:00-Athens departure hits the blast.
    for (const key of Object.keys(snapshot.forecast)) {
      const fc = snapshot.forecast[key]!;
      for (let i = 0; i < snapshot.times.length; i++) {
        fc.windKn[i] = i % 24 >= 3 && i % 24 < 6 ? 28 : 12;
        fc.windDirDeg[i] = 0;
      }
    }
    snapshot.trip.currentDay = 1;
    snapshot.trip.departureHourOverride = 6; // 06:00 Athens = 03:00 UTC
    // Today the override applies: departure into the 28-kn window => rot.
    expect(assessLeg(leg, 1, snapshot).ampel).toBe('rot');
    // Tomorrow the default 09:00 departure applies (06:00 UTC) => not rot.
    expect(assessLeg(leg, 2, snapshot).ampel).not.toBe('rot');
  });

  it('without a polar the flat fallback speeds are used (FR26)', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 15,
      windFromDeg: 0,
      southbound: true,
      distanceNm: 18,
      polar: null,
    });
    const a = assessLeg(leg, 1, snapshot);
    // 18 nm at flat 6.0 kn sail => 3 h
    expect(a.totalHours).toBeCloseTo(3, 1);
    expect(a.ampel).toBe('gruen');
  });
});

/**
 * FR30 — die angezeigte Rechnung ist wegpunktbasiert, nicht stündlich.
 * Die alte Stundentabelle konnte Punkte überspringen (kein Punkt in dieser
 * Stunde) oder doppelt nennen (zwei Punkte in einer Stunde); diese Zusage
 * hält sie fest: jeder Punkt genau einmal, in Fahrtreihenfolge.
 */
describe('FR30 pointPassages — jeder Etappenpunkt genau einmal', () => {
  const assessWithWaypoints = () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 12,
      windFromDeg: 270,
      distanceNm: 20,
    });
    const legWithWps = {
      ...leg,
      waypoints: [
        { lat: 37.3, lon: 24.5 },
        { lat: 37.15, lon: 24.5 },
      ],
    };
    const fc = constantForecast(snapshot.times.length, 12, 270);
    return assessLeg(legWithWps, 1, {
      ...snapshot,
      forecast: {
        ...snapshot.forecast,
        [legWaypointKey(legWithWps.id, 0)]: fc,
        [legWaypointKey(legWithWps.id, 1)]: fc,
      },
    });
  };

  it('nennt Start, beide Wegpunkte und das Ziel — je einmal', () => {
    const a = assessWithWaypoints();
    const keys = a.pointPassages.map((p) => p.pointKey);
    expect(keys).toEqual([
      'start-hafen',
      legWaypointKey('start--ziel', 0),
      legWaypointKey('start--ziel', 1),
      'ziel-bucht',
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('Distanzen laufen von 0 bis zur kuratierten Etappenlänge', () => {
    const a = assessWithWaypoints();
    const dist = a.pointPassages.map((p) => p.distanceNm);
    expect(dist[0]).toBe(0);
    expect(dist[dist.length - 1]).toBeCloseTo(20, 6);
    for (let i = 1; i < dist.length; i++) expect(dist[i]!).toBeGreaterThan(dist[i - 1]!);
  });

  it('Durchfahrtszeiten steigen monoton und beginnen bei der Abfahrt', () => {
    const a = assessWithWaypoints();
    const ms = a.pointPassages.map((p) => (p.etaIso ? Date.parse(p.etaIso) : null));
    expect(ms.every((m) => m !== null)).toBe(true);
    // Abfahrt 09:00 Athen am 2026-08-08 = 06:00 UTC (Sommerzeit).
    expect(new Date(ms[0]!).toISOString()).toBe('2026-08-08T06:00:00.000Z');
    for (let i = 1; i < ms.length; i++) expect(ms[i]!).toBeGreaterThan(ms[i - 1]!);
  });

  it('der Startpunkt hat keinen Abschnitt, alle anderen einen', () => {
    const a = assessWithWaypoints();
    expect(a.pointPassages[0]!.segment).toBeNull();
    for (const p of a.pointPassages.slice(1)) {
      expect(p.segment).not.toBeNull();
      expect(p.segment!.distanceNm).toBeGreaterThan(0);
    }
  });

  it('die Abschnittslängen summieren sich auf die Etappenlänge', () => {
    const a = assessWithWaypoints();
    const sum = a.pointPassages.reduce((s, p) => s + (p.segment?.distanceNm ?? 0), 0);
    expect(sum).toBeCloseTo(20, 6);
  });
});

/**
 * Liegezeit an Zwischenstopps: sie verschiebt die Abfahrt der Folge-Etappe.
 * Das ist der ganze Sinn der Sache — nach drei Stunden Mittagspause fällt der
 * zweite Schlag in ein anderes Forecast-Fenster.
 */
describe('Liegezeit an Zwischenstopps (stopHoursForDay)', () => {
  const scenario = (stopHoursByDay: Record<number, number>) => {
    const { snapshot, leg } = northSouthScenario({ windKn: 12, windFromDeg: 270 });
    return {
      leg,
      snapshot: {
        ...snapshot,
        trip: { ...snapshot.trip, stopHoursByDay },
      },
    };
  };

  it('greift auf den Default aus den Parametern zurück', () => {
    const { snapshot } = scenario({});
    expect(stopHoursForDay(snapshot, 1)).toBe(DEFAULT_PARAMS.stopHoursDefault);
    expect(DEFAULT_PARAMS.stopHoursDefault).toBe(3);
  });

  it('ein Tages-Override gilt nur für seinen Tag', () => {
    const { snapshot } = scenario({ 4: 1.5 });
    expect(stopHoursForDay(snapshot, 4)).toBe(1.5);
    expect(stopHoursForDay(snapshot, 5)).toBe(DEFAULT_PARAMS.stopHoursDefault);
  });

  it('0 h Override ist erlaubt und NICHT der Default', () => {
    const { snapshot } = scenario({ 2: 0 });
    expect(stopHoursForDay(snapshot, 2)).toBe(0);
  });

  it('der Offset verschiebt die Abfahrt der Folge-Etappe um genau die Liegezeit', () => {
    const { snapshot, leg } = scenario({});
    const first = assessLeg(leg, 1, snapshot);
    expect(first.pointPassages[0]!.etaIso).toBe('2026-08-08T06:00:00.000Z');

    // Folge-Etappe ohne Pause: startet bei Ankunft der ersten.
    const ohnePause = assessLeg(leg, 1, snapshot, {
      departureOffsetHours: first.totalHours ?? 0,
    });
    // Mit Pause: drei Stunden später.
    const mitPause = assessLeg(leg, 1, snapshot, {
      departureOffsetHours: (first.totalHours ?? 0) + stopHoursForDay(snapshot, 1),
    });
    const t = (a: typeof ohnePause) => Date.parse(a.pointPassages[0]!.etaIso!);
    expect(t(mitPause) - t(ohnePause)).toBe(3 * 3600_000);
  });
});
