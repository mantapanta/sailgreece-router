import { describe, expect, it } from 'vitest';
import { WindSectorSchema, WaveSectorSchema } from '../schema/shelter.ts';
import { PolarSchema } from '../schema/polar.ts';
import { ParamsSchema, DEFAULT_PARAMS } from '../schema/params.ts';
import { TEST_POLAR } from './fixtures.ts';
import CONFIG_JSON from '../../../seeding/data/config.json' with { type: 'json' };

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

  it('rejects a return deadline before the trip starts', () => {
    expect(
      ParamsSchema.safeParse({
        tripStartDate: '2026-08-08',
        returnDeadlineDate: '2026-08-07',
      }).success,
    ).toBe(false);
  });

  it('rejects a pickup date outside the trip window (FR31 is a hard condition)', () => {
    expect(
      ParamsSchema.safeParse({
        tripStartDate: '2026-08-08',
        returnDeadlineDate: '2026-08-19',
        pickupDate: '2026-08-25',
      }).success,
    ).toBe(false);
  });

  it('rejects a worst case that is not worse than the upwind threshold', () => {
    expect(
      ParamsSchema.safeParse({
        maxUpwindTwsKn: 30,
        meltemiWorstCase: { twsKn: 30, fromDeg: 0, toDeg: 45, waveM: 2 },
      }).success,
    ).toBe(false);
  });
});

describe('params schema — Forecast-Modelle (Nahfeld/Fernfeld)', () => {
  it('hat den gewollten Hybrid als Default', () => {
    expect(DEFAULT_PARAMS.forecastModel).toBe('ecmwf_ifs025');
    expect(DEFAULT_PARAMS.forecastModelNear).toBe('dwd_icon_eu');
    expect(DEFAULT_PARAMS.waveModel).toBe('best_match');
    expect(DEFAULT_PARAMS.waveModelNear).toBe('ewam');
  });

  it('nimmt ein Alt-Dokument, das nur forecastModel kennt (Rückwärtskompatibilität)', () => {
    const parsed = ParamsSchema.safeParse({ forecastModel: 'ecmwf_ifs025' });
    expect(parsed.success).toBe(true);
    // Die neuen Schlüssel kommen aus den Defaults — der Hybrid ist damit nach
    // dem Deploy AN, ohne dass das Firestore-Dokument angefasst wurde.
    expect(parsed.success && parsed.data.forecastModelNear).toBe('dwd_icon_eu');
  });

  it('akzeptiert den Aus-Schalter: Leerstring im Nahfeld', () => {
    expect(
      ParamsSchema.safeParse({ forecastModelNear: '', waveModelNear: '' }).success,
    ).toBe(true);
  });

  // Eine UNBEKANNTE Id darf das Schema NICHT scheitern lassen: parseTolerant
  // würde sonst das ganze Parameter-Dokument verwerfen und stumm die gesamte
  // Abstimmung auf die Defaults zurücksetzen. Sie fängt der Adapter sichtbar ab
  // (siehe adapters/__tests__/openMeteo.test.ts).
  it('lässt eine unbekannte Id durch — sie ist Sache des Adapters, nicht des Schemas', () => {
    const parsed = ParamsSchema.safeParse({
      forecastModel: 'icon_eu',
      konzeptOstMaxKn: 19,
    });
    expect(parsed.success).toBe(true);
    // Der Punkt: die übrige Abstimmung überlebt.
    expect(parsed.success && parsed.data.konzeptOstMaxKn).toBe(19);
  });

  it('lehnt ein Wellenmodell im Wind-Feld ab (und umgekehrt)', () => {
    expect(ParamsSchema.safeParse({ forecastModel: 'ewam' }).success).toBe(false);
    expect(ParamsSchema.safeParse({ waveModel: 'dwd_icon_eu' }).success).toBe(false);
  });

  it('lehnt ICON-2I ab — 2 km, aber das Gitter endet vor den Kykladen', () => {
    const parsed = ParamsSchema.safeParse({
      forecastModelNear: 'italia_meteo_arpae_icon_2i',
    });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.success ? [] : parsed.error.issues)).toContain('22');
  });

  it('lehnt zwei gleiche Modelle ab und nennt den echten Aus-Schalter', () => {
    const parsed = ParamsSchema.safeParse({
      forecastModel: 'ecmwf_ifs025',
      forecastModelNear: 'ecmwf_ifs025',
    });
    expect(parsed.success).toBe(false);
    const messages = parsed.success ? [] : parsed.error.issues.map((i) => i.message);
    expect(messages.some((m) => m.includes('forecastModelNear: ""'))).toBe(true);
  });

  it('lehnt ein leeres Fernfeld ab — es trägt die Achse', () => {
    expect(ParamsSchema.safeParse({ forecastModel: '' }).success).toBe(false);
    expect(ParamsSchema.safeParse({ waveModel: '' }).success).toBe(false);
  });

  it('deckt ein vertauschtes Nah/Fern-Paar auf (sonst unsichtbar)', () => {
    // ICON-EU (120 h) als Fernfeld, ECMWF (360 h) als Nahfeld: das Fernfeld
    // käme nie zum Tragen.
    expect(
      ParamsSchema.safeParse({
        forecastModel: 'dwd_icon_eu',
        forecastModelNear: 'ecmwf_ifs025',
      }).success,
    ).toBe(false);
  });

  // Der Wächter, der eine kaputte Id nicht in einen Deploy kommen lässt.
  it('die echte seeding/data/config.json erfüllt das Schema', () => {
    const parsed = ParamsSchema.safeParse(CONFIG_JSON.parameters);
    if (!parsed.success) console.error(parsed.error.issues);
    expect(parsed.success).toBe(true);
  });
});
