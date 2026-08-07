/**
 * FR2/FR19/FR20 — die Trip-Statuszeile: EIN Caption-Satz über allem (Punkt +
 * Verdikt + Fakten), tippen öffnet das Rest-Trip-Detail als Expander
 * (Begründungen, Rückkehr-Frist, Spätester Umkehrtag, Meltemi-fest, "Was den
 * Raum begrenzt", Entscheidungspunkte). Ersetzt den früheren Rest-Trip-Banner; die
 * Badge-Tooltips von Umkehrtag/Meltemi-fest stehen jetzt als sichtbarer
 * Caption-Text im Detail. Bei veraltetem Forecast (> STALE_TIME_MS) führt
 * ein gelbes "Stand vor {h} h"-Segment die Zeile an (Story 1.2, AC 2).
 *
 * Story 1.3: aus DayView.tsx extrahiert (unverändert), damit die Karte
 * dieselbe Zeile rendert statt einer zweiten Implementierung — seit dem
 * Feedback vom 2026-08-06 steht sie dort über der Karte (die Etappenliste, an
 * deren Kopf sie saß, ist entfallen). `triggerRef` ist optional — nur die Tagesansicht braucht
 * ihren Fokus-nach-Neuberechnung-Effekt. Das statische `id="resttrip-detail"`
 * bleibt gültig: AD-11 mountet genau eine View zur Zeit.
 */

import { useState, type RefObject } from 'react';
import type { Assessment, PlanAssessment } from '../../domain/schema/snapshot.ts';
import { restTripVerdictLabel } from '../dayViewModel.ts';

export function TripStatusLine({
  assessment,
  main,
  pprHinweise,
  staleLabel,
  triggerRef,
}: {
  assessment: Assessment;
  main: PlanAssessment | null;
  pprHinweise: string[];
  staleLabel: string | null;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const reasons = [...assessment.restTripReasons, ...pprHinweise];

  return (
    <div className="trip-status" aria-live="polite">
      <button
        type="button"
        ref={triggerRef}
        className="trip-status-trigger"
        aria-expanded={detailOpen}
        aria-controls="resttrip-detail"
        onClick={() => setDetailOpen((o) => !o)}
      >
        <span
          className={`status-dot ${staleLabel ? 'gelb' : assessment.restTripAmpel}`}
          aria-hidden="true"
        />
        <span>
          {staleLabel && <span className="stale">{staleLabel} · </span>}
          <strong>
            {restTripVerdictLabel(assessment.restTripAmpel)}
            {assessment.restTripAmpel === 'rot' &&
              assessment.proposal &&
              ' — Vorschlag mit der geringsten Verletzung'}
          </strong>
          {' · '}Rückkehr Alimos bis Tag {assessment.ppr.effectiveDeadlineDay}
          {main?.meltemiSafeUntilDay != null && (
            <> · Meltemi-fest bis Tag {main.meltemiSafeUntilDay}</>
          )}
        </span>
        <span className="chev" aria-hidden="true">
          ›
        </span>
      </button>
      {detailOpen && (
        <div
          id="resttrip-detail"
          className="trip-status-detail"
          onKeyDown={(e) => {
            // Expander-Kontrakt: Esc im Detail schliesst und gibt den Fokus
            // an den Auslöser zurück — kein Trap, kein Backdrop.
            if (e.key === 'Escape') {
              e.stopPropagation();
              setDetailOpen(false);
              triggerRef?.current?.focus();
            }
          }}
        >
          {reasons.length > 0 && (
            <ul className="reasons">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <p>
            Rückkehr Alimos bis Tag {assessment.ppr.effectiveDeadlineDay} (inkl.
            Puffertag)
          </p>
          <p>
            <strong>
              Spätester Umkehrtag:{' '}
              {assessment.ppr.latestReturnStartDay !== null
                ? `Tag ${assessment.ppr.latestReturnStartDay}`
                : 'nicht mehr erreichbar'}
            </strong>
          </p>
          <p className="caption">
            Letzter Törntag, an dem die Umkehr über die Rückfallkette noch
            rechtzeitig nach Alimos führt (Worst-Case gerechnet).
          </p>
          {main && main.returnChecks.length > 0 && (
            <>
              <p>
                <strong>
                  Meltemi-fest bis:{' '}
                  {main.meltemiSafeUntilDay !== null
                    ? `Tag ${main.meltemiSafeUntilDay}`
                    : 'heute nicht'}
                </strong>
              </p>
              <p className="caption">
                Bis zu diesem Törntag ist die Umkehr auch unter dem
                Meltemi-Worst-Case jederzeit möglich. Danach trägt der aktuelle
                Forecast den Heimweg.
              </p>
            </>
          )}
          {/* Eine Ebene über den Einzelurteilen (domain/engpass.ts): welche
              Fessel den Raum bindet und wo er am dünnsten ist. Steht vor den
              Entscheidungspunkten — erst warum, dann wann. */}
          <h3>Was den Raum begrenzt</h3>
          <p>{assessment.engpass.fesselText}</p>
          {assessment.engpass.engsteStelleText && (
            <p className="caption">{assessment.engpass.engsteStelleText}</p>
          )}
          {/* FR20 — die Entscheidungspunkte stehen wieder sichtbar da, genau
              dort, wo EXPERIENCE.md sie hinlegt: im Rest-Trip-Detail. */}
          {assessment.decisionPoints.length > 0 && (
            <>
              <h3>Entscheidungspunkte</h3>
              <ul className="reasons">
                {assessment.decisionPoints.map((p) => (
                  <li key={`${p.day}-${p.text}`}>
                    Tag {p.day}: {p.text}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
