# UI Inventory — sailgreece-router (Ist-Zustand, 2026-08-05)

Compact structured findings from a read-only exploration of the implemented app. Feeds the DESIGN.md / EXPERIENCE.md distillation.

## 1. Tech stack

| Concern | Choice |
|---|---|
| Framework | **React 19.2** + **TypeScript 5.9**, **Vite 8** (`@vitejs/plugin-react`). Entry `index.html` → `src/app/main.tsx` → `App.tsx` |
| Routing | **None** — no react-router. View switching is `useState` in `App.tsx`: `{kind:'tag'|'karte'|'platz'}` (documented as "AD-11"). No URLs, no deep links, no browser-back |
| Styling | **One hand-written global stylesheet**: `src/ui/styles.css` (1369 lines), imported once in `App.tsx`. CSS custom properties in `:root` are the only token layer. **No Tailwind, no CSS modules, no CSS-in-JS, no component library.** ~11 inline `style={{}}` for dynamic colors |
| Map | **Google Maps** via `@vis.gl/react-google-maps` 1.9 (`APIProvider`, `Map`, `AdvancedMarker`, `useMap`), always `mapTypeId="hybrid"`. `Polyline` vendored locally (lib ships none) |
| State | **TanStack Query 5** for async (library + forecast, `staleTime` 1 h) + 3 contexts: `authContext` (Firebase Auth), `tripContext` (reducer: day/position/pins/overrides), `planningContext` (single `usePlanningEngine`). Assessment = pure recompute per snapshot. **Zod 4** validation |
| Backend | Firebase Auth (Google, mandatory gate) + Firestore + Hosting; Open-Meteo forecasts; `VITE_DATA_SOURCE=local` reads `seeding/data/*.json` |
| Tests | Vitest 4 — 23 domain tests, 3 UI-logic tests. **No component/render tests** |

Env-driven UI: `VITE_GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_MAPS_MAP_ID` (defaults to `'DEMO_MAP_ID'`), `VITE_FIREBASE_*`. UI language: **German**.

## 2. Product summary

Single-purpose planning app for one specific trip: a 12-day / 11-leg Cyclades family round trip on a 50 ft catamaran from Marina Alimos (Athens), 8–19 Aug 2026, in Meltemi season. Each day it re-derives the **complete round trip** from live wind forecasts plus a curated library of islands, berths, legs and shelter sectors, grading everything with a four-state traffic light ("Ampel": grün/gelb/rot/unbewertet). Core promise: the return leg against the Meltemi must always remain possible — it shows how far you can still get, what each option costs, and by which day you must decide. It replaces the skipper's mental arithmetic, not his seamanship.

## 3. Screen / view inventory

**A. `SignInView`** — login gate. Centered card: serif wordmark + uppercase subtitle, lead paragraph, one navy "Mit Google anmelden" button with inline Google `G` SVG. Missing Firebase env → named error panel instead of button (no bypass). A near-duplicate "Anmeldung wird geprüft …" card is inlined in `App.tsx`.

**B. App shell** (`App.tsx`) — `topbar` (navy: serif brand + uppercase "Kykladen · date range", tab nav, `AccountChip` with avatar/name/Abmelden); `notice-bar` (mandatory data-provenance strip: model, model run, fetched-at + "Aktualisieren" refetch); library/forecast error panels; `ControlsBar` (one dense flex row: Törntag select, Position select, "GPS abfragen", conditional "Manuelle Position lösen", Abfahrt hour select, inline GPS error); `main.content` max-width 1280px; `footer.attribution` (Open-Meteo CC-BY + curation disclaimer).

**C. `DayView` — "Tagesansicht"** (1058 lines, largest UI file). Stacked sections: (1) day header with position + departure hour; (2) `positionNote` hint; (3) collapsible `<details>` "Ab Tag N beruht die Planung auf einer Annahme"; (4) **rest-trip banner** — Ampel-colored left border, verbal verdict badge, return deadline, "Spätester Umkehrtag" + "Meltemi-fest bis" badges, reason list; (5) "no main route yet" check-in prompt; (6) **Heute** — one `StageCard`; (7) **Rest-Trip** — `StageCard` list; (8) **Optionsraum** — `OptionRow` per curated route (state chip offen/offen·Vorbehalt/schliesst/zu, reach + turn-day + deadline badges, Ampel, cost note, reasons, "Diese Option verfolgen"); (9) **Alternativ-Routen** — `AlternativeRow` (colored dot + turn point, leg chips, "Route ansehen" → `RouteMap` + day-by-day list + "Als Hauptroute übernehmen"); (10) **Bereits gefahren** badge list.
  - `StageCard`: head row (Etappe/Hafentag · day · date · HEUTE + Ampel), serif `From (berth) → To (berth)` headline + 📌 pin chip, via-line, badge row (sm / Fahrt / Liegezeit / "N Schläge — Ausnahme"), berth line with link-button + Ampel + "Vorschlag" chip, `rueckweg-zeile` (⚓/⚠/⛔), reasons, two action buttons.
  - `StageEditor` (inline): island select (range-filtered), berth select with 🟢🟡🔴⚪ emoji in `<option>` text, stop-hours number input + "Standard", "Festlegung lösen", "Schließen", error box.
  - Expanded calc panel: `StageMap` + per-leg `WindBasis` (barb + `<dl>` + `<details>` reading aid) + `Breakdown` **9-column table** reflowing to stacked cards <700 px via `data-label`.

**D. `MapView` — "Karte"** (560 lines). Sticky split (stacks map-on-top ≤860 px). Left: `route-toggles` (legend solid gefahren / dashed Rest-Trip / Ampel, "Windfiedern" checkbox + barb legend with truncation notice, `alt-toggles` checkbox list per alternative), then one `itinerary-card` per sailing stage + per harbour day, hover-synced with map. Right: hybrid Google map — dashed alternative polylines, per-stage polylines (solid green sailed / dashed rest-Ampel color, thicker on hover), grouped stage-number markers ("4·8" capsule), place pins (Ampel-colored where relevant, else muted), `WindLayer` barbs offset upwind with zoom-dependent thinning. No key → itinerary + "Karte nicht verfügbar" hint panel.

**E. `PlaceDetailView`** (252 lines). "← Zurück" text button; `PlaceHero` (240 px) with 3-tier source ladder (curated `photoUrl` → live satellite mini-map with caption overlay + gradient scrim → navy gradient fallback); description; `warnung` blocks; three sections: **Nacht-Ampel** (badge + max wind/wave badges + reasons + window), **Qualitäten** (`●●●○○` strings ×3), **Sicherer Liegeplatz** (`shelter-table` wind/wave sectors, wave rows de-emphasized as non-scoring, source note). Invalid place → `h1` + error panel + "unbewertet".

**Shared components:** `AmpelBadge`, `WindBarb` (SVG, white halo), `Polyline` (dashed via symbol-repeat, white casing), `StageMap` (one day, `fitBounds`), `RouteMap` (whole-route preview).

## 4. Current visual language

Stated intent atop `styles.css`: *"Y.CO-inspired: calm creme/navy palette, uppercase letterspaced labels, serif headlines, hairline dividers, lots of whitespace"*.

**Tokens — `src/ui/styles.css` `:root` (only token definition):**
`--creme #f7f3ea` · `--creme-card #fffdf7` · `--navy #1b2a41` · `--navy-soft #2d4059` · `--ink #24303f` · `--muted #6b7684` · `--hairline #ddd6c7` · `--gruen #3a7d44` · `--gelb #d9a441` · `--rot #b0413e` · `--grau #9aa5b1` · `--serif Georgia,'Times New Roman',serif` · `--sans 'Helvetica Neue',Arial,sans-serif`

**Typography:** system fonts only — **no webfont loading anywhere** (no `<link>`, no `@font-face`). Body 15px/1.55 sans; `h1/h2/h3` serif navy weight 500 (1.9 / 1.25 rem). Signature label = `.versal` (0.68rem, `letter-spacing .28em`, uppercase, muted), re-implemented with ~6 different size/tracking combos in `.tabs button`, `.ampel`, `.state-chip`, `.breakdown-table th`, `.wind-basis dt`, `.stage-editor label`.

**Spacing:** ad-hoc rem, **no scale** — ~25 distinct values from `0.08rem` to `2.2rem`. Content max-width 1280px; padding 1.6/1.4rem → 1/0.9rem mobile.

**Radii:** unsystematic — `0` (cards, controls), `2px` (badges, chips, markers), `4px` (banners, option rows, wind-basis, mobile table rows), `0.8rem` (capsule stage number), `50%` (dots).

**Surfaces:** creme page / creme-card panels / `1px solid var(--hairline)`; essentially **no shadows on chrome** (only map markers).

**Buttons — five unrelated recipes, all via descendant selectors, no shared class:** `.tabs button` (ghost, uppercase .18em, `.active` inverts) · `.controls button` (solid navy) + `.controls button.secondary` (outline) · `.option-row button` / `.alt-route button` (duplicated solid navy) · `.google-button` (full-width navy, the **only** `:hover` in the file) · `.card .platz-zeile button` + `.back-link` (underlined text links).

**Hexes outside the token set (~20, raw in CSS):** `#b9c2cf`, `#dfe6ee`, `#d7dfea`, `#e5efe2`/`#bcd3bf`, `#eef`, `#f7ecd7`/`#8a6414`/`#e4cf9f`, `#f3dedd`/`#ddb3b1`, `#f6e2df`/`#8c2f24`/`#e3b6af`, `#e9eef4`, `#fdf8ee`, `#fffef9`, `#4e6b8c`.
**Palettes defined in TS:** `AMPEL_CSS_COLOR` = `#3a7d44/#d9a441/#b0413e/#9aa5b1` (`AmpelBadge.tsx`) · `ALT_ROUTE_COLORS = ['#6f4a9c','#1f7a8c','#b05f2c']` (`altRouteColors.ts`) · `REST_LINE_COLOR` = `#3f7d4f/#c8952a/#b3423a/#8b8b8b` + `SAILED_LINE_COLOR = '#3f7d4f'` (`MapView.tsx`) · `#1b2a41` default (`WindBarb.tsx`) · `#ffffff` casing (`Polyline.tsx`).

## 5. UI pain-point candidates

**Inconsistencies**
- **Two divergent Ampel palettes.** `AMPEL_CSS_COLOR` (`#3a7d44/#d9a441/#b0413e`) vs `REST_LINE_COLOR` (`#3f7d4f/#c8952a/#b3423a`) — near-identical but unequal, so badge and route line for the same verdict differ subtly. Ampel colors exist twice (CSS var + TS record) with no single source.
- **Unstyled buttons — the biggest visual break.** There is **no global `button` rule and no global `.secondary` rule**; `.secondary` exists only as `.controls button.secondary` and `.alt-route button.secondary`. Every button inside `.stage-actions`, `.editor-actions`, `.stage-editor label` ("Standard") and `.hint-panel` ("Vorschlag der App übernehmen") renders as a **native browser button** — and those sit on the primary action path.
- Recipes duplicated verbatim (`.option-row button` ≡ `.alt-route button`); `.tabs button`, `.account-chip button`, `.datenstand button` are three near-copies of one ghost button.
- `.hint-panel` carries both informational hints *and* a hard error in `StageEditor` ("kein Round-Trip baubar"), while errors elsewhere use `.error-panel` — same class, opposite semantics.
- Meaning carried by bare emoji: `📌`, `⚓/⚠/⛔`, `🟢🟡🔴⚪` inside `<option>` text (the only signal there), `●/○` star strings.
- Mixed-language codebase (German UI + German and English comments) makes copy edits error-prone.

**Density**
- `DayView` = one 1058-line component, ~10 stacked sections, no in-page nav, no collapse-all, no sticky day context; up to 12 `StageCard`s each expandable into map + 9-column table + `<dl>` + two `<details>`.
- `ControlsBar` packs 3 selects + 2 buttons + inline error into one wrapping row at 0.85rem with `0.2rem` input padding — tight tap targets.
- `Breakdown` table: 9 columns, `min-width: 32rem`, `overflow-x:auto` desktop; mobile variant yields 9 label/value rows *per waypoint*.
- Badge rows carry 4–5 badges + Ampel, several with essential meaning **only in `title` tooltips** (invisible on touch): Doppelschlag explanation, "Meltemi-fest bis", "Spätester Umkehrtag", TWA/Kurs/Wind column semantics.

**Missing states**
- **One global loading state**: text hint "Lade Bibliothek und Forecast …". No skeletons, no per-section pending, no indication while Maps script loads or while `checkIn`/`editStage` run the solver synchronously on click.
- `disabled` on "Aktualisieren" has **no `:disabled` styling**.
- Empty states implemented as *absence* — `routeOptions.length > 0` / `alternatives.length > 0` / `pastStages.length > 0` simply hide the section, so zero open options shows nothing instead of "keine Optionen mehr offen".
- No error boundary (a throw unmounts the app); no dark mode; no `prefers-reduced-motion` (one 0.15s transform transition); no print styles for a briefing sheet.

**Accessibility red flags**
- **Zero `:focus` / `:focus-visible` rules in the entire stylesheet**; `:hover` exists only on `.google-button`. Keyboard operation is invisible, hover feedback absent.
- Map pins, stage numbers and `stage-map-platz` labels are **clickable `<div>`s** (onClick on `AdvancedMarker`, no `role`/`tabIndex`/key handler) — mouse-only.
- List↔map highlighting is `onMouseEnter`/`onMouseLeave` only — unavailable to keyboard and touch.
- Broken heading hierarchy: shell has **no `h1`**; `DayView`/`MapView` start at `h2`; `PlaceDetailView` uses `h1` only in its error branch. Most section titles are `<span className="versal">`, i.e. styled non-headings.
- Color-only status in places: `.option-row` left-border states, `.rueckweg-zeile` variants. Contrast/legibility risks: `--muted #6b7684` on `#fffdf7`, 0.68–0.72rem type with `.28em` tracking, `.state-offen-horizont { background:#eef }` under navy-soft text.
- No live regions: notice-bar timestamps, wind-count truncation notice and error panels appear/update with no `aria-live` / `role="status"` / `role="alert"`.
- `mapId` silently defaults to `'DEMO_MAP_ID'` → Google's watermarked demo styling in production if unset.
- `.account-chip > span` truncates at `16ch` with the full value only in `title`.
- `index.html`: no favicon, no `meta description`, no `theme-color`.

## 6. File map (UI-owning files)

**All styling**
- `src/ui/styles.css` — 1369 lines; tokens, shell, buttons, cards, badges, tables, maps, 3 media queries. **Start here.**

**Views**
- `src/ui/views/DayView.tsx` (1058) — `WindBasis`, `Breakdown`, `StageEditor`, `StageCard`, `OptionRow`, `AlternativeRow`, `DayView`. Prime split target.
- `src/ui/views/MapView.tsx` (560) — itinerary sidebar, legends, toggles, map layers, `REST_LINE_COLOR`/`SAILED_LINE_COLOR`.
- `src/ui/views/PlaceDetailView.tsx` (252) — hero ladder, night Ampel, qualities, shelter table.
- `src/ui/views/SignInView.tsx` (67) — auth card + Google mark.

**Shell / chrome / navigation**
- `src/app/App.tsx` (307) — topbar, tabs, notice-bar, `ControlsBar`, `AccountChip`, error panels, global loading text, footer, `AuthGate` checking card; where a router would go.
- `src/app/main.tsx`, `index.html` — mount, `lang="de"`, `<title>`; where fonts/favicon/meta belong.

**Presentational components**
- `src/ui/components/AmpelBadge.tsx` — badge + `AMPEL_CSS_COLOR` (color duplication lives here).
- `src/ui/components/WindBarb.tsx` (142) — SVG barbs.
- `src/ui/components/StageMap.tsx`, `RouteMap.tsx`, `Polyline.tsx` — map primitives; the two Map wrappers each repeat `mapTypeId`/`disableDefaultUI`/`zoomControl`/`fullscreenControl` independently.
- `src/ui/altRouteColors.ts` — alternatives palette, shared by DayView + MapView.

**UI helpers (own all displayed strings/geometry)**
- `src/ui/format.ts`, `mapPath.ts`, `windField.ts`, `src/ui/__tests__/`.

**State / data (drives which states must exist)**
- `src/app/{tripContext,planningContext,authContext}.tsx`, `usePlanning.ts`; `src/adapters/{firestore,openMeteo,auth,geolocation,firebase}.ts`.

**Design docs**
- PRD/brief/architecture under `_bmad-output/planning-artifacts/{prds,briefs,architecture}/` carry the FR/AD/NFR numbers the UI comments reference (FR1–FR30, AD-2/3/7/11/13, NFR1/NFR2).
