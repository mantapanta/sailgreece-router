/**
 * Cold-load skeleton of the Tagesansicht (Story 1.2, AC 15): bars matching
 * the final layout — status line, hero card (title + tile grid), three list
 * rows. The pulse animation is killed by the global reduced-motion rule;
 * the state itself is announced via role="status" + visually hidden text.
 */

export function DayViewSkeleton() {
  return (
    <div role="status">
      <span className="visually-hidden">Tagesansicht wird geladen …</span>
      <div aria-hidden="true">
        <div className="skeleton" style={{ height: 20, width: '70%', margin: '12px 0' }} />
        <div className="card-surface" style={{ marginTop: 16 }}>
          <div className="skeleton" style={{ height: 34, width: '55%' }} />
          <div className="skeleton" style={{ height: 96, marginTop: 16 }} />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 48, marginTop: 12 }} />
        ))}
      </div>
    </div>
  );
}
