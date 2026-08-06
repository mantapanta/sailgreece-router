import { z } from 'zod';
import { CoordinatesSchema } from './common.ts';

export const IslandSchema = z.object({
  /** Kebab-case slug, e.g. 'sifnos'. Stable, never renamed. */
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  coordinates: CoordinatesSchema,
  /** Short atmospheric sentence (German, Y.CO narrative tone). */
  description: z.string().optional(),
  /**
   * Fähranbindung der Insel: erreichen Gäste sie per Fähre? Kuratierte Angabe
   * (AD-4), rein informativ.
   *
   * Bis 2026-08-06 war das die Datengrundlage der FR31-Gästewechsel-Bedingung:
   * ein Plan galt nur als gültig, wenn der Zustiegstag auf einer Insel mit
   * `ferryReachable: true` endete, und ein FEHLENDES Feld zählte als „nicht
   * erreichbar". Die Bedingung ist auf Skipper-Entscheid entfallen. Die Daten
   * bleiben — sie sind recherchiert, richtig und für die Hand am Ruder nützlich
   * —, aber KEINE Bewertung liest sie mehr. Ein fehlendes Feld heisst deshalb
   * heute schlicht „nicht recherchiert" und hat keine Wirkung.
   */
  guestPickup: z
    .object({
      ferryReachable: z.boolean(),
      sourceNote: z.string().min(1),
    })
    .optional(),
});
export type Island = z.infer<typeof IslandSchema>;
