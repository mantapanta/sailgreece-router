/**
 * F1 — map & briefing picture (FR1-FR4), Consumer-Warm spine (Story 1.3).
 *
 * The map shows the ROUND TRIP (FR2): Hinweg und Rückweg in ZWEI Farben mit
 * Fahrtrichtungspfeilen (Feedback 2026-08-05 — Hin und Rück laufen teils über
 * dieselben Etappen und waren einfarbig nicht unterscheidbar), gefahren als
 * durchgezogene, geplant als gestrichelte Linie, and every stage numbered at
 * its day target. Die Rest-Trip-Ampel steht als Badge in der Legende UND als
 * TripStatusLine am Kopf der Etappenliste — nie nur als Farbe. Ampel markers
 * appear only for the current island and today's target island (FR1) — what
 * matters is which harbour we enter today, not what happens in five days.
 *
 * Layout: ≤860px full-bleed map unter dem Header, die Etappenliste als
 * Bottom-Sheet (Zwei-Zustands-Toggle, bewusst ohne Gesten-Physik — AC 1);
 * ≥861px der Sticky-Split (Liste links, Karte rechts). Layer-Chips und die
 * Legende (Popover hinter dem "i") schweben auf der Karte. Google Maps via
 * @vis.gl/react-google-maps 1.x: AdvancedMarker for pins, capsules and
 * rotated wind arrows; dashed lines via the symbol-repeat workaround in
 * Polyline.tsx. Hover/Fokus/Tap syncs list and map (transient view state,
 * never TripContext). Ohne vollständige Maps-Konfiguration zeigt die
 * Kartenfläche einen benannten Hinweis — die Etappenliste rendert voll.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { APIProvider, AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps';
import type { Ampel } from '../../domain/schema/common.ts';
import type { Assessment, PlanningSnapshot } from '../../domain/schema/snapshot.ts';
import { hourIndexAt } from '../../domain/time.ts';
import { AmpelBadge, AMPEL_LABEL } from '../components/AmpelBadge.tsx';
import { TripStatusLine } from '../components/TripStatusLine.tsx';
import {
  AMPEL_GRAPHIC_HEX,
  COLORS,
  HIN_LINE_COLOR,
  RUECK_LINE_COLOR,
} from '../tokens.ts';
import { Polyline } from '../components/Polyline.tsx';
import { SeamarkLayer } from '../components/SeamarkLayer.tsx';
import { WindBarb } from '../components/WindBarb.tsx';
import { buildLegsById, stageEndMarkers, stagePath } from '../mapPath.ts';
import { type BarbPoint, windFieldFor } from '../windField.ts';
import {
  compass,
  formatAthensTime,
  formatHours,
  formatKn,
  formatKursAbschnitt,
  formatKursAmpelRegel,
  formatTripDayShort,
  formatTripRange,
} from '../format.ts';
import { islandWithPlace } from '../stageText.ts';
import {
  altRouteAt,
  altRouteViews,
  KONZEPT_KURZ,
  type AltRouteView,
} from '../altRoutes.ts';
import { staleForecastLabel } from '../dayViewModel.ts';
import { STALE_TIME_MS } from '../../app/usePlanning.ts';
import { useRouteView } from '../../app/routeViewContext.tsx';
import { resolveMapsEnv } from '../mapsEnv.ts';

const REVIER_CENTER = { lat: 37.3, lng: 24.6 };

/**
 * Maps-Konfiguration — EINMAL pro View gelesen (Story 1.3, AC 9). Fehlende
 * Werte sind ein BENANNTER Zustand: die Kartenfläche erklärt, welche
 * VITE_-Variablen fehlen, die Etappenliste rendert voll — nie ein stiller
 * Demo-Map-Fallback.
 */
const MAPS_ENV = resolveMapsEnv(
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined,
  import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined,
);

/**
 * Hin- und Rückweg in ZWEI Farben (Feedback 2026-08-05): der Round-Trip nutzt
 * teils dieselben Etappen in beide Richtungen, und einfarbig war auf der Karte
 * nicht lesbar, welche Linie hin und welche zurück meint. Die Trennlinie ist
 * `PlanAssessment.turnDay` (Etappen bis einschliesslich Wendetag = Hinweg).
 *
 * Gefahren vs. geplant bleibt als durchgezogen vs. gestrichelt kodiert; die
 * Rest-Trip-Ampel, die vorher die Linienfarbe stellte, war ohnehin EIN
 * Aggregat für alle Rest-Linien und steht jetzt allein im Legenden-Badge.
 * Beide Farben meiden Grün/Gelb/Rot (Ampel) und die Alternativ-Farben
 * (altRouteColors.ts) — eine Richtung, die aussieht wie ein Urteil oder wie
 * eine Alternative, wäre nicht mehr als Richtung lesbar. Weil Blau/Magenta
 * für Farbfehlsichtige zusammenfallen können, tragen die Linien zusätzlich
 * Fahrtrichtungspfeile (Polyline.tsx). Die Farbwerte leben in tokens.ts
 * (einzige TS-Farbquelle).
 */
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
      {field.shown.map((p) => {
        // Die Zahl neben der Fieder ist weg: die Fiedern kodieren die Stärke
        // bereits (5 kn je halbe Fieder), die Ziffer sagte dasselbe ein
        // zweites Mal. Der Wert steht im aria-label (Bedeutung nie nur im
        // Tooltip, Story 1.4) und im selben Text als Hover-Tooltip.
        const barbText = `Wind aus ${compass(p.dirDeg)} (${Math.round(p.dirDeg)}°), ${formatKn(
          p.knots,
        )}`;
        return (
          <AdvancedMarker
            key={`wind-${p.key}`}
            position={upwindOffset(p.lat, p.lon, p.dirDeg)}
            zIndex={5}
          >
            <div
              className="wind-barb"
              role="img"
              aria-label={barbText}
              title={barbText}
            >
              <WindBarb dirDeg={p.dirDeg} knots={p.knots} size={34} />
            </div>
          </AdvancedMarker>
        );
      })}
    </>
  );
}

/**
 * Die Legende hinter dem "i" (Story 1.3, AC 4) — ein Popover nach dem
 * PositionPopover-Kontrakt: eines zur Zeit, Esc/Backdrop/Auslöser schliessen,
 * Fokus geht hinein und zurück zum Auslöser. Das Rest-Trip-Verdikt steht HIER
 * als Badge — nie in der Linienfarbe; die Windfiedern-Kürzung meldet sich
 * über aria-live, weil sich die Zahl beim Zoomen ändert, während das Popover
 * offen ist.
 */
function LegendPopover({
  restTripAmpel,
  turnLabel,
  windCount,
  alternatives,
}: {
  restTripAmpel: Ampel;
  turnLabel: string | null;
  windCount: { shown: number; hidden: number };
  /** Je Alternative: Identitätsfarbe + "Wendepunkt {Insel} · {n} Etappen". */
  alternatives: { key: string; color: string; label: string; shown: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // Fokus hinein: der Popover-Container selbst (tabIndex -1) — die Legende
    // ist Lesestoff, ihr einziges interaktives Element ist der Quellen-Link.
    popRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="legend-btn"
        aria-label="Legende"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span aria-hidden="true">i</span>
      </button>
      {open && (
        <>
          <div className="menu-backdrop" aria-hidden="true" onClick={close} />
          <div
            ref={popRef}
            className="legend-pop"
            role="dialog"
            aria-label="Legende"
            tabIndex={-1}
          >
            <div className="lg-title">Legende</div>
            <div className="lg-row" style={{ color: HIN_LINE_COLOR }}>
              <span className="lg-line solid" aria-hidden="true" />
              <span style={{ color: 'inherit' }}>Hinweg</span>
            </div>
            <div className="lg-row" style={{ color: RUECK_LINE_COLOR }}>
              <span className="lg-line solid" aria-hidden="true" />
              <span style={{ color: 'inherit' }}>Rückweg</span>
            </div>
            <div className="lg-row">
              <span className="lg-line solid" aria-hidden="true" />
              Durchgezogen = gefahren
            </div>
            <div className="lg-row">
              <span className="lg-line dashed" aria-hidden="true" />
              Gestrichelt = geplant
            </div>
            <p className="lg-caption">
              Pfeile zeigen die Fahrtrichtung.
              {turnLabel && <> {turnLabel}</>}
            </p>
            <div className="lg-row">
              Rest-Trip: <AmpelBadge ampel={restTripAmpel} />
            </div>
            <div className="lg-row lg-wind">
              <span>
                <WindBarb dirDeg={0} knots={5} size={26} /> 5 kn
              </span>
              <span>
                <WindBarb dirDeg={0} knots={10} size={26} /> 10 kn
              </span>
              <span>
                <WindBarb dirDeg={0} knots={25} size={26} /> 25 kn
              </span>
            </div>
            <p className="lg-caption">Schaft zeigt, woher der Wind kommt.</p>
            {/* Keine stille Kürzung: die Karte sagt, wie viele Inseln sie
                gerade auslässt — live, weil Zoomen die Zahl ändert, während
                das Popover offen ist. */}
            <div aria-live="polite">
              {windCount.hidden > 0 && (
                <p className="lg-caption">
                  {windCount.shown} von {windCount.shown + windCount.hidden}{' '}
                  Inseln — hineinzoomen zeigt die übrigen.
                </p>
              )}
            </div>
            {alternatives.length > 0 && (
              <>
                {alternatives.map((alt) => (
                  <div key={alt.key} className="lg-row" style={{ color: alt.color }}>
                    <span className="lg-line dashed" aria-hidden="true" />
                    <span style={{ color: 'inherit' }}>
                      {alt.label}
                      {alt.shown && ' · wird gezeigt'}
                    </span>
                  </div>
                ))}
                <p className="lg-caption">
                  Eine Alternative ersetzt die Hauptroute im Bild, sie liegt
                  nicht darüber — sichtbar ist immer genau eine Route. Es sind
                  dieselben Routen wie im Optionsraum der Heute-Ansicht, unter
                  demselben Namen: dort stehen Reichweite, Preis und Frist, hier
                  liegt die Linie. Die gewählte Route bleibt beim Wechsel auf
                  „Heute" stehen und lässt sich dort Etappe für Etappe ansehen;
                  übernommen wird sie erst dort.
                </p>
              </>
            )}
            <p className="lg-caption">
              Tonnen, Leuchtfeuer, Häfen ab Zoomstufe&nbsp;8 — ©{' '}
              <a href="https://www.openseamap.org" target="_blank" rel="noreferrer">
                OpenSeaMap
              </a>
              -Mitwirkende (CC-BY-SA). Keine verlässlichen Tiefen — Pilotage nach
              Revierführer.
            </p>
          </div>
        </>
      )}
    </>
  );
}

/**
 * Routenwahl der Karte hinter EINEM Chip (Feedback 2026-08-06, zweiter
 * Durchgang): ein Chip je Alternative waren bei sieben Alternativen sieben
 * Chips — auf dem Telefon brachen sie in drei Reihen um und nahmen der Karte
 * die halbe Höhe. Jetzt nennt der Chip die gezeigte Route und öffnet die Liste;
 * gewählt wird darin, Hauptroute inklusive.
 *
 * Popover-Kontrakt wie AvatarMenu (Interaction Primitives): eines zur Zeit,
 * Esc/Backdrop/Auslöser schliessen, Fokus geht hinein und zurück zum Auslöser.
 * Der Auslöser ist KEIN Umschalter (kein aria-pressed) — er öffnet ein Menü;
 * welche Route gerade gilt, sagen sein Name und die aria-checked-Zeile.
 *
 * Die Zeilen tragen den NAMEN der Route aus dem Optionsraum und darunter ihre
 * Herkunft (altRoutes.ts). Vorher stand hier „3. Wendepunkt Amorgos" und im
 * Optionsraum „Verlängerung Amorgos" — dieselbe Route unter zwei Namen, und
 * damit blieb unsichtbar, dass die Alternativen die Pläne der Optionen SIND
 * (Skipper 2026-08-06).
 */
function AltRouteMenu({
  alternatives,
  shownIndex,
  onPick,
}: {
  alternatives: AltRouteView[];
  shownIndex: number | null;
  onPick: (index: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const items = () => menuRef.current?.querySelectorAll<HTMLElement>('button');
    items()?.[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === 'Tab') {
        // Einfache Fokusfalle: im Menü zirkulieren, solange es offen ist.
        const focusables = items();
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const shown = shownIndex === null ? null : (alternatives[shownIndex] ?? null);

  return (
    <span className="popover-wrap">
      <button
        ref={triggerRef}
        type="button"
        className={`layer-chip${shown ? ' active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          shown
            ? `Gezeigt: ${shown.name} — andere Route wählen`
            : 'Alternative statt der Hauptroute zeigen'
        }
        onClick={() => (open ? close() : setOpen(true))}
      >
        {shown && (
          <span
            className="chip-dot"
            style={{ background: shown.color }}
            aria-hidden="true"
          />
        )}
        {/* Der volle Name kann lang sein (er kommt aus dem Optionsraum): der
            Chip kürzt ihn mit Ellipse, damit die Chip-Reihe nicht umbricht und
            das Menü darunter im Bild bleibt. Ungekürzt steht er im Menü, in der
            Etappenliste und im aria-label des Auslösers. */}
        <span className="chip-label" aria-hidden="true">
          {shown
            ? shown.name
            : alternatives.length === 1
              ? 'Alternative'
              : 'Alternativen'}
        </span>
      </button>
      {open && (
        <>
          <div className="menu-backdrop" aria-hidden="true" onClick={close} />
          <div
            ref={menuRef}
            className="alt-menu"
            role="menu"
            aria-label="Route auf der Karte"
          >
            <button
              type="button"
              role="menuitemradio"
              aria-checked={shownIndex === null}
              onClick={() => {
                onPick(null);
                close();
              }}
            >
              {/* Hinweg-Blau wie ihre Linie auf der Karte (tokens.ts ist die
                  einzige TS-Farbquelle — darum inline, nicht in styles.css). */}
              <span
                className="am-dot"
                style={{ background: HIN_LINE_COLOR }}
                aria-hidden="true"
              />
              <span className="am-label">Hauptroute</span>
            </button>
            {alternatives.map((alt) => (
              <button
                key={`${alt.index}-${alt.plan.variantId}-${alt.turnIslandId}`}
                type="button"
                role="menuitemradio"
                aria-checked={shownIndex === alt.index}
                onClick={() => {
                  onPick(alt.index);
                  close();
                }}
              >
                <span
                  className="am-dot"
                  style={{ background: alt.color }}
                  aria-hidden="true"
                />
                {/* Name UND Herkunft: der Name ist der des Optionsraums, die
                    zweite Zeile sagt, aus welcher Option und welchem
                    Routen-Konzept die Route stammt. */}
                <span className="am-label">
                  {alt.name}
                  <span className="am-sub">
                    Wendepunkt {alt.turnName} · {alt.stageCount} Etappen
                    {alt.option && ` · ${KONZEPT_KURZ[alt.option.konzeptId]}`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

export function MapView({
  snapshot,
  assessment,
  onOpenPlace,
  onOpenDay,
}: {
  snapshot: PlanningSnapshot;
  assessment: Assessment;
  onOpenPlace: (placeId: string) => void;
  /**
   * In die Tagesansicht wechseln — die gewählte Route bleibt dabei stehen
   * (routeViewContext) und wird dort Tag für Tag aufgeschlagen. Optional,
   * damit die Karte auch ohne Navigationsrahmen rendert (Tests, Storybook).
   */
  onOpenDay?: () => void;
}) {
  const day = snapshot.trip.currentDay;
  const { params } = snapshot;
  /**
   * Blick-Zustand der Karte (AD-11): Sheet, Hover/Auswahl, Ebenen — alles
   * transienter View-State, bewusst NICHT im TripContext. Das Ein-/Ausblenden
   * ist eine Blickentscheidung, keine Törnentscheidung.
   */
  const [sheetOpen, setSheetOpen] = useState(false);
  /** Transient (Hover/Fokus) + sticky (Tap) — Highlight ist eines von beiden. */
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const activeDay = hoverDay ?? selectedDay;
  /**
   * FR10-Lesbarkeit: 97 Windfiedern über den Kykladen verdecken die Route.
   */
  const [showWind, setShowWind] = useState(true);
  /**
   * Seezeichen-Overlay (OpenSeaMap). Standard AN, weil die Ebene transparent
   * ist und erst beim Hineinzoomen sichtbar wird; sie kostet das
   * Besprechungsbild nichts.
   */
  const [showSeamarks, setShowSeamarks] = useState(true);
  /**
   * FEEDBACK 2026-08-05: die Alternativ-Routen waren auf der Karte unsichtbar.
   * Jetzt sind sie EINBLENDBAR — gestrichelt, jede in ihrer Farbe (dieselbe
   * wie in der Vorschau der Tagesansicht, altRouteColors.ts).
   *
   * FEEDBACK 2026-08-06: sie lagen ÜBER der Hauptroute — zwei Routen im selben
   * Bild, und wo sie sich decken, war nicht mehr zu sehen, welche Linie welche
   * ist. Jetzt ist es ein UMSCHALTER statt eines Overlays: sichtbar ist immer
   * genau EINE Route — die Hauptroute, oder STATT ihrer eine Alternative.
   * Darum ein Index und kein Boolean: bei mehreren Alternativen wäre "alle an"
   * dasselbe Übereinanderlegen, nur zwischen den Alternativen.
   *
   * FEEDBACK 2026-08-06 (zweiter Durchgang): die Wahl liegt nicht mehr LOKAL in
   * dieser View, sondern im geteilten routeViewContext — beim Wechsel auf
   * „Heute" bleibt dieselbe Route gewählt und wird dort Etappe für Etappe
   * aufgeschlagen. Die Klemme gegen verschwundene Alternativen sitzt im
   * Provider, hier wird nur noch gelesen.
   */
  const { shownAltIndex, showAlt } = useRouteView();
  /** Touch-Zweischritt (AC 6): erster Tipp "bewaffnet" den Pin (Mini-Chip). */
  const [armedPlaceId, setArmedPlaceId] = useState<string | null>(null);
  /** Gesetzt in onPointerDown, gelesen im onClick — unterscheidet Touch. */
  const lastPointerType = useRef<string>('');
  // Record statt JS-Map: `Map` ist in diesem Modul die Kartenkomponente.
  const cardRefs = useRef<Record<number, HTMLButtonElement | undefined>>({});

  const legsById = useMemo(
    () => buildLegsById(snapshot.library.legs),
    [snapshot.library.legs],
  );

  const main = assessment.mainRoute;

  const islandName = (id: string) =>
    snapshot.library.islands.find((i) => i.id === id)?.name ?? id;

  /**
   * Die wählbaren Alternativen mit ihrer EINEN Identität (altRoutes.ts) —
   * derselbe Name, den der Optionsraum und die Tagesansicht verwenden.
   */
  const altChoices = useMemo(
    () => altRouteViews(assessment, islandName),
    // islandName hängt allein an der Bibliothek.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assessment, snapshot.library.islands],
  );

  /** Die eingeblendete Alternative — oder null für die Hauptroute. */
  const shownChoice = altRouteAt(altChoices, shownAltIndex);
  const shownAlt = shownChoice?.plan ?? null;
  const shownAltColor = shownChoice?.color ?? null;

  /**
   * Die Route, die die Karte ZEIGT — Hauptroute oder eingeblendete Alternative.
   * Alles Routenbezogene hängt hieran (Linien, Etappennummern, Etappenliste,
   * Kontextmenge der Pins und Windfiedern), damit die Karte nie eine Route
   * zeichnet und die Nummern oder die Liste einer anderen dazu.
   */
  const displayRouteStages = useMemo(
    () => (shownAlt ? shownAlt.stages : (main?.stages ?? [])),
    [shownAlt, main],
  );
  /** Die Segeltage der GEZEIGTEN Route — Linien, Nummern, Liste, Sync. */
  const displayStages = useMemo(
    () => displayRouteStages.filter((s) => s.kind === 'stage'),
    [displayRouteStages],
  );

  // FR1: only the current island and today's target carry an ampel marker.
  const todayStage = displayRouteStages.find((s) => s.day === day) ?? null;
  const ampelIslands = useMemo(() => {
    const ids = new Set<string>();
    if (assessment.currentIslandId) ids.add(assessment.currentIslandId);
    if (todayStage) ids.add(todayStage.toIslandId);
    return ids;
  }, [assessment.currentIslandId, todayStage]);

  // Kontextmenge der Karte (Feedback 2026-08-05, "gleiches Prinzip für die
  // Kartendarstellung"): nur die Inseln, die der Round-Trip anfährt, plus die
  // aktuelle Position. Plätze abseits davon sind kein Besprechungsbild,
  // sondern Rauschen — sie bekommen weder Pin noch Windfieder. Die Menge
  // besteht aus Assessment-Werten (AD-2: hier wird nichts gerechnet).
  // Sie folgt der GEZEIGTEN Route: eine eingeblendete Alternative läuft
  // womöglich über Inseln, die die Hauptroute nicht anfährt — ohne Pin und ohne
  // Windfieder wäre dort nur eine Linie ins Leere.
  const planIslands = useMemo(() => {
    const ids = new Set<string>();
    if (assessment.currentIslandId) ids.add(assessment.currentIslandId);
    for (const st of displayRouteStages) ids.add(st.toIslandId);
    return ids;
  }, [assessment.currentIslandId, displayRouteStages]);
  const contextPlaces = useMemo(
    () => snapshot.library.places.filter((p) => planIslands.has(p.islandId)),
    [snapshot.library.places, planIslands],
  );

  const nowIdx = useMemo(() => hourIndexAt(Date.now(), snapshot.times), [snapshot.times]);

  /**
   * Wendetag der GEZEIGTEN Route — Domänenwert (AD-2), hier nur gelesen. Null
   * ohne Segeltage; dann ist alles Hinweg-Farbe, und die Legende lässt den
   * Wende-Hinweis weg statt einen zu erfinden. Blendet eine Alternative die
   * Hauptroute aus, nennt die Legende deren Wende — nie die der verborgenen.
   */
  const turnDay = (shownAlt ?? main)?.turnDay ?? null;
  const turnIsland =
    turnDay === null
      ? null
      : (displayStages.find((s) => s.day === turnDay)?.toIslandId ?? null);
  const isRueckweg = (stageDay: number) => turnDay !== null && stageDay > turnDay;

  const endMarkers = useMemo(
    () => stageEndMarkers(displayStages, legsById, snapshot),
    [displayStages, legsById, snapshot],
  );

  /** Inseln, über die die gezeigte Route führt — sie stehen vor dem Revier. */
  const routeIslands = useMemo(() => {
    const ids = new Set<string>();
    for (const s of displayRouteStages) ids.add(s.toIslandId);
    return ids;
  }, [displayRouteStages]);

  /**
   * Kandidaten für Windfiedern: der Wind der aktuellen Stunde an jedem Platz
   * mit Forecast. Welche davon die Karte zeigt, entscheidet windField.ts —
   * hier wird nur eingesammelt und gewichtet.
   */
  const barbCandidates = useMemo<BarbPoint[]>(() => {
    if (nowIdx === null) return [];
    const out: BarbPoint[] = [];
    // Nur die Kontextmenge: eine Fieder über einer Insel, die dieser Törn nicht
    // anfährt, beantwortet keine Frage, die heute gestellt wird.
    for (const place of contextPlaces) {
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
  }, [contextPlaces, snapshot.forecast, nowIdx, ampelIslands, routeIslands]);

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

  // Statuszeile am Listenkopf (AC 2): dieselbe Ableitung wie die Tagesansicht —
  // Minutentakt für die Stale-Prüfung, PPR-Hinweise nur abseits der Basis.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const staleLabel = staleForecastLabel(assessment.fetchedAtIso, nowMs, STALE_TIME_MS);
  const atBase = assessment.currentIslandId === params.baseIslandId;
  const pprHinweise = atBase ? [] : assessment.ppr.reasons;

  /** Legenden-Zeilen der Alternativen — Identität bleibt benannt (VERIFY 3). */
  const legendAlternatives = altChoices.map((choice) => ({
    key: `${choice.index}-${choice.plan.variantId}-${choice.turnIslandId}`,
    color: choice.color,
    label: `${choice.name} · Wendepunkt ${choice.turnName} · ${choice.stageCount} Etappen`,
    shown: choice.index === shownAltIndex,
  }));

  const turnLabel =
    turnDay !== null && turnIsland
      ? `Wende: ${islandName(turnIsland)} (Tag ${turnDay})`
      : null;

  /** Erster Segeltag zu einer Insel — Ziel des Pin-Tipps für den Karten-Sync. */
  const stageDayForIsland = (islandId: string): number | null =>
    displayStages.find((s) => s.toIslandId === islandId)?.day ?? null;

  /** Pin-Tipp (Touch, Schritt 1): Karte des Tages hervorheben + heranscrollen. */
  const syncCardForIsland = (islandId: string) => {
    const stageDay = stageDayForIsland(islandId);
    if (stageDay !== null) {
      setSelectedDay(stageDay);
      cardRefs.current[stageDay]?.scrollIntoView({ block: 'nearest' });
    }
  };

  /**
   * Die Etappenliste zeigt die GEZEIGTE Route (Skipper 2026-08-06): sie stand
   * fest auf der Hauptroute, während die Karte darüber eine Alternative
   * zeichnete — Bild und Liste behaupteten zwei verschiedene Törns. Jetzt sagen
   * beide dasselbe, und die Liste ist der Ort, an dem sich eine Alternative
   * Etappe für Etappe lesen lässt, ohne sie zu übernehmen.
   */
  const stagesByDay = useMemo(
    () => [...displayRouteStages].sort((a, b) => a.day - b.day),
    [displayRouteStages],
  );

  const itinerary = (
    <div className={`map-itinerary${sheetOpen ? ' open' : ''}`}>
      <button
        type="button"
        className="drag-handle"
        aria-expanded={sheetOpen}
        aria-label={sheetOpen ? 'Etappenliste einklappen' : 'Etappenliste ausklappen'}
        onClick={() => setSheetOpen((o) => !o)}
      >
        <span className="bar" aria-hidden="true" />
      </button>
      <TripStatusLine
        assessment={assessment}
        main={main}
        pprHinweise={pprHinweise}
        staleLabel={staleLabel}
      />
      {/* Der Kopf toggelt das Sheet mit (AC 1) — der Handle-Button ist das
          zugängliche Steuerelement, der Kopf nur die grössere Tippfläche.
          ≥861px ist das Sheet inert (Media Query), der Klick wirkungslos. */}
      <div className="sheet-head" onClick={() => setSheetOpen((o) => !o)}>
        <h2 className="section-title">
          {shownChoice ? 'Etappen der Alternative' : 'Etappen'}
        </h2>
        <span className="trip-caption">
          {formatTripRange(params.tripStartDate, params.tripLengthDays)} ·{' '}
          {params.tripLengthDays} Tage
        </span>
      </div>

      {/* Die Liste zeigt die gezeigte Route — steht eine Alternative im Bild,
          sagt die Zeile es, samt Herkunft und dem Weg zur ausführlichen
          Betrachtung Tag für Tag. */}
      {shownChoice && (
        <div className="alt-lead" style={{ borderLeftColor: shownChoice.color }}>
          <div className="alt-lead-name">
            <span className="alt-farbe" style={{ background: shownChoice.color }} />
            {shownChoice.name}
          </div>
          <div className="beschreibung">{shownChoice.herkunft}</div>
          <div className="alt-lead-actions">
            {onOpenDay && (
              <button type="button" className="btn-secondary" onClick={onOpenDay}>
                Etappen in der Heute-Ansicht öffnen
              </button>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => showAlt(null)}
            >
              Zurück zur Hauptroute
            </button>
          </div>
        </div>
      )}

      {!main && !shownChoice && (
        <div className="hint-panel">
          Noch keine Hauptroute — in der Tagesansicht den Vorschlag übernehmen.
        </div>
      )}

      <div className="itin-list">
        {/* Chronologisch VERSCHRÄNKT (Segel- und Hafentage in Tagesfolge) —
            das Sheet liest sich wie der Törn, nicht wie zwei Listen. */}
        {stagesByDay.map((stage) => {
          if (stage.kind === 'harbour') {
            return (
              <button
                key={`harbour-${stage.day}`}
                type="button"
                className="harbour-row"
                aria-pressed={selectedDay === stage.day}
                onMouseEnter={() => setHoverDay(stage.day)}
                onMouseLeave={() => setHoverDay(null)}
                onFocus={() => setHoverDay(stage.day)}
                onBlur={() => setHoverDay(null)}
                onClick={() =>
                  setSelectedDay((d) => (d === stage.day ? null : stage.day))
                }
              >
                <span className="hd">Tag {stage.day}</span>
                <span>
                  Hafentag: {islandWithPlace(snapshot, stage.toIslandId, stage.placeId)}
                </span>
              </button>
            );
          }
          const isPast = stage.day < day;
          const firstLeg0 = stage.legs[0];
          const firstLeg = firstLeg0
            ? (firstLeg0.sailedLeg ?? legsById[firstLeg0.legId])
            : undefined;
          const fromIsland = firstLeg ? islandName(firstLeg.fromIslandId) : null;
          const totalHours = stage.legs.reduce((s, l) => s + (l.totalHours ?? 0), 0);
          const lastLeg = stage.legs[stage.legs.length - 1];
          const lastEta =
            lastLeg?.pointPassages[lastLeg.pointPassages.length - 1]?.etaIso ?? null;
          return (
            <button
              key={stage.day}
              type="button"
              ref={(el) => {
                cardRefs.current[stage.day] = el ?? undefined;
              }}
              className={`itin-card${isPast ? ' past' : ''}`}
              aria-pressed={selectedDay === stage.day}
              onMouseEnter={() => setHoverDay(stage.day)}
              onMouseLeave={() => setHoverDay(null)}
              onFocus={() => setHoverDay(stage.day)}
              onBlur={() => setHoverDay(null)}
              onClick={() =>
                setSelectedDay((d) => (d === stage.day ? null : stage.day))
              }
            >
              <div className="itin-top">
                <div>
                  <div className="itin-day">
                    Tag {stage.day} · {formatTripDayShort(params.tripStartDate, stage.day)}
                    {stage.day === day && ' · heute'}
                    {isPast && ' · gefahren'}
                  </div>
                  <div className="itin-route">
                    {fromIsland ? `${fromIsland} → ` : ''}
                    {islandName(stage.toIslandId)}
                  </div>
                  <div className="itin-meta">
                    {formatHours(totalHours || null)}
                    {lastEta && <> · an {formatAthensTime(lastEta)}</>}
                    {stage.pinned && (
                      <>
                        {' '}
                        <span className="chip">Festgelegt</span>
                      </>
                    )}
                  </div>
                  {/* Kreuz/Halbwind des Tages — dieselbe Meldung wie in der
                      Tagesansicht, damit die Liste hier nicht harmloser aussieht
                      als die Etappenkarte, die sie zusammenfasst. */}
                  {stage.kursAbschnitte.length > 0 && (
                    <div className="kurs-liste">
                      {stage.kursAbschnitte.map((a) => (
                        <span
                          key={a.kategorie}
                          className={`ampel ampel-${a.ampel} kurs-zeile kurs-mini`}
                          title={formatKursAmpelRegel(a.kategorie, params)}
                        >
                          <span className="dot" />
                          {formatKursAbschnitt(a)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <AmpelBadge ampel={stage.ampel} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="map-view">
      <h1 className="visually-hidden">Karte</h1>
      <div className="map-split">
        {itinerary}
        <div className="map-sticky">
          {MAPS_ENV.ok ? (
            <APIProvider apiKey={MAPS_ENV.env.apiKey}>
              <Map
                className="map-container"
                mapId={MAPS_ENV.env.mapId}
                defaultCenter={REVIER_CENTER}
                defaultZoom={8}
                mapTypeId="hybrid"
                gestureHandling="greedy"
                onClick={() => setArmedPlaceId(null)}
              >
                {/* Seezeichen UNTER allem Eigenen: overlayMapTypes liegen per
                    Google-Maps-Architektur immer unter Markern und Polylinien —
                    die Ebene kann Route und Ampeln nie zudecken. */}
                {showSeamarks && <SeamarkLayer />}

                {/* Eingeblendete Alternative — ANSTELLE der Hauptroute
                    (Feedback 2026-08-06), gestrichelt in ihrer Identitätsfarbe
                    und mit Fahrtrichtungspfeilen, weil die EINE Farbe der
                    Alternative Hin- und Rückweg nicht trennen kann. Kein
                    Übereinanderlegen mehr: die Hauptroute ist so lange
                    ausgeblendet, und deshalb trägt die Linie hier auch die
                    Strichstärke und den zIndex einer Route, nicht die eines
                    Overlays darunter. */}
                {shownAlt &&
                  displayStages.map((stage) => {
                    const path = stagePath(stage, legsById, snapshot);
                    if (path.length < 2) return null;
                    return (
                      <Polyline
                        key={`alt-${shownAlt.variantId}-${shownAlt.turnIslandId}-${stage.day}`}
                        path={path}
                        strokeColor={shownAltColor!}
                        dashed
                        directionArrows
                        strokeWeight={activeDay === stage.day ? 6 : 4}
                        zIndex={activeDay === stage.day ? 60 : 20}
                      />
                    );
                  })}

                {/* FR2 — round-trip overlay: Hinweg und Rückweg in ihren Farben,
                    gefahren durchgezogen, geplant gestrichelt, Pfeile in
                    Fahrtrichtung. One polyline per stage, so a single stage can
                    be highlighted on hover. Der Rückweg liegt ÜBER dem Hinweg
                    und um die halbe Strichperiode versetzt: wo beide dieselbe
                    Etappe nutzen, scheint der Hinweg durch die Lücken der oberen
                    Strichelung — der gemeinsame Abschnitt zeigt beide Farben im
                    Wechsel statt nur der zuletzt gezeichneten (Polyline.tsx,
                    dashOffset).

                    Ausgeblendet, solange eine Alternative gezeigt wird: zwei
                    Routen im selben Bild waren nicht mehr auseinanderzuhalten. */}
                {!shownAlt &&
                  displayStages.map((stage) => {
                    const path = stagePath(stage, legsById, snapshot);
                    if (path.length < 2) return null;
                    const isPast = stage.day < day;
                    const rueck = isRueckweg(stage.day);
                    return (
                      <Polyline
                        key={`line-${stage.day}`}
                        path={path}
                        strokeColor={rueck ? RUECK_LINE_COLOR : HIN_LINE_COLOR}
                        dashed={!isPast}
                        dashOffset={rueck ? '9px' : undefined}
                        directionArrows
                        // Kräftiger als bisher: über dem Satellitenbild geht
                        // eine 3-px-Linie im Blau der Ägäis unter (dazu der
                        // helle Saum in Polyline.tsx).
                        strokeWeight={activeDay === stage.day ? 6 : 4}
                        zIndex={activeDay === stage.day ? 60 : rueck ? 21 : 20}
                      />
                    );
                  })}

                {/* FR2 — Etappennummern am Tagesziel, EINE Markierung je Insel.
                    Der Round-Trip läuft hin und zurück über dieselbe Kette; je
                    Etappe eine Markierung hiesse, dass die Rücktour die Hintour
                    zudeckt und die Karte nur noch die halbe Reise zeigt.
                    Kapseln sind tastaturbedienbar (AC 7): Enter/Space/Klick
                    öffnet das Platzdetail des ersten Anlaufs (endPlaceId).

                    Sie zählen die GEZEIGTE Route: bei eingeblendeter
                    Alternative deren Etappen, in deren Farbe — Nummern der
                    ausgeblendeten Hauptroute an einer Alternativ-Linie wären
                    eine zweite, unsichtbare Behauptung. */}
                {endMarkers.map((marker) => {
                  const active = marker.stops.some((s) => s.day === activeDay);
                  const allPast = marker.stops.every((s) => s.day < day);
                  const label = `${shownAlt ? 'Alternative — ' : ''}${islandName(marker.islandId)} — ${marker.stops
                    .map(
                      (s) =>
                        `Etappe ${s.stageNumber ?? '–'} (Tag ${s.day})${s.day === day ? ', heute' : ''}`,
                    )
                    .join(', ')}`;
                  const endPlaceId = marker.endPlaceId;
                  return (
                    <AdvancedMarker
                      key={marker.key}
                      position={marker.position}
                      zIndex={active ? 120 : 70}
                    >
                      <div
                        className="marker-hit"
                        {...(endPlaceId
                          ? {
                              role: 'button',
                              tabIndex: 0,
                              'aria-label': label,
                              onKeyDown: (e: React.KeyboardEvent) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  onOpenPlace(endPlaceId);
                                }
                              },
                              onClick: () => onOpenPlace(endPlaceId),
                            }
                          : { 'aria-label': label })}
                        onMouseEnter={() => setHoverDay(marker.stops[0]!.day)}
                        onMouseLeave={() => setHoverDay(null)}
                        onFocus={() => setHoverDay(marker.stops[0]!.day)}
                        onBlur={() => setHoverDay(null)}
                      >
                        <span
                          className={`stage-capsule${active ? ' highlight' : ''}${allPast ? ' past' : ''}`}
                          style={
                            shownAltColor
                              ? { background: shownAltColor, color: COLORS.onAccent }
                              : undefined
                          }
                          aria-hidden="true"
                        >
                          {marker.label}
                        </span>
                      </div>
                    </AdvancedMarker>
                  );
                })}

                {/* Places along the plan only; ampel colour where
                    decision-relevant. Pins sind Buttons (AC 6): Enter/Space und
                    Mausklick öffnen direkt; Touch braucht zwei Tipps — der
                    erste hebt die Etappen-Karte hervor und zeigt den Mini-Chip
                    mit dem Ampel-Wort, der zweite öffnet. */}
                {contextPlaces.map((place) => {
                  const relevant = ampelIslands.has(place.islandId);
                  const ampel =
                    assessment.nightAmpeln[place.id]?.[day]?.ampel ?? 'unbewertet';
                  const armed = armedPlaceId === place.id;
                  return (
                    <AdvancedMarker
                      key={place.id}
                      position={{
                        lat: place.coordinates.lat,
                        lng: place.coordinates.lon,
                      }}
                      // Bewaffneter Pin über dem Bootsmarker (90): sein
                      // Mini-Chip darf nie verdeckt werden (AC 8).
                      zIndex={armed ? 100 : relevant ? 50 : 30}
                    >
                      <div
                        className="marker-hit"
                        role="button"
                        tabIndex={0}
                        aria-label={`${place.name} — ${AMPEL_LABEL[ampel]}`}
                        onPointerDown={(e) => {
                          lastPointerType.current = e.pointerType;
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onOpenPlace(place.id);
                          }
                        }}
                        onClick={() => {
                          if (lastPointerType.current === 'touch' && !armed) {
                            // Schritt 1: bewaffnen — Karte synchronisieren,
                            // Mini-Chip zeigen. Ein anderer Pin re-armiert.
                            setArmedPlaceId(place.id);
                            syncCardForIsland(place.islandId);
                            return;
                          }
                          onOpenPlace(place.id); // Maus / Tastatur / zweiter Tipp
                        }}
                      >
                        <div
                          className={relevant ? 'marker-pin' : 'marker-pin muted'}
                          style={{ background: AMPEL_GRAPHIC_HEX[ampel] }}
                        />
                        {armed && (
                          <span className="marker-chip" aria-hidden="true">
                            {place.name} · {AMPEL_LABEL[ampel]}
                          </span>
                        )}
                      </div>
                    </AdvancedMarker>
                  );
                })}

                {/* Bootsposition (AC 8): Akzent-Punkt mit Halo — Blickanker,
                    nicht interaktiv. Über den Pins (zIndex 90), unter einem
                    bewaffneten Pin (100). */}
                {snapshot.trip.position && (
                  <AdvancedMarker
                    position={{
                      lat: snapshot.trip.position.lat,
                      lng: snapshot.trip.position.lon,
                    }}
                    zIndex={90}
                  >
                    <div className="boat-marker" role="img" aria-label="Bootsposition">
                      <span
                        className="halo"
                        style={{ background: COLORS.accent }}
                      />
                      <span
                        className="core"
                        style={{ background: COLORS.accent }}
                      />
                    </div>
                  </AdvancedMarker>
                )}

                {/* FR3 — Windfiedern in der Notation der Wetterkarte. Anders als
                    der frühere Pfeil zeigt der Schaft dorthin, WOHER der Wind
                    kommt (AD-6), nicht wohin er weht. Gezeigt werden nur die
                    Plätze der Kontextmenge (Plan-Inseln plus aktuelle Position);
                    wie viele davon die Karte verträgt, entscheidet windField.ts
                    — eine je Insel, danach Mindestabstand auf dem Schirm. */}
                {showWind && (
                  <WindLayer
                    points={barbCandidates}
                    islandOf={islandOfPlace}
                    onCount={onWindCount}
                  />
                )}
              </Map>

              <div className="layer-chips">
                <div className="chip-row">
                  <button
                    type="button"
                    className="layer-chip"
                    aria-pressed={showWind}
                    onClick={() => setShowWind((v) => !v)}
                  >
                    Windfiedern
                  </button>
                  {/* EIN Chip für die Routenwahl statt einer Chip-Reihe: er
                      nennt die gezeigte Route und öffnet die Liste
                      (AltRouteMenu). */}
                  {altChoices.length > 0 && (
                    <AltRouteMenu
                      alternatives={altChoices}
                      shownIndex={shownAltIndex}
                      onPick={showAlt}
                    />
                  )}
                  <button
                    type="button"
                    className="layer-chip"
                    aria-pressed={showSeamarks}
                    onClick={() => setShowSeamarks((v) => !v)}
                  >
                    Seezeichen
                  </button>
                </div>
                {/* Keine stille Ersetzung: solange eine Alternative gezeigt
                    wird, sagt die Karte in einer Zeile, dass die Hauptroute
                    fehlt — welche Alternative es ist, steht im Chip daneben.
                    Der Verweis auf die Heute-Ansicht steht HIER, weil hier die
                    Frage aufkommt: „schön, aber taugt die Route?" — beantwortet
                    wird sie an den einzelnen Etappen. Leer = kein Kasten
                    (CSS :empty). */}
                <p className="alt-note" aria-live="polite">
                  {shownAlt ? 'Hauptroute ausgeblendet' : ''}
                </p>
                {shownAlt && onOpenDay && (
                  <button type="button" className="alt-note as-link" onClick={onOpenDay}>
                    Etappen dieser Route in der Heute-Ansicht ansehen ›
                  </button>
                )}
              </div>
              {/* CC-BY-SA verlangt SICHTBARE Attribution, solange die Ebene an
                  ist — der volle Satz steht zusätzlich in der Legende. */}
              {showSeamarks && (
                <span className="map-attrib">
                  ©{' '}
                  <a
                    href="https://www.openseamap.org"
                    target="_blank"
                    rel="noreferrer"
                  >
                    OpenSeaMap
                  </a>{' '}
                  (CC-BY-SA)
                </span>
              )}
              <LegendPopover
                restTripAmpel={assessment.restTripAmpel}
                turnLabel={turnLabel}
                windCount={windCount}
                alternatives={legendAlternatives}
              />
            </APIProvider>
          ) : (
            <div className="hint-panel" style={{ height: '100%' }}>
              <h2>Karte nicht verfügbar.</h2>
              <p>
                Es fehlt:{' '}
                {MAPS_ENV.missing.map((name, i) => (
                  <span key={name}>
                    {i > 0 && ', '}
                    <code>{name}</code>
                  </span>
                ))}
                . Trage sie in deine <code>.env</code> ein (siehe{' '}
                <code>.env.example</code> und README) und lade die Seite neu.
                Alle Bewertungen sind weiter in der Tagesansicht verfügbar.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
