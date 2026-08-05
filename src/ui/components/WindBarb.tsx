/**
 * Windfieder (wind barb) in der Notation meteorologischer Karten.
 *
 * Der Schaft zeigt in die Richtung, AUS DER der Wind kommt (AD-6: alle
 * Windrichtungen im Projekt sind "kommend aus", rechtweisend). Die Fiedern
 * sitzen am äusseren Ende und kodieren die Stärke:
 *
 *   halbe Fieder =  5 kn
 *   ganze Fieder = 10 kn
 *   Dreieck      = 50 kn
 *
 * Die Geschwindigkeit wird dafür auf 5 kn gerundet — genau wie auf der
 * Wetterkarte. Unter 3 kn steht der Kreis für Windstille; ein Schaft ohne
 * Fieder wäre dort irreführend, weil er eine Richtung behauptet, die bei
 * Flaute keine Bedeutung hat.
 *
 * Bewusst NICHT aus dem Modellwert abgeleitet interpretiert: die Fieder zeigt,
 * was der Forecast sagt, nicht was in Düsenzonen tatsächlich ankommt (FR10).
 */

import { INK_PRIMARY } from '../tokens.ts';

export interface WindBarbProps {
  /** Richtung, AUS DER der Wind kommt, in Grad rechtweisend. */
  dirDeg: number;
  knots: number;
  /** Kantenlänge in px; die Grafik skaliert vollständig mit. */
  size?: number;
  color?: string;
}

/** Fiedern-Zerlegung: Dreiecke (50), ganze (10), halbe (5). */
export function barbParts(knots: number): {
  pennants: number;
  full: number;
  half: number;
  calm: boolean;
} {
  const rounded = Math.round(Math.max(0, knots) / 5) * 5;
  if (rounded < 5) return { pennants: 0, full: 0, half: 0, calm: true };
  const pennants = Math.floor(rounded / 50);
  const rest = rounded - pennants * 50;
  const full = Math.floor(rest / 10);
  const half = rest - full * 10 >= 5 ? 1 : 0;
  return { pennants, full, half, calm: false };
}

const BOX = 44;
const STATION_Y = 38;
const TIP_Y = 6;
const CENTER_X = 22;
/** Abstand zwischen zwei Fiedern-Plätzen auf dem Schaft. */
const STEP = 4.2;
const FULL_LEN = 12;
const FULL_RISE = 5;

export function WindBarb({ dirDeg, knots, size = 44, color = INK_PRIMARY }: WindBarbProps) {
  const { pennants, full, half, calm } = barbParts(knots);

  if (calm) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} aria-hidden="true">
        <circle
          cx={CENTER_X}
          cy={BOX / 2}
          r={5}
          fill="none"
          stroke={color}
          strokeWidth={1.6}
        />
      </svg>
    );
  }

  const elements: React.ReactNode[] = [];
  let slot = 0;

  for (let i = 0; i < pennants; i++, slot++) {
    const y = TIP_Y + slot * (STEP * 1.6);
    elements.push(
      <polygon
        key={`p${i}`}
        points={`${CENTER_X},${y} ${CENTER_X + FULL_LEN},${y + FULL_RISE * 0.6} ${CENTER_X},${y + STEP * 1.5}`}
        fill={color}
        stroke={color}
        strokeWidth={0.6}
      />,
    );
  }
  // Kleiner Versatz nach dem letzten Dreieck, sonst klebt die erste Fieder daran.
  if (pennants > 0) slot += 0.4;

  for (let i = 0; i < full; i++, slot++) {
    const y = TIP_Y + slot * STEP;
    elements.push(
      <line
        key={`f${i}`}
        x1={CENTER_X}
        y1={y}
        x2={CENTER_X + FULL_LEN}
        y2={y + FULL_RISE}
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />,
    );
  }

  if (half === 1) {
    // Eine einzelne halbe Fieder rückt einen Platz nach innen, damit sie nicht
    // über die Schaftspitze hinausragt (Konvention der Wetterkarte).
    const y = TIP_Y + (slot === 0 ? STEP : slot * STEP);
    elements.push(
      <line
        key="h"
        x1={CENTER_X}
        y1={y}
        x2={CENTER_X + FULL_LEN / 2}
        y2={y + FULL_RISE / 2}
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />,
    );
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} aria-hidden="true">
      {/* Rotation um die Station: 0° = Schaft nach Norden (oben). */}
      <g transform={`rotate(${dirDeg} ${CENTER_X} ${STATION_Y})`}>
        <line
          x1={CENTER_X}
          y1={STATION_Y}
          x2={CENTER_X}
          y2={TIP_Y}
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
        {elements}
      </g>
    </svg>
  );
}
