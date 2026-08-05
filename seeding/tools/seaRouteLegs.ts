/**
 * Legt die Kurse der Etappen-Bibliothek landfrei — einmalig anzuwendendes
 * Werkzeug auf seeding/data/legs.json.
 *
 * Warum in den DATEN und nicht nur zur Laufzeit: die Wegpunkte einer Etappe
 * sind zugleich die Punkte, für die ein Forecast geholt wird (AD-3). Ein Kurs,
 * der erst im Browser um ein Kap gelegt wird, hat dort keinen eigenen Wind —
 * er muss sich einen leihen. Stehen die Umfahrungspunkte in der Bibliothek,
 * bekommt jeder von ihnen echte Modellwerte, und die Laufzeit-Umfahrung
 * (domain/searoute.ts) bleibt das Sicherheitsnetz für Etappen, die ein Plan an
 * einen anderen Hafen verankert.
 *
 * Was das Werkzeug tut:
 *   1. Wegpunkte, die AUF LAND liegen, verwerfen — das sind Fehler, keine
 *      Kurskorridore (die Bibliothek hatte neun davon, u.a. mitten auf Naxos)
 *   2. den Kurs Start → Wegpunkte → Ziel landfrei legen und die Zwischenpunkte
 *      als neue Wegpunktliste schreiben
 *
 * Was es NICHT anfasst: `distanceNm`. Die Distanzen sind recherchiert und
 * geprüft; sie bleiben die Wahrheit über die Länge einer Etappe.
 *
 * Aufruf (idempotent):
 *   node seeding/tools/seaRouteLegs.ts            # schreibt legs.json
 *   node seeding/tools/seaRouteLegs.ts --dry-run  # zeigt nur, was sich ändert
 */

import { readFileSync, writeFileSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Coordinates } from '../../src/domain/schema/common.ts';
import { isOnLand, pathCrossesLand, seaRoute } from '../../src/domain/searoute.ts';
import { pathLengthNm } from '../../src/domain/searoute.ts';

interface RawLeg {
  id: string;
  fromPlaceId: string;
  toPlaceId: string;
  distanceNm: number;
  waypoints: Coordinates[];
  [key: string]: unknown;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../data');

function loadPlaces(): Record<string, Coordinates> {
  const out: Record<string, Coordinates> = {};
  for (const file of globSync(path.join(dataDir, 'islands/*.json')).sort()) {
    const doc = JSON.parse(readFileSync(file, 'utf8')) as {
      places?: { id: string; coordinates: Coordinates }[];
    };
    for (const place of doc.places ?? []) out[place.id] = place.coordinates;
  }
  return out;
}

/** Vier Nachkommastellen ≈ 11 m — die Genauigkeit der Landmaske. */
const round = (v: number): number => Number(v.toFixed(4));

function main(): void {
  const dryRun = process.argv.includes('--dry-run');
  const legsPath = path.join(dataDir, 'legs.json');
  const file = JSON.parse(readFileSync(legsPath, 'utf8')) as {
    legs: RawLeg[];
    [key: string]: unknown;
  };
  const places = loadPlaces();

  let changed = 0;
  let dropped = 0;
  let unresolved = 0;

  for (const leg of file.legs) {
    const from = places[leg.fromPlaceId];
    const to = places[leg.toPlaceId];
    if (!from || !to) {
      console.warn(`${leg.id}: Platz fehlt (${leg.fromPlaceId} / ${leg.toPlaceId}) — übersprungen`);
      continue;
    }
    const keep = leg.waypoints.filter((w) => !isOnLand(w));
    const droppedHere = leg.waypoints.length - keep.length;
    dropped += droppedHere;

    const routed = seaRoute([from, ...keep, to]);
    const waypoints = routed.path.slice(1, -1).map((p) => ({
      lat: round(p.lat),
      lon: round(p.lon),
    }));

    // Nach dem Runden noch einmal prüfen: 11 m sind unkritisch, aber
    // stillschweigend darf keine Kante ins Land rutschen.
    const finalPath = [from, ...waypoints, to];
    const stillCrossing = pathCrossesLand(finalPath);
    if (routed.unresolved || stillCrossing) {
      unresolved++;
      console.warn(
        `${leg.id}: KEIN landfreier Kurs gefunden (unresolved=${routed.unresolved}, nach Rundung=${stillCrossing}) — Wegpunkte bleiben unverändert`,
      );
      continue;
    }

    const before = JSON.stringify(leg.waypoints);
    const after = JSON.stringify(waypoints);
    if (before !== after) {
      changed++;
      console.log(
        `${leg.id.padEnd(24)} ${leg.waypoints.length} -> ${waypoints.length} Wegpunkte` +
          `${droppedHere > 0 ? ` (${droppedHere} auf Land verworfen)` : ''}` +
          `  Kurs ${pathLengthNm(finalPath).toFixed(1)} sm / kuratiert ${leg.distanceNm} sm`,
      );
      leg.waypoints = waypoints;
    }
  }

  console.log(
    `\n${changed} Etappen geändert, ${dropped} Wegpunkte auf Land verworfen, ${unresolved} ohne Lösung.`,
  );
  if (dryRun) {
    console.log('--dry-run: legs.json bleibt unverändert.');
    return;
  }
  writeFileSync(legsPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  console.log(`${path.relative(process.cwd(), legsPath)} geschrieben.`);
}

main();
