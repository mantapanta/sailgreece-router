/**
 * FREIE HANDPLANUNG — Insel zu Insel, ohne Solver (Skipper 2026-08-08).
 *
 * „Ich plane den Trip Insel zu Insel frei von Hand ohne Routen-Warnungen und
 * Empfehlungen — alle Verbindungen sind zugelassen."
 *
 * Der Plan entsteht hier nicht mehr aus einer Suche, sondern aus einer Kette
 * von Tageszielen, die der Skipper setzt. Dieses Modul ist die EINE Stelle,
 * die aus so einer Kette einen `Plan` macht (AD-12: der Plan ist eine
 * persistierte Entität, keine abgeleitete). Es bewertet nichts, es verbietet
 * nichts und es schlägt nichts vor — es verkettet.
 *
 * DREI REGELN, mehr sind es nicht:
 *
 *  1. JEDER TAG HAT EIN ZIEL. Ist es die Insel, an der der Vortag endete, ist
 *     der Tag ein Hafentag; sonst eine Etappe dorthin.
 *  2. JEDE VERBINDUNG IST ZUGELASSEN. Zuerst wird die Bibliothek gefragt
 *     (Gegenrichtungen eingeschlossen, kürzeste zuerst) — kennt sie die
 *     Verbindung nicht, wird sie als landfreier Kurs ERZEUGT (searoute.ts) und
 *     als benannte Etappe in die Bibliothek dieses Geräts gelegt. Nichts wird
 *     an einer Reichweite, einem Zeitbudget oder einer Rundkurs-Bedingung
 *     gemessen. Wie lange der Schlag dauert und was der Wind dazu sagt, steht
 *     hinterher an der Etappe — als Zahl, nicht als Verbot.
 *  3. DIE KETTE BLEIBT GESCHLOSSEN. Wer Tag 5 ändert, ändert die Ausgangsinsel
 *     von Tag 6 — dessen Etappe wird darum neu verbunden, mit demselben Ziel.
 *     Tage, deren Start UND Ziel unverändert bleiben, werden nicht angefasst:
 *     sie behalten ihren Zwischenstopp, ihren Liegeplatz, alles.
 *
 * Eine Luftlinie über Land wird nie stillschweigend behauptet: findet
 * `seaRoute` keinen Weg, schlägt die Änderung fehl (null) und die Ansicht sagt
 * es. Das ist der einzige Fall, in dem dieses Modul nein sagt.
 */

import { seaRoute } from './searoute.ts';
import { distanceNm } from './geo.ts';
import { legIndexWithReverses } from './legs.ts';
import type { Coordinates } from './schema/common.ts';
import type { Leg } from './schema/route.ts';
import type { Params } from './schema/params.ts';
import type { PlanningSnapshot } from './schema/snapshot.ts';
import {
  PLAN_SCHEMA_VERSION,
  SOLVER_ALGORITHM_VERSION,
  islandAtEndOfDay,
  type Plan,
  type PlanDay,
} from './schema/plan.ts';

/** Ein Tagesziel: eine Insel, oder `null` für „hier bleiben" (Hafentag). */
export interface DayTarget {
  islandId: string | null;
  /** Liegeplatz der Nacht; fehlt er, schlägt die Bewertung einen vor. */
  placeId?: string;
}

/**
 * Das Ergebnis einer Änderung: der fertige Plan plus die dabei ERZEUGTEN
 * Etappen. Beides gehört zusammen und wird als EIN Payload persistiert — nie
 * ein Plan, dessen Etappe fehlt.
 */
export interface ManualPlanChange {
  plan: Plan;
  customLegs: Leg[];
}

/**
 * Der leere Törn: jeder Tag ein Hafentag an der Basis, nichts entschieden.
 *
 * Das ist der Startpunkt der Handplanung und bewusst KEIN Vorschlag — bis der
 * Skipper das erste Ziel setzt, behauptet die App nichts über seinen Törn.
 */
export function emptyManualPlan(params: Params): Plan {
  const days: PlanDay[] = [];
  for (let day = 1; day <= params.tripLengthDays; day++) {
    days.push({
      kind: 'harbour',
      day,
      islandId: params.baseIslandId,
      source: 'skipper',
    });
  }
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    algorithmVersion: SOLVER_ALGORITHM_VERSION,
    days,
  };
}

/** True, solange kein einziger Tag ein Ziel abseits der Basis trägt. */
export function planIsEmpty(plan: Plan): boolean {
  return plan.days.every((d) => d.kind === 'harbour');
}

/**
 * DEN GESPEICHERTEN PLAN AUF DEN RAHMEN ZIEHEN.
 *
 * Ein Plan wird EINMAL angelegt (`emptyManualPlan`) und danach nur noch
 * bearbeitet — seine Tage stehen also so lange fest, wie er lebt. Wächst der
 * Törnrahmen danach, fehlen ihm die neuen Tage, und das ist keine
 * Schönheitsfrage: `setDayTarget` lehnt einen Tag ab, den der Plan nicht kennt
 * (`return null`), die Tagesansicht findet keine Etappe, und die neuen Tage
 * stehen in der Achse, ohne bebaubar zu sein.
 *
 * GEMESSEN AM 2026-08-12: der Rahmen wuchs mitten im Törn von zwölf auf
 * vierzehn Tage (Rückgabe Fr 21.8. statt Mi 19.8.), und der laufende Plan trug
 * zwölf Tage. Tag 13 und 14 waren sichtbar und nicht planbar.
 *
 * Die fehlenden Tage kommen als HAFENTAGE dort an, wo der Plan zuletzt steht —
 * die einzige Annahme, die nichts erfindet: das Boot bleibt liegen, bis der
 * Skipper etwas anderes sagt. Ein Ziel zu raten wäre ein Vorschlag, und
 * Vorschläge macht die Handplanung nicht.
 *
 * NUR ANFÜGEN, NIE ABSCHNEIDEN. Ein Plan, der über den Rahmen hinausreicht,
 * behält seine Tage: sie zu löschen wäre stiller Datenverlust an der Arbeit des
 * Skippers, und der Rahmen ist eine Konfiguration, kein Urteil über sie.
 *
 * Der Plan kommt UNVERÄNDERT (identisch) zurück, wenn nichts fehlt — damit
 * hängt an der Normalisierung kein neuer Render und keine neue Speicherung.
 */
export function planMitRahmen(plan: Plan, params: Params): Plan {
  const vorhanden = new Set(plan.days.map((d) => d.day));
  const fehlende: number[] = [];
  for (let day = 1; day <= params.tripLengthDays; day++) {
    if (!vorhanden.has(day)) fehlende.push(day);
  }
  if (fehlende.length === 0) return plan;

  const days = [...plan.days];
  for (const day of fehlende) {
    // Wo steht der Plan am Vorabend? `islandAtEndOfDay` liest das aus den
    // schon vorhandenen Tagen; für einen Tag vor dem ersten ist es die Basis.
    const davor = islandAtEndOfDay({ ...plan, days }, day - 1);
    days.push({
      kind: 'harbour',
      day,
      islandId: davor ?? params.baseIslandId,
      source: 'skipper',
    });
  }
  return { ...plan, days: days.sort((a, b) => a.day - b.day) };
}

/**
 * Die KÜRZESTE BEKANNTE KETTE zwischen zwei Inseln — Dijkstra über die
 * Etappen-Bibliothek (Gegenrichtungen eingeschlossen, Gewicht = Distanz).
 *
 * Das ist der zweite Anlauf, wenn zwischen zwei Inseln weder eine Etappe steht
 * noch `seaRoute` direkt einen Weg findet: die Bibliothek KENNT den Weg, nur in
 * Stücken. Attika → Amorgos gibt es nicht, Attika → Kea → … → Naxos → Amorgos
 * schon.
 *
 * Null, wenn eine der beiden Inseln gar nicht am Etappen-Graphen hängt oder
 * kein Weg existiert.
 */
function legKette(
  fromIslandId: string,
  toIslandId: string,
  legs: Map<string, Leg>,
): Leg[] | null {
  const nachbarn = new Map<string, Leg[]>();
  for (const leg of legs.values()) {
    const liste = nachbarn.get(leg.fromIslandId) ?? [];
    liste.push(leg);
    nachbarn.set(leg.fromIslandId, liste);
  }
  if (!nachbarn.has(fromIslandId)) return null;

  const dist = new Map<string, number>([[fromIslandId, 0]]);
  const vorher = new Map<string, Leg>();
  const offen = new Set<string>([fromIslandId]);
  while (offen.size > 0) {
    let hier: string | null = null;
    for (const id of offen) {
      if (hier === null || (dist.get(id) ?? Infinity) < (dist.get(hier) ?? Infinity)) hier = id;
    }
    offen.delete(hier!);
    if (hier === toIslandId) break;
    for (const leg of nachbarn.get(hier!) ?? []) {
      const neu = (dist.get(hier!) ?? Infinity) + leg.distanceNm;
      if (neu >= (dist.get(leg.toIslandId) ?? Infinity)) continue;
      dist.set(leg.toIslandId, neu);
      vorher.set(leg.toIslandId, leg);
      offen.add(leg.toIslandId);
    }
  }
  if (!vorher.has(toIslandId)) return null;

  const kette: Leg[] = [];
  let ziel = toIslandId;
  while (ziel !== fromIslandId) {
    const leg = vorher.get(ziel);
    if (!leg) return null;
    kette.unshift(leg);
    ziel = leg.fromIslandId;
  }
  return kette;
}

/** Der Punktzug einer Etappe: Startplatz, Wegpunkte, Zielplatz. */
function legPunkte(leg: Leg, orte: Map<string, Coordinates>): Coordinates[] | null {
  const von = orte.get(leg.fromPlaceId);
  const nach = orte.get(leg.toPlaceId);
  if (!von || !nach) return null;
  return [von, ...leg.waypoints, nach];
}

/**
 * Aus einer Etappen-Kette EINE Etappe machen: die Zwischenhäfen werden zu
 * Wegpunkten, und `seaRoute` schliesst die Lücken, die dabei entstehen — an
 * einer Zwischeninsel endet die eine Etappe womöglich in einem anderen Hafen,
 * als die nächste beginnt (dieselbe Naht, die `legGeometry` für Pläne
 * schliesst).
 *
 * Das Ergebnis ist EINE Etappe und kein Mehrfach-Schlag-Tag: der Törntag hat
 * ein Ziel, und die Zwischeninseln sind Punkte am Kurs, keine Stopps mit
 * Liegezeit.
 */
function verketteZuEinerEtappe(
  kette: Leg[],
  orte: Map<string, Coordinates>,
): { fromPlaceId: string; toPlaceId: string; waypoints: Coordinates[]; nm: number } | null {
  const punkte: Coordinates[] = [];
  for (const leg of kette) {
    const teil = legPunkte(leg, orte);
    if (!teil) return null;
    // Der Endpunkt des Vorgängers steht schon da; ist der Starthafen der
    // nächsten Etappe ein anderer, bleibt er als eigener Punkt stehen und
    // seaRoute legt den Hüpfer dazwischen landfrei.
    for (const p of teil) {
      const letzter = punkte[punkte.length - 1];
      if (letzter && letzter.lat === p.lat && letzter.lon === p.lon) continue;
      punkte.push(p);
    }
  }
  if (punkte.length < 2) return null;
  const kurs = seaRoute(punkte);
  if (kurs.unresolved || kurs.nm <= 0) return null;
  return {
    fromPlaceId: kette[0]!.fromPlaceId,
    toPlaceId: kette[kette.length - 1]!.toPlaceId,
    waypoints: kurs.path.slice(1, -1),
    nm: kurs.nm,
  };
}

/** Die erzeugte Etappe, überall gleich benannt und gleich vorbehalten. */
function erzeugteEtappe(
  fromIslandId: string,
  toIslandId: string,
  teile: { fromPlaceId: string; toPlaceId: string; waypoints: Coordinates[]; nm: number },
  herkunft: string,
): Leg {
  return {
    id: `${fromIslandId}--${toIslandId}`,
    fromIslandId,
    toIslandId,
    fromPlaceId: teile.fromPlaceId,
    toPlaceId: teile.toPlaceId,
    distanceNm: Math.round(teile.nm * 10) / 10,
    waypoints: teile.waypoints,
    abgeleitet: true,
    windWarnings: [
      `Vom Skipper geplante Verbindung (${herkunft}): Distanz aus der Geometrie — nicht kuratiert, keine Düsen-Hinweise hinterlegt`,
    ],
  };
}

/**
 * Die Verbindung zweier Inseln — kuratiert, sonst erzeugt. DREI Anläufe, in
 * dieser Reihenfolge, weil jeder das nächstbeste Bild vom Weg liefert:
 *
 *  1. DIE BIBLIOTHEK. Steht die Verbindung recherchiert da (auch als
 *     Gegenrichtung), gilt sie — mit ihrer geprüften Distanz und ihren
 *     Düsen-Hinweisen.
 *  2. DER DIREKTE KURS. `seaRoute` zwischen den Häfen beider Inseln, nach
 *     kürzester Luftlinie geordnet. Für Nachbarinseln ist das der richtige
 *     Weg — geradeaus, nur um die Kaps herum.
 *  3. DIE BEKANNTE KETTE. Findet sich direkt kein Weg, KENNT die Bibliothek
 *     ihn trotzdem, nur in Stücken: Attika → Amorgos gibt es nicht, Attika →
 *     Kea → … → Naxos → Amorgos schon. Die Kette wird zu EINER Etappe
 *     verkettet, die Zwischeninseln werden Wegpunkte.
 *
 * WARUM NICHT EIN „HAUPTHAFEN" JE INSEL (erste Fassung): sie nahm je Insel den
 * Platz, den die kuratierten Etappen am häufigsten benutzen. Das klingt
 * vernünftig und fiel am echten Revier durch — elf Inseln waren als Tagesziel
 * nicht wählbar, weil ausgerechnet dieses eine Paar auf den falschen Seiten der
 * Inseln lag. „Alle Verbindungen sind zugelassen" verträgt keine stillen
 * Sackgassen in der Auswahlliste.
 *
 * Die Endpunkte binden ohnehin nur die ERZEUGUNG: was am Ende gesegelt wird,
 * verankert `legGeometry.sailedLeg` an den Plätzen, an denen das Boot laut
 * Plan wirklich liegt.
 *
 * Null heisst: für diese beiden Inseln findet sich auf keinem der drei Wege ein
 * landfreier Kurs. Eine Luftlinie über Land wird nie stillschweigend behauptet.
 */
function direkterKurs(
  fromIslandId: string,
  toIslandId: string,
  snapshot: PlanningSnapshot,
): Leg | null {
  const von = snapshot.library.places.filter((p) => p.islandId === fromIslandId);
  const nach = snapshot.library.places.filter((p) => p.islandId === toIslandId);
  const paare = von
    .flatMap((a) => nach.map((b) => ({ a, b, nm: distanceNm(a.coordinates, b.coordinates) })))
    .sort((x, y) => x.nm - y.nm || x.a.id.localeCompare(y.a.id) || x.b.id.localeCompare(y.b.id));

  /**
   * Höchstens drei Versuche. Eine ERFOLGLOSE Suche ist die teure — `seaRoute`
   * arbeitet sich dabei durch die halbe Ägäis —, und wenn die drei kürzesten
   * Hafenpaare nicht tragen, tragen die längeren erst recht nicht. Was dann
   * noch geht, geht über die Kette.
   */
  for (const { a, b } of paare.slice(0, 3)) {
    const kurs = seaRoute([a.coordinates, b.coordinates]);
    if (kurs.unresolved || kurs.nm <= 0) continue;
    return erzeugteEtappe(
      fromIslandId,
      toIslandId,
      {
        fromPlaceId: a.id,
        toPlaceId: b.id,
        waypoints: kurs.path.slice(1, -1),
        nm: kurs.nm,
      },
      'Kurs landfrei gerechnet',
    );
  }
  return null;
}

/**
 * DER ANSCHLUSS einer Insel an den Etappen-Graphen.
 *
 * Zwanzig der zweiundvierzig Inseln der Bibliothek tragen keine einzige
 * kuratierte Etappe (Tinos, Anafi, Kimolos, Sikinos …) — die Kette kann dort
 * weder beginnen noch enden. Sie bekommen deshalb einen kurzen, selbst
 * gerechneten Schlag zur nächstgelegenen Insel, die AM Graphen hängt: von
 * Anafi sind das 17 sm nach Santorin, und ab dort kennt die Bibliothek jeden
 * weiteren Meter.
 *
 * Höchstens drei Kandidaten, nach Nähe — was die drei nächsten Inseln nicht
 * hergeben, gibt keine weiter entfernte her.
 */
function anschluss(
  islandId: string,
  graphInseln: Set<string>,
  richtung: 'ab' | 'an',
  snapshot: PlanningSnapshot,
): Leg | null {
  const insel = snapshot.library.islands.find((i) => i.id === islandId);
  if (!insel) return null;
  const kandidaten = snapshot.library.islands
    .filter((i) => graphInseln.has(i.id) && i.id !== islandId)
    .map((i) => ({ i, nm: distanceNm(insel.coordinates, i.coordinates) }))
    .sort((a, b) => a.nm - b.nm || a.i.id.localeCompare(b.i.id))
    .slice(0, 3);
  for (const { i } of kandidaten) {
    const leg =
      richtung === 'ab'
        ? direkterKurs(islandId, i.id, snapshot)
        : direkterKurs(i.id, islandId, snapshot);
    if (leg) return leg;
  }
  return null;
}

/**
 * Die Etappen-Kette zwischen zwei Inseln, Anschlüsse eingeschlossen: erst die
 * Insel an den Graphen anbinden, dann durch ihn hindurch, dann wieder heraus.
 */
function bruecke(
  fromIslandId: string,
  toIslandId: string,
  legs: Map<string, Leg>,
  snapshot: PlanningSnapshot,
): Leg[] | null {
  const graphInseln = new Set<string>();
  for (const leg of legs.values()) {
    graphInseln.add(leg.fromIslandId);
    graphInseln.add(leg.toIslandId);
  }

  let vorne: Leg | null = null;
  let hinten: Leg | null = null;
  let a = fromIslandId;
  let b = toIslandId;
  if (!graphInseln.has(a)) {
    vorne = anschluss(a, graphInseln, 'ab', snapshot);
    if (!vorne) return null;
    a = vorne.toIslandId;
  }
  if (!graphInseln.has(b)) {
    hinten = anschluss(b, graphInseln, 'an', snapshot);
    if (!hinten) return null;
    b = hinten.fromIslandId;
  }
  const mitte = a === b ? [] : legKette(a, b, legs);
  if (mitte === null) return null;

  const kette = [...(vorne ? [vorne] : []), ...mitte, ...(hinten ? [hinten] : [])];
  return kette.length > 0 ? kette : null;
}

function verbinde(
  fromIslandId: string,
  toIslandId: string,
  snapshot: PlanningSnapshot,
): { legId: string; custom: Leg | null } | null {
  const legs = legIndexWithReverses(snapshot.library);

  let beste: Leg | null = null;
  for (const leg of legs.values()) {
    if (leg.fromIslandId !== fromIslandId || leg.toIslandId !== toIslandId) continue;
    if (!beste || leg.distanceNm < beste.distanceNm) beste = leg;
  }
  if (beste) return { legId: beste.id, custom: null };

  const direkt = direkterKurs(fromIslandId, toIslandId, snapshot);
  if (direkt) return { legId: direkt.id, custom: direkt };

  const kette = bruecke(fromIslandId, toIslandId, legs, snapshot);
  if (kette) {
    const orte = new Map(snapshot.library.places.map((p) => [p.id, p.coordinates]));
    const verkettet = verketteZuEinerEtappe(kette, orte);
    if (verkettet) {
      const custom = erzeugteEtappe(
        fromIslandId,
        toIslandId,
        verkettet,
        `über ${kette.length} bekannte Etappen verkettet`,
      );
      return { legId: custom.id, custom };
    }
  }
  return null;
}

/**
 * Das Ziel, das ein Plantag heute trägt — `null` heisst „hier bleiben".
 *
 * EIN HAFENTAG IST KEIN ZIEL, sondern das Fehlen eines Ziels. Der Unterschied
 * entscheidet, was beim Umlegen eines früheren Tages passiert: verschiebt sich
 * die Kette, WANDERT ein Hafentag mit (er bleibt eben, wo das Boot steht),
 * während eine Etappe ihre Zielinsel behält und neu verbunden wird. Läse man
 * den Hafentag als „liege an Insel X", würde der leere Törn — fünf Hafentage
 * an der Basis — nach dem ersten gesetzten Ziel sofort zurück nach Hause
 * segeln, und das hat nie jemand gewollt.
 */
function zielVon(entry: PlanDay): string | null {
  return entry.kind === 'stage' ? entry.toIslandId : null;
}

/** Die Insel, an der ein Plantag heute endet. */
function inselVon(entry: PlanDay): string {
  return entry.kind === 'stage' ? entry.toIslandId : entry.islandId;
}

/** Der Liegeplatz, den ein Plantag heute trägt. */
function platzVon(entry: PlanDay): string | undefined {
  return entry.kind === 'stage' ? entry.toPlaceId : entry.placeId;
}

/**
 * DIE EINE SCHREIBOPERATION der Handplanung: ein Tagesziel setzen und die
 * Kette dahinter schliessen.
 *
 * `target.islandId === null` macht den Tag zum Hafentag an der Insel des
 * Vortags. Jede Insel der Bibliothek ist zulässig, auch eine, zu der es keine
 * recherchierte Etappe gibt (siehe `verbinde`).
 *
 * Null heisst: diese Kette lässt sich nicht darstellen, weil für einen ihrer
 * Schläge kein landfreier Kurs existiert. Der Plan bleibt dann unverändert.
 */
export function setDayTarget(
  plan: Plan,
  day: number,
  target: DayTarget,
  snapshot: PlanningSnapshot,
): ManualPlanChange | null {
  const alt = plan.days.slice().sort((a, b) => a.day - b.day);
  if (!alt.some((d) => d.day === day)) return null;
  const start = snapshot.params.baseIslandId;

  // Die gewünschte Zielkette: alles wie bisher, nur dieser eine Tag anders.
  // `null` heisst "bleiben" und wird erst beim Durchlaufen zur Insel, an der
  // die Kette an diesem Tag steht — vorher weiss niemand, welche das ist.
  const ziele = new Map<number, string | null>();
  const plaetze = new Map<number, string | undefined>();
  for (const entry of alt) {
    ziele.set(entry.day, zielVon(entry));
    plaetze.set(entry.day, platzVon(entry));
  }
  ziele.set(day, target.islandId);
  plaetze.set(day, target.placeId);

  const days: PlanDay[] = [];
  const customLegs: Leg[] = [];
  let hier = start;
  let altHier = start;

  for (const entry of alt) {
    const gewuenscht = ziele.get(entry.day) ?? hier;
    const altInsel = inselVon(entry);
    /**
     * UNBERÜHRT LASSEN, was sich nicht ändert. Steht die Kette an diesem Tag
     * noch genau dort, wo sie vorher stand, ändert sich am Tag nichts — er
     * behält seinen Zwischenstopp, seinen Liegeplatz und seine Herkunft. Nur
     * die Tage, unter denen der Boden weggezogen wurde, werden neu verbunden.
     */
    if (entry.day !== day && hier === altHier) {
      days.push(entry);
      hier = altInsel;
      altHier = altInsel;
      continue;
    }
    altHier = altInsel;

    // Ein Liegeplatz gehört zu SEINER Insel: verschiebt sich ein Tag auf eine
    // andere, fällt er weg statt mitzuwandern. Der bearbeitete Tag ist die
    // Ausnahme — dort hat der Skipper Insel und Platz zusammen gewählt.
    const platz =
      entry.day === day
        ? target.placeId
        : gewuenscht === altInsel
          ? plaetze.get(entry.day)
          : undefined;
    if (gewuenscht === hier) {
      days.push({
        kind: 'harbour',
        day: entry.day,
        islandId: hier,
        ...(platz ? { placeId: platz } : {}),
        source: 'skipper',
      });
      continue;
    }

    const verbindung = verbinde(hier, gewuenscht, snapshot);
    if (!verbindung) return null;
    if (verbindung.custom) customLegs.push(verbindung.custom);
    days.push({
      kind: 'stage',
      day: entry.day,
      legIds: [verbindung.legId],
      toIslandId: gewuenscht,
      ...(platz ? { toPlaceId: platz } : {}),
      viaPlaceIds: [],
      source: 'skipper',
    });
    hier = gewuenscht;
  }

  return {
    plan: { ...plan, algorithmVersion: SOLVER_ALGORITHM_VERSION, days },
    customLegs,
  };
}

/**
 * Den ZWISCHENSTOPP eines Tages setzen, verlegen oder löschen — dieselbe
 * Entscheidung wie bisher (FR28), nur ohne Bibliotheks-Vorbehalt: auch die
 * beiden Hälften eines Umwegs dürfen erzeugt werden, wenn niemand sie
 * recherchiert hat. „Alle Verbindungen sind zugelassen" gilt für den Umweg
 * genauso wie für den direkten Schlag.
 *
 * Das Tagesziel bleibt dasselbe, alle anderen Tage bleiben unberührt.
 * `stopIslandId === null` macht den Tag wieder zu EINER direkten Etappe.
 */
export function setDayStopover(
  plan: Plan,
  day: number,
  stop: { islandId: string | null; placeId?: string },
  snapshot: PlanningSnapshot,
): ManualPlanChange | null {
  const entry = plan.days.find((d) => d.day === day);
  if (!entry || entry.kind !== 'stage') return null;
  const von = islandAtEndOfDay(plan, day - 1) ?? snapshot.params.baseIslandId;
  const nach = entry.toIslandId;
  const customLegs: Leg[] = [];

  const stueck = (a: string, b: string): string | null => {
    const v = verbinde(a, b, snapshot);
    if (!v) return null;
    if (v.custom) customLegs.push(v.custom);
    return v.legId;
  };

  let legIds: string[];
  let viaPlaceIds: (string | null)[];
  if (stop.islandId === null) {
    const direkt = stueck(von, nach);
    if (!direkt) return null;
    legIds = [direkt];
    viaPlaceIds = [];
  } else {
    // Ein Stopp an der Ausgangs- oder Zielinsel ist kein Stopp: der Tag liefe
    // dieselbe Insel zweimal an, statt unterwegs anzuhalten.
    if (stop.islandId === von || stop.islandId === nach) return null;
    if (stop.placeId) {
      const platz = snapshot.library.places.find((p) => p.id === stop.placeId);
      if (!platz || platz.islandId !== stop.islandId) return null;
    }
    const hin = stueck(von, stop.islandId);
    const weiter = hin ? stueck(stop.islandId, nach) : null;
    if (!hin || !weiter) return null;
    legIds = [hin, weiter];
    viaPlaceIds = [stop.placeId ?? null];
  }

  return {
    plan: {
      ...plan,
      algorithmVersion: SOLVER_ALGORITHM_VERSION,
      days: plan.days.map((d) =>
        d.day === day && d.kind === 'stage'
          ? { ...d, legIds, viaPlaceIds, source: 'skipper' as const }
          : d,
      ),
    },
    customLegs,
  };
}
