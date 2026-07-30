/**
 * Single engine instantiation (NFR performance): <PlanningProvider> runs
 * usePlanningEngine (queries + assessPlanning) exactly once per render tree;
 * all components share the result via usePlanning(). Without this, every
 * additional caller would recompute the full option/PPR search per render.
 */

import { createContext, useContext, type ReactNode } from 'react';
import { usePlanningEngine, type PlanningValue } from './usePlanning.ts';

const PlanningContext = createContext<PlanningValue | null>(null);

export function PlanningProvider({ children }: { children: ReactNode }) {
  const value = usePlanningEngine();
  return (
    <PlanningContext.Provider value={value}>{children}</PlanningContext.Provider>
  );
}

export function usePlanning(): PlanningValue {
  const ctx = useContext(PlanningContext);
  if (!ctx) throw new Error('usePlanning must be used inside <PlanningProvider>');
  return ctx;
}
