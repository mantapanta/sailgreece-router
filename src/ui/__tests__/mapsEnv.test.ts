import { describe, expect, it } from 'vitest';
import { resolveMapsEnv } from '../mapsEnv.ts';

/**
 * Story 1.3, AC 9: fehlende Maps-Konfiguration ist ein BENANNTER Fehler —
 * kein stiller Demo-Map-Fallback. Die Views nennen exakt die Variablen,
 * die fehlen, in .env-Reihenfolge.
 */
describe('resolveMapsEnv — benannte Konfigurationsfehler statt Demo-Fallback', () => {
  it('liefert beide Werte getrimmt, wenn beide gesetzt sind', () => {
    expect(resolveMapsEnv(' key-123 ', 'map-abc')).toEqual({
      ok: true,
      env: { apiKey: 'key-123', mapId: 'map-abc' },
    });
  });

  it('nennt den fehlenden API-Key beim Namen', () => {
    expect(resolveMapsEnv(undefined, 'map-abc')).toEqual({
      ok: false,
      missing: ['VITE_GOOGLE_MAPS_API_KEY'],
    });
  });

  it('nennt die fehlende Map-ID beim Namen', () => {
    expect(resolveMapsEnv('key-123', undefined)).toEqual({
      ok: false,
      missing: ['VITE_GOOGLE_MAPS_MAP_ID'],
    });
  });

  it('nennt BEIDE, wenn beide fehlen — in .env-Reihenfolge', () => {
    expect(resolveMapsEnv(undefined, undefined)).toEqual({
      ok: false,
      missing: ['VITE_GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_MAP_ID'],
    });
  });

  it('behandelt Nur-Whitespace-Werte als fehlend (Trim-Regel)', () => {
    expect(resolveMapsEnv('   ', '')).toEqual({
      ok: false,
      missing: ['VITE_GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_MAP_ID'],
    });
    expect(resolveMapsEnv('key-123', '  ')).toEqual({
      ok: false,
      missing: ['VITE_GOOGLE_MAPS_MAP_ID'],
    });
  });
});
