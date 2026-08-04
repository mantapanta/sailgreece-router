/**
 * Fixtures for the overall plan reasoning (domain/overview.ts).
 * The claims that must not drift: which constraint is named as binding (wind
 * vs. calendar — naming the wrong one sends the skipper looking in the wrong
 * place), and whether the tightest spot in the plan is found.
 */

import { describe, expect, it } from 'vitest';
import { assessPlanning } from '../assess.ts';
import { assessLeg } from '../scoring.ts';
import type { Route } from '../schema/route.ts';
import type { PlanningSnapshot } from '../schema/snapshot.ts';
import { RETURN_CHAIN_ROUTE_ID } from '../schema/route.ts';
import {
  TEST_POLAR,
  constantForecast,
  makeLeg,
  makePlace,
  makeSnapshot,
  makeTimes,
  truncateForecast,
} from './fixtures.ts';

/**
 * Base at the north, one island to the south. The outbound leg runs downwind,
 * the return beats — so a northerly of the right strength makes the RETURN the
 * limiting factor, exactly as in the real cruising area.
 */
function scenario(opts: { windKn: number; windFromDeg: number; days?: number }) {
  const base = makePlace({
    id: 'athen-alimos',
    islandId: 'athen',
    coordinates: { lat: 37.9, lon: 23.7 },
  });
  const south = makePlace({
    id: 'kea-vourkari',
    islandId: 'kea',
    coordinates: { lat: 37.5, lon: 23.7 },
  });
  const out = makeLeg({
    id: 'athen--kea',
    fromIslandId: 'athen',
    toIslandId: 'kea',
    fromPlaceId: base.id,
    toPlaceId: south.id,
    distanceNm: 24,
  });
  const back = makeLeg({
    id: 'kea--athen',
    fromIslandId: 'kea',
    toIslandId: 'athen',
    fromPlaceId: south.id,
    toPlaceId: base.id,
    distanceNm: 24,
  });
  const route: Route = {
    id: 'kea-route',
    name: 'Kea-Route',
    escalationRank: 1,
    isReturnChain: false,
    legs: [out],
  };
  const chain: Route = {
    id: RETURN_CHAIN_ROUTE_ID,
    name: 'Rückfallkette',
    escalationRank: 0,
    isReturnChain: true,
    legs: [back],
  };
  const times = makeTimes(opts.days ?? 14);
  const fc = constantForecast(times.length, opts.windKn, opts.windFromDeg);
  const snapshot: PlanningSnapshot = makeSnapshot({
    times,
    polar: TEST_POLAR,
    forecast: { [base.id]: fc, [south.id]: fc },
    library: {
      islands: [
        { id: 'athen', name: 'Athen (Basis)', coordinates: base.coordinates },
        { id: 'kea', name: 'Kea', coordinates: south.coordinates },
      ],
      places: [base, south],
      invalidPlaces: [],
      routes: [chain, route],
    },
  });
  snapshot.trip = {
    currentDay: 1,
    position: { source: 'manual', lat: base.coordinates.lat, lon: base.coordinates.lon, placeId: base.id },
    trackedRouteId: route.id,
    departureHourOverride: null,
  };
  return { snapshot, out, back };
}

function sectionOf(snapshot: PlanningSnapshot, title: string): string {
  const s = assessPlanning(snapshot).planRationale.sections.find(
    (x) => x.title === title,
  );
  return s ? s.lines.join('\n') : '';
}

describe('plan rationale', () => {
  it('always carries a summary and all seven blocks', () => {
    const { snapshot } = scenario({ windKn: 12, windFromDeg: 0 });
    const r = assessPlanning(snapshot).planRationale;
    expect(r.summary).toMatch(/Athen \(Basis\)/);
    expect(r.sections.map((s) => s.title)).toEqual([
      'Ausgangslage',
      'Möglichkeitsraum',
      'Was den Raum begrenzt',
      'Nächster Druckpunkt',
      'Wetterbild der nächsten Tage',
      'Rückweg',
      'Datenbasis',
    ]);
    for (const s of r.sections) expect(s.lines.length).toBeGreaterThan(0);
  });

  it('names the deadline rule and that legs are judged against THEIR day', () => {
    const { snapshot } = scenario({ windKn: 12, windFromDeg: 0 });
    const text = sectionOf(snapshot, 'Ausgangslage');
    expect(text).toContain('Törntag 1 von 12');
    expect(text).toContain('nicht gegen das von heute');
    expect(text).toContain('Puffertag');
  });

  it('blames the WIND when a leg is red', () => {
    // 28 kn northerly: beating home is red.
    const { snapshot } = scenario({ windKn: 28, windFromDeg: 0 });
    expect(assessLeg(scenario({ windKn: 28, windFromDeg: 0 }).back, 2, snapshot).ampel).toBe('rot');
    const text = sectionOf(snapshot, 'Was den Raum begrenzt');
    expect(text).toContain('Der Wind:');
    expect(text).toContain('reißen die Aufkreuz-Grenze');
  });

  it('does NOT blame the wind for a leg that is red on distance alone', () => {
    // Gentle wind from the side, but a leg far too long for the day budget:
    // red, yet the wind rule is untouched. Saying "the wind" here would send
    // the skipper waiting for a shift that changes nothing.
    const { snapshot } = scenario({ windKn: 8, windFromDeg: 90 });
    const long = makeLeg({
      id: 'kea--fernziel',
      fromIslandId: 'kea',
      toIslandId: 'athen',
      fromPlaceId: 'kea-vourkari',
      toPlaceId: 'athen-alimos',
      distanceNm: 140,
    });
    snapshot.library.routes = snapshot.library.routes.map((r) =>
      r.id === RETURN_CHAIN_ROUTE_ID ? { ...r, legs: [long] } : r,
    );
    const a = assessPlanning(snapshot);
    const reds = [...a.routeOptions.flatMap((o) => o.returnLegAssessments)].filter(
      (l) => l.ampel === 'rot',
    );
    expect(reds.length).toBeGreaterThan(0);
    expect(reds.every((l) => (l.headroom.windKn ?? Infinity) > 0)).toBe(true);
    const text = sectionOf(snapshot, 'Was den Raum begrenzt');
    expect(text).toContain('Nicht der Wind, sondern die Strecke');
  });

  it('blames the CALENDAR when nothing is red but options still close', () => {
    const { snapshot } = scenario({ windKn: 12, windFromDeg: 0 });
    const text = sectionOf(snapshot, 'Was den Raum begrenzt');
    // Gentle wind: no red leg anywhere, yet the option is time-limited.
    const legs = assessPlanning(snapshot).routeOptions.flatMap((o) => o.legAssessments);
    expect(legs.some((l) => l.ampel === 'rot')).toBe(false);
    expect(text).not.toContain('Der Wind:');
    expect(text).toMatch(/Der Kalender, nicht der Wind|begrenzt nichts den Raum/);
  });

  it('finds the tightest spot and states the reserve in knots when beating', () => {
    // 21 kn upwind: green/yellow, but only 4 kn below the 25 kn limit.
    const { snapshot } = scenario({ windKn: 21, windFromDeg: 0 });
    const text = sectionOf(snapshot, 'Was den Raum begrenzt');
    expect(text).toContain('Engste Stelle im ganzen Plan');
    expect(text).toContain('kn bis zur Aufkreuz-Grenze');
  });

  it('ranks reserves relative to their own limit, not by raw number', () => {
    // Here the return leg has ~4 kn wind reserve (of 25 = 16 %) and ~2,4 h time
    // reserve (of 8 = 30 %). Compared as bare numbers 2,4 < 4 and the day
    // budget would be reported as the tightest spot — which is wrong: 4 of
    // 25 kn is the narrower margin. This pins the normalisation down.
    const { snapshot } = scenario({ windKn: 21, windFromDeg: 0 });
    const text = sectionOf(snapshot, 'Was den Raum begrenzt');
    expect(text).toContain('Aufkreuz-Grenze');
    expect(text).not.toContain('Tagesmaximum');
  });

  it('sees the RETURN legs — the outbound half alone would hide the wind risk', () => {
    // Northerly: outbound runs downwind (harmless), the return beats.
    const { snapshot } = scenario({ windKn: 21, windFromDeg: 0 });
    const a = assessPlanning(snapshot);
    const option = a.routeOptions.find((o) => o.routeId === 'kea-route')!;
    expect(option.legAssessments.every((l) => l.headroom.windKn === null)).toBe(true);
    expect(option.returnLegAssessments.length).toBeGreaterThan(0);
    expect(option.returnLegAssessments.some((l) => l.headroom.windKn !== null)).toBe(true);
    expect(option.rationale.join(' ')).toContain('Rückweg ab');
    // And the tightest spot is found on that return leg, not on the outbound one.
    expect(sectionOf(snapshot, 'Was den Raum begrenzt')).toContain('kea → athen');
  });

  it('reports the wind band per day over the whole area', () => {
    const { snapshot } = scenario({ windKn: 14, windFromDeg: 45 });
    const text = sectionOf(snapshot, 'Wetterbild der nächsten Tage');
    expect(text).toContain('Tag 1 (2026-08-08)');
    expect(text).toContain('14–14 kn aus NO');
    expect(text).toContain('das ganze Revier');
  });

  it('marks assumed days in the weather picture and says the plan is correctable', () => {
    const { snapshot } = scenario({ windKn: 12, windFromDeg: 0, days: 3 });
    truncateForecast(snapshot, 3 * 24);
    const weather = sectionOf(snapshot, 'Wetterbild der nächsten Tage');
    expect(weather).toContain('Annahme');
    const basis = sectionOf(snapshot, 'Datenbasis');
    expect(basis).toContain('Persistenz-Annahme');
    expect(basis).toContain('korrigierbar, nicht sicher');
  });

  it('says so plainly when the whole plan rests on real model data', () => {
    const { snapshot } = scenario({ windKn: 12, windFromDeg: 0, days: 16 });
    const basis = sectionOf(snapshot, 'Datenbasis');
    expect(basis).toContain('echten Modelldaten');
    expect(basis).not.toContain('Persistenz-Annahme');
  });

  it('without a position it asks for one instead of inventing a plan', () => {
    const { snapshot } = scenario({ windKn: 12, windFromDeg: 0 });
    snapshot.trip = { ...snapshot.trip, currentDay: 3, position: null };
    const r = assessPlanning(snapshot).planRationale;
    expect(r.summary).toContain('Standort setzen');
    expect(sectionOf(snapshot, 'Ausgangslage')).toContain('Keine Position bestimmt');
  });
});

describe('leg headroom', () => {
  it('is null for wind when the leg never beats — the rule is not binding there', () => {
    // Northerly, sailing SOUTH: downwind, the upwind rule cannot bite.
    const { snapshot, out } = scenario({ windKn: 20, windFromDeg: 0 });
    const a = assessLeg(out, 1, snapshot);
    expect(a.upwind).toBe(false);
    expect(a.headroom.windKn).toBeNull();
    expect(a.headroom.hours).not.toBeNull();
  });

  it('measures the distance to the 25 kn limit at the worst beating hour', () => {
    const { snapshot, back } = scenario({ windKn: 21, windFromDeg: 0 });
    const a = assessLeg(back, 1, snapshot);
    expect(a.upwind).toBe(true);
    expect(a.headroom.windKn).toBeCloseTo(4, 5);
  });

  it('goes negative once the limit is exceeded', () => {
    const { snapshot, back } = scenario({ windKn: 28, windFromDeg: 0 });
    expect(assessLeg(back, 1, snapshot).headroom.windKn).toBeCloseTo(-3, 5);
  });
});
