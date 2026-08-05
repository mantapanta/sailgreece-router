import { describe, expect, it } from 'vitest';
import type { SolveResult } from '../solver.ts';
import {
  RELAXATION_ORDER,
  buildCandidates,
  completePlan,
  existsValidPlan,
  legLibrary,
  planFromPacking,
  planKey,
  planMetricsFor,
  planTurnDay,
  planWithoutStopover,
  preferred,
  relaxParams,
  validatePlan,
} from '../solver.ts';
import { packLegs, packLegsFeasible } from '../ppr.ts';
import { pathCrossesLand } from '../searoute.ts';
import { stagesOf } from '../schema/plan.ts';
import { assessPlanning } from '../assess.ts';
import type { Island } from '../schema/island.ts';

import type { PlanningSnapshot } from '../schema/snapshot.ts';
import {
  TEST_POLAR,
  TRIP_START,
  constantForecast,
  makeLeg,
  makePlace,
  makeHarbourDay,
  makePlan,
  makeSnapshot,
  makeStage,
  makeTimes,
  makeVariant,
} from './fixtures.ts';

/**
 * A three-island world: base (athen) -> mitte -> sued, plus the westward
 * fallback chain back to the base. Distances are small so a leg fits a day.
 */
function roundTripSnapshot(
  opts: {
    windKn?: number;
    windFromDeg?: number;
    currentDay?: number;
    /** Islands the guests can reach by ferry on the pickup date (FR31). */
    ferryIslands?: string[];
    pickupDate?: string;
    returnDeadlineDate?: string;
    reliableHorizonDays?: number;
    days?: number;
    /** Länge jeder Etappe. Kurze Etappen passen zu zweit auf einen Tag. */
    legNm?: number;
  } = {},
): PlanningSnapshot {
  const windKn = opts.windKn ?? 10;
  const windFromDeg = opts.windFromDeg ?? 90;
  const base = makePlace({
    id: 'athen-alimos',
    islandId: 'athen',
    coordinates: { lat: 37.9, lon: 23.7 },
  });
  const mitte = makePlace({
    id: 'mitte-bucht',
    islandId: 'mitte',
    coordinates: { lat: 37.6, lon: 24.2 },
  });
  const sued = makePlace({
    id: 'sued-hafen',
    islandId: 'sued',
    coordinates: { lat: 37.3, lon: 24.6 },
  });

  const leg = (from: typeof base, to: typeof base, nm: number) =>
    makeLeg({
      id: `${from.islandId}--${to.islandId}`,
      fromIslandId: from.islandId,
      toIslandId: to.islandId,
      fromPlaceId: from.id,
      toPlaceId: to.id,
      distanceNm: nm,
    });

  // Zielmodell v2 — die Liegeplatz-Regel: 'mitte' liegt auf Hin- UND Rückweg
  // (zwei Aufenthalte) und braucht deshalb einen zweiten Platz, sonst wäre
  // jeder Rundkurs dieser Welt strukturell ungültig. Spiegelt die echte
  // Bibliothek: jede Insel führt 3-8 recherchierte Plätze.
  const mitteZwei = makePlace({
    id: 'mitte-bucht-ost',
    islandId: 'mitte',
    coordinates: { lat: 37.62, lon: 24.25 },
  });

  const nm = opts.legNm ?? 20;
  const outbound = [leg(base, mitte, nm), leg(mitte, sued, nm)];
  const homeward = [leg(sued, mitte, nm), leg(mitte, base, nm)];
  const legs = [...outbound, ...homeward];
  const variants = [
    makeVariant('sued-route', outbound, { escalationRank: 1, name: 'Südroute' }),
    makeVariant('rueckfallkette-west', homeward, {
      escalationRank: 0,
      isReturnChain: true,
      name: 'Rückfallkette West',
    }),
  ];

  const ferry = new Set(opts.ferryIslands ?? ['athen', 'mitte', 'sued']);
  const islands: Island[] = ['athen', 'mitte', 'sued'].map((id) => ({
    id,
    name: id,
    coordinates:
      id === 'athen' ? base.coordinates : id === 'mitte' ? mitte.coordinates : sued.coordinates,
    guestPickup: { ferryReachable: ferry.has(id), sourceNote: 'fixture' },
  }));

  const times = makeTimes(opts.days ?? 14);
  const fc = constantForecast(times.length, windKn, windFromDeg);
  const snap = makeSnapshot({
    times,
    polar: TEST_POLAR,
    forecast: {
      [base.id]: fc,
      [mitte.id]: fc,
      [mitteZwei.id]: fc,
      [sued.id]: fc,
    },
    library: {
      islands,
      places: [base, mitte, mitteZwei, sued],
      invalidPlaces: [],
      legs,
      variants,
    },
    trip: {
      currentDay: opts.currentDay ?? 1,
      position: {
        source: 'manual',
        lat: base.coordinates.lat,
        lon: base.coordinates.lon,
        placeId: base.id,
      },
      plan: null,
      departureHourOverride: null,
      stopHoursByDay: {},
    },
  });
  // Mirrors the PRD structure: days = stages + exactly one harbour day.
  // Four legs (out and back) therefore need a five-day frame.
  snap.params = {
    ...snap.params,
    tripStartDate: TRIP_START,
    tripLengthDays: 5,
    returnDeadlineDate: opts.returnDeadlineDate ?? '2026-08-12', // trip day 5
    pickupDate: opts.pickupDate ?? '2026-08-11', // trip day 4
    reliableHorizonDays: opts.reliableHorizonDays ?? 14,
  };
  return snap;
}

describe('solver — candidates (AD-13)', () => {
  it('builds a round trip per turning point, always ending at the base', () => {
    const snapshot = roundTripSnapshot();
    const candidates = buildCandidates(snapshot, 'athen');
    expect(candidates.length).toBeGreaterThan(1);
    // Every candidate that sails at all must come home.
    for (const c of candidates.filter((x) => x.legs.length > 0)) {
      expect(c.legs[c.legs.length - 1]!.toIslandId).toBe('athen');
    }
    // Staying at the base is the most conservative candidate and carries no
    // legs — it exists so the app has an answer when nothing else works.
    expect(candidates.some((c) => c.turnIslandId === 'athen' && c.legs.length === 0)).toBe(
      true,
    );
    expect(candidates.some((c) => c.turnIslandId === 'sued')).toBe(true);
  });

  it('deduplicates the leg library even though routes repeat legs', () => {
    const snapshot = roundTripSnapshot();
    // 'mitte--athen' appears in the chain; 'athen--mitte' in the south route.
    expect(legLibrary(snapshot).size).toBe(4);
  });
});

describe('solver — plan shape (AD-12)', () => {
  it('covers every trip day from today to the deadline exactly once', () => {
    const snapshot = roundTripSnapshot();
    const result = completePlan(snapshot, 'athen');
    expect(result).not.toBeNull();
    const days = result!.plan.days.map((d) => d.day);
    expect(days).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(days).size).toBe(days.length);
  });

  it('fills days without a leg as harbour days at the island we sit on', () => {
    const snapshot = roundTripSnapshot();
    const packed = planFromPacking(
      [{ legIdx: 0, leg: legLibrary(snapshot).get('athen--mitte')!, day: 2 }],
      1,
      3,
      'athen',
    );
    expect(packed[0]).toMatchObject({ kind: 'harbour', day: 1, islandId: 'athen' });
    expect(packed[1]).toMatchObject({ kind: 'stage', day: 2, toIslandId: 'mitte' });
    // After arriving at mitte, the idle day 3 is spent THERE, not at the base.
    expect(packed[2]).toMatchObject({ kind: 'harbour', day: 3, islandId: 'mitte' });
  });

  it('ends the plan at the base', () => {
    const snapshot = roundTripSnapshot();
    const result = completePlan(snapshot, 'athen')!;
    const last = result.plan.days[result.plan.days.length - 1]!;
    const island = last.kind === 'stage' ? last.toIslandId : last.islandId;
    expect(island).toBe('athen');
  });
});

describe('solver — pins are hard constraints (AD-12, FR28)', () => {
  it('honours a pinned island on its day', () => {
    const snapshot = roundTripSnapshot();
    const result = completePlan(snapshot, 'athen', [{ day: 2, toIslandId: 'mitte' }]);
    expect(result).not.toBeNull();
    const day2 = result!.plan.days.find((d) => d.day === 2)!;
    const island = day2.kind === 'stage' ? day2.toIslandId : day2.islandId;
    expect(island).toBe('mitte');
    expect(day2.source).toBe('skipper');
  });

  it('marks only pinned days as skipper-owned', () => {
    const snapshot = roundTripSnapshot();
    const result = completePlan(snapshot, 'athen', [{ day: 2, toIslandId: 'mitte' }])!;
    const others = result.plan.days.filter((d) => d.day !== 2);
    expect(others.every((d) => d.source === 'solver')).toBe(true);
  });
});

describe('solver — FR31 pickup is hard and never relaxed (AD-13)', () => {
  it('reaches a ferry-reachable island on the pickup day', () => {
    // Only 'mitte' is reachable, so every valid plan must be at mitte on day 4.
    const snapshot = roundTripSnapshot({ ferryIslands: ['mitte'] });
    const result = completePlan(snapshot, 'athen')!;
    const day4 = result.plan.days.find((d) => d.day === 4)!;
    const island = day4.kind === 'stage' ? day4.toIslandId : day4.islandId;
    expect(island).toBe('mitte');
    expect(result.validity.violations.some((v) => v.kind === 'pickup')).toBe(false);
  });

  it('reports a pickup violation when no island is reachable', () => {
    const snapshot = roundTripSnapshot({ ferryIslands: [] });
    const result = completePlan(snapshot, 'athen');
    expect(result).not.toBeNull();
    expect(result!.validity.valid).toBe(false);
    expect(result!.validity.violations.some((v) => v.kind === 'pickup')).toBe(true);
  });

  it('never relaxes the pickup or the upwind threshold', () => {
    // The relaxation ladder must not contain them — structural guarantee.
    expect(RELAXATION_ORDER).toEqual([
      'none',
      'hardMax',
      'doppelschlag',
      'nightLeg',
    ]);
    const base = roundTripSnapshot().params;
    for (const level of RELAXATION_ORDER) {
      const relaxed = relaxParams(base, level);
      expect(relaxed.maxUpwindTwsKn).toBe(base.maxUpwindTwsKn);
      expect(relaxed.pickupDate).toBe(base.pickupDate);
      expect(relaxed.pickupLatestArrivalHourAthens).toBe(
        base.pickupLatestArrivalHourAthens,
      );
    }
  });
});

describe('solver — horizon rule (AD-13, FR18)', () => {
  it('stages beyond the reliable horizon make a plan neither valid nor invalid', () => {
    const snapshot = roundTripSnapshot({ reliableHorizonDays: 1 });
    const plan = makePlan([
      makeStage(1, ['athen--mitte'], 'mitte'),
      // Day 5 is far beyond a 1-day horizon.
      makeStage(5, ['mitte--athen'], 'athen'),
    ]);
    const validity = validatePlan(plan, snapshot);
    expect(validity.horizonDependent).toBe(true);
    // Unassessable is NOT a threshold violation.
    expect(validity.violations.some((v) => v.kind === 'budget')).toBe(false);
    expect(validity.violations.some((v) => v.kind === 'upwind')).toBe(false);
  });
});

describe('solver — no valid plan still yields a proposal (AD-13, FR18)', () => {
  it('still proposes something when no round trip is sailable', () => {
    // 30 kn straight from the north: sailing home is beating above 25 kn, so no
    // round trip exists. The fallback is "stay put" — which carries no
    // violation (lying in port is safe) but does not sail, so it cannot serve
    // as the existence witness.
    const snapshot = roundTripSnapshot({ windKn: 30, windFromDeg: 0 });
    const result = completePlan(snapshot, 'athen');
    expect(result).not.toBeNull();
    expect(stagesOf(result!.plan)).toHaveLength(0);
    expect(existsValidPlan(snapshot, 'athen')).toBeNull();
  });

  it('names the violated condition when every plan breaks a hard one', () => {
    // No island is ferry-reachable, so even staying put misses the pickup.
    const snapshot = roundTripSnapshot({ windKn: 30, windFromDeg: 0, ferryIslands: [] });
    const result = completePlan(snapshot, 'athen');
    expect(result).not.toBeNull();
    expect(result!.validity.valid).toBe(false);
    expect(result!.validity.violations.some((v) => v.kind === 'pickup')).toBe(true);
  });

  it('never throws for a domain state — red is a result, not an error', () => {
    const snapshot = roundTripSnapshot({ windKn: 45, windFromDeg: 0 });
    expect(() => completePlan(snapshot, 'athen')).not.toThrow();
  });
});

describe('solver — determinism (AD-13)', () => {
  it('produces an identical plan for an identical snapshot', () => {
    const a = completePlan(roundTripSnapshot(), 'athen')!;
    const b = completePlan(roundTripSnapshot(), 'athen')!;
    expect(JSON.stringify(a.plan)).toBe(JSON.stringify(b.plan));
  });
});

describe('solver — dead leg references survive (AD-12)', () => {
  it('keeps the plan and reports the day as unassessable', () => {
    const snapshot = roundTripSnapshot();
    const plan = makePlan([makeStage(1, ['gibt--esnicht'], 'mitte')]);
    const validity = validatePlan(plan, snapshot);
    expect(validity.violations.some((v) => v.kind === 'incomplete')).toBe(true);
    expect(stagesOf(plan)).toHaveLength(1);
  });
});

/**
 * FR2 rest-trip light, definition per AD-3. The distinction that matters:
 * yellow means "the main route is shaky BUT a valid round trip exists", and
 * per AD-13 that existence is judged WITHOUT the pins binding — because the
 * way to cash a yellow in is the check-in, and check-in releases pins.
 */
describe('assessment — FR2 rest-trip light (AD-3)', () => {
  it('is gruen for a valid main route inside the horizon', () => {
    const snapshot = roundTripSnapshot();
    const solved = completePlan(snapshot, 'athen')!;
    expect(solved.validity.valid).toBe(true);
    const assessment = assessPlanning({
      ...snapshot,
      trip: { ...snapshot.trip, plan: solved.plan },
    });
    expect(assessment.restTripAmpel).toBe('gruen');
  });

  it('is gelb when the main route breaks but a valid round trip still exists', () => {
    const snapshot = roundTripSnapshot();
    // A main route that stays in port every day: valid conditions, but it
    // violates the one-harbour-day structure, while sailing plans still work.
    const lazy = makePlan([
      makeHarbourDay(1, 'athen'),
      makeHarbourDay(2, 'athen'),
      makeHarbourDay(3, 'athen'),
      makeHarbourDay(4, 'athen'),
      makeHarbourDay(5, 'athen'),
    ]);
    const assessment = assessPlanning({
      ...snapshot,
      trip: { ...snapshot.trip, plan: lazy },
    });
    // The idle plan breaks no rule — lying in port is safe — but it is not a
    // round trip, so it must not read as green while a real trip is available.
    expect(stagesOf(assessment.mainRoute!.plan)).toHaveLength(0);
    expect(existsValidPlan(snapshot, 'athen')).not.toBeNull();
    expect(assessment.restTripAmpel).toBe('gelb');
    expect(assessment.restTripReasons.length).toBeGreaterThan(0);
  });

  it('is rot when no valid round trip exists at all', () => {
    // 30 kn straight from the north: every way home is beating above 25 kn.
    const snapshot = roundTripSnapshot({ windKn: 30, windFromDeg: 0 });
    const solved = completePlan(snapshot, 'athen')!;
    const assessment = assessPlanning({
      ...snapshot,
      trip: { ...snapshot.trip, plan: solved.plan },
    });
    expect(existsValidPlan(snapshot, 'athen')).toBeNull();
    expect(assessment.restTripAmpel).toBe('rot');
    // Even then there IS a proposal — the app must not fall silent (FR18).
    expect(assessment.proposal).not.toBeNull();
  });

  it('offers a proposal but no main route before the first adoption', () => {
    const snapshot = roundTripSnapshot();
    const assessment = assessPlanning(snapshot);
    expect(assessment.mainRoute).toBeNull();
    expect(assessment.proposal).not.toBeNull();
    expect(assessment.restTripAmpel).toBe('unbewertet');
  });

  it('re-assesses the main route without ever mutating it', () => {
    const snapshot = roundTripSnapshot();
    const solved = completePlan(snapshot, 'athen')!;
    const pinned = makePlan(
      solved.plan.days.map((d) => (d.day === 2 ? { ...d, source: 'skipper' as const } : d)),
    );
    const before = JSON.stringify(pinned);
    const assessment = assessPlanning({
      ...snapshot,
      trip: { ...snapshot.trip, plan: pinned },
    });
    // The assessment carries the very same plan object content back.
    expect(JSON.stringify(assessment.mainRoute!.plan)).toBe(before);
    expect(assessment.mainRoute!.stages.find((s) => s.day === 2)!.pinned).toBe(true);
  });

  it('marks solver-chosen berths as suggestions, skipper berths as fixed', () => {
    const snapshot = roundTripSnapshot();
    const solved = completePlan(snapshot, 'athen')!;
    const assessment = assessPlanning({
      ...snapshot,
      trip: { ...snapshot.trip, plan: solved.plan },
    });
    // Solver stages never carry a place, so every berth shown is a suggestion.
    expect(assessment.mainRoute!.stages.every((s) => s.placeIsSuggestion)).toBe(true);
  });
});

/**
 * SKIPPER-VORGABE 2026-08-05 — ein Tag, eine Verbindung von Insel zu Insel.
 *
 * Der Zwischenstopp war vorher kein Sonderfall, sondern die stille Regel: weil
 * jeder Tag jenseits des verlässlichen Horizonts 'horizon' statt 'feasible'
 * liefert, erreichte der Ein-Etappen-Zug nie das Abbruchkriterium, der
 * Doppelschlag wurde immer mitgeprobt — und der Tie-Break bevorzugt den
 * früheren Abschluss. Diese Fälle halten fest, dass er jetzt angefordert
 * werden muss.
 */
describe('solver — ein Tag, eine Verbindung (params.maxLegsPerDay)', () => {
  it('der Standard ist eine Etappe pro Tag', () => {
    expect(roundTripSnapshot().params.maxLegsPerDay).toBe(1);
  });

  it('plant jede Verbindung auf einen eigenen Tag, wenn der Rahmen es hergibt', () => {
    // Vier Etappen, fünf Tage — ein Tag pro Verbindung passt.
    const solved = completePlan(roundTripSnapshot(), 'athen')!;
    for (const stage of stagesOf(solved.plan)) {
      expect(stage.legIds).toHaveLength(1);
    }
    expect(solved.relaxedTo).toBe('none');
  });

  it('auch jenseits des Forecast-Horizonts — dort kam der Doppelschlag früher her', () => {
    // reliableHorizonDays 1: ab Tag 2 rechnet alles unter der Annahme, jede
    // Packung meldet 'horizon'. Genau die Konstellation, in der der frühere
    // Tie-Break den Doppelschlag gewinnen liess.
    const solved = completePlan(roundTripSnapshot({ reliableHorizonDays: 1 }), 'athen')!;
    for (const stage of stagesOf(solved.plan)) {
      expect(stage.legIds).toHaveLength(1);
    }
  });

  it('die Alternativen halten sich an dieselbe Vorgabe', () => {
    // Alternativen sind seit der Verschmelzung mit dem Optionsraum die
    // Options-Pläne selbst — die kommen aus completePlan und tragen dessen
    // Vorgabe mit.
    const assessment = assessPlanning(roundTripSnapshot());
    expect(assessment.alternatives.length).toBeGreaterThan(0);
    for (const alt of assessment.alternatives) {
      for (const stage of stagesOf(alt.plan)) {
        expect(stage.legIds).toHaveLength(1);
      }
    }
  });

  /**
   * FEEDBACK 2026-08-05: "Wendepunkt Athen (Basis) · 0 Etappen" stand als
   * Alternative in der Liste. Der "(bleiben)"-Kandidat ist im Suchraum
   * legitim (FR18), aber ein Round-Trip ohne eine einzige Segeletappe ist
   * keine Alternative — dieselbe Regel, die existsValidPlan an den Zeugen
   * anlegt. Gilt unverändert für die aus den Optionen abgeleitete Liste.
   */
  it('bietet keinen Round-Trip ohne Segeletappen als Alternative an', () => {
    const assessment = assessPlanning(roundTripSnapshot());
    expect(assessment.alternatives.length).toBeGreaterThan(0);
    for (const alt of assessment.alternatives) {
      expect(stagesOf(alt.plan).length).toBeGreaterThan(0);
    }
  });

  /**
   * Die Vorgabe ist eine Vorgabe, keine Mauer: passt der Törn mit einem Tag je
   * Verbindung nicht mehr in den Rahmen, darf der Planer nicht schweigend
   * scheitern (FR18) — er gibt nach und sagt es über `relaxedTo`.
   */
  it('gibt den Doppelschlag frei, wenn ihn eine harte Bedingung erzwingt', () => {
    // Kurze Etappen (zwei passen auf einen Tag) und die Gäste steigen schon an
    // Tag 1 auf 'sued' zu — dorthin führen zwei Verbindungen. Mit einem Tag je
    // Verbindung ist die FR31-Bedingung nicht zu erfüllen, also muss der Planer
    // nachgeben statt die Gäste stehen zu lassen (FR18).
    const snapshot = roundTripSnapshot({
      legNm: 8,
      ferryIslands: ['sued'],
      pickupDate: '2026-08-08', // Törntag 1
    });
    const solved = completePlan(snapshot, 'athen')!;
    const tag1 = stagesOf(solved.plan).find((s) => s.day === 1);
    expect(tag1?.legIds).toHaveLength(2);
    expect(solved.relaxedTo).toBe('doppelschlag');
    expect(solved.validity.violations.some((v) => v.kind === 'pickup')).toBe(false);
  });

  it('dieselbe Lage bleibt ohne die harte Bedingung bei einer Etappe pro Tag', () => {
    // Gleiche kurzen Etappen, aber kein Zwang: der Planer nutzt die Tage, die
    // er hat, statt zwei Schläge zusammenzuziehen.
    const snapshot = roundTripSnapshot({ legNm: 8 });
    const solved = completePlan(snapshot, 'athen')!;
    for (const stage of stagesOf(solved.plan)) {
      expect(stage.legIds).toHaveLength(1);
    }
    expect(solved.relaxedTo).toBe('none');
  });

  it('die Leiter nimmt nichts zurück: nach doppelschlag bleibt der Doppelschlag erlaubt', () => {
    const base = roundTripSnapshot().params;
    expect(relaxParams(base, 'none').maxLegsPerDay).toBe(1);
    expect(relaxParams(base, 'hardMax').maxLegsPerDay).toBe(1);
    expect(relaxParams(base, 'doppelschlag').maxLegsPerDay).toBe(2);
    expect(relaxParams(base, 'nightLeg').maxLegsPerDay).toBe(2);
  });

  it('der Törn-Deckel überlebt jede Stufe der Leiter', () => {
    const base = roundTripSnapshot().params;
    expect(base.doppelschlagMaxPerTrip).toBe(1);
    for (const level of RELAXATION_ORDER) {
      expect(relaxParams(base, level).doppelschlagMaxPerTrip).toBe(1);
    }
  });

  /**
   * SKIPPER 2026-08-05 — die Ausnahme ist keine Serie: auch wenn die Leiter
   * den Doppelschlag freigibt, trägt ein Törn höchstens
   * params.doppelschlagMaxPerTrip Doppelschlag-TAGE. Vorher hob die Stufe
   * maxLegsPerDay auf 2 und die Rangfolge belohnte die Serie (mehr Inseln vor
   * dem Horizont) — heraus kamen sechs Doppelschlag-Tage hintereinander.
   */
  it('höchstens EIN Doppelschlag-Tag pro Törn, auch auf jeder Stufe der Leiter', () => {
    // Kurze Etappen und ein zu enger Rahmen: der Packer DÜRFTE beliebig
    // doppeln, der Deckel lässt genau einen Tag zu.
    const snapshot = roundTripSnapshot({ legNm: 8 });
    for (const level of RELAXATION_ORDER) {
      const relaxed = { ...snapshot, params: relaxParams(snapshot.params, level) };
      const legs = legLibrary(snapshot);
      const chain = [
        legs.get('athen--mitte')!,
        legs.get('mitte--sued')!,
        legs.get('sued--mitte')!,
        legs.get('mitte--athen')!,
      ];
      // Vier Etappen in zwei Tagen bräuchten ZWEI Doppelschlag-Tage.
      const two = packLegs(chain, 1, 2, relaxed, { startIslandId: 'athen' });
      expect(two.verdict).toBe('infeasible');
      // In drei Tagen reicht EIN Doppelschlag-Tag — den erlaubt der Deckel
      // (nur auf Stufen, deren maxLegsPerDay ihn überhaupt freigibt).
      if (relaxed.params.maxLegsPerDay >= 2) {
        const three = packLegs(chain, 1, 3, relaxed, { startIslandId: 'athen' });
        expect(three.verdict).not.toBe('infeasible');
        const byDay = new Map<number, number>();
        for (const p of three.packed) {
          byDay.set(p.day, (byDay.get(p.day) ?? 0) + 1);
        }
        const doubleDays = [...byDay.values()].filter((n) => n > 1).length;
        expect(doubleDays).toBeLessThanOrEqual(1);
      }
    }
  });

  it('Kapazitätsfragen bleiben ungedeckelt — der Heimweg darf doppeln', () => {
    // Dieselben vier kurzen Etappen in zwei Tagen: als PLAN unzulässig (ein
    // Doppelschlag-Tag reicht nicht), als KAPAZITÄTSFRAGE machbar.
    const snapshot = roundTripSnapshot({ legNm: 8 });
    const legs = legLibrary(snapshot);
    const chain = [
      legs.get('athen--mitte')!,
      legs.get('mitte--sued')!,
      legs.get('sued--mitte')!,
      legs.get('mitte--athen')!,
    ];
    expect(packLegsFeasible(chain, 1, 2, snapshot)).not.toBe('infeasible');
  });
});

/**
 * ZIELMODELL v2, Nachtrag 2026-08-05 — der Rahmen wird genutzt: ein Plan, der
 * früh heimkommt und die letzten Tage an der Basis liegt, ist nicht der Törn,
 * der gewollt ist. Fünf Trailing-Hafentage waren vorher exakt KEIN Befund
 * (nicht über der Notgrenze 5), und die Rangfolge belohnte sie noch, weil
 * Basistage keine Annahme-Befunde tragen.
 */
describe('solver — die Lage der Hafentage (validatePlan 1b\')', () => {
  it('mehr als harbourDaysTargetMax Trailing-Hafentage an der Basis sind ein Befund', () => {
    const snapshot = roundTripSnapshot({ days: 14 });
    snapshot.params = {
      ...snapshot.params,
      tripLengthDays: 8,
      returnDeadlineDate: '2026-08-15', // Törntag 8
      pickupDate: '2026-08-10', // Törntag 3, auf 'sued' erreichbar
    };
    const plan = makePlan([
      makeStage(1, ['athen--mitte'], 'mitte'),
      makeStage(2, ['mitte--sued'], 'sued'),
      makeStage(3, ['sued--mitte'], 'mitte'),
      makeStage(4, ['mitte--athen'], 'athen'),
      makeHarbourDay(5, 'athen'),
      makeHarbourDay(6, 'athen'),
      makeHarbourDay(7, 'athen'),
      makeHarbourDay(8, 'athen'),
    ]);
    const validity = validatePlan(plan, snapshot);
    expect(
      validity.violations.some(
        (v) => v.kind === 'incomplete' && v.text.includes('an der Basis'),
      ),
    ).toBe(true);
    // Strukturell, nie Safety: liegen bleiben ist sicher (FR18).
    expect(validity.safetyViolations).toHaveLength(0);
  });

  it('bis zu harbourDaysTargetMax Tage am Ende bleiben legitim (Puffer + Ruhetag)', () => {
    const snapshot = roundTripSnapshot({ days: 14 });
    snapshot.params = {
      ...snapshot.params,
      tripLengthDays: 6,
      returnDeadlineDate: '2026-08-13', // Törntag 6
      pickupDate: '2026-08-10',
    };
    const plan = makePlan([
      makeStage(1, ['athen--mitte'], 'mitte'),
      makeStage(2, ['mitte--sued'], 'sued'),
      makeStage(3, ['sued--mitte'], 'mitte'),
      makeStage(4, ['mitte--athen'], 'athen'),
      makeHarbourDay(5, 'athen'),
      makeHarbourDay(6, 'athen'),
    ]);
    const validity = validatePlan(plan, snapshot);
    expect(
      validity.violations.some(
        (v) => v.kind === 'incomplete' && v.text.includes('an der Basis'),
      ),
    ).toBe(false);
  });

  it('Hafentage unterwegs zählen nicht als Trailing-Halde', () => {
    const snapshot = roundTripSnapshot({ days: 14 });
    snapshot.params = {
      ...snapshot.params,
      tripLengthDays: 7,
      returnDeadlineDate: '2026-08-14', // Törntag 7
      pickupDate: '2026-08-10',
    };
    // Drei Hafentage MITTEN im Törn (Wetter abwarten ist legitim), nur einer
    // am Ende: kein Trailing-Befund.
    const plan = makePlan([
      makeStage(1, ['athen--mitte'], 'mitte'),
      makeStage(2, ['mitte--sued'], 'sued'),
      makeHarbourDay(3, 'sued'),
      makeHarbourDay(4, 'sued'),
      makeStage(5, ['sued--mitte'], 'mitte'),
      makeStage(6, ['mitte--athen'], 'athen'),
      makeHarbourDay(7, 'athen'),
    ]);
    const validity = validatePlan(plan, snapshot);
    expect(
      validity.violations.some(
        (v) => v.kind === 'incomplete' && v.text.includes('an der Basis'),
      ),
    ).toBe(false);
  });

  it('planMetricsFor misst den längsten Hafentage-Lauf ab dem aktuellen Tag', () => {
    const snapshot = roundTripSnapshot();
    const metrics = planMetricsFor(snapshot);
    const mk = (days: ReturnType<typeof makeStage>[]): SolveResult => ({
      plan: makePlan(days),
      validity: { valid: true, horizonDependent: false, violations: [], safetyViolations: [] },
      relaxedTo: 'none',
      variantId: 'test',
      turnIslandId: 'sued',
    });
    const halde = mk([
      makeStage(1, ['athen--mitte'], 'mitte'),
      makeStage(2, ['mitte--athen'], 'athen'),
      makeHarbourDay(3, 'athen'),
      makeHarbourDay(4, 'athen'),
      makeHarbourDay(5, 'athen'),
    ]);
    expect(metrics(halde).maxHarbourRun).toBe(3);
    const verteilt = mk([
      makeStage(1, ['athen--mitte'], 'mitte'),
      makeHarbourDay(2, 'mitte'),
      makeStage(3, ['mitte--sued'], 'sued'),
      makeStage(4, ['sued--mitte'], 'mitte'),
      makeStage(5, ['mitte--athen'], 'athen'),
    ]);
    expect(metrics(verteilt).maxHarbourRun).toBe(1);
  });
});

/**
 * Die Vorgabe gilt dem PLAN, nicht der Frage "kommen wir überhaupt noch heim?".
 * Sonst würde aus einer Stilentscheidung eine Sicherheitsaussage: der
 * Rückkehr-Check meldete eine Falle, wo das Schiff in Wahrheit zwei kurze
 * Schläge an einem Tag segeln könnte.
 */
describe('solver — Kapazitätsfragen rechnen weiter mit dem Doppelschlag', () => {
  it('packLegsFeasible nutzt zwei Etappen am Tag, packLegs (Plan) nur eine', () => {
    const snapshot = roundTripSnapshot({ legNm: 8 });
    const legs = legLibrary(snapshot);
    // Beide Etappen an EINEM Tag (Stichtag = Tag 1): nur mit Doppelschlag.
    const chain = [legs.get('athen--mitte')!, legs.get('mitte--sued')!];
    expect(packLegsFeasible(chain, 1, 1, snapshot)).not.toBe('infeasible');
    expect(
      packLegs(chain, 1, 1, snapshot, { startIslandId: 'athen' }).verdict,
    ).toBe('infeasible');
  });

  it('der Rückkehr-Check meldet keine Falle, wo zwei kurze Schläge heimführen', () => {
    // Von 'sued' am vorletzten Tag: mit einem Tag je Verbindung zu spät, mit
    // dem Doppelschlag machbar. Eine Stilvorgabe darf daraus keine Falle machen.
    const snapshot = roundTripSnapshot({ legNm: 8 });
    const legs = legLibrary(snapshot);
    const heim = [legs.get('sued--mitte')!, legs.get('mitte--athen')!];
    expect(packLegsFeasible(heim, 5, 5, snapshot)).not.toBe('infeasible');
  });
});

/**
 * Der Heimweg besteht teils aus UMGEDREHTEN Etappen (ppr.ts): von einer Insel
 * abseits der Rückfallkette führt oft keine gespeicherte Etappe zurück, wohl
 * aber die Gegenrichtung einer gespeicherten. Ein Plan speichert nur IDs — und
 * `fern--mitte` stand in keinem Index, solange `legIndex` nur die Bibliothek
 * las. Jede Prüfung meldete "Etappe nicht mehr in der Bibliothek", der Tag galt
 * als unbewertbar, und der Plan konnte nie gültig werden.
 *
 * Praktische Folge an der echten Bibliothek: Santorin, Amorgos und Ios waren
 * strukturell ungültig — nicht wegen Wetter oder Zeit, sondern weil die Etappe
 * beim Nachschlagen fehlte.
 */
describe('solver — umgedrehte Heimweg-Etappen sind auflösbar', () => {
  function reverseConnectorSnapshot(): PlanningSnapshot {
    const athen = makePlace({ id: 'athen-alimos', islandId: 'athen', coordinates: { lat: 37.9, lon: 23.7 } });
    const mitte = makePlace({ id: 'mitte-bucht', islandId: 'mitte', coordinates: { lat: 37.6, lon: 24.2 } });
    const fern = makePlace({ id: 'fern-hafen', islandId: 'fern', coordinates: { lat: 37.3, lon: 24.6 } });
    const leg = (f: typeof athen, t: typeof athen) =>
      makeLeg({
        id: `${f.islandId}--${t.islandId}`,
        fromIslandId: f.islandId, toIslandId: t.islandId,
        fromPlaceId: f.id, toPlaceId: t.id, distanceNm: 18,
      });
    // Zweiter Platz auf 'mitte': der Törn nach 'fern' übernachtet dort auf Hin-
    // und Rückweg — ohne zweiten Platz griffe die Liegeplatz-Regel (1e).
    const mitteZwei = makePlace({ id: 'mitte-bucht-2', islandId: 'mitte', coordinates: { lat: 37.62, lon: 24.25 } });
    // Die Gegenrichtung von 'mitte--fern' ist NICHT gespeichert — der Heimweg
    // von 'fern' muss sie erzeugen.
    const legs = [leg(athen, mitte), leg(mitte, fern), leg(mitte, athen)];
    const variants = [
      makeVariant('sued', [legs[0]!, legs[1]!], { escalationRank: 1 }),
      makeVariant('rueckfallkette-west', [legs[2]!], {
        escalationRank: 0, isReturnChain: true,
      }),
    ];
    const islands: Island[] = [
      { id: 'athen', name: 'athen', coordinates: athen.coordinates, guestPickup: { ferryReachable: true, sourceNote: 'fixture' } },
      { id: 'mitte', name: 'mitte', coordinates: mitte.coordinates, guestPickup: { ferryReachable: true, sourceNote: 'fixture' } },
      { id: 'fern', name: 'fern', coordinates: fern.coordinates, guestPickup: { ferryReachable: true, sourceNote: 'fixture' } },
    ];
    const times = makeTimes(14);
    const fc = constantForecast(times.length, 10, 90);
    const snap = makeSnapshot({
      times, polar: TEST_POLAR,
      forecast: { [athen.id]: fc, [mitte.id]: fc, [mitteZwei.id]: fc, [fern.id]: fc },
      library: { islands, places: [athen, mitte, mitteZwei, fern], invalidPlaces: [], legs, variants },
      trip: {
        currentDay: 1,
        position: { source: 'manual', lat: athen.coordinates.lat, lon: athen.coordinates.lon, placeId: athen.id },
        plan: null, departureHourOverride: null, stopHoursByDay: {},
      },
    });
    snap.params = {
      ...snap.params, tripStartDate: TRIP_START, tripLengthDays: 5,
      returnDeadlineDate: '2026-08-12', pickupDate: '2026-08-11',
      reliableHorizonDays: 14,
    };
    return snap;
  }

  it('der Index kennt die Gegenrichtung jeder gespeicherten Etappe', () => {
    const snapshot = reverseConnectorSnapshot();
    const index = legLibrary(snapshot);
    expect(index.has('mitte--fern')).toBe(true);
    expect(index.has('fern--mitte')).toBe(true);
    const reversed = index.get('fern--mitte')!;
    expect(reversed.fromIslandId).toBe('fern');
    expect(reversed.toIslandId).toBe('mitte');
  });

  it('eine gespeicherte Richtung schlägt die erzeugte Spiegelung', () => {
    const snapshot = reverseConnectorSnapshot();
    // 'mitte--athen' IST kuratiert — der Index darf nicht die Spiegelung von
    // 'athen--mitte' liefern, die andere Plätze und Wegpunkte hätte.
    const stored = snapshot.library.legs.find((l) => l.id === 'mitte--athen')!;
    expect(legLibrary(snapshot).get('mitte--athen')).toBe(stored);
  });

  it('der Plan bis zur fernen Insel meldet keine fehlende Etappe mehr', () => {
    const snapshot = reverseConnectorSnapshot();
    const solved = completePlan(snapshot, 'athen')!;
    const fehlend = solved.validity.violations.filter((v) =>
      v.text.includes('nicht mehr in der Bibliothek'),
    );
    expect(fehlend).toEqual([]);
    expect(solved.turnIslandId).toBe('fern');
  });
});

/**
 * SKIPPER-VORGABE 2026-08-05 — "so weit wie möglich nach Süden".
 *
 * Die alte Kennzahl war die ZAHL der Etappen. Das ist etwas anderes als
 * Reichweite: ein Plan, der zwölf Tage zwischen zwei Nachbarinseln pendelt,
 * hat genauso viele Etappen wie einer, der durchzieht — und gewann sogar, weil
 * er leichter gültig wird. Dazu brach die Schleife beim ersten gültigen Plan
 * ab, sodass eine weitere Wende gar nicht mehr geprüft wurde.
 */
describe('solver — die Reichweite ist das Ziel, nicht die Etappenzahl', () => {
  it('wendet an der entferntesten erreichbaren Insel', () => {
    const solved = completePlan(roundTripSnapshot(), 'athen')!;
    expect(solved.turnIslandId).toBe('sued');
  });

  /**
   * Die Vergleichsregel selbst — sie IST die Entscheidung, deshalb steht sie
   * hier Kriterium für Kriterium und nicht nur als Ergebnis eines Szenarios.
   */
  describe('preferred — die Rangfolge der Kriterien', () => {
    const snapshot = roundTripSnapshot();
    const metrics = planMetricsFor(snapshot);
    const result = (
      over: Partial<SolveResult> & { turnIslandId: string },
    ): SolveResult => ({
      plan: makePlan([makeStage(1, ['athen--mitte'], 'mitte')]),
      validity: { valid: true, horizonDependent: false, violations: [], safetyViolations: [] },
      relaxedTo: 'none',
      variantId: 'a',
      ...over,
    });

    it('gültig schlägt ungültig, auch wenn der ungültige weiter käme', () => {
      const nah = result({ turnIslandId: 'mitte' });
      const weit = result({
        turnIslandId: 'sued',
        validity: { valid: false, horizonDependent: false, violations: [{ kind: 'deadline', day: 5, text: 'zu spät' }], safetyViolations: [] },
      });
      expect(preferred(nah, weit, metrics)).toBe(nah);
      expect(preferred(weit, nah, metrics)).toBe(nah);
    });

    it('weiter schlägt näher', () => {
      const nah = result({ turnIslandId: 'mitte' });
      const weit = result({ turnIslandId: 'sued' });
      expect(preferred(nah, weit, metrics)).toBe(weit);
      expect(preferred(weit, nah, metrics)).toBe(weit);
    });

    it('eine Eskalationsstufe ist hinnehmbar, wenn sie WEITER trägt', () => {
      const nahOhne = result({ turnIslandId: 'mitte', relaxedTo: 'none' });
      const weitMit = result({ turnIslandId: 'sued', relaxedTo: 'doppelschlag' });
      expect(preferred(nahOhne, weitMit, metrics)).toBe(weitMit);
    });

    it('bei gleicher Reichweite gewinnt die Stufe, die weniger nachgibt', () => {
      const ohne = result({ turnIslandId: 'sued', relaxedTo: 'none' });
      const mit = result({ turnIslandId: 'sued', relaxedTo: 'doppelschlag' });
      expect(preferred(mit, ohne, metrics)).toBe(ohne);
    });

    it('bei gleicher Reichweite und Stufe gewinnt der Plan mit weniger Hafentagen', () => {
      const viel = result({
        turnIslandId: 'sued',
        plan: makePlan([makeHarbourDay(1, 'athen'), makeHarbourDay(2, 'athen'), makeStage(3, ['athen--mitte'], 'mitte')]),
      });
      const wenig = result({
        turnIslandId: 'sued',
        plan: makePlan([makeStage(1, ['athen--mitte'], 'mitte'), makeStage(2, ['mitte--sued'], 'sued')]),
      });
      expect(preferred(viel, wenig, metrics)).toBe(wenig);
    });

    it('weniger Sicherheitsverletzungen schlagen alles andere', () => {
      const unsicher = result({
        turnIslandId: 'sued',
        validity: { valid: false, horizonDependent: false,
          violations: [{ kind: 'upwind', day: 2, text: 'gegenan' }],
          safetyViolations: [{ kind: 'upwind', day: 2, text: 'gegenan' }] },
      });
      const sicherer = result({
        turnIslandId: 'mitte',
        validity: { valid: false, horizonDependent: false,
          violations: [{ kind: 'incomplete', day: null, text: 'Hafentage' }], safetyViolations: [] },
      });
      expect(preferred(unsicher, sicherer, metrics)).toBe(sicherer);
    });
  });

  it('nimmt sie NICHT in Kauf, wenn sie nichts einbringt', () => {
    // Gleiche Reichweite ohne Nachgeben erreichbar — dann bleibt es dabei.
    const solved = completePlan(roundTripSnapshot({ legNm: 8 }), 'athen')!;
    expect(solved.turnIslandId).toBe('sued');
    expect(solved.relaxedTo).toBe('none');
    for (const stage of stagesOf(solved.plan)) expect(stage.legIds).toHaveLength(1);
  });

  it('liefert bei gleicher Lage zweimal dasselbe (deterministisch)', () => {
    const snapshot = roundTripSnapshot();
    const a = completePlan(snapshot, 'athen')!;
    const b = completePlan(snapshot, 'athen')!;
    expect(JSON.stringify(a.plan)).toBe(JSON.stringify(b.plan));
    expect(a.turnIslandId).toBe(b.turnIslandId);
    expect(a.relaxedTo).toBe(b.relaxedTo);
  });
});

/**
 * SKIPPER-VORGABE 2026-08-05 — "plant doch niemals die gleiche Strecke hin und
 * zurück. Man plant einen Round Trip. In den Kykladen wird empfohlen, im
 * Uhrzeigersinn zu routen."
 *
 * Der Solver konnte gar keine Runde liefern: der Wendepunkt eines Kandidaten
 * war seine LETZTE Insel, und ein Rundkurs endet an der Basis — Reichweite 0.
 * Weil die Reichweite gleich nach der Gültigkeit verglichen wird, verlor jede
 * Runde gegen jedes Hin-und-zurück, obwohl die Bibliothek fertige Rundkurse
 * enthält.
 */
describe('solver — Round Trip statt Pendeln', () => {
  it('der Wendepunkt einer Runde ist ihre fernste Insel, nicht die Basis', () => {
    const snapshot = roundTripSnapshot();
    const rundkurse = buildCandidates(snapshot, 'athen').filter(
      (c) => c.legs.length > 0 && c.legs[c.legs.length - 1]!.toIslandId === 'athen',
    );
    expect(rundkurse.length).toBeGreaterThan(0);
    // Kein Kandidat darf die Basis als Wendepunkt führen, solange er irgendwo
    // hinfährt — sonst wäre seine Reichweite null.
    for (const c of rundkurse) expect(c.turnIslandId).not.toBe('athen');
  });

  it('zählt VERSCHIEDENE Inseln, nicht Etappen', () => {
    const snapshot = roundTripSnapshot();
    const metrics = planMetricsFor(snapshot);
    const solved = completePlan(snapshot, 'athen')!;
    const m = metrics(solved);
    const angelaufen = stagesOf(solved.plan).map((s) => s.toIslandId);
    expect(m.distinctIslands).toBe(new Set(angelaufen).size);
    expect(m.distinctIslands).toBeLessThanOrEqual(m.stages);
  });

  it('mehr verschiedene Inseln schlagen dieselbe Kette auf und ab', () => {
    const snapshot = roundTripSnapshot();
    const metrics = planMetricsFor(snapshot);
    const basis = {
      validity: { valid: true, horizonDependent: false, violations: [], safetyViolations: [] },
      relaxedTo: 'none' as const,
      variantId: 'a',
      turnIslandId: 'sued',
    };
    const pendeln = {
      ...basis,
      plan: makePlan([
        makeStage(1, ['athen--mitte'], 'mitte'),
        makeStage(2, ['mitte--sued'], 'sued'),
        makeStage(3, ['sued--mitte'], 'mitte'),
        makeStage(4, ['mitte--athen'], 'athen'),
      ]),
    };
    const runde = {
      ...basis,
      plan: makePlan([
        makeStage(1, ['athen--mitte'], 'mitte'),
        makeStage(2, ['mitte--sued'], 'sued'),
        makeStage(3, ['sued--athen'], 'athen'),
      ]),
    };
    // Gleiche Reichweite, gleiche Stufe — die Runde läuft drei verschiedene
    // Inseln an, das Pendeln nur drei bei vier Etappen (mitte doppelt).
    expect(metrics(runde).distinctIslands).toBe(3);
    expect(metrics(pendeln).distinctIslands).toBe(3);
    // Der Unterschied wird sichtbar, sobald das Pendeln eine Insel WENIGER hat.
    const kurz = {
      ...basis,
      turnIslandId: 'sued',
      plan: makePlan([
        makeStage(1, ['athen--sued'], 'sued'),
        makeStage(2, ['sued--athen'], 'athen'),
      ]),
    };
    expect(preferred(kurz, runde, metrics)).toBe(runde);
  });

  it('bei gleicher Reichweite gewinnt der Uhrzeigersinn', () => {
    const snapshot = roundTripSnapshot();
    const metrics = planMetricsFor(snapshot);
    const basis = {
      validity: { valid: true, horizonDependent: false, violations: [], safetyViolations: [] },
      relaxedTo: 'none' as const,
      variantId: 'a',
      turnIslandId: 'sued',
    };
    // athen (37.9/23.7) → mitte (37.6/24.2) → sued (37.3/24.6) → athen:
    // nach Südost und zurück nach Nordwest. Die Umkehrung läuft andersherum.
    const hin = { ...basis, plan: makePlan([
      makeStage(1, ['athen--mitte'], 'mitte'),
      makeStage(2, ['mitte--sued'], 'sued'),
      makeStage(3, ['sued--athen'], 'athen'),
    ]) };
    const zurueck = { ...basis, plan: makePlan([
      makeStage(1, ['athen--sued'], 'sued'),
      makeStage(2, ['sued--mitte'], 'mitte'),
      makeStage(3, ['mitte--athen'], 'athen'),
    ]) };
    // Genau eine der beiden Richtungen ist der Uhrzeigersinn.
    expect(metrics(hin).clockwise).not.toBe(metrics(zurueck).clockwise);
    const gewinner = metrics(hin).clockwise ? hin : zurueck;
    expect(preferred(hin, zurueck, metrics)).toBe(gewinner);
    expect(preferred(zurueck, hin, metrics)).toBe(gewinner);
  });
});

describe('solver — planTurnDay (Hin-/Rückweg-Trennlinie)', () => {
  it('nennt den Tag des ersten Anlaufs der südlichsten Insel', () => {
    const snapshot = roundTripSnapshot();
    const plan = makePlan([
      makeStage(1, ['athen--mitte'], 'mitte'),
      makeStage(2, ['mitte--sued'], 'sued'),
      makeHarbourDay(3, 'sued'),
      makeStage(4, ['sued--mitte'], 'mitte'),
      makeStage(5, ['mitte--athen'], 'athen'),
    ]);
    // sued (37.3° N) liegt südlich von mitte und athen — Tag 2 ist die Wende;
    // der Hafentag AN der Wende verschiebt sie nicht.
    expect(planTurnDay(plan, snapshot)).toBe(2);
  });

  it('bei mehrfachem Anlauf des Wendepunkts zählt der ERSTE (Erst-Anlauf-Konvention der Karte)', () => {
    const snapshot = roundTripSnapshot();
    const plan = makePlan([
      makeStage(1, ['athen--sued'], 'sued'),
      makeStage(2, ['sued--mitte'], 'mitte'),
      makeStage(3, ['mitte--sued'], 'sued'),
      makeStage(4, ['sued--athen'], 'athen'),
    ]);
    expect(planTurnDay(plan, snapshot)).toBe(1);
  });

  it('ohne Segeltage gibt es keine Wende', () => {
    const snapshot = roundTripSnapshot();
    const plan = makePlan([makeHarbourDay(1, 'athen')]);
    expect(planTurnDay(plan, snapshot)).toBe(null);
  });
});

/**
 * Verschmelzung Optionsraum + Alternativ-Routen (Feedback 2026-08-05): die
 * Alternativen SIND die Pläne der Optionen. `previewIndex` verbindet beide —
 * angesehen wird exakt der Plan, der übernommen würde (AD-3), und ein Plan,
 * der der Hauptroute entspricht, wird nicht noch einmal als "andere" Route
 * angeboten.
 */
describe('Verschmelzung: Optionen tragen ihre Alternative', () => {
  it('jede Option mit Plan zeigt auf eine Alternative mit GENAU diesem Plan', () => {
    const assessment = assessPlanning(roundTripSnapshot());
    expect(assessment.routeOptions.some((o) => o.previewIndex !== null)).toBe(true);
    for (const opt of assessment.routeOptions) {
      if (opt.previewIndex === null) continue;
      const alt = assessment.alternatives[opt.previewIndex]!;
      expect(planKey(alt.plan)).toBe(planKey(opt.plan!));
    }
  });

  it('eine Option, deren Plan die Hauptroute IST, bekommt keine Vorschau', () => {
    const snapshot = roundTripSnapshot();
    const first = assessPlanning(snapshot);
    const opt = first.routeOptions.find((o) => o.plan !== null)!;
    const adopted = assessPlanning({
      ...snapshot,
      trip: { ...snapshot.trip, plan: opt.plan! },
    });
    const same = adopted.routeOptions.find((o) => o.routeId === opt.routeId)!;
    expect(same.plan).not.toBeNull();
    expect(same.previewIndex).toBeNull();
    // Und keine Alternative behauptet denselben Plan noch einmal.
    for (const alt of adopted.alternatives) {
      expect(planKey(alt.plan)).not.toBe(planKey(opt.plan!));
    }
  });
});

/**
 * FR28 — Zwischenstopp löschen: ein Doppelschlag-Tag wird zur EINEN direkten
 * Etappe auf dasselbe Tagesziel. Zuerst zählt die Bibliothek (inkl.
 * Gegenrichtungen); kennt sie keine direkte Verbindung, wird sie ERZEUGT —
 * der kürzeste landfreie Kurs zwischen den Plätzen des Tages (searoute.ts).
 */
describe('solver — planWithoutStopover (Zwischenstopp löschen)', () => {
  /** Doppelschlag-Tag athen → mitte → sued, danach heim. */
  const doppelschlagPlan = () =>
    makePlan([
      makeStage(1, ['athen--mitte', 'mitte--sued'], 'sued'),
      makeStage(2, ['sued--mitte'], 'mitte'),
      makeStage(3, ['mitte--athen'], 'athen'),
      makeHarbourDay(4, 'athen'),
      makeHarbourDay(5, 'athen'),
    ]);

  it('ersetzt den Doppelschlag durch die Bibliotheks-Etappe und pinnt den Tag', () => {
    const snapshot = roundTripSnapshot();
    const direct = makeLeg({
      id: 'athen--sued',
      fromIslandId: 'athen',
      toIslandId: 'sued',
      fromPlaceId: 'athen-alimos',
      toPlaceId: 'sued-hafen',
      distanceNm: 38,
    });
    snapshot.library.legs = [...snapshot.library.legs, direct];

    const removal = planWithoutStopover(doppelschlagPlan(), 1, snapshot);
    expect(removal).not.toBeNull();
    // Bibliothek kannte die Verbindung — nichts wurde erzeugt.
    expect(removal!.customLeg).toBeNull();
    const day1 = removal!.plan.days.find((d) => d.day === 1)!;
    expect(day1.kind).toBe('stage');
    if (day1.kind === 'stage') {
      expect(day1.legIds).toEqual(['athen--sued']);
      expect(day1.toIslandId).toBe('sued');
    }
    expect(day1.source).toBe('skipper');
    // Alle anderen Tage bleiben unangetastet — die Kette ist weiter geschlossen.
    expect(removal!.plan.days.filter((d) => d.day !== 1)).toEqual(
      doppelschlagPlan().days.filter((d) => d.day !== 1),
    );
  });

  it('findet die direkte Verbindung auch als Gegenrichtung einer gespeicherten Etappe', () => {
    const snapshot = roundTripSnapshot();
    // Gespeichert ist nur sued--athen; athen--sued existiert als Umkehrung.
    const stored = makeLeg({
      id: 'sued--athen',
      fromIslandId: 'sued',
      toIslandId: 'athen',
      fromPlaceId: 'sued-hafen',
      toPlaceId: 'athen-alimos',
      distanceNm: 38,
    });
    snapshot.library.legs = [...snapshot.library.legs, stored];

    const removal = planWithoutStopover(doppelschlagPlan(), 1, snapshot);
    expect(removal).not.toBeNull();
    expect(removal!.customLeg).toBeNull();
    const day1 = removal!.plan.days.find((d) => d.day === 1)!;
    if (day1.kind === 'stage') expect(day1.legIds).toEqual(['athen--sued']);
  });

  it('ohne Bibliotheks-Verbindung wird die Direktroute landfrei ERZEUGT', () => {
    // Die Grundwelt kennt athen↔sued nur über mitte — in keiner Richtung direkt.
    const removal = planWithoutStopover(doppelschlagPlan(), 1, roundTripSnapshot());
    expect(removal).not.toBeNull();
    const leg = removal!.customLeg!;
    expect(leg).not.toBeNull();
    expect(leg.id).toBe('athen--sued');
    expect(leg.fromPlaceId).toBe('athen-alimos');
    expect(leg.toPlaceId).toBe('sued-hafen');
    expect(leg.distanceNm).toBeGreaterThan(0);
    // Der erzeugte Kurs ist landfrei — nie eine behauptete Luftlinie über Land.
    const snapshot = roundTripSnapshot();
    const from = snapshot.library.places.find((p) => p.id === 'athen-alimos')!;
    const to = snapshot.library.places.find((p) => p.id === 'sued-hafen')!;
    expect(
      pathCrossesLand([from.coordinates, ...leg.waypoints, to.coordinates]),
    ).toBe(false);
    // Und der Plan referenziert genau diese Etappe, als Skipper-Entscheidung.
    const day1 = removal!.plan.days.find((d) => d.day === 1)!;
    if (day1.kind === 'stage') expect(day1.legIds).toEqual([leg.id]);
    expect(day1.source).toBe('skipper');
  });

  it('null an Tagen ohne Zwischenstopp (eine Etappe oder Hafentag)', () => {
    const snapshot = roundTripSnapshot();
    expect(planWithoutStopover(doppelschlagPlan(), 2, snapshot)).toBeNull();
    expect(planWithoutStopover(doppelschlagPlan(), 4, snapshot)).toBeNull();
  });
});
