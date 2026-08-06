/**
 * Cold-load skeleton of the Karte (Story 1.3, AC 10): one status-line bar and
 * the flat surface-track map block with the visible caption "Karte lädt …".
 * Die drei Listenzeilen sind mit der Etappenliste entfallen (Feedback
 * 2026-08-06) — der Ladezustand zeigt, was danach kommt, und danach kommt nur
 * die Karte. The pulse animation is killed by the global reduced-motion rule;
 * the state itself is announced via role="status" + visually hidden text (the
 * visible caption sits inside the aria-hidden block — same pattern as
 * DayViewSkeleton).
 */

export function MapViewSkeleton() {
  return (
    <div role="status">
      <span className="visually-hidden">Karte wird geladen …</span>
      <div aria-hidden="true">
        <div className="skeleton" style={{ height: 20, width: '70%', margin: '12px 0' }} />
        <div
          className="skeleton"
          style={{
            height: '72vh',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="map-skeleton-caption">Karte lädt …</span>
        </div>
      </div>
    </div>
  );
}
