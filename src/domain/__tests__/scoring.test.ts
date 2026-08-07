import { describe, expect, it } from 'vitest';
import {
  assessLeg,
  budgetVerdict,
  departureHourChoices,
  departureHourForDay,
  legWaypointKey,
  stopHoursForDay,
  upwindWindVerdict,
} from '../scoring.ts';
import { DEFAULT_PARAMS } from '../schema/params.ts';
import { twaDeg } from '../geo.ts';
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

  it('departureHourByDay wirkt GENAU an dem Tag, für den es gesetzt ist', () => {
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
    snapshot.trip.departureHourByDay = { 1: 6 }; // 06:00 Athens = 03:00 UTC
    // Tag 1 trägt die Wahl: Abfahrt in das 28-kn-Fenster => rot.
    expect(assessLeg(leg, 1, snapshot).ampel).toBe('rot');
    // Tag 2 hat keine eigene Wahl und keine Empfehlung — Standard 09:00
    // (06:00 UTC) => nicht rot.
    expect(assessLeg(leg, 2, snapshot).ampel).not.toBe('rot');
  });

  /**
   * Übernahme-Fenster: am ERSTEN Törntag ist eine Abfahrt 14–17 Uhr möglich
   * (Boots-Übergabe am Nachmittag) — und NUR dort. An jedem anderen Tag fällt
   * eine späte Wahl auf den Standard zurück, statt den Tag in die Nacht
   * zu rechnen.
   */
  it('späte Abfahrt (14–17 Uhr) gilt an Törntag 1 — die Rechnung startet dann nachmittags', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 12,
      windFromDeg: 0,
      southbound: false, // northbound = beating against the northerly
    });
    // 28 kn from N only between 12:00 and 14:59 UTC (15:00–17:59 Athens) —
    // only a late-afternoon departure runs into the blast.
    for (const key of Object.keys(snapshot.forecast)) {
      const fc = snapshot.forecast[key]!;
      for (let i = 0; i < snapshot.times.length; i++) {
        fc.windKn[i] = i % 24 >= 12 && i % 24 < 15 ? 28 : 12;
        fc.windDirDeg[i] = 0;
      }
    }
    snapshot.trip.currentDay = 1;
    snapshot.trip.departureHourByDay = { 1: 15 }; // 15:00 Athens = 12:00 UTC
    expect(departureHourForDay(snapshot, 1)).toBe(15);
    expect(assessLeg(leg, 1, snapshot).ampel).toBe('rot');
  });

  it('späte Abfahrt an jedem anderen Törntag => Standard-Abfahrt statt Override', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 12,
      windFromDeg: 0,
      southbound: false,
    });
    for (const key of Object.keys(snapshot.forecast)) {
      const fc = snapshot.forecast[key]!;
      for (let i = 0; i < snapshot.times.length; i++) {
        fc.windKn[i] = i % 24 >= 12 && i % 24 < 15 ? 28 : 12;
        fc.windDirDeg[i] = 0;
      }
    }
    snapshot.trip.currentDay = 2;
    snapshot.trip.departureHourByDay = { 2: 15 };
    // Nicht Tag 1: die späte Wahl greift nicht — Standard 09:00 (Athen).
    expect(departureHourForDay(snapshot, 2)).toBe(
      snapshot.params.departureHourAthens,
    );
    expect(assessLeg(leg, 2, snapshot).ampel).not.toBe('rot');
    // Eine Vormittags-Wahl bleibt dagegen auch an Tag 2 wirksam.
    snapshot.trip.departureHourByDay = { 2: 10 };
    expect(departureHourForDay(snapshot, 2)).toBe(10);
  });

  it('departureHourChoices: das Übernahme-Fenster 14–17 gibt es nur an Tag 1', () => {
    expect(departureHourChoices(1)).toEqual([6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17]);
    expect(departureHourChoices(2)).toEqual([6, 7, 8, 9, 10, 11, 12]);
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
 * FR30 — die Rechnung muss ihre Windannahme AUSWEISEN.
 *
 * TWA und Fahrt allein sind nicht nachprüfbar: derselbe Winkel entsteht aus
 * beliebig vielen Kombinationen von Kurs und Windrichtung. Erst die Richtung,
 * AUS DER gerechnet wurde (AD-6), macht die Zeile überprüfbar — sie ist damit
 * kein Anzeigedetail, sondern Teil des Ergebnisses.
 */
describe('FR30 — ausgewiesene Windannahme (Richtung, Stärke, TWA, Fahrt)', () => {
  it('jede Stunde nennt die Windrichtung, aus der sie gerechnet hat', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 14,
      windFromDeg: 315,
      southbound: true,
    });
    const a = assessLeg(leg, 1, snapshot);
    expect(a.breakdown.length).toBeGreaterThan(0);
    for (const h of a.breakdown) {
      expect(h.twdDeg).toBe(315);
      expect(h.twsKn).toBe(14);
    }
  });

  it('TWA ist der Winkel zwischen ausgewiesenem Kurs und ausgewiesener Richtung', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 14,
      windFromDeg: 315,
      southbound: true,
    });
    const a = assessLeg(leg, 1, snapshot);
    for (const h of a.breakdown) {
      expect(h.twaDeg).toBeCloseTo(twaDeg(h.courseDeg, h.twdDeg), 6);
    }
    // Kurs ~180 gegen Wind aus 315 => 135° TWA, raumschots.
    expect(a.breakdown[0]!.twaDeg).toBeCloseTo(135, 0);
  });

  it('jeder Abschnitt der Tabelle trägt dieselbe Richtung wie seine Stunde', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 14,
      windFromDeg: 315,
      southbound: true,
    });
    const a = assessLeg(leg, 1, snapshot);
    for (const p of a.pointPassages.slice(1)) {
      expect(p.segment!.twdDeg).toBe(315);
      expect(p.segment!.twaDeg).toBeCloseTo(
        twaDeg(p.segment!.courseDeg, p.segment!.twdDeg),
        6,
      );
    }
  });

  /**
   * Der eigentliche Grund, warum die mittlere Richtung in der Domain liegt:
   * arithmetisch gemittelt ergäben 350° und 10° die Zahl 180 — die exakte
   * Gegenrichtung. Eine View, die das selbst rechnet, macht aus Nordwind
   * Südwind.
   */
  it('die mittlere Richtung wird zirkulär gemittelt (350°/10° => ~0°, nicht 180°)', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 12,
      windFromDeg: 0,
      southbound: true,
      polar: null,
    });
    const dirs = snapshot.times.map((_, i) => (i % 2 === 0 ? 350 : 10));
    const fc = {
      ...constantForecast(snapshot.times.length, 12, 0),
      windDirDeg: dirs,
    };
    const a = assessLeg(leg, 1, {
      ...snapshot,
      forecast: { 'start-hafen': fc, 'ziel-bucht': fc },
    });
    expect(new Set(a.breakdown.map((h) => h.twdDeg))).toEqual(new Set([350, 10]));
    const avg = a.avgTwdDeg!;
    expect(avg).not.toBeNull();
    // Abstand zur Nordrichtung über die 0°-Grenze hinweg.
    expect(Math.min(avg, 360 - avg)).toBeLessThan(15);
  });

  it('heben sich die Richtungen auf, gibt es keine mittlere Richtung (null statt Nord)', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 12,
      windFromDeg: 0,
      southbound: true,
      polar: null,
    });
    // 0°/180° im Wechsel: die Vektorsumme ist null — atan2(0,0) wäre 0 und
    // würde "Nord" behaupten, obwohl es die Hälfte der Zeit von Süd wehte.
    const dirs = snapshot.times.map((_, i) => (i % 2 === 0 ? 0 : 180));
    const fc = {
      ...constantForecast(snapshot.times.length, 12, 0),
      windDirDeg: dirs,
    };
    const a = assessLeg(leg, 1, {
      ...snapshot,
      forecast: { 'start-hafen': fc, 'ziel-bucht': fc },
    });
    // Genug Schritte, dass sich der Wechsel überhaupt auswirken kann — wie
    // viele es sind, hängt an den Fahrten und ist keine Aussage der Prüfung.
    expect(a.breakdown.length).toBeGreaterThan(2);
    expect(a.avgTwdDeg).toBeNull();
    // Die Stundenzeilen selbst behalten ihre echten Richtungen.
    expect(a.breakdown.map((h) => h.twdDeg)).toContain(180);
  });

  it('avgSpeedKn ist die zurückgelegte Distanz je Stunde unter Weg', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 15,
      windFromDeg: 0,
      southbound: true,
      distanceNm: 18,
      polar: null,
    });
    const a = assessLeg(leg, 1, snapshot);
    // 18 sm bei flachen 6,0 kn Segelfahrt => 3 h => 6,0 kn im Mittel.
    expect(a.avgSpeedKn).toBeCloseTo(6.0, 2);
    expect(a.avgSpeedKn).toBeCloseTo(leg.distanceNm / a.totalHours!, 6);
  });

  it('eine unbewertete Etappe behauptet keine Windannahme', () => {
    const { snapshot, leg } = northSouthScenario({ windKn: 12, windFromDeg: 0 });
    const a = assessLeg({ ...leg, fromPlaceId: 'gibt-es-nicht' }, 1, snapshot);
    expect(a.ampel).toBe('unbewertet');
    expect(a.avgTwdDeg).toBeNull();
    expect(a.avgSpeedKn).toBeNull();
    expect(a.breakdown).toEqual([]);
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
