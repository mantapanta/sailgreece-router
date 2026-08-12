/**
 * DER LETZTE FORECAST ÜBERLEBT DEN NEUSTART (2026-08-09, Skipper: an Bord ist
 * genau der Moment, in dem man ihn am dringendsten braucht).
 *
 * Der Abruf lag bisher nur im Speicher der Seite. Auf dem Handy heisst das:
 * jedes Neuladen ist ein Kaltstart, und ohne Netz — Funkloch zwischen zwei
 * Inseln, Ratenlimit, Captive Portal in der Marina — stand die ganze Planung
 * auf 'unbewertet', obwohl vor zwanzig Minuten noch ein vollständiger Forecast
 * da war. Dieser Speicher legt den letzten erfolgreichen Abruf ins
 * `localStorage` und gibt ihn beim nächsten Start als Startwert zurück.
 *
 * ER MACHT NICHTS FRISCHER, ALS ES IST. Gespeichert wird das Bundle MIT seinem
 * `fetchedAtIso`; die Fusszeile rechnet daraus wie bisher das Alter und setzt
 * die Stale-Markierung (ui/dayViewModel.staleForecastLabel), und ein
 * gescheiterter Abruf zeigt weiterhin sein Fehlerpanel ("angezeigt wird der
 * letzte Datenstand"). Ein alter Forecast, der als alt dasteht, ist etwas
 * anderes als ein alter Forecast, der so tut als sei er neu — nur das Erste
 * darf diese App tun (AD-10).
 *
 * DREI GRÜNDE, IHN NICHT ZU BENUTZEN, und alle drei sind hart:
 *   1. Anderer Schlüssel — andere Modellwahl oder andere Ortsmenge
 *      (usePlanning: `forecastCacheKey` + `libHash`). Ein Forecast für eine
 *      andere Bibliothek ist kein alter Forecast, sondern ein falscher.
 *   2. Die Achse liegt ganz in der Vergangenheit. Dann sagt er über heute
 *      nichts mehr, und 'unbewertet' ist die ehrlichere Anzeige.
 *   3. Er ist unlesbar. Dann fliegt er raus, still und ohne Panel — ein
 *      kaputter Cache ist kein Zustand, über den der Skipper nachdenken soll.
 *
 * WARUM DIE REIHEN ZUSAMMENGELEGT WERDEN: 585 Orte × 5 Reihen × 240 Stunden
 * sind als JSON rund 4,7 MB — mehr als die ~5 MB, die ein Browser dem ganzen
 * Origin gibt. Seit der Rasterung auf das Modellgitter (openMeteo.ts) sind aber
 * viele Reihen BITGLEICH: Orte derselben Gitterzelle haben dieselbe Vorhersage.
 * Gespeichert wird deshalb jede verschiedene Reihe einmal, dazu eine Zuordnung
 * Ort → Reihe. Das sind ~1,2 MB, und es ist keine Näherung: verglichen wird der
 * Inhalt, nicht die Herkunft.
 */

import type {
  ForecastProvenance,
  PointForecast,
} from '../domain/schema/snapshot.ts';
import type { ForecastBundle } from './openMeteo.ts';

const SPEICHER_SCHLUESSEL = 'sailgreece.forecast.v1';

/**
 * Nachkommastellen je Reihe. Gerundet wird, weil jede Stelle Platz kostet und
 * keine davon eine Bewertung ändert: Wind auf 0,1 kn (die Schwellen sind ganze
 * Knoten), Richtungen auf 1° (Sektorgrenzen sind ganzzahlig), Wellenhöhe auf
 * 1 cm, Periode auf 0,1 s (sie bewertet ohnehin nichts, persistence.ts).
 */
const STELLEN = { w: 1, d: 0, h: 2, r: 0, p: 1 } as const;

/** Eine Reihe in Speicherform — kurze Namen, weil sie 234-mal dasteht. */
interface Reihe {
  w: (number | null)[];
  d: (number | null)[];
  h: (number | null)[];
  r: (number | null)[];
  p: (number | null)[];
}

interface Gespeichert {
  key: string;
  fetchedAtIso: string;
  modelRunIso: string | null;
  model: string;
  provenance?: ForecastProvenance;
  times: string[];
  reihen: Reihe[];
  /** Ortsschlüssel → Index in `reihen`. */
  orte: Record<string, number>;
}

export interface GeladenerForecast {
  bundle: ForecastBundle;
  /** `fetchedAtIso` als ms — das `initialDataUpdatedAt` von TanStack Query. */
  updatedAtMs: number;
}

function runde(v: number | null, stellen: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const f = 10 ** stellen;
  return Math.round(v * f) / f;
}

function serie(werte: (number | null)[], stellen: number): (number | null)[] {
  return werte.map((v) => runde(v, stellen));
}

function speicher(): Storage | null {
  try {
    // Nicht `typeof localStorage`: im Privatmodus mancher Browser existiert das
    // Objekt und wirft erst beim Zugriff.
    const s = globalThis.localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

/**
 * Das Bundle ablegen. Scheitert das — Quota voll, Privatmodus, kein Storage —,
 * bleibt es dabei: der Speicher ist eine Bequemlichkeit, kein Vertrag. Der
 * Eintrag wird dann entfernt, damit kein halber Stand liegen bleibt.
 */
export function speichereForecast(key: string, bundle: ForecastBundle): void {
  const s = speicher();
  if (!s) return;
  if (bundle.times.length === 0) return; // OHNE_FORECAST hat nichts zu sichern

  // Inhaltsgleiche Reihen einmal ablegen (Modulkopf). Verglichen wird die
  // gerundete Speicherform — zwei Orte, die sich erst in der 3. Nachkommastelle
  // unterscheiden, sind für diesen Speicher derselbe Ort.
  const reihen: Reihe[] = [];
  const nachInhalt = new Map<string, number>();
  const orte: Record<string, number> = {};
  for (const [ortKey, fc] of Object.entries(bundle.forecast)) {
    const reihe: Reihe = {
      w: serie(fc.windKn, STELLEN.w),
      d: serie(fc.windDirDeg, STELLEN.d),
      h: serie(fc.waveM, STELLEN.h),
      r: serie(fc.waveDirDeg, STELLEN.r),
      p: serie(fc.wavePeriodS, STELLEN.p),
    };
    const inhalt = JSON.stringify(reihe);
    let idx = nachInhalt.get(inhalt);
    if (idx === undefined) {
      idx = reihen.length;
      nachInhalt.set(inhalt, idx);
      reihen.push(reihe);
    }
    orte[ortKey] = idx;
  }

  const daten: Gespeichert = {
    key,
    fetchedAtIso: bundle.fetchedAtIso,
    modelRunIso: bundle.modelRunIso,
    model: bundle.model,
    ...(bundle.provenance ? { provenance: bundle.provenance } : {}),
    times: bundle.times,
    reihen,
    orte,
  };

  try {
    s.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(daten));
  } catch (e) {
    console.warn(
      'Forecast liess sich nicht sichern (Speicher voll oder gesperrt) — ' +
        'ohne Netz steht die Planung dann wieder auf unbewertet:',
      e,
    );
    try {
      s.removeItem(SPEICHER_SCHLUESSEL);
    } catch {
      /* dann eben nicht */
    }
  }
}

/** Den gesicherten Stand verwerfen — nach einem unlesbaren Eintrag. */
function verwirf(): void {
  try {
    speicher()?.removeItem(SPEICHER_SCHLUESSEL);
  } catch {
    /* egal */
  }
}

/**
 * Den gesicherten Stand lesen, oder null. `key` muss exakt passen (Modulkopf,
 * Grund 1) und die Achse muss die Gegenwart noch erreichen (Grund 2).
 */
export function ladeForecast(
  key: string,
  now: () => Date = () => new Date(),
): GeladenerForecast | null {
  const s = speicher();
  if (!s) return null;
  let roh: string | null;
  try {
    roh = s.getItem(SPEICHER_SCHLUESSEL);
  } catch {
    return null;
  }
  if (!roh) return null;

  let d: Gespeichert;
  try {
    d = JSON.parse(roh) as Gespeichert;
  } catch {
    verwirf();
    return null;
  }

  // Grundform prüfen, bevor irgendetwas davon gelesen wird: ein Eintrag aus
  // einer älteren Version darf keinen Laufzeitfehler auslösen.
  if (
    typeof d?.key !== 'string' ||
    typeof d.fetchedAtIso !== 'string' ||
    !Array.isArray(d.times) ||
    !Array.isArray(d.reihen) ||
    typeof d.orte !== 'object' ||
    d.orte === null
  ) {
    verwirf();
    return null;
  }
  if (d.key !== key) return null; // anderer Stand — nicht verwerfen, er kann wieder passen

  const updatedAtMs = Date.parse(d.fetchedAtIso);
  if (!Number.isFinite(updatedAtMs)) {
    verwirf();
    return null;
  }

  const letzte = d.times[d.times.length - 1];
  const letzteMs = letzte ? Date.parse(letzte) : NaN;
  if (!Number.isFinite(letzteMs) || letzteMs < now().getTime()) {
    // Jede Stunde liegt hinter uns — der Stand sagt über heute nichts mehr.
    verwirf();
    return null;
  }

  const laenge = d.times.length;
  const leer = (): (number | null)[] => new Array(laenge).fill(null);
  const flags = (): boolean[] => new Array<boolean>(laenge).fill(false);
  const auf = (werte: unknown): (number | null)[] => {
    if (!Array.isArray(werte)) return leer();
    const out = leer();
    for (let i = 0; i < Math.min(werte.length, laenge); i++) {
      const v = werte[i];
      out[i] = typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
    return out;
  };

  const forecast: Record<string, PointForecast> = {};
  for (const [ortKey, idx] of Object.entries(d.orte)) {
    const reihe = typeof idx === 'number' ? d.reihen[idx] : undefined;
    if (!reihe) continue;
    /**
     * Je Ort EIGENE Arrays, auch wenn die Reihe geteilt gespeichert war —
     * dieselbe Zusage wie im Adapter: kein Ort teilt Speicher mit einem
     * anderen.
     *
     * `windAssumed`/`waveAssumed` sind alle false, und das ist keine Annahme
     * über den Cache, sondern über den Adapter: er liefert nur Fakten, die
     * Fortschreibung macht die Domäne danach (domain/persistence.ts). Ein Test
     * hält das fest, damit diese Zeile nicht still falsch wird.
     */
    forecast[ortKey] = {
      windKn: auf(reihe.w),
      windDirDeg: auf(reihe.d),
      waveM: auf(reihe.h),
      waveDirDeg: auf(reihe.r),
      wavePeriodS: auf(reihe.p),
      windAssumed: flags(),
      waveAssumed: flags(),
    };
  }
  if (Object.keys(forecast).length === 0) {
    verwirf();
    return null;
  }

  return {
    bundle: {
      fetchedAtIso: d.fetchedAtIso,
      modelRunIso: d.modelRunIso ?? null,
      model: typeof d.model === 'string' ? d.model : '',
      ...(d.provenance ? { provenance: d.provenance } : {}),
      times: d.times,
      forecast,
    },
    updatedAtMs,
  };
}
