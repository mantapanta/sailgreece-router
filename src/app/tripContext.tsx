/**
 * AD-11 — TripContext: one reducer, enumerated actions, clear precedence.
 * A 'manual' position is NEVER overwritten by GPS updates until explicitly
 * released. Persisted to localStorage after every change (reload-safe;
 * Firestore stays read-only). Transient view state (hover, active view) is
 * NOT part of this context.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import { z } from 'zod';
import type { TripPosition } from '../domain/schema/snapshot.ts';
import { DEFAULT_PARAMS } from '../domain/schema/params.ts';
import { athensToUtcMs } from '../domain/time.ts';

export interface TripState {
  /** 1-based trip day; null = derive from today's date. */
  currentDayOverride: number | null;
  position: TripPosition | null;
  trackedRouteId: string | null;
  departureHourOverride: number | null;
}

export type TripAction =
  | { type: 'SET_DAY'; day: number }
  | { type: 'CLEAR_DAY_OVERRIDE' }
  | { type: 'GPS_FIX'; position: TripPosition }
  | { type: 'SET_MANUAL_PLACE'; placeId: string; lat: number; lon: number }
  | { type: 'RELEASE_MANUAL' }
  | { type: 'TRACK_ROUTE'; routeId: string | null }
  | { type: 'SET_DEPARTURE_HOUR'; hour: number | null }
  | { type: 'RESET' };

const INITIAL: TripState = {
  currentDayOverride: null,
  position: null,
  trackedRouteId: null,
  departureHourOverride: null,
};

export function tripReducer(state: TripState, action: TripAction): TripState {
  switch (action.type) {
    case 'SET_DAY':
      return { ...state, currentDayOverride: action.day };
    case 'CLEAR_DAY_OVERRIDE':
      return { ...state, currentDayOverride: null };
    case 'GPS_FIX':
      // Precedence: manual wins until explicitly released (AD-11).
      if (state.position?.source === 'manual') return state;
      return { ...state, position: { ...action.position, source: 'gps' } };
    case 'SET_MANUAL_PLACE':
      return {
        ...state,
        position: {
          source: 'manual',
          lat: action.lat,
          lon: action.lon,
          placeId: action.placeId,
        },
      };
    case 'RELEASE_MANUAL':
      if (state.position?.source !== 'manual') return state;
      return { ...state, position: null };
    case 'TRACK_ROUTE':
      return { ...state, trackedRouteId: action.routeId };
    case 'SET_DEPARTURE_HOUR':
      return { ...state, departureHourOverride: action.hour };
    case 'RESET':
      return INITIAL;
    default:
      return state;
  }
}

const STORAGE_KEY = 'sailgreece-trip-v1';

/**
 * Persisted state is UNTRUSTED input (old app versions, hand edits): validate
 * with Zod before it reaches reducer/engine; any mismatch falls back to
 * INITIAL instead of feeding NaN positions into the domain.
 */
const TripPositionSchema = z.object({
  source: z.enum(['gps', 'manual']),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  placeId: z.string().optional(),
});
const TripStateSchema = z.object({
  currentDayOverride: z.number().int().min(1).nullable(),
  position: TripPositionSchema.nullable(),
  trackedRouteId: z.string().nullable(),
  departureHourOverride: z.number().int().min(0).max(23).nullable(),
});

function loadPersisted(): TripState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL;
    const parsed = TripStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn('Persistierter Trip-State ungültig — Zustand zurückgesetzt:', parsed.error.issues);
      return INITIAL;
    }
    return parsed.data;
  } catch {
    return INITIAL;
  }
}

/**
 * Trip day derived from the wall clock, clamped to the trip frame.
 * Athens midnight comes from the SAME Europe/Athens logic as every other
 * window (AD-9) — no hardcoded +03:00 (which is wrong outside summer time).
 */
export function deriveCurrentDay(
  tripStartDate: string = DEFAULT_PARAMS.tripStartDate,
  tripLengthDays: number = DEFAULT_PARAMS.tripLengthDays,
  now: Date = new Date(),
): number {
  const start = athensToUtcMs(tripStartDate, 0);
  const days = Math.floor((now.getTime() - start) / 86_400_000) + 1;
  return Math.min(Math.max(days, 1), tripLengthDays);
}

interface TripContextValue {
  state: TripState;
  dispatch: (action: TripAction) => void;
}

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(tripReducer, undefined, loadPersisted);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage full/blocked — non-fatal
    }
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip(): TripContextValue {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used inside <TripProvider>');
  return ctx;
}
