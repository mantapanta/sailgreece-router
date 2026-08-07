/**
 * AD-13 / ZIELMODELL V3 — der Round-Trip-Solver.
 *
 * Rein und deterministisch (stabile Tiebreaks). Er erweitert die Packungs-DP
 * (ppr.ts) von einer Machbarkeits-Prüfung zum Plan-Bauer und sucht über den
 * Graphen der KURATIERTEN Etappen — nie über freie Geometrie.
 *
 * WAS DIE APP LIEFERN SOLL (Skipper 2026-08-07): einen vollständigen Rundkurs.
 * Elf Törntage, elf Etappen, jede Insel höchstens einmal, möglichst viele
 * Inseln, und ein Rückweg, der so wenig wie möglich am Wind liegt.
 *
 * WAS SIE STATTDESSEN LIEFERTE, und warum. Drei Fehler, die zusammen die
 * Kernfunktion aushebelten:
 *
 *   1. DER KANDIDATENRAUM. Neben der Graph-Suche lief ein zweiter Generator:
 *      "kuratierte Variante bis zum Wendepunkt + Rückfallkette heim". Die
 *      Rückfallkette IST die Umkehrung der Varianten — jeder so erzeugte
 *      Kandidat war zwangsläufig dieselbe Strecke hin und zurück. Er lief
 *      zuerst und gewann im Dedup, verdrängte also die echten Runden.
 *      → entfallen (`candidateLayers`).
 *
 *   2. DIE ZIELGRÖSSE. `preferred` fragte auf Rang 3 nach der Süd-Reichweite
 *      und auf Rang 14 von 14 nach der Etappenzahl. "Weit runter und dann
 *      liegen bleiben" schlug damit jeden Törn, der den Rahmen wirklich segelt
 *      — neun Etappen in elf Tagen waren die Folge, nicht der Ausrutscher.
 *      → neue Rangfolge (siehe `preferred`).
 *
 *   3. DER WENDEPUNKT WURDE NIE AM PLAN GEPRÜFT. `SolveResult.turnIslandId`
 *      übernahm ungeprüft das Etikett des Kandidaten, und `completePlan`
 *      prüfte `packed.length`, nie das Packungs-VERDIKT. Ein auf halbem Weg
 *      abgebrochener Plan wurde damit akzeptiert, behauptete eine Wende, die
 *      er nie erreicht, und wurde unter dem Namen dieses Ziels angeboten.
 *      → `planTurn` am Plan, `packing.verdict` als Tor.
 *
 * DER SUCHRAUM ist klein und exakt aufzählbar: über die 39 kuratierten Etappen
 * gibt es SECHS wiederholungsfreie Runden, die den Elf-Tage-Rahmen füllen. Es
 * braucht deshalb keine Notbremse, sondern einen engeren Filter — und der ist
 * in Vorzugs-SCHICHTEN organisiert (roundTrips.ts): erst wiederholungsfreie
 * volle Runden, dann solche mit einer Stichfahrt, dann kürzere. Trägt eine
 * Schicht, werden die nachrangigen nicht mehr aufgezählt. Das ist die
 * strukturelle Fassung von "keine Insel doppelt" — stärker als jede
 * Gewichtung.
 *
 * GÜLTIGKEIT ist zweistufig und normativ (siehe `validatePlan`):
 *   (1) jede Etappe hält die FR16-Schwellen. Etappen jenseits des
 *       verlässlichen Horizonts werden unter der Persistenz-Annahme gerechnet:
 *       sie zählen, aber ihre Verletzungen sind `assumed` und damit nie
 *       sicherheitsrelevant — sie blockieren Grün, ohne Rot erzwingen zu
 *       können (FR18)
 *   (2) Ankunft an der Basis bis zur EINEN Deadline
 *  (2') der Notausstieg bleibt segelbar — über die Rückfallkette ODER über die
 *       eigene Fortsetzung des Plans
 *
 * Hafentage sind seit 2026-08-07 KEIN Kriterium mehr, weder in der Gültigkeit
 * noch als Parameter. Der Rahmen-Vertrag steht direkt in der Rangfolge.
 *
 * Eine dritte Stufe gab es bis 2026-08-06: der Gästewechsel (FR31) verlangte,
 * dass der Zustiegstag auf einer fährverbundenen Insel endet. Sie ist auf
 * Skipper-Entscheid ersatzlos entfallen — die Fährdaten der Inseln bleiben als
 * Information erhalten (`island.guestPickup`), aber keine Bewertung liest sie
 * mehr, und kein Plan wird mehr daran gemessen.
 *
 * Die Eskalation ist eine ÄUSSERE Schleife über dieselbe DP mit gelockerten
 * Params, nie ein Sonderweg darin — das ist die strukturelle Garantie, dass
 * die 65°/25-kn-Schwelle nie weggelockert werden kann.
 */

import type { Leg } from './schema/route.ts';
import type { Params } from './schema/params.ts';
import type { PlanningSnapshot } from './schema/snapshot.ts';
import type {
  Plan,
  PlanDay,
  PlanValidity,
  Stage,
  Violation,
} from './schema/plan.ts';
import {
  PLAN_SCHEMA_VERSION,
  RELAXATION_ORDER,
  SOLVER_ALGORITHM_VERSION,
  assumedViolations,
  firmViolations,
  isSafetyViolation,
  planDay,
  stagesOf,
} from './schema/plan.ts';
import type { RelaxationLevel } from './schema/plan.ts';
import {
  assessLeg,
  assessLegCached,
  stopHoursForDay,
  upwindRotReason,
} from './scoring.ts';
import {
  packLegs,
  remainingReturnLegs,
  returnFeasibleStarting,
  routeIslandSequence,
  type Feasibility,
  type PackedLeg,
} from './ppr.ts';
import { legIndexWithReverses } from './legs.ts';
import {
  konzeptLageFor,
  konzeptOfIslands,
  konzeptOfPlan,
  rueckwegAbweichung,
  WEST_LEE_KORRIDOR,
} from './konzept.ts';
import type { KonzeptId } from './schema/konzept.ts';
import { seaRoute } from './searoute.ts';
import { sailedLegsByDay } from './legGeometry.ts';
import { roundTripLayers, type RoundTripLayer } from './roundTrips.ts';
import { deadlineFrame } from './time.ts';
import { distanceNm, isClockwise } from './geo.ts';
import type { Coordinates } from './schema/common.ts';
import type { DayReturnCheck } from './schema/plan.ts';

// ---------------------------------------------------------------------------
// Relaxation
// ---------------------------------------------------------------------------

/**
 * Fixed relaxation order (AD-13). `upwind` and `pickup` are deliberately
 * ABSENT — they are never relaxed, and leaving them out of this list is the
 * structural guarantee, not a runtime check that could be forgotten.
 */
export { RELAXATION_ORDER, type RelaxationLevel } from './schema/plan.ts';

/**
 * Apply a relaxation level to the params the DP runs against.
 *
 * What matters is that each level actually changes what counts as RED, since
 * red is what makes the packer reject a day. Lifting only `targetDayHours`
 * would merely shift the green/yellow line and relax nothing.
 */
export function relaxParams(params: Params, level: RelaxationLevel): Params {
  switch (level) {
    case 'none':
      return params;
    case 'hardMax':
      // Spend the target budget up to the hard maximum: days that were red for
      // exceeding the target become acceptable, the hard ceiling still holds.
      return {
        ...params,
        targetDayHours: params.maxSailHours + params.maxMotorHours,
        targetMotorHours: params.maxMotorHours,
      };
    case 'doppelschlag':
      // Zwei Verbindungen an einem Tag. Standard ist EINE (params.maxLegsPerDay
      // = 1: ein Tag, eine Insel-zu-Insel-Verbindung) — der Zwischenstopp ist
      // eine Nachgabe, kein Normalfall, und steht deshalb hier in der Leiter.
      //
      // Nach 'hardMax', weil ein längerer einzelner Schlag der Vorgabe näher
      // bleibt als ein zerlegter Tag; vor 'nightLeg', weil zwei Tagschläge
      // milder sind als eine Nacht unterwegs. Die Summe beider Etappen bleibt
      // dabei im Hartmaximum — das prüft der Packer selbst.
      return {
        ...params,
        targetDayHours: params.maxSailHours + params.maxMotorHours,
        targetMotorHours: params.maxMotorHours,
        maxLegsPerDay: 2,
      };
    case 'nightLeg':
      // FR16 night-leg exception: a long light-wind passage (the family sleeps)
      // becomes admissible. This raises the HARD ceiling, which is what the
      // budget verdict tests for red — bounded by the configured night-leg
      // wind limit and duration, never unbounded.
      return {
        ...params,
        targetDayHours: params.lightWindMaxHours,
        targetMotorHours: params.maxMotorHours,
        maxSailHours: Math.max(params.maxSailHours, params.lightWindMaxHours),
        maxMotorHours: Math.max(params.maxMotorHours, params.lightWindMaxHours),
        lightWindMaxTwsKn: Math.max(params.lightWindMaxTwsKn, params.nightLegMaxTwsKn),
        // Jede Stufe muss alles zulassen, was die vorige zuliess — sonst
        // NÄHME die letzte Stufe eine Freiheit zurück und könnte weniger
        // lösen als die davor.
        maxLegsPerDay: 2,
      };
  }
}

/**
 * Relaxierte Snapshots je Basis-Snapshot GECACHT — nicht aus Sparsamkeit beim
 * Objektbau, sondern wegen der OBJEKTIDENTITÄT: scoring.assessLegCached memoisiert
 * je Snapshot-Objekt. Baute jeder completePlan-Aufruf (Hauptroute, Zeuge, sechs
 * Options-Preise) seine relaxierten Snapshots neu, hätte jeder Aufruf einen
 * kalten Cache und die teuerste Rechnung der App liefe vielfach doppelt.
 */
const relaxedSnapshots = new WeakMap<
  PlanningSnapshot,
  Map<RelaxationLevel, PlanningSnapshot>
>();

function relaxedSnapshot(
  snapshot: PlanningSnapshot,
  level: RelaxationLevel,
): PlanningSnapshot {
  if (level === 'none') return snapshot;
  let byLevel = relaxedSnapshots.get(snapshot);
  if (!byLevel) {
    byLevel = new Map();
    relaxedSnapshots.set(snapshot, byLevel);
  }
  let relaxed = byLevel.get(level);
  if (!relaxed) {
    relaxed = { ...snapshot, params: relaxParams(snapshot.params, level) };
    byLevel.set(level, relaxed);
  }
  return relaxed;
}

// ---------------------------------------------------------------------------
// Leg library & candidates
// ---------------------------------------------------------------------------

/**
 * Deduplicated leg library. Legs live inline in the route documents until the
 * seeding rework lands; the same leg currently appears up to four times, so
 * first-writer-wins keeps it deterministic.
 */
export function legLibrary(snapshot: PlanningSnapshot): Map<string, Leg> {
  return legIndexWithReverses(snapshot.library);
}

export interface Candidate {
  /** Herkunft dieses Kandidaten, für Dedup und Determinismus-Tiebreak. */
  variantId: string;
  /** Aus welcher Schicht von `roundTripLayers` er stammt. */
  layer: RoundTripLayer | 'rueckfall';
  /**
   * Insel, an der die Kette am weitesten südlich steht — nur ein FILTER-Griff
   * für den Optionsraum ("nur Kandidaten, die Santorin berühren"). Was der
   * fertige Plan wirklich erreicht, sagt `planTurn` am Plan selbst; genau
   * diese Verwechslung hat vorher Pläne unter falschem Ziel ausgeliefert.
   */
  turnIslandId: string;
  legs: Leg[];
}

/**
 * Der Wendepunkt eines Kandidaten ist seine SÜDLICHSTE Insel — nicht die
 * letzte. Ein Rundkurs endet wieder an der Basis; seine letzte Insel als
 * Wendepunkt zu lesen ergäbe Reichweite 0.
 */
/**
 * Die beiden Kennzahlen, nach denen `makeCandidate` den Wendepunkt bestimmt —
 * EINMAL je Snapshot vorbereitet statt je Kandidat.
 *
 * Vorher schlug jeder Aufruf die Insel-Koordinaten linear in
 * `library.islands` nach. Bei bis zu 1340 Runden je Schicht und elf
 * Solver-Aufrufen pro Bewertung (Hauptroute, neun Ziele, FR2-Zeuge) waren das
 * Hunderttausende Scans — messbar als Sekunden Ladezeit.
 */
const kennzahlenCache = new WeakMap<
  PlanningSnapshot,
  { reachOf: (id: string) => number; distOf: (id: string) => number }
>();

function kennzahlenFor(snapshot: PlanningSnapshot) {
  const cached = kennzahlenCache.get(snapshot);
  if (cached) return cached;
  const reachOf = reachNmFor(snapshot);
  const coords = new Map(snapshot.library.islands.map((i) => [i.id, i.coordinates]));
  const base = coords.get(snapshot.params.baseIslandId);
  const distOf = (islandId: string): number => {
    const island = coords.get(islandId);
    return base && island ? distanceNm(base, island) : 0;
  };
  const eintrag = { reachOf, distOf };
  kennzahlenCache.set(snapshot, eintrag);
  return eintrag;
}

function makeCandidate(
  variantId: string,
  layer: Candidate['layer'],
  legs: Leg[],
  snapshot: PlanningSnapshot,
): Candidate {
  const { reachOf, distOf } = kennzahlenFor(snapshot);
  const seq = routeIslandSequence(legs);
  const turnIslandId =
    seq.length > 0
      ? seq.reduce(
          (far, id) =>
            reachOf(id) > reachOf(far) ||
            (reachOf(id) === reachOf(far) && distOf(id) > distOf(far))
              ? id
              : far,
          seq[0]!,
        )
      : snapshot.params.baseIslandId;
  return { variantId, layer, turnIslandId, legs };
}

/**
 * Wie viele Kandidaten je Schicht UND JE ROUTEN-KONZEPT vollständig
 * durchgerechnet werden.
 *
 * Der Grund steht bei `vorauswahl`. JE KONZEPT, seit 2026-08-07: als eine
 * Zahl über die ganze Schicht hat diese Kappung das Konzept-Angebot der App
 * still zerstört — die Begründung steht dort.
 */
const KANDIDATEN_JE_SCHICHT = 120;

/**
 * DIE VORAUSWAHL — und warum sie nichts verschenkt.
 *
 * Seit die Bibliothek die abgeleiteten Etappen trägt (deriveLegs.ts), ist der
 * Raum nicht mehr klein: bei mittlerem Grad 13 gibt es über 300 000 volle
 * Runden statt 68. Der Solver rechnete bis dahin JEDEN Kandidaten in JEDER
 * Entspannungsstufe durch — das sind vier Packungen mit Wetter-Simulation je
 * Runde, und bei 300 000 Runden ist das keine Bewertung mehr, sondern ein
 * Serverraum.
 *
 * DER SCHLÜSSEL: sechs der obersten sieben Kriterien in `preferred` hängen gar
 * nicht am Wetter. Sie stehen schon an der KETTE fest, bevor irgendetwas
 * simuliert wurde:
 *
 *   Etappentage       = min(Kettenlänge, verfügbare Tage)
 *   verschiedene Inseln = Zahl der Ziele ohne Dopplung
 *   Lee-Abweichung    = reine Geographie (konzept.WEST_LEE_KORRIDOR)
 *   abgeleitete Etappen = steht am Leg
 *
 * Nur die Sicherheits-Befunde und die Kreuzstunden brauchen die Simulation.
 * Also wird nach dem statischen Teil vorsortiert und nur die Spitze voll
 * bewertet — die Kandidaten, die danach noch gewinnen könnten.
 *
 * WAS DAS NICHT IST: eine Kappung nach Gefühl. Die Vorauswahl benutzt DIESELBE
 * Ordnung wie die Rangfolge selbst, nur ihren wetterunabhängigen Anfang. Ein
 * Kandidat, der hier ausscheidet, hätte in `preferred` schon an Kriterium 3
 * oder 4 verloren — es sei denn, er wäre über die Kreuzstunden zurückgekommen,
 * und dafür müsste er erst einmal gleich viele Etappentage, gleich viele
 * Inseln und gleiche Lee-Treue haben. Genau die stehen in der Spitzengruppe.
 *
 * DIE QUOTE JE KONZEPT (Skipper 2026-08-07: "Route 1 sagt, dass sie trägt,
 * hat aber keine Routing-Option im Angebot"). Genau daran ist die Annahme des
 * letzten Absatzes gescheitert. Über den vollen Rahmen sind die beiden
 * OBERSTEN Kriterien bei JEDEM Kandidaten der Schicht A gleich — elf
 * Etappentage, elf verschiedene Inseln —, sie ordnen also nichts. Was übrig
 * bleibt, ist die Lee-Abweichung und danach das Alphabet der Etappen-Ids. Von
 * 2947 vollen Runden waren 188 klassik; nach der Kappung auf 120 blieben 13,
 * mit noch zwei verschiedenen Wendepunkten — und weil `zielInseln`
 * (options.ts) den Optionsraum aus GENAU diesen Kandidaten schöpft, hatte die
 * klassische Runde faktisch kein Angebot mehr, egal was die Wetterlage sagte.
 *
 * Die Kappung gilt deshalb JE KONZEPT. Sie bleibt eine Vorauswahl nach
 * derselben Ordnung, nur zieht sie ihre Spitzengruppe aus beiden Konzepten
 * statt aus dem Gesamtfeld — die Menge ist damit eine OBERMENGE der alten
 * (jeder alte Kandidat ist unter den besten 120 seines eigenen Konzepts), die
 * Hauptroute kann also nur besser werden, nie schlechter.
 */
function vorauswahl(
  candidates: Candidate[],
  daysAvailable: number,
  snapshot: PlanningSnapshot,
): Candidate[] {
  if (candidates.length <= KANDIDATEN_JE_SCHICHT) return candidates;
  const base = snapshot.params.baseIslandId;
  /**
   * Die Lee-Treue des Rückwegs OHNE Plan — dieselbe Zählung wie
   * `konzept.rueckwegAbweichungInseln` am fertigen Plan, nur an der rohen
   * Insel-Folge: alles NACH dem Wendepunkt, was nicht im West-Korridor liegt.
   */
  const abweichungRoh = (seq: string[], turnIslandId: string): number => {
    const turn = seq.lastIndexOf(turnIslandId);
    if (turn < 0) return 0;
    const out = new Set<string>();
    for (const island of seq.slice(turn + 1)) {
      if (island === base) continue;
      if (WEST_LEE_KORRIDOR.has(island)) continue;
      out.add(island);
    }
    return out.size;
  };
  const bewertet = candidates.map((c) => {
    const seq = routeIslandSequence(c.legs);
    return {
      c,
      konzept: konzeptOfIslands(seq),
      legDays: Math.min(c.legs.length, daysAvailable),
      distinct: new Set(seq).size,
      abweichung: abweichungRoh(seq, c.turnIslandId),
      abgeleitet: c.legs.filter((l) => l.abgeleitet === true).length,
      // Determinismus-Anker: bei sonst gleichem Stand entscheidet die Kette.
      key: c.legs.map((l) => l.id).join('>'),
    };
  });
  bewertet.sort(
    (a, b) =>
      b.legDays - a.legDays ||
      b.distinct - a.distinct ||
      a.abweichung - b.abweichung ||
      a.abgeleitet - b.abgeleitet ||
      a.key.localeCompare(b.key),
  );
  // Die Quote je Konzept — die Reihenfolge der Sortierung bleibt erhalten,
  // damit der Kandidatenraum deterministisch bleibt.
  const genommen: Record<KonzeptId, number> = { klassik: 0, ost: 0 };
  const out: Candidate[] = [];
  for (const x of bewertet) {
    if (genommen[x.konzept] >= KANDIDATEN_JE_SCHICHT) continue;
    genommen[x.konzept] += 1;
    out.push(x.c);
  }
  return out;
}

/**
 * Der Kandidatenraum, in VORZUGS-SCHICHTEN (Zielmodell v3).
 *
 * WAS HIER VORHER SCHIEFLIEF. Es gab zwei Generatoren nebeneinander. Der
 * ältere baute "kuratierte Variante bis zum Wendepunkt + Rückfallkette heim" —
 * und weil die Rückfallkette `rueckfallkette-west` exakt die UMKEHRUNG der
 * Varianten ist, war jeder so erzeugte Kandidat zwangsläufig dieselbe Kette
 * hin und zurück. Der Skipper bekam "Paros–Naxos" als gerade Linie hin und
 * zurück angeboten, mit fünf Inseln doppelt. Schlimmer noch: dieser Generator
 * lief ZUERST und gewann im Dedup (first-writer-wins), er verdrängte also die
 * echten Runden aus dem Angebot.
 *
 * Er ist ersatzlos entfallen. Die kuratierten Varianten bleiben, was sie immer
 * sein sollten: Seed-Daten für den Etappen-GRAPHEN (jede ihrer Verbindungen
 * steht in legs.json und wird von roundTrips.ts befahren) — aber sie sind
 * keine Angebots-Einheit mehr und erzeugen keine Kandidaten.
 *
 * Die Schichten werden LAZY geliefert: `completePlan` bricht ab, sobald eine
 * Schicht einen fest-gültigen Plan getragen hat. Damit kann eine Runde mit
 * Wiederholung nur gewinnen, wenn es gar keine wiederholungsfreie gibt — die
 * strukturelle Fassung von "keine Insel doppelt, weich aber schwer gewichtet".
 */
const candidateCache = new WeakMap<PlanningSnapshot, Map<string, Candidate[][]>>();

/**
 * KANN diese Kette den Pin überhaupt tragen? Die notwendige Bedingung, mehr
 * nicht — ob der Tag am Ende wirklich dort endet, entscheidet die Packung
 * (`candidateHonoursPins`).
 *
 * Sie muss VOR der `vorauswahl` greifen, und das ist der ganze Grund, dass es
 * sie gibt: die Vorauswahl kappt je Schicht auf `KANDIDATEN_JE_SCHICHT`, und
 * sie tat das nach einer Rangfolge, die den Pin des Skippers gar nicht kannte.
 * Gemessen am 2026-08-07 gegen die ausgelieferte Bibliothek: von 126 Zielen,
 * die das Etappen-Menü anbot und der Solver ablehnte, scheiterten 50 GENAU
 * hier — es gab passende Runden, sie standen nur nicht unter den ersten 120.
 *
 * Die Abbildung Kettenposition → Törntag ist die des Packers, dieselbe wie in
 * `reach.islandsPossibleOnDay`: Wartetage (`D − L`) schieben eine Etappe nach
 * hinten, Doppelschlag-Tage (`params.doppelschlagMaxPerTrip`) nach vorn. Ein
 * Hafentag-Pin (`toIslandId === null`) bindet keine Kette — welcher Tag ohne
 * Etappe bleibt, entscheidet erst die Packung.
 */
function kannPinTragen(
  c: Candidate,
  pins: Pin[],
  startDay: number,
  daysAvailable: number,
  doppelschlaege: number,
): boolean {
  const seq = routeIslandSequence(c.legs);
  const wartetage = Math.max(0, daysAvailable - c.legs.length) + doppelschlaege;
  for (const pin of pins) {
    if (pin.toIslandId === null) continue;
    const position = pin.day - startDay + 1;
    let gefunden = false;
    for (
      let p = Math.max(1, position - wartetage);
      p <= Math.min(position + doppelschlaege, c.legs.length);
      p++
    ) {
      if (seq[p] === pin.toIslandId) {
        gefunden = true;
        break;
      }
    }
    if (!gefunden) return false;
  }
  return true;
}

export function* candidateLayers(
  snapshot: PlanningSnapshot,
  startIslandId: string,
  /**
   * Die Pins des Skippers — sie schneiden den Kandidatenraum zu, BEVOR die
   * Vorauswahl kappt (siehe `kannPinTragen`). Ohne sie liefert die Funktion
   * denselben Raum wie zuvor.
   */
  pins: Pin[] = [],
): Generator<Candidate[]> {
  /**
   * Memo wie in roundTrips.ts, und aus demselben Grund: der Kandidatenraum
   * hängt nur an Bibliothek, Basis und Startinsel — nicht am Wetter. Eine
   * Bewertung fragt ihn aber elfmal (Hauptroute, je Ziel im Optionsraum,
   * FR2-Zeuge). Gecacht wird, was TATSÄCHLICH aufgezählt wurde, damit die
   * Lazy-Auswertung der Schichten erhalten bleibt.
   */
  let proSnapshot = candidateCache.get(snapshot);
  if (!proSnapshot) {
    proSnapshot = new Map();
    candidateCache.set(snapshot, proSnapshot);
  }
  // Der Pin gehört in den Schlüssel: er schneidet den Raum zu, also ist ein
  // gepinnter Kandidatenraum ein ANDERER Raum als der freie.
  const cacheKey = [
    startIslandId,
    ...pins
      .filter((p) => p.toIslandId !== null)
      .map((p) => `${p.day}=${p.toIslandId}`)
      .sort(),
  ].join('|');
  const gecacht = proSnapshot.get(cacheKey);
  if (gecacht) {
    yield* gecacht;
    return;
  }
  const erzeugt: Candidate[][] = [];
  const merke = (cs: Candidate[]): Candidate[] => {
    erzeugt.push(cs);
    proSnapshot.set(cacheKey, [...erzeugt]);
    return cs;
  };

  const frame = deadlineFrame(snapshot.params);
  const startDay = snapshot.trip.currentDay;
  // Ein Törntag, eine Verbindung: so viele Etappen wie Tage übrig sind.
  const daysAvailable = frame.deadlineDay - startDay + 1;

  const seen = new Set<string>();
  const fresh = (cs: Candidate[]): Candidate[] => {
    const out: Candidate[] = [];
    for (const c of cs) {
      const key = c.legs.length > 0 ? c.legs.map((l) => l.id).join('>') : '(bleiben)';
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  };

  for (const layer of roundTripLayers(snapshot, startIslandId, daysAvailable)) {
    const alle = layer.trips.map((legs) => {
      const c = makeCandidate('runde', layer.layer, legs, snapshot);
      return { ...c, variantId: `runde-${c.turnIslandId}-${legs.length}` };
    });
    // ZUERST der Pin, DANN die Kappung — sonst kappt die Vorauswahl nach einer
    // Rangfolge, die vom Wunsch des Skippers nichts weiss (`kannPinTragen`).
    const candidates = vorauswahl(
      pins.length === 0
        ? alle
        : alle.filter((c) =>
            kannPinTragen(
              c,
              pins,
              startDay,
              daysAvailable,
              Math.max(0, snapshot.params.doppelschlagMaxPerTrip),
            ),
          ),
      daysAvailable,
      snapshot,
    );

    if (layer.layer !== 'verkuerzt') {
      yield merke(fresh(candidates));
      continue;
    }

    /**
     * Die letzte Schicht trägt zusätzlich die beiden FR18-Notantworten: heute
     * umkehren, und gar nicht erst losfahren. Beide gehören ans ENDE — sie
     * sind die am wenigsten verletzende Antwort im Meltemi, aber nie das Ziel.
     */
    const rueckfall: Candidate[] = [];
    const directReturn = remainingReturnLegs(startIslandId, snapshot);
    if (directReturn) {
      rueckfall.push({
        variantId: 'direkt-rueckkehr',
        layer: 'rueckfall',
        turnIslandId: startIslandId,
        legs: directReturn,
      });
    }
    // Eine LEERE Kette ist ein legitimer Kandidat: "an der Basis bleiben".
    // Wenn der Meltemi alles blockiert, ist das die Antwort, die die App
    // immer noch geben können muss (FR18).
    rueckfall.push({
      variantId: 'bleiben',
      layer: 'rueckfall',
      turnIslandId: snapshot.params.baseIslandId,
      legs: [],
    });
    yield merke(fresh([...candidates, ...rueckfall]));
  }
}

/**
 * Der flache Kandidatenraum über alle Schichten — für Tests und Diagnose.
 * Der Solver nimmt `candidateLayers`, weil er die Vorzugsreihenfolge braucht.
 */
export function buildCandidates(
  snapshot: PlanningSnapshot,
  startIslandId: string,
): Candidate[] {
  const out: Candidate[] = [];
  for (const layer of candidateLayers(snapshot, startIslandId)) out.push(...layer);
  return out;
}

// ---------------------------------------------------------------------------
// Packing -> Plan
// ---------------------------------------------------------------------------

/**
 * Turn a packing into plan days: every trip day from `startDay` to the
 * deadline gets either a stage (the legs packed onto it) or a harbour day.
 * Days the boat is not sailing become harbour days at the island it sits on.
 */
export function planFromPacking(
  packed: PackedLeg[],
  startDay: number,
  deadlineDay: number,
  startIslandId: string,
  source: 'solver' | 'skipper' = 'solver',
): PlanDay[] {
  const byDay = new Map<number, PackedLeg[]>();
  for (const p of packed) {
    const list = byDay.get(p.day) ?? [];
    list.push(p);
    byDay.set(p.day, list);
  }

  const days: PlanDay[] = [];
  let island = startIslandId;
  for (let day = startDay; day <= deadlineDay; day++) {
    const legsToday = (byDay.get(day) ?? []).sort((a, b) => a.legIdx - b.legIdx);
    if (legsToday.length > 0) {
      island = legsToday[legsToday.length - 1]!.leg.toIslandId;
      days.push({
        kind: 'stage',
        day,
        legIds: legsToday.map((p) => p.leg.id),
        toIslandId: island,
        source,
      });
    } else {
      days.push({ kind: 'harbour', day, islandId: island, source });
    }
  }
  return days;
}

/**
 * Der EINE Plan-Konstruktor des Solvers: stempelt neben der Schema- auch die
 * Algorithmus-Version. Der Stempel ist, was einen persistierten Plan später
 * als veraltet erkennbar macht (planOutdated) — ohne ihn überlebte ein Plan
 * des alten Solvers jeden Redeploy, und kein Fix würde je sichtbar.
 */
function mkPlan(days: PlanDay[]): Plan {
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    algorithmVersion: SOLVER_ALGORITHM_VERSION,
    days,
  };
}

// ---------------------------------------------------------------------------
// Validity (AD-13)
// ---------------------------------------------------------------------------

/**
 * The normative validity check. Conditions (1), (2), (2') and (3) — nothing
 * else makes a plan invalid, and none of them is skipped.
 *
 * `opts.sailedLegsByDay` übergibt die gesegelte Kette (legGeometry.ts): dieselben
 * Etappen, aber verankert an den Plätzen der Kette und mit landfreiem Kurs. Die
 * Bewertung übergibt sie, damit Gültigkeit und Anzeige dasselbe prüfen. Die
 * SUCHE (packLegs, Kandidaten) rechnet weiter mit den kuratierten Etappen: dort
 * steht der Liegeplatz jedes Tages noch nicht fest, und ein Suchraum, der von
 * der Platzwahl abhängt, wäre nicht mehr deterministisch. Was die Suche
 * vorschlägt, prüft die Bewertung anschliessend gegen den wirklichen Kurs.
 */
export function validatePlan(
  plan: Plan,
  snapshot: PlanningSnapshot,
  opts: { sailedLegsByDay?: Map<number, (Leg | undefined)[]> } = {},
): PlanValidity {
  const { params, library } = snapshot;
  const legs = legLibrary(snapshot);
  const frame = deadlineFrame(params);
  const violations: Violation[] = [];
  let horizonDependent = false;

  /** Die Etappe des Tages, wie sie gesegelt wird — sonst die kuratierte. */
  const legOfStage = (day: number, index: number, legId: string): Leg | undefined =>
    opts.sailedLegsByDay?.get(day)?.[index] ?? legs.get(legId);

  /**
   * Gecacht nur ohne gesegelte Ketten: die tragen dieselbe Id mit anderer
   * Verankerung (legGeometry.ts) und würden den Memo-Schlüssel vergiften.
   * Der Solver-Pfad (Kandidat × Stufe, immer Bibliotheks-Etappen) ist der,
   * der die Wiederholung hat — und genau der läuft über den Cache.
   */
  const assess = opts.sailedLegsByDay ? assessLeg : assessLegCached;

  // (1) every stage inside the reliable horizon holds the FR16 thresholds.
  for (const stage of stagesOf(plan)) {
    let offset = 0;
    const stopHours = stopHoursForDay(snapshot, stage.day);
    for (const [legIdx, legId] of stage.legIds.entries()) {
      const leg = legOfStage(stage.day, legIdx, legId);
      if (!leg) {
        // Dead reference after a reimport: unassessable, not a threshold
        // violation — the plan survives and the skipper repairs it (AD-12).
        horizonDependent = true;
        violations.push({
          kind: 'incomplete',
          day: stage.day,
          text: `Etappe ${legId} ist nicht mehr in der Bibliothek — Tag unbewertet`,
        });
        continue;
      }
      const a = assess(leg, stage.day, snapshot, {
        departureOffsetHours: offset || undefined,
      });
      // Liegezeit des Zwischenstopps schiebt die Folge-Etappe (AD-3).
      offset += (a.totalHours ?? 0) + stopHours;
      if (a.ampel === 'unbewertet') {
        horizonDependent = true;
        continue;
      }
      /**
       * AD-13 REVISED — the far range is now COMPUTED under the persistence
       * assumption instead of being left 'unbewertet' (scoring.ts). The plan
       * therefore gets a real ampel out there, and this flag can no longer be
       * driven by 'unbewertet' alone.
       *
       * It MUST still be raised, because it is what keeps green out of reach:
       * a plan whose later stages rest on extrapolation is not a plan the app
       * may call safe. Unlike 'unbewertet' the day is NOT skipped — its
       * violations count, so an assumed stage that busts a budget or the
       * upwind rule still shows up as a violation rather than vanishing.
       */
      if (a.basis === 'annahme') horizonDependent = true;
      if (a.ampel === 'rot') {
        // Genau der EINE Satz der FR16-Grenze (scoring.ts) — nicht "enthält
        // 'Aufkreuzen'": der Kreuz-Hinweis einer gelben Etappe trägt dasselbe
        // Wort und ist trotzdem kein Sicherheits-Befund.
        const upwind = a.reasons.includes(upwindRotReason(params));
        violations.push({
          kind: upwind ? 'upwind' : 'budget',
          day: stage.day,
          text: `Tag ${stage.day}: ${a.reasons.join('; ')}`,
          assumed: a.basis === 'annahme',
        });
      }
    }
  }

  // (1b)/(1b') HAFENTAGE — hier standen bis 2026-08-07 zwei Befunde: eine
  // Notgrenze (`harbourDaysMax`, "höchstens 5") und ein Trailing-Befund
  // ("liegt die letzten N Tage an der Basis"). Beide sind ersatzlos entfallen,
  // samt der drei Parameter dahinter (Skipper: "harbourDaysMax kann raus, das
  // brauchen wir nicht als Kriterium").
  //
  // Sie waren Ersatzkonstruktionen dafür, dass die RANGFOLGE die Etappenzahl
  // nicht kannte — sie stand auf Platz 14 von 14. Ein Plan, der den Rahmen
  // verschenkt, brauchte deshalb einen eigenen Strukturbefund, um überhaupt
  // aufzufallen. Jetzt sagt `preferred` es direkt (Kriterium 2, `legDays`):
  // jeder Törntag trägt eine Etappe, ein Tag ohne ist schlicht die schlechtere
  // Runde. Als GÜLTIGKEITS-Frage war es ohnehin falsch — im Liegen wird
  // niemand unsicher.

  // (1c) FR16 night-leg quota. The params existed but nothing enforced them:
  // at most `nightLegMaxPerTrip` night legs, none before `nightLegEarliestDay`
  // (second week), and each one only in light wind — the family sleeps through
  // it, so it is admissible only when the sea is smooth.
  const nightStages = stagesOf(plan).filter((s) =>
    s.legIds.some((legId, legIdx) => {
      const leg = legOfStage(s.day, legIdx, legId);
      if (!leg) return false;
      return assess(leg, s.day, snapshot).nightLeg === true;
    }),
  );
  if (nightStages.length > params.nightLegMaxPerTrip) {
    violations.push({
      kind: 'budget',
      day: nightStages[params.nightLegMaxPerTrip]?.day ?? null,
      text: `${nightStages.length} Nachtetappen — erlaubt sind ${params.nightLegMaxPerTrip} pro Törn`,
    });
  }
  for (const s of nightStages) {
    if (s.day < params.nightLegEarliestDay) {
      violations.push({
        kind: 'budget',
        day: s.day,
        text: `Nachtetappe an Tag ${s.day} — erst ab Tag ${params.nightLegEarliestDay} zulässig (zweite Woche)`,
      });
    }
    for (const [legIdx, legId] of s.legIds.entries()) {
      const leg = legOfStage(s.day, legIdx, legId);
      if (!leg) continue;
      const a = assess(leg, s.day, snapshot);
      if (a.nightLeg !== true || a.avgTwsKn === null) continue;
      if (a.avgTwsKn > params.nightLegMaxTwsKn) {
        violations.push({
          kind: 'budget',
          day: s.day,
          text: `Nachtetappe an Tag ${s.day} bei ${Math.round(a.avgTwsKn)} kn — nur unter ${params.nightLegMaxTwsKn} kn zulässig`,
        });
      }
    }
  }

  // (1d) A chosen berth must lie on the island of its day. Otherwise the place
  // ampel shown for that night comes from a different island — a wrong shelter
  // verdict, which is the one class of error NFR6 rules out.
  for (const entry of plan.days) {
    const placeId = entry.kind === 'stage' ? entry.toPlaceId : entry.placeId;
    if (!placeId) continue;
    const place = library.places.find((p) => p.id === placeId);
    const islandId = entry.kind === 'stage' ? entry.toIslandId : entry.islandId;
    if (place && place.islandId !== islandId) {
      violations.push({
        kind: 'incomplete',
        day: entry.day,
        text: `Tag ${entry.day}: Platz ${place.name} liegt auf ${place.islandId}, nicht auf ${islandId}`,
      });
    }
  }

  // (1e) Zielmodell v2 — die Liegeplatz-Regel: kein Übernachtungsplatz zweimal.
  // Gezählt werden AUFENTHALTE: aufeinanderfolgende Nächte auf derselben Insel
  // sind EIN Aufenthalt (ein Hafentag nach der Ankunft wechselt den Platz
  // nicht). Eine Insel darf mehrfach angelaufen werden, solange sie genug
  // kuratierte Plätze hat, dass jeder Aufenthalt einen eigenen bekommt — der
  // Solver legt keine Plätze fest (AD-12), also prüft die Regel die KAPAZITÄT;
  // explizit gewählte Plätze prüft sie direkt. Die Basis ist ausgenommen:
  // Start, Ziel und Puffertage liegen dort naturgemäß mehrfach.
  {
    type Stay = { islandId: string; placeIds: Set<string> };
    const staysByIsland = new Map<string, Stay[]>();
    for (const stay of inselAufenthalte(plan)) {
      if (stay.islandId === params.baseIslandId) continue;
      const list = staysByIsland.get(stay.islandId) ?? [];
      list.push(stay);
      staysByIsland.set(stay.islandId, list);
    }
    for (const [islandId, islandStays] of staysByIsland) {
      if (islandStays.length < 2) continue;
      const placesAvailable = library.places.filter(
        (p) => p.islandId === islandId,
      ).length;
      if (islandStays.length > placesAvailable) {
        violations.push({
          kind: 'wiederholung',
          day: null,
          text: `${islandId} wird ${islandStays.length}× angelaufen, hat aber nur ${placesAvailable} ${placesAvailable === 1 ? 'Liegeplatz' : 'Liegeplätze'} — ein Platz würde sich wiederholen`,
        });
      }
      // Explizit gewählte Plätze: derselbe Platz in zwei Aufenthalten ist die
      // direkte Verletzung, unabhängig von der Kapazität.
      const seenPlaces = new Set<string>();
      for (const stay of islandStays) {
        for (const placeId of stay.placeIds) {
          if (seenPlaces.has(placeId)) {
            violations.push({
              kind: 'wiederholung',
              day: null,
              text: `Liegeplatz ${placeId} ist für zwei getrennte Aufenthalte gewählt — nie derselbe Platz zweimal`,
            });
          }
          seenPlaces.add(placeId);
        }
      }
    }
  }

  // (2) arrival at the base by the one deadline.
  const lastDay = Math.max(...plan.days.map((d) => d.day));
  const endIsland = (() => {
    const entry = planDay(plan, lastDay);
    if (!entry) return null;
    return entry.kind === 'stage' ? entry.toIslandId : entry.islandId;
  })();
  if (endIsland !== params.baseIslandId) {
    violations.push({
      kind: 'deadline',
      day: lastDay,
      text: `Plan endet nicht an der Basis (${params.baseIslandId}), sondern bei ${endIsland ?? 'unbekannt'}`,
    });
  } else if (lastDay > frame.deadlineDay) {
    violations.push({
      kind: 'deadline',
      day: lastDay,
      text: `Ankunft an Törntag ${lastDay} liegt nach dem Stichtag (Tag ${frame.deadlineDay})`,
    });
  } else {
    // The deadline is a TIME, not just a day (AD-9): the charter is handed back
    // at returnDeadlineHourAthens. Checking the day alone would pass an arrival
    // at 23:00 on the return date as punctual.
    const arrivingStage = stagesOf(plan)
      .filter((s) => s.toIslandId === params.baseIslandId)
      .pop();
    if (arrivingStage && arrivingStage.day === frame.deadlineDay) {
      let arrival: number | null = null;
      let arrivalAssumed = false;
      let offset = 0;
      const arrivalStopHours = stopHoursForDay(snapshot, arrivingStage.day);
      for (const [legIdx, legId] of arrivingStage.legIds.entries()) {
        const leg = legOfStage(arrivingStage.day, legIdx, legId);
        if (!leg) {
          arrival = null;
          break;
        }
        const a = assess(leg, arrivingStage.day, snapshot, {
          departureOffsetHours: offset || undefined,
        });
        if (a.arrivalHourAthens === null) {
          // Unknown duration must not silently pass the deadline (nor fail it).
          arrival = null;
          horizonDependent = true;
          break;
        }
        if (a.basis === 'annahme') arrivalAssumed = true;
        offset += (a.totalHours ?? 0) + arrivalStopHours;
        arrival = a.arrivalHourAthens;
      }
      if (arrival !== null && arrival > params.returnDeadlineHourAthens) {
        violations.push({
          kind: 'deadline',
          day: arrivingStage.day,
          text: `Ankunft an der Basis erst um ${arrival.toFixed(1).replace('.', ',')} Uhr — die Rückgabe ist um ${params.returnDeadlineHourAthens}:00 (Athen)`,
          assumed: arrivalAssumed,
        });
      }
    }
  }

  // (2') the return must stay sailable under the worst case — checked from
  // EVERY day of the plan, not just the deepest point south. A mid-trip day
  // can be the one that traps the boat, and an island with no return chain at
  // all must be reported rather than skipped.
  // Two tiers, because they carry different weight (FR19): what the FORECAST
  // already rules out is a hard violation, while what only the worst-case
  // assumption rules out is a caveat. Treating the assumption as hard would
  // paint every trip red — at 30 kn from the north no northward return is
  // sailable, so nothing but Alimos itself would ever be "Meltemi-safe", and
  // the app would cry wolf instead of planning conservatively.
  //
  // WELCHER STICHTAG (korrigiert): Der harte Teil rechnet gegen den echten
  // Rückgabetermin, der weiche weiterhin gegen den PoR-Tag inklusive
  // Puffertag. Vorher galt für beide der Puffertag — und weil Bedingung (2)
  // eine Ankunft AM Stichtag ausdrücklich erlaubt, verlangte (2') vom
  // Notausstieg damit einen ganzen Tag mehr Reserve als vom Plan selbst. Jeder
  // Törn, der den Rahmen ausnutzt, war dadurch ungültig; besonders traf es
  // Rundkurse, deren Notausstieg über die Rückfallkette naturgemäss weiter ist
  // als die Fortsetzung der Runde. Die Aussage "der Puffertag wäre aufgebraucht"
  // bleibt erhalten — sie ist jetzt ein Vorbehalt und kein Urteil.
  /**
   * DIE EIGENE FORTSETZUNG ZÄHLT ALS HEIMWEG (Korrektur 2026-08-07).
   *
   * Der harte Teil prüfte den Notausstieg AUSSCHLIESSLICH über die
   * Rückfallkette — und die ist von manchen Inseln aus länger als der Heimweg,
   * den der Plan ohnehin fährt. Von Serifos braucht die Kette drei Etappen
   * (Kythnos, Kea, Basis), der Plan selbst zwei. Eine Runde, die den Rahmen
   * ausfüllt, war dadurch ab dem drittletzten Tag ZWANGSLÄUFIG ungültig: sie
   * verletzte eine Bedingung, die von ihr mehr Reserve verlangte, als sie
   * selbst braucht.
   *
   * Genau das hat den Elf-Tage-Vertrag unerfüllbar gemacht — jede volle Runde
   * trug einen Sicherheits-Befund, und die Rangfolge zog daraufhin folgerichtig
   * kurze Törns vor. "Gefangen" heisst deshalb ab jetzt: WEDER die
   * Rückfallkette NOCH die eigene Fortsetzung bringt das Schiff rechtzeitig
   * heim. Der Worst-Case-Teil (unten) bleibt unverändert ein Vorbehalt.
   */
  const eigeneFortsetzungHeim = (afterDay: number): boolean => {
    const spaeter = stagesOf(plan).filter((s) => s.day > afterDay);
    const letzte = spaeter[spaeter.length - 1];
    return (
      letzte !== undefined &&
      letzte.toIslandId === params.baseIslandId &&
      letzte.day <= frame.deadlineDay
    );
  };

  for (const stage of stagesOf(plan)) {
    if (stage.day >= frame.deadlineDay) continue;
    if (stage.toIslandId === params.baseIslandId) continue;
    const byForecast: Feasibility =
      eigeneFortsetzungHeim(stage.day)
        ? 'feasible'
        : returnFeasibleStarting(
            stage.toIslandId,
            stage.day + 1,
            snapshot,
            'forecast',
            frame.deadlineDay,
          );
    if (byForecast === 'infeasible') {
      violations.push({
        kind: 'return',
        day: stage.day,
        text: `Von ${stage.toIslandId} (Tag ${stage.day}) ist die Rückkehr schon nach dem aktuellen Forecast nicht mehr darstellbar`,
        // The return starts the day after this stage; if THAT lies beyond the
        // reliable horizon, the verdict rests on the assumption, not on data.
        assumed:
          stage.day + 1 - snapshot.trip.currentDay > params.reliableHorizonDays,
      });
      // One trapped day is enough to condemn the plan; no need to list all.
      break;
    }
    const byWorstCase: Feasibility = returnFeasibleStarting(
      stage.toIslandId,
      stage.day + 1,
      snapshot,
      'worstCase',
    );
    // Der weiche Teil misst weiter am Puffertag: "der Notausstieg ginge nur
    // noch ohne Reserve" ist genau die Art Vorbehalt, die ein Grün verhindern
    // soll, ohne den Plan zu verwerfen.
    const withBuffer: Feasibility = returnFeasibleStarting(
      stage.toIslandId,
      stage.day + 1,
      snapshot,
      'forecast',
    );
    if (byWorstCase !== 'feasible' || byForecast === 'horizon' || withBuffer !== 'feasible') {
      // Conservative caveat: the return holds under the current forecast, but
      // not if the full Meltemi sets in beyond the horizon (FR19), or only by
      // spending the buffer day.
      horizonDependent = true;
    }
  }

  return {
    valid: violations.length === 0,
    horizonDependent,
    violations,
    safetyViolations: violations.filter(isSafetyViolation),
  };
}

// ---------------------------------------------------------------------------
// completePlan
// ---------------------------------------------------------------------------

export interface SolveResult {
  plan: Plan;
  validity: PlanValidity;
  /** Which relaxation level produced this plan ('none' = nothing relaxed). */
  relaxedTo: RelaxationLevel;
  /** The variant the outbound part follows, for display and diversity. */
  variantId: string;
  turnIslandId: string;
}

/**
 * Reichweite eines Round-Trips: wie weit SÜDLICH der Basis der Wendepunkt
 * liegt, in Seemeilen (Breitengrad-Differenz; nördlich der Basis zählt 0).
 *
 * Das IST die Törnfrage — "wie weit kommen wir nach Süden?" (Zielmodell v2,
 * Skipper 2026-08-05: mit dem Meltemi im Rücken runter). Die Luftlinien-
 * Distanz hat etwas anderes gemessen: Amorgos liegt von Athen aus WEITER
 * (123 sm, weit im Osten), aber weniger SÜDLICH als Santorin — und gewann
 * deshalb gegen jede Santorin-Runde, obwohl die Runde der eigentlichen Frage
 * näher kommt. Die frühere Kennzahl war die Zahl der Etappen; auch die mass
 * etwas anderes (Pendeln zählte wie Durchziehen).
 *
 * Gemessen wird zur Insel, nicht über die gefahrene Strecke: die Umwege des
 * Rückwegs sollen die Ambition nicht aufblähen. Für die ANZEIGE ("bis X ·
 * N sm") bleibt die Distanz Basis→Wendepunkt die richtige Zahl — hier geht
 * es um die Rangfolge.
 */
export function reachNmFor(snapshot: PlanningSnapshot): (islandId: string) => number {
  const base = snapshot.library.islands.find(
    (i) => i.id === snapshot.params.baseIslandId,
  );
  if (!base) return () => 0;
  return (islandId: string) => {
    const island = snapshot.library.islands.find((i) => i.id === islandId);
    if (!island) return 0;
    return Math.max(0, (base.coordinates.lat - island.coordinates.lat) * 60);
  };
}

/**
 * Tag, an dem ein Plan seinen Wendepunkt erreicht — die Trennlinie zwischen
 * Hin- und Rückweg (Etappen bis einschliesslich dieses Tags sind Hinweg).
 *
 * Abgeleitet aus der EIGENEN Etappenfolge des Plans, nach derselben Regel wie
 * `makeCandidate`: fernster Punkt ist die südlichste angelaufene Insel
 * (reachNmFor), bei Gleichstand die von der Basis entfernteste. Bewusst NICHT
 * über `SolveResult.turnIslandId`: beim Hauptrouten-Assessment stammt der vom
 * aktuellen Solver-Vorschlag und muss in der persistierten Kette gar nicht
 * vorkommen. Bei vollem Gleichstand gewinnt der FRÜHESTE Anlauf — dieselbe
 * Erst-Anlauf-Konvention wie die Marker der Karte. Null ohne Segeltage.
 */
export function planTurnDay(plan: Plan, snapshot: PlanningSnapshot): number | null {
  return planTurn(plan, snapshot)?.day ?? null;
}

/**
 * Der Wendepunkt eines Plans — Tag UND Insel, aus EINER Ableitung.
 *
 * ZIELMODELL V3: Diese Funktion ist ab jetzt die einzige Quelle für
 * `SolveResult.turnIslandId`. Vorher übernahm der Solver das Etikett des
 * KANDIDATEN (`Candidate.turnIslandId`) ungeprüft in das Ergebnis — und weil
 * der Packer eine unvollständige Kette zurückgeben konnte, behauptete ein
 * abgeschnittener Plan eine Wende, die er nie erreicht hat. In `preferred`
 * bekam er dafür sogar die Reichweiten-Gutschrift, und der Optionsraum bot ihn
 * unter dem Namen des Ziels an, das er nicht anläuft. Der Wendepunkt gehört
 * dem Plan, nicht dem Vorhaben.
 */
export function planTurn(
  plan: Plan,
  snapshot: PlanningSnapshot,
): { day: number; islandId: string } | null {
  const stages = stagesOf(plan);
  if (stages.length === 0) return null;
  const reach = reachNmFor(snapshot);
  const base = snapshot.library.islands.find(
    (i) => i.id === snapshot.params.baseIslandId,
  );
  const distOf = (islandId: string): number => {
    const island = snapshot.library.islands.find((i) => i.id === islandId);
    return base && island ? distanceNm(base.coordinates, island.coordinates) : 0;
  };
  let turn = stages[0]!;
  for (const stage of stages.slice(1)) {
    if (
      reach(stage.toIslandId) > reach(turn.toIslandId) ||
      (reach(stage.toIslandId) === reach(turn.toIslandId) &&
        distOf(stage.toIslandId) > distOf(turn.toIslandId))
    ) {
      turn = stage;
    }
  }
  return { day: turn.day, islandId: turn.toIslandId };
}

/**
 * Aufenthalte eines Plans: aufeinanderfolgende Nächte auf DERSELBEN Insel sind
 * EIN Aufenthalt (ein Hafentag nach der Ankunft wechselt den Platz nicht).
 *
 * Die EINE Zählung für zwei Fragen, die sonst auseinanderlaufen könnten: die
 * Liegeplatz-Regel in `validatePlan` (1e) fragt "reichen die kuratierten
 * Plätze für alle Aufenthalte?", die Rangfolge fragt "wie oft wiederholt sich
 * eine Insel?". Beide müssen dieselben Aufenthalte sehen.
 */
export function inselAufenthalte(
  plan: Plan,
): { islandId: string; placeIds: Set<string> }[] {
  const ordered = [...plan.days].sort((a, b) => a.day - b.day);
  const stays: { islandId: string; placeIds: Set<string> }[] = [];
  for (const entry of ordered) {
    const islandId = entry.kind === 'stage' ? entry.toIslandId : entry.islandId;
    const placeId = entry.kind === 'stage' ? entry.toPlaceId : entry.placeId;
    const last = stays[stays.length - 1];
    if (last && last.islandId === islandId) {
      if (placeId) last.placeIds.add(placeId);
    } else {
      stays.push({ islandId, placeIds: new Set(placeId ? [placeId] : []) });
    }
  }
  return stays;
}

/**
 * Die Kennzahlen, nach denen ein Round-Trip beurteilt wird.
 *
 * `reach` allein hat einen Törn beschrieben, der so weit wie möglich fährt —
 * aber nichts darüber gesagt, WIE er das tut. Herausgekommen ist deshalb immer
 * dieselbe Strecke hin und zurück: sie erreicht denselben Wendepunkt wie eine
 * Runde und ist leichter gültig. Das ist keine Törnplanung, das ist Pendeln.
 */
export interface PlanMetrics {
  /** Entfernung Basis → fernster Punkt. */
  reachNm: number;
  /** Zahl der VERSCHIEDENEN Inseln, die angelaufen werden. */
  distinctIslands: number;
  /**
   * Läuft die Runde im Uhrzeigersinn? REIN BESCHREIBEND — seit 2026-08-07
   * rankt nichts mehr danach (siehe `preferred`). Die Kennzahl bleibt, weil
   * sie in Diagnose und Tests die Form einer Runde in einem Wort sagt.
   */
  clockwise: boolean;
  turnDay: number;
  /**
   * ZIELMODELL V3 — Tage, die eine Etappe tragen. DER Vertrag: ein Törntag,
   * eine Verbindung (Skipper 2026-08-07, "elf Tage, elf Etappen").
   *
   * Bewusst Etappen-TAGE und nicht Etappen: würde man Etappen zählen, machte
   * dieses Kriterium den Doppelschlag zum Gewinnerzug (zwei Verbindungen an
   * einem Tag = mehr Etappen) und die Nachgabe zur Norm. Etappentage sind
   * dagegen immun — ein Doppelschlag-Tag ist ein Tag.
   *
   * Ersetzt die drei Hafentage-Parameter (Zielwert, Zielband, Notgrenze), die
   * bis 2026-08-07 dasselbe indirekt und schlechter sagten: sie waren
   * Ersatzkonstruktionen dafür, dass die Etappenzahl auf Rang 14 von 14 stand.
   */
  legDays: number;
  stages: number;
  /**
   * Zielmodell v2 — Summe der Abweichungen der Etappentage vom Wegstunden-Band
   * [stageHoursBandMinH, stageHoursBandMaxH], in Zehntelstunden (ganzzahlig,
   * damit der lexikografische Vergleich nicht an Float-Rauschen hängt).
   * Ein 2-h-Tag bei Band 5–7 trägt 30 bei, ein 8-h-Tag 10. Unbewertbare Tage
   * tragen 0 — eine Annahme-Lücke ist kein Qualitätsurteil.
   */
  bandDevTenths: number;
  /**
   * KREUZ-STUNDEN NACH DER WENDE, in Zehntelstunden — die entscheidende
   * Rückweg-Kennzahl (Skipper 2026-08-07: "ein angenehmer Rückweg, ohne
   * Kreuzen oder mit möglichst wenig Kreuzen, ist ein entscheidendes
   * Kriterium").
   *
   * Getrennt vom Gesamtwert, weil die beiden Hälften eines Törns nicht
   * dasselbe kosten: hinaus fährt man mit dem Meltemi im Rücken, heim gegen
   * ihn an. Eine Kreuzstunde auf dem Rückweg ist die, die weh tut — und die
   * Summe über den ganzen Plan konnte sie nie sichtbar machen.
   *
   * Gemessen am simulierten Kurs gegen den echten Forecast (`assessLeg`
   * `kreuzHours`), nicht aus der Geometrie geraten. Genau deshalb steht sie
   * in `preferred` ÜBER dem Umlaufsinn: die Messung schlägt die Faustregel.
   */
  kreuzTenthsRueckweg: number;
  /**
   * KREUZ-STUNDEN des ganzen Plans, in Zehntelstunden (ganzzahlig, damit der
   * lexikografische Vergleich nicht an Float-Rauschen hängt).
   *
   * Das ist die Kennzahl, mit der die Rangfolge Kreuzen VERMEIDET (Skipper
   * 2026-08-06): unter Plänen, die gleich weit kommen und gleich viele Inseln
   * sehen, gewinnt der, der seine Ziele anliegen kann. Sie ersetzt keine
   * Gültigkeit — gekreuzt werden DARF, es ist nur die schlechtere Runde.
   */
  kreuzTenths: number;
  /**
   * ROUTEN-KONZEPTE (konzept.ts) — trägt die Wetterlage das Konzept dieses
   * Plans? Ein Plan, der Ost-Marker anläuft, während das Ost-Konzept
   * ungeeignet ist, verliert gegen JEDEN Plan in tragendem Konzept — noch
   * vor der Reichweite. Das ist die zentrale, alles überschreibende Logik.
   */
  konzeptTraegt: boolean;
  /**
   * Rückweg-Inseln außerhalb des westlichen Lee-Korridors (nach der Wende).
   * Weniger ist besser: die Rückweg-Empfehlung der Törnanalyse als Rangmaß.
   */
  rueckwegAbweichung: number;
  /**
   * Wie viele ABGELEITETE Etappen die Runde benutzt (`Leg.abgeleitet`).
   *
   * Weniger ist besser — aber nur als eines von vierzehn Kriterien. Das ist die
   * Umsetzung des Skipper-Entscheids vom 2026-08-07: „diese Routen sollten eher
   * empfohlene Best Practices sein und daher bevorzugt werden — aber warum
   * sollte man nicht hinfahren, wenn der Wind es erlaubt und es diese roten
   * Strecken vermeidet?"
   *
   * Eine kuratierte Etappe trägt eine recherchierte Distanz und, wo es sie
   * gibt, die Düsen-Warntexte des Reviers. Eine abgeleitete trägt nur eine
   * gemessene Kurslänge. Der Unterschied ist echt und gehört in die Rangfolge —
   * aber er wiegt weniger als der Rahmen-Vertrag, weniger als die Zahl der
   * Inseln und weniger als die Lee-Treue des Rückwegs. Wo genau, steht in
   * `preferred`.
   */
  abgeleiteteEtappen: number;
}

export function planMetricsFor(
  snapshot: PlanningSnapshot,
): (r: SolveResult) => PlanMetrics {
  const reach = reachNmFor(snapshot);
  const coordsOf = (islandId: string): Coordinates | null =>
    snapshot.library.islands.find((i) => i.id === islandId)?.coordinates ?? null;
  const legs = legLibrary(snapshot);
  const { stageHoursBandMinH, stageHoursBandMaxH } = snapshot.params;
  // Die Konzept-Lage gilt je Snapshot, nicht je Plan — einmal beurteilen.
  const konzeptLage = konzeptLageFor(snapshot);
  // preferred vergleicht jeden Kandidaten gegen den bisherigen Besten — der
  // Beste würde ohne Memo bei jedem Vergleich neu durchgerechnet.
  const memo = new WeakMap<SolveResult, PlanMetrics>();

  return (r) => {
    const cached = memo.get(r);
    if (cached) return cached;
    const stages = stagesOf(r.plan);
    const islands = stages.map((s) => s.toIslandId);
    // Der geschlossene Kurs für den Umlaufsinn: Basis, dann die Tagesziele.
    // Endet der Plan ohnehin an der Basis, schliesst signedAreaDeg2 den Ring
    // selbst — der doppelte Punkt am Ende stört die Formel nicht.
    const ring = [snapshot.params.baseIslandId, ...islands]
      .map(coordsOf)
      .filter((c): c is Coordinates => c !== null);

    // Wegstunden je Etappentag, mit derselben Offset-Verkettung wie Bewertung
    // und Gültigkeit (AD-3): die Folge-Etappe eines Doppelschlags startet nach
    // Ankunft plus Liegezeit, nicht wieder um 09:00.
    let bandDevTenths = 0;
    // Kreuz-Stunden zählen über den GANZEN Plan, auch aus Tagen, deren
    // Wegstunden-Band unbewertbar bleibt: eine gekreuzte Stunde ist eine
    // gekreuzte Stunde, unabhängig davon, ob der Tag ins Band passt.
    let kreuzTenths = 0;
    // Und getrennt NACH DER WENDE — die Kennzahl, die den Rückweg beurteilt.
    // Der Wendetag selbst zählt zum Hinweg (Etappen bis EINSCHLIESSLICH dieses
    // Tags sind Hinweg, siehe planTurn), erst der Tag danach fährt heim.
    const turn = planTurn(r.plan, snapshot);
    let kreuzTenthsRueckweg = 0;
    for (const stage of stages) {
      let offset = 0;
      let hours = 0;
      let known = true;
      const stopHours = stopHoursForDay(snapshot, stage.day);
      for (const legId of stage.legIds) {
        const leg = legs.get(legId);
        const a = leg
          ? assessLegCached(leg, stage.day, snapshot, {
              departureOffsetHours: offset || undefined,
            })
          : null;
        if (!a || a.totalHours === null) {
          known = false;
          break;
        }
        const kreuz = Math.round((a.kreuzHours ?? 0) * 10);
        kreuzTenths += kreuz;
        if (turn !== null && stage.day > turn.day) kreuzTenthsRueckweg += kreuz;
        hours += a.totalHours;
        offset += a.totalHours + stopHours;
      }
      if (!known) continue;
      const dev =
        hours < stageHoursBandMinH
          ? stageHoursBandMinH - hours
          : hours > stageHoursBandMaxH
            ? hours - stageHoursBandMaxH
            : 0;
      bandDevTenths += Math.round(dev * 10);
    }

    // Ohne Wende-Etappe (Plan bleibt an der Basis) zählt der letzte Tag, damit
    // "gar nicht losfahren" nicht als früheste Wende gewinnt.
    const turnDay = turn?.day ?? Math.max(0, ...r.plan.days.map((d) => d.day));

    // Etappen-TAGE, nicht Etappen: ein Doppelschlag-Tag bleibt ein Tag.
    const legDays = stages.length;

    const clockwise = isClockwise(ring);

    const m: PlanMetrics = {
      // Die Reichweite des PLANS, nicht die des Vorhabens: `r.turnIslandId`
      // wird in completePlan aus genau diesem `planTurn` gesetzt.
      reachNm: reach(turn?.islandId ?? snapshot.params.baseIslandId),
      distinctIslands: new Set(islands).size,
      clockwise,
      turnDay,
      legDays,
      stages: stages.length,
      bandDevTenths,
      kreuzTenthsRueckweg,
      kreuzTenths,
      konzeptTraegt:
        konzeptLage.eignung[konzeptOfPlan(r.plan)] !== 'ungeeignet',
      rueckwegAbweichung: rueckwegAbweichung(
        r.plan,
        stages.length > 0 ? turnDay : null,
        snapshot.params.baseIslandId,
      ),
      // Gezählt wird die ETAPPE, nicht der Tag: ein Doppelschlag mit einer
      // kuratierten und einer abgeleiteten Verbindung ist halb so weit von der
      // Recherche entfernt wie einer mit zweien.
      abgeleiteteEtappen: stages
        .flatMap((s) => s.legIds)
        .filter((id) => legs.get(id)?.abgeleitet === true).length,
    };
    memo.set(r, m);
    return m;
  };
}

const RELAXATION_STEP: Record<RelaxationLevel, number> = {
  none: 0,
  hardMax: 1,
  doppelschlag: 2,
  nightLeg: 3,
};

/**
 * Welcher von zwei Plänen der bessere ist — lexikografisch, nicht als
 * gewichtete Summe. Die Reihenfolge IST die Entscheidung, und sie soll
 * ablesbar sein statt aus Gewichten hervorzugehen, die sich gegenseitig
 * aufheben können.
 *
 * ZIELMODELL V3 (Skipper 2026-08-07). Die Vorgängerordnung stellte die
 * REICHWEITE — wie weit südlich der Wendepunkt liegt — auf Platz 3 und die
 * Zahl der Etappen auf Platz 14 von 14, unter den Umlaufsinn und den Wendetag.
 * Damit schlug "weit nach Süden und dann liegen bleiben" jeden Törn, der den
 * Rahmen wirklich segelt: der Skipper bekam eine Hauptroute mit neun Etappen
 * in elf Tagen und Alternativen mit sechs. Ein Rangkriterium kann aber nur
 * ordnen, was im Suchraum liegt — deshalb ist die Reihenfolge hier zusammen
 * mit dem Kandidatenraum (roundTrips.ts, buildCandidates) neu gefasst.
 *
 *   1. WENIGER SICHERHEITS-BEFUNDE. Das einzige absolute Tor: unsicher, zu
 *      spät oder unterwegs gefangen schlägt jede Ambition. Die App muss auch
 *      im Meltemi antworten (FR18) — aber nie mit etwas Unsicherem.
 *
 *      NUR die Sicherheits-Befunde stehen hier, nicht alle festen. Ein
 *      Budget-Befund heisst "dieser Tag ist lang", und wer Tage weglässt, hat
 *      keine langen Tage — die absolute Zahl der Befunde belohnte damit
 *      systematisch das Nicht-Segeln. Genau so gewann "fünf Etappen, sechs
 *      Tage an der Basis, keine Befunde" gegen jede volle Runde mit einem
 *      einzigen langen Tag. Nicht zu segeln ist keine Leistung; die
 *      übrigen festen Befunde ranken deshalb unter dem Rahmen-Vertrag
 *      (Kriterium 9).
 *
 *      FEST heisst überall hier: ohne die Annahme-Befunde
 *      (`Violation.assumed`). Die zählten früher mit — und weil jeder Segeltag
 *      jenseits des verlässlichen Horizonts Annahme-Befunde trägt, Tage an der
 *      Basis aber keine, gewann "an Tag 7 heim und liegen bleiben" gegen jeden
 *      Törn, der die zweite Woche nutzt. Die Annahme warnt, sie verurteilt
 *      nicht (schema/plan.ts).
 *
 *   2. TRAGENDES ROUTEN-KONZEPT vor gekipptem (konzept.ts) — VOR dem
 *      Rahmen-Vertrag, mit Absicht: dass ein anhaltendes Starkwindfeld über
 *      den Ost-Kykladen steht, ist eine Wetter-Aussage und keine Ambition. Den
 *      Törnrahmen zu füllen ist kein Grund, dort hineinzusegeln. Route 2
 *      verliert dann gegen jede Route-1-Runde, auch gegen eine kürzere.
 *
 *   3. MEHR ETAPPENTAGE. Der Vertrag: elf Törntage, elf Etappen. Ein Tag ohne
 *      Verbindung ist kein Optimierungsergebnis, sondern eine schlechtere
 *      Runde. Ersetzt die drei Hafentage-Parameter, die dasselbe indirekt und
 *      schlechter sagten (params.ts).
 *
 *      Etappen-TAGE, nicht Etappen: sonst wäre der Doppelschlag der
 *      Gewinnerzug — zwei Verbindungen an einem Tag zählten dann doppelt und
 *      machten die Nachgabe zur Norm.
 *
 *   4. MEHR VERSCHIEDENE INSELN.
 *
 *      Ein eigenes Kriterium "weniger Wiederholungen" gab es bis 2026-08-07
 *      daneben. Es ist entfallen, weil es bei gleicher Etappentag-Zahl
 *      RECHNERISCH DASSELBE sagt: die Zahl der Tagesziele steht fest, also ist
 *      jede Wiederholung genau eine verschenkte Insel. Zwei Kennzahlen für
 *      eine Frage sind die Art Doppelung, die diesen Umbau nötig gemacht hat.
 *
 *      Die Zusicherung gegen das PENDELN liegt dafür da, wo sie stärker ist:
 *      im Kandidatenraum. `roundTrips.MAX_ZWEITANLAEUFE` deckelt Runden auf
 *      zwei Zweitanläufe, dieselbe Kette hin und zurück bräuchte fünf.
 *
 *   6.–7. DER RÜCKWEG (Skipper 2026-08-07: "ein angenehmer Rückweg, ohne
 *      Kreuzen oder mit möglichst wenig Kreuzen, ist ein entscheidendes
 *      Kriterium"):
 *
 *      6. LEE-KORRIDOR-TREUE des Heimwegs (Milos–Sifnos–Serifos–Kythnos,
 *         konzept.WEST_LEE_KORRIDOR). Die normative Rückweg-Empfehlung der
 *         Törnanalyse — eine Wellen- und Expositions-Regel: "kurze Etappen
 *         zwischen den Abdeckungen, minimaler Aufenthalt in offener See mit
 *         voll entwickelter Welle".
 *      7. KREUZSTUNDEN NACH DER WENDE, am simulierten Kurs gegen den echten
 *         Forecast gemessen.
 *
 *      Die Reihenfolge ist eine Korrektur nach dem Review vom 2026-08-07:
 *      erst stand 7 vor 6, mit der Begründung "die Messung schlägt die
 *      Faustregel". Das war falsch. Die Messung war zwar richtig — bei
 *      NE-Wind liegt der östliche Heimweg wirklich näher am Raumschots —,
 *      aber `kreuzHours` misst den Seegang überhaupt nicht. Zwei Kennzahlen,
 *      die Verschiedenes messen, kann man nicht nach "genauer" ordnen. Die
 *      exponiertere Frage steht oben: Kreuzen ist ein Preis, offene See im
 *      Meltemi ist eine Lage.
 *
 *      DER UMLAUFSINN IST HIER ENTFALLEN (2026-08-07, zweite Korrektur). Er
 *      stand als eigenes Kriterium zwischen 6 und 7: "läuft die Runde in der
 *      Drehrichtung, die die Wetterlage vorgibt?". Der Skipper hat ihn gegen
 *      zwei professionelle Törnvorschläge geprüft — und die widersprechen
 *      sich: der eine (ab Lavrion) läuft im Uhrzeigersinn, der andere (ab
 *      Athen) dagegen, beide aus derselben Quelle, dasselbe Revier, dieselbe
 *      Törnlänge. Eine so scharfe Regel gibt es in der Praxis also nicht.
 *
 *      Sie wird auch nicht gebraucht: der Lee-Korridor bringt die Drehrichtung
 *      als FOLGE hervor, nicht als Dogma. Wer im Westen unter Land heimkommt,
 *      ist vorher nach Osten hinaus — das IST der Uhrzeigersinn, und genau
 *      daran unterscheiden sich die beiden Referenzen (Lee-Abweichung 0 gegen
 *      2). Ein zweites Kriterium für dieselbe Frage hätte nur die Chance
 *      gehabt, ihr zu widersprechen.
 *
 *      `konzept.umlaufsinnGebot` bleibt als HINWEIS in der
 *      Rückweg-Empfehlung — es sagt dem Skipper, wie der Wind steht, ohne
 *      ihm die Runde vorzuschreiben.
 *
 *   9. WENIGER FESTE BEFUNDE (ohne die Sicherheits-Befunde aus Kriterium 1):
 *      lange Tage, strukturelle Mängel. Hier und nicht oben, weil sie sonst
 *      das Nicht-Segeln belohnen (siehe Kriterium 1).
 *
 *  9a. KREUZSTUNDEN DES GANZEN TÖRNS. Auch der Hinweg soll anliegen, wenn er
 *      kann — nur eben nachrangig zum Rückweg.
 *
 *  10. WENIGER NACHGEBEN auf der Eskalationsleiter. Stand früher weiter oben,
 *      weil der Doppelschlag sich sonst über die Inselvielfalt zurückkämpfte:
 *      sechs Doppelschlag-Tage hintereinander erreichten mehr Inseln und
 *      gewannen — die Ausnahme als Serie. Beide Nachgaben sind inzwischen
 *      STRUKTURELL gedeckelt (params.doppelschlagMaxPerTrip im Packer,
 *      nightLegMaxPerTrip in validatePlan), und der Deckel ist die Garantie,
 *      nicht die Rangfolge.
 *
 *  11. WENIGER ANNAHME-BEFUNDE: der abgestufte Rest von Kriterium 1. Bei sonst
 *      gleichen Plänen ist der vorzuziehen, der weniger auf der
 *      Persistenz-Annahme ruht.
 *
 *  12. Das Wegstunden-Band 5–7 h: Tage, die das Fenster nutzen, statt es zu
 *      verschenken oder zu überziehen.
 *
 *  13. WEITER SÜDLICH. Von Platz 3 hierher: die Reichweite bleibt ein Wert,
 *      aber sie entscheidet nichts mehr allein. "Wie weit kommen wir?" ist
 *      jetzt die Frage des OPTIONSRAUMS (options.ts) — die Hauptroute
 *      beantwortet "welche Runde ist die beste?". Zwei Fragen, zwei Antworten
 *      (Skipper 2026-08-07).
 *
 *  14. Mehr Etappen, damit "einfach liegen bleiben" zuletzt kommt; zum Schluss
 *      die Variante alphabetisch — gleiche Lage, gleiche Antwort.
 */
export function preferred(
  a: SolveResult | null,
  b: SolveResult,
  metrics: (r: SolveResult) => PlanMetrics,
): SolveResult {
  if (!a) return b;
  const ma = metrics(a);
  const mb = metrics(b);
  /**
   * Feste Befunde OHNE die Sicherheits-Befunde: die stehen als eigenes,
   * absolutes Tor an Kriterium 1. Beides in einen Topf zu werfen hiesse, einen
   * langen Tag gegen eine unmögliche Rückkehr aufzurechnen.
   */
  const restA = firmViolations(a.validity).filter((v) => !isSafetyViolation(v)).length;
  const restB = firmViolations(b.validity).filter((v) => !isSafetyViolation(v)).length;
  const cmp: [number, number][] = [
    // Das einzige absolute Tor.
    [-a.validity.safetyViolations.length, -b.validity.safetyViolations.length],
    // Das Routen-Konzept muss die Lage tragen (konzept.ts) — vor dem
    // Rahmen-Vertrag, weil ein gekipptes Konzept eine Wetter-Aussage ist und
    // keine Ambition: den Rahmen zu füllen ist kein Grund, in ein Starkwindfeld
    // zu segeln.
    [ma.konzeptTraegt ? 1 : 0, mb.konzeptTraegt ? 1 : 0],
    // Der Rundkurs-Vertrag: jeder Törntag eine Etappe, keine Insel zweimal,
    // möglichst viele Inseln.
    [ma.legDays, mb.legDays],
    [ma.distinctIslands, mb.distinctIslands],
    // Der Rückweg: erst die Lage (Lee-Abdeckung), dann der Preis (Kreuzen).
    [-ma.rueckwegAbweichung, -mb.rueckwegAbweichung],
    /**
     * BEST PRACTICE VOR GEOMETRIE — aber nicht um jeden Preis.
     *
     * Skipper-Entscheid 2026-08-07: „diese Routen sollten eher empfohlene Best
     * Practices sein und daher bevorzugt werden — aber warum sollte man nicht
     * hinfahren, wenn der Wind es erlaubt und es diese roten Strecken
     * vermeidet?"
     *
     * Hier steht das „bevorzugt": unter Runden, die den Rahmen gleich gut
     * füllen, gleich viele Inseln sehen und gleich lee-treu heimfahren, gewinnt
     * die aus recherchierten Etappen. Eine abgeleitete Verbindung trägt nur
     * eine gemessene Kurslänge, keine geprüfte Distanz und keine
     * Düsen-Warntexte — das ist ein echter Unterschied.
     *
     * Und hier steht das „nicht um jeden Preis": ÜBER diesem Kriterium stehen
     * der Rahmen-Vertrag, die Zahl der Inseln und die Lee-Treue des Rückwegs.
     * Genau daran scheitert der Fall, der den Umbau ausgelöst hat — die Runde
     * über Polyaigos → Paros → Sifnos verlässt den Lee-Korridor und verliert
     * schon eine Zeile weiter oben, bevor die Herkunft überhaupt gefragt wird.
     */
    [-ma.abgeleiteteEtappen, -mb.abgeleiteteEtappen],
    [-ma.kreuzTenthsRueckweg, -mb.kreuzTenthsRueckweg],
    // Lange Tage und strukturelle Mängel — unter dem Rahmen-Vertrag.
    [-restA, -restB],
    // Kreuzen auch auf dem Hinweg vermeiden, nachrangig.
    [-ma.kreuzTenths, -mb.kreuzTenths],
    [-RELAXATION_STEP[a.relaxedTo], -RELAXATION_STEP[b.relaxedTo]],
    [-assumedViolations(a.validity).length, -assumedViolations(b.validity).length],
    [-ma.bandDevTenths, -mb.bandDevTenths],
    // Wie weit südlich — ein Wert, aber nicht mehr DIE Frage.
    [Math.round(ma.reachNm), Math.round(mb.reachNm)],
    [ma.stages, mb.stages],
  ];
  for (const [x, y] of cmp) if (x !== y) return x > y ? a : b;
  return a.variantId <= b.variantId ? a : b;
}

/** A pin the skipper has set: this day is fixed (AD-12). */
export interface Pin {
  day: number;
  /** Island the skipper wants that day to end at; null = harbour day. */
  toIslandId: string | null;
  toPlaceId?: string;
  /**
   * NUR GEHALTEN, nicht festgelegt: der Tag bleibt, wo der bestehende Plan ihn
   * schon hat, ist aber keine Entscheidung des Skippers.
   *
   * Der Unterschied zum echten Pin ist die HERKUNFT des Tages. Ein gehaltener
   * Tag bindet die Suche genauso — er darf sich nicht verschieben —, aber er
   * bekommt kein `source: 'skipper'`, taucht also nicht als Festlegung in der
   * Ansicht auf und wird auch nicht mit "Festlegung lösen" wieder frei.
   *
   * Warum es das braucht (Skipper 2026-08-07): "es gibt ja eine Route, die bis
   * dahin festgelegt ist und das neue Leg funktioniert auch, es gibt keinen
   * Sinn nach hinten zu verändern." Wer Tag 5 ändert, ändert Tag 5 — nicht
   * rückwirkend Tag 2.
   */
  gehalten?: boolean;
}

/**
 * The hard per-day requirements handed INTO the packer: the skipper's pins.
 * Passing them as constraints (rather than filtering afterwards) is what lets
 * the solver actively FIND plans that satisfy them.
 *
 * Bis 2026-08-06 stand hier auch die FR31-Gästewechsel-Bedingung (der
 * Zustiegstag musste auf einer fährverbundenen Insel enden). Sie ist auf
 * Skipper-Entscheid ersatzlos entfallen — siehe `validatePlan`.
 */
function dayConstraintFor(
  _snapshot: PlanningSnapshot,
  pins: Pin[],
): (day: number, endIslandId: string) => boolean {
  const pinByDay = new Map(pins.map((p) => [p.day, p]));

  return (day, endIslandId) => {
    const pin = pinByDay.get(day);
    // A harbour-day pin (toIslandId === null) fixes the island only
    // implicitly — the packer decides whether the day carries a leg.
    if (pin?.toIslandId && pin.toIslandId !== endIslandId) return false;
    return true;
  };
}

function candidateHonoursPins(
  days: PlanDay[],
  pins: Pin[],
): boolean {
  for (const pin of pins) {
    const entry = days.find((d) => d.day === pin.day);
    if (!entry) return false;
    if (pin.toIslandId === null) {
      if (entry.kind !== 'harbour') return false;
    } else {
      const island = entry.kind === 'stage' ? entry.toIslandId : entry.islandId;
      if (island !== pin.toIslandId) return false;
    }
  }
  return true;
}

/**
 * Re-stamp pinned days as skipper-owned and carry their place choice over.
 *
 * GEHALTENE Tage bleiben aussen vor: sie binden die Suche, sind aber keine
 * Entscheidung des Skippers (siehe `Pin.gehalten`). Sie hier mitzustempeln
 * hiesse, den halben Törn als festgelegt auszugeben, weil der Skipper EINEN
 * Tag geändert hat.
 */
function applyPins(days: PlanDay[], pins: Pin[]): PlanDay[] {
  return days.map((d) => {
    const pin = pins.find((p) => p.day === d.day && p.gehalten !== true);
    if (!pin) return d;
    if (d.kind === 'stage') {
      return { ...d, source: 'skipper' as const, toPlaceId: pin.toPlaceId ?? d.toPlaceId };
    }
    return { ...d, source: 'skipper' as const, placeId: pin.toPlaceId ?? d.placeId };
  });
}

/**
 * Build a complete round trip from the current position, honouring pins.
 *
 * Returns the best VALID plan when one exists. Otherwise it relaxes in the
 * fixed order and, if even that fails, returns the LEAST VIOLATING plan with
 * its violations named — the app must never fall silent in the Meltemi moment
 * (FR18), which is precisely when the skipper needs it.
 */
export function completePlan(
  snapshot: PlanningSnapshot,
  startIslandId: string,
  pins: Pin[] = [],
  opts: {
    /**
     * Nur Kandidaten betrachten, die an DIESER Insel wenden.
     *
     * Damit beantwortet dieselbe Maschinerie auch "was kostet mich Santorin?"
     * (options.ts) — statt die Frage mit einer zweiten, leicht abweichenden
     * Rechnung zu beantworten, die dann anderes behaupten könnte als der Plan,
     * den der Skipper hinterher tatsächlich bekommt (AD-3).
     */
    turnIslandId?: string;
    /**
     * Nur Kandidaten betrachten, die aus DIESER kuratierten Variante stammen
     * (`Candidate.variantId`).
     *
     * Damit heisst "Westkykladen-Runde" auch die Westkykladen-Runde: ohne den
     * Filter beantwortete `turnIslandId` allein die Frage, und der Solver
     * lieferte irgendeine Kette zum selben Wendepunkt — angeboten unter dem
     * Namen der Best-Practice-Route, gefahren aber woanders lang. Der Filter
     * ist bewusst OPTIONAL und ohne Fallback im Solver: findet die Variante
     * nichts, entscheidet der Aufrufer, ob er auf die Wendepunkt-Suche
     * zurückfällt (options.ts tut das).
     */
    variantId?: string;
    /**
     * Bei der ERSTEN Stufe abbrechen, die etwas Gültiges liefert.
     *
     * Nur sinnvoll zusammen mit `turnIslandId`: dann ist die Reichweite über
     * alle Kandidaten konstant, und `preferred` entscheidet als Nächstes nach
     * der Eskalationsstufe — die mildeste gültige Stufe IST also das Optimum.
     * Der Abbruch ändert das Ergebnis nicht, er spart nur die restlichen
     * Stufen. Für die Hauptroute wäre er falsch: dort gewinnt Reichweite vor
     * Stufe, und ein früher Abbruch hat genau deshalb jahrelang den kürzeren
     * Törn geliefert.
     */
    stopAtFirstValid?: boolean;
    /**
     * Nur Kandidaten betrachten, die DIESEM Routen-Konzept folgen
     * (`konzept.konzeptOfIslands` über die rohe Inselfolge).
     *
     * Der Grund ist derselbe wie beim `variantId`-Filter, eine Ebene höher:
     * ohne ihn beantwortet `turnIslandId` allein die Frage, und der Solver
     * liefert die bestgerankte Kette zum Wendepunkt — bei Milos gemessen eine
     * Runde über Mykonos. Das ist eine Route-2-Runde, die unter einem
     * Route-1-Ziel ausgeliefert wird; der Optionsraum hat sie danach
     * konsequenterweise als Ost einsortiert (options.ts liest das Konzept aus
     * dem PLAN), und das Konzept-Panel stand mit "trägt" und leerer
     * Routenliste da.
     *
     * Bewusst OHNE Rückfall im Solver: findet das Konzept nichts, entscheidet
     * der Aufrufer, ob er die Frage ohne Konzept noch einmal stellt
     * (options.ts tut das) — dasselbe Muster wie bei `variantId`.
     */
    konzeptId?: KonzeptId;
  } = {},
): SolveResult | null {
  const frame = deadlineFrame(snapshot.params);
  const startDay = snapshot.trip.currentDay;
  // Past days are already fixed (AD-12) and are carried over from the existing
  // plan, so the trip keeps its history: without them the FR2 numbering would
  // restart at 1 every morning and a spent harbour day would be forgotten.
  const pastDays: PlanDay[] = (snapshot.trip.plan?.days ?? [])
    .filter((d) => d.day < startDay)
    .sort((a, b) => a.day - b.day);
  // A pin on a past day is not a constraint — it already happened. Keeping it
  // as one would disqualify every candidate the morning after it was set.
  const futurePins = pins.filter((p) => p.day >= startDay);

  // Nothing left to plan: the trip is over.
  if (startDay > frame.deadlineDay) {
    const plan: Plan = mkPlan(pastDays);
    if (pastDays.length === 0) return null;
    return {
      plan,
      validity: validatePlan(plan, snapshot),
      relaxedTo: 'none',
      variantId: 'abgeschlossen',
      turnIslandId: startIslandId,
    };
  }

  const constraint = dayConstraintFor(snapshot, futurePins);
  const metrics = planMetricsFor(snapshot);
  const daysAvailable = frame.deadlineDay - startDay + 1;

  let best: SolveResult | null = null;
  /** Ohne feste Verletzungen — sauber im Sinne der vollen Gültigkeit. */
  const firmValid = (r: SolveResult): boolean =>
    firmViolations(r.validity).length === 0;
  /**
   * Diese Schicht hat GELIEFERT: ein sicherer Plan, der den Rahmen ausfüllt.
   * Erst dann lohnt es nicht mehr, die nachrangigen Schichten aufzuzählen.
   *
   * Bewusst nicht `firmValid`: ein einzelner langer Tag (Budget-Befund) macht
   * eine volle Runde nicht schlechter als eine kurze ohne Befund — das sagt
   * `preferred` inzwischen selbst, und ein Abbruchkriterium, das strenger ist
   * als die Rangfolge, würde genau die Kandidaten übergehen, die gewinnen.
   */
  const traegt = (r: SolveResult): boolean =>
    r.validity.safetyViolations.length === 0 && metrics(r).konzeptTraegt;

  /**
   * Die besten N Kandidaten für die Nachvalidierung gegen die GESEGELTE Kette
   * (unten). N klein, weil jede Nachvalidierung die Kette neu verankert und
   * landfrei legt (legGeometry.ts) — für jeden Kandidaten × Stufe wäre das
   * unbezahlbar, für die Spitzengruppe ist es billig.
   */
  const FINALISTS_MAX = 5;
  const finalists: SolveResult[] = [];
  const noteFinalist = (r: SolveResult) => {
    finalists.push(r);
    finalists.sort((x, y) => (preferred(x, y, metrics) === x ? -1 : 1));
    if (finalists.length > FINALISTS_MAX) finalists.pop();
  };

  /**
   * SCHICHT für SCHICHT (Zielmodell v3). Trägt die erste — wiederholungsfreie
   * Runden über den vollen Rahmen — einen fest-gültigen Plan, wird gar nicht
   * erst weitergesucht. Damit kann eine Runde mit Stichfahrt oder eine
   * verkürzte nur gewinnen, wenn es keine saubere volle Runde gibt.
   *
   * Das ist die STRUKTURELLE Fassung von "keine Insel doppelt" — stärker als
   * jede Gewichtung, weil ein Rangkriterium immer noch von genug anderen
   * Kriterien überstimmt werden kann.
   */
  for (const candidates of candidateLayers(snapshot, startIslandId, futurePins)) {
    const inLayer = candidates.filter(
      (c) =>
        (opts.turnIslandId === undefined || c.turnIslandId === opts.turnIslandId) &&
        (opts.variantId === undefined || c.variantId === opts.variantId) &&
        (opts.konzeptId === undefined ||
          konzeptOfIslands(routeIslandSequence(c.legs)) === opts.konzeptId),
    );
    if (inLayer.length === 0) continue;

    /**
     * ALLE Stufen werden durchgerechnet, nicht nur bis die erste etwas
     * Gültiges liefert.
     *
     * Vorher brach die Schleife beim ersten gültigen Plan ab — und weil ein
     * kurzer Törn früher gültig wird als ein weiter, gewann systematisch der
     * kürzere. Die Leiter war damit keine Eskalation, sondern eine Bremse.
     */
    for (const [levelIdx, level] of RELAXATION_ORDER.entries()) {
      const relaxed = relaxedSnapshot(snapshot, level);

      for (const candidate of inLayer) {
        /**
         * Beschneidung, die das Ergebnis nicht verändert: steht bereits ein
         * FEST-GÜLTIGER Plan, kann eine höhere Eskalationsstufe nur noch
         * gewinnen, wenn sie mindestens gleich viele Etappentage trägt — bei
         * ECHT weniger verliert sie an Kriterium 2, egal was sonst passiert.
         *
         * SEIT ZIELMODELL V3 an den ETAPPENTAGEN und nicht mehr an der
         * Reichweite: die ist von Rang 3 auf Rang 13 gerutscht und kann eine
         * Entscheidung nicht mehr allein tragen — eine Beschneidung, die
         * weiter an ihr hängt, würde Kandidaten wegschneiden, die nach der
         * neuen Ordnung gewinnen. Nur strikt kleiner: bei gleicher Zahl kann
         * eine höhere Stufe durchaus noch gewinnen (etwa ein Doppelschlag, der
         * eine kreuzärmere Runde packbar macht) und muss durchgerechnet werden.
         */
        if (
          levelIdx > 0 &&
          best &&
          firmValid(best) &&
          Math.min(candidate.legs.length, daysAvailable) < metrics(best).legDays
        ) {
          continue;
        }

        /**
         * Wartetage, die diese Kette braucht, um den Rahmen zu spannen. Der
         * Vertrag ist "ein Törntag, eine Etappe", also braucht eine Kette mit
         * genau so vielen Etappen wie Tagen KEINEN Wartetag — und kürzere
         * Ketten brauchen genau die Differenz. Bis 2026-08-07 stand hier
         * zusätzlich `harbourDaysMax` (5) als Untergrenze; die hat dem Packer
         * erlaubt, fünf Tage liegen zu bleiben, wo eine volle Runde möglich
         * gewesen wäre.
         */
        const maxWaitDays = Math.max(0, daysAvailable - candidate.legs.length);
        const packing = packLegs(candidate.legs, startDay, frame.deadlineDay, relaxed, {
          maxWaitDays,
          startIslandId,
          dayConstraint: constraint,
        });

        /**
         * NUR VOLLSTÄNDIGE PACKUNGEN. `packLegs` liefert im Einzeletappen-Zweig
         * ein Ergebnis mit `verdict: 'infeasible'` UND nicht-leerer
         * `packed`-Liste — eine abgebrochene Kette. Geprüft wurde bis
         * 2026-08-07 nur `packed.length`, nie das Verdikt: ein Plan, der auf
         * halbem Weg endete, wurde akzeptiert, bekam das Wendepunkt-Etikett
         * des ganzen Kandidaten und wurde unter dem Namen des Ziels
         * angeboten, das er nie erreicht. Genau so kam eine "Verlängerung nach
         * Santorin" zustande, die auf Naxos endet.
         */
        if (packing.verdict === 'infeasible') continue;

        const future = applyPins(
          planFromPacking(packing.packed, startDay, frame.deadlineDay, startIslandId),
          futurePins,
        );
        if (!candidateHonoursPins(future, futurePins)) continue;
        const days = [...pastDays, ...future];

        const plan: Plan = mkPlan(days);
        // Validity is always judged against the ORIGINAL params — relaxation
        // may guide the search, never redefine what counts as valid.
        const validity = validatePlan(plan, snapshot);
        const result: SolveResult = {
          plan,
          validity,
          relaxedTo: level,
          variantId: candidate.variantId,
          // Der Wendepunkt des PLANS, nicht des Vorhabens (planTurn).
          turnIslandId: planTurn(plan, snapshot)?.islandId ?? startIslandId,
        };
        best = preferred(best, result, metrics);
        noteFinalist(result);
      }

      // Fest-gültig statt voll-gültig — dasselbe Tor wie preferred.
      if (opts.stopAtFirstValid && best && firmValid(best)) break;
    }

    /**
     * Diese Schicht trägt — die nachrangigen gar nicht erst aufzählen.
     *
     * Geprüft wird, was in `preferred` ÜBER der Schicht-Ordnung steht:
     * Sicherheit, tragendes Routen-Konzept und der volle Rahmen. Ohne die
     * Konzept-Bedingung würde eine sichere Ost-Runde aus Schicht A den Abbruch
     * auslösen, obwohl Schicht B eine West-Runde enthält, die bei gekippter
     * Ost-Lage gewinnen müsste — das Abbruchkriterium war strenger als die
     * Rangfolge und hätte genau die Kandidaten übergangen, die zählen.
     */
    if (best && traegt(best) && metrics(best).legDays === daysAvailable) break;
  }

  if (!best) return null;

  /**
   * Nachvalidierung der Spitzengruppe gegen die GESEGELTE Kette.
   *
   * Die Suche rechnet mit kuratierten Bibliotheks-Etappen (deterministischer
   * Suchraum, siehe validatePlan-Kopf), die Anzeige aber mit der real
   * verankerten, landfrei gelegten Kette (legGeometry.ts) — und dazwischen
   * liegen echte Stunden: aus 7,5 h/gelb kuratiert wurde in der Anzeige
   * 9,0 h/rot, und der Solver KONNTE das beim Wählen nicht sehen. Deshalb
   * werden die besten Kandidaten hier noch einmal gegen ihre gesegelte Kette
   * geprüft und der Sieger nach DIESER Gültigkeit bestimmt: ein Plan, der nur
   * kuratiert grün war, verliert gegen einen, der es auch gesegelt ist.
   *
   * Nur für die Hauptrouten-Frage (ohne turnIslandId): die Options-Preise
   * (options.ts) vergleichen Kandidaten untereinander, und dafür ist die
   * kuratierte Rechnung konsistent genug.
   */
  if (opts.turnIslandId === undefined && finalists.length > 1) {
    const legsById = legLibrary(snapshot);
    let winner: SolveResult | null = null;
    for (const r of finalists) {
      const sailed = sailedLegsByDay(
        r.plan.days.map((d) => ({
          day: d.day,
          legIds: d.kind === 'stage' ? d.legIds : [],
          // Der Solver legt keine Plätze fest (AD-12) — verankert wird an den
          // kuratierten Häfen, aber VERKETTET: jeder Tag startet, wo der
          // vorige endete. Genau die Verkettung ist, was Stunden kostet.
          placeId: null,
          // Der Hafen eines Zwischenstopps ist dagegen eine SKIPPER-Wahl und
          // steht im Plan: sie verschiebt die Geometrie und damit die Stunden,
          // gegen die hier nachvalidiert wird.
          viaPlaceIds: d.kind === 'stage' ? (d.viaPlaceIds ?? null) : null,
        })),
        legsById,
        snapshot.library.places,
      );
      const revalidated: SolveResult = {
        ...r,
        validity: validatePlan(r.plan, snapshot, { sailedLegsByDay: sailed }),
      };
      winner = preferred(winner, revalidated, metrics);
    }
    return winner ?? best;
  }

  return best;
}

/**
 * FR2 existence predicate (gelb vs. rot), normative per AD-13: does ANY valid
 * plan exist in the full search space, with past days fixed but active pins
 * NOT binding? Pins are excluded on purpose — the way to cash in a yellow is
 * the check-in, and check-in releases pins. Anything the skipper can reach in
 * one action must count as reachable.
 */
export function existsValidPlan(
  snapshot: PlanningSnapshot,
  startIslandId: string,
): SolveResult | null {
  const result = completePlan(snapshot, startIslandId, []);
  if (!result) return null;
  // "A valid round trip exists" means: safe, on time, commitments kept — AND
  // it actually sails. Structural shortfalls (extra harbour days, e.g. because
  // the library holds fewer legs than the trip has days) must not turn the
  // light red; but "stay in port for twelve days" is not a round trip either,
  // so it cannot serve as the witness that keeps the light yellow.
  const sails = stagesOf(result.plan).length > 0;
  return sails && result.validity.safetyViolations.length === 0 ? result : null;
}

/**
 * Inhaltsschlüssel eines Plans — Tag für Tag Ziel oder Hafentag. Die
 * FR29-Alternativen entstehen seit der Verschmelzung mit dem Optionsraum in
 * `assessPlanning` aus den Options-Plänen selbst (dedupliziert über diesen
 * Schlüssel, der FR2-Zeuge angehängt); eine eigene Solver-Suche nach
 * "anderen Round-Trips" gibt es nicht mehr — sie nannte dieselben Ziele mit
 * womöglich anderem Plan, und zwei Behauptungen zum selben Ziel verbietet AD-3.
 */
export function planKey(plan: Plan): string {
  return plan.days
    .slice()
    .sort((a, b) => a.day - b.day)
    .map((d) => `${d.day}:${d.kind === 'stage' ? d.toIslandId : `~${d.islandId}`}`)
    .join('|');
}

/**
 * Ergebnis einer Zwischenstopp-Änderung (FR28) — der fertige Plan plus die
 * dabei ERZEUGTEN Etappen.
 *
 * `customLegs` ist leer, solange die Bibliothek alles hergab, was der neue Tag
 * braucht (Gegenrichtungen eingeschlossen). Sonst persistiert der Aufrufer sie
 * als Custom-Etappen des Geräts (tripContext SET_STOPOVER), damit der Plan
 * seine Referenzen über jeden Neustart hinweg auflösen kann — nie ein Plan
 * ohne seine Etappe.
 */
export interface StopoverChange {
  plan: Plan;
  customLegs: Leg[];
}

/**
 * FR28 — den Zwischenstopp eines Doppelschlag-Tages löschen: derselbe Tag,
 * dasselbe Tagesziel, aber als EINE direkte Etappe gesegelt.
 *
 * Zuerst wird im Bibliotheks-Index inklusive Gegenrichtungen (legLibrary)
 * nach einer direkten Verbindung gesucht. Kennt die Bibliothek keine, wird
 * sie ERZEUGT: der kürzeste landfreie Kurs zwischen dem Startplatz des Tages
 * und dem Zielplatz (searoute.ts), mit der sphärisch gerechneten Kurslänge
 * als Distanz. Das ist keine freie Geometrie zur Laufzeit der SUCHE — der
 * Solver-Suchraum bleibt kuratiert —, sondern eine bewusste Skipper-
 * Entscheidung, die als benannte Etappe in die Bibliothek dieses Geräts
 * eingeht (usePlanning injiziert `customLegs` in den Snapshot; kuratierte
 * Etappen gewinnen bei gleicher Id, first-writer-wins in legIndex).
 *
 * Null nur noch, wenn der Tag keinen Zwischenstopp trägt, eine Referenz tot
 * ist oder KEIN landfreier Kurs gefunden wird (`SeaRoute.unresolved`) — eine
 * Luftlinie über Land wird nie stillschweigend behauptet.
 *
 * Der Tag wird als Skipper-Entscheidung gestempelt (Pin, AD-12), damit eine
 * spätere Neuberechnung das Tagesziel nicht wieder verwirft. Alle anderen
 * Tage bleiben unberührt — Start- und Zielinsel des Tages ändern sich nicht,
 * die Kette bleibt geschlossen.
 */
export function planWithoutStopover(
  plan: Plan,
  day: number,
  snapshot: PlanningSnapshot,
): StopoverChange | null {
  const entry = planDay(plan, day);
  if (!entry || entry.kind !== 'stage' || entry.legIds.length < 2) return null;
  const legs = legLibrary(snapshot);
  const first = legs.get(entry.legIds[0]!);
  const last = legs.get(entry.legIds[entry.legIds.length - 1]!);
  if (!first || !last) return null;

  const replaceDay = (legId: string): Plan =>
    withDayLegs(plan, day, [legId], []);

  const direct = [...legs.values()].find(
    (l) => l.fromIslandId === first.fromIslandId && l.toIslandId === entry.toIslandId,
  );
  if (direct) return { plan: replaceDay(direct.id), customLegs: [] };

  // Erzeugen: landfreier Kurs vom Startplatz des Tages zum Zielplatz.
  const from = snapshot.library.places.find((p) => p.id === first.fromPlaceId);
  const to = snapshot.library.places.find((p) => p.id === last.toPlaceId);
  if (!from || !to) return null;
  const routed = seaRoute([from.coordinates, to.coordinates]);
  if (routed.unresolved || routed.nm <= 0) return null;
  const customLeg: Leg = {
    id: `${first.fromIslandId}--${entry.toIslandId}`,
    fromIslandId: first.fromIslandId,
    toIslandId: entry.toIslandId,
    fromPlaceId: from.id,
    toPlaceId: to.id,
    distanceNm: Math.round(routed.nm * 10) / 10,
    waypoints: routed.path.slice(1, -1),
    windWarnings: [
      'Direktroute, vom Skipper erzeugt (Zwischenstopp gelöscht): Kurs landfrei gerechnet, Distanz aus der Geometrie — nicht kuratiert',
    ],
  };
  return { plan: replaceDay(customLeg.id), customLegs: [customLeg] };
}

/**
 * Die Etappen EINES Plantags austauschen — der eine Schreibzugriff, den alle
 * Zwischenstopp-Änderungen teilen.
 *
 * Der Tag wird als Skipper-Entscheidung gestempelt (Pin, AD-12), damit eine
 * spätere Neuberechnung ihn nicht wieder verwirft. `viaPlaceIds` wird immer
 * mitgeschrieben — auch leer, denn ein Tag, der seinen Zwischenstopp verliert,
 * darf dessen Hafen nicht behalten.
 */
function withDayLegs(
  plan: Plan,
  day: number,
  legIds: string[],
  viaPlaceIds: (string | null)[],
): Plan {
  return {
    ...plan,
    days: plan.days.map((d) =>
      d.day === day && d.kind === 'stage'
        ? { ...d, legIds, viaPlaceIds, source: 'skipper' as const }
        : d,
    ),
  };
}

/**
 * FR28 — einen Zwischenstopp SETZEN: derselbe Tag, dasselbe Tagesziel, aber
 * unterwegs über `stop.islandId` und optional dessen Hafen `stop.placeId`.
 *
 * Das ist die Gegenrichtung zu `planWithoutStopover` und deckt alle drei Fälle
 * ab, die der Skipper am Tag hat: einen Stopp NEU einfügen, den Stopp auf eine
 * andere Insel VERLEGEN und nur seinen HAFEN wechseln. Der Tag trägt danach
 * genau zwei Etappen — mehr als einen Zwischenstopp plant diese App nicht
 * (`params.maxLegsPerDay`), und mehr als einen kann der Editor auch nicht
 * ausdrücken.
 *
 * BEIDE HÄLFTEN KOMMEN AUS DER BIBLIOTHEK (Gegenrichtungen eingeschlossen).
 * Anders als beim Löschen wird hier NICHTS landfrei erzeugt: beim Löschen muss
 * der Tag sein Ziel behalten, also braucht er die Direktroute auch dann, wenn
 * sie niemand recherchiert hat. Ein Stopp dagegen ist ein Zugewinn — gibt es
 * für ihn keine recherchierte Verbindung, ist die richtige Antwort "diesen
 * Stopp nicht", nicht "einen erfundenen Kurs". Die Auswahl (`reach.stopoverIslands`)
 * zeigt darum von vornherein nur Inseln, für die beide Hälften existieren;
 * `null` bleibt der Fall für eine Wahl, die daneben liegt.
 *
 * DER HAFEN DES STOPPS ist ein Ankerpunkt, kein Liegeplatz: er wandert in
 * `Stage.viaPlaceIds`, verankert die Geometrie (legGeometry) und geht in keine
 * Ampel ein — am Zwischenstopp muss das Boot nicht sicher liegen (Skipper
 * 2026-08-07). Geprüft wird nur, dass er auf der Stopp-Insel liegt; ein Platz
 * von einer anderen Insel wäre ein Datenfehler, kein Zwischenstopp.
 */
export function planWithStopover(
  plan: Plan,
  day: number,
  stop: { islandId: string; placeId?: string | null },
  snapshot: PlanningSnapshot,
): StopoverChange | null {
  const entry = planDay(plan, day);
  if (!entry || entry.kind !== 'stage' || entry.legIds.length === 0) return null;
  const legs = legLibrary(snapshot);
  const first = legs.get(entry.legIds[0]!);
  if (!first) return null;
  const fromIslandId = first.fromIslandId;
  const toIslandId = entry.toIslandId;
  // Ein Stopp an der Ausgangs- oder Zielinsel des Tages ist kein Stopp: der
  // Tag würde dieselbe Insel zweimal anlaufen, statt unterwegs anzuhalten.
  if (stop.islandId === fromIslandId || stop.islandId === toIslandId) return null;

  if (stop.placeId) {
    const place = snapshot.library.places.find((p) => p.id === stop.placeId);
    if (!place || place.islandId !== stop.islandId) return null;
  }

  // Die kürzeste bekannte Verbindung je Hälfte — dieselbe Wahl, die
  // `reach.stopoverIslands` beim Sortieren trifft.
  const connection = (a: string, b: string): Leg | null => {
    let best: Leg | null = null;
    for (const leg of legs.values()) {
      if (leg.fromIslandId !== a || leg.toIslandId !== b) continue;
      if (!best || leg.distanceNm < best.distanceNm) best = leg;
    }
    return best;
  };
  const hin = connection(fromIslandId, stop.islandId);
  const weiter = connection(stop.islandId, toIslandId);
  if (!hin || !weiter) return null;

  return {
    plan: withDayLegs(plan, day, [hin.id, weiter.id], [stop.placeId ?? null]),
    customLegs: [],
  };
}

/** Stages of a plan that could not be assessed — for display (AD-12). */
export function unassessableStages(plan: Plan, snapshot: PlanningSnapshot): Stage[] {
  const legs = legLibrary(snapshot);
  return stagesOf(plan).filter((s) => s.legIds.some((id) => !legs.has(id)));
}

// ---------------------------------------------------------------------------
// Zielmodell v2 — die tägliche Abbruch-Notation (Absichern, nicht Planen)
// ---------------------------------------------------------------------------

/**
 * Der Heimweg-Status für jeden zukünftigen Plantag.
 *
 * Das ist die zweite Hälfte des Zielmodells v2: GEPLANT wird optimistisch
 * (Forecast + Persistenz-Annahme, der Worst-Case bindet die Suche nicht mehr),
 * ABGESICHERT wird täglich. Für jeden Tag steht hier, ob der Heimweg auch
 * unter dem vollen Meltemi hielte ('meltemi-fest') oder nur nach aktuellem
 * Forecast ('wetterfenster') — und im zweiten Fall, woran der Skipper den
 * Abbruch erkennt. Neu gerechnet wird bei jeder Forecast-Aktualisierung; das
 * IST die tägliche Neubeurteilung, die der Skipper verlangt hat.
 *
 * Dieselben Funktionen wie Gültigkeitsbedingung (2') und PoR (AD-3: ein
 * Machbarkeitsbegriff): `byForecast` fragt gegen den echten Stichtag, der
 * Worst-Case konservativ gegen den PoR-Tag inklusive Puffer.
 */
export function deriveReturnChecks(
  plan: Plan,
  snapshot: PlanningSnapshot,
): DayReturnCheck[] {
  const { params } = snapshot;
  const frame = deadlineFrame(params);
  const checks: DayReturnCheck[] = [];
  const wc = params.meltemiWorstCase;
  // Törntag, an dem das LAUFENDE Wetterfenster begann — null, solange keins
  // offen ist. Steuert die Formulierung des Hinweises: nur der erste Tag
  // eines Fensters ist der Einstieg in die tägliche Abbruch-Entscheidung;
  // stünde an jedem Folgetag wortgleich "hier abbrechen", läse sich das wie
  // mehrere wählbare Abbruchpunkte (Skipper-Feedback 2026-08-05).
  let fensterSeit: number | null = null;

  for (const entry of [...plan.days].sort((a, b) => a.day - b.day)) {
    if (entry.day < snapshot.trip.currentDay) continue;
    if (entry.day >= frame.deadlineDay) continue;
    const islandId = entry.kind === 'stage' ? entry.toIslandId : entry.islandId;
    // An der Basis gibt es keinen Heimweg zu prüfen — und ein Halt an der
    // Basis schließt ein offenes Wetterfenster: wer danach wieder ausläuft,
    // beginnt die tägliche Entscheidung von vorn.
    if (islandId === params.baseIslandId) {
      fensterSeit = null;
      continue;
    }

    const byForecast: Feasibility = returnFeasibleStarting(
      islandId,
      entry.day + 1,
      snapshot,
      'forecast',
      frame.deadlineDay,
    );
    const underWorstCase: Feasibility = returnFeasibleStarting(
      islandId,
      entry.day + 1,
      snapshot,
      'worstCase',
    );

    let status: DayReturnCheck['status'];
    let note: string;
    if (underWorstCase === 'feasible') {
      status = 'meltemi-fest';
      note = `Heimweg hält auch bei vollem Meltemi (${wc.twsKn} kn aus N) — Umkehr von hier jederzeit möglich.`;
      fensterSeit = null;
    } else if (byForecast !== 'infeasible') {
      status = 'wetterfenster';
      // Der erste Fenster-Tag markiert den Einstieg ("Ab hier"); Folgetage
      // sagen, dass dieselbe tägliche Regel weiterläuft — und dass der
      // Abbruch an dem Tag passiert, an dem der Wind dreht, nicht erst hier.
      const beginntHier = fensterSeit === null;
      if (beginntHier) fensterSeit = entry.day;
      note =
        (beginntHier
          ? `Ab hier trägt der Heimweg nur nach aktuellem Forecast — die Abbruch-Entscheidung fällt ab jetzt täglich: ` +
            `Frischt der Nordwind über ${params.maxUpwindTwsKn} kn auf, abbrechen und den Rückweg einleiten.`
          : `Heimweg weiterhin nur nach Forecast (Wetterfenster seit Tag ${fensterSeit}): ` +
            `Frischt der Nordwind über ${params.maxUpwindTwsKn} kn auf, wird am selben Tag abgebrochen — nicht erst hier.`) +
        (byForecast === 'horizon'
          ? ' Ein Teil der Strecke liegt jenseits des verlässlichen Horizonts (Vorbehalt).'
          : '');
    } else {
      status = 'kritisch';
      note = 'Rückkehr ist von hier schon nach aktuellem Forecast nicht mehr darstellbar.';
      fensterSeit = null;
    }

    checks.push({ day: entry.day, islandId, byForecast, underWorstCase, status, note });
  }
  return checks;
}

/**
 * Bis zu welchem Tag die Route meltemi-fest ist: der letzte Tag der
 * ANFÄNGLICHEN meltemi-festen Strecke. Null, wenn schon der erste geprüfte
 * Tag am Forecast hängt — oder wenn es nichts zu prüfen gibt (Plan liegt an
 * der Basis), dann gibt es auch keine Aussage.
 */
export function meltemiSafeUntilDay(checks: DayReturnCheck[]): number | null {
  let last: number | null = null;
  for (const c of checks) {
    if (c.status !== 'meltemi-fest') break;
    last = c.day;
  }
  return last;
}
