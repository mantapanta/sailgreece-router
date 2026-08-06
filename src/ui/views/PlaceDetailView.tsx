/**
 * FR5 — place detail: photo, qualities, shelter profile and the night ampel
 * computed for the coming night. CruisersWiki attribution lives here
 * (Consistency Conventions).
 *
 * Consumer-Warm spine (Story 1.4): the place opens as ONE fused card — hero
 * ladder, title block with the night verdict sub-line, warn-notes — followed
 * by the Nacht-Ampel stat tiles, the 5-dot quality meters (never Ampel hues:
 * qualities are not verdicts) and the shelter sector grid. All display
 * aggregation lives in the tested pure helpers of placeViewModel.ts (AD-2).
 */

import { APIProvider, AdvancedMarker, Map } from '@vis.gl/react-google-maps';
import type {
  Assessment,
  PlanningSnapshot,
} from '../../domain/schema/snapshot.ts';
import type { Place } from '../../domain/schema/place.ts';
import { AmpelBadge, AMPEL_LABEL } from '../components/AmpelBadge.tsx';
import { compass, formatKn, formatTripDayDate, formatWaveM } from '../format.ts';
import { resolveMapsEnv } from '../mapsEnv.ts';
import {
  nightVerdictLine,
  nightWindowLabel,
  sectorTiles,
  type SectorRating,
} from '../placeViewModel.ts';

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
            ['Schönheit', place.qualities.schoenheit],
            ['Restaurant', place.qualities.restaurant],
            ['Badestrand', place.qualities.badestrand],
          ] as const
        ).map(([name, n]) => (
          <div className="quality-row" key={name}>
            <span className="quality-name">{name}</span>
            <span className="meter" role="img" aria-label={`${name}: ${n} von 5`}>
              {[0, 1, 2, 3, 4].map((i) => (
                <i key={i} className={i < n ? 'fill' : undefined} />
              ))}
            </span>
            <span className="quality-value">{n} von 5</span>
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
    </div>
  );
}
