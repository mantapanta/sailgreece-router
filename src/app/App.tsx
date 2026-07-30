import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TripProvider, useTrip } from './tripContext.tsx';
import { usePlanning, STALE_TIME_MS } from './usePlanning.ts';
import { getCurrentGpsPosition } from '../adapters/geolocation.ts';
import { DayView } from '../ui/views/DayView.tsx';
import { MapView } from '../ui/views/MapView.tsx';
import { PlaceDetailView } from '../ui/views/PlaceDetailView.tsx';
import { formatStamp } from '../ui/format.ts';
import '../ui/styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_MS, // AD-7: every async access ~1 h stale time
      retry: 1,
    },
  },
});

/** View switching is plain UI state — no router (AD-11). */
type View =
  | { kind: 'tag' }
  | { kind: 'karte' }
  | { kind: 'platz'; placeId: string; returnTo: 'tag' | 'karte' };

function ControlsBar() {
  const { state, dispatch } = useTrip();
  const { bundle, currentDay } = usePlanning();
  const [gpsError, setGpsError] = useState<string | null>(null);

  const params = bundle?.params;
  const places = bundle?.library.places ?? [];
  const routes = bundle?.library.routes ?? [];

  const requestGps = async () => {
    setGpsError(null);
    try {
      const pos = await getCurrentGpsPosition();
      dispatch({ type: 'GPS_FIX', position: pos });
    } catch (e) {
      setGpsError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="controls">
      <label>
        Törntag
        <select
          value={currentDay}
          onChange={(e) => dispatch({ type: 'SET_DAY', day: Number(e.target.value) })}
        >
          {Array.from({ length: params?.tripLengthDays ?? 12 }, (_, i) => i + 1).map(
            (d) => (
              <option key={d} value={d}>
                Tag {d}
              </option>
            ),
          )}
        </select>
      </label>
      <label>
        Position
        <select
          value={state.position?.source === 'manual' ? (state.position.placeId ?? '') : ''}
          onChange={(e) => {
            const place = places.find((p) => p.id === e.target.value);
            if (place) {
              dispatch({
                type: 'SET_MANUAL_PLACE',
                placeId: place.id,
                lat: place.coordinates.lat,
                lon: place.coordinates.lon,
              });
            }
          }}
        >
          <option value="">
            {state.position?.source === 'gps' ? 'GPS-Fix aktiv' : 'Platz wählen …'}
          </option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={requestGps}>
        GPS abfragen
      </button>
      {state.position?.source === 'manual' && (
        <button
          type="button"
          className="secondary"
          onClick={() => dispatch({ type: 'RELEASE_MANUAL' })}
        >
          Manuelle Position lösen
        </button>
      )}
      <label>
        Verfolgte Option
        <select
          value={state.trackedRouteId ?? ''}
          onChange={(e) =>
            dispatch({ type: 'TRACK_ROUTE', routeId: e.target.value || null })
          }
        >
          <option value="">— keine —</option>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Abfahrt
        <select
          value={state.departureHourOverride ?? ''}
          onChange={(e) =>
            dispatch({
              type: 'SET_DEPARTURE_HOUR',
              hour: e.target.value === '' ? null : Number(e.target.value),
            })
          }
        >
          <option value="">Standard ({params?.departureHourAthens ?? 9}:00)</option>
          {[6, 7, 8, 9, 10, 11, 12].map((h) => (
            <option key={h} value={h}>
              {h}:00
            </option>
          ))}
        </select>
      </label>
      {gpsError && <span style={{ color: 'var(--rot)' }}>{gpsError}</span>}
    </div>
  );
}

function Shell() {
  const [view, setView] = useState<View>({ kind: 'tag' });
  const planning = usePlanning();
  const { libraryQuery, forecastQuery, snapshot, assessment } = planning;

  const openPlace = (placeId: string) =>
    setView((v) => ({
      kind: 'platz',
      placeId,
      returnTo: v.kind === 'karte' ? 'karte' : 'tag',
    }));

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          sailgreece-router
          <small>Kykladen · 8.–19. August 2026</small>
        </div>
        <nav className="tabs">
          <button
            type="button"
            className={view.kind === 'tag' ? 'active' : ''}
            onClick={() => setView({ kind: 'tag' })}
          >
            Tagesansicht
          </button>
          <button
            type="button"
            className={view.kind !== 'tag' ? 'active' : ''}
            onClick={() => setView({ kind: 'karte' })}
          >
            Karte
          </button>
        </nav>
      </header>

      {/* Mandatory permanent notices: NFR3 + data state (FR13). */}
      <div className="notice-bar">
        <span className="warnhinweis">
          ⚓ Ersetzt nicht das seemännische Urteil — die App rechnet und
          vergleicht, der Skipper entscheidet.
        </span>
        <span className="datenstand">
          Modell {assessment?.model ?? '…'} · Modelllauf{' '}
          {formatStamp(assessment?.modelRunIso ?? null)} · abgerufen{' '}
          {assessment ? formatStamp(assessment.fetchedAtIso) : '…'}
          <button
            type="button"
            onClick={() => forecastQuery.refetch()}
            disabled={forecastQuery.isFetching}
          >
            {forecastQuery.isFetching ? 'lädt …' : 'Aktualisieren'}
          </button>
        </span>
      </div>

      <main className="content">
        {libraryQuery.isError && (
          <div className="error-panel">
            Bibliothek konnte nicht geladen werden:{' '}
            {libraryQuery.error instanceof Error
              ? libraryQuery.error.message
              : String(libraryQuery.error)}
          </div>
        )}
        {forecastQuery.isError && (
          <div className="error-panel">
            Open-Meteo nicht erreichbar — angezeigt wird der letzte Datenstand
            {assessment ? ` (abgerufen ${formatStamp(assessment.fetchedAtIso)})` : ''}.
            Fehler:{' '}
            {forecastQuery.error instanceof Error
              ? forecastQuery.error.message
              : String(forecastQuery.error)}
          </div>
        )}

        {view.kind !== 'platz' && <ControlsBar />}

        {!snapshot || !assessment ? (
          !libraryQuery.isError && !forecastQuery.isError ? (
            <div className="hint-panel">Lade Bibliothek und Forecast …</div>
          ) : null
        ) : view.kind === 'tag' ? (
          <DayView snapshot={snapshot} assessment={assessment} onOpenPlace={openPlace} />
        ) : view.kind === 'karte' ? (
          <MapView snapshot={snapshot} assessment={assessment} onOpenPlace={openPlace} />
        ) : (
          <PlaceDetailView
            placeId={view.placeId}
            snapshot={snapshot}
            assessment={assessment}
            onBack={() => setView({ kind: view.returnTo })}
          />
        )}
      </main>

      <footer className="attribution">
        <span>
          Weather data by{' '}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Open-Meteo
          </a>{' '}
          (CC BY 4.0)
        </span>
        <span>
          Schutzprofile quellenbasiert kuratiert (Heikell, CruisersWiki u. a.) —
          unkuratierte Plätze erscheinen nie grün.
        </span>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TripProvider>
        <Shell />
      </TripProvider>
    </QueryClientProvider>
  );
}
