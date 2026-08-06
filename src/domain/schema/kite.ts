import { z } from 'zod';
import { CoordinatesSchema } from './common.ts';
import { ConfidenceSchema } from './berthing.ts';
import type { DataBasis } from './snapshot.ts';

/**
 * KITE-SPOTS des Reviers (Skipper-Wunsch 2026-08-06: "eine Funktion zur Anzeige
 * von Kite-Spots").
 *
 * Eine EIGENE Bibliothek, keine Subebene des Platzes — anders als die
 * Gastronomie (gastro.ts), die nur von ihrem Liegeplatz aus existiert. Ein
 * Kite-Spot liegt dort, wo Wind und Wasser stimmen, und das ist regelmässig
 * NICHT der Hafen: Mikri Vigla liegt 5 sm von Naxos-Stadt, der Pounda-Kanal
 * gehört zu Paros und ankert man auf Antiparos. Genau deshalb braucht der Spot
 * eine eigene Koordinate — nur mit ihr lässt sich beantworten, ob er an der
 * Etappe von heute liegt (domain/kite.ts).
 *
 * NICHTS HIER BEWERTET ETWAS. Weder Ampel noch Solver noch Budget liest ein
 * Feld dieses Schemas; ein Kite-Spot verschiebt keine Route und kippt keine
 * Ampel. Er ist ein HINWEIS an der Etappe — dieselbe Doktrin wie bei den
 * Liegeplatz-Details und der Gastronomie: anzeigen ja, bewerten nein.
 *
 * `refPlaceId` ist der ANKER des Spots, in zwei Bedeutungen und keiner dritten:
 *   1. Forecast-Bezug — für Kite-Spots wird kein eigener Forecast geholt (AD-3:
 *      Forecast-Keys sind Plätze und Etappen-Wegpunkte), also liest die
 *      Bewertung den Wind dieses Platzes und sagt in jedem Hinweis dazu, wo
 *      gemessen wurde.
 *   2. Link-Ziel — der Spot wird im Platzdetail dieses Liegeplatzes gezeigt.
 *
 * Es ist ausdrücklich KEINE Aussage über den Beiweg — und bewusst nicht
 * „nearestPlaceId": der geometrisch nächste Platz zu Mikri Vigla liegt auf
 * PAROS, jenseits des Kanals. Der Bezugsplatz ist deshalb kuratiert, nicht
 * gerechnet: es ist der Liegeplatz, von dem aus dieser Spot in diesem Törn
 * angefahren wird. Wie man wirklich hinkommt, steht in `accessInfo`, und das
 * darf „5 sm nach Süden, als Tagesziel planen" heissen.
 */

const norm = (d: number) => ((d % 360) + 360) % 360;

/**
 * Windrichtungen, AUS DENEN der Spot funktioniert (AD-6: "kommend aus", im
 * Uhrzeigersinn von `fromDeg` bis `toDeg`, Wrap über Nord erlaubt, Grenzen
 * inklusiv). Dieselbe Semantik wie die Schutzsektoren des Liegeplatzes
 * (shelter.ts) — nur die Aussage ist die umgekehrte: dort "hier ist Ruhe",
 * hier "hier steht der Wind richtig".
 *
 * Punkt-Sektoren sind verboten, weil sie in `sectorContains` still zum
 * VOLLKREIS werden: ein Tippfehler 350–350 hiesse dann "funktioniert aus jeder
 * Richtung", und der Spot stünde an jeder Etappe als passend da.
 */
export const KiteWindSectorSchema = z
  .object({
    fromDeg: z.number().min(0).max(360),
    toDeg: z.number().min(0).max(360),
  })
  .refine((s) => norm(s.fromDeg) !== norm(s.toDeg), {
    message: 'Punkt-Sektor (fromDeg === toDeg) verboten — ein Kite-Spot hat eine Windrichtung',
  });
export type KiteWindSector = z.infer<typeof KiteWindSectorSchema>;

/** Wasserzustand des Spots — was man dort fährt, nicht wie gut es ist. */
export const KiteWaterSchema = z.enum([
  /** Stehtiefes Flachwasser / Lagune — spiegelglatt, Freestyle, Einsteiger. */
  'flachwasser',
  /** Kabbelwasser: kurze Welle über tieferem Grund. */
  'choppy',
  /** Ausgeprägte Welle / Swell — Wave-Riding. */
  'welle',
  /** Tiefwasser ohne Stehbereich — nur mit Sicherung vom Boot. */
  'tiefwasser',
]);
export type KiteWater = z.infer<typeof KiteWaterSchema>;

/** Wie man ins Wasser kommt. Entscheidet, ob der Spot vom Katamaran taugt. */
export const KiteLaunchSchema = z.enum(['strand', 'dinghy', 'boot']);
export type KiteLaunch = z.infer<typeof KiteLaunchSchema>;

/** Wen der Spot trägt — die kuratierte Mindestanforderung, kein Verbot. */
export const KiteLevelSchema = z.enum(['einsteiger', 'fortgeschritten', 'experte']);
export type KiteLevel = z.infer<typeof KiteLevelSchema>;

export const KiteSpotSchema = z.object({
  /**
   * Kebab-case mit Pflicht-Präfix `kite-`. Das Präfix ist kein Schmuck: die
   * Bibliothek führt schon einen Platz `mykonos-kalafatis`, und ein Kite-Spot
   * derselben Bucht hätte ohne Präfix dieselbe Id — beim Lesen einer Review,
   * eines Deeplinks oder eines Firestore-Dokuments wäre dann nicht mehr zu
   * sehen, welche der beiden Bibliotheken gemeint ist.
   */
  id: z.string().regex(/^kite-[a-z0-9-]+$/),
  name: z.string().min(1),
  islandId: z.string().regex(/^[a-z0-9-]+$/),
  coordinates: CoordinatesSchema,
  windSectors: z.array(KiteWindSectorSchema).min(1),
  water: KiteWaterSchema,
  /** Mindestens eine Startart — ein Spot, den man nicht betreten kann, ist keiner. */
  launch: z.array(KiteLaunchSchema).min(1),
  level: KiteLevelSchema,
  /**
   * Kuratierter Bezugs-Liegeplatz: Forecast-Bezug UND Link-Ziel (Modulkopf).
   * Pflichtfeld — ohne ihn hätte der Spot keinen Wind und keine Seite.
   */
  refPlaceId: z.string().regex(/^[a-z0-9-]+$/),
  /** Der Weg vom Bezugs-Liegeplatz zum Spot — Beiboot, Fussweg, Distanz. */
  accessInfo: z.string().min(1),
  /** Was dort gefährlich ist (Untiefen, Strömung, Badebetrieb, Fähren). */
  hazards: z.array(z.string().min(1)).default([]),
  /** Schule / Verleih / Auflagen vor Ort, als Freitext. */
  localNote: z.string().min(1).nullable().optional(),
  description: z.string().min(1).nullable().optional(),
  /**
   * Weiterführender Link zum Spot. OPTIONAL und bewusst leer, solange keine
   * geprüfte Adresse vorliegt — eine erfundene URL ist schlimmer als keine
   * (AD-4: eine Lücke bleibt eine Lücke).
   */
  infoUrl: z.string().url().nullable().optional(),
  confidence: ConfidenceSchema,
  sources: z.array(z.string().min(1)).min(1),
});
export type KiteSpot = z.infer<typeof KiteSpotSchema>;

// ---------------------------------------------------------------------------
// Abgeleitete Anzeige-Werte (gerechnet in domain/kite.ts, AD-2)
// ---------------------------------------------------------------------------

/**
 * Taugt der Spot an diesem Tag? Vier benannte Zustände statt eines Boolean,
 * denn der Unterschied ist der, an dem der Tag geplant wird: zu wenig Wind
 * heisst warten, zu viel heisst Kite kleiner oder gar nicht, falsche Richtung
 * heisst anderer Spot.
 */
export type KiteEignung = 'passt' | 'stark' | 'wenig-wind' | 'richtung' | 'unbewertet';

/** Wie der Spot an eine Etappe kommt. */
export type KiteBezug =
  /** Auf der Insel, von der die Etappe losfährt (bzw. wo der Hafentag liegt). */
  | 'start'
  /** Auf der Ziel-Insel der Etappe. */
  | 'ziel'
  /** Am Kurs — innerhalb `params.kiteKorridorNm` neben der gesegelten Linie. */
  | 'strecke';

/** Ein Kite-Spot, bewertet für EINEN Törntag. */
export interface KiteSpotTag {
  spotId: string;
  name: string;
  islandId: string;
  /** Liegeplatz, in dessen Detailansicht der Spot steht (refPlaceId). */
  placeId: string;
  /** Törntag, für den das Kite-Fenster ausgewertet wurde. */
  day: number;
  eignung: KiteEignung;
  /**
   * Wind der BESTEN Stunde des Kite-Fensters (die, die `eignung` trägt) —
   * gelesen am Forecast von `placeId`, nicht am Spot selbst.
   */
  windKn: number | null;
  windDirDeg: number | null;
  /** Stunden im Fenster, in denen Richtung UND Stärke passen. */
  passendeStunden: number;
  /** Forecast oder Persistenz-Annahme (Stunde, die das Urteil trägt). */
  basis: DataBasis;
  /** Der Hinweis in einem Satz — fertig formuliert, Views formatieren nicht. */
  text: string;
}

/** Ein Kite-Spot, bewertet und an eine Etappe geknüpft. */
export interface KiteHinweis extends KiteSpotTag {
  bezug: KiteBezug;
  /**
   * Abstand zur gesegelten Linie in sm — nur bei `bezug: 'strecke'` gesetzt.
   * Auf Start- und Ziel-Insel steht die Zugehörigkeit fest, und eine Zahl
   * daneben würde eine Genauigkeit behaupten, die nichts entscheidet.
   */
  abstandNm: number | null;
}
