import { describe, expect, it } from 'vitest';
import { WindSectorSchema, WaveSectorSchema } from '../schema/shelter.ts';
import { PolarSchema } from '../schema/polar.ts';
import { ParamsSchema, DEFAULT_PARAMS } from '../schema/params.ts';
import { TEST_POLAR } from './fixtures.ts';

describe('shelter schema — point sectors are rejected (silent full circle!)', () => {
  it('rejects a point sector like 350-350 (typo would mean all-round shelter)', () => {
    expect(WindSectorSchema.safeParse({ fromDeg: 350, toDeg: 350, maxKn: 20 }).success).toBe(false);
    expect(WaveSectorSchema.safeParse({ fromDeg: 0, toDeg: 0, maxM: 1 }).success).toBe(false);
  });

  it('rejects 360-0 (full circle only expressible as exactly 0-360)', () => {
    expect(WindSectorSchema.safeParse({ fromDeg: 360, toDeg: 0, maxKn: 20 }).success).toBe(false);
  });

  it('accepts the explicit full circle 0-360 and ordinary sectors', () => {
    expect(WindSectorSchema.safeParse({ fromDeg: 0, toDeg: 360, maxKn: 20 }).success).toBe(true);
    expect(WindSectorSchema.safeParse({ fromDeg: 330, toDeg: 60, maxKn: 20 }).success).toBe(true);
    expect(WaveSectorSchema.safeParse({ fromDeg: 0, toDeg: 360, maxM: 1 }).success).toBe(true);
  });
});

describe('polar schema — grid axes must be strictly ascending (interp1 relies on it)', () => {
  it('accepts the ascending fixture polar', () => {
    expect(PolarSchema.safeParse(TEST_POLAR).success).toBe(true);
  });

  it('rejects unsorted twaDeg', () => {
    const bad = { ...TEST_POLAR, twaDeg: [0, 90, 60, 120, 180] };
    expect(PolarSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects duplicate twsKn columns', () => {
    const bad = {
      ...TEST_POLAR,
      twsKn: [4, 10, 10],
    };
    expect(PolarSchema.safeParse(bad).success).toBe(false);
  });
});

describe('params schema — cross-field validation (AD-8: config editable without redeploy)', () => {
  it('accepts the defaults', () => {
    expect(ParamsSchema.safeParse({}).success).toBe(true);
    expect(ParamsSchema.safeParse(DEFAULT_PARAMS).success).toBe(true);
  });

  it('rejects nightEndHourAthens >= nightStartHourAthens (window would exceed 24 h)', () => {
    expect(
      ParamsSchema.safeParse({ nightStartHourAthens: 9, nightEndHourAthens: 18 }).success,
    ).toBe(false);
  });

  it('rejects targetDayHours above the hard maximum', () => {
    expect(
      ParamsSchema.safeParse({ targetDayHours: 9, maxSailHours: 6, maxMotorHours: 2 }).success,
    ).toBe(false);
  });

  it('rejects gelbReserveKn >= maxUpwindTwsKn (gruen unreachable)', () => {
    expect(ParamsSchema.safeParse({ gelbReserveKn: 25, maxUpwindTwsKn: 25 }).success).toBe(false);
  });

  it('rejects a deadline before trip day 1 (disembarkDay - 1 - bufferDays < 1)', () => {
    expect(ParamsSchema.safeParse({ disembarkDay: 2, bufferDays: 1 }).success).toBe(false);
  });

  it('rejects disembarkDay beyond tripLengthDays', () => {
    expect(ParamsSchema.safeParse({ disembarkDay: 13, tripLengthDays: 12 }).success).toBe(false);
  });
});
