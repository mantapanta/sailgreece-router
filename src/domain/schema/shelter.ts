import { z } from 'zod';

/**
 * AD-4 / AD-6 — normative shelter forms.
 *
 * A sector describes directions the place is protected FROM ("wind coming
 * out of"), true degrees 0-360. Semantics: protected against directions from
 * `fromDeg` CLOCKWISE to `toDeg`, wrap across 360->0 allowed (330-60 = north
 * sector), boundaries inclusive. Strength limits in kn / m — Bft is converted
 * during seeding, never stored.
 */
export const WindSectorSchema = z.object({
  fromDeg: z.number().min(0).max(360),
  toDeg: z.number().min(0).max(360),
  maxKn: z.number().positive(),
});
export type WindSector = z.infer<typeof WindSectorSchema>;

export const WaveSectorSchema = z.object({
  fromDeg: z.number().min(0).max(360),
  toDeg: z.number().min(0).max(360),
  maxM: z.number().positive(),
});
export type WaveSector = z.infer<typeof WaveSectorSchema>;

/** Separate sector sets for wind and waves — normative (AD-4). */
export const ShelterProfileSchema = z.object({
  windSectors: z.array(WindSectorSchema).min(1),
  waveSectors: z.array(WaveSectorSchema).min(1),
  /** Curation source, e.g. "Heikell 15. Aufl." or "CruisersWiki: Sifnos". */
  sourceNote: z.string().min(1),
});
export type ShelterProfile = z.infer<typeof ShelterProfileSchema>;
