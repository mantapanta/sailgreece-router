/**
 * KREUZ-MODELL (Skipper 2026-08-06): "Ich kann maximal 50 Grad TWA segeln,
 * sonst muss gekreuzt werden … was im Routing eher vermieden werden sollte."
 *
 * Drei Ebenen, drei Fragen:
 *   1. Rechnet die Fahrt richtig, wenn der Kurs enger am Wind liegt als 50°?
 *   2. Weist die Etappe das Kreuzen aus, statt eine anliegende Fahrt zu
 *      behaupten — und rät sie davon ab, ohne es zu verbieten?
 *   3. Vermeidet die Rangfolge Kreuzen, ohne Reichweite oder Vielfalt zu
 *      überstimmen?
 */

import { describe, expect, it } from 'vitest';
import { courseSpeedKn, kreuzFactor, sailSpeedKn } from '../polar.ts';
import { assessLeg } from '../scoring.ts';
import { preferred, type PlanMetrics, type SolveResult } from '../solver.ts';
import { DEFAULT_PARAMS } from '../schema/params.ts';
import { makePlan, makeStage, northSouthScenario, TEST_POLAR } from './fixtures.ts';

const params = DEFAULT_PARAMS;
const rad = (d: number) => (d * Math.PI) / 180;

describe('polar — Kreuzen unter dem engsten segelbaren Winkel', () => {
  it('liegt der Kurs an (TWA >= 50°), wird nichts gekreuzt', () => {
    const cs = courseSpeedKn(TEST_POLAR, 90, 12, params);
    expect(cs.kreuzen).toBe(false);
    expect(cs.speedKn).toBeCloseTo(sailSpeedKn(TEST_POLAR, 90, 12, params), 10);
    expect(cs.speedKn).toBeCloseTo(cs.boatSpeedKn, 10);
    expect(kreuzFactor(90, params)).toBe(1);
  });

  it('an der Grenze selbst ist der Übergang stetig (Faktor 1 bei genau 50°)', () => {
    expect(kreuzFactor(params.beatTwaDeg, params)).toBeCloseTo(1, 10);
    const knapp = courseSpeedKn(TEST_POLAR, params.beatTwaDeg + 0.01, 12, params);
    const drunter = courseSpeedKn(TEST_POLAR, params.beatTwaDeg - 0.01, 12, params);
    // Nur bis auf die Steigung der Polare selbst (~0,11 kn/Grad an dieser
    // Stelle) — verglichen wird die Stetigkeit des Modells, nicht die der Daten.
    expect(drunter.speedKn).toBeCloseTo(knapp.speedKn, 2);
  });

  it('darunter wird gekreuzt: gesegelt bei 50°, auf dem Kurs kommt cos(50)/cos(TWA) an', () => {
    const cs = courseSpeedKn(TEST_POLAR, 22, 12, params);
    expect(cs.kreuzen).toBe(true);
    expect(cs.sailedTwaDeg).toBe(params.beatTwaDeg);
    expect(cs.boatSpeedKn).toBeCloseTo(
      sailSpeedKn(TEST_POLAR, params.beatTwaDeg, 12, params),
      10,
    );
    expect(cs.speedKn).toBeCloseTo(
      cs.boatSpeedKn * (Math.cos(rad(50)) / Math.cos(rad(22))),
      10,
    );
    // Der Umweg ist real: durchs Wasser läuft das Boot deutlich schneller als
    // die Etappe vorankommt.
    expect(cs.speedKn).toBeLessThan(cs.boatSpeedKn * 0.75);
  });

  it('rechnet den Umweg nicht mehr schön — die alte Faltung cos(50−TWA) war zu gut', () => {
    const cs = courseSpeedKn(TEST_POLAR, 22, 12, params);
    const alt = cs.boatSpeedKn * Math.cos(rad(params.beatTwaDeg - 22));
    expect(cs.speedKn).toBeLessThan(alt);
    // Größenordnung: bei 22° TWA rund ein Viertel langsamer als die alte Formel.
    expect(cs.speedKn / alt).toBeLessThan(0.8);
  });

  it('bei 0° TWA bleibt die klassische Am-Wind-VMG cos(50) übrig', () => {
    expect(kreuzFactor(0, params)).toBeCloseTo(Math.cos(rad(50)), 10);
  });

  it('faltet jeden Winkel wie die Polare selbst (−22°, 338° sind derselbe Fall)', () => {
    const ref = courseSpeedKn(TEST_POLAR, 22, 12, params).speedKn;
    expect(courseSpeedKn(TEST_POLAR, -22, 12, params).speedKn).toBeCloseTo(ref, 10);
    expect(courseSpeedKn(TEST_POLAR, 338, 12, params).speedKn).toBeCloseTo(ref, 10);
  });
});

describe('assessLeg — die Etappe weist das Kreuzen aus', () => {
  /** Kurs 000° (nordwärts), Wind aus 022° => TWA 22, also unter 50°. */
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

describe('preferred — Kreuzen wird vermieden, aber nichts wird ihm geopfert', () => {
  const basis: PlanMetrics = {
    reachNm: 40,
    distinctIslands: 3,
    clockwise: true,
    turnDay: 2,
    harbourDays: 1,
    stages: 4,
    bandDevTenths: 0,
    harbourDev: 0,
    kreuzTenths: 0,
    konzeptTraegt: true,
    rueckwegAbweichung: 0,
    maxHarbourRun: 1,
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

  it('die Reichweite bleibt darüber — weiter kommen schlägt bequemer segeln', () => {
    const weit = mkResult('weit');
    const nah = mkResult('nah');
    const metrics = withMetrics({
      weit: { reachNm: 60, kreuzTenths: 60 },
      nah: { reachNm: 40, kreuzTenths: 0 },
    });
    expect(preferred(nah, weit, metrics)).toBe(weit);
  });

  it('und die Inselvielfalt auch — Kreuzen ist ein Preis, kein Ausschluss', () => {
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
