/**
 * AD-11 / AD-12 — TripContext: one reducer, enumerated actions, one mutation
 * path for the plan.
 *
 * The main route lives HERE, persisted: recomputation only ever re-assesses
 * it, never rewrites it. Every plan-changing action carries a FINISHED plan as
 * its payload — the shell calls `completePlan` synchronously at dispatch time
 * so pin and completion always come from the same snapshot. The reducer never
 * computes, and no effect dispatches plan changes in reaction to an
 * assessment (the sole exception is ADOPT_INITIAL on first start).
 *
 * A 'manual' position is NEVER overwritten by GPS updates until explicitly
 * released. Transient view state (hover, active view) is NOT part of this
 * context.
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
import type { Plan } from '../domain/schema/plan.ts';
import { PlanSchema } from '../domain/schema/plan.ts';
import { DEFAULT_PARAMS } from '../domain/schema/params.ts';
import { athensToUtcMs } from '../domain/time.ts';

export interface TripState {
  /** 1-based trip day; null = derive from today's date (FR32). */
  currentDayOverride: number | null;
  position: TripPosition | null;
  /** The persisted main route (AD-12). Null until the first adoption. */
  plan: Plan | null;
  /**
   * A stored plan could not be parsed (corrupt or from an older schema).
   * A NAMED state, never a silent reset: throwing away the skipper's pins
   * unnoticed — e.g. after a redeploy mid-trip — is exactly what AD-12
   * forbids. Adopting a fresh plan then needs an explicit confirmation.
   */
  planUnreadable: boolean;
  departureHourOverride: number | null;
  /**
   * Liegezeit an den Zwischenstopps je Törntag. Fehlt ein Tag, gilt
   * `params.stopHoursDefault`. Persistiert, weil es eine Planungsentscheidung
   * ist und keine Ansichtssache.
   */
  stopHoursByDay: Record<number, number>;
}

export type TripAction =
  | { type: 'SET_DAY'; day: number }
  | { type: 'CLEAR_DAY_OVERRIDE' }
  | { type: 'GPS_FIX'; position: TripPosition }
  | { type: 'SET_MANUAL_PLACE'; placeId: string; lat: number; lon: number }
  | { type: 'RELEASE_MANUAL' }
  /** First start only: adopt the solver's proposal (AD-12). */
  | { type: 'ADOPT_INITIAL'; plan: Plan }
  /** FR29: a proposal or alternative becomes the main route; pins are released. */
  | { type: 'CHECK_IN'; plan: Plan }
  /** FR28: the skipper edited a day; payload is the fully recomputed plan. */
  | { type: 'EDIT_STAGE'; plan: Plan }
  /** Release a pin so the solver may plan that day again. */
  | { type: 'RELEASE_PIN'; day: number }
  /** The skipper acknowledged an unreadable plan; a fresh one may be adopted. */
  | { type: 'DISCARD_UNREADABLE' }
  | { type: 'SET_DEPARTURE_HOUR'; hour: number | null }
  /** Liegezeit für EINEN Tag setzen; null = zurück auf den Default. */
  | { type: 'SET_STOP_HOURS'; day: number; hours: number | null }
  | { type: 'RESET' };

const INITIAL: TripState = {
  currentDayOverride: null,
  position: null,
  plan: null,
  planUnreadable: false,
  departureHourOverride: null,
  stopHoursByDay: {},
};

/** Release every skipper pin — the plan stays, only its ownership resets. */
function releaseAllPins(plan: Plan): Plan {
  return {
    ...plan,
    days: plan.days.map((d) => ({ ...d, source: 'solver' as const })),
  };
}

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
    case 'ADOPT_INITIAL':
      // Exactly once, and only when nothing was ever stored. An unreadable
      // plan is NOT "no plan" — it must be discarded deliberately first.
      if (state.plan || state.planUnreadable) return state;
      return { ...state, plan: action.plan };
    case 'CHECK_IN':
      return { ...state, plan: releaseAllPins(action.plan), planUnreadable: false };
    case 'EDIT_STAGE':
      return { ...state, plan: action.plan, planUnreadable: false };
    case 'RELEASE_PIN': {
      if (!state.plan) return state;
      return {
        ...state,
        plan: {
          ...state.plan,
          days: state.plan.days.map((d) =>
            d.day === action.day ? { ...d, source: 'solver' as const } : d,
          ),
        },
      };
    }
    case 'DISCARD_UNREADABLE':
      return { ...state, planUnreadable: false, plan: null };
    case 'SET_DEPARTURE_HOUR':
      return { ...state, departureHourOverride: action.hour };
    case 'SET_STOP_HOURS': {
      const next = { ...state.stopHoursByDay };
      // null loescht den Eintrag statt 0 zu speichern: "kein Override" und
      // "null Stunden Liegezeit" sind verschiedene Aussagen.
      if (action.hours === null) delete next[action.day];
      else next[action.day] = action.hours;
      return { ...state, stopHoursByDay: next };
    }
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
  plan: PlanSchema.nullable(),
  departureHourOverride: z.number().int().min(0).max(23).nullable(),
  // Aus aelterem Storage fehlt das Feld — Default statt Reset des ganzen
  // Zustands, sonst kostet ein Schema-Zuwachs die Position des Skippers.
  stopHoursByDay: z.record(z.coerce.number().int(), z.number().min(0).max(12)).default({}),
});

function loadPersisted(): TripState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL;
    const parsed = TripStateSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { ...parsed.data, planUnreadable: false };

    // Distinguish the two failure modes: if only the PLAN is unreadable, keep
    // the rest of the context and surface the plan as a named state, so the
    // skipper's position and settings survive a schema change on the water.
    const withoutPlan = TripStateSchema.omit({ plan: true }).safeParse(
      JSON.parse(raw),
    );
    if (withoutPlan.success) {
      console.warn(
        'Persistierter Plan ungültig (Schema-Version?) — Plan als unlesbar markiert, übriger Kontext erhalten:',
        parsed.error.issues,
      );
      return { ...withoutPlan.data, plan: null, planUnreadable: true };
    }
    console.warn('Persistierter Trip-State ungültig — Zustand zurückgesetzt:', parsed.error.issues);
    return INITIAL;
  } catch {
    return INITIAL;
  }
}

/**
 * Trip day derived from the wall clock, clamped to the trip frame (FR32).
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
    // While a stored plan is unreadable, DO NOT write: this effect also runs on
    // mount, and writing `plan: null` here would physically destroy the stored
    // plan (and every pin in it) before the skipper ever saw the warning — the
    // silent reset AD-12 forbids, just deferred by one reload. The state leaves
    // this branch only through an explicit DISCARD_UNREADABLE or CHECK_IN.
    if (state.planUnreadable) return;
    try {
      // planUnreadable is a runtime state, not persisted data.
      const { planUnreadable: _drop, ...persistable } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
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
