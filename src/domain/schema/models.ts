/**
 * WELCHE WETTERMODELLE DIESE APP KENNT — kuratierte Daten, kein I/O.
 *
 * Warum es diese Datei gibt: `forecastModel` war ein freier String, der roh in
 * eine Open-Meteo-URL wanderte. Ein Tippfehler lieferte damit lautlos einen
 * LEEREN Forecast — Open-Meteo quittiert eine unbekannte Modell-Id nicht als
 * Fehler. Und die rohe Id (`ecmwf_ifs025`) landete unübersetzt in der Fusszeile
 * vor dem Skipper. Beides behebt die Registry.
 *
 * WARUM `domain/schema/` UND NICHT `adapters/`: drei Schichten brauchen sie —
 * der Adapter (Anfrage bauen), die UI (Label anzeigen) und die Adapter-seitige
 * Prüfung. Läge sie in `adapters/`, müsste `domain/` von `adapters/` importieren;
 * das ist die Schichtung auf den Kopf gestellt. Sie ist Daten, genau wie
 * DEFAULT_PARAMS — kein fetch, kein React, kein Firebase.
 *
 * Bewusst NICHT hier: die Basis-URLs. Die Registry trägt nur `api: 'forecast' |
 * 'marine'`; welcher Host das ist, weiss allein der Adapter. Die Domäne lernt
 * keinen Hostnamen.
 *
 * POSEIDON (HCMR) FEHLT — und zwar nicht aus Versehen. Das griechische
 * Poseidon-System rechnet 1/30° (~3,7 km) über echter Ägäis-Topografie und wäre
 * für dieses Revier das bessere Modell; bei Open-Meteo ist es nicht dabei (kein
 * HCMR, kein SKIRON, kein WRF-Griechenland). HCMR verteilt selbst über einen
 * THREDDS-Server, also NetCDF via OPeNDAP — und typischerweise auch NCSS
 * (Punkt-Zeitreihen als CSV/JSON über normales HTTP). Der Blocker ist damit
 * NICHT das Dateiformat, sondern CORS plus das fehlende Backend: diese App ist
 * reines Hosting (firebase.json), eine Anbindung bräuchte eine geplante
 * Cloud Function, die die Ortsmenge abruft und nach Firestore legt. Sie würde
 * dann als drittes, noch feineres NAHFELD in `mergeNearFar` einhängen —
 * derselbe Mechanismus, kein neuer. Das Nächstbeste an Modellen — feineres
 * Gitter über der Ägäis — steht unten.
 *
 * WAS STATTDESSEN GESCHIEHT (2026-08-07): der SYSTEMATISCHE Teil dessen, was
 * Poseidon mehr sieht — Windschatten hinter den hohen Inseln, Düsen in den
 * Kanälen —, ist keine Wetterlage, sondern Topografie: er steht bei gleicher
 * Windrichtung immer an derselben Stelle. Er wird deshalb KURATIERT statt
 * abgerufen (schema/windTopo.ts, domain/windTopo.ts), asymmetrisch angewandt
 * (Düsen bewerten, Schatten beraten nur) und aus Poseidon-Vergleichen
 * kalibriert. Das ersetzt eine Anbindung nicht, aber es holt genau den Teil,
 * der planbar ist.
 */

/** Welche Open-Meteo-API das Modell bedient. Der Adapter mappt das auf den Host. */
export type ForecastApi = 'forecast' | 'marine';

/** Welche Serien das Modell speist. */
export type ForecastKind = 'wind' | 'wave';

export interface ForecastModelInfo {
  /** Open-Meteo-Modell-Id — wandert unverändert als `models=` in die URL. */
  readonly id: string;
  readonly api: ForecastApi;
  readonly kind: ForecastKind;
  /** Anzeigetext für Fusszeile und Annahme-Detail. */
  readonly label: string;
  /**
   * Native Vorhersagelänge in Stunden. Begrenzt die Nah-Anfrage
   * (`nearRequestDays`) und deckt über die Plausibilitätsprüfung ein
   * vertauschtes Nah/Fern-Paar auf.
   */
  readonly horizonHours: number;
  /** Deckt das Gitter die Kykladen (24–26 °E) ab? */
  readonly coversAegean: boolean;
  /** WARUM (nicht) — diesen Satz zitiert die Fehlermeldung. */
  readonly coverageNote: string;
  /** Namensnennungspflicht; wird in die Fusszeile eingesammelt. */
  readonly attribution: string;
  /**
   * Pfadsegment unter `api.open-meteo.com/data/<...>/static/meta.json`, oder
   * null, wenn es für dieses Modell kein erreichbares Meta-Dokument gibt.
   *
   * Für ALLE Wellenmodelle null: der Meta-Pfad liegt auf dem Forecast-Host,
   * die Marine-Ids sind unpräfigierte Aliase, und `best_match` ist überhaupt
   * kein Modell. Ein Abruf wäre ein garantierter 404 pro Zyklus. Folge: der
   * Wellen-Modelllauf bleibt "unbekannt" — exakt der heutige Zustand, denn
   * heute gibt es für Wellen gar keinen Laufstempel. Keine Regression möglich.
   */
  readonly metaPath: string | null;
}

const ECMWF = 'ECMWF';
const DWD = 'Datenbasis: Deutscher Wetterdienst';
const OPEN_METEO_ONLY = 'Open-Meteo';

/**
 * Nur Modelle, die für dieses Revier überhaupt in Frage kommen — plus die
 * bewusst abgelehnten, damit die Ablehnung begründet ist statt anonym.
 */
export const FORECAST_MODELS: readonly ForecastModelInfo[] = [
  // --- Wind ---------------------------------------------------------------
  {
    id: 'ecmwf_ifs025',
    api: 'forecast',
    kind: 'wind',
    label: 'ECMWF IFS 0.25°',
    horizonHours: 360,
    coversAegean: true,
    coverageNote: 'global',
    attribution: ECMWF,
    metaPath: 'ecmwf_ifs025',
  },
  {
    id: 'ecmwf_ifs',
    api: 'forecast',
    kind: 'wind',
    label: 'ECMWF IFS HRES 9 km',
    horizonHours: 240,
    coversAegean: true,
    coverageNote: 'global',
    attribution: ECMWF,
    metaPath: 'ecmwf_ifs',
  },
  {
    id: 'ecmwf_aifs025_single',
    api: 'forecast',
    kind: 'wind',
    label: 'ECMWF AIFS 0.25°',
    horizonHours: 360,
    coversAegean: true,
    coverageNote: 'global',
    attribution: ECMWF,
    metaPath: 'ecmwf_aifs025_single',
  },
  {
    id: 'dwd_icon_eu',
    api: 'forecast',
    kind: 'wind',
    label: 'DWD ICON-EU 7 km',
    horizonHours: 120,
    coversAegean: true,
    coverageNote:
      'Gitter 29,5–70,5 °N / 23,5 °W–62,5 °E — die Ägäis liegt vollständig darin',
    attribution: DWD,
    metaPath: 'dwd_icon_eu',
  },
  {
    id: 'dwd_icon_global',
    api: 'forecast',
    kind: 'wind',
    label: 'DWD ICON Global 11 km',
    horizonHours: 180,
    coversAegean: true,
    coverageNote: 'global',
    attribution: DWD,
    metaPath: 'dwd_icon',
  },
  {
    /**
     * Von Open-Meteo selbst verschmolzenes ICON D2+EU+Global. Erlaubt, aber als
     * NAHFELD die schlechtere Wahl: die Übergabe liegt dann in Open-Meteos Hand
     * und ist von hier aus nicht sichtbar — genau die Undurchsichtigkeit, die
     * dieser Hybrid abschaffen soll.
     */
    id: 'dwd_icon_seamless',
    api: 'forecast',
    kind: 'wind',
    label: 'DWD ICON Seamless',
    horizonHours: 180,
    coversAegean: true,
    coverageNote: 'global (von Open-Meteo aus D2/EU/Global zusammengesetzt)',
    attribution: DWD,
    metaPath: null,
  },
  {
    /**
     * 2 KM — UND TROTZDEM UNBRAUCHBAR. Aufgenommen, damit die Ablehnung
     * begründet ist: wer in Open-Meteos Doku "2 km" liest, bekommt die Antwort
     * aus der Fehlermeldung statt sie neu recherchieren zu müssen.
     * Gitter: nx=761 ny=761 lonMin=3 dx=0.025 → letzte Spalte bei 22,0 °E.
     */
    id: 'italia_meteo_arpae_icon_2i',
    api: 'forecast',
    kind: 'wind',
    label: 'ItaliaMeteo ARPAE ICON-2I 2 km',
    horizonHours: 60,
    coversAegean: false,
    coverageNote:
      'Gitter endet bei 22 °E — die Kykladen liegen bei 24–26 °E. Deckt nur das Ionische Meer ab, nicht das Törnrevier',
    attribution: 'ItaliaMeteo ARPAE',
    metaPath: 'italia_meteo_arpae_icon_2i',
  },

  // --- Wellen -------------------------------------------------------------
  {
    /**
     * Kein Modell, sondern Open-Meteos eigene Auswahl (heute MeteoFrance
     * MFWAM ~8 km). Genau das, was die Marine-API bisher OHNE `models=`
     * geliefert hat — die stille Wahl wird hier nur benannt.
     */
    id: 'best_match',
    api: 'marine',
    kind: 'wave',
    label: 'Open-Meteo Best Match (MFWAM ~8 km)',
    horizonHours: 240,
    coversAegean: true,
    coverageNote: 'global',
    attribution: OPEN_METEO_ONLY,
    metaPath: null,
  },
  {
    /**
     * ACHTUNG: die Id ist `ewam`, NICHT `dwd_ewam` — Open-Meteo hat die
     * Prefix-Aliase serverseitig noch nicht ausgerollt (TODO in deren Doku).
     * `dwd_ewam` käme stillschweigend leer zurück.
     * Gitter: nx=526 ny=721 latMin=30 lonMin=-10.5 dx=0.1 dy=0.05.
     */
    id: 'ewam',
    api: 'marine',
    kind: 'wave',
    label: 'DWD EWAM 5 km',
    horizonHours: 79,
    coversAegean: true,
    coverageNote:
      'Gitter 30–66 °N / 10,5 °W–42 °E — die Ägäis liegt vollständig darin',
    attribution: DWD,
    metaPath: null,
  },
  {
    id: 'gwam',
    api: 'marine',
    kind: 'wave',
    label: 'DWD GWAM 0.25°',
    horizonHours: 180,
    coversAegean: true,
    coverageNote: 'global',
    attribution: DWD,
    metaPath: null,
  },
  {
    id: 'ecmwf_wam025',
    api: 'marine',
    kind: 'wave',
    label: 'ECMWF WAM 0.25°',
    horizonHours: 240,
    coversAegean: true,
    coverageNote: 'global',
    attribution: ECMWF,
    metaPath: null,
  },
  {
    id: 'meteofrance_wave',
    api: 'marine',
    kind: 'wave',
    label: 'MeteoFrance MFWAM 8 km',
    horizonHours: 240,
    coversAegean: true,
    coverageNote: 'global',
    attribution: 'Météo-France / Copernicus Marine',
    metaPath: null,
  },
  {
    id: 'ncep_gfswave025',
    api: 'marine',
    kind: 'wave',
    label: 'NCEP GFS Wave 0.25°',
    horizonHours: 384,
    coversAegean: true,
    coverageNote: 'global',
    attribution: 'NOAA NCEP',
    metaPath: null,
  },
];

const BY_ID: Map<string, ForecastModelInfo> = new Map(
  FORECAST_MODELS.map((m) => [m.id, m]),
);

/** Registry-Eintrag oder null. Wirft nie. */
export function forecastModelInfo(id: string): ForecastModelInfo | null {
  return BY_ID.get(id) ?? null;
}

/** Anzeigetext, oder die rohe Id wenn unbekannt — sicher im Render. */
export function forecastModelLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

/** Alle Ids einer Art — für die Aufzählung in Fehlermeldungen. */
export function forecastModelIds(kind: ForecastKind): string[] {
  return FORECAST_MODELS.filter((m) => m.kind === kind && m.coversAegean).map(
    (m) => m.id,
  );
}

/**
 * Der Anzeigename des Hybrids. Bleibt ein einfacher String, damit
 * `assessment.model` in Fusszeile und Annahme-Detail unverändert gerendert
 * werden kann.
 */
export function composeModelLabel(
  nearId: string | null,
  farId: string,
): string {
  const far = forecastModelLabel(farId);
  if (!nearId) return far;
  return `${forecastModelLabel(nearId)} + ${far}`;
}

/**
 * `forecast_days` für die NAH-Anfrage: nur so weit, wie das Modell überhaupt
 * reicht (aufgerundet), nie weiter als die Fern-Anfrage. Spart bei 233 Orten
 * merklich Last — der Free-Tier von Open-Meteo wird nach Orte × Variablen ×
 * Zeitraum gewichtet, und ein 429 auf der Fern-Anfrage ist ein sichtbarer
 * Fehler.
 */
export function nearRequestDays(nearId: string, farDays: number): number {
  const info = BY_ID.get(nearId);
  if (!info) return farDays;
  return Math.max(1, Math.min(farDays, Math.ceil(info.horizonHours / 24)));
}

/**
 * Namensnennung der AKTIVEN Modelle, dedupliziert und in Registry-Reihenfolge.
 * Aus der Registry gerendert, damit die Fusszeile nicht auseinanderläuft, wenn
 * jemand das Modell in Firestore umstellt (DWD/GeoNutzV verlangt die Quelle).
 */
export function attributionsFor(ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const m of FORECAST_MODELS) {
    if (!ids.includes(m.id)) continue;
    if (m.attribution === OPEN_METEO_ONLY) continue; // steht schon separat da
    if (!out.includes(m.attribution)) out.push(m.attribution);
  }
  return out;
}
