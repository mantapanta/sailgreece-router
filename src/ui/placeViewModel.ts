/**
 * Pure Platzdetail view-model derivations (Story 1.4) — tested, no React.
 * Reuses the domain's own sector functions (AD-2: the semantics live in
 * domain/ampel.ts; here is only the 8-direction DISPLAY sampling — the rating
 * per tile is windHourAmpel itself, probed at the app's worst-case planning
 * wind, so no threshold is invented here). The tiles summarize the curated
 * statement — the exact sectors render verbatim as a legend below the grid,
 * so a narrow sector between two center degrees is never silently lost.
 */
import { sectorContains, windHourAmpel, windSectorLimitKn } from '../domain/ampel.ts';
import { compassPoint } from '../domain/geo.ts';
import type { Params } from '../domain/schema/params.ts';
import type { ShelterProfile, WaveSector } from '../domain/schema/shelter.ts';
import type { PlaceNightAssessment } from '../domain/schema/snapshot.ts';
import type { Ampel } from '../domain/schema/common.ts';

export type SectorRating = 'gut' | 'maessig' | 'schwach' | 'offen';

export interface SectorTile {
  /** International notation via compassPoint — the reasons' vocabulary. */
  dir: string;
  centerDeg: number;
  rating: SectorRating;
  /** Curated wind limit governing this direction; null = luv (kein Sektor). */
  limitKn: number | null;
  /** Curated wave limit (non-scoring); null = uncovered. */
  waveMaxM: number | null;
}

const TILE_DEGREES = [0, 45, 90, 135, 180, 225, 270, 315];

function waveLimitM(sectors: WaveSector[], deg: number): number | null {
  // Mirror of windSectorLimitKn's documented most-generous-wins decision.
  const matching = sectors.filter((s) => sectorContains(s, deg));
  return matching.length > 0 ? Math.max(...matching.map((s) => s.maxM)) : null;
}

/**
 * Rating = die Domänen-Funktion windHourAmpel am Meltemi-Worst-Case der
 * eigenen Planung (params.meltemiWorstCase.twsKn) — KEINE eigene Schwelle:
 *   gruen → gut (hält den Worst-Case einschließlich der gelbReserveKn),
 *   gelb  → mäßig (Worst-Case erreicht die Grenze, keine Reserve mehr),
 *   rot   → schwach (kuratierte Grenze liegt unter dem Worst-Case),
 *   kein Sektor → offen (Luv-Regel, nie grün) — vorab kurzgeschlossen, damit
 *   "offen" nie vom Probe-Wind abhängt.
 */
export function sectorTiles(shelter: ShelterProfile, params: Params): SectorTile[] {
  return TILE_DEGREES.map((centerDeg) => {
    const limitKn = windSectorLimitKn(shelter.windSectors, centerDeg);
    let rating: SectorRating;
    if (limitKn === null) {
      rating = 'offen';
    } else {
      const verdict = windHourAmpel(
        shelter.windSectors,
        centerDeg,
        params.meltemiWorstCase.twsKn,
        params,
      );
      rating = verdict === 'gruen' ? 'gut' : verdict === 'gelb' ? 'maessig' : 'schwach';
    }
    return {
      dir: compassPoint(centerDeg),
      centerDeg,
      rating,
      limitKn,
      waveMaxM: waveLimitM(shelter.waveSectors, centerDeg),
    };
  });
}

/** "18:00–09:00" — the real AD-9 window from params, zero-padded, tabular. */
export function nightWindowLabel(startHour: number, endHour: number): string {
  const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return `${pad(startHour)}–${pad(endHour)}`;
}

/** Verdict — reason for the title sub-line (Voice & Tone: Wort zuerst). */
export function nightVerdictLine(night: PlaceNightAssessment | undefined): {
  ampel: Ampel;
  text: string;
} {
  const ampel = night?.ampel ?? 'unbewertet';
  const reason = night?.reasons[0];
  if (reason) return { ampel, text: reason };
  return {
    ampel,
    text:
      ampel === 'gruen'
        ? 'Wind der Nacht innerhalb der Schutzsektoren'
        : 'keine Bewertung für diese Nacht',
  };
}
