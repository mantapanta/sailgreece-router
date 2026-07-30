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
const norm = (d: number) => ((d % 360) + 360) % 360;

/**
 * Point sectors (fromDeg === toDeg after normalisation, e.g. a 350–350 typo)
 * would silently become FULL-CIRCLE shelter in sectorContains — safety
 * relevant. A full circle is therefore only expressible as exactly 0–360.
 */
const noPointSector = (s: { fromDeg: number; toDeg: number }) =>
  norm(s.fromDeg) !== norm(s.toDeg) || (s.fromDeg === 0 && s.toDeg === 360);
const POINT_SECTOR_MSG =
  'Punkt-Sektor (fromDeg === toDeg) verboten — Rundumschutz nur als 0–360';

export const WindSectorSchema = z
  .object({
    fromDeg: z.number().min(0).max(360),
    toDeg: z.number().min(0).max(360),
    maxKn: z.number().positive(),
  })
  .refine(noPointSector, { message: POINT_SECTOR_MSG });
export type WindSector = z.infer<typeof WindSectorSchema>;

export const WaveSectorSchema = z
  .object({
    fromDeg: z.number().min(0).max(360),
    toDeg: z.number().min(0).max(360),
    maxM: z.number().positive(),
  })
  .refine(noPointSector, { message: POINT_SECTOR_MSG });
export type WaveSector = z.infer<typeof WaveSectorSchema>;

/** Separate sector sets for wind and waves — normative (AD-4). */
export const ShelterProfileSchema = z.object({
  windSectors: z.array(WindSectorSchema).min(1),
  waveSectors: z.array(WaveSectorSchema).min(1),
  /** Curation source, e.g. "Heikell 15. Aufl." or "CruisersWiki: Sifnos". */
  sourceNote: z.string().min(1),
});
export type ShelterProfile = z.infer<typeof ShelterProfileSchema>;
