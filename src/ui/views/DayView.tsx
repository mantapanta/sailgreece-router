/**
 * FR21/FR22/FR28/FR29/FR30 — Tagesansicht "Was machen wir heute?".
 *
 * Consumer-Warm spine (Story 1.2): one trip status line with an expandable
 * rest-trip detail, a day-context block with the position popover, ONE hero
 * StageCard for the open decision of the day (hero-switch rule), a collapsed
 * rest-trip list card, the collapsed Optionsraum summary, the assumption info
 * chip and the collapsed "Bereits gefahren" chips. There is no header select
 * for route options — there is one main route, and alternatives are checked
 * in explicitly (FR29).
 *
 * All values come from the assessment (AD-2: views never compute domain
 * values); display aggregation (hero switch, options summary, staleness)
 * lives in the tested pure helpers of dayViewModel.ts.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import type {
  Assessment,
  LegAssessment,
  PlanningSnapshot,
  RouteOptionAssessment,
  StageAssessment,
  KursAbschnitt,
  LegHourBreakdown,
  PointPassage,
} from '../../domain/schema/snapshot.ts';
import { planOutdated, type DayReturnCheck } from '../../domain/schema/plan.ts';
import { forecastModelLabel } from '../../domain/schema/models.ts';
import type { KonzeptEignung } from '../../domain/schema/konzept.ts';
import {
  KONZEPT_REGLER,
  konzeptSchwellenOf,
  setKonzeptSchwelle,
  type KonzeptSchwellen,
} from '../../domain/konzept.ts';
import { planKey } from '../../domain/solver.ts';
import { departureHourChoices } from '../../domain/scoring.ts';
import { AbfahrtMenu } from '../components/AbfahrtMenu.tsx';
import { AmpelBadge, AMPEL_LABEL } from '../components/AmpelBadge.tsx';
import { PositionPopover } from '../components/PositionPopover.tsx';
import { TripStatusLine } from '../components/TripStatusLine.tsx';
import { RouteMap } from '../components/RouteMap.tsx';
import { StageMap } from '../components/StageMap.tsx';
import { StageThumb } from '../components/StageThumb.tsx';
import { WindBarb } from '../components/WindBarb.tsx';
import {
  altRouteAt,
  altRouteViews,
  EMPFEHLUNG_LABEL,
  KONZEPT_KURZ,
  OPTION_STATE_LABEL,
  type AltRouteView,
} from '../altRoutes.ts';
import {
  buildLegsById,
  pointNumberByForecastKey,
  stagePoints,
} from '../mapPath.ts';
import { usePlanning } from '../../app/planningContext.tsx';
import { useRouteView } from '../../app/routeViewContext.tsx';
import { STALE_TIME_MS } from '../../app/usePlanning.ts';
import {
  compass,
  formatAthensTime,
  formatDeg,
  formatHourOfDay,
  formatHours,
  formatKn,
  formatKursAbschnitt,
  formatKursAmpelRegel,
  formatStamp,
  formatTripDayDate,
  formatTripDayWeekdayShort,
  formatWindFrom,
  pointOfSail,
} from '../format.ts';
import {
  dayViewStages,
  kiteHinweisAnzeige,
  optionsSummary,
  staleForecastLabel,
} from '../dayViewModel.ts';
import { resolveMapsEnv } from '../mapsEnv.ts';
import {
  islandName,
  islandWithPlace,
  placeName,
  stageFrom,
  stageVia,
} from '../stageText.ts';

/**
 * Maps-Konfiguration — EINMAL pro View gelesen (Story 1.3, AC 9). Statisch,
 * weil Vite `import.meta.env` zur Buildzeit ersetzt; die Hinweistexte der
 * Karten-Fallbacks nennen darüber die tatsächlich fehlenden Variablen.
 */
const MAPS_ENV = resolveMapsEnv(
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined,
  import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined,
);
const MAPS_MISSING = MAPS_ENV.ok ? '' : MAPS_ENV.missing.join(', ');

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
  /**
   * KREUZEN GEHÖRT IN DIE ÜBERSCHRIFT, nicht in die Tabelle darunter.
   *
   * "22° TWA · gegenan" hat gelesen wie ein anliegender Kurs — dabei kann das
   * Schiff 22° gar nicht segeln (params.beatTwaDeg). Der Winkel, der wirklich
   * gesegelt wird, steht deshalb daneben, und die Kreuz-Stunden mit ihrem
   * Umweg stehen bei der Fahrt: das ist die Zeit, die die Etappe zusätzlich
   * kostet. Alle Werte kommen fertig aus der Bewertung (AD-2).
   */
  const kreuzStunde = leg.breakdown.find((h) => h.kreuzen);
  const kreuzt = leg.kreuzHours !== null && leg.kreuzHours > 0;
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
              {kreuzt && kreuzStunde && (
                <>
                  {' · '}
                  <strong>
                    Kreuzen ({formatDeg(kreuzStunde.sailedTwaDeg)} am Wind)
                  </strong>
                  {leg.wenden !== null && leg.wenden > 0 && (
                    <>
                      {' · '}
                      {leg.wenden} {leg.wenden === 1 ? 'Wende' : 'Wenden'} à{' '}
                      {formatDeg(2 * kreuzStunde.sailedTwaDeg)}
                    </>
                  )}
                </>
              )}
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
              {kreuzt && (
                <>
                  {' · '}
                  {formatHours(leg.kreuzHours!)} davon Kreuzschläge
                  {leg.kreuzExtraNm !== null && leg.kreuzExtraNm > 0 &&
                    ` (+${leg.kreuzExtraNm.toFixed(1).replace('.', ',')} sm durchs Wasser)`}
                </>
              )}
            </dd>
          </div>
        </dl>
      </div>
      <details className="beschreibung lesehilfe">
        <summary>Wie sind die Werte zu lesen?</summary>
        Windrichtung rechtweisend und <strong>kommend aus</strong>. TWA ist der
        Winkel zwischen anliegendem Kurs und Wind: 0° von vorn, 180° von
        achtern. Maßgeblich für die Ampel ist die schlechteste Stunde, nicht der
        Durchschnitt.
        {kreuzt && kreuzStunde && (
          <>
            {' '}
            Liegt der Kurs enger am Wind als{' '}
            {formatDeg(kreuzStunde.sailedTwaDeg)}, wird er nicht angelegen:
            gesegelt wird ein Schlag auf dem einen Bug mit{' '}
            {formatDeg(kreuzStunde.sailedTwaDeg)} zum Wind, dann gewendet (
            {formatDeg(2 * kreuzStunde.sailedTwaDeg)} Kursänderung) und wieder{' '}
            {formatDeg(kreuzStunde.sailedTwaDeg)} — Zickzack statt direkt. Die
            Fahrt in der Tabelle ist die auf der Ideallinie; durchs Wasser läuft
            das Boot schneller und weiter. Die gestrichelte Linie auf der Karte
            zeigt den Zickzack als Skizze — wo wirklich gewendet wird,
            entscheiden Dreher und Welle.
          </>
        )}
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
  const gekreuzt = hours.filter((h) => h.kreuzen).length;
  return (
    <div className="breakdown">
      {hours.length > 0 && (
        <p className="beschreibung">
          {hours.length} simulierte Stunden · {sailed} unter Segeln, {motored} unter
          Motor
          {gekreuzt > 0 && ` · ${gekreuzt} davon gekreuzt`}
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
                    title={
                      p.segment.kreuzen
                        ? 'Kurs liegt enger am Wind als das Schiff segeln kann — gerechnet mit Kreuzschlägen'
                        : 'Wahrer Windeinfallswinkel: 0° von vorn, 180° von achtern'
                    }
                  >
                    {formatDeg(p.segment.twaDeg)}{' '}
                    {p.segment.kreuzen ? 'Kreuzen' : pointOfSail(p.segment.twaDeg)}
                  </td>
                  <td data-label="Fahrt">
                    {p.segment.speedKn.toFixed(1)} kn
                    {p.segment.motoring ? ' (Motor)' : ''}
                    {p.segment.kreuzen ? ' (Kurs)' : ''}
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
 * DIE PROBLEMATISCHEN ABSCHNITTE des Tages — "ca. 4 sm Kreuz (16 kn)".
 *
 * Die Kacheln darüber nennen EINEN Wind für den ganzen Tag; die Zeilen hier
 * nennen die Meilen, auf denen er von vorn oder von der Seite kommt. Beides
 * zusammen ist die Antwort auf "was für ein Tag wird das an Bord?" — der
 * Mittelwert allein ist es nicht, denn vier Meilen gegenan verschwinden darin
 * (Skipper 2026-08-06).
 *
 * Fertig gerechnet aus der Bewertung (AD-2): Meilen, Wind und Ampel kommen aus
 * `stage.kursAbschnitte`. Die Ampel steht als Farbe UND als Wort — Farbe allein
 * trägt in dieser App keine Bedeutung —, und der Titel nennt die Schwellen,
 * gegen die gemessen wurde.
 */
function KursAbschnitte({
  abschnitte,
  params,
}: {
  abschnitte: KursAbschnitt[];
  params: PlanningSnapshot['params'];
}) {
  if (abschnitte.length === 0) return null;
  return (
    <div className="kurs-liste">
      {abschnitte.map((a) => (
        <span
          key={a.kategorie}
          className={`ampel ampel-${a.ampel} kurs-zeile`}
          title={formatKursAmpelRegel(a.kategorie, params)}
        >
          <span className="dot" />
          {formatKursAbschnitt(a)}
          <span className="urteil">{AMPEL_LABEL[a.ampel]}</span>
        </span>
      ))}
    </div>
  );
}

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
  const { editStage, releasePin, setStopHours, removeStopover } = usePlanning();
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
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
      // Fokus auf die Fehlermeldung, sobald sie gerendert ist (EXPERIENCE
      // StageEditor: aria-describedby + Fokus zum Fehler).
      requestAnimationFrame(() => errorRef.current?.focus());
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
          aria-describedby={error ? 'stage-editor-error' : undefined}
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
        Vortagsziel, die die Etappen-Bibliothek an einem Tag erreicht.
      </p>
      {placesOnIsland.length > 0 && (
        <label>
          Platz auf {islandName(snapshot, stage.toIslandId)}
          <select
            value={stage.placeIsSuggestion ? '' : (stage.placeId ?? '')}
            onChange={(e) =>
              apply(stage.toIslandId, e.target.value || undefined)
            }
            aria-describedby={error ? 'stage-editor-error' : undefined}
          >
            <option value="">— Vorschlag der App übernehmen —</option>
            {placesOnIsland.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} —{' '}
                {AMPEL_LABEL[nightAmpeln[p.id]?.[stage.day]?.ampel ?? 'unbewertet']}
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
            className="btn-secondary"
            onClick={() => setStopHours(stage.day, null)}
          >
            Standard ({snapshot.params.stopHoursDefault} h)
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
      {stage.legs.length > 1 && (
        <>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setError(null);
              if (removeStopover(stage.day)) {
                onClose();
              } else {
                setError(
                  `Der Zwischenstopp lässt sich nicht löschen — es gibt keine direkte Etappe zum Tagesziel ${islandName(snapshot, stage.toIslandId)}, und ein landfreier Direktkurs liess sich nicht berechnen.`,
                );
              }
            }}
          >
            Zwischenstopp löschen ({stageVia(snapshot, stage).join(' · ')})
          </button>
          <p className="beschreibung">
            Der Tag wird zu EINER direkten Etappe auf dasselbe Tagesziel — ohne
            den Anlauf von {stageVia(snapshot, stage).join(' und ')}. Kennt die
            Bibliothek keine direkte Verbindung, berechnet die App den
            kürzesten landfreien Kurs selbst (Distanz aus der Geometrie, nicht
            kuratiert). Der Tag gilt danach als festgelegt.
          </p>
        </>
      )}
      <div className="editor-actions">
        {stage.pinned && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              releasePin(stage.day);
              onClose();
            }}
          >
            Festlegung lösen
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={onClose}>
          Schließen
        </button>
      </div>
      {error && (
        <div
          className="error-panel"
          role="alert"
          id="stage-editor-error"
          tabIndex={-1}
          ref={errorRef}
        >
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * Etappen-Card, Consumer-Warm (Story 1.2): als HERO trägt sie das Display-Ziel
 * (die h1 der Ansicht), die Stat-Kacheln, den Abfahrt-Stepper (nur heute,
 * [ASSUMPTION: OQ5]) und die korallene Primär-CTA; als Zeilen-Variante im
 * Rest-Trip dieselbe Komposition in Headline-Typo mit Sekundär-CTA (ein
 * Display-Element und eine korallene CTA pro Screen). StageEditor und das
 * FR30-Rechnungs-Panel (StageMap → WindBasis → Breakdown) bleiben unverändert
 * in der Card montiert.
 */
function StageCard({
  stage,
  snapshot,
  nightAmpeln,
  hero,
  currentDay,
  onOpenPlace,
  mapId,
  returnCheck,
  harbourPointer,
  readOnly = false,
}: {
  stage: StageAssessment;
  snapshot: PlanningSnapshot;
  nightAmpeln: Assessment['nightAmpeln'];
  /** True for the ONE hero card of the view (display type, primary CTA). */
  hero: boolean;
  currentDay: number;
  onOpenPlace: (placeId: string, kiteSpotId?: string) => void;
  /** Null when no Maps key is configured — the panel then stays text-only. */
  mapId: string | null;
  /** Zielmodell v2 — der Heimweg-Status dieses Tages (Abbruch-Notation). */
  returnCheck?: DayReturnCheck | null;
  /** Hafentag-Hero: Hinweis auf den nächsten Segeltag ("Weiter am Mi: …"). */
  harbourPointer?: string | null;
  /**
   * Die Etappe einer ANGESEHENEN ALTERNATIVE: lesen ja, ändern nein.
   *
   * Ohne diese Sperre bearbeitete „Etappe ändern" die HAUPTROUTE, während der
   * Skipper eine ganz andere Route auf dem Schirm hat — eine stille Änderung
   * am falschen Plan. Ampel, Wind, Kreuz-Abschnitte und die Stundenrechnung
   * bleiben vollständig sichtbar: sie sind der Grund, sich eine Alternative
   * überhaupt anzusehen. Erst das Übernehmen (FR29) macht sie änderbar.
   */
  readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const { params } = snapshot;
  const { setDepartureHour } = usePlanning();
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

  const isHarbour = stage.kind === 'harbour';
  const isToday = stage.day === currentDay;
  const from = isHarbour ? null : stageFrom(snapshot, stage);
  const via = isHarbour ? [] : stageVia(snapshot, stage);
  const legReasons = stage.legs.flatMap((l) => l.reasons);
  const warn = stage.ampel === 'gelb' || stage.ampel === 'rot';

  const stageWord = isHarbour ? 'Hafentag' : `Etappe ${stage.stageNumber ?? '–'}`;
  const dayTag = hero
    ? isToday
      ? `Heute · ${stageWord}`
      : `Als Nächstes · Tag ${stage.day} · ${stageWord}`
    : `${stageWord} · Tag ${stage.day} · ${formatTripDayDate(params.tripStartDate, stage.day)}`;

  const headline = isHarbour
    ? `Hafentag in ${islandName(snapshot, stage.toIslandId)}`
    : islandName(snapshot, stage.toIslandId);

  /**
   * FR15 — die WIRKSAME Abfahrt kommt aus der Bewertung (StageAssessment):
   * dort steht die Stunde, gegen die dieser Tag gerechnet wurde. Die Kachel
   * leitet sie NICHT ein zweites Mal ab — sonst könnte sie eine Abfahrt
   * anzeigen, mit der die Ankunft darunter gar nicht gerechnet ist.
   */
  const departureHour = stage.abfahrtHourAthens;
  /** Die Stunden, die dieser Törntag zur Wahl stellt (Tag 1: plus 14–17 Uhr). */
  const departureChoices = useMemo(
    () => departureHourChoices(stage.day),
    [stage.day],
  );
  const lastLeg = stage.legs[stage.legs.length - 1];
  const lastEta =
    lastLeg?.pointPassages[lastLeg.pointPassages.length - 1]?.etaIso ?? null;
  const windLeg = stage.legs[0];
  /** Kite-Zeilen dieser Karte plus die Zahl der zusammengefassten (getestet). */
  const kite = kiteHinweisAnzeige(stage.kiteHinweise);

  return (
    <article className={hero ? 'card-surface hero-card' : 'card-surface'}>
      <div className="hero-top">
        <span className="card-overline">{dayTag}</span>
        <AmpelBadge ampel={stage.ampel} />
      </div>

      {/* Ziel links, Etappen-Schnipsel rechts oben (Skipper 2026-08-06): die
          Strecke stand bisher nur in der aufgeklappten Rechnung, und damit war
          die Frage „liegt das um die Ecke oder quer übers Revier?“ zwei Klicks
          entfernt. Der Schnipsel beantwortet sie im selben Blick wie den Namen
          — und klappt angetippt genau die Karte auf, deren Vorschau er ist. */}
      <div className="stage-head">
        <div className="stage-head-text">
          {from && <div className="route-from">{from} →</div>}
          {hero ? (
            <h1 className="route-dest">{headline}</h1>
          ) : (
            <h3 className="route-dest-sm">{headline}</h3>
          )}
          {!isHarbour && (
            <div className="route-sub">
              {placeName(snapshot, stage.placeId)}
              {via.length > 0 && ` · über ${via.join(' · ')}`}
            </div>
          )}
        </div>
        {!isHarbour && (
          <StageThumb
            points={points}
            ampel={stage.ampel}
            label={`${from ?? '–'} → ${headline}`}
            size={hero ? 'hero' : 'row'}
            expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          />
        )}
      </div>

      {(!isHarbour || stage.pinned) && (
        <div className="chip-list">
          {!isHarbour && distance > 0 && (
            <span className="chip">{Math.round(distance)} sm</span>
          )}
          {!isHarbour && (
            <span className="chip" title="Stunden unter Segeln und Motor">
              {formatHours(totalHours || null)} Fahrt
            </span>
          )}
          {!isHarbour && stage.stopHoursTotal > 0 && (
            <span
              className="chip"
              title="Geplante Liegezeit an den Zwischenstopps — verschiebt die Abfahrt der Folge-Etappe"
            >
              {formatHours(stage.stopHoursTotal)} Liegezeit
            </span>
          )}
          {/* Der Zwischenstopp ist die Ausnahme, nicht die Regel — geplant wird
              eine Verbindung pro Tag. Steht hier trotzdem einer, hat eine harte
              Bedingung ihn erzwungen, und der Tag sagt das statt es zu
              verschweigen (params.maxLegsPerDay / RELAXATION_ORDER). */}
          {!isHarbour && stage.legs.length > 1 && (
            <span
              className="chip"
              title="Normalerweise plant die App eine Verbindung pro Tag. Zwei Schläge an einem Tag kommen nur, wenn ein Tag je Verbindung den Stichtag oder einen festgesetzten Tag nicht mehr erreicht."
            >
              {stage.legs.length} Schläge an einem Tag — Ausnahme
            </span>
          )}
          {stage.pinned && <span className="chip">Festgelegt</span>}
        </div>
      )}

      {/* Gelb/Rot trägt die Begründung als Warn-Note im Ampel-Tint; ruhige
          Zustände als leise Liste (AC 6v). */}
      {legReasons.length > 0 &&
        (warn ? (
          <div className={`warn-note ${stage.ampel}`}>
            <ul>
              {legReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="reasons">
            {legReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ))}

      {!isHarbour && (
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="label">Abfahrt</div>
            {/* Die Kachel IST das Bedienelement: ein Klick öffnet die Stunden
                dieses Tages. Der frühere ±-Stepper stand nur an der
                Hero-Kachel von heute — an jedem anderen Tag zeigte die Karte
                eine Abfahrt, die sich nicht anfassen liess. Vergangene Tage
                sind gefahren und bleiben Anzeige. An einer nur ANGESEHENEN
                Alternative ebenso: die Abfahrt gehört dem Törntag, nicht der
                Route — sie hier zu verstellen änderte still die Rechnung der
                Hauptroute mit. */}
            {stage.day >= currentDay && !readOnly ? (
              <AbfahrtMenu
                variant="tile"
                day={stage.day}
                hours={departureChoices}
                value={departureHour}
                vomSkipper={stage.abfahrtVomSkipper}
                empfehlung={stage.abfahrtsEmpfehlung?.abfahrtHourAthens ?? null}
                standard={params.departureHourAthens}
                onPick={(hour) => setDepartureHour(stage.day, hour)}
              />
            ) : (
              <div className="value">{departureHour}:00</div>
            )}
          </div>
          <div className="stat-tile">
            <div className="label">Fahrtzeit</div>
            <div className="value">{formatHours(totalHours || null)}</div>
          </div>
          <div className="stat-tile">
            <div className="label">Ankunft</div>
            <div className="value">
              {lastEta ? `ca. ${formatAthensTime(lastEta)}` : '–'}
            </div>
          </div>
          <div className="stat-tile">
            <div className="label">Wind</div>
            <div className="value">
              {windLeg && windLeg.avgTwsKn !== null
                ? `${windLeg.avgTwdDeg !== null ? `${compass(windLeg.avgTwdDeg)} ` : ''}${formatKn(windLeg.avgTwsKn)}`
                : '–'}
            </div>
          </div>
        </div>
      )}

      {/* Kreuz und Halbwind des Tages — direkt unter der Wind-Kachel, weil sie
          deren Zahl aufschlüsselt: DA kommt der Wind von vorn, SO lange. */}
      {!isHarbour && (
        <KursAbschnitte abschnitte={stage.kursAbschnitte} params={params} />
      )}

      {/* Die ganze Zeile öffnet das Platzdetail — der Liegeplatz ist das Ziel
          des Tages, kein Fussnoten-Link. */}
      {stage.placeId ? (
        <button
          type="button"
          className="berth-line"
          onClick={() => onOpenPlace(stage.placeId!)}
        >
          <span className="name">{placeName(snapshot, stage.placeId)}</span>
          <span className="role">· Liegeplatz</span>
          {stage.placeIsSuggestion && (
            <span
              className="chip"
              title="Aktueller Vorschlag — ändert sich mit dem Forecast"
            >
              Vorschlag
            </span>
          )}
          <AmpelBadge ampel={stage.placeAmpel} />
        </button>
      ) : (
        <div className="berth-line" style={{ cursor: 'default' }}>
          <span className="name">–</span>
          <span className="role">· Liegeplatz</span>
          <AmpelBadge ampel={stage.placeAmpel} />
        </div>
      )}

      {/* "Früh los, 15:00 vor Anker" (Crowd-Strategie): die späteste Abfahrt,
          deren simulierte Ankunft das Ankerziel noch hält — gerechnet gegen
          denselben Stunden-Forecast wie die Ampel. Sie ist der DEFAULT der
          Abfahrt-Kachel; der Übernehmen-Knopf von früher ist damit weg. Weicht
          der Skipper ab, sagt die Zeile es und bietet den Rückweg an. */}
      {stage.kind === 'stage' && stage.abfahrtsEmpfehlung && (
        <div
          className={`abfahrt-zeile${stage.abfahrtsEmpfehlung.zielErreicht ? '' : ' verfehlt'}`}
        >
          {'⏰ '}
          Empfohlene Abfahrt{' '}
          <strong>{formatHourOfDay(stage.abfahrtsEmpfehlung.abfahrtHourAthens)}</strong>
          {' → vor Anker ca. '}
          <strong>{formatHourOfDay(stage.abfahrtsEmpfehlung.ankunftHourAthens)}</strong>
          {stage.abfahrtsEmpfehlung.zielErreicht
            ? ` (Ziel: ${params.zielAnkunftHourAthens}:00)`
            : ''}
          {stage.abfahrtsEmpfehlung.hinweis && (
            <div className="beschreibung">{stage.abfahrtsEmpfehlung.hinweis}</div>
          )}
          {/* Nur an der eigenen Route: an einer angesehenen Alternative wäre
              der Rückweg zur Empfehlung eine stille Änderung am fremden Plan. */}
          {stage.abfahrtVomSkipper && !readOnly && (
            <div className="beschreibung">
              Gerechnet wird mit deiner Abfahrt um {departureHour}:00.{' '}
              <button
                type="button"
                className="secondary"
                title="Gibt diesen Tag an die Empfehlung zurück — die Bewertung rechnet dann wieder ab der empfohlenen Stunde."
                onClick={() => setDepartureHour(stage.day, null)}
              >
                Empfehlung übernehmen
              </button>
            </div>
          )}
        </div>
      )}

      {/* ENTSCHEIDUNGSTOR (Törnanalyse): legt sich der Plan an diesem Tag
          hinter ein Tor fest, steht hier, ob 48-h-Fenster und Rückweg die
          Festlegung decken — die Entscheidung am Tag der Entscheidung. Der
          Status steht als Farbe UND im Text ("gedeckt" / "NICHT gedeckt" aus
          konzept.ts) — kein Emoji als Bedeutungsträger. */}
      {stage.torCheck && (
        <div className={`tor-zeile${stage.torCheck.erfuellt ? ' ok' : ' offen'}`}>
          {stage.torCheck.note}
        </div>
      )}

      {/* Zielmodell v2 — die Abbruch-Notation: geplant wird auf das
          Wetterfenster, abgesichert wird täglich. Diese Zeile sagt für DIESEN
          Tag, ob der Heimweg auch im Worst-Case hält oder woran der Skipper
          den Abbruch erkennt. Neu gerechnet mit jedem Forecast. Der Status
          steht als Farbe UND im Text — kein Emoji als Bedeutungsträger. */}
      {returnCheck && (
        <div className={`return-note status-${returnCheck.status}`}>
          {returnCheck.note}
        </div>
      )}

      {/* KITE-HINWEISE des Tages (domain/kite.ts, Skipper-Wunsch 2026-08-06):
          die kuratierten Spots auf Start- und Ziel-Insel und am Kurs. Sie
          stehen NACH Abfahrt, Tor und Heimweg-Status, weil sie nichts
          entscheiden — und tragen bewusst keine Ampel-Farbe: ein grüner Kasten
          neben einer gelben Etappe würde wie ein zweites, freundlicheres
          Urteil über denselben Tag gelesen. Was passt, trägt darum den
          Kite-Ton als Kante, alles andere bleibt eine ruhige Zeile; die
          Aussage steht im Text (formuliert in der Domain, AD-2).
          Die Zeile ist ein Knopf: sie öffnet den Spot im Platzdetail seines
          Bezugs-Liegeplatzes. */}
      {stage.kiteHinweise.length > 0 && (
        <div className="kite-zeilen">
          {kite.gezeigt.map((h) => (
            <button
              type="button"
              key={h.spotId}
              className={`kite-zeile ${h.eignung}`}
              onClick={() => onOpenPlace(h.placeId, h.spotId)}
              title="Spot-Details im Platzdetail des Bezugs-Liegeplatzes öffnen"
            >
              <span className="glyph" aria-hidden="true">
                ◆
              </span>
              <span className="text">
                Kite: {h.text}
                {h.basis === 'annahme' && ' (Annahme jenseits des Forecast-Horizonts)'}
              </span>
              <span className="link" aria-hidden="true">
                Spot →
              </span>
            </button>
          ))}
          {/* Keine stille Kürzung: was nicht als Zeile steht, steht als Zahl. */}
          {kite.weitere > 0 && (
            <p className="kite-weitere">
              {kite.weitere === 1
                ? 'Ein weiterer Kite-Spot liegt an diesem Tag'
                : `${kite.weitere} weitere Kite-Spots liegen an diesem Tag`}{' '}
              — heute passt die Windrichtung dort nicht. Auf der Karte sichtbar.
            </p>
          )}
        </div>
      )}

      {isHarbour && harbourPointer && (
        <div className="next-sailing">{harbourPointer}</div>
      )}

      {/* Hafentag-HERO: bewusst OHNE Kacheln, Stepper und CTA (EXPERIENCE-
          Variante) — Umplanung bleibt über die Rest-Trip-Zeilen und den
          Optionsraum erreichbar. */}
      {!(hero && isHarbour) && (
        <div className="cta-column">
          {/* An einer angesehenen Alternative fehlt der Ändern-Knopf: er würde
              die Hauptroute bearbeiten, die gerade gar nicht im Bild ist. */}
          {!readOnly && (
            <button
              type="button"
              className={hero ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? 'Bearbeiten abbrechen' : 'Etappe ändern'}
            </button>
          )}
          {!isHarbour && (
            <button
              type="button"
              className="btn-ghost"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Rechnung ausblenden' : 'Wie kommt die Zeit zustande?'}
            </button>
          )}
        </div>
      )}

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
              // Fertig gerechnet aus der Bewertung (AD-2) — die Karte legt
              // keine Kurse, sie zeichnet die gelegten.
              kreuzTracks={stage.legs.map((l) =>
                l.kreuzTrack.map((c) => ({ lat: c.lat, lng: c.lon })),
              )}
              ampel={stage.ampel}
              mapId={mapId}
              onOpenPlace={onOpenPlace}
            />
          ) : (
            <p className="beschreibung">
              Tageskarte nicht verfügbar — es fehlt: <code>{MAPS_MISSING}</code>.
              Die Rechnung unten ist davon unberührt.
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

/**
 * Zustands-, Konzept- und Empfehlungs-Beschriftungen leben in altRoutes.ts:
 * die Karten-Ansicht nennt dieselben Routen und braucht dieselben Wörter
 * (Skipper 2026-08-06 — „die Namen sind anders").
 */
const EIGNUNG_LABEL: Record<KonzeptEignung, string> = {
  geeignet: 'trägt',
  grenzwertig: 'grenzwertig',
  ungeeignet: 'trägt nicht',
};

/**
 * ROUTEN-KONZEPT — die zentrale, alles überschreibende Logik der App
 * (Skipper 2026-08-05, domain/konzept.ts): NACH WELCHEM der beiden
 * Revier-Konzepte segeln wir? Hier steht sie als EINE Aussage mit Begründung,
 * Wechsel-Hinweis und der Rückweg-Empfehlung der Törnanalyse.
 *
 * NACHGEORDNET UND EINGEKLAPPT (Skipper 2026-08-06). Das Panel stand zuvor
 * ausgeschrieben zwischen Statuszeile und Hero und schob damit den heutigen
 * Tag — das, womit die Ansicht beginnen soll — unter den Falz. Die Entscheidung
 * ist zwar übergeordnet, aber sie fällt selten: der Solver hat sie beim Ranking
 * bereits angewendet, die Options-Liste trägt sie je Ziel. Sie gehört deshalb
 * ans Ende, hinter den Optionsraum, als Summenzeile im Haus-Muster (wie dieser)
 * — aufklappbar, wenn der Skipper sie nachlesen will.
 *
 * Was NICHT verschwinden darf, ist der Fall, in dem das aktive Konzept kippt:
 * dafür steht über dem Hero eine einzeilige Alarm-Zeile (`konzept-alarm`), die
 * dieses Panel aufklappt und anspringt — ein Satz statt eines halben Bildschirms.
 */
/**
 * DIE SCHWELLEN ALS REGLER (Skipper 2026-08-06). Wo "zu viel Wind" anfängt,
 * ist kein Naturgesetz, sondern die Risikobereitschaft dieses Skippers auf
 * diesem Törn — und weil die Schwelle nur noch bestimmt, wovon ABGERATEN wird
 * (nichts wird gesperrt), kann sie gefahrlos in seine Hand.
 *
 * Die Regler stehen bewusst IM Konzept-Panel, direkt unter den Karten, deren
 * Eignungs-Chips sie umschalten: der Effekt ist im selben Blick sichtbar.
 * Bereiche, Schritt und Beschriftung kommen aus `KONZEPT_REGLER`
 * (domain/konzept.ts) — das Formular weiss nichts über das Revier.
 */
function KonzeptRegler({ snapshot }: { snapshot: PlanningSnapshot }) {
  const { setKonzeptSchwellen, konzeptReglerVerstellt } = usePlanning();
  const stand = konzeptSchwellenOf(snapshot.params);

  /**
   * Der Stand WÄHREND des Ziehens. Jede Übergabe an die Engine rechnet den
   * Solver neu — der teuerste Schritt der ganzen Bewertung — und ein
   * `<input type="range">` feuert bei jedem Pixel. Der Regler folgt deshalb
   * sofort der Hand (Entwurf), gerechnet wird, sobald sie still steht.
   * Null = kein Entwurf offen, es gilt der Stand der Engine.
   */
  const [entwurf, setEntwurf] = useState<KonzeptSchwellen | null>(null);
  const anzeige = entwurf ?? stand;

  useEffect(() => {
    if (!entwurf) return;
    const timer = setTimeout(() => {
      setKonzeptSchwellen(entwurf);
      setEntwurf(null);
    }, 200);
    return () => clearTimeout(timer);
  }, [entwurf, setKonzeptSchwellen]);

  return (
    <details className="hint-panel konzept-regler">
      <summary>
        Ab wann rät die App ab? — Schwellen einstellen
        {konzeptReglerVerstellt && <span className="badge badge-frist">verstellt</span>}
      </summary>
      <p className="beschreibung">
        Ein Konzept gilt als „trägt nicht", sobald der Revier-Spitzenwind die
        Schwelle über so viele Tage IN FOLGE erreicht. Die Voreinstellung stammt
        aus der Törnanalyse. Die Regler ändern nur, wovon die App abrät — gesperrt
        wird nichts.
      </p>
      {KONZEPT_REGLER.map((r) => (
        <label className="regler-zeile" key={r.key}>
          <span className="regler-kopf">
            <span className="regler-label">{r.label}</span>
            <output className="regler-wert">
              {anzeige[r.key]} {r.einheit}
            </output>
          </span>
          <input
            type="range"
            min={r.min}
            max={r.max}
            step={r.step}
            value={anzeige[r.key]}
            onChange={(e) =>
              // Die Bewegungsregeln (Klemme, "Route 2 schiebt Route 1 mit")
              // stehen in der Domäne — das Formular wendet sie nur an.
              setEntwurf(setKonzeptSchwelle(anzeige, r.key, Number(e.target.value)))
            }
          />
          <span className="beschreibung">{r.hilfe}</span>
        </label>
      ))}
      {konzeptReglerVerstellt && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setEntwurf(null);
            setKonzeptSchwellen(null);
          }}
        >
          Zurück auf die Werte der Törnanalyse
        </button>
      )}
    </details>
  );
}

function KonzeptPanel({
  assessment,
  snapshot,
  open,
  onToggle,
  panelRef,
  altRoutes,
  shownAltIndex,
  onShow,
}: {
  assessment: Assessment;
  snapshot: PlanningSnapshot;
  /** Eingeklappt oder offen — der Stand liegt in der DayView, weil auch die
   *  Alarm-Zeile über dem Hero ihn aufklappt. */
  open: boolean;
  onToggle: () => void;
  panelRef: RefObject<HTMLElement | null>;
  /** Die ansehbaren Routen — je Konzept-Karte die, die ihm folgen. */
  altRoutes: AltRouteView[];
  shownAltIndex: number | null;
  onShow: (index: number) => void;
}) {
  const entscheid = assessment.konzeptEntscheid;
  // Das aktive Konzept trägt die Summenzeile: es ist die eine Aussage, die
  // eingeklappt sichtbar bleiben muss. Die Karten führen es immer, aber die
  // Zeile darf daran nicht zerbrechen.
  const aktiv = entscheid.konzepte.find((k) => k.aktiv) ?? entscheid.konzepte[0] ?? null;
  const empfohlen =
    entscheid.konzepte.find((k) => k.id === entscheid.empfohlenId) ?? null;

  return (
    <section className="konzept-panel" ref={panelRef}>
      <h2 className="section-title">Routen-Konzept</h2>
      <div className="list-card">
        <button
          type="button"
          className="trip-row summary-row"
          aria-expanded={open}
          aria-controls="konzept-detail"
          onClick={onToggle}
        >
          <span>
            <span className="place">
              {aktiv ? aktiv.name : 'Nach welchem Konzept segeln wir?'}
            </span>
            <span className="meta">
              {entscheid.wechselHinweis
                ? 'Das aktive Konzept trägt die Lage nicht — Begründung und Wechsel-Empfehlung ansehen.'
                : empfohlen && aktiv && empfohlen.id === aktiv.id
                  ? 'Trägt die Lage — Empfehlung der App. Beurteilung, Karten und Schwellen ansehen.'
                  : 'Beurteilung beider Konzepte, Schwellen und Rückweg-Empfehlung ansehen.'}
            </span>
          </span>
          {aktiv && (
            <span className={`state-chip eignung-${aktiv.eignung}`}>
              {EIGNUNG_LABEL[aktiv.eignung]}
            </span>
          )}
          <span className="chev" aria-hidden="true">
            ›
          </span>
        </button>
        {open && (
          <div id="konzept-detail" className="optionsraum-body">
            <p className="beschreibung">
              Die übergeordnete Törn-Entscheidung: Route 1 (klassische Runde,
              Rückweg im westlichen Lee-Korridor) oder Route 2 (Ost-Kykladen,
              nur bei moderatem Meltemi). Vorschlag und Rangfolge der App folgen
              dieser Beurteilung — kippt das aktive Konzept, empfiehlt die App
              den Wechsel. Beide Konzepte und alle Routen darin bleiben trotzdem
              wählbar: bei zu viel Wind rät die App ab, sie sperrt nicht. Das
              Konzept wählt keine Route aus; es beurteilt, ob die Wetterlage die
              Strategie trägt, der eine Route folgt. Welche Routen das je
              Konzept sind, steht unten in seiner Karte — dieselben, die der
              Optionsraum listet und die Karten-Ansicht als Linie zeigt.
            </p>
            {entscheid.wechselHinweis && (
              <div className="hint-panel konzept-wechsel">
                <strong>{entscheid.wechselHinweis}</strong>
              </div>
            )}
            <div className="konzept-karten">
              {entscheid.konzepte.map((k) => (
                <div
                  key={k.id}
                  className={`konzept-karte eignung-${k.eignung}${k.empfohlen ? ' empfohlen' : ''}`}
                >
                  <div className="option-kopf">
                    <span className="option-name">{k.name}</span>
                    <span className={`state-chip eignung-${k.eignung}`}>
                      {EIGNUNG_LABEL[k.eignung]}
                    </span>
                  </div>
                  <p className="beschreibung">{k.beschreibung}</p>
                  <div className="badges">
                    {k.aktiv && (
                      <span className="badge" title="Die aktuelle Haupt- bzw. Vorschlagsroute folgt diesem Konzept.">
                        aktives Konzept
                      </span>
                    )}
                    {k.empfohlen && (
                      <span className="badge badge-empfohlen">Empfehlung der App</span>
                    )}
                  </div>
                  <ul className="reasons">
                    {k.gruende.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                  {/* WELCHE ROUTEN FOLGEN DIESEM KONZEPT (Skipper 2026-08-06):
                      das Panel beurteilte zwei Strategien, ohne je zu sagen,
                      welche der ansehbaren Routen dazugehören — die Kette
                      Konzept → Optionsraum → Linie auf der Karte war von hier
                      aus unsichtbar. Jetzt steht sie hier namentlich, in
                      derselben Farbe, mit demselben Knopf wie im Optionsraum. */}
                  {(() => {
                    const routen = altRoutes.filter(
                      (r) => r.option?.konzeptId === k.id,
                    );
                    if (routen.length === 0) {
                      return (
                        <p className="beschreibung">
                          Derzeit keine ansehbare Route in diesem Konzept.
                        </p>
                      );
                    }
                    return (
                      <div className="konzept-routen">
                        <span className="versal">Routen in diesem Konzept</span>
                        {routen.map((r) => (
                          <button
                            key={r.index}
                            type="button"
                            className="konzept-route-zeile"
                            aria-pressed={r.index === shownAltIndex}
                            onClick={() => onShow(r.index)}
                          >
                            <span
                              className="alt-farbe"
                              style={{ background: r.color }}
                              aria-hidden="true"
                            />
                            <span className="kr-name">{r.name}</span>
                            <span className="kr-meta">
                              {r.index === shownAltIndex
                                ? 'wird angesehen'
                                : 'Etappen ansehen ›'}
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
            <KonzeptRegler snapshot={snapshot} />
            {entscheid.basisAnnahme && (
              <p className="beschreibung">
                Die Konzept-Beurteilung stützt sich teilweise auf die
                Persistenz-Annahme jenseits des Forecast-Horizonts — Vorbehalt,
                kein Urteil.
              </p>
            )}
            {assessment.rueckwegEmpfehlung.length > 0 && (
              <div className="rueckweg-empfehlung">
                <span className="versal">Rückweg-Empfehlung</span>
                <ul className="reasons">
                  {assessment.rueckwegEmpfehlung.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * DER KOPF DER ALTERNATIV-ANSICHT (Skipper 2026-08-06): „Für mich reicht es,
 * wenn ich eine Alternative wie in der Kartenansicht anschauen kann — dann
 * erkenne ich anhand der einzelnen Etappen, warum sie möglicherweise nicht
 * geeignet ist."
 *
 * Genau das passiert hier: die gewählte Alternative (routeViewContext, dieselbe
 * Wahl wie auf der Karte) übernimmt die ganze Tagesansicht. Dieser Kopf sagt,
 * WELCHE Route man sieht und woher sie kommt; darunter stehen ihre Etappen in
 * denselben Karten wie die der Hauptroute — mit Ampel, Kreuz-Abschnitten,
 * Abfahrt/Ankunft und der aufklappbaren Stundenrechnung.
 *
 * Die frühere `AltPreview` (Routenkarte + Kurzliste, eingeklappt IN der
 * Options-Zeile) ist damit ersetzt: zwei Arten, dieselbe Route anzusehen, waren
 * ein Teil des Problems. Übernommen wird weiterhin nur nach dem Ansehen —
 * der Knopf steht hier, nicht an der Options-Zeile (Feedback 2026-08-05).
 */
function AltRouteBanner({
  route,
  snapshot,
  mapId,
  onOpenMap,
  onClose,
}: {
  route: AltRouteView;
  snapshot: PlanningSnapshot;
  mapId: string | null;
  onOpenMap?: () => void;
  onClose: () => void;
}) {
  const { checkIn } = usePlanning();
  const option = route.option;
  const stages = route.plan.stages.filter((s) => s.kind === 'stage');
  const nm = stages.reduce(
    (sum, s) => sum + s.legs.reduce((l, leg) => l + (leg.sailedLeg?.distanceNm ?? 0), 0),
    0,
  );

  return (
    <section className="alt-banner" style={{ borderLeftColor: route.color }}>
      <div className="option-kopf">
        <span className="option-name">
          <span className="alt-farbe" style={{ background: route.color }} />
          {route.name}
        </span>
        <span className="state-chip">Alternative</span>
      </div>

      <p className="alt-banner-lead">
        <strong>Angesehen, nicht übernommen</strong> — die Hauptroute bleibt,
        wie sie ist.
      </p>

      {/* Die Antwort auf „wie passt das mit Routen-Konzept und Optionsraum
          zusammen?" — sie steht AN der Route, nicht in einem anderen Panel. */}
      <p className="beschreibung">{route.herkunft}</p>

      <div className="badges">
        <span className="badge" title="Insel am fernen Ende dieser Route">
          Wendepunkt {route.turnName}
        </span>
        <span className="badge">
          {route.stageCount} Etappen{nm > 0 && ` · ${Math.round(nm)} sm`}
        </span>
        {route.plan.turnDay !== null && (
          <span className="badge">Wende an Tag {route.plan.turnDay}</span>
        )}
        {option && (
          <>
            <span className={`state-chip state-${option.state}`}>
              {OPTION_STATE_LABEL[option.state]}
            </span>
            <span
              className={`badge badge-empfehlung badge-empfehlung-${option.empfehlung}`}
              title="Empfehlung der App zu dieser Route. Abgeraten heisst abgeraten, nicht gesperrt."
            >
              {EMPFEHLUNG_LABEL[option.empfehlung]}
            </span>
            <span className="badge badge-konzept">{KONZEPT_KURZ[option.konzeptId]}</span>
            {option.closesOnDay !== null && (
              <span className="badge badge-frist">
                Entscheidung bis Tag {option.closesOnDay}
              </span>
            )}
          </>
        )}
      </div>

      {option?.costNote && (
        <p className="beschreibung">Kostet: {option.costNote}.</p>
      )}

      {mapId ? (
        <RouteMap
          stages={route.plan.stages}
          snapshot={snapshot}
          color={route.color}
          mapId={mapId}
        />
      ) : (
        <p className="beschreibung">
          Routenkarte nicht verfügbar — es fehlt: <code>{MAPS_MISSING}</code>. Die
          Etappen unten sind davon unberührt.
        </p>
      )}

      {route.abratenGruende.length > 0 && (
        <div className="hint-panel abraten-hinweis">
          <strong>
            Von dieser Route wird abgeraten — übernehmen kannst du sie trotzdem.
          </strong>
          <ul className="reasons">
            {route.abratenGruende.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="beschreibung">
        Unten stehen die Etappen DIESER Route, Tag für Tag — Ampel, Wind,
        Kreuz-Abschnitte und Ankunft wie bei der Hauptroute. Geändert wird an
        einer Alternative nichts: erst das Übernehmen macht sie zur Hauptroute
        (bisherige Festlegungen werden dabei gelöst).
      </p>

      <div className="alt-banner-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            checkIn(route.plan.plan);
            onClose();
          }}
        >
          {route.abratenGruende.length > 0
            ? 'Trotz Abraten als Hauptroute übernehmen'
            : 'Als Hauptroute übernehmen'}
        </button>
        {onOpenMap && (
          <button type="button" className="btn-secondary" onClick={onOpenMap}>
            Auf der Karte zeigen
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={onClose}>
          Zurück zur Hauptroute
        </button>
      </div>
    </section>
  );
}

/**
 * FR9/FR18/FR20/FR29 — EINE Zeile je Option, verschmolzen mit ihrer
 * Alternativ-Route (Feedback 2026-08-05: Optionsraum und "Andere Round-Trips"
 * waren zwei Listen über dieselbe Frage; dieselben Ziele standen doppelt da —
 * einmal mit Preis und Frist, einmal mit Vorschau).
 *
 * Drei Angaben je Option, und keine davon darf fehlen:
 *   Reichweite — wie weit komme ich damit (die Törnfrage),
 *   Preis      — was nehme ich dafür in Kauf (Doppelschläge, Nachtetappen),
 *   Frist      — bis wann kann ich mich noch dafür entscheiden.
 *
 * Dazu die ROUTE hinter diesen Angaben: `route` ist der bewertete Plan der
 * Option (assessment.alternatives[previewIndex] — angesehen wird exakt, was
 * übernommen würde, AD-3), mit Farbe und Namen der Karten-Ansicht. „Etappen
 * ansehen" schlägt sie oben in der Tagesansicht auf, Tag für Tag; das ist
 * derselbe Knopf wie die Routenwahl auf der Karte, nur von hier aus.
 */
function OptionRow({
  option,
  snapshot,
  today,
  route,
  onShow,
  shown,
}: {
  option: RouteOptionAssessment;
  snapshot: PlanningSnapshot;
  today: number;
  /** Null: kein Plan — oder der Plan ist bereits die Hauptroute. */
  route: AltRouteView | null;
  /** Diese Route ansehen (Tagesansicht schlägt ihre Etappen auf). */
  onShow: (index: number) => void;
  /** True, während genau diese Route oben angesehen wird. */
  shown: boolean;
}) {
  const rest = option.closesOnDay !== null ? option.closesOnDay - today : null;
  const dringend =
    rest !== null && rest >= 0 && rest <= snapshot.params.decisionLookaheadDays;
  /** previewIndex null TROTZ Plan heisst genau: entspricht der Hauptroute. */
  const istHauptroute = option.plan !== null && route === null;
  const color = route?.color ?? null;

  return (
    <div
      className={`option-row state-${option.state} empfehlung-${option.empfehlung}${dringend ? ' dringend' : ''}`}
    >
      <div className="option-kopf">
        <span className="option-name">
          {color && <span className="alt-farbe" style={{ background: color }} />}
          {option.name}
        </span>
        <span className={`state-chip state-${option.state}`}>
          {OPTION_STATE_LABEL[option.state]}
        </span>
      </div>

      <div className="badges">
        {/* Die Empfehlung steht NEBEN dem Zustand, nicht statt seiner: der
            Zustand sagt, ob es geht, die Empfehlung, ob die App dazu rät.
            Abgeraten ist kein Ausschluss — die Route bleibt ansehbar und
            übernehmbar (Skipper 2026-08-06). */}
        <span
          className={`badge badge-empfehlung badge-empfehlung-${option.empfehlung}`}
          title="Empfehlung der App zu dieser Route. Abgeraten heisst abgeraten, nicht gesperrt."
        >
          {EMPFEHLUNG_LABEL[option.empfehlung]}
        </span>
        <span
          className={`badge badge-konzept${option.konzeptWarnung ? ' badge-konzept-warnung' : ''}`}
          title="Routen-Konzept dieser Option (siehe Panel „Routen-Konzept“)."
        >
          {KONZEPT_KURZ[option.konzeptId]}
        </span>
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
          : option.plan
            ? 'Kein tragfähiger Plan zu diesem Ziel — der beste Versuch steht trotzdem zum Ansehen bereit.'
            : 'Für dieses Ziel gibt es derzeit keinen tragfähigen Plan.'}
        {istHauptroute && ' Dieser Plan ist bereits die Hauptroute.'}
      </div>

      {/* Warum abgeraten wird, steht AN der Option, nicht nur im Panel oben:
          wer hier "Verlängerung Amorgos · offen" liest, soll im selben Blick
          sehen, dass das Ost-Konzept die Lage gerade nicht trägt — und dass
          die Route deswegen nicht weg ist, sondern nur nicht empfohlen. */}
      {option.abratenGruende.map((g) => (
        <div className="konzept-warnung" key={g}>
          {g}
        </div>
      ))}

      {option.reasons.length > 0 && (
        <ul className="reasons">
          {option.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {route && (
        <div className="stage-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onShow(route.index)}
            aria-pressed={shown}
          >
            {shown ? 'Wird oben angesehen' : 'Etappen ansehen'}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * FR29/AD-13 — eine Alternative, auf die KEINE Option zeigt: der FR2-Zeuge,
 * wenn sein Plan von keinem Optionsplan abgedeckt ist. Er steht hinter den
 * Optionen in derselben Sektion — ein gelbes Licht muss einlösbar bleiben.
 */
function AlternativeRow({
  route,
  snapshot,
  onShow,
  shown,
}: {
  route: AltRouteView;
  snapshot: PlanningSnapshot;
  onShow: (index: number) => void;
  shown: boolean;
}) {
  const stages = route.plan.stages.filter((s) => s.kind === 'stage');
  return (
    <div className="alt-route" style={{ borderLeftColor: route.color }}>
      <div className="option-kopf">
        <span className="option-name">
          <span className="alt-farbe" style={{ background: route.color }} />
          {route.name}
        </span>
        <span className="beschreibung">{stages.length} Etappen</span>
      </div>
      <p className="beschreibung">{route.herkunft}</p>
      <span className="legs-inline">
        {stages.slice(0, 6).map((s) => (
          <span className="leg-chip" key={s.day}>
            {islandName(snapshot, s.toIslandId)}
          </span>
        ))}
        {stages.length > 6 && <span className="leg-chip">…</span>}
      </span>
      <div className="stage-actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onShow(route.index)}
          aria-pressed={shown}
        >
          {shown ? 'Wird oben angesehen' : 'Etappen ansehen'}
        </button>
      </div>
    </div>
  );
}

export function DayView({
  snapshot,
  assessment,
  onOpenPlace,
  onOpenMap,
}: {
  snapshot: PlanningSnapshot;
  assessment: Assessment;
  /** Zweiter Parameter: Kite-Spot, den das Platzdetail hervorheben soll. */
  onOpenPlace: (placeId: string, kiteSpotId?: string) => void;
  /**
   * Zur Karten-Ansicht wechseln — die angesehene Route bleibt dabei stehen
   * (routeViewContext). Optional, damit die View ohne Navigationsrahmen rendert.
   */
  onOpenMap?: () => void;
}) {
  const day = snapshot.trip.currentDay;
  const { params } = snapshot;
  const { checkIn } = usePlanning();
  const hereName = assessment.currentIslandId
    ? islandName(snapshot, assessment.currentIslandId)
    : null;

  const main = assessment.mainRoute;

  /**
   * DIE ANGESEHENE ROUTE (Skipper 2026-08-06): dieselbe Wahl wie auf der Karte
   * (routeViewContext). Ist eine Alternative gewählt, zeigt die Tagesansicht
   * DEREN Etappen — in denselben Karten wie die der Hauptroute, damit sich an
   * den einzelnen Etappen erkennen lässt, warum eine Route taugt oder nicht.
   * Der Plan selbst bleibt unangetastet, bis die Route übernommen wird (FR29).
   */
  const { shownAltIndex, showAlt } = useRouteView();
  const altRoutes = useMemo(
    () => altRouteViews(assessment, (id) => islandName(snapshot, id)),
    [assessment, snapshot],
  );
  const shownRoute = altRouteAt(altRoutes, shownAltIndex);
  const viewRoute = shownRoute?.plan ?? main;

  /** Hero-Switch + Listen-Split — pure helper (AC 8/9), kein eigenes Branching. */
  const { hero, rest, past } = dayViewStages(
    viewRoute,
    day,
    assessment.currentIslandId,
  );
  /** Abbruch-Notation je Tag (Zielmodell v2) — für die Etappen-Cards. */
  const returnCheckByDay = new Map(
    (viewRoute?.returnChecks ?? []).map((c) => [c.day, c]),
  );

  /**
   * Eine Alternative ansehen und an den Kopf der Seite springen — sonst
   * schaltete der Knopf im Optionsraum eine Ansicht um, die weit über dem
   * sichtbaren Ausschnitt beginnt.
   */
  const showRoute = (index: number) => {
    showAlt(index);
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };

  // Staleness (FR13/AD-7): geprüft höchstens einmal pro Minute; das Label
  // selbst kommt aus dem getesteten Helper (AC 2/14).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const staleLabel = staleForecastLabel(assessment.fetchedAtIso, nowMs, STALE_TIME_MS);

  // AC 3 — nach jeder Neuberechnung des ganzen Plans (Editor-Apply, Check-in,
  // Refresh mit neuem Verdikt) landet der Fokus auf der Statuszeile, die das
  // neue Verdikt über ihre Live-Region ansagt. Erst-Render übersprungen.
  const statusRef = useRef<HTMLButtonElement>(null);
  const planStamp = main ? `${planKey(main.plan)}|${assessment.restTripAmpel}` : null;
  const prevStamp = useRef<string | null>(null);
  useEffect(() => {
    if (
      prevStamp.current !== null &&
      planStamp !== null &&
      prevStamp.current !== planStamp
    ) {
      statusRef.current?.focus();
    }
    prevStamp.current = planStamp;
  }, [planStamp]);

  const [assumptionOpen, setAssumptionOpen] = useState(false);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [showAllRest, setShowAllRest] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  // Das Konzept-Panel steht am Ende und ist eingeklappt; die Alarm-Zeile über
  // dem Hero klappt es auf und springt es an — deshalb liegen Stand und Anker
  // hier oben, nicht im Panel.
  const [konzeptOpen, setKonzeptOpen] = useState(false);
  const konzeptRef = useRef<HTMLElement>(null);

  /**
   * PPR-Hinweise für das Statuszeilen-Detail (Feedback 2026-08-05): an der
   * Basis trägt der einzige Hinweis ("Bereits an der Basis") nichts — dort
   * bleibt die Liste leer.
   */
  const atBase = assessment.currentIslandId === params.baseIslandId;
  const pprHinweise = atBase ? [] : assessment.ppr.reasons;

  /**
   * Alternativen, auf die KEINE Option zeigt — nach Konstruktion der FR2-Zeuge,
   * wenn sein Plan von keinem Optionsplan abgedeckt ist (AD-13: ein gelbes
   * Licht muss einlösbar bleiben). Sie behalten ihren Index in
   * `assessment.alternatives`, damit die Farbe zur Karten-Ansicht passt.
   */
  const extraAlternatives = altRoutes.filter((r) => r.option === null);

  const summary = optionsSummary(assessment.routeOptions);
  const hasOptionContent =
    assessment.routeOptions.length > 0 || extraAlternatives.length > 0;
  const visibleRest = showAllRest ? rest : rest.slice(0, 3);

  // Hafentag-Hero: Zeiger auf den nächsten Segeltag ("Weiter am Mi: A → B").
  const nextSailing =
    hero && hero.kind === 'harbour' && viewRoute
      ? (viewRoute.stages.find((s) => s.day > hero.day && s.kind === 'stage') ?? null)
      : null;
  const harbourPointer =
    hero && nextSailing
      ? `Weiter am ${formatTripDayWeekdayShort(params.tripStartDate, nextSailing.day)}: ${islandName(snapshot, hero.toIslandId)} → ${islandName(snapshot, nextSailing.toIslandId)}`
      : null;

  // Exactly ONE APIProvider for the whole view: several expanded stage cards
  // then share a single Maps script load instead of each mounting its own.
  // Story 1.3, AC 9: fehlende Konfiguration ist ein benannter Fehler — kein
  // stiller Demo-Map-Fallback (mapsEnv.ts, MAPS_ENV oben im Modul).
  const mapId = MAPS_ENV.ok ? MAPS_ENV.env.mapId : null;

  const content = (
    <div>
      <TripStatusLine
        assessment={assessment}
        main={main}
        pprHinweise={pprHinweise}
        staleLabel={staleLabel}
        triggerRef={statusRef}
      />

      <div className="day-context">
        <div className="day-kicker">
          Tag {day} · {formatTripDayDate(params.tripStartDate, day)}
        </div>
        <div className="day-where">
          <span>
            {hereName ? (
              <>
                Position: <strong>{hereName}</strong>
                {snapshot.trip.position?.source === 'manual' &&
                  ' (manuell gesetzt)'}
                {snapshot.trip.position?.source === 'gps' && ' (GPS)'}
              </>
            ) : (
              'Position unbekannt'
            )}
          </span>
          <PositionPopover />
        </div>
        {assessment.positionNote && (
          <div className="hint-panel">{assessment.positionNote}</div>
        )}
      </div>

      {/* Kippt das aktive Konzept, ist das der wichtigste Satz der Seite — und
          bleibt oben stehen, während das Panel selbst ans Ende gewandert ist.
          Eine Zeile, kein Panel: der heutige Tag beginnt gleich darunter. */}
      {assessment.konzeptEntscheid.wechselHinweis && (
        <button
          type="button"
          className="konzept-alarm"
          onClick={() => {
            setKonzeptOpen(true);
            // scrollIntoView fehlt in jsdom — die Zeile klappt trotzdem auf.
            konzeptRef.current?.scrollIntoView?.({
              behavior: 'smooth',
              block: 'start',
            });
          }}
        >
          <span className="status-dot rot" aria-hidden="true" />
          <span>
            <strong>Das aktive Routen-Konzept trägt diese Lage nicht.</strong>{' '}
            Begründung und Wechsel-Empfehlung ansehen
          </span>
          <span className="chev" aria-hidden="true">
            ›
          </span>
        </button>
      )}

      {/* DIE ANGESEHENE ALTERNATIVE übernimmt die Ansicht: Kopf mit Herkunft
          und Übernehmen-Knopf, darunter ihre Etappen in denselben Karten wie
          die der Hauptroute. Solange sie steht, bleiben die Hinweise zur
          Hauptroute (Vorschlag, veralteter Solver-Stand) aus dem Bild — sie
          gehören zu einer Route, die man gerade nicht ansieht. */}
      {shownRoute && (
        <AltRouteBanner
          route={shownRoute}
          snapshot={snapshot}
          mapId={mapId}
          onOpenMap={onOpenMap}
          onClose={() => showAlt(null)}
        />
      )}

      {!shownRoute && !main && assessment.proposal && (
        <div className="card-surface hero-card">
          <h1 className="route-dest-sm">Noch keine Hauptroute festgelegt.</h1>
          <p>
            Vorschlag der App:{' '}
            {islandName(snapshot, assessment.proposal.turnIslandId)} und zurück,{' '}
            {assessment.proposal.stages.filter((s) => s.kind === 'stage').length}{' '}
            Etappen.
          </p>
          <div className="cta-column">
            <button
              type="button"
              className="btn-primary"
              onClick={() => checkIn(assessment.proposal!.plan)}
            >
              Vorschlag übernehmen
            </button>
          </div>
        </div>
      )}

      {/* Veralteter Solver-Stand: die Fälle, die der Auto-Refresh (usePlanning)
          bewusst NICHT anfasst — Törn läuft schon oder Pins gesetzt. Die
          Neuberechnung bleibt dann eine sichtbare Skipper-Entscheidung. */}
      {!shownRoute &&
        main &&
        planOutdated(main.plan) &&
        assessment.proposal &&
        planKey(assessment.proposal.plan) !== planKey(main.plan) && (
          <div className="hint-panel">
            Der Planer wurde verbessert — die gespeicherte Hauptroute stammt aus
            einer älteren Version und würde so nicht mehr vorgeschlagen.
            Übernehmen ersetzt sie durch den aktuellen Vorschlag; bisherige
            Festlegungen werden dabei gelöst.{' '}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => checkIn(assessment.proposal!.plan)}
            >
              Route neu berechnen
            </button>
          </div>
        )}

      {hero && (
        <StageCard
          stage={hero}
          snapshot={snapshot}
          nightAmpeln={assessment.nightAmpeln}
          hero
          currentDay={day}
          onOpenPlace={onOpenPlace}
          mapId={mapId}
          returnCheck={returnCheckByDay.get(hero.day) ?? null}
          harbourPointer={harbourPointer}
          readOnly={shownRoute !== null}
        />
      )}

      {/* AD-13 revised: the app always routes — where the forecast runs out it
          says so instead of falling silent. This is the ONE place that states
          the extent of the assumption for the whole plan; the per-day cards
          only carry the short marker. */}
      {assessment.assumedFromDay !== null && (
        <div>
          <button
            type="button"
            className="info-chip"
            aria-expanded={assumptionOpen}
            aria-controls="assumption-detail"
            onClick={() => setAssumptionOpen((o) => !o)}
          >
            <span className="i" aria-hidden="true">
              i
            </span>
            <span>
              Ab Tag {assessment.assumedFromDay} beruht die Planung auf einer{' '}
              <u>Annahme</u>.
            </span>
          </button>
          {assumptionOpen && (
            <div id="assumption-detail" className="trip-status-detail">
              <p>{assessment.assumptionNote}</p>
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
                {/* Die EINE Stelle, an der die Nahtstelle erklärt wird: ohne sie
                    liest sich der Sprung in der Stundentabelle (FR30) wie ein
                    Fehler, statt wie zwei Modelle, die sich uneins sind. */}
                {assessment.provenance?.wind.near && (
                  <li>
                    Nahfeld {forecastModelLabel(assessment.provenance.wind.near)} trägt
                    die ersten {assessment.provenance.wind.nearReachHours} Stunden (bis{' '}
                    {formatStamp(
                      snapshot.times[assessment.provenance.wind.nearReachHours - 1] ?? null,
                    )}
                    ), danach {forecastModelLabel(assessment.provenance.wind.far)} — harte
                    Übergabe, es wird nichts geglättet. Ein Sprung an dieser Stunde ist
                    keine Störung, sondern der Abstand zwischen zwei Modellen.
                  </li>
                )}
                <li>
                  Eine Annahme kann den Rest-Trip nicht grün machen — aber auch nicht rot:
                  sie warnt, sie verurteilt nicht.
                </li>
              </ul>
            </div>
          )}
        </div>
      )}

      {rest.length > 0 && (
        <section>
          <h2 className="section-title">
            {shownRoute ? 'Weitere Etappen dieser Alternative' : 'Rest-Trip'}
          </h2>
          <div className="list-card">
            {visibleRest.map((s) => (
              <div key={s.day}>
                <button
                  type="button"
                  className="trip-row"
                  aria-expanded={expandedDay === s.day}
                  onClick={() =>
                    setExpandedDay((d) => (d === s.day ? null : s.day))
                  }
                >
                  <span className="tag">Tag {s.day}</span>
                  <span className="place">
                    {s.kind === 'harbour' ? 'Hafentag: ' : ''}
                    {islandWithPlace(snapshot, s.toIslandId, s.placeId)}
                  </span>
                  <span className="verdict">
                    <span className={`status-dot ${s.ampel}`} aria-hidden="true" />{' '}
                    {AMPEL_LABEL[s.ampel]}
                  </span>
                  <span className="chev" aria-hidden="true">
                    ›
                  </span>
                </button>
                {expandedDay === s.day && (
                  <div className="trip-row-body">
                    <StageCard
                      stage={s}
                      snapshot={snapshot}
                      nightAmpeln={assessment.nightAmpeln}
                      hero={false}
                      currentDay={day}
                      onOpenPlace={onOpenPlace}
                      mapId={mapId}
                      returnCheck={returnCheckByDay.get(s.day) ?? null}
                      readOnly={shownRoute !== null}
                    />
                  </div>
                )}
              </div>
            ))}
            {rest.length > 3 && (
              <button
                type="button"
                className="trip-row more"
                aria-expanded={showAllRest}
                onClick={() => setShowAllRest((v) => !v)}
              >
                {showAllRest
                  ? 'Weniger anzeigen'
                  : `Alle ${rest.length} Tage anzeigen`}
              </button>
            )}
          </div>
        </section>
      )}

      {/* FR9/FR18/FR20/FR29 — Optionsraum und Alternativ-Routen VERSCHMOLZEN
          (Feedback 2026-08-05), jetzt hinter einer eingeklappten Summenzeile:
          "{N} Optionen offen · Nächste Deadline: Tag X". Die Sektion ist NIE
          versteckt — null offene Optionen sind eine Aussage, kein Leerraum. */}
      <section>
        <h2 className="section-title">Optionsraum</h2>
        <div className="list-card">
          {hasOptionContent ? (
            <button
              type="button"
              className="trip-row summary-row"
              aria-expanded={optionsOpen}
              onClick={() => setOptionsOpen((o) => !o)}
            >
              <span>
                <span className="place">
                  {summary.openCount === 0
                    ? 'Keine Optionen mehr offen — Rückweg fixiert.'
                    : summary.openCount === 1
                      ? '1 Option offen'
                      : `${summary.openCount} Optionen offen`}
                </span>
                {summary.openCount === 0 ? (
                  <span className="meta">
                    Der Plan folgt der festgelegten Rückroute; neue Fenster
                    meldet der nächste Forecast-Lauf.
                  </span>
                ) : (
                  summary.nextDeadlineDay !== null && (
                    <span className="meta">
                      Nächste Deadline: Tag {summary.nextDeadlineDay}
                    </span>
                  )
                )}
              </span>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </button>
          ) : (
            <div className="optionsraum-body">
              <strong>Keine Optionen mehr offen — Rückweg fixiert.</strong>
              <p className="trip-caption">
                Der Plan folgt der festgelegten Rückroute; neue Fenster meldet
                der nächste Forecast-Lauf.
              </p>
            </div>
          )}
          {optionsOpen && hasOptionContent && (
            <div className="optionsraum-body">
              {/* WIE DAS ZUSAMMENHÄNGT (Skipper 2026-08-06): Konzept →
                  Optionsraum → Alternative auf der Karte war drei Namen für
                  eine Sache. Der Satz sagt die Kette, die Zeilen darunter
                  tragen sie: derselbe Name, dieselbe Farbe, dieselbe Route. */}
              <p className="beschreibung">
                Reichweite, Preis und Frist je Route — eine Option schliesst an dem
                Tag, ab dem kein tragfähiger Restplan mehr existiert. Jede Option
                IST eine dieser Routen: „Etappen ansehen“ schlägt sie hier oben
                Tag für Tag auf, und in der Karten-Ansicht liegt genau sie unter
                demselben Namen und derselben Farbe als Linie im Bild.
                Das Routen-Konzept (Panel darunter) sagt, welcher der beiden
                Revier-Strategien eine Option folgt — es wählt keine Route aus,
                es beurteilt, ob deren Konzept die Wetterlage trägt. Übernommen
                wird eine Route erst nach dem Ansehen.
              </p>
              {assessment.routeOptions.map((o) => (
                <OptionRow
                  key={o.routeId}
                  option={o}
                  snapshot={snapshot}
                  today={day}
                  route={altRouteAt(altRoutes, o.previewIndex)}
                  onShow={showRoute}
                  shown={o.previewIndex !== null && o.previewIndex === shownAltIndex}
                />
              ))}
              {extraAlternatives.map((r) => (
                <AlternativeRow
                  key={`${r.plan.variantId}-${r.turnIslandId}`}
                  route={r}
                  snapshot={snapshot}
                  onShow={showRoute}
                  shown={r.index === shownAltIndex}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ROUTEN-KONZEPT — die zentrale Logik, hinter dem Optionsraum und
          eingeklappt: die Entscheidung liegt über allem, fällt aber selten,
          und der Solver hat sie oben schon angewendet (siehe KonzeptPanel). */}
      <KonzeptPanel
        assessment={assessment}
        snapshot={snapshot}
        altRoutes={altRoutes}
        shownAltIndex={shownAltIndex}
        onShow={showRoute}
        open={konzeptOpen}
        onToggle={() => setKonzeptOpen((o) => !o)}
        panelRef={konzeptRef}
      />

      {past.length > 0 && (
        <section>
          <h2 className="section-title">
            <button
              type="button"
              aria-expanded={pastOpen}
              onClick={() => setPastOpen((o) => !o)}
            >
              Bereits gefahren ({past.length})
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </button>
          </h2>
          {pastOpen && (
            <div className="chip-list">
              {past.map((s) => (
                <span className="chip" key={s.day}>
                  {s.stageNumber !== null ? `Etappe ${s.stageNumber}: ` : ''}
                  {islandName(snapshot, s.toIslandId)} (Tag {s.day})
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Die früheren Sektionen "Point of Return" und "Entscheidungspunkte"
          sind bewusst ENTFERNT (Feedback 2026-08-05): am Seitenende trugen
          sie nichts — alles stand dort doppelt. Der späteste Umkehrtag und
          "Meltemi-fest bis" stehen jetzt im Detail der Trip-Statuszeile oben
          (neben der Rückkehr-Frist, zu der sie gehören), die PPR-Hinweise in
          dessen Begründungsliste — und `assessment.decisionPoints` rendert
          seit Story 1.2 ebenfalls dort (FR20 sichtbar). Die Options-Fristen
          aus FR20 zeigt der Optionsraum weiterhin je Option (Frist-Badge
          inkl. Dringlichkeit und Preis). */}

      {/* Die frühere Sektion "Platzbibliothek — Alle Plätze mit Nacht-Ampel"
          ist bewusst ENTFERNT (Feedback 2026-08-05): ~60 Plätze des ganzen
          Reviers unter Tag 1 sind Rauschen — Aegiali liegt mehrere Tagesreisen
          entfernt. Plätze erscheinen jetzt nur im Kontext ihrer Insel: im
          Platz-Dropdown der Etappe (mit Ampel) und auf der Karte entlang des
          Plans. Ungültige Platz-Dokumente meldet weiterhin der Seeding-Report. */}
    </div>
  );

  // Missing config: render the view unchanged. The day cards then explain the
  // missing map in place, exactly as the map view does — never a crash (NFR).
  if (!MAPS_ENV.ok) return content;
  return <APIProvider apiKey={MAPS_ENV.env.apiKey}>{content}</APIProvider>;
}
