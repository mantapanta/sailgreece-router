import { describe, expect, it } from 'vitest';
import {
  fixedDays,
  islandAtEndOfDay,
  pinnedDays,
  planDay,
  stageNumber,
  stagesOf,
} from '../schema/plan.ts';
import { makeHarbourDay, makePlan, makeStage } from './fixtures.ts';

/**
 * AD-12/AD-2 — the numbering lives here and nowhere else. The regression that
 * matters: map and day view must not disagree once the harbour day moves.
 */
describe('plan — stage numbering (AD-2, FR2)', () => {
  it('numbers stages 1..n in day order, skipping the harbour day', () => {
    const plan = makePlan([
      makeStage(1, ['athen--kea'], 'kea'),
      makeStage(2, ['kea--kythnos'], 'kythnos'),
      makeHarbourDay(3, 'kythnos'),
      makeStage(4, ['kythnos--serifos'], 'serifos'),
    ]);
    expect(stageNumber(plan, 1)).toBe(1);
    expect(stageNumber(plan, 2)).toBe(2);
    expect(stageNumber(plan, 3)).toBeNull();
    // Day 4 is the THIRD stage, not the fourth day's number.
    expect(stageNumber(plan, 4)).toBe(3);
  });

  it('keeps the last stage number stable when the harbour day moves', () => {
    const early = makePlan([
      makeHarbourDay(1, 'athen'),
      makeStage(2, ['athen--kea'], 'kea'),
      makeStage(3, ['kea--kythnos'], 'kythnos'),
    ]);
    const late = makePlan([
      makeStage(1, ['athen--kea'], 'kea'),
      makeStage(2, ['kea--kythnos'], 'kythnos'),
      makeHarbourDay(3, 'kythnos'),
    ]);
    // Both plans sail two stages, so the final stage carries number 2 in both
    // — the harbour day's position must not renumber the trip.
    expect(stageNumber(early, 3)).toBe(2);
    expect(stageNumber(late, 2)).toBe(2);
  });

  it('treats a double-leg day as ONE stage with one day target', () => {
    const plan = makePlan([
      makeStage(1, ['serifos--sifnos', 'sifnos--paros'], 'paros'),
      makeStage(2, ['paros--naxos'], 'naxos'),
    ]);
    expect(stagesOf(plan)).toHaveLength(2);
    expect(stageNumber(plan, 2)).toBe(2);
    expect(islandAtEndOfDay(plan, 1)).toBe('paros');
  });

  it('returns null for a day the plan does not cover', () => {
    const plan = makePlan([makeStage(1, ['athen--kea'], 'kea')]);
    expect(planDay(plan, 7)).toBeNull();
    expect(stageNumber(plan, 7)).toBeNull();
  });
});

describe('plan — pins and fixed days (AD-12)', () => {
  it('reports skipper days as pins', () => {
    const plan = makePlan([
      makeStage(1, ['athen--kea'], 'kea', 'solver'),
      makeStage(2, ['kea--kythnos'], 'kythnos', 'skipper'),
      makeHarbourDay(3, 'kythnos', 'skipper'),
    ]);
    expect(pinnedDays(plan)).toEqual([2, 3]);
  });

  it('fixes past days implicitly — they already happened', () => {
    const plan = makePlan([
      makeStage(1, ['athen--kea'], 'kea', 'solver'),
      makeStage(2, ['kea--kythnos'], 'kythnos', 'solver'),
      makeStage(3, ['kythnos--serifos'], 'serifos', 'solver'),
      makeStage(4, ['serifos--sifnos'], 'sifnos', 'skipper'),
    ]);
    expect(fixedDays(plan, 3)).toEqual([1, 2, 4]);
  });
});
