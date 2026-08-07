/**
 * FR5 — place detail: photo, qualities, shelter profile and the night ampel
 * computed for the coming night, plus the berth-level facts and the curated
 * gastronomy behind them. CruisersWiki attribution lives here
 * (Consistency Conventions).
 *
 * Consumer-Warm spine (Story 1.4): the place opens as ONE fused card — hero
 * ladder, title block with the night verdict sub-line, warn-notes — followed
 * by the Nacht-Ampel stat tiles, the 5-dot quality meters (never Ampel hues:
 * qualities are not verdicts) and the shelter sector grid. All display
 * aggregation lives in the tested pure helpers of placeViewModel.ts (AD-2).
 *
 * Darunter zwei Karten aus derselben Bibliothek, die nichts bewerten: die
 * Liegeplatz-Details (Tiefe, Grössenlimit, Müll, Reservierbarkeit …) und die
 * Gastronomie-Subebene des Platzes. Weder Ampel noch Solver lesen davon ein
 * Feld — sie beantworten, was erst AM Platz zählt.
 */

import { useEffect, useRef } from 'react';
import { APIProvider, AdvancedMarker, Map } from '@vis.gl/react-google-maps';
import type {
  Assessment,
  PlanningSnapshot,
} from '../../domain/schema/snapshot.ts';
import type { Place } from '../../domain/schema/place.ts';
import type { BerthingDetails } from '../../domain/schema/berthing.ts';
import type { Restaurant } from '../../domain/schema/gastro.ts';
import type { KiteSpot, KiteSpotTag } from '../../domain/schema/kite.ts';
import { kiteProfilLabel, kiteSektorLabel, kiteSpotsOfPlace } from '../../domain/kite.ts';
import { AmpelBadge, AMPEL_LABEL } from '../components/AmpelBadge.tsx';
import { compass, formatKn, formatTripDayDate, formatWaveM } from '../format.ts';
import { resolveMapsEnv } from '../mapsEnv.ts';
import {
  nightVerdictLine,
  nightWindowLabel,
  sectorTiles,
  type SectorRating,
} from '../placeViewModel.ts';

/** Ja/Nein/Ortsangabe. `null`/`undefined` heisst „nicht recherchiert", nicht „nein". */
function jaNein(v: boolean | string | null | undefined): string | null {
  if (v === true) return 'ja';
  if (v === false) return 'nein';
  if (typeof v === 'string') return v;
  return null;
}

/**
 * Liegeplatz-Details (FR5, berthing.ts).
 *
 * Oben als Stat-Tiles die vier Angaben, an denen ein Platz für dieses Schiff
 * scheitern kann — Tiefe und Grössenlimit sind die einzigen harten
 * Ausschlusskriterien der Bibliothek, Anlegeart und Haltegrund entscheiden das
 * Manöver. Darunter als Zeilen, wonach an Bord tatsächlich gefragt wird:
 * Reservierbarkeit, Müll, Strom, Wasser, Diesel, Preis.
 *
 * Was nicht recherchiert ist, wird weggelassen statt mit „nein" gefüllt
 * (AD-4): eine Lücke ist eine Lücke.
 */
function LiegeplatzKarte({ berthing }: { berthing: BerthingDetails }) {
  const b = berthing;
  const mooringLabel: Record<BerthingDetails['mooringType'], string> = {
    laengsseits: 'Längsseits',
    'roemisch-katholisch': 'Heck/Bug zum Kai',
    murings: 'Murings',
    boje: 'Boje',
    'anker-frei': 'Frei ankern',
  };

  const zeilen: [string, string][] = [];
  const push = (label: string, wert: string | null | undefined) => {
    if (wert) zeilen.push([label, wert]);
  };
  push(
    'Reservierbar',
    b.reservationPossible === true
      ? b.reservationChannel ?? 'ja'
      : b.reservationPossible === false
        ? 'nein — es gilt: wer zuerst kommt'
        : null,
  );
  push('Müllentsorgung', jaNein(b.wasteDisposal));
  push('Landstrom', jaNein(b.shorePower));
  push('Wasser', jaNein(b.water));
  push('Diesel am Steg', jaNein(b.fuelDock));
  push('Duschen / WC', jaNein(b.showersToilets));
  push('Versorgung an Land', b.provisioningAshore);
  push('Beiboot-Anlandung', b.dinghyLanding);
  push('Kapazität', b.capacityYachts ? `${b.capacityYachts} Yachten` : null);
  push('Preis', b.priceIndicationEur);
  push('Hafengebühren', b.portAuthorityFees);
  push('Schwell', b.swellExposureNote);
  push('Fährverkehr', b.ferryTrafficNote);
  push('Seegras', b.seagrassNote);
  push('Auflagen', b.restrictions);
  push('UKW-Kanal', b.vhfChannel ? `Kanal ${b.vhfChannel}` : null);

  const tile = (label: string, wert: string | null) => (
    <div key={label}>
      <span className="micro-label">{label}</span>
      <span className={wert ? 'wert' : 'wert fehlt'}>
        {wert ?? 'nicht recherchiert'}
      </span>
    </div>
  );

  return (
    <>
      <h2 className="section-title">Liegeplatz-Details</h2>
      <section className="card-surface">
        <div className="liegeplatz-grid">
          {tile(
            'Wassertiefe',
            b.depthAtBerthM
              ? `${b.depthAtBerthM.min.toLocaleString('de-DE')}–${b.depthAtBerthM.max.toLocaleString('de-DE')} m`
              : null,
          )}
          {tile('Grösse max.', b.maxLoaM ? `${b.maxLoaM.toLocaleString('de-DE')} m` : null)}
          {tile('Anlegeart', mooringLabel[b.mooringType])}
          {tile(
            'Haltegrund',
            b.anchorHoldingGround
              ? `${b.anchorHoldingGround}${b.holdingQuality ? ` · Halt ${b.holdingQuality}` : ''}`
              : null,
          )}
        </div>
        {b.holdingNote && <p className="shelter-legend">{b.holdingNote}</p>}
        <ul className="liegeplatz-liste">
          {zeilen.map(([label, wert]) => (
            <li key={label}>
              <span className="label">{label}</span>
              <span className="wert">{wert}</span>
            </li>
          ))}
        </ul>
        <p className="shelter-source">
          Tiefe und Grössenlimit sind kuratierte Angaben, keine Peilung — sie
          ersetzen weder Echolot noch Hafenhandbuch. Konfidenz der Recherche:{' '}
          {b.confidence}. Quellen: {b.sources.join('; ')}.
        </p>
      </section>
    </>
  );
}

/**
 * Gastronomie an Land — die Subebene des Platzes (gastro.ts).
 *
 * Sie bewertet nichts und steht deshalb nach dem Liegeplatz. Die Bewertung
 * nutzt dasselbe 5-Punkte-Meter wie die Qualitäten (Ink, nie Ampel oder
 * Akzent) und trägt den Wert immer als Text daneben.
 *
 * Der Reservierungskontakt trägt sichtbar seinen Vorbehalt, wenn die
 * Kuratierung ihn nicht bestätigen konnte: eine veraltete Nummer, die wie eine
 * gesicherte aussieht, kostet den Abend.
 *
 * `titelRef` hängt am Zwischentitel, damit die Qualitäten-Zeile „Restaurant"
 * hierher springen kann: die Karte steht bewusst weit unten (sie bewertet
 * nichts), und ohne den Sprung sucht der Skipper die Tavernen unterhalb von
 * Sektorenraster und Liegeplatz-Details.
 */
function GastroKarte({
  restaurants,
  titelRef,
}: {
  restaurants: Restaurant[];
  titelRef?: React.Ref<HTMLHeadingElement>;
}) {
  const sortiert = [...restaurants].sort((a, b) => b.qualityRating - a.qualityRating);
  const quellen = [...new Set(sortiert.flatMap((r) => r.sources))];

  return (
    <>
      <h2 className="section-title" ref={titelRef} tabIndex={-1}>
        Gastronomie an Land
      </h2>
      <section className="card-surface">
        <ul className="gastro-liste">
          {sortiert.map((r) => {
            const gefuellt = Math.round(r.qualityRating);
            const wert = r.qualityRating.toLocaleString('de-DE');
            return (
              <li key={r.id}>
                <div className="gastro-kopf">
                  <span className="name">{r.name}</span>
                  <span className="meter" role="img" aria-label={`${r.name}: ${wert} von 5`}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <i key={i} className={i < gefuellt ? 'fill' : undefined} />
                    ))}
                  </span>
                  <span className="quality-value">{wert} von 5</span>
                </div>
                {r.cuisineType && <div className="gastro-kueche">{r.cuisineType}</div>}
                {r.signatureDishes.length > 0 && (
                  <div className="zeile">
                    <span className="label">Spezialitäten: </span>
                    {r.signatureDishes.join(' · ')}
                  </div>
                )}
                {r.accessInfo && (
                  <div className="zeile">
                    <span className="label">Anlandung: </span>
                    {r.accessInfo}
                  </div>
                )}
                {r.reservationInfo && (
                  <div className={r.confidence === 'hoch' ? 'zeile' : 'zeile vorbehalt'}>
                    <span className="label">Reservierung: </span>
                    {r.reservationInfo}
                    {r.confidence !== 'hoch' &&
                      ' — Kontakt unbestätigt, vor Verlass darauf prüfen'}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="shelter-source">
          Kuratierte Empfehlungen, kein Verzeichnis — sie gehen in keine
          Bewertung ein. Quellen: {quellen.join('; ')}.
        </p>
      </section>
    </>
  );
}

/**
 * KITE-SPOTS von diesem Liegeplatz aus (schema/kite.ts).
 *
 * Steht wie die Gastronomie NACH dem Liegeplatz, aus demselben Grund: sie
 * bewertet nichts. Angezeigt wird je Spot das Urteil des heutigen
 * Kite-Fensters — fertig formuliert aus der Domain (`KiteSpotTag.text`,
 * AD-2), nie hier zusammengebaut.
 *
 * Drei Dinge trägt die Karte bewusst sichtbar:
 *  - die GEFAHREN, und zwar nicht kleiner gesetzt als der Rest. Ein
 *    Tiefwasser-Launch ohne Stehbereich ist die Information, an der eine
 *    Session scheitert;
 *  - die KONFIDENZ, mit Vorbehalt-Satz bei allem unter 'hoch' — diese
 *    Bibliothek ist Revierwissen, kein Revierführer (Datei-Kopf von
 *    kitespots.json);
 *  - dass hier nichts bewertet wird.
 *
 * `focusSpotId` kommt vom Kite-Hinweis der Tagesansicht: der Spot, auf den
 * geklickt wurde, wird hervorgehoben und herangescrollt.
 */
function KiteKarte({
  spots,
  heute,
  focusSpotId,
}: {
  spots: KiteSpot[];
  /** Heutige Bewertung je Spot (assessment.kiteSpotsHeute), Domain-Wert. */
  heute: KiteSpotTag[];
  focusSpotId?: string;
}) {
  const focusRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focusSpotId) focusRef.current?.scrollIntoView({ block: 'center' });
  }, [focusSpotId]);

  const LEVEL_LABEL: Record<KiteSpot['level'], string> = {
    einsteiger: 'Einsteiger',
    fortgeschritten: 'Fortgeschritten',
    experte: 'Experten',
  };

  return (
    <>
      <h2 className="section-title">Kite-Spots</h2>
      <section className="card-surface">
        <ul className="kite-liste">
          {spots.map((s) => {
            const tag = heute.find((t) => t.spotId === s.id) ?? null;
            const focused = s.id === focusSpotId;
            return (
              <li
                key={s.id}
                ref={focused ? focusRef : undefined}
                className={focused ? 'focused' : undefined}
              >
                <div className="kite-kopf">
                  <span className="name">{s.name}</span>
                  <span className="chip">{LEVEL_LABEL[s.level]}</span>
                </div>
                <div className="kite-profil">
                  {kiteProfilLabel(s)} · Wind aus {kiteSektorLabel(s)}
                </div>
                {s.description && <div className="zeile">{s.description}</div>}
                {/* Das Urteil von heute — Wort und Zahl, keine Farbe allein. */}
                {tag && <div className={`kite-urteil ${tag.eignung}`}>{tag.text}</div>}
                <div className="zeile">
                  <span className="label">Anfahrt: </span>
                  {s.accessInfo}
                </div>
                {s.hazards.length > 0 && (
                  <ul className="kite-gefahren">
                    {s.hazards.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                )}
                {s.localNote && (
                  <div className="zeile">
                    <span className="label">Vor Ort: </span>
                    {s.localNote}
                  </div>
                )}
                {s.infoUrl && (
                  <div className="zeile">
                    <a href={s.infoUrl} target="_blank" rel="noreferrer">
                      Spot-Info öffnen
                    </a>
                  </div>
                )}
                <div className={s.confidence === 'hoch' ? 'zeile' : 'zeile vorbehalt'}>
                  <span className="label">Konfidenz: </span>
                  {s.confidence}
                  {s.confidence !== 'hoch' &&
                    ' — Revierwissen ohne Quellenbeleg, Lage und Auflagen vor Ort prüfen'}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="shelter-source">
          Kite-Spots bewerten nichts: weder Nacht-Ampel noch Etappen-Ampel noch
          Routenwahl lesen ein Feld. Der Wind je Spot ist der Forecast DIESES
          Liegeplatzes — am Spot selbst, besonders in einer Kanaldüse, kann er
          deutlich schärfer stehen. Behördliche Kite-Verbote und Schutzzonen sind
          nicht recherchiert. Quellen:{' '}
          {[...new Set(spots.flatMap((s) => s.sources))].join('; ')}.
        </p>
      </section>
    </>
  );
}

/**
 * Rating → presentation: one lookup, no logic — the rating itself comes from
 * the domain's windHourAmpel via sectorTiles (placeViewModel.ts). The two rot
 * states differ in visible text ("offen" vs "schwach · bis {kn} kn"), so
 * color is never the only carrier.
 */
const SECTOR_PRESENTATION: Record<
  SectorRating,
  { cls: string; word: (limitKn: number | null) => string }
> = {
  gut: { cls: 'gruen', word: (kn) => `gut · bis ${kn} kn` },
  maessig: { cls: 'gelb', word: (kn) => `mäßig · bis ${kn} kn` },
  schwach: { cls: 'rot', word: (kn) => `schwach · bis ${kn} kn` },
  offen: { cls: 'rot', word: () => 'offen' },
};

/**
 * Der Kopf der Platzkarte zeigt den Platz — nicht einen blauen Verlauf.
 *
 * Reihenfolge der Quellen, absichtlich in dieser Rangfolge:
 *   1. `place.photoUrl` — ein kuratiertes Foto schlägt alles, sobald es eines
 *      gibt. Die Bibliothek hat heute keine, das Feld existiert aber schon.
 *   2. Satellitenbild aus derselben Maps-Instanz, die Karten- und Tagesansicht
 *      ohnehin laden. Für die Planung ist das Luftbild sogar die nützlichere
 *      Ansicht als ein Postkartenfoto: Ankerfeld, Mole, Öffnung der Bucht und
 *      die Richtung, aus der es hereinsteht, sind darauf ablesbar.
 *   3. Ohne Maps-Key der Imagery-Verlauf mit dem Chip "Kein Foto verfügbar" —
 *      nie ein kaputtes Bild.
 *
 * Alle drei Stufen tragen Scrim und Beschriftung; die Beschriftung liegt ÜBER
 * dem Bild, nimmt aber keine Klicks an (pointer-events: none in styles.css):
 * sonst liesse sich genau der Ausschnitt nicht verschieben, für den das
 * Satellitenbild überhaupt dasteht.
 */
function PlaceHero({ place, typeLabel }: { place: Place; typeLabel: string }) {
  // Story 1.3, AC 9: fehlende Maps-Konfiguration ist ein benannter Zustand —
  // kein stiller Demo-Map-Fallback. Ohne vollständige Konfiguration bleibt
  // der bisherige Verlaufs-Hero stehen (nie ein kaputtes Bild).
  const maps = resolveMapsEnv(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined,
    import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined,
  );
  const position = { lat: place.coordinates.lat, lng: place.coordinates.lon };

  const caption = (
    <div className="hero-caption">
      {place.name} — {typeLabel}
    </div>
  );

  if (place.photoUrl) {
    return (
      <div className="hero">
        <div
          className="hero-photo"
          style={{ backgroundImage: `url(${place.photoUrl})` }}
        />
        <div className="hero-scrim" />
        {caption}
      </div>
    );
  }

  if (maps.ok) {
    return (
      <>
        <div className="hero">
          <div className="hero-map-canvas">
            <APIProvider apiKey={maps.env.apiKey}>
              <Map
                className="hero-map-canvas"
                mapId={maps.env.mapId}
                defaultCenter={position}
                defaultZoom={14}
                mapTypeId="hybrid"
                gestureHandling="cooperative"
                disableDefaultUI
                zoomControl
                fullscreenControl
              >
                <AdvancedMarker position={position} />
              </Map>
            </APIProvider>
          </div>
          <div className="hero-scrim" />
          {caption}
        </div>
        <p className="hero-legende">
          Luftbild der Bucht — Position {place.coordinates.lat.toFixed(4)}° N,{' '}
          {place.coordinates.lon.toFixed(4)}° E. Zoomen und verschieben ist
          möglich; der Ausschnitt ist keine Seekarte und ersetzt keine
          Hafenhandbuch-Angabe.
        </p>
      </>
    );
  }

  return (
    <div className="hero fallback">
      <div className="hero-fallback-bg" />
      <div className="hero-fallback-chip">Kein Foto verfügbar</div>
      <div className="hero-scrim" />
      {caption}
    </div>
  );
}

export function PlaceDetailView({
  placeId,
  snapshot,
  assessment,
  focusKiteSpotId,
  onBack,
}: {
  placeId: string;
  snapshot: PlanningSnapshot;
  assessment: Assessment;
  /** Über einen Kite-Hinweis geöffnet: diesen Spot hervorheben und anscrollen. */
  focusKiteSpotId?: string;
  onBack: () => void;
}) {
  const day = snapshot.trip.currentDay;
  const place = snapshot.library.places.find((p) => p.id === placeId);
  const invalid = snapshot.library.invalidPlaces.find((p) => p.id === placeId);

  if (!place) {
    return (
      <div>
        <div className="back-row">
          <button type="button" className="btn-text" onClick={onBack}>
            ← Zurück
          </button>
        </div>
        <h1>{invalid?.name ?? placeId}</h1>
        <div className="error-panel" role="alert">
          Dieses Platz-Dokument ist ungültig und kann nicht bewertet werden
          (Ampel: unbewertet). {invalid?.error} Keine kuratierten Schutzdaten —
          konservativ behandeln.
        </div>
        <AmpelBadge ampel="unbewertet" />
      </div>
    );
  }

  const island = snapshot.library.islands.find((i) => i.id === place.islandId);
  const night = assessment.nightAmpeln[place.id]?.[day];
  const typeLabel =
    place.type === 'hafen' ? 'Hafen' : place.type === 'marina' ? 'Marina' : 'Bucht';
  const verdict = nightVerdictLine(night);
  const windowLabel = nightWindowLabel(
    snapshot.params.nightStartHourAthens,
    snapshot.params.nightEndHourAthens,
  );
  const tiles = sectorTiles(place.shelter, snapshot.params);
  // Kite-Spots, deren Bezugsplatz DIESER Platz ist (domain/kite.ts) — die
  // Zuordnung ist kuratiert, hier wird nur gefiltert.
  const kiteSpots = kiteSpotsOfPlace(snapshot.library.kiteSpots ?? [], place.id);

  /**
   * Die Zeile „Restaurant n von 5" ist eine VERDICHTUNG und nennt keinen Namen
   * (schema/place.ts). Ohne Zusatz las sie sich wie ein Versprechen, das die
   * Seite nicht einlöst — der Skipper sucht die Tavernen und findet nichts.
   *
   * Deshalb sagt die Zeile jetzt, was dahinter liegt, und unterscheidet dabei
   * die beiden Fälle, die das Schema ausdrücklich auseinanderhält: kuratierte
   * Tavernen (dann führt ein Sprung zur Gastro-Karte) gegen einen Platz, für
   * den die Gastronomie schlicht nicht recherchiert ist. Das ist etwas anderes
   * als „dort gibt es nichts", und genau so steht es da — sonst liest sich eine
   * Lücke in der Kuratierung wie ein Befund über den Ort.
   */
  const gastroTitelRef = useRef<HTMLHeadingElement>(null);
  const restaurants = place.restaurants ?? [];
  const gastroNotiz =
    restaurants.length > 0 ? (
      <button
        type="button"
        className="btn-text quality-note"
        onClick={() => gastroTitelRef.current?.scrollIntoView({ block: 'start' })}
      >
        {restaurants.length === 1
          ? '1 Taverne kuratiert — ansehen'
          : `${restaurants.length} Tavernen kuratiert — ansehen`}
      </button>
    ) : (
      <span className="quality-note leer">
        Keine Tavernen recherchiert — das ist kein Urteil über den Ort.
      </span>
    );

  return (
    <div>
      <div className="back-row">
        <button type="button" className="btn-text" onClick={onBack}>
          ← Zurück
        </button>
      </div>

      <section className="place-card">
        <PlaceHero place={place} typeLabel={typeLabel} />
        <div className="place-head">
          <div className="place-kicker">
            {island?.name ?? place.islandId} · {typeLabel}
          </div>
          <div className="place-title-row">
            <h1 className="place-title">{place.name}</h1>
            <AmpelBadge ampel={verdict.ampel} />
          </div>
          <p className="ampel-sub">
            <strong>
              {AMPEL_LABEL[verdict.ampel]} — {verdict.text}
            </strong>{' '}
            · bewertet für {windowLabel}
          </p>
        </div>
        {place.description && <p className="place-desc">{place.description}</p>}
        {place.warnings?.map((w) => (
          <div className="warn-note gelb" key={w}>
            {w}
          </div>
        ))}
        <div className="place-card-pad" />
      </section>

      <h2 className="section-title">Nacht-Ampel</h2>
      <section className="card-surface">
        <div className="night-head">
          <AmpelBadge ampel={verdict.ampel} />
          <span className="night-window">{windowLabel}</span>
          <span className="night-caption">
            Kommende Nacht · Tag {day} ·{' '}
            {formatTripDayDate(snapshot.params.tripStartDate, day)}
          </span>
        </div>
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="label">Max. Wind</div>
            <div className="value">
              {night?.maxWindKn != null ? (
                <>
                  {formatKn(night.maxWindKn)} · {compass(night.windDirDeg)}
                </>
              ) : (
                '–'
              )}
            </div>
          </div>
          <div className="stat-tile">
            <div className="label">Welle (offene See)</div>
            <div className="value">{formatWaveM(night?.maxWaveM ?? null)}</div>
          </div>
        </div>
        <p className="wave-note">
          Die Welle ist der Modellwert für die offene See am Ort des Platzes —
          im Hafen oder hinter der Landzunge gilt sie nicht; sie geht nicht in
          die Ampel ein.
        </p>
        {night && night.reasons.length > 0 && (
          <ul className="reasons">
            {night.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="section-title">Qualitäten</h2>
      <section className="card-surface">
        {(
          [
            ['Schönheit', place.qualities.schoenheit, null],
            ['Restaurant', place.qualities.restaurant, gastroNotiz],
            ['Badestrand', place.qualities.badestrand, null],
          ] as const
        ).map(([name, n, notiz]) => (
          <div className="quality-row" key={name}>
            <span className="quality-name">{name}</span>
            <span className="meter" role="img" aria-label={`${name}: ${n} von 5`}>
              {[0, 1, 2, 3, 4].map((i) => (
                <i key={i} className={i < n ? 'fill' : undefined} />
              ))}
            </span>
            <span className="quality-value">{n} von 5</span>
            {notiz}
          </div>
        ))}
      </section>

      <h2 className="section-title">Sicherer Liegeplatz</h2>
      <section className="card-surface">
        <div className="shelter-grid">
          {tiles.map((t) => {
            const p = SECTOR_PRESENTATION[t.rating];
            return (
              <div className={`sector ${p.cls}`} key={t.centerDeg}>
                <div className="dir">{t.dir}</div>
                <div className="word">{p.word(t.limitKn)}</div>
                <div className="wave">
                  {t.waveMaxM !== null
                    ? `Welle bis ${formatWaveM(t.waveMaxM)}`
                    : '–'}
                </div>
              </div>
            );
          })}
        </div>
        <p className="shelter-legend">
          Schutz je Windrichtung aus den kuratierten Sektoren, bewertet am
          Meltemi-Worst-Case der Planung (kn = Knoten, 
          {snapshot.params.meltemiWorstCase.twsKn} kn); die Wellenwerte sind
          kuratierte Grenzen und bewerten nichts.
        </p>
        <p className="shelter-legend">
          <strong>Die Ampel hängt allein an den Wind-Sektoren.</strong> Die
          Wellen-Zeilen stehen als kuratiertes Wissen über den Platz da,
          bewerten aber nichts: die Wellenhöhe des Modells gilt für die offene
          See, nicht für den Liegeplatz dahinter.
        </p>
        <ul className="shelter-sectors">
          {place.shelter.windSectors.map((s, i) => (
            <li key={`w${i}`}>
              Wind {s.fromDeg}°–{s.toDeg}° ({compass(s.fromDeg)}–
              {compass(s.toDeg)}){s.fromDeg > s.toDeg ? ' · über Nord' : ''} bis{' '}
              {formatKn(s.maxKn)}
            </li>
          ))}
          {place.shelter.waveSectors.map((s, i) => (
            <li key={`s${i}`}>
              Welle {s.fromDeg}°–{s.toDeg}° ({compass(s.fromDeg)}–
              {compass(s.toDeg)}){s.fromDeg > s.toDeg ? ' · über Nord' : ''} bis{' '}
              {formatWaveM(s.maxM)}
            </li>
          ))}
        </ul>
        <p className="shelter-source">
          Quelle: {place.shelter.sourceNote}. Enthält ggf. Material aus
          CruisersWiki (CC-Lizenz, Attribution erforderlich).
        </p>
      </section>

      {place.berthingDetails && <LiegeplatzKarte berthing={place.berthingDetails} />}

      {restaurants.length > 0 && (
        <GastroKarte restaurants={restaurants} titelRef={gastroTitelRef} />
      )}

      {kiteSpots.length > 0 && (
        <KiteKarte
          spots={kiteSpots}
          heute={assessment.kiteSpotsHeute}
          focusSpotId={focusKiteSpotId}
        />
      )}
    </div>
  );
}
