/**
 * FR25 / AD-5 / AD-10 — the ONLY programmatic writer of the Firestore data.
 * Strict Zod validation BEFORE any write (same schemas as the app, AD-4) and
 * a PER-FILE approved gate: unapproved island/routes/polar staging files are
 * SKIPPED with a clear message (partial import of reviewed islands is
 * possible); the config file is MANDATORY and must be approved. If nothing
 * is approved at all the import refuses with exit code != 0.
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
import type { Leg } from '../src/domain/schema/route.ts';
import { RETURN_CHAIN_ROUTE_ID } from '../src/domain/schema/route.ts';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, 'data');
const DRY_RUN = process.argv.includes('--dry');

/** Firestore hard limit is 500 ops per batch — commit in chunks below it. */
const BATCH_CHUNK_SIZE = 450;

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

function skipNotice(what: string, file: string): void {
  console.warn(
    `ÜBERSPRUNGEN: ${what} (${file}) ist nicht freigegeben (approved: false) — ` +
      `wird in diesem Lauf NICHT importiert. Freigabe: FR24-Review prüfen (npm run seed:review), dann 'approved: true' setzen.`,
  );
}

/** Legs must be identical wherever the same leg id appears (forecast keys!). */
function legFingerprint(leg: Leg): string {
  return JSON.stringify({
    from: leg.fromIslandId,
    to: leg.toIslandId,
    fromPlace: leg.fromPlaceId,
    toPlace: leg.toPlaceId,
    nm: leg.distanceNm,
    waypoints: leg.waypoints,
  });
}

async function main() {
  // ---- 1) Load + validate EVERYTHING, gate PER FILE ------------------------
  const islandsDir = join(DATA, 'islands');
  const islandFiles = readdirSync(islandsDir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (islandFiles.length === 0) fail('Keine Insel-Staging-Dateien gefunden.');

  const approvedIslands: { file: string; data: IslandStagingFile }[] = [];
  const skippedIslandIds = new Set<string>();
  // Uniqueness across ALL staged files (also skipped ones): duplicate ids are
  // a curation error and would silently overwrite each other in Firestore.
  const seenIslandIds = new Map<string, string>();
  const seenPlaceIds = new Map<string, string>();

  for (const file of islandFiles) {
    const data = loadStrict<IslandStagingFile>(
      IslandStagingFileSchema,
      join(islandsDir, file),
      `Insel-Staging ${file}`,
    );
    const islandId = data.island.id;
    const prev = seenIslandIds.get(islandId);
    if (prev) fail(`Insel-Id '${islandId}' doppelt (${prev} und ${file}).`);
    seenIslandIds.set(islandId, file);
    for (const place of data.places) {
      const prevPlace = seenPlaceIds.get(place.id);
      if (prevPlace) fail(`Platz-Id '${place.id}' doppelt (${prevPlace} und ${file}).`);
      seenPlaceIds.set(place.id, file);
      if (place.islandId !== islandId) {
        fail(
          `Platz '${place.id}' in ${file}: islandId '${place.islandId}' passt nicht zur Insel der Datei ('${islandId}').`,
        );
      }
    }
    if (!data.approved) {
      skipNotice(`Insel-Staging ${basename(file, '.json')}`, file);
      skippedIslandIds.add(islandId);
      continue;
    }
    approvedIslands.push({ file, data });
  }

  const routesFile = loadStrict<RoutesStagingFile>(
    RoutesStagingFileSchema,
    join(DATA, 'routes.json'),
    'Routen-Staging',
  );
  let routes: RoutesStagingFile | null = routesFile;
  if (!routesFile.approved) {
    skipNotice('Routen-Staging', 'routes.json');
    routes = null;
  }

  const config = loadStrict<ConfigStagingFile>(
    ConfigStagingFileSchema,
    join(DATA, 'config.json'),
    'Config-Staging',
  );
  // Config is MANDATORY: without approved parameters nothing may be imported.
  if (!config.approved) {
    fail(
      `Config-Staging (config.json) ist NICHT freigegeben (approved: false).\n` +
        `Die Parameter sind Pflicht für jeden Import. AD-10: Erst die FR24-Review-Sicht prüfen\n` +
        `(npm run seed:review), dann 'approved' auf true setzen. Es wird nichts importiert.`,
    );
  }

  const polarFile = loadStrict<PolarStagingFile>(
    PolarStagingFileSchema,
    join(DATA, 'polar.json'),
    'Polar-Staging',
  );
  let polar: PolarStagingFile | null = polarFile;
  if (!polarFile.approved) {
    skipNotice(
      'Polar-Staging (erst nach Verifikation gegen die Original-Exportdatei freigeben!)',
      'polar.json',
    );
    polar = null;
  }

  if (approvedIslands.length === 0 && !routes && !polar) {
    fail(
      'Keine einzige Staging-Datei ist freigegeben (approved: true) — es gibt nichts zu importieren.',
    );
  }

  // ---- 2) Cross-checks over what WILL be imported ---------------------------
  const placeIds = new Set(approvedIslands.flatMap((i) => i.data.places.map((p) => p.id)));
  const islandIds = new Set(approvedIslands.map((i) => i.data.island.id));

  if (routes) {
    const legById = new Map<string, { routeId: string; fp: string }>();
    for (const route of routes.routes) {
      for (const leg of route.legs) {
        // Leg id must encode its direction: forecast keys derive from it.
        if (leg.id !== `${leg.fromIslandId}--${leg.toIslandId}`) {
          fail(
            `Route ${route.id}, Etappe ${leg.id}: Id muss '${leg.fromIslandId}--${leg.toIslandId}' sein (from--to).`,
          );
        }
        if (leg.waypointKeys !== undefined) {
          fail(
            `Route ${route.id}, Etappe ${leg.id}: 'waypointKeys' ist NICHT kuratierbar (wird nur von abgeleiteten Etappen im Core gesetzt).`,
          );
        }
        // Same leg id in several routes must be the SAME leg: forecast keys
        // (leg:<id>:<n>) are deduplicated across routes — differing waypoints
        // would silently get the coordinates of the first occurrence.
        const fp = legFingerprint(leg);
        const prev = legById.get(leg.id);
        if (prev && prev.fp !== fp) {
          fail(
            `Etappe '${leg.id}' ist in Route ${prev.routeId} und ${route.id} UNTERSCHIEDLICH definiert (Wegpunkte/Plätze/Distanz) — Forecast-Keys würden kollidieren.`,
          );
        }
        if (!prev) legById.set(leg.id, { routeId: route.id, fp });

        if (!placeIds.has(leg.fromPlaceId) || !placeIds.has(leg.toPlaceId)) {
          const hint =
            skippedIslandIds.has(leg.fromIslandId) || skippedIslandIds.has(leg.toIslandId)
              ? ' (Insel-Datei ist nicht freigegeben — erst freigeben oder Routen-Import zurückstellen)'
              : '';
          fail(
            `Route ${route.id}, Etappe ${leg.id}: referenzierter Platz fehlt in den freigegebenen Insel-Staging-Dateien${hint}.`,
          );
        }
        if (!islandIds.has(leg.fromIslandId) || !islandIds.has(leg.toIslandId)) {
          fail(`Route ${route.id}, Etappe ${leg.id}: referenzierte Insel fehlt (oder ist nicht freigegeben).`);
        }
      }
    }
    // The PPR depends on the fallback chain: importing routes without it
    // would only surface at runtime as 'Keine Rückfallkette'.
    const hasChain = routes.routes.some(
      (r) => r.id === RETURN_CHAIN_ROUTE_ID || r.isReturnChain,
    );
    if (!hasChain) {
      fail(
        `Routen-Staging enthält keine Rückfallkette (Route '${RETURN_CHAIN_ROUTE_ID}' bzw. isReturnChain: true) — der PPR (FR19) wäre funktionslos.`,
      );
    }
  }

  // Config base references must exist in the staged library (AD-10: return
  // logic finds the base via these ids).
  if (!seenIslandIds.has(config.parameters.baseIslandId)) {
    fail(`config.baseIslandId '${config.parameters.baseIslandId}' existiert in keiner Insel-Staging-Datei.`);
  }
  if (!seenPlaceIds.has(config.parameters.basePlaceId)) {
    fail(`config.basePlaceId '${config.parameters.basePlaceId}' existiert in keiner Insel-Staging-Datei.`);
  }
  if (skippedIslandIds.has(config.parameters.baseIslandId)) {
    console.warn(
      `WARNUNG: Basis-Insel '${config.parameters.baseIslandId}' ist nicht freigegeben und wird in diesem Lauf nicht importiert.`,
    );
  }

  const placeCount = approvedIslands.reduce((s, i) => s + i.data.places.length, 0);
  console.log(
    `Validierung OK: ${approvedIslands.length}/${islandFiles.length} Inseln freigegeben (${placeCount} Plätze), ` +
      `Routen: ${routes ? routes.routes.length : 'übersprungen'}, Polare: ${polar ? `${polar.polar.twaDeg.length}×${polar.polar.twsKn.length}` : 'übersprungen'}, Config freigegeben.`,
  );
  if (DRY_RUN) {
    console.log('--dry: keine Schreibvorgänge.');
    return;
  }

  // ---- 3) Write via firebase-admin (bypasses the read-only rules by design)
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const app = initializeApp({
    credential: applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });
  const db = getFirestore(app);

  // Collect all writes, then commit in chunks below the 500-op batch limit.
  const writes: { collection: string; docId: string; data: Record<string, unknown> }[] = [];
  for (const { data } of approvedIslands) {
    const { id: islandDocId, ...islandRest } = data.island;
    writes.push({ collection: 'islands', docId: islandDocId, data: islandRest });
    for (const place of data.places) {
      const { id: placeDocId, ...placeRest } = place;
      writes.push({ collection: 'places', docId: placeDocId, data: placeRest });
    }
  }
  if (routes) {
    for (const route of routes.routes) {
      const { id: routeDocId, ...routeRest } = route;
      writes.push({ collection: 'routes', docId: routeDocId, data: routeRest });
    }
  }
  writes.push({ collection: 'config', docId: 'parameters', data: config.parameters });
  if (polar) {
    writes.push({ collection: 'config', docId: 'polar', data: polar.polar });
  }

  for (let i = 0; i < writes.length; i += BATCH_CHUNK_SIZE) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + BATCH_CHUNK_SIZE)) {
      batch.set(db.collection(w.collection).doc(w.docId), w.data);
    }
    await batch.commit();
    console.log(
      `Batch ${Math.floor(i / BATCH_CHUNK_SIZE) + 1}: ${Math.min(BATCH_CHUNK_SIZE, writes.length - i)} Dokumente geschrieben.`,
    );
  }

  // ---- 4) Orphan check: remote docs without staging counterpart -------------
  // The import NEVER deletes — renamed ids leave stale documents behind
  // (AD-5 drift). Report them so Philipp can clean up consciously.
  const stagedIds: Record<string, Set<string>> = {
    islands: new Set(seenIslandIds.keys()),
    places: new Set(seenPlaceIds.keys()),
    routes: new Set(routesFile.routes.map((r) => r.id)),
  };
  for (const [coll, ids] of Object.entries(stagedIds)) {
    const remoteDocs = await db.collection(coll).listDocuments();
    const orphans = remoteDocs.map((d) => d.id).filter((id) => !ids.has(id));
    if (orphans.length > 0) {
      console.warn(
        `WARNUNG: Verwaiste Dokumente in '${coll}' ohne Staging-Pendant (werden NIE automatisch gelöscht): ${orphans.join(', ')}`,
      );
    }
  }

  console.log(
    `Import abgeschlossen: islands=${approvedIslands.length}, places=${placeCount}, ` +
      `routes=${routes ? routes.routes.length : 0}, config/parameters${polar ? ', config/polar' : ''}.`,
  );
  console.log(
    'Hinweis (AD-5): Feldkorrekturen über die Firebase-Konsole müssen ins Staging-JSON zurückgetragen werden, sonst überschreibt der nächste Import sie.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
