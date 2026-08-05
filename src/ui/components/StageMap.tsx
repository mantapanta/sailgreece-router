/**
 * FR30 — the geographic half of "Wie kommt die Zeit zustande?".
 *
 * The hour table says WHEN, this map says WHERE: one day's stage, zoomed to its
 * own extent, with every waypoint the forecast was fetched for (AD-3). Those
 * waypoints are not decoration — they are the sample points the simulated hours
 * in the table are computed from, so seeing them is how a skipper checks whether
 * the route the app assumed is the route they would actually sail.
 *
 * Must be rendered inside an <APIProvider> (the day view mounts exactly one, so
 * several expanded cards share a single Maps script load).
 */

import { useEffect, useMemo } from 'react';
import { AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps';
import type { Ampel } from '../../domain/schema/common.ts';
import { AMPEL_GRAPHIC_HEX } from '../tokens.ts';
import { Polyline } from './Polyline.tsx';
import { SeamarkLayer } from './SeamarkLayer.tsx';
import type { StagePoint } from '../mapPath.ts';

/**
 * Zoom to this day's extent — the point of the panel. `fitBounds` with padding
 * so pins near the edge stay readable; a single-point bound (should not happen
 * for a stage) would zoom to maximum, hence the length guard.
 */
function FitToStage({ path }: { path: google.maps.LatLngLiteral[] }) {
  const map = useMap();
  const serialized = JSON.stringify(path);

  useEffect(() => {
    if (!map || path.length < 2) return;
    const bounds = new google.maps.LatLngBounds();
    for (const p of path) bounds.extend(p);
    map.fitBounds(bounds, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, serialized]);

  return null;
}

export function StageMap({
  points,
  ampel,
  mapId,
  onOpenPlace,
}: {
  /**
   * Punkte des Tages — von der Karte NICHT selbst berechnet, sondern von der
   * Etappenkarte übergeben, die dieselbe Liste für die Punkt-Spalte der
   * Rechnung nutzt. Nur so können Karte und Tabelle nicht auseinanderlaufen.
   */
  points: StagePoint[];
  ampel: Ampel;
  mapId: string;
  onOpenPlace?: (placeId: string) => void;
}) {
  const path = useMemo(() => points.map((p) => p.position), [points]);

  // A harbour day or an unresolvable leg has nothing to draw. Say so instead of
  // rendering an empty grey box.
  if (path.length < 2) {
    return (
      <p className="beschreibung">
        Keine Streckengeometrie für diese Etappe (Etappe oder Plätze nicht in der
        Bibliothek).
      </p>
    );
  }

  const lineColor = AMPEL_GRAPHIC_HEX[ampel];
  const wegpunkte = points.filter((p) => p.kind === 'wegpunkt').length;

  return (
    <div className="stage-map">
      <Map
        className="stage-map-canvas"
        mapId={mapId}
        defaultCenter={path[0]}
        defaultZoom={9}
        mapTypeId="hybrid"
        gestureHandling="cooperative"
        disableDefaultUI
        zoomControl
        fullscreenControl
      >
        <FitToStage path={path} />
        {/* Seezeichen immer an: die Etappenkarte ist auf ihren Ausschnitt
            gezoomt — genau der Massstab, in dem Tonnen und Feuer der
            Ansteuerung sichtbar werden. Ein Toggle wäre hier nur UI. */}
        <SeamarkLayer />
        {/* Fahrtrichtungspfeile (Feedback 2026-08-05): die Punktnummern geben
            die Reihenfolge, aber erst der Pfeil macht die Richtung auf einen
            Blick lesbar — gerade wenn Hin- und Rücketappe desselben Törns
            dieselbe Strecke nutzen. */}
        <Polyline
          path={path}
          strokeColor={lineColor}
          strokeWeight={3}
          directionArrows
          zIndex={20}
        />

        {points.map((p) =>
          p.kind === 'platz' ? (
            <AdvancedMarker
              key={p.key}
              position={p.position}
              title={`Punkt ${p.nummer} — ${p.label}`}
              zIndex={60}
              onClick={p.placeId && onOpenPlace ? () => onOpenPlace(p.placeId!) : undefined}
            >
              <div className="stage-map-platz">
                <span className="stage-map-nr">{p.nummer}</span>
                {p.label}
              </div>
            </AdvancedMarker>
          ) : (
            <AdvancedMarker
              key={p.key}
              position={p.position}
              title={`Punkt ${p.nummer} — Wegpunkt ${p.position.lat.toFixed(4)}, ${p.position.lng.toFixed(4)}`}
              zIndex={40}
            >
              <div className="stage-map-wegpunkt">{p.nummer}</div>
            </AdvancedMarker>
          ),
        )}
      </Map>
      <p className="beschreibung stage-map-legende">
        {points.length} Punkte, davon {wegpunkte}{' '}
        {wegpunkte === 1 ? 'Wegpunkt' : 'Wegpunkte'} — dieselben Nummern wie in der
        Spalte <strong>Punkt</strong> der Rechnung. Seezeichen ©{' '}
        <a href="https://www.openseamap.org" target="_blank" rel="noreferrer">
          OpenSeaMap
        </a>
        -Mitwirkende (CC-BY-SA), keine verlässlichen Tiefen.
      </p>
    </div>
  );
}
