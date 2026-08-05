/**
 * FR29 — die Vorschaukarte einer GANZEN Route (alle Etappen), nicht eines
 * einzelnen Tages wie StageMap.
 *
 * Gebaut für die Alternativ-Vorschau der Tagesansicht: "erst ansehen, dann
 * übernehmen" braucht ein Bild der Route, bevor der Check-in die bisherige
 * Hauptroute ersetzt. Die Geometrie kommt aus mapPath.ts — denselben Funktionen,
 * aus denen auch die grosse Karte zeichnet (stagePath/stageEndMarkers), damit
 * Vorschau und Kartenansicht nie zwei verschiedene Routen behaupten.
 *
 * Muss innerhalb eines <APIProvider> gerendert werden (die Tagesansicht mountet
 * genau einen für alle Karten der Seite).
 */

import { useEffect, useMemo } from 'react';
import { AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps';
import type { PlanningSnapshot, StageAssessment } from '../../domain/schema/snapshot.ts';
import { buildLegsById, stageEndMarkers, stagePath } from '../mapPath.ts';
import { Polyline } from './Polyline.tsx';

/** Zoom auf die Ausdehnung der ganzen Route, mit Rand für die Marker. */
function FitToRoute({ paths }: { paths: google.maps.LatLngLiteral[][] }) {
  const map = useMap();
  const serialized = JSON.stringify(paths);

  useEffect(() => {
    const points = paths.flat();
    if (!map || points.length < 2) return;
    const bounds = new google.maps.LatLngBounds();
    for (const p of points) bounds.extend(p);
    map.fitBounds(bounds, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, serialized]);

  return null;
}

export function RouteMap({
  stages,
  snapshot,
  color,
  mapId,
}: {
  /** Alle Tage der Route — Hafentage werden hier gefiltert, nicht vom Aufrufer. */
  stages: StageAssessment[];
  snapshot: PlanningSnapshot;
  /** Farbe der Route (altRouteColors.ts) — dieselbe wie auf der grossen Karte. */
  color: string;
  mapId: string;
}) {
  const legsById = useMemo(
    () => buildLegsById(snapshot.library.legs),
    [snapshot.library.legs],
  );
  const sailing = useMemo(() => stages.filter((s) => s.kind === 'stage'), [stages]);
  const paths = useMemo(
    () =>
      sailing
        .map((stage) => ({
          day: stage.day,
          path: stagePath(stage, legsById, snapshot),
        }))
        .filter((p) => p.path.length >= 2),
    [sailing, legsById, snapshot],
  );
  const markers = useMemo(
    () => stageEndMarkers(sailing, legsById, snapshot),
    [sailing, legsById, snapshot],
  );

  const islandName = (id: string) =>
    snapshot.library.islands.find((i) => i.id === id)?.name ?? id;

  if (paths.length === 0) {
    return (
      <p className="beschreibung">
        Keine Streckengeometrie für diese Route (Etappen oder Plätze nicht in der
        Bibliothek).
      </p>
    );
  }

  return (
    <div className="route-map">
      <Map
        className="stage-map-canvas"
        mapId={mapId}
        defaultCenter={paths[0]!.path[0]}
        defaultZoom={8}
        mapTypeId="hybrid"
        gestureHandling="cooperative"
        disableDefaultUI
        zoomControl
        fullscreenControl
      >
        <FitToRoute paths={paths.map((p) => p.path)} />
        {/* Gestrichelt wie auf der grossen Karte: die Alternative ist ein
            Vorschlag, keine gefahrene Strecke. Mit Fahrtrichtungspfeilen
            (Feedback 2026-08-05): die Runde läuft teils über dieselben
            Etappen hin und zurück, und die EINE Routenfarbe der Vorschau kann
            die Richtung nicht sagen — die Pfeile tun es. */}
        {paths.map((p) => (
          <Polyline
            key={`alt-line-${p.day}`}
            path={p.path}
            strokeColor={color}
            dashed
            directionArrows
            strokeWeight={4}
            zIndex={20}
          />
        ))}
        {/* Etappennummern je Insel, gruppiert wie auf der Hauptkarte ("4·8"):
            Hin- und Rückweg derselben Runde enden an denselben Orten. */}
        {markers.map((marker) => (
          <AdvancedMarker
            key={marker.key}
            position={marker.position}
            zIndex={70}
            title={`${islandName(marker.islandId)} — ${marker.stops
              .map((s) => `Etappe ${s.stageNumber ?? '–'} (Tag ${s.day})`)
              .join(', ')}`}
          >
            <div
              className={`stage-number${marker.stops.length > 1 ? ' mehrfach' : ''}`}
              style={{ background: color }}
            >
              {marker.label}
            </div>
          </AdvancedMarker>
        ))}
      </Map>
    </div>
  );
}
