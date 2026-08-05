/**
 * ROUTEN-KONZEPTE (konzept.ts) — die zentrale, alles überschreibende Logik:
 * zwei Revier-Konzepte (Route 1 Klassik / Route 2 Ost), Eignung aus dem
 * Forecast, Vorrang im Solver-Ranking, Konzeptwechsel und die
 * Rückweg-Empfehlung über den westlichen Lee-Korridor.
 */

import { describe, expect, it } from 'vitest';
import {
  deriveKonzeptEntscheid,
  deriveTorChecks,
  konzeptLageFor,
  konzeptOfIslands,
  konzeptOfPlan,
  rueckwegAbweichungInseln,
  rueckwegEmpfehlungFor,
  type KonzeptLage,
} from '../konzept.ts';
import {
  completePlan,
  planMetricsFor,
  preferred,
  type PlanMetrics,
  type SolveResult,
} from '../solver.ts';
import { stagesOf } from '../schema/plan.ts';
import type { PlanAssessment, PlanningSnapshot } from '../schema/snapshot.ts';
import {
  TEST_POLAR,
  constantForecast,
  makeLeg,
  makePlace,
  makePlan,
  makeSnapshot,
  makeStage,
  makeHarbourDay,
  makeTimes,
  makeVariant,
} from './fixtures.ts';

/** 12 Törntage (Standard-Stichtag 2026-08-19) mit Tageswerten für den Wind. */
function lageSnapshot(knByDay: Record<number, number>): PlanningSnapshot {
  const times = makeTimes(12);
  const fc = constantForecast(times.length, 15, 0);
  // Stunde h (UTC-Achse ab Törnstart 00:00 UTC) liegt im Athen-Kalendertag
  // floor((h + 3) / 24) + 1 (Athen = UTC+3 im August).
  fc.windKn = times.map((_t, h) => {
    const day = Math.floor((h + 3) / 24) + 1;
    return knByDay[day] ?? 15;
  });
  return makeSnapshot({ times, forecast: { revier: fc } });
}

describe('Konzept-Klassifikation — Ost-Marker entscheiden', () => {
  it('West- und Zentral-Inseln sind Route 1', () => {
    expect(konzeptOfIslands(['kea', 'kythnos', 'sifnos', 'paros', 'naxos', 'milos'])).toBe(
      'klassik',
    );
  });

  it('ein einziger Ost-Marker macht die Route zu Route 2', () => {
    expect(konzeptOfIslands(['kea', 'syros', 'mykonos'])).toBe('ost');
    expect(konzeptOfIslands(['paros', 'naxos', 'amorgos'])).toBe('ost');
    expect(konzeptOfIslands(['paros', 'ios', 'santorin'])).toBe('ost');
  });

  it('konzeptOfPlan liest die tatsächlich angelaufenen Tagesziele', () => {
    const ost = makePlan([
      makeStage(1, ['athen--kea'], 'kea'),
      makeStage(2, ['kea--mykonos'], 'mykonos'),
    ]);
    const klassik = makePlan([
      makeStage(1, ['athen--kea'], 'kea'),
      makeHarbourDay(2, 'kea'),
    ]);
    expect(konzeptOfPlan(ost)).toBe('ost');
    expect(konzeptOfPlan(klassik)).toBe('klassik');
  });
});

describe('Konzept-Lage — welche Konzepte trägt der Forecast?', () => {
  it('moderater Meltemi (unter beiden Schwellen): beide Konzepte geeignet', () => {
    const lage = konzeptLageFor(lageSnapshot({}));
    expect(lage.eignung.ost).toBe('geeignet');
    expect(lage.eignung.klassik).toBe('geeignet');
  });

  it('anhaltend 6 Bft kippt Route 2, Route 1 trägt weiter', () => {
    const lage = konzeptLageFor(lageSnapshot({ 4: 25, 5: 25, 6: 25 }));
    expect(lage.eignung.ost).toBe('ungeeignet');
    expect(lage.gruende.ost[0]).toContain('Ab Tag 4');
    expect(lage.eignung.klassik).toBe('geeignet');
  });

  it('EIN Starkwindtag ist grenzwertig, kein K.-o. — die Dauer entscheidet', () => {
    const lage = konzeptLageFor(lageSnapshot({ 5: 24 }));
    expect(lage.eignung.ost).toBe('grenzwertig');
    expect(lage.eignung.klassik).toBe('geeignet');
  });

  it('nicht zusammenhängende Starkwindtage bilden kein Starkwindfeld', () => {
    const lage = konzeptLageFor(lageSnapshot({ 3: 24, 7: 24 }));
    expect(lage.eignung.ost).toBe('grenzwertig');
  });

  it('stabiles Starkwindfeld 7–8 Bft über drei Tage kippt auch Route 1', () => {
    const lage = konzeptLageFor(lageSnapshot({ 5: 30, 6: 32, 7: 30 }));
    expect(lage.eignung.klassik).toBe('ungeeignet');
    expect(lage.eignung.ost).toBe('ungeeignet');
  });

  it('Annahme-Stunden machen die Lage-Aussage sichtbar vorbehaltlich', () => {
    const snapshot = lageSnapshot({ 8: 25, 9: 25 });
    snapshot.forecast['revier']!.windAssumed =
      snapshot.times.map((_t, h) => Math.floor((h + 3) / 24) + 1 >= 8);
    const lage = konzeptLageFor(snapshot);
    expect(lage.eignung.ost).toBe('ungeeignet');
    expect(lage.basisAnnahme).toBe(true);
  });
});

describe('Konzept-Entscheid — Kurs halten, umschwenken, abwettern', () => {
  const lage = (
    ost: KonzeptLage['eignung']['ost'],
    klassik: KonzeptLage['eignung']['klassik'],
  ): KonzeptLage => ({
    eignung: { ost, klassik },
    gruende: { ost: ['Ost-Grund.'], klassik: ['Klassik-Grund.'] },
    basisAnnahme: false,
  });
  const library = { islands: [], places: [], invalidPlaces: [], legs: [], variants: [] };

  it('das aktive Konzept wird beibehalten, solange es trägt', () => {
    const e = deriveKonzeptEntscheid(lage('geeignet', 'geeignet'), 'ost', library, 'syros');
    expect(e.empfohlenId).toBe('ost');
    expect(e.wechselHinweis).toBeNull();
  });

  it('kippt Route 2, wird auf Route 1 umgeschwenkt — mit Wechsel-Hinweis', () => {
    const e = deriveKonzeptEntscheid(lage('ungeeignet', 'geeignet'), 'ost', library, 'syros');
    expect(e.empfohlenId).toBe('klassik');
    expect(e.wechselHinweis).toContain('Route 1');
    expect(e.wechselHinweis).toContain('syros');
  });

  it('Route 1 wechselt NIE aus Eignungsgründen nach Ost', () => {
    const e = deriveKonzeptEntscheid(lage('geeignet', 'geeignet'), 'klassik', library, null);
    expect(e.empfohlenId).toBe('klassik');
  });

  it('trägt auch Route 1 nicht, bleibt sie empfohlen — mit Abwetter-Hinweis', () => {
    const e = deriveKonzeptEntscheid(
      lage('ungeeignet', 'ungeeignet'),
      'klassik',
      library,
      'kythnos',
    );
    expect(e.empfohlenId).toBe('klassik');
    expect(e.wechselHinweis).toContain('abwettern');
  });
});

describe('Rückweg — der westliche Lee-Korridor als Maß', () => {
  it('zählt Rückweg-Inseln außerhalb des Korridors, Basis ausgenommen', () => {
    const plan = makePlan([
      makeStage(1, ['athen--paros'], 'paros'),
      makeStage(2, ['paros--milos'], 'milos'),
      makeStage(3, ['milos--paros'], 'paros'),
      makeStage(4, ['paros--syros'], 'syros'),
      makeStage(5, ['syros--kythnos'], 'kythnos'),
      makeStage(6, ['kythnos--athen'], 'athen'),
    ]);
    expect(rueckwegAbweichungInseln(plan, 2, 'athen')).toEqual(['paros', 'syros']);
  });

  it('ein Korridor-Rückweg hat Abweichung null', () => {
    const plan = makePlan([
      makeStage(1, ['athen--paros'], 'paros'),
      makeStage(2, ['paros--milos'], 'milos'),
      makeStage(3, ['milos--sifnos'], 'sifnos'),
      makeStage(4, ['sifnos--serifos'], 'serifos'),
      makeStage(5, ['serifos--athen'], 'athen'),
    ]);
    expect(rueckwegAbweichungInseln(plan, 2, 'athen')).toEqual([]);
  });
});

describe('preferred — das Konzept überschreibt die Reichweite', () => {
  const basis: PlanMetrics = {
    reachNm: 40,
    distinctIslands: 3,
    clockwise: true,
    turnDay: 2,
    harbourDays: 1,
    stages: 4,
    bandDevTenths: 0,
    harbourDev: 0,
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
    (byId: Record<string, Partial<PlanMetrics>>) => (r: SolveResult) => ({
      ...basis,
      ...byId[r.variantId],
    });

  it('ein naher Plan in tragendem Konzept schlägt einen fernen in gekipptem', () => {
    const west = mkResult('west');
    const ost = mkResult('ost');
    const metrics = withMetrics({
      west: { reachNm: 40, konzeptTraegt: true },
      ost: { reachNm: 90, konzeptTraegt: false },
    });
    expect(preferred(ost, west, metrics)).toBe(west);
    expect(preferred(west, ost, metrics)).toBe(west);
  });

  it('der Korridor-Rückweg gewinnt vor dem groben Umlaufsinn', () => {
    const korridor: SolveResult = mkResult('korridor');
    const abseits: SolveResult = mkResult('abseits');
    const metrics = withMetrics({
      korridor: { rueckwegAbweichung: 0, clockwise: false },
      abseits: { rueckwegAbweichung: 2, clockwise: true },
    });
    expect(preferred(abseits, korridor, metrics)).toBe(korridor);
    expect(preferred(korridor, abseits, metrics)).toBe(korridor);
  });
});

describe('planMetricsFor — Konzept und Korridor aus dem Plan selbst', () => {
  it('ein Ost-Plan unter gekippter Ost-Lage trägt nicht', () => {
    const snapshot = lageSnapshot({ 4: 25, 5: 25 });
    snapshot.library.islands = [
      { id: 'athen', name: 'Athen', coordinates: { lat: 37.9, lon: 23.7 } },
      { id: 'mykonos', name: 'Mykonos', coordinates: { lat: 37.45, lon: 25.33 } },
      { id: 'sifnos', name: 'Sifnos', coordinates: { lat: 36.98, lon: 24.67 } },
    ];
    const metrics = planMetricsFor(snapshot);
    const ost: SolveResult = {
      plan: makePlan([
        makeStage(1, ['athen--mykonos'], 'mykonos'),
        makeStage(2, ['mykonos--athen'], 'athen'),
      ]),
      validity: { valid: true, horizonDependent: false, violations: [], safetyViolations: [] },
      relaxedTo: 'none',
      variantId: 'ost',
      turnIslandId: 'mykonos',
    };
    const west: SolveResult = {
      ...ost,
      plan: makePlan([
        makeStage(1, ['athen--sifnos'], 'sifnos'),
        makeStage(2, ['sifnos--athen'], 'athen'),
      ]),
      variantId: 'west',
      turnIslandId: 'sifnos',
    };
    expect(metrics(ost).konzeptTraegt).toBe(false);
    expect(metrics(west).konzeptTraegt).toBe(true);
    // Und im Vergleich gewinnt der tragende Plan trotz geringerer Reichweite:
    // Mykonos liegt kaum südlich, Sifnos deutlich — hier gewinnt Sifnos ohnehin;
    // entscheidend ist, dass preferred den Ost-Plan am Konzept scheitern lässt.
    expect(preferred(ost, west, metrics)).toBe(west);
  });
});

describe('Ende-zu-Ende: das Konzept überschreibt die Solver-Wahl', () => {
  /**
   * Zwei-Ziel-Revier: Mykonos (Ost-Marker) liegt SÜDLICHER als Sifnos und
   * gewinnt die Törnfrage nach reiner Reichweite. Erst die Konzept-Logik
   * entscheidet: bei anhaltend starkem Nordwind darf der Törn nicht nach
   * Osten, bei moderatem darf er.
   */
  function zweiZielSnapshot(windKn: number): PlanningSnapshot {
    const alimos = makePlace({
      id: 'athen-alimos',
      islandId: 'athen',
      coordinates: { lat: 37.9, lon: 23.7 },
    });
    const mykonosHafen = makePlace({
      id: 'mykonos-hafen',
      islandId: 'mykonos',
      coordinates: { lat: 37.2, lon: 25.3 },
    });
    const sifnosHafen = makePlace({
      id: 'sifnos-hafen',
      islandId: 'sifnos',
      coordinates: { lat: 37.35, lon: 24.7 },
    });
    const leg = (from: typeof alimos, to: typeof alimos, nm: number) =>
      makeLeg({
        id: `${from.islandId}--${to.islandId}`,
        fromIslandId: from.islandId,
        toIslandId: to.islandId,
        fromPlaceId: from.id,
        toPlaceId: to.id,
        distanceNm: nm,
      });
    const legs = [
      leg(alimos, mykonosHafen, 40),
      leg(alimos, sifnosHafen, 35),
      leg(mykonosHafen, sifnosHafen, 30),
    ];
    const times = makeTimes(16);
    const fc = constantForecast(times.length, windKn, 0);
    const snap = makeSnapshot({
      times,
      polar: TEST_POLAR,
      forecast: {
        [alimos.id]: fc,
        [mykonosHafen.id]: fc,
        [sifnosHafen.id]: fc,
      },
      library: {
        islands: [
          { id: 'athen', name: 'Athen', coordinates: alimos.coordinates, guestPickup: { ferryReachable: true, sourceNote: 'fixture' } },
          { id: 'mykonos', name: 'Mykonos', coordinates: mykonosHafen.coordinates, guestPickup: { ferryReachable: true, sourceNote: 'fixture' } },
          { id: 'sifnos', name: 'Sifnos', coordinates: sifnosHafen.coordinates, guestPickup: { ferryReachable: true, sourceNote: 'fixture' } },
        ],
        places: [alimos, mykonosHafen, sifnosHafen],
        invalidPlaces: [],
        legs,
        variants: [
          makeVariant('ost-route', [legs[0]!], { escalationRank: 2, name: 'Ost' }),
          makeVariant('west-route', [legs[1]!], { escalationRank: 1, name: 'West' }),
          makeVariant('rueckfallkette-west', [legs[2]!, legs[1]!], {
            escalationRank: 0,
            isReturnChain: true,
            name: 'Kette',
          }),
        ],
      },
      trip: {
        currentDay: 1,
        position: { source: 'manual', lat: alimos.coordinates.lat, lon: alimos.coordinates.lon, placeId: alimos.id },
        plan: null,
        departureHourOverride: null,
        stopHoursByDay: {},
      },
    });
    return snap;
  }

  it('bei anhaltend starkem Wind meidet der Solver das fernere Ost-Ziel', () => {
    const snapshot = zweiZielSnapshot(23);
    expect(konzeptLageFor(snapshot).eignung.ost).toBe('ungeeignet');
    const solved = completePlan(snapshot, 'athen')!;
    expect(solved).not.toBeNull();
    expect(stagesOf(solved.plan).length).toBeGreaterThan(0);
    expect(konzeptOfPlan(solved.plan)).toBe('klassik');
    expect(stagesOf(solved.plan).every((s) => s.toIslandId !== 'mykonos')).toBe(true);
  });

  it('bei moderatem Wind gewinnt die Reichweite — der Törn darf nach Osten', () => {
    const snapshot = zweiZielSnapshot(15);
    expect(konzeptLageFor(snapshot).eignung.ost).toBe('geeignet');
    const solved = completePlan(snapshot, 'athen')!;
    expect(solved).not.toBeNull();
    expect(stagesOf(solved.plan).some((s) => s.toIslandId === 'mykonos')).toBe(true);
  });

  describe('Entscheidungstore — Festlegung dahinter nur mit gedecktem Fenster', () => {
    it('eine frühe Festlegung hinter das Syros-Tor ist bei ruhiger Lage gedeckt', () => {
      const snapshot = zweiZielSnapshot(15);
      const plan = makePlan([
        makeStage(1, ['athen--mykonos'], 'mykonos'),
        makeStage(2, ['mykonos--sifnos'], 'sifnos'),
        makeStage(3, ['sifnos--athen'], 'athen'),
      ]);
      const checks = deriveTorChecks(plan, snapshot);
      expect(checks).toHaveLength(1);
      expect(checks[0]!.torId).toBe('tor-syros');
      expect(checks[0]!.day).toBe(1);
      expect(checks[0]!.islandId).toBe('mykonos');
      expect(checks[0]!.fensterOk).toBe(true);
      expect(checks[0]!.erfuellt).toBe(true);
      expect(checks[0]!.note).toContain('gedeckt');
    });

    it('eine Festlegung jenseits des verlässlichen Horizonts ist NICHT gedeckt', () => {
      const snapshot = zweiZielSnapshot(15);
      const plan = makePlan([
        makeStage(10, ['athen--mykonos'], 'mykonos'),
        makeStage(11, ['mykonos--sifnos'], 'sifnos'),
        makeStage(12, ['sifnos--athen'], 'athen'),
      ]);
      const checks = deriveTorChecks(plan, snapshot);
      expect(checks).toHaveLength(1);
      expect(checks[0]!.fensterOk).toBe(false);
      expect(checks[0]!.erfuellt).toBe(false);
      expect(checks[0]!.note).toContain('NICHT gedeckt');
    });

    it('ohne Tor-Durchfahrt gibt es keine Prüfung, vergangene zählen nicht', () => {
      const snapshot = zweiZielSnapshot(15);
      const nurWest = makePlan([
        makeStage(1, ['athen--sifnos'], 'sifnos'),
        makeStage(2, ['sifnos--athen'], 'athen'),
      ]);
      expect(deriveTorChecks(nurWest, snapshot)).toHaveLength(0);

      const schonDurch = makePlan([
        makeStage(1, ['athen--mykonos'], 'mykonos'),
        makeStage(2, ['mykonos--sifnos'], 'sifnos'),
        makeStage(3, ['sifnos--athen'], 'athen'),
      ]);
      snapshot.trip.currentDay = 2;
      expect(deriveTorChecks(schonDurch, snapshot)).toHaveLength(0);
    });
  });
});

describe('Rückweg-Empfehlung — Sätze für die Hauptroute', () => {
  const planAssessment = (over: Partial<PlanAssessment>): PlanAssessment => ({
    plan: makePlan([]),
    validity: { valid: true, horizonDependent: false, violations: [], safetyViolations: [] },
    stages: [],
    variantId: 'test',
    turnIslandId: 'milos',
    turnDay: null,
    relaxedTo: 'none',
    returnChecks: [],
    meltemiSafeUntilDay: null,
    torChecks: [],
    ...over,
  });

  it('nennt Rückweg-Inseln außerhalb des Korridors beim Namen', () => {
    const plan = makePlan([
      makeStage(1, ['athen--milos'], 'milos'),
      makeStage(2, ['milos--paros'], 'paros'),
      makeStage(3, ['paros--athen'], 'athen'),
    ]);
    const saetze = rueckwegEmpfehlungFor(
      planAssessment({ plan, turnDay: 1 }),
      lageSnapshot({}),
    );
    expect(saetze.some((s) => s.includes('paros') && s.includes('Lee-Korridor'))).toBe(true);
  });

  it('warnt vor der Luv-Falle, wenn die Wende zu spät fällt', () => {
    const plan = makePlan([
      makeStage(10, ['athen--milos'], 'milos'),
      makeStage(11, ['milos--sifnos'], 'sifnos'),
      makeStage(12, ['sifnos--athen'], 'athen'),
    ]);
    const saetze = rueckwegEmpfehlungFor(
      planAssessment({ plan, turnDay: 10 }),
      lageSnapshot({}),
    );
    expect(saetze.some((s) => s.includes('60 %'))).toBe(true);
  });

  it('ein Korridor-Rückweg mit früher Wende bekommt die Bestätigung', () => {
    const plan = makePlan([
      makeStage(1, ['athen--milos'], 'milos'),
      makeStage(2, ['milos--sifnos'], 'sifnos'),
      makeStage(3, ['sifnos--athen'], 'athen'),
    ]);
    const saetze = rueckwegEmpfehlungFor(
      planAssessment({ plan, turnDay: 1 }),
      lageSnapshot({}),
    );
    expect(saetze.some((s) => s.includes('Lee-Korridor') && s.includes('empfohlene'))).toBe(true);
    expect(saetze.some((s) => s.includes('60 %'))).toBe(false);
  });
});
