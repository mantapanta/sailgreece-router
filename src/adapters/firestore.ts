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
 * NACHSCHUB AUS DEM BUNDLE (2026-08-09, Skipper: "die Kitespots & Restaurants
 * sind nicht sichtbar"): Ein Merge nach `main` bringt Code, keine Daten. Die
 * Kite-Sammlung und die Tavernen an den Plätzen kommen erst mit einem erneuten
 * `npm run seed:import` nach Firestore — bis dahin liefert die konfigurierte
 * Quelle für diese beiden Ebenen schlicht nichts, und "nichts" sah in der App
 * exakt aus wie "nicht recherchiert". Deshalb füllt der Firestore-Zweig genau
 * diese ZWEI Ebenen aus den freigegebenen Staging-Dateien nach, die ohnehin im
 * Bundle liegen, und schreibt in `library.nachgeladen`, dass er es getan hat.
 *
 * Die Grenze ist eng gezogen und sie ist der Punkt:
 *   - NUR rein informative Ebenen (schema/snapshot.ts, `NachgeladeneEbene`).
 *     Was ein Urteil trägt — Schutzsektoren, Etappen, Parameter, Polare —
 *     bleibt bei der Quelle, auch wenn sie schweigt.
 *   - NUR wenn die Ebene GANZ fehlt. Eine halb importierte Ebene wird nicht
 *     aufgefüllt: dann steht ein Import dahinter, und dessen Ergebnis gilt.
 *   - NUR aus Dateien mit `approved: true`. Dasselbe Freigabe-Gate wie beim
 *     Import (AD-10) — der Ersatz zeigt nie, was die Review nicht gesehen hat.
 *   - NIE stumm: die Anzeige nennt die Herkunft (ui/bibliothekProvenienz.ts).
 * Der local-Modus kennt keinen Nachschub — dort IST das Staging die Quelle.
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
  NachgeladeneEbene,
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
// Nachschub aus dem Bundle für die rein informativen Ebenen (Modulkopf)
// ---------------------------------------------------------------------------

/**
 * Fehlt die Kite-Ebene GANZ? Kein Spot geladen heisst: entweder nie importiert
 * oder von den Rules abgelehnt (der Adapter fängt beides ab). Beides ist eine
 * fehlende Ebene, keine leere Kuration — das Revier hat Kite-Spots.
 */
export function kiteEbeneFehlt(kiteSpots: KiteSpot[]): boolean {
  return kiteSpots.length === 0;
}

/**
 * Fehlt die Gastro-Ebene GANZ? Sie hat keine eigene Sammlung: die Tavernen
 * stecken in den `places`-Dokumenten (schema/gastro.ts). Trägt KEIN einziger
 * Platz eine, dann ist der Import älter als die Kuration — trägt einer eine,
 * ist die Ebene da, und ein Platz ohne Tavernen ist dann eine echte Lücke
 * ("nicht recherchiert") und wird nicht überschrieben.
 */
export function gastroEbeneFehlt(places: Place[]): boolean {
  return !places.some((p) => (p.restaurants?.length ?? 0) > 0);
}

/**
 * Legt die kuratierten Tavernen an die passenden Plätze — neue Objekte, die
 * Eingabe bleibt unberührt. Ein Platz ohne Eintrag im Bundle bleibt ohne
 * Gastro-Block; erfunden wird nichts.
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
 * Kite-Spots aus der FREIGEGEBENEN Staging-Datei — sonst leer.
 *
 * Exportiert, damit ein Test belegen kann, dass im Bundle wirklich etwas liegt:
 * ein Nachschub, der still nichts liefert, wäre genau der Fehler, den er
 * beheben soll.
 */
export async function freigegebeneStagingKiteSpots(): Promise<KiteSpot[]> {
  try {
    const mod = (await import('../../seeding/data/kitespots.json')) as { default: unknown };
    const file = KiteSpotsStagingFileSchema.safeParse(mod.default);
    if (!file.success) {
      console.warn('kitespots.json im Bundle ungültig — kein Nachschub:', file.error.issues);
      return [];
    }
    if (!file.data.approved) {
      console.warn('kitespots.json ist nicht freigegeben (approved: false) — kein Nachschub.');
      return [];
    }
    return file.data.kiteSpots;
  } catch (e) {
    console.warn('kitespots.json im Bundle nicht ladbar — kein Nachschub:', e);
    return [];
  }
}

/** Tavernen je Platz-Id aus den FREIGEGEBENEN Insel-Staging-Dateien. */
export async function freigegebeneStagingRestaurants(): Promise<Map<string, Restaurant[]>> {
  const byPlaceId = new Map<string, Restaurant[]>();
  for (const path of Object.keys(islandStagingModules).sort()) {
    try {
      const mod = (await islandStagingModules[path]!()) as { default: unknown };
      const file = IslandStagingFileSchema.safeParse(mod.default);
      // Ungültig oder nicht freigegeben: überspringen, nicht retten. Anders als
      // im local-Modus ist das hier ERSATZ für eine Datenbank — was die Review
      // nicht gesehen hat, darf im Deploy nicht auftauchen.
      if (!file.success || !file.data.approved) continue;
      for (const place of file.data.places) {
        if (place.restaurants?.length) byPlaceId.set(place.id, place.restaurants);
      }
    } catch (e) {
      console.warn(`Staging-Datei ${path} nicht ladbar — kein Gastro-Nachschub daraus:`, e);
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
    kiteSpotsSnap,
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
    /**
     * Kite-Spots: eigene Sammlung, weil ein Spot nicht zum Hafen gehört
     * (schema/kite.ts). Eine noch nicht importierte Sammlung ist leer, kein
     * Fehler — die Ebene fehlt dann einfach.
     *
     * ABGEFANGEN, und das ist Absicht: solange die neuen Security Rules nicht
     * deployt sind, lehnt Firestore diesen Lesezugriff ab
     * (`permission-denied`). In einem `Promise.all` würde das die GANZE
     * Bibliothek scheitern lassen — die App zeigte statt der Törnplanung ein
     * Fehlerpanel, wegen einer Ebene, die nichts bewertet. Der Preis ist
     * genannt: ohne Regel bleibt die Kite-Ebene leer, mit einer Meldung in der
     * Konsole.
     */
    getDocs(collection(db, 'kiteSpots')).catch((e) => {
      console.warn(
        'Kite-Spots nicht lesbar — Ebene bleibt leer. Sind die Firestore-Rules deployt (Collection kiteSpots)?',
        e,
      );
      return null;
    }),
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

  let kiteSpots = (kiteSpotsSnap?.docs ?? [])
    .map((d) => parseTolerant(KiteSpotSchema, { id: d.id, ...d.data() }, 'Kite-Spot'))
    .filter((s): s is KiteSpot => s !== null);

  /**
   * DER NACHSCHUB (Modulkopf) — nur diese beiden Ebenen, nur wenn sie ganz
   * fehlen, nur aus freigegebenen Dateien, und nie ohne es zu sagen.
   */
  let places = firestorePlaces;
  const nachgeladen: NachgeladeneEbene[] = [];

  if (kiteEbeneFehlt(kiteSpots)) {
    const ausBundle = await freigegebeneStagingKiteSpots();
    if (ausBundle.length > 0) {
      kiteSpots = ausBundle;
      nachgeladen.push('kiteSpots');
      console.warn(
        `Kite-Ebene aus Firestore leer — ${ausBundle.length} Spots aus dem Bundle nachgeladen. ` +
          'Endgültig behoben ist das erst mit `npm run seed:import` (Collection kiteSpots) ' +
          'plus deployten Rules.',
      );
    }
  }

  if (gastroEbeneFehlt(places)) {
    const byPlaceId = await freigegebeneStagingRestaurants();
    const gefuellt = mitRestaurants(places, byPlaceId);
    if (gefuellt.ergaenzt > 0) {
      places = gefuellt.places;
      nachgeladen.push('restaurants');
      console.warn(
        `Kein Platz-Dokument trug Tavernen — Gastro-Ebene für ${gefuellt.ergaenzt} Plätze aus ` +
          'dem Bundle nachgeladen. Restaurants haben kein eigenes Dokument: sie wandern nur ' +
          'mit einem erneuten Insel-Import (`npm run seed:import`) nach Firestore.',
      );
    }
  }

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
      // Leer heisst: alles kam aus der konfigurierten Quelle. Das Feld bleibt
      // dann weg, damit "nachgeladen" nie als leere Behauptung dasteht.
      ...(nachgeladen.length > 0 ? { nachgeladen } : {}),
    },
    params,
    polar,
  };
}
