/**
 * AD-3 / AD-7 — composition of the one snapshot query family.
 * All async data flows through TanStack Query (staleTime ~1 h = FR13 TTL);
 * every view reads from this ONE snapshot — no second forecast query past
 * the engine. The assessment is a pure recomputation per snapshot.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadLibraryBundle } from '../adapters/firestore.ts';
import { fetchForecastBundle } from '../adapters/openMeteo.ts';
import { assessPlanning } from '../domain/assess.ts';
import type { Assessment, PlanningSnapshot } from '../domain/schema/snapshot.ts';
import { useTrip, deriveCurrentDay } from './tripContext.tsx';

export const STALE_TIME_MS = 3600_000; // ~1 h (FR13)

export function usePlanning() {
  const { state: trip } = useTrip();

  const libraryQuery = useQuery({
    queryKey: ['library'],
    queryFn: loadLibraryBundle,
    staleTime: STALE_TIME_MS,
  });

  const bundle = libraryQuery.data;
  const forecastQuery = useQuery({
    queryKey: ['forecast', bundle?.params.forecastModel],
    queryFn: () => fetchForecastBundle(bundle!.library, bundle!.params),
    enabled: !!bundle,
    staleTime: STALE_TIME_MS,
    refetchInterval: STALE_TIME_MS,
  });

  const currentDay =
    trip.currentDayOverride ??
    deriveCurrentDay(bundle?.params.tripStartDate, bundle?.params.tripLengthDays);

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
