# UI-Inventar — Ist-Zustand (Code-Scan, 2026-08-05)

Quelle: Explore-Subagent über `src/`, `index.html`, PRD/Brief-Zusammenfassung. Referenz für das Redesign; Spines gewinnen bei Konflikt.

## 1. Tech-Stack

| Bereich | Stand |
|---|---|
| Framework | React 19 + TypeScript 5.9, Vite 8. Entry: `index.html` → `src/app/main.tsx` → `App.tsx` |
| Routing | Keins — View-Switching per `useState` in `App.tsx` (`tag`/`karte`/`platz`, AD-11). Keine URLs, kein Browser-Back |
| Styling | Eine globale Datei `src/ui/styles.css` (1369 Zeilen). CSS Custom Properties in `:root` als einzige Token-Ebene. Kein Tailwind, keine Component-Library |
| Karte | Google Maps via `@vis.gl/react-google-maps` (hybrid/Satellit überall); `Polyline.tsx` lokal gevendort |
| State | TanStack Query 5 (Library + Forecast) + 3 Contexts (`auth`, `trip`, `planning`); Zod 4 |
| Backend | Firebase Auth (Google, Pflicht-Gate) + Firestore + Hosting; Open-Meteo |
| Tests | Vitest, domänenlastig; keine Component-/Render-Tests |

## 2. Produkt

Single-Purpose-Planungs-App für einen konkreten Törn: 12 Tage / 11 Etappen Kykladen-Familienrundtrip, 50-ft-Katamaran ab Marina Alimos, 8.–19. Aug 2026, Meltemi-Saison. Leitet täglich den kompletten Round-Trip aus Live-Windforecasts + kuratierter Bibliothek (Inseln, Liegeplätze, Legs, Schutzsektoren) ab und bewertet alles mit vierstufiger Ampel (grün/gelb/rot/unbewertet). Kernversprechen: Der Rückweg gegen den Meltemi muss immer möglich bleiben — zeigt Reichweite, Kosten jeder Option und den spätesten Entscheidungstag. UI-Sprache: Deutsch.

## 3. Screens/Views

- **A. SignInView** — Login-Gate: zentrierte Karte, Serif-Wortmarke, „Mit Google anmelden“; Error-Panel bei fehlenden Env-Vars; „Anmeldung wird geprüft…“-Variante in `App.tsx`.
- **B. App-Shell** (`App.tsx`) — Navy-Topbar (Brand, Tabs Tagesansicht/Karte, AccountChip), Notice-Bar (Datenstand + „Aktualisieren“), Error-Panels, **ControlsBar** (Törntag-Select, Positions-Select, GPS, Abfahrtsstunde — eine dichte Flex-Zeile), Footer (Open-Meteo-Attribution).
- **C. DayView „Tagesansicht“** (1058 Zeilen!) — ~10 gestapelte Sektionen: Tageskopf, Hinweis-Panels, Forecast-Horizont-Details, **Rest-Trip-Banner** (Ampel + Deadlines + Gründe), **Heute** (StageCard), **Rest-Trip** (StageCard-Liste), **Optionsraum** (OptionRows mit State-Chips/Deadlines), **Alternativ-Routen** (expandierbar mit RouteMap), **Bereits gefahren**. StageCard expandiert in StageEditor (FR28) bzw. Rechen-Panel (FR30: StageMap + WindBasis + 9-Spalten-Breakdown-Tabelle).
- **D. MapView „Karte“** (560 Zeilen) — Sticky-Split: links Itinerary-Spalte (Legende, Windfiedern-Toggle, Alt-Routen-Toggles, Itinerary-Cards hover-synced), rechts Google-Hybrid-Karte (Polylines, Etappen-Marker „4·8“, Ampel-Pins, WindLayer).
- **E. PlaceDetailView** (252 Zeilen) — „← Zurück“, PlaceHero (Foto → Satelliten-Minimap → Navy-Gradient), Beschreibung, Warnungen, Nacht-Ampel, Qualitäten (●●●○○), Shelter-Tabelle.

## 4. Aktuelle visuelle Sprache

Dokumentierte Absicht in `styles.css`: „Y.CO-inspired: calm creme/navy palette, uppercase letterspaced labels, serif headlines, hairline dividers, lots of whitespace“.

- **Tokens (`:root`):** `--creme #f7f3ea`, `--creme-card #fffdf7`, `--navy #1b2a41`, `--navy-soft #2d4059`, `--ink #24303f`, `--muted #6b7684`, `--hairline #ddd6c7`, `--gruen #3a7d44`, `--gelb #d9a441`, `--rot #b0413e`, `--grau #9aa5b1`; `--serif` Georgia, `--sans` Helvetica Neue.
- **Typo:** Nur Systemfonts, keine Webfonts. Body 15px/1.55; Serif-Headlines navy 500; Signatur-Label `.versal` (0.68rem, .28em Tracking, uppercase) in ~6 abweichenden Varianten dupliziert.
- **Spacing:** ~25 verschiedene Ad-hoc-rem-Werte, keine Skala. Max-Width 1280px.
- **Radii:** unsystematisch gemischt (0 / 2px / 4px / 0.8rem / 50%).
- **Flächen:** Creme-Seite, Creme-Karten, 1px-Hairlines, praktisch keine Schatten.
- **Buttons:** 5 unabhängige Rezepte via Nachfahren-Selektoren, keine gemeinsame Klasse; nur `.google-button` hat `:hover`.
- **~20 rohe Hex-Werte außerhalb der Tokens** in CSS; 4 Paletten zusätzlich in TS (`AMPEL_CSS_COLOR`, `ALT_ROUTE_COLORS`, `REST_LINE_COLOR`, `SAILED_LINE_COLOR`).

## 5. Schmerzpunkte (Code-Evidenz)

### Inkonsistenzen
- **Zwei fast identische Ampel-Paletten**: Badge (`#3a7d44/#d9a441/#b0413e/#9aa5b1`) vs. Karten-Linien (`#3f7d4f/#c8952a/#b3423a/#8b8b8b`) — gleiche Bewertung, subtil andere Farbe.
- **Ungestylte native Browser-Buttons** auf dem primären Aktionspfad: `.stage-actions`, `.editor-actions`, „Standard“, „Vorschlag der App übernehmen“ — direkt neben durchgestylten Navy-Buttons. Sichtbarster Bruch der App.
- Button-Rezepte mehrfach wortgleich dupliziert; Ghost-Button 3× fast kopiert.
- `hint-panel` trägt mal Info, mal harten Fehler („kein Round-Trip baubar“) — gleiche Klasse, gegensätzliche Semantik.
- Bedeutung über nackte Emoji: 📌, ⚓/⚠/⛔, 🟢🟡🔴⚪ in `<option>`, ●○-Sterne.

### Dichte
- DayView: ~10 Sektionen ohne In-Page-Navigation; bis zu 12 expandierbare StageCards mit je Karte + 9-Spalten-Tabelle.
- ControlsBar: 3 Selects + 2 Buttons + Inline-Error in einer Zeile bei 0.85rem — enge Tap-Targets.
- Essenzielle Bedeutung nur in `title`-Tooltips (auf Touch unsichtbar): Doppelschlag, „Meltemi-fest bis“, Umkehrtag, Tabellen-Spalten.

### Fehlende States
- Nur ein globaler Loading-Text; keine Skeletons; Solver läuft synchron ohne Feedback.
- Kein `:disabled`-Styling, **null `:focus`/`:focus-visible`-Regeln**, `:hover` nur auf einem Button.
- Leere Zustände = Abwesenheit (Sektion verschwindet statt „keine Optionen mehr offen“).
- Kein Error-Boundary, kein Dark Mode, kein `prefers-reduced-motion`, keine Print-Styles.

### Barrierefreiheit
- Karten-Pins/Marker sind klickbare `<div>`s ohne role/tabIndex — nur Maus.
- Listen↔Karten-Highlight nur `onMouseEnter` — nicht Tastatur/Touch.
- Kaputte Heading-Hierarchie: kein `h1` in der Shell; Sektionstitel als `<span class="versal">`.
- Kontrast-/Lesbarkeitsrisiken: `--muted` auf Creme-Karte, 0.68rem mit .28em Tracking, `.state-offen-horizont` fast unsichtbar.
- Keine `aria-live`/`role="status"`-Regionen; `mapId` fällt still auf `DEMO_MAP_ID` zurück.

## 6. Datei-Karte für den Redesign-Pass

- **Styling-Zentrale:** `src/ui/styles.css` (1369 Z.)
- **Views:** `src/ui/views/DayView.tsx` (1058 Z., wichtigstes Split-Ziel), `MapView.tsx` (560 Z.), `PlaceDetailView.tsx` (252 Z.), `SignInView.tsx` (67 Z.)
- **Shell:** `src/app/App.tsx` (307 Z.), `src/app/main.tsx`, `index.html` (Fonts/Favicon/Meta fehlen)
- **Komponenten:** `src/ui/components/AmpelBadge.tsx` (Farb-Duplikat!), `WindBarb.tsx`, `StageMap.tsx`, `RouteMap.tsx`, `Polyline.tsx`; `src/ui/altRouteColors.ts`
- **Helpers (Strings/Format):** `src/ui/format.ts`, `mapPath.ts`, `windField.ts`
- **State/Data (nur States-relevant):** `src/app/*Context.tsx`, `usePlanning.ts`, `src/adapters/*`
