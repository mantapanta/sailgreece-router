import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TripProvider, useTrip } from './tripContext.tsx';
import { STALE_TIME_MS } from './usePlanning.ts';
import { PlanningProvider, usePlanning } from './planningContext.tsx';
import { RouteViewProvider } from './routeViewContext.tsx';
import { getCurrentGpsPosition } from '../adapters/geolocation.ts';
import { DayView } from '../ui/views/DayView.tsx';
import { MapView } from '../ui/views/MapView.tsx';
import { PlaceDetailView } from '../ui/views/PlaceDetailView.tsx';
import { DayViewSkeleton } from '../ui/components/DayViewSkeleton.tsx';
import { MapViewSkeleton } from '../ui/components/MapViewSkeleton.tsx';
import { staleForecastLabel } from '../ui/dayViewModel.ts';
import { formatStamp } from '../ui/format.ts';
import { attributionsFor, forecastModelLabel } from '../domain/schema/models.ts';
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
  /**
   * `focusDay` ist der Sprung von einer Etappennummer der Karte auf ihre
   * Etappen-Card (Feedback 2026-08-06): die Tagesansicht klappt den Tag auf und
   * scrollt ihn an. Nur beim Ansichtswechsel gesetzt — der Reiter "Heute"
   * öffnet die Ansicht wie immer oben.
   */
  | { kind: 'tag'; focusDay?: number }
  | { kind: 'karte' }
  | {
      kind: 'platz';
      placeId: string;
      returnTo: 'tag' | 'karte';
      /**
       * Gesetzt, wenn der Platz über einen KITE-HINWEIS geöffnet wurde: die
       * Kite-Karte scrollt dann heran und hebt genau diesen Spot hervor. Ohne
       * ihn wäre der Link vom Etappen-Hinweis ein Sprung auf eine Seite, auf
       * der der Spot irgendwo unten steht — und der Skipper sucht wieder.
       */
      focusKiteSpotId?: string;
    };

/**
 * Ghost refresh glyph (FR13) — used in the header and the footer provenance
 * line. The ⟳ is a glyph, not an emoji: it is aria-hidden inside a button
 * with a German accessible name. While fetching, the glyph spins; under
 * prefers-reduced-motion the global CSS kills the spin and a visually hidden
 * pending text carries the state instead. `stale` renders the glyph
 * primary-toned while the forecast is older than the TTL (footer instance
 * only, AC 2 of Story 1.2).
 */
function RefreshButton({ stale = false }: { stale?: boolean }) {
  const { forecastQuery } = usePlanning();
  return (
    <button
      type="button"
      className={stale ? 'icon-button stale' : 'icon-button'}
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
  const { state: tripState, dispatch } = useTrip();

  useEffect(() => {
    // FR27: position resolves automatically at app start; failures are silent —
    // the position popover ("GPS erneut abfragen") is the visible recovery path.
    if (tripState.position?.source === 'manual') return; // reducer guards anyway
    let cancelled = false;
    getCurrentGpsPosition()
      .then((pos) => {
        if (!cancelled) dispatch({ type: 'GPS_FIX', position: pos });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Mount-only by design: one query at app start, never a reactive loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stale check re-runs at most once per minute (AC 2) — the label itself is
  // the tested pure helper; the tick only injects fresh wall-clock time.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const staleLabel = assessment
    ? staleForecastLabel(assessment.fetchedAtIso, nowMs, STALE_TIME_MS)
    : null;

  /** Nah/Fern-Herkunft — optional, weil ein Bundle von vor der Umstellung noch
      im Query-Cache liegen kann. */
  const prov = assessment?.provenance;
  const modelAttributions = attributionsFor(
    [prov?.wind.far, prov?.wind.near, prov?.wave.far, prov?.wave.near].filter(
      (id): id is string => !!id,
    ),
  );

  const openPlace = (placeId: string, focusKiteSpotId?: string) =>
    setView((v) => ({
      kind: 'platz',
      placeId,
      returnTo: v.kind === 'karte' ? 'karte' : 'tag',
      focusKiteSpotId,
    }));

  /**
   * Etappennummer auf der Karte → Etappen-Card in "Heute". Die Karte zeigt WO,
   * die Card sagt WAS — seit die Etappenliste unter der Karte entfallen ist,
   * ist das der Weg dorthin.
   */
  const openStageDay = (day: number) => setView({ kind: 'tag', focusDay: day });

  // Place detail keeps the tab of the view it was opened from active.
  const activeTab: 'tag' | 'karte' = view.kind === 'platz' ? view.returnTo : view.kind;

  return (
    <div className="shell">
      <header className="app-header">
        <div className="header-line1">
          <div className="wordmark">
            Sail<span className="wordmark-accent">Greece</span>
          </div>
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
          <div className="error-panel" role="alert">
            Törnbibliothek nicht geladen — ohne sie gibt es keine Plätze und
            keine Etappen. Verbindung prüfen und die Seite neu laden. Ursache:{' '}
            {libraryQuery.error instanceof Error
              ? libraryQuery.error.message
              : String(libraryQuery.error)}
          </div>
        )}
        {forecastQuery.isError && (
          <div className="error-panel" role="alert">
            Forecast nicht erreichbar — angezeigt wird der letzte Datenstand
            {assessment ? ` (abgerufen ${formatStamp(assessment.fetchedAtIso)})` : ''}.
            Später erneut aktualisieren; bis dahin bleibt die Planung auf diesem
            Stand. Ursache:{' '}
            {forecastQuery.error instanceof Error
              ? forecastQuery.error.message
              : String(forecastQuery.error)}
          </div>
        )}

        {!snapshot || !assessment ? (
          !libraryQuery.isError && !forecastQuery.isError ? (
            view.kind === 'tag' ? (
              <DayViewSkeleton />
            ) : view.kind === 'karte' ? (
              <MapViewSkeleton />
            ) : (
              <div className="hint-panel">Lade Daten …</div>
            )
          ) : null
        ) : view.kind === 'tag' ? (
          <DayView
            snapshot={snapshot}
            assessment={assessment}
            onOpenPlace={openPlace}
            focusDay={view.focusDay ?? null}
            // Die gewählte Route bleibt beim Wechsel stehen (routeViewContext):
            // „auf der Karte zeigen" ist derselbe Blick, nur im Bild.
            onOpenMap={() => setView({ kind: 'karte' })}
          />
        ) : view.kind === 'karte' ? (
          <MapView
            snapshot={snapshot}
            assessment={assessment}
            onOpenPlace={openPlace}
            // Etappennummer → genau ihre Card; der Kopf der Ansicht ohne Tag.
            onOpenStageDay={openStageDay}
            onOpenDay={() => setView({ kind: 'tag' })}
          />
        ) : (
          <PlaceDetailView
            placeId={view.placeId}
            snapshot={snapshot}
            assessment={assessment}
            focusKiteSpotId={view.focusKiteSpotId}
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
            {staleLabel && <span className="stale">{staleLabel} · </span>}
            Forecast: {assessment?.model ?? '…'} · Lauf{' '}
            {formatStamp(assessment?.modelRunIso ?? null)} · abgerufen{' '}
            {assessment ? formatStamp(assessment.fetchedAtIso) : '…'}
          </button>
          <RefreshButton stale={staleLabel !== null} />
        </p>
        {detailOpen && (
          <div className="provenance-detail">
            {/* Zwei Modelle je Art — sonst behauptete "Modell: X" eine
                Auflösung, die nur die erste Hälfte der Reihe hat. */}
            <p>Wind Fernfeld: {forecastModelLabel(prov?.wind.far ?? assessment?.model ?? '…')}</p>
            <p>Modelllauf: {formatStamp(assessment?.modelRunIso ?? null)}</p>
            {prov?.wind.near && (
              <p>
                Wind Nahfeld: {forecastModelLabel(prov.wind.near)} · Lauf{' '}
                {formatStamp(prov.wind.nearRunIso)} · trägt{' '}
                {prov.wind.nearReachHours} h
              </p>
            )}
            <p>Wellen Fernfeld: {forecastModelLabel(prov?.wave.far ?? '…')}</p>
            {prov?.wave.near && (
              <p>
                Wellen Nahfeld: {forecastModelLabel(prov.wave.near)} · trägt{' '}
                {prov.wave.nearReachHours} h
              </p>
            )}
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
          {/* Namensnennung der AKTIVEN Modelle, aus der Registry gerendert —
              damit sie nicht auseinanderläuft, wenn das Modell in Firestore
              umgestellt wird (DWD/GeoNutzV verlangt die Quellenangabe). Die
              Daten werden unverändert durchgereicht (harter Schnitt, kein
              Blending), es braucht also keinen "verändert"-Zusatz. */}
          {modelAttributions.length > 0 && ` · ${modelAttributions.join(' · ')}`}
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
 * Kein Login mehr davor: die Bibliothek liegt als Staging-JSON im Bundle
 * (adapters/library.ts), es gibt also keinen Backend-Zugriff mehr, der eine
 * Sitzung bräuchte. Wer die App nicht sehen soll, wird vor der Auslieferung
 * gesperrt (Vercel Deployment Protection), nicht in der App.
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TripProvider>
        <PlanningProvider>
          {/* Die angesehene Route (Hauptroute oder eine Alternative) gilt für
              BEIDE Ansichten — deshalb über dem Shell, nicht in einer View. */}
          <RouteViewProvider>
            <Shell />
          </RouteViewProvider>
        </PlanningProvider>
      </TripProvider>
    </QueryClientProvider>
  );
}
