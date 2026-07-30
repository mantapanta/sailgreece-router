import { describe, expect, it } from 'vitest';
import {
  fallbackSpeedKn,
  motorSpeedKn,
  rawPolarSpeedKn,
  sailSpeedKn,
} from '../polar.ts';
import { DEFAULT_PARAMS } from '../schema/params.ts';
import { TEST_POLAR } from './fixtures.ts';

const params = DEFAULT_PARAMS;

describe('polar — interpolation + single offset (FR26 / AD-10)', () => {
  it('returns grid values exactly at grid points (without offset)', () => {
    expect(rawPolarSpeedKn(TEST_POLAR, 90, 10)).toBeCloseTo(7.8, 5);
    expect(rawPolarSpeedKn(TEST_POLAR, 120, 25)).toBeCloseTo(9.8, 5);
  });

  it('interpolates linearly between TWS grid points', () => {
    // TWA 90 between TWS 10 (7.8) and 25 (9.6): at 17.5 kn -> midway 8.7
    expect(rawPolarSpeedKn(TEST_POLAR, 90, 17.5)).toBeCloseTo(8.7, 5);
  });

  it('interpolates linearly between TWA grid points', () => {
    // TWS 10 between TWA 90 (7.8) and 120 (7.5): at 105 -> 7.65
    expect(rawPolarSpeedKn(TEST_POLAR, 105, 10)).toBeCloseTo(7.65, 5);
  });

  it('folds ANY angle to 0-180 (also |twa| > 360: 540 => 180, not 0)', () => {
    expect(rawPolarSpeedKn(TEST_POLAR, 540, 10)).toBeCloseTo(
      rawPolarSpeedKn(TEST_POLAR, 180, 10),
      10,
    );
    expect(rawPolarSpeedKn(TEST_POLAR, -90, 10)).toBeCloseTo(
      rawPolarSpeedKn(TEST_POLAR, 90, 10),
      10,
    );
    expect(rawPolarSpeedKn(TEST_POLAR, 270, 10)).toBeCloseTo(
      rawPolarSpeedKn(TEST_POLAR, 90, 10),
      10,
    );
  });

  it('clamps at grid edges', () => {
    expect(rawPolarSpeedKn(TEST_POLAR, 90, 60)).toBeCloseTo(9.6, 5);
    expect(rawPolarSpeedKn(TEST_POLAR, 90, 1)).toBeCloseTo(3.9, 5);
  });

  it('applies the +0.5 kn ship offset exactly once (sailSpeed = raw + offset)', () => {
    const raw = rawPolarSpeedKn(TEST_POLAR, 90, 10);
    const withOffset = sailSpeedKn(TEST_POLAR, 90, 10, params);
    expect(withOffset).toBeCloseTo(raw + params.polarOffsetKn, 10);
    // and never twice: value is exactly raw + 0.5, not raw + 1.0
    expect(withOffset).not.toBeCloseTo(raw + 2 * params.polarOffsetKn, 5);
  });

  it('does not apply the offset to a standing boat (polar = 0)', () => {
    expect(sailSpeedKn(TEST_POLAR, 0, 10, params)).toBe(0);
  });

  it('motor speed is its own parameter without polar offset', () => {
    expect(motorSpeedKn(params)).toBe(8);
  });

  it('fallback flat speeds apply only without a polar: 6.0 / 7.5 / 6.5 kn', () => {
    expect(fallbackSpeedKn(false, false, params)).toBe(6.0);
    expect(fallbackSpeedKn(false, true, params)).toBe(7.5);
    expect(fallbackSpeedKn(true, false, params)).toBe(6.5);
  });
});
