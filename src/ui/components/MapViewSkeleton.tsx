/**
 * Cold-load skeleton of the Karte (Story 1.3, AC 10): one status-line bar, a
 * flat surface-track map block with the visible caption "Karte lädt …", three
 * list-row bars. The pulse animation is killed by the global reduced-motion
 * rule; the state itself is announced via role="status" + visually hidden
 * text (the visible caption sits inside the aria-hidden block — same pattern
 * as DayViewSkeleton).
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
            height: '55vh',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="map-skeleton-caption">Karte lädt …</span>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 48, marginTop: 12 }} />
        ))}
      </div>
    </div>
  );
}
