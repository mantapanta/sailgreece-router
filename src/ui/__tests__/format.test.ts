import { describe, expect, it } from 'vitest';
import {
  compass,
  formatAthensTime,
  formatKursAbschnitt,
  formatKursAmpelRegel,
  formatWaveM,
  formatWindFrom,
  pointOfSail,
} from '../format.ts';
import { DEFAULT_PARAMS, ParamsSchema } from '../../domain/schema/params.ts';

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
 * Der TWA in Segler-Sprache, in der Einteilung des Skippers (2026-08-07):
 * unter 55° wird gekreuzt ("gegenan"), 55–80° ist Am Wind, 80–100° Halbwind,
 * darüber trägt der Wind. Reine Anzeige — NICHT die Bewertungsschwelle
 * params.upwindTwaDeg; ein Label ist nie eine Ampel-Aussage.
 */
describe('pointOfSail — Kurs zum Wind als Name', () => {
  it('benennt die Kurse über den ganzen Winkelbereich', () => {
    expect(pointOfSail(10)).toBe('gegenan');
    expect(pointOfSail(45)).toBe('gegenan');
    expect(pointOfSail(65)).toBe('Am Wind');
    expect(pointOfSail(90)).toBe('Halbwind');
    expect(pointOfSail(120)).toBe('Raumschots');
    expect(pointOfSail(175)).toBe('Vor dem Wind');
  });

  it('ist an den Grenzen eindeutig (kein Loch, keine Überschneidung)', () => {
    expect(pointOfSail(54.9)).toBe('gegenan');
    expect(pointOfSail(55)).toBe('Am Wind');
    expect(pointOfSail(79.9)).toBe('Am Wind');
    expect(pointOfSail(80)).toBe('Halbwind');
    expect(pointOfSail(100)).toBe('Raumschots');
    expect(pointOfSail(150)).toBe('Vor dem Wind');
  });

  it('ohne TWA keinen Kursnamen', () => {
    expect(pointOfSail(null)).toBe('–');
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

/**
 * Die Warnzeile der Etappenkarte (Skipper 2026-08-06): "ca. 4 sm Kreuz
 * (16 kn)". Gerundet wird bewusst auf die Meile — eine Nachkommastelle täuschte
 * eine Genauigkeit vor, die eine Stunden-Simulation nicht hat.
 *
 * Seit der Rückfrage vom 2026-08-07 trennt die Zeile zwei Zahlen, die vorher
 * beide "Kreuz" hiessen: das BAND bis 80° TWA (Kurs liegt an) und die
 * Teilmenge unter 55°, die wirklich im Zickzack gefahren wird. Nur die zweite
 * wird durchs Wasser länger.
 */
describe('formatKursAbschnitt — problematische Abschnitte', () => {
  it('schreibt die Zeile aus dem Feldtest', () => {
    expect(
      formatKursAbschnitt({
        kategorie: 'kreuz',
        distanceNm: 4.3,
        kreuzNm: 0,
        maxTwsKn: 16,
        ampel: 'gelb',
      }),
    ).toBe('ca. 4 sm Kreuz (16 kn)');
    expect(
      formatKursAbschnitt({
        kategorie: 'halbwind',
        distanceNm: 9.6,
        kreuzNm: 0,
        maxTwsKn: 9,
        ampel: 'gruen',
      }),
    ).toBe('ca. 10 sm Halbwind (9 kn)');
  });

  it('nennt die gekreuzten Meilen getrennt, wo wirklich gekreuzt wird', () => {
    expect(
      formatKursAbschnitt({
        kategorie: 'kreuz',
        distanceNm: 8.1,
        kreuzNm: 2.0,
        maxTwsKn: 17,
        ampel: 'gelb',
      }),
    ).toBe('ca. 8 sm Kreuz (17 kn) · davon ca. 2 sm Kreuzschläge');
  });

  it('wird der ganze Abschnitt gekreuzt, heisst er so — ohne "davon"', () => {
    expect(
      formatKursAbschnitt({
        kategorie: 'kreuz',
        distanceNm: 5.6,
        kreuzNm: 5.6,
        maxTwsKn: 17,
        ampel: 'gelb',
      }),
    ).toBe('ca. 6 sm Kreuzschläge (17 kn)');
  });

  it('unter einer Meile bleibt die Nachkommastelle stehen ("ca. 0 sm" wäre keine Angabe)', () => {
    expect(
      formatKursAbschnitt({
        kategorie: 'kreuz',
        distanceNm: 0.4,
        kreuzNm: 0,
        maxTwsKn: 24,
        ampel: 'rot',
      }),
    ).toBe('ca. 0,4 sm Kreuz (24 kn)');
  });
});

describe('formatKursAmpelRegel — die Schwellen hinter der Farbe', () => {
  it('nennt beide Bänder in der Reihenfolge rot, gelb, grün', () => {
    expect(formatKursAmpelRegel('kreuz', DEFAULT_PARAMS)).toBe(
      'Kreuz: über 20 kn rot · 10–20 kn gelb · unter 10 kn grün',
    );
    expect(formatKursAmpelRegel('halbwind', DEFAULT_PARAMS)).toBe(
      'Halbwind: über 30 kn rot · 20–30 kn gelb · unter 20 kn grün',
    );
  });

  it('liest die Zahlen aus den Parametern, nicht aus dem Code (AD-8)', () => {
    const scharf = ParamsSchema.parse({ kreuzGelbAbKn: 6, kreuzRotAbKn: 12 });
    expect(formatKursAmpelRegel('kreuz', scharf)).toBe(
      'Kreuz: über 12 kn rot · 6–12 kn gelb · unter 6 kn grün',
    );
  });
});
