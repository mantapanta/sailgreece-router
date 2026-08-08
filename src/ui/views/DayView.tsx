/**
 * FR28/FR30 — Tagesansicht "Was machen wir heute?", seit 2026-08-08 die
 * FREIE HANDPLANUNG.
 *
 * Der Skipper legt die Kette selbst, Tag für Tag, Insel zu Insel: jeder Tag
 * eine Auswahl, jede Insel des Reviers zulässig, jede Verbindung erlaubt
 * (`domain/manualPlan.ts`). Die Ansicht RECHNET ihm den Tag vor — Distanz,
 * Abfahrt, Fahrtzeit, Ankunft, Wind auf Kurs, Nacht-Ampel des Liegeplatzes —
 * und beurteilt seinen Törn NICHT: kein Optionsraum, kein Routen-Konzept, kein
 * Point of Return, keine Alternativen, kein Vorschlag, keine Rest-Trip-Ampel.
 *
 * Was davon verschwunden ist, steht nicht im Papierkorb, sondern hinter einem
 * Schalter: `domain/features.ts` (ROUTENBERATUNG). Die Ansichten dazu liegen
 * in der Git-Historie vor diesem Commit.
 *
 * Alle Werte kommen weiterhin aus der Bewertung (AD-2: Views rechnen keine
 * Domänenwerte); die Anzeige-Aggregation (Hero-Switch, Staleness) lebt in den
 * getesteten Helfern von dayViewModel.ts.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import type {
  Assessment,
  LegAssessment,
  PlanningSnapshot,
  StageAssessment,
  KursAbschnitt,
  LegHourBreakdown,
  PointPassage,
} from '../../domain/schema/snapshot.ts';
import { forecastModelLabel } from '../../domain/schema/models.ts';
import { planIsEmpty } from '../../domain/manualPlan.ts';
import { departureHourChoices, kreuzGelbReason } from '../../domain/scoring.ts';
import { AbfahrtMenu } from '../components/AbfahrtMenu.tsx';
import { AmpelBadge, AMPEL_LABEL } from '../components/AmpelBadge.tsx';
import { PositionPopover } from '../components/PositionPopover.tsx';
import { StageMap } from '../components/StageMap.tsx';
import { StageThumb } from '../components/StageThumb.tsx';
import { WindBarb } from '../components/WindBarb.tsx';
import {
  buildLegsById,
  pointNumberByForecastKey,
  stagePoints,
} from '../mapPath.ts';
import { usePlanning } from '../../app/planningContext.tsx';
import { STALE_TIME_MS } from '../../app/usePlanning.ts';
import {
  compass,
  formatAthensTime,
  formatDeg,
  formatHourOfDay,
  formatHours,
  formatKn,
  formatKnPrecise,
  formatKursAbschnitt,
  formatKursAmpelRegel,
  formatSm,
  formatStamp,
  formatTripDayDate,
  formatTripDayWeekdayShort,
  formatTripRange,
  formatWindFrom,
  pointOfSail,
} from '../format.ts';
import {
  dayViewStages,
  kiteHinweisAnzeige,
  stageFocusPlacement,
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
              {formatKnPrecise(leg.avgSpeedKn)}
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
  // Summiert wird die DAUER der Schritte, nicht ihre Zahl: ein Schritt endet
  // am Kurswechsel und ist damit meist kürzer als eine Stunde (assessLeg).
  const summe = (auswahl: (h: LegHourBreakdown) => boolean): number =>
    hours.filter(auswahl).reduce((s, h) => s + h.hours, 0);
  const simuliert = summe(() => true);
  const sailed = summe((h) => !h.motoring);
  const motored = summe((h) => h.motoring);
  const gekreuzt = summe((h) => h.kreuzen);
  return (
    <div className="breakdown">
      {hours.length > 0 && (
        <p className="beschreibung">
          {formatHours(simuliert)} simuliert · {formatHours(sailed)} unter Segeln,{' '}
          {formatHours(motored)} unter Motor
          {gekreuzt > 0 && ` · ${formatHours(gekreuzt)} davon gekreuzt`}
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
              <td data-label="Distanz ab Start">{formatSm(p.distanceNm)}</td>
              {p.segment ? (
                <>
                  <td data-label="Abschnitt">{formatSm(p.segment.distanceNm)}</td>
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
                    {formatKnPrecise(p.segment.speedKn)}
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
 * Sie stehen als Chip BEI LÄNGE UND DAUER (Skipper 2026-08-07): "14 sm Kreuz"
 * ist eine Angabe über dieselbe Strecke wie "36 sm" und dieselben Stunden wie
 * "4,9 h Fahrt" — als eigener getönter Kasten unter den Kacheln war es ein
 * zweiter Block, der wie ein zweites Urteil über den Tag aussah. Der
 * Mittelwert der Wind-Kachel allein beantwortet "was für ein Tag wird das an
 * Bord?" nicht: vier Meilen gegenan verschwinden darin (Skipper 2026-08-06) —
 * deshalb bleibt die Angabe, sie wird nur kompakt.
 *
 * Fertig gerechnet aus der Bewertung (AD-2): Meilen, Wind und Ampel kommen aus
 * `stage.kursAbschnitte`. Der Titel nennt die Schwellen, gegen die gemessen
 * wurde; das Ampel-Wort steht für Screenreader dabei, sichtbar trägt es die
 * Karte schon als Badge — zweimal "GELB" auf einer Karte ist Lärm, nicht
 * Bedeutung.
 *
 * GEZEIGT WIRD NUR, WAS DRÜCKT: grüne Abschnitte bleiben weg (Skipper
 * 2026-08-07). Zehn grüne Halbwind-Meilen sind keine Meldung, sondern ein
 * normaler Segeltag. Gerechnet werden sie weiter (die Fahrtzeit steckt in den
 * Kacheln), sie melden sich bloss nicht mehr.
 */
function KursChips({
  abschnitte,
  params,
}: {
  /** Bereits gefiltert: nur die Abschnitte, die gemeldet werden. */
  abschnitte: KursAbschnitt[];
  params: PlanningSnapshot['params'];
}) {
  return (
    <>
      {abschnitte.map((a) => (
        <span
          key={a.kategorie}
          className={`chip kurs-chip ampel-${a.ampel}`}
          title={formatKursAmpelRegel(a.kategorie, params)}
        >
          <span className="dot" aria-hidden="true" />
          {formatKursAbschnitt(a)}
          <span className="visually-hidden"> — {AMPEL_LABEL[a.ampel]}</span>
        </span>
      ))}
    </>
  );
}

/**
 * DER TAGES-EDITOR — freie Handplanung (Skipper 2026-08-08).
 *
 * „Ich plane den Trip Insel zu Insel frei von Hand … alle Verbindungen sind
 * zugelassen."
 *
 * Es gibt hier deshalb KEINE gefilterte Auswahl mehr. Bis 2026-08-07 zeigte
 * das Tagesziel nur Inseln in Tagesreichweite, für die eine Runde existierte,
 * die rechtzeitig zur Basis zurückkommt — und lehnte alles andere mit einer
 * Begründung ab, die der Skipper nicht bestellt hatte. Jetzt steht jede Insel
 * des Reviers zur Wahl, und was der Schlag kostet, sagt die Karte hinterher in
 * Meilen, Stunden und Wind.
 *
 * Fehlschlagen kann eine Wahl nur noch aus EINEM Grund: für einen Schlag der
 * Kette findet sich kein landfreier Kurs. Eine Luftlinie über Land behauptet
 * diese App nie.
 */
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
  const { planDay, planStopover, setStopHours } = usePlanning();
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  /** ALLE Inseln der Bibliothek, alphabetisch — die Auswahl filtert nichts. */
  const islands = useMemo(
    () =>
      [...snapshot.library.islands].sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [snapshot.library.islands],
  );
  const isHarbour = stage.kind === 'harbour';
  const placesOnIsland = snapshot.library.places.filter(
    (p) => p.islandId === stage.toIslandId,
  );

  /** Ausgangsinsel des Tages — sie kann weder Ziel noch Zwischenstopp sein. */
  const fromIslandId = stage.legs[0]?.sailedLeg?.fromIslandId ?? null;

  /**
   * DER ZWISCHENSTOPP DES TAGES — einer, denn ein Tag trägt höchstens zwei
   * Schläge. Auch er ist frei: jede Insel, die nicht Start oder Ziel ist, und
   * fehlt eine der beiden Hälften in der Bibliothek, wird sie erzeugt.
   */
  const stopover = stage.zwischenstopps[0] ?? null;
  const stopoverIslandOptions = islands.filter(
    (i) => i.id !== stage.toIslandId && i.id !== fromIslandId,
  );
  /**
   * Die Häfen der Stopp-Insel — ALLE, ohne Ampel und ohne Rangfolge. Am
   * Zwischenstopp muss das Boot nicht sicher liegen (Skipper 2026-08-07): die
   * Nacht-Kriterien beantworten eine Frage, die hier niemand stellt.
   */
  const placesOnStopoverIsland = stopover
    ? snapshot.library.places.filter((p) => p.islandId === stopover.islandId)
    : [];

  /** Fehler zeigen und den Fokus dorthin führen. */
  const fail = (text: string) => {
    setError(text);
    requestAnimationFrame(() => errorRef.current?.focus());
  };

  const apply = (islandId: string | null, placeId?: string) => {
    setError(null);
    if (planDay(stage.day, { islandId, placeId })) {
      onClose();
      return;
    }
    fail(
      islandId
        ? `Nach ${islandName(snapshot, islandId)} findet die App keinen landfreien Kurs — weder direkt noch über die bekannten Etappen. Eine Luftlinie über Land behauptet sie nicht. Über eine Zwischeninsel geht derselbe Weg: erst dorthin, am nächsten Tag weiter.`
        : 'Dieser Tag lässt sich nicht als Hafentag setzen — für den Kurs des Folgetags fände die App dann keinen landfreien Weg mehr.',
    );
  };

  /** Zwischenstopp setzen, verlegen oder löschen — EIN Weg für alle drei. */
  const applyStopover = (islandId: string | null, placeId?: string) => {
    setError(null);
    if (planStopover(stage.day, islandId, placeId)) {
      onClose();
      return;
    }
    fail(
      islandId === null
        ? `Der Zwischenstopp lässt sich nicht löschen — für den direkten Kurs nach ${islandName(snapshot, stage.toIslandId)} findet sich kein landfreier Weg.`
        : `Über ${islandName(snapshot, islandId)} liess sich kein landfreier Weg zum Tagesziel ${islandName(snapshot, stage.toIslandId)} legen.`,
    );
  };

  return (
    <div className="stage-editor">
      <label>
        Tagesziel (Insel)
        <select
          value={isHarbour ? '' : stage.toIslandId}
          onChange={(e) => apply(e.target.value || null)}
          aria-describedby={error ? 'stage-editor-error' : undefined}
        >
          <option value="">— Hafentag: hier bleiben —</option>
          {islands.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </label>
      <p className="beschreibung">
        Jede Insel des Reviers — nichts ist gesperrt. Kennt die Bibliothek die
        Verbindung nicht, rechnet die App den kürzesten landfreien Kurs selbst
        (Distanz aus der Geometrie, nicht kuratiert). Die Tage davor bleiben
        stehen; die Tage danach behalten ihr Ziel und werden neu verbunden.
      </p>
      {placesOnIsland.length > 0 && (
        <label>
          Platz auf {islandName(snapshot, stage.toIslandId)}
          <select
            value={stage.placeIsSuggestion ? '' : (stage.placeId ?? '')}
            onChange={(e) =>
              apply(isHarbour ? null : stage.toIslandId, e.target.value || undefined)
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
      {!isHarbour && stopoverIslandOptions.length > 0 && (
        <>
          <label>
            Zwischenstopp (Insel)
            <select
              value={stopover?.islandId ?? ''}
              onChange={(e) => applyStopover(e.target.value || null)}
              aria-describedby={error ? 'stage-editor-error' : undefined}
            >
              <option value="">— kein Zwischenstopp —</option>
              {stopoverIslandOptions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <p className="beschreibung">
            Baden, essen, weiterfahren: das Tagesziel bleibt dasselbe, der Tag
            fährt nur über diese Insel. Beide Hälften des Umwegs dürfen erzeugt
            werden, wenn die Bibliothek sie nicht kennt.
          </p>
        </>
      )}
      {stopover && placesOnStopoverIsland.length > 1 && (
        <>
          <label>
            Hafen des Zwischenstopps
            <select
              value={stopover.placeIsCurated ? '' : (stopover.placeId ?? '')}
              onChange={(e) =>
                applyStopover(stopover.islandId, e.target.value || undefined)
              }
              aria-describedby={error ? 'stage-editor-error' : undefined}
            >
              <option value="">— Hafen der Etappe (kuratiert) —</option>
              {placesOnStopoverIsland.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <p className="beschreibung">
            Ohne Ampel, und das ist der Unterschied zum Liegeplatz oben: die
            Ampel-Kriterien beurteilen eine NACHT am Platz — am Zwischenstopp
            wird gebadet, gegessen und weitergefahren. Was der Umweg kostet,
            sagen Länge und Fahrtzeit dieses Tages.
          </p>
        </>
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
      <div className="editor-actions">
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
  harbourPointer,
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
  /** Hafentag-Hero: Hinweis auf den nächsten Segeltag ("Weiter am Mi: …"). */
  harbourPointer?: string | null;
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

  /**
   * KREUZEN STEHT EINMAL AUF DER KARTE (Skipper 2026-08-07).
   *
   * Der Chip bei Länge und Dauer sagt es in Meilen ("ca. 14 sm Kreuz … davon
   * 4 sm Kreuzschläge"), die Begründungsliste sagte dasselbe noch einmal in
   * Stunden ("Kurs liegt enger als 50° am Wind — 0,5 h Kreuzschläge nötig").
   * Zwei Sätze über denselben Befund lesen sich wie zwei Befunde. Gefiltert
   * wird gegen den EXAKTEN Satz aus der Domäne (`kreuzGelbReason`) statt gegen
   * ein Teilwort — und nur, solange der Chip wirklich steht: meldet keiner der
   * Abschnitte etwas (grüner Kreuz-Abschnitt bei wenig Wind), bleibt der Satz
   * die einzige Stelle, an der die Kreuz-Stunden auftauchen.
   */
  const kursGemeldet = stage.kursAbschnitte.filter((a) => a.ampel !== 'gruen');
  const kreuzImChip = kursGemeldet.some((a) => a.kreuzNm > 0);
  const kreuzSaetze = new Set(
    kreuzImChip
      ? stage.legs
          .filter((l) => l.kreuzHours !== null && l.kreuzHours > 0)
          .map((l) => kreuzGelbReason(l.kreuzHours!, params))
      : [],
  );
  const legReasons = stage.legs
    .flatMap((l) => l.reasons)
    .filter((r) => !kreuzSaetze.has(r));
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
  /**
   * Der Hinweis an der Abfahrt-Kachel — zwei Zustände, beide klein:
   * "empfohlen" bestätigt den Default, "Empfehlung 09:00" ist der Weg zurück
   * zu ihm. Gefahrene Tage bekommen keinen: dort ist nichts mehr zu wählen.
   */
  const empfehlung =
    stage.kind === 'stage' && stage.day >= currentDay
      ? stage.abfahrtsEmpfehlung
      : null;
  const abfahrtHinweis = empfehlung
    ? stage.abfahrtVomSkipper
      ? `Empfehlung ${formatHourOfDay(empfehlung.abfahrtHourAthens)}`
      : 'empfohlen'
    : null;
  const abfahrtHinweisTitel = empfehlung
    ? [
        `Früh los: Abfahrt ${formatHourOfDay(empfehlung.abfahrtHourAthens)}, ` +
          `vor Anker ca. ${formatHourOfDay(empfehlung.ankunftHourAthens)} ` +
          `(Ziel ${params.zielAnkunftHourAthens}:00).`,
        empfehlung.hinweis,
        stage.abfahrtVomSkipper
          ? `Gerechnet wird mit deiner Abfahrt um ${departureHour}:00.` +
            ' Die Kachel gibt den Tag an die Empfehlung zurück.'
          : null,
      ]
        .filter(Boolean)
        .join(' ')
    : undefined;
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

      {!isHarbour && (
        <div className="chip-list">
          {!isHarbour && distance > 0 && (
            <span className="chip">{Math.round(distance)} sm</span>
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
          {/* Kreuz und Halbwind gehören zu Länge und Dauer: sie schlüsseln
              genau diese beiden Zahlen auf. */}
          {!isHarbour && (
            <KursChips abschnitte={kursGemeldet} params={params} />
          )}
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
                sind gefahren und bleiben Anzeige. */}
            {stage.day >= currentDay ? (
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
              <div className="value">{formatHourOfDay(departureHour)}</div>
            )}
            {/* "Früh los, 15:00 vor Anker" (Crowd-Strategie) — als kleiner
                Hinweis AN DER ABFAHRT, nicht als eigener Kasten weiter unten
                (Skipper 2026-08-07). Die Empfehlung ist der Default dieser
                Kachel; solange sie gilt, genügt das Wort. Weicht der Skipper
                ab, nennt der Hinweis die empfohlene Stunde — zurück geht es
                über die Kachel selbst, deren Menü die Empfehlung als erste
                Zeile führt. Ein zweiter Knopf dafür wäre eine zweite Stelle,
                an der dieselbe Entscheidung fällt (AbfahrtMenu). Alles Weitere
                — Ankerzeit, Ziel, verfehltes Ziel — steht im Titel. */}
            {abfahrtHinweis && (
              <div
                className={`abfahrt-hinweis${empfehlung!.zielErreicht ? '' : ' verfehlt'}`}
                title={abfahrtHinweisTitel}
              >
                {abfahrtHinweis}
              </div>
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

      {/* ENTSCHEIDUNGSTOR und HEIMWEG-STATUS standen hier als eigene Zeilen —
          "48-h-Fenster gedeckt", "Heimweg hält auch bei vollem Meltemi". Beide
          sind mit der Routenberatung entfallen (Skipper 2026-08-08): sie
          BEURTEILTEN den Törn, und genau das soll die Karte nicht mehr tun.
          Gerechnet werden sie weiterhin (konzept.ts, solver.ts) — der Schalter
          dafür steht in domain/features.ts. */}

      {/* Der Heimweg-Status stand hier als eigene Zeile an JEDER Karte ("Heimweg
          hält auch bei vollem Meltemi …") und sagte an den meisten Tagen
          dasselbe: alles gut. Er ist damit entfallen (Skipper 2026-08-07). Die
          Abbruch-Notation selbst bleibt gerechnet und steht dort, wo sie über
          den ganzen Törn gelesen wird: in der Trip-Statuszeile ("Meltemi-fest
          bis Tag n"). */}

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

      {/* WINDSCHATTEN an den Etappen des Tages (domain/windTopo.ts, Skipper
          2026-08-07): die kuratierte Abdeckung hinter den hohen Inseln, die
          ICON-EU auf 7 km nicht auflöst — die Grösse für die Rückweg-Planung.

          Ohne Ampel-Farbe, und das ist dieselbe Entscheidung wie bei den
          Kite-Zeilen, nur schärfer: ein Lee-Hinweis darf NIE wie ein zweites,
          freundlicheres Urteil über denselben Tag aussehen. Die Etappe hat
          genau eine Ampel, und die rechnet mit dem vollen Modellwind — das
          steht im Text, den die Domäne formuliert (AD-2). */}
      {stage.leeHinweise.length > 0 && (
        <div className="lee-zeilen">
          {stage.leeHinweise.map((h) => (
            <p className="lee-zeile" key={`${h.zoneId}-${h.legId}`}>
              <span className="glyph" aria-hidden="true">
                ▚
              </span>
              <span className="text">
                Windschatten: {h.text}
                {h.basis === 'annahme' && ' (Annahme jenseits des Forecast-Horizonts)'}
              </span>
            </p>
          ))}
        </div>
      )}

      {isHarbour && harbourPointer && (
        <div className="next-sailing">{harbourPointer}</div>
      )}

      {/* JEDER Tag lässt sich ändern — auch der Hafentag-Hero. Bis 2026-08-08
          fehlte ihm der Knopf, weil Umplanung über den Optionsraum lief; den
          gibt es nicht mehr, und ein Tag ohne Ziel ist gerade der, an dem man
          eines setzen will. */}
      <div className="cta-column">
          <button
            type="button"
            className={hero ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setEditing((v) => !v)}
          >
            {editing
              ? 'Bearbeiten abbrechen'
              : isHarbour
                ? 'Tag ändern'
                : 'Etappe ändern'}
          </button>
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

export function DayView({
  snapshot,
  assessment,
  onOpenPlace,
  focusDay = null,
  onOpenMap,
}: {
  snapshot: PlanningSnapshot;
  assessment: Assessment;
  /** Zweiter Parameter: Kite-Spot, den das Platzdetail hervorheben soll. */
  onOpenPlace: (placeId: string, kiteSpotId?: string) => void;
  /**
   * Törntag, der beim Öffnen angesprungen werden soll — gesetzt, wenn der
   * Skipper auf der Karte eine Etappennummer angetippt hat (App.tsx, View
   * `{ kind: 'tag'; focusDay }`). Die Ansicht klappt den Tag auf, scrollt ihn
   * an und setzt den Fokus dorthin; null heisst "normal öffnen, oben".
   */
  focusDay?: number | null;
  /** Zur Karten-Ansicht wechseln. Optional, damit die View allein rendert. */
  onOpenMap?: () => void;
}) {
  const day = snapshot.trip.currentDay;
  const { params } = snapshot;
  const { resetPlan } = usePlanning();
  const hereName = assessment.currentIslandId
    ? islandName(snapshot, assessment.currentIslandId)
    : null;

  const main = assessment.mainRoute;
  const { hero, rest, past } = dayViewStages(main, day, assessment.currentIslandId);

  // Staleness (FR13/AD-7): geprüft höchstens einmal pro Minute; das Label
  // selbst kommt aus dem getesteten Helper.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const staleLabel = staleForecastLabel(assessment.fetchedAtIso, nowMs, STALE_TIME_MS);

  const [assumptionOpen, setAssumptionOpen] = useState(false);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [pastOpen, setPastOpen] = useState(false);
  /** Zurücksetzen ist unumkehrbar — es fragt einmal nach. */
  const [resetOpen, setResetOpen] = useState(false);

  /**
   * ANSPRINGEN EINER ETAPPE: die Etappennummern der Karte führen hierher. Der
   * Tag kann an drei Stellen stehen — Hero, Plan-Zeile oder Chip der Sektion
   * "Bereits gefahren" —, und jede braucht einen eigenen Handgriff.
   *
   * Zwei Effekte, weil das Ziel im ersten Durchgang noch nicht im DOM ist: der
   * erste öffnet, was zu öffnen ist, der zweite scrollt und fokussiert, sobald
   * das Element existiert. `focusDone` macht daraus einen EINMALIGEN Sprung.
   */
  const focusTargets = useRef<Record<number, HTMLElement | null>>({});
  const focusDone = useRef<number | null>(null);
  useEffect(() => {
    if (focusDay === null) return;
    focusDone.current = null;
    const placement = stageFocusPlacement({ hero, rest, past }, focusDay);
    if (placement === 'rest') setExpandedDay(focusDay);
    if (placement === 'past') setPastOpen(true);
    // Nur der Zieltag ist die Eingabe: `rest`/`past` sind bei jedem Render neue
    // Arrays, und ihre Inhalte ändern den Sprung nicht mehr, wenn er getan ist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDay]);
  useEffect(() => {
    if (focusDay === null || focusDone.current === focusDay) return;
    const el = focusTargets.current[focusDay];
    if (!el) return; // noch nicht gerendert — der nächste Durchgang holt es
    focusDone.current = focusDay;
    // Optional gerufen: scrollIntoView fehlt in jsdom, und daran darf die
    // Ansicht nicht zerbrechen.
    el.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    el.focus?.({ preventScroll: true });
  });

  // Hafentag-Hero: Zeiger auf den nächsten Segeltag ("Weiter am Mi: A → B").
  const nextSailing =
    hero && hero.kind === 'harbour' && main
      ? (main.stages.find((s) => s.day > hero.day && s.kind === 'stage') ?? null)
      : null;
  const harbourPointer =
    hero && nextSailing
      ? `Weiter am ${formatTripDayWeekdayShort(params.tripStartDate, nextSailing.day)}: ${islandName(snapshot, hero.toIslandId)} → ${islandName(snapshot, nextSailing.toIslandId)}`
      : null;

  const leer = main ? planIsEmpty(main.plan) : false;

  // Exactly ONE APIProvider for the whole view: several expanded stage cards
  // then share a single Maps script load instead of each mounting its own.
  const mapId = MAPS_ENV.ok ? MAPS_ENV.env.mapId : null;

  const content = (
    <div>
      <div className="day-context">
        <div className="day-kicker">
          Tag {day} · {formatTripDayDate(params.tripStartDate, day)}
          <span className="zeitraum">
            {' · '}
            {formatTripRange(params.tripStartDate, params.tripLengthDays)} ·{' '}
            {params.tripLengthDays} Tage
          </span>
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
        {staleLabel && (
          <div className="hint-panel">
            {staleLabel} — Forecast über die Aktualisierung im Kopf neu holen.
          </div>
        )}
      </div>

      {/* DER LEERE TÖRN: bis der Skipper das erste Ziel setzt, behauptet die
          App nichts über seine Reise. Ein Satz, der sagt, wo man anfängt —
          kein Vorschlag, den man erst wieder loswerden müsste. */}
      {leer && (
        <div className="card-surface hero-card">
          <h1 className="route-dest-sm">Der Törn ist noch leer.</h1>
          <p>
            Jeder Tag liegt an der Basis. Tippe einen Tag an, wähle unter
            „Etappe ändern" seine Zielinsel — und die Kette wächst von dort.
            Jede Insel des Reviers ist zugelassen; die App rechnet dir Distanz,
            Abfahrt, Fahrtzeit, Ankunft und Wind dazu.
          </p>
        </div>
      )}

      {hero && (
        // tabIndex -1: Sprungziel für eine angetippte Etappennummer der Karte
        // (kein Tab-Stop) — der Fokus landet auf der Card, nicht irgendwo oben.
        <div
          tabIndex={-1}
          className="focus-anchor"
          ref={(el) => {
            focusTargets.current[hero.day] = el;
          }}
        >
          <StageCard
            stage={hero}
            snapshot={snapshot}
            nightAmpeln={assessment.nightAmpeln}
            hero
            currentDay={day}
            onOpenPlace={onOpenPlace}
            mapId={mapId}
            harbourPointer={harbourPointer}
          />
        </div>
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
              Ab Tag {assessment.assumedFromDay} beruht die Rechnung auf einer{' '}
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
              </ul>
            </div>
          )}
        </div>
      )}

      {/* DER PLAN — alle kommenden Tage, jeder aufklappbar. Das ist seit der
          Handplanung das Rückgrat der Ansicht und deshalb NICHT mehr auf drei
          Zeilen gekürzt: was man Tag für Tag selbst legt, will man Tag für Tag
          sehen. */}
      {rest.length > 0 && (
        <section>
          <h2 className="section-title">Weitere Tage</h2>
          <div className="list-card">
            {rest.map((s) => (
              <div key={s.day}>
                <button
                  type="button"
                  className="trip-row"
                  aria-expanded={expandedDay === s.day}
                  // Sprungziel einer angetippten Etappennummer (Karte): die
                  // Zeile ist ohnehin fokussierbar, sie braucht kein Extra-Ziel.
                  ref={(el) => {
                    focusTargets.current[s.day] = el;
                  }}
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
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

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
                // Ein gefahrener Tag hat keine Card mehr — angesprungen wird
                // deshalb sein Chip: aufgeklappte Sektion, Fokus auf dem Chip
                // (tabIndex -1) und die Umrandung sagt, welcher gemeint ist.
                <span
                  className={`chip${focusDay === s.day ? ' angesprungen' : ''}`}
                  key={s.day}
                  tabIndex={-1}
                  ref={(el) => {
                    focusTargets.current[s.day] = el;
                  }}
                >
                  {s.stageNumber !== null ? `Etappe ${s.stageNumber}: ` : ''}
                  {islandName(snapshot, s.toIslandId)} (Tag {s.day})
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="cta-column">
        {onOpenMap && (
          <button type="button" className="btn-secondary" onClick={onOpenMap}>
            Törn auf der Karte ansehen
          </button>
        )}
        {/* Neu anfangen ist ein Handgriff, kein Unfall: erst fragen, dann
            löschen — der Plan ist das Einzige, was der Skipper investiert hat. */}
        {!leer &&
          (resetOpen ? (
            <div className="hint-panel">
              Alle Tage zurück an die Basis? Die gesetzten Ziele gehen dabei
              verloren.{' '}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  resetPlan();
                  setResetOpen(false);
                }}
              >
                Ja, Törn leeren
              </button>{' '}
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setResetOpen(false)}
              >
                Abbrechen
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setResetOpen(true)}
            >
              Törn leeren und neu planen
            </button>
          ))}
      </div>
    </div>
  );

  // Missing config: render the view unchanged. The day cards then explain the
  // missing map in place, exactly as the map view does — never a crash (NFR).
  if (!MAPS_ENV.ok) return content;
  return <APIProvider apiKey={MAPS_ENV.env.apiKey}>{content}</APIProvider>;
}
