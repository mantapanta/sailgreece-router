import { z } from 'zod';

/**
 * Polar table: boat speed (kn) = f(TWA deg, TWS kn).
 * FR26: Fountaine Pajot 45 WindySail export; the chartered Saona runs
 * +0.5 kn on average — the offset is applied ONLY in domain/polar.ts.
 */
/** Strictly ascending (also rejects duplicates) — interp1 relies on it. */
export function isStrictlyAscending(xs: number[]): boolean {
  return xs.every((v, i) => i === 0 || v > xs[i - 1]!);
}

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
  )
  // Enforced, not just documented: a hand-edited Firestore polar document
  // with unsorted/duplicate grid axes would silently interpolate wrong boat
  // speeds (interp1 assumes ascending order).
  .refine((p) => isStrictlyAscending(p.twaDeg), {
    message: 'twaDeg muss streng aufsteigend sein (keine Duplikate)',
  })
  .refine((p) => isStrictlyAscending(p.twsKn), {
    message: 'twsKn muss streng aufsteigend sein (keine Duplikate)',
  });
export type Polar = z.infer<typeof PolarSchema>;
