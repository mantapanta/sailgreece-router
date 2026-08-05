/**
 * FR5 — place detail: photo, qualities, shelter profile and the night ampel
 * computed for the coming night. CruisersWiki attribution lives here
 * (Consistency Conventions).
 */

import { APIProvider, AdvancedMarker, Map } from '@vis.gl/react-google-maps';
import type {
  Assessment,
  PlanningSnapshot,
} from '../../domain/schema/snapshot.ts';
import type { Place } from '../../domain/schema/place.ts';
import { AmpelBadge } from '../components/AmpelBadge.tsx';
import { compass, formatTripDayDate } from '../format.ts';
import { resolveMapsEnv } from '../mapsEnv.ts';

function stars(n: number, max = 5): string {
  return '●'.repeat(n) + '○'.repeat(Math.max(0, max - n));
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
  // Story 1.3, AC 9: fehlende Maps-Konfiguration ist ein benannter Zustand —
  // kein stiller Demo-Map-Fallback. Ohne vollständige Konfiguration bleibt
  // der bisherige Verlaufs-Hero stehen (nie ein kaputtes Bild).
  const maps = resolveMapsEnv(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined,
    import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined,
  );
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

  if (!maps.ok) return <div className="place-hero">{caption}</div>;

  return (
    <>
      <div className="place-hero place-hero-map">
        <APIProvider apiKey={maps.env.apiKey}>
          <Map
            className="place-hero-canvas"
            mapId={maps.env.mapId}
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
        <div className="badges">
          <span className="badge">Schönheit {stars(place.qualities.schoenheit)}</span>
          <span className="badge">Restaurant {stars(place.qualities.restaurant)}</span>
          <span className="badge">Badestrand {stars(place.qualities.badestrand)}</span>
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
    </div>
  );
}
