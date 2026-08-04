import { z } from 'zod';

/**
 * The one traffic-light type used everywhere (Consistency Conventions).
 * 'unbewertet' (grey) covers missing data / horizon / parse errors —
 * never green, never silently hidden.
 */
export const AmpelSchema = z.enum(['gruen', 'gelb', 'rot', 'unbewertet']);
export type Ampel = z.infer<typeof AmpelSchema>;

/** Worst-of ordering: rot > unbewertet > gelb > gruen. */
export const AMPEL_SEVERITY: Record<Ampel, number> = {
  gruen: 0,
  gelb: 1,
  unbewertet: 2,
  rot: 3,
};

/** German wording of an ampel for rationale texts (never show the raw enum). */
export const AMPEL_WORT: Record<Ampel, string> = {
  gruen: 'grün',
  gelb: 'gelb',
  rot: 'rot',
  unbewertet: 'unbewertet',
};

export function worstAmpel(values: Ampel[]): Ampel {
  if (values.length === 0) return 'unbewertet';
  return values.reduce((worst, v) =>
    AMPEL_SEVERITY[v] > AMPEL_SEVERITY[worst] ? v : worst,
  );
}

export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
export type Coordinates = z.infer<typeof CoordinatesSchema>;
