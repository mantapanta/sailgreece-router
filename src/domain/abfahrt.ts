/**
 * ABFAHRTSEMPFEHLUNG — "früh los, früh ankommen" (Crowd-Strategie der
 * Törnanalyse/Breezada, Skipper 2026-08-05).
 *
 * Ziel: um `params.zielAnkunftHourAthens` (15:00) VOR ANKER liegen — das ist
 * der Unterschied zwischen einem entspannten Anlegen um 14:30 und einem
 * Drei-Versuche-Manöver um 17:00 in Böen; der Meltemi hat sein Maximum
 * zwischen 13 und 17 Uhr, die Buchten füllen sich ab dem frühen Nachmittag.
 *
 * Empfohlen wird je Etappentag die SPÄTESTE volle Abfahrtsstunde, deren
 * simulierte Ankunft (inklusive Zwischenstopp-Liegezeiten) das Ziel noch
 * hält — dieselbe Stundensimulation wie Bewertung und Karte (assessLeg,
 * AD-3), kein zweites Zeitmodell. Volle Stunden mit Absicht: die Simulation
 * ist stündlich aufgelöst, eine Minuten-Empfehlung wäre erfundene Präzision.
 *
 * Erreicht auch die früheste Abfahrt (`fruehesteAbfahrtHourAthens`, 06:00)
 * das Ziel nicht, wird die früheste empfohlen und die erwartete Ankunft
 * ehrlich dazugesagt — der Hinweis ersetzt kein Urteil: ob der Tag trotzdem
 * gefahren wird, sagen Ampel und Skipper.
 */

import type { Leg } from './schema/route.ts';
import type { AbfahrtsEmpfehlung, PlanningSnapshot } from './schema/snapshot.ts';
import { assessLeg, departureHourForDay, stopHoursForDay } from './scoring.ts';

/**
 * Ankunft (Athen-Dezimalstunden ab Mitternacht des Abfahrtstags) der
 * Etappenkette eines Tages bei Abfahrt um `abfahrtHour` — mit derselben
 * Offset-Verkettung wie Bewertung, Gültigkeit und Solver: die Folge-Etappe
 * startet nach Ankunft plus Liegezeit. Null, wenn eine Etappe im Fenster
 * nicht simulierbar ist (Achse, tote Referenz) — dann wird keine Ankunft
 * erfunden.
 */
function ankunftBeiAbfahrt(
  legs: Leg[],
  day: number,
  abfahrtHour: number,
  snapshot: PlanningSnapshot,
): number | null {
  // Dieselbe Abfahrtsbasis wie assessLeg (scoring.departureHourForDay,
  // eine Quelle) — der Offset rechnet die Wunsch-Abfahrt darauf um.
  const basis = departureHourForDay(snapshot, day);
  const stopHours = stopHoursForDay(snapshot, day);
  let offset = abfahrtHour - basis;
  let arrival: number | null = null;
  for (const [i, leg] of legs.entries()) {
    const a = assessLeg(leg, day, snapshot, {
      departureOffsetHours: offset === 0 ? undefined : offset,
    });
    if (a.totalHours === null || a.arrivalHourAthens === null) return null;
    arrival = a.arrivalHourAthens;
    if (i < legs.length - 1) offset += a.totalHours + stopHours;
  }
  return arrival;
}

/**
 * Die Empfehlung für einen Etappentag. `legs` ist die Kette, wie sie
 * gesegelt wird (dieselben Etappen, gegen die auch die Anzeige rechnet).
 * Null bei leerer Kette oder wenn keine einzige Abfahrtsstunde simulierbar
 * ist — keine Empfehlung ist ehrlicher als eine erfundene.
 */
export function empfehleAbfahrt(
  legs: Leg[],
  day: number,
  snapshot: PlanningSnapshot,
): AbfahrtsEmpfehlung | null {
  if (legs.length === 0) return null;
  const { params } = snapshot;
  const ziel = params.zielAnkunftHourAthens;
  const frueheste = params.fruehesteAbfahrtHourAthens;

  /**
   * Suche absteigend von der spätesten sinnvollen Stunde (Ziel − 1: eine
   * Etappe dauert nie 0 h) bis zur frühesten: die ERSTE Abfahrt, die das
   * Ziel hält, ist die späteste — genau die Empfehlung. Absteigend statt
   * Bisektion, weil die Dauer mit der Abfahrt variiert (der Nachmittags-
   * Meltemi macht späte Schläge langsamer) und die Ankunft deshalb nicht
   * monoton sein muss; der Bereich ist klein (≤ 9 Stunden).
   */
  let fallback: { abfahrt: number; ankunft: number } | null = null;
  for (let h = ziel - 1; h >= frueheste; h--) {
    const ankunft = ankunftBeiAbfahrt(legs, day, h, snapshot);
    if (ankunft === null) continue;
    if (ankunft <= ziel) {
      return {
        abfahrtHourAthens: h,
        ankunftHourAthens: ankunft,
        zielErreicht: true,
        hinweis: null,
      };
    }
    // Merken der FRÜHESTEN simulierbaren Abfahrt (Schleife endet dort) —
    // sie ist der Fallback, wenn das Ziel unerreichbar ist.
    fallback = { abfahrt: h, ankunft };
  }
  if (fallback === null) return null;
  return {
    abfahrtHourAthens: fallback.abfahrt,
    ankunftHourAthens: fallback.ankunft,
    zielErreicht: false,
    hinweis:
      `Auch bei Abfahrt um ${String(fallback.abfahrt).padStart(2, '0')}:00 ` +
      `Ankunft erst gegen ${fallback.ankunft.toFixed(1).replace('.', ',')} Uhr — ` +
      `das Ankerziel ${ziel}:00 ist an diesem Tag nicht zu halten.`,
  };
}
