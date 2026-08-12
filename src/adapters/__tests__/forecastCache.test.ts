/**
 * Der gesicherte Forecast (adapters/forecastCache.ts). Geprüft wird genau das,
 * worauf sich der Skipper verlässt: dass der Stand vollständig zurückkommt,
 * dass er sein Alter mitbringt — und die drei Fälle, in denen er NICHT benutzt
 * werden darf.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ladeForecast, speichereForecast } from '../forecastCache.ts';
import type { ForecastBundle } from '../openMeteo.ts';
import type { PointForecast } from '../../domain/schema/snapshot.ts';

const T0 = Date.parse('2026-08-09T00:00:00Z');
const KEY = 'ecmwf_ifs025>dwd_icon_eu|best_match>ewam|10|abc123';

/** Ein Speicher wie im Browser, nur im Test — inklusive Quota-Fehler auf Wunsch. */
class TestStorage implements Storage {
  private map = new Map<string, string>();
  wirftBeimSchreiben = false;
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  setItem(k: string, v: string): void {
    if (this.wirftBeimSchreiben) {
      const e = new Error('QuotaExceededError');
      e.name = 'QuotaExceededError';
      throw e;
    }
    this.map.set(k, v);
  }
}

let store: TestStorage;
beforeEach(() => {
  store = new TestStorage();
  vi.stubGlobal('localStorage', store);
});
afterEach(() => vi.unstubAllGlobals());

function times(n: number, abIso = '2026-08-09T00:00:00Z'): string[] {
  const ab = Date.parse(abIso);
  return Array.from({ length: n }, (_, i) =>
    new Date(ab + i * 3600_000).toISOString().slice(0, 16) + 'Z',
  );
}

function punkt(n: number, wind: number, welle: number): PointForecast {
  return {
    windKn: Array.from({ length: n }, () => wind),
    windDirDeg: Array.from({ length: n }, () => 320),
    waveM: Array.from({ length: n }, () => welle),
    waveDirDeg: Array.from({ length: n }, () => 200),
    wavePeriodS: Array.from({ length: n }, () => 5.5),
    windAssumed: new Array<boolean>(n).fill(false),
    waveAssumed: new Array<boolean>(n).fill(false),
  };
}

function bundle(over: Partial<ForecastBundle> = {}): ForecastBundle {
  const n = 24;
  return {
    fetchedAtIso: '2026-08-09T06:00:00Z',
    modelRunIso: '2026-08-09T00:00:00Z',
    model: 'DWD ICON-EU 7 km + ECMWF IFS 0.25°',
    times: times(n),
    forecast: {
      a: punkt(n, 18, 1.2),
      b: punkt(n, 25, 2.4),
      // Gleiche Zelle wie 'a' — inhaltsgleich, wird einmal gespeichert.
      'leg:x:0': punkt(n, 18, 1.2),
    },
    ...over,
  };
}

/** Mitten in der Achse: der Stand ist alt, aber er reicht noch in die Zukunft. */
const jetzt = () => new Date(T0 + 6 * 3600_000);

describe('speichern und laden', () => {
  it('gibt jeden Ort vollständig zurück, mit Achse und Modellangabe', () => {
    speichereForecast(KEY, bundle());
    const geladen = ladeForecast(KEY, jetzt)!;

    expect(geladen.bundle.times).toHaveLength(24);
    expect(geladen.bundle.model).toBe('DWD ICON-EU 7 km + ECMWF IFS 0.25°');
    expect(geladen.bundle.modelRunIso).toBe('2026-08-09T00:00:00Z');
    expect(Object.keys(geladen.bundle.forecast).sort()).toEqual(['a', 'b', 'leg:x:0']);
    expect(geladen.bundle.forecast['a']!.windKn[0]).toBe(18);
    expect(geladen.bundle.forecast['b']!.windKn[0]).toBe(25);
    expect(geladen.bundle.forecast['b']!.waveM[3]).toBe(2.4);
  });

  it('bringt sein Alter mit — nichts wird frischer gemacht als es ist', () => {
    speichereForecast(KEY, bundle());
    const geladen = ladeForecast(KEY, jetzt)!;
    expect(geladen.bundle.fetchedAtIso).toBe('2026-08-09T06:00:00Z');
    expect(geladen.updatedAtMs).toBe(Date.parse('2026-08-09T06:00:00Z'));
  });

  it('legt inhaltsgleiche Reihen nur EINMAL ab (sonst passt es nicht in die Quota)', () => {
    speichereForecast(KEY, bundle());
    const roh = JSON.parse(store.getItem('sailgreece.forecast.v1')!) as {
      reihen: unknown[];
      orte: Record<string, number>;
    };
    expect(roh.reihen).toHaveLength(2); // a und leg:x:0 teilen sich eine Reihe
    expect(roh.orte['a']).toBe(roh.orte['leg:x:0']);
    expect(roh.orte['b']).not.toBe(roh.orte['a']);
  });

  it('gibt trotzdem je Ort EIGENE Arrays zurück — kein geteilter Speicher', () => {
    speichereForecast(KEY, bundle());
    const f = ladeForecast(KEY, jetzt)!.bundle.forecast;
    expect(f['leg:x:0']!.windKn).toEqual(f['a']!.windKn);
    expect(f['leg:x:0']!.windKn).not.toBe(f['a']!.windKn);
  });

  it('trägt Lücken als Lücken zurück, nie als Zahl', () => {
    const b = bundle();
    b.forecast['a']!.windKn[2] = null;
    b.forecast['a']!.waveM[3] = null;
    speichereForecast(KEY, b);
    const a = ladeForecast(KEY, jetzt)!.bundle.forecast['a']!;
    expect(a.windKn[2]).toBeNull();
    expect(a.waveM[3]).toBeNull();
    expect(a.windKn[1]).toBe(18);
  });

  it('meldet keine Annahme — die macht erst die Domäne (persistence.ts)', () => {
    speichereForecast(KEY, bundle());
    const a = ladeForecast(KEY, jetzt)!.bundle.forecast['a']!;
    expect(a.windAssumed.every((v) => v === false)).toBe(true);
    expect(a.waveAssumed.every((v) => v === false)).toBe(true);
    expect(a.windAssumed).toHaveLength(24);
  });
});

describe('wann der Stand NICHT benutzt wird', () => {
  it('anderer Schlüssel — andere Modelle oder andere Ortsmenge', () => {
    speichereForecast(KEY, bundle());
    expect(ladeForecast('anderer|schluessel', jetzt)).toBeNull();
    // Nicht verworfen: er kann wieder passen, wenn die Parameter zurückgestellt werden.
    expect(store.getItem('sailgreece.forecast.v1')).not.toBeNull();
  });

  it('Achse ganz in der Vergangenheit — er sagt über heute nichts mehr', () => {
    speichereForecast(KEY, bundle());
    const spaeter = () => new Date(T0 + 48 * 3600_000);
    expect(ladeForecast(KEY, spaeter)).toBeNull();
    // Und er wird weggeräumt: er wird nie wieder gültig.
    expect(store.getItem('sailgreece.forecast.v1')).toBeNull();
  });

  it('unlesbarer Eintrag — still verwerfen, kein Fehlerpanel', () => {
    store.setItem('sailgreece.forecast.v1', '{kaputt');
    expect(ladeForecast(KEY, jetzt)).toBeNull();
    expect(store.getItem('sailgreece.forecast.v1')).toBeNull();
  });

  it('Eintrag aus einer älteren Version — verwerfen statt abstürzen', () => {
    store.setItem('sailgreece.forecast.v1', JSON.stringify({ key: KEY, forecast: {} }));
    expect(() => ladeForecast(KEY, jetzt)).not.toThrow();
    expect(ladeForecast(KEY, jetzt)).toBeNull();
  });

  it('leeres Bundle wird gar nicht erst gesichert (OHNE_FORECAST)', () => {
    speichereForecast(KEY, bundle({ times: [], forecast: {} }));
    expect(store.getItem('sailgreece.forecast.v1')).toBeNull();
  });
});

describe('wenn der Speicher nicht mitspielt', () => {
  it('volle Quota bleibt folgenlos — der Speicher ist Bequemlichkeit, kein Vertrag', () => {
    store.wirftBeimSchreiben = true;
    expect(() => speichereForecast(KEY, bundle())).not.toThrow();
    expect(ladeForecast(KEY, jetzt)).toBeNull();
  });

  it('gar kein localStorage (Privatmodus) bleibt folgenlos', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => speichereForecast(KEY, bundle())).not.toThrow();
    expect(ladeForecast(KEY, jetzt)).toBeNull();
  });
});
