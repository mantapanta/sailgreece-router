import { z } from 'zod';
import { CoordinatesSchema } from './common.ts';

/**
 * A leg from island to island (concretely: place to place).
 * IDs: 'paros--naxos'. Distances in nm, already Alimos-rebased where
 * applicable (AD-10); `rebasedFrom` documents the original reference point.
 */
export const LegSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+(--[a-z0-9-]+)$/),
  fromIslandId: z.string(),
  toIslandId: z.string(),
  fromPlaceId: z.string(),
  toPlaceId: z.string(),
  distanceNm: z.number().positive(),
  /** Intermediate waypoints (forecast is fetched for these too, AD-3). */
  waypoints: z.array(CoordinatesSchema).default([]),
  /**
   * Normative forecast keys per waypoint, overriding the default
   * `leg:<id>:<n>`. NEVER curated: set only by domain code for DERIVED legs
   * (e.g. reversed connectors), whose waypoints must keep the forecast keys
   * of the ORIGINAL stored leg — the snapshot only ever fetches keys of the
   * stored direction (AD-3).
   */
  waypointKeys: z.array(z.string()).optional(),
  /**
   * Static wind-planning warnings for known acceleration zones
   * (FR10: Kea-Kanal, Kafireas, Paros-Antiparos, Paros-Naxos, ...).
   * Independent of the model value — models smooth these zones.
   */
  windWarnings: z.array(z.string()).default([]),
  /** Distance originally referenced to another base (e.g. 'lavrion'). */
  rebasedFrom: z.string().optional(),
  /**
   * ABGELEITET STATT RECHERCHIERT — der Unterschied zwischen Best Practice und
   * blosser Geometrie.
   *
   * Gesetzt von `seeding/tools/deriveLegs.ts` für Verbindungen, die im Revier
   * existieren, aber in der Bibliothek fehlten. Ihre `distanceNm` ist die
   * GEMESSENE Länge des landfreien Kurses, nicht die geprüfte Zahl aus einem
   * Revierführer; `windWarnings` ist bei ihnen zwangsläufig leer, weil niemand
   * die Düsen dieser Strecke abgelesen hat.
   *
   * WARUM ES DAS FELD BRAUCHT (Skipper 2026-08-07): „am Ende kann ich ja als
   * Segler überall hinfahren. Diese Routen sollten eher empfohlene Best
   * Practices sein und daher bevorzugt werden — aber warum sollte man nicht
   * hinfahren, wenn der Wind es erlaubt und es diese roten Strecken vermeidet?"
   *
   * Der Graph war bis dahin eine STICHPROBE des Reviers: 37 kuratierte
   * Insel-Paare, während 41 weitere unter 30 sm lagen und gar nicht existierten.
   * Der Router musste um die Löcher herumfahren — 38 sm hart am Wind nach Paros,
   * weil Polyaigos → Sifnos (12,6 sm) nicht in der Bibliothek stand.
   *
   * Das Feld ist der einzige Ort, an dem die Rangfolge (`solver.preferred`) die
   * beiden Sorten auseinanderhalten kann: eine Runde aus recherchierten Etappen
   * gewinnt gegen eine gleich bequeme mit abgeleiteten — aber sie gewinnt nicht
   * gegen eine deutlich bessere. Fehlt das Feld, ist die Etappe kuratiert.
   */
  abgeleitet: z.boolean().optional(),
  /**
   * WARUM `distanceNm` NICHT MEHR DIE RECHERCHIERTE ZAHL IST.
   *
   * Die Distanzen der Bibliothek sind recherchiert und geprüft; seaRouteLegs.ts
   * fasst sie ausdrücklich nicht an, auch wenn es die Wegpunkte umlegt. Es gibt
   * genau einen Fall, in dem sie sich trotzdem ändern MUSS: wenn ein Werkzeug
   * den Kurs bewusst verlängert (leeWaypoints.ts legt den Rückweg in den
   * Windschatten). Bliebe die alte Zahl stehen, würde die Simulation den neuen,
   * längeren Weg mit der alten Länge rechnen — Abdeckung geschenkt, ohne den
   * Umweg zu bezahlen. Genau die Sorte stiller Schönrechnung, die diese
   * Codebasis nicht duldet.
   *
   * Gesetzt heisst: hier steht, WER die Distanz verändert hat und um wie viel.
   * Fehlt das Feld, ist `distanceNm` die recherchierte Zahl.
   */
  distanceNote: z.string().optional(),
  /**
   * KEIN LANDFREIER KURS — der Kurs dieser Etappe führt über Land.
   *
   * NIE kuratiert, wie `waypointKeys`: gesetzt allein von `legGeometry.sailedLeg`,
   * wenn `seaRoute` für die VERANKERTE Etappe keinen Weg um die Inseln findet
   * (`SeaRoute.unresolved`).
   *
   * WARUM ES DAS FELD BRAUCHT (Befund 2026-08-07). Vorher stand an dieser
   * Stelle nur ein `console.warn`. Die Bewertung lief weiter, als wäre nichts:
   * die Luftlinie QUER DURCH DIE INSEL wurde zur Kurslänge, `distanceNm` im
   * Verhältnis dazu skaliert, und darauf rechneten Fahrtzeit, Kreuzschläge und
   * Ampel. Der Skipper bekam eine rote Etappe mit 34 sm und 32 sm Kreuzen
   * angezeigt — Zahlen zu einem Kurs, den kein Boot fahren kann.
   *
   * Der Auslöser ist nicht die Bibliothek, sondern die Platzwahl: der Anker
   * verschiebt das Etappenende auf den Liegeplatz der Nacht (Ios-Manganari an
   * der Südküste), und von dort gibt es um die Insel herum keinen Weg mehr.
   *
   * Eine so verankerte Etappe ist deshalb nicht ROT, sondern UNBEWERTBAR:
   * `scoring.assessLeg` gibt für sie keine Zahlen aus, sondern sagt, dass der
   * Kurs nicht auflösbar ist. Eine erfundene Zahl ist schlechter als keine.
   */
  kursUnaufloesbar: z.boolean().optional(),
});
export type Leg = z.infer<typeof LegSchema>;

export const RouteSchema = z.object({
  /** e.g. 'sued-route-naxos'; the fallback chain has the fixed id 'rueckfallkette-west'. */
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string().optional(),
  /**
   * FR9 escalation levels: lower rank = more conservative. When the forecast
   * worsens, the next LOWER rank is the natural alternative.
   */
  escalationRank: z.number().int().min(0),
  /** Ordered island sequence, implied by the legs. */
  legs: z.array(LegSchema).min(1),
  /** True for the westward fallback chain used by the PPR (AD-10). */
  isReturnChain: z.boolean().default(false),
  /** Map color hint (CSS color) for the route polyline. */
  color: z.string().optional(),
});
export type Route = z.infer<typeof RouteSchema>;

/**
 * AD-4 — a curated round-trip variant as an ORDERED SEQUENCE OF LEG IDS.
 * Legs are first-class and deduplicated; variants reference them and never
 * copy their content (the old shape stored the same leg up to four times, so
 * a waypoint correction had to be made in four places or silently drifted).
 *
 * The solver treats the union of all variant legs as its search GRAPH rather
 * than replaying a variant verbatim — otherwise FR28 (skipper picks a
 * different island for one day, rest recomputed) would only work for days
 * that happen to lie on a curated variant.
 */
export const VariantSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  description: z.string().optional(),
  /** FR9 escalation levels: lower rank = more conservative. */
  escalationRank: z.number().int().min(0),
  legIds: z.array(z.string()).min(1),
  /** True for the westward fallback chain used by the return check (AD-10). */
  isReturnChain: z.boolean().default(false),
  color: z.string().optional(),
});
export type Variant = z.infer<typeof VariantSchema>;

/** Fixed id of the normative fallback-harbour chain (AD-10). */
export const RETURN_CHAIN_ROUTE_ID = 'rueckfallkette-west';
