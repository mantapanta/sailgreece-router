/**
 * ABGELEITETE ETAPPEN — die Verbindungen, die im Revier existieren, aber nicht
 * in der Bibliothek standen.
 *
 * WARUM ES DIESES WERKZEUG GIBT (Befund 2026-08-07). Der Skipper hat an einem
 * Beispiel gezeigt, dass die App nicht denkt wie ein Segler: die angebotene
 * Route fuhr von Polyaigos 40 sm nach Paros — davon 38 sm hart am Wind bei
 * N 23 kn — um am nächsten Tag wieder nach Westen auf Sifnos zurückzukehren.
 * Polyaigos → Sifnos wären 12,6 sm gewesen.
 *
 * Der Router hatte nichts falsch gemacht. Er hatte keine Wahl: Polyaigos hing
 * an genau zwei kuratierten Etappen, Milos (8,1 sm) und Paros (33,4 sm).
 *
 * Der Befund dahinter ist grösser als der Einzelfall. Die Bibliothek kannte 37
 * Insel-Paare; 41 weitere liegen unter 30 sm und existierten schlicht nicht —
 * Ios–Iraklia (10,8 sm), Folegandros–Ios (19,4), Antiparos–Naxos (18,1),
 * Ios–Naxos (21,4), Mykonos–Naxos (23,7). Das sind keine Exoten, das ist die
 * Hälfte der alltäglichen Tagesschläge. Der Graph war eine STICHPROBE des
 * Reviers, kein Modell davon, und der Router musste um die Löcher herumfahren.
 *
 * Dreimal haben wir dieselbe Sorte Fehler von Hand repariert (Donousa,
 * Delos/Rinia, Polyaigos/Kimolos). Dieses Werkzeug repariert die Ursache.
 *
 * DIE ENTSCHEIDUNG DES SKIPPERS (2026-08-07): „am Ende kann ich ja als Segler
 * überall hinfahren. Diese Routen sollten eher empfohlene Best Practices sein
 * und daher bevorzugt werden — aber warum sollte man nicht hinfahren, wenn der
 * Wind es erlaubt und es diese roten Strecken vermeidet?"
 *
 * Genau das ist die Gestalt: die kuratierten Etappen bleiben, was sie sind —
 * recherchierte Distanzen, Düsen-Warntexte, Ortskenntnis. Die abgeleiteten
 * füllen den Graphen auf das auf, was ein Boot wirklich fahren kann. Welche
 * gewinnt, entscheidet die Rangfolge (`solver.preferred`), nicht das Fehlen
 * einer Verbindung.
 *
 * WARUM IN DEN DATEN UND NICHT ZUR LAUFZEIT: die Wegpunkte einer Etappe sind
 * zugleich die Orte, für die ein Forecast geholt wird (AD-3,
 * `adapters/openMeteo.collectLocations`). Eine erst im Browser erfundene
 * Verbindung hätte dort keinen eigenen Wind — sie müsste sich einen leihen.
 * Dieselbe Begründung wie bei `seaRouteLegs.ts`.
 *
 * WAS DAS WERKZEUG TUT:
 *   1. jedes Insel-Paar des KERN-REVIERS (die Inseln, die schon im Graphen
 *      stehen, plus die in ihrer Mitte vergessenen) ohne bestehende Etappe
 *   2. Luftlinie über der Reichweite? — übersprungen, gezählt
 *   3. sonst: die Platz-Paarung mit dem KÜRZESTEN LANDFREIEN Kurs suchen
 *   4. Etappe schreiben mit `abgeleitet: true` und GEMESSENER Distanz
 *   5. Paare ohne landfreien Kurs werden GEMELDET, nicht verschwiegen
 *
 * WAS ES NICHT TUT: bestehende Etappen anfassen. Steht eine Verbindung
 * kuratiert in der Bibliothek, gilt sie — auch wenn die Geometrie einen
 * kürzeren Weg fände. Die Recherche ist mehr als Geometrie (Bahnen,
 * Kreuzschläge, Sicherheitsabstände), und dieses Werkzeug weiss davon nichts.
 *
 * Aufruf (idempotent):
 *   node seeding/tools/deriveLegs.ts --dry-run   # zeigt nur, was entstünde
 *   node seeding/tools/deriveLegs.ts             # schreibt legs.json
 */

import { readFileSync, writeFileSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Coordinates } from '../../src/domain/schema/common.ts';
import { distanceNm } from '../../src/domain/geo.ts';
import { pathCrossesLand, pathLengthNm, seaRoute } from '../../src/domain/searoute.ts';

/**
 * Wie weit eine abgeleitete Etappe höchstens reichen darf, in sm Luftlinie.
 *
 * Skipper-Entscheid 2026-08-07. Fünfzig Seemeilen sind ein langer, aber
 * fahrbarer Tag — die Törnanalyse rechnet mit 23–27 sm/Tag, und der Solver
 * bestraft lange Tage ohnehin über das Zeitbudget. Was darüber liegt, ist keine
 * Tagesetappe mehr, sondern eine Nachtfahrt, und die soll nicht aus einer
 * Geometrie-Rechnung entstehen.
 */
const MAX_ABLEITUNG_NM = 50;

interface RawLeg {
  id: string;
  fromIslandId: string;
  toIslandId: string;
  fromPlaceId: string;
  toPlaceId: string;
  distanceNm: number;
  waypoints: Coordinates[];
  windWarnings: string[];
  [key: string]: unknown;
}

interface RawPlace {
  id: string;
  islandId: string;
  coordinates: Coordinates;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../data');

/** Vier Nachkommastellen ≈ 11 m — die Genauigkeit der Landmaske. */
const round = (v: number): number => Number(v.toFixed(4));

function loadPlaces(): RawPlace[] {
  const out: RawPlace[] = [];
  for (const file of globSync(path.join(dataDir, 'islands/*.json')).sort()) {
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { places?: RawPlace[] };
    for (const place of doc.places ?? []) out.push(place);
  }
  return out;
}

function loadIslandCoords(): Map<string, Coordinates> {
  const out = new Map<string, Coordinates>();
  for (const file of globSync(path.join(dataDir, 'islands/*.json')).sort()) {
    const doc = JSON.parse(readFileSync(file, 'utf8')) as {
      island: { id: string; coordinates?: Coordinates };
      places?: RawPlace[];
    };
    const c = doc.island.coordinates ?? doc.places?.[0]?.coordinates;
    if (c) out.set(doc.island.id, c);
  }
  return out;
}

/**
 * Der kürzeste LANDFREIE Kurs zwischen zwei Inseln, über alle Platz-Paarungen.
 *
 * Warum über alle: welcher Hafen der richtige Ausgangspunkt ist, hängt an der
 * Geometrie, nicht am Zufall der Reihenfolge. Naxos hat vier Plätze, Sifnos
 * drei — und `naxos-stadt → sifnos-kamares` hat gar keinen landfreien Kurs,
 * während `naxos-kalandos → sifnos-faros` einen hat. Genau diese Erfahrung
 * (2026-08-07, von Hand gesucht) macht das Werkzeug hier automatisch.
 */
function besterKurs(
  von: RawPlace[],
  nach: RawPlace[],
): { from: RawPlace; to: RawPlace; waypoints: Coordinates[]; nm: number } | null {
  let best: { from: RawPlace; to: RawPlace; waypoints: Coordinates[]; nm: number } | null =
    null;
  for (const a of von) {
    for (const b of nach) {
      const routed = seaRoute([a.coordinates, b.coordinates]);
      if (routed.unresolved) continue;
      const waypoints = routed.path
        .slice(1, -1)
        .map((p) => ({ lat: round(p.lat), lon: round(p.lon) }));
      // Nach dem Runden noch einmal prüfen — 11 m sind unkritisch, aber
      // stillschweigend darf keine Kante ins Land rutschen.
      const finalPath = [a.coordinates, ...waypoints, b.coordinates];
      if (pathCrossesLand(finalPath)) continue;
      const nm = pathLengthNm(finalPath);
      if (!best || nm < best.nm) best = { from: a, to: b, waypoints, nm };
    }
  }
  return best;
}

function main(): void {
  const dryRun = process.argv.includes('--dry-run');
  const legsPath = path.join(dataDir, 'legs.json');
  const file = JSON.parse(readFileSync(legsPath, 'utf8')) as {
    legs: RawLeg[];
    [key: string]: unknown;
  };

  const places = loadPlaces();
  const islandCoords = loadIslandCoords();
  const placesByIsland = new Map<string, RawPlace[]>();
  for (const p of places) {
    const list = placesByIsland.get(p.islandId) ?? [];
    list.push(p);
    placesByIsland.set(p.islandId, list);
  }

  /**
   * DAS KERN-REVIER SIND DIE INSELN, DIE SCHON IM GRAPHEN STEHEN — und nur die.
   *
   * Dieses Werkzeug FÜLLT LÖCHER, es erweitert das Revier nicht. Der Unterschied
   * ist keine Feinheit: ein erster Anlauf hat die Nachbarschaft „innerhalb von
   * 50 sm von mindestens zwei Graph-Inseln" genommen — und weil Athen und
   * Attika Graph-Inseln sind, kam der ganze Saronische Golf mit herein (Hydra,
   * Poros, Spetses, Aigina …). Statt 46 wurden es 349 Etappen. Das ist ein
   * anderer Törn, keine Reparatur.
   *
   * WAS DAMIT BEWUSST DRAUSSEN BLEIBT: acht kuratierte Kykladen-Inseln, die
   * heute an keiner einzigen Etappe hängen und klar ins Revier gehören —
   * Kimolos (3,4 sm von Polyaigos), Despotiko (3,1 von Antiparos), Keros (3,8
   * von Koufonisia), Thirasia (4,7 von Santorin), Sikinos (9,0 von Ios), Tinos
   * (9,8 von Delos/Rinia), Anafi (16,7 von Santorin), Andros (25,2 von Syros).
   * Sie aufzunehmen wäre eine Revier-ENTSCHEIDUNG des Skippers, keine
   * Fehlerbehebung — und sie vergrössert den Suchraum noch einmal deutlich.
   * Deshalb steht sie hier als benannter offener Punkt und nicht als stille
   * Nebenwirkung.
   */
  const kern = new Set<string>();
  for (const l of file.legs) {
    kern.add(l.fromIslandId);
    kern.add(l.toIslandId);
  }

  const vorhanden = new Set<string>();
  for (const l of file.legs) {
    vorhanden.add([l.fromIslandId, l.toIslandId].sort().join('|'));
  }

  const ids = [...kern].sort();
  const neu: RawLeg[] = [];
  const zuWeit: string[] = [];
  const ohneKurs: string[] = [];

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]!;
      const b = ids[j]!;
      if (vorhanden.has([a, b].sort().join('|'))) continue;
      const ca = islandCoords.get(a);
      const cb = islandCoords.get(b);
      if (!ca || !cb) continue;
      const luft = distanceNm(ca, cb);
      if (luft > MAX_ABLEITUNG_NM) {
        zuWeit.push(`${a}--${b} (${luft.toFixed(1)} sm)`);
        continue;
      }
      const von = placesByIsland.get(a) ?? [];
      const nach = placesByIsland.get(b) ?? [];
      if (von.length === 0 || nach.length === 0) {
        ohneKurs.push(`${a}--${b}: eine der Inseln hat keinen kuratierten Platz`);
        continue;
      }
      const kurs = besterKurs(von, nach);
      if (!kurs) {
        ohneKurs.push(`${a}--${b}: kein landfreier Kurs über alle Platz-Paarungen`);
        continue;
      }
      const dist = Math.round(kurs.nm * 10) / 10;
      neu.push({
        id: `${a}--${b}`,
        fromIslandId: a,
        toIslandId: b,
        fromPlaceId: kurs.from.id,
        toPlaceId: kurs.to.id,
        distanceNm: dist,
        waypoints: kurs.waypoints,
        windWarnings: [],
        abgeleitet: true,
        distanceNote:
          `ABGELEITET (seeding/tools/deriveLegs.ts, 2026-08-07): ${dist} sm ist die GEMESSENE ` +
          `Länge des landfreien Kurses ${kurs.from.id} -> ${kurs.to.id}, keine recherchierte ` +
          `Distanz. Diese Etappe verbindet zwei kuratierte Plätze, für die es keine kuratierte ` +
          `Verbindung gab; sie trägt deshalb auch keine Düsen-Warntexte. Wer sie recherchiert, ` +
          `nimmt 'abgeleitet' heraus und schreibt die geprüfte Distanz hin.`,
      });
    }
  }

  neu.sort((x, y) => x.id.localeCompare(y.id));

  for (const l of neu) {
    console.log(
      `  + ${l.id.padEnd(26)} ${l.fromPlaceId.padEnd(24)} -> ${l.toPlaceId.padEnd(24)} ` +
        `${String(l.distanceNm).padStart(5)} sm  ${l.waypoints.length} Wegpunkte`,
    );
  }
  if (ohneKurs.length > 0) {
    console.log('\nOHNE LANDFREIEN KURS — nicht angelegt, aber auch nicht verschwiegen:');
    for (const s of ohneKurs) console.log(`  ! ${s}`);
  }

  const wegpunkte = neu.reduce((n, l) => n + l.waypoints.length, 0);
  console.log(
    `\n${neu.length} Etappen abgeleitet (${wegpunkte} Wegpunkte), ` +
      `${zuWeit.length} Paare über ${MAX_ABLEITUNG_NM} sm übersprungen, ` +
      `${ohneKurs.length} ohne Kurs.`,
  );
  console.log(
    `Bibliothek: ${file.legs.length} -> ${file.legs.length + neu.length} Etappen, ` +
      `Kern-Revier ${kern.size} Inseln.`,
  );

  if (dryRun) {
    console.log('--dry-run: legs.json bleibt unverändert.');
    return;
  }
  file.legs = [...file.legs, ...neu].sort((x, y) => x.id.localeCompare(y.id));
  writeFileSync(legsPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  console.log(`${path.relative(process.cwd(), legsPath)} geschrieben.`);
}

main();
