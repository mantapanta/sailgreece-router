/**
 * ABFAHRTSEMPFEHLUNG (abfahrt.ts) — "früh los, 15:00 vor Anker": die
 * späteste volle Abfahrtsstunde, deren simulierte Ankunft das Ankerziel
 * hält; sonst die früheste mit ehrlicher Ankunftswarnung.
 */

import { describe, expect, it } from 'vitest';
import { empfehleAbfahrt } from '../abfahrt.ts';
import { assessLeg } from '../scoring.ts';
import { northSouthScenario } from './fixtures.ts';

describe('empfehleAbfahrt — späteste Abfahrt, die 15:00 hält', () => {
  it('empfiehlt die späteste volle Stunde mit Ankunft vor dem Ankerziel', () => {
    // 20 sm raumschots bei 15 kn: ~3,9 h Fahrt. 11:00 + 3,9 h = 14,9 — hält;
    // 12:00 verfehlt. Die Empfehlung muss also 11:00 sein, nicht früher.
    const { snapshot, leg } = northSouthScenario({ windKn: 15, windFromDeg: 0 });
    const e = empfehleAbfahrt([leg], 1, snapshot)!;
    expect(e).not.toBeNull();
    expect(e.zielErreicht).toBe(true);
    expect(e.ankunftHourAthens).toBeLessThanOrEqual(
      snapshot.params.zielAnkunftHourAthens,
    );
    expect(e.abfahrtHourAthens).toBe(11);
    expect(e.hinweis).toBeNull();
  });

  it('nennt die verfehlte Ankunft, wenn auch die früheste Abfahrt nicht reicht', () => {
    // 60 sm bei ~5,2 kn sind ~11,5 h: selbst ab 06:00 wird es später als 15:00.
    const { snapshot, leg } = northSouthScenario({
      windKn: 15,
      windFromDeg: 0,
      distanceNm: 60,
    });
    const e = empfehleAbfahrt([leg], 1, snapshot)!;
    expect(e).not.toBeNull();
    expect(e.zielErreicht).toBe(false);
    expect(e.abfahrtHourAthens).toBe(snapshot.params.fruehesteAbfahrtHourAthens);
    expect(e.ankunftHourAthens).toBeGreaterThan(
      snapshot.params.zielAnkunftHourAthens,
    );
    expect(e.hinweis).toContain('nicht zu halten');
  });

  it('rechnet die Liegezeit des Zwischenstopps in die Ankunft ein', () => {
    // Hin und zurück (2 × 20 sm) mit 3 h Standard-Liegezeit dazwischen:
    // ~3,9 + 3 + ~3,9 ≈ 10,8 h — die Empfehlung muss deutlich früher liegen
    // als beim Einzelschlag und die Pause in der Ankunft tragen.
    const hin = northSouthScenario({ windKn: 15, windFromDeg: 0 });
    const zurueck = northSouthScenario({
      windKn: 15,
      windFromDeg: 0,
      southbound: false,
    });
    const snapshot = hin.snapshot;
    const e = empfehleAbfahrt([hin.leg, zurueck.leg], 1, snapshot);
    const einzeln = empfehleAbfahrt([hin.leg], 1, snapshot)!;
    if (e) {
      expect(
        e.ankunftHourAthens - e.abfahrtHourAthens,
      ).toBeGreaterThan(snapshot.params.stopHoursDefault + 4);
      expect(e.abfahrtHourAthens).toBeLessThan(einzeln.abfahrtHourAthens);
    } else {
      // Auch legitim: kein Fenster hält die Kette — dann gibt es keine
      // erfundene Empfehlung. Der Einzelschlag muss aber eine haben.
      expect(einzeln).not.toBeNull();
    }
  });

  it('erfindet keine Empfehlung, wenn keine Abfahrtsstunde simulierbar ist', () => {
    const { snapshot, leg } = northSouthScenario({ windKn: 15, windFromDeg: 0 });
    // Ohne Forecast für die Etappen-Punkte ist nichts simulierbar.
    snapshot.forecast = {};
    expect(empfehleAbfahrt([leg], 1, snapshot)).toBeNull();
  });
});

describe('Nachtetappen-Grenze — die empfohlene Frühabfahrt ist keine Nachtfahrt', () => {
  it('06:00-Abfahrt zählt nicht als Nachtetappe, 05:00 schon', () => {
    const { snapshot, leg } = northSouthScenario({ windKn: 15, windFromDeg: 0 });
    // Abfahrtsbasis von Tag 1 auf 06:00 bzw. 05:00 gesetzt (FR15).
    snapshot.trip.departureHourByDay = { 1: 6 };
    expect(assessLeg(leg, 1, snapshot).nightLeg).toBe(false);
    snapshot.trip.departureHourByDay = { 1: 5 };
    expect(assessLeg(leg, 1, snapshot).nightLeg).toBe(true);
  });
});
