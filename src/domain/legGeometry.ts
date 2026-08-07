/**
 * Die Etappe, wie sie wirklich gesegelt wird.
 *
 * Die Bibliothek speichert kuratierte Etappen: Insel zu Insel, mit einem
 * Start- und einem Zielhafen und einer geprüften Distanz. Ein PLAN verkettet
 * diese Etappen — und dabei gingen zwei Dinge kaputt, die auf dem Wasser nicht
 * kaputtgehen können:
 *
 *  1. Der Kurs lief über Land. `mykonos--paros` endet in Naoussa, und die
 *     Verbindung dorthin wurde als Luftlinie gezeichnet und gerechnet, quer
 *     über Paros, Delos oder Syros. Ein Segelboot fährt nicht durch eine Insel.
 *
 *  2. Der Kurs sprang. Tag 4 endete in Naoussa (Nordseite von Paros), Tag 5
 *     begann in Parikia (Westseite) — weil `paros--sifnos` in Parikia
 *     gespeichert ist. Zwischen beiden lagen 8 sm, die niemand segelte. Ein
 *     Segelboot fliegt nicht von einem Punkt zum anderen: der Endpunkt eines
 *     Tages IST der Startpunkt des nächsten.
 *
 * Dieses Modul repariert beides an EINER Stelle, indem es aus der kuratierten
 * Etappe die gesegelte macht:
 *   - `sailedLeg` verankert Start und Ziel an den Plätzen, an denen das Boot
 *     wirklich liegt, und legt den Kurs landfrei (searoute.ts)
 *   - `sailedLegsByDay` zieht das durch den ganzen Plan, Tag für Tag, und
 *     schliesst damit jede Lücke in der Kette
 *
 * Was NICHT verändert wird: die kuratierte Distanz, solange die Endpunkte
 * stehen. Sie kommt aus der Recherche und ist mehr als Geometrie (Bahnen,
 * Kreuzschläge, Sicherheitsabstände). Erst wenn ein Endpunkt sich verschiebt,
 * wird sie im Verhältnis der Kurslängen mitskaliert — die Kalibrierung bleibt
 * dabei erhalten, nur der Weg ist ein anderer.
 */

import type { Coordinates } from './schema/common.ts';
import type { Place } from './schema/place.ts';
import type { Leg } from './schema/route.ts';
import { legWaypointKey } from './scoring.ts';
import { distanceNm } from './geo.ts';
import { pathLengthNm, seaRoute } from './searoute.ts';

/** Kuratierter Kurs einer Etappe: Startplatz, Wegpunkte, Zielplatz. */
function legPath(
  leg: Leg,
  from: Coordinates,
  to: Coordinates,
): Coordinates[] {
  return [from, ...leg.waypoints, to];
}

/** Forecast-Key des n-ten kuratierten Wegpunkts (abgeleitete Etappen: gespiegelt). */
function curatedKey(leg: Leg, n: number): string {
  return leg.waypointKeys?.[n] ?? legWaypointKey(leg.id, n);
}

/** Ein kuratierter Wegpunkt mit seinem Forecast-Key. */
interface KeyedPoint {
  key: string;
  coordinates: Coordinates;
}

/**
 * Schneidet die Wegpunkte ab, die nur zur ERSETZTEN Ansteuerung gehörten.
 *
 * `kea--syros` endet in Ermoupoli auf der Ostseite von Syros und trägt dessen
 * Ansteuerungspunkte. Verankert ein Plan den Tag stattdessen in Grammata
 * (Nordwestseite), blieben sie im Kurs stehen: das Boot fuhr an Grammata
 * vorbei, 2,8 sm weiter bis vor Ermoupoli, und über dieselben Punkte wieder
 * zurück — eine tote Spitze von 5,6 sm, auf der Karte zweimal übereinander
 * gezeichnet. Quer über die Insel, denn Hin- und Rückweg dieser Spitze sind
 * genau der Schlag, den `searoute.ts` um Syros herumlegen muss.
 *
 * Abgeschnitten wird streng nur, was vom neuen Endpunkt WEGführt: ein Punkt,
 * der weiter von ihm entfernt liegt als sein Vorgänger, gehört zur Ansteuerung
 * eines Hafens, der nicht mehr angelaufen wird. Punkte, die Fortschritt machen,
 * bleiben stehen — der recherchierte Korridor wird nicht wegoptimiert, es fällt
 * nur die Spitze weg, die ohne ihren Hafen keinen Sinn mehr hat.
 */
function trimApproach(
  points: KeyedPoint[],
  target: Coordinates,
  opposite: Coordinates,
): KeyedPoint[] {
  const kept = [...points];
  while (kept.length > 0) {
    const last = kept[kept.length - 1]!;
    const prev = kept[kept.length - 2]?.coordinates ?? opposite;
    if (distanceNm(last.coordinates, target) <= distanceNm(prev, target)) break;
    kept.pop();
  }
  return kept;
}

/**
 * Forecast-Key eines EINGEFÜGTEN Umfahrungspunkts.
 *
 * Für einen Punkt, der erst zur Laufzeit entsteht, wurde nie ein Forecast
 * geholt (AD-3 holt Werte für die gespeicherte Punktmenge). Er leiht sich
 * deshalb den Key des nächstgelegenen kuratierten Punkts: der Wind zwei
 * Seemeilen vor dem Kap ist der Wind am Kap, und diese Näherung ist allemal
 * besser als eine Etappe, die deswegen 'unbewertet' bliebe.
 *
 * Der Regelfall ist es ohnehin nicht: die Bibliothek speichert ihre Kurse
 * landfrei (seeding/tools/seaRouteLegs.ts), eingefügt wird nur, wo ein Plan
 * eine Etappe an einen anderen Hafen derselben Insel verankert.
 */
function borrowedKey(
  point: Coordinates,
  candidates: { key: string; coordinates: Coordinates }[],
): string {
  let best = candidates[0]!;
  let bestNm = Infinity;
  for (const c of candidates) {
    const nm = distanceNm(point, c.coordinates);
    if (nm < bestNm) {
      bestNm = nm;
      best = c;
    }
  }
  return best.key;
}

/**
 * Die Etappe, wie sie an diesem Tag wirklich gesegelt wird: verankert an den
 * gegebenen Plätzen und landfrei gelegt.
 *
 * `fromPlaceId`/`toPlaceId` werden nur übernommen, wenn der Platz existiert UND
 * auf der Insel dieses Etappenendes liegt. Ein Platz auf einer anderen Insel
 * wäre kein Ankerpunkt, sondern ein Datenfehler — den meldet die
 * Plan-Gültigkeit (solver.ts, Bedingung 1d), und hier gilt weiter der
 * kuratierte Hafen.
 */
export function sailedLeg(
  leg: Leg,
  places: Place[],
  anchor: {
    fromPlaceId?: string | null;
    toPlaceId?: string | null;
    /**
     * PROBE: dieser Aufruf fragt nur, OB ein Kurs zustande käme — er wird nicht
     * gefahren und nicht bewertet. Dann bleibt die Konsole still.
     *
     * Gebraucht von der Platzwahl (`assess.planPlaceIds`), die für jeden
     * Kandidaten durchprobiert, ob das Boot am nächsten Morgen von dort
     * wegkommt. Ohne diesen Schalter meldete ausgerechnet die Prüfung, die den
     * schlechten Platz VERWIRFT, den Defekt, den sie gerade verhindert — und
     * eine Warnung, die auch dann kommt, wenn alles richtig läuft, ist nach
     * drei Tagen keine Warnung mehr.
     *
     * Das Ergebnis trägt `kursUnaufloesbar` unverändert; still ist nur die
     * Konsole.
     */
    probe?: boolean;
  } = {},
): Leg {
  const placeById = (id: string): Place | undefined => places.find((p) => p.id === id);
  const pick = (
    wanted: string | null | undefined,
    curated: string,
    islandId: string,
  ): string => {
    if (!wanted || wanted === curated) return curated;
    const place = placeById(wanted);
    return place && place.islandId === islandId ? wanted : curated;
  };

  const fromPlaceId = pick(anchor.fromPlaceId, leg.fromPlaceId, leg.fromIslandId);
  const toPlaceId = pick(anchor.toPlaceId, leg.toPlaceId, leg.toIslandId);

  const curatedFrom = placeById(leg.fromPlaceId);
  const curatedTo = placeById(leg.toPlaceId);
  const from = placeById(fromPlaceId);
  const to = placeById(toPlaceId);
  // Ohne Koordinaten gibt es keine Geometrie zu reparieren; die fehlenden
  // Plätze meldet scoring.assessLeg als 'unbewertet'.
  if (!from || !to || !curatedFrom || !curatedTo) return leg;

  // Die kuratierten Wegpunkte, um die Ansteuerung eines ersetzten Endpunkts
  // bereinigt. Steht ein Endpunkt unverändert, bleibt seine Ansteuerung auch
  // unverändert — getrimmt wird nur dort, wo der Anker die Etappe verschoben hat.
  let curated: KeyedPoint[] = leg.waypoints.map((w, n) => ({
    key: curatedKey(leg, n),
    coordinates: w,
  }));
  if (toPlaceId !== leg.toPlaceId) {
    curated = trimApproach(curated, to.coordinates, from.coordinates);
  }
  if (fromPlaceId !== leg.fromPlaceId) {
    curated = trimApproach([...curated].reverse(), from.coordinates, to.coordinates).reverse();
  }

  const routed = seaRoute([
    from.coordinates,
    ...curated.map((c) => c.coordinates),
    to.coordinates,
  ]);
  const inner = routed.path.slice(1, -1);
  if (routed.unresolved) {
    // Kein landfreier Kurs gefunden: dann steht dort die Luftlinie, und das
    // darf nicht stillschweigend passieren. Dieselbe Praxis wie bei ungültigen
    // Platz-Dokumenten (adapters/firestore.ts) — die Bewertung läuft weiter,
    // aber der Defekt ist sichtbar. Der Wächter dagegen ist
    // __tests__/libraryGeometry.test.ts.
    //
    // SEIT 2026-08-07 reicht die Konsolenzeile nicht mehr: sie war das einzige
    // Lebenszeichen, während die Bewertung auf der Luftlinie durch die Insel
    // weiterrechnete und dem Skipper eine rote Etappe mit erfundenen Zahlen
    // hinlegte. Der Befund geht jetzt AM LEG mit (`kursUnaufloesbar`) und macht
    // die Etappe unbewertbar (scoring.assessLeg).
    if (!anchor.probe) {
      console.warn(
        `Etappe ${leg.id} (${from.id} -> ${to.id}): kein landfreier Kurs gefunden — Kurs bleibt Luftlinie`,
      );
    }
  }

  // Distanz: kuratierter Wert, solange die Endpunkte stehen. Verschiebt ein
  // Ankerpunkt die Etappe, wird im Verhältnis der landfreien Kurslängen
  // skaliert — nicht der Luftlinien, sonst zählte die Umfahrung als Verkürzung.
  let distanceNmOut = leg.distanceNm;
  if (fromPlaceId !== leg.fromPlaceId || toPlaceId !== leg.toPlaceId) {
    const curatedRouted = seaRoute(
      legPath(leg, curatedFrom.coordinates, curatedTo.coordinates),
    );
    const base = curatedRouted.nm;
    if (base > 0) {
      distanceNmOut = Math.round(((leg.distanceNm * routed.nm) / base) * 10) / 10;
    } else {
      distanceNmOut = Math.round(pathLengthNm(routed.path) * 10) / 10;
    }
  }

  // Keys: kuratierte Wegpunkte behalten ihren, eingefügte leihen sich einen.
  const curatedPoints = [
    { key: from.id, coordinates: from.coordinates },
    ...curated,
    { key: to.id, coordinates: to.coordinates },
  ];
  const curatedWaypointPoints = curatedPoints.slice(1, -1);
  let nextCurated = 0;
  const waypointKeys = inner.map((w) => {
    const original = curated[nextCurated];
    if (
      original &&
      original.coordinates.lat === w.lat &&
      original.coordinates.lon === w.lon
    ) {
      return curated[nextCurated++]!.key;
    }
    return borrowedKey(
      w,
      curatedWaypointPoints.length > 0 ? curatedWaypointPoints : curatedPoints,
    );
  });

  return {
    ...leg,
    fromPlaceId,
    toPlaceId,
    waypoints: inner,
    waypointKeys,
    distanceNm: distanceNmOut,
    // Nur setzen, wenn er wirklich unauflösbar ist: ein `false` an jeder Etappe
    // wäre Rauschen in jedem Plan-Vergleich und jedem Snapshot-Diff.
    ...(routed.unresolved ? { kursUnaufloesbar: true } : {}),
  };
}

/** Ein Plantag, so weit dieses Modul ihn braucht. */
export interface DayAnchor {
  day: number;
  /** Etappen des Tages in Reihenfolge; leer an einem Hafentag. */
  legIds: string[];
  /**
   * Der Platz, an dem der Tag endet — der gewählte Liegeplatz, sonst der
   * vorgeschlagene. Null, wenn für diese Nacht keiner feststeht; dann bleibt
   * der kuratierte Zielhafen der Etappe der Ankerpunkt.
   */
  placeId: string | null;
  /**
   * Die HÄFEN DER ZWISCHENSTOPPS dieses Tages (Plan: `Stage.viaPlaceIds`) —
   * ein Eintrag je Etappe, Index i = Ziel der i-ten Etappe. Fehlt der Eintrag
   * oder ist er null, bleibt der kuratierte Hafen der Etappe der Ankerpunkt.
   * Der letzte Eintrag wird nie gelesen: dort endet der Tag, und dafür gilt
   * `placeId`.
   */
  viaPlaceIds?: (string | null)[] | null;
}

/**
 * Die gesegelten Etappen des ganzen Plans, Tag für Tag.
 *
 * Die Kette wird chronologisch aufgebaut: jeder Tag beginnt dort, wo der
 * vorige endete — auch über einen Hafentag hinweg, an dem das Boot liegt, wo
 * es liegt. Das ist die Bedingung, die auf dem Wasser gilt und die der Plan
 * vorher verletzen konnte.
 *
 * Tage mit unbekannter Etappe (Referenz nach einem Reimport tot) tragen an
 * dieser Stelle `undefined`; die Kette läuft danach mit dem letzten bekannten
 * Platz weiter, statt abzureissen.
 */
export function sailedLegsByDay(
  days: DayAnchor[],
  legsById: Map<string, Leg>,
  places: Place[],
): Map<number, (Leg | undefined)[]> {
  const out = new Map<number, (Leg | undefined)[]>();
  let position: string | null = null;

  for (const day of [...days].sort((a, b) => a.day - b.day)) {
    if (day.legIds.length === 0) {
      // Hafentag: die Position ist der Platz dieses Tages, sonst bleibt sie.
      position = day.placeId ?? position;
      out.set(day.day, []);
      continue;
    }
    const resolved: (Leg | undefined)[] = [];
    for (let i = 0; i < day.legIds.length; i++) {
      const leg = legsById.get(day.legIds[i]!);
      if (!leg) {
        resolved.push(undefined);
        continue;
      }
      // Der Zielplatz des Tages gilt nur für die LETZTE Etappe des Tages; ein
      // Zwischenstopp wird an seinem eigenen Hafen verankert (`viaPlaceIds`,
      // vom Skipper gewählt) und behält ohne Wahl den kuratierten.
      const isLast = i === day.legIds.length - 1;
      const anchored = sailedLeg(leg, places, {
        fromPlaceId: position,
        toPlaceId: isLast ? day.placeId : (day.viaPlaceIds?.[i] ?? null),
      });
      resolved.push(anchored);
      position = anchored.toPlaceId;
    }
    out.set(day.day, resolved);
  }
  return out;
}
