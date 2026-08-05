/**
 * Polyline component for @vis.gl/react-google-maps — adapted copy of the
 * official visgl example component (examples/geometry / polyline), as the
 * library ships no Polyline itself (Architecture-Spine stack note).
 * Dashed rendering uses the Google-Maps symbol `repeat` workaround
 * (strokeOpacity 0 + repeated line symbol), see PRD addendum.
 */

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { MAP_LINE_CASING } from '../tokens.ts';

export interface PolylineProps {
  path: google.maps.LatLngLiteral[];
  strokeColor: string;
  strokeWeight?: number;
  /** Render as dashed line via symbol-repeat workaround. */
  dashed?: boolean;
  /**
   * Phasenversatz der Strichelung (z. B. '9px' = halbe Periode).
   *
   * Der Kniff für DECKUNGSGLEICHE Linien: Hin- und Rückweg eines Round-Trips
   * nutzen teils dieselbe Etappe, und zwei Strichlinien exakt übereinander
   * zeigen nur die obere. Weil die Lücken der Symbol-Strichelung transparent
   * sind, scheint eine um die halbe Periode versetzte untere Linie genau in
   * den Lücken der oberen durch — der gemeinsame Abschnitt zeigt BEIDE Farben
   * im Wechsel statt nur der zuletzt gezeichneten.
   */
  dashOffset?: string;
  /**
   * Fahrtrichtungspfeile entlang der Linie (Feedback 2026-08-05): der Pfeil
   * zeigt vom ersten zum letzten Punkt des Pfads. Auf Etappen, die hin und
   * zurück befahren werden, ist er neben der Farbe die zweite — farbfehlsicht-
   * feste — Aussage darüber, welche Richtung eine Linie meint.
   */
  directionArrows?: boolean;
  zIndex?: number;
  /**
   * Heller Saum unter der Linie (Kartografen-Kniff "casing").
   *
   * Auf dem Satellitenbild verschwindet eine 3-px-Linie im Blau der Ägäis —
   * es gibt schlicht keinen Kontrast, auf den sie sich stützen könnte. Ein
   * weisser Saum darunter schafft ihn, unabhängig davon, worüber die Linie
   * gerade läuft. Null schaltet ihn ab.
   */
  casingColor?: string | null;
  /** Breite des Saums über der Linie hinaus, je Seite. */
  casingWeight?: number;
}

export function Polyline({
  path,
  strokeColor,
  strokeWeight = 3,
  dashed = false,
  dashOffset = '0',
  directionArrows = false,
  zIndex,
  casingColor = MAP_LINE_CASING,
  casingWeight = 3,
}: PolylineProps) {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!map) return;

    /** Ein Strich-Symbol für den repeat-Workaround. */
    const dash = (color: string, weight: number): google.maps.IconSequence => ({
      icon: {
        path: 'M 0,-1 0,1',
        strokeOpacity: 1,
        strokeColor: color,
        strokeWeight: weight,
        scale: 3,
      },
      offset: dashOffset,
      repeat: '18px',
    });

    /**
     * Fahrtrichtungspfeil, gefüllt in der Linienfarbe mit dem Saum als
     * Kontur — derselbe Kontrast-Kniff wie beim casing, sonst ginge der
     * Pfeil auf dem Satellitenbild genauso unter wie die Linie ohne Saum.
     * Sparsame Wiederholung (96 px): der Pfeil soll die Richtung sagen,
     * nicht die Strichelung übertönen.
     */
    const arrow = (): google.maps.IconSequence => ({
      icon: {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        fillColor: strokeColor,
        fillOpacity: 1,
        strokeColor: casingColor ?? strokeColor,
        strokeOpacity: 1,
        strokeWeight: 1,
        scale: Math.max(2.5, strokeWeight * 0.75),
      },
      offset: '48px',
      repeat: '96px',
    });

    const lines: google.maps.Polyline[] = [];

    if (dashed) {
      // Saum und Linie in EINER Polyline: zwei Symbole an denselben Offsets,
      // das hellere zuerst. Ein durchgezogener Saum unter einer gestrichelten
      // Linie sähe aus wie eine durchgezogene Linie — und würde damit gerade
      // die Unterscheidung einebnen, für die der Strich da ist.
      const icons: google.maps.IconSequence[] = casingColor
        ? [dash(casingColor, strokeWeight + casingWeight * 2), dash(strokeColor, strokeWeight)]
        : [dash(strokeColor, strokeWeight)];
      if (directionArrows) icons.push(arrow());
      lines.push(new google.maps.Polyline({ path, strokeOpacity: 0, zIndex, icons }));
    } else {
      if (casingColor) {
        lines.push(
          new google.maps.Polyline({
            path,
            strokeColor: casingColor,
            strokeOpacity: 0.85,
            strokeWeight: strokeWeight + casingWeight * 2,
            zIndex: (zIndex ?? 0) - 1,
          }),
        );
      }
      lines.push(
        new google.maps.Polyline({
          path,
          strokeColor,
          strokeOpacity: 1,
          strokeWeight,
          zIndex,
          icons: directionArrows ? [arrow()] : undefined,
        }),
      );
    }

    for (const l of lines) l.setMap(map);
    polylineRef.current = lines;
    return () => {
      for (const l of lines) l.setMap(null);
      polylineRef.current = [];
    };
  }, [
    map,
    JSON.stringify(path),
    strokeColor,
    strokeWeight,
    dashed,
    dashOffset,
    directionArrows,
    zIndex,
    casingColor,
    casingWeight,
  ]);

  return null;
}
