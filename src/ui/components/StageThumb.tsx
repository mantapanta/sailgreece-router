/**
 * Der Etappen-Schnipsel rechts oben in der Tagesetappen-Karte.
 *
 * Er zeigt in einem Bild, was die Karte in Worten sagt: Küstenlinien des
 * Ausschnitts, die Etappe darüber in ihrer Ampelfarbe, Start als hohler, Ziel
 * als voller Punkt. Keine Beschriftung, keine Bedienung im Bild — dafür ist der
 * Schnipsel zu klein; wer mehr sehen will, klappt damit die grosse Tageskarte
 * auf (FR30-Panel), die dieselbe Strecke mit Wegpunkten und Seezeichen trägt.
 *
 * Die Punkte kommen von der Etappenkarte — dieselbe Liste wie für die grosse
 * Karte und die Rechnung (mapPath.stagePoints), damit Schnipsel und Panel nicht
 * zwei Strecken behaupten können. Gerechnet wird nichts hier: die Geometrie
 * kommt aus dem getesteten Helper stageThumb.ts.
 */

import { useMemo } from 'react';
import type { Ampel } from '../../domain/schema/common.ts';
import { AMPEL_GRAPHIC_HEX, COLORS } from '../tokens.ts';
import type { StagePoint } from '../mapPath.ts';
import { stageThumbGeometry } from '../stageThumb.ts';

/**
 * Zwei Grössen, weil die Karte in zwei Typo-Stufen vorkommt: als Hero mit
 * 30px-Display und als Zeilen-Variante im Rest-Trip mit 19px-Headline. Ein
 * Schnipsel in Hero-Grösse neben der kleinen Headline wäre das lauteste
 * Element der Zeile.
 */
const SIZES = {
  hero: { width: 96, height: 72 },
  row: { width: 76, height: 58 },
} as const;

export function StageThumb({
  points,
  ampel,
  label,
  size = 'hero',
  onClick,
  expanded,
}: {
  points: StagePoint[];
  ampel: Ampel;
  /** "Athen (Marina Alimos) → Kea" — der Sinn des Bildes in Worten. */
  label: string;
  size?: keyof typeof SIZES;
  /**
   * Klappt die Rechnung mit der grossen Tageskarte auf. Ohne Handler bleibt
   * der Schnipsel ein reines Bild — ein Knopf, der nichts aufklappt, wäre eine
   * leere Zusage.
   */
  onClick?: () => void;
  expanded?: boolean;
}) {
  const { width, height } = SIZES[size];
  const geo = useMemo(
    () => stageThumbGeometry(points.map((p) => p.position), { width, height }),
    [points, width, height],
  );

  // Hafentag oder unauflösbare Etappe: kein Bild statt eines leeren Rahmens —
  // dieselbe Entscheidung wie in der grossen Tageskarte.
  if (!geo) return null;

  const line = AMPEL_GRAPHIC_HEX[ampel];
  const bild = (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      <rect width={width} height={height} fill={COLORS.mapThumbSea} />
      {geo.land && (
        <path
          d={geo.land}
          fill={COLORS.mapThumbLand}
          stroke={COLORS.mapThumbCoast}
          strokeWidth={0.5}
          strokeLinejoin="round"
        />
      )}
      {/* Weisse Kontur unter der Linie: über einer Küste im selben Hellwert
          verschwände der Kurs sonst genau dort, wo er interessant ist. */}
      <path
        d={geo.route}
        fill="none"
        stroke={COLORS.mapLineCasing}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={geo.route}
        fill="none"
        stroke={line}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Richtung ohne Pfeil: bei 96px wäre eine Pfeilspitze ein Fleck. Hohl =
          los, voll = an — und der Text daneben nennt beide Orte ohnehin. */}
      <circle
        cx={geo.start.x}
        cy={geo.start.y}
        r={2.3}
        fill={COLORS.mapLineCasing}
        stroke={line}
        strokeWidth={1.3}
      />
      <circle
        cx={geo.end.x}
        cy={geo.end.y}
        r={2.7}
        fill={line}
        stroke={COLORS.mapLineCasing}
        strokeWidth={1}
      />
    </svg>
  );

  if (!onClick) {
    return (
      <div className="stage-thumb" role="img" aria-label={`Etappe ${label}`} title={label}>
        {bild}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="stage-thumb"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label={`Etappe ${label} — Tageskarte ${expanded ? 'ausblenden' : 'ansehen'}`}
      title={`${label} — Tageskarte ${expanded ? 'ausblenden' : 'ansehen'}`}
    >
      {bild}
    </button>
  );
}
