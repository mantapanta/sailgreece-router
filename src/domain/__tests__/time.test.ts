import { describe, expect, it } from 'vitest';
import {
  athensToUtcMs,
  dateForTripDay,
  hourIndices,
  nightWindow,
  legWindow,
} from '../time.ts';
import { makeTimes, TRIP_START } from './fixtures.ts';

describe('time — Athens -> UTC (AD-9)', () => {
  it('converts Athens summer wall time to UTC (EEST = UTC+3)', () => {
    expect(athensToUtcMs('2026-08-08', 18)).toBe(Date.parse('2026-08-08T15:00:00Z'));
    expect(athensToUtcMs('2026-08-09', 9)).toBe(Date.parse('2026-08-09T06:00:00Z'));
  });

  it('converts Athens winter wall time to UTC (EET = UTC+2)', () => {
    expect(athensToUtcMs('2026-01-15', 12)).toBe(Date.parse('2026-01-15T10:00:00Z'));
  });

  it('maps trip days to calendar dates (day 1 = trip start)', () => {
    expect(dateForTripDay(TRIP_START, 1)).toBe('2026-08-08');
    expect(dateForTripDay(TRIP_START, 3)).toBe('2026-08-10');
    expect(dateForTripDay(TRIP_START, 12)).toBe('2026-08-19');
  });

  it('nightWindow(N) = [day N 18:00, day N+1 09:00) Athens, half-open', () => {
    const w = nightWindow(TRIP_START, 1);
    expect(w.startMs).toBe(Date.parse('2026-08-08T15:00:00Z'));
    expect(w.endMs).toBe(Date.parse('2026-08-09T06:00:00Z'));
  });

  it('translates the night window into UTC hour indices of the snapshot axis', () => {
    const times = makeTimes(3); // starts 2026-08-08T00:00Z, hourly
    const indices = hourIndices(nightWindow(TRIP_START, 1), times);
    // 18:00-08:00 Athens night 1 = 15:00 UTC day 1 .. 05:00 UTC day 2 inclusive,
    // end 06:00 UTC exclusive => indices 15..29 (15 hours).
    expect(indices[0]).toBe(15);
    expect(indices[indices.length - 1]).toBe(29);
    expect(indices).toHaveLength(15);
    expect(indices).not.toContain(30); // half-open end
  });

  it('legWindow starts at day N departure time (default 09:00 Athens)', () => {
    const w = legWindow(TRIP_START, 2);
    expect(w.startMs).toBe(Date.parse('2026-08-09T06:00:00Z'));
    const wLate = legWindow(TRIP_START, 2, 11);
    expect(wLate.startMs).toBe(Date.parse('2026-08-09T08:00:00Z'));
  });
});
