/**
 * PROBLEMATISCHE ABSCHNITTE DER ETAPPENKARTE (Skipper 2026-08-06): "Ich will
 * bei den Etappenkarten erkennen, ob problematische Abschnitte mit dabei sind
 * — ca. 4 sm Kreuz (16 kn), ca. 10 sm Halbwind (9 kn)."
 *
 * Vier Fragen:
 *   1. Landet ein Abschnitt in der Kategorie, die die Rechnung ihn nennt?
 *   2. Sind die Ampel-Bänder die vereinbarten — und liegen die Grenzwerte im
 *      milderen Band?
 *   3. Zählt eine Etappe die Meilen zusammen und meldet den STÄRKSTEN Wind?
 *   4. Kommt dieselbe Meldung am Ende aus der echten Simulation heraus?
 */

import { describe, expect, it } from 'vitest';
import {
  kursAbschnitteOfPassages,
  kursAmpel,
  kursKategorie,
  mergeKursAbschnitte,
} from '../kursAbschnitte.ts';
import { assessLeg } from '../scoring.ts';
import { DEFAULT_PARAMS, ParamsSchema } from '../schema/params.ts';
import type { PointPassage } from '../schema/snapshot.ts';
import { northSouthScenario } from './fixtures.ts';

const params = DEFAULT_PARAMS;

/** Eine Durchfahrt mit dem Abschnitt, der zu ihr führt. */
function passage(
  distanceNm: number,
  twaDeg: number,
  twsKn: number,
  kreuzen = false,
): PointPassage {
  return {
    pointKey: `p-${distanceNm}-${twaDeg}`,
    distanceNm,
    etaIso: '2026-08-08T09:00:00Z',
    segment: {
      courseDeg: 0,
      distanceNm,
      twdDeg: 0,
      twsKn,
      twaDeg,
      speedKn: 6,
      motoring: false,
      kreuzen,
      worstCase: false,
    },
  };
}

describe('Kategorie eines Abschnitts', () => {
  it('gegenan und am Wind sind Kreuz, halbwind ist Halbwind', () => {
    // Einteilung des Skippers (2026-08-07): Kreuz bis 80°, Halbwind bis 100°.
    expect(kursKategorie(20, false)).toBe('kreuz');
    expect(kursKategorie(57, false)).toBe('kreuz'); // der Fall aus dem Feldtest
    expect(kursKategorie(75, false)).toBe('kreuz');
    expect(kursKategorie(83, false)).toBe('halbwind');
  });

  it('raumschots und vor dem Wind melden nichts', () => {
    expect(kursKategorie(120, false)).toBeNull();
    expect(kursKategorie(175, false)).toBeNull();
  });

  it('an den Grenzen kippt die Kategorie erst OBERHALB', () => {
    expect(kursKategorie(79.9, false)).toBe('kreuz');
    expect(kursKategorie(80, false)).toBe('halbwind');
    expect(kursKategorie(99.9, false)).toBe('halbwind');
    expect(kursKategorie(100, false)).toBeNull();
  });

  it('ein Abschnitt, der gekreuzt werden MUSS, ist Kreuz — egal welcher Winkel', () => {
    // beatTwaDeg darf bis 70° konfiguriert werden — und ein Abschnitt, der
    // gekreuzt wird, heisst Kreuz, auch wenn sein Winkel über der Beschriftung
    // läge.
    expect(kursKategorie(85, true)).toBe('kreuz');
  });

  it('das Vorzeichen des TWA ist gleichgültig (Bug an Bug)', () => {
    expect(kursKategorie(-40, false)).toBe('kreuz');
    expect(kursKategorie(-83, false)).toBe('halbwind');
  });
});

describe('Ampel-Bänder', () => {
  it('Kreuz: über 20 kn rot, 10-20 kn gelb, darunter grün', () => {
    expect(kursAmpel('kreuz', 9.9, params)).toBe('gruen');
    expect(kursAmpel('kreuz', 16, params)).toBe('gelb');
    expect(kursAmpel('kreuz', 25, params)).toBe('rot');
  });

  it('Halbwind: über 30 kn rot, 20-30 kn gelb, darunter grün', () => {
    expect(kursAmpel('halbwind', 9, params)).toBe('gruen');
    expect(kursAmpel('halbwind', 25, params)).toBe('gelb');
    expect(kursAmpel('halbwind', 31, params)).toBe('rot');
  });

  it('die Grenzwerte selbst zählen zum MILDEREN Band', () => {
    expect(kursAmpel('kreuz', 10, params)).toBe('gelb');
    expect(kursAmpel('kreuz', 20, params)).toBe('gelb');
    expect(kursAmpel('halbwind', 20, params)).toBe('gelb');
    expect(kursAmpel('halbwind', 30, params)).toBe('gelb');
  });

  it('derselbe Wind ist gegenan schlimmer als halbwind', () => {
    expect(kursAmpel('kreuz', 22, params)).toBe('rot');
    expect(kursAmpel('halbwind', 22, params)).toBe('gelb');
  });

  it('die Schwellen kommen aus der Konfiguration, nicht aus dem Code (AD-8)', () => {
    const scharf = ParamsSchema.parse({ kreuzGelbAbKn: 6, kreuzRotAbKn: 12 });
    expect(kursAmpel('kreuz', 8, scharf)).toBe('gelb');
    expect(kursAmpel('kreuz', 16, scharf)).toBe('rot');
  });
});

describe('Parameter-Prüfung der Kurs-Ampel', () => {
  it('gelb muss vor rot liegen', () => {
    expect(() => ParamsSchema.parse({ kreuzGelbAbKn: 20, kreuzRotAbKn: 10 })).toThrow();
    expect(() =>
      ParamsSchema.parse({ halbwindGelbAbKn: 30, halbwindRotAbKn: 30 }),
    ).toThrow();
  });

  it('die Kreuz-Schwellen dürfen die Halbwind-Schwellen nicht überschreiten', () => {
    expect(() =>
      ParamsSchema.parse({ kreuzGelbAbKn: 24, kreuzRotAbKn: 28 }),
    ).toThrow();
  });
});

describe('Zusammenfassung einer Etappe', () => {
  it('fasst je Kategorie zusammen: Meilen addiert, stärkster Wind gemeldet', () => {
    const abschnitte = kursAbschnitteOfPassages(
      [
        // Startpunkt: kein Abschnitt, trägt nichts bei.
        { pointKey: 'start', distanceNm: 0, etaIso: null, segment: null },
        passage(4.3, 57, 16),
        passage(9.6, 83, 9),
        passage(2, 40, 11),
        passage(12, 140, 30), // raumschots — nicht gemeldet
      ],
      params,
    );
    expect(abschnitte).toEqual([
      { kategorie: 'kreuz', distanceNm: 6.3, kreuzNm: 0, maxTwsKn: 16, ampel: 'gelb' },
      { kategorie: 'halbwind', distanceNm: 9.6, kreuzNm: 0, maxTwsKn: 9, ampel: 'gruen' },
    ]);
  });

  /**
   * "8 sm Kreuz sind doch 13–15 sm zu segelnde Strecke" (Skipper 2026-08-07).
   *
   * Sind sie nicht — und genau deshalb stehen die beiden Zahlen getrennt: die
   * Kategorie reicht bis 80° TWA, gekreuzt wird aber erst unter 55°. Nur die
   * Meilen unter `beatTwaDeg` werden im Zickzack gefahren und dabei durchs
   * Wasser länger.
   */
  it('trennt die Meilen am Wind von denen, die wirklich gekreuzt werden', () => {
    const [kreuz] = kursAbschnitteOfPassages(
      [
        passage(2.0, 40, 17, true), // muss gekreuzt werden
        passage(2.5, 59, 17), // am Wind, liegt an
        passage(3.6, 53, 17), // am Wind, liegt an
      ],
      params,
    );
    expect(kreuz).toMatchObject({ distanceNm: 8.1, kreuzNm: 2.0 });
  });

  it('der härtere Kurs steht zuerst — auch wenn er später gesegelt wird', () => {
    const abschnitte = kursAbschnitteOfPassages(
      [passage(10, 83, 9), passage(4, 57, 16)],
      params,
    );
    expect(abschnitte.map((a) => a.kategorie)).toEqual(['kreuz', 'halbwind']);
  });

  it('eine Etappe ohne Kreuz und Halbwind meldet nichts', () => {
    expect(kursAbschnitteOfPassages([passage(20, 150, 25)], params)).toEqual([]);
  });

  it('die schlechteste Stunde trägt das Urteil, nicht die längste Strecke', () => {
    const [kreuz] = kursAbschnitteOfPassages(
      [passage(15, 40, 8), passage(1, 40, 22)],
      params,
    );
    expect(kreuz).toMatchObject({ distanceNm: 16, maxTwsKn: 22, ampel: 'rot' });
  });
});

describe('Zusammenfassung eines ganzen Tages', () => {
  it('zwei Schläge an einem Tag ergeben EINE Kreuz-Zeile', () => {
    const ersterSchlag = kursAbschnitteOfPassages([passage(4, 45, 12)], params);
    const zweiterSchlag = kursAbschnitteOfPassages([passage(6, 50, 21)], params);
    expect(mergeKursAbschnitte([ersterSchlag, zweiterSchlag], params)).toEqual([
      { kategorie: 'kreuz', distanceNm: 10, kreuzNm: 0, maxTwsKn: 21, ampel: 'rot' },
    ]);
  });

  it('ein Tag ohne Etappen (Hafentag) meldet nichts', () => {
    expect(mergeKursAbschnitte([], params)).toEqual([]);
  });
});

describe('aus der echten Simulation', () => {
  it('eine Etappe gegen den Nordwind meldet ihre Kreuz-Meilen', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 16,
      windFromDeg: 0,
      southbound: false, // nach Norden gegen Nord = gegenan
    });
    const a = assessLeg(leg, 1, snapshot);
    const kreuz = a.kursAbschnitte.find((k) => k.kategorie === 'kreuz');
    expect(kreuz).toBeDefined();
    expect(kreuz!.maxTwsKn).toBeCloseTo(16, 6);
    expect(kreuz!.ampel).toBe('gelb');
    // Gemeldet werden die Meilen ÜBER GRUND der gekreuzten Abschnitte — nicht
    // der Zickzack durchs Wasser (der steht in kreuzExtraNm).
    expect(kreuz!.distanceNm).toBeCloseTo(leg.distanceNm, 6);
  });

  it('dieselbe Etappe quer zum Wind meldet Halbwind statt Kreuz', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 16,
      windFromDeg: 90, // Kurs 180, Wind aus Ost => TWA 90
    });
    const a = assessLeg(leg, 1, snapshot);
    expect(a.kursAbschnitte.map((k) => k.kategorie)).toEqual(['halbwind']);
    expect(a.kursAbschnitte[0]!.ampel).toBe('gruen');
  });

  it('vor dem Wind bleibt die Etappenkarte still', () => {
    const { snapshot, leg } = northSouthScenario({ windKn: 16, windFromDeg: 0 });
    expect(assessLeg(leg, 1, snapshot).kursAbschnitte).toEqual([]);
  });

  it('eine nicht simulierbare Etappe behauptet keine Abschnitte', () => {
    const { snapshot, leg } = northSouthScenario({ windKn: 16, windFromDeg: 0 });
    const a = assessLeg(leg, 99, snapshot); // weit hinter der Stundenachse
    expect(a.ampel).toBe('unbewertet');
    expect(a.kursAbschnitte).toEqual([]);
  });
});
