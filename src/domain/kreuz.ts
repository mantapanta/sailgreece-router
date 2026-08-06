/**
 * DIE KREUZ — was das Boot wirklich fährt, wenn das Ziel gegenan liegt.
 *
 * "Ich kann nicht weniger als TWA 50 segeln, das Boot bleibt dann stehen.
 * Geplant werden muss dann ein Kurs auf dem einen Bug mit TWA 50, dann wenden,
 * 100 Grad Kursänderung, und wieder 50 TWA zum Wind … dadurch wird die Strecke
 * entsprechend länger, und man kommt nicht direkt an, Zickzack zum Ziel."
 * (Skipper 2026-08-06)
 *
 * `polar.ts` beantwortet daraus die ZEIT (wie viel von der Fahrt auf der
 * Ideallinie ankommt). Dieses Modul beantwortet die GESTALT: die einzelnen
 * Schläge, ihre Kurse, ihre Längen, die Wenden dazwischen — und den Zickzack
 * als zeichenbaren Track. Ohne ihn behauptet die Karte weiter eine gerade
 * Linie zum Ziel, obwohl das Boot sie nicht fahren kann.
 *
 * DIE RECHNUNG. Kurs C, Wind aus W, Anstellwinkel δ = C − W (vorzeichenbehaftet,
 * |δ| < beat). Die beiden Bugs liegen auf W + beat und W − beat; zwischen ihnen
 * liegen 2·beat = 100° Kursänderung. Vom Kurs aus gesehen liegt der eine Schlag
 * um A = beat − δ daneben, der andere um B = beat + δ auf der anderen Seite.
 * Damit die Querversätze sich aufheben und die Summe genau D ergibt:
 *
 *     l_A = D · sin(B) / sin(2·beat)      l_B = D · sin(A) / sin(2·beat)
 *
 * Die Summe ist D · cos(δ) / cos(beat) — exakt der Kehrwert des Kreuz-Faktors
 * aus polar.ts. Zeit und Gestalt sagen dasselbe, sie sagen es nur an zwei
 * Stellen; die Tests halten das fest.
 *
 * WAS DIESER TRACK NICHT IST: eine Wendeanweisung. Wo wirklich gewendet wird,
 * entscheiden Dreher, Welle, Strom und Land — nicht ein Planer am Vorabend. Der
 * Track ist die SKIZZE, die zeigt, wie weit der Zickzack trägt und wie oft
 * angefasst werden muss. Deshalb nennt er auch keine eigene Distanz: die
 * Strecke durchs Wasser kommt aus der stündlichen Simulation (scoring.ts), es
 * gibt nur eine.
 */

import type { Coordinates } from './schema/common.ts';
import type { Params } from './schema/params.ts';
import {
  bearingDeg,
  destinationPoint,
  distanceNm,
  normDeg,
  signedAngleDeg,
} from './geo.ts';
import { pathCrossesLand } from './searoute.ts';

const rad = (d: number) => (d * Math.PI) / 180;

/** Ein Schlag der Kreuz — ein Bug, ein Kurs, eine Länge. */
export interface Schlag {
  /** Anliegender Kurs dieses Schlags, rechtweisend. */
  courseDeg: number;
  /** Länge durchs Wasser (sm). */
  nm: number;
  /**
   * Der Bug, auf dem gesegelt wird — die Seite, von der der Wind einfällt.
   * Backbordbug heisst: Wind von backbord, Steuerbord ist der Leebug.
   */
  bug: 'backbord' | 'steuerbord';
  /** Endpunkt des Schlags (Wendepunkt oder Ziel). */
  to: Coordinates;
}

export interface Kreuz {
  /** Die Schläge in der Reihenfolge, in der sie gesegelt werden. */
  schlaege: Schlag[];
  /**
   * Der Zickzack als Linienzug, Startpunkt inklusive. LEER, wenn kein
   * landfreier Zickzack gefunden wurde — dann wird nichts gezeichnet statt
   * eine Linie über Land zu behaupten.
   */
  track: Coordinates[];
  /** Zahl der Wenden = Schläge − 1. */
  wenden: number;
  /** Kursänderung bei jeder Wende: 2 × beatTwaDeg. */
  wendewinkelDeg: number;
  /**
   * Kein landfreier Zickzack gefunden (enge Passage, Kap in Luv). Der Umweg
   * bleibt richtig — nur zeichnen lässt er sich hier nicht, und das gehört
   * gesagt statt still verschwiegen.
   */
  landImWeg: boolean;
}

/**
 * Die Kreuz von `from` nach `to` bei Wind aus `windFromDeg` — oder null, wenn
 * der Kurs anliegt (TWA >= beatTwaDeg) und gar nicht gekreuzt werden muss.
 */
export function kreuzSchlaege(
  from: Coordinates,
  to: Coordinates,
  windFromDeg: number,
  params: Params,
): Kreuz | null {
  const D = distanceNm(from, to);
  if (D <= 0) return null;
  const beat = params.beatTwaDeg;
  const course = bearingDeg(from, to);
  const delta = signedAngleDeg(course, windFromDeg);
  if (Math.abs(delta) >= beat) return null;

  // Die beiden Bugs, benannt nach der Seite, von der der Wind einfällt:
  // Kurs = Wind + beat heisst, der Wind kommt von BACKBORD.
  const backbord = { courseDeg: normDeg(windFromDeg + beat), bug: 'backbord' as const };
  const steuerbord = { courseDeg: normDeg(windFromDeg - beat), bug: 'steuerbord' as const };
  const nenner = Math.sin(rad(2 * beat));
  const lBackbord = (D * Math.sin(rad(beat + delta))) / nenner;
  const lSteuerbord = (D * Math.sin(rad(beat - delta))) / nenner;

  // Der LANGE Schlag zuerst: er liegt näher am Kurs, hält das Boot in der Nähe
  // der Ideallinie und lässt die Entscheidung, wo gewendet wird, so lange wie
  // möglich offen — Standard-Taktik und zugleich die Variante, die auf der
  // Karte am wenigsten ausholt.
  const lang = lBackbord >= lSteuerbord ? backbord : steuerbord;
  const kurz = lang === backbord ? steuerbord : backbord;
  const langNm = Math.max(lBackbord, lSteuerbord);
  const kurzNm = Math.min(lBackbord, lSteuerbord);

  /**
   * Wie oft gewendet wird, folgt aus der Planlänge eines Schlags
   * (`params.kreuzSchlagNm`): ein Zickzack aus 40 Wenden ist so wenig ein Plan
   * wie einer aus einem einzigen Schlag quer aus dem Revier heraus. Findet sich
   * damit kein landfreier Weg, wird verdoppelt — kürzere Schläge bleiben näher
   * an der Ideallinie und passen durch Passagen, durch die ein weit
   * ausholender Schlag nicht passt.
   */
  const gesamtNm = langNm + kurzNm;
  const startPaare = Math.max(
    1,
    Math.round(gesamtNm / Math.max(0.1, 2 * params.kreuzSchlagNm)),
  );
  let letzte: Kreuz | null = null;
  for (const paare of [startPaare, startPaare * 2, startPaare * 4]) {
    const kreuz = baueZickzack(from, to, lang, kurz, langNm, kurzNm, paare, beat);
    letzte = kreuz;
    if (!pathCrossesLand(kreuz.track)) return kreuz;
  }
  return { ...letzte!, track: [], landImWeg: true };
}

function baueZickzack(
  from: Coordinates,
  to: Coordinates,
  lang: { courseDeg: number; bug: 'backbord' | 'steuerbord' },
  kurz: { courseDeg: number; bug: 'backbord' | 'steuerbord' },
  langNm: number,
  kurzNm: number,
  paare: number,
  beat: number,
): Kreuz {
  const schlaege: Schlag[] = [];
  const track: Coordinates[] = [from];
  let pos = from;
  for (let i = 0; i < paare; i++) {
    for (const [bug, nm] of [
      [lang, langNm / paare] as const,
      [kurz, kurzNm / paare] as const,
    ]) {
      // Der LETZTE Schlag endet definitionsgemäss am Ziel: die Rundungsreste
      // aller vorherigen Schläge dürfen nicht als Versatz stehen bleiben, sonst
      // endete der gezeichnete Zickzack neben dem Hafen.
      const letzterSchlag = i === paare - 1 && bug === kurz;
      pos = letzterSchlag ? to : destinationPoint(pos, bug.courseDeg, nm);
      schlaege.push({ courseDeg: bug.courseDeg, nm, bug: bug.bug, to: pos });
      track.push(pos);
    }
  }
  return {
    schlaege,
    track,
    wenden: schlaege.length - 1,
    wendewinkelDeg: 2 * beat,
    landImWeg: false,
  };
}
