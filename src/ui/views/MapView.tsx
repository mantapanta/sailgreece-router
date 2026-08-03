/**
 * F1 — map & briefing picture (FR1-FR4).
 * Google Maps via @vis.gl/react-google-maps 1.x: AdvancedMarker for place
 * ampel pins and rotated wind arrows; routes as coloured DASHED polylines
 * (symbol-repeat workaround in Polyline.tsx). Sticky-split layout: itinerary
 * cards left, fixed map right (stacked on mobile). Hover in the list
 * highlights markers and vice versa (transient view state, not TripContext).
 * Without a Maps key the view shows a clear notice instead of crashing.
 */

import { useMemo, useState } from 'react';
import { APIProvider, AdvancedMarker, Map } from '@vis.gl/react-google-maps';
import type {
  Assessment,
  PlanningSnapshot,
} from '../../domain/schema/snapshot.ts';
import type { Route } from '../../domain/schema/route.ts';
import { hourIndexAt } from '../../domain/time.ts';
import { AMPEL_CSS_COLOR, AmpelBadge } from '../components/AmpelBadge.tsx';
import { Polyline } from '../components/Polyline.tsx';
import { formatHours, formatKn, compass } from '../format.ts';

const REVIER_CENTER = { lat: 37.3, lng: 24.6 };

function routePath(
  route: Route,
  snapshot: PlanningSnapshot,
): google.maps.LatLngLiteral[] {
  const path: google.maps.LatLngLiteral[] = [];
  const placeCoord = (placeId: string) => {
    const p = snapshot.library.places.find((pl) => pl.id === placeId);
    return p ? { lat: p.coordinates.lat, lng: p.coordinates.lon } : null;
  };
  route.legs.forEach((leg, i) => {
    const from = placeCoord(leg.fromPlaceId);
    if (i === 0 && from) path.push(from);
    for (const w of leg.waypoints) path.push({ lat: w.lat, lng: w.lon });
    const to = placeCoord(leg.toPlaceId);
    if (to) path.push(to);
  });
  return path;
}

export function MapView({
  snapshot,
  assessment,
  onOpenPlace,
}: {
  snapshot: PlanningSnapshot;
  assessment: Assessment;
  onOpenPlace: (placeId: string) => void;
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const mapId = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || 'DEMO_MAP_ID';
  const day = snapshot.trip.currentDay;

  // AD-2: the assessment delivers routeOptions ORDERED by escalation rank —
  // the view only consumes that order, it does not sort by domain criteria.
  const displayRoutes = useMemo(
    () =>
      assessment.routeOptions
        .map((o) => snapshot.library.routes.find((r) => r.id === o.routeId))
        .filter((r): r is Route => r !== undefined),
    [assessment.routeOptions, snapshot.library.routes],
  );
  const [visibleRoutes, setVisibleRoutes] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const r of displayRoutes) initial[r.id] = !r.isReturnChain;
    return initial;
  });
  const [hoverIslandId, setHoverIslandId] = useState<string | null>(null);

  // Wind arrows: forecast hour containing "now" (display only; FR3). When
  // "now" lies OFF the axis (stale cached snapshot, clock before the axis)
  // no arrows are shown — hour 0 must never masquerade as current wind.
  const nowIdx = useMemo(
    () => hourIndexAt(Date.now(), snapshot.times),
    [snapshot.times],
  );

  // Itinerary: legs of the tracked route — or, without tracking, the most
  // AMBITIOUS route whose option is not closed (highest escalation rank;
  // routeOptions are ordered conservative -> ambitious).
  const openStates = new Set(['offen', 'offen-horizont', 'schliesst']);
  const fallbackRouteId = [...assessment.routeOptions]
    .reverse()
    .find((o) => {
      const r = snapshot.library.routes.find((x) => x.id === o.routeId);
      return r !== undefined && !r.isReturnChain && openStates.has(o.state);
    })?.routeId;
  // The round-trip overlay (FR2) replaces this in the UI rework; until then the
  // most ambitious still-open option stands in for the tracked route.
  const trackedRoute =
    displayRoutes.find((r) => r.id === fallbackRouteId) ??
    [...displayRoutes].reverse().find((r) => !r.isReturnChain) ??
    null;
  const trackedAssessment = trackedRoute
    ? assessment.routeOptions.find((o) => o.routeId === trackedRoute.id)
    : null;

  const itinerary = (
    <div className="map-itinerary">
      <div className="route-toggles">
        <span className="versal">Routen-Optionen (FR2)</span>
        {displayRoutes.map((r) => (
          <label key={r.id}>
            <input
              type="checkbox"
              checked={visibleRoutes[r.id] ?? false}
              onChange={(e) =>
                setVisibleRoutes((v) => ({ ...v, [r.id]: e.target.checked }))
              }
            />
            <span className="route-swatch" style={{ color: r.color ?? '#4c6b8a' }} />
            {r.name}
          </label>
        ))}
      </div>

      {trackedRoute && (
        <>
          <span className="versal">Itinerar · {trackedRoute.name}</span>
          {trackedRoute.legs.map((leg, i) => {
            const la = trackedAssessment?.legAssessments.find(
              (x) => x.legId === leg.id,
            );
            const active =
              hoverIslandId === leg.toIslandId || hoverIslandId === leg.fromIslandId;
            const fromName =
              snapshot.library.islands.find((x) => x.id === leg.fromIslandId)?.name ??
              leg.fromIslandId;
            const toName =
              snapshot.library.islands.find((x) => x.id === leg.toIslandId)?.name ??
              leg.toIslandId;
            return (
              <div
                key={leg.id}
                className={`itinerary-card${active ? ' active' : ''}`}
                onMouseEnter={() => setHoverIslandId(leg.toIslandId)}
                onMouseLeave={() => setHoverIslandId(null)}
              >
                <span className="versal">Etappe {i + 1}</span>
                <div className="headline">
                  {fromName} → {toName}
                </div>
                <div className="badges">
                  <span className="badge">{leg.distanceNm} sm</span>
                  {la && <span className="badge">{formatHours(la.totalHours)}</span>}
                  {la && <AmpelBadge ampel={la.ampel} />}
                </div>
                {leg.windWarnings.map((w) => (
                  <div className="beschreibung" key={w}>
                    ⚠ {w}
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
    </div>
  );

  if (!apiKey) {
    return (
      <div className="map-split">
        {itinerary}
        <div className="map-sticky">
          <div className="hint-panel" style={{ height: '100%' }}>
            <h2>Karte nicht verfügbar</h2>
            <p>
              Es ist kein Google-Maps-API-Key gesetzt. Trage{' '}
              <code>VITE_GOOGLE_MAPS_API_KEY</code> in deine <code>.env</code> ein
              (siehe <code>.env.example</code> und README) und lade die Seite neu.
              Alle Bewertungen sind weiter in der Tagesansicht verfügbar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="map-split">
      {itinerary}
      <div className="map-sticky">
        <APIProvider apiKey={apiKey}>
          <Map
            className="map-container"
            mapId={mapId}
            defaultCenter={REVIER_CENTER}
            defaultZoom={8}
            mapTypeId="hybrid"
            gestureHandling="greedy"
          >
            {displayRoutes
              .filter((r) => visibleRoutes[r.id])
              .map((r, i) => (
                <Polyline
                  key={r.id}
                  path={routePath(r, snapshot)}
                  strokeColor={r.color ?? '#4c6b8a'}
                  dashed
                  zIndex={10 + i}
                />
              ))}

            {snapshot.library.places.map((place) => {
              const ampel =
                assessment.nightAmpeln[place.id]?.[day]?.ampel ?? 'unbewertet';
              const highlight = hoverIslandId === place.islandId;
              return (
                <AdvancedMarker
                  key={place.id}
                  position={{ lat: place.coordinates.lat, lng: place.coordinates.lon }}
                  title={`${place.name} — Nacht-Ampel Tag ${day}: ${ampel}`}
                  onClick={() => onOpenPlace(place.id)}
                  zIndex={highlight ? 100 : 50}
                >
                  <div
                    className={`marker-pin${highlight ? ' highlight' : ''}`}
                    style={{ background: AMPEL_CSS_COLOR[ampel] }}
                    onMouseEnter={() => setHoverIslandId(place.islandId)}
                    onMouseLeave={() => setHoverIslandId(null)}
                  />
                </AdvancedMarker>
              );
            })}

            {nowIdx !== null && snapshot.library.places.map((place) => {
              const fc = snapshot.forecast[place.id];
              const kn = fc?.windKn[nowIdx] ?? null;
              const dir = fc?.windDirDeg[nowIdx] ?? null;
              if (kn === null || dir === null) return null;
              return (
                <AdvancedMarker
                  key={`wind-${place.id}`}
                  position={{
                    lat: place.coordinates.lat + 0.045,
                    lng: place.coordinates.lon,
                  }}
                  zIndex={5}
                >
                  <div
                    className="wind-arrow"
                    title={`Wind aus ${compass(dir)} (${Math.round(dir)}°), ${formatKn(kn)}`}
                  >
                    <span style={{ transform: `rotate(${(dir + 180) % 360}deg)` }}>
                      ↑
                    </span>
                    <span className="kn">{Math.round(kn)}</span>
                  </div>
                </AdvancedMarker>
              );
            })}
          </Map>
        </APIProvider>
      </div>
    </div>
  );
}
