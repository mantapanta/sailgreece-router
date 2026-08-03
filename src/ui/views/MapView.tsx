/**
 * F1 — map & briefing picture (FR1-FR4).
 *
 * The map shows the ROUND TRIP (FR2): the distance already sailed as a solid
 * green line, the planned rest as a dashed line in the rest-trip light's colour,
 * and every stage numbered at its day target. Ampel markers appear only for the
 * current island and today's target island (FR1) — what matters is which
 * harbour we enter today, not what happens in five days.
 *
 * Google Maps via @vis.gl/react-google-maps 1.x: AdvancedMarker for pins,
 * numbers and rotated wind arrows; dashed lines via the symbol-repeat
 * workaround in Polyline.tsx. Sticky-split layout: itinerary left, fixed map
 * right (stacked on mobile). Hover syncs list and map (transient view state,
 * never TripContext). Without a Maps key the view shows a notice, not a crash.
 */

import { useMemo, useState } from 'react';
import { APIProvider, AdvancedMarker, Map } from '@vis.gl/react-google-maps';
import type {
  Assessment,
  PlanningSnapshot,
  StageAssessment,
} from '../../domain/schema/snapshot.ts';
import type { Leg } from '../../domain/schema/route.ts';
import { hourIndexAt } from '../../domain/time.ts';
import { AMPEL_CSS_COLOR, AmpelBadge } from '../components/AmpelBadge.tsx';
import { Polyline } from '../components/Polyline.tsx';
import { formatHours, formatKn, compass } from '../format.ts';

const REVIER_CENTER = { lat: 37.3, lng: 24.6 };

/** Colour of the rest-trip line follows the FR2 light. */
const REST_LINE_COLOR: Record<Assessment['restTripAmpel'], string> = {
  gruen: '#3f7d4f',
  gelb: '#c8952a',
  rot: '#b3423a',
  unbewertet: '#8b8b8b',
};

const SAILED_LINE_COLOR = '#3f7d4f';

/** Geographic path of the legs of one stage, start place to destination. */
function stagePath(
  stage: StageAssessment,
  legsById: Record<string, Leg>,
  snapshot: PlanningSnapshot,
): google.maps.LatLngLiteral[] {
  const placeCoord = (placeId: string) => {
    const p = snapshot.library.places.find((pl) => pl.id === placeId);
    return p ? { lat: p.coordinates.lat, lng: p.coordinates.lon } : null;
  };
  const path: google.maps.LatLngLiteral[] = [];
  stage.legs.forEach((la, i) => {
    const leg = legsById[la.legId];
    if (!leg) return;
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
  const mapId =
    (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || 'DEMO_MAP_ID';
  const day = snapshot.trip.currentDay;
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  // Record instead of a JS Map: the identifier `Map` is taken by @vis.gl here.
  const legsById = useMemo(() => {
    const byId: Record<string, Leg> = {};
    for (const leg of snapshot.library.legs) byId[leg.id] ??= leg;
    return byId;
  }, [snapshot.library.legs]);

  const main = assessment.mainRoute;
  const sailingStages = useMemo(
    () => (main?.stages ?? []).filter((s) => s.kind === 'stage'),
    [main],
  );

  // FR1: only the current island and today's target carry an ampel marker.
  const todayStage = main?.stages.find((s) => s.day === day) ?? null;
  const ampelIslands = useMemo(() => {
    const ids = new Set<string>();
    if (assessment.currentIslandId) ids.add(assessment.currentIslandId);
    if (todayStage) ids.add(todayStage.toIslandId);
    return ids;
  }, [assessment.currentIslandId, todayStage]);

  const nowIdx = useMemo(() => hourIndexAt(Date.now(), snapshot.times), [snapshot.times]);
  const restColor = REST_LINE_COLOR[assessment.restTripAmpel];

  const islandName = (id: string) =>
    snapshot.library.islands.find((i) => i.id === id)?.name ?? id;

  const itinerary = (
    <div className="map-itinerary">
      <div className="route-toggles">
        <span className="versal">Round-Trip (FR2)</span>
        <div className="legend">
          <span>
            <span className="legend-line solid" style={{ background: SAILED_LINE_COLOR }} />
            gefahren
          </span>
          <span>
            <span className="legend-line dashed" style={{ borderColor: restColor }} />
            Rest-Trip
          </span>
          <AmpelBadge ampel={assessment.restTripAmpel} />
        </div>
      </div>

      {!main && (
        <div className="hint-panel">
          Noch keine Hauptroute — in der Tagesansicht den Vorschlag übernehmen.
        </div>
      )}

      {sailingStages.map((stage) => {
        const active = hoverDay === stage.day;
        const isPast = stage.day < day;
        const legNames = stage.legs
          .map((la) => la.legId.replace('--', ' → '))
          .join(' + ');
        return (
          <div
            key={stage.day}
            className={`itinerary-card${active ? ' active' : ''}${isPast ? ' past' : ''}`}
            onMouseEnter={() => setHoverDay(stage.day)}
            onMouseLeave={() => setHoverDay(null)}
          >
            <span className="versal">
              Etappe {stage.stageNumber ?? '–'} · Tag {stage.day}
              {stage.day === day && ' · HEUTE'}
              {stage.pinned && ' · 📌'}
            </span>
            <div className="headline">{islandName(stage.toIslandId)}</div>
            <div className="beschreibung">{legNames}</div>
            <div className="badges">
              <span className="badge">
                {formatHours(
                  stage.legs.reduce((s, l) => s + (l.totalHours ?? 0), 0) || null,
                )}
              </span>
              <AmpelBadge ampel={stage.ampel} />
            </div>
          </div>
        );
      })}

      {(main?.stages ?? [])
        .filter((s) => s.kind === 'harbour')
        .map((stage) => (
          <div
            key={`harbour-${stage.day}`}
            className={`itinerary-card harbour${hoverDay === stage.day ? ' active' : ''}`}
            onMouseEnter={() => setHoverDay(stage.day)}
            onMouseLeave={() => setHoverDay(null)}
          >
            <span className="versal">Hafentag · Tag {stage.day}</span>
            <div className="headline">{islandName(stage.toIslandId)}</div>
          </div>
        ))}
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
            {/* FR2 — round-trip overlay: sailed solid green, rest dashed in the
                rest-trip light's colour. One polyline per stage, so a single
                stage can be highlighted on hover. */}
            {sailingStages.map((stage) => {
              const path = stagePath(stage, legsById, snapshot);
              if (path.length < 2) return null;
              const isPast = stage.day < day;
              return (
                <Polyline
                  key={`line-${stage.day}`}
                  path={path}
                  strokeColor={isPast ? SAILED_LINE_COLOR : restColor}
                  dashed={!isPast}
                  zIndex={hoverDay === stage.day ? 60 : 20}
                />
              );
            })}

            {/* Stage numbers at the day target (FR2). */}
            {sailingStages.map((stage) => {
              const path = stagePath(stage, legsById, snapshot);
              const end = path[path.length - 1];
              if (!end || stage.stageNumber === null) return null;
              return (
                <AdvancedMarker
                  key={`num-${stage.day}`}
                  position={end}
                  zIndex={hoverDay === stage.day ? 120 : 70}
                  title={`Etappe ${stage.stageNumber} · Tag ${stage.day} · ${islandName(stage.toIslandId)}`}
                >
                  <div
                    className={`stage-number${hoverDay === stage.day ? ' highlight' : ''}${stage.day < day ? ' past' : ''}`}
                    onMouseEnter={() => setHoverDay(stage.day)}
                    onMouseLeave={() => setHoverDay(null)}
                  >
                    {stage.stageNumber}
                  </div>
                </AdvancedMarker>
              );
            })}

            {/* Places: ampel colour only where it is decision-relevant (FR1). */}
            {snapshot.library.places.map((place) => {
              const relevant = ampelIslands.has(place.islandId);
              const ampel =
                assessment.nightAmpeln[place.id]?.[day]?.ampel ?? 'unbewertet';
              return (
                <AdvancedMarker
                  key={place.id}
                  position={{ lat: place.coordinates.lat, lng: place.coordinates.lon }}
                  title={
                    relevant
                      ? `${place.name} — Nacht-Ampel Tag ${day}: ${ampel}`
                      : place.name
                  }
                  onClick={() => onOpenPlace(place.id)}
                  zIndex={relevant ? 50 : 30}
                >
                  <div
                    className={relevant ? 'marker-pin' : 'marker-pin muted'}
                    style={relevant ? { background: AMPEL_CSS_COLOR[ampel] } : undefined}
                  />
                </AdvancedMarker>
              );
            })}

            {nowIdx !== null &&
              snapshot.library.places.map((place) => {
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
