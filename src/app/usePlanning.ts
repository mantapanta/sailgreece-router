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
import { collectLocations, fetchForecastBundle } from '../adapters/openMeteo.ts';
import { assessPlanning } from '../domain/assess.ts';
import { isLateDeparture } from '../domain/scoring.ts';
import {
  completePlan,
  planKey,
  planWithoutStopover,
  type Pin,
} from '../domain/solver.ts';
import {
  klemmeKonzeptSchwellen,
  withKonzeptSchwellen,
  type KonzeptSchwellen,
} from '../domain/konzept.ts';
import type { Assessment, PlanningSnapshot } from '../domain/schema/snapshot.ts';
import type { Params } from '../domain/schema/params.ts';
import { planOutdated, type Plan } from '../domain/schema/plan.ts';
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
  const tripLengthDays = bundle?.params.tripLengthDays ?? 12;
  const currentDay =
    trip.currentDayOverride !== null
      ? Math.min(Math.max(trip.currentDayOverride, 1), tripLengthDays)
      : deriveCurrentDay(bundle?.params.tripStartDate, tripLengthDays);

  const snapshot: PlanningSnapshot | null = useMemo(() => {
    if (!bundle || !library || !params || !forecastQuery.data) return null;
    return {
      ...forecastQuery.data,
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
    forecastQuery.data,
    currentDay,
    trip.position,
    trip.plan,
    trip.departureHourByDay,
    trip.stopHoursByDay,
  ]);

  const assessment: Assessment | null = useMemo(
    () => (snapshot ? assessPlanning(snapshot) : null),
    [snapshot],
  );

  // The ONE plan-changing reaction to an assessment (AD-12): on first start
  // there must be a main route. Guarded in the reducer too, so an unreadable
  // stored plan is never silently replaced.
  useEffect(() => {
    if (!trip.plan && !trip.planUnreadable && assessment?.proposal) {
      dispatch({ type: 'ADOPT_INITIAL', plan: assessment.proposal.plan });
    }
  }, [trip.plan, trip.planUnreadable, assessment?.proposal, dispatch]);

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
   * Returns false when no round trip can honour the pin at all (a data limit,
   * not a rating: no leg leads there).
   */
  const editStage = useCallback(
    (day: number, toIslandId: string | null, toPlaceId?: string): boolean => {
      if (!snapshot || !assessment?.currentIslandId) return false;
      const nextPins: Pin[] = [
        ...pins.filter((p) => p.day !== day),
        { day, toIslandId, toPlaceId },
      ];
      const solved = completePlan(snapshot, assessment.currentIslandId, nextPins);
      if (!solved) return false;
      dispatch({ type: 'EDIT_STAGE', plan: solved.plan });
      return true;
    },
    [snapshot, assessment?.currentIslandId, pins, dispatch],
  );

  /**
   * FR28 — den Zwischenstopp eines Doppelschlag-Tages löschen: der Tag wird
   * zur EINEN direkten Etappe auf dasselbe Tagesziel (solver.planWithoutStopover).
   * Kennt die Bibliothek keine direkte Verbindung, wird sie dort landfrei
   * ERZEUGT und hier zusammen mit dem Plan als EIN Payload persistiert
   * (DELETE_STOPOVER) — nie ein Plan ohne seine Etappe. False nur, wenn kein
   * landfreier Kurs berechenbar ist oder der Tag keinen Zwischenstopp trägt.
   */
  const removeStopover = useCallback(
    (day: number): boolean => {
      if (!snapshot || !trip.plan) return false;
      const removal = planWithoutStopover(trip.plan, day, snapshot);
      if (!removal) return false;
      dispatch({
        type: 'DELETE_STOPOVER',
        plan: removal.plan,
        customLeg: removal.customLeg,
      });
      return true;
    },
    [snapshot, trip.plan, dispatch],
  );

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
    editStage,
    removeStopover,
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
