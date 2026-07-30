# Adversarial Review (Blind Hunter) — sailgreece-router MVP

- **Gegenstand:** `git diff ee58689..HEAD` (82 Dateien; kompletter Neubau Vite/React/TS-SPA in `src/` + `seeding/` + Konfig; `_bmad-output/` ignoriert)
- **Branch:** `claude/create-prd-5twc39`, HEAD `757db67`
- **Bindende Referenzen:** `_bmad-output/implementation-artifacts/spec-mvp-sailgreece-router.md` (inkl. I/O-Matrix), `ARCHITECTURE-SPINE.md` (11 ADs)
- **Datum:** 2026-07-30 · Reviewer-Rolle: Blind Hunter (zynisch, ohne Kenntnis anderer Reviews)

## Verdict

**Bedingt annahmefähig — Nacharbeit vor Freigabe erforderlich.** Die Kern-Invarianten sind
mechanisch erfüllt (AD-2-Grep 0 Treffer; `npm test` 53/53 grün; `npm run build` inkl.
`tsc --noEmit` grün; Approved-Gate verweigert Import mit Exit 1; Sektorsemantik inkl.
Nord-Wrap fixture-gedeckt). Es existieren aber **zwei bestätigte funktionale Fehler in
sicherheitsrelevanter Domänenlogik** (PPR/Optionsraum, Abfahrts-Override), eine
AD-2-Grauzone in der UI sowie eine Reihe von Robustheits-, Semantik- und Hygieneproblemen.

## Verifikation (nachvollzogen)

| Prüfung | Ergebnis |
|---|---|
| `npm test` | 53 Tests, 5 Dateien, grün |
| `npm run build` (`tsc --noEmit` + `vite build`) | grün |
| `grep -rE "from 'react'\|from 'firebase\|Date\.now\(\|fetch\(" src/domain/` | 0 Treffer (AD-2) |
| `node seeding/importToFirestore.ts --dry` | „IMPORT VERWEIGERT … approved: false", Exit 1 (Spec-Zeile „Import ohne Freigabe") |
| Repro-Skript (Rückweg ab Amorgos, volle Forecast-Abdeckung) | falscher Horizont-Vorbehalt bestätigt (Finding 1) |

## Findings

- **Umgekehrte Verbinder-Etappen erzeugen Forecast-Schlüssel, die es im Snapshot nie gibt.**
  `reverseLeg()` in `src/domain/ppr.ts` baut z. B. aus `naxos--amorgos` die Etappe
  `amorgos--naxos`; deren Wegpunkte werden in `assessLeg` unter
  `leg:amorgos--naxos:0` nachgeschlagen — `collectLocations()` (`src/adapters/openMeteo.ts`)
  fetcht aber nur Schlüssel der gespeicherten Richtung (`leg:naxos--amorgos:0`). Folge
  (per Skript bestätigt): Rückweg-Etappen ab Amorgos/Santorin sind **immer `unbewertet`**,
  der PPR trägt bei **voller Forecast-Abdeckung** den falschen Vorbehalt „liegt teils
  jenseits des Forecast-Horizonts", `latestReturnStartDay` wird verzerrt, und die
  Verlängerungs-Optionen können nie sauber `feasible`/`schliesst` werden. Verstößt gegen
  die I/O-Matrix-Zusage, dass `unbewertet` nur echte Datenlücken markiert.
- **`departureHourOverride` gilt für alle simulierten Tage statt nur für heute.**
  `assessLeg` (`src/domain/scoring.ts:155-156`) nimmt den Override für jedes `day`-Argument;
  laut Schema-Kommentar (`snapshot.ts`: „departure hour override for **today**") und AD-11
  ist er die heutige Tagesentscheidung. Setzt der Skipper heute 6:00, verschieben sich
  Machbarkeit, Schließtage und PPR **aller künftigen Tage** mit — stiller Fehler in der
  Mittelfristlogik.
- **AD-2-Grauzone: fachliche Rangfolge in der View.** AD-2: „Sortieren nach Fachkriterien
  ist Berechnen." `DayView.tsx:129-133` und `MapView.tsx:57-61` sortieren Routen-Optionen
  selbst nach `escalationRank`; das Assessment liefert keine Ordnung für `routeOptions`.
  Zusätzlich widerspricht sich `MapView`: Kommentar „tracked route (or the most ambitious
  open one)", Code nimmt die **konservativste** Nicht-Rückfall-Route und ignoriert
  offen/zu komplett.
- **Engine läuft doppelt pro Render.** `ControlsBar` und `Shell` rufen beide `usePlanning()`
  (`src/app/App.tsx:29,143`); `assessPlanning` (voller Options-/PPR-Suchbaum über alle
  Routen × Tage × Stunden) wird pro Render zweimal berechnet — unnötig auf dem Handy im
  Cockpit (NFR-Performance) und ein Einfallstor für inkonsistente Memoisierung.
- **Zustand „offen (Horizont)" ist untergetestet und in einem Pfad unsichtbar.** Kein
  einziger Test asserted `offen-horizont` (I/O-Matrix-Zeile „Horizont-Ende"!). Und wenn
  in `assessRouteOption` (`src/domain/options.ts:145-152`) erst die **Schließtag-Suche**
  auf Horizont trifft, bleibt der State kommentarlos `offen` — ohne Reason/Vorbehalt, dass
  der Schließtag unbestimmbar ist. Der Nutzer liest „offen" und plant darauf.
- **Sicherheitsrelevante Deadline-Semantik ist eine Namensfalle.** `returnByEveOfDay`
  (Default 12 = Ausschiffungstag) heißt „Vorabend", `effectiveDeadlineDay` rechnet
  `12 − 1 − 1 = 10`. Wer den Feldnamen wörtlich nimmt und 11 („Vorabend") einträgt,
  verliert unbemerkt einen weiteren Tag. Keine Validierung, README-Abschnitt
  „Tuning-Parameter" erwähnt die Trip-Frame-Felder nicht.
- **Import-Skript prüft Querbezüge unvollständig** (`seeding/importToFirestore.ts`):
  keine Prüfung, dass `config.baseIslandId`/`basePlaceId` existieren, dass
  `rueckfallkette-west` vorhanden ist, dass Platz-/Insel-IDs über alle Dateien eindeutig
  sind (Duplikate überschreiben sich in Firestore still), dass `place.islandId` zur
  Insel der Datei passt oder dass `leg.id` = `from--to` ist.
- **Freigabe-Gate ist alles-oder-nichts über sämtliche Dateien.** Eine einzige
  `approved: false`-Datei (auch nur `config.json`) blockiert den **gesamten** Import;
  ein Teil-Import bereits geprüfter Inseln ist unmöglich, obwohl Spec/AD-10 die Freigabe
  **je Insel-Datei** definieren. Außerdem löscht der Import entfernte Dokumente nie —
  umbenannte IDs hinterlassen Leichen in Firestore (Drift, den AD-5 verhindern will).
- **`PolarSchema` erzwingt keine aufsteigende Sortierung** von `twaDeg`/`twsKn`
  (nur Doku-Kommentar), `interp1` in `src/domain/polar.ts` setzt sie voraus — ein
  unsortiert editiertes `config/polar`-Dokument liefert stillschweigend falsche
  Bootsgeschwindigkeiten (Feldkorrektur ohne Redeploy ist laut AD-8 ausdrücklich
  vorgesehen, trifft also genau diesen Pfad).
- **Doppeletappen-Packung simuliert beide Schläge ab 09:00.** `packLegsFeasible`
  (`src/domain/ppr.ts:77-92`) bewertet die zweite Tages-Etappe mit demselben
  Abfahrtsfenster wie die erste statt ab realer Ankunftszeit — „Serifos→Sifnos→Paros an
  einem Tag" wird mit Morgenwind für beide Schläge gerechnet; Nachmittags-Meltemi-Aufbau
  fällt systematisch unter den Tisch.
- **Positionsableitung ohne Leitplanken.** `deriveCurrentIslandId` (`src/domain/assess.ts`)
  snapt jede GPS-Position auf den nächstgelegenen Bibliotheksplatz **ohne Distanzlimit**
  (Fix in Piräus-Vorort ⇒ „athen", Fix auf halber Strecke ⇒ nächste Insel, als läge man
  dort). Vor dem ersten Fix gilt die Basis nur an Tag 1 — ab Tag 2 ohne Fix ist
  `currentIslandId = null` und alle Optionen kippen auf „zu/Keine Position".
- **Karten-Windpfeile können stumm Mitternachtswerte zeigen.** `MapView.tsx:70-73`:
  `hourIndexAt(Date.now(), times) ?? 0` — liegt „jetzt" außerhalb der Achse (Cache nach
  Horizontende, Blick vor Törnbeginn), zeigen die Pfeile die Werte von Stunde 0 (00:00 UTC)
  als aktuell, ohne Hinweis.
- **Böen (`gustKn`) und `wavePeriodS` werden abgerufen, durch alle Schichten geschleppt und
  nirgends benutzt.** Insbesondere fließen Böen weder in die Platz-Ampel noch in die
  25-kn-Regel ein — bei Meltemi-Planung eine erklärungsbedürftige Auslassung, die nirgends
  als bewusste Entscheidung dokumentiert ist (weder Spec noch Code-Kommentar).
- **`deriveCurrentDay` hardcodiert `+03:00`** (`src/app/tripContext.tsx:98`) statt die
  vorhandene Athens-Logik aus `domain/time.ts` zu nutzen — Duplikat der Zeitzonenlogik
  (AD-9 will genau eine Übersetzungsstelle); außerhalb der Sommerzeit um Mitternacht ein
  falscher Törntag.
- **`tsconfig.json` `types: ["google.maps"]` hängt an einer transitiven Dependency**
  (`@types/google.maps` kommt nur über `@vis.gl/react-google-maps`); nicht als eigene
  devDependency deklariert — ein Minor-Update der Maps-Lib kann `tsc` brechen.
- **`localStorage`-Restore ungeprüft.** `loadPersisted` castet `JSON.parse` blind zu
  `Partial<TripState>`; korrupte/veraltete Einträge (Position ohne `source`, String statt
  Zahl) landen ungefiltert in Reducer und Engine — Zod ist im Projekt vorhanden und wird
  hier nicht benutzt.
- **`NIGHT_LOOKAHEAD_DAYS = 7` hartkodiert** (`src/domain/assess.ts:20`): Nacht-Ampeln
  enden vor dem Planungshorizont (Deadline Tag 10 bei Törntag 1, Forecast 10 Tage);
  AD-8 verlangt Tuning-Parameter im `config`-Dokument, nicht im Code.
- **Hartkodierte UI-Texte widersprechen konfigurierbaren Parametern.**
  `PlaceDetailView.tsx:110` behauptet fix „18:00–09:00 Uhr", obwohl
  `nightStart/EndHourAthens` Config sind; `App.tsx:158` brandet fix „8.–19. August 2026",
  obwohl `tripStartDate`/`tripLengthDays` Config sind.
- **Ampel-Asymmetrien ohne Begründung.** `windHourAmpel` nimmt bei überlappenden Sektoren
  das **großzügigste** Limit (`Math.max`); `waveHourAmpel` kennt keine Gelb-Reserve
  (hart grün→rot an der Grenze) — beides vertretbar, aber nirgends als Entscheidung
  dokumentiert und nicht fixture-gedeckt.
- **Tab-Markierung falsch in der Detailansicht:** `App.tsx:170` markiert „Karte" als aktiv
  für alles ≠ Tagesansicht — auch wenn das Platz-Detail aus der Tagesansicht geöffnet wurde.
- **`fetchModelRunIso` nutzt einen undokumentierten Meta-Endpoint** als dritten Fetch;
  schlägt er dauerhaft fehl, steht der Modelllauf für immer auf „unbekannt", ohne
  Unterscheidung zum echten Datenproblem (FR13-Pflichtanzeige degradiert still).
- **Keine Node-Versionsanforderung deklariert** (kein `engines`-Feld, README schweigt):
  `npm run seed:*` läuft via nativem TS-Type-Stripping erst ab Node ≥ 22.18 — auf
  Philipps Rechner mit Node 20 scheitern die Seeding-Skripte kryptisch.
- **Toter Parameter:** `legWindow(..., maxDurationHours)` (`src/domain/time.ts:94`) wird
  vom Scoring ignoriert, das `maxHours = 24` separat hartkodiert — zwei Quellen für
  dieselbe Grenze.
- **Repo-Hygiene:** `package.json` `repository.url` zeigt auf den lokalen Dev-Proxy
  (`http://local_proxy@127.0.0.1:41729/...`), Lizenz „ISC", `author` leer.

## Positiv verifiziert (der Vollständigkeit halber)

- AD-2 mechanisch sauber: Domain ohne react/firebase/fetch/`Date.now()`; Zeit/Position injiziert.
- AD-4/AD-6: Sektorsemantik (CW, Wrap 330–60, inklusive Grenzen, `0–360` = Rundumschutz) korrekt implementiert und mit Referenzfällen getestet (inkl. „Meltemi aus N, nach S offen ⇒ grün / nach N offen ⇒ rot").
- AD-10: Offset nur in `polar.ts` (Fixture „exactly once"), Lee/Luv-Laufzeitregel in `ampel.ts`, PPR ohne Orts-/Distanzkonstanten, Alimos-Rebasing als Datenfeld `rebasedFrom`.
- I/O-Matrix-Zeilen „Aufkreuzen >25 kn ⇒ rot", „Invalides Platz-Dokument ⇒ geloggt + unbewertet", „Manuelle Position bleibt", „Import ohne Freigabe ⇒ Exit ≠ 0", „Forecast-API down ⇒ Error-State + letzter Datenstand" sind implementiert; Marine-Ausfall tötet den Windforecast nicht.
- Pflicht-UI-Hinweise (NFR3, Datenstand mit Modelllauf+Abrufzeit, Open-Meteo-/CruisersWiki-Attribution) vorhanden; Beispieldaten durchgängig `approved: false` mit Quellenvermerk.
