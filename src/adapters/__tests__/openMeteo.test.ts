/**
 * Erster Adapter-Test des Repos. Er nagelt drei Dinge fest, die vorher
 * ungetestet waren und still falsch sein konnten:
 *  - die ZUORDNUNG Antwort-Array -> Ort (Open-Meteo antwortet bei n>1 mit einem
 *    Array; wer es je Modell statt je Ort liest, verrutscht lautlos),
 *  - die Degradation der Nah-Anfragen (Fehler darf nie durchschlagen),
 *  - dass der Fern-Wind das EINZIGE Fundament ist.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { aufModellgitter, fetchForecastBundle, OpenMeteoError } from '../openMeteo.ts';
import { DEFAULT_PARAMS } from '../../domain/schema/params.ts';
import type { Library } from '../../domain/schema/snapshot.ts';
import type { Params } from '../../domain/schema/params.ts';

const T0 = Date.parse('2026-08-08T00:00:00Z');

/** Achse OHNE Z-Suffix — genau so liefert Open-Meteo sie. */
function apiTimes(hours: number, offsetH = 0): string[] {
  return Array.from({ length: hours }, (_, i) =>
    new Date(T0 + (offsetH + i) * 3600_000).toISOString().slice(0, 16),
  );
}

const windResp = (hours: number, spd: number, dir: number, offsetH = 0) => ({
  hourly: {
    time: apiTimes(hours, offsetH),
    wind_speed_10m: Array.from({ length: hours }, () => spd),
    wind_direction_10m: Array.from({ length: hours }, () => dir),
  },
});

const waveResp = (hours: number, h: number, dir = 200) => ({
  hourly: {
    time: apiTimes(hours),
    wave_height: Array.from({ length: hours }, () => h),
    wave_direction: Array.from({ length: hours }, () => dir),
    wave_period: Array.from({ length: hours }, () => 5),
  },
});

/** Zwei Orte -> Open-Meteo antwortet als Array. */
const library: Library = {
  islands: [],
  places: [
    { id: 'a', coordinates: { lat: 37.4, lon: 25.3 } },
    { id: 'b', coordinates: { lat: 36.9, lon: 25.1 } },
  ] as unknown as Library['places'],
  invalidPlaces: [],
  legs: [],
  variants: [],
};

const params: Params = { ...DEFAULT_PARAMS, forecastDays: 2 };
const now = () => new Date('2026-08-07T12:00:00Z');

interface Route {
  windFar?: unknown;
  windNear?: unknown;
  waveFar?: unknown;
  waveNear?: unknown;
}

const calls: string[] = [];

/**
 * Ein fetch-Stub, der auf der URL unterscheidet. Ein Wert vom Typ Error wird
 * als abgelehnte Anfrage behandelt.
 */
function stubFetch(route: Route): void {
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('/static/meta.json')) {
        return {
          ok: true,
          json: async () => ({ last_run_initialisation_time: T0 / 1000 }),
        } as unknown as Response;
      }
      const marine = url.includes('marine-api');
      const near = marine
        ? url.includes(`models=${params.waveModelNear}`)
        : url.includes(`models=${params.forecastModelNear}`);
      const key: keyof Route = marine
        ? near
          ? 'waveNear'
          : 'waveFar'
        : near
          ? 'windNear'
          : 'windFar';
      const body = route[key];
      if (body instanceof Error) throw body;
      if (body === undefined) throw new Error(`unerwarteter Abruf: ${url}`);
      return { ok: true, json: async () => body } as unknown as Response;
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchForecastBundle — Nahfeld/Fernfeld', () => {
  it('ruft vier Datenmodelle getrennt ab, je Anfrage GENAU EIN models=', async () => {
    stubFetch({
      windFar: [windResp(48, 12, 350), windResp(48, 12, 350)],
      windNear: [windResp(24, 22, 10), windResp(24, 22, 10)],
      waveFar: [waveResp(48, 1.0), waveResp(48, 1.0)],
      waveNear: [waveResp(24, 1.8, 20), waveResp(24, 1.8, 20)],
    });
    await fetchForecastBundle(library, params, now);

    const data = calls.filter((u) => !u.includes('meta.json'));
    expect(data).toHaveLength(4);
    for (const u of data) {
      // Mehr als ein Modell in einem Call ⇒ Open-Meteo antwortet je MODELL und
      // die Ortszuordnung verrutscht stumm. Darf nie passieren.
      expect(u.match(/models=/g)).toHaveLength(1);
      expect(u).not.toMatch(/models=[^&]*(,|%2C)/);
    }
    expect(data.some((u) => u.includes('models=ecmwf_ifs025'))).toBe(true);
    expect(data.some((u) => u.includes('models=dwd_icon_eu'))).toBe(true);
    expect(data.some((u) => u.includes('models=best_match'))).toBe(true);
    expect(data.some((u) => u.includes('models=ewam'))).toBe(true);
  });

  it('begrenzt die Nah-Anfragen auf die native Modelllänge, nie darüber', async () => {
    stubFetch({
      windFar: [windResp(24, 12, 350), windResp(24, 12, 350)],
      windNear: [windResp(24, 22, 10), windResp(24, 22, 10)],
      waveFar: [waveResp(24, 1.0), waveResp(24, 1.0)],
      waveNear: [waveResp(24, 1.8, 20), waveResp(24, 1.8, 20)],
    });
    // forecastDays: 10 gegen ICON-EU (120 h = 5 d) und EWAM (79 h = 4 d).
    await fetchForecastBundle(library, { ...params, forecastDays: 10 }, now);
    const near = calls.filter((u) => u.includes('models=dwd_icon_eu'))[0]!;
    const wave = calls.filter((u) => u.includes('models=ewam'))[0]!;
    const far = calls.filter((u) => u.includes('models=ecmwf_ifs025'))[0]!;
    expect(near).toContain('forecast_days=5');
    expect(wave).toContain('forecast_days=4');
    expect(far).toContain('forecast_days=10');
  });

  it('verschmilzt Nahfeld vorne, Fernfeld hinten — je Ort richtig zugeordnet', async () => {
    stubFetch({
      windFar: [windResp(48, 12, 350), windResp(48, 13, 340)],
      windNear: [windResp(24, 22, 10), windResp(24, 23, 20)],
      waveFar: [waveResp(48, 1.0, 200), waveResp(48, 1.1, 210)],
      waveNear: [waveResp(24, 1.8, 20), waveResp(24, 1.9, 30)],
    });
    const b = await fetchForecastBundle(library, params, now);

    expect(b.times).toHaveLength(48);
    expect(b.times[0]).toBe('2026-08-08T00:00Z');

    const a = b.forecast['a']!;
    expect(a.windKn[0]).toBe(22);
    expect(a.windKn[23]).toBe(22);
    expect(a.windKn[24]).toBe(12); // Naht: harter Schnitt
    expect(a.windDirDeg[23]).toBe(10);
    expect(a.windDirDeg[24]).toBe(350);
    expect(a.waveM[0]).toBe(1.8);
    expect(a.waveM[24]).toBe(1.0);

    // Ort b muss SEINE Werte haben, nicht die von a.
    const bb = b.forecast['b']!;
    expect(bb.windKn[0]).toBe(23);
    expect(bb.windKn[24]).toBe(13);
    expect(bb.waveM[0]).toBe(1.9);

    expect(b.provenance!.wind.nearReachHours).toBe(24);
    expect(b.provenance!.wind.near).toBe('dwd_icon_eu');
    expect(b.provenance!.wave.nearReachHours).toBe(24);
    expect(b.model).toBe('DWD ICON-EU 7 km + ECMWF IFS 0.25°');
  });

  it('nimmt die Achse vom FERNFELD, auch wenn das Nahfeld versetzt ist', async () => {
    stubFetch({
      windFar: [windResp(48, 12, 350), windResp(48, 12, 350)],
      // Nahfeld beginnt 6 h später — darf die Achse nicht verschieben.
      windNear: [windResp(12, 22, 10, 6), windResp(12, 22, 10, 6)],
      waveFar: [waveResp(48, 1.0), waveResp(48, 1.0)],
      waveNear: [waveResp(24, 1.8, 20), waveResp(24, 1.8, 20)],
    });
    const b = await fetchForecastBundle(library, params, now);
    expect(b.times).toHaveLength(48);
    const a = b.forecast['a']!;
    expect(a.windKn.slice(0, 6)).toEqual([12, 12, 12, 12, 12, 12]);
    expect(a.windKn.slice(6, 18)).toEqual(Array(12).fill(22));
    expect(a.windKn[18]).toBe(12);
    expect(b.provenance!.wind.nearReachHours).toBe(18);
  });

  // --- DEGRADATION ---------------------------------------------------------
  it('scheitert die NAH-Windanfrage, ist das Ergebnis das reine Fernfeld', async () => {
    stubFetch({
      windFar: [windResp(48, 12, 350), windResp(48, 12, 350)],
      windNear: new Error('429'),
      waveFar: [waveResp(48, 1.0), waveResp(48, 1.0)],
      waveNear: [waveResp(24, 1.8, 20), waveResp(24, 1.8, 20)],
    });
    const b = await fetchForecastBundle(library, params, now);
    expect(b.forecast['a']!.windKn.every((v) => v === 12)).toBe(true);
    expect(b.provenance!.wind.near).toBeNull();
    expect(b.provenance!.wind.nearReachHours).toBe(0);
    // Die Fusszeile darf keine Auflösung behaupten, die nicht in den Zahlen ist.
    expect(b.model).toBe('ECMWF IFS 0.25°');
  });

  it('scheitert die FERN-Windanfrage, ist das ein OpenMeteoError (Fundament)', async () => {
    stubFetch({
      windFar: new Error('down'),
      windNear: [windResp(24, 22, 10), windResp(24, 22, 10)],
      waveFar: [waveResp(48, 1.0), waveResp(48, 1.0)],
      waveNear: [waveResp(24, 1.8, 20), waveResp(24, 1.8, 20)],
    });
    await expect(fetchForecastBundle(library, params, now)).rejects.toThrow(
      OpenMeteoError,
    );
  });

  it('scheitern BEIDE Wellenanfragen, bleibt der Wind unberührt', async () => {
    stubFetch({
      windFar: [windResp(48, 12, 350), windResp(48, 12, 350)],
      windNear: [windResp(24, 22, 10), windResp(24, 22, 10)],
      waveFar: new Error('down'),
      waveNear: new Error('down'),
    });
    const b = await fetchForecastBundle(library, params, now);
    expect(b.forecast['a']!.windKn[0]).toBe(22);
    expect(b.forecast['a']!.waveM.every((v) => v === null)).toBe(true);
    expect(b.provenance!.wave.near).toBeNull();
  });

  it('leeres *Near schaltet den Hybrid ab: nur zwei Datenabrufe', async () => {
    stubFetch({
      windFar: [windResp(48, 12, 350), windResp(48, 12, 350)],
      waveFar: [waveResp(48, 1.0), waveResp(48, 1.0)],
    });
    const b = await fetchForecastBundle(
      library,
      { ...params, forecastModelNear: '', waveModelNear: '' },
      now,
    );
    expect(calls.filter((u) => !u.includes('meta.json'))).toHaveLength(2);
    expect(b.forecast['a']!.windKn.every((v) => v === 12)).toBe(true);
    expect(b.model).toBe('ECMWF IFS 0.25°');
  });

  it('holt KEIN meta.json für Modelle ohne metaPath (Wellen-Aliase)', async () => {
    stubFetch({
      windFar: [windResp(24, 12, 350), windResp(24, 12, 350)],
      windNear: [windResp(24, 22, 10), windResp(24, 22, 10)],
      waveFar: [waveResp(24, 1.0), waveResp(24, 1.0)],
      waveNear: [waveResp(24, 1.8, 20), waveResp(24, 1.8, 20)],
    });
    await fetchForecastBundle(library, params, now);
    const meta = calls.filter((u) => u.includes('meta.json'));
    expect(meta).toHaveLength(2); // nur Fern- und Nah-WIND
    expect(meta.some((u) => u.includes('ewam'))).toBe(false);
    expect(meta.some((u) => u.includes('best_match'))).toBe(false);
  });

  /**
   * Der Speicher (adapters/forecastCache.ts) legt die Annahme-Markierungen NICHT
   * ab, sondern setzt sie beim Lesen auf false — weil der Adapter nur Fakten
   * liefert und die Fortschreibung erst danach in der Domäne passiert
   * (domain/persistence.ts). Fiele diese Zusage, würde der Speicher stumm eine
   * Annahme verschlucken. Deshalb steht sie hier als Test.
   */
  it('liefert NUR Fakten: keine Stunde ist als Annahme markiert', async () => {
    stubFetch({
      windFar: [windResp(48, 12, 350), windResp(48, 12, 350)],
      windNear: [windResp(24, 22, 10), windResp(24, 22, 10)],
      waveFar: [waveResp(24, 1.0), waveResp(24, 1.0)],
      waveNear: [waveResp(24, 1.8, 20), waveResp(24, 1.8, 20)],
    });
    const b = await fetchForecastBundle(library, params, now);
    for (const fc of Object.values(b.forecast)) {
      expect(fc.windAssumed.every((v) => v === false)).toBe(true);
      expect(fc.waveAssumed.every((v) => v === false)).toBe(true);
      expect(fc.windAdjusted).toBeUndefined();
    }
  });

  it('nennt eine unbekannte Modell-Id im Fehler statt leer zu liefern', async () => {
    stubFetch({});
    await expect(
      fetchForecastBundle(library, { ...params, forecastModel: 'icon_eu' }, now),
    ).rejects.toThrow(/icon_eu/);
    // Kein einziger Abruf — der Fehler kommt vor dem Netz.
    expect(calls).toHaveLength(0);
  });
});

/**
 * RATENLIMIT UND MODELLGITTER (2026-08-09, Skipper: "HTTP 429, in der App
 * erscheint immer unbewertet").
 *
 * Open-Meteo gewichtet nach Orten × Variablen × Tagen. Die beiden Tests-Blöcke
 * hier nageln die zwei Antworten darauf fest: weniger fragen (Rasterung auf das
 * Modellgitter) und den 429 als das behandeln, was er ist — ein Kontingent, das
 * sich von selbst füllt, kein Ausfall.
 */
describe('Rasterung auf das Modellgitter', () => {
  it('legt Orte im selben Gitterfeld zusammen, erster Ort vertritt die Zelle', () => {
    const orte = [
      { key: 'platz', coordinates: { lat: 37.4, lon: 25.3 } },
      { key: 'leg:x:0', coordinates: { lat: 37.4003, lon: 25.3004 } }, // ~40 m
      { key: 'fern', coordinates: { lat: 36.9, lon: 25.1 } },
    ];
    const g = aufModellgitter(orte, 0.125);
    expect(g.orte.map((o) => o.key)).toEqual(['platz', 'fern']);
    // Der Wegpunkt liest die Reihe des Platzes, nicht umgekehrt.
    expect(g.vertreterIndex).toEqual([0, 0, 1]);
  });

  it('ohne Raster vertritt jeder Ort sich selbst (unbekanntes Modell)', () => {
    const orte = [
      { key: 'a', coordinates: { lat: 37.4, lon: 25.3 } },
      { key: 'b', coordinates: { lat: 37.4001, lon: 25.3001 } },
    ];
    const g = aufModellgitter(orte, 0);
    expect(g.orte).toHaveLength(2);
    expect(g.vertreterIndex).toEqual([0, 1]);
  });

  it('fragt einen Wegpunkt neben dem Platz NICHT zweimal ab — und füllt ihn doch', async () => {
    stubFetch({
      windFar: [windResp(48, 12, 350), windResp(48, 13, 340)],
      windNear: [windResp(24, 22, 10), windResp(24, 23, 20)],
      waveFar: [waveResp(48, 1.0, 200), waveResp(48, 1.1, 210)],
      waveNear: [waveResp(24, 1.8, 20), waveResp(24, 1.9, 30)],
    });
    const eng: Library = {
      ...library,
      places: [
        { id: 'a', coordinates: { lat: 37.4, lon: 25.3 } },
        { id: 'b', coordinates: { lat: 36.9, lon: 25.1 } },
        // 40 m neben 'a' — dasselbe Gitterfeld in JEDEM Modell der Registry.
        { id: 'a-nebenan', coordinates: { lat: 37.4003, lon: 25.3004 } },
      ] as unknown as Library['places'],
    };
    const b = await fetchForecastBundle(eng, params, now);

    // Drei Orte, aber nur zwei Koordinatenpaare je Anfrage.
    const far = calls.find((u) => u.includes('models=ecmwf_ifs025'))!;
    expect(far.match(/latitude=([^&]*)/)![1]!.split(',')).toHaveLength(2);

    // Der Nachbar ist trotzdem bewertet — mit den Werten seiner Zelle.
    expect(Object.keys(b.forecast).sort()).toEqual(['a', 'a-nebenan', 'b']);
    expect(b.forecast['a-nebenan']!.windKn[0]).toBe(22);
    expect(b.forecast['a-nebenan']!.windKn[24]).toBe(12);
    expect(b.forecast['b']!.windKn[24]).toBe(13);

    // Und er teilt sich keinen Speicher mit seinem Vertreter: eine spätere
    // Korrektur an einem Ort darf nie den anderen mitverändern.
    expect(b.forecast['a-nebenan']!.windKn).not.toBe(b.forecast['a']!.windKn);
  });
});

describe('HTTP 429 — Ratenlimit', () => {
  /** 429 mit dem Grund im Rumpf, wie Open-Meteo ihn liefert. */
  function stub429(reason: string, dannGut?: unknown): void {
    calls.length = 0;
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.includes('/static/meta.json')) {
          return { ok: true, json: async () => ({}) } as unknown as Response;
        }
        n++;
        if (n === 1 || dannGut === undefined) {
          return {
            ok: false,
            status: 429,
            text: async () => JSON.stringify({ error: true, reason }),
          } as unknown as Response;
        }
        return { ok: true, json: async () => dannGut } as unknown as Response;
      }),
    );
  }

  it('nennt den Grund im Fehler statt "HTTP 429"', async () => {
    stub429('Daily API request limit exceeded. Please try again tomorrow.');
    await expect(fetchForecastBundle(library, params, now)).rejects.toThrow(
      /Ratenlimit.*Daily API request limit/s,
    );
  });

  it('wiederholt beim TAGES-Limit nicht — jeder weitere Versuch macht es schlimmer', async () => {
    stub429('Daily API request limit exceeded. Please try again tomorrow.');
    await expect(fetchForecastBundle(library, params, now)).rejects.toThrow();
    const proUrl = new Map<string, number>();
    for (const u of calls.filter((c) => !c.includes('meta.json'))) {
      proUrl.set(u, (proUrl.get(u) ?? 0) + 1);
    }
    expect([...proUrl.values()].every((n) => n === 1)).toBe(true);
  });

  it('wiederholt beim MINUTEN-Limit und kommt durch', async () => {
    vi.useFakeTimers();
    try {
      stub429('Minutely API request limit exceeded. Please try again in one minute.', [
        windResp(48, 12, 350),
        windResp(48, 12, 350),
      ]);
      const p = fetchForecastBundle(
        library,
        { ...params, forecastModelNear: '', waveModelNear: '' },
        now,
      );
      await vi.runAllTimersAsync();
      const b = await p;
      expect(b.forecast['a']!.windKn[0]).toBe(12);
    } finally {
      vi.useRealTimers();
    }
  });
});
