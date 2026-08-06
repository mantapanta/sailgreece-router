/**
 * Benennung einer Etappe in Textform — Überschrift und Zwischenstopps.
 *
 * Die Namen kommen aus der GESEGELTEN Etappe (`sailedLeg`), nicht aus der
 * kuratierten Bibliothek. Der Unterschied ist derselbe, den legGeometry.ts
 * für die Geometrie repariert: endet Tag 2 am vorgeschlagenen Platz Grammata,
 * startet Tag 3 dort — auch wenn `syros--mykonos` in der Bibliothek ab
 * Ermoupoli gespeichert ist. Eine Überschrift aus der Bibliothek behauptete
 * einen Aufbruch von einem Hafen, an dem das Boot nie lag; Rechnung und Karte
 * (mapPath.ts) lesen längst die gesegelte Kette. Die Bibliotheks-Etappe bleibt
 * der Notnagel für Tage ohne Bewertung.
 */

import type { Leg } from '../domain/schema/route.ts';
import type {
  LegAssessment,
  PlanningSnapshot,
  StageAssessment,
} from '../domain/schema/snapshot.ts';

export function islandName(snapshot: PlanningSnapshot, islandId: string): string {
  return snapshot.library.islands.find((i) => i.id === islandId)?.name ?? islandId;
}

export function placeName(snapshot: PlanningSnapshot, placeId: string | null): string {
  if (!placeId) return '–';
  return snapshot.library.places.find((p) => p.id === placeId)?.name ?? placeId;
}

/**
 * "Kea (Vourkari)" — eine Insel ist kein Ziel, ein Liegeplatz ist eins.
 *
 * Trägt der Inselname selbst schon eine Klammer ("Athen (Basis)"), wird sie
 * beim Anhängen des Platzes weggelassen: "Athen (Basis) (Marina Alimos)" wäre
 * doppelt geklammert, und der Zusatz ist ohnehin redundant, sobald der
 * konkrete Liegeplatz dasteht.
 */
export function islandWithPlace(
  snapshot: PlanningSnapshot,
  islandId: string,
  placeId: string | null,
): string {
  const island = islandName(snapshot, islandId);
  if (!placeId) return island;
  return `${island.replace(/\s*\([^)]*\)\s*$/, '')} (${placeName(snapshot, placeId)})`;
}

/** Gesegelte Etappe, sonst die kuratierte aus der Bibliothek. */
function legOf(snapshot: PlanningSnapshot, la: LegAssessment): Leg | undefined {
  return la.sailedLeg ?? snapshot.library.legs.find((l) => l.id === la.legId);
}

/**
 * Etappenname von Liegeplatz zu Liegeplatz: "Kea (Vourkari) → Kythnos (Kolona)".
 *
 * Der Startplatz kommt aus der ERSTEN gesegelten Etappe des Tages — dem Platz,
 * an dem der Vortag endete —, das Ziel ist der tatsächlich gewählte Nachtplatz
 * (`stage.placeId`), nicht der nominelle Zielplatz der letzten Etappe. Sonst
 * nennte die Überschrift andere Häfen als die Kette, die wirklich gesegelt wird.
 */
export function stageTitle(snapshot: PlanningSnapshot, stage: StageAssessment): string {
  const to = islandWithPlace(snapshot, stage.toIslandId, stage.placeId);
  const first = stage.legs[0];
  const firstLeg = first ? legOf(snapshot, first) : undefined;
  if (!firstLeg) return to;
  return `${islandWithPlace(snapshot, firstLeg.fromIslandId, firstLeg.fromPlaceId)} → ${to}`;
}

/** Startplatz der ersten gesegelten Etappe des Tages — für die Hero-Herkunftszeile. */
export function stageFrom(
  snapshot: PlanningSnapshot,
  stage: StageAssessment,
): string | null {
  const first = stage.legs[0];
  const firstLeg = first ? legOf(snapshot, first) : undefined;
  if (!firstLeg) return null;
  return islandWithPlace(snapshot, firstLeg.fromIslandId, firstLeg.fromPlaceId);
}

/** Zwischenstopps eines Mehr-Etappen-Tages, ebenfalls mit Liegeplatz. */
export function stageVia(snapshot: PlanningSnapshot, stage: StageAssessment): string[] {
  return stage.legs.slice(0, -1).map((la) => {
    const leg = legOf(snapshot, la);
    return leg
      ? islandWithPlace(snapshot, leg.toIslandId, leg.toPlaceId)
      : la.legId.replace('--', ' → ');
  });
}
