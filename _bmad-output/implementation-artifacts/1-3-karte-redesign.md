---
baseline_commit: d0bfb0cfd5f2ba67d192fa607ef160cf4193fd3c
---

# Story 1.3: Karte redesign

Status: review

Epic 1: **UX Redesign — Consumer Warm** (ad hoc epic; the UX spines in
`_bmad-output/planning-artifacts/ux-designs/ux-sailgreece-router-2026-08-05/` are BINDING,
status final). Stories 1.1 (tokens, primitives, two-line header, footer provenance) and 1.2
(Tagesansicht rebuild, ControlsBar deleted, position popover, dayViewModel helpers,
skeletons) are DONE on this branch — their token layer, button system, `.chip`, `.popover`,
`.skeleton`, `.section-title`, the restyled `.ampel` pill, `AMPEL_LABEL`, `PositionPopover`
(popover contract pattern), `DayViewSkeleton` (skeleton pattern) and the `TripStatusLine`
implementation inside DayView are the vocabulary this story composes from. Read
`1-1-design-tokens-and-two-line-header.md` and `1-2-tagesansicht-redesign.md` (Dev Agent
Records + File Lists) before starting.

**CRITICAL — post-merge ground truth:** `src/ui/views/MapView.tsx` is 627 lines and already
direction-colored: main's PR #22 landed `HIN_LINE_COLOR` (`#2f6fd0`) / `RUECK_LINE_COLOR`
(`#c2418f`) in `tokens.ts`, per-stage polylines split at `main.turnDay`, direction arrows and
the dashOffset trick for shared legs (Polyline.tsx). **That behavior STAYS — this story only
restyles the chrome around it.** DESIGN.md § Map & routes (updated 2026-08-05) is the binding
color semantics; it explicitly supersedes the karte mock's gray "Annahme" return leg and its
Ampel-hue planned legs. Do not copy the mock's line colors.

## Story

As **Philipp (the skipper and only user)**,
I want **the Karte rebuilt to the Consumer-Warm spine — on the phone a full-bleed map with
the itinerary riding on it as a bottom sheet, the round-trip verdict as the reused trip
status line at the itinerary head, floating layer chips instead of the toggle panel, the
legend folded into an "i" popover, compact synced itinerary cards, proper map markers with
casing rings and keyboard operability, and honest Maps-config failure states**,
so that **the map wins back the screen it exists for — the briefing picture of the round
trip (FR1–FR4) is readable in the cockpit at arm's length, every control lives at the edge,
and nothing on the map surface carries meaning by color or hover alone**.

## Scope boundary (read before implementing)

**IN scope (this story):**

- (a) Mobile ≤860px: full-bleed map under the sticky header, itinerary as a **bottom sheet**
  (drag handle, ~1.5 stage cards peeking, expandable to the full list). Adopted mockup
  `mockups/keyscreen-karte-consumer-warm.html` is **binding for composition** (see the
  deviations list in Dev Notes for what is explicitly NOT adopted from it).
- (b) Trip status line at the itinerary head (sheet head on mobile, list head on desktop) —
  **REUSE of story 1.2's `TripStatusLine`** via extraction into a shared component, not a
  second implementation.
- (c) Floating layer chips on the map replacing the `.route-toggles` panel; chips carry
  `aria-pressed`, selected state = accent-tint per DESIGN.
- (d) Legend as a popover behind a small "i" affordance — content per the UPDATED spine
  (direction semantics: Hinweg-blue / Rückweg-magenta, solid = gefahren / dashed = geplant,
  rest-trip Ampel badge, wind-barb scale).
- (e) Itinerary cards restyled per mockup (day tag, route, Ampel pill, times); harbour days
  as slim rows; hover/tap/**keyboard-focus** sync with the map (FR4 + EXPERIENCE Map↔list
  sync row).
- (f) Map marker component per DESIGN: white casing ring on pins, `--radius-sm`
  stage-number capsules (11px/700 tabular), keyboard-operable markers (role="button",
  tabIndex=0, Enter/Space single activation opens Platzdetail; touch keeps the two-step
  tap-highlight-then-open with a mini label chip carrying the verdict word), accessible
  names "Ort — Ampel-Wort", two-layer focus ring, **boat-position marker** in accent with
  halo (new — see VERIFY 4).
- (g) The last `📌` emoji-as-meaning (MapView line 424) → the word chip **"Festgelegt"**
  (story 1.2's established pin vocabulary).
- (h) States: missing Maps config → itinerary renders fully + hint panel "Karte nicht
  verfügbar."; Karte cold load → flat surface-track block with caption "Karte lädt …";
  **`DEMO_MAP_ID` silent fallback REMOVED everywhere** (MapView, DayView, PlaceDetailView,
  `.env.example`, README) — missing `mapId` is a named config error (VERIFY 2).
- (i) A11y floor for this surface: visually hidden `h1` "Karte" (the `.visually-hidden`
  class exists since 1.1), sr texts / accessible names for all markers, wind-count
  truncation notice with `aria-live` (inside the legend popover), legend popover follows
  the popover contract (Esc/backdrop/trigger close, focus in and back — PositionPopover is
  the pattern).
- (j) Desktop ≥861px: sticky split stays (list left, map right) — restyled cards, same
  chips + legend popover on the map; `.map-sticky` offset vs the sticky header was fixed in
  1.1 (`top: calc(var(--header-h) + 1rem)`, `--header-h: 120px`) — verify it still holds.

**EXPLICITLY NOT in scope (later stories — do not touch):**

- Platzdetail restyle (story 1.4: hero ladder, quality meters, shelter grid). The ONLY
  PlaceDetailView edit this story makes is the surgical `DEMO_MAP_ID` removal (VERIFY 2) —
  no visual change there. Its `⚠` at line 156 stays until 1.4.
- StageEditor and calc-panel visuals (StageMap/WindBasis/Breakdown content and structure).
  The ONLY DayView edit this story makes is the surgical `DEMO_MAP_ID` removal.
- Windy or any data/adapter change; PWA/service worker; any solver/domain change
  (`mapPath.ts` gains one derived FIELD on an existing UI helper — that is ui-layer,
  not domain).
- The wind-barb `title` tooltip (`Wind aus … kn`) — existing, not ADDED; migrating it is
  later a11y debt (the barb itself already encodes strength visually; see Dev Notes).

**The app must remain fully functional end-to-end after this story** — sign-in,
Tagesansicht, Karte (lines, arrows, wind thinning, seamarks, alternatives, hover sync),
Platzdetail, stage editing, refresh, sign-out. MapView **behavior** (windField thinning,
hover logic, alt-route rendering, seamark overlay, dashOffset on shared legs) is preserved
unless a task names it.

## VERIFY resolutions (spine vs. code reality — decided for this story)

1. **Trip status line reuse: 1.2 built it as a PRIVATE function.** `TripStatusLine` lives
   inside `src/ui/views/DayView.tsx` (lines 945–1065), props `{ assessment, main,
   pprHinweise, staleLabel, triggerRef }`, with the expander contract (Esc inside closes +
   refocuses trigger, `aria-live="polite"` wrapper, stale leading segment, `id=
   "resttrip-detail"`). **Resolution: EXTRACT it verbatim into
   `src/ui/components/TripStatusLine.tsx`** with `triggerRef` made optional
   (`triggerRef?: RefObject<HTMLButtonElement | null>`); DayView imports it and keeps
   passing its `statusRef` (focus-after-re-render effect stays in DayView, unchanged);
   MapView renders a second instance at the itinerary head. The static
   `id="resttrip-detail"` stays valid: AD-11 view switching mounts exactly one view at a
   time, so the two instances never coexist in the DOM.
2. **`DEMO_MAP_ID`: THREE consumers plus docs.** `MapView.tsx:155`, `DayView.tsx:1166`,
   `PlaceDetailView.tsx:47` all fall back `|| 'DEMO_MAP_ID'`; `.env.example` ships
   `VITE_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID` and the README recommends it. EXPERIENCE State
   Patterns: "missing `mapId` is a build error, not a silent `DEMO_MAP_ID`" — env vars are
   not literally checkable at build time, so the honest reading is a **named runtime config
   error**. **Resolution: new pure helper `src/ui/mapsEnv.ts`** —
   `resolveMapsEnv(apiKey, mapId)` returning `{ ok: true, env }` or
   `{ ok: false, missing: string[] }` (tested) — consumed by all three views. Karte: map
   area shows the hint panel "Karte nicht verfügbar." naming the missing variable(s), the
   itinerary renders fully. DayView calc panel / AltPreview / PlaceDetailView keep their
   existing text-hint pattern but now name the actually missing variable(s) instead of
   always blaming the API key. The DayView/PlaceDetailView edits are sanctioned surgical
   changes (config semantics only, zero restyle) because the DoD grep demands
   `DEMO_MAP_ID` gone repo-wide. `.env.example` and README updated.
3. **Layer chips: the spine names two, the code has THREE toggles.** Current
   `.route-toggles` panel: "Windfiedern" checkbox, "Seezeichen (OpenSeaMap)" checkbox, and
   **per-alternative** checkboxes (`shownAlts` set). EXPERIENCE/mock name only
   "Windfiedern" and "Alternativen". **Resolution: THREE chips — "Windfiedern",
   "Alternativen", "Seezeichen"** (an existing capability must not silently die; the chip
   pattern extends naturally). The "Alternativen" chip toggles ALL alternatives at once
   (`shownAlts: Set` collapses to `showAlts: boolean`); per-alternative identity is
   preserved in the legend popover (color swatch + "Wendepunkt {Insel} · {n} Etappen" per
   alternative) and per-alternative inspection stays in the Tagesansicht previews. The
   chip renders only when `assessment.alternatives.length > 0` (as the panel section does
   today). The OpenSeaMap CC-BY-SA attribution splits: full sentence into the legend
   popover, plus a persistent on-map micro-attribution while the layer is on
   (SeamarkLayer's contract — see AC 4). **[TAG FOR PHILIPP: per-alternative map toggling is dropped in favor of the
   spine's single chip — acceptable, or keep per-alt granularity somewhere on the Karte?]**
4. **Boat-position marker: specified by DESIGN, NOT rendered today.** DESIGN.md Map marker:
   "boat position: `{colors.accent}` with a soft accent halo"; the mock draws it; current
   MapView renders no position marker at all. Data exists: `snapshot.trip.position`
   (`TripPosition { source, lat, lon, placeId? }`, null when unknown). **Resolution: this
   story ADDS the marker** — rendered when `snapshot.trip.position` is non-null,
   non-interactive, accessible name "Bootsposition".
5. **Stage-number capsule activation target: the marker aggregates days and carries no
   place.** The a11y floor says stage-number markers are keyboard-operable with single
   activation opening Platzdetail, but `StageEndMarker` (mapPath.ts) has no `placeId`.
   **Resolution: extend `stageEndMarkers` with `endPlaceId: string | null`** — the
   `placeId` of the anchor stage's final `stagePoints` entry (`kind === 'platz'`), i.e.
   the destination harbour of the first arrival at that island. Enter/Space (and click on
   the capsule) opens that place; `endPlaceId === null` (degenerate geometry) keeps the
   capsule non-interactive. Append cases to `src/ui/__tests__/mapPath.test.ts`
   (append-only). Accessible-name note: the floor's "Ort + Ampel-Wort" formula binds PLACE
   pins; a capsule aggregates several days on one island, so its name is the current title
   text ("{Insel} — Etappe {n} (Tag {d})[, heute], …") moved from `title` to `aria-label`
   — the `title` dies (no meaning in tooltips).
6. **Bottom sheet = CSS/DOM toggle, not gesture physics (deliberate).** See AC 1 — this is
   an AC-level statement so review knows the simplification was chosen, not forgotten.
7. **Karte carries NO position/Törntag/Abfahrt affordance.** Story 1.2 deleted the
   ControlsBar and left "the Karte story decides whether Karte needs its own affordance".
   The spine's Karte layout names none; the "Heute" tab (position popover, hero stepper)
   is one tap away. **Resolution: no map-side control.** **[TAG FOR PHILIPP: confirm that
   switching to "Heute" for a position fix is acceptable on the water.]**
8. **Mock deviations (binding-for-composition EXCEPTIONS, per the spine itself):** (i) line
   colors — the mock's green/gelb/gray legs are superseded by HIN/RUECK direction colors
   (DESIGN § Map & routes, decided 2026-08-05); (ii) the mock's `⚓` in harbour rows is a
   banned emoji-as-meaning — the word "Hafentag" carries it; (iii) the mock's Georgia-italic
   legend "i" violates "no serif anywhere" — use the sans info-chip "i" recipe; (iv) the
   mock's gray `7–11` capsule text (`#98928a` = tertiary) violates "tertiary never carries
   information" — past capsules use `--ink-secondary`; (v) the mock's in-column provenance
   and "Ab Tag 7 …" assume-row are NOT adopted (provenance lives once in the global footer
   per DESIGN Don'ts; the assumption chip is a Tagesansicht §4 concern); (vi) the mock's
   custom zoom pill is NOT adopted (Google's own controls stay).

## Acceptance Criteria

1. **Mobile ≤860px: full-bleed map + bottom sheet.** With the Karte tab active at ≤860px
   the map fills the viewport under the sticky header (height
   `calc(100dvh - var(--header-h))` with a `vh` fallback, side padding of `main.content`
   cancelled — no horizontal scroll), and the itinerary renders as a **bottom sheet**
   overlaying the map: `--radius-lg` top corners, Level-3 shadow, drag handle, sheet head,
   card list. Two snap states: **collapsed** (default; head + ~1.5 stage cards peeking,
   list scrollable within the peek) and **expanded** (≈75% of the viewport, list
   scrollable). The drag handle is a real `<button>` with
   `aria-expanded` and German accessible name ("Etappenliste ausklappen" /
   "Etappenliste einklappen"); tapping it (or the sheet head) toggles the state. The
   transition is ≤200ms and dies under `prefers-reduced-motion` (global rule from 1.1).
   **Deliberate simplification (decided for this story): the sheet is a two-state CSS/DOM
   toggle — no drag gesture engine, no physics, no intermediate snap points.** The map
   itself keeps native pinch/drag (`gestureHandling="greedy"`).

2. **Trip status line at the itinerary head — REUSED, not duplicated.** The
   `TripStatusLine` function moves verbatim from `DayView.tsx` into
   `src/ui/components/TripStatusLine.tsx` (props unchanged except `triggerRef` becomes
   optional); DayView imports it with zero behavior change (its focus-after-re-render
   effect and `statusRef` stay in DayView; `npm test` and all 1.2 ACs unaffected). MapView
   renders it as the first element of the itinerary (sheet head on mobile, above the list
   on desktop) whenever `assessment` exists, passing: the same `pprHinweise` derivation as
   DayView (`atBase = assessment.currentIslandId === params.baseIslandId` → `[]`, else
   `assessment.ppr.reasons`) and a `staleLabel` from `staleForecastLabel(
   assessment.fetchedAtIso, nowMs, STALE_TIME_MS)` with a minute-tick effect (same pattern
   as DayView/App). The expander contract (tap → detail grows in place, Esc inside closes
   and refocuses the trigger, `aria-live="polite"`) works identically on the Karte. The
   round-trip verdict is thereby never color-only on the map surface; the legend badge
   (AC 4) is the second, in-map carrier.

3. **Floating layer chips replace the route-toggles panel.** On the map surface (both
   breakpoints), top-left, floating chips in this order: **"Windfiedern"**, then — only
   when `assessment.alternatives.length > 0` — **"Alternativen"**, then
   **"Seezeichen"** (mock order). Each chip is a
   `<button>` with `aria-pressed` mirroring its state; visual: white
   (`rgba(255,255,255,0.92)`) pill with Level-1-like shadow when off, `--accent-tint`
   background + `--accent-text` text when pressed (DESIGN: accent-tint for selected chips;
   coral never carries status). Defaults preserved: Windfiedern ON, Seezeichen ON,
   Alternativen OFF. "Alternativen" toggles ALL alternatives at once, each still drawn
   dashed in its identity color (`altRouteColor(i)`) under the main route exactly as
   today. The `.route-toggles` panel (JSX and CSS: `.route-toggles`, `.route-swatch`,
   `.wind-toggle`, `.wind-legende`, `.alt-toggles`, old `.legend`/`.legend-line`) is
   GONE. Chips are ≥44px tall hit targets.

4. **Legend as popover behind an "i" affordance.** A floating circular button on the map
   (bottom area, clear of the sheet peek on mobile), visual ~32px "i" glyph in the sans
   info-chip style with a ≥44px hit area, `aria-label="Legende"`, `aria-expanded`. It
   opens a `components.popover` (white, `--radius-md`, `--shadow-3`, max-width ≈320px)
   following the popover contract: one at a time, Esc / backdrop tap / trigger close it,
   focus moves in on open and returns to the trigger on close (reuse the
   PositionPopover/AvatarMenu mechanics). Content, in order:
   (i) title "Legende" (micro-label style);
   (ii) direction rows — solid line swatch in `HIN_LINE_COLOR` labeled "Hinweg", solid
   swatch in `RUECK_LINE_COLOR` labeled "Rückweg" (swatch colors via inline style from
   tokens.ts — the ONLY sanctioned inline hex source);
   (iii) drawing rows — "Durchgezogen = gefahren", "Gestrichelt = geplant", caption
   "Pfeile zeigen die Fahrtrichtung." and, when `turnDay !== null && turnIsland`, "Wende:
   {Insel} (Tag {d})";
   (iv) the rest-trip verdict row: "Rest-Trip:" + `<AmpelBadge ampel=
   {assessment.restTripAmpel} />` — the verdict lives HERE, never in line color;
   (v) wind rows (always shown; they describe the layer, whether toggled or not): the
   barb scale (`WindBarb` at 5 / 10 / 25 kn with "5 kn"/"10 kn"/"25 kn" labels), caption
   "Schaft zeigt, woher der Wind kommt.", and — when `windCount.hidden > 0` — the
   truncation notice "{shown} von {gesamt} Inseln — hineinzoomen zeigt die übrigen."
   wrapped in a container with `aria-live="polite"` (cheap: the count state already
   exists and updates on zoom while the popover is open);
   (vi) when alternatives exist: one row per alternative — dashed swatch in
   `altRouteColor(i)` + "Wendepunkt {Insel} · {n} Etappen" — plus the caption "Zum
   Vergleich über die Hauptroute gelegt — übernommen wird in der Tagesansicht.";
   (vii) the OpenSeaMap attribution row (verbatim from the current panel: "Tonnen,
   Leuchtfeuer, Häfen ab Zoomstufe 8 — © OpenSeaMap-Mitwirkende (CC-BY-SA). Keine
   verlässlichen Tiefen — Pilotage nach Revierführer." with the link).
   **Attribution visibility (required):** while the Seezeichen chip is ON, a persistent
   micro-attribution `© OpenSeaMap (CC-BY-SA)` (linked to openseamap.org, caption size,
   `.map-attrib`, bottom-left above Google's own attribution) renders on the map surface
   — `SeamarkLayer.tsx`'s contract says the embedding view must show the attribution
   (the tile overlay brings none), and CC-BY-SA attribution may not live ONLY behind a
   closed popover. The full sentence stays in the legend popover (vii).
   **Direction line colors themselves are UNTOUCHED** — the mock's gray "Annahme" leg and
   Ampel-hue planned legs are explicitly superseded (DESIGN § Map & routes); no line color
   changes in this story.

5. **Itinerary cards restyled + synced.** Sailing-day cards (mock composition): white
   card, `--radius-md`(16px per mock ≈ md/lg — use `--radius-md`), Level-1/2 soft shadow,
   compact padding; content: micro-label day tag "Tag {d} · {Wd}. {d.M.}." (new
   `formatTripDayShort`, tabular) with suffix " · heute" when `day === currentDay` and
   " · gefahren" for past days; route line "{Start-Insel} → {Ziel-Insel}" (15.5px/700);
   meta line "{formatHours} · an {formatAthensTime(lastEta)}" (tabular; "an …" omitted
   when the last leg carries no `pointPassages` eta); `AmpelBadge` right (the 1.2 pill
   already renders dot + word). `stage.pinned` renders the text chip **"Festgelegt"**
   (`.chip`) — the `📌` string is gone from the repo (last occurrence). Harbour days
   render as slim rows: "Tag {d}" tag + "Hafentag: {Insel} ({Platz})" (via
   `islandWithPlace`) — **no ⚓**. Past cards dim (opacity ≈0.75). **Sync (FR4):** each
   card is a `<button type="button">` — mouse hover, **keyboard focus**, and tap all
   highlight the corresponding map geometry (existing `hoverDay` mechanism: thicker line
   6 vs 4 + zIndex lift + capsule highlight — weight is the non-color cue); tap
   toggles a sticky selected state mirrored as `aria-pressed` and styled per mock
   (coral ring: `box-shadow: 0 0 0 1.5px var(--accent), …` + accent-toned day tag);
   focus shows the global two-layer ring. Rows are ≥44px. First tap on a map pin
   highlights + scrolls its island's card into view within the itinerary scroll container
   (`scrollIntoView({ block: 'nearest' })`).

6. **Map place pins per the DESIGN marker anatomy.** Every context-place pin renders as a
   core dot in the place's night-Ampel graphic hue (`AMPEL_GRAPHIC_HEX`; muted/not
   decision-relevant pins keep `--ampel-unbewertet` + reduced size/opacity as today)
   inside a **2px white casing ring** (`--map-line-casing`) with a soft shadow, centered
   in a **≥44×44px hit-area wrapper**. Pins are keyboard-operable: the marker content div
   carries `role="button"`, `tabIndex={0}`, German accessible name
   `"{Ort} — {Ampel-Wort}"` (`AMPEL_LABEL`, e.g. "Loutra — Grün"; same formula for muted
   pins with their assessed ampel), and an `onKeyDown` where **Enter/Space is a single
   activation opening Platzdetail** (`onOpenPlace`). Mouse click also opens directly.
   **Touch keeps the two-step fat-finger guard:** the first tap (pointer type `touch`)
   arms the pin — highlights the corresponding itinerary card (AC 5) and reveals a mini
   label chip next to the pin ("{Ort} · {Ampel-Wort}", white pill, caption type, Level-1
   shadow, `aria-hidden` — the accessible name already carries the same content); the
   second tap on the armed pin opens Platzdetail. Arming another pin re-arms; opening or
   tapping the map clears. Focus renders the global two-layer indicator around the marker
   (the white gap carries the signal on imagery). The old `title` attributes on pin
   markers die (meaning never in tooltips).

7. **Stage-number capsules restyled + operable.** MapView's stage-end markers render as
   **white `--radius-sm` capsules** with 11px/700 `font-variant-numeric: tabular-nums`
   figures in `--ink-primary` and a soft drop shadow, under a **NEW class
   `.stage-capsule`** — the old `.stage-number` recipe (navy circle + `.mehrfach`/
   `.past`/`.highlight` rules) is **KEPT UNTOUCHED in styles.css** because
   `RouteMap.tsx:125` (AltPreview in the frozen Tagesansicht) consumes `.stage-number` +
   `.mehrfach` with an inline alt-color background and light text; migrating that
   surface is a later story. MapView stops emitting `stage-number`/`mehrfach`
   entirely. All-past capsules render their figures in `--ink-secondary` (NOT
   tertiary — ink rule). Hover keeps the existing highlight/hoverDay sync. Keyboard/
   click: `role="button"`, `tabIndex={0}`, `aria-label` = the current title text
   ("{Insel} — Etappe {n} (Tag {d})[, heute], …"), Enter/Space/click opens Platzdetail
   for the marker's `endPlaceId` (new field, VERIFY 5); when `endPlaceId` is null the
   capsule is non-interactive (no role, no tabIndex). The `title` prop dies. ≥44px hit
   area via wrapper padding.

8. **Boat-position marker.** When `snapshot.trip.position` is non-null, an
   `AdvancedMarker` at that position renders the accent boat dot: coral core
   (`--accent` via tokens.ts `COLORS.accent`) with 2.5px white casing and a soft accent
   halo (larger translucent coral circle behind it, per mock). Non-interactive,
   `role="img"`, `aria-label="Bootsposition"`. High zIndex (above pins, below an armed
   pin's chip).

9. **Maps config honesty (DEMO_MAP_ID dies).** New pure module `src/ui/mapsEnv.ts`
   exporting `resolveMapsEnv(apiKey: string | undefined, mapId: string | undefined)` →
   `{ ok: true; env: { apiKey: string; mapId: string } } | { ok: false; missing:
   string[] }` (missing = the untrimmed-empty vars' names, in env-file order). Consumers:
   (i) **MapView** — on `ok: false` the itinerary renders FULLY (status line, cards, sync
   state, chips hidden) and the map area shows a hint panel with heading "Karte nicht
   verfügbar." and body naming the missing variable(s) ("Es fehlt: `VITE_…`[, `VITE_…`].
   Trage sie in deine `.env` ein (siehe `.env.example` und README) und lade die Seite
   neu. Alle Bewertungen sind weiter in der Tagesansicht verfügbar."); (ii) **DayView** —
   the single `mapId` derivation (line ~1164) becomes `resolveMapsEnv(...)`; on failure
   the calc panel / AltPreview keep their existing text-hint pattern but name the missing
   variable(s); (iii) **PlaceDetailView** — same surgical swap, no visual change.
   `.env.example` loses `DEMO_MAP_ID` (empty value + comment "Pflicht für die Karte:
   Map-ID für AdvancedMarker — ohne sie zeigt die App einen Hinweis statt der Karte.");
   README's "`DEMO_MAP_ID` funktioniert für die Entwicklung" claims are rewritten (a real
   Map ID is required). The string `DEMO_MAP_ID` appears nowhere in `src/`,
   `.env.example`, or `README.md`.

10. **Karte cold-load skeleton.** While `!snapshot || !assessment` (no query error) with
    the Karte tab active, App renders the new `MapViewSkeleton` instead of the "Lade
    Daten …" hint: `role="status"` wrapper with visually hidden "Karte wird geladen …",
    plus (aria-hidden) one status-line skeleton bar, a flat `--surface-track` map block
    (~55vh, `--radius-lg`) with the **visible centered caption "Karte lädt …"**
    (caption type, `--ink-secondary`), and three list-row bars — pulse via the existing
    `.skeleton` recipe (killed under reduced motion). Platzdetail keeps the plain
    "Lade Daten …" hint until story 1.4.

11. **A11y floor for the Karte.** (i) The view renders `<h1 class="visually-hidden">
    Karte</h1>` as its first element (the full-bleed layout has no visible slot —
    EXPERIENCE Accessibility Floor); the config-error heading becomes an `h2`. (ii) Every
    expander/popover trigger carries `aria-expanded` (sheet handle, status line, legend
    button); chips carry `aria-pressed`. (iii) All interactive targets ≥44×44px (chips,
    legend button, sheet handle, cards, pins, capsules). (iv) German accessible names
    everywhere ("Legende", "Etappenliste ausklappen/einklappen", "Bootsposition",
    "{Ort} — {Ampel-Wort}"). (v) NO new `title` tooltips; the pin/capsule titles are
    replaced by `aria-label`s (the wind-barb title is the one documented survivor —
    existing, redundant-precision, out of scope). (vi) The wind truncation notice
    announces via `aria-live="polite"` (AC 4v). (vii) Decorative glyphs ("i", drag
    handle bar, mini chip) are `aria-hidden` inside labeled controls.

12. **Desktop ≥861px: sticky split preserved and restyled.** `.map-split` keeps the grid
    (itinerary left ~380px, map right); the map container becomes a `--radius-lg` card
    (overflow hidden so imagery clips to the radius, `--shadow-2`, no border — hairline
    borders are not card outlines) and keeps `position: sticky; top: calc(var(--header-h)
    + 1rem)` (fixed in 1.1 — VERIFY it still clears the 120px header). The left column
    is: TripStatusLine, `h2.section-title` "Etappen", a caption trip-sub line
    "{formatTripRange(params.tripStartDate, params.tripLengthDays)} ·
    {params.tripLengthDays} Tage" (reuses the 1.1-orphaned `formatTripRange` — no new
    formatter), then the cards (AC 5). Chips + legend button float on the map exactly as
    on mobile. The bottom sheet chrome (handle, snap states) is inert/hidden ≥861px —
    same DOM, media-query-driven presentation.

13. **Pure logic tested; behavior preserved.** (i) `src/ui/mapsEnv.ts` covered by new
    `src/ui/__tests__/mapsEnv.test.ts` (both set / apiKey missing / mapId missing / both
    missing / whitespace-only values). (ii) `stageEndMarkers`' new `endPlaceId` covered by
    appended cases in `mapPath.test.ts` (existing cases untouched). (iii) New
    `formatTripDayShort` covered by appended cases in `format.test.ts`. (iv) **No
    component/DOM tests (AD-2)** — sheet state is a trivial boolean, deliberately NOT
    extracted into a helper. (v) Preserved behavior spot-checks: windField thinning
    unchanged (`windField.test.ts` untouched and green), dashOffset/direction-arrow
    rendering unchanged (`Polyline.tsx` untouched), seamark overlay unchanged
    (`SeamarkLayer.tsx` untouched), hover highlight weights (6/4) unchanged.

14. **Definition of done / non-regression.** (a) `npm test` green — all existing tests
    untouched (append-only for mapPath/format) and passing, new `mapsEnv.test.ts` green;
    (b) `npm run build` (`tsc --noEmit && vite build`) green (`noUnusedLocals`: deleting
    the toggles must also delete now-unused imports); (c) all DoD greps in Dev Notes come
    back clean; (d) manual smoke via `npm run dev` at 390px and ≥861px: full-bleed map +
    sheet collapse/expand → status line expander on the Karte → chips toggle wind/
    seamarks/alternatives (Seezeichen ON shows the "© OpenSeaMap" micro-attribution,
    OFF hides it) → legend popover (Esc/backdrop/focus-return, truncation count
    changes on zoom) → card tap/focus highlights line + capsule → pin keyboard activation
    opens Platzdetail and "← Zurück" returns → touch two-step with mini chip (device
    emulation) → boat marker at the GPS/manual position → missing-env state (unset both
    vars) shows the named hint with full itinerary → cold-load "Karte lädt …" skeleton;
    (e) all NEW strings German; no emoji as meaning carriers anywhere in MapView.

## Tasks / Subtasks

- [x] **Task 1 — `src/ui/mapsEnv.ts` + tests + all three consumers (write first)** (AC: 9, 13)
  - [x] 1.1 Implement `resolveMapsEnv` per the reference in Dev Notes; write
        `mapsEnv.test.ts` first (red), then green.
  - [x] 1.2 MapView: replace the `apiKey`/`mapId` reads + `|| 'DEMO_MAP_ID'` with the
        helper; split the render on `ok` (itinerary always, map area or named hint).
  - [x] 1.3 DayView line ~1164 and PlaceDetailView line ~45: same swap, hint copy names
        the actual missing var(s); zero other changes in those files.
  - [x] 1.4 `.env.example` + README: `DEMO_MAP_ID` guidance removed/rewritten.
- [x] **Task 2 — Extract `TripStatusLine` into `src/ui/components/TripStatusLine.tsx`**
      (AC: 2)
  - [x] 2.1 Move the function + its type imports verbatim; `triggerRef` optional; export.
  - [x] 2.2 DayView: delete the local function, import the component; verify zero diff in
        rendered props/behavior (statusRef, planStamp effect untouched).
  - [x] 2.3 MapView: minute-tick `nowMs` state + `staleForecastLabel` + `STALE_TIME_MS`
        import; `pprHinweise` via the `atBase` rule; render at the itinerary head.
- [x] **Task 3 — `mapPath.ts`: `endPlaceId` on `StageEndMarker` + `formatTripDayShort`**
      (AC: 7, 5, 13)
  - [x] 3.1 Extend `stageEndMarkers` (use `stagePoints` instead of `stagePath` for the
        anchor stage to reach the final point's `placeId`); append mapPath test cases.
  - [x] 3.2 `formatTripDayShort(tripStartDate, day)` in `format.ts` ("So. 9.8." — weekday
        short + `d.M.` from `dateForTripDay`, no new Intl pattern beyond the existing
        weekday formatter); append format test cases.
- [x] **Task 4 — CSS: Karte redesign blocks + deletions** (AC: 1, 3, 4, 5, 6, 7, 8, 10, 12)
  - [x] 4.1 Add the reference blocks (Dev Notes): `.map-view` full-bleed layout + sheet
        (`.map-itinerary` collapsed/`.open` states, `.drag-handle`, `.sheet-head`),
        `.layer-chips`/`.layer-chip`, `.legend-btn`/`.legend-pop`/`.lg-*`, `.map-attrib`,
        `.itin-card`/`.itin-*`/`.harbour-row`, `.marker-hit`/`.marker-pin` restyle/
        `.marker-chip`, `.boat-marker`, NEW `.stage-capsule` (AC 7), `.map-skeleton-caption`.
  - [x] 4.2 Restyle `.map-sticky` (radius-lg card, shadow-2, overflow hidden, border
        dropped); keep the `top` offset; keep `.map-container` 100%.
  - [x] 4.3 Delete: `.route-toggles` (2 rules), `.route-swatch`, `.wind-toggle`,
        `.wind-legende` (3 rules), `.legend` (2 rules), `.legend-line` (3 rules),
        `.itinerary-card` (4 rules incl. `.past`/`.harbour`/`.active`), `.alt-toggles`
        (2 rules), `.marker-pin.highlight` (already dead — no JSX emits it), and the
        ≤860px `.map-split`/`.map-sticky` stacking rules (replaced by the sheet layout).
        Grep every deletion against `.tsx` consumers first. **Do NOT delete or restyle
        `.stage-number`/`.mehrfach`/`.stage-number.past`/`.stage-number.highlight`
        (4 rules, lines ~1229–1260): `RouteMap.tsx:125` consumes them** (AC 7 — the
        Karte capsule is the new `.stage-capsule`). StageMap's `.stage-map-legende` and
        PlaceDetail's `.place-hero-legende` are DIFFERENT classes — keep.
- [x] **Task 5 — MapView restructure: layout scaffold, h1, sheet state** (AC: 1, 2, 11, 12)
  - [x] 5.1 Root becomes `.map-view` (sr-only `h1` "Karte" first): one itinerary DOM used
        by both breakpoints (sheet chrome inert on desktop), map area with overlay slots
        (chips, legend, markers).
  - [x] 5.2 `sheetOpen` boolean state; handle button with `aria-expanded` + labels;
        collapsed/expanded classes; itinerary list is the scroll container in both
        states.
- [x] **Task 6 — Layer chips + legend popover** (AC: 3, 4, 11)
  - [x] 6.1 Replace the three toggle mechanisms: `showWind`, `showSeamarks` unchanged as
        state; `shownAlts: Set` → `showAlts: boolean` (delete `altKey`/`toggleAlt`;
        rendering maps over all alternatives when on).
  - [x] 6.2 Legend popover component (local to MapView is fine): PositionPopover
        mechanics (backdrop, Esc, focus in/out, trigger toggles), content rows per AC 4
        incl. `WindBarb` scale, `aria-live` truncation count, AmpelBadge verdict row,
        alt swatch rows, OpenSeaMap attribution + link.
  - [x] 6.3 Persistent `.map-attrib` micro-attribution "© OpenSeaMap (CC-BY-SA)"
        (link) on the map while `showSeamarks` is on (AC 4 attribution-visibility rule).
- [x] **Task 7 — Itinerary cards + sync + 📌 removal** (AC: 5, 2)
  - [x] 7.1 Rebuild the card/harbour-row markup (button rows, day tag via
        `formatTripDayShort`, route from→to via first-leg island, meta via
        totalHours/lastEta — same derivations as DayView's StageCard, see Dev Notes);
        AmpelBadge; "Festgelegt" chip replaces `' · 📌'`.
  - [x] 7.2 Sync: `hoverDay` (transient, hover/focus) + `selectedDay` (tap toggle,
        `aria-pressed`); highlight = either; card refs for `scrollIntoView` from pin
        taps.
- [x] **Task 8 — Markers: pins, capsules, boat** (AC: 6, 7, 8, 11)
  - [x] 8.1 Pin wrapper (`.marker-hit` ≥44px) + casing-ring pin; `role="button"`,
        `tabIndex`, `aria-label` "{Ort} — {Ampel-Wort}" (`AMPEL_LABEL`), Enter/Space +
        mouse click open; touch two-step via `onPointerDown` pointer-type tracking;
        armed mini chip; `title` props deleted.
  - [x] 8.2 Capsules: new `.stage-capsule` class (white radius-sm; `.stage-number`
        stays RouteMap's, AC 7), past = ink-secondary text, `aria-label` from the
        ex-title string, activation opens `endPlaceId`, hover sync kept.
  - [x] 8.3 Boat marker from `snapshot.trip.position` (accent dot + halo,
        "Bootsposition").
- [x] **Task 9 — `MapViewSkeleton` + App.tsx branch** (AC: 10)
  - [x] 9.1 New `src/ui/components/MapViewSkeleton.tsx` per AC 10; App.tsx loading branch:
        `view.kind === 'tag'` → DayViewSkeleton, `view.kind === 'karte'` →
        MapViewSkeleton, else the "Lade Daten …" hint.
- [x] **Task 10 — Verify DoD** (AC: 13, 14)
  - [x] 10.1 Run every DoD grep; `npm test`; `npm run build`.
  - [x] 10.2 Manual smoke per AC 14(d) — if headless, substitute build + greps and hand
        the browser smoke list to the reviewer (as 1.1/1.2 did).

## Dev Notes

### Stack and constraints — read first (unchanged from 1.1/1.2)

- **No new dependencies.** React 19.2 + Vite 8.2 + TS 5.9 + vanilla CSS custom properties;
  `@vis.gl/react-google-maps` 1.x is the existing Maps binding. No sheet/gesture library —
  AC 1 explicitly sanctions the two-state toggle.
- **Layering:** `ui` imports `domain` types/pure fns and may import `app` context hooks
  (PositionPopover precedent); `tokens.ts` is the ONLY TS hex source — the legend swatches
  and marker fills consume `HIN_LINE_COLOR`/`RUECK_LINE_COLOR`/`AMPEL_GRAPHIC_HEX`/
  `COLORS.accent` via inline style, never fresh hex.
- **AD-2:** MapView computes NO domain values — `turnDay`, `restTripAmpel`, `nightAmpeln`,
  `currentIslandId` are read, not derived. The new helpers (`resolveMapsEnv`,
  `endPlaceId`, `formatTripDayShort`) are display plumbing and live in tested pure
  modules. No component/DOM tests; vitest node env, `src/**/__tests__/*.test.ts` only.
- **AD-11:** view/sheet/chip/selection state is in-memory `useState`, never TripContext
  ("Blickentscheidung, keine Törnentscheidung" — the existing comments say it; keep them
  or their intent).
- **AD-12:** this story adds ZERO trip actions, ZERO engine callbacks. `onOpenPlace` is
  the only mutation-adjacent call and it exists.
- **tsconfig:** `strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` —
  deleting `altKey`/`toggleAlt`/`shownAlts` and the toggle JSX must also delete imports
  that die with them.
- **Formatting:** reuse `format.ts` (`formatHours`, `formatAthensTime`, `formatKn`,
  `compass`, `formatTripRange` — orphaned since 1.1, revived for the trip-sub line). The
  ONLY addition is `formatTripDayShort`. Tabular numerals on all quantitative text.
- **German UI / English code**; commit style: short imperative sentence, no prefix tags.

### German copy — the exact strings

| Where | String |
|---|---|
| View h1 (sr-only) | `Karte` |
| Sheet handle | `aria-label="Etappenliste ausklappen"` / `"Etappenliste einklappen"` |
| Sheet/list section head | `Etappen` (h2, `.section-title` recipe) |
| Trip-sub line | `{formatTripRange(…)} · {tripLengthDays} Tage` |
| Chips | `Windfiedern` · `Alternativen` · `Seezeichen` |
| Legend trigger | `aria-label="Legende"` (glyph "i" aria-hidden) |
| Legend title | `Legende` |
| Legend direction rows | `Hinweg` / `Rückweg` |
| Legend drawing rows | `Durchgezogen = gefahren` / `Gestrichelt = geplant` |
| Legend arrow caption | `Pfeile zeigen die Fahrtrichtung.` |
| Legend turn note | `Wende: {Insel} (Tag {d})` (only when turnDay non-null) |
| Legend verdict row | `Rest-Trip:` + AmpelBadge |
| Legend wind scale | `5 kn` / `10 kn` / `25 kn` + `Schaft zeigt, woher der Wind kommt.` |
| Wind truncation (aria-live) | `{shown} von {shown+hidden} Inseln — hineinzoomen zeigt die übrigen.` |
| Legend alt rows | `Wendepunkt {Insel} · {n} Etappen` + caption `Zum Vergleich über die Hauptroute gelegt — übernommen wird in der Tagesansicht.` |
| Legend seamark row | current panel text verbatim (OpenSeaMap CC-BY-SA + Pilotage note + link) |
| On-map attribution (Seezeichen an) | `© OpenSeaMap (CC-BY-SA)` — link auf openseamap.org, immer sichtbar solange die Ebene an ist |
| Card day tag | `Tag {d} · {formatTripDayShort}` + ` · heute` / ` · gefahren` |
| Card route | `{Start-Insel} → {Ziel-Insel}` |
| Card meta | `{formatHours(h)} · an {formatAthensTime(eta)}` (eta part omitted when null) |
| Pin chip (pinned stage) | `Festgelegt` (`.chip`, reuse 1.2's word) |
| Harbour row | `Tag {d}` + `Hafentag: {islandWithPlace(…)}` |
| Pin accessible name | `{Ort} — {AMPEL_LABEL[ampel]}` (e.g. `Loutra — Grün`) |
| Pin mini chip (armed, aria-hidden) | `{Ort} · {AMPEL_LABEL[ampel]}` |
| Capsule accessible name | `{Insel} — Etappe {n} (Tag {d})[, heute]` joined with `, ` (ex-title string, unchanged) |
| Boat marker | `aria-label="Bootsposition"` |
| No main route (kept) | `Noch keine Hauptroute — in der Tagesansicht den Vorschlag übernehmen.` |
| Config error heading | `Karte nicht verfügbar.` |
| Config error body | `Es fehlt: {VITE_…-Liste}. Trage sie in deine .env ein (siehe .env.example und README) und lade die Seite neu. Alle Bewertungen sind weiter in der Tagesansicht verfügbar.` |
| Skeleton caption (visible) | `Karte lädt …` |
| Skeleton sr text | `Karte wird geladen …` |

Status-line strings are story 1.2's (component reused, no new copy).

### `src/ui/mapsEnv.ts` — reference implementation (new file, tested)

```ts
/**
 * Maps runtime config (Story 1.3, AC 9). Missing values are a NAMED error the
 * views render honestly — never a silent DEMO_MAP_ID fallback with Google's
 * watermarked demo styling (EXPERIENCE State Patterns, Karte).
 */
export type MapsEnv =
  | { ok: true; env: { apiKey: string; mapId: string } }
  | { ok: false; missing: string[] };

export function resolveMapsEnv(
  apiKey: string | undefined,
  mapId: string | undefined,
): MapsEnv {
  const missing: string[] = [];
  if (!apiKey?.trim()) missing.push('VITE_GOOGLE_MAPS_API_KEY');
  if (!mapId?.trim()) missing.push('VITE_GOOGLE_MAPS_MAP_ID');
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, env: { apiKey: apiKey!.trim(), mapId: mapId!.trim() } };
}
```

Call sites read the env exactly once per view:

```ts
const maps = resolveMapsEnv(
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined,
  import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined,
);
```

DayView keeps its `mapId: string | null` prop plumbing into StageCard/StageMap/AltPreview
untouched — only the derivation changes (`maps.ok ? maps.env.mapId : null`) and the two
fallback hint texts name `maps.ok === false ? maps.missing.join(', ') : …` instead of
hard-coding the API key. PlaceDetailView: same one-line derivation swap.

### `TripStatusLine` extraction — exact move

Move DayView.tsx lines 936–1065 (doc comment starting `/** FR2/FR19/FR20 …` + function) into
`src/ui/components/TripStatusLine.tsx`:

```ts
import { useState, type RefObject } from 'react';
import type { Assessment, PlanAssessment } from '../../domain/schema/snapshot.ts';
import { restTripVerdictLabel } from '../dayViewModel.ts';

export function TripStatusLine({ assessment, main, pprHinweise, staleLabel, triggerRef }: {
  assessment: Assessment;
  main: PlanAssessment | null;
  pprHinweise: string[];
  staleLabel: string | null;
  triggerRef?: RefObject<HTMLButtonElement | null>;   // ← now optional
}) { /* body verbatim; `ref={triggerRef}` and `triggerRef.current?.focus()`
       become `ref={triggerRef}` (undefined is fine) and
       `triggerRef?.current?.focus()` */ }
```

DayView: delete the local function + now-local-only imports it carried, add the component
import; everything else (statusRef, planStamp focus effect, props passed) byte-identical.
MapView usage:

```tsx
const atBase = assessment.currentIslandId === snapshot.params.baseIslandId;
const pprHinweise = atBase ? [] : assessment.ppr.reasons;
const [nowMs, setNowMs] = useState(() => Date.now());
useEffect(() => {
  const id = setInterval(() => setNowMs(Date.now()), 60_000);
  return () => clearInterval(id);
}, []);
const staleLabel = staleForecastLabel(assessment.fetchedAtIso, nowMs, STALE_TIME_MS);
// …itinerary head:
<TripStatusLine assessment={assessment} main={main} pprHinweise={pprHinweise}
                staleLabel={staleLabel} />
```

(`STALE_TIME_MS` from `../../app/usePlanning.ts`, `staleForecastLabel` from
`../dayViewModel.ts` — both established import paths.) The `id="resttrip-detail"` inside
the component is safe: AD-11 mounts one view at a time.

### `formatTripDayShort` — reference (format.ts, + test cases appended)

```ts
/** "So. 9.8." — Karten-Etappenkarten (Story 1.3). */
export function formatTripDayShort(tripStartDate: string, day: number): string {
  const [, m, d] = dateForTripDay(tripStartDate, day).split('-');
  return `${formatTripDayWeekdayShort(tripStartDate, day)} ${Number(d)}.${Number(m)}.`;
}
```

(`formatTripDayWeekdayShort` yields "So." in de-DE — the composed result is "So. 9.8.".
Assert exact strings for tripStartDate `2026-08-08`, days 1 and 2.)

### `stageEndMarkers` extension — reference (mapPath.ts)

In the marker-creation branch, switch the anchor stage from `stagePath` to `stagePoints`
(same data — `stagePath` IS `stagePoints(...).map(p => p.position)`):

```ts
const pts = stagePoints(stage, legsById, snapshot);
const end = pts[pts.length - 1];
if (!end) continue;
// … existing byIsland logic, plus on creation:
byIsland[stage.toIslandId] = {
  …,
  position: end.position,
  endPlaceId: end.kind === 'platz' ? (end.placeId ?? null) : null,
};
```

`endPlaceId` documents itself: "Zielhafen des ERSTEN Anlaufs — das Aktivierungsziel der
Kapsel (Story 1.3); null, wenn die Geometrie nicht an einem Platz endet." Append test
cases: marker of a normal stage carries the destination placeId; a stage whose geometry
resolves no final platz yields null. Do not modify existing cases.

### Reference CSS (add under `/* ---- map view (redesign) ---- */`; delete the old map blocks it replaces)

```css
/* ---- layout: desktop split (≥861px default), mobile full-bleed + sheet ---- */
.map-view { position: relative; }
.map-split {
  display: grid;
  grid-template-columns: minmax(280px, 380px) 1fr;
  gap: var(--space-5);
  align-items: start;
}
.map-sticky {
  position: sticky;
  top: calc(var(--header-h) + 1rem);   /* 1.1 fix — keep */
  height: min(78vh, 720px);
  border-radius: var(--radius-lg);
  overflow: hidden;                    /* imagery clips to the card radius */
  box-shadow: var(--shadow-2);
  background: var(--surface-track);
}
.map-sticky .map-container { width: 100%; height: 100%; }
.sheet-head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: var(--space-3); padding: var(--space-1) 0 var(--space-2);
}
.trip-caption { font: 400 11.5px/1.4 var(--font-sans); color: var(--ink-secondary); }
.map-attrib {  /* CC-BY-SA attribution — visible whenever the seamark layer is on */
  position: absolute; left: var(--space-3); bottom: var(--space-3); z-index: 4;
  font: 400 10.5px/1.3 var(--font-sans);
  background: rgba(255, 255, 255, 0.85); border-radius: var(--radius-sm);
  padding: 2px 6px;
}
.map-attrib a { color: var(--ink-secondary); }

/* ---- floating layer chips ---- */
.layer-chips {
  position: absolute; top: var(--space-3); left: var(--space-3); z-index: 4;
  display: flex; gap: var(--space-2); flex-wrap: wrap;
}
.layer-chip {
  border: 0; cursor: pointer;
  display: inline-flex; align-items: center; gap: var(--space-1);
  min-height: 44px; padding: 0 var(--space-3); border-radius: var(--radius-full);
  font: 650 12.5px/1.35 var(--font-sans);
  background: rgba(255, 255, 255, 0.92); color: var(--ink-secondary);
  box-shadow: var(--shadow-1);
}
.layer-chip[aria-pressed='true'] { background: var(--accent-tint); color: var(--accent-text); }

/* ---- legend affordance + popover ---- */
.legend-btn {
  position: absolute; right: var(--space-3); bottom: var(--space-3); z-index: 4;
  width: 44px; height: 44px; border: 0; border-radius: var(--radius-full);
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
  background: rgba(255, 255, 255, 0.92); color: var(--ink-secondary);
  font: 700 13px/1 var(--font-sans);      /* sans "i" — never the mock's Georgia italic */
  box-shadow: var(--shadow-1);
}
.legend-pop {
  position: absolute; right: var(--space-3); bottom: calc(var(--space-3) + 52px); z-index: 5;
  width: min(320px, calc(100vw - 2 * var(--space-page-margin)));
  background: var(--surface-card); border-radius: var(--radius-md);
  box-shadow: var(--shadow-3); padding: var(--space-3) var(--space-4);
}
.lg-title {
  font: 600 11px/1.3 var(--font-sans); letter-spacing: 0.07em; text-transform: uppercase;
  color: var(--ink-secondary); margin-bottom: var(--space-2);
}
.lg-row {
  display: flex; align-items: center; gap: var(--space-2);
  font: 400 12.5px/1.35 var(--font-sans); color: var(--ink-secondary);
  padding: 3px 0;
}
.lg-line { width: 24px; height: 0; flex: none; border-radius: 2px; }
.lg-line.solid { border-top: 3px solid currentColor; }   /* color via inline style (tokens) */
.lg-line.dashed { border-top: 3px dashed currentColor; }
.lg-caption { font: 400 11.5px/1.4 var(--font-sans); color: var(--ink-secondary); margin: var(--space-1) 0; }

/* ---- itinerary cards ---- */
.itin-list { display: flex; flex-direction: column; gap: var(--space-2); }
.itin-card {
  display: block; width: 100%; text-align: left; border: 0; cursor: pointer;
  background: var(--surface-card); border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4); box-shadow: var(--shadow-1);
  font: 400 12.5px/1.35 var(--font-sans); color: var(--ink-secondary);
}
.itin-card[aria-pressed='true'] {
  box-shadow: 0 0 0 1.5px var(--accent), var(--shadow-1);
}
.itin-card[aria-pressed='true'] .itin-day { color: var(--accent-text); }
.itin-card.past { opacity: 0.75; }
.itin-top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.itin-day {
  font: 600 11px/1.3 var(--font-sans); letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--ink-secondary); font-variant-numeric: tabular-nums;
}
.itin-route { font: 700 15.5px/1.3 var(--font-sans); letter-spacing: -0.01em; color: var(--ink-primary); margin-top: 2px; }
.itin-meta { margin-top: 3px; font-variant-numeric: tabular-nums; }
.harbour-row {
  display: flex; align-items: center; gap: var(--space-2); width: 100%; text-align: left;
  border: 0; cursor: pointer; min-height: 44px;
  background: var(--surface-card); border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-4); box-shadow: var(--shadow-1);
  font: 400 12.5px/1.35 var(--font-sans); color: var(--ink-secondary);
}
.harbour-row .hd {
  font: 600 11px/1.3 var(--font-sans); letter-spacing: 0.06em; text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}

/* ---- markers ---- */
.marker-hit {  /* ≥44px hit area around the visual pin */
  width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.marker-pin {
  width: 13px; height: 13px; border-radius: var(--radius-full);
  border: 2px solid var(--map-line-casing, #fff);  /* casing ring — mandatory on imagery */
  box-shadow: 0 1px 4px rgba(30, 25, 20, 0.4);
}
.marker-pin.muted { opacity: 0.5; transform: scale(0.75); }
.marker-chip {   /* armed mini label (touch two-step) */
  position: absolute; left: 50%; bottom: calc(100% - 4px); transform: translateX(-50%);
  white-space: nowrap; background: var(--surface-card); color: var(--ink-primary);
  border-radius: var(--radius-full); padding: 3px 10px;
  font: 600 12.5px/1.35 var(--font-sans); box-shadow: var(--shadow-1);
}
.boat-marker { position: relative; width: 30px; height: 30px; }
.boat-marker .halo {
  position: absolute; inset: 0; border-radius: var(--radius-full);
  background: var(--accent); opacity: 0.18;
}
.boat-marker .core {
  position: absolute; inset: 9px; border-radius: var(--radius-full);
  background: var(--accent); border: 2.5px solid var(--map-line-casing, #fff);
}
.stage-capsule {  /* Karte-only; .stage-number stays untouched for RouteMap (AC 7) */
  min-width: 22px; height: 18px; padding: 0 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-card); color: var(--ink-primary);
  font: 700 11px/18px var(--font-sans); font-variant-numeric: tabular-nums;
  display: inline-flex; align-items: center; justify-content: center;
  box-shadow: 0 1.5px 4px rgba(30, 25, 20, 0.3);
  letter-spacing: 0.02em; cursor: pointer;
}
.stage-capsule.past { color: var(--ink-secondary); }   /* NOT tertiary — ink rule */
.stage-capsule.highlight { transform: scale(1.25); }

/* ---- mobile: full-bleed map + bottom sheet ---- */
@media (max-width: 860px) {
  .map-view {
    /* cancel main.content's ≤860px padding (1rem 0.9rem 2.4rem) */
    margin: -1rem -0.9rem -2.4rem;
    height: calc(100vh - var(--header-h));
    height: calc(100dvh - var(--header-h));
    overflow: hidden;
  }
  .map-split { display: block; height: 100%; }
  .map-sticky {
    position: absolute; inset: 0; top: 0; height: 100%;
    border-radius: 0; box-shadow: none;
  }
  .map-itinerary {   /* becomes the sheet */
    position: absolute; left: 0; right: 0; bottom: 0; z-index: 6;
    background: var(--surface-page);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    box-shadow: 0 2px 6px rgba(30, 25, 20, 0.10), 0 16px 40px rgba(30, 25, 20, 0.16); /* Level 3, flipped upward */
    padding: 0 var(--space-4) env(safe-area-inset-bottom);
    height: 232px;                               /* collapsed: head + ~1.5 cards */
    display: flex; flex-direction: column;
    transition: height 0.2s ease;
  }
  .map-itinerary.open { height: 75vh; height: 75dvh; }
  .drag-handle {
    border: 0; background: transparent; cursor: pointer;
    min-height: 44px; width: 100%;
    display: flex; align-items: center; justify-content: center;
  }
  .drag-handle .bar { width: 40px; height: 5px; border-radius: 3px; background: var(--ampel-unbewertet); }
  .itin-list { overflow-y: auto; flex: 1; padding-bottom: var(--space-4); }
  .legend-btn { bottom: 244px; }   /* clear of the collapsed sheet peek */
  .map-attrib { bottom: 244px; }   /* ditto — attribution must stay visible (AC 4) */
}
@media (min-width: 861px) {
  .drag-handle { display: none; }
}
```

Notes: the Level-3 shadow on the sheet is the named Level-3 recipe with the offsets
mirrored upward — document it with a comment referencing the Elevation section (no new
shadow VALUES). The old ≤860px block (`.map-split { grid-template-columns: 1fr }`,
`.map-sticky { position: relative; … order: -1 }`) is deleted — the rules above replace
it; the `main.content` padding rule in that media query stays (other views use it).

### Reference JSX skeleton for MapView (adapt, don't paste blindly)

```tsx
const maps = resolveMapsEnv(/* env */);
const { params } = snapshot;   // tripStartDate / tripLengthDays / baseIslandId reads
const [sheetOpen, setSheetOpen] = useState(false);
const [hoverDay, setHoverDay] = useState<number | null>(null);
const [selectedDay, setSelectedDay] = useState<number | null>(null);
const activeDay = hoverDay ?? selectedDay;
const [showWind, setShowWind] = useState(true);
const [showSeamarks, setShowSeamarks] = useState(true);
const [showAlts, setShowAlts] = useState(false);
const [armedPlaceId, setArmedPlaceId] = useState<string | null>(null);
const lastPointerType = useRef<string>('');   // set in onPointerDown, read in onClick
const cardRefs = useRef(new Map<number, HTMLButtonElement>());

return (
  <div className="map-view">
    <h1 className="visually-hidden">Karte</h1>
    <div className="map-split">
      <div className={`map-itinerary${sheetOpen ? ' open' : ''}`}>
        <button type="button" className="drag-handle" aria-expanded={sheetOpen}
                aria-label={sheetOpen ? 'Etappenliste einklappen' : 'Etappenliste ausklappen'}
                onClick={() => setSheetOpen(o => !o)}>
          <span className="bar" aria-hidden="true" />
        </button>
        <TripStatusLine … />
        <div className="sheet-head">
          <h2 className="section-title">Etappen</h2>
          <span className="trip-caption">{formatTripRange(params.tripStartDate, params.tripLengthDays)} · {params.tripLengthDays} Tage</span>
        </div>
        {!main && <div className="hint-panel">Noch keine Hauptroute — …</div>}
        <div className="itin-list">{/* cards + harbour rows in day order */}</div>
      </div>
      <div className="map-sticky">
        {maps.ok ? (
          <APIProvider apiKey={maps.env.apiKey}>
            <Map className="map-container" mapId={maps.env.mapId} … onClick={() => setArmedPlaceId(null)}>
              {/* SeamarkLayer / alt polylines / main polylines / capsules / pins / boat / WindLayer — order and props preserved */}
            </Map>
          </APIProvider>
        ) : (
          <div className="hint-panel" style={{ height: '100%' }}>
            <h2>Karte nicht verfügbar.</h2>
            <p>Es fehlt: {maps.missing.map(m => <code key={m}>{m}</code>) /* joined */}. …</p>
          </div>
        )}
        <div className="layer-chips">
          <button type="button" className="layer-chip" aria-pressed={showWind}
                  onClick={() => setShowWind(v => !v)}>Windfiedern</button>
          {assessment.alternatives.length > 0 && (
            <button type="button" className="layer-chip" aria-pressed={showAlts}
                    onClick={() => setShowAlts(v => !v)}>Alternativen</button>
          )}
          <button type="button" className="layer-chip" aria-pressed={showSeamarks}
                  onClick={() => setShowSeamarks(v => !v)}>Seezeichen</button>
        </div>
        {showSeamarks && (
          <span className="map-attrib">
            © <a href="https://www.openseamap.org" target="_blank" rel="noreferrer">OpenSeaMap</a> (CC-BY-SA)
          </span>
        )}
        <LegendPopover … />   {/* .legend-btn + .legend-pop, PositionPopover mechanics */}
      </div>
    </div>
  </div>
);
```

Chips/legend live inside `.map-sticky` so they overlay the map at both breakpoints (its
`position: sticky`/`absolute` makes it the containing block). Render them ONLY when
`maps.ok` (an empty map area needs no layer controls; the hint panel fills it).

Itinerary card (sailing day):

```tsx
const firstLeg0 = stage.legs[0];
const firstLeg = firstLeg0 ? (firstLeg0.sailedLeg ?? legsById[firstLeg0.legId]) : undefined;
const fromIsland = firstLeg ? islandName(firstLeg.fromIslandId) : null;
const totalHours = stage.legs.reduce((s, l) => s + (l.totalHours ?? 0), 0);
const lastLeg = stage.legs[stage.legs.length - 1];
const lastEta = lastLeg?.pointPassages[lastLeg.pointPassages.length - 1]?.etaIso ?? null;

<button type="button"
        ref={(el) => { if (el) cardRefs.current.set(stage.day, el); else cardRefs.current.delete(stage.day); }}
        className={`itin-card${stage.day < day ? ' past' : ''}`}
        aria-pressed={selectedDay === stage.day}
        onMouseEnter={() => setHoverDay(stage.day)}
        onMouseLeave={() => setHoverDay(null)}
        onFocus={() => setHoverDay(stage.day)}
        onBlur={() => setHoverDay(null)}
        onClick={() => setSelectedDay(d => (d === stage.day ? null : stage.day))}>
  <div className="itin-top">
    <div>
      <div className="itin-day">
        Tag {stage.day} · {formatTripDayShort(params.tripStartDate, stage.day)}
        {stage.day === day && ' · heute'}
        {stage.day < day && ' · gefahren'}
      </div>
      <div className="itin-route">{fromIsland ? `${fromIsland} → ` : ''}{islandName(stage.toIslandId)}</div>
      <div className="itin-meta">
        {formatHours(totalHours || null)}
        {lastEta && <> · an {formatAthensTime(lastEta)}</>}
        {stage.pinned && <> <span className="chip">Festgelegt</span></>}
      </div>
    </div>
    <AmpelBadge ampel={stage.ampel} />
  </div>
</button>
```

(These are the SAME derivations DayView's StageCard uses — totalHours sum, last-passage
eta; the deleted `legNames`/`formatKn` bits die with the old card. Keep the cards in day
order INTERLEAVED with harbour rows — map over `main.stages` sorted by day instead of
the current two separate `.filter` passes, so the sheet reads chronologically like the
mock.) Highlight consumption: polyline `strokeWeight={activeDay === stage.day ? 6 : 4}`,
zIndex lift, capsule `.highlight` — mechanically the current `hoverDay` reads, re-pointed
to `activeDay`.

Place pin:

```tsx
<AdvancedMarker key={place.id} position={…}
                zIndex={armedPlaceId === place.id ? 100 : relevant ? 50 : 30}>
  {/* armed pin lifts above the boat marker (90) so its mini chip is never occluded (AC 8) */}
  <div className="marker-hit" role="button" tabIndex={0}
       aria-label={`${place.name} — ${AMPEL_LABEL[ampel]}`}
       onPointerDown={(e) => { lastPointerType.current = e.pointerType; }}
       onKeyDown={(e) => {
         if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenPlace(place.id); }
       }}
       onClick={() => {
         if (lastPointerType.current === 'touch' && armedPlaceId !== place.id) {
           setArmedPlaceId(place.id);           // step 1: highlight + chip
           const stageDay = sailingStages.find(s => s.toIslandId === place.islandId)?.day ?? null;
           if (stageDay !== null) {
             setSelectedDay(stageDay);
             cardRefs.current.get(stageDay)?.scrollIntoView({ block: 'nearest' });
           }
           return;
         }
         onOpenPlace(place.id);                 // mouse/keyboard/second tap
       }}>
    <div className={relevant ? 'marker-pin' : 'marker-pin muted'}
         style={{ background: AMPEL_GRAPHIC_HEX[ampel] }} />
    {armedPlaceId === place.id && (
      <span className="marker-chip" aria-hidden="true">{place.name} · {AMPEL_LABEL[ampel]}</span>
    )}
  </div>
</AdvancedMarker>
```

(`AMPEL_LABEL` from `../components/AmpelBadge.tsx` — exported in 1.2. Muted pins now get
the graphic hue of their assessed night ampel too — `unbewertet` resolves to the gray
anyway, so the `relevant`-conditional style split collapses; keep the `.muted` size/
opacity class.) Map `onClick` clears `armedPlaceId`.

Capsule:

```tsx
<AdvancedMarker key={marker.key} position={marker.position} zIndex={active ? 120 : 70}>
  <div className={`stage-capsule${active ? ' highlight' : ''}${allPast ? ' past' : ''}`}
       {...(marker.endPlaceId ? {
         role: 'button', tabIndex: 0, 'aria-label': label /* ex-title string */,
         onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenPlace(marker.endPlaceId!); } },
         onClick: () => onOpenPlace(marker.endPlaceId!),
       } : { 'aria-label': label })}
       onMouseEnter={() => setHoverDay(marker.stops[0]!.day)}
       onMouseLeave={() => setHoverDay(null)}
       onFocus={() => setHoverDay(marker.stops[0]!.day)}
       onBlur={() => setHoverDay(null)}>
    {marker.label}
  </div>
</AdvancedMarker>
```

(MapView emits neither `stage-number` nor `mehrfach` anymore — the `.stage-capsule` is
always a capsule; both old classes and their CSS stay for RouteMap.tsx (AC 7). The label
logic in `mapPath.ts` is unchanged.)

Boat marker:

```tsx
{snapshot.trip.position && (
  <AdvancedMarker position={{ lat: snapshot.trip.position.lat, lng: snapshot.trip.position.lon }} zIndex={90}>
    <div className="boat-marker" role="img" aria-label="Bootsposition">
      <span className="halo" /><span className="core" />
    </div>
  </AdvancedMarker>
)}
```

`MapViewSkeleton.tsx`:

```tsx
export function MapViewSkeleton() {
  return (
    <div role="status">
      <span className="visually-hidden">Karte wird geladen …</span>
      <div aria-hidden="true">
        <div className="skeleton" style={{ height: 20, width: '70%', margin: '12px 0' }} />
        <div className="skeleton map-skeleton" style={{ height: '55vh', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="map-skeleton-caption">Karte lädt …</span>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 48, marginTop: 12 }} />
        ))}
      </div>
    </div>
  );
}
```

(`.map-skeleton-caption { font: 400 12.5px/1.35 var(--font-sans); color: var(--ink-secondary); }` —
the visible caption sits inside the aria-hidden block; the sr text carries the state.
That matches the DayViewSkeleton pattern.)

### Source tree — CURRENT STATE / CHANGES / PRESERVE per file

**`src/ui/views/MapView.tsx` (627 lines, post-merge — read it fully)**
- CURRENT: module head FR1–FR4 doc; `REVIER_CENTER`; direction-color rationale comments;
  `WIND_OFFSET_DEG` + `upwindOffset`; `WindLayer` (zoom listener, `windFieldFor`,
  `onCount` reporting, per-barb `title`); `MapView` — env reads w/ `|| 'DEMO_MAP_ID'`,
  `hoverDay`/`showWind`/`showSeamarks`/`shownAlts` state + `altKey`/`toggleAlt`,
  `legsById`/`sailingStages`/`ampelIslands`/`planIslands`/`contextPlaces`/`nowIdx`/
  `turnDay`/`turnIsland`/`isRueckweg`/`endMarkers`/`routeIslands`/`barbCandidates`/
  `islandOfPlace`/`windCount` memos, `islandName`; `itinerary` JSX (`.route-toggles`
  panel with `.versal` heads, HIN/RUECK legend spans, AmpelBadge, Wende note, wind
  toggle + `.wind-legende` scale + truncation text, seamark toggle + attribution,
  per-alt checkboxes; `.hint-panel` no-main; `.itinerary-card` sailing cards with
  `' · 📌'` at line 424 and `.versal`/`.headline`/`.beschreibung`/`.badges`; harbour
  cards); no-apiKey early return with "Karte nicht verfügbar" hint; main return —
  `.map-split` > itinerary + `.map-sticky` > APIProvider > Map (SeamarkLayer, alt
  Polylines zIndex 12, main Polylines w/ dashOffset + hover weights 6/4 + zIndex
  60/21/20, endMarker AdvancedMarkers w/ `title` + `.stage-number` div + hover handlers,
  place pins w/ `title` + onClick→onOpenPlace + `.marker-pin` style, WindLayer).
- CHANGES: Tasks 1, 2, 5–8 — everything listed in the ACs. The `itinerary` variable
  becomes the sheet/list markup; toggles panel dies; legend popover + chips added;
  cards rebuilt (interleaved day order); pins/capsules/boat rebuilt; env via
  `resolveMapsEnv`; sr-only h1; `shownAlts`→`showAlts`.
- PRESERVE: `WindLayer` whole (incl. the barb `title` — documented survivor, and the
  `onCount` wiring now feeds the legend popover), `upwindOffset`, all memos and their
  AD-2 comments, `REVIER_CENTER`, zIndex layering rationale comments (seamarks under
  everything, alts under main, dashOffset on rueck), hover weight values, `mapTypeId=
  "hybrid"`, `gestureHandling="greedy"`, the no-main hint text, FR1 ampelIslands rule.

**`src/ui/styles.css` (1992 lines)**
- CURRENT: 1.1/1.2 blocks at top; map view section (lines ~706–835: `.map-split`,
  `.map-itinerary`, `.map-sticky` w/ hairline border + creme background, `.itinerary-card`
  ×4, `.route-toggles` ×2, `.route-swatch`, `.marker-pin` ×2, `.wind-barb` ×2,
  `.wind-toggle`, `.wind-legende` ×3); ≤860px media query (map stack + `main.content`
  padding); `.stage-number` ×4 + `.marker-pin.muted` + `.legend` ×2 + `.legend-line` ×3 +
  `.itinerary-card.past/.harbour` (lines ~1229–1300).
- CHANGES: Task 4 — add the redesign blocks (incl. NEW `.stage-capsule`); restyle
  `.map-sticky`/`.marker-pin`; delete the classes in Task 4.3; replace the ≤860px map
  rules with the sheet layout (KEEP the `main.content` padding rule in that query).
- PRESERVE: `.stage-number` ×4 incl. `.mehrfach` (RouteMap.tsx consumes them — AC 7),
  `.wind-barb` halo rules (WindBarb legibility), `.stage-map*` (FR30 panel),
  `.place-hero*`, everything DayView/PlaceDetail/SignIn reference, the ≤700px query,
  `.hint-panel`/`.error-panel`, `.chip`/`.popover`/`.skeleton`/`.section-title`/
  `.trip-status*` (1.2 blocks — the Karte now consumes them).

**`src/ui/views/DayView.tsx` (1502 lines)**
- CHANGES: (i) `TripStatusLine` function + doc comment moved out (import from
  `../components/TripStatusLine.tsx`); (ii) `mapId` derivation via `resolveMapsEnv` and
  the two "kein VITE_GOOGLE_MAPS_API_KEY" hint texts name the missing var(s). NOTHING
  else — the 1.2 surface is frozen.
- PRESERVE: statusRef + planStamp focus effect, all props passed to TripStatusLine,
  the ONE-APIProvider pattern, every other line.

**`src/ui/views/PlaceDetailView.tsx`**
- CHANGES: `mapId` fallback swap only (Task 1.3). Its `⚠` and all visuals stay (story 1.4).

**`src/app/App.tsx` (266 lines)**
- CURRENT: loading branch `view.kind === 'tag' ? <DayViewSkeleton /> : <div
  className="hint-panel">Lade Daten …</div>`.
- CHANGES: Task 9 — karte branch renders `<MapViewSkeleton />`; import added. Nothing else.
- PRESERVE: header/footer, GPS effect, stale footer logic, provider nesting.

**`src/ui/mapPath.ts`** — CHANGES: `StageEndMarker.endPlaceId` + `stageEndMarkers` uses
`stagePoints` for the anchor stage (Task 3.1). PRESERVE: every other export, the
island-grouping rationale comments, `label` building.

**`src/ui/format.ts`** — CHANGES: + `formatTripDayShort` only.

**New files:** `src/ui/mapsEnv.ts`, `src/ui/__tests__/mapsEnv.test.ts`,
`src/ui/components/TripStatusLine.tsx`, `src/ui/components/MapViewSkeleton.tsx`.

**Small edits:** `src/ui/__tests__/mapPath.test.ts` + `src/ui/__tests__/format.test.ts`
(append-only), `.env.example`, `README.md` (DEMO_MAP_ID guidance).

**Untouched (verify by diff):** everything under `src/domain/` and `src/adapters/`, all
`src/app/` contexts + `usePlanning.ts` (App.tsx edit excepted), `src/ui/tokens.ts`
(HIN/RUECK constants already exist), `src/ui/components/{Polyline,WindBarb,SeamarkLayer,
StageMap,RouteMap,AmpelBadge,AvatarMenu,PositionPopover,DayViewSkeleton}.tsx`,
`src/ui/windField.ts`, `src/ui/dayViewModel.ts`, `src/ui/stageText.ts`, `index.html`,
`vitest.config.ts`, all existing test cases.

### Accessibility floor for this story's surfaces

- Visually hidden `h1` "Karte"; `h2.section-title` "Etappen"; config-error heading `h2`.
- `aria-expanded`: sheet handle, status-line trigger (component-inherited), legend button.
  `aria-pressed`: layer chips, itinerary cards (selected sync state).
- Popover contract on the legend (Esc/backdrop/trigger close, focus in/out) — copy the
  PositionPopover mechanics, one popover at a time (the status-line detail is an
  expander, not a popover — they may be open simultaneously, that's per contract).
- Markers: `role="button"` + `tabIndex={0}` + Enter/Space single activation; names
  "{Ort} — {Ampel-Wort}" (pins) / ex-title string (capsules); boat = `role="img"`
  "Bootsposition". Two-layer focus ring is global since 1.1 — verify it renders on the
  marker divs over imagery (the white gap is the signal).
- Touch two-step is touch-only (pointerType check); keyboard and mouse are single-step.
- ≥44px: chips, legend button, handle, cards, harbour rows, `.marker-hit`, capsule hit
  padding.
- `aria-live="polite"`: status line (inherited) + wind truncation container in the legend.
- No NEW `title` tooltips; pin/capsule titles die (replaced by aria-labels); the wind-barb
  `title` survives as documented existing debt.
- Decorative bits `aria-hidden`: "i" glyph, handle bar, chevron, mini chip, dots.

### Testing rules

- vitest, node env, `src/**/__tests__/*.test.ts` only; NO component/DOM tests (AD-2).
- New: `mapsEnv.test.ts` (5 cases minimum per AC 13). Appends: `mapPath.test.ts`
  (endPlaceId happy path + null-geometry case, reuse the file's existing fixtures),
  `format.test.ts` (`formatTripDayShort` exact strings).
- Boundary cases: whitespace-only env values are MISSING (trim rule); a marker whose
  anchor stage ends on a waypoint (no final platz) yields `endPlaceId: null`.
- Do not modify existing tests; `npm test` and `npm run build` both green.

### DoD greps (run from repo root; first block must return NOTHING)

```bash
# dead panel / classes / fallback / emoji:
grep -rn 'route-toggles\|wind-toggle\|wind-legende\|route-swatch\|alt-toggles' src/
grep -rn 'itinerary-card' src/
grep -rn 'DEMO_MAP_ID' src/ .env.example README.md
grep -rn '📌' src/
grep -n 'versal' src/ui/views/MapView.tsx
grep -n 'legend-line\|"legend"' src/ui/views/MapView.tsx
grep -n 'shownAlts\|altKey\|toggleAlt' src/ui/views/MapView.tsx
# the Karte capsule is .stage-capsule; .stage-number/.mehrfach belong to RouteMap only:
grep -n 'stage-number\|mehrfach' src/ui/views/MapView.tsx
# single TS color source (unchanged 1.1 rule):
grep -rniE "#[0-9a-f]{6}\b" src --include='*.ts' --include='*.tsx' | grep -v 'ui/tokens.ts' | grep -v 'SignInView'
```

These checks must print OK:

```bash
# exactly ONE title= survives in MapView (the documented wind-barb tooltip):
test "$(grep -c 'title=' src/ui/views/MapView.tsx)" -eq 1 && echo OK
# TripStatusLine exists once, as a component file:
test -f src/ui/components/TripStatusLine.tsx && ! grep -q 'function TripStatusLine' src/ui/views/DayView.tsx && echo OK
# App's generic loading hint serves ONLY the platz branch now (karte → MapViewSkeleton):
test "$(grep -c 'Lade Daten' src/app/App.tsx)" -eq 1 && grep -q 'MapViewSkeleton' src/app/App.tsx && echo OK
```

Exception rule, stated for the record: `MAP_LINE_SAILED` in tokens.ts is currently
unconsumed after the direction-color merge — leave it (tokens.ts is the palette mirror,
not a usage index). PlaceDetailView's `⚠` and the legacy classes of un-rebuilt surfaces
stay per the scope boundary.

### Project Structure Notes

- New: `src/ui/mapsEnv.ts`, `src/ui/__tests__/mapsEnv.test.ts`,
  `src/ui/components/TripStatusLine.tsx`, `src/ui/components/MapViewSkeleton.tsx`.
- Modified: `src/ui/views/MapView.tsx`, `src/ui/styles.css`, `src/ui/views/DayView.tsx`
  (extraction + env swap only), `src/ui/views/PlaceDetailView.tsx` (env swap only),
  `src/app/App.tsx` (skeleton branch only), `src/ui/mapPath.ts`, `src/ui/format.ts`,
  `src/ui/__tests__/{mapPath,format}.test.ts` (append-only), `.env.example`, `README.md`.
- Layering intact: `mapsEnv.ts` imports nothing; `TripStatusLine.tsx` imports domain
  types + `dayViewModel` (both `ui`/`domain`); MapView's `STALE_TIME_MS` import from
  `app/` follows the existing DayView precedent.

### References

- **DESIGN.md (BINDING, final):**
  `_bmad-output/planning-artifacts/ux-designs/ux-sailgreece-router-2026-08-05/DESIGN.md` —
  § Map & routes (UPDATED 2026-08-05: direction colors, arrows, casing, verdict-in-legend
  rule — supersedes the mock's line colors); § Components "Map marker" (casing ring,
  radius-sm capsules 11px/700 tabular, ≥44px hit, two-layer focus, accessible-name
  formula, boat accent + halo, mockup adopted); `components.chip`/`popover`/`skeleton`/
  `status-line`; § Colors (accent-tint for selected chips, Gelb graphic variant, ink
  rules — tertiary never informational); § Shapes (radius-sm capsules); § Elevation
  (Level 3 for sheets/popovers — single shadow source); Do's & Don'ts (no emoji, no
  color-only status, coral never for status).
- **EXPERIENCE.md (BINDING, final):** same folder — § IA "Karte layout" (UPDATED: mock
  binding for composition, full-bleed + sheet, two chips, legend popover CONTENT list,
  status line at itinerary head, ≥861 split); § Component Patterns rows "Map↔list sync"
  (hover/tap/keyboard-focus triggers, two-step touch + mini chip, single activation for
  keyboard/AT, weight as non-color cue), "Map marker", "Skeleton" (map = flat track block
  + "Karte lädt …"); § State Patterns "Maps key/script missing" (no demo fallback) +
  "Cold load"; § Interaction Primitives (44px, popover/expander contracts, reduced
  motion, no double-tap-dependent actions); § Accessibility Floor (hidden h1 "Karte",
  marker operability, aria-live); § Responsive (≤860 sheet, ≥861 split, safe-area).
- **Mockup (binding for composition, with the § VERIFY-8 deviations):**
  `…/mockups/keyscreen-karte-consumer-warm.html` — layer chips (l. 119–130, 309–312),
  legend button/pop (132–162, 566–574), sheet (164–221, 417–452), stage cards (180–216),
  capsules (402–414), boat marker (398–400), desktop split (461–682).
- **Story 1.1:** `1-1-design-tokens-and-two-line-header.md` — tokens, `--header-h` 120px,
  `.map-sticky` top fix, focus/motion rules, `.visually-hidden`.
- **Story 1.2:** `1-2-tagesansicht-redesign.md` — TripStatusLine ACs 1–3 (the contract the
  extracted component must keep), popover contract (PositionPopover), skeleton pattern,
  `.chip`/"Festgelegt", `AMPEL_LABEL` export, ampel pill restyle.
- **Architecture:** `…/architecture-sailgreece-router-2026-07-30/ARCHITECTURE-SPINE.md` —
  AD-2 (no UI tests, no domain math in views), AD-7 (STALE_TIME_MS), AD-11 (in-memory
  view state; F1 mapping row), § Stack (visgl Polyline note).
- **PRD:** `…/prd-sailgreece-router-2026-07-30/prd.md` — FR1 (revier map, ampel markers
  current + today's target only), FR2 (round-trip overlay, rest-trip verdict), FR3 (wind
  overlay), FR4 (itinerary↔map sync), FR13 (Datenstand), NFR1 (sticky split kept).
- **Code ground truth (read 2026-08-05, commit `d0bfb0c`):** `src/ui/views/MapView.tsx`,
  `src/ui/views/DayView.tsx` (TripStatusLine lines 945–1065, mapId line 1164–1167),
  `src/ui/views/PlaceDetailView.tsx` (lines 45–47), `src/app/App.tsx`,
  `src/ui/{tokens,mapPath,windField,format,dayViewModel,stageText}.ts`,
  `src/ui/components/{Polyline,WindBarb,SeamarkLayer,StageMap,AmpelBadge,PositionPopover,
  DayViewSkeleton,AvatarMenu}.tsx`, `src/ui/styles.css`, `.env.example`, `README.md`.

## Dev Agent Record

### Agent Model Used

claude-fable-5 (BMad dev-story)

### Debug Log References

- TDD: `mapsEnv.test.ts` red → `mapsEnv.ts` green; `formatTripDayShort` +
  `endPlaceId` cases red → implementations green. Existing suites untouched.
- `npm test`: 27 files, 433 tests green (incl. 5 new mapsEnv, 3 appended
  mapPath, 2 appended format cases).
- `npm run build` (`tsc --noEmit && vite build`): green (pre-existing
  >500 kB-chunk warning unchanged).
- All DoD greps clean: block 1 empty; the three OK checks print OK
  (exactly ONE `title=` in MapView — the documented wind-barb tooltip;
  `TripStatusLine` only as component file; App's "Lade Daten …" serves only
  the platz branch, karte → MapViewSkeleton).

### Completion Notes List

- All 14 ACs implemented. Manual browser smoke (AC 14d) could not be run
  headlessly — build + greps substituted per Task 10.2; the smoke list from
  AC 14(d) is handed to the reviewer (390px sheet toggle, status-line
  expander, chip toggles incl. attribution show/hide, legend popover
  contract + zoom-live truncation count, card↔map sync, pin keyboard
  activation, touch two-step with mini chip, boat marker, missing-env state,
  cold-load skeleton).
- **Deviation (formatTripDayShort):** the story example says "So. 9.8." —
  the actual de-DE ICU short weekday carries NO trailing dot in this runtime
  ("So", not "So."), so the composed tag is "So 9.8.". Composition rule kept
  (existing weekday formatter + d.M., no new Intl pattern); tests assert the
  real output (story rule 8: reality wins, intent kept).
- **Deviation (`.trip-caption`):** the class already exists from Story 1.2
  (12.5px caption, used by DayView line ~1407). NOT redefined at the
  reference's 11.5px — the sheet head reuses the existing 12.5px recipe so
  the frozen 1.2 surface stays byte-identical.
- **Deviation (capsule hit area):** AC 7 demands a ≥44px hit area via
  wrapper — capsules reuse the `.marker-hit` wrapper (role/tabIndex/
  aria-label/handlers on the wrapper, `.stage-capsule` is the aria-hidden
  visual inside). `.marker-hit` uses `min-width/min-height: 44px` instead of
  the reference's fixed `width/height` so wide capsule labels ("10·12") are
  not clipped; `position: relative` added to anchor the armed mini chip.
- **Deviation (sheet shadow):** the reference CSS carried positive offsets
  with a "flipped upward" comment; implemented with genuinely mirrored
  offsets (`0 -2px 6px…, 0 -16px 40px…`) — same Level-3 magnitudes, cast
  upward as a bottom sheet must (no new shadow values).
- **Deviation (legend popover z-index / mobile anchor):** reference
  `.legend-pop` z-index 5 would sit UNDER the reused `.menu-backdrop`
  (z-index 110) — set to 120 (the established `.popover` layer) plus
  `max-height` + `overflow-y: auto`; on ≤860px the popover anchors above the
  raised legend button (`bottom: 244px + 52px`), clear of the sheet peek.
- **Deviation (cardRefs):** `useRef(new Map(...))` collides with the
  `@vis.gl` `Map` component identifier (the module's documented trap) —
  a `Record<number, HTMLButtonElement | undefined>` serves instead.
- DayView/PlaceDetailView edits are strictly the sanctioned surgical scope:
  TripStatusLine extraction (function moved verbatim, `triggerRef` optional,
  statusRef/planStamp focus effect untouched in DayView) + `resolveMapsEnv`
  swap; the two DayView fallback hints now name the actually missing
  variable(s) via a module-level `MAPS_ENV`/`MAPS_MISSING` (env is
  build-time-static under Vite — still "read once per view").
- Harbour rows are sync-participating buttons (hover/focus/tap +
  `aria-pressed`) like the sailing cards — they have no polyline, so hover
  changes nothing on the map, but rows behave uniformly and stay ≥44px.
- `DEMO_MAP_ID` is gone repo-wide (source, `.env.example`, README);
  comments deliberately avoid the literal string so the DoD grep stays clean.
- VERIFY-3/-7 tags for Philipp remain open questions for review (per-alt map
  toggling dropped for the single "Alternativen" chip; no map-side
  position/Törntag affordance).

### File List

**New:**
- `src/ui/mapsEnv.ts`
- `src/ui/__tests__/mapsEnv.test.ts`
- `src/ui/components/TripStatusLine.tsx`
- `src/ui/components/MapViewSkeleton.tsx`

**Modified:**
- `src/ui/views/MapView.tsx` (full redesign: sheet layout, chips, legend
  popover, cards, pins/capsules/boat marker, mapsEnv, sr-h1)
- `src/ui/styles.css` (map-view redesign block incl. `.stage-capsule`;
  legacy map classes deleted; `.stage-number`×4 + `.wind-barb` preserved)
- `src/ui/views/DayView.tsx` (TripStatusLine extraction + mapsEnv swap only)
- `src/ui/views/PlaceDetailView.tsx` (mapsEnv swap only)
- `src/app/App.tsx` (MapViewSkeleton loading branch only)
- `src/ui/mapPath.ts` (`StageEndMarker.endPlaceId`)
- `src/ui/format.ts` (`formatTripDayShort`)
- `src/ui/__tests__/mapPath.test.ts` (append-only)
- `src/ui/__tests__/format.test.ts` (append-only)
- `.env.example`, `README.md` (DEMO-Map-Fallback guidance removed)

## Change Log

- 2026-08-05: Story 1.3 implemented (Karte redesign): full-bleed map +
  two-state bottom sheet ≤860px, TripStatusLine extracted to
  `components/TripStatusLine.tsx` and reused at the itinerary head, floating
  layer chips (Windfiedern/Alternativen/Seezeichen) replace the
  route-toggles panel, legend as "i" popover (direction colors, verdict
  badge, wind-barb scale with aria-live truncation, alt identities,
  OpenSeaMap attribution) + persistent on-map micro-attribution, itinerary
  cards restyled with keyboard/hover/tap map sync, casing-ring pins with
  keyboard operability and touch two-step mini chip, `.stage-capsule`
  markers activating Platzdetail via new `endPlaceId`, boat-position marker,
  `resolveMapsEnv` named config errors (DEMO-Fallback removed repo-wide),
  `MapViewSkeleton` cold-load state. Tests 433 green, build green, DoD
  greps clean. Status → review.

- 2026-08-06 (Feedback Philipp, VERIFY-3 beantwortet): die eingeblendete
  Alternative lag ÜBER der Hauptroute — zwei Routen im selben Bild, und auf
  gemeinsamen Etappen war nicht mehr zu sehen, welche Linie welche ist. Das
  Overlay ist jetzt ein UMSCHALTER: `showAlts: boolean` → `shownAltIndex:
  number | null`, sichtbar ist immer genau EINE Route — die Hauptroute, oder
  STATT ihrer eine Alternative (die Hauptroutenlinien werden so lange nicht
  gezeichnet). Damit kommt das per-Alternative-Umschalten zurück, das im
  Redesign zugunsten des einen Chips gestrichen war (VERIFY-3): ein Chip je
  Alternative mit Identitätspunkt in ihrer Farbe, immer nur einer gedrückt,
  erneutes Antippen holt die Hauptroute zurück; bei genau einer Alternative
  heisst der Chip schlicht "Alternative", sonst nennt er den Wendepunkt.
  Alles Routenbezogene folgt der GEZEIGTEN Route (`displayRouteStages`):
  Etappennummern (in der Alternativfarbe), Kontextmenge der Pins und
  Windfiedern, Wende-Hinweis der Legende — nie Nummern der ausgeblendeten
  Route an einer Alternativlinie. Keine stille Ersetzung: eine aria-live-Zeile
  unter den Chips nennt die gezeigte Alternative und sagt, dass die
  Hauptroute ausgeblendet ist; die Legende markiert die gezeigte Zeile mit
  "wird gezeigt". Neu in styles.css: `.layer-chip .chip-dot`,
  `.layer-chips .alt-note` (+ `:empty`). Tests 592 green, build green.

- 2026-08-06 (Feedback Philipp, Nachschärfung): ein Chip je Alternative waren
  bei sieben Alternativen sieben Chips — auf dem Telefon brachen sie in drei
  Reihen um und versperrten der Karte die halbe Höhe. Jetzt trägt EIN Chip die
  Routenwahl (`AltRouteMenu`, Popover-Kontrakt des AvatarMenu: eines zur Zeit,
  Esc/Backdrop/Auslöser schliessen, Fokus hinein, Fokusfalle, zurück zum
  Auslöser): geschlossen nennt er die gezeigte Route (Farbpunkt + Wendeinsel,
  sonst "Alternativen"), geöffnet listet er "Hauptroute" plus die Alternativen
  als `role="menuitemradio"` mit Ordnungszahl, Wendepunkt und Etappenzahl — die
  Ordnungszahl trennt Alternativen mit gleichem Wendepunkt, deren Farben sich ab
  der vierten wiederholen. Der Auslöser ist kein Umschalter mehr (kein
  aria-pressed, `.layer-chip.active` statt Akzent-Tint: Farbe ist hier
  Identität, nicht Zustand). Chips sind feiner: sichtbar 30px statt 44px, die
  44px Tippfläche kommt unsichtbar über `.layer-chip::after` (inset -7px 0,
  darum Zeilenabstand `--space-4` in `.chip-row`) — der Chipblock ist auf dem
  Telefon von ~160px auf ~60px Höhe geschrumpft (mit Hinweiszeile), 30px ohne.
  Der Hinweis ist auf "Hauptroute ausgeblendet" gekürzt (10,5px, eigene Zeile
  unter der Chip-Reihe, `:empty` = kein Kasten); welche Alternative gilt, sagt
  der Chip daneben. Legende und Chip-Menü teilen eine Ableitung (`altChoices`),
  damit Reihenfolge, Farbe und Bezeichnung identisch sind. Neu in styles.css:
  `.chip-row`, `.alt-menu` (+ `.am-dot`/`.am-label`/`.am-meta`). Geometrie mit
  headless Chromium gegen die echte styles.css geprüft (Chip 30px sichtbar,
  Treffer 6px darüber/darunter, Menü 246×328 bei 390px Viewport). Tests 592
  green, build green.

- 2026-08-06 (Feedback Philipp, dritter Durchgang — zwei Punkte): (1) Die
  Etappenliste der Kartenansicht ist KOMPLETT ENTFALLEN — Bottom-Sheet ≤860px
  und Listenspalte ≥861px. Sie wiederholte die Tagesansicht in kleinerer
  Schrift und nahm dem Besprechungsbild auf dem Telefon 232px (eingeklappt) bis
  75vh (offen). Übrig bleibt über der Karte die Trip-Statuszeile — das Einzige,
  was die Karte selbst nicht sagen kann (Verdikt, Rückkehr-Frist, Stale-Hinweis,
  aufgeklappt die Begründungen); darunter nur noch Karte. Auf 390×844 wächst die
  Kartenfläche damit von ~492px auf 674px, auf dem Desktop läuft sie über die
  ganze Breite (Höhe min(82vh, 820px) statt min(78vh, 720px)). (2) DIE
  ETAPPENNUMMERN SIND JETZT KNÖPFE: jede Zahl führt in die Tagesansicht auf die
  Etappen-Card genau dieser Etappe. Läuft der Round-Trip zweimal über dieselbe
  Insel ("4·8"), sind es zwei Knöpfe — die Zahlen meinen zwei Tage, eine Kapsel
  für beide hätte nur den ersten erreichbar gemacht. Der Sprung läuft über
  `View = { kind: 'tag'; focusDay }` (App.tsx) → `DayView focusDay`: die
  Tagesansicht klappt auf, was zu öffnen ist (Rest-Trip-Zeile inkl. "Alle N Tage
  anzeigen", Sektion "Bereits gefahren"), scrollt das Ziel an und setzt den
  Fokus dorthin; wo der Tag steht, entscheidet der getestete Helper
  `stageFocusPlacement` (dayViewModel.ts). Ein gefahrener Tag hat keine Card
  mehr — sein Chip wird angesprungen und umrandet (`.chip.angesprungen`).
  Die Zahlen einer eingeblendeten ALTERNATIVE führen bewusst nicht (die
  Tagesansicht zeigt die Cards der Hauptroute); sie bleiben Beschriftung mit
  `role="img"` + aria-label. Sichtbar bleibt die Kapsel 18px hoch, die
  Tippfläche wächst über `::after` auf 44px — 44×44 bei einer Zahl
  (`:only-child`), 44×24 je Zahl bei zwei Nachbarn, ohne Überlappung (mit
  headless Chromium gegen die echte styles.css geprüft). Weitere Folgen:
  `.map-status` ersetzt `.map-split`/`.map-itinerary`; `.drag-handle`,
  `.sheet-head`, `.itin-*`, `.harbour-row`, `.kurs-mini` und die
  Sheet-Freihaltung von "i"/Attribution sind gelöscht; `MapViewSkeleton` ohne
  Listenzeilen; `StageEndMarker.endPlaceId` entfernt (das Platzdetail erreicht
  man über den Pin — die Kapsel navigiert jetzt); `formatTripDayShort` entfernt;
  der Törnzeitraum ("8.–19. August 2026 · 12 Tage") stand nur im Sheet-Kopf und
  steht jetzt in der Tag-Zeile der Tagesansicht (`.day-kicker .zeitraum`).
  Legende neu mit der Zeile "Etappe — antippen öffnet sie in „Heute“".
  Tests 631 green, build green.
