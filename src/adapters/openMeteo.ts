/**
 * AD-3 — snapshot builder (facts only, no judgements: AD-10).
 * ONE query family: the normative location set is ALL curated places (key =
 * place id) PLUS the leg waypoints of the route library (key = leg:<id>:<n>).
 * Forecast API (wind, one base model — default ECMWF) + Marine API (waves).
 * Hour axis is normatively UTC; hours the model does not cover are null
 * (marine horizon < weather horizon!). Directions are "coming from" (AD-6),
 * speeds in kn, wave heights in m.
 */

import type { Library, PointForecast } from '../domain/schema/snapshot.ts';
import type { Params } from '../domain/schema/params.ts';
import type { Coordinates } from '../domain/schema/common.ts';
import { legWaypointKey } from '../domain/scoring.ts';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';

/** Typed adapter error -> TanStack Query error states -> visible UI notice (NFR5). */
export class OpenMeteoError extends Error {
  readonly endpoint: 'forecast' | 'marine' | 'meta';

  constructor(message: string, endpoint: 'forecast' | 'marine' | 'meta') {
    super(message);
    this.name = 'OpenMeteoError';
    this.endpoint = endpoint;
  }
}

export interface ForecastBundle {
  fetchedAtIso: string;
  modelRunIso: string | null;
  model: string;
  /** Normative UTC hour axis (ISO strings). */
  times: string[];
  forecast: Record<string, PointForecast>;
}

interface LocationEntry {
  key: string;
  coordinates: Coordinates;
}

/** Normative location set (AD-3): all places + all leg waypoints. */
export function collectLocations(library: Library): LocationEntry[] {
  const entries: LocationEntry[] = library.places.map((p) => ({
    key: p.id,
    coordinates: p.coordinates,
  }));
  const seen = new Set(entries.map((e) => e.key));
  for (const route of library.routes) {
    for (const leg of route.legs) {
      leg.waypoints.forEach((w, n) => {
        const key = legWaypointKey(leg.id, n);
        if (!seen.has(key)) {
          seen.add(key);
          entries.push({ key, coordinates: w });
        }
      });
    }
  }
  return entries;
}

/** API returns UTC times without suffix ("2026-08-08T00:00") — normalize. */
function toIsoUtc(t: string): string {
  return t.endsWith('Z') || t.includes('+') ? t : `${t}Z`;
}

interface HourlyResponse {
  hourly?: Record<string, unknown>;
}

function seriesOf(
  resp: HourlyResponse,
  name: string,
  length: number,
): (number | null)[] {
  const raw = resp.hourly?.[name];
  const arr = Array.isArray(raw) ? (raw as (number | null)[]) : [];
  const out: (number | null)[] = new Array(length).fill(null);
  for (let i = 0; i < Math.min(arr.length, length); i++) {
    const v = arr[i];
    out[i] = typeof v === 'number' && Number.isFinite(v) ? v : null;
  }
  return out;
}

async function fetchJson(url: string, endpoint: 'forecast' | 'marine'): Promise<unknown> {
  let resp: Response;
  try {
    resp = await fetch(url);
  } catch (e) {
    throw new OpenMeteoError(
      `Open-Meteo ${endpoint} nicht erreichbar: ${String(e)}`,
      endpoint,
    );
  }
  if (!resp.ok) {
    throw new OpenMeteoError(
      `Open-Meteo ${endpoint} antwortet mit HTTP ${resp.status}`,
      endpoint,
    );
  }
  try {
    // HTTP 200 with a non-JSON body (captive portal in a marina WiFi, proxy
    // error page) must surface as a typed error WITH endpoint context, not
    // as a bare SyntaxError.
    return await resp.json();
  } catch {
    throw new OpenMeteoError(
      `Open-Meteo ${endpoint} liefert kein JSON (Captive Portal / Proxy?)`,
      endpoint,
    );
  }
}

/**
 * Model run initialisation time — best effort via the (undocumented)
 * Open-Meteo meta endpoint. Failure only degrades the FR13 model-run stamp
 * to "unbekannt"; the forecast data itself is unaffected (its errors surface
 * separately via fetchJson).
 */
async function fetchModelRunIso(model: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://api.open-meteo.com/data/${encodeURIComponent(model)}/static/meta.json`,
    );
    if (!resp.ok) return null;
    const meta = (await resp.json()) as { last_run_initialisation_time?: number };
    if (typeof meta.last_run_initialisation_time === 'number') {
      return new Date(meta.last_run_initialisation_time * 1000).toISOString();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch wind + wave forecast for the whole normative location set in one
 * query family. `now` is injected for the retrieval timestamp (FR13).
 */
export async function fetchForecastBundle(
  library: Library,
  params: Params,
  now: () => Date = () => new Date(),
): Promise<ForecastBundle> {
  const locations = collectLocations(library);
  if (locations.length === 0) {
    return {
      fetchedAtIso: now().toISOString(),
      modelRunIso: null,
      model: params.forecastModel,
      times: [],
      forecast: {},
    };
  }
  const lats = locations.map((l) => l.coordinates.lat.toFixed(4)).join(',');
  const lons = locations.map((l) => l.coordinates.lon.toFixed(4)).join(',');

  // NOTE: wind_gusts_10m (gustKn) und wave_period (wavePeriodS) werden mit
  // abgerufen und durch alle Schichten gereicht, fließen aber BEWUSST nicht
  // ins Scoring/die Ampeln ein — Produktentscheidung, siehe deferred-work.
  const forecastUrl =
    `${FORECAST_URL}?latitude=${lats}&longitude=${lons}` +
    `&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
    `&wind_speed_unit=kn&timezone=UTC&timeformat=iso8601` +
    `&forecast_days=${params.forecastDays}&models=${encodeURIComponent(params.forecastModel)}`;
  const marineUrl =
    `${MARINE_URL}?latitude=${lats}&longitude=${lons}` +
    `&hourly=wave_height,wave_direction,wave_period` +
    `&timezone=UTC&timeformat=iso8601&forecast_days=${params.forecastDays}`;

  const [forecastRaw, marineSettled, modelRunIso] = await Promise.all([
    fetchJson(forecastUrl, 'forecast'),
    // Marine failure must not kill the wind forecast: waves become null
    // and places show 'unbewertet' contributions instead of a crash.
    fetchJson(marineUrl, 'marine').catch((e) => {
      console.error('Marine-API-Fehler — Wellen bleiben unbewertet:', e);
      return null;
    }),
    fetchModelRunIso(params.forecastModel),
  ]);

  const forecastList: HourlyResponse[] = Array.isArray(forecastRaw)
    ? (forecastRaw as HourlyResponse[])
    : [forecastRaw as HourlyResponse];
  const marineList: HourlyResponse[] | null = marineSettled
    ? Array.isArray(marineSettled)
      ? (marineSettled as HourlyResponse[])
      : [marineSettled as HourlyResponse]
    : null;

  // Normative axis = the wind forecast's hour axis (first location).
  const rawTimes = (forecastList[0]?.hourly?.['time'] as string[] | undefined) ?? [];
  const times = rawTimes.map(toIsoUtc);

  const forecast: Record<string, PointForecast> = {};
  locations.forEach((loc, li) => {
    const wind = forecastList[li];
    const marine = marineList?.[li];

    // Per-location axis check: the normative axis comes from location 0. If
    // THIS location's wind axis deviates (model edge, shorter/offset series),
    // index mapping would silently shift every hour — remap by timestamp
    // instead, exactly like the marine series.
    const ownTimes = (
      (wind?.hourly?.['time'] as string[] | undefined) ?? []
    ).map(toIsoUtc);
    const sameAxis =
      ownTimes.length === times.length &&
      ownTimes[0] === times[0] &&
      ownTimes[ownTimes.length - 1] === times[times.length - 1];
    const windSeries = (name: string): (number | null)[] => {
      if (!wind) return new Array(times.length).fill(null);
      if (sameAxis) return seriesOf(wind, name, times.length);
      const ownIndex = new Map<string, number>();
      ownTimes.forEach((t, i) => ownIndex.set(t, i));
      const raw = seriesOf(wind, name, ownTimes.length);
      return times.map((t) => {
        const i = ownIndex.get(t);
        return i === undefined ? null : (raw[i] ?? null);
      });
    };
    const windKn = windSeries('wind_speed_10m');
    const windDirDeg = windSeries('wind_direction_10m');
    const gustKn = windSeries('wind_gusts_10m');

    // Marine responses may use a different (shorter) axis: map by timestamp,
    // per location (not via location 0's axis).
    const waveM: (number | null)[] = new Array(times.length).fill(null);
    const waveDirDeg: (number | null)[] = new Array(times.length).fill(null);
    const wavePeriodS: (number | null)[] = new Array(times.length).fill(null);
    if (marine) {
      const marineTimes = (
        (marine.hourly?.['time'] as string[] | undefined) ?? []
      ).map(toIsoUtc);
      const marineIndex = new Map<string, number>();
      marineTimes.forEach((t, i) => marineIndex.set(t, i));
      const mLen = marineTimes.length;
      const mWave = seriesOf(marine, 'wave_height', mLen);
      const mDir = seriesOf(marine, 'wave_direction', mLen);
      const mPer = seriesOf(marine, 'wave_period', mLen);
      times.forEach((t, i) => {
        const mi = marineIndex.get(t);
        if (mi !== undefined) {
          waveM[i] = mWave[mi] ?? null;
          waveDirDeg[i] = mDir[mi] ?? null;
          wavePeriodS[i] = mPer[mi] ?? null;
        }
      });
    }
    forecast[loc.key] = { windKn, windDirDeg, gustKn, waveM, waveDirDeg, wavePeriodS };
  });

  return {
    fetchedAtIso: now().toISOString(),
    modelRunIso,
    model: params.forecastModel,
    times,
    forecast,
  };
}
