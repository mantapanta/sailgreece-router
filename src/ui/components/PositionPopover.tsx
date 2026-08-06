/**
 * Position control of the day context (Story 1.2, AC 4) — [ASSUMPTION: OQ5]:
 * EXPERIENCE Open Question 5 keeps position controls behind this popover;
 * review may flip them to a permanently visible control without archaeology.
 *
 * Popover contract per the Interaction Primitives (AvatarMenu is the copied
 * pattern): one at a time, Esc/backdrop/trigger close it, focus moves in on
 * open, is trapped while open and returns to the trigger on close.
 */

import { useEffect, useRef, useState } from 'react';
import { useTrip } from '../../app/tripContext.tsx';
import { usePlanning } from '../../app/planningContext.tsx';
import { getCurrentGpsPosition } from '../../adapters/geolocation.ts';

export function PositionPopover() {
  const { state, dispatch } = useTrip();
  const { bundle, currentDay } = usePlanning();
  const [open, setOpen] = useState(false);
  const [gpsFailed, setGpsFailed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const places = bundle?.library.places ?? [];
  const tripLengthDays = bundle?.params.tripLengthDays ?? 12;

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const focusables = () =>
      popoverRef.current?.querySelectorAll<HTMLElement>('button, select');
    focusables()?.[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === 'Tab') {
        // Simple focus trap: cycle within the popover's controls while open.
        const items = focusables();
        if (!items || items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
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

  const requestGps = async () => {
    setGpsFailed(false);
    try {
      const pos = await getCurrentGpsPosition();
      dispatch({ type: 'GPS_FIX', position: pos });
    } catch {
      // GPS denial is a HINT, never a blocking error (EXPERIENCE State Patterns).
      setGpsFailed(true);
    }
  };

  return (
    <span className="popover-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="icon-button"
        aria-label="Position bearbeiten"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span aria-hidden="true">✎</span>
      </button>
      {open && (
        <>
          <div className="menu-backdrop" aria-hidden="true" onClick={close} />
          <div
            ref={popoverRef}
            className="popover"
            role="dialog"
            aria-label="Position bearbeiten"
          >
            <label>
              Platz
              <select
                className="select"
                value={
                  state.position?.source === 'manual'
                    ? (state.position.placeId ?? '')
                    : ''
                }
                onChange={(e) => {
                  const place = places.find((p) => p.id === e.target.value);
                  if (place) {
                    dispatch({
                      type: 'SET_MANUAL_PLACE',
                      placeId: place.id,
                      lat: place.coordinates.lat,
                      lon: place.coordinates.lon,
                    });
                  }
                }}
              >
                <option value="">
                  {state.position?.source === 'gps'
                    ? 'GPS-Fix aktiv'
                    : 'Platz wählen …'}
                </option>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn-secondary" onClick={requestGps}>
              GPS erneut abfragen
            </button>
            {state.position?.source === 'manual' && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => dispatch({ type: 'RELEASE_MANUAL' })}
              >
                Manuelle Position lösen
              </button>
            )}
            {gpsFailed && (
              <div className="hint-panel">
                Kein GPS-Zugriff — Position manuell wählen.
              </div>
            )}
            {/* Dev affordance (FR32): der Törntag folgt dem Datum; dieses
                Select simuliert spätere Tage vor Törnbeginn. Vor einem
                Open-Sourcing entfernen. */}
            <label>
              Törntag (Test)
              <select
                className="select"
                value={state.currentDayOverride ?? ''}
                onChange={(e) =>
                  e.target.value === ''
                    ? dispatch({ type: 'CLEAR_DAY_OVERRIDE' })
                    : dispatch({ type: 'SET_DAY', day: Number(e.target.value) })
                }
              >
                <option value="">Automatisch (aus dem Datum)</option>
                {Array.from({ length: tripLengthDays }, (_, i) => i + 1).map(
                  (d) => (
                    <option key={d} value={d}>
                      Tag {d}
                      {d === currentDay ? ' (aktuell)' : ''}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
        </>
      )}
    </span>
  );
}
