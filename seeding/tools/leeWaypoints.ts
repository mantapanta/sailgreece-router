/**
 * LEGT DIE KURSE IN DEN WINDSCHATTEN — einmalig anzuwendendes Werkzeug auf
 * seeding/data/legs.json, Geschwister von seaRouteLegs.ts.
 *
 * DIE ENTSCHEIDUNG DAHINTER (Skipper 2026-08-07): "Ein Katamaran segelt bei
 * Wind und Welle einfach nicht besonders gut. Insgesamt ist eine angenehmere,
 * längere Fahrt grundsätzlich einer kürzeren im Wind vorzuziehen." Damit ist
 * die Zielgrösse dieser Bibliothek für den Kurs nicht mehr die kürzeste Linie,
 * sondern die geschützteste, die man in vertretbarer Zeit fährt.
 *
 * WARUM ES DAS BRAUCHT. Die Poseidon-Bilder vom 10.08. zeigen den Westkorridor
 * als zusammenhängende Abdeckungsbahn von Kea über Kythnos bis Serifos — aber
 * sie liegt NICHT auf der Verbindungslinie der Inseln. Ein Schatten läuft nach
 * SSW (Windrichtung + 180°), die kuratierten Etappen laufen SSE/NNW; die Kurse
 * streifen die Bahn nur am Rand. Gemessen lag `serifos--kythnos` zu 45 % im
 * Lee, um 3 sm nach Westen versetzt zu 73 %. Der Gewinn liegt in den
 * WEGPUNKTEN, nicht in der Kuration der Zonen.
 *
 * WAS DAS WERKZEUG TUT. Je Insel-Paar (kanonisch, siehe unten) sucht es zwei
 * Kontrollpunkte auf einem Raster seitlicher Versätze, legt den Kurs darüber
 * landfrei (searoute.ts) und bewertet ihn mit dem mittleren Lee-Faktor über die
 * Strecke, gemittelt über das Meltemi-Band. Gewinnt ein Umweg genug, wird er
 * übernommen — sonst bleibt die Etappe unverändert.
 *
 * WAS ES ANFASST UND WARUM AUCH `distanceNm`. Anders als seaRouteLegs.ts, das
 * die recherchierten Distanzen ausdrücklich in Ruhe lässt: hier wird der Kurs
 * ABSICHTLICH länger. Bliebe die alte Zahl stehen, rechnete die Simulation den
 * neuen Weg mit der alten Länge — Abdeckung geschenkt, ohne den Umweg zu
 * bezahlen. Deshalb wird der GEMESSENE Umweg auf die recherchierte Distanz
 * addiert (nicht die Geometrie ersetzt: die Recherche bleibt die Grundlage),
 * und `distanceNote` sagt in jeder betroffenen Etappe, wer das getan hat.
 *
 * EINE BAHN JE PAAR, NICHT JE RICHTUNG. Der Schatten ist eine Eigenschaft des
 * WASSERS, nicht der Fahrtrichtung — die geschützteste Bahn ist hin wie zurück
 * dieselbe. 21 der 30 Paare sind ohnehin nur in einer Richtung gespeichert und
 * ihre Gegenrichtung wird gespiegelt abgeleitet (legs.ts, reverseLeg), eine
 * richtungsabhängige Bahn wäre dort gar nicht darstellbar. Der Preis ist
 * genannt: auf dem HINWEG (raumschots) kostet die Abdeckung Fahrt, ohne viel
 * Bequemlichkeit zu bringen. Nach der Skipper-Regel ist das der richtige Tausch
 * — aber es ist einer.
 *
 * Aufruf (idempotent):
 *   node seeding/tools/leeWaypoints.ts            # schreibt legs.json
 *   node seeding/tools/leeWaypoints.ts --dry-run  # zeigt nur, was sich ändert
 */

import { readFileSync, writeFileSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Coordinates } from '../../src/domain/schema/common.ts';
import type { WindTopoZone, WindTopoLeeZone } from '../../src/domain/schema/windTopo.ts';
import { isOnLand, pathLengthNm, seaRoute } from '../../src/domain/searoute.ts';
import { bearingDeg, destinationPoint, distanceNm } from '../../src/domain/geo.ts';
import { leeAnsatzAt } from '../../src/domain/windTopo.ts';

interface RawLeg {
  id: string;
  fromPlaceId: string;
  toPlaceId: string;
  distanceNm: number;
  waypoints: Coordinates[];
  distanceNote?: string;
  [key: string]: unknown;
}

/**
 * Das Meltemi-Band, für das optimiert wird. Nicht EINE Richtung: eine Bahn, die
 * nur bei exakt 025° schützt, ist an eine Stunde angepasst und an keinen Törn.
 * Der Gewinn wird über diese drei Lagen gemittelt.
 */
const MELTEMI_DEG = [0, 20, 40];

/** Abtastung der Strecke. 0,5 sm ist feiner als jede Zone schmal ist. */
const SCHRITT_NM = 0.5;

/**
 * WIND ALLEIN IST NICHT DIE BELASTUNG — DER KURS ZUM WIND GEHÖRT DAZU.
 *
 * Der erste Lauf dieses Werkzeugs hat es vorgeführt: es legte `paros--sifnos`
 * in den Schatten von Paros und machte aus einer grünen Etappe eine rote. Der
 * Bogen nach Norden holte zwar Abdeckung, baute aber einen Am-Wind-Schenkel
 * ein — und gegenan ist genau das, was der Katamaran nicht kann. Eine reine
 * Abdeckungs-Optimierung sucht sich solche Umwege systematisch.
 *
 * Die Gewichte sind KEINE Erfindung, sie stehen schon in den Parametern dieser
 * App: die Kurs-Ampel meldet Kreuz-Abschnitte ab 10 kn gelb, Halbwind-Abschnitte
 * erst ab 20 (`kreuzGelbAbKn` / `halbwindGelbAbKn`) — derselbe Wind ist gegenan
 * doppelt so unangenehm. Raumschots sagt die App gar nichts, also liegt es
 * darunter.
 */
/** Winkel zwischen Kurs und Windrichtung, auf 0–180 gefaltet. */
function gefalteterTwa(diffDeg: number): number {
  const d = (((diffDeg % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

function belastungsGewicht(twaDeg: number): number {
  const twa = gefalteterTwa(twaDeg);
  if (twa < UPWIND_TWA_DEG) return 2.0;
  if (twa < 120) return 1.0;
  return 0.7;
}

/** Kontrollpunkte auf der Luftlinie, an denen seitlich versetzt wird. */
const ANTEILE = [1 / 3, 2 / 3];

/** Seitliche Versätze in sm (positiv = steuerbord vom Kurs). */
const VERSATZ_NM = [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10];

/**
 * HARTE GRENZEN DES UMWEGS. Die Skipper-Regel stellt Bequemlichkeit über
 * Strecke, aber ein Törntag hat ein Budget (params.maxSailHours): ein Umweg,
 * der die Etappe um die Hälfte verlängert, verschiebt das Problem nur von der
 * Welle auf die Uhr.
 */
const MAX_UMWEG_REL = 0.35;
/** Rund eine Stunde Marschfahrt — die Grenze, die man an Bord noch erklärt. */
const MAX_UMWEG_ABS_NM = 6;

/**
 * DER WECHSELKURS zwischen Umweg und Abdeckung — die Skipper-Regel als Zahl,
 * und zwar in einem Satz, dem man widersprechen kann:
 *
 *     JEDE ZUSÄTZLICHE SEEMEILE MUSS ZEHN PROZENT WENIGER WIND BRINGEN.
 *
 * Skipper-Preis vom 2026-08-07, nachdem der erste Ansatz (ein Prozent je
 * Seemeile) Umwege von fünf Meilen für zwölf Prozent weniger Wind durchliess.
 * Zehn Prozent je Meile ist ein STRENGER Kurs: er lässt praktisch nur noch
 * Bahnen zu, die den Schutz fast geschenkt bekommen — eine bessere Linie durch
 * dieselbe Distanz, nicht ein Bogen darum herum.
 *
 * Das ist kein Widerspruch zur Regel "angenehmere lange Fahrt vor kurzer im
 * Wind": die gilt für die WAHL des Tagesziels, wo es um Stunden geht. Hier geht
 * es um Meilen innerhalb einer Etappe, und dort ist der Skipper streng.
 *
 * Absolut und nicht relativ bepreist, weil eine Seemeile Umweg auf einer langen
 * Etappe genauso lange dauert wie auf einer kurzen.
 */
const UMWEG_STRAFE_PRO_NM = 0.1;

/**
 * Unter diesem Gewinn bleibt die Etappe, wie sie ist. Fünf Prozent weniger Wind
 * im Mittel sind auf einem 25-kn-Tag gut eine Windstärke weniger in den Böen —
 * darunter lohnt es nicht, eine geprüfte Kuration anzufassen.
 */
const MIN_GEWINN = 0.05;

/**
 * LANDFREI NACH DEMSELBEN MASSSTAB WIE DER WÄCHTER.
 *
 * `pathCrossesLand` reicht hier nicht: der erste Lauf lieferte zwei Bahnen mit
 * Wegpunkten auf Kimolos und im Antiparos-Kanal, die dieser Prüfung entgangen
 * sind — und die der Bibliothekstest (libraryGeometry.test.ts) prompt gefunden
 * hat. Ein Werkzeug, das Daten erzeugt, muss gegen dieselbe Latte messen wie
 * der Test, der sie abnimmt; sonst produziert es zuverlässig Ausschuss.
 *
 * Übernommen ist deshalb dessen Abtastung samt Toleranzen: Land am ANFANG oder
 * ENDE ist die Ansteuerung einer Bucht, die die 250-m-Maske zugeschnitten hat.
 * Land MITTEN im Kurs ist ein Landweg.
 */
function laeuftUeberLand(punkte: Coordinates[]): boolean {
  if (punkte.some((p, i) => i > 0 && i < punkte.length - 1 && isOnLand(p))) return true;
  const proben: { s: number; land: boolean }[] = [];
  let s = 0;
  for (let i = 0; i < punkte.length - 1; i++) {
    const a = punkte[i]!;
    const b = punkte[i + 1]!;
    const len = distanceNm(a, b);
    const schritte = Math.max(80, Math.ceil(len * 200)); // ~9 m Raster
    for (let k = 0; k < schritte; k++) {
      const t = k / schritte;
      proben.push({
        s: s + len * t,
        land: isOnLand({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }),
      });
    }
    s += len;
  }
  for (let i = 0; i < proben.length; ) {
    if (!proben[i]!.land) {
      i++;
      continue;
    }
    const start = proben[i]!.s;
    while (i < proben.length && proben[i]!.land) i++;
    const ende = proben[i - 1]!.s;
    const vomEnde = Math.min(start, s - ende);
    if (vomEnde < 0.05) continue; // Ansteuerung einer zugeschnittenen Bucht
    if (ende - start <= 0.15) continue; // Auflösung der Maske selbst
    return true;
  }
  return false;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../data');
const round = (v: number): number => Number(v.toFixed(4));

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

function loadLeeZones(): WindTopoLeeZone[] {
  const doc = JSON.parse(readFileSync(path.join(dataDir, 'windtopo.json'), 'utf8')) as {
    zones: WindTopoZone[];
  };
  /**
   * ALLE Lee-Zonen, auch die mit `confidence: 'niedrig'`. Das Confidence-Tor
   * entscheidet, ob eine Zone BEWERTEN darf (domain/windTopo.ts) — wo Abdeckung
   * liegt, weiss sie trotzdem, und ein Kurs, der sie mitnimmt, ist auch dann
   * der angenehmere, wenn die Ampel die Zahl noch nicht glauben darf.
   */
  return doc.zones.filter((z): z is WindTopoLeeZone => z.kind === 'lee');
}

/**
 * Winkel, unter dem ein Kurs als GEGENAN gilt — `params.upwindTwaDeg`. Hier als
 * Konstante, weil das Werkzeug die Parameterdatei nicht lädt; weicht sie ab,
 * optimiert es gegen eine andere Grenze als die Bewertung urteilt.
 */
const UPWIND_TWA_DEG = 55;

interface Bewertung {
  /** Mittlerer Lee-Faktor — die reine Abdeckung, für die Anzeige. */
  faktor: number;
  /** Faktor MAL Kursgewicht: was die Etappe an Bord im MITTEL kostet. */
  belastung: number;
  /**
   * DER SCHLIMMSTE KREUZ-ABSCHNITT: der höchste Wind-Faktor auf einem Abschnitt,
   * der gegenan läuft — 0, wenn die Bahn gar nicht kreuzt.
   *
   * Er steht neben dem Mittel, weil die App ein MAXIMUM bewertet und kein
   * Mittel: eine Stunde Aufkreuzen über 25 kn macht die Etappe rot, egal wie
   * angenehm die übrigen zehn waren (scoring.ts, FR16). Der erste Lauf mit
   * Kursgewichtung ist genau daran gescheitert — er legte `paros--sifnos` in
   * den Schatten SÜDLICH von Sifnos, aber Kamares liegt im NORDWESTEN, und die
   * Ansteuerung aus dem Lee heraus wurde ein Schlag mit 9° TWA. Im Mittel ein
   * Gewinn, in der Bewertung eine rote Etappe.
   */
  kreuzMax: number;
}

/**
 * Die Belastung einer Strecke: abgetastet je Abschnitt, damit jeder Punkt den
 * Kurs kennt, auf dem er gefahren wird — ohne ihn liesse sich der Winkel zum
 * Wind nicht bilden, und genau der entscheidet.
 *
 * Gemittelt über das Meltemi-Band, nicht über eine Richtung: eine Bahn, die nur
 * bei exakt 025° taugt, ist an eine Stunde angepasst und an keinen Törn.
 */
function bewerte(punkte: Coordinates[], zonen: WindTopoLeeZone[]): Bewertung {
  let sFaktor = 0;
  let sBelastung = 0;
  let kreuzMax = 0;
  let n = 0;
  for (let i = 1; i < punkte.length; i++) {
    const a = punkte[i - 1]!;
    const b = punkte[i]!;
    const d = distanceNm(a, b);
    if (d <= 0) continue;
    const kurs = bearingDeg(a, b);
    const schritte = Math.max(1, Math.round(d / SCHRITT_NM));
    for (let k = 0; k < schritte; k++) {
      const p = destinationPoint(a, kurs, (d * k) / schritte);
      for (const dir of MELTEMI_DEG) {
        const f = leeAnsatzAt(zonen, p, dir)?.factor ?? 1;
        const twa = gefalteterTwa(kurs - dir);
        sFaktor += f;
        sBelastung += f * belastungsGewicht(kurs - dir);
        if (twa < UPWIND_TWA_DEG) kreuzMax = Math.max(kreuzMax, f);
        n++;
      }
    }
  }
  return n > 0
    ? { faktor: sFaktor / n, belastung: sBelastung / n, kreuzMax }
    : { faktor: 1, belastung: 1, kreuzMax: 0 };
}

interface Kandidat {
  waypoints: Coordinates[];
  pfad: Coordinates[];
  laengeNm: number;
  faktor: number;
  belastung: number;
  kreuzMax: number;
  score: number;
}

/** Kurs über zwei seitlich versetzte Kontrollpunkte, landfrei gelegt. */
function baueKandidat(
  from: Coordinates,
  to: Coordinates,
  versaetze: number[],
  zonen: WindTopoLeeZone[],
  basisLaengeNm: number,
): Kandidat | null {
  const kurs = bearingDeg(from, to);
  const quer = (kurs + 90) % 360;
  const gesamt = distanceNm(from, to);
  const kontroll: Coordinates[] = [];
  for (let i = 0; i < ANTEILE.length; i++) {
    const auf = destinationPoint(from, kurs, gesamt * ANTEILE[i]!);
    const v = versaetze[i]!;
    kontroll.push(v === 0 ? auf : destinationPoint(auf, quer, v));
  }
  const routed = seaRoute([from, ...kontroll, to]);
  if (routed.unresolved) return null;
  const waypoints = routed.path
    .slice(1, -1)
    .map((p) => ({ lat: round(p.lat), lon: round(p.lon) }));
  const pfad = [from, ...waypoints, to];
  if (laeuftUeberLand(pfad)) return null;
  const laengeNm = pathLengthNm(pfad);
  const umweg = laengeNm - basisLaengeNm;
  if (umweg > MAX_UMWEG_ABS_NM) return null;
  if (umweg > basisLaengeNm * MAX_UMWEG_REL) return null;
  const { faktor, belastung, kreuzMax } = bewerte(pfad, zonen);
  return {
    waypoints,
    pfad,
    laengeNm,
    faktor,
    belastung,
    kreuzMax,
    score: belastung + UMWEG_STRAFE_PRO_NM * Math.max(0, umweg),
  };
}

/**
 * Kanonische Richtung eines Paares: alphabetisch. Beide gespeicherten
 * Richtungen bekommen DIESELBE Bahn (gespiegelt) — sonst behaupteten Hin- und
 * Rückweg über dasselbe Wasser zwei verschiedene beste Kurse, und welcher gilt,
 * hinge daran, in welcher Reihenfolge das Werkzeug sie gefunden hat.
 */
function paarSchluessel(leg: RawLeg): string {
  return [leg.fromIslandId as string, leg.toIslandId as string].sort().join('--');
}

function main(): void {
  const dryRun = process.argv.includes('--dry-run');
  const legsPath = path.join(dataDir, 'legs.json');
  const file = JSON.parse(readFileSync(legsPath, 'utf8')) as {
    legs: RawLeg[];
    [key: string]: unknown;
  };
  const places = loadPlaces();
  const zonen = loadLeeZones();
  if (zonen.length === 0) {
    console.warn('Keine Lee-Zonen in windtopo.json — nichts zu optimieren.');
    return;
  }

  /** Ergebnis je Paar, damit beide gespeicherten Richtungen dasselbe bekommen. */
  const proPaar = new Map<
    string,
    { waypoints: Coordinates[]; umwegNm: number; von: number; nach: number; faktorVon: number; faktorNach: number }
  >();
  /** Getrennt von `proPaar`: auch ein UNVERÄNDERTES Paar ist erledigt. */
  const geprueft = new Set<string>();
  let geaendert = 0;

  // Kanonisch sortiert, damit der Lauf reproduzierbar ist.
  const sortiert = [...file.legs].sort((a, b) => a.id.localeCompare(b.id));

  for (const leg of sortiert) {
    const schluessel = paarSchluessel(leg);
    if (geprueft.has(schluessel)) continue;
    geprueft.add(schluessel);
    const from = places[leg.fromPlaceId];
    const to = places[leg.toPlaceId];
    if (!from || !to) {
      console.warn(`${leg.id}: Platz fehlt — übersprungen`);
      continue;
    }

    const basisPfad = [from, ...leg.waypoints, to];
    const basisLaenge = pathLengthNm(basisPfad);
    const basis = bewerte(basisPfad, zonen);

    let bester: Kandidat | null = null;
    for (const v1 of VERSATZ_NM) {
      for (const v2 of VERSATZ_NM) {
        const k = baueKandidat(from, to, [v1, v2], zonen, basisLaenge);
        if (!k) continue;
        /**
         * DIE HARTE SCHRANKE: ein Umweg darf keinen Kreuz-Abschnitt schaffen,
         * den die alte Bahn nicht hatte — und keinen schärferen. Die App
         * bewertet gegen das Maximum (scoring.ts), also muss das Werkzeug
         * gegen dasselbe Maximum optimieren. Ohne diese Zeile tauscht es
         * Bequemlichkeit im Mittel gegen eine rote Etappe.
         */
        if (k.kreuzMax > basis.kreuzMax + 1e-9) continue;
        if (!bester || k.score < bester.score) bester = k;
      }
    }

    if (!bester || basis.belastung - bester.belastung < MIN_GEWINN) {
      console.log(
        `  ${schluessel.padEnd(22)} unverändert   Belastung ${basis.belastung.toFixed(3)}` +
          `${bester ? ` (bester Umweg brächte nur ${bester.belastung.toFixed(3)})` : ''}`,
      );
      continue;
    }

    /**
     * NUR AUFSCHLAGEN, NIE ABZIEHEN. Fällt die neue Bahn kürzer aus als die
     * bisherige Geometrie, heisst das nicht, dass die Etappe kürzer GEWORDEN
     * ist — `distanceNm` ist die recherchierte Distanz, und die Geometrie war
     * ihr schon vorher nicht gleich (seaRouteLegs.ts legt Kurse um, ohne
     * Distanzen anzufassen). Eine Verkürzung der recherchierten Zahl wäre eine
     * Behauptung über die Strecke, die aus einer Optimierung des SCHUTZES
     * stammt. Also: Umweg ja, Abkürzung nein.
     */
    const umweg = Math.max(0, bester.laengeNm - basisLaenge);
    proPaar.set(schluessel, {
      waypoints: bester.waypoints,
      umwegNm: umweg,
      von: basis.belastung,
      nach: bester.belastung,
      faktorVon: basis.faktor,
      faktorNach: bester.faktor,
    });
    console.log(
      `  ${schluessel.padEnd(22)} Belastung ${basis.belastung.toFixed(3)} -> ${bester.belastung.toFixed(3)}` +
        `  (Lee Ø${basis.faktor.toFixed(2)} -> Ø${bester.faktor.toFixed(2)})` +
        `   ${umweg > 0 ? `+${umweg.toFixed(1)} sm` : 'ohne Umweg'}   ${bester.waypoints.length} Wegpunkte`,
    );
  }

  // Auf beide gespeicherten Richtungen anwenden — gespiegelt.
  for (const leg of file.legs) {
    const treffer = proPaar.get(paarSchluessel(leg));
    if (!treffer) continue;
    const from = places[leg.fromPlaceId]!;
    const to = places[leg.toPlaceId]!;
    // Die Bahn wurde für EINE Richtung gebaut; für die andere ist sie dieselbe
    // Linie rückwärts. Welche es ist, entscheidet der Abstand zum Startplatz.
    const ersterWp = treffer.waypoints[0];
    const gespiegelt =
      ersterWp !== undefined &&
      distanceNm(from, ersterWp) > distanceNm(to, ersterWp);
    const waypoints = gespiegelt ? [...treffer.waypoints].reverse() : treffer.waypoints;

    const alt = JSON.stringify(leg.waypoints);
    const neu = JSON.stringify(waypoints);
    if (alt === neu && leg.distanceNote) continue;
    geaendert++;
    leg.waypoints = waypoints;
    // Der GEMESSENE Umweg auf die recherchierte Distanz — die Recherche bleibt
    // die Grundlage, addiert wird nur, was der Bogen wirklich kostet.
    const alteDistanz = leg.distanceNm;
    leg.distanceNm = Number((alteDistanz + treffer.umwegNm).toFixed(1));
    leg.distanceNote =
      `Kurs 2026-08-07 mit seeding/tools/leeWaypoints.ts in den Windschatten gelegt ` +
      `(Skipper-Regel: angenehmere lange Fahrt vor kurzer im Wind). Belastung ueber das ` +
      `Meltemi-Band ${treffer.von.toFixed(2)} -> ${treffer.nach.toFixed(2)} (Lee-Faktor ` +
      `${treffer.faktorVon.toFixed(2)} -> ${treffer.faktorNach.toFixed(2)}, gewichtet mit dem Kurs zum Wind). ` +
      (treffer.umwegNm > 0
        ? `Recherchierte Distanz ${alteDistanz} sm plus ${treffer.umwegNm.toFixed(1)} sm gemessener Umweg; ` +
          `die Recherche bleibt die Grundlage, addiert ist nur der Bogen.`
        : `Ohne Umweg: die neue Bahn ist nicht laenger als die bisherige, die recherchierte ` +
          `Distanz bleibt unveraendert.`);
  }

  console.log(
    `\n${proPaar.size} Paare umgelegt, ${geaendert} gespeicherte Etappen geschrieben.`,
  );
  if (dryRun) {
    console.log('--dry-run: legs.json bleibt unverändert.');
    return;
  }
  writeFileSync(legsPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  console.log(`${path.relative(process.cwd(), legsPath)} geschrieben.`);
}

main();
