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

import { useEffect, useMemo, useState } from 'react';
import { APIProvider, AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps';
import type { Assessment, PlanningSnapshot } from '../../domain/schema/snapshot.ts';
import { hourIndexAt } from '../../domain/time.ts';
import { AMPEL_CSS_COLOR, AmpelBadge } from '../components/AmpelBadge.tsx';
import { Polyline } from '../components/Polyline.tsx';
import { WindBarb } from '../components/WindBarb.tsx';
import { buildLegsById, stageEndMarkers, stagePath } from '../mapPath.ts';
import { type BarbPoint, windFieldFor } from '../windField.ts';
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

/**
 * Abstand, um den eine Windfieder gegen die Windrichtung vom Platz weggesetzt
 * wird (in Breitengrad, ca. 3,5 sm). Die Fieder sitzt damit LUVSEITIG des
 * Hafens: sie zeigt weiter nach Luv, der Platz und die Route darunter bleiben
 * frei. Ohne Versatz decken 97 Fiedern genau die Marker ab, die man lesen will.
 */
const WIND_OFFSET_DEG = 0.06;

/**
 * Versatz nach Luv. Der Längengrad muss mit cos(Breite) korrigiert werden,
 * sonst wäre der Versatz auf 37° N in Ost-West-Richtung rund 20 % zu kurz und
 * die Fiedern stünden schief zur Windrichtung.
 */
function upwindOffset(
  lat: number,
  lon: number,
  windFromDeg: number,
): google.maps.LatLngLiteral {
  const rad = (windFromDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  return {
    lat: lat + WIND_OFFSET_DEG * Math.cos(rad),
    lng: lon + (WIND_OFFSET_DEG * Math.sin(rad)) / Math.max(Math.cos(latRad), 0.2),
  };
}

/**
 * Die Windfiedern-Ebene — der einzige Ort, an dem die Karte weiss, wie weit
 * sie herausgezoomt ist.
 *
 * Muss INNERHALB von <Map> stehen: `useMap()` liefert die Instanz, an der der
 * Zoom hängt. Ohne Zoom kein Mindestabstand in Pixeln, und ohne den wären wir
 * wieder bei 97 Fiedern übereinander.
 */
function WindLayer({
  points,
  islandOf,
  onCount,
}: {
  points: BarbPoint[];
  islandOf: (key: string) => string | null;
  /** Meldet nach oben, was gezeigt und was ausgelassen wurde (für die Legende). */
  onCount: (shown: number, hidden: number) => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState<number | null>(null);

  useEffect(() => {
    if (!map) return;
    const update = () => setZoom(map.getZoom() ?? null);
    update();
    const listener = map.addListener('zoom_changed', update);
    return () => listener.remove();
  }, [map]);

  const field = useMemo(
    () =>
      zoom === null
        ? { shown: [] as BarbPoint[], hidden: 0, islands: 0 }
        : windFieldFor(points, islandOf, zoom),
    [points, islandOf, zoom],
  );

  useEffect(() => {
    onCount(field.shown.length, field.hidden);
  }, [field.shown.length, field.hidden, onCount]);

  return (
    <>
      {field.shown.map((p) => (
        <AdvancedMarker
          key={`wind-${p.key}`}
          position={upwindOffset(p.lat, p.lon, p.dirDeg)}
          zIndex={5}
        >
          {/* Die Zahl neben der Fieder ist weg: die Fiedern kodieren die
              Stärke bereits (5 kn je halbe Fieder), die Ziffer sagte dasselbe
              ein zweites Mal. Sie steht weiter im Tooltip, wo sie niemanden
              zudeckt. */}
          <div
            className="wind-barb"
            title={`Wind aus ${compass(p.dirDeg)} (${Math.round(p.dirDeg)}°), ${formatKn(
              p.knots,
            )}`}
          >
            <WindBarb dirDeg={p.dirDeg} knots={p.knots} size={34} />
          </div>
        </AdvancedMarker>
      ))}
    </>
  );
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
  /**
   * FR10-Lesbarkeit: 97 Windfiedern über den Kykladen verdecken die Route.
   * Transienter View-State, bewusst NICHT im TripContext — das Ein-/Ausblenden
   * ist eine Blickentscheidung, keine Törnentscheidung.
   */
  const [showWind, setShowWind] = useState(true);

  const legsById = useMemo(
    () => buildLegsById(snapshot.library.legs),
    [snapshot.library.legs],
  );

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

  const endMarkers = useMemo(
    () => stageEndMarkers(sailingStages, legsById, snapshot),
    [sailingStages, legsById, snapshot],
  );

  /** Inseln, über die die Hauptroute führt — sie stehen vor dem übrigen Revier. */
  const routeIslands = useMemo(() => {
    const ids = new Set<string>();
    for (const s of main?.stages ?? []) ids.add(s.toIslandId);
    return ids;
  }, [main]);

  /**
   * Kandidaten für Windfiedern: der Wind der aktuellen Stunde an jedem Platz
   * mit Forecast. Welche davon die Karte zeigt, entscheidet windField.ts —
   * hier wird nur eingesammelt und gewichtet.
   */
  const barbCandidates = useMemo<BarbPoint[]>(() => {
    if (nowIdx === null) return [];
    const out: BarbPoint[] = [];
    for (const place of snapshot.library.places) {
      const fc = snapshot.forecast[place.id];
      const knots = fc?.windKn[nowIdx] ?? null;
      const dirDeg = fc?.windDirDeg[nowIdx] ?? null;
      if (knots === null || dirDeg === null) continue;
      out.push({
        key: place.id,
        lat: place.coordinates.lat,
        lon: place.coordinates.lon,
        dirDeg,
        knots,
        priority: ampelIslands.has(place.islandId)
          ? 0
          : routeIslands.has(place.islandId)
            ? 1
            : 2,
      });
    }
    return out;
  }, [snapshot.library.places, snapshot.forecast, nowIdx, ampelIslands, routeIslands]);

  const islandOfPlace = useMemo(() => {
    // Bewusst ein Record und keine Map: `Map` ist in diesem Modul die
    // Kartenkomponente aus @vis.gl — `new Map(...)` wäre hier der Konstruktor,
    // den es nicht gibt.
    const byId: Record<string, string> = {};
    for (const p of snapshot.library.places) byId[p.id] = p.islandId;
    return (key: string) => byId[key] ?? null;
  }, [snapshot.library.places]);

  const [windCount, setWindCount] = useState({ shown: 0, hidden: 0 });
  const onWindCount = useMemo(
    () => (shown: number, hidden: number) => setWindCount({ shown, hidden }),
    [],
  );

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
        <label className="wind-toggle">
          <input
            type="checkbox"
            checked={showWind}
            onChange={(e) => setShowWind(e.target.checked)}
          />
          Windfiedern
        </label>
        {showWind && (
          <div className="wind-legende">
            <span>
              <WindBarb dirDeg={0} knots={5} size={26} /> 5 kn
            </span>
            <span>
              <WindBarb dirDeg={0} knots={10} size={26} /> 10 kn
            </span>
            <span>
              <WindBarb dirDeg={0} knots={25} size={26} /> 25 kn
            </span>
            <span className="beschreibung">
              Schaft zeigt, woher der Wind kommt.
              {/* Keine stille Kürzung: die Karte sagt, wie viele Inseln sie
                  gerade auslässt — sonst läse sich ein ausgedünntes Feld wie
                  ein vollständiges. */}
              {windCount.hidden > 0 && (
                <>
                  {' '}
                  {windCount.shown} von {windCount.shown + windCount.hidden} Inseln —
                  hineinzoomen zeigt die übrigen.
                </>
              )}
            </span>
          </div>
        )}
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
                  // Kräftiger als bisher: über dem Satellitenbild geht eine
                  // 3-px-Linie im Blau der Ägäis unter (dazu der helle Saum
                  // in Polyline.tsx).
                  strokeWeight={hoverDay === stage.day ? 6 : 4}
                  zIndex={hoverDay === stage.day ? 60 : 20}
                />
              );
            })}

            {/* FR2 — Etappennummern am Tagesziel, EINE Markierung je Insel.
                Der Round-Trip läuft hin und zurück über dieselbe Kette; je
                Etappe eine Markierung hiesse, dass die Rücktour die Hintour
                zudeckt und die Karte nur noch die halbe Reise zeigt. */}
            {endMarkers.map((marker) => {
              const active = marker.stops.some((s) => s.day === hoverDay);
              const allPast = marker.stops.every((s) => s.day < day);
              const title = `${islandName(marker.islandId)} — ${marker.stops
                .map(
                  (s) =>
                    `Etappe ${s.stageNumber ?? '–'} (Tag ${s.day})${s.day === day ? ', heute' : ''}`,
                )
                .join(', ')}`;
              return (
                <AdvancedMarker
                  key={marker.key}
                  position={marker.position}
                  zIndex={active ? 120 : 70}
                  title={title}
                >
                  <div
                    className={`stage-number${active ? ' highlight' : ''}${allPast ? ' past' : ''}${
                      marker.stops.length > 1 ? ' mehrfach' : ''
                    }`}
                    onMouseEnter={() => setHoverDay(marker.stops[0]!.day)}
                    onMouseLeave={() => setHoverDay(null)}
                  >
                    {marker.label}
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

            {/* FR3 — Windfiedern in der Notation der Wetterkarte. Anders als der
                frühere Pfeil zeigt der Schaft dorthin, WOHER der Wind kommt
                (AD-6), nicht wohin er weht. Wie viele davon die Karte verträgt,
                entscheidet windField.ts — eine je Insel, danach Mindestabstand
                auf dem Schirm. */}
            {showWind && (
              <WindLayer
                points={barbCandidates}
                islandOf={islandOfPlace}
                onCount={onWindCount}
              />
            )}
          </Map>
        </APIProvider>
      </div>
    </div>
  );
}
