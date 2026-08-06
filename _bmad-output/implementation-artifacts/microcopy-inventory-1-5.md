# Microcopy-Inventar — Story 1.5

Audit aller nutzersichtbaren deutschen Texte gegen die neun Voice-&-Tone-Regeln aus
`EXPERIENCE.md` (Rubrik siehe Story 1.5, Dev Notes). Baseline: `feeab43`.

**Verdikte:** `ok` = regelkonform, unverändert · `ok-canonical` = von DESIGN.md/EXPERIENCE.md
oder einer Vorgänger-Story wörtlich vorgegeben · `fixed (Regel #)` = Verstoß behoben ·
`waived (Regel #)` = Verstoß erkannt, Behebung braucht Logik-/Layout-Änderung.

Nicht auditiert (kein Nutzertext): CSS-Klassennamen, `import.meta.env`-Variablennamen,
Insel-/Platz-/Leg-IDs als Daten, ISO-Zeitstempel, `console.warn/error` (Entwickler-Konsole),
Code-Kommentare (die Rubrik gilt für Anzeigetexte).

---

## 1. Behobene Verstöße

| Text (vorher → nachher) | Datei | Regel | Anmerkung |
|---|---|---|---|
| `⏰ Empfohlene Abfahrt …` → `Empfohlene Abfahrt …` | `src/ui/views/DayView.tsx` | 9 | Emoji als Bedeutungsträger; Farbe (`.abfahrt-zeile`) und Text tragen die Aussage bereits |
| Options-Chip `schliesst` → `schließt` | `src/ui/views/DayView.tsx` (`OPTION_STATE_LABEL`) | 4, 5 | ß-Orthografie + Chip-Set des Spines. Der Tag steht im Fristen-Badge daneben („noch N Tage · bis Tag X") — dieses Badge ist der Träger von „schließt **Tag X**", der Chip nennt nur den Zustand. Schema-Unionswert `schliesst` bleibt unangetastet (Datenwert, kein Anzeigetext) |
| Options-Chip `zu` → `geschlossen` | `src/ui/views/DayView.tsx` | 4 | Spine-Chip-Set: „offen" / „offen · Vorbehalt" / „schließt" / „geschlossen" |
| „eine Option schliesst an dem Tag" → „schließt" | `src/ui/views/DayView.tsx` (Optionsraum-Einleitung) | 5 | ß-Orthografie |
| „ein landfreier Direktkurs liess sich nicht berechnen" → „ließ" | `src/ui/views/DayView.tsx` | 5 | ß-Orthografie |
| `aria-label="Abfahrt früher"` → `„Abfahrt früher legen"` | `src/ui/views/DayView.tsx` | 6 | Bedienelement ohne Verb; jetzt Infinitiv-Phrase wie „Etappe ändern" |
| `aria-label="Abfahrt später"` → `„Abfahrt später legen"` | `src/ui/views/DayView.tsx` | 6 | dito |
| `HEUTE entscheiden: …` → `Heute entscheiden: …` | `src/domain/options.ts` (`deriveDecisionPoints`) | 1 | Versalien schreien; sachliches Register. Testzusicherung `options.test.ts` in derselben Änderung nachgezogen |
| `HEUTE entscheiden — …` → `Heute entscheiden — …` | `src/domain/assess.ts` (Konzeptwechsel) | 1 | dito |
| `… ab morgen ist diese Option zu` → `… geschlossen` | `src/domain/options.ts` | 4 | ein Vokabular mit dem Options-Chip |
| `… schliesst am Tag X` → `… schließt Tag X` | `src/domain/options.ts` | 3, 5 | ß-Orthografie + Fristen-Form „Tag N" ohne „am" |
| `… ist NICHT gedeckt — …` → `… ist nicht gedeckt — …` | `src/domain/konzept.ts` (Entscheidungstor) | 1 | Versalien; „nicht" trägt die Aussage auch klein. Testzusicherungen `konzept.test.ts` in derselben Änderung nachgezogen |
| `Ankunft … um {19.5} Uhr` → `{19,5} Uhr` (2 Stellen) | `src/domain/solver.ts` | 6 | englischer Dezimalpunkt. HH:MM-Umrechnung wäre Logik → siehe Waiver W1 |
| `{avgSpeedKn.toFixed(1)} kn` → `formatKnPrecise(…)` | `src/ui/views/DayView.tsx` (Wind-Basis) | 6 | „6.5 kn" → „6,5 kn" mit schmalem Leerzeichen |
| `{distanceNm.toFixed(1)} sm` (2 Stellen) → `formatSm(…)` | `src/ui/views/DayView.tsx` (Rechenweg-Tabelle) | 6 | „12.3 sm" → „12,3 sm" |
| `{segment.speedKn.toFixed(1)} kn` → `formatKnPrecise(…)` | `src/ui/views/DayView.tsx` | 6 | dito |
| `{departureHour}:00` (3 Stellen) → `formatHourOfDay(…)` | `src/ui/views/DayView.tsx` | 6 | nullgepolsterte Uhrzeit „09:00" statt „9:00" |
| `{maxWindKn} kn`, `{maxKn} kn`, `{maxM} m` → `formatKn`/`formatWaveM` | `src/ui/views/PlaceDetailView.tsx` | 6 | Einheiten über die Helfer, schmales Leerzeichen |
| Einheiten-Literale `… sm`, `… kn` (7 Stellen) → schmales geschütztes Leerzeichen U+202F | `DayView.tsx`, `MapView.tsx`, `PlaceDetailView.tsx` | 6 | DESIGN.md Typography: „narrow no-break space before units" |
| `formatHours`/`formatKn`/`formatWaveM` Ausgabe: normales → schmales geschütztes Leerzeichen | `src/ui/format.ts` | 6 | zentral, damit kein Aufrufer es einzeln richten muss |
| „Bibliothek konnte nicht geladen werden: {msg}" → nennt Folge + Ausweg, „Ursache: {msg}" | `src/app/App.tsx` | 7 | Fehlertext ohne Ausweg; „Fehler:"-Etikett ersetzt |
| „Open-Meteo nicht erreichbar … Fehler: {msg}" → „Forecast nicht erreichbar … Später erneut aktualisieren … Ursache: {msg}" | `src/app/App.tsx` | 5, 7 | bares „Fehler"; Providername → Nutzerbegriff „Forecast" (Spine-Vokabular) |

**Neue Helfer** (nur Formatierung, keine Domänenlogik): `formatSm`, `formatKnPrecise` in
`src/ui/format.ts`; fünf zusätzliche Testfälle sichern Dezimalkomma und U+202F ab.

## 2. Waiver

| # | Text | Datei | Regel | Warum kein Fix | Was es bräuchte |
|---|---|---|---|---|---|
| W1 | „Ankunft an der Basis erst um 19,5 Uhr" | `src/domain/solver.ts` | 6 | Dezimalstunde statt „19:30". Das Dezimalkomma ist gesetzt; die HH:MM-Form bräuchte einen Formatierhelfer in der Domänenschicht — Logik, nicht Text | reiner Anzeigehelfer in `domain/` (oder Verlagerung der Textbildung in die UI-Schicht), dann `19:30` |
| W2 | „Ankunft erst gegen 17,5 Uhr" | `src/domain/abfahrt.ts` | 6 | wie W1 (Komma war bereits korrekt) | wie W1 |
| W3 | Entscheidungstor-Notiz nennt rohe Insel-ID („… Tag 6, syros …") | `src/domain/konzept.ts` | 2 | Die Domäne kennt an dieser Stelle nur die ID; der Name käme aus der Bibliothek | Bibliotheks-Nachschlag in der Textbildung oder Auflösung in der UI-Schicht (Datenfluss-Änderung); `konzept.test.ts` prüft die ID |
| W4 | Konzeptwechsel-Hinweis nennt rohe Insel-ID („ab syros") | `src/domain/konzept.ts` | 2 | wie W3 | wie W3 |
| W5 | Rechenweg-Überschrift zeigt Leg-ID (`alimos--kythnos` → „alimos → kythnos") | `src/ui/views/DayView.tsx`, Fallback in `stageText.ts` | 2 | Fallback, wenn die Bibliothek keinen Namen liefert; die ID ist die einzige verfügbare Information | Namensauflösung mit Fallback-Kette (Logik) |
| W6 | Koordinaten `toFixed(4)` („37.4521° N") | `src/ui/views/PlaceDetailView.tsx`, `src/ui/components/StageMap.tsx` | 6 | Technische Koordinaten in Dezimalgrad — der Punkt ist hier internationale Konvention, kein deutsches Zahlenformat | bewusst so belassen |

Alle sechs Waiver sind **Erkenntnisse, keine Schulden ohne Adresse**: W1/W2 und W3–W5 sind
Kandidaten für eine spätere Story „Domänentexte auflösen".

## 3. Geprüft und unverändert (Auswahl der tragenden Texte)

| Text | Datei | Verdikt |
|---|---|---|
| „Round-Trip trägt / unter Vorbehalt / Kein gültiger Round-Trip — Vorschlag mit der geringsten Verletzung" | `TripStatusLine.tsx` | ok-canonical (EXPERIENCE State Patterns) |
| „Keine Optionen mehr offen — Rückweg fixiert." | `DayView.tsx` | ok-canonical (Regel 8, wörtlich im Spine) |
| „Ab Tag N beruht die Planung auf einer Annahme." | `DayView.tsx` | ok-canonical |
| „Noch keine Hauptroute festgelegt." + „Vorschlag übernehmen" | `DayView.tsx` | ok-canonical |
| „Hafentag in {Ort}" + „Weiter am {Wochentag}: A → B" | `DayView.tsx` | ok-canonical (Story 1.2) |
| „Etappe ändern", „Route ansehen", „Als Hauptroute übernehmen", „Aktualisieren", „Abmelden", „Vorschlag übernehmen", „Zwischenstopp löschen", „Manuelle Position lösen", „GPS erneut abfragen", „Festlegung lösen", „Schließen" | diverse | ok (Regel 6: Infinitiv-Phrasen) |
| „Wie kommt die Zeit zustande?", „Wie sind die Werte zu lesen?" | `DayView.tsx` | ok-canonical (Spine nennt die Frageform ausdrücklich) |
| „Heute" / „Karte" (Tabs) | `App.tsx` | ok-canonical (Nomen, keine Aktionen) |
| „Grün / Gelb / Rot / Unbewertet" (+ `AMPEL_LABEL`) | `AmpelBadge.tsx` | ok-canonical (Regel 2, Farbwort zuerst) |
| „gut · bis N kn" / „mäßig · bis N kn" / „schwach · bis N kn" / „offen" | `PlaceDetailView.tsx` | ok-canonical (Story 1.4; Farbe nie einziger Träger) |
| „Keine kuratierten Schutzdaten — konservativ behandeln." | `PlaceDetailView.tsx` | ok-canonical (NFR6) |
| „Kein Foto verfügbar" | `PlaceDetailView.tsx` | ok-canonical (Story 1.4) |
| „Karte nicht verfügbar." + Nennung der fehlenden `VITE_`-Variablen | `MapView.tsx`, `mapsEnv.ts` | ok (Regel 7: Ursache + Ausweg, Variablennamen sind Code) |
| „Karte lädt …" (sichtbar) / „Karte wird geladen …" (Screenreader) | `MapViewSkeleton.tsx` | ok — bewusst zweistufig: knappe Bildschirmzeile, vollständiger gesprochener Satz. Gleiches Muster in `DayViewSkeleton.tsx` |
| „Aktualisierung läuft …" (Screenreader, während des Abrufs) | `App.tsx` | ok (Ersatz für die reine Dreh-Animation, Story 1.1) |
| „Forecast: {Modell} · Lauf {…} · abgerufen {…}", „Stand vor N h" | `App.tsx` | ok-canonical (Regel 5/7, Provenienz) |
| „Ersetzt nicht das seemännische Urteil — Modell-Konsens parallel prüfen (z. B. Windy)." | `App.tsx` | ok-canonical (NFR3) |
| „Kein GPS-Zugriff — Position manuell wählen." | `PositionPopover.tsx` | ok (Hinweis führt weiter) |
| „Gespeicherter Plan nicht lesbar." | `DayView.tsx` | ok (AD-12) |
| Marker-/Kapsel-Namen „{Platz} — {Ampel-Wort}" | `MapView.tsx` | ok-canonical (Story 1.3) |
| „Konto", „Legende", „Ansicht", „Bootsposition", „Position bearbeiten", „Forecast aktualisieren", „Etappenliste ein-/ausklappen" | aria-Labels | ok (Regionen/Bilder als Nomen, Aktionen als Infinitiv) |
| Rechenweg-Spalten „Punkt · Zeit (Athen) · Distanz ab Start · Abschnitt · Kurs · Wind aus · Stärke · TWA · Fahrt" | `DayView.tsx` | ok (Tabellenköpfe; TWA-Erklärung steht in der Lesehilfe derselben Fläche, Regel 9) |
| „Die Welle ist der Modellwert für die offene See am Ort des Platzes" | `PlaceDetailView.tsx` | ok — „Ort" hier als *Position*, nicht als Synonym für „Platz" (Regel 5 zielt auf das Synonym) |
| „Tagesziel (Insel)" | `DayView.tsx` | ok — PRD-Glossar führt „Tagesziel" als eigenen Begriff |
| Dekorative Glyphen `✎ ⟳ › − + → ←` (alle `aria-hidden` bzw. in benannten Buttons) | diverse | ok (Regel 9: keine Emoji, Glyphen mit Textbedeutung daneben) |
| `index.html`: Titel „SailGreece", Beschreibung „SailGreece — privater Törnplaner …" | `index.html` | ok-canonical (Story 1.1) |
| „Die Törnbibliothek und der geplante Törn sind nicht öffentlich. …" + „Mit Google anmelden" | `SignInView.tsx` | ok (Regel 1/6) |

## 4. Abdeckung (Kreuzprüfung gegen die Dateiliste)

| Datei | Auditiert |
|---|---|
| `src/ui/views/DayView.tsx` | ja — größte Textfläche; 11 Verstöße behoben, 1 Waiver (W5) |
| `src/ui/views/MapView.tsx` | ja — 3 Einheiten-Literale behoben |
| `src/ui/views/PlaceDetailView.tsx` | ja — 4 Einheiten-Stellen behoben, kn-Lesehilfe ergänzt, 1 Waiver (W6) |
| `src/ui/views/SignInView.tsx` | ja — konform, unverändert |
| `src/app/App.tsx` | ja (inkl. AuthGate-Karte, Kopf, Footer) — 2 Fehlertexte behoben |
| `src/ui/components/AmpelBadge.tsx` | ja — kanonisch |
| `src/ui/components/AvatarMenu.tsx` | ja — konform |
| `src/ui/components/DayViewSkeleton.tsx` | ja — konform |
| `src/ui/components/MapViewSkeleton.tsx` | ja — konform (zweistufig, dokumentiert) |
| `src/ui/components/PositionPopover.tsx` | ja — konform |
| `src/ui/components/TripStatusLine.tsx` | ja — kanonisch |
| `src/ui/components/RouteMap.tsx` | ja — nur Tagesnummern, kein Prosatext |
| `src/ui/components/StageMap.tsx` | ja — 1 Waiver (W6, Koordinaten-Tooltip) |
| `src/ui/components/SeamarkLayer.tsx` | ja — Attributionstext, kanonisch (CC-BY-SA) |
| `src/ui/components/WindBarb.tsx` | keine nutzersichtbaren Texte (SVG-Geometrie) |
| `src/ui/components/Polyline.tsx` | keine nutzersichtbaren Texte |
| `src/ui/format.ts` | ja — Einheiten-Konvention zentral gesetzt |
| `src/ui/stageText.ts` | ja — 1 Waiver (W5, Leg-ID-Fallback) |
| `src/ui/dayViewModel.ts` | ja — „Stand vor N h", Verdikt-Etiketten: kanonisch |
| `src/ui/placeViewModel.ts` | ja — Sektor-Wörter: kanonisch (Story 1.4) |
| `src/ui/mapsEnv.ts` | Variablennamen sind Code; Hinweistext lebt in `MapView.tsx` (dort auditiert) |
| `src/domain/options.ts` | ja — 3 Verstöße behoben |
| `src/domain/assess.ts` | ja — 1 Verstoß behoben |
| `src/domain/konzept.ts` | ja — 1 Verstoß behoben, 2 Waiver (W3, W4) |
| `src/domain/solver.ts` | ja — 2 Verstöße behoben, 1 Waiver (W1) |
| `src/domain/abfahrt.ts` | ja — 1 Waiver (W2) |
| `src/domain/persistence.ts` | ja — Texte gehen an die Entwickler-Konsole, nicht ins UI |
| `src/adapters/auth.ts`, `firestore.ts` | ja — Fehlermeldungen erscheinen im UI als „Ursache: …"-Anteil der Panels (dort auditiert); Wortlaut technisch und zutreffend |
| `index.html` | ja — kanonisch |

**Keine Datei übersprungen.** Verstöße behoben: 24 Textstellen (davon 7 zentral über
`format.ts`). Waiver: 6, jeder mit Begründung und benanntem Weg zur Behebung.
