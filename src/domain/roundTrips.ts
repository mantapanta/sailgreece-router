/**
 * Zielmodell v2 — Rundkurs-Suche über den Graphen der kuratierten Etappen.
 *
 * Der alte Kandidatenraum (Hinweg entlang einer Variante + IMMER dieselbe
 * Rückfallkette heim) konnte strukturell fast nur Pendeln liefern: die Kette
 * ist die Umkehrung der Varianten. Echte Runden mit Inselvielfalt brauchen
 * freie Komposition — aber nur über RECHERCHIERTE Verbindungen. Deshalb ist
 * der Suchraum hier der Etappen-Graph (inklusive Gegenrichtungen,
 * legIndexWithReverses), nicht freie Geometrie: AD-13s "never a free-form
 * graph" wird damit revidiert auf "nie eine unkuratierte Etappe".
 *
 * Suchregeln (Skipper-Entscheidung 2026-08-05):
 *  - jede Insel höchstens EINMAL (die Liegeplatz-Regel prüft die Gültigkeit,
 *    die Suche hält den Raum klein),
 *  - plus höchstens EINE Stichfahrt: eine Insel anlaufen und auf derselben
 *    Verbindung zurück. Ohne sie wäre jede Sackgassen-Insel (Amorgos hängt
 *    nur an Naxos) aus jeder Runde ausgeschlossen.
 *  - Ende ist immer die Basis; erreicht ein Pfad sie, ist er fertig — die
 *    Basis wird nie durchfahren.
 *
 * Deterministisch: Nachbarn werden in fester Ordnung (Ziel-Insel, Etappen-Id)
 * besucht, das Ergebnis ist bei gleichem Snapshot identisch. Die Obergrenze
 * MAX_TRIPS ist eine Notbremse gegen pathologische Bibliotheken, keine
 * Steuerung — an der echten Bibliothek (16 Inseln, 23 Verbindungen) entstehen
 * unter 200 Runden.
 */

import type { Leg } from './schema/route.ts';
import type { PlanningSnapshot } from './schema/snapshot.ts';
import { legIndexWithReverses } from './legs.ts';

/** Notbremse gegen explodierende Bibliotheken — fail visible, not slow. */
const MAX_TRIPS = 600;

/** Obergrenze der Pfadlänge, unabhängig vom Zeitrahmen. */
const MAX_LEGS_CEILING = 14;

/**
 * Alle Rundkurse von `startIslandId` zurück zur Basis mit höchstens `maxLegs`
 * Etappen. Von der Basis aus sind das echte Runden; von unterwegs (Position
 * mitten im Törn) sind es die möglichen Fortsetzungen bis nach Hause.
 */
export function enumerateRoundTrips(
  snapshot: PlanningSnapshot,
  startIslandId: string,
  maxLegs: number,
): Leg[][] {
  const base = snapshot.params.baseIslandId;
  const index = legIndexWithReverses(snapshot.library);

  // Adjazenz in fester Ordnung — die Determinismus-Garantie der Suche.
  const adjacency = new Map<string, Leg[]>();
  for (const leg of index.values()) {
    const list = adjacency.get(leg.fromIslandId) ?? [];
    list.push(leg);
    adjacency.set(leg.fromIslandId, list);
  }
  for (const list of adjacency.values()) {
    list.sort((a, b) => a.toIslandId.localeCompare(b.toIslandId) || a.id.localeCompare(b.id));
  }

  const bound = Math.min(Math.max(maxLegs, 1), MAX_LEGS_CEILING);
  const out: Leg[][] = [];
  const visited = new Set<string>([startIslandId]);
  const path: Leg[] = [];

  // Eine Runde ab der Basis braucht mindestens zwei Etappen (hin UND zurück);
  // von unterwegs ist schon die eine Etappe heim ein vollständiger Restplan.
  const minLegs = startIslandId === base ? 2 : 1;

  const dfs = (node: string, spurUsed: boolean): void => {
    if (out.length >= MAX_TRIPS) return;
    for (const leg of adjacency.get(node) ?? []) {
      const to = leg.toIslandId;
      if (to === base) {
        if (path.length + 1 >= minLegs) out.push([...path, leg]);
        continue;
      }
      if (visited.has(to)) continue;
      if (path.length + 1 >= bound) continue;

      // Normaler Schritt: weiter zur nächsten Insel.
      visited.add(to);
      path.push(leg);
      dfs(to, spurUsed);
      path.pop();

      // Stichfahrt: `to` anlaufen und auf der Gegenrichtung zurück — danach
      // geht es von `node` aus weiter. Braucht nach den zwei Etappen noch
      // mindestens eine bis zur Basis, sonst wäre sie nie abschliessbar.
      // Nie mit der BASIS als Angelpunkt: die Rückkehr der Stichfahrt läge
      // dann mitten im Törn an der Basis — und die wird nie durchfahren.
      const back = index.get(`${to}--${node}`);
      if (!spurUsed && back && node !== base && path.length + 3 <= bound) {
        path.push(leg, back);
        dfs(node, true);
        path.pop();
        path.pop();
      }
      visited.delete(to);
    }
  };

  dfs(startIslandId, false);
  return out;
}
