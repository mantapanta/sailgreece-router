/**
 * AD-3 / AD-7 — composition of the one snapshot query family.
 * All async data flows through TanStack Query (staleTime ~1 h = FR13 TTL);
 * every view reads from this ONE snapshot — no second forecast query past
 * the engine. The assessment is a pure recomputation per snapshot.
 *
 * `usePlanningEngine` is instantiated EXACTLY ONCE by <PlanningProvider>
 * (planningContext.tsx) — components consume the shared result via
 * `usePlanning()` so the full option/PPR search never runs twice per render.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadLibraryBundle } from '../adapters/firestore.ts';
import {
  collectLocations,
  fetchForecastBundle,
  OHNE_FORECAST,
  type ForecastBundle,
} from '../adapters/openMeteo.ts';
import { assessPlanning } from '../domain/assess.ts';
import { ROUTENBERATUNG } from '../domain/features.ts';
import { isLateDeparture } from '../domain/scoring.ts';
import {
  emptyManualPlan,
  setDayStopover,
  setDayTarget,
  type DayTarget,
} from '../domain/manualPlan.ts';
import {
  completePlan,
  planKey,
  planWithStopover,
  planWithoutStopover,
  type Pin,
} from '../domain/solver.ts';
import {
  klemmeKonzeptSchwellen,
  withKonzeptSchwellen,
  type KonzeptSchwellen,
} from '../domain/konzept.ts';
import type { Assessment, PlanningSnapshot } from '../domain/schema/snapshot.ts';
import { DEFAULT_PARAMS, type Params } from '../domain/schema/params.ts';
import { islandAtEndOfDay, planOutdated, type Plan } from '../domain/schema/plan.ts';
import { useTrip, deriveCurrentDay } from './tripContext.tsx';

export const STALE_TIME_MS = 3600_000; // ~1 h (FR13)

/** Cheap stable hash (djb2) over the normative location set of the library. */
function libraryLocationsHash(keys: string[]): string {
  let h = 5381;
  const s = keys.join('|');
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

/**
 * ALLE Parameter, die das Forecast-ERGEBNIS verändern — der Datenteil des
 * Cache-Keys. Als eigene Funktion, damit er nicht auseinanderläuft, wenn ein
 * Modell dazukommt.
 *
 * `forecastDays` gehörte schon vor dem Hybrid hierher: das Parameter-Dokument
 * wird ohne Redeploy editiert (AD-8), und ohne den Wert im Key blieb die Achse
 * nach einer Änderung stumm auf der alten Länge, bis die TTL ablief.
 */
export function forecastCacheKey(p: Params): string {
  return [
    `${p.forecastModelNear}>${p.forecastModel}`,
    `${p.waveModelNear}>${p.waveModel}`,
    p.forecastDays,
  ].join('|');
}

export function usePlanningEngine() {
  const { state: trip, dispatch } = useTrip();

  const libraryQuery = useQuery({
    queryKey: ['library'],
    queryFn: loadLibraryBundle,
    staleTime: STALE_TIME_MS,
  });

  const bundle = libraryQuery.data;

  /**
   * Die Bibliothek DIESES Geräts: kuratierte Etappen plus die vom Skipper
   * erzeugten Direktrouten (FR28 Zwischenstopp löschen). EIN Einfügepunkt,
   * damit Plan-Auflösung, Karte, Reichweite und Forecast-Abruf dieselbe
   * Etappenmenge sehen. Kuratierte Etappen gewinnen bei gleicher Id
   * (first-writer-wins in legIndex) — liefert die Kuration die Verbindung
   * später nach, ersetzt sie die erzeugte stillschweigend.
   */
  const library = useMemo(() => {
    if (!bundle) return null;
    if (trip.customLegs.length === 0) return bundle.library;
    return { ...bundle.library, legs: [...bundle.library.legs, ...trip.customLegs] };
  }, [bundle, trip.customLegs]);

  // The forecast cache key must change when the LIBRARY changes: a new place
  // or waypoint enlarges the normative location set (AD-3) — without the hash
  // the stale cached response would leave new locations 'unbewertet'. Das
  // schliesst erzeugte Direktrouten ein: ihre Umfahrungspunkte werden wie
  // kuratierte Wegpunkte abgerufen, nicht geliehen.
  const libHash = useMemo(
    () =>
      library
        ? libraryLocationsHash(
            collectLocations(library).map(
              (l) => `${l.key}@${l.coordinates.lat},${l.coordinates.lon}`,
            ),
          )
        : null,
    [library],
  );

  const forecastQuery = useQuery({
    queryKey: ['forecast', bundle ? forecastCacheKey(bundle.params) : null, libHash],
    queryFn: () => fetchForecastBundle(library!, bundle!.params),
    enabled: !!bundle && !!library,
    staleTime: STALE_TIME_MS,
    refetchInterval: STALE_TIME_MS,
  });

  /**
   * DER FORECAST DIESES LAUFS — oder der windfreie Stand.
   *
   * Solange der Abruf läuft, ist das null und die App zeigt ihr Skelett. Ist er
   * GESCHEITERT, tritt `OHNE_FORECAST` an seine Stelle (adapters/openMeteo.ts):
   * eine leere Achse, aus der die Bewertung lauter 'unbewertet' macht — und der
   * Törn bleibt planbar. Vorher blieb `snapshot` in diesem Fall null, und mit
   * ihm verschwand die ganze Planung hinter dem Fehlerpanel; Inseln, Etappen
   * und Distanzen hängen aber an der Bibliothek, nicht am Wetter.
   *
   * Ein noch im Cache liegender ECHTER Datenstand gewinnt immer (`data` steht
   * vor dem Ersatz): ein Forecast von vor zwei Stunden ist besser als keiner,
   * und genau das sagt das Fehlerpanel dann auch.
   */
  const forecast: ForecastBundle | null =
    forecastQuery.data ?? (forecastQuery.isError ? OHNE_FORECAST : null);

  /**
   * Die Parameter der Bibliothek, überschrieben von den Konzept-Reglern des
   * Skippers (domain/konzept.ts). EIN Einfügepunkt, damit Solver, Optionsraum,
   * Konzept-Panel und Karte dieselben Schwellen sehen — "ab wie viel Wind rät
   * die App ab?" darf nirgends anders beantwortet werden als hier (AD-3).
   */
  const params = useMemo(
    () => (bundle ? withKonzeptSchwellen(bundle.params, trip.konzeptSchwellen) : null),
    [bundle, trip.konzeptSchwellen],
  );

  // Persisted overrides may stem from an older trip frame: clamp to
  // [1, tripLengthDays] so the engine never sees a day off the axis.
  const tripLengthDays = bundle?.params.tripLengthDays ?? DEFAULT_PARAMS.tripLengthDays;
  const currentDay =
    trip.currentDayOverride !== null
      ? Math.min(Math.max(trip.currentDayOverride, 1), tripLengthDays)
      : deriveCurrentDay(bundle?.params.tripStartDate, tripLengthDays);

  const snapshot: PlanningSnapshot | null = useMemo(() => {
    if (!bundle || !library || !params || !forecast) return null;
    return {
      ...forecast,
      library,
      polar: bundle.polar,
      params,
      trip: {
        currentDay,
        position: trip.position,
        plan: trip.plan,
        departureHourByDay: trip.departureHourByDay,
        // Leer: die Empfehlungen rechnet die Bewertung selbst und legt sie in
        // ihren eigenen Snapshot (assess.withAbfahrtsempfehlungen). Sie hier
        // vorzubelegen hiesse, sie zweimal zu haben.
        empfohleneAbfahrtByDay: {},
        stopHoursByDay: trip.stopHoursByDay,
      },
    };
  }, [
    bundle,
    library,
    params,
    forecast,
    currentDay,
    trip.position,
    trip.plan,
    trip.departureHourByDay,
    trip.stopHoursByDay,
  ]);

  const assessment: Assessment | null = useMemo(
    () =>
      snapshot ? assessPlanning(snapshot, { routenberatung: ROUTENBERATUNG }) : null,
    [snapshot],
  );

  /**
   * Der EINE plan-ändernde Reflex beim ersten Start (AD-12): es muss ein Plan
   * dastehen, den der Skipper füllen kann.
   *
   * OHNE ROUTENBERATUNG ist das der LEERE Törn — jeder Tag ein Hafentag an der
   * Basis, nichts entschieden (`manualPlan.emptyManualPlan`). Vorher stand
   * hier der Vorschlag des Solvers; ein Vorschlag ist aber genau die
   * Empfehlung, die der Skipper nicht mehr will. Im Reducer ebenfalls
   * abgesichert, damit ein unlesbarer gespeicherter Plan nie stillschweigend
   * ersetzt wird.
   */
  const erstPlan = useMemo(
    () =>
      ROUTENBERATUNG
        ? (assessment?.proposal?.plan ?? null)
        : params
          ? emptyManualPlan(params)
          : null,
    [assessment?.proposal, params],
  );
  useEffect(() => {
    if (!trip.plan && !trip.planUnreadable && erstPlan) {
      dispatch({ type: 'ADOPT_INITIAL', plan: erstPlan });
    }
  }, [trip.plan, trip.planUnreadable, erstPlan, dispatch]);

  /** Current skipper pins, read off the persisted plan. */
  const pins: Pin[] = useMemo(
    () =>
      (trip.plan?.days ?? [])
        .filter((d) => d.source === 'skipper')
        .map((d) => ({
          day: d.day,
          toIslandId: d.kind === 'stage' ? d.toIslandId : null,
          toPlaceId: d.kind === 'stage' ? d.toPlaceId : d.placeId,
        })),
    [trip.plan],
  );

  /**
   * Die ZWEITE plan-ändernde Reaktion auf eine Bewertung, so eng gefasst wie
   * die erste: ein gespeicherter Plan von einem älteren Solver-Stand
   * (planOutdated) wird VOR Törnbeginn automatisch durch den aktuellen
   * Vorschlag ersetzt (Skipper-Entscheid 2026-08-05). Ohne den Stempel
   * überlebte ein Plan des alten Solvers jeden Redeploy — die Fixes waren
   * deployed und blieben trotzdem unsichtbar, weil die Hauptroute nie neu
   * berechnet wird. Läuft der Törn schon oder sind Pins gesetzt, bleibt der
   * Plan stehen und die DayView bietet die Neuberechnung sichtbar an.
   */
  useEffect(() => {
    if (
      // Ohne Routenberatung gibt es keinen Vorschlag, durch den ersetzt werden
      // könnte — der Plan gehört dem Skipper, veraltet ist er nie.
      ROUTENBERATUNG &&
      trip.plan &&
      planOutdated(trip.plan) &&
      currentDay === 1 &&
      pins.length === 0 &&
      assessment?.proposal &&
      planKey(assessment.proposal.plan) !== planKey(trip.plan)
    ) {
      dispatch({ type: 'REFRESH_OUTDATED', plan: assessment.proposal.plan });
    }
  }, [trip.plan, currentDay, pins, assessment?.proposal, dispatch]);

  /**
   * Späte Abfahrt (Übernahme-Fenster 14–17 Uhr) gilt nur an Törntag 1
   * (scoring.departureHourForDay). Die Rechnung ignoriert eine späte Wahl an
   * anderen Tagen ohnehin — hier wird zusätzlich der PERSISTIERTE Wert
   * gelöst, damit Auswahl und Zustand nicht auseinanderlaufen (das
   * Abfahrt-Menü kennt 14–17 nur an Tag 1).
   */
  useEffect(() => {
    for (const [key, hour] of Object.entries(trip.departureHourByDay)) {
      const day = Number(key);
      if (day !== 1 && isLateDeparture(hour)) {
        dispatch({ type: 'SET_DEPARTURE_HOUR', day, hour: null });
      }
    }
  }, [trip.departureHourByDay, dispatch]);

  /**
   * FR28 — the skipper sets a day's target; the rest of the trip is recomputed
   * SYNCHRONOUSLY here and dispatched as one finished plan, so pin and
   * completion always come from the same snapshot (AD-12, one mutation path).
   * Returns false when no round trip can honour the pin at all.
   *
   * DIE TAGE DAVOR BLEIBEN STEHEN. Bis 2026-08-07 band nur der geänderte Tag,
   * und der Solver legte den ganzen Törn ab der aktuellen Position neu — wer
   * Tag 5 änderte, bekam womöglich auch einen anderen Tag 2. Der Skipper dazu:
   * „es gibt ja eine Route, die bis dahin festgelegt ist und das neue Leg
   * funktioniert auch, es gibt keinen Sinn nach hinten zu verändern."
   *
   * Sie werden GEHALTEN, nicht festgelegt (`Pin.gehalten`): die Suche darf sie
   * nicht verschieben, aber sie erscheinen hinterher nicht als Entscheidungen
   * des Skippers, die er einzeln wieder lösen müsste. Echte Pins gewinnen —
   * für einen Tag, den er selbst gesetzt hat, wird kein Halte-Pin ergänzt.
   */
  const editStage = useCallback(
    (day: number, toIslandId: string | null, toPlaceId?: string): boolean => {
      if (!snapshot || !assessment?.currentIslandId) return false;
      const gehalten: Pin[] = [];
      if (trip.plan) {
        for (let d = snapshot.trip.currentDay; d < day; d++) {
          if (pins.some((p) => p.day === d)) continue;
          const island = islandAtEndOfDay(trip.plan, d);
          // Ein Hafentag wird als "endet auf dieser Insel" gehalten — das
          // lässt ihn Hafentag bleiben, ohne ihn dazu zu zwingen.
          if (island) gehalten.push({ day: d, toIslandId: island, gehalten: true });
        }
      }
      const nextPins: Pin[] = [
        ...pins.filter((p) => p.day !== day),
        { day, toIslandId, toPlaceId },
        ...gehalten,
      ];
      const solved = completePlan(snapshot, assessment.currentIslandId, nextPins);
      if (!solved) return false;
      dispatch({ type: 'EDIT_STAGE', plan: solved.plan });
      return true;
    },
    [snapshot, assessment?.currentIslandId, pins, trip.plan, dispatch],
  );

  /**
   * FR28 — den ZWISCHENSTOPP eines Tages setzen, verlegen oder löschen: EINE
   * Funktion für EINE Entscheidung ("wo halten wir unterwegs an?"). Das
   * Tagesziel bleibt in jedem Fall dasselbe, die Kette bleibt geschlossen, und
   * alle anderen Tage bleiben unberührt.
   *
   *  - `islandId` gesetzt: der Tag fährt über diese Insel, optional über deren
   *    Hafen `placeId` (solver.planWithStopover). Beide Hälften kommen aus der
   *    Bibliothek — für einen Stopp wird nichts erfunden.
   *  - `islandId === null`: der Tag wird zur EINEN direkten Etappe
   *    (solver.planWithoutStopover). Kennt die Bibliothek keine direkte
   *    Verbindung, wird sie dort landfrei ERZEUGT.
   *
   * Erzeugte Etappen werden zusammen mit dem Plan als EIN Payload persistiert
   * (SET_STOPOVER) — nie ein Plan ohne seine Etappe. False heisst: diese
   * Änderung ist nicht darstellbar (kein landfreier Kurs, keine Verbindung der
   * Bibliothek, oder der Tag trägt gar keinen Zwischenstopp zu löschen).
   */
  const setStopover = useCallback(
    (day: number, islandId: string | null, placeId?: string): boolean => {
      if (!snapshot || !trip.plan) return false;
      const change =
        islandId === null
          ? planWithoutStopover(trip.plan, day, snapshot)
          : planWithStopover(trip.plan, day, { islandId, placeId }, snapshot);
      if (!change) return false;
      dispatch({
        type: 'SET_STOPOVER',
        plan: change.plan,
        customLegs: change.customLegs,
      });
      return true;
    },
    [snapshot, trip.plan, dispatch],
  );

  /**
   * FREIE HANDPLANUNG — das Tagesziel EINES Törntags setzen (manualPlan.ts).
   *
   * Das ist der Weg, auf dem der Plan seit 2026-08-08 entsteht: keine Suche,
   * keine Reichweite, keine Rundkurs-Bedingung. Jede Insel der Bibliothek ist
   * wählbar; fehlt die Verbindung, wird sie landfrei erzeugt und zusammen mit
   * dem Plan als EIN Payload persistiert — nie ein Plan ohne seine Etappe.
   *
   * `islandId: null` macht den Tag zum Hafentag. False heisst genau eine
   * Sache: für einen Schlag dieser Kette gibt es keinen landfreien Kurs.
   */
  const planDay = useCallback(
    (day: number, target: DayTarget): boolean => {
      if (!snapshot || !trip.plan) return false;
      const change = setDayTarget(trip.plan, day, target, snapshot);
      if (!change) return false;
      dispatch({ type: 'PLAN_DAY', plan: change.plan, customLegs: change.customLegs });
      return true;
    },
    [snapshot, trip.plan, dispatch],
  );

  /**
   * Den Zwischenstopp eines Tages setzen, verlegen oder löschen — dieselbe
   * Freiheit wie beim Tagesziel: auch die beiden Hälften eines Umwegs dürfen
   * erzeugt werden, wenn sie niemand recherchiert hat.
   */
  const planStopover = useCallback(
    (day: number, islandId: string | null, placeId?: string): boolean => {
      if (!snapshot || !trip.plan) return false;
      const change = setDayStopover(trip.plan, day, { islandId, placeId }, snapshot);
      if (!change) return false;
      dispatch({ type: 'PLAN_DAY', plan: change.plan, customLegs: change.customLegs });
      return true;
    },
    [snapshot, trip.plan, dispatch],
  );

  /** Alles verwerfen und mit dem leeren Törn neu anfangen. */
  const resetPlan = useCallback(() => {
    if (!params) return;
    dispatch({ type: 'RESET_PLAN', plan: emptyManualPlan(params) });
  }, [params, dispatch]);

  /** FR29 — adopt a proposal or alternative as the new main route. */
  const checkIn = useCallback(
    (plan: Plan) => dispatch({ type: 'CHECK_IN', plan }),
    [dispatch],
  );

  const releasePin = useCallback(
    (day: number) => dispatch({ type: 'RELEASE_PIN', day }),
    [dispatch],
  );

  /**
   * Liegezeit eines Tages setzen; null geht auf `params.stopHoursDefault`
   * zurück. Der Plan bleibt unangetastet (AD-12) — nur seine Bewertung
   * verschiebt sich, weil die Folge-Etappe später abfährt.
   */
  const setStopHours = useCallback(
    (day: number, hours: number | null) => {
      if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 12)) return;
      dispatch({ type: 'SET_STOP_HOURS', day, hours });
    },
    [dispatch],
  );

  /**
   * FR15 — Abfahrtszeit EINES Törntags setzen; `null` gibt den Tag an seinen
   * Default zurück, und der ist die Abfahrtsempfehlung ("früh los, 15:00 vor
   * Anker"), nicht mehr die pauschale Standardstunde. Der Plan bleibt
   * unangetastet (AD-12) — nur seine Bewertung startet früher oder später.
   */
  const setDepartureHour = useCallback(
    (day: number, hour: number | null) => {
      if (hour !== null && (!Number.isInteger(hour) || hour < 0 || hour > 23)) return;
      dispatch({ type: 'SET_DEPARTURE_HOUR', day, hour });
    },
    [dispatch],
  );

  /**
   * Einen Regler-Stand übernehmen; `null` setzt auf die Schwellen der
   * Bibliothek (Törnanalyse-Werte) zurück.
   *
   * Bewusst der GANZE Stand statt eines einzelnen Reglers: das Formular führt
   * die Bewegung lokal (domain `setKonzeptSchwelle`) und übergibt erst, wenn
   * die Hand still steht — jede Übergabe rechnet den Solver neu, und das ist
   * der teuerste Schritt der Bewertung. Geklemmt wird trotzdem hier nochmals:
   * kein Aufrufer kann die Invariante umgehen.
   */
  const setKonzeptSchwellen = useCallback(
    (schwellen: KonzeptSchwellen | null) =>
      dispatch({
        type: 'SET_KONZEPT_SCHWELLEN',
        schwellen: schwellen ? klemmeKonzeptSchwellen(schwellen) : null,
      }),
    [dispatch],
  );

  return {
    libraryQuery,
    forecastQuery,
    bundle: bundle ?? null,
    snapshot,
    assessment,
    currentDay,
    pins,
    planDay,
    planStopover,
    resetPlan,
    editStage,
    setStopover,
    checkIn,
    releasePin,
    setStopHours,
    setDepartureHour,
    setKonzeptSchwellen,
    /** True = die Schwellen weichen von der Bibliothek ab (Anzeige). */
    konzeptReglerVerstellt: trip.konzeptSchwellen !== null,
  };
}

export type PlanningValue = ReturnType<typeof usePlanningEngine>;
