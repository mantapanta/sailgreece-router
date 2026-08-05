import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TripProvider, useTrip } from './tripContext.tsx';
import { AuthProvider, useAuth } from './authContext.tsx';
import { STALE_TIME_MS } from './usePlanning.ts';
import { PlanningProvider, usePlanning } from './planningContext.tsx';
import { getCurrentGpsPosition } from '../adapters/geolocation.ts';
import { DayView } from '../ui/views/DayView.tsx';
import { MapView } from '../ui/views/MapView.tsx';
import { PlaceDetailView } from '../ui/views/PlaceDetailView.tsx';
import { SignInView } from '../ui/views/SignInView.tsx';
import { AvatarMenu } from '../ui/components/AvatarMenu.tsx';
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
      {/* FR21: no header select for route options — there is ONE main route,
          edited through the day cards (FR28) or checked in from the
          alternatives (FR29). */}
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

/**
 * Ghost refresh glyph (FR13) — used in the header and the footer provenance
 * line. The ⟳ is a glyph, not an emoji: it is aria-hidden inside a button
 * with a German accessible name. While fetching, the glyph spins; under
 * prefers-reduced-motion the global CSS kills the spin and a visually hidden
 * pending text carries the state instead.
 */
function RefreshButton() {
  const { forecastQuery } = usePlanning();
  return (
    <button
      type="button"
      className="icon-button"
      aria-label="Forecast aktualisieren"
      onClick={() => forecastQuery.refetch()}
      disabled={forecastQuery.isFetching}
    >
      <span aria-hidden="true" className={forecastQuery.isFetching ? 'spin' : undefined}>
        ⟳
      </span>
      {forecastQuery.isFetching && (
        <span className="visually-hidden">Aktualisierung läuft …</span>
      )}
    </button>
  );
}

function Shell() {
  const [view, setView] = useState<View>({ kind: 'tag' });
  /** Footer provenance detail expander (FR13 — meaning never in a tooltip). */
  const [detailOpen, setDetailOpen] = useState(false);
  const planning = usePlanning();
  const { libraryQuery, forecastQuery, snapshot, assessment } = planning;

  const openPlace = (placeId: string) =>
    setView((v) => ({
      kind: 'platz',
      placeId,
      returnTo: v.kind === 'karte' ? 'karte' : 'tag',
    }));

  // Place detail keeps the tab of the view it was opened from active.
  const activeTab: 'tag' | 'karte' = view.kind === 'platz' ? view.returnTo : view.kind;

  return (
    <div className="shell">
      <header className="app-header">
        <div className="header-line1">
          <div className="wordmark">
            Sail<span className="wordmark-accent">Greece</span>
          </div>
          <AvatarMenu />
        </div>
        <div className="header-line2">
          <nav className="segmented-tabs" aria-label="Ansicht">
            <button
              type="button"
              aria-current={activeTab === 'tag' ? 'page' : undefined}
              onClick={() => setView({ kind: 'tag' })}
            >
              Heute
            </button>
            <button
              type="button"
              aria-current={activeTab === 'karte' ? 'page' : undefined}
              onClick={() => setView({ kind: 'karte' })}
            >
              Karte
            </button>
          </nav>
          <RefreshButton />
        </div>
      </header>

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

      {/* Mandatory permanent notice: data state (FR13), demoted to quiet
          footer provenance. */}
      <footer className="app-footer">
        <p className="provenance" aria-live="polite">
          <button
            type="button"
            className="provenance-text"
            aria-expanded={detailOpen}
            onClick={() => setDetailOpen((o) => !o)}
          >
            Forecast: {assessment?.model ?? '…'} · Lauf{' '}
            {formatStamp(assessment?.modelRunIso ?? null)} · abgerufen{' '}
            {assessment ? formatStamp(assessment.fetchedAtIso) : '…'}
          </button>
          <RefreshButton />
        </p>
        {detailOpen && (
          <div className="provenance-detail">
            <p>Modell: {assessment?.model ?? '…'}</p>
            <p>Modelllauf: {formatStamp(assessment?.modelRunIso ?? null)}</p>
            <p>Abgerufen: {assessment ? formatStamp(assessment.fetchedAtIso) : '…'}</p>
            <p>Cache-TTL: {Math.round(STALE_TIME_MS / 3_600_000)} h</p>
          </div>
        )}
        <p className="footnote">
          Weather data by{' '}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Open-Meteo
          </a>{' '}
          (CC BY 4.0)
        </p>
        <p className="footnote">
          Sichere Liegeplätze quellenbasiert kuratiert (Heikell, CruisersWiki u. a.) —
          unkuratierte Plätze erscheinen nie grün.
        </p>
        <p className="footnote">
          Ersetzt nicht das seemännische Urteil — Modell-Konsens parallel prüfen
          (z. B. Windy).
        </p>
      </footer>
    </div>
  );
}

/**
 * The gate. Planning providers mount only for a signed-in session — otherwise
 * the library query would fire against Firestore without an ID token and be
 * rejected by the rules.
 */
function AuthGate() {
  const { user, checking } = useAuth();

  if (checking) {
    return (
      <div className="auth-gate">
        <div className="auth-card">
          <div className="auth-brand">
            Sail<span className="wordmark-accent">Greece</span>
            <small>Kykladen · Törnplanung</small>
          </div>
          <p className="auth-lead">Anmeldung wird geprüft …</p>
        </div>
      </div>
    );
  }

  if (!user) return <SignInView />;

  return (
    <TripProvider>
      <PlanningProvider>
        <Shell />
      </PlanningProvider>
    </TripProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </QueryClientProvider>
  );
}
