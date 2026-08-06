/**
 * FR5 — place detail: photo, qualities, shelter profile and the night ampel
 * computed for the coming night, plus the berth-level facts and the curated
 * gastronomy behind them. CruisersWiki attribution lives here
 * (Consistency Conventions).
 */

import { APIProvider, AdvancedMarker, Map } from '@vis.gl/react-google-maps';
import type {
  Assessment,
  PlanningSnapshot,
} from '../../domain/schema/snapshot.ts';
import type { Place } from '../../domain/schema/place.ts';
import type { BerthingDetails } from '../../domain/schema/berthing.ts';
import type { Restaurant } from '../../domain/schema/gastro.ts';
import { AmpelBadge } from '../components/AmpelBadge.tsx';
import { compass, formatTripDayDate } from '../format.ts';

/**
 * Qualitäts-Meter nach DESIGN.md/Platzdetail: 5 Punkte in Ink auf Track-Ton,
 * NIE in Ampel- oder Akzentfarbe — eine Qualität ist kein Sicherheitsurteil —
 * und der Wert immer auch als Text, weil Farbe und Form allein nichts tragen
 * dürfen.
 */
function DotMeter({ value, max = 5 }: { value: number; max?: number }) {
  const filled = Math.round(value);
  return (
    <span className="dot-meter">
      <span className="dots" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => (
          <i key={i} className={i < filled ? 'on' : undefined} />
        ))}
      </span>
      <span className="wert">
        {value.toLocaleString('de-DE')} von {max}
      </span>
    </span>
  );
}

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

  return (
    <section className="section">
      <span className="versal">Liegeplatz-Details (kuratiert)</span>
      <h2>Was am Platz zählt</h2>
      <div className="liegeplatz-grid">
        <div>
          <span className="micro-label">Wassertiefe</span>
          <span className={b.depthAtBerthM ? 'wert' : 'wert fehlt'}>
            {b.depthAtBerthM
              ? `${b.depthAtBerthM.min.toLocaleString('de-DE')}–${b.depthAtBerthM.max.toLocaleString('de-DE')} m`
              : 'nicht recherchiert'}
          </span>
        </div>
        <div>
          <span className="micro-label">Grösse max.</span>
          <span className={b.maxLoaM ? 'wert' : 'wert fehlt'}>
            {b.maxLoaM ? `${b.maxLoaM.toLocaleString('de-DE')} m` : 'nicht recherchiert'}
          </span>
        </div>
        <div>
          <span className="micro-label">Anlegeart</span>
          <span className="wert">{mooringLabel[b.mooringType]}</span>
        </div>
        <div>
          <span className="micro-label">Haltegrund</span>
          <span className={b.anchorHoldingGround ? 'wert' : 'wert fehlt'}>
            {b.anchorHoldingGround ?? 'nicht recherchiert'}
            {b.holdingQuality ? ` · Halt ${b.holdingQuality}` : ''}
          </span>
        </div>
      </div>
      {b.holdingNote && <p className="beschreibung">{b.holdingNote}</p>}
      <ul className="liegeplatz-liste">
        {zeilen.map(([label, wert]) => (
          <li key={label}>
            <span className="label">{label}</span>
            <span className="wert">{wert}</span>
          </li>
        ))}
      </ul>
      <p className="beschreibung">
        Tiefe und Grössenlimit sind kuratierte Angaben, keine Peilung — sie
        ersetzen weder Echolot noch Hafenhandbuch. Konfidenz der Recherche:{' '}
        {b.confidence}. Quellen: {b.sources.join('; ')}.
      </p>
    </section>
  );
}

/**
 * Gastronomie an Land — die Subebene des Platzes (gastro.ts).
 *
 * Sie bewertet nichts und steht deshalb nach dem Liegeplatz. Der
 * Reservierungskontakt trägt sichtbar seinen Vorbehalt, wenn die Kuratierung
 * ihn nicht bestätigen konnte: eine veraltete Nummer, die wie eine gesicherte
 * aussieht, kostet den Abend.
 */
function GastroKarte({ restaurants }: { restaurants: Restaurant[] }) {
  const sortiert = [...restaurants].sort((a, b) => b.qualityRating - a.qualityRating);
  const quellen = [...new Set(sortiert.flatMap((r) => r.sources))];

  return (
    <section className="section">
      <span className="versal">Gastronomie an Land</span>
      <h2>Wo wir heute Abend essen</h2>
      <ul className="gastro-liste">
        {sortiert.map((r) => (
          <li key={r.id}>
            <div className="gastro-kopf">
              <span className="name">{r.name}</span>
              <DotMeter value={r.qualityRating} />
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
                {r.confidence !== 'hoch' && ' — Kontakt unbestätigt, vor Verlass darauf prüfen'}
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="beschreibung">
        Kuratierte Empfehlungen, kein Verzeichnis — sie gehen in keine Bewertung
        ein. Quellen: {quellen.join('; ')}.
      </p>
    </section>
  );
}

/**
 * Der Kopf der Platzseite zeigt den Platz — nicht einen blauen Verlauf.
 *
 * Reihenfolge der Quellen, absichtlich in dieser Rangfolge:
 *   1. `place.photoUrl` — ein kuratiertes Foto schlägt alles, sobald es eines
 *      gibt. Die Bibliothek hat heute keine, das Feld existiert aber schon.
 *   2. Satellitenbild aus derselben Maps-Instanz, die Karten- und Tagesansicht
 *      ohnehin laden. Für die Planung ist das Luftbild sogar die nützlichere
 *      Ansicht als ein Postkartenfoto: Ankerfeld, Mole, Öffnung der Bucht und
 *      die Richtung, aus der es hereinsteht, sind darauf ablesbar.
 *   3. Ohne Maps-Key der bisherige Verlauf — nie ein kaputtes Bild.
 *
 * Die Beschriftung liegt ÜBER der Karte, nimmt aber keine Klicks an
 * (pointer-events: none in styles.css): sonst liesse sich genau der Ausschnitt
 * nicht verschieben, für den das Bild überhaupt dasteht.
 */
function PlaceHero({
  place,
  islandLabel,
  typeLabel,
}: {
  place: Place;
  islandLabel: string;
  typeLabel: string;
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const mapId =
    (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined) || 'DEMO_MAP_ID';
  const position = { lat: place.coordinates.lat, lng: place.coordinates.lon };

  const caption = (
    <div className="place-hero-caption">
      <span className="versal">
        {islandLabel} · {typeLabel}
      </span>
      <div className="headline">{place.name}</div>
    </div>
  );

  if (place.photoUrl) {
    return (
      <div
        className="place-hero"
        style={{ backgroundImage: `url(${place.photoUrl})` }}
      >
        {caption}
      </div>
    );
  }

  if (!apiKey) return <div className="place-hero">{caption}</div>;

  return (
    <>
      <div className="place-hero place-hero-map">
        <APIProvider apiKey={apiKey}>
          <Map
            className="place-hero-canvas"
            mapId={mapId}
            defaultCenter={position}
            defaultZoom={14}
            mapTypeId="hybrid"
            gestureHandling="cooperative"
            disableDefaultUI
            zoomControl
            fullscreenControl
          >
            <AdvancedMarker position={position} title={place.name} />
          </Map>
        </APIProvider>
        {caption}
      </div>
      <p className="beschreibung place-hero-legende">
        Luftbild der Bucht — Position {place.coordinates.lat.toFixed(4)}° N,{' '}
        {place.coordinates.lon.toFixed(4)}° E. Zoomen und verschieben ist möglich;
        der Ausschnitt ist keine Seekarte und ersetzt keine Hafenhandbuch-Angabe.
      </p>
    </>
  );
}

export function PlaceDetailView({
  placeId,
  snapshot,
  assessment,
  onBack,
}: {
  placeId: string;
  snapshot: PlanningSnapshot;
  assessment: Assessment;
  onBack: () => void;
}) {
  const day = snapshot.trip.currentDay;
  const place = snapshot.library.places.find((p) => p.id === placeId);
  const invalid = snapshot.library.invalidPlaces.find((p) => p.id === placeId);

  if (!place) {
    return (
      <div>
        <button type="button" className="back-link" onClick={onBack}>
          ← Zurück
        </button>
        <h1>{invalid?.name ?? placeId}</h1>
        <div className="error-panel">
          Dieses Platz-Dokument ist ungültig und kann nicht bewertet werden
          (Ampel: unbewertet). {invalid?.error}
        </div>
        <AmpelBadge ampel="unbewertet" />
      </div>
    );
  }

  const island = snapshot.library.islands.find((i) => i.id === place.islandId);
  const night = assessment.nightAmpeln[place.id]?.[day];
  const typeLabel =
    place.type === 'hafen' ? 'Hafen' : place.type === 'marina' ? 'Marina' : 'Bucht';

  return (
    <div>
      <button type="button" className="back-link" onClick={onBack}>
        ← Zurück
      </button>
      <PlaceHero
        place={place}
        islandLabel={island?.name ?? place.islandId}
        typeLabel={typeLabel}
      />

      {place.description && (
        <p className="beschreibung" style={{ marginTop: '0.8rem' }}>
          {place.description}
        </p>
      )}

      {place.warnings?.map((w) => (
        <div className="warnung" key={w}>
          ⚠ {w}
        </div>
      ))}

      <section className="section">
        <span className="versal">Kommende Nacht (Tag {day})</span>
        <h2>
          Nacht-Ampel · {formatTripDayDate(snapshot.params.tripStartDate, day)}
        </h2>
        <AmpelBadge ampel={night?.ampel ?? 'unbewertet'} />
        <div className="badges">
          {night?.maxWindKn !== null && night?.maxWindKn !== undefined && (
            <span className="badge">
              max. Wind {Math.round(night.maxWindKn)} kn aus{' '}
              {compass(night.windDirDeg)}
            </span>
          )}
          {night?.maxWaveM !== null && night?.maxWaveM !== undefined && (
            <span
              className="badge badge-info"
              title="Modellwert für die offene See am Ort des Platzes — im Hafen oder hinter der Landzunge gilt er nicht, deshalb geht er nicht in die Ampel ein."
            >
              Welle offene See {night.maxWaveM.toFixed(1)} m · nicht in der Ampel
            </span>
          )}
        </div>
        {night && night.reasons.length > 0 && (
          <ul className="reasons">
            {night.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        <p className="beschreibung">
          Bewertungszeitraum: {snapshot.params.nightStartHourAthens}:00–
          {snapshot.params.nightEndHourAthens}:00 Uhr Ortszeit (Athen).
        </p>
      </section>

      <section className="section">
        <span className="versal">Qualitäten</span>
        <h2>Schön, Essen, Baden</h2>
        <div className="qualitaeten-liste">
          <div>
            <span className="label">Schönheit</span>
            <DotMeter value={place.qualities.schoenheit} />
          </div>
          <div>
            <span className="label">Restaurant</span>
            <DotMeter value={place.qualities.restaurant} />
          </div>
          <div>
            <span className="label">Badestrand</span>
            <DotMeter value={place.qualities.badestrand} />
          </div>
        </div>
      </section>

      <section className="section">
        <span className="versal">Sicherer Liegeplatz (kuratiert)</span>
        <h2>Geschützte Sektoren</h2>
        <table className="shelter-table">
          <thead>
            <tr>
              <th>Art</th>
              <th>Geschützt gegen … kommend aus</th>
              <th>bis Stärke</th>
            </tr>
          </thead>
          <tbody>
            {place.shelter.windSectors.map((s, i) => (
              <tr key={`w${i}`}>
                <td>Wind</td>
                <td>
                  {s.fromDeg}°–{s.toDeg}° ({compass(s.fromDeg)}–{compass(s.toDeg)})
                  {s.fromDeg > s.toDeg ? ' · über Nord' : ''}
                </td>
                <td>{s.maxKn} kn</td>
              </tr>
            ))}
            {place.shelter.waveSectors.map((s, i) => (
              <tr key={`s${i}`} className="sektor-inaktiv">
                <td>Welle</td>
                <td>
                  {s.fromDeg}°–{s.toDeg}° ({compass(s.fromDeg)}–{compass(s.toDeg)})
                  {s.fromDeg > s.toDeg ? ' · über Nord' : ''}
                </td>
                <td>{s.maxM} m</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="beschreibung">
          <strong>Die Ampel hängt allein an den Wind-Sektoren.</strong> Die
          Wellen-Zeilen stehen als kuratiertes Wissen über den Platz da, bewerten
          aber nichts: die Wellenhöhe des Modells gilt für die offene See, nicht für
          den Liegeplatz dahinter.
        </p>
        <p className="beschreibung">
          Quelle: {place.shelter.sourceNote}. Enthält ggf. Material aus CruisersWiki
          (CC-Lizenz, Attribution erforderlich).
        </p>
      </section>

      {place.berthingDetails && <LiegeplatzKarte berthing={place.berthingDetails} />}

      {place.restaurants && place.restaurants.length > 0 && (
        <GastroKarte restaurants={place.restaurants} />
      )}
    </div>
  );
}
