/**
 * AD-4 / AD-5 — read-only library reader with tolerant Zod parsing.
 * Two backends behind the SAME contract and the SAME schemas:
 *   - VITE_DATA_SOURCE=local     -> staging JSONs from seeding/data/ (dev,
 *     runs without a Firebase project)
 *   - VITE_DATA_SOURCE=firestore -> Firestore top-level collections
 *     `islands`, `places`, `routes`, `config` (documents polar, parameters)
 * The app never writes (AD-5). An invalid place document is logged and kept
 * as 'unbewertet' — never silently hidden, never green.
 *
 * ZWEI EBENEN KOMMEN IMMER AUS DER JSON-DATEI, in BEIDEN Modi (2026-08-09,
 * Skipper: "die Kitespots & Restaurants sind nicht sichtbar" — "ich dachte, du
 * legst die Daten als JSON an und liest sie so aus, dafür kein Firebase"):
 *
 *   - KITE-SPOTS aus `seeding/data/kitespots.json`
 *   - TAVERNEN aus den `restaurants`-Blöcken in `seeding/data/islands/*.json`
 *
 * Beide waren im Deploy unsichtbar, weil ein Merge nach `main` Code bringt und
 * keine Daten: sie lagen in Firestore, und dorthin kommen sie nur mit einem
 * erneuten `npm run seed:import`. Für Ebenen, die NICHTS bewerten, ist dieser
 * Umweg der ganze Fehler — die Datei liegt ohnehin im Bundle, sie ist bei jedem
 * Deploy aktuell, und sie kann nicht halb importiert sein. Der Firestore-Zweig
 * liest sie deshalb gar nicht mehr aus der Datenbank; die `kiteSpots`-Sammlung
 * dort wird ignoriert, auch wenn der Import sie weiter befüllt.
 *
 * Die Grenze ist eng gezogen und sie ist der Punkt:
 *   - NUR diese beiden Ebenen. Sie bewerten nichts (schema/kite.ts,
 *     schema/gastro.ts) — weder Ampel noch Solver noch Gültigkeit liest ein
 *     Feld von ihnen. Alles, was ein Urteil trägt (Plätze mit ihren Schutz-
 *     sektoren, Etappen, Parameter, Polare), bleibt bei Firestore: dort wird
 *     eine zurückgezogene Kuratierung ohne Redeploy wirksam, und genau das ist
 *     bei sicherheitsrelevanten Daten der Sinn der Datenbank (AD-8).
 *   - NUR aus Dateien mit `approved: true` (AD-10). Ein noch nicht
 *     freigegebener Stand erreicht das Deploy nicht, so wie er den Import nicht
 *     erreicht — im local-Modus gilt das Gate wie bisher nicht.
 */

import { z } from 'zod';
import {
  IslandSchema,
  PlaceSchema,
  LegSchema,
  VariantSchema,
  KiteSpotSchema,
  WindTopoZoneSchema,
  ParamsSchema,
  PolarSchema,
  DEFAULT_PARAMS,
  IslandStagingFileSchema,
  LegsStagingFileSchema,
  VariantsStagingFileSchema,
  KiteSpotsStagingFileSchema,
  WindTopoStagingFileSchema,
  ConfigStagingFileSchema,
  PolarStagingFileSchema,
  polarFromFirestore,
} from '../domain/schema/index.ts';
import { getFirestoreDb, isFirebaseConfigured } from './firebase.ts';
import type {
  Island,
  Place,
  InvalidPlace,
  Leg,
  Variant,
  KiteSpot,
  Restaurant,
  WindTopoZone,
  Params,
  Polar,
  Library,
} from '../domain/schema/index.ts';

export class DataSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataSourceError';
  }
}

export interface LibraryBundle {
  library: Library;
  params: Params;
  polar: Polar | null;
}

export function dataSource(): 'local' | 'firestore' {
  return import.meta.env.VITE_DATA_SOURCE === 'firestore' ? 'firestore' : 'local';
}

export async function loadLibraryBundle(): Promise<LibraryBundle> {
  return dataSource() === 'firestore' ? loadFromFirestore() : loadFromLocal();
}

// ---------------------------------------------------------------------------
// Tolerant parsing (shared by both backends)
// ---------------------------------------------------------------------------

function parsePlaces(raw: unknown[]): { places: Place[]; invalidPlaces: InvalidPlace[] } {
  const places: Place[] = [];
  const invalidPlaces: InvalidPlace[] = [];
  for (const doc of raw) {
    const parsed = PlaceSchema.safeParse(doc);
    if (parsed.success) {
      places.push(parsed.data);
    } else {
      const d = doc as Record<string, unknown> | null;
      const id = typeof d?.id === 'string' ? d.id : `unbekannt-${invalidPlaces.length}`;
      const error = parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      console.error(`Ungültiges Platz-Dokument '${id}' — wird als 'unbewertet' angezeigt:`, error);
      invalidPlaces.push({
        id,
        name: typeof d?.name === 'string' ? d.name : undefined,
        islandId: typeof d?.islandId === 'string' ? d.islandId : undefined,
        error,
      });
    }
  }
  return { places, invalidPlaces };
}

function parseTolerant<T>(schema: z.ZodType<T>, raw: unknown, what: string): T | null {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  console.error(`Ungültiges ${what}-Dokument:`, parsed.error.issues);
  return null;
}

/**
 * Die Insel-Staging-Dateien als LAZY Importe — Modulebene, weil beide Zweige
 * sie brauchen: der local-Modus als Quelle, der Firestore-Modus als Nachschub
 * für die Gastro-Ebene. Vite macht daraus eigene Chunks; im Firestore-Deploy
 * wird also nichts davon geladen, solange die Tavernen aus Firestore kommen.
 */
const islandStagingModules = import.meta.glob('../../seeding/data/islands/*.json');

// ---------------------------------------------------------------------------
// Local backend: staging JSONs (same schemas, same contract)
// ---------------------------------------------------------------------------

async function loadFromLocal(): Promise<LibraryBundle> {
  const islandModules = islandStagingModules;
  const islands: Island[] = [];
  const rawPlaces: unknown[] = [];
  for (const path of Object.keys(islandModules).sort()) {
    const mod = (await islandModules[path]!()) as { default: unknown };
    const file = IslandStagingFileSchema.safeParse(mod.default);
    if (file.success) {
      islands.push(file.data.island);
      rawPlaces.push(...file.data.places);
    } else {
      // Keep tolerant even for staging files: salvage what validates.
      console.error(`Staging-Datei ${path} teilweise ungültig:`, file.error.issues);
      const loose = mod.default as { island?: unknown; places?: unknown[] };
      const island = parseTolerant(IslandSchema, loose?.island, 'Insel');
      if (island) islands.push(island);
      if (Array.isArray(loose?.places)) rawPlaces.push(...loose.places);
    }
  }
  const { places, invalidPlaces } = parsePlaces(rawPlaces);

  // Legs and variants are separate files since the leg/variant split (AD-4):
  // legs exist once, variants reference them by id.
  let legs: Leg[] = [];
  try {
    const mod = (await import('../../seeding/data/legs.json')) as { default: unknown };
    const file = LegsStagingFileSchema.safeParse(mod.default);
    if (file.success) {
      legs = file.data.legs;
    } else {
      console.error('legs.json ungültig:', file.error.issues);
      const loose = mod.default as { legs?: unknown[] };
      legs = (loose?.legs ?? [])
        .map((l) => parseTolerant(LegSchema, l, 'Etappe'))
        .filter((l): l is Leg => l !== null);
    }
  } catch (e) {
    console.error('legs.json fehlt oder nicht ladbar:', e);
  }

  let variants: Variant[] = [];
  try {
    const mod = (await import('../../seeding/data/variants.json')) as { default: unknown };
    const file = VariantsStagingFileSchema.safeParse(mod.default);
    if (file.success) {
      variants = file.data.variants;
    } else {
      console.error('variants.json ungültig:', file.error.issues);
      const loose = mod.default as { variants?: unknown[] };
      variants = (loose?.variants ?? [])
        .map((v) => parseTolerant(VariantSchema, v, 'Variante'))
        .filter((v): v is Variant => v !== null);
    }
  } catch (e) {
    console.error('variants.json fehlt oder nicht ladbar:', e);
  }

  // Kite-Spots sind eine EIGENE Bibliothek (schema/kite.ts) und rein
  // informativ: fehlt die Datei, fehlt die Ebene — nichts anderes darf daran
  // scheitern, deshalb wie legs/variants tolerant und ohne Fehlerpanel.
  let kiteSpots: KiteSpot[] = [];
  try {
    const mod = (await import('../../seeding/data/kitespots.json')) as { default: unknown };
    const file = KiteSpotsStagingFileSchema.safeParse(mod.default);
    if (file.success) {
      kiteSpots = file.data.kiteSpots;
    } else {
      console.error('kitespots.json ungültig:', file.error.issues);
      const loose = mod.default as { kiteSpots?: unknown[] };
      kiteSpots = (loose?.kiteSpots ?? [])
        .map((s) => parseTolerant(KiteSpotSchema, s, 'Kite-Spot'))
        .filter((s): s is KiteSpot => s !== null);
    }
  } catch (e) {
    console.warn('kitespots.json fehlt oder nicht ladbar — Kite-Ebene leer:', e);
  }

  /**
   * Topografische Windzonen (schema/windTopo.ts). Fehlt die Datei, fehlt die
   * Korrektur — und die App verhält sich exakt wie vor ihrer Einführung
   * (domain/windTopo.ts). Deshalb tolerant und ohne Fehlerpanel wie die
   * Kite-Ebene: eine Kuration, die nichts bewertet als den Düsen-Zuschlag, darf
   * die Törnplanung nicht scheitern lassen.
   */
  let windTopoZones: WindTopoZone[] = [];
  try {
    const mod = (await import('../../seeding/data/windtopo.json')) as { default: unknown };
    const file = WindTopoStagingFileSchema.safeParse(mod.default);
    if (file.success) {
      windTopoZones = file.data.zones;
    } else {
      console.error('windtopo.json ungültig:', file.error.issues);
      const loose = mod.default as { zones?: unknown[] };
      windTopoZones = (loose?.zones ?? [])
        .map((z) => parseTolerant(WindTopoZoneSchema, z, 'Windzone'))
        .filter((z): z is WindTopoZone => z !== null);
    }
  } catch (e) {
    console.warn('windtopo.json fehlt oder nicht ladbar — keine Topo-Korrektur:', e);
  }

  let params: Params = DEFAULT_PARAMS;
  try {
    const mod = (await import('../../seeding/data/config.json')) as { default: unknown };
    const file = ConfigStagingFileSchema.safeParse(mod.default);
    if (file.success) params = file.data.parameters;
    else console.error('config.json ungültig — Default-Parameter aktiv:', file.error.issues);
  } catch {
    console.warn('config.json fehlt — Default-Parameter aktiv');
  }

  let polar: Polar | null = null;
  try {
    const mod = (await import('../../seeding/data/polar.json')) as { default: unknown };
    const file = PolarStagingFileSchema.safeParse(mod.default);
    if (file.success) polar = file.data.polar;
    else console.error('polar.json ungültig — Fallback-Pauschalen aktiv:', file.error.issues);
  } catch {
    console.warn('polar.json fehlt — Fallback-Pauschalen aktiv');
  }

  return {
    library: { islands, places, invalidPlaces, legs, variants, kiteSpots, windTopoZones },
    params,
    polar,
  };
}

// ---------------------------------------------------------------------------
// Die beiden Ebenen aus der JSON-Datei (Modulkopf) — Quelle in beiden Modi
// ---------------------------------------------------------------------------

/**
 * Legt die kuratierten Tavernen an die passenden Plätze — neue Objekte, die
 * Eingabe bleibt unberührt.
 *
 * Die Datei gewinnt, wo sie etwas sagt. Ein Platz ohne Eintrag behält, was er
 * mitgebracht hat (im Regelfall nichts): so überschreibt ein Deploy keine
 * Konsolen-Notkorrektur an einem Platz, den die Datei gar nicht kennt.
 * Erfunden wird nichts.
 */
export function mitRestaurants(
  places: Place[],
  byPlaceId: Map<string, Restaurant[]>,
): { places: Place[]; ergaenzt: number } {
  let ergaenzt = 0;
  const next = places.map((p) => {
    const restaurants = byPlaceId.get(p.id);
    if (!restaurants || restaurants.length === 0) return p;
    ergaenzt++;
    return { ...p, restaurants };
  });
  return { places: next, ergaenzt };
}

/**
 * Kite-Spots aus der FREIGEGEBENEN `kitespots.json` — sonst leer.
 *
 * Exportiert, damit ein Test belegen kann, dass in der Datei wirklich etwas
 * steht: eine Quelle, die still nichts liefert, wäre genau der Fehler, den
 * dieser Weg beheben soll.
 */
export async function freigegebeneStagingKiteSpots(): Promise<KiteSpot[]> {
  try {
    const mod = (await import('../../seeding/data/kitespots.json')) as { default: unknown };
    const file = KiteSpotsStagingFileSchema.safeParse(mod.default);
    if (!file.success) {
      console.error('kitespots.json ungültig — Kite-Ebene bleibt leer:', file.error.issues);
      return [];
    }
    if (!file.data.approved) {
      console.warn(
        'kitespots.json ist nicht freigegeben (approved: false) — Kite-Ebene bleibt im Deploy leer.',
      );
      return [];
    }
    return file.data.kiteSpots;
  } catch (e) {
    console.error('kitespots.json nicht ladbar — Kite-Ebene bleibt leer:', e);
    return [];
  }
}

/** Tavernen je Platz-Id aus den FREIGEGEBENEN Insel-Dateien. */
export async function freigegebeneStagingRestaurants(): Promise<Map<string, Restaurant[]>> {
  const byPlaceId = new Map<string, Restaurant[]>();
  for (const path of Object.keys(islandStagingModules).sort()) {
    try {
      const mod = (await islandStagingModules[path]!()) as { default: unknown };
      const file = IslandStagingFileSchema.safeParse(mod.default);
      // Ungültig oder nicht freigegeben: überspringen, nicht retten. Was die
      // Review nicht gesehen hat, darf im Deploy nicht auftauchen (AD-10).
      if (!file.success || !file.data.approved) continue;
      for (const place of file.data.places) {
        if (place.restaurants?.length) byPlaceId.set(place.id, place.restaurants);
      }
    } catch (e) {
      console.warn(`Staging-Datei ${path} nicht ladbar — keine Tavernen daraus:`, e);
    }
  }
  return byPlaceId;
}

// ---------------------------------------------------------------------------
// Firestore backend (strictly read-only, AD-5)
// ---------------------------------------------------------------------------

async function loadFromFirestore(): Promise<LibraryBundle> {
  if (!isFirebaseConfigured()) {
    throw new DataSourceError(
      'Firebase-Konfiguration unvollständig — Firestore-Datenquelle nicht nutzbar (siehe .env.example).',
    );
  }
  // One shared FirebaseApp for auth and data: the reads below carry the signed-in
  // user's ID token, which the rules require (AD-5: read for signed-in, never write).
  const db = await getFirestoreDb();
  const { collection, getDocs, doc, getDoc } = await import('firebase/firestore');

  const [
    islandsSnap,
    placesSnap,
    legsSnap,
    variantsSnap,
    /**
     * KITE-SPOTS UND TAVERNEN STEHEN HIER NICHT (Modulkopf). Sie kommen aus den
     * JSON-Dateien im Bundle, nicht aus Firestore — die `kiteSpots`-Sammlung
     * wird nicht mehr gelesen, auch wenn der Import sie weiter befüllt. Damit
     * hängt keine der beiden Ebenen mehr an einem Import oder an einer
     * deployten Rule; sie sind da, sobald die App da ist.
     */
    stagingKiteSpots,
    stagingRestaurants,
    windTopoSnap,
    paramsSnap,
    polarSnap,
  ] = await Promise.all([
    getDocs(collection(db, 'islands')),
    getDocs(collection(db, 'places')),
    // Legs are their own top-level collection since the leg/variant split
    // (AD-4/AD-5); variants reference them by id.
    getDocs(collection(db, 'legs')),
    getDocs(collection(db, 'routes')),
    freigegebeneStagingKiteSpots(),
    freigegebeneStagingRestaurants(),
    /**
     * Topografische Windzonen: eigene Sammlung, aus demselben Grund abgefangen
     * wie die Kite-Spots — ohne deployte Rule antwortet Firestore mit
     * `permission-denied`, und in einem `Promise.all` risse das die ganze
     * Bibliothek mit. Der Preis ist genannt: ohne Regel keine Topo-Korrektur,
     * also exakt das Verhalten von vor ihrer Einfuehrung.
     */
    getDocs(collection(db, 'windTopoZones')).catch((e) => {
      console.warn(
        'Windzonen nicht lesbar — keine Topo-Korrektur. Sind die Firestore-Rules deployt (Collection windTopoZones)?',
        e,
      );
      return null;
    }),
    getDoc(doc(db, 'config', 'parameters')),
    getDoc(doc(db, 'config', 'polar')),
  ]);

  const islands = islandsSnap.docs
    .map((d) => parseTolerant(IslandSchema, { id: d.id, ...d.data() }, 'Insel'))
    .filter((i): i is Island => i !== null);

  const { places: firestorePlaces, invalidPlaces } = parsePlaces(
    placesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  );

  const legs = legsSnap.docs
    .map((d) => parseTolerant(LegSchema, { id: d.id, ...d.data() }, 'Etappe'))
    .filter((l): l is Leg => l !== null);

  const variants = variantsSnap.docs
    .map((d) => parseTolerant(VariantSchema, { id: d.id, ...d.data() }, 'Variante'))
    .filter((v): v is Variant => v !== null);

  // Die beiden Ebenen aus der Datei (Modulkopf): die Kite-Bibliothek, wie sie
  // in kitespots.json steht, und die Tavernen an ihre Plätze gelegt.
  const kiteSpots = stagingKiteSpots;
  const { places } = mitRestaurants(firestorePlaces, stagingRestaurants);

  const windTopoZones = (windTopoSnap?.docs ?? [])
    .map((d) => parseTolerant(WindTopoZoneSchema, { id: d.id, ...d.data() }, 'Windzone'))
    .filter((z): z is WindTopoZone => z !== null);

  let params: Params = DEFAULT_PARAMS;
  if (paramsSnap.exists()) {
    const parsed = parseTolerant(ParamsSchema, paramsSnap.data(), 'Parameter');
    if (parsed) params = parsed;
  }

  let polar: Polar | null = null;
  if (polarSnap.exists()) {
    // The matrix is stored row-wise because Firestore forbids nested arrays.
    polar = parseTolerant(PolarSchema, polarFromFirestore(polarSnap.data()), 'Polar');
  }

  return {
    library: {
      islands,
      places,
      invalidPlaces,
      legs,
      variants,
      kiteSpots,
      windTopoZones,
    },
    params,
    polar,
  };
}
