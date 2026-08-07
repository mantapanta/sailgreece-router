/**
 * ZIELMODELL V2 (Spec: spec-zielmodell-v2.md, Skipper-Entscheidungen 2026-08-05).
 *
 * Planen und Absichern sind getrennt: geplant wird optimistisch auf das
 * Wetterfenster (Forecast + Persistenz-Annahme), abgesichert wird täglich über
 * die Abbruch-Notation. Der Suchraum sind Rundkurse über den Graphen der
 * kuratierten Etappen; kein Übernachtungsplatz kommt zweimal vor.
 */

import { describe, expect, it } from 'vitest';
import { enumerateRoundTrips } from '../roundTrips.ts';
import {
  buildCandidates,
  completePlan,
  deriveReturnChecks,
  meltemiSafeUntilDay,
  preferred,
  validatePlan,
  type SolveResult,
} from '../solver.ts';
import { assessTargetOption } from '../options.ts';
import { assessPlanning } from '../assess.ts';
import { stagesOf } from '../schema/plan.ts';
import { routeIslandSequence } from '../ppr.ts';
import type { Island } from '../schema/island.ts';
import type { PlanningSnapshot } from '../schema/snapshot.ts';
import type { PlanMetrics } from '../solver.ts';
import {
  TEST_POLAR,
  TRIP_START,
  constantForecast,
  makeHarbourDay,
  makeLeg,
  makePlace,
  makePlan,
  makeSnapshot,
  makeStage,
  makeTimes,
  makeVariant,
} from './fixtures.ts';

/**
 * Die Rauten-Welt: von der Basis führt eine ECHTE Runde über vier Inseln
 * (athen → west → sued → ost → athen), während die Rückfallkette die
 * Umkehrung des Hinwegs ist — genau die Konstellation, in der der alte
 * Kandidatenraum nur Pendeln kannte. 'west' hat zwei Plätze (Hin- und
 * Rückweg dürfen dort liegen), 'ost' und 'sued' je einen.
 */
function diamondSnapshot(
  opts: {
    windKn?: number;
    windFromDeg?: number;
    reliableHorizonDays?: number;
    currentDay?: number;
  } = {},
): PlanningSnapshot {
  const athen = makePlace({ id: 'athen-alimos', islandId: 'athen', coordinates: { lat: 37.9, lon: 23.7 } });
  const west = makePlace({ id: 'west-hafen', islandId: 'west', coordinates: { lat: 37.55, lon: 23.5 } });
  const westZwei = makePlace({ id: 'west-bucht', islandId: 'west', coordinates: { lat: 37.53, lon: 23.52 } });
  const sued = makePlace({ id: 'sued-hafen', islandId: 'sued', coordinates: { lat: 37.3, lon: 23.7 } });
  const ost = makePlace({ id: 'ost-bucht', islandId: 'ost', coordinates: { lat: 37.55, lon: 23.9 } });

  const leg = (from: typeof athen, to: typeof athen, nm = 20) =>
    makeLeg({
      id: `${from.islandId}--${to.islandId}`,
      fromIslandId: from.islandId,
      toIslandId: to.islandId,
      fromPlaceId: from.id,
      toPlaceId: to.id,
      distanceNm: nm,
    });

  const ring = [leg(athen, west), leg(west, sued), leg(sued, ost), leg(ost, athen)];
  const chain = [leg(sued, west), leg(west, athen)];
  const legs = [...ring, ...chain];
  const variants = [
    makeVariant('sued-route', [ring[0]!, ring[1]!], { escalationRank: 1, name: 'Süd-Route' }),
    makeVariant('rueckfallkette-west', chain, {
      escalationRank: 0,
      isReturnChain: true,
      name: 'Rückfallkette West',
    }),
  ];

  const places = [athen, west, westZwei, sued, ost];
  const islands: Island[] = ['athen', 'west', 'sued', 'ost'].map((id) => ({
    id,
    name: id,
    coordinates: places.find((p) => p.islandId === id)!.coordinates,
    guestPickup: { ferryReachable: true, sourceNote: 'fixture' },
  }));

  const times = makeTimes(14);
  const fc = constantForecast(times.length, opts.windKn ?? 10, opts.windFromDeg ?? 90);
  const snap = makeSnapshot({
    times,
    polar: TEST_POLAR,
    forecast: Object.fromEntries(places.map((p) => [p.id, fc])),
    library: { islands, places, invalidPlaces: [], legs, variants },
    trip: {
      currentDay: opts.currentDay ?? 1,
      position: { source: 'manual', lat: athen.coordinates.lat, lon: athen.coordinates.lon, placeId: athen.id },
      plan: null,
      departureHourByDay: {},
      empfohleneAbfahrtByDay: {},
      stopHoursByDay: {},
    },
  });
  snap.params = {
    ...snap.params,
    tripStartDate: TRIP_START,
    tripLengthDays: 6,
    returnDeadlineDate: '2026-08-13', // Törntag 6
    reliableHorizonDays: opts.reliableHorizonDays ?? 14,
  };
  return snap;
}

describe('roundTrips — Rundkurs-Suche über den Etappen-Graphen', () => {
  it('findet die echte Runde, nicht nur das Pendeln', () => {
    const snapshot = diamondSnapshot();
    const trips = enumerateRoundTrips(snapshot, 'athen', 6);
    const sequences = trips.map((t) => routeIslandSequence(t).join('>'));
    expect(sequences).toContain('athen>west>sued>ost>athen');
    // Auch die Gegenrichtung existiert — welche gewinnt, entscheidet preferred.
    expect(sequences).toContain('athen>ost>sued>west>athen');
  });

  it('endet immer an der Basis und durchfährt sie nie', () => {
    const snapshot = diamondSnapshot();
    for (const trip of enumerateRoundTrips(snapshot, 'athen', 6)) {
      const seq = routeIslandSequence(trip);
      expect(seq[seq.length - 1]).toBe('athen');
      expect(seq.slice(1, -1)).not.toContain('athen');
    }
  });

  it('respektiert die Etappen-Obergrenze', () => {
    const snapshot = diamondSnapshot();
    for (const trip of enumerateRoundTrips(snapshot, 'athen', 3)) {
      expect(trip.length).toBeLessThanOrEqual(3);
    }
  });

  it('ist deterministisch', () => {
    const a = enumerateRoundTrips(diamondSnapshot(), 'athen', 6).map((t) => t.map((l) => l.id).join('>'));
    const b = enumerateRoundTrips(diamondSnapshot(), 'athen', 6).map((t) => t.map((l) => l.id).join('>'));
    expect(a).toEqual(b);
  });

  it('erreicht eine Sackgassen-Insel über die Stichfahrt', () => {
    // 'fern' hängt nur an 'sued' — ohne Stichfahrt käme sie in keiner Runde
    // vor (jede Insel nur einmal hiesse: sued wäre zweimal nötig).
    const snapshot = diamondSnapshot();
    const fern = makePlace({ id: 'fern-bucht', islandId: 'fern', coordinates: { lat: 37.1, lon: 23.7 } });
    snapshot.library.places.push(fern);
    snapshot.library.islands.push({
      id: 'fern',
      name: 'fern',
      coordinates: fern.coordinates,
      guestPickup: { ferryReachable: true, sourceNote: 'fixture' },
    });
    snapshot.library.legs.push(
      makeLeg({
        id: 'sued--fern',
        fromIslandId: 'sued',
        toIslandId: 'fern',
        fromPlaceId: 'sued-hafen',
        toPlaceId: fern.id,
        distanceNm: 15,
      }),
    );
    const trips = enumerateRoundTrips(snapshot, 'athen', 7);
    const withFern = trips.filter((t) => routeIslandSequence(t).includes('fern'));
    expect(withFern.length).toBeGreaterThan(0);
    // Die Stichfahrt kehrt auf derselben Verbindung zurück.
    expect(
      withFern.some((t) => routeIslandSequence(t).join('>').includes('sued>fern>sued')),
    ).toBe(true);
  });

  it('von unterwegs: liefert Fortsetzungen bis zur Basis', () => {
    const snapshot = diamondSnapshot();
    const trips = enumerateRoundTrips(snapshot, 'sued', 4);
    expect(trips.length).toBeGreaterThan(0);
    for (const trip of trips) {
      const seq = routeIslandSequence(trip);
      expect(seq[0]).toBe('sued');
      expect(seq[seq.length - 1]).toBe('athen');
    }
  });
});

describe('solver — die Runde schlägt das Pendeln (Zielmodell v2)', () => {
  it('wählt die Runde über vier Inseln statt derselben Kette hin und zurück', () => {
    const snapshot = diamondSnapshot();
    const solved = completePlan(snapshot, 'athen')!;
    expect(solved.validity.valid).toBe(true);
    const islands = stagesOf(solved.plan).map((s) => s.toIslandId);
    // Die Runde läuft west, sued und ost an — das Pendeln käme nie über ost.
    expect(islands).toContain('ost');
    expect(new Set(islands).size).toBe(islands.length);
    expect(solved.turnIslandId).toBe('sued');
  });

  it('der Kandidatenraum enthält beide Formen — entschieden wird über preferred', () => {
    const snapshot = diamondSnapshot();
    const candidates = buildCandidates(snapshot, 'athen');
    const seqs = candidates.map((c) => routeIslandSequence(c.legs).join('>'));
    expect(seqs).toContain('athen>west>sued>ost>athen'); // Runde
    expect(seqs).toContain('athen>west>sued>west>athen'); // Pendeln (Rückfallebene)
  });
});

describe('validatePlan — die Liegeplatz-Regel (1e)', () => {
  it('zwei Aufenthalte auf einer Ein-Platz-Insel sind eine Wiederholung', () => {
    const snapshot = diamondSnapshot();
    const plan = makePlan([
      makeStage(1, ['sued--ost'], 'ost'),
      makeStage(2, ['ost--athen'], 'athen'),
      makeStage(3, ['athen--ost'], 'ost'),
      makeStage(4, ['ost--athen'], 'athen'),
      makeHarbourDay(5, 'athen'),
      makeHarbourDay(6, 'athen'),
    ]);
    const validity = validatePlan(plan, snapshot);
    expect(validity.violations.some((v) => v.kind === 'wiederholung')).toBe(true);
  });

  it('aufeinanderfolgende Nächte sind EIN Aufenthalt, keine Wiederholung', () => {
    const snapshot = diamondSnapshot();
    const plan = makePlan([
      makeStage(1, ['athen--ost'], 'ost'),
      makeHarbourDay(2, 'ost'), // Liegetag am selben Platz — kein zweiter Aufenthalt
      makeStage(3, ['ost--athen'], 'athen'),
      makeHarbourDay(4, 'athen'),
      makeHarbourDay(5, 'athen'),
      makeHarbourDay(6, 'athen'),
    ]);
    const validity = validatePlan(plan, snapshot);
    expect(validity.violations.some((v) => v.kind === 'wiederholung')).toBe(false);
  });

  it('zwei Aufenthalte gehen, wenn die Insel zwei Plätze hat — die Basis immer', () => {
    const snapshot = diamondSnapshot();
    const plan = makePlan([
      makeStage(1, ['athen--west'], 'west'),
      makeStage(2, ['west--sued'], 'sued'),
      makeStage(3, ['sued--west'], 'west'), // zweiter Aufenthalt, west hat zwei Plätze
      makeStage(4, ['west--athen'], 'athen'),
      makeHarbourDay(5, 'athen'),
      makeHarbourDay(6, 'athen'),
    ]);
    const validity = validatePlan(plan, snapshot);
    expect(validity.violations.some((v) => v.kind === 'wiederholung')).toBe(false);
  });

  it('derselbe explizit gewählte Platz in zwei Aufenthalten ist verboten', () => {
    const snapshot = diamondSnapshot();
    const plan = makePlan([
      makeStage(1, ['athen--west'], 'west', 'skipper', 'west-hafen'),
      makeStage(2, ['west--sued'], 'sued'),
      makeStage(3, ['sued--west'], 'west', 'skipper', 'west-hafen'),
      makeStage(4, ['west--athen'], 'athen'),
      makeHarbourDay(5, 'athen'),
      makeHarbourDay(6, 'athen'),
    ]);
    const validity = validatePlan(plan, snapshot);
    expect(
      validity.violations.some((v) => v.kind === 'wiederholung' && v.text.includes('west-hafen')),
    ).toBe(true);
  });
});

describe('preferred — die Rangfolge des Zielmodells v3', () => {
  /**
   * Die Rangfolge IST die Entscheidung, deshalb wird sie hier Kriterium für
   * Kriterium festgehalten — mit synthetischen Kennzahlen, damit jeder Fall
   * genau EINEN Unterschied prüft.
   *
   * Der Umbau vom 2026-08-07: die Reichweite ist von Rang 3 auf Rang 13
   * gerutscht, der Rahmen-Vertrag (Etappentage, Wiederholungsfreiheit,
   * Inselvielfalt) steht jetzt oben, und der Rückweg entscheidet darunter.
   */
  const basis: PlanMetrics = {
    reachNm: 40,
    distinctIslands: 3,
    clockwise: true,
    turnDay: 2,
    legDays: 4,
    repeatStays: 0,
    stages: 4,
    bandDevTenths: 0,
    kreuzTenthsRueckweg: 0,
    kreuzTenths: 0,
    konzeptTraegt: true,
    rueckwegAbweichung: 0,
    umlaufsinnPasst: null,
  };
  const mkResult = (id: string): SolveResult => ({
    plan: makePlan([makeStage(1, ['athen--west'], 'west')]),
    validity: { valid: true, horizonDependent: false, violations: [], safetyViolations: [] },
    relaxedTo: 'none',
    variantId: id,
    turnIslandId: 'sued',
  });
  const withMetrics = (byId: Record<string, Partial<PlanMetrics>>) => (r: SolveResult) => ({
    ...basis,
    ...byId[r.variantId],
  });

  it('Kriterium 1: ein Sicherheits-Befund schlägt jede Ambition', () => {
    const sicher = mkResult('sicher');
    const unsicher: SolveResult = {
      ...mkResult('unsicher'),
      validity: {
        valid: false,
        horizonDependent: false,
        violations: [{ kind: 'return', day: 8, text: 'Rückkehr nicht darstellbar' }],
        safetyViolations: [{ kind: 'return', day: 8, text: 'Rückkehr nicht darstellbar' }],
      },
    };
    const metrics = withMetrics({
      sicher: { legDays: 5, distinctIslands: 2 },
      unsicher: { legDays: 11, distinctIslands: 11 }, // selbst der volle Törn verliert
    });
    expect(preferred(unsicher, sicher, metrics)).toBe(sicher);
  });

  it('Kriterium 2: mehr Etappentage — nicht zu segeln ist keine Leistung', () => {
    /**
     * DER KERNFEHLER des alten Modells, hier festgenagelt: ein Budget-Befund
     * heisst "dieser Tag ist lang", und wer Tage weglässt, hat keine langen
     * Tage. Solange die absolute Befundzahl über der Etappenzahl stand, gewann
     * "fünf Etappen, sechs Tage an der Basis, keine Befunde" gegen jede volle
     * Runde mit einem einzigen langen Tag.
     */
    const voll: SolveResult = {
      ...mkResult('voll'),
      validity: {
        valid: false,
        horizonDependent: false,
        violations: [{ kind: 'budget', day: 11, text: 'Hartes Tagesbudget überschritten' }],
        safetyViolations: [],
      },
    };
    const kurz = mkResult('kurz');
    const metrics = withMetrics({
      voll: { legDays: 11, distinctIslands: 11 },
      kurz: { legDays: 5, distinctIslands: 4 },
    });
    expect(preferred(kurz, voll, metrics)).toBe(voll);
  });

  it('Kriterium 3: keine Insel zweimal — die Runde schlägt das Pendeln', () => {
    const runde = mkResult('runde');
    const pendel = mkResult('pendel');
    const metrics = withMetrics({
      runde: { repeatStays: 0, distinctIslands: 6 },
      // Mehr Reichweite hilft dem Pendeln nicht: die steht auf Rang 13.
      pendel: { repeatStays: 3, distinctIslands: 6, reachNm: 90 },
    });
    expect(preferred(pendel, runde, metrics)).toBe(runde);
  });

  it('Kriterium 4: mehr verschiedene Inseln', () => {
    const viele = mkResult('viele');
    const wenige = mkResult('wenige');
    const metrics = withMetrics({
      viele: { distinctIslands: 9 },
      wenige: { distinctIslands: 5, reachNm: 90 },
    });
    expect(preferred(wenige, viele, metrics)).toBe(viele);
  });

  it('Kriterium 6: weniger Kreuzen auf dem RÜCKWEG entscheidet den Rest', () => {
    // Skipper 2026-08-07: "ein angenehmer Rückweg, ohne Kreuzen oder mit
    // möglichst wenig Kreuzen, ist ein entscheidendes Kriterium".
    const angenehm = mkResult('angenehm');
    const gegenan = mkResult('gegenan');
    const metrics = withMetrics({
      angenehm: { kreuzTenthsRueckweg: 10, kreuzTenths: 90 },
      // Insgesamt weniger gekreuzt, aber alles davon auf dem Heimweg.
      gegenan: { kreuzTenthsRueckweg: 60, kreuzTenths: 60 },
    });
    expect(preferred(gegenan, angenehm, metrics)).toBe(angenehm);
  });

  it('Kriterium 8: der Umlaufsinn entscheidet NUR, wenn die Lage einen vorgibt', () => {
    const mit = mkResult('mit');
    const gegen = mkResult('gegen');
    // Gebot vorhanden: die passende Richtung gewinnt.
    expect(
      preferred(gegen, mit, withMetrics({
        mit: { umlaufsinnPasst: true },
        gegen: { umlaufsinnPasst: false },
      })),
    ).toBe(mit);
    // Gebot 'egal' (null): beide gleich — der alphabetische Tiebreak greift,
    // NICHT heimlich eine Richtung.
    const egal = withMetrics({ mit: { umlaufsinnPasst: null }, gegen: { umlaufsinnPasst: null } });
    expect(preferred(gegen, mit, egal)).toBe(gegen);
    expect(preferred(mit, gegen, egal)).toBe(gegen);
  });

  it('die Messung schlägt die Faustregel: weniger Kreuzen gewinnt gegen den Umlaufsinn', () => {
    const gegenlaeufig = mkResult('a-gegenlaeufig');
    const rechtsherum = mkResult('b-rechtsherum');
    const metrics = withMetrics({
      'a-gegenlaeufig': { umlaufsinnPasst: false, kreuzTenthsRueckweg: 5 },
      'b-rechtsherum': { umlaufsinnPasst: true, kreuzTenthsRueckweg: 40 },
    });
    expect(preferred(rechtsherum, gegenlaeufig, metrics)).toBe(gegenlaeufig);
  });

  it('Kriterium 9: lange Tage zählen — aber erst unter dem Rahmen-Vertrag', () => {
    const sauber = mkResult('sauber');
    const langerTag: SolveResult = {
      ...mkResult('langertag'),
      validity: {
        valid: false,
        horizonDependent: false,
        violations: [{ kind: 'budget', day: 3, text: '9-h-Tag über dem Hartmaximum' }],
        safetyViolations: [],
      },
    };
    // Gleiche Etappentage, gleiche Vielfalt: jetzt entscheidet der Befund.
    expect(preferred(langerTag, sauber, withMetrics({}))).toBe(sauber);
  });

  it('Annahme-Befunde verurteilen nicht — der weite Plan schlägt den Daheim-Plan', () => {
    const daheim = mkResult('daheim');
    const weit: SolveResult = {
      ...mkResult('weit'),
      validity: {
        valid: false,
        horizonDependent: true,
        violations: [
          { kind: 'budget', day: 9, text: 'Annahme-Tag über Budget', assumed: true },
          { kind: 'return', day: 10, text: 'Rückweg nur unter Annahme', assumed: true },
        ],
        safetyViolations: [],
      },
    };
    const metrics = withMetrics({
      daheim: { reachNm: 0, distinctIslands: 1, legDays: 2, stages: 2 },
      weit: { reachNm: 60, distinctIslands: 5, legDays: 10, stages: 10 },
    });
    expect(preferred(daheim, weit, metrics)).toBe(weit);
    expect(preferred(weit, daheim, metrics)).toBe(weit);
  });

  it('Reichweite entscheidet zuletzt — sie ist die Frage des Optionsraums, nicht der Hauptroute', () => {
    const weit = mkResult('weit');
    const nah = mkResult('nah');
    // Gleiche Runde in jeder Hinsicht: dann gewinnt die südlichere.
    expect(preferred(nah, weit, withMetrics({ weit: { reachNm: 90 }, nah: { reachNm: 30 } }))).toBe(
      weit,
    );
    // Aber eine Insel weniger kann sie nicht mehr aufwiegen.
    expect(
      preferred(
        weit,
        nah,
        withMetrics({ weit: { reachNm: 90, distinctIslands: 2 }, nah: { reachNm: 30 } }),
      ),
    ).toBe(nah);
  });
});

describe('deriveReturnChecks — die tägliche Abbruch-Notation', () => {
  it('innerhalb des Horizonts meltemi-fest, dahinter wetterfenster — mit Anweisung', () => {
    // Horizont 1 Tag: ab Törntag 3 rechnet der Worst-Case-Check mit 30 kn N,
    // und der Heimweg nach Norden hält dann nicht mehr — nur der Forecast
    // (unter der Annahme) trägt ihn noch.
    const snapshot = diamondSnapshot({ reliableHorizonDays: 1 });
    const solved = completePlan(snapshot, 'athen')!;
    const checks = deriveReturnChecks(solved.plan, snapshot);
    expect(checks.length).toBeGreaterThan(0);
    const byDay = new Map(checks.map((c) => [c.day, c]));
    expect(byDay.get(1)?.status).toBe('meltemi-fest');
    const fenster = checks.filter((c) => c.status === 'wetterfenster');
    expect(fenster.length).toBeGreaterThan(0);
    expect(fenster[0]!.note).toContain('abbrechen');
    expect(meltemiSafeUntilDay(checks)).toBe(1);
  });

  it('voller Horizont und milder Wind: alles meltemi-fest', () => {
    const snapshot = diamondSnapshot();
    const solved = completePlan(snapshot, 'athen')!;
    const checks = deriveReturnChecks(solved.plan, snapshot);
    expect(checks.every((c) => c.status === 'meltemi-fest')).toBe(true);
  });

  it('mehrere Fenster-Tage in Folge: nur der erste sagt "Ab hier", Folgetage verweisen auf die tägliche Regel', () => {
    // Der Bugreport vom 2026-08-05: an aufeinanderfolgenden Tagen stand
    // wortgleich "hier abbrechen" — das las sich wie mehrere wählbare
    // Abbruchpunkte. Tatsächlich fällt die Entscheidung täglich, und
    // abgebrochen wird an dem Tag, an dem der Wind dreht.
    const snapshot = diamondSnapshot({ reliableHorizonDays: 1 });
    const solved = completePlan(snapshot, 'athen')!;
    const checks = deriveReturnChecks(solved.plan, snapshot);
    const fenster = checks.filter((c) => c.status === 'wetterfenster');
    expect(fenster.length).toBeGreaterThan(1);
    expect(fenster[0]!.note).toContain('Ab hier');
    expect(fenster[0]!.note).toContain('täglich');
    let runStart = fenster[0]!.day;
    for (const [i, f] of fenster.slice(1).entries()) {
      if (f.day !== fenster[i]!.day + 1) {
        // Fenster unterbrochen (fester Tag, Basis o. Ä.) — der nächste
        // Fenster-Tag ist zu Recht wieder ein Einstieg.
        runStart = f.day;
        expect(f.note).toContain('Ab hier');
        continue;
      }
      expect(f.note).not.toContain('Ab hier');
      expect(f.note).toContain(`seit Tag ${runStart}`);
      expect(f.note).toContain('nicht erst hier');
    }
  });

  it('Tage an der Basis werden nicht geprüft — dort gibt es keinen Heimweg', () => {
    const snapshot = diamondSnapshot();
    const solved = completePlan(snapshot, 'athen')!;
    const checks = deriveReturnChecks(solved.plan, snapshot);
    expect(checks.every((c) => c.islandId !== 'athen')).toBe(true);
  });
});

describe('Optionsraum — ein Machbarkeitsbegriff (der Santorin-Fall)', () => {
  it('eine Option, deren Heimweg nur jenseits des Horizonts unsicher ist, ist OFFEN mit Vorbehalt — nicht zu', () => {
    // Genau die Konstellation, die Santorin fälschlich schloss: der Rückweg
    // liegt teils jenseits des verlässlichen Horizonts. Der alte Options-Check
    // rechnete ihn gegen den Meltemi-Worst-Case (30 kn N) und meldete "zu";
    // die Plan-Gültigkeit hielt denselben Törn für tragfähig.
    const snapshot = diamondSnapshot({ reliableHorizonDays: 2 });
    const opt = assessTargetOption('sued', 'athen', snapshot);
    expect(opt.state).not.toBe('zu');
    expect(opt.costLevel).not.toBeNull();
    expect(opt.plan).not.toBeNull();
  });

  it('ein "zu" nennt die Verletzungen des besten Versuchs', () => {
    // 28 kn dauerhaft aus Nord IM FORECAST: der Heimweg ist wirklich dicht.
    const snapshot = diamondSnapshot({ windKn: 28, windFromDeg: 0 });
    const opt = assessTargetOption('sued', 'athen', snapshot);
    expect(opt.state).toBe('zu');
    expect(opt.reasons.length).toBeGreaterThan(0);
  });
});

describe('assessPlanning — Platzvorschläge wiederholen sich nicht (Zielmodell v2)', () => {
  it('zwei Aufenthalte auf derselben Insel bekommen verschiedene Plätze vorgeschlagen', () => {
    const snapshot = diamondSnapshot();
    const pendel = makePlan([
      makeStage(1, ['athen--west'], 'west'),
      makeStage(2, ['west--sued'], 'sued'),
      makeStage(3, ['sued--west'], 'west'),
      makeStage(4, ['west--athen'], 'athen'),
      makeHarbourDay(5, 'athen'),
      makeHarbourDay(6, 'athen'),
    ]);
    const assessment = assessPlanning({
      ...snapshot,
      trip: { ...snapshot.trip, plan: pendel },
    });
    const stages = assessment.mainRoute!.stages;
    const erster = stages.find((s) => s.day === 1)!;
    const zweiter = stages.find((s) => s.day === 3)!;
    expect(erster.placeId).not.toBeNull();
    expect(zweiter.placeId).not.toBeNull();
    expect(erster.placeId).not.toBe(zweiter.placeId);
  });

  it('die Bewertung eines Plans trägt die Abbruch-Notation', () => {
    const snapshot = diamondSnapshot({ reliableHorizonDays: 1 });
    const solved = completePlan(snapshot, 'athen')!;
    const assessment = assessPlanning({
      ...snapshot,
      trip: { ...snapshot.trip, plan: solved.plan },
    });
    expect(assessment.mainRoute!.returnChecks.length).toBeGreaterThan(0);
    expect(assessment.mainRoute!.meltemiSafeUntilDay).not.toBeNull();
  });
});
