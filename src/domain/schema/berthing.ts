import { z } from 'zod';

/**
 * Liegeplatz-Details (Deep-Research Lauf 2, 2026-08-03).
 *
 * Ergänzt den Shelter-Block um die Angaben, die erst AM Liegeplatz entscheiden,
 * ob ein Platz für dieses Boot taugt: Tiefe, Haltegrund, Grössenlimit. Alle
 * Felder sind optional oder nullable — eine Lücke ist eine ehrliche Lücke und
 * darf nicht durch einen geschätzten Wert ersetzt werden (AD-4).
 *
 * `maxLoaM` und `depthAtBerthM.min` sind die einzigen HARTEN Ausschlusskriterien
 * in diesem Block; sie werden bewusst als Zahl geführt, damit der Solver sie
 * später gegen Bootslänge und Tiefgang prüfen kann. Der Rest ist Kontext für
 * die Anzeige.
 */

export const ConfidenceSchema = z.enum(['hoch', 'mittel', 'niedrig']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const MooringTypeSchema = z.enum([
  /** Längsseits an der Kaimauer. */
  'laengsseits',
  /** Heck oder Bug zum Kai, Anker voraus ("römisch-katholisch"). */
  'roemisch-katholisch',
  /** Vorinstallierte Muringleinen. */
  'murings',
  /** Festmacherboje. */
  'boje',
  /** Freies Ankern am eigenen Geschirr. */
  'anker-frei',
]);
export type MooringType = z.infer<typeof MooringTypeSchema>;

/**
 * Zusammensetzungen sind normalisiert: der ÜBERWIEGENDE Anteil steht vorn.
 * 'fels-sand' und 'schlamm-sand' aus den Recherchen werden beim Einpflegen auf
 * 'sand-fels' bzw. 'sand-schlamm' abgebildet, wenn Sand überwiegt.
 */
export const HoldingGroundSchema = z.enum([
  'sand',
  'sand-seegras',
  'sand-schlamm',
  'schlamm',
  'schlamm-sand',
  'schlamm-seegras',
  'schlamm-fels',
  'sand-fels',
  'fels',
  'fels-kies',
  'kies',
]);
export type HoldingGround = z.infer<typeof HoldingGroundSchema>;

export const HoldingQualitySchema = z.enum(['gut', 'mittel', 'schlecht']);
export type HoldingQuality = z.infer<typeof HoldingQualitySchema>;

const DepthRangeSchema = z
  .object({
    min: z.number().positive(),
    max: z.number().positive(),
  })
  .refine((d) => d.max >= d.min, {
    message: 'depthAtBerthM.max muss >= min sein',
  });

/** Freitextfeld, das auch ausdrücklich als "nicht recherchiert" leer sein darf. */
const note = () => z.string().min(1).nullable().optional();
const flag = () => z.boolean().nullable().optional();

export const BerthingDetailsSchema = z.object({
  mooringType: MooringTypeSchema,
  /** Wassertiefe am Liegeplatz bzw. im Ankerbereich. */
  depthAtBerthM: DepthRangeSchema.optional(),
  anchorHoldingGround: HoldingGroundSchema.nullable().optional(),
  holdingQuality: HoldingQualitySchema.nullable().optional(),
  /** Begründung zur holdingQuality — getrennt, damit die Stufe auswertbar bleibt. */
  holdingNote: note(),
  seagrassNote: note(),
  capacityYachts: z.number().int().positive().nullable().optional(),
  reservationPossible: flag(),
  reservationChannel: note(),
  shorePower: flag(),
  water: flag(),
  fuelDock: flag(),
  provisioningAshore: note(),
  showersToilets: flag(),
  /**
   * Entweder als Ja/Nein oder als Ortsangabe ("Behälter am Kai") — die Recherchen
   * liefern beides, und der Ort ist die nützlichere Information.
   */
  wasteDisposal: z.union([z.boolean(), z.string().min(1)]).nullable().optional(),
  priceIndicationEur: note(),
  portAuthorityFees: note(),
  /** Hartes Ausschlusskriterium: grösste zugelassene Länge über alles. */
  maxLoaM: z.number().positive().nullable().optional(),
  swellExposureNote: note(),
  ferryTrafficNote: note(),
  dinghyLanding: note(),
  restrictions: note(),
  vhfChannel: z.string().min(1).nullable().optional(),
  confidence: ConfidenceSchema,
  sources: z.array(z.string().min(1)).min(1),
});
export type BerthingDetails = z.infer<typeof BerthingDetailsSchema>;
