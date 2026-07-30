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

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadLibraryBundle } from '../adapters/firestore.ts';
import { collectLocations, fetchForecastBundle } from '../adapters/openMeteo.ts';
import { assessPlanning } from '../domain/assess.ts';
import type { Assessment, PlanningSnapshot } from '../domain/schema/snapshot.ts';
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
  const { state: trip } = useTrip();

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
        trackedRouteId: trip.trackedRouteId,
        departureHourOverride: trip.departureHourOverride,
      },
    };
  }, [bundle, forecastQuery.data, currentDay, trip.position, trip.trackedRouteId, trip.departureHourOverride]);

  const assessment: Assessment | null = useMemo(
    () => (snapshot ? assessPlanning(snapshot) : null),
    [snapshot],
  );

  return {
    libraryQuery,
    forecastQuery,
    bundle: bundle ?? null,
    snapshot,
    assessment,
    currentDay,
  };
}

export type PlanningValue = ReturnType<typeof usePlanningEngine>;
