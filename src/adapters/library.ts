/**
 * AD-4 / AD-5 — read-only library reader with tolerant Zod parsing.
 *
 * EINE Quelle: die Staging-JSONs unter `seeding/data/`. Sie liegen im Repo und
 * wandern über `import.meta.glob` ins Bundle — die App braucht damit weder ein
 * Backend noch eine Sitzung, und ein Deploy ist ein Push. Der frühere
 * Firestore-Pfad (`VITE_DATA_SOURCE=firestore`) ist entfallen: er war der
 * einzige Grund für den Google-Login, und der kostete bei jedem
 * Vercel-Preview eine neue autorisierte Domain.
 *
 * Firestore bleibt das Ziel der Seeding-Skripte (`npm run seed:import`) — die
 * App liest es nicht mehr. Das `approved`-Flag der Staging-Dateien gilt nur
 * für diesen Import; hier wird jede Datei gelesen.
 *
 * Die App schreibt nie (AD-5). Ein ungültiges Platz-Dokument wird geloggt und
 * als 'unbewertet' geführt — nie still versteckt, nie grün.
 */

import { z } from 'zod';
import {
  IslandSchema,
  PlaceSchema,
  LegSchema,
  VariantSchema,
  KiteSpotSchema,
  WindTopoZoneSchema,
  DEFAULT_PARAMS,
  IslandStagingFileSchema,
  LegsStagingFileSchema,
  VariantsStagingFileSchema,
  KiteSpotsStagingFileSchema,
  WindTopoStagingFileSchema,
  ConfigStagingFileSchema,
  PolarStagingFileSchema,
} from '../domain/schema/index.ts';
import type {
  Island,
  Place,
  InvalidPlace,
  Leg,
  Variant,
  KiteSpot,
  WindTopoZone,
  Params,
  Polar,
  Library,
} from '../domain/schema/index.ts';

export interface LibraryBundle {
  library: Library;
  params: Params;
  polar: Polar | null;
}

export async function loadLibraryBundle(): Promise<LibraryBundle> {
  return loadFromStaging();
}

// ---------------------------------------------------------------------------
// Tolerant parsing
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
// Staging-JSONs aus seeding/data/ — die einzige Quelle der App
// ---------------------------------------------------------------------------

async function loadFromStaging(): Promise<LibraryBundle> {
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
