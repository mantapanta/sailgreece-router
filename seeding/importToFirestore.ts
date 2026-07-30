/**
 * FR25 / AD-5 / AD-10 — the ONLY programmatic writer of the Firestore data.
 * Strict Zod validation BEFORE any write (same schemas as the app, AD-4) and
 * a hard approved-gate: any staging file with `approved: false` aborts the
 * import with a clear message and exit code != 0.
 *
 * Prerequisites (see README.md):
 *   - Firebase project + Firestore created by Philipp
 *   - service account key: export GOOGLE_APPLICATION_CREDENTIALS=/path/key.json
 *   - project id: export FIREBASE_PROJECT_ID=<id> (or taken from the key)
 *
 *   npm run seed:import            # imports everything that is approved
 *   npm run seed:import -- --dry   # validate + gate only, no writes
 */

import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IslandStagingFileSchema,
  RoutesStagingFileSchema,
  ConfigStagingFileSchema,
  PolarStagingFileSchema,
} from '../src/domain/schema/seeding.ts';
import type {
  IslandStagingFile,
  RoutesStagingFile,
  ConfigStagingFile,
  PolarStagingFile,
} from '../src/domain/schema/seeding.ts';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, 'data');
const DRY_RUN = process.argv.includes('--dry');

function fail(message: string): never {
  console.error(`\nIMPORT VERWEIGERT: ${message}`);
  process.exit(1);
}

function loadStrict<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { path: PropertyKey[]; message: string }[] } } },
  path: string,
  what: string,
): T {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(`${what} (${path}) nicht lesbar/parsebar: ${String(e)}`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    console.error(`Schema-Fehler in ${what} (${path}):`);
    for (const issue of parsed.error!.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    fail(`${what} verletzt das Zod-Schema — strikte Validierung vor jedem Import (AD-4).`);
  }
  return parsed.data!;
}

function gate(approved: boolean, what: string, file: string): void {
  if (!approved) {
    fail(
      `${what} (${file}) ist NICHT freigegeben (approved: false).\n` +
        `AD-10: Erst die FR24-Review-Sicht prüfen (npm run seed:review, Dateien in seeding/review/),\n` +
        `dann 'approved' in der Staging-Datei auf true setzen. Es wird nichts importiert.`,
    );
  }
}

async function main() {
  // ---- 1) Load + validate + gate EVERYTHING before the first write --------
  const islandsDir = join(DATA, 'islands');
  const islandFiles = readdirSync(islandsDir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (islandFiles.length === 0) fail('Keine Insel-Staging-Dateien gefunden.');

  const islands: { file: string; data: IslandStagingFile }[] = [];
  for (const file of islandFiles) {
    const data = loadStrict<IslandStagingFile>(
      IslandStagingFileSchema,
      join(islandsDir, file),
      `Insel-Staging ${file}`,
    );
    gate(data.approved, `Insel-Staging ${basename(file, '.json')}`, file);
    islands.push({ file, data });
  }

  const routes = loadStrict<RoutesStagingFile>(
    RoutesStagingFileSchema,
    join(DATA, 'routes.json'),
    'Routen-Staging',
  );
  gate(routes.approved, 'Routen-Staging', 'routes.json');

  const config = loadStrict<ConfigStagingFile>(
    ConfigStagingFileSchema,
    join(DATA, 'config.json'),
    'Config-Staging',
  );
  gate(config.approved, 'Config-Staging', 'config.json');

  const polar = loadStrict<PolarStagingFile>(
    PolarStagingFileSchema,
    join(DATA, 'polar.json'),
    'Polar-Staging',
  );
  gate(polar.approved, 'Polar-Staging (erst nach Verifikation gegen die Original-Exportdatei freigeben!)', 'polar.json');

  // Cross-checks: route place references must exist; distances Alimos-based.
  const placeIds = new Set(islands.flatMap((i) => i.data.places.map((p) => p.id)));
  const islandIds = new Set(islands.map((i) => i.data.island.id));
  for (const route of routes.routes) {
    for (const leg of route.legs) {
      if (!placeIds.has(leg.fromPlaceId) || !placeIds.has(leg.toPlaceId)) {
        fail(`Route ${route.id}, Etappe ${leg.id}: referenzierter Platz fehlt in den Insel-Staging-Dateien.`);
      }
      if (!islandIds.has(leg.fromIslandId) || !islandIds.has(leg.toIslandId)) {
        fail(`Route ${route.id}, Etappe ${leg.id}: referenzierte Insel fehlt.`);
      }
    }
  }

  const placeCount = islands.reduce((s, i) => s + i.data.places.length, 0);
  console.log(
    `Validierung OK: ${islands.length} Inseln, ${placeCount} Plätze, ${routes.routes.length} Routen, Polare ${polar.polar.twaDeg.length}×${polar.polar.twsKn.length}. Alle Dateien freigegeben.`,
  );
  if (DRY_RUN) {
    console.log('--dry: keine Schreibvorgänge.');
    return;
  }

  // ---- 2) Write via firebase-admin (bypasses the read-only rules by design)
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const app = initializeApp({
    credential: applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });
  const db = getFirestore(app);

  const batch = db.batch();
  for (const { data } of islands) {
    const { id: islandDocId, ...islandRest } = data.island;
    batch.set(db.collection('islands').doc(islandDocId), islandRest);
    for (const place of data.places) {
      const { id: placeDocId, ...placeRest } = place;
      batch.set(db.collection('places').doc(placeDocId), placeRest);
    }
  }
  for (const route of routes.routes) {
    const { id: routeDocId, ...routeRest } = route;
    batch.set(db.collection('routes').doc(routeDocId), routeRest);
  }
  batch.set(db.collection('config').doc('parameters'), config.parameters);
  batch.set(db.collection('config').doc('polar'), polar.polar);
  await batch.commit();

  console.log(
    `Import abgeschlossen: islands=${islands.length}, places=${placeCount}, routes=${routes.routes.length}, config/parameters, config/polar.`,
  );
  console.log(
    'Hinweis (AD-5): Feldkorrekturen über die Firebase-Konsole müssen ins Staging-JSON zurückgetragen werden, sonst überschreibt der nächste Import sie.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
