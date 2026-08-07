/**
 * TOPOGRAFISCHE WINDKORREKTUR — die Anwendung. Das WARUM steht im Modulkopf von
 * schema/windTopo.ts; hier steht, wie die Asymmetrie technisch eingelöst wird.
 *
 *              DÜSEN BEWERTEN UNGEBREMST. SCHATTEN NUR GEBREMST.
 *
 * Stand 2026-08-07 (Skipper): der Windschatten geht jetzt AUCH in Ampel und
 * Routing ein — Grundlage ist die Beobachtung, dass die Abdeckungszonen im
 * Poseidon-Modell über mehrere Tage und über schwachen wie starken Wind hinweg
 * an derselben Stelle stehen. Genau das sagt die These "Topografie, kein
 * Wetter" voraus, und damit ist sie belegt, nicht mehr nur plausibel.
 *
 * Die Asymmetrie bleibt trotzdem, sie ist nur von "aus/an" zu "wie weit"
 * geworden. VIER SICHERUNGEN halten den Windschatten kurz, und jede beantwortet
 * eine andere Frage:
 *
 *   1. KAPPUNG (`params.leeBewertungMaxAbzugKn`, Default 8 kn). Begrenzt, wie
 *      viel Wind die Bewertung höchstens wegnimmt. Steht der Schatten nicht,
 *      findet die Crew maximal diese Differenz mehr vor als angenommen. 0
 *      schaltet die Bewertung ab — dann berät das Lee wieder nur.
 *   2. CONFIDENCE-TOR (`scoringLeeZones`). Nur Zonen mit `confidence` 'mittel'
 *      oder 'hoch' bewerten; 'niedrig' berät weiter. Damit hat das Feld eine
 *      mechanische Folge statt bloss Schmuck zu sein — und eine Zone, deren
 *      Faktor nur AUS EINER ANDEREN abgeleitet ist, kann keine Ampel drehen.
 *      Für Düsen gibt es dieses Tor NICHT: eine falsche Düse macht die App zu
 *      vorsichtig, und zu vorsichtig ist der erlaubte Fehler.
 *   3. KEIN GRÜN AUS DEM LEE (scoring.ts). Eine Etappe, deren Bewertung auf
 *      einer Lee-Korrektur ruht, wird höchstens GELB. Das Lee darf ein Rot
 *      aufheben — es darf keinen Tag freisprechen. Grün heisst "die App hat
 *      keinen Vorbehalt", und "wir rechnen mit dem Schatten von Serifos" IST
 *      ein Vorbehalt. Die Etappe bleibt gültig und planbar; nur der Schein der
 *      Bedenkenlosigkeit fällt weg.
 *   4. ZWEI ORTE SEHEN NIE EIN LEE. Der Meltemi-Worst-Case des Rückkehr-Checks
 *      (AD-13) — er fragt "kommen wir auch bei voller Lage heim?", und diese
 *      Frage mit kuratierter Abdeckung zu beantworten hiesse, das Sicherheits-
 *      netz mit dem zu knüpfen, wogegen es sichert. Und die NACHT-AMPEL eines
 *      Liegeplatzes: ein Hafen im Lee der Insel hat seinen Schutzsektor bereits
 *      kuratiert (shelter.ts, "geschützt gegen N bis 35 kn"). Ihm zusätzlich
 *      weniger Wind zu servieren wäre dieselbe Abdeckung zweimal gezählt.
 *
 * Was strukturell bleibt: `applyWindTopo` — der Pfad, der den SNAPSHOT ändert —
 * liest weiterhin ausschliesslich Düsen. Der Windschatten fasst `windKn`
 * nirgends an; er wirkt nur dort, wo eine Etappe gerechnet wird, gekappt und
 * an Ort und Stelle (scoring.ts). Deshalb kann er nicht versehentlich in eine
 * Auswertung geraten, die ihn nicht erwartet.
 *
 * WO IN DER KETTE. `applyWindTopo` läuft in assessPlanning VOR
 * `applyPersistenceAssumption` — und diese Reihenfolge ist die richtige:
 * die Persistenz bildet ihren typischen Tagesgang aus den ECHTEN Stunden, und
 * echte Stunden sind ab hier die korrigierten. Der Zuschlag trägt damit auch in
 * die fortgeschriebenen Tage hinein, statt an Tag 6 stumm zu verschwinden.
 *
 * MARKIERT, NIE STUMM. Jede angefasste Stunde bekommt `windAdjusted[i] = true`
 * — dieselbe Rolle, die `windAssumed` für die Persistenz-Annahme spielt. Der
 * Grundsatz dieser Codebasis ist, dass jeder Wert, den kein Modell so
 * vorhergesagt hat, als solcher erkennbar bleibt (AD-10); ein Düsenzuschlag ist
 * genau so ein Wert.
 */

import type { Coordinates } from './schema/common.ts';
import type { Leg } from './schema/route.ts';
import type {
  DataBasis,
  LegAssessment,
  PlanAssessment,
  PlanningSnapshot,
  PointForecast,
} from './schema/snapshot.ts';
import type { LeeHinweis, WindTopoZone } from './schema/windTopo.ts';
import { sectorContains } from './ampel.ts';
import { compassPoint, distanceNm } from './geo.ts';
import { forecastCoordinates, waypointKeyOf } from './forecastKeys.ts';

export interface WindTopoInfo {
  /** Namen der Düsen-Zonen, die wirklich gegriffen haben. */
  angewandteZonen: string[];
  /** Zahl der (Ort, Stunde)-Paare, die einen Zuschlag bekommen haben. */
  korrigierteStunden: number;
  /** Der Satz für Fusszeile und Annahme-Detail; null, wenn nichts griff. */
  note: string | null;
}

const LEER: WindTopoInfo = {
  angewandteZonen: [],
  korrigierteStunden: 0,
  note: null,
};

/** Liegt der Ort in der Wirkfläche der Zone? */
function inZone(zone: WindTopoZone, at: Coordinates): boolean {
  return distanceNm(at, zone.center) <= zone.radiusNm;
}

/**
 * Der Faktor, den eine Zonenmenge für EINE Windrichtung ergibt — oder null,
 * wenn keine greift.
 *
 * ÜBERLAPPUNG: der STÄRKSTE Faktor gewinnt (Math.max). Bei Düsen ist das die
 * sichere Richtung — wo zwei Kanäle zusammenlaufen, ist der Wind eher schärfer
 * als milder, und eine Unterschätzung wäre der Fehler, der weh tut. Bei
 * Lee-Zonen ist es dieselbe Formel mit derselben Wirkung: der Faktor NÄHER AN 1
 * gewinnt, also die vorsichtigere Aussage über den Schatten. Eine Kuration, die
 * mehr Abdeckung behaupten will, muss die überlappende Zone verkleinern statt
 * eine tiefere darüberzulegen — dieselbe Regel wie bei den Schutzsektoren
 * (ampel.windSectorLimitKn).
 */
function factorFor(
  zones: readonly WindTopoZone[],
  at: Coordinates,
  windFromDeg: number,
): { factor: number; zone: WindTopoZone } | null {
  let best: { factor: number; zone: WindTopoZone } | null = null;
  for (const zone of zones) {
    if (!inZone(zone, at)) continue;
    for (const s of zone.sectors) {
      if (!sectorContains(s, windFromDeg)) continue;
      if (!best || s.factor > best.factor) best = { factor: s.factor, zone };
    }
  }
  return best;
}

/**
 * DER EINZIGE PFAD, DER `windKn` ANFASST — und er sieht nur Düsen.
 *
 * Pur: liefert einen neuen Snapshot, mutiert nie den übergebenen. Ohne
 * Düsen-Zonen ist das Ergebnis bitgleich die Eingabe; die Korrektur kann damit
 * nie schlechter sein als der Zustand vor ihrer Einführung — dieselbe
 * Invariante, die auch der Nah/Fern-Hybrid einhält (forecastMerge.ts).
 */
export function applyWindTopo(snapshot: PlanningSnapshot): {
  snapshot: PlanningSnapshot;
  info: WindTopoInfo;
} {
  const duesen = (snapshot.library.windTopoZones ?? []).filter(
    (z) => z.kind === 'duese',
  );
  if (duesen.length === 0) return { snapshot, info: LEER };

  const coords = forecastCoordinates(snapshot.library);
  const getroffen = new Set<string>();
  let korrigierteStunden = 0;

  const forecast: Record<string, PointForecast> = {};
  for (const [key, fc] of Object.entries(snapshot.forecast)) {
    const at = coords.get(key);
    // Ein Schlüssel ohne Koordinate kann nicht zugeordnet werden (Bibliothek
    // und Forecast stammen aus verschiedenen Läufen) — er bleibt unangetastet
    // statt geraten zu werden.
    const relevant = at ? duesen.filter((z) => inZone(z, at)) : [];
    if (!at || relevant.length === 0) {
      forecast[key] = fc;
      continue;
    }

    const windKn = fc.windKn.slice();
    const adjusted = (fc.windAdjusted ?? new Array<boolean>(fc.windKn.length).fill(false)).slice();
    for (let i = 0; i < windKn.length; i++) {
      const kn = windKn[i];
      const dir = fc.windDirDeg[i];
      if (typeof kn !== 'number' || typeof dir !== 'number') continue;
      const hit = factorFor(relevant, at, dir);
      if (!hit) continue;
      windKn[i] = kn * hit.factor;
      adjusted[i] = true;
      korrigierteStunden++;
      getroffen.add(hit.zone.name);
    }
    forecast[key] = { ...fc, windKn, windAdjusted: adjusted };
  }

  const angewandteZonen = [...getroffen].sort();
  const note =
    korrigierteStunden === 0
      ? null
      : `Düsen-Zuschlag kuratiert angewandt (${angewandteZonen.join(', ')}): ` +
        `${korrigierteStunden} Ortsstunden erhöht, weil das 7-km-Gitter die Kanäle glättet. ` +
        `Nur nach oben — Windschatten wird nie in eine Bewertung gerechnet.`;

  return {
    snapshot: { ...snapshot, forecast },
    info: { angewandteZonen, korrigierteStunden, note },
  };
}

// ---------------------------------------------------------------------------
// Die andere Hälfte: der Schatten. Gebremst in der Bewertung, ausführlich im
// Hinweis.
// ---------------------------------------------------------------------------

/**
 * DAS CONFIDENCE-TOR (Sicherung 2 im Modulkopf): welche Lee-Zonen bewerten
 * dürfen. 'niedrig' beraten weiter, aber sie fassen keine Ampel an.
 *
 * Die Grenze ist bewusst KEIN Parameter. Ein Regler dafür wäre die Einladung,
 * das Tor aufzudrehen, statt die Zone nachzukalibrieren — und die Kalibrierung
 * ist genau die Arbeit, die das Tor einfordern soll. Wer will, dass eine Zone
 * bewertet, liest ihren Faktor an mehreren Lagen nach und hebt ihre
 * `confidence`; das ist ein Datenschritt mit Begründung im Feld
 * `kalibriertAus`, kein Schalter.
 */
export function scoringLeeZones(zones: readonly WindTopoZone[]): WindTopoZone[] {
  return zones.filter(
    (z) => z.kind === 'lee' && (z.confidence === 'mittel' || z.confidence === 'hoch'),
  );
}

/**
 * DIE EINE STELLE, an der aus Modellwind und Lee-Faktor der Wert wird, mit dem
 * BEWERTET wird — samt Kappung (Sicherung 1 im Modulkopf).
 *
 * `maxAbzugKn: 0` gibt den Modellwind unverändert zurück; das ist der
 * Aus-Schalter der Lee-Bewertung, und er ist hier eingebaut statt beim Aufrufer,
 * damit es ihn nur einmal gibt.
 */
export function leeBewertungsKn(
  modellKn: number,
  factor: number,
  maxAbzugKn: number,
): number {
  return Math.max(modellKn * factor, modellKn - maxAbzugKn);
}

/**
 * Der Lee-Faktor an einem Ort für eine Windrichtung, oder null.
 *
 * Überlappung: `factorFor` nimmt den GRÖSSTEN Faktor, bei Lee-Zonen (< 1) also
 * den, der am nächsten an 1 liegt — die vorsichtigere Aussage über den
 * Schatten. Begründung wie dort.
 */
export function leeAnsatzAt(
  zones: readonly WindTopoZone[],
  at: Coordinates,
  windFromDeg: number,
): { factor: number; zone: WindTopoZone } | null {
  return factorFor(zones, at, windFromDeg);
}

/** Die Forecast-Punkte einer gesegelten Etappe (Start, Wegpunkte, Ziel). */
function legForecastPoints(
  leg: Leg,
  snapshot: PlanningSnapshot,
): { key: string; coordinates: Coordinates }[] {
  const places = snapshot.library.places;
  const from = places.find((p) => p.id === leg.fromPlaceId);
  const to = places.find((p) => p.id === leg.toPlaceId);
  return [
    ...(from ? [{ key: from.id, coordinates: from.coordinates }] : []),
    ...leg.waypoints.map((w, n) => ({ key: waypointKeyOf(leg, n), coordinates: w })),
    ...(to ? [{ key: to.id, coordinates: to.coordinates }] : []),
  ];
}

/**
 * Der Satz, der an der Etappe steht — formuliert hier, nie in der View (AD-2).
 *
 * `zone.kalibriertAus` steht bewusst NICHT drin: das sind zwei bis drei Sätze
 * Herkunftsprosa, die eine Zeile in der Tagesansicht unlesbar machen würden.
 * Sie richtet sich an den, der die Kuration pflegt, und steht dort, wo der
 * hinschaut — in der Datei. In der Zeile steht stattdessen das, was AN BORD
 * zählt: dass die Zahl kuratiert ist und wie weit man ihr trauen darf.
 */
function leeText(
  zone: WindTopoZone,
  modellKn: number,
  leeKn: number,
  angesetztKn: number,
  bewertet: boolean,
  windDirDeg: number,
  stunden: number,
): string {
  const fallboeen =
    zone.fallboeenNm !== undefined
      ? ` Fallböen bis ${String(zone.fallboeenNm).replace('.', ',')} sm unter Land — ` +
        `so dicht ist das Lee nicht nutzbar, dort steht es drehend und böig.`
      : '';
  /**
   * Der Satz über die Bewertung ist der wichtigste der Zeile, und er muss in
   * beiden Fällen wahr sein. Eine bewertende Zone nennt den GEKAPPTEN Wert —
   * sonst läse sich der Hinweis so, als sei mit `leeKn` gerechnet worden, und
   * die Kappung, die genau diese Differenz absichert, wäre unsichtbar.
   */
  const wirkung = bewertet
    ? `Geht in die Ampel ein, gekappt: gerechnet mit ${Math.round(angesetztKn)} kn. ` +
      `Deshalb ist dieser Tag höchstens gelb — steht die Abdeckung nicht, liegt hier mehr Wind.`
    : `BEWERTET NICHTS (Vertrauen ${zone.confidence}): die Ampel dieses Tages ` +
      `rechnet mit ${Math.round(modellKn)} kn.`;
  return (
    `${zone.name}: Modell ${compassPoint(windDirDeg)} ${Math.round(modellKn)} kn — ` +
    `im Windschatten rechnerisch ${Math.round(leeKn)} kn, über ${stunden} h der Etappe. ` +
    `${wirkung}` +
    fallboeen
  );
}

/**
 * DIE WINDSCHATTEN EINES TAGES als Hinweise — die Rückweg-Frage, um die es
 * geht: hinter welcher Insel lässt sich das Aufkreuzen abkürzen?
 *
 * Gerechnet gegen die GESEGELTE Kette (`LegAssessment.sailedLeg`) und die
 * Stunden, in denen die Etappe wirklich unter Weg ist (`breakdown`) — nicht
 * gegen die kuratierte Luftlinie und nicht gegen den ganzen Tag. Ein Schatten,
 * der um 19 Uhr steht, hilft einer Etappe nicht, die um 15 Uhr fest ist.
 *
 * Berichtet wird die Stunde mit dem STÄRKSTEN Modellwind, in der der Schatten
 * steht: dort ist die Abdeckung am meisten wert, und dort wird die Entscheidung
 * getroffen. Das ist bewusst nicht der Worst Case (den sucht die Ampel) und
 * nicht das Mittel — es ist die Stunde, für die man die Taktik wählt.
 */
export function leeHinweiseForStage(
  snapshot: PlanningSnapshot,
  legs: LegAssessment[],
): LeeHinweis[] {
  const lees = (snapshot.library.windTopoZones ?? []).filter((z) => z.kind === 'lee');
  if (lees.length === 0) return [];
  // Dieselbe Menge und dieselbe Kappung wie im Bewertungspfad (scoring.ts) —
  // aus denselben Funktionen, damit der Hinweis nicht behaupten kann, etwas sei
  // bewertet worden, das die Simulation gar nicht gesehen hat.
  const maxAbzugKn = snapshot.params.leeBewertungMaxAbzugKn;
  const bewertende = new Set(
    (maxAbzugKn > 0 ? scoringLeeZones(lees) : []).map((z) => z.id),
  );

  const idxByIso = new Map(snapshot.times.map((t, i) => [t, i]));
  const hinweise: LeeHinweis[] = [];

  for (const la of legs) {
    const leg = la.sailedLeg;
    if (!leg) continue;
    const punkte = legForecastPoints(leg, snapshot);
    // Die Stunden, in denen diese Etappe unter Weg ist — dedupliziert, weil ein
    // Kurswechsel eine Stunde in zwei Schritte teilt (LegHourBreakdown).
    const stundenIdx = [
      ...new Set(
        la.breakdown
          .map((b) => idxByIso.get(b.timeIso))
          .filter((i): i is number => i !== undefined),
      ),
    ];
    if (stundenIdx.length === 0) continue;

    for (const zone of lees) {
      const drin = punkte.filter((p) => inZone(zone, p.coordinates));
      if (drin.length === 0) continue;

      let stunden = 0;
      let best: {
        modellKn: number;
        leeKn: number;
        windDirDeg: number;
        basis: DataBasis;
      } | null = null;

      for (const i of stundenIdx) {
        // Der stärkste Punkt IN der Zone trägt die Stunde: der Schatten ist
        // eine Aussage über die Fläche, und die schwächste Ecke darin würde die
        // Abdeckung grösser aussehen lassen, als sie ist.
        let modellKn: number | null = null;
        let dir: number | null = null;
        let assumed = false;
        for (const p of drin) {
          const fc = snapshot.forecast[p.key];
          const kn = fc?.windKn[i];
          const d = fc?.windDirDeg[i];
          if (typeof kn !== 'number' || typeof d !== 'number') continue;
          if (modellKn === null || kn > modellKn) {
            modellKn = kn;
            dir = d;
            assumed = fc?.windAssumed[i] ?? false;
          }
        }
        if (modellKn === null || dir === null) continue;
        const hit = factorFor([zone], drin[0]!.coordinates, dir);
        if (!hit) continue;
        stunden++;
        if (!best || modellKn > best.modellKn) {
          best = {
            modellKn,
            leeKn: modellKn * hit.factor,
            windDirDeg: dir,
            basis: assumed ? 'annahme' : 'forecast',
          };
        }
      }

      if (!best || stunden === 0) continue;
      const bewertet = bewertende.has(zone.id);
      const angesetztKn = bewertet
        ? leeBewertungsKn(best.modellKn, best.leeKn / best.modellKn, maxAbzugKn)
        : best.modellKn;
      hinweise.push({
        zoneId: zone.id,
        name: zone.name,
        legId: la.legId,
        modellKn: best.modellKn,
        leeKn: best.leeKn,
        bewertet,
        angesetztKn,
        windDirDeg: best.windDirDeg,
        stunden,
        basis: best.basis,
        text: leeText(
          zone,
          best.modellKn,
          best.leeKn,
          angesetztKn,
          bewertet,
          best.windDirDeg,
          stunden,
        ),
      });
    }
  }

  // Der grösste Gewinn zuerst: der Skipper liest die erste Zeile, und das muss
  // die Insel sein, hinter der am meisten zu holen ist.
  return hinweise.sort(
    (a, b) => b.modellKn - b.leeKn - (a.modellKn - a.leeKn) || a.name.localeCompare(b.name),
  );
}

/**
 * EIN Satz für die Rückweg-Empfehlung (konzept.ts liefert die übrigen): wo auf
 * dem Heimweg dieses Plans Abdeckung liegt, die zum Aufkreuzen taugt.
 *
 * Nur für den RÜCKWEG — Tage nach `turnDay`. Auf dem Hinweg läuft der Meltemi
 * raumschots, dort ist ein Windschatten kein Gewinn, sondern nur weniger Fahrt.
 * Genau das war die Frage, aus der diese Korrektur entstand.
 */
export function leeRueckwegSatz(assessment: PlanAssessment): string | null {
  const turnDay = assessment.turnDay;
  if (turnDay === null) return null;
  const rueckweg = assessment.stages.filter(
    (s) => s.day > turnDay && s.leeHinweise.length > 0,
  );
  if (rueckweg.length === 0) return null;

  const inseln = [
    ...new Set(rueckweg.flatMap((s) => s.leeHinweise.map((h) => h.name))),
  ];
  const gewinn = Math.round(
    Math.max(
      ...rueckweg.flatMap((s) => s.leeHinweise.map((h) => h.modellKn - h.leeKn)),
    ),
  );
  return (
    `Rückweg im Lee: ${inseln.join(', ')} — kuratierte Abdeckung von bis zu ${gewinn} kn ` +
    `gegenüber dem Modellwind, brauchbar zum Aufkreuzen. Steht als Hinweis an den ` +
    `Etappentagen und geht in keine Ampel ein; die Bewertung rechnet mit dem vollen Wind.`
  );
}
