/**
 * KREUZ-MODELL (Skipper 2026-08-06/07): "Ich kann maximal 50 Grad TWA segeln,
 * sonst muss gekreuzt werden … was im Routing eher vermieden werden sollte",
 * präzisiert am 2026-08-07 auf "zwischen 0 und 55 muss ich zickzack aufkreuzen"
 * — der engste segelbare Winkel steht als `params.beatTwaDeg` (55°).
 *
 * Drei Ebenen, drei Fragen:
 *   1. Rechnet die Fahrt richtig, wenn der Kurs enger am Wind liegt als der
 *      engste segelbare Winkel (params.beatTwaDeg, 55°)?
 *   2. Weist die Etappe das Kreuzen aus, statt eine anliegende Fahrt zu
 *      behaupten — und rät sie davon ab, ohne es zu verbieten?
 *   3. Vermeidet die Rangfolge Kreuzen, ohne Reichweite oder Vielfalt zu
 *      überstimmen?
 */

import { describe, expect, it } from 'vitest';
import { courseSpeedKn, kreuzFactor, sailSpeedKn } from '../polar.ts';
import { kreuzSchlaege } from '../kreuz.ts';
import { assessLeg, legWaypointKey } from '../scoring.ts';
import { preferred, type PlanMetrics, type SolveResult } from '../solver.ts';
import {
  angleDiffDeg,
  bearingDeg,
  destinationPoint,
  distanceNm,
  normDeg,
  twaDeg,
} from '../geo.ts';
import { pathCrossesLand } from '../searoute.ts';
import { DEFAULT_PARAMS } from '../schema/params.ts';
import type { Coordinates } from '../schema/common.ts';
import {
  constantForecast,
  makeLeg,
  makePlace,
  makePlan,
  makeSnapshot,
  makeStage,
  makeTimes,
  northSouthScenario,
  TEST_POLAR,
} from './fixtures.ts';

const params = DEFAULT_PARAMS;
const rad = (d: number) => (d * Math.PI) / 180;

describe('polar — Kreuzen unter dem engsten segelbaren Winkel', () => {
  it('liegt der Kurs an (TWA >= beatTwaDeg), wird nichts gekreuzt', () => {
    const cs = courseSpeedKn(TEST_POLAR, 90, 12, params);
    expect(cs.kreuzen).toBe(false);
    expect(cs.speedKn).toBeCloseTo(sailSpeedKn(TEST_POLAR, 90, 12, params), 10);
    expect(cs.speedKn).toBeCloseTo(cs.boatSpeedKn, 10);
    expect(kreuzFactor(90, params)).toBe(1);
  });

  it('an der Grenze selbst ist der Übergang stetig (Faktor 1 bei genau beatTwaDeg)', () => {
    expect(kreuzFactor(params.beatTwaDeg, params)).toBeCloseTo(1, 10);
    const knapp = courseSpeedKn(TEST_POLAR, params.beatTwaDeg + 0.01, 12, params);
    const drunter = courseSpeedKn(TEST_POLAR, params.beatTwaDeg - 0.01, 12, params);
    // Nur bis auf die Steigung der Polare selbst (~0,11 kn/Grad an dieser
    // Stelle) — verglichen wird die Stetigkeit des Modells, nicht die der Daten.
    expect(drunter.speedKn).toBeCloseTo(knapp.speedKn, 2);
  });

  it('darunter wird gekreuzt: gesegelt bei beatTwaDeg, auf dem Kurs kommt cos(beat)/cos(TWA) an', () => {
    const cs = courseSpeedKn(TEST_POLAR, 22, 12, params);
    expect(cs.kreuzen).toBe(true);
    expect(cs.sailedTwaDeg).toBe(params.beatTwaDeg);
    expect(cs.boatSpeedKn).toBeCloseTo(
      sailSpeedKn(TEST_POLAR, params.beatTwaDeg, 12, params),
      10,
    );
    expect(cs.speedKn).toBeCloseTo(
      cs.boatSpeedKn * (Math.cos(rad(params.beatTwaDeg)) / Math.cos(rad(22))),
      10,
    );
    // Der Umweg ist real: durchs Wasser läuft das Boot deutlich schneller als
    // die Etappe vorankommt.
    expect(cs.speedKn).toBeLessThan(cs.boatSpeedKn * 0.75);
  });

  it('rechnet den Umweg nicht mehr schön — die alte Faltung cos(beat−TWA) war zu gut', () => {
    const cs = courseSpeedKn(TEST_POLAR, 22, 12, params);
    const alt = cs.boatSpeedKn * Math.cos(rad(params.beatTwaDeg - 22));
    expect(cs.speedKn).toBeLessThan(alt);
    // Größenordnung: bei 22° TWA rund ein Viertel langsamer als die alte Formel.
    expect(cs.speedKn / alt).toBeLessThan(0.8);
  });

  it('bei 0° TWA bleibt die klassische Am-Wind-VMG cos(beat) übrig', () => {
    expect(kreuzFactor(0, params)).toBeCloseTo(Math.cos(rad(params.beatTwaDeg)), 10);
  });

  it('faltet jeden Winkel wie die Polare selbst (−22°, 338° sind derselbe Fall)', () => {
    const ref = courseSpeedKn(TEST_POLAR, 22, 12, params).speedKn;
    expect(courseSpeedKn(TEST_POLAR, -22, 12, params).speedKn).toBeCloseTo(ref, 10);
    expect(courseSpeedKn(TEST_POLAR, 338, 12, params).speedKn).toBeCloseTo(ref, 10);
  });
});

describe('assessLeg — die Etappe weist das Kreuzen aus', () => {
  /** Kurs 000° (nordwärts), Wind aus 022° => TWA 22, also unter beatTwaDeg. */
  const kreuzEtappe = () =>
    northSouthScenario({ windKn: 12, windFromDeg: 22, southbound: false });

  it('zählt Kreuz-Stunden und den Umweg, statt eine anliegende Fahrt zu behaupten', () => {
    const { snapshot, leg } = kreuzEtappe();
    const a = assessLeg(leg, 1, snapshot);
    expect(a.kreuzHours).not.toBeNull();
    // Die ganze Etappe liegt unter dem Am-Wind-Winkel: jede Segelstunde kreuzt.
    expect(a.kreuzHours!).toBeCloseTo(a.sailHours!, 6);
    expect(a.kreuzExtraNm!).toBeGreaterThan(0);
    expect(a.breakdown.every((h) => h.kreuzen)).toBe(true);
    expect(a.breakdown[0]!.sailedTwaDeg).toBe(params.beatTwaDeg);
    // Ausgewiesen wird die Fahrt auf der Ideallinie — durchs Wasser mehr.
    expect(a.breakdown[0]!.boatSpeedKn).toBeGreaterThan(a.breakdown[0]!.speedKn);
    expect(a.pointPassages.some((p) => p.segment?.kreuzen === true)).toBe(true);
  });

  it('dauert länger als dieselbe Etappe mit anliegendem Kurs', () => {
    const gekreuzt = assessLeg(kreuzEtappe().leg, 1, kreuzEtappe().snapshot);
    const anliegend = (() => {
      // Derselbe Kurs, aber Wind aus 090° => TWA 90, nichts zu kreuzen.
      const { snapshot, leg } = northSouthScenario({
        windKn: 12,
        windFromDeg: 90,
        southbound: false,
      });
      return assessLeg(leg, 1, snapshot);
    })();
    expect(anliegend.kreuzHours).toBe(0);
    expect(gekreuzt.totalHours!).toBeGreaterThan(anliegend.totalHours!);
  });

  it('rät ab statt zu verbieten: gelb mit Begründung, kein Sicherheits-Befund', () => {
    const { snapshot, leg } = kreuzEtappe();
    const a = assessLeg(leg, 1, snapshot);
    expect(a.ampel).toBe('gelb');
    expect(a.reasons.join(' ')).toContain(`enger als ${params.beatTwaDeg}° am Wind`);
    // Der FR16-Satz (Aufkreuzen im Starkwind) ist ein ANDERER — bei 12 kn fällt
    // er nicht, und nur er macht aus einer roten Etappe eine Sicherheits-
    // verletzung (solver.ts).
    expect(a.reasons.some((r) => r.includes('wahrem Wind'))).toBe(false);
  });

  it('ein kurzer Kreuzschlag unter der Schwelle bleibt ohne Befund', () => {
    const { snapshot, leg } = kreuzEtappe();
    const geduldig = {
      ...snapshot,
      params: { ...snapshot.params, kreuzGelbAbStunden: 24 },
    };
    const a = assessLeg(leg, 1, geduldig);
    expect(a.kreuzHours!).toBeGreaterThan(0);
    expect(a.ampel).toBe('gruen');
  });

  it('unter Motor wird nicht gekreuzt — der Kurs liegt an', () => {
    // 4 kn aus 022°: die Fahrt auf dem Kurs fällt unter minSailSpeedKn.
    const { snapshot, leg } = northSouthScenario({
      windKn: 4,
      windFromDeg: 22,
      southbound: false,
    });
    const a = assessLeg(leg, 1, snapshot);
    expect(a.motorHours!).toBeGreaterThan(0);
    expect(a.kreuzHours).toBe(0);
    expect(a.breakdown.every((h) => !h.kreuzen)).toBe(true);
  });

  /**
   * DER KREUZ-ABSCHNITT MITTEN IN DER ETAPPE (Skipper-Befund 2026-08-07:
   * "hier wird gegen den Wind (TWA 36) geroutet, trotz Regel nicht höher als
   * TWA 50").
   *
   * Die Simulation lief stundenweise und nahm den Kurs des Abschnitts, auf dem
   * die Stunde BEGANN — für die ganze Stunde. Eine Etappe, die mit einem
   * kurzen Schlag aus der Bucht heraus anfängt, rechnete damit ihre erste
   * Stunde komplett auf diesem einen Kurs, und die 4 sm, die danach mit 36°
   * TWA gegenan gehen, erschienen als Halbwind: kein Kreuzen, keine
   * Kreuz-Stunden, keine Warnung — und in der Rechnung stand eine Zeile mit
   * Kurs 82°, Wind aus 357° und 178° TWA, die es nicht geben kann.
   *
   * Weil `kreuzTenths` (solver.ts) genau aus diesen Stunden kommt, war das
   * nicht nur eine falsche Anzeige: die Rangfolge konnte das Aufkreuzen nicht
   * vermeiden, was sie nicht sah.
   */
  describe('Abschnitte innerhalb einer Stunde', () => {
    /** 0,6 sm nach Süden aus der Bucht, 5,2 sm nach Osten, 4,0 sm nach NO. */
    const etappe = () => {
      const start = makePlace({
        id: 'start-hafen',
        islandId: 'startinsel',
        coordinates: { lat: 36.725, lon: 24.45 },
      });
      const ziel = makePlace({
        id: 'ziel-bucht',
        islandId: 'zielinsel',
        coordinates: { lat: 36.7668, lon: 24.611 },
      });
      const leg = makeLeg({
        distanceNm: 9.8,
        waypoints: [
          { lat: 36.715, lon: 24.45 },
          { lat: 36.711, lon: 24.5656 },
        ],
      });
      const times = makeTimes();
      // Meltemi aus Nord, wie am Befundtag: 17 kn aus 357°.
      const fc = constantForecast(times.length, 17, 357);
      const snapshot = makeSnapshot({
        times,
        polar: TEST_POLAR,
        forecast: {
          [start.id]: fc,
          [ziel.id]: fc,
          [legWaypointKey(leg.id, 0)]: fc,
          [legWaypointKey(leg.id, 1)]: fc,
        },
        library: {
          islands: [
            { id: 'startinsel', name: 'Start', coordinates: start.coordinates },
            { id: 'zielinsel', name: 'Ziel', coordinates: ziel.coordinates },
          ],
          places: [start, ziel],
          invalidPlaces: [],
          legs: [],
          variants: [],
        },
      });
      return { snapshot, leg };
    };

    it('jede Zeile der Rechnung nennt den TWA IHRES Kurses', () => {
      const { snapshot, leg } = etappe();
      const a = assessLeg(leg, 1, snapshot);
      for (const h of a.breakdown) {
        expect(h.twaDeg).toBeCloseTo(twaDeg(h.courseDeg, h.twdDeg), 6);
      }
      for (const p of a.pointPassages) {
        if (!p.segment) continue;
        expect(p.segment.twaDeg).toBeCloseTo(
          twaDeg(p.segment.courseDeg, p.segment.twdDeg),
          6,
        );
      }
    });

    it('der Abschnitt mit 36° TWA wird gekreuzt, auch wenn die Stunde anders begann', () => {
      const { snapshot, leg } = etappe();
      const a = assessLeg(leg, 1, snapshot);
      const letzter = a.pointPassages[a.pointPassages.length - 1]!.segment!;
      expect(letzter.twaDeg).toBeLessThan(params.beatTwaDeg);
      expect(letzter.kreuzen).toBe(true);
      expect(a.kreuzHours!).toBeGreaterThan(0);
      // Der Kreuz-Abschnitt taucht in der Warnliste auf, statt im Halbwind zu
      // verschwinden — rund die 4 sm des letzten Schlags.
      const kreuz = a.kursAbschnitte.find((k) => k.kategorie === 'kreuz');
      expect(kreuz).toBeDefined();
      expect(kreuz!.distanceNm).toBeGreaterThan(3);
    });

    it('kein Schritt ist länger als die Stunde, in der er liegt', () => {
      const { snapshot, leg } = etappe();
      const a = assessLeg(leg, 1, snapshot);
      const summe = a.breakdown.reduce((s, h) => s + h.hours, 0);
      expect(summe).toBeCloseTo(a.totalHours!, 6);
      for (const h of a.breakdown) expect(h.hours).toBeLessThanOrEqual(1 + 1e-9);
      // Die Schritte einer Stunde teilen sich deren Zeitstempel.
      const proStunde = new Map<string, number>();
      for (const h of a.breakdown) {
        proStunde.set(h.timeIso, (proStunde.get(h.timeIso) ?? 0) + h.hours);
      }
      for (const stunde of proStunde.values()) {
        expect(stunde).toBeLessThanOrEqual(1 + 1e-9);
      }
    });
  });

  it('gilt auch ohne Polare — die flache Ersatzfahrt ist die durchs Wasser', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 12,
      windFromDeg: 22,
      southbound: false,
      polar: null,
    });
    const a = assessLeg(leg, 1, snapshot);
    expect(a.kreuzHours!).toBeGreaterThan(0);
    expect(a.breakdown[0]!.speedKn).toBeCloseTo(
      params.fallbackSpeeds.upwindKn * kreuzFactor(22, params),
      6,
    );
  });
});

describe('kreuz — der Zickzack: zwei Bugs, 100° Wende, längere Strecke', () => {
  /** Offene See westlich der Kykladen — kein Land, das den Zickzack stört. */
  const from: Coordinates = { lat: 36.9, lon: 24.0 };
  const nach = (bearing: number, nm: number) => destinationPoint(from, bearing, nm);

  it('liegt der Kurs an, gibt es keine Kreuz', () => {
    // Kurs 000°, Wind aus 090° => TWA 90.
    expect(kreuzSchlaege(from, nach(0, 20), 90, params)).toBeNull();
  });

  it('segelt beide Bugs bei genau beatTwaDeg zum Wind — 2×beat Kursänderung je Wende', () => {
    // Kurs 000°, Wind aus 022° => TWA 22, muss gekreuzt werden.
    const k = kreuzSchlaege(from, nach(0, 20), 22, params)!;
    expect(k).not.toBeNull();
    expect(k.wendewinkelDeg).toBe(2 * params.beatTwaDeg);
    for (const s of k.schlaege) {
      expect(twaDeg(s.courseDeg, 22)).toBeCloseTo(params.beatTwaDeg, 6);
    }
    // Genau zwei Kurse, und zwischen ihnen liegt der doppelte Wendewinkel.
    const kurse = [...new Set(k.schlaege.map((s) => Math.round(s.courseDeg)))];
    expect(kurse).toHaveLength(2);
    expect(angleDiffDeg(kurse[0]!, kurse[1]!)).toBeCloseTo(2 * params.beatTwaDeg, 0);
    expect(new Set(k.schlaege.map((s) => s.bug))).toEqual(
      new Set(['backbord', 'steuerbord']),
    );
    // Wenden = Schläge − 1, und gewendet wird mindestens einmal.
    expect(k.wenden).toBe(k.schlaege.length - 1);
    expect(k.wenden).toBeGreaterThanOrEqual(1);
  });

  it('die Schläge wechseln den Bug — nie zweimal derselbe hintereinander', () => {
    const k = kreuzSchlaege(from, nach(0, 30), 22, params)!;
    for (let i = 1; i < k.schlaege.length; i++) {
      expect(k.schlaege[i]!.bug).not.toBe(k.schlaege[i - 1]!.bug);
    }
  });

  it('der lange Schlag kommt zuerst — der Bug, der näher am Kurs liegt', () => {
    // Kurs 000°, Wind aus 010°: der Kurs liegt dichter am Steuerbordbug
    // (Wind − 50 = 320°) ... nein, an dem, dessen Kurs weniger abweicht.
    const k = kreuzSchlaege(from, nach(0, 30), 10, params)!;
    const erster = k.schlaege[0]!;
    const zweiter = k.schlaege[1]!;
    expect(erster.nm).toBeGreaterThan(zweiter.nm);
    expect(angleDiffDeg(erster.courseDeg, 0)).toBeLessThan(
      angleDiffDeg(zweiter.courseDeg, 0),
    );
  });

  it('die Summe der Schläge ist genau der Umweg aus polar.ts — eine Wahrheit, zwei Stellen', () => {
    const ziel = nach(0, 20);
    const D = distanceNm(from, ziel);
    for (const twa of [0, 10, 22, 35, 49]) {
      const k = kreuzSchlaege(from, ziel, twa, params)!;
      const gesegelt = k.schlaege.reduce((s, x) => s + x.nm, 0);
      // kreuzFactor sagt, was von der Fahrt ankommt; sein Kehrwert ist der
      // Streckenzuschlag. Beides muss dieselbe Kreuz meinen.
      expect(gesegelt).toBeCloseTo(D / kreuzFactor(twa, params), 4);
      expect(gesegelt).toBeGreaterThan(D);
    }
  });

  it('endet am Ziel — der Zickzack führt hin, er läuft nicht daneben vorbei', () => {
    const ziel = nach(0, 20);
    const k = kreuzSchlaege(from, ziel, 22, params)!;
    const letzter = k.schlaege[k.schlaege.length - 1]!;
    expect(distanceNm(letzter.to, ziel)).toBeLessThan(0.01);
    expect(k.track[0]).toEqual(from);
    expect(k.track).toHaveLength(k.schlaege.length + 1);
    // Und er holt aus: kein Punkt des Zickzacks liegt auf der Ideallinie.
    const mitten = k.track[1]!;
    expect(angleDiffDeg(bearingDeg(from, mitten), bearingDeg(from, ziel))).toBeGreaterThan(
      5,
    );
  });

  it('kürzere Schläge, wenn der Skipper sie kürzer plant', () => {
    const ziel = nach(0, 30);
    const lang = kreuzSchlaege(from, ziel, 22, { ...params, kreuzSchlagNm: 15 })!;
    const kurz = kreuzSchlaege(from, ziel, 22, { ...params, kreuzSchlagNm: 3 })!;
    expect(kurz.wenden).toBeGreaterThan(lang.wenden);
  });

  it('zeichnet keinen Zickzack über Land — lieber gar keinen', () => {
    // Quer über Naxos: jeder ausholende Schlag liegt an Land.
    const west: Coordinates = { lat: 37.1, lon: 25.35 };
    const ost: Coordinates = { lat: 37.15, lon: 25.65 };
    const k = kreuzSchlaege(west, ost, normDeg(bearingDeg(west, ost) - 20), params);
    if (k && k.landImWeg) {
      expect(k.track).toEqual([]);
      // Der Umweg bleibt trotzdem richtig — nur die Skizze fehlt.
      expect(k.schlaege.length).toBeGreaterThan(1);
    } else {
      expect(pathCrossesLand(k!.track)).toBe(false);
    }
  });
});

describe('assessLeg — der Zickzack hängt an der Etappe', () => {
  it('führt Wenden und Track, wenn gekreuzt wird', () => {
    // Offene See (lon 24,0): der Zickzack holt aus und braucht Platz dafür.
    const { snapshot, leg } = northSouthScenario({
      windKn: 12,
      windFromDeg: 22,
      southbound: false,
      lon: 24.0,
    });
    const a = assessLeg(leg, 1, snapshot);
    expect(a.wenden!).toBeGreaterThanOrEqual(1);
    expect(a.kreuzTrack.length).toBeGreaterThan(2);
    // Der Track beginnt am Start und endet am Ziel der Etappe.
    const start = snapshot.library.places.find((p) => p.id === leg.fromPlaceId)!;
    const ziel = snapshot.library.places.find((p) => p.id === leg.toPlaceId)!;
    expect(distanceNm(a.kreuzTrack[0]!, start.coordinates)).toBeLessThan(0.01);
    expect(
      distanceNm(a.kreuzTrack[a.kreuzTrack.length - 1]!, ziel.coordinates),
    ).toBeLessThan(0.01);
  });

  it('zählt die Wenden auch dort, wo kein landfreier Zickzack zu zeichnen ist', () => {
    // Der Default-Ort liegt zwischen den westlichen Kykladen: die Ideallinie
    // ist frei, jeder ausholende Schlag läuft an Land. Gekreuzt werden MUSS
    // trotzdem — die Wenden sind der Handgriff, die Skizze nur die Karte.
    const { snapshot, leg } = northSouthScenario({
      windKn: 12,
      windFromDeg: 22,
      southbound: false,
    });
    const a = assessLeg(leg, 1, snapshot);
    expect(a.kreuzHours!).toBeGreaterThan(0);
    expect(a.wenden!).toBeGreaterThanOrEqual(1);
    expect(a.kreuzTrack).toEqual([]);
  });

  it('liegt der Kurs an, bleibt der Track leer — nichts zu zeichnen', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 12,
      windFromDeg: 90,
      southbound: false,
    });
    const a = assessLeg(leg, 1, snapshot);
    expect(a.wenden).toBe(0);
    expect(a.kreuzTrack).toEqual([]);
  });
});

describe('preferred — Kreuzen wird vermieden, aber nichts wird ihm geopfert', () => {
  const basis: PlanMetrics = {
    reachNm: 40,
    distinctIslands: 3,
    clockwise: true,
    turnDay: 2,
    legDays: 4,
    stages: 4,
    bandDevTenths: 0,
    kreuzTenthsRueckweg: 0,
    kreuzTenths: 0,
    konzeptTraegt: true,
    rueckwegAbweichung: 0,
  };
  const mkResult = (id: string): SolveResult => ({
    plan: makePlan([makeStage(1, ['athen--west'], 'west')]),
    validity: { valid: true, horizonDependent: false, violations: [], safetyViolations: [] },
    relaxedTo: 'none',
    variantId: id,
    turnIslandId: 'sued',
  });
  const withMetrics =
    (byId: Record<string, Partial<PlanMetrics>>) =>
    (r: SolveResult): PlanMetrics => ({ ...basis, ...byId[r.variantId] });

  it('unter sonst gleichen Plänen gewinnt der, der anliegen kann', () => {
    const anliegend = mkResult('anliegend');
    const kreuzend = mkResult('kreuzend');
    const metrics = withMetrics({
      anliegend: { kreuzTenths: 0 },
      kreuzend: { kreuzTenths: 35 },
    });
    expect(preferred(anliegend, kreuzend, metrics)).toBe(anliegend);
    expect(preferred(kreuzend, anliegend, metrics)).toBe(anliegend);
  });

  it('der RÜCKWEG entscheidet vor dem Gesamtwert — dort kostet Kreuzen wirklich', () => {
    /**
     * ZIELMODELL V3 (Skipper 2026-08-07): "ein angenehmer Rückweg, ohne
     * Kreuzen oder mit möglichst wenig Kreuzen, ist ein entscheidendes
     * Kriterium". Hinaus fährt man mit dem Meltemi im Rücken, heim gegen ihn
     * an — die Summe über den ganzen Törn konnte diesen Unterschied nie sehen.
     *
     * Bis dahin stand an dieser Stelle "die Reichweite bleibt darüber". Sie
     * steht jetzt auf Rang 13 und ist die Frage des Optionsraums, nicht die
     * der Hauptroute.
     */
    const angenehm = mkResult('angenehm');
    const gegenan = mkResult('gegenan');
    const metrics = withMetrics({
      angenehm: { kreuzTenthsRueckweg: 0, kreuzTenths: 60 },
      gegenan: { kreuzTenthsRueckweg: 40, kreuzTenths: 40 },
    });
    expect(preferred(gegenan, angenehm, metrics)).toBe(angenehm);
  });

  it('die Inselvielfalt bleibt darüber — Kreuzen ist ein Preis, kein Ausschluss', () => {
    const viele = mkResult('viele');
    const wenige = mkResult('wenige');
    const metrics = withMetrics({
      viele: { distinctIslands: 5, kreuzTenths: 40 },
      wenige: { distinctIslands: 3, kreuzTenths: 0 },
    });
    expect(preferred(wenige, viele, metrics)).toBe(viele);
  });

  it('vor dem Wegstunden-Band: der Umweg zählt als Umweg, nicht nur als Stunden', () => {
    const anliegend = mkResult('anliegend');
    const kreuzend = mkResult('kreuzend');
    const metrics = withMetrics({
      anliegend: { kreuzTenths: 0, bandDevTenths: 20 },
      kreuzend: { kreuzTenths: 30, bandDevTenths: 0 },
    });
    expect(preferred(kreuzend, anliegend, metrics)).toBe(anliegend);
  });
});
