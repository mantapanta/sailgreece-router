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

import { useMemo, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import type {
  Assessment,
  LegAssessment,
  PlanAssessment,
  PlanningSnapshot,
  RouteOptionAssessment,
  StageAssessment,
  LegHourBreakdown,
  PointPassage,
} from '../../domain/schema/snapshot.ts';
import { AmpelBadge } from '../components/AmpelBadge.tsx';
import { StageMap } from '../components/StageMap.tsx';
import { WindBarb } from '../components/WindBarb.tsx';
import {
  buildLegsById,
  pointNumberByForecastKey,
  stagePoints,
} from '../mapPath.ts';
import { usePlanning } from '../../app/planningContext.tsx';
import {
  formatAthensTime,
  formatDeg,
  formatHours,
  formatKn,
  formatStamp,
  formatTripDayDate,
  formatWindFrom,
  pointOfSail,
} from '../format.ts';

function islandName(snapshot: PlanningSnapshot, islandId: string): string {
  return snapshot.library.islands.find((i) => i.id === islandId)?.name ?? islandId;
}

function placeName(snapshot: PlanningSnapshot, placeId: string | null): string {
  if (!placeId) return '–';
  return snapshot.library.places.find((p) => p.id === placeId)?.name ?? placeId;
}

/**
 * "Kea (Vourkari)" — eine Insel ist kein Ziel, ein Liegeplatz ist eins.
 *
 * Trägt der Inselname selbst schon eine Klammer ("Athen (Basis)"), wird sie
 * beim Anhängen des Platzes weggelassen: "Athen (Basis) (Marina Alimos)" wäre
 * doppelt geklammert, und der Zusatz ist ohnehin redundant, sobald der
 * konkrete Liegeplatz dasteht.
 */
function islandWithPlace(
  snapshot: PlanningSnapshot,
  islandId: string,
  placeId: string | null,
): string {
  const island = islandName(snapshot, islandId);
  if (!placeId) return island;
  return `${island.replace(/\s*\([^)]*\)\s*$/, '')} (${placeName(snapshot, placeId)})`;
}

/**
 * Etappenname von Liegeplatz zu Liegeplatz: "Kea (Vourkari) → Kythnos (Kolona)".
 *
 * Der Startplatz kommt aus der ERSTEN Etappe des Tages, das Ziel ist der
 * tatsächlich gewählte Nachtplatz (`stage.placeId`) — nicht der nominelle
 * Zielplatz der letzten Etappe. Sonst würde die Überschrift einen anderen
 * Hafen nennen als die Platz-Zeile darunter.
 */
function stageTitle(snapshot: PlanningSnapshot, stage: StageAssessment): string {
  const to = islandWithPlace(snapshot, stage.toIslandId, stage.placeId);
  const firstLegId = stage.legs[0]?.legId;
  const firstLeg = firstLegId
    ? snapshot.library.legs.find((l) => l.id === firstLegId)
    : undefined;
  if (!firstLeg) return to;
  return `${islandWithPlace(snapshot, firstLeg.fromIslandId, firstLeg.fromPlaceId)} → ${to}`;
}

/** Zwischenstopps eines Mehr-Etappen-Tages, ebenfalls mit Liegeplatz. */
function stageVia(snapshot: PlanningSnapshot, stage: StageAssessment): string[] {
  return stage.legs.slice(0, -1).map((la) => {
    const leg = snapshot.library.legs.find((l) => l.id === la.legId);
    return leg
      ? islandWithPlace(snapshot, leg.toIslandId, leg.toPlaceId)
      : la.legId.replace('--', ' → ');
  });
}

/**
 * Die Annahme in einem Satz: mit WELCHEM Wind, WELCHEM Kurs zum Wind und
 * WELCHER Fahrt diese Etappe gerechnet wurde.
 *
 * Die Tabelle darunter führt das Stunde für Stunde aus, aber sie beantwortet
 * die Frage nicht auf einen Blick — und auf dem Telefon steht sie ausserdem
 * hinter einer Seitwärts-Scroll. Deshalb steht die Grundlage hier VOR der
 * Rechnung, nicht in ihr — und jeder Wert kommt fertig aus der Bewertung
 * (AD-2), keiner wird in der View gerechnet.
 */
function WindBasis({ leg }: { leg: LegAssessment }) {
  if (leg.avgTwsKn === null) return null;
  const worstCase = leg.breakdown.some((h) => h.worstCase);
  return (
    <div className="wind-basis">
      <div className="wind-basis-row">
        {leg.avgTwdDeg !== null && (
          <WindBarb dirDeg={leg.avgTwdDeg} knots={leg.avgTwsKn} size={38} />
        )}
        <dl>
          <div>
            <dt>Wind (Ø)</dt>
            <dd>
              {leg.avgTwdDeg !== null
                ? `aus ${formatWindFrom(leg.avgTwdDeg)} · `
                : ''}
              {formatKn(leg.avgTwsKn)}
            </dd>
          </div>
          <div>
            <dt>Kurs zum Wind (Ø)</dt>
            <dd>
              {formatDeg(leg.avgTwaDeg)} TWA · {pointOfSail(leg.avgTwaDeg)}
            </dd>
          </div>
          <div>
            <dt>Fahrt (Ø)</dt>
            <dd>
              {leg.avgSpeedKn !== null ? `${leg.avgSpeedKn.toFixed(1)} kn` : '–'}
              {leg.sailHours !== null && leg.motorHours !== null && (
                <>
                  {' · '}
                  {formatHours(leg.sailHours)} Segeln, {formatHours(leg.motorHours)}{' '}
                  Motor
                </>
              )}
            </dd>
          </div>
        </dl>
      </div>
      <details className="beschreibung lesehilfe">
        <summary>Wie sind die Werte zu lesen?</summary>
        Windrichtung rechtweisend und <strong>kommend aus</strong> (AD-6). TWA ist
        der Winkel zwischen anliegendem Kurs und Wind: 0° von vorn, 180° von
        achtern. Maßgeblich für die Ampel ist die schlechteste Stunde, nicht der
        Durchschnitt.
        {worstCase &&
          ' Stunden jenseits des Horizonts rechnen gegen den Meltemi-Worst-Case.'}
      </details>
    </div>
  );
}

/**
 * FR30 — how this duration came about, hour by hour.
 *
 * `pointNumbers` bildet den Forecast-Key jeder Stunde auf die Punktnummer der
 * Tageskarte ab. Fehlt ein Key in der Karte (abgeleitete Etappe mit fremden
 * Keys), bleibt die Zelle leer statt eine falsche Nummer zu behaupten.
 *
 * Jede Zeile nennt Wind, Kurs zum Wind und Fahrt der Stunde, IN DER der Punkt
 * passiert wurde. `data-label` an den Zellen ist kein Beiwerk: auf schmalen
 * Schirmen bricht die Tabelle in gestapelte Blöcke um (styles.css), und dann
 * ist das Attribut die einzige Beschriftung, die eine Zelle noch hat.
 */
function Breakdown({
  hours,
  passages,
  pointNumbers,
}: {
  hours: LegHourBreakdown[];
  passages: PointPassage[];
  pointNumbers: Record<string, number>;
}) {
  if (passages.length === 0) {
    return <p className="beschreibung">Keine Berechnung verfügbar (unbewertet).</p>;
  }
  const sailed = hours.filter((h) => !h.motoring).length;
  const motored = hours.length - sailed;
  return (
    <div className="breakdown">
      {hours.length > 0 && (
        <p className="beschreibung">
          {hours.length} simulierte Stunden · {sailed} unter Segeln, {motored} unter
          Motor
          {hours.some((h) => h.worstCase) && ' · Fernbereich gegen Meltemi-Worst-Case'}
        </p>
      )}
      <table className="breakdown-table">
        <thead>
          <tr>
            <th>Punkt</th>
            <th>Zeit (Athen)</th>
            <th>Distanz ab Start</th>
            <th>Abschnitt</th>
            <th>Kurs</th>
            <th>Wind aus</th>
            <th>Stärke</th>
            <th>TWA</th>
            <th>Fahrt</th>
          </tr>
        </thead>
        <tbody>
          {passages.map((p) => (
            <tr
              key={p.pointKey}
              className={p.segment?.worstCase ? 'worst-case' : ''}
            >
              <td data-label="Punkt">{pointNumbers[p.pointKey] ?? '–'}</td>
              <td data-label="Zeit (Athen)">
                {p.etaIso ? formatAthensTime(p.etaIso) : '–'}
              </td>
              <td data-label="Distanz ab Start">{p.distanceNm.toFixed(1)} sm</td>
              {p.segment ? (
                <>
                  <td data-label="Abschnitt">{p.segment.distanceNm.toFixed(1)} sm</td>
                  <td data-label="Kurs" title="Anliegender Kurs über Grund, rechtweisend">
                    {formatDeg(p.segment.courseDeg)}
                  </td>
                  <td
                    data-label="Wind aus"
                    title="Richtung, AUS DER der Wind weht (rechtweisend)"
                  >
                    {formatWindFrom(p.segment.twdDeg)}
                  </td>
                  <td data-label="Stärke">{formatKn(p.segment.twsKn)}</td>
                  <td
                    data-label="TWA"
                    title="Wahrer Windeinfallswinkel: 0° von vorn, 180° von achtern"
                  >
                    {formatDeg(p.segment.twaDeg)} {pointOfSail(p.segment.twaDeg)}
                  </td>
                  <td data-label="Fahrt">
                    {p.segment.speedKn.toFixed(1)} kn
                    {p.segment.motoring ? ' (Motor)' : ''}
                  </td>
                </>
              ) : (
                // Startpunkt: es gibt keinen Abschnitt, der zu ihm führt.
                <td className="abfahrt" data-label="Abschnitt" colSpan={6}>
                  Abfahrt
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Ampel als Textsymbol für native <option>-Einträge, die kein Markup können.
 * Dieselben vier Zustände wie AmpelBadge, nur als Unicode.
 */
const AMPEL_SYMBOL: Record<string, string> = {
  gruen: '🟢',
  gelb: '🟡',
  rot: '🔴',
  unbewertet: '⚪',
};

/** FR28 — change this day's target: another island, another berth, or stay. */
function StageEditor({
  stage,
  snapshot,
  nightAmpeln,
  onClose,
}: {
  stage: StageAssessment;
  snapshot: PlanningSnapshot;
  nightAmpeln: Assessment['nightAmpeln'];
  onClose: () => void;
}) {
  const { editStage, releasePin, setStopHours } = usePlanning();
  const [error, setError] = useState<string | null>(null);
  const placesOnIsland = snapshot.library.places.filter(
    (p) => p.islandId === stage.toIslandId,
  );

  // Kontextfilter (Feedback 2026-08-05): NUR Inseln in Tagesreichweite der
  // vorherigen Plan-Insel. Die Menge kommt aus dem Assessment (AD-2) — hier
  // wird nur noch die aktuell gewählte Insel ergänzt, damit das select nie
  // einen Wert anzeigt, der nicht in seinen Optionen vorkommt.
  const selectableIslands = snapshot.library.islands.filter(
    (i) =>
      stage.reachableIslandIds.includes(i.id) ||
      (stage.kind === 'stage' && i.id === stage.toIslandId),
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
          {selectableIslands.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </label>
      <p className="beschreibung">
        Nur Inseln in Tagesreichweite ({snapshot.params.maxDayRangeNm} sm
        raumschots, {snapshot.params.maxDayRangeUpwindNm} sm gegenan) ab dem
        Vortagsziel.
      </p>
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
                {AMPEL_SYMBOL[nightAmpeln[p.id]?.[stage.day]?.ampel ?? 'unbewertet']}{' '}
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {stage.legs.length > 1 && (
        <label>
          Liegezeit je Zwischenstopp (h)
          <input
            type="number"
            min={0}
            max={12}
            step={0.5}
            value={stage.stopHoursPerStop}
            onChange={(e) => {
              const v = e.target.value;
              setStopHours(stage.day, v === '' ? null : Number(v));
            }}
          />
          <button
            type="button"
            className="secondary"
            title={`Zurück auf den Standardwert (${snapshot.params.stopHoursDefault} h)`}
            onClick={() => setStopHours(stage.day, null)}
          >
            Standard
          </button>
        </label>
      )}
      {stage.legs.length > 1 && (
        <p className="beschreibung">
          Die Pause verschiebt die Abfahrt der Folge-Etappe — nach drei Stunden
          Mittag fällt der zweite Schlag in den aufgebauten Nachmittags-Meltemi.
          Sie zählt nicht ins Fahrt-Budget.
        </p>
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
  nightAmpeln,
  isToday,
  onOpenPlace,
  mapId,
}: {
  stage: StageAssessment;
  snapshot: PlanningSnapshot;
  nightAmpeln: Assessment['nightAmpeln'];
  isToday: boolean;
  onOpenPlace: (placeId: string) => void;
  /** Null when no Maps key is configured — the panel then stays text-only. */
  mapId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const { params } = snapshot;
  // EINE Punktliste für Karte und Rechnung — daraus die Nummern für beide.
  const points = useMemo(
    () => stagePoints(stage, buildLegsById(snapshot.library.legs), snapshot),
    [stage, snapshot],
  );
  const pointNumbers = useMemo(() => pointNumberByForecastKey(points), [points]);
  const totalHours = stage.legs.reduce((s, l) => s + (l.totalHours ?? 0), 0);
  // Distanz aus der GESEGELTEN Etappe. Die Bibliothek nach der Id zu fragen
  // fand eine umgedrehte Etappe (Heimweg) gar nicht und zeigte für den ganzen
  // Tag 0 sm — und sie kannte die Verankerung an einem anderen Hafen nicht.
  const distance = stage.legs.reduce((s, l) => s + (l.sailedLeg?.distanceNm ?? 0), 0);

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
          ? `Bleiben: ${islandWithPlace(snapshot, stage.toIslandId, stage.placeId)}`
          : stageTitle(snapshot, stage)}
        {stage.pinned && <span className="pin-chip" title="Vom Skipper festgelegt">📌 festgelegt</span>}
      </div>
      {stage.kind === 'stage' && stageVia(snapshot, stage).length > 0 && (
        <div className="beschreibung">über {stageVia(snapshot, stage).join(' · ')}</div>
      )}

      {stage.kind === 'stage' && (
        <div className="badges">
          {distance > 0 && <span className="badge">{Math.round(distance)} sm</span>}
          <span className="badge" title="Stunden unter Segeln und Motor">
            {formatHours(totalHours || null)} Fahrt
          </span>
          {stage.stopHoursTotal > 0 && (
            <span
              className="badge"
              title="Geplante Liegezeit an den Zwischenstopps — verschiebt die Abfahrt der Folge-Etappe"
            >
              {formatHours(stage.stopHoursTotal)} Liegezeit
            </span>
          )}
          {/* Der Zwischenstopp ist die Ausnahme, nicht die Regel — geplant wird
              eine Verbindung pro Tag. Steht hier trotzdem einer, hat eine harte
              Bedingung ihn erzwungen, und der Tag sagt das statt es zu
              verschweigen (params.maxLegsPerDay / RELAXATION_ORDER). */}
          {stage.legs.length > 1 && (
            <span
              className="badge badge-doppelschlag"
              title="Normalerweise plant die App eine Verbindung pro Tag. Zwei Schläge an einem Tag kommen nur, wenn ein Tag je Verbindung den Stichtag oder den Gäste-Zustiegstag nicht mehr erreicht."
            >
              {stage.legs.length} Schläge an einem Tag — Ausnahme
            </span>
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
        <StageEditor stage={stage} snapshot={snapshot} nightAmpeln={nightAmpeln} onClose={() => setEditing(false)} />
      )}
      {expanded && (
        <>
          {/* FR30 — WHERE before WHEN: the zoomed day trip with its waypoints,
              then the hour-by-hour calculation those waypoints feed. */}
          {mapId ? (
            <StageMap
              points={points}
              ampel={stage.ampel}
              mapId={mapId}
              onOpenPlace={onOpenPlace}
            />
          ) : (
            <p className="beschreibung">
              Tageskarte nicht verfügbar — kein <code>VITE_GOOGLE_MAPS_API_KEY</code>{' '}
              gesetzt. Die Rechnung unten ist davon unberührt.
            </p>
          )}
          {stage.legs.map((l) => (
            <div key={l.legId}>
              <div className="beschreibung">
                <strong>{l.legId.replace('--', ' → ')}</strong>
              </div>
              <WindBasis leg={l} />
              <Breakdown
                hours={l.breakdown}
                passages={l.pointPassages}
                pointNumbers={pointNumbers}
              />
            </div>
          ))}
        </>
      )}
    </article>
  );
}

const OPTION_STATE_LABEL: Record<RouteOptionAssessment['state'], string> = {
  offen: 'offen',
  'offen-horizont': 'offen · Vorbehalt',
  schliesst: 'schliesst',
  zu: 'zu',
};

/**
 * FR9/FR18/FR20 — der Optionsraum: wie weit trägt welche Route noch, was
 * kostet sie, und bis wann ist sie zu haben.
 *
 * Das ist der Kern der App und war bisher unsichtbar: `assessRouteOption`
 * rechnete Zustand und Schliesstag für jede kuratierte Route aus, und keine
 * View hat sie je angezeigt. Der Skipper sah nur die EINE Hauptroute und
 * konnte weder erkennen, dass Santorin noch offen ist, noch was es kostet,
 * noch dass es morgen zu ist.
 *
 * Drei Angaben je Option, und keine davon darf fehlen:
 *   Reichweite — wie weit komme ich damit (die Törnfrage),
 *   Preis      — was nehme ich dafür in Kauf (Doppelschläge, Nachtetappen),
 *   Frist      — bis wann kann ich mich noch dafür entscheiden.
 */
function OptionRow({
  option,
  snapshot,
  today,
}: {
  option: RouteOptionAssessment;
  snapshot: PlanningSnapshot;
  today: number;
}) {
  const { checkIn } = usePlanning();
  const rest = option.closesOnDay !== null ? option.closesOnDay - today : null;
  const dringend =
    rest !== null && rest >= 0 && rest <= snapshot.params.decisionLookaheadDays;

  return (
    <div className={`option-row state-${option.state}${dringend ? ' dringend' : ''}`}>
      <div className="option-kopf">
        <span className="option-name">{option.name}</span>
        <span className={`state-chip state-${option.state}`}>
          {OPTION_STATE_LABEL[option.state]}
        </span>
      </div>

      <div className="badges">
        <span className="badge" title="Entfernung von der Basis zum Wendepunkt">
          bis {islandName(snapshot, option.turnIslandId)}
          {option.reachNm !== null && ` · ${Math.round(option.reachNm)} sm`}
        </span>
        {option.turnDay !== null && (
          <span className="badge" title="Tag, an dem der Plan den Wendepunkt erreicht">
            Wende an Tag {option.turnDay}
          </span>
        )}
        {option.closesOnDay !== null && (
          <span className={`badge${dringend ? ' badge-frist' : ''}`}>
            {rest !== null && rest <= 0
              ? 'letzte Entscheidung heute'
              : `noch ${rest} ${rest === 1 ? 'Tag' : 'Tage'} · bis Tag ${option.closesOnDay}`}
          </span>
        )}
        <AmpelBadge ampel={option.ampel} />
      </div>

      {/* Der Preis. Eine offene Option ohne ihn wäre eine Behauptung ohne
          Preisschild — genau die Information, die fehlte, wenn man wissen
          wollte, was ein weiter gestecktes Ziel eigentlich bedeutet. */}
      <div className="beschreibung">
        {option.costNote
          ? `Kostet: ${option.costNote}.`
          : 'Für dieses Ziel gibt es derzeit keinen tragfähigen Plan.'}
      </div>

      {option.reasons.length > 0 && (
        <ul className="reasons">
          {option.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {option.plan && (
        <button type="button" onClick={() => checkIn(option.plan!)}>
          Diese Option verfolgen
        </button>
      )}
    </div>
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

  // Exactly ONE APIProvider for the whole view: several expanded stage cards
  // then share a single Maps script load instead of each mounting its own.
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const mapId = apiKey
    ? (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || 'DEMO_MAP_ID'
    : null;

  const content = (
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

      {/* AD-13 revised: the app always routes — where the forecast runs out it
          says so instead of falling silent. This is the ONE place that states
          the extent of the assumption for the whole plan; the per-day cards
          only carry the short marker. */}
      {assessment.assumedFromDay !== null && (
        /* Eingeklappt statt ausgebreitet: die AUSSAGE ist ein Satz — ab
           welchem Tag die Planung auf einer Annahme beruht. Alles andere ist
           Beleg, und Belege gehören dorthin, wo man sie sucht, nicht an den
           Anfang der Seite. Verloren geht nichts: ein Klick, und es steht da. */
        <details className="hint-panel hint-annahme">
          <summary>
            <strong>Ab Tag {assessment.assumedFromDay} beruht die Planung auf einer Annahme.</strong>
          </summary>
          <p className="beschreibung">{assessment.assumptionNote}</p>
          <ul className="reasons">
            <li>
              Windvorhersage ({assessment.model}) verlässlich bis Tag{' '}
              {snapshot.trip.currentDay + snapshot.params.reliableHorizonDays}, Werte
              bis {formatStamp(assessment.forecastHorizonIso)}.
            </li>
            <li>
              Wellenvorhersage bis {formatStamp(assessment.waveHorizonIso)} — endet
              früher als der Wind, zieht die Nacht-Ampeln aber nicht mit: Wellenwerte
              gelten für die offene See.
            </li>
            <li>
              Eine Annahme kann den Rest-Trip nicht grün machen — aber auch nicht rot:
              sie warnt, sie verurteilt nicht.
            </li>
          </ul>
        </details>
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
            nightAmpeln={assessment.nightAmpeln}
            stage={todayStage}
            snapshot={snapshot}
            isToday
            onOpenPlace={onOpenPlace}
            mapId={mapId}
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
                nightAmpeln={assessment.nightAmpeln}
                isToday={false}
                onOpenPlace={onOpenPlace}
                mapId={mapId}
              />
            ))}
          </div>
        </section>
      )}

      {/* FR9/FR18/FR20 — der Optionsraum. Steht VOR den Alternativ-Routen und
          vor den Entscheidungspunkten, weil er die Frage beantwortet, die
          zuerst kommt: wie weit kann ich noch, was kostet es, wie lange habe
          ich dafür Zeit. */}
      {assessment.routeOptions.length > 0 && (
        <section className="section">
          <span className="versal">Optionsraum (FR9/FR18)</span>
          <h2>Wie weit kommen wir noch?</h2>
          <p className="beschreibung">
            Reichweite, Preis und Frist je Route. Eine Option schliesst an dem Tag,
            ab dem kein tragfähiger Restplan mehr existiert.
          </p>
          {assessment.routeOptions.map((o) => (
            <OptionRow key={o.routeId} option={o} snapshot={snapshot} today={day} />
          ))}
        </section>
      )}

      {assessment.alternatives.length > 0 && (
        <section className="section">
          <span className="versal">Alternativ-Routen</span>
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
        <span className="versal">Point of Return</span>
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
        <span className="versal">Entscheidungspunkte</span>
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

      {/* Die frühere Sektion "Platzbibliothek — Alle Plätze mit Nacht-Ampel"
          ist bewusst ENTFERNT (Feedback 2026-08-05): ~60 Plätze des ganzen
          Reviers unter Tag 1 sind Rauschen — Aegiali liegt mehrere Tagesreisen
          entfernt. Plätze erscheinen jetzt nur im Kontext ihrer Insel: im
          Platz-Dropdown der Etappe (mit Ampel) und auf der Karte entlang des
          Plans. Ungültige Platz-Dokumente meldet weiterhin der Seeding-Report. */}
    </div>
  );

  // No key: render the view unchanged. The day cards then explain the missing
  // map in place, exactly as the map view does — never a crash (NFR).
  if (!apiKey) return content;
  return <APIProvider apiKey={apiKey}>{content}</APIProvider>;
}
