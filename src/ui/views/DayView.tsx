/**
 * FR21/FR22/FR28/FR29/FR30 — Tagesansicht "Was machen wir heute?".
 *
 * The round trip IS the view: one main route over all trip days, today's stage
 * up front, every stage editable (FR28) and every duration explainable (FR30).
 * There is no header select for route options — there is one main route, and
 * alternatives are checked in explicitly (FR29).
 *
 * All values come from the assessment (AD-2: views never compute domain
 * values, not even the stage number — that comes from domain/schema/plan.ts).
 */

import { useState } from 'react';
import type {
  Assessment,
  PlanAssessment,
  PlanningSnapshot,
  StageAssessment,
  LegHourBreakdown,
} from '../../domain/schema/snapshot.ts';
import { AmpelBadge } from '../components/AmpelBadge.tsx';
import { usePlanning } from '../../app/planningContext.tsx';
import { formatHours, formatKn, formatTripDayDate } from '../format.ts';

function islandName(snapshot: PlanningSnapshot, islandId: string): string {
  return snapshot.library.islands.find((i) => i.id === islandId)?.name ?? islandId;
}

function placeName(snapshot: PlanningSnapshot, placeId: string | null): string {
  if (!placeId) return '–';
  return snapshot.library.places.find((p) => p.id === placeId)?.name ?? placeId;
}

/** FR30 — how this duration came about, hour by hour. */
function Breakdown({ hours }: { hours: LegHourBreakdown[] }) {
  if (hours.length === 0) {
    return <p className="beschreibung">Keine Berechnung verfügbar (unbewertet).</p>;
  }
  const sailed = hours.filter((h) => !h.motoring).length;
  const motored = hours.length - sailed;
  return (
    <div className="breakdown">
      <p className="beschreibung">
        {hours.length} simulierte Stunden · {sailed} unter Segeln, {motored} unter
        Motor
        {hours.some((h) => h.worstCase) && ' · Fernbereich gegen Meltemi-Worst-Case'}
      </p>
      <table className="breakdown-table">
        <thead>
          <tr>
            <th>Zeit (UTC)</th>
            <th>Kurs</th>
            <th>Wind</th>
            <th>TWA</th>
            <th>Speed</th>
            <th>Distanz</th>
          </tr>
        </thead>
        <tbody>
          {hours.map((h, i) => (
            <tr key={`${h.timeIso}-${i}`} className={h.worstCase ? 'worst-case' : ''}>
              <td>{h.timeIso.slice(11, 16)}</td>
              <td>{Math.round(h.courseDeg)}°</td>
              <td>{formatKn(h.twsKn)}</td>
              <td>{Math.round(h.twaDeg)}°</td>
              <td>
                {h.speedKn.toFixed(1)} kn{h.motoring ? ' (Motor)' : ''}
              </td>
              <td>{h.distanceNm.toFixed(1)} sm</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** FR28 — change this day's target: another island, another berth, or stay. */
function StageEditor({
  stage,
  snapshot,
  onClose,
}: {
  stage: StageAssessment;
  snapshot: PlanningSnapshot;
  onClose: () => void;
}) {
  const { editStage, releasePin } = usePlanning();
  const [error, setError] = useState<string | null>(null);
  const placesOnIsland = snapshot.library.places.filter(
    (p) => p.islandId === stage.toIslandId,
  );

  const apply = (islandId: string | null, placeId?: string) => {
    setError(null);
    const ok = editStage(stage.day, islandId, placeId);
    if (!ok) {
      setError(
        'Mit diesem Ziel lässt sich kein Round-Trip bauen — es führt keine Etappe der Bibliothek dorthin.',
      );
      return;
    }
    onClose();
  };

  return (
    <div className="stage-editor">
      <label>
        Tagesziel (Insel)
        <select
          value={stage.kind === 'harbour' ? '' : stage.toIslandId}
          onChange={(e) => apply(e.target.value || null)}
        >
          <option value="">— Hafentag: hier bleiben —</option>
          {snapshot.library.islands.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </label>
      {placesOnIsland.length > 0 && (
        <label>
          Platz auf {islandName(snapshot, stage.toIslandId)}
          <select
            value={stage.placeIsSuggestion ? '' : (stage.placeId ?? '')}
            onChange={(e) =>
              apply(stage.toIslandId, e.target.value || undefined)
            }
          >
            <option value="">— Vorschlag der App übernehmen —</option>
            {placesOnIsland.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="editor-actions">
        {stage.pinned && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              releasePin(stage.day);
              onClose();
            }}
          >
            Festlegung lösen
          </button>
        )}
        <button type="button" className="secondary" onClick={onClose}>
          Schließen
        </button>
      </div>
      {error && <div className="hint-panel">{error}</div>}
    </div>
  );
}

function StageCard({
  stage,
  snapshot,
  isToday,
  onOpenPlace,
}: {
  stage: StageAssessment;
  snapshot: PlanningSnapshot;
  isToday: boolean;
  onOpenPlace: (placeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const { params } = snapshot;
  const totalHours = stage.legs.reduce((s, l) => s + (l.totalHours ?? 0), 0);
  const distance = stage.legs.reduce((s, l) => {
    const leg = snapshot.library.routes.flatMap((r) => r.legs).find((x) => x.id === l.legId);
    return s + (leg?.distanceNm ?? 0);
  }, 0);

  return (
    <article className={`card stage-card${isToday ? ' today' : ''}`}>
      <div className="stage-head">
        <span className="versal">
          {stage.kind === 'harbour'
            ? 'Hafentag'
            : `Etappe ${stage.stageNumber ?? '–'}`}
          {' · '}
          Tag {stage.day} · {formatTripDayDate(params.tripStartDate, stage.day)}
          {isToday && ' · HEUTE'}
        </span>
        <AmpelBadge ampel={stage.ampel} />
      </div>

      <div className="headline">
        {stage.kind === 'harbour'
          ? `Bleiben: ${islandName(snapshot, stage.toIslandId)}`
          : islandName(snapshot, stage.toIslandId)}
        {stage.pinned && <span className="pin-chip" title="Vom Skipper festgelegt">📌 festgelegt</span>}
      </div>

      {stage.kind === 'stage' && (
        <div className="badges">
          {distance > 0 && <span className="badge">{Math.round(distance)} sm</span>}
          <span className="badge">{formatHours(totalHours || null)}</span>
          {stage.legs.length > 1 && (
            <span className="badge">{stage.legs.length} Schläge an einem Tag</span>
          )}
        </div>
      )}

      <div className="platz-zeile">
        <span>
          Platz:{' '}
          {stage.placeId ? (
            <button type="button" onClick={() => onOpenPlace(stage.placeId!)}>
              {placeName(snapshot, stage.placeId)}
            </button>
          ) : (
            '–'
          )}
          {stage.placeIsSuggestion && stage.placeId && (
            <span className="suggestion-chip" title="Aktueller Vorschlag — ändert sich mit dem Forecast">
              Vorschlag
            </span>
          )}
        </span>
        <AmpelBadge ampel={stage.placeAmpel} />
      </div>

      {stage.legs.some((l) => l.reasons.length > 0) && (
        <ul className="reasons">
          {stage.legs.flatMap((l) => l.reasons).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      <div className="stage-actions">
        <button type="button" className="secondary" onClick={() => setEditing((v) => !v)}>
          {editing ? 'Bearbeiten abbrechen' : 'Etappe ändern'}
        </button>
        {stage.kind === 'stage' && (
          <button type="button" className="secondary" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Rechnung ausblenden' : 'Wie kommt die Zeit zustande?'}
          </button>
        )}
      </div>

      {editing && (
        <StageEditor stage={stage} snapshot={snapshot} onClose={() => setEditing(false)} />
      )}
      {expanded &&
        stage.legs.map((l) => (
          <div key={l.legId}>
            <div className="beschreibung">
              <strong>{l.legId.replace('--', ' → ')}</strong>
            </div>
            <Breakdown hours={l.breakdown} />
          </div>
        ))}
    </article>
  );
}

/** FR29 — an alternative round trip the skipper can check in. */
function AlternativeRow({
  alt,
  snapshot,
}: {
  alt: PlanAssessment;
  snapshot: PlanningSnapshot;
}) {
  const { checkIn } = usePlanning();
  const stages = alt.stages.filter((s) => s.kind === 'stage');
  return (
    <div className="route-state">
      <span>
        <strong>Wendepunkt {islandName(snapshot, alt.turnIslandId)}</strong>
        {' · '}
        {stages.length} Etappen
      </span>
      <span className="legs-inline">
        {stages.slice(0, 6).map((s) => (
          <span className="leg-chip" key={s.day}>
            {islandName(snapshot, s.toIslandId)}
          </span>
        ))}
        {stages.length > 6 && <span className="leg-chip">…</span>}
      </span>
      <button type="button" onClick={() => checkIn(alt.plan)}>
        Als Hauptroute übernehmen
      </button>
    </div>
  );
}

export function DayView({
  snapshot,
  assessment,
  onOpenPlace,
}: {
  snapshot: PlanningSnapshot;
  assessment: Assessment;
  onOpenPlace: (placeId: string) => void;
}) {
  const day = snapshot.trip.currentDay;
  const { params } = snapshot;
  const { checkIn } = usePlanning();
  const hereName = assessment.currentIslandId
    ? islandName(snapshot, assessment.currentIslandId)
    : 'Position unbekannt';

  const main = assessment.mainRoute;
  const todayStage = main?.stages.find((s) => s.day === day) ?? null;
  const restStages = main?.stages.filter((s) => s.day > day) ?? [];
  const pastStages = main?.stages.filter((s) => s.day < day) ?? [];

  return (
    <div>
      <span className="versal">
        Tag {day} · {formatTripDayDate(params.tripStartDate, day)}
      </span>
      <h1>Was machen wir heute?</h1>
      <p className="beschreibung">
        Aktuelle Position: <strong>{hereName}</strong>
        {snapshot.trip.position?.source === 'manual' && ' (manuell gesetzt)'}
        {snapshot.trip.position?.source === 'gps' && ' (GPS)'}
        {' · '}Abfahrt{' '}
        {snapshot.trip.departureHourOverride ?? params.departureHourAthens}:00 Uhr
        (Athen)
      </p>
      {assessment.positionNote && (
        <div className="hint-panel">{assessment.positionNote}</div>
      )}

      {/* FR2 — the rest-trip light governs the whole view. */}
      <div className={`resttrip-banner ampel-${assessment.restTripAmpel}`}>
        <div className="resttrip-head">
          <AmpelBadge
            ampel={assessment.restTripAmpel}
            label={
              assessment.restTripAmpel === 'gruen'
                ? 'Round-Trip trägt'
                : assessment.restTripAmpel === 'gelb'
                  ? 'Round-Trip unter Vorbehalt'
                  : assessment.restTripAmpel === 'rot'
                    ? 'Kein tragfähiger Round-Trip'
                    : 'Round-Trip unbewertet'
            }
          />
          <span className="beschreibung">
            Rückkehr Alimos bis Tag {assessment.ppr.effectiveDeadlineDay} (inkl.
            Puffertag)
          </span>
        </div>
        {assessment.restTripReasons.length > 0 && (
          <ul className="reasons">
            {assessment.restTripReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>

      {!main && assessment.proposal && (
        <div className="hint-panel">
          Noch keine Hauptroute festgelegt.{' '}
          <button type="button" onClick={() => checkIn(assessment.proposal!.plan)}>
            Vorschlag der App übernehmen
          </button>
        </div>
      )}

      {todayStage && (
        <section className="section">
          <span className="versal">Heute</span>
          <StageCard
            stage={todayStage}
            snapshot={snapshot}
            isToday
            onOpenPlace={onOpenPlace}
          />
        </section>
      )}

      {restStages.length > 0 && (
        <section className="section">
          <span className="versal">Rest-Trip · bis zurück nach Alimos</span>
          <h2>Die weiteren Etappen</h2>
          <div className="stage-list">
            {restStages.map((s) => (
              <StageCard
                key={s.day}
                stage={s}
                snapshot={snapshot}
                isToday={false}
                onOpenPlace={onOpenPlace}
              />
            ))}
          </div>
        </section>
      )}

      {assessment.alternatives.length > 0 && (
        <section className="section">
          <span className="versal">Alternativ-Routen (FR29)</span>
          <h2>Andere Round-Trips</h2>
          <p className="beschreibung">
            Erst ansehen, dann einchecken — eingecheckt wird die Alternative zur
            neuen Hauptroute, bisherige Festlegungen werden dabei gelöst.
          </p>
          {assessment.alternatives.map((alt) => (
            <AlternativeRow
              key={`${alt.variantId}-${alt.turnIslandId}`}
              alt={alt}
              snapshot={snapshot}
            />
          ))}
        </section>
      )}

      {pastStages.length > 0 && (
        <section className="section">
          <span className="versal">Bereits gefahren</span>
          <div className="past-list">
            {pastStages.map((s) => (
              <span className="badge" key={s.day}>
                {s.stageNumber !== null ? `Etappe ${s.stageNumber}: ` : ''}
                {islandName(snapshot, s.toIslandId)} (Tag {s.day})
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <span className="versal">Point of Return (FR19)</span>
        <h2>Rückweg nach Alimos</h2>
        <div className="badges">
          <span className="badge">
            Spätester Umkehrtag:{' '}
            <strong>
              {assessment.ppr.latestReturnStartDay !== null
                ? `Tag ${assessment.ppr.latestReturnStartDay}`
                : 'nicht mehr erreichbar'}
            </strong>
          </span>
          <span className="badge">
            Restdistanz über Rückfallkette:{' '}
            {assessment.ppr.remainingDistanceNm !== null
              ? `${Math.round(assessment.ppr.remainingDistanceNm)} sm`
              : '–'}
          </span>
        </div>
        {assessment.ppr.reasons.length > 0 && (
          <ul className="reasons">
            {assessment.ppr.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <span className="versal">Entscheidungspunkte (FR20)</span>
        <h2>Was muss wann entschieden sein?</h2>
        {assessment.decisionPoints.length === 0 ? (
          <p className="beschreibung">Aktuell keine terminierten Entscheidungen.</p>
        ) : (
          <ul>
            {assessment.decisionPoints.map((dp) => (
              <li key={`${dp.day}-${dp.text}`}>
                <strong>Tag {dp.day}:</strong> {dp.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <span className="versal">Platzbibliothek</span>
        <h2>Alle Plätze mit Nacht-Ampel</h2>
        <p className="beschreibung">
          Nacht-Ampeln für Tag {day} — Details je Platz in der Karten- und
          Detailansicht.
        </p>
        <div className="badges">
          {snapshot.library.places.map((p) => (
            <button
              type="button"
              key={p.id}
              className="badge"
              style={{ cursor: 'pointer' }}
              onClick={() => onOpenPlace(p.id)}
            >
              {p.name}{' '}
              <AmpelBadge
                ampel={assessment.nightAmpeln[p.id]?.[day]?.ampel ?? 'unbewertet'}
                label=""
              />
            </button>
          ))}
          {snapshot.library.invalidPlaces.map((p) => (
            <span key={p.id} className="badge" title={p.error}>
              {p.name ?? p.id} <AmpelBadge ampel="unbewertet" label="" />
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
