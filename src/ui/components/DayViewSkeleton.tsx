/**
 * Cold-load skeleton of the Tagesansicht (Story 1.2, AC 15): bars matching
 * the final layout — status line, hero card (title + tile grid), three list
 * rows. The pulse animation is killed by the global reduced-motion rule;
 * the state itself is announced via role="status" + visually hidden text.
 *
 * DAVOR STEHT DAS REVIERFOTO (Skipper-Wunsch 2026-08-06). Der Kaltstart ist
 * die eine Sekunde, in der die App nichts zu sagen hat: Bibliothek und
 * Forecast sind unterwegs, und Balken allein sind eine Entschuldigung. Das
 * Bild füllt sie mit dem, worum es geht.
 *
 * Es steht bewusst NUR hier. Ein Foto über der fertigen Tagesansicht schöbe
 * die Entscheidung des Tages nach unten — und die ist der Zweck der Seite.
 */

import heroUrl from '../assets/hero-kykladen.webp';

export function DayViewSkeleton() {
  return (
    <div role="status">
      <span className="visually-hidden">Tagesansicht wird geladen …</span>
      <div aria-hidden="true">
        {/* Der Farbverlauf hinter dem Bild trägt den Platz, bevor die Datei da
            ist: Himmelblau über Kieselton, aus dem Foto selbst gegriffen. Ohne
            ihn klappt das Layout beim Laden sichtbar auf. */}
        <div className="hero-loader">
          <img
            className="hero-loader-img"
            src={heroUrl}
            alt=""
            width={1200}
            height={1600}
            decoding="async"
            fetchPriority="high"
          />
        </div>
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
