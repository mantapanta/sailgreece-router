import { describe, expect, it } from 'vitest';
import { assessLeg, budgetVerdict, upwindWindVerdict } from '../scoring.ts';
import { DEFAULT_PARAMS } from '../schema/params.ts';
import { northSouthScenario } from './fixtures.ts';

const params = DEFAULT_PARAMS;

describe('FR16 wind rule: no beating upwind above 25 kn', () => {
  it('upwind course at 27 kn TWS => rot', () => {
    expect(upwindWindVerdict(30, 27, params)).toBe('rot');
  });

  it('upwind course near the threshold (reserve band) => gelb', () => {
    expect(upwindWindVerdict(30, 24, params)).toBe('gelb');
  });

  it('upwind course in moderate wind => gruen', () => {
    expect(upwindWindVerdict(30, 15, params)).toBe('gruen');
  });

  it('downwind course at 27 kn is not the beating rule => gruen', () => {
    expect(upwindWindVerdict(150, 27, params)).toBe('gruen');
  });
});

describe('FR16 day budgets: target 5+1 / 6+0, hard max 6+2', () => {
  it('5 h sail + 1 h motor => gruen (target)', () => {
    expect(budgetVerdict(5, 1, 15, params).ampel).toBe('gruen');
  });

  it('6 h pure sailing => gruen (target)', () => {
    expect(budgetVerdict(6, 0, 15, params).ampel).toBe('gruen');
  });

  it('between target and hard max (e.g. 6 h sail + 1.5 h motor) => gelb', () => {
    expect(budgetVerdict(6, 1.5, 15, params).ampel).toBe('gelb');
  });

  it('hard max boundary 6 h sail + 2 h motor => gelb (inclusive)', () => {
    expect(budgetVerdict(6, 2, 15, params).ampel).toBe('gelb');
  });

  it('beyond hard max => rot', () => {
    expect(budgetVerdict(7, 2, 15, params).ampel).toBe('rot');
    expect(budgetVerdict(6, 2.5, 15, params).ampel).toBe('rot');
  });

  it('light wind exception: 11 h at 5 kn TWS => gelb, not rot (night legs)', () => {
    expect(budgetVerdict(4, 7, 5, params).ampel).toBe('gelb');
  });

  it('light wind exception capped at 12 h', () => {
    expect(budgetVerdict(6, 7, 5, params).ampel).toBe('rot');
  });
});

describe('assessLeg — integration against a synthetic snapshot (AD-3)', () => {
  it('beating against 27 kn from the north => leg ampel rot', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 27,
      windFromDeg: 0,
      southbound: false, // sailing north, against the meltemi
    });
    const a = assessLeg(leg, 1, snapshot);
    expect(a.ampel).toBe('rot');
    expect(a.reasons.join(' ')).toContain('Aufkreuzen');
  });

  it('running south before 18 kn from the north => gruen, sensible duration', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 18,
      windFromDeg: 0,
      southbound: true,
      distanceNm: 20,
    });
    const a = assessLeg(leg, 1, snapshot);
    expect(a.ampel).toBe('gruen');
    // Dead downwind (TWA 180): TEST_POLAR gives ~5.1-6.0 kn + 0.5 offset.
    expect(a.totalHours).not.toBeNull();
    expect(a.totalHours!).toBeGreaterThan(2.5);
    expect(a.totalHours!).toBeLessThan(4.5);
    expect(a.sailHours).toBeGreaterThan(0);
  });

  it('assesses the future window of trip day N, not today (FR15)', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 18,
      windFromDeg: 0,
      southbound: false,
    });
    // Day 1+2 calm from the south, day 3 heavy northerly: only day 3 is rot.
    for (const key of Object.keys(snapshot.forecast)) {
      const fc = snapshot.forecast[key]!;
      for (let i = 0; i < snapshot.times.length; i++) {
        const dayOffset = Math.floor(i / 24);
        fc.windKn[i] = dayOffset < 2 ? 12 : 28;
        fc.windDirDeg[i] = 0;
      }
    }
    expect(assessLeg(leg, 1, snapshot).ampel).not.toBe('rot');
    expect(assessLeg(leg, 3, snapshot).ampel).toBe('rot');
  });

  it('leg reaching beyond the forecast horizon => unbewertet (never gruen/rot)', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 15,
      windFromDeg: 0,
    });
    const a = assessLeg(leg, 30, snapshot); // far beyond the axis
    expect(a.ampel).toBe('unbewertet');
    expect(a.totalHours).toBeNull();
  });

  it('null hours inside the leg window => unbewertet', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 15,
      windFromDeg: 0,
    });
    for (const key of Object.keys(snapshot.forecast)) {
      const fc = snapshot.forecast[key]!;
      for (let i = 0; i < snapshot.times.length; i++) {
        fc.windKn[i] = null;
        fc.windDirDeg[i] = null;
      }
    }
    expect(assessLeg(leg, 1, snapshot).ampel).toBe('unbewertet');
  });

  it('without a polar the flat fallback speeds are used (FR26)', () => {
    const { snapshot, leg } = northSouthScenario({
      windKn: 15,
      windFromDeg: 0,
      southbound: true,
      distanceNm: 18,
      polar: null,
    });
    const a = assessLeg(leg, 1, snapshot);
    // 18 nm at flat 6.0 kn sail => 3 h
    expect(a.totalHours).toBeCloseTo(3, 1);
    expect(a.ampel).toBe('gruen');
  });
});
