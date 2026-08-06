import { describe, expect, it } from 'vitest';
import {
  compass,
  formatAthensTime,
  formatTripDayShort,
  formatWaveM,
  formatWindFrom,
  pointOfSail,
} from '../format.ts';

/**
 * Die Stunden-Achse des Snapshots ist normativ UTC, angezeigt wird Ortszeit
 * Athen (AD-9). Der Törn liegt im August, also in der Sommerzeit — aber ein
 * fest verdrahtetes +03:00 wäre im Winter falsch, und genau das soll dieser
 * Test verhindern.
 */
describe('formatAthensTime — UTC-Achse, Anzeige in Ortszeit Athen', () => {
  it('rechnet im Sommer (EEST) um +3 h', () => {
    expect(formatAthensTime('2026-08-08T06:00:00Z')).toBe('09:00');
    expect(formatAthensTime('2026-08-08T21:00:00Z')).toBe('00:00');
  });

  it('rechnet im Winter (EET) um +2 h — kein fest verdrahtetes +03:00', () => {
    expect(formatAthensTime('2026-01-15T06:00:00Z')).toBe('08:00');
  });

  it('zeigt Mitternacht als 00:00, nicht als 24:00 (ICU-hourCycle)', () => {
    expect(formatAthensTime('2026-08-07T21:00:00Z')).toBe('00:00');
  });

  it('reicht den Fallback der Simulation unverändert durch', () => {
    // domain/scoring.ts setzt '+7h', wenn die Achse die Stunde nicht deckt.
    expect(formatAthensTime('+7h')).toBe('+7h');
  });
});

/**
 * Die Rechnung soll ohne Rückfrage lesbar sein: "aus NNW 335°" sagt dasselbe
 * zweimal — einmal in Cockpit-Sprache, einmal nachrechenbar.
 */
describe('formatWindFrom — Windrichtung als Himmelsrichtung und Grad', () => {
  it('nennt Himmelsrichtung und Gradzahl', () => {
    expect(formatWindFrom(335)).toBe('NNW 335°');
    expect(formatWindFrom(0)).toBe('N 0°');
    expect(formatWindFrom(90)).toBe('E 90°');
  });

  it('normalisiert auf 0–359°, statt 361° zu behaupten', () => {
    expect(formatWindFrom(361)).toBe('N 1°');
    expect(formatWindFrom(-90)).toBe('W 270°');
  });

  it('ohne Wert kein erfundener Nordwind', () => {
    expect(formatWindFrom(null)).toBe('–');
    expect(compass(null)).toBe('–');
  });
});

/**
 * Der TWA in Segler-Sprache. Reine Anzeige: die Grenzen hier sind die übliche
 * Einteilung und NICHT die Bewertungsschwelle params.upwindTwaDeg — deshalb
 * darf ein Label auch nie als Ampel-Aussage gelesen werden.
 */
describe('pointOfSail — Kurs zum Wind als Name', () => {
  it('benennt die Kurse über den ganzen Winkelbereich', () => {
    expect(pointOfSail(10)).toBe('gegenan');
    expect(pointOfSail(45)).toBe('Am Wind');
    expect(pointOfSail(90)).toBe('Halbwind');
    expect(pointOfSail(120)).toBe('Raumschots');
    expect(pointOfSail(175)).toBe('Vor dem Wind');
  });

  it('ist an den Grenzen eindeutig (kein Loch, keine Überschneidung)', () => {
    expect(pointOfSail(30)).toBe('Am Wind');
    expect(pointOfSail(60)).toBe('Halbwind');
    expect(pointOfSail(100)).toBe('Raumschots');
    expect(pointOfSail(150)).toBe('Vor dem Wind');
  });

  it('ohne TWA keinen Kursnamen', () => {
    expect(pointOfSail(null)).toBe('–');
  });
});

/**
 * Story 1.3 — der Tag-Tag der Karten-Etappenkarten: kurzer Wochentag plus
 * "d.M." ohne führende Nullen, zusammengesetzt aus den BESTEHENDEN Formattern
 * (kein neues Intl-Muster). ICU liefert den kurzen Wochentag in de-DE ohne
 * Punkt ("Sa", nicht "Sa.").
 */
describe('formatTripDayShort — Tag-Tag der Karten-Etappenkarten', () => {
  it('setzt Wochentag und d.M. für Tag 1 zusammen', () => {
    expect(formatTripDayShort('2026-08-08', 1)).toBe('Sa 8.8.');
  });

  it('zählt den Törntag über den Kalender weiter (Tag 2)', () => {
    expect(formatTripDayShort('2026-08-08', 2)).toBe('So 9.8.');
  });
});

/**
 * Story 1.4 — Wellenwerte mit deutschem Dezimalkomma, eine Nachkommastelle,
 * "–" statt einer leeren Kachel (dieselbe Konvention wie formatKn/formatHours).
 */
describe('formatWaveM — Wellenhöhe/-grenze in Metern', () => {
  it('formatiert mit Dezimalkomma und einer Nachkommastelle', () => {
    expect(formatWaveM(0.3)).toBe('0,3 m');
  });

  it('zeigt auch ganze Meter mit Nachkommastelle ("1,0 m")', () => {
    expect(formatWaveM(1)).toBe('1,0 m');
  });

  it('ohne Wert kein erfundener Wellenwert', () => {
    expect(formatWaveM(null)).toBe('–');
  });
});
