/**
 * Polyline component for @vis.gl/react-google-maps — adapted copy of the
 * official visgl example component (examples/geometry / polyline), as the
 * library ships no Polyline itself (Architecture-Spine stack note).
 * Dashed rendering uses the Google-Maps symbol `repeat` workaround
 * (strokeOpacity 0 + repeated line symbol), see PRD addendum.
 */

import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

export interface PolylineProps {
  path: google.maps.LatLngLiteral[];
  strokeColor: string;
  strokeWeight?: number;
  /** Render as dashed line via symbol-repeat workaround. */
  dashed?: boolean;
  zIndex?: number;
}

export function Polyline({
  path,
  strokeColor,
  strokeWeight = 3,
  dashed = false,
  zIndex,
}: PolylineProps) {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;
    const options: google.maps.PolylineOptions = dashed
      ? {
          path,
          strokeColor,
          strokeOpacity: 0,
          zIndex,
          icons: [
            {
              icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: 1,
                strokeColor,
                strokeWeight,
                scale: 3,
              },
              offset: '0',
              repeat: '18px',
            },
          ],
        }
      : { path, strokeColor, strokeOpacity: 0.9, strokeWeight, zIndex };

    const polyline = new google.maps.Polyline(options);
    polyline.setMap(map);
    polylineRef.current = polyline;
    return () => {
      polyline.setMap(null);
      polylineRef.current = null;
    };
  }, [map, JSON.stringify(path), strokeColor, strokeWeight, dashed, zIndex]);

  return null;
}
