import { z } from 'zod';

/**
 * Polar table: boat speed (kn) = f(TWA deg, TWS kn).
 * FR26: Fountaine Pajot 45 WindySail export; the chartered Saona runs
 * +0.5 kn on average — the offset is applied ONLY in domain/polar.ts.
 */
export const PolarSchema = z
  .object({
    /** True wind angles in degrees, ascending, 0-180. */
    twaDeg: z.array(z.number().min(0).max(180)).min(2),
    /** True wind speeds in knots, ascending. */
    twsKn: z.array(z.number().min(0)).min(2),
    /** speeds[i][j] = boat speed at twaDeg[i] / twsKn[j]. */
    speeds: z.array(z.array(z.number().min(0))),
    sourceNote: z.string().min(1),
  })
  .refine(
    (p) =>
      p.speeds.length === p.twaDeg.length &&
      p.speeds.every((row) => row.length === p.twsKn.length),
    { message: 'speeds matrix must be twaDeg.length x twsKn.length' },
  );
export type Polar = z.infer<typeof PolarSchema>;
