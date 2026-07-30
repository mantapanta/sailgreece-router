/**
 * FR21/FR22 — Tagesansicht "Was machen wir heute?".
 * 2-3 day options (target islands with best place + night ampel), leg score,
 * duration and mid-term plan effect — side by side. The app recommends
 * nothing and hides nothing; the skipper decides. All values come from the
 * assessment (AD-2: views never compute domain values).
 */

import type {
  Assessment,
  PlanningSnapshot,
  DayOption,
  RouteOptionAssessment,
} from '../../domain/schema/snapshot.ts';
import { AmpelBadge } from '../components/AmpelBadge.tsx';
import { formatHours, formatKn, formatTripDayDate } from '../format.ts';

const STATE_LABEL: Record<RouteOptionAssessment['state'], string> = {
  offen: 'offen',
  'offen-horizont': 'offen (Horizont)',
  schliesst: 'schließt',
  zu: 'geschlossen',
};

function islandName(snapshot: PlanningSnapshot, islandId: string): string {
  return snapshot.library.islands.find((i) => i.id === islandId)?.name ?? islandId;
}

function placeName(snapshot: PlanningSnapshot, placeId: string | null): string {
  if (!placeId) return '–';
  return snapshot.library.places.find((p) => p.id === placeId)?.name ?? placeId;
}

function OptionCard({
  option,
  snapshot,
  onOpenPlace,
}: {
  option: DayOption;
  snapshot: PlanningSnapshot;
  onOpenPlace: (placeId: string) => void;
}) {
  const target = islandName(snapshot, option.targetIslandId);
  const leg = option.leg;
  const legDef = option.legId
    ? snapshot.library.routes
        .flatMap((r) => r.legs)
        .find((l) => l.id === option.legId)
    : null;
  const island = snapshot.library.islands.find((i) => i.id === option.targetIslandId);
  const routeNames = option.servesRouteIds
    .map((id) => snapshot.library.routes.find((r) => r.id === id)?.name ?? id)
    .join(', ');

  return (
    <article className="card">
      <span className="versal">
        {option.kind === 'liegetag' ? 'Liegetag' : 'Tagesoption'}
      </span>
      <div className="headline">
        {option.kind === 'liegetag' ? `Bleiben: ${target}` : target}
      </div>
      {island?.description && <div className="beschreibung">{island.description}</div>}
      {leg && legDef && (
        <>
          <div className="badges">
            <span className="badge">{legDef.distanceNm} sm</span>
            <span className="badge">{formatHours(leg.totalHours)}</span>
            {leg.motorHours !== null && leg.motorHours > 0.1 && (
              <span className="badge">davon Motor {formatHours(leg.motorHours)}</span>
            )}
            <span className="badge">
              Wind {formatKn(leg.avgTwsKn)}, TWA {leg.avgTwaDeg === null ? '–' : `${Math.round(leg.avgTwaDeg)}°`}
              {leg.upwind ? ' (gegenan)' : ''}
            </span>
          </div>
          <AmpelBadge ampel={leg.ampel} label={`Etappe: ${leg.ampel}`} />
          {legDef.windWarnings.length > 0 && (
            <ul className="reasons">
              {legDef.windWarnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          )}
          {leg.reasons.length > 0 && (
            <ul className="reasons">
              {leg.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="platz-zeile">
        <span>
          Bester Platz heute Nacht:{' '}
          {option.bestPlaceId ? (
            <button type="button" onClick={() => onOpenPlace(option.bestPlaceId!)}>
              {placeName(snapshot, option.bestPlaceId)}
            </button>
          ) : (
            '–'
          )}
        </span>
        <AmpelBadge ampel={option.bestPlaceAmpel} />
      </div>
      {routeNames && (
        <div className="beschreibung">Teil von: {routeNames}</div>
      )}
    </article>
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
  const hereName = assessment.currentIslandId
    ? islandName(snapshot, assessment.currentIslandId)
    : 'Position unbekannt';

  const sortedRoutes = [...assessment.routeOptions].sort((a, b) => {
    const ra = snapshot.library.routes.find((r) => r.id === a.routeId)?.escalationRank ?? 0;
    const rb = snapshot.library.routes.find((r) => r.id === b.routeId)?.escalationRank ?? 0;
    return ra - rb;
  });

  return (
    <div>
      <span className="versal">Tag {day} · {formatTripDayDate(params.tripStartDate, day)}</span>
      <h1>Was machen wir heute?</h1>
      <p className="beschreibung">
        Aktuelle Position: <strong>{hereName}</strong>
        {snapshot.trip.position?.source === 'manual' && ' (manuell gesetzt)'}
        {snapshot.trip.position?.source === 'gps' && ' (GPS)'}
        {' · '}Abfahrt {snapshot.trip.departureHourOverride ?? params.departureHourAthens}:00 Uhr (Athen)
      </p>

      {assessment.dayOptions.length === 0 ? (
        <div className="hint-panel">
          Keine Tagesoptionen ableitbar — Position setzen (GPS oder Platz wählen).
        </div>
      ) : (
        <div className="options-grid">
          {assessment.dayOptions.map((option) => (
            <OptionCard
              key={option.legId ?? `liegetag-${option.targetIslandId}`}
              option={option}
              snapshot={snapshot}
              onOpenPlace={onOpenPlace}
            />
          ))}
        </div>
      )}

      <section className="section">
        <span className="versal">Mittelfristplan · Möglichkeitsraum (FR18)</span>
        <h2>Routen-Optionen</h2>
        {sortedRoutes.map((opt) => {
          const route = snapshot.library.routes.find((r) => r.id === opt.routeId);
          return (
            <div className="route-state" key={opt.routeId}>
              <span
                className={`state-chip state-${opt.state}`}
                title={opt.reasons.join(' · ')}
              >
                {STATE_LABEL[opt.state]}
                {opt.state === 'schliesst' && opt.closesOnDay !== null
                  ? ` am Tag ${opt.closesOnDay}`
                  : ''}
              </span>
              <span>
                <strong>{route?.name ?? opt.routeId}</strong>
                {route?.isReturnChain ? ' · Rückfallkette' : ''}
                {route ? ` · Eskalationsstufe ${route.escalationRank}` : ''}
              </span>
              <AmpelBadge ampel={opt.ampel} />
              {opt.legAssessments.length > 0 && (
                <span className="legs-inline">
                  {opt.legAssessments.map((la) => (
                    <span className="leg-chip" key={`${opt.routeId}-${la.legId}-${la.day}`}>
                      <span
                        className="dot"
                        style={{
                          background:
                            la.ampel === 'gruen'
                              ? 'var(--gruen)'
                              : la.ampel === 'gelb'
                                ? 'var(--gelb)'
                                : la.ampel === 'rot'
                                  ? 'var(--rot)'
                                  : 'var(--grau)',
                        }}
                      />
                      {la.legId.replace('--', ' → ')} (Tag {la.day},{' '}
                      {formatHours(la.totalHours)})
                    </span>
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </section>

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
          <span className="badge">
            Ankunft Basis bis Tag {assessment.ppr.effectiveDeadlineDay} (inkl. Puffertag)
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
          Nacht-Ampeln für Tag {day} — Details je Platz in der Karten- und Detailansicht.
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
