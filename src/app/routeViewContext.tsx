/**
 * WELCHE ROUTE SCHAUE ICH GERADE AN? — eine Auswahl, zwei Ansichten.
 *
 * Feedback Skipper 2026-08-06: „Mein Vorschlag wäre, dass die Alternativ-Wahl
 * der Karte mit der Heute-Ansicht verknüpft wird — wenn ich auf der Karte eine
 * Alternative wähle, will ich mir dort auch die einzelnen Etappen anschauen."
 *
 * Die Wahl lag vorher als lokaler State IN der Karte und war beim Wechsel auf
 * „Heute" weg. Sie liegt jetzt hier: EIN Index in `assessment.alternatives`
 * (null = Hauptroute), den Karte und Tagesansicht teilen.
 *
 * BEWUSST NICHT im TripContext (AD-11): Ansehen ist eine Blickentscheidung,
 * keine Törnentscheidung — nichts davon wird persistiert. Erst „Als Hauptroute
 * übernehmen" (FR29 check-in) ändert den Plan.
 *
 * Der Provider hält die EINE Klemme: verschwindet eine Alternative, weil die
 * nächste Bewertung weniger davon liefert, fällt die Auswahl auf die
 * Hauptroute zurück — sonst zeigte eine Ansicht einen Index ins Leere.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePlanning } from './planningContext.tsx';

interface RouteViewValue {
  /** Index in `assessment.alternatives`, oder null für die Hauptroute. */
  shownAltIndex: number | null;
  /** Eine Alternative ansehen; null geht zurück auf die Hauptroute. */
  showAlt: (index: number | null) => void;
}

const RouteViewContext = createContext<RouteViewValue | null>(null);

export function RouteViewProvider({ children }: { children: ReactNode }) {
  const { assessment } = usePlanning();
  const [shownAltIndex, setShownAltIndex] = useState<number | null>(null);
  const count = assessment?.alternatives.length ?? 0;

  useEffect(() => {
    if (shownAltIndex !== null && shownAltIndex >= count) setShownAltIndex(null);
  }, [shownAltIndex, count]);

  const showAlt = useCallback((index: number | null) => setShownAltIndex(index), []);
  const value = useMemo(
    () => ({ shownAltIndex: shownAltIndex !== null && shownAltIndex < count ? shownAltIndex : null, showAlt }),
    [shownAltIndex, count, showAlt],
  );

  return <RouteViewContext.Provider value={value}>{children}</RouteViewContext.Provider>;
}

export function useRouteView(): RouteViewValue {
  const ctx = useContext(RouteViewContext);
  if (!ctx) throw new Error('useRouteView must be used inside <RouteViewProvider>');
  return ctx;
}
