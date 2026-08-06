import { describe, expect, it } from 'vitest';
import { nightVerdictLine, nightWindowLabel, sectorTiles } from '../placeViewModel.ts';
import { DEFAULT_PARAMS } from '../../domain/schema/params.ts';
import type { ShelterProfile } from '../../domain/schema/shelter.ts';
import type { PlaceNightAssessment } from '../../domain/schema/snapshot.ts';

/**
 * Die Kachel-Bewertung IST die Domänen-Funktion windHourAmpel, geprobt am
 * Meltemi-Worst-Case der Planung (DEFAULT_PARAMS: 30 kn, Reserve 3 kn) —
 * die Tests prüfen deshalb genau die Grenzen, die die Domain zieht, nicht
 * eigene Schwellen.
 */

function shelter(overrides: Partial<ShelterProfile>): ShelterProfile {
  return {
    windSectors: [{ fromDeg: 0, toDeg: 360, maxKn: 40 }],
    waveSectors: [{ fromDeg: 0, toDeg: 360, maxM: 0.5 }],
    sourceNote: 'Test',
    ...overrides,
  };
}

describe('sectorTiles — 8 Richtungen, Bewertung durch windHourAmpel am Worst-Case', () => {
  it('liefert 8 Kacheln in Kompass-Reihenfolge N → NW (internationale Notation)', () => {
    const tiles = sectorTiles(shelter({}), DEFAULT_PARAMS);
    expect(tiles.map((t) => t.dir)).toEqual(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
    expect(tiles.map((t) => t.centerDeg)).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  });

  it('Wrap-Sektor 330–60 deckt N (0°), aber nicht E (90°)', () => {
    const s = shelter({ windSectors: [{ fromDeg: 330, toDeg: 60, maxKn: 35 }] });
    const tiles = sectorTiles(s, DEFAULT_PARAMS);
    const n = tiles.find((t) => t.dir === 'N')!;
    const e = tiles.find((t) => t.dir === 'E')!;
    expect(n.limitKn).toBe(35);
    expect(n.rating).toBe('gut');
    expect(e.limitKn).toBeNull();
    expect(e.rating).toBe('offen');
  });

  it('Vollkreis 0–360 deckt alle 8 Richtungen', () => {
    const s = shelter({ windSectors: [{ fromDeg: 0, toDeg: 360, maxKn: 35 }] });
    const tiles = sectorTiles(s, DEFAULT_PARAMS);
    expect(tiles.every((t) => t.limitKn === 35)).toBe(true);
    expect(tiles.every((t) => t.rating === 'gut')).toBe(true);
  });

  it('ungedeckte Richtung → offen mit limitKn null (Luv-Regel, nie vom Probe-Wind abhängig)', () => {
    const s = shelter({ windSectors: [{ fromDeg: 350, toDeg: 10, maxKn: 40 }] });
    const tiles = sectorTiles(s, DEFAULT_PARAMS);
    const south = tiles.find((t) => t.dir === 'S')!;
    expect(south.rating).toBe('offen');
    expect(south.limitKn).toBeNull();
  });

  it('Grenze 35 → gut (Worst-Case 30 hält die Reserve)', () => {
    const s = shelter({ windSectors: [{ fromDeg: 0, toDeg: 360, maxKn: 35 }] });
    expect(sectorTiles(s, DEFAULT_PARAMS)[0]!.rating).toBe('gut');
  });

  it('Grenze 33 → gut (Grün-Grenzfall: 30 ≤ 33 − Reserve 3)', () => {
    const s = shelter({ windSectors: [{ fromDeg: 0, toDeg: 360, maxKn: 33 }] });
    expect(sectorTiles(s, DEFAULT_PARAMS)[0]!.rating).toBe('gut');
  });

  it('Grenze 30 → mäßig (Worst-Case erreicht die Grenze, keine Reserve mehr)', () => {
    const s = shelter({ windSectors: [{ fromDeg: 0, toDeg: 360, maxKn: 30 }] });
    expect(sectorTiles(s, DEFAULT_PARAMS)[0]!.rating).toBe('maessig');
  });

  it('Grenze 20 → schwach (kuratierte Grenze unter dem Worst-Case — das Rot der Domain)', () => {
    const s = shelter({ windSectors: [{ fromDeg: 0, toDeg: 360, maxKn: 20 }] });
    const tile = sectorTiles(s, DEFAULT_PARAMS)[0]!;
    expect(tile.rating).toBe('schwach');
    expect(tile.limitKn).toBe(20);
  });

  it('überlappende Wind-Sektoren: die großzügigste Grenze gewinnt (Domain-Entscheidung)', () => {
    const s = shelter({
      windSectors: [
        { fromDeg: 0, toDeg: 360, maxKn: 20 },
        { fromDeg: 350, toDeg: 10, maxKn: 35 },
      ],
    });
    const tiles = sectorTiles(s, DEFAULT_PARAMS);
    expect(tiles.find((t) => t.dir === 'N')!.limitKn).toBe(35);
    expect(tiles.find((t) => t.dir === 'N')!.rating).toBe('gut');
    expect(tiles.find((t) => t.dir === 'S')!.limitKn).toBe(20);
  });

  it('Wellen-Grenze: Sektor-Lookup gedeckt/ungedeckt, Überlappung großzügigste gewinnt', () => {
    const s = shelter({
      waveSectors: [
        { fromDeg: 330, toDeg: 60, maxM: 0.4 },
        { fromDeg: 350, toDeg: 10, maxM: 0.8 },
      ],
    });
    const tiles = sectorTiles(s, DEFAULT_PARAMS);
    expect(tiles.find((t) => t.dir === 'N')!.waveMaxM).toBe(0.8);
    expect(tiles.find((t) => t.dir === 'NE')!.waveMaxM).toBe(0.4);
    expect(tiles.find((t) => t.dir === 'S')!.waveMaxM).toBeNull();
  });
});

describe('nightWindowLabel — das echte AD-9-Fenster aus den Params, nullgepolstert', () => {
  it('formatiert 18/9 als "18:00–09:00"', () => {
    expect(nightWindowLabel(18, 9)).toBe('18:00–09:00');
  });

  it('polstert auch die Startstunde (8/6 → "08:00–06:00")', () => {
    expect(nightWindowLabel(8, 6)).toBe('08:00–06:00');
  });
});

describe('nightVerdictLine — Wort zuerst, dann der Grund', () => {
  const night = (
    ampel: PlaceNightAssessment['ampel'],
    reasons: string[],
  ): PlaceNightAssessment => ({
    placeId: 'p1',
    nightDay: 1,
    ampel,
    maxWindKn: 20,
    windDirDeg: 0,
    maxWaveM: 0.5,
    basis: 'forecast',
    reasons,
  });

  it('reicht den ersten Grund der Bewertung durch', () => {
    const v = nightVerdictLine(night('gelb', ['Wind 28 kn aus N in der Reserve', 'zweiter Grund']));
    expect(v.ampel).toBe('gelb');
    expect(v.text).toBe('Wind 28 kn aus N in der Reserve');
  });

  it('grün ohne Gründe → faktischer Fallback', () => {
    const v = nightVerdictLine(night('gruen', []));
    expect(v.ampel).toBe('gruen');
    expect(v.text).toBe('Wind der Nacht innerhalb der Schutzsektoren');
  });

  it('unbewertet ohne Gründe → "keine Bewertung für diese Nacht"', () => {
    const v = nightVerdictLine(night('unbewertet', []));
    expect(v.ampel).toBe('unbewertet');
    expect(v.text).toBe('keine Bewertung für diese Nacht');
  });

  it('fehlende Nacht (undefined) → unbewertet mit Fallback', () => {
    const v = nightVerdictLine(undefined);
    expect(v.ampel).toBe('unbewertet');
    expect(v.text).toBe('keine Bewertung für diese Nacht');
  });
});
