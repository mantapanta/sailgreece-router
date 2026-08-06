/**
 * AD-4 / AD-5 — read-only library reader with tolerant Zod parsing.
 * Two backends behind the SAME contract and the SAME schemas:
 *   - VITE_DATA_SOURCE=local     -> staging JSONs from seeding/data/ (dev,
 *     runs without a Firebase project)
 *   - VITE_DATA_SOURCE=firestore -> Firestore top-level collections
 *     `islands`, `places`, `routes`, `config` (documents polar, parameters)
 * The app never writes (AD-5). An invalid place document is logged and kept
 * as 'unbewertet' — never silently hidden, never green.
 */

import { z } from 'zod';
import {
  IslandSchema,
  PlaceSchema,
  LegSchema,
  VariantSchema,
  KiteSpotSchema,
  ParamsSchema,
  PolarSchema,
  DEFAULT_PARAMS,
  IslandStagingFileSchema,
  LegsStagingFileSchema,
  VariantsStagingFileSchema,
  KiteSpotsStagingFileSchema,
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

// ---------------------------------------------------------------------------
// Local backend: staging JSONs (same schemas, same contract)
// ---------------------------------------------------------------------------

async function loadFromLocal(): Promise<LibraryBundle> {
  const islandModules = import.meta.glob('../../seeding/data/islands/*.json');

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
    library: { islands, places, invalidPlaces, legs, variants, kiteSpots },
    params,
    polar,
  };
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
    getDoc(doc(db, 'config', 'parameters')),
    getDoc(doc(db, 'config', 'polar')),
  ]);

  const islands = islandsSnap.docs
    .map((d) => parseTolerant(IslandSchema, { id: d.id, ...d.data() }, 'Insel'))
    .filter((i): i is Island => i !== null);

  const { places, invalidPlaces } = parsePlaces(
    placesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  );

  const legs = legsSnap.docs
    .map((d) => parseTolerant(LegSchema, { id: d.id, ...d.data() }, 'Etappe'))
    .filter((l): l is Leg => l !== null);

  const variants = variantsSnap.docs
    .map((d) => parseTolerant(VariantSchema, { id: d.id, ...d.data() }, 'Variante'))
    .filter((v): v is Variant => v !== null);

  const kiteSpots = (kiteSpotsSnap?.docs ?? [])
    .map((d) => parseTolerant(KiteSpotSchema, { id: d.id, ...d.data() }, 'Kite-Spot'))
    .filter((s): s is KiteSpot => s !== null);

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
    library: { islands, places, invalidPlaces, legs, variants, kiteSpots },
    params,
    polar,
  };
}
