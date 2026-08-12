/**
 * AD-3 — snapshot builder (facts only, no judgements: AD-10).
 * ONE query family: the normative location set is ALL curated places (key =
 * place id) PLUS the leg waypoints of the route library (key = leg:<id>:<n>).
 *
 * NAHFELD/FERNFELD-HYBRID: je Art (Wind, Wellen) werden ZWEI Modelle abgerufen —
 * ein hochauflösendes mit kurzem Horizont und ein globales, das den Horizont
 * trägt. Die Verschmelzung macht domain/forecastMerge.ts (pur, dort steht auch,
 * warum die Nahtstelle ein harter Schnitt ist). Ein leeres `*Near` schaltet den
 * Hybrid ab und liefert bitgleich das Verhalten von vorher.
 *
 * Hour axis is normatively UTC and comes ALWAYS from the FAR wind model — es ist
 * die längste Achse. Nie vom Nahfeld: eine Achse, die manchmal aus einem
 * 5-Tage-Modell käme, würde die Abdeckung des Törns stumm halbieren.
 * Hours no model covers are null. Directions are "coming from" (AD-6),
 * speeds in kn, wave heights in m.
 */

import type { Library, PointForecast, ForecastProvenance, KindProvenance } from '../domain/schema/snapshot.ts';
import type { Params } from '../domain/schema/params.ts';
import type { Coordinates } from '../domain/schema/common.ts';
import { legWaypointKey } from '../domain/scoring.ts';
import {
  mergeNearFar,
  type MergeGroup,
  type TimedSeries,
} from '../domain/forecastMerge.ts';
import {
  composeModelLabel,
  forecastModelIds,
  forecastModelInfo,
  nearRequestDays,
  rasterDegFor,
  type ForecastKind,
} from '../domain/schema/models.ts';

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
  /**
   * Nah/Fern-Herkunft je Art. OPTIONAL wie im Snapshot — und aus demselben
   * Grund: ein Bundle, für das gar nichts abgerufen wurde (`OHNE_FORECAST`),
   * hat keine Herkunft. Eine leere Modell-Id hineinzuschreiben wäre eine
   * Behauptung über Daten, die es nicht gibt.
   */
  provenance?: ForecastProvenance;
  /** Normative UTC hour axis (ISO strings). */
  times: string[];
  forecast: Record<string, PointForecast>;
}

/**
 * DER WINDFREIE STAND — ein Bundle ohne eine einzige Stunde.
 *
 * Es beschreibt genau eine Lage: Open-Meteo hat nicht geantwortet (Netz weg,
 * HTTP 429 am Ratenlimit), und es liegt auch kein früherer Datenstand im
 * Query-Cache. Bis 2026-08-08 stand dann NICHTS da — ohne Forecast kein
 * Snapshot, ohne Snapshot keine Bewertung, und die App zeigte nur noch das rote
 * Fehlerpanel. Der Törn war damit nicht planbar, obwohl vom Wetter nur EIN Teil
 * der Planung abhängt: die Bewertung. Inseln, Plätze, Etappen, Distanzen und die
 * Kette der Tage stehen in der Bibliothek und brauchen keinen Wind.
 *
 * Leere Achse, leere Ortsmenge — nicht etwa Nullwerte über einer erfundenen
 * Achse: die Domäne trägt diesen Fall bereits (persistence.ts, "Kein Forecast
 * vorhanden — keine Fortschreibung möglich"), jede Ampel wird 'unbewertet' und
 * `Assessment.forecastHorizonIso` bleibt null. Damit sagt die Bewertung selbst,
 * dass sie ohne Winddaten zustande kam; die Anzeige liest genau dieses Feld und
 * muss den Ausfall nicht ein zweites Mal ableiten.
 *
 * `fetchedAtIso` und `model` sind LEER, nicht gefüllt: es wurde nichts
 * abgerufen, also gibt es weder einen Abrufzeitpunkt noch ein Modell.
 * `formatStamp('')` sagt dazu "unbekannt", und der Stand-Hinweis der
 * Tagesansicht (staleForecastLabel) bleibt aus, statt ein Alter zu rechnen.
 */
export const OHNE_FORECAST: ForecastBundle = Object.freeze({
  fetchedAtIso: '',
  modelRunIso: null,
  model: '',
  times: [] as string[],
  forecast: {} as Record<string, PointForecast>,
});

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
  for (const leg of library.legs) {
    leg.waypoints.forEach((w, n) => {
      const key = legWaypointKey(leg.id, n);
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({ key, coordinates: w });
      }
    });
  }
  return entries;
}

/**
 * DIE ORTSLISTE AUF DAS MODELLGITTER LEGEN — die Antwort auf HTTP 429.
 *
 * Open-Meteo gewichtet sein Ratenlimit nach Orten × Variablen × Zeitraum, und
 * diese Bibliothek fragte 585 Orte ab: 97 Liegeplätze plus 488 Etappen-
 * Wegpunkte. Ein Wegpunkt liegt aber oft wenige hundert Meter neben dem
 * nächsten, und kein Modell dieser Registry löst das auf — ECMWF IFS025 rechnet
 * 0,25° (~25 km), ICON-EU 7 km. Die zweite Anfrage kostete Kontingent und
 * lieferte dieselbe Zahl.
 *
 * Gerastert wird deshalb je MODELL auf `rasterDegFor` (die halbe Gitterweite,
 * schema/models.ts) und je Zelle genau EIN Ort abgefragt; alle übrigen Orte der
 * Zelle lesen dessen Reihe. Für das Fernfeld schrumpft die Liste damit von 585
 * auf unter 100 Orte.
 *
 * WAS DABEI NICHT VERLOREN GEHT: zwei Orte derselben Zelle liegen höchstens eine
 * halbe Gitterweite auseinander, treffen also dasselbe Gitterfeld — es ist
 * derselbe Wert, nur einmal statt zweimal geholt. Was die Modelle im Kanal
 * wirklich nicht sehen, ist eine andere Frage; die beantwortet die kuratierte
 * Topografie-Korrektur (domain/windTopo.ts) und nicht ein zweiter Abruf im
 * selben Gitterfeld.
 *
 * VERTRETER IST DER ERSTE ORT DER ZELLE. Die Liegeplätze stehen in
 * `collectLocations` vor den Wegpunkten — ein Platz vertritt deshalb immer sich
 * selbst und wird nie von einem Wegpunkt vertreten.
 */
export interface Gitterabfrage {
  /** Ein Vertreter je Zelle — genau diese Orte gehen in die URL. */
  orte: LocationEntry[];
  /** Je Original-Ort der Index seines Vertreters in `orte`. */
  vertreterIndex: number[];
}

export function aufModellgitter(
  locations: LocationEntry[],
  rasterDeg: number,
): Gitterabfrage {
  // Kein Raster (unbekanntes Modell): jeder Ort vertritt sich selbst. Damit ist
  // das Verhalten bitgleich dem von vor der Rasterung.
  if (!(rasterDeg > 0)) {
    return { orte: locations, vertreterIndex: locations.map((_, i) => i) };
  }
  const orte: LocationEntry[] = [];
  const vertreterIndex: number[] = [];
  const zelle = new Map<string, number>();
  for (const loc of locations) {
    const key = `${Math.round(loc.coordinates.lat / rasterDeg)}:${Math.round(
      loc.coordinates.lon / rasterDeg,
    )}`;
    let idx = zelle.get(key);
    if (idx === undefined) {
      idx = orte.length;
      zelle.set(key, idx);
      orte.push(loc);
    }
    vertreterIndex.push(idx);
  }
  return { orte, vertreterIndex };
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

/**
 * Eine Antwort in die Domänenform bringen: eigene Achse + Serien. Das ist der
 * einzige Ort, an dem Open-Meteos JSON-Gestalt (`hourly.<name>`) gelesen wird —
 * die Umreihung selbst macht danach domain/forecastMerge.ts.
 */
function toTimedSeries(
  resp: HourlyResponse | undefined,
  names: readonly string[],
): TimedSeries | null {
  if (!resp) return null;
  const rawTimes = (resp.hourly?.['time'] as string[] | undefined) ?? [];
  if (rawTimes.length === 0) return null;
  const times = rawTimes.map(toIsoUtc);
  const values: Record<string, (number | null)[]> = {};
  for (const n of names) values[n] = seriesOf(resp, n, times.length);
  return { times, values };
}

/**
 * HTTP 429 — das Ratenlimit, und warum es hier eine eigene Behandlung hat.
 *
 * Open-Meteo führt DREI Kontingente (Minute, Stunde, Tag) und nennt im Rumpf
 * der 429-Antwort, welches gerissen ist. Der Unterschied entscheidet, was
 * sinnvoll ist: ein Minuten-Limit ist in Sekunden vorbei und ein zweiter
 * Versuch lohnt; ein Tageslimit ist bis Mitternacht UTC zu, und jeder weitere
 * Versuch macht es nur schlimmer. Deshalb wird nur beim Minuten-Limit
 * wiederholt — und der Grund wandert wörtlich in die Fehlermeldung, damit im
 * Fehlerpanel „Ratenlimit, morgen wieder" steht statt „HTTP 429".
 */
const RETRY_WARTEN_MS = [4_000, 12_000] as const;

function schlafen(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Der von Open-Meteo genannte Grund, gekürzt — leer, wenn keiner dasteht. */
async function limitGrund(resp: Response): Promise<string> {
  try {
    const text = await resp.text();
    const reason = (JSON.parse(text) as { reason?: unknown }).reason;
    return typeof reason === 'string' ? reason.slice(0, 200) : '';
  } catch {
    return '';
  }
}

/** Nur das MINUTEN-Kontingent ist es wert, gleich noch einmal zu fragen. */
function lohntWiederholung(grund: string): boolean {
  return /minut/i.test(grund);
}

async function fetchJson(
  url: string,
  endpoint: 'forecast' | 'marine',
  model: string,
): Promise<unknown> {
  let resp: Response;
  for (let versuch = 0; ; versuch++) {
    try {
      resp = await fetch(url);
    } catch (e) {
      throw new OpenMeteoError(
        `Open-Meteo ${endpoint} (${model}) nicht erreichbar: ${String(e)}`,
        endpoint,
      );
    }
    if (resp.status !== 429) break;

    const grund = await limitGrund(resp);
    const wartenMs = RETRY_WARTEN_MS[versuch];
    if (wartenMs === undefined || !lohntWiederholung(grund)) {
      throw new OpenMeteoError(
        `Open-Meteo ${endpoint} (${model}): Ratenlimit erreicht (HTTP 429)` +
          (grund ? ` — ${grund}` : '') +
          '. Der Abruf zählt nach Orten × Variablen × Tagen; das Kontingent ' +
          'füllt sich von selbst wieder auf.',
        endpoint,
      );
    }
    console.warn(
      `Open-Meteo ${endpoint} (${model}): Minuten-Ratenlimit — neuer Versuch in ` +
        `${Math.round(wartenMs / 1000)} s (${grund})`,
    );
    await schlafen(wartenMs);
  }
  if (!resp.ok) {
    throw new OpenMeteoError(
      `Open-Meteo ${endpoint} (${model}) antwortet mit HTTP ${resp.status}`,
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
      `Open-Meteo ${endpoint} (${model}) liefert kein JSON (Captive Portal / Proxy?)`,
      endpoint,
    );
  }
}

/**
 * Model run initialisation time — best effort via the (undocumented)
 * Open-Meteo meta endpoint. Failure only degrades the FR13 model-run stamp
 * to "unbekannt"; the forecast data itself is unaffected (its errors surface
 * separately via fetchJson).
 *
 * Modelle ohne `metaPath` (alle Wellenmodelle) werden GAR NICHT abgerufen: der
 * Meta-Pfad liegt auf dem Forecast-Host, die Marine-Ids sind unpräfigierte
 * Aliase. Das wäre ein garantierter 404 je Zyklus.
 */
async function fetchModelRunIso(model: string): Promise<string | null> {
  const path = forecastModelInfo(model)?.metaPath ?? null;
  if (!path) return null;
  try {
    const resp = await fetch(
      `https://api.open-meteo.com/data/${encodeURIComponent(path)}/static/meta.json`,
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

const WIND_NAMES = ['wind_speed_10m', 'wind_direction_10m'] as const;
const WAVE_NAMES = ['wave_height', 'wave_direction', 'wave_period'] as const;

/**
 * Die Tore der Verschmelzung. Wind: Fahrt UND Richtung müssen zusammen aus einem
 * Modell kommen. Wellen: Höhe und Richtung entscheiden, die Periode wird
 * mitgetragen — sie bewertet nichts (persistence.ts), darf also keine sonst gute
 * Nah-Stunde verwerfen. Die Torpaare sind exakt die, die
 * windHorizonIndex/waveHorizonIndex als "echte Daten" lesen.
 */
const WIND_GROUP: MergeGroup = { gate: [...WIND_NAMES], carry: [] };
const WAVE_GROUP: MergeGroup = {
  gate: ['wave_height', 'wave_direction'],
  carry: ['wave_period'],
};

/** Antworten auf eine Liste je Ort normalisieren (Open-Meteo: Array bei n>1). */
function asList(raw: unknown): HourlyResponse[] {
  return Array.isArray(raw) ? (raw as HourlyResponse[]) : [raw as HourlyResponse];
}

/**
 * Unbekannte Modell-Ids scheitern HIER, nicht im Zod-Schema: ein Schemafehler
 * verwirft über parseTolerant das ganze Parameter-Dokument und damit stumm die
 * gesamte Abstimmung. Hier ist der Fehler eingegrenzt, im Fehlerpanel sichtbar
 * und benennt die Id — alle anderen Parameter wirken weiter.
 */
function requireModel(field: string, id: string, kind: ForecastKind): void {
  if (forecastModelInfo(id)) return;
  throw new OpenMeteoError(
    `${field}: unbekanntes Modell '${id}'. Erlaubt sind: ${forecastModelIds(kind).join(', ')}. ` +
      `Ein Tippfehler liefert sonst einen leeren Forecast, weil Open-Meteo eine unbekannte Modell-Id nicht als Fehler quittiert.`,
    kind === 'wind' ? 'forecast' : 'marine',
  );
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
  const {
    forecastModel: windFar,
    forecastModelNear: windNear,
    waveModel: waveFar,
    waveModelNear: waveNear,
  } = params;

  requireModel('forecastModel', windFar, 'wind');
  requireModel('waveModel', waveFar, 'wave');
  if (windNear !== '') requireModel('forecastModelNear', windNear, 'wind');
  if (waveNear !== '') requireModel('waveModelNear', waveNear, 'wave');

  const emptyProvenance = (): ForecastProvenance => ({
    wind: {
      far: windFar,
      near: windNear === '' ? null : windNear,
      nearReachHours: 0,
      farRunIso: null,
      nearRunIso: null,
    },
    wave: {
      far: waveFar,
      near: waveNear === '' ? null : waveNear,
      nearReachHours: 0,
      farRunIso: null,
      nearRunIso: null,
    },
  });

  const locations = collectLocations(library);
  if (locations.length === 0) {
    return {
      fetchedAtIso: now().toISOString(),
      modelRunIso: null,
      // Fernfeld-Label: es wurde nichts abgerufen, also wird auch keine
      // Nahfeld-Auflösung behauptet (dieselbe Regel wie unten bei reach === 0).
      model: composeModelLabel(null, windFar),
      provenance: emptyProvenance(),
      times: [],
      forecast: {},
    };
  }
  /**
   * DIE ORTSLISTE WIRD GETEILT — sonst reisst die URL.
   *
   * Open-Meteo nimmt beliebig viele Orte als komma-getrennte Listen entgegen,
   * und bis 2026-08-07 ging genau EINE Anfrage für alles raus: 295 Orte
   * (97 Plätze + 198 Etappen-Wegpunkte) ergaben rund 5,3 KB URL — schon damals
   * nah an dem, was Server und Proxys üblicherweise durchlassen (8 KB).
   *
   * Mit den abgeleiteten Etappen (deriveLegs.ts) verdoppelt sich die Zahl der
   * Wegpunkte. Eine einzige Anfrage würde zweistellige Kilobyte lang und
   * scheiterte mit HTTP 414 — und zwar für den GANZEN Forecast, nicht nur für
   * die neuen Punkte.
   *
   * Geteilt wird deshalb nach ORTEN, nicht nach Modellen: jeder Block fragt
   * dieselben Stunden und dasselbe Modell, die Antworten werden IN DERSELBEN
   * REIHENFOLGE aneinandergehängt. Die Zuordnung unten hängt an dieser
   * Reihenfolge — seit der Rasterung nicht mehr direkt auf `locations`, sondern
   * über `Gitterabfrage.vertreterIndex` auf die abgefragte Vertreterliste.
   */
  const ORTE_JE_ANFRAGE = 150;
  const bloecken = (orte: LocationEntry[]): LocationEntry[][] => {
    const out: LocationEntry[][] = [];
    for (let i = 0; i < orte.length; i += ORTE_JE_ANFRAGE) {
      out.push(orte.slice(i, i + ORTE_JE_ANFRAGE));
    }
    return out;
  };
  const koordinaten = (block: LocationEntry[]): { lats: string; lons: string } => ({
    lats: block.map((l) => l.coordinates.lat.toFixed(4)).join(','),
    lons: block.map((l) => l.coordinates.lon.toFixed(4)).join(','),
  });

  // Böen werden NICHT abgerufen (Produktentscheidung 2026-08-03): Planungsgröße
  // ist der Mittelwind, und ein Datenpunkt, der in keine Bewertung einfließt,
  // ist toter Ballast (NFR0). wave_period bleibt: Wellenhöhe plus Periode
  // beschreiben den Schwell-Charakter einer Bucht und sind für die Platz-Ampel
  // fachlich anschlussfähig.
  const windUrl = (block: LocationEntry[], model: string, days: number): string => {
    const { lats, lons } = koordinaten(block);
    return (
      `${FORECAST_URL}?latitude=${lats}&longitude=${lons}` +
      `&hourly=${WIND_NAMES.join(',')}` +
      `&wind_speed_unit=kn&timezone=UTC&timeformat=iso8601` +
      `&forecast_days=${days}&models=${encodeURIComponent(model)}`
    );
  };
  const waveUrl = (block: LocationEntry[], model: string, days: number): string => {
    const { lats, lons } = koordinaten(block);
    return (
      `${MARINE_URL}?latitude=${lats}&longitude=${lons}` +
      `&hourly=${WAVE_NAMES.join(',')}` +
      `&timezone=UTC&timeformat=iso8601` +
      `&forecast_days=${days}&models=${encodeURIComponent(model)}`
    );
  };

  /**
   * Alle Blöcke einer Anfrage holen und der Reihe nach zusammenhängen.
   *
   * Ein einzelner Block, der bei EINEM Ort eine Liste und bei mehreren eine
   * andere Gestalt liefert, ist schon in `asList` abgefangen. Was hier
   * dazukommt, ist nur die Reihenfolge — und die ist die Zuordnung.
   *
   * KEINE Teil-Toleranz: schlägt ein Block fehl, schlägt die ganze Anfrage
   * fehl. Ein Forecast, dem die Hälfte der Orte fehlt, wäre schlimmer als
   * keiner — die Etappen dorthin würden stumm auf 'unbewertet' fallen, und
   * genau solche stillen Löcher soll diese Codebasis nicht haben. Wer die
   * Anfrage als optional führt (Nahfeld, Wellen), fängt den Fehler eine Ebene
   * höher ab, wie bisher.
   */
  const fetchAlle = async (
    urlFor: (block: LocationEntry[]) => string,
    endpoint: 'forecast' | 'marine',
    model: string,
    gitter: Gitterabfrage,
  ): Promise<unknown[]> => {
    const teile = await Promise.all(
      bloecken(gitter.orte).map((block) => fetchJson(urlFor(block), endpoint, model)),
    );
    return teile.flatMap((t) => asList(t));
  };

  /**
   * Je Modell sein eigenes Raster (`aufModellgitter`). Vier Anfragen, vier
   * Ortslisten: das grobe Fernfeld fragt weniger Punkte als das feine Nahfeld,
   * weil es ohnehin weniger unterscheiden kann.
   */
  const windFarGitter = aufModellgitter(locations, rasterDegFor(windFar));
  const windNearGitter =
    windNear === '' ? windFarGitter : aufModellgitter(locations, rasterDegFor(windNear));
  const waveFarGitter = aufModellgitter(locations, rasterDegFor(waveFar));
  const waveNearGitter =
    waveNear === '' ? waveFarGitter : aufModellgitter(locations, rasterDegFor(waveNear));
  console.info(
    `Open-Meteo: ${locations.length} Orte → abgefragt ${windFarGitter.orte.length} ` +
      `(${windFar}), ${windNear === '' ? 0 : windNearGitter.orte.length} (${windNear || 'kein Nahfeld'}), ` +
      `${waveFarGitter.orte.length} (${waveFar}), ` +
      `${waveNear === '' ? 0 : waveNearGitter.orte.length} (${waveNear || 'kein Nahfeld'}) — ` +
      'je Modellgitter zusammengelegt.',
  );

  /**
   * Eine NAH-Anfrage darf nie ein Fehler werden: sie ist eine Verbesserung, kein
   * Fundament. Scheitert sie, ist das Ergebnis exakt das Fernfeld — also die
   * Qualität von vor der Umstellung. Zusammen mit dem Tor der Verschmelzung
   * (Teilerfolg wird ebenso ignoriert) ist die Degradation lückenlos.
   */
  const optional = (p: Promise<unknown>, what: string): Promise<unknown | null> =>
    p.catch((e) => {
      console.error(`${what} nicht verfügbar — es zählt nur das Fernfeld:`, e);
      return null;
    });

  const [
    windFarRaw,
    windNearRaw,
    waveFarSettled,
    waveNearSettled,
    windFarRun,
    windNearRun,
  ] = await Promise.all([
    // Das Fernfeld des WINDES ist das einzige Fundament: sein Fehler bleibt
    // ungefangen und erreicht das Fehlerpanel (unverändert zu vorher).
    fetchAlle(
      (b) => windUrl(b, windFar, params.forecastDays),
      'forecast',
      windFar,
      windFarGitter,
    ),
    windNear === ''
      ? Promise.resolve(null)
      : optional(
          fetchAlle(
            (b) => windUrl(b, windNear, nearRequestDays(windNear, params.forecastDays)),
            'forecast',
            windNear,
            windNearGitter,
          ),
          `Nahfeld-Wind (${windNear})`,
        ),
    // Marine failure must not kill the wind forecast: waves become null
    // and places show 'unbewertet' contributions instead of a crash.
    optional(
      fetchAlle(
        (b) => waveUrl(b, waveFar, params.forecastDays),
        'marine',
        waveFar,
        waveFarGitter,
      ),
      `Wellen (${waveFar})`,
    ),
    waveNear === ''
      ? Promise.resolve(null)
      : optional(
          fetchAlle(
            (b) => waveUrl(b, waveNear, nearRequestDays(waveNear, params.forecastDays)),
            'marine',
            waveNear,
            waveNearGitter,
          ),
          `Nahfeld-Wellen (${waveNear})`,
        ),
    fetchModelRunIso(windFar),
    windNear === '' ? Promise.resolve(null) : fetchModelRunIso(windNear),
  ]);

  // `fetchAlle` liefert die Blöcke bereits flach und in Ortsreihenfolge — die
  // frühere `asList`-Umhüllung hier wäre jetzt eine Liste von Listen.
  const windFarList = windFarRaw as HourlyResponse[];
  const windNearList = (windNearRaw as HourlyResponse[] | null) ?? null;
  const waveFarList = (waveFarSettled as HourlyResponse[] | null) ?? null;
  const waveNearList = (waveNearSettled as HourlyResponse[] | null) ?? null;

  // Normative axis = the FAR wind forecast's hour axis (first location).
  const rawTimes = (windFarList[0]?.hourly?.['time'] as string[] | undefined) ?? [];
  const times = rawTimes.map(toIsoUtc);

  const forecast: Record<string, PointForecast> = {};
  let windReach = 0;
  let waveReach = 0;

  /**
   * Die Antwort für DIESEN Ort: nicht mehr `liste[li]`, sondern die Reihe seines
   * Gitter-Vertreters. Zwei Orte derselben Zelle lesen dieselbe Antwort — und
   * bekommen daraus trotzdem je eigene Arrays, weil `toTimedSeries`/`seriesOf`
   * pro Aufruf neu anlegen. Kein Ort teilt sich also einen Speicher mit einem
   * anderen; die Serien sind Kopien, keine Verweise.
   */
  const antwort = (
    liste: HourlyResponse[] | null,
    gitter: Gitterabfrage,
    li: number,
  ): HourlyResponse | undefined => {
    if (!liste) return undefined;
    const idx = gitter.vertreterIndex[li];
    return idx === undefined ? undefined : liste[idx];
  };

  locations.forEach((loc, li) => {
    // Wind: verschmelzen. Die Umreihung auf die normative Achse steckt in
    // alignToAxis — das ersetzt die frühere per-Ort-Achsprüfung UND die
    // Marine-Umreihung, die es hier zweimal getrennt gab.
    const wind = mergeNearFar(
      times,
      toTimedSeries(antwort(windNearList, windNearGitter, li), WIND_NAMES),
      toTimedSeries(antwort(windFarList, windFarGitter, li), WIND_NAMES),
      WIND_GROUP,
    );
    const wave = mergeNearFar(
      times,
      toTimedSeries(antwort(waveNearList, waveNearGitter, li), WAVE_NAMES),
      toTimedSeries(antwort(waveFarList, waveFarGitter, li), WAVE_NAMES),
      WAVE_GROUP,
    );
    windReach = Math.max(windReach, wind.nearReachHours);
    waveReach = Math.max(waveReach, wave.nearReachHours);

    const empty = (): (number | null)[] => new Array(times.length).fill(null);
    // The adapter delivers FACTS only (AD-10): nothing here is assumed. Gaps
    // stay null; filling them is the domain's persistence step.
    forecast[loc.key] = {
      windKn: wind.values['wind_speed_10m'] ?? empty(),
      windDirDeg: wind.values['wind_direction_10m'] ?? empty(),
      waveM: wave.values['wave_height'] ?? empty(),
      waveDirDeg: wave.values['wave_direction'] ?? empty(),
      wavePeriodS: wave.values['wave_period'] ?? empty(),
      windAssumed: new Array<boolean>(times.length).fill(false),
      waveAssumed: new Array<boolean>(times.length).fill(false),
    };
  });

  // Ein Nahfeld, das nichts beigetragen hat, wird als 'aus' berichtet — sonst
  // behauptete die Fusszeile eine Auflösung, die nicht in den Zahlen steckt.
  const kind = (
    far: string,
    near: string,
    reach: number,
    farRun: string | null,
    nearRun: string | null,
  ): KindProvenance => ({
    far,
    near: near === '' || reach === 0 ? null : near,
    nearReachHours: reach,
    farRunIso: farRun,
    nearRunIso: reach === 0 ? null : nearRun,
  });

  const provenance: ForecastProvenance = {
    wind: kind(windFar, windNear, windReach, windFarRun as string | null, windNearRun as string | null),
    wave: kind(waveFar, waveNear, waveReach, null, null),
  };

  return {
    fetchedAtIso: now().toISOString(),
    modelRunIso: (windFarRun as string | null) ?? null,
    model: composeModelLabel(provenance.wind.near, windFar),
    provenance,
    times,
    forecast,
  };
}
