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
  RouteSchema,
  ParamsSchema,
  PolarSchema,
  DEFAULT_PARAMS,
  IslandStagingFileSchema,
  RoutesStagingFileSchema,
  ConfigStagingFileSchema,
  PolarStagingFileSchema,
} from '../domain/schema/index.ts';
import type {
  Island,
  Place,
  InvalidPlace,
  Route,
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

  let routes: Route[] = [];
  try {
    const mod = (await import('../../seeding/data/routes.json')) as { default: unknown };
    const file = RoutesStagingFileSchema.safeParse(mod.default);
    if (file.success) {
      routes = file.data.routes;
    } else {
      console.error('routes.json ungültig:', file.error.issues);
      const loose = mod.default as { routes?: unknown[] };
      routes = (loose?.routes ?? [])
        .map((r) => parseTolerant(RouteSchema, r, 'Route'))
        .filter((r): r is Route => r !== null);
    }
  } catch (e) {
    console.error('routes.json fehlt oder nicht ladbar:', e);
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

  return { library: { islands, places, invalidPlaces, routes }, params, polar };
}

// ---------------------------------------------------------------------------
// Firestore backend (strictly read-only, AD-5)
// ---------------------------------------------------------------------------

async function loadFromFirestore(): Promise<LibraryBundle> {
  const { initializeApp, getApps } = await import('firebase/app');
  const { getFirestore, collection, getDocs, doc, getDoc } = await import(
    'firebase/firestore'
  );

  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new DataSourceError(
      'VITE_FIREBASE_PROJECT_ID fehlt — Firestore-Datenquelle nicht konfiguriert (siehe README).',
    );
  }
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      projectId,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    });
  const db = getFirestore(app);

  const [islandsSnap, placesSnap, routesSnap, paramsSnap, polarSnap] =
    await Promise.all([
      getDocs(collection(db, 'islands')),
      getDocs(collection(db, 'places')),
      getDocs(collection(db, 'routes')),
      getDoc(doc(db, 'config', 'parameters')),
      getDoc(doc(db, 'config', 'polar')),
    ]);

  const islands = islandsSnap.docs
    .map((d) => parseTolerant(IslandSchema, { id: d.id, ...d.data() }, 'Insel'))
    .filter((i): i is Island => i !== null);

  const { places, invalidPlaces } = parsePlaces(
    placesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  );

  const routes = routesSnap.docs
    .map((d) => parseTolerant(RouteSchema, { id: d.id, ...d.data() }, 'Route'))
    .filter((r): r is Route => r !== null);

  let params: Params = DEFAULT_PARAMS;
  if (paramsSnap.exists()) {
    const parsed = parseTolerant(ParamsSchema, paramsSnap.data(), 'Parameter');
    if (parsed) params = parsed;
  }

  let polar: Polar | null = null;
  if (polarSnap.exists()) {
    polar = parseTolerant(PolarSchema, polarSnap.data(), 'Polar');
  }

  return { library: { islands, places, invalidPlaces, routes }, params, polar };
}
