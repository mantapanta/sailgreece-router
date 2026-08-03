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
import { completePlan, type Pin } from '../domain/solver.ts';
import type { Assessment, PlanningSnapshot } from '../domain/schema/snapshot.ts';
import type { Plan } from '../domain/schema/plan.ts';
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

export function usePlanningEngine() {
  const { state: trip, dispatch } = useTrip();

  const libraryQuery = useQuery({
    queryKey: ['library'],
    queryFn: loadLibraryBundle,
    staleTime: STALE_TIME_MS,
  });

  const bundle = libraryQuery.data;

  // The forecast cache key must change when the LIBRARY changes: a new place
  // or waypoint enlarges the normative location set (AD-3) — without the hash
  // the stale cached response would leave new locations 'unbewertet'.
  const libHash = useMemo(
    () =>
      bundle
        ? libraryLocationsHash(
            collectLocations(bundle.library).map(
              (l) => `${l.key}@${l.coordinates.lat},${l.coordinates.lon}`,
            ),
          )
        : null,
    [bundle],
  );

  const forecastQuery = useQuery({
    queryKey: ['forecast', bundle?.params.forecastModel, libHash],
    queryFn: () => fetchForecastBundle(bundle!.library, bundle!.params),
    enabled: !!bundle,
    staleTime: STALE_TIME_MS,
    refetchInterval: STALE_TIME_MS,
  });

  // Persisted overrides may stem from an older trip frame: clamp to
  // [1, tripLengthDays] so the engine never sees a day off the axis.
  const tripLengthDays = bundle?.params.tripLengthDays ?? 12;
  const currentDay =
    trip.currentDayOverride !== null
      ? Math.min(Math.max(trip.currentDayOverride, 1), tripLengthDays)
      : deriveCurrentDay(bundle?.params.tripStartDate, tripLengthDays);

  const snapshot: PlanningSnapshot | null = useMemo(() => {
    if (!bundle || !forecastQuery.data) return null;
    return {
      ...forecastQuery.data,
      library: bundle.library,
      polar: bundle.polar,
      params: bundle.params,
      trip: {
        currentDay,
        position: trip.position,
        plan: trip.plan,
        departureHourOverride: trip.departureHourOverride,
      },
    };
  }, [bundle, forecastQuery.data, currentDay, trip.position, trip.plan, trip.departureHourOverride]);

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

  /** FR29 — adopt a proposal or alternative as the new main route. */
  const checkIn = useCallback(
    (plan: Plan) => dispatch({ type: 'CHECK_IN', plan }),
    [dispatch],
  );

  const releasePin = useCallback(
    (day: number) => dispatch({ type: 'RELEASE_PIN', day }),
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
    checkIn,
    releasePin,
  };
}

export type PlanningValue = ReturnType<typeof usePlanningEngine>;
