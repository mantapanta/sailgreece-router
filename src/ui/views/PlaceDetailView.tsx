/**
 * FR5 — place detail: photo, qualities, shelter profile and the night ampel
 * computed for the coming night. CruisersWiki attribution lives here
 * (Consistency Conventions).
 */

import type {
  Assessment,
  PlanningSnapshot,
} from '../../domain/schema/snapshot.ts';
import { AmpelBadge } from '../components/AmpelBadge.tsx';
import { compass, formatTripDayDate } from '../format.ts';

function stars(n: number, max = 5): string {
  return '●'.repeat(n) + '○'.repeat(Math.max(0, max - n));
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
      <div
        className="place-hero"
        style={
          place.photoUrl
            ? { backgroundImage: `url(${place.photoUrl})` }
            : undefined
        }
      >
        <span className="versal">
          {island?.name ?? place.islandId} · {typeLabel}
        </span>
        <div className="headline">{place.name}</div>
      </div>

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
            <span className="badge">max. Welle {night.maxWaveM.toFixed(1)} m</span>
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
              <tr key={`s${i}`}>
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
          Quelle: {place.shelter.sourceNote}. Enthält ggf. Material aus CruisersWiki
          (CC-Lizenz, Attribution erforderlich).
        </p>
      </section>
    </div>
  );
}
