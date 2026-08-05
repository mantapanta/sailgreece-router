---
baseline_commit: 10a3bdff0d9aea2901f342ed54e624494a5764be
---

# Story 1.2: Tagesansicht redesign

Status: in-progress

Epic 1: **UX Redesign — Consumer Warm** (ad hoc epic; the UX spines in
`_bmad-output/planning-artifacts/ux-designs/ux-sailgreece-router-2026-08-05/` are BINDING,
status final). Story 1.1 (design tokens + two-line header) is DONE and merged into this
branch — its token layer, button system (`.btn-primary/.btn-secondary/.btn-ghost/.btn-text`),
`.segmented-tabs`, `.icon-button`, two-layer `:focus-visible`, global reduced-motion rule and
the AvatarMenu popover pattern are the vocabulary this story composes from. Read
`1-1-design-tokens-and-two-line-header.md` (Dev Agent Record + File List) before starting.

**CRITICAL — post-merge ground truth:** main was merged into this branch today (PR #21/#22,
"Optionsraum und Alternativ-Routen verschmolzen"). `src/ui/views/DayView.tsx` (1087 lines)
and the new `src/ui/stageText.ts` are the CURRENT state this story restructures. The Dev
Notes below describe that post-merge file — do not work from memory of an older DayView.

## Story

As **Philipp (the skipper and only user)**,
I want **the Tagesansicht rebuilt to the Consumer-Warm mobile-first spine — a one-line trip
status with expandable rest-trip detail replacing the fat banner, a day-context block with a
position popover replacing the ControlsBar, a hero StageCard for today (destination in
display type, stat tiles, berth line, coral CTA) with a calm Hafentag variant, a collapsed
rest-trip list card, a collapsed Optionsraum summary, an assumption info chip, and skeletons
on cold load**,
so that **at 07:00 in the cockpit the answer to "Was fahre ich heute?" — destination,
verdict, departure — is readable in one glance without scrolling, and everything operational
visibly steps back (UM-1/UM-2, FR21)**.

## Scope boundary (read before implementing)

**IN scope (this story):**

- (a) Trip status line (`components.status-line`) at the top of the Tagesansicht: dot + bold
  verdict + `·`-separated facts, tap → rest-trip detail EXPANDER (reasons, Spätester
  Umkehrtag, Meltemi-fest, decision points FR20). The `.resttrip-banner` dies.
- (b) Stale-forecast escalation (leading "Stand vor 4 h" segment, gelb) on the status line
  and the footer provenance age note; focus → status line after every whole-plan re-render.
- (c) Day context: overline kicker + "Position: …" with edit affordance → position popover
  (place select, "GPS erneut abfragen", "Manuelle Position lösen", GPS-denial hint, Törntag
  dev select). **ControlsBar is deleted entirely.** GPS auto-query at app start is ADDED
  (FR27 delta — see VERIFY resolutions).
- (d) Hero StageCard (Heute): display destination (the view's `h1`), AmpelBadge pill,
  warn-note when Gelb/Rot, stat tile grid (Abfahrt · Fahrtzeit · Ankunft · Wind, tabular
  numerals), Abfahrt stepper **[ASSUMPTION: OQ5]**, berth line (whole-row tap target),
  `.btn-primary` "Etappe ändern" + `.btn-ghost` "Wie kommt die Zeit zustande?" expanding the
  EXISTING calc panel. **Hafentag hero variant.** Hero-switch rule (position = today's
  destination → hero shows Tag N+1).
- (e) Rest-Trip list card: collapsed rows "Tag N · Ziel · ⟨Ampel-Wort⟩ ›", first 3 rows +
  "Alle N Tage anzeigen" expander, one row expanded at a time revealing the full stage card.
  Pickup chip (FR31 — supported, see VERIFY).
- (f) Optionsraum: collapsed summary row ("N Optionen offen · Nächste Deadline: Tag X") over
  the MERGED OptionRow/AlternativeRow list; explicit empty state.
- (g) Forecast-assumption info chip + expander replacing the `<details class="hint-annahme">`
  block.
- (h) "Bereits gefahren" collapsed chip list; check-in prompt card ("Noch keine Hauptroute
  festgelegt." + `.btn-primary` "Vorschlag übernehmen").
- (i) Cold-load skeletons (status line + hero + 3 list rows) replacing the "Lade Bibliothek
  und Forecast …" hint for the Tagesansicht.
- (j) Error-vs-hint panel split (`role="alert"` + rot tint vs track + ink-secondary) applied
  to the panels rendered on the Tagesansicht (incl. the two in `Shell`).
- (k) A11y floor for these surfaces: `aria-expanded` on every expander, 16px input font
  floor (deferred from 1.1), no emoji as meaning carriers in DayView/App (🟢📌⚓⚠⛔ die),
  ≥44px targets, German accessible names.

**EXPLICITLY NOT in scope (later stories — do not touch):**

- Karte/MapView redesign (bottom sheet, layer chips, legend popover, direction-colored
  lines/`HIN_LINE_COLOR`/`RUECK_LINE_COLOR`, `DEMO_MAP_ID` removal, pin keyboard operability,
  the status line at the itinerary head). MapView keeps working exactly as today.
- Platzdetail restyle (hero ladder, quality meters, shelter grid).
- Calc-panel internals: **StageMap, WindBasis, Breakdown and AltPreview keep their CONTENT
  and structure as-is** beyond what inherited tokens/classes change. The Breakdown `title`
  tooltips and its info-chip migration are the later a11y/Breakdown pass.
- StageEditor visual redesign. It already has visible, programmatically associated labels
  (label-wrapped controls) — this story only (1) removes the `AMPEL_SYMBOL` emoji from its
  `<option>`s (banned by DESIGN.md) and (2) lets the 16px input floor apply. Nothing else.
- Heading-hierarchy repair outside DayView's own h-elements.
- Migrating remaining legacy `title` tooltips outside the surfaces this story rebuilds
  (badges it KEEPS may keep their `title` for now; none may be ADDED).

**The app must remain fully functional end-to-end after this story** — sign-in,
Tagesansicht (edit stage, check in alternative, calc panel, place links), Karte, Platzdetail,
refresh, sign-out. Note: deleting the ControlsBar removes position/Törntag/Abfahrt controls
from the Karte view too — they are reachable via the "Heute" tab (position popover + hero
stepper); the Karte story decides whether Karte needs its own affordance.

## VERIFY resolutions (spine vs. code reality — decided for this story)

1. **FR27 GPS auto-query: NOT implemented today.** `getCurrentGpsPosition()` has exactly one
   caller — the ControlsBar's manual "GPS abfragen" button (`App.tsx:39-47`). EXPERIENCE.md
   assumes "GPS is queried automatically at app start". **Resolution: this story ADDS the
   auto-query** — one `useEffect` on `Shell` mount dispatching `GPS_FIX` on success and
   staying SILENT on failure (the reducer already protects manual positions;
   `assessment.positionNote` already names an unknown position; the popover's "GPS erneut
   abfragen" surfaces errors inline per the GPS-denied state pattern).
2. **FR32 Törntag: derivation EXISTS, the select is load-bearing for testing.**
   `deriveCurrentDay()` (tripContext) + clamping in `usePlanning` already derive the day from
   the date whenever `currentDayOverride === null`. But today is 2026-08-05 and the trip
   starts 2026-08-08 — without the override everything renders as Tag 1, so the select is the
   only way to simulate later days. **Resolution: the header-level Törntag select dies with
   the ControlsBar; a "Törntag (Test)" select moves INTO the position popover as an explicit
   dev affordance**, with an "Automatisch (aus dem Datum)" option dispatching
   `CLEAR_DAY_OVERRIDE` (action exists, currently unused by any UI). Remove-before-open-
   sourcing note in a code comment.
3. **FR31 pickup: data EXISTS.** `params.pickupDate` + `pickupLatestArrivalHourAthens` are in
   the schema; the solver computes the pickup day via `tripDayForDate(params.tripStartDate,
   params.pickupDate)` (domain/time.ts, exported). It is NOT exposed on `Assessment`.
   **Resolution: the pickup day is derived in the new pure view-model helper by calling the
   existing domain function** (same pattern as `formatTripDayDate` → `dateForTripDay`); no
   schema change, no invented field. The chip renders on the matching rest-trip row; the
   expanded card's berth line already names the proposed pickup harbour (`stage.placeId`).
4. **Hero-switch rule: NOT implemented.** Today the hero is always `day === currentDay`.
   **Resolution: pure helper** (`dayViewModel.ts`): if today's stage is `kind === 'stage'`
   and `assessment.currentIslandId === todayStage.toIslandId` (arrival confirmed at island
   granularity — `currentIslandId` is the assessment's own position derivation), the hero is
   the Tag N+1 stage when one exists; a stage that was "hero-switched past" counts into
   "Bereits gefahren" for the lists. Harbour days never switch (the Hafentag IS the day).
5. **FR20 decision points: computed, currently UNRENDERED.** `assessment.decisionPoints`
   exists; the merged DayView removed the old section and left a comment. **Resolution: the
   status-line expander renders them** — that restores FR20 visibility exactly where
   EXPERIENCE.md puts it.
6. **Departure-in-hero + position popover = EXPERIENCE Open Question 5, still open with
   Philipp.** Implemented per spec, but every related section below is tagged
   **[ASSUMPTION: OQ5]** so review can flip it to a permanently visible control without
   archaeology. No new trip actions are needed either way (`SET_DEPARTURE_HOUR`,
   `SET_MANUAL_PLACE`, `RELEASE_MANUAL`, `GPS_FIX`, `SET_DAY`, `CLEAR_DAY_OVERRIDE` all
   exist in tripContext — reuse, never reinvent).
7. **Stale threshold:** "older than the cache TTL" (EXPERIENCE State Patterns) =
   `STALE_TIME_MS` (3 600 000 ms, FR13/AD-7) from `src/app/usePlanning.ts`. Age label counts
   whole hours ("Stand vor 4 h"); by construction it only appears at ≥1 h.

## Acceptance Criteria

1. **Trip status line replaces the rest-trip banner.** At the top of the Tagesansicht renders
   ONE caption line (`components.status-line`: 12.5px, `--ink-secondary`, 9px state dot in
   the Ampel graphic hue, verdict in `--ink-primary` 600): dot + verdict + `·`-separated
   facts — verdict per `restTripAmpel`: "Round-Trip trägt" / "Round-Trip unter Vorbehalt" /
   "Kein gültiger Round-Trip" / "Round-Trip unbewertet"; when rot AND
   `assessment.proposal` exists, the verdict segment continues "— Vorschlag mit der
   geringsten Verletzung" (EXPERIENCE State Patterns, "No valid round trip"); facts:
   "Rückkehr Alimos bis Tag {ppr.effectiveDeadlineDay}" always, "Meltemi-fest bis
   Tag {meltemiSafeUntilDay}" when a main route reports a non-null value. The line is a
   button (≥44px hit area, `aria-expanded` + `aria-controls`); tap opens the rest-trip
   detail as an **expander** (per the Interaction-Primitives contract: region grows in
   place, Esc inside closes and returns focus to the trigger, no trap, no backdrop)
   containing: the reasons list (`restTripReasons` + PPR-Hinweise, suppressed at base as
   today), "Rückkehr Alimos bis Tag {d} (inkl. Puffertag)" (the qualifier the banner
   carried), "Spätester Umkehrtag: Tag X" / "nicht mehr erreichbar", "Meltemi-fest bis:
   Tag X" / "heute nicht" — the latter two each followed by their explanation in caption
   type, taken VERBATIM from the current badge `title`s ("Letzter Törntag, an dem die
   Umkehr über die Rückfallkette noch rechtzeitig nach Alimos führt (Worst-Case
   gerechnet)." / "Bis zu diesem Törntag ist die Umkehr auch unter dem
   Meltemi-Worst-Case jederzeit möglich. Danach trägt der aktuelle Forecast den Heimweg —
   die Tageskarten sagen, woran der Abbruch zu erkennen ist."; the tooltips die, their
   meaning must not) — and the FR20 decision points (`assessment.decisionPoints`,
   day + text). The wrapper carries `aria-live="polite"`. `.resttrip-banner`/`.resttrip-head` (component markup AND CSS incl.
   the four ampel modifiers) are gone; no information the banner carried is lost.

2. **Stale-forecast escalation.** When `now − fetchedAtIso > STALE_TIME_MS`: the status line
   gains a LEADING segment "Stand vor {h} h" in `--ampel-gelb-text` with a gelb dot
   (`--ampel-gelb-graphic`) before the verdict segment (announced by the existing
   `aria-live`), the footer provenance line prefixes the same "Stand vor {h} h ·" in
   `--ampel-gelb-text`, and the FOOTER refresh affordance renders primary-toned while
   stale (EXPERIENCE State Patterns): give `RefreshButton` an optional `stale` prop that
   adds a class coloring the glyph `--accent-text` (footer instance only; header instance
   unchanged). The age label comes from the pure helper (AC 14) — views pass
   `Date.now()`; the status line re-checks at most once per minute (interval effect,
   cleaned up). When fresh, neither segment renders.

3. **Focus lands on the status line after every whole-plan re-render.** After StageEditor
   apply, "Als Hauptroute übernehmen", "Vorschlag übernehmen"/"Route neu berechnen", or a
   refresh that changes the verdict, focus moves programmatically to the status-line trigger
   (which announces the new verdict via its live region). Mechanism: DayView watches
   `planKey(main.plan)` + `restTripAmpel` in an effect and focuses the trigger ref on change,
   skipping the initial render. Focus is never silently dropped to `<body>`.

4. **Day context replaces the ControlsBar.** Below the status line: overline kicker
   "Tag {day} · {Samstag, 8. August}" (13px/700, +0.06em, uppercase, `--accent-text`) and the
   position line "Position: {Ort}" with source suffix "(GPS)" / "(manuell gesetzt)" or
   "Position unbekannt", plus an edit icon-button (≥44×44, `aria-label="Position
   bearbeiten"`, glyph `aria-hidden`). Tapping it opens a **popover** (`components.popover`:
   white, `--radius-md`, `--shadow-3`, max-width 320px; one at a time; Esc, backdrop tap and
   the trigger close it; focus moves in on open and returns to the trigger on close — reuse
   the AvatarMenu pattern) containing, in one column: (i) labeled place select ("Platz",
   dispatch `SET_MANUAL_PLACE`), (ii) `.btn-secondary` "GPS erneut abfragen" (calls
   `getCurrentGpsPosition`, dispatches `GPS_FIX`), (iii) `.btn-ghost` "Manuelle Position
   lösen" (only while `position.source === 'manual'`, dispatch `RELEASE_MANUAL`), (iv) a
   hint-panel slot: GPS failure renders "Kein GPS-Zugriff — Position manuell wählen." as a
   HINT (never a blocking error), (v) the "Törntag (Test)" dev select (VERIFY 2) with option
   "Automatisch (aus dem Datum)". `assessment.positionNote` renders as a hint panel under
   the day context, as today. The `ControlsBar` component, its render call and the
   `.controls` CSS block (5 rules) are deleted. **[ASSUMPTION: OQ5]** applies to the
   popover placement of position controls.

5. **GPS auto-query at app start (FR27 delta).** On `Shell` mount, exactly once, the app
   requests the browser position and dispatches `GPS_FIX` on success; failures are silent at
   start (no panel, no toast — the position popover is the recovery path). A manual position
   is never overwritten (reducer guard already exists — do not duplicate it in the effect
   beyond avoiding the call noise).

6. **Hero StageCard.** When a main route exists and the hero day (AC 8) is a sailing day, one
   `components.card` (white, `--radius-lg`, `--shadow-2`, 20px padding, 16px side margins)
   renders: (i) overline day tag ("Heute · Etappe {n}", or "Als Nächstes · Tag {d} ·
   Etappe {n}" when hero-switched); (ii) from-line "{Startplatz} →" in body-sm
   `--ink-secondary`; (iii) destination island as the view's **`h1`** in display type
   (30px/800/−0.03em/1.05) with a sub-line "{Platz}[ · über {Zwischenstopps}]" in 14px/500
   `--ink-secondary`; (iv) the AmpelBadge top-right (restyled pill per AC 13); (v) when
   `stage.ampel` is gelb or rot, a **warn-note** (`--radius-md` inset in the verdict's Ampel
   tint + matching `--ampel-*-text`, body-sm) carrying the stage's leg reasons — for gruen/
   unbewertet, reasons render as the quiet `ul.reasons` list; (vi) the **stat tile grid**:
   2-column grid, 1px `--border-hairline` divider grid, tiles on `--surface-inset` at
   `--radius-md`, micro-label (11px/600/+0.07em uppercase, `--ink-secondary`) over headline
   value (19px/700, `font-variant-numeric: tabular-nums`) — ABFAHRT "{H}:00", FAHRTZEIT
   "{5,5 h}" (`formatHours` over the leg sum), ANKUNFT "ca. {17:30}" (last leg's last
   `pointPassages[].etaIso` via `formatAthensTime`, "–" when unsimulated), WIND
   "{NNE} {18 kn}" (first leg's `avgTwdDeg` via `compass` + `avgTwsKn` via `formatKn`, "–"
   when null); (vii) the **berth line**: one full-row button on `--surface-inset` at
   `--radius-md` ("{Platzname}" 650 + " · Liegeplatz" `--ink-secondary` + "Vorschlag" chip
   when `placeIsSuggestion` + place-AmpelBadge right) — the whole row opens Platzdetail
   (`onOpenPlace`); no anchor emoji; (viii) pin state as a text chip "Festgelegt" (📌 dies);
   (ix) `returnCheck.note` as a caption line without emoji (⚓/⚠/⛔ die), colored
   `--ink-secondary` / `--ampel-gelb-text` / `--ampel-rot-text` by status; (x) CTA column:
   `.btn-primary` "Etappe ändern" (toggles the StageEditor in place, label switches to
   "Bearbeiten abbrechen") + `.btn-ghost` "Wie kommt die Zeit zustande?" (aria-expanded;
   toggles the EXISTING calc panel — StageMap + WindBasis + Breakdown content unchanged).
   Distance/hours/Liegezeit/Doppelschlag badges stay available (restyled as chips) on the
   card. **The hero never collapses.** ABFAHRT tile: when the hero is TODAY's stage, it
   carries an inline stepper — "−"/"+" buttons (≥44×44, `aria-label="Abfahrt eine Stunde
   früher"`/"… später"`) stepping `departureHourOverride` within [6, 12] via
   `SET_DEPARTURE_HOUR`, plus a caption-size reset "Standard ({9}:00)" visible only while an
   override is set (dispatches `hour: null`). **[ASSUMPTION: OQ5]** on the stepper.

7. **Hafentag hero variant.** When the hero day is `kind === 'harbour'`: calm card —
   headline "Hafentag in {Ort}" in display type (the `h1`), berth line with the
   Nacht-AmpelBadge (`placeAmpel`), and a caption pointer to the next sailing day ("Weiter am
   {Mi.}: {Syros} → {Paros}", weekday via a new `formatTripDayWeekdayShort`; omitted when no
   later sailing day exists). **No stat tiles, no stepper, no "Etappe ändern" CTA — the
   binding EXPERIENCE Hafentag variant has none; do not add a substitute affordance.**
   Re-planning stays reachable through the rest-trip rows' editors and the Optionsraum.
   Never renders empty tiles.

8. **Hero-switch rule.** The hero shows today's stage until `assessment.currentIslandId`
   equals today's stage `toIslandId` (sailing days only); from then on it shows the Tag N+1
   stage. Last trip day (no N+1): hero stays on today. The stage that was switched past
   counts as "Bereits gefahren" in the lists; rest-trip rows start after the hero day. The
   split comes from the pure helper (AC 14) — the component contains no branching of its own
   beyond calling it.

9. **Rest-Trip list card.** Section h2 "Rest-Trip" in overline style. One list card
   (edge-to-edge rows, hairline dividers, `--space-4` row padding): each future stage (after
   the hero day) renders as a row button — "Tag {n}" (13px tabular, `--ink-secondary`, fixed
   width) · destination ("{Insel} ({Platz})" via `islandWithPlace`, 600) · 9px Ampel dot in
   the graphic hue **plus the verdict word** in caption type ("… · Gelb") · chevron "›" in
   `--ink-secondary` (never `--ampel-unbewertet`). Rows are ≥44px, carry `aria-expanded`, and
   the chevron rotation mirrors it. Collapsed by default, first **3** rows visible, then a
   final row "Alle {N} Tage anzeigen" (accent-text, centered; `aria-expanded`; collapses back
   via "Weniger anzeigen"). Tapping a row expands the FULL stage card for that day inside the
   list (same composition as AC 6 but destination in headline type, not display — one display
   element per screen; "Etappe ändern" as `.btn-secondary` here, one coral primary per screen
   stays the hero's); **exactly one row expanded at a time**, tap again collapses. The pickup
   day's row (VERIFY 3) carries a "Pickup" text chip. Harbour-day rows read "Tag {n} ·
   Hafentag: {Insel} ({Platz})".

10. **Optionsraum summary + merged section.** Section h2 "Optionsraum". A list card whose
    first row is the collapsed summary — "{N} Optionen offen" ("1 Option offen") in 600 +
    meta line "Nächste Deadline: Tag {X}" (omitted when no open option carries a
    `closesOnDay`) + chevron; `aria-expanded`. Expanding reveals the CURRENT merged content
    unchanged in structure: the intro paragraph, all `OptionRow`s (incl. previews and
    check-in inside `AltPreview`) and the `extraAlternatives` rows. Counting: open =
    `state !== 'zu'`; nextDeadline = min `closesOnDay` over open options (pure helper,
    AC 14). **Empty state** (zero open options, or none at all once a plan exists): the card
    renders explicit content — "Keine Optionen mehr offen — Rückweg fixiert." + caption
    "Der Plan folgt der festgelegten Rückroute; neue Fenster meldet der nächste
    Forecast-Lauf." — the section is NEVER hidden. Closed options stay listed (dimmed) inside
    the expanded region, as today.

11. **Forecast-assumption info chip.** The `<details class="hint-annahme">` block is replaced
    by an info chip below the hero (`components.info-chip`: 16px "i" circle on
    `--surface-track` + caption text "Ab Tag {N} beruht die Planung auf einer Annahme." with
    a dotted-underlined trigger word). Activating it (the whole chip is a ≥44px-hit-area
    button with `aria-expanded`) opens a simple expander/popover carrying the EXISTING
    content verbatim: `assumptionNote` + the three bullets (Wind horizon with
    `reliableHorizonDays` + `forecastHorizonIso`, Wave horizon with `waveHorizonIso`, the
    "warnt, verurteilt nicht" sentence). Renders only when `assumedFromDay !== null`.
    `.hint-annahme` CSS dies; `.badge-annahme` stays (used by per-day markers — verify with
    grep before deleting anything else).

12. **Check-in prompt, outdated-plan panel, Bereits gefahren.** (i) When `!main &&
    assessment.proposal`: a prompt CARD in the hero slot — headline "Noch keine Hauptroute
    festgelegt." (this is the `h1` when no hero exists), body "Vorschlag der App:
    {Wendepunkt-Insel} und zurück, {k} Etappen.", `.btn-primary` "Vorschlag übernehmen"
    (`checkIn(proposal.plan)`). (ii) The planOutdated panel keeps its logic and copy but
    renders as a hint panel with a `.btn-secondary` "Route neu berechnen"; its "📌" mentions
    become the word "Festlegungen" (also in AltPreview's copy). (iii) "Bereits gefahren":
    section h2 + a single collapsed trigger "Bereits gefahren ({n})" (`aria-expanded`,
    collapsed by default) revealing a chip list (`components.chip`: `--surface-track`,
    caption, `--ink-secondary`) — "Etappe {n}: {Insel} (Tag {d})". Renders only when
    non-empty.

13. **Primitives added/restyled in CSS.** (i) `.ampel` (AmpelBadge) becomes the DESIGN
    ampel-badge pill: state tint background, 9px dot in the state hue (Gelb dot via the
    `--gelb` alias = graphic variant, already correct), label in the state's `--ampel-*-text`
    color, `--radius-full`, overline type 13px/700/+0.06em (DESIGN `components.ampel-badge`
    → `typography.overline`; no text-transform) — dot + German word always together (the
    component already renders both; do not add a bare-dot mode). This restyle intentionally
    reaches MapView/PlaceDetail badges (inherited improvement, same component). (ii)
    `.error-panel` = `--ampel-rot-tint` bg + `--ampel-rot-text` text + `--radius-md`, no
    border; every error panel on the Tagesansicht (Shell's library/forecast panels, StageEditor
    apply error) carries `role="alert"`. `.hint-panel` = `--surface-track` bg +
    `--ink-secondary` + `--radius-md`, no dashed border; hints never carry `role="alert"`.
    (iii) `components.select` and `components.stepper` recipes exist (`.select`: white,
    hairline border, `--radius-md`, min-height 44px; `.stepper` buttons 44×44). (iv) global
    16px input floor: `input, select, textarea { font-size: max(16px, 1em); }` (iOS zoom
    guard, deferred from 1.1 — verify the Breakdown/legacy controls still look sane). (v)
    `.chip`, `.info-chip`, `.popover`, `.skeleton` (+ pulse keyframes, killed by the global
    reduced-motion rule), `.stat-grid`/`.stat-tile`, `.berth-line`, `.warn-note` (+ four tint
    modifiers), `.trip-status*`, `.day-kicker`, `.list-card`/`.trip-row`, `.section-title`
    (h2, overline recipe) per the reference CSS. DayView stops using `.versal` for its own
    sections (the class stays for MapView/PlaceDetail/AltPreview internals).

14. **Pure logic lives in a tested helper module.** New `src/ui/dayViewModel.ts` (pure, no
    React, imports only domain types + `tripDayForDate` from `domain/time.ts`) exporting at
    least: `staleForecastLabel(fetchedAtIso, nowMs, ttlMs): string | null`;
    `dayViewStages(main, currentDay, currentIslandId): { hero, rest, past }` (hero-switch +
    list split, AC 8/9); `optionsSummary(options): { openCount, nextDeadlineDay }`;
    `pickupDay(params): number`; `restTripVerdictLabel(ampel): string`. New
    `stageFrom(snapshot, stage): string | null` in `stageText.ts` (start place label for the
    hero from-line, from the first leg's `sailedLeg` like `stageTitle`). All covered by
    `src/ui/__tests__/dayViewModel.test.ts` (+ new cases appended in `stageText.test.ts`)
    running in the vitest node environment. **No component/DOM tests (AD-2).** Views call
    these helpers and render — no verdict/aggregation logic inline in JSX beyond trivial
    mapping.

15. **Cold-load skeletons.** While `!snapshot || !assessment` (and no query error) with the
    "Heute" tab active, the main area renders `DayViewSkeleton`: skeleton bars matching the
    final layout — one status-line bar, one hero card block (title bar + 2×2 tile grid), three
    list-row bars — in `--surface-track`/`--surface-inset` at `--radius-md`, subtle opacity
    pulse (disabled under reduced motion), wrapped in `role="status"` with visually hidden
    text "Tagesansicht wird geladen …". The string "Lade Bibliothek und Forecast …" no longer
    appears anywhere; Karte/Platzdetail keep a plain hint panel ("Lade Daten …") until their
    stories.

16. **Definition of done / non-regression.** (a) `npm test` green — all existing tests
    untouched and passing, new `dayViewModel.test.ts` + `stageText` cases green; (b)
    `npm run build` (`tsc --noEmit && vite build`) green (`noUnusedLocals`: removing
    ControlsBar must also remove now-unused imports); (c) DoD greps in Dev Notes all clean;
    (d) manual smoke via `npm run dev`: cold-load skeleton → status line + expander →
    position popover (place set/release, GPS button, Törntag dev select) → hero with stepper
    → "Etappe ändern" round-trip (focus lands on the status line) → calc panel unchanged →
    rest-trip row expand/collapse incl. pickup chip day → Optionsraum expand + check-in an
    alternative → Karte + Platzdetail still work; (e) all NEW strings German; no emoji as
    meaning carriers in DayView/App.

## Tasks / Subtasks

- [ ] **Task 1 — `src/ui/dayViewModel.ts` + tests (write first)** (AC: 14, 2, 8, 9, 10)
  - [ ] 1.1 Implement `staleForecastLabel`, `dayViewStages`, `optionsSummary`, `pickupDay`,
        `restTripVerdictLabel` per the reference implementation in Dev Notes.
  - [ ] 1.2 `stageFrom(snapshot, stage)` in `stageText.ts` (mirror `stageTitle`'s
        sailedLeg-first logic; null when no first leg resolves).
  - [ ] 1.3 `src/ui/__tests__/dayViewModel.test.ts`: fresh vs stale (boundary exactly at
        TTL → fresh), hero-switch on/off/harbour/last-day, list split when switched,
        options summary incl. all-zu and empty, pickup-day mapping. Append `stageFrom`
        cases to `stageText.test.ts` — do not modify existing cases.
  - [ ] 1.4 `formatTripDayWeekdayShort(tripStartDate, day)` in `format.ts` (weekday 'short',
        Europe/Athens — same pattern as `formatTripDayDate`).
- [ ] **Task 2 — CSS: new Tagesansicht sections + primitive additions** (AC: 13, and the
      styling half of 1, 4, 6, 7, 9, 10, 11, 12, 15)
  - [ ] 2.1 Add the reference CSS blocks (Dev Notes): trip status, day context, popover,
        select/stepper, hero card (stat grid, berth line, warn-note, cta column), list card
        + rows + chips, info chip, summary row, skeleton, section titles.
  - [ ] 2.2 Restyle `.ampel` to the pill spec; restyle `.error-panel`/`.hint-panel`; add the
        global 16px input floor.
  - [ ] 2.3 Delete `.controls` (5 rules), `.resttrip-banner` (+4 modifiers),
        `.resttrip-head`, `.hint-annahme`. Check `.options-grid` and `.stage-card.today`
        usage by grep — delete if no `.tsx` references them after Task 4/5.
- [ ] **Task 3 — App.tsx: ControlsBar out, auto-GPS + skeleton + alert roles in** (AC: 4, 5,
      15, 13ii, 2)
  - [ ] 3.1 Delete the `ControlsBar` component and its render (`view.kind !== 'platz' && …`);
        remove now-unused imports (`useTrip`? — stays if the GPS effect lives in Shell;
        `getCurrentGpsPosition` stays for the effect).
  - [ ] 3.2 Add the one-shot GPS effect in `Shell` (reference in Dev Notes).
  - [ ] 3.3 Loading branch: `view.kind === 'tag'` → `<DayViewSkeleton />`; else hint panel
        "Lade Daten …". Retire the old string.
  - [ ] 3.4 `role="alert"` on the two Shell error panels; footer provenance gains the stale
        "Stand vor {h} h ·" prefix in `--ampel-gelb-text` via `staleForecastLabel` +
        `STALE_TIME_MS`; while stale the footer `RefreshButton` instance renders
        primary-toned (`stale` prop → `--accent-text` glyph, AC 2).
- [ ] **Task 4 — TripStatusLine (+ expander) in DayView** (AC: 1, 2, 3)
  - [ ] 4.1 Component (local to DayView.tsx is fine): live wrapper, trigger button with dot +
        verdict + facts, stale leading segment, detail region (reasons incl. suppressed-at-
        base PPR logic moved over from the banner, Umkehrtag, Meltemi-fest, decision points).
  - [ ] 4.2 Minute tick for staleness; Esc-inside-closes with focus return.
  - [ ] 4.3 Focus effect on `planKey(main.plan)`/`restTripAmpel` change (skip first render).
  - [ ] 4.4 Delete the banner JSX; verify nothing else consumed `.resttrip-*`.
- [ ] **Task 5 — Day context + PositionPopover** (AC: 4)
  - [ ] 5.1 New `src/ui/components/PositionPopover.tsx` (AvatarMenu is the pattern: backdrop,
        Esc, focus in/out, `aria-expanded` on the trigger). Uses `useTrip()` + `usePlanning()`
        (`bundle.library.places`) + `getCurrentGpsPosition`.
  - [ ] 5.2 Day-context block in DayView (kicker, position line, edit affordance,
        positionNote hint). Tag the OQ5 assumption in a comment.
  - [ ] 5.3 Törntag dev select inside the popover (SET_DAY / CLEAR_DAY_OVERRIDE), commented
        as a dev affordance.
- [ ] **Task 6 — Hero StageCard + Hafentag variant + hero switch** (AC: 6, 7, 8)
  - [ ] 6.1 Rebuild `StageCard` into the new composition with a `hero` flag (display h1 +
        stat grid + stepper only for hero; headline variant for expanded rows). Keep
        StageEditor and the calc panel (StageMap/WindBasis/Breakdown) mounted exactly as
        today inside it.
  - [ ] 6.2 Warn-note vs quiet reasons; returnCheck line de-emojified; "Festgelegt" pin chip;
        berth-line row button; badges → chips.
  - [ ] 6.3 Hafentag variant (no tiles/CTA, next-sailing-day pointer).
  - [ ] 6.4 Wire `dayViewStages` for hero/rest/past; overline day tag "Heute · …" vs
        "Als Nächstes · …".
  - [ ] 6.5 Abfahrt stepper (bounds 6–12, reset while override set) — today's hero only.
- [ ] **Task 7 — Rest-Trip list card** (AC: 9)
  - [ ] 7.1 Row buttons (day tag · destination · dot + verdict word · chevron), first 3 +
        "Alle {N} Tage anzeigen"/"Weniger anzeigen", single-expanded state, expanded body =
        full StageCard (non-hero).
  - [ ] 7.2 Pickup chip on `pickupDay(params)`'s row.
- [ ] **Task 8 — Optionsraum summary + empty state** (AC: 10)
  - [ ] 8.1 Summary row (counts from `optionsSummary`), expander region wrapping the existing
        OptionRow/AlternativeRow list unchanged; explicit empty state.
  - [ ] 8.2 SHOULD: swap `className="secondary"` buttons in OptionRow/AlternativeRow/
        AltPreview to `.btn-secondary`, the AltPreview check-in button to `.btn-secondary`,
        and the 📌 copy to "Festlegungen" — content untouched.
- [ ] **Task 9 — Info chip, check-in prompt, outdated panel, Bereits gefahren** (AC: 11, 12)
- [ ] **Task 10 — StageEditor minimal pass** (AC: 13, scope boundary)
  - [ ] 10.1 Replace `AMPEL_SYMBOL` emoji in `<option>`s with "{Name} — {Grün}" text; delete
        the const.
  - [ ] 10.2 Confirm labels remain visible/associated; 16px floor applies via the global
        rule. Editor error panel gets `role="alert"`. NOTHING else.
- [ ] **Task 11 — DayViewSkeleton** (AC: 15) — new `src/ui/components/DayViewSkeleton.tsx`,
      rendered from App.tsx.
- [ ] **Task 12 — Verify DoD** (AC: 16)
  - [ ] 12.1 Run every DoD grep; `npm test`; `npm run build`.
  - [ ] 12.2 Manual smoke per AC 16(d) — if headless, substitute build + greps and hand the
        browser smoke list to the reviewer (as story 1.1 did).

## Dev Notes

### Stack and constraints — read first (unchanged from 1.1)

- **No new dependencies.** React 19.2 + Vite 8.2 + TS 5.9 + vanilla CSS custom properties.
  No router (AD-11), no component library, no webfont.
- **Layering:** `ui` may import `domain` (types AND pure functions like `tripDayForDate` —
  precedent: `format.ts` imports `dateForTripDay`, `compassPoint`). Views already import
  `usePlanning` from `app/planningContext` and may import `useTrip` from `app/tripContext`
  the same way (ControlsBar precedent). **AD-2:** views never compute domain values — the
  new derivations (hero switch, options summary, stale label) are DISPLAY aggregation and
  live in the tested pure helper, never inline in JSX; anything resembling a verdict stays
  in `assessment`.
- **AD-12:** one mutation path — all writes go through the existing tripContext actions and
  `usePlanning()` callbacks (`editStage`, `checkIn`, `releasePin`, `setStopHours`). This
  story adds ZERO new actions and ZERO new engine callbacks.
- **Testing (AD-2):** vitest, node environment, `src/**/__tests__/*.test.ts` only. UI
  components stay test-free; pure helpers get tests. Never touch existing tests.
- **tsconfig:** `strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`.
- **Formatting:** reuse `format.ts` (`formatAthensTime`, `formatHours`, `formatKn`,
  `formatStamp`, `formatTripDayDate`, `compass`) — the ONLY additions are
  `formatTripDayWeekdayShort` (new) and nothing else; never inline a new `Intl` formatter
  elsewhere. Tabular numerals on every quantitative value.
- **German UI / English code**; commit style: short imperative sentence, no prefix tags.

### German copy — the exact strings (Voice & Tone: sachlich, kurz, no exclamation marks)

| Where | String |
|---|---|
| Verdict gruen | `Round-Trip trägt` |
| Verdict gelb | `Round-Trip unter Vorbehalt` |
| Verdict rot | `Kein gültiger Round-Trip` |
| Verdict unbewertet | `Round-Trip unbewertet` |
| Status fact 1 | `Rückkehr Alimos bis Tag {d}` |
| Status fact 2 | `Meltemi-fest bis Tag {d}` (only when non-null) |
| Verdict rot + proposal exists | `Kein gültiger Round-Trip — Vorschlag mit der geringsten Verletzung` |
| Stale segment / footer prefix | `Stand vor {h} h` |
| Detail: Frist | `Rückkehr Alimos bis Tag {d} (inkl. Puffertag)` |
| Detail: Umkehrtag | `Spätester Umkehrtag: Tag {d}` / `Spätester Umkehrtag: nicht mehr erreichbar` + caption explanation (current badge `title`, verbatim — see AC 1) |
| Detail: Meltemi | `Meltemi-fest bis: Tag {d}` / `Meltemi-fest bis: heute nicht` + caption explanation (current badge `title`, verbatim — see AC 1) |
| Detail: FR20 heading | `Entscheidungspunkte` (rows: `Tag {d}: {text}`) |
| Kicker | `Tag {d} · {formatTripDayDate(...)}` |
| Position line | `Position: {Ort}` + ` (GPS)` / ` (manuell gesetzt)`; fallback `Position unbekannt` |
| Edit affordance | `aria-label="Position bearbeiten"` |
| Popover labels | `Platz`, `GPS erneut abfragen`, `Manuelle Position lösen`, `Törntag (Test)`, option `Automatisch (aus dem Datum)` |
| GPS denial hint | `Kein GPS-Zugriff — Position manuell wählen.` |
| Hero day tag | `Heute · Etappe {n}` / `Heute · Hafentag` / `Als Nächstes · Tag {d} · Etappe {n}` |
| Stat labels | `Abfahrt` · `Fahrtzeit` · `Ankunft` · `Wind` (values: `{H}:00`, `{formatHours}`, `ca. {formatAthensTime}`, `{compass} {formatKn}`; missing → `–`) |
| Stepper | `aria-label="Abfahrt eine Stunde früher"` / `"Abfahrt eine Stunde später"`; reset `Standard ({H}:00)` |
| Berth line | `{Platzname}` + ` · Liegeplatz`; chip `Vorschlag` |
| Pin chip | `Festgelegt` |
| CTA | `Etappe ändern` / `Bearbeiten abbrechen`; ghost `Wie kommt die Zeit zustande?` / `Rechnung ausblenden` |
| Hafentag | `Hafentag in {Ort}`; pointer `Weiter am {Wochentag kurz}: {Insel} → {Insel}` |
| Rest-Trip section | `Rest-Trip`; rows `Tag {n}`; expander `Alle {N} Tage anzeigen` / `Weniger anzeigen`; harbour row `Hafentag: {…}`; chip `Pickup` |
| Optionsraum | `Optionsraum`; summary `{N} Optionen offen` / `1 Option offen`; meta `Nächste Deadline: Tag {d}` |
| Optionsraum empty | `Keine Optionen mehr offen — Rückweg fixiert.` + caption `Der Plan folgt der festgelegten Rückroute; neue Fenster meldet der nächste Forecast-Lauf.` |
| Assumption chip | `Ab Tag {N} beruht die Planung auf einer Annahme.` |
| Check-in prompt | h: `Noch keine Hauptroute festgelegt.` · body: `Vorschlag der App: {Insel} und zurück, {k} Etappen.` · button: `Vorschlag übernehmen` |
| Bereits gefahren | `Bereits gefahren ({n})`; chips `Etappe {n}: {Insel} (Tag {d})` — omit the `Etappe {n}: ` prefix when `stageNumber === null` (harbour day), mirroring the current conditional |
| Skeleton hidden text | `Tagesansicht wird geladen …`; Karte/Platz loading hint `Lade Daten …` |
| Editor options | `{Platzname} — {Grün|Gelb|Rot|Unbewertet}` (replaces 🟢-symbols) |

Ampel word rendering in list rows: reuse the `LABELS` idea — either export the label map
from `AmpelBadge.tsx` or duplicate the four words in `restTripVerdictLabel`'s module; prefer
exporting `AMPEL_LABEL` from `AmpelBadge.tsx` (one source).

### `src/ui/dayViewModel.ts` — reference implementation

```ts
/** Pure Tagesansicht view-model derivations — tested, no React, no clock reads. */
import type { Ampel } from '../domain/schema/common.ts';
import type {
  PlanAssessment,
  RouteOptionAssessment,
  StageAssessment,
} from '../domain/schema/snapshot.ts';
import { tripDayForDate } from '../domain/time.ts';

/** "Stand vor 4 h" once fetchedAt is older than the cache TTL; null while fresh. */
export function staleForecastLabel(
  fetchedAtIso: string,
  nowMs: number,
  ttlMs: number,
): string | null {
  const age = nowMs - Date.parse(fetchedAtIso);
  if (!Number.isFinite(age) || age <= ttlMs) return null;
  return `Stand vor ${Math.floor(age / 3_600_000)} h`;
}

/**
 * Hero-switch rule (EXPERIENCE.md IA): the hero shows today's stage until the
 * confirmed position equals today's destination; then Tag N+1 is the open
 * decision. Island granularity — currentIslandId IS the assessment's position
 * derivation (AD-2: no second derivation here). Harbour days never switch.
 */
export function dayViewStages(
  main: PlanAssessment | null,
  currentDay: number,
  currentIslandId: string | null,
): {
  hero: StageAssessment | null;
  rest: StageAssessment[];
  past: StageAssessment[];
} {
  if (!main) return { hero: null, rest: [], past: [] };
  const today = main.stages.find((s) => s.day === currentDay) ?? null;
  let hero = today;
  if (
    today &&
    today.kind === 'stage' &&
    currentIslandId !== null &&
    currentIslandId === today.toIslandId
  ) {
    hero = main.stages.find((s) => s.day === currentDay + 1) ?? today;
  }
  const heroDay = hero?.day ?? currentDay;
  return {
    hero,
    rest: main.stages.filter((s) => s.day > heroDay),
    past: main.stages.filter((s) => s.day < currentDay || (s.day >= currentDay && s.day < heroDay)),
  };
}

/** Collapsed Optionsraum summary. Open = every state except 'zu'. */
export function optionsSummary(options: RouteOptionAssessment[]): {
  openCount: number;
  nextDeadlineDay: number | null;
} {
  const open = options.filter((o) => o.state !== 'zu');
  const deadlines = open
    .map((o) => o.closesOnDay)
    .filter((d): d is number => d !== null);
  return {
    openCount: open.length,
    nextDeadlineDay: deadlines.length > 0 ? Math.min(...deadlines) : null,
  };
}

/** FR31 — trip day of the guest pickup, from the existing domain date mapper. */
export function pickupDay(params: { tripStartDate: string; pickupDate: string }): number {
  return tripDayForDate(params.tripStartDate, params.pickupDate);
}

export function restTripVerdictLabel(ampel: Ampel): string {
  return {
    gruen: 'Round-Trip trägt',
    gelb: 'Round-Trip unter Vorbehalt',
    rot: 'Kein gültiger Round-Trip',
    unbewertet: 'Round-Trip unbewertet',
  }[ampel];
}
```

`stageFrom` in `stageText.ts` (start of the hero from-line):

```ts
/** Startplatz der ersten gesegelten Etappe des Tages — für die Hero-Herkunftszeile. */
export function stageFrom(
  snapshot: PlanningSnapshot,
  stage: StageAssessment,
): string | null {
  const first = stage.legs[0];
  const firstLeg = first ? (first.sailedLeg ?? snapshot.library.legs.find((l) => l.id === first.legId)) : undefined;
  if (!firstLeg) return null;
  return islandWithPlace(snapshot, firstLeg.fromIslandId, firstLeg.fromPlaceId);
}
```

(Reuse the private `legOf` helper instead of re-inlining if you keep it in the same module.)

### Reference CSS for the new sections (add under a "/* ---- day view (redesign) ---- */" header)

```css
/* ---- trip status line ---- */
.trip-status { margin: var(--space-3) 0 0; }
.trip-status-trigger {
  display: flex; align-items: flex-start; gap: var(--space-2);
  border: 0; background: transparent; cursor: pointer; text-align: left;
  padding: var(--space-2) 0; min-height: 44px; width: 100%;
  font: 400 12.5px/1.35 var(--font-sans); color: var(--ink-secondary);
  font-variant-numeric: tabular-nums;
}
.trip-status-trigger strong { color: var(--ink-primary); font-weight: 600; }
.trip-status-trigger .chev { margin-left: auto; color: var(--ink-secondary); transition: transform 0.15s; }
.trip-status-trigger[aria-expanded='true'] .chev { transform: rotate(90deg); }
.status-dot { flex: none; width: 9px; height: 9px; border-radius: var(--radius-full); margin-top: 4px; }
.status-dot.gruen { background: var(--ampel-gruen); }
.status-dot.gelb { background: var(--ampel-gelb-graphic); }
.status-dot.rot { background: var(--ampel-rot); }
.status-dot.unbewertet { background: var(--ampel-unbewertet); }
.trip-status .stale { color: var(--ampel-gelb-text); font-weight: 600; }
.icon-button.stale { color: var(--accent-text); } /* footer refresh while forecast stale (AC 2) */
.trip-status-detail {
  background: var(--surface-card); border-radius: var(--radius-md);
  box-shadow: var(--shadow-2); padding: var(--space-4);
  font: 400 14px/1.45 var(--font-sans); color: var(--ink-secondary);
  margin-top: var(--space-2);
}
.trip-status-detail h3 { font: 700 13px/1.3 var(--font-sans); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-secondary); margin: var(--space-3) 0 var(--space-1); }

/* ---- day context ---- */
.day-context { margin: var(--space-5) 0 var(--space-2); }
.day-kicker { font: 700 13px/1.3 var(--font-sans); letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent-text); }
.day-where { display: flex; align-items: center; gap: var(--space-1); font: 400 14px/1.45 var(--font-sans); color: var(--ink-secondary); }

/* ---- popover (position control) ---- */
.popover-wrap { position: relative; display: inline-flex; }
.popover {
  position: absolute; left: 0; top: calc(100% + var(--space-2)); z-index: 120;
  width: min(320px, calc(100vw - 2 * var(--space-page-margin)));
  background: var(--surface-card); border-radius: var(--radius-md); box-shadow: var(--shadow-3);
  padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3);
}
.popover label { display: flex; flex-direction: column; gap: var(--space-2); font: 600 14px/1.3 var(--font-sans); color: var(--ink-primary); }

/* ---- form primitives ---- */
input, select, textarea { font-size: max(16px, 1em); }  /* iOS zoom floor (deferred from 1.1) */
.select {
  min-height: 44px; padding: 0 var(--space-3);
  background: var(--surface-card); border: 1px solid var(--border-hairline);
  border-radius: var(--radius-md); font: 400 16px/1.4 var(--font-sans); color: var(--ink-primary);
}
.stepper { display: inline-flex; align-items: center; gap: var(--space-1); }
.stepper button {
  width: 44px; height: 44px; border: 1px solid var(--border-hairline); border-radius: var(--radius-md);
  background: var(--surface-inset); font: 700 19px/1 var(--font-sans); color: var(--ink-primary); cursor: pointer;
}
.stepper button:disabled { color: var(--ink-tertiary); cursor: default; }

/* ---- hero stage card ---- */
.hero-card { margin-top: var(--space-2); }
.card-surface {                     /* new card recipe — legacy .card keeps serving old views */
  background: var(--surface-card); border-radius: var(--radius-lg); box-shadow: var(--shadow-2);
  padding: var(--space-card-padding);
}
.hero-top { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); }
.route-from { font: 400 14px/1.45 var(--font-sans); color: var(--ink-secondary); }
.route-dest { font: 800 30px/1.05 var(--font-sans); letter-spacing: -0.03em; color: var(--ink-primary); margin: 2px 0 0; }
.route-sub { font: 500 14px/1.45 var(--font-sans); color: var(--ink-secondary); margin-top: var(--space-1); }
.warn-note { margin-top: var(--space-3); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); font: 400 14px/1.45 var(--font-sans); }
.warn-note.gelb { background: var(--ampel-gelb-tint); color: var(--ampel-gelb-text); }
.warn-note.rot { background: var(--ampel-rot-tint); color: var(--ampel-rot-text); }
.stat-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 1px;
  background: var(--border-hairline); border-radius: var(--radius-md); overflow: hidden;
  margin-top: var(--space-4);
}
.stat-tile { background: var(--surface-inset); padding: var(--space-3) var(--space-4); }
.stat-tile .label { font: 600 11px/1.3 var(--font-sans); letter-spacing: 0.07em; text-transform: uppercase; color: var(--ink-secondary); }
.stat-tile .value { font: 700 19px/1.2 var(--font-sans); letter-spacing: -0.01em; margin-top: 3px; font-variant-numeric: tabular-nums; color: var(--ink-primary); }
.berth-line {
  display: flex; align-items: center; gap: var(--space-2); width: 100%;
  margin-top: var(--space-3); padding: var(--space-3) var(--space-4); min-height: 44px;
  background: var(--surface-inset); border: 0; border-radius: var(--radius-md);
  font: 400 14px/1.45 var(--font-sans); color: var(--ink-primary); cursor: pointer; text-align: left;
}
.berth-line .name { font-weight: 650; text-decoration: underline; text-underline-offset: 2px; }
.berth-line .ampel { margin-left: auto; }
.cta-column { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-4); }

/* ---- chips ---- */
.chip {
  display: inline-flex; align-items: center; gap: var(--space-1);
  background: var(--surface-track); color: var(--ink-secondary);
  border-radius: var(--radius-full); padding: 3px 10px;
  font: 400 12.5px/1.35 var(--font-sans); white-space: nowrap;
}

/* ---- section titles + list card ---- */
.section-title {
  font: 700 13px/1.3 var(--font-sans); letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--ink-secondary); margin: var(--space-6) 0 var(--space-2);
}
.list-card { background: var(--surface-card); border-radius: var(--radius-lg); box-shadow: var(--shadow-2); overflow: hidden; }
.trip-row {
  display: flex; align-items: center; gap: var(--space-3); width: 100%;
  min-height: 44px; padding: var(--space-3) var(--space-4);
  border: 0; border-bottom: 1px solid var(--border-hairline);
  background: transparent; cursor: pointer; text-align: left;
  font: 400 14.5px/1.45 var(--font-sans); color: var(--ink-primary);
}
.list-card > :last-child { border-bottom: 0; }
.trip-row .tag { flex: none; width: 48px; font-size: 13px; color: var(--ink-secondary); font-variant-numeric: tabular-nums; }
.trip-row .place { font-weight: 600; }
.trip-row .verdict { margin-left: auto; display: inline-flex; align-items: center; gap: var(--space-1); font: 400 12.5px/1.35 var(--font-sans); color: var(--ink-secondary); }
.trip-row .chev { color: var(--ink-secondary); transition: transform 0.15s; }
.trip-row[aria-expanded='true'] .chev { transform: rotate(90deg); }
.trip-row.more { justify-content: center; color: var(--accent-text); font: 600 13.5px/1.3 var(--font-sans); }
.trip-row-body { padding: var(--space-4); border-bottom: 1px solid var(--border-hairline); }

/* ---- info chip ---- */
.info-chip {
  display: inline-flex; align-items: center; gap: var(--space-2);
  border: 0; background: transparent; cursor: pointer;
  min-height: 44px; padding: var(--space-2) 0;
  font: 400 12.5px/1.35 var(--font-sans); color: var(--ink-secondary); text-align: left;
}
.info-chip .i {
  flex: none; width: 16px; height: 16px; border-radius: var(--radius-full);
  background: var(--surface-track); color: var(--ink-secondary);
  font: 700 10.5px/1 var(--font-sans); display: inline-flex; align-items: center; justify-content: center;
}
.info-chip u { text-decoration-style: dotted; text-underline-offset: 2px; }

/* ---- skeleton ---- */
.skeleton { border-radius: var(--radius-md); background: var(--surface-track); animation: skeleton-pulse 1.4s ease-in-out infinite; }
@keyframes skeleton-pulse { 50% { opacity: 0.55; } }

/* ---- error / hint split (replaces the legacy recipes) ---- */
.error-panel { background: var(--ampel-rot-tint); color: var(--ampel-rot-text); border: 0; border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); font: 400 14px/1.45 var(--font-sans); margin-bottom: var(--space-4); }
.hint-panel { background: var(--surface-track); color: var(--ink-secondary); border: 0; border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); font: 400 14px/1.45 var(--font-sans); }
```

`.ampel` pill restyle (replaces the current bare uppercase recipe; per-state text colors are
new):

```css
.ampel {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 5px 12px; border-radius: var(--radius-full);
  font: 700 13px/1.3 var(--font-sans); letter-spacing: 0.06em; /* = typography.overline */
}
.ampel .dot { width: 9px; height: 9px; border-radius: var(--radius-full); }
.ampel-gruen { background: var(--ampel-gruen-tint); color: var(--ampel-gruen-text); }
.ampel-gelb { background: var(--ampel-gelb-tint); color: var(--ampel-gelb-text); }
.ampel-rot { background: var(--ampel-rot-tint); color: var(--ampel-rot-text); }
.ampel-unbewertet { background: var(--ampel-unbewertet-tint); color: var(--ampel-unbewertet-text); }
/* dot colors: keep the existing four .ampel-* .dot rules (they already use the
   aliases; --gelb = graphic variant — correct per DESIGN.md). */
```

Note on `.card`: the legacy `.card` recipe still serves MapView itinerary internals and the
auth card via other classes — introduce `.card-surface` for the NEW cards instead of
rewriting `.card`, and let DayView stop using `.card` for its own containers. (If after the
rebuild `grep -rn '"card' src/ui/views/DayView.tsx` shows nothing and no other view uses
`.stage-card`, delete `.stage-card.today`.)

### Reference JSX (adapt, don't paste blindly)

Trip status line:

```tsx
const stale = staleForecastLabel(assessment.fetchedAtIso, nowMs, STALE_TIME_MS);
<div className="trip-status" aria-live="polite">
  <button
    type="button" ref={statusRef} className="trip-status-trigger"
    aria-expanded={detailOpen} aria-controls="resttrip-detail"
    onClick={() => setDetailOpen((o) => !o)}
  >
    <span className={`status-dot ${stale ? 'gelb' : assessment.restTripAmpel}`} aria-hidden="true" />
    <span>
      {stale && <span className="stale">{stale} · </span>}
      <strong>{restTripVerdictLabel(assessment.restTripAmpel)}</strong>
      {' · '}Rückkehr Alimos bis Tag {assessment.ppr.effectiveDeadlineDay}
      {main?.meltemiSafeUntilDay != null && <> · Meltemi-fest bis Tag {main.meltemiSafeUntilDay}</>}
    </span>
    <span className="chev" aria-hidden="true">›</span>
  </button>
  {detailOpen && (
    <div id="resttrip-detail" className="trip-status-detail" onKeyDown={escClosesAndRefocuses}>
      {/* reasons (restTripReasons + pprHinweise — keep the atBase suppression),
          "Rückkehr Alimos bis Tag {d} (inkl. Puffertag)", Spätester Umkehrtag and
          Meltemi-fest bis (each + its verbatim ex-title explanation, AC 1), then FR20: */}
      {assessment.decisionPoints.length > 0 && (
        <>
          <h3>Entscheidungspunkte</h3>
          <ul className="reasons">
            {assessment.decisionPoints.map((p) => (
              <li key={`${p.day}-${p.text}`}>Tag {p.day}: {p.text}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )}
</div>
```

Focus-after-re-render effect (DayView):

```tsx
const planStamp = main ? `${planKey(main.plan)}|${assessment.restTripAmpel}` : null;
const prevStamp = useRef<string | null>(null);
useEffect(() => {
  if (prevStamp.current !== null && planStamp !== null && prevStamp.current !== planStamp) {
    statusRef.current?.focus();
  }
  prevStamp.current = planStamp;
}, [planStamp]);
```

GPS auto-query (Shell, App.tsx — FR27 delta):

```tsx
const { state: tripState, dispatch } = useTrip();
useEffect(() => {
  // FR27: position resolves automatically at app start; failures are silent —
  // the position popover ("GPS erneut abfragen") is the visible recovery path.
  if (tripState.position?.source === 'manual') return; // reducer guards anyway
  let cancelled = false;
  getCurrentGpsPosition()
    .then((pos) => { if (!cancelled) dispatch({ type: 'GPS_FIX', position: pos }); })
    .catch(() => {});
  return () => { cancelled = true; };
  // mount-only by design:
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

Abfahrt tile with stepper ([ASSUMPTION: OQ5] — today's hero only):

```tsx
const hour = trip.departureHourOverride ?? params.departureHourAthens;
<div className="stat-tile">
  <div className="label">Abfahrt</div>
  <div className="value">{hour}:00</div>
  <div className="stepper">
    <button type="button" aria-label="Abfahrt eine Stunde früher" disabled={hour <= 6}
            onClick={() => dispatch({ type: 'SET_DEPARTURE_HOUR', hour: hour - 1 })}>−</button>
    <button type="button" aria-label="Abfahrt eine Stunde später" disabled={hour >= 12}
            onClick={() => dispatch({ type: 'SET_DEPARTURE_HOUR', hour: hour + 1 })}>+</button>
  </div>
  {trip.departureHourOverride !== null && (
    <button type="button" className="btn-text" style={{ fontSize: '12.5px' }}
            onClick={() => dispatch({ type: 'SET_DEPARTURE_HOUR', hour: null })}>
      Standard ({params.departureHourAthens}:00)
    </button>
  )}
</div>
```

Rest-trip row:

```tsx
<button type="button" className="trip-row" aria-expanded={expandedDay === s.day}
        onClick={() => setExpandedDay((d) => (d === s.day ? null : s.day))}>
  <span className="tag">Tag {s.day}</span>
  <span className="place">
    {s.kind === 'harbour' ? 'Hafentag: ' : ''}
    {islandWithPlace(snapshot, s.toIslandId, s.placeId)}
  </span>
  {s.day === pickupDayN && <span className="chip">Pickup</span>}
  <span className="verdict">
    <span className={`status-dot ${s.ampel}`} aria-hidden="true" /> {AMPEL_LABEL[s.ampel]}
  </span>
  <span className="chev" aria-hidden="true">›</span>
</button>
{expandedDay === s.day && (
  <div className="trip-row-body">
    <StageCard stage={s} hero={false} … />
  </div>
)}
```

Skeleton (`DayViewSkeleton.tsx`):

```tsx
export function DayViewSkeleton() {
  return (
    <div role="status">
      <span className="visually-hidden">Tagesansicht wird geladen …</span>
      <div aria-hidden="true">
        <div className="skeleton" style={{ height: 20, width: '70%', margin: '12px 0' }} />
        <div className="card-surface" style={{ marginTop: 16 }}>
          <div className="skeleton" style={{ height: 34, width: '55%' }} />
          <div className="skeleton" style={{ height: 96, marginTop: 16 }} />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 48, marginTop: 12 }} />
        ))}
      </div>
    </div>
  );
}
```

### Source tree — CURRENT STATE / CHANGES / PRESERVE per file

**`src/ui/views/DayView.tsx` (1087 lines, post-merge — the merge is today's; read it fully)**
- CURRENT: module head FR21/22/28/29/30; `WindBasis`, `Breakdown` (FR30 table with
  `data-label` stacking), `AMPEL_SYMBOL` (🟢🟡🔴⚪ for `<option>`s), `StageEditor` (island
  select filtered by `reachableIslandIds`, place select w/ night-ampel emoji, Liegezeit
  input + Standard, "Festlegung lösen", error via `.hint-panel`), `StageCard` (versal head,
  serif-ish headline via `stageTitle`, 📌 pin chip, badges incl. Doppelschlag, platz-zeile
  with link button + Vorschlag chip, `rueckweg-zeile` with ⚓/⚠/⛔, reasons, actions
  ".secondary", editor + expanded calc panel StageMap→WindBasis→Breakdown),
  `OPTION_STATE_LABEL`, `AltPreview` (RouteMap + alt-stage list + check-in button; two
  copy mentions of 📌), `OptionRow` (merged Optionsraum: state chip, reach/turn/deadline
  badges w/ `title` tooltips, cost note, reasons, "Route ansehen" → AltPreview),
  `AlternativeRow` (FR2 witness), `DayView` (versal day line + position paragraph +
  `positionNote` hint, assumption `<details class="hint-annahme">`, `.resttrip-banner`
  (verdict labels, Rückkehr-Frist, Umkehrtag/Meltemi-fest badges w/ `title`, reasons+PPR
  with `atBase` suppression), no-main check-in hint, planOutdated hint, "Heute" section w/
  StageCard, "Rest-Trip" section w/ full StageCards, merged "Optionen & Alternativ-Routen"
  section, "Bereits gefahren" badges, two tombstone comments (removed sections), ONE
  APIProvider for the view, `DEMO_MAP_ID` fallback).
- CHANGES: Tasks 4–10 — new section order (status line → day context → [prompt/outdated]
  → hero → info chip → Rest-Trip list card → Optionsraum summary → Bereits gefahren);
  StageCard rebuilt (hero/row variants); banner/details/versal-day-line deleted; all emoji
  meaning carriers replaced; `h1` = hero destination (or prompt headline), section titles
  become `h2.section-title`; badges w/ `title`-only meaning that MOVE into the status
  detail lose the tooltip (content now visible text). Imports: add `useTrip`,
  `dayViewModel` helpers, `stageFrom`, `formatTripDayWeekdayShort`, `PositionPopover`.
- PRESERVE byte-for-byte where possible: `WindBasis`, `Breakdown`, `AltPreview` (except 📌
  copy + button classes), `OptionRow`/`AlternativeRow` internals, `StageEditor` logic
  (only the emoji option labels change), the ONE-APIProvider pattern + `DEMO_MAP_ID`
  fallback, `planOutdated` gating logic, the `atBase` PPR suppression, `stagePoints`/
  `pointNumbers` memos, every `usePlanning()` callback usage, both tombstone comments'
  intent (decisionPoints comment updates: they now render in the status detail).

**`src/app/App.tsx` (331 lines)**
- CURRENT: `ControlsBar` (lines 31–129: Törntag select, position select, "GPS abfragen"
  button, "Manuelle Position lösen", Abfahrt select, gps error styled `var(--rot)` inline),
  `RefreshButton`, `Shell` (header, error panels, `view.kind !== 'platz' && <ControlsBar/>`,
  "Lade Bibliothek und Forecast …" hint, view switch, footer provenance + detail expander),
  `AuthGate`, `App`.
- CHANGES: Task 3 — ControlsBar deleted (its four capabilities relocate: Törntag → popover
  dev select, position/GPS → popover, Abfahrt → hero stepper); GPS auto-effect; skeleton
  branch; `role="alert"` on both error panels; stale prefix on the provenance text (import
  `staleForecastLabel`). `getCurrentGpsPosition` import stays (effect); `useTrip` import
  stays (effect); remove imports that die with ControlsBar if any become unused
  (`noUnusedLocals`).
- PRESERVE: `View` union + `activeTab` derivation, header/footer from story 1.1, provider
  nesting, `queryClient`, the platz-view gating shape (the skeleton/hint replaces only the
  loading branch).

**`src/ui/styles.css` (1669 lines)**
- CURRENT: 1.1 token layer + aliases + primitives at top; legacy day-view sections
  (`.card`, `.versal`, `.controls`, `.error-panel`/`.hint-panel` legacy recipes,
  `.resttrip-banner`/`.resttrip-head`, `.stage-*`, `.breakdown*`, `.wind-basis*`,
  `.option-*`/`.alt-*`, `.hint-annahme`/`.badge-annahme`, `.past-list`, `.ampel` bare
  recipe, `.state-chip` + state tints w/ stray hexes).
- CHANGES: Task 2 — add the new blocks above; restyle `.ampel`, `.error-panel`,
  `.hint-panel`; delete `.controls` (5 rules), `.resttrip-banner`+modifiers,
  `.resttrip-head`, `.hint-annahme`; conditional deletes per grep (`.options-grid`,
  `.stage-card.today`, `.stage-head`, `.past-list` if DayView no longer uses them and no
  other view does).
- PRESERVE: everything MapView/PlaceDetailView/SignInView/StageMap/Breakdown reference —
  incl. `.versal`, `.card`, `.badge*`, `.state-chip`, `.breakdown*` + the ≤700px stacking,
  `.wind-basis*`, `.stage-map*`, `.alt-*`, `.option-*`, `.leg-chip`, `.reasons`,
  `.lesehilfe`, `.badge-annahme`, `.pin-chip`/`.suggestion-chip` (still used by chips? if
  replaced by `.chip`, delete after grep), both media queries.

**New files:** `src/ui/dayViewModel.ts`, `src/ui/__tests__/dayViewModel.test.ts`,
`src/ui/components/PositionPopover.tsx`, `src/ui/components/DayViewSkeleton.tsx`.

**Small edits:** `src/ui/stageText.ts` (+`stageFrom`), `src/ui/__tests__/stageText.test.ts`
(append cases only), `src/ui/format.ts` (+`formatTripDayWeekdayShort`),
`src/ui/components/AmpelBadge.tsx` (export the `LABELS` map as `AMPEL_LABEL`; component
markup unchanged — keep its `title` for now).

**Untouched (verify by diff):** everything under `src/domain/` and `src/adapters/`
(`geolocation.ts` is only CONSUMED), `src/app/tripContext.tsx` (all needed actions exist),
`src/app/usePlanning.ts`, `src/app/planningContext.tsx`, `src/app/authContext.tsx`,
`src/ui/views/MapView.tsx`, `src/ui/views/PlaceDetailView.tsx`, `src/ui/views/SignInView.tsx`,
`src/ui/components/{StageMap,RouteMap,WindBarb,Polyline,AvatarMenu,SeamarkLayer}.tsx`,
`src/ui/tokens.ts`, `src/ui/mapPath.ts`, `index.html`, all configs, all existing tests.

### Accessibility floor for this story's surfaces

- `aria-expanded` on EVERY expander trigger: status line, rest-trip rows, "Alle N Tage
  anzeigen", Optionsraum summary, info chip, "Bereits gefahren", calc-panel ghost button,
  position-popover trigger (+`aria-haspopup="dialog"` optional). `aria-controls` where the
  region is not DOM-adjacent.
- Status-line expander: Esc inside closes + returns focus to the trigger; no trap, no
  backdrop. Popover (position control): focus in on open, trap while open, Esc/backdrop/
  trigger close, focus returns — the AvatarMenu implementation is the pattern to copy.
- Error panels `role="alert"`; hint panels without it; GPS denial is a HINT.
- Focus after whole-plan re-render → status-line trigger (AC 3); `aria-live="polite"` on the
  status-line wrapper (verdict + staleness announce).
- One `h1` per view: hero destination / Hafentag headline / prompt headline. Section titles
  are real `h2.section-title`.
- ≥44px: rows, chevron rows, stepper buttons, edit affordance, info chip, berth line.
- 16px input font floor global (iOS zoom).
- German accessible names: "Position bearbeiten", "Abfahrt eine Stunde früher/später".
- No emoji as meaning: 🟢🟡🔴⚪ (editor options), 📌 (pin chip + copy), ⚓/⚠/⛔
  (rueckweg-zeile) all become words. Decorative glyphs (`›`, `✎`, `i`) are `aria-hidden`
  inside labeled controls.
- No NEW `title` tooltips. Tooltips whose content this story surfaces as visible text
  (Umkehrtag, Meltemi-fest) die with their badges.

### Testing rules

- vitest, **node environment** — no DOM, no component tests (AD-2). New tests only for the
  pure helpers (`dayViewModel.test.ts`, `stageText` additions). Build fixtures as plain
  object literals typed as the domain interfaces (see `stageText.test.ts` for the pattern);
  do not import React or render anything.
- Boundary cases that MUST be covered: stale exactly at TTL (fresh), 1 ms over (stale, "vor
  1 h" after 1 h+), hero-switch with null island / harbour day / missing N+1, optionsSummary
  with all-`zu` and with `closesOnDay: null` entries, pickupDay on the trip's first/last day.
- `npm test` and `npm run build` must both pass; do not modify `vitest.config.ts`.

### DoD greps (run from repo root)

Every grep in the first block must return NOTHING:

```bash
# dead components / classes / strings:
grep -rn 'ControlsBar' src/
grep -rn 'resttrip-banner\|resttrip-head\|hint-annahme' src/
grep -rn 'Lade Bibliothek und Forecast' src/
grep -rn 'AMPEL_SYMBOL' src/
grep -n '^\.controls' src/ui/styles.css
# emoji as meaning carriers out of the rebuilt surfaces:
grep -rn '🟢\|🟡\|🔴\|⚪\|📌\|⚓\|⚠\|⛔' src/ui/views/DayView.tsx src/app/App.tsx
# Törntag control no longer at app level (popover dev select lives in PositionPopover):
grep -n 'Törntag' src/app/App.tsx
```

This check must print OK — DayView keeps at most AltPreview's two `.versal` day tags
(sanctioned exception; calc/preview content is out of scope):

```bash
test "$(grep -c 'versal' src/ui/views/DayView.tsx)" -le 2 && echo OK
```

Exception rule, stated for the record: `.versal`, `.card`, `.badge`, `.state-chip` etc.
remain in styles.css for the views this story does not touch; `AltPreview`'s two `.versal`
day tags inside the preview list are sanctioned (calc/preview content is out of scope).

### Project Structure Notes

- New: `src/ui/dayViewModel.ts`, `src/ui/__tests__/dayViewModel.test.ts`,
  `src/ui/components/PositionPopover.tsx`, `src/ui/components/DayViewSkeleton.tsx`.
- Modified: `src/ui/views/DayView.tsx`, `src/app/App.tsx`, `src/ui/styles.css`,
  `src/ui/stageText.ts`, `src/ui/__tests__/stageText.test.ts` (append only),
  `src/ui/format.ts`, `src/ui/components/AmpelBadge.tsx` (label export only).
- Layering intact: helpers in `ui/` import only `domain/`; components import `app/` context
  hooks exactly as the existing views do; nothing in `app/` or `domain/` imports `ui/` state.

### References

- **DESIGN.md (BINDING, final):**
  `_bmad-output/planning-artifacts/ux-designs/ux-sailgreece-router-2026-08-05/DESIGN.md` —
  frontmatter `components.*`: status-line, warn-note, stat-tile, chip, info-chip, popover,
  select, stepper, skeleton, card, ampel-badge; § Colors (accent-text rules, Gelb graphic
  variant, contrast honesty — the 19px/700 CTA size is load-bearing); § Typography (display/
  overline/micro-label/caption roles, tabular numerals); § Components (composed surfaces:
  StageCard hero + Hafentag variant + row variant, berth line, position control,
  StageEditor, error/hint panels); § Do's and Don'ts (no bare dots, no emoji semantics, one
  primary per card).
- **EXPERIENCE.md (BINDING, final):** same folder — § IA "Tagesansicht section order" (the
  9-item order this story implements) + hero-switch rule; § Voice and Tone (copy table,
  verdict—reason phrasing, "Umkehrtag" vocabulary note); § Component Patterns rows: Trip
  status line, StageCard (hero/Hafentag/row), StageEditor, Position control, Info chip,
  Skeleton; § State Patterns (cold load, empty Optionsraum, no main route, no valid round
  trip, stale forecast, GPS denied, error-vs-hint split); § Interaction Primitives (expander
  + popover contracts, focus-after-re-render, reduced motion); § Accessibility Floor;
  § Open Questions 5 (OQ5 — departure/position controls, still open).
- **Mockup:** `…/mockups/direction-consumer-warm.html` — status line (l. 102–112, 243–246),
  day context (114–117, 248–251), hero + stats + berth + CTAs (119–166, 253–279), assumption
  chip (168–178, 281), rest-trip rows + Optionsraum summary (180–200, 283–299), gelb variant
  with warn-note (310–366).
- **Story 1.1:** `_bmad-output/implementation-artifacts/1-1-design-tokens-and-two-line-header.md`
  — token tables, primitive CSS, AvatarMenu pattern, Dev Agent Record (real `--header-h` =
  120px), its deferred-to-this-story list (stale escalation, 16px inputs, DayView headings).
- **Architecture:** `…/architecture-sailgreece-router-2026-07-30/ARCHITECTURE-SPINE.md` —
  AD-2 (assessment purity / no UI tests), AD-3 (one snapshot in, one assessment out), AD-7
  (STALE_TIME_MS = FR13 TTL), AD-11 (in-memory views, manual-position precedence), AD-12
  (one mutation path — reuse trip actions), AD-13 (assumption marking).
- **PRD:** `…/prd-sailgreece-router-2026-07-30/prd.md` — FR18 (rest-trip validity + least-
  violating proposal), FR19 (Rückkehrfenster/PoR), FR20 (decision points — re-surfaced by
  this story), FR21 (today's stage, no header route select), FR22 (active proposal), FR27
  (GPS auto at start, no button), FR28/FR29 (edit/check-in), FR30 (calc transparency), FR31
  (guest pickup hard condition), FR32 (Törntag from date, no select).
- **Code ground truth (read 2026-08-05, post-merge `10a3bdf`):** `src/ui/views/DayView.tsx`,
  `src/ui/stageText.ts`, `src/app/App.tsx`, `src/app/tripContext.tsx`,
  `src/app/usePlanning.ts`, `src/adapters/geolocation.ts`, `src/domain/schema/snapshot.ts`,
  `src/domain/schema/params.ts` (pickup fields), `src/domain/time.ts` (`tripDayForDate`),
  `src/ui/styles.css`, `src/ui/format.ts`, `src/ui/components/AmpelBadge.tsx`,
  `src/ui/components/AvatarMenu.tsx` (popover pattern).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
