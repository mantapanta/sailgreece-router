import { describe, expect, it } from 'vitest';
import { placeNightAmpel, sectorContains, waveHourAmpel, windHourAmpel } from '../ampel.ts';
import { DEFAULT_PARAMS } from '../schema/params.ts';
import {
  constantForecast,
  makePlace,
  makeSnapshot,
  makeTimes,
} from './fixtures.ts';

const params = DEFAULT_PARAMS;

describe('sector semantics (AD-4/AD-6): CW wrap over north, inclusive bounds', () => {
  const northSector = { fromDeg: 330, toDeg: 60 };

  it('north-wrap sector 330-60 contains wind from 10 deg', () => {
    expect(sectorContains(northSector, 10)).toBe(true);
  });

  it('contains the inclusive boundaries 330 and 60', () => {
    expect(sectorContains(northSector, 330)).toBe(true);
    expect(sectorContains(northSector, 60)).toBe(true);
    expect(sectorContains(northSector, 0)).toBe(true);
    expect(sectorContains(northSector, 360)).toBe(true);
  });

  it('does not contain directions outside the wrap', () => {
    expect(sectorContains(northSector, 180)).toBe(false);
    expect(sectorContains(northSector, 329)).toBe(false);
    expect(sectorContains(northSector, 61)).toBe(false);
  });

  it('non-wrapping sector works normally', () => {
    expect(sectorContains({ fromDeg: 90, toDeg: 180 }, 135)).toBe(true);
    expect(sectorContains({ fromDeg: 90, toDeg: 180 }, 200)).toBe(false);
  });

  it('full-circle sector 0-360 contains every direction (all-round shelter)', () => {
    for (const d of [0, 15, 90, 180, 270, 359.9]) {
      expect(sectorContains({ fromDeg: 0, toDeg: 360 }, d)).toBe(true);
    }
  });
});

describe('wind hour verdict (FR8)', () => {
  const sectors = [{ fromDeg: 330, toDeg: 60, maxKn: 30 }];

  it('protected sector + wind inside limit => gruen', () => {
    expect(windHourAmpel(sectors, 10, 20, params)).toBe('gruen');
  });

  it('protected sector + wind inside the yellow reserve => gelb', () => {
    expect(windHourAmpel(sectors, 10, 29, params)).toBe('gelb');
  });

  it('protected sector + wind above limit => rot', () => {
    expect(windHourAmpel(sectors, 10, 35, params)).toBe('rot');
  });

  it('unprotected direction (luv) is never gruen: calm => gelb, strong => rot', () => {
    expect(windHourAmpel(sectors, 180, 5, params)).toBe('gelb');
    expect(windHourAmpel(sectors, 180, 25, params)).toBe('rot');
  });

  it('DECISION fixture: overlapping sectors => the MOST GENEROUS limit wins (Math.max)', () => {
    const overlapping = [
      { fromDeg: 0, toDeg: 180, maxKn: 20 },
      { fromDeg: 90, toDeg: 270, maxKn: 30 },
    ];
    // Wind from 120 deg lies in BOTH sectors: limit 30 governs, so 25 kn is
    // still gruen (25 <= 30 - gelbReserve 3) although sector 1 alone caps 20.
    expect(windHourAmpel(overlapping, 120, 25, params)).toBe('gruen');
    expect(windHourAmpel(overlapping, 120, 29, params)).toBe('gelb');
    expect(windHourAmpel(overlapping, 120, 31, params)).toBe('rot');
  });
});

describe('wave hour verdict (FR8) — DECISION: no yellow reserve band for waves', () => {
  const waveSectors = [{ fromDeg: 330, toDeg: 60, maxM: 1.5 }];

  it('protected sector: gruen up to the limit (inclusive), rot directly above — no gelb band', () => {
    expect(waveHourAmpel(waveSectors, 10, 1.5, params)).toBe('gruen');
    expect(waveHourAmpel(waveSectors, 10, 1.6, params)).toBe('rot');
  });

  it('unprotected wave direction: gelb only in near-calm, rot above', () => {
    expect(waveHourAmpel(waveSectors, 180, 0.4, params)).toBe('gelb');
    expect(waveHourAmpel(waveSectors, 180, 0.8, params)).toBe('rot');
  });
});

describe('place night ampel — reference cases (AD-2/AD-6)', () => {
  // Meltemi: 25 kn from due north over the whole axis.
  const times = makeTimes();
  const meltemi = constantForecast(times.length, 25, 0, 0.4, 0);

  it('Meltemi from N, bay open to the SOUTH (protected from N) => gruen', () => {
    // Open to the south = shelter sectors cover everything except south.
    const bay = makePlace({
      id: 'testinsel-suedbucht',
      shelter: {
        windSectors: [{ fromDeg: 250, toDeg: 110, maxKn: 40 }],
        waveSectors: [{ fromDeg: 250, toDeg: 110, maxM: 1.5 }],
        sourceNote: 'fixture',
      },
    });
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: meltemi },
      library: { islands: [], places: [bay], invalidPlaces: [], routes: [] },
    });
    expect(placeNightAmpel(bay, 1, snapshot).ampel).toBe('gruen');
  });

  // The very same green case, but the curation is disputed. Regression guard:
  // `confidence` used to be a documentation-only field, so a place the review
  // had flagged as doubtful still went green on a favourable forecast.
  it('confidence niedrig caps an otherwise green night at gelb', () => {
    const bay = makePlace({
      id: 'testinsel-strittig',
      confidence: 'niedrig',
      shelter: {
        windSectors: [{ fromDeg: 250, toDeg: 110, maxKn: 40 }],
        waveSectors: [{ fromDeg: 250, toDeg: 110, maxM: 1.5 }],
        sourceNote: 'fixture',
      },
    });
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: meltemi },
      library: { islands: [], places: [bay], invalidPlaces: [], routes: [] },
    });
    const result = placeNightAmpel(bay, 1, snapshot);
    expect(result.ampel).toBe('gelb');
    expect(result.reasons.join(' ')).toMatch(/Kuratierung unsicher/);
  });

  it('confidence mittel and hoch leave a green night green', () => {
    for (const confidence of ['mittel', 'hoch'] as const) {
      const bay = makePlace({
        id: `testinsel-${confidence}`,
        confidence,
        shelter: {
          windSectors: [{ fromDeg: 250, toDeg: 110, maxKn: 40 }],
          waveSectors: [{ fromDeg: 250, toDeg: 110, maxM: 1.5 }],
          sourceNote: 'fixture',
        },
      });
      const snapshot = makeSnapshot({
        times,
        forecast: { [bay.id]: meltemi },
        library: { islands: [], places: [bay], invalidPlaces: [], routes: [] },
      });
      expect(placeNightAmpel(bay, 1, snapshot).ampel).toBe('gruen');
    }
  });

  it('a missing confidence field changes nothing (most of the library has none)', () => {
    const bay = makePlace({
      id: 'testinsel-ohne-confidence',
      shelter: {
        windSectors: [{ fromDeg: 250, toDeg: 110, maxKn: 40 }],
        waveSectors: [{ fromDeg: 250, toDeg: 110, maxM: 1.5 }],
        sourceNote: 'fixture',
      },
    });
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: meltemi },
      library: { islands: [], places: [bay], invalidPlaces: [], routes: [] },
    });
    expect(bay.confidence).toBeUndefined();
    expect(placeNightAmpel(bay, 1, snapshot).ampel).toBe('gruen');
  });

  it('confidence niedrig does not upgrade a red night to gelb', () => {
    const bay = makePlace({
      id: 'testinsel-strittig-nordbucht',
      confidence: 'niedrig',
      shelter: {
        windSectors: [{ fromDeg: 90, toDeg: 270, maxKn: 40 }],
        waveSectors: [{ fromDeg: 90, toDeg: 270, maxM: 1.5 }],
        sourceNote: 'fixture',
      },
    });
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: meltemi },
      library: { islands: [], places: [bay], invalidPlaces: [], routes: [] },
    });
    expect(placeNightAmpel(bay, 1, snapshot).ampel).toBe('rot');
  });

  it('Meltemi from N, bay open to the NORTH => rot', () => {
    const bay = makePlace({
      id: 'testinsel-nordbucht',
      shelter: {
        windSectors: [{ fromDeg: 90, toDeg: 270, maxKn: 40 }],
        waveSectors: [{ fromDeg: 90, toDeg: 270, maxM: 1.5 }],
        sourceNote: 'fixture',
      },
    });
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: meltemi },
      library: { islands: [], places: [bay], invalidPlaces: [], routes: [] },
    });
    expect(placeNightAmpel(bay, 1, snapshot).ampel).toBe('rot');
  });

  it('north-wrap sector 330-60, wind from 10 deg => place counts as protected', () => {
    const bay = makePlace({
      id: 'testinsel-wrapbucht',
      shelter: {
        windSectors: [{ fromDeg: 330, toDeg: 60, maxKn: 35 }],
        waveSectors: [{ fromDeg: 330, toDeg: 60, maxM: 1.5 }],
        sourceNote: 'fixture',
      },
    });
    const wind10 = constantForecast(times.length, 22, 10, 0.4, 10);
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: wind10 },
      library: { islands: [], places: [bay], invalidPlaces: [], routes: [] },
    });
    expect(placeNightAmpel(bay, 1, snapshot).ampel).toBe('gruen');
  });

  it('null forecast hours (horizon) => unbewertet — never gruen, never hidden', () => {
    const bay = makePlace({ id: 'testinsel-horizont' });
    const gap = constantForecast(times.length, null, null, null, null);
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: gap },
      library: { islands: [], places: [bay], invalidPlaces: [], routes: [] },
    });
    const result = placeNightAmpel(bay, 1, snapshot);
    expect(result.ampel).toBe('unbewertet');
  });

  it('missing marine hours only => unbewertet (marine horizon < weather horizon)', () => {
    const bay = makePlace({ id: 'testinsel-marine' });
    const fc = constantForecast(times.length, 15, 0, null, null);
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: fc },
      library: { islands: [], places: [bay], invalidPlaces: [], routes: [] },
    });
    expect(placeNightAmpel(bay, 1, snapshot).ampel).toBe('unbewertet');
  });

  it('a red hour dominates missing hours: rot, not unbewertet', () => {
    const bay = makePlace({
      id: 'testinsel-mix',
      shelter: {
        windSectors: [{ fromDeg: 90, toDeg: 270, maxKn: 40 }],
        waveSectors: [{ fromDeg: 0, toDeg: 360, maxM: 2 }],
        sourceNote: 'fixture',
      },
    });
    const fc = constantForecast(times.length, 25, 0, 0.4, 0);
    // Punch horizon holes into the second half of the night window.
    for (let i = 25; i < times.length; i++) {
      fc.windKn[i] = null;
      fc.windDirDeg[i] = null;
    }
    const snapshot = makeSnapshot({
      times,
      forecast: { [bay.id]: fc },
      library: { islands: [], places: [bay], invalidPlaces: [], routes: [] },
    });
    expect(placeNightAmpel(bay, 1, snapshot).ampel).toBe('rot');
  });
});
