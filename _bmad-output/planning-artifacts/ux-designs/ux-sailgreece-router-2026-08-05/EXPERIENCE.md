---
name: SailGreece Router
status: final
updated: 2026-08-05
sources:
  - _bmad-output/planning-artifacts/prds/prd-sailgreece-router-2026-07-30/prd.md
  - _bmad-output/planning-artifacts/briefs/brief-sailgreece-router-2026-07-30/brief.md
  - _bmad-output/planning-artifacts/architecture/architecture-sailgreece-router-2026-07-30/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/research/technical-windy-api-google-maps-stack-research-2026-07-30.md
---

# SailGreece Router — Experience Spine

> Brownfield UI redesign of the implemented German-language planning app. Paired with `DESIGN.md` (same folder). Current-state ground truth: `.working/ui-inventory-ist-zustand.md` and `imports/screenshot-mobile-tagesansicht-ist-zustand.png`; chosen visual direction: `mockups/direction-consumer-warm.html`. Spine wins on conflict with any of these.

## Foundation

Mobile-first responsive web app (React 19 + Vite, hand-rolled CSS — no UI system; `DESIGN.md` is the complete visual identity reference and its tokens are the only styling vocabulary). Primary viewport ≈390px (iPhone in the cockpit); desktop is the secondary pre-trip planning surface up to {spacing.content-max}. [ASSUMPTION] Mobile-first priority per memlog, not yet explicitly confirmed by Philipp.

German is the product language (`lang="de"`); light theme only ([ASSUMPTION], see DESIGN.md). Internet connection assumed (NFR2) — offline is a degraded state to communicate, not a feature. No router (AD-11): view switching is in-memory state — no URLs, no deep links, browser Back leaves the app. Tabs must therefore never look like links, and every drill-down (Platzdetail) needs an explicit in-app "← Zurück" path.

The app is "PWA-ish" only in hygiene: `theme-color` matching {colors.surface-page}, favicon, `meta description` (all missing today). No service worker, no install prompt in this redesign. [ASSUMPTION]

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Sign-in | Unauthenticated app open | Google sign-in gate (mandatory) |
| App shell | Post-auth | Two-line header, view switching, footer provenance |
| Tagesansicht ("Heute") | Default view / tab | "Was fahre ich heute?" — today's stage, rest-trip, options (UM-1/UM-2, FR21) |
| Karte | Tab | Round-trip overlay, wind barbs, itinerary↔map sync (FR1–FR4) |
| Platzdetail | Berth links, map pins, rest-trip rows | One place ("Platz" per PRD glossary; code: `PlaceDetailView`): photo, night Ampel, qualities, shelter profile (FR5) |

**Two-line header** (the whole chrome, replacing the current screen-filling topbar + notice-bar + ControlsBar):

- Line 1: wordmark left · avatar right (opens avatar menu with "Abmelden" — no wide sign-out button).
- Line 2: segmented tabs "Heute" / "Karte" left · refresh glyph right.
- Nothing else. No date range, no provenance, no Törntag select (FR32: the app derives the day from the date), no GPS button (FR27: position is queried automatically at app start).

**Provenance and notices** live at the edges: weather-model provenance (model, run, fetched-at) is exclusively the footer {components.provenance-line} with refresh affordance and a popover for detail. The forecast-assumption notice ("Ab Tag N beruht die Planung auf einer Annahme") is an {components.info-chip} below the hero card opening a popover — never a banner.

**Tagesansicht section order** (today dominates; FR21):

1. {components.status-line} — compact round-trip status (verdict + return deadline + Meltemi-fest day), subordinate by size, superior by position. Tap opens the detailed rest-trip verdict (reasons, "Spätester Umkehrtag", FR19/FR20) as an expander.
2. Day context — "Tag 1 · Samstag, 8. August" kicker + "Position: Marina Alimos" with edit affordance ([ASSUMPTION] position override + "GPS erneut abfragen" live behind this affordance as a popover, replacing the ControlsBar).
3. **Hero StageCard (Heute)** — destination in {typography.display}, {components.ampel-badge}, warn note when Gelb/Rot, stat grid (Abfahrt · Fahrtzeit · Ankunft · Wind), berth line, primary CTA "Etappe ändern" + ghost "Wie kommt die Zeit zustande?" (FR30). On a **Hafentag** the hero switches to the calm Hafentag variant (see Component Patterns) — never empty stat tiles.
4. Forecast-assumption info chip (only when the horizon is exceeded).
5. **Rest-Trip** — list card, first 2–3 days as rows (day · destination · Ampel dot + verdict word · chevron, e.g. "Tag 4 · Serifos · Gelb ›"), then "Alle 12 Tage anzeigen" expander. Collapsed by default. The Gäste-Pickup day (FR31) carries a "Pickup" text chip on its row, naming the proposed pickup harbor in the expanded card.
6. **Optionsraum** — one summary row collapsed by default ("3 Optionen offen · Nächste Deadline: Tag 4"), expanding to {components.chip}-stated OptionRows (FR18/FR20).
7. **Alternativ-Routen** — behind a tap inside the expanded Optionsraum area (FR29). Collapsed by default.
8. **Bereits gefahren** — collapsed chip list at the end.
9. Footer: {components.provenance-line}, Open-Meteo attribution, seamanship disclaimer (NFR3).

**Hero-switch rule:** the hero shows today's stage until the confirmed position equals today's destination (after a check-in or the evening refresh); from then on it shows Tag N+1 — tomorrow's decision is the open one.

**Karte layout** (adopted reference: `mockups/keyscreen-karte-consumer-warm.html` — this mock is binding for the Karte composition): on mobile (≤860px) the map is **full-bleed** and the itinerary rides on it as a **bottom sheet** — drag handle, ~1.5 stage cards peeking, pull up for the full list. Layer controls are two floating chips on the map ("Windfiedern", "Alternativen") instead of a toggle panel; the legend lives in a popover behind a small "i" affordance (content: Hinweg-blue and Rückweg-magenta line swatches, solid = gefahren / dashed = geplant, the rest-trip Ampel badge, plus the wind-barb scale — line-color semantics per DESIGN.md.Map & routes: direction, never verdict; supersedes the mock's gray "Annahme" leg and Ampel-hue planned legs). The trip status line (one-line verdict) renders at the head of the itinerary — sheet head on mobile, list head on desktop — so the round-trip verdict is never color-only on the map surface. ≥861px: sticky split (itinerary list left, map right), bidirectionally synced per FR4, same chips + legend popover on the map.

## Voice and Tone

Microcopy rules — seemannschaftlich-sachlich, kurz. The app computes and compares; it never cheers, never dramatizes. No exclamation marks in warnings, ever.

| Do | Don't |
|---|---|
| "Grün — Etappe im Ziel-Budget." | "Perfekter Segeltag! 🌊" |
| "Böen bis 28 kn am Kap — Abfahrt vor 10:00 empfohlen." | "Achtung!! Starkwind!" |
| "Kein gültiger Round-Trip — Vorschlag mit der geringsten Verletzung. Verletzt: Tagesbudget Tag 6." | "Fehler in der Routenplanung" |
| "Keine Optionen mehr offen — Rückweg fixiert." | (section silently hidden) |
| "Forecast: ECMWF · Lauf 05.08. 09:00 · abgerufen 16:19" | "Daten evtl. veraltet?" |
| "Ab Tag 7 beruht die Planung auf einer Annahme." | A shouting full-width banner of the same sentence |

Ampel verdicts are phrased as **verdict — reason**: the color word first ("Gelb"), then the single decisive reason in one clause. Reasons name the constraint in sailing terms (kn, TWA, Tagesbudget, Rückkehrfenster), not engine internals. Deadlines are always phrased as Törntag ("bis Tag 4"), with the calendar date in parentheses where space allows. Buttons are verb-first infinitives: "Etappe ändern", "Route ansehen", "Als Hauptroute übernehmen", "Aktualisieren", "Abmelden".

**Vocabulary note:** the PRD concept is the **Point of Return (Umkehrpunkt)**; "Umkehrtag" / "Spätester Umkehrtag" in the UI are the same concept expressed as a Törntag ("Spätester Umkehrtag: Tag 6" = the Umkehrpunkt falls on Tag 6). One concept, these two phrasings only — no third coinage.

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
|---|---|---|
| Two-line header | Shell | Sticky, with `scroll-margin-top` ≥ header height on every focusable element so keyboard focus is never obscured (SC 2.4.11). Tabs are plain buttons with `aria-current="page"` on the active view (not a `tablist`); they switch views instantly (in-memory, AD-11). Refresh glyph triggers forecast refetch; spins while pending (static glyph swap under reduced motion); disabled state per DESIGN.md while a fetch runs. |
| Avatar menu | Shell | Tap avatar → menu on Level-3 elevation (name, e-mail, "Abmelden"). Esc/backdrop-tap closes. Full name lives here — never truncated in the header. |
| Trip status line | Tagesansicht top + Karte itinerary head | Always present once a plan exists. Tap → rest-trip detail (reasons list, Spätester Umkehrtag, Meltemi-fest bis) as an **expander** (contract in Interaction Primitives). Never grows into a banner. After any whole-plan re-render, focus lands here and the new verdict is announced (`aria-live`). |
| StageCard (hero) | Tagesansicht §3 | Today's stage, always expanded. "Etappe ändern" opens StageEditor in place; ghost button expands the calc panel (StageMap + wind basis + breakdown, FR30) — collapsed by default. |
| StageCard (hero, Hafentag) | Tagesansicht §3 on harbour days | Calm variant: "Hafentag in ⟨Ort⟩" headline, berth line + Nacht-Ampel badge, pointer to the next sailing day ("Weiter am Mi: Syros → Paros"). No Abfahrt/Wind stat tiles, no "Etappe ändern" CTA — the day has no leg to edit. Visual spec in DESIGN.md composed surfaces. |
| StageCard (row) | Rest-Trip list | Collapsed row: day, destination, Ampel dot **+ verdict word** ("Tag 4 · Serifos · Gelb ›"), chevron. Pickup day carries a "Pickup" chip (FR31). Tap expands to the full card (berth line, badges, actions); tap again collapses. Only one expanded at a time. |
| StageEditor | From StageCard | Inline form: island select (range-filtered), berth select (labels with Ampel word, no emoji), Liegezeit stepper with "Standard" reset, "Festlegung lösen", "Schließen". Every control has a **visible, programmatically associated label**. The stepper is a labeled group ("Liegezeit") with named buttons ("Liegezeit verringern" / "Liegezeit erhöhen") and the value announced on change. Solver runs on apply (FR28) — button shows pending state; result re-renders the whole plan (focus → trip status line). Errors render inside the editor as an error panel, not a hint — linked to the failing control via `aria-describedby`, and focus moves to the error on a failed apply. |
| OptionRow | Optionsraum | State chip (offen / offen · Vorbehalt / schließt Tag X / geschlossen), reach + Umkehrtag + deadline as text chips, Ampel badge, cost note, reasons behind an expander. "Diese Option verfolgen" = secondary button. Closed options stay listed, dimmed, never hidden. |
| AlternativeRow | Alternativ-Routen | Colored dot in its {colors.alt-route-1}…{colors.alt-route-3} identity, turn point, leg chips. "Route ansehen" expands RouteMap + day list; "Als Hauptroute übernehmen" is the explicit check-in (FR29) with pending state and confirmation via re-rendered plan (focus → trip status line). |
| Ampel badge | Everywhere | Always dot + text. Same component for stage, place, option, night verdicts — one implementation, one palette. |
| Berth line | StageCard, Platzdetail | Inset row: anchor meaning carried by text ("Liegeplatz"), place name is a text-link into Platzdetail — and the **whole row is the tap target** (wet-thumb reach; the link stays for semantics). Ampel badge right. "Vorschlag" chip when app-suggested. |
| Info chip + popover | Assumption notice, wind reading aid, column semantics | Tap/click opens popover; Esc, backdrop tap, and the chip itself close it. One popover at a time. All legacy `title`-tooltips migrate here or into expanders — no meaning may remain hover-only. |
| Position control | Day context | GPS queried automatically at app start (FR27). Edit affordance opens popover: place select, "GPS erneut abfragen", "Manuelle Position lösen". GPS denial → inline hint inside the popover + place select as fallback, never a blocking error. |
| Refresh + provenance | Footer | Refresh re-fetches forecast (FR13); provenance text updates via `aria-live="polite"`. Tap on the provenance text opens popover with model, run, fetch time, cache TTL. |
| Map↔list sync | Karte | Hover (desktop), tap (touch), *and keyboard focus* on an itinerary card highlight the corresponding stage/pin; first tap on a map pin highlights its card (scroll-into-view) **and reveals a mini label chip with the verdict word**, second tap opens Platzdetail. For keyboard/AT a **single activation** (Enter/Space) opens Platzdetail directly — the two-step dance is a fat-finger guard, touch-only; focus alone triggers the highlight. Highlight = thicker line + Level-1 lift, plus non-color cue (weight). |
| Map marker | Karte, StageMap | Visual anatomy in DESIGN.md (Ampel dot + white casing ring, {rounded.sm} stage-number capsules). Keyboard-operable (`role="button"`, `tabIndex=0`); accessible name is always "Ort + Ampel-Wort" ("Loutra — Grün"); focus renders the two-layer ring around the marker. |
| Platzdetail | From berth lines, map pins, rest-trip rows | Visual reference: `mockups/keyscreen-ortsdetail-consumer-warm.html` (adopted); spec in DESIGN.md composed surfaces. Hero ladder degrades photo → satellite fallback → gradient fallback + "Kein Foto verfügbar" chip — never a broken-image hole. Qualitäten are 5-dot ink meters with text value ("4 von 5") and `aria-label` ("Schutz: 4 von 5") — never Ampel/coral. Schutzprofil sector grid: Ampel tint + sector word per sector; wave values de-emphasized as non-scoring; source footnote required. "← Zurück" returns to the exact prior scroll state (AD-11). |
| Breakdown table | StageCard calc panel | 9-column table ≥701px with `overflow-x: auto` inside the card; stacked label/value rows ≤700px. Header row in {colors.ink-secondary}. Column semantics (TWA, Kurs …) explained via one info chip above the table, not per-cell tooltips. |
| Skeleton | All surfaces | Per-section skeletons in final layout (status line, hero card, 3 list rows; map surface gets a flat {colors.surface-track} block with centered caption "Karte lädt …"). |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold load | Tagesansicht | Section skeletons per `DESIGN.md.Components.skeleton`. No global "Lade Bibliothek und Forecast …" text. |
| Auth check | Shell | Single centered card "Anmeldung wird geprüft …" reusing the sign-in card layout (one implementation, not two). |
| Sign-in config error | Sign-in | Missing Firebase env → named error panel in place of the button ("Anmeldung nicht konfiguriert."), no bypass. |
| Sign-in failed | Sign-in | Error panel below the button with retry; the Google button never disappears. |
| Solver pending (check-in / edit) | StageCard, OptionRow, AlternativeRow | Triggering button enters pending state (spinner replaces label, stays sized); affected sections dim to 60% opacity. No full-screen blocker. |
| Empty Optionsraum | Optionsraum | Explicit content: "Keine Optionen mehr offen — Rückweg fixiert." with caption explaining the consequence. Never a hidden section. |
| No main route yet | Tagesansicht | Check-in prompt card: headline "Noch keine Hauptroute festgelegt.", body naming the app's proposal, primary button "Vorschlag übernehmen" (FR22). |
| No valid round trip | Trip status line + hero | Status line Rot: "Kein gültiger Round-Trip — Vorschlag mit der geringsten Verletzung." Named violated condition + relaxation order visible in the rest-trip detail (FR18). A violated Gäste-Pickup (FR31) is named as such: "Verletzt: Gäste-Pickup Tag 8 — kein erreichbarer Pickup-Hafen im Fenster." |
| Stale forecast | Status line + footer | If fetched-at is older than the cache TTL (FR13): the **trip status line** gains a leading "Stand vor 4 h" segment in {colors.ampel-gelb-text} with a Gelb dot ({colors.ampel-gelb-graphic}), announced via its existing `aria-live="polite"` — staleness is always visible **above the fold** on Tagesansicht. The provenance line's age note is set in {colors.ampel-gelb-text} and the refresh affordance becomes primary-toned. Data age always visible, judgment left to the skipper. |
| Offline / fetch failed | Tagesansicht | Error panel (see below) "Forecast nicht erreichbar — Anzeige beruht auf dem Lauf von 09:00." Last snapshot stays fully usable; retry button in the panel. |
| Plan unreadable (AD-12) | Tagesansicht | Named error panel "Gespeicherter Plan nicht lesbar." with explicit recovery action — never a silent reset. |
| GPS denied | Position popover | Hint (not error): "Kein GPS-Zugriff — Position manuell wählen." + place select. |
| Maps key/script missing | Karte | Itinerary list renders fully; map area shows hint panel "Karte nicht verfügbar." No demo-map fallback: missing `mapId` is a build error, not a silent `DEMO_MAP_ID`. |
| Place unbewertet / invalid | Platzdetail | Ampel badge "Unbewertet" + copy "Keine kuratierten Schutzdaten — konservativ behandeln." (NFR6). Invalid place: error panel + "← Zurück". |
| Disabled | Any control | Per DESIGN.md disabled spec; disabled refresh shows why via adjacent caption ("Aktualisierung läuft …"). |

**Error vs hint separation** (fixes the current dual-use `.hint-panel`): *error panels* ({colors.ampel-rot-tint} surface, {colors.ampel-rot-text} text, `role="alert"`) for failures blocking an action; *hint panels* ({colors.surface-track} surface, {colors.ink-secondary} text) for guidance and fallbacks. One component each, never interchanged.

## Interaction Primitives

- Tap targets ≥44×44px everywhere — including list rows, chevrons, the refresh glyph, stepper buttons, map pins.
- `:focus-visible` two-layer indicator on every interactive element, exactly as specified in DESIGN.md.Colors ("Focus indicator"). Zero focus styling exists today; this is a floor, not polish.
- **No hover-only meaning.** Every current `title` tooltip (Doppelschlag, "Meltemi-fest bis", "Spätester Umkehrtag", breakdown column semantics) gets a touch path: info chip, popover, or expander. Hover may *preview* (map sync), tap *and keyboard focus* must *reach*.
- Expanders: **every expander trigger carries `aria-expanded`** (+`aria-controls` where the region is not adjacent in the DOM); the chevron rotation is the visual mirror of that attribute. Region animates ≤200ms; expanded state is per-item; today's hero never collapses. The rest-trip detail behind the trip status line follows this same contract: it is an expander (not a sheet) — trigger toggles `aria-expanded`, the region grows in place below the status line, Esc while focus is inside closes it and returns focus to the status line, no focus trap, no backdrop.
- Popovers: one at a time; Esc, backdrop tap, and toggle close; focus returns to the trigger.
- **Focus after plan re-render:** whenever the solver re-renders the whole plan (StageEditor apply, "Als Hauptroute übernehmen", refresh with verdict change), focus moves to the trip status line, which announces the new verdict — never silently to `<body>`.
- **Reduced motion (global):** `prefers-reduced-motion` disables *all* non-essential animation — expander transitions, skeleton opacity pulse, refresh-glyph spin, pending spinners. Pending states fall back to the already-specified text ("Aktualisierung läuft …") and a static glyph swap.
- Map: pinch/drag native; pins tap-to-highlight then tap-to-open (touch; single activation for keyboard/AT — see Component Patterns); no double-tap-dependent actions.
- **Banned:** fat notice banners, hover-only affordances, emoji as semantics, modal-on-modal, carousels, celebratory animation on green verdicts.

## Accessibility Floor

Behavioral; contrast pairs live in `DESIGN.md.Colors`.

- Heading hierarchy repaired: the shell owns one `h1` per view (visually the day headline on Tagesansicht, the place name on Platzdetail; the Karte view's `h1` "Karte" has no visible slot in the full-bleed layout and is **visually hidden**); section titles are real `h2` styled as {typography.overline}, not spans.
- Landmarks: `header` (banner: wordmark + tabs), `nav` (the tab row), `main` (one per view), `footer` (contentinfo: provenance + disclaimer).
- Map pins, stage-number markers, and stage-map labels are keyboard-operable: `role="button"`, `tabIndex=0`, Enter/Space activate (single activation opens Platzdetail), two-layer focus ring visible on the marker; accessible names are always "Ort + Ampel-Wort" ("Loutra — Grün").
- `aria-live="polite"` on provenance/refresh updates and the trip status line; `role="alert"` on error panels; `role="status"` on solver-pending notes.
- Never color-only status: Ampel always carries its text label (or is adjacent to it); option states are chips with words; highlighted map lines also change weight.
- Touch targets and focus order follow reading order; the avatar menu and popovers trap focus while open.
- All quantitative abbreviations get `abbr`/full text once per surface (kn, sm, TWA) via the reading-aid popover.
- `lang="de"` throughout; icons are decorative (`aria-hidden`) because text always carries the meaning.

## Forecast Trust & Provenance

The product's credibility pattern (FR13, FR30, NFR5): the skipper must always be able to answer "how fresh is this, and where does the number come from?" — without the answer shouting at him.

- **Data age**: provenance footer on every view; age escalates visually only when stale (see State Patterns). The header never carries provenance.
- **Calculation transparency**: every duration is explainable in ≤2 taps — hero stat → ghost button "Wie kommt die Zeit zustande?" → calc panel (segments, wind, TWA, polar speed; sail vs total time separated).
- **Horizon honesty**: stages beyond the forecast horizon are "unbewertet" and options "offen · Vorbehalt"; the assumption info chip states the boundary day. The popover explains the Meltemi worst-case assumption (FR19) in one sentence.
- **Snapshot semantics**: after every refresh the whole plan re-renders from the new snapshot (FR18); if the verdict changed, the trip status line announces it (aria-live) — no diff view, the morning/evening routine *is* the diff.
- The seamanship disclaimer (NFR3) lives once, in the footer, in {typography.footnote}.

## Responsive & Platform

| Breakpoint | Behavior |
|---|---|
| ≤700px | Breakdown table stacks to label/value rows (`data-label` pattern). Base mobile layout, {spacing.page-margin} side margins. |
| ≤860px | Karte goes full-bleed map with the itinerary as a bottom sheet (drag handle, ~1.5 cards peeking — see IA, Karte layout). |
| ≥861px | Karte becomes sticky split (list ↔ fixed map). Tagesansicht stays single-column, centered, max ~720px reading width. [ASSUMPTION] |
| ≤{spacing.content-max} | Shell content max-width 1280px, centered. |

iPhone specifics: `viewport-fit=cover` with `env(safe-area-inset-*)` padding on header and footer (home-indicator clearance); 16px minimum input font-size to prevent iOS zoom; sticky header respects the notch. Primary design viewport 390×844.

## Inspiration & Anti-patterns

- **Lifted from Airbnb** (Philipp's explicit quality benchmark): white card language, soft layered elevation, pill CTAs, segmented controls, calm confidence.
- **Lifted from booking confirmations**: the hero stage card reads like a confirmation — destination big, verdict immediate, logistics in tiles.
- **Kept from the legacy Y.CO register (NFR1)**: day-by-day structure, sticky split map layout, whitespace discipline. **Rejected from it**: creme/navy palette, serif headlines, letterspaced-caps voice.
- **Rejected directions** (rendered in `.working/`): `direction-yacht-brochure.html`, `direction-cockpit-instrument.html`, `direction-editorial-minimal.html` — Philipp chose Consumer Warm.
- **Rejected patterns**: provenance in the hero (demoted to footer), fat assumption banners (info chip), wide Abmelden button (avatar menu), emoji as status (Ampel badges), meaning in `title` tooltips (popovers/expanders), route-option header select (there is one Hauptroute, FR21).

## Key Flows

### Flow 1 — "07:00 im Cockpit" (Philipp, morning glance, UM-1)

1. Philipp opens the app on his iPhone at anchor. Position resolves via GPS automatically (FR27); the Törntag comes from the date (FR32).
2. Skeletons resolve top-down; the header stays two lines, no chrome to parse.
3. He reads the trip status line: "Round-Trip trägt · Rückkehr Alimos bis Tag 11" — green dot, one line.
4. The hero card: "Kythnos, Loutra · über Kap Sounion", Ampel "Grün", stats 12:00 / 5,5 h / ca. 17:30 / NNE 18 kn, berth line green.
5. **Climax (<10 seconds after open):** green light for today's leg — destination, verdict, departure readable in one glance without scrolling. He shows the phone to the crew; the decision is made over coffee.
6. Optional: he taps "Wie kommt die Zeit zustande?" once to sanity-check the 5,5 h against the polar breakdown (FR30), then collapses it.

Failure path: forecast fetch fails → the last snapshot stays usable, error panel names the failure, provenance shows the age ("Stand vor 9 h"); Philipp cross-checks Windy (NFR3) and retries later.

### Flow 2 — "Der Meltemi frischt auf" (Philipp, yellow day, decision on the Umkehrtag)

1. Evening refresh (UM-2): the trip status line turns yellow — "Round-Trip unter Vorbehalt · Rückkehr Alimos bis Tag 11 · Meltemi-fest bis Tag 4".
2. The hero card for tomorrow shows Ampel "Gelb" with the warn note "Böen bis 28 kn am Kap — Abfahrt vor 10:00 empfohlen."
3. He taps the status line: rest-trip detail opens — reasons, "Spätester Umkehrtag: Tag 6" (FR19), decision points (FR20).
4. He expands the Optionsraum: "Amorgos-Verlängerung — schließt Tag 4", "Westkykladen konservativ — offen". Each option shows reach, Umkehrtag, and cost in text chips.
5. He opens Alternativ-Routen, views the conservative alternative on the RouteMap, compares day lists.
6. **Climax:** the decision crystallizes on one screen — hold the main route until Tag 4 (the deadline is explicit), knowing which option dies that day and what the fallback costs. He taps "Diese Option verfolgen" on the Amorgos option to keep it visible, and sleeps on it.
7. Next morning, if the window holds, he checks in the alternative via "Als Hauptroute übernehmen" (FR29) — solver pending state, then the whole plan re-renders and the status line confirms the new verdict.

Failure path: no valid round trip remains → status line turns red, the app still proposes the least-violating plan and names the violated condition (FR18); the relaxation order is visible; the 65°/25-kn threshold is never relaxed.

### Flow 3 — Evening berth check (Philipp, before dinner, UM-2 tail)

1. After the evening refresh confirms the course, one question remains: does tonight's (or tomorrow's) berth hold?
2. From the hero card's berth line, he taps the row ("Loutra — Gemeindekai") → Platzdetail.
3. Hero photo (or satellite fallback), then Nacht-Ampel: "Grün — geschützt bei N–NE bis 30 kn", max wind/wave for the night window (FR8), reasons.
4. He scans Qualitäten (Schönheit, Restaurant, Badestrand) and the Schutzprofil sector table — wave rows visibly de-emphasized as non-scoring.
5. **Climax:** the night verdict is green with the protecting sector named — he can defend the choice to the crew in one sentence, and the anchor watch question is settled.
6. "← Zurück" returns to the Tagesansicht exactly where he left it (in-memory state, AD-11).

Failure path: the place is unbewertet (NFR6) → badge "Unbewertet" with conservative copy; he picks an alternative berth from the island's place list or checks sources himself.

### Flow 4 — "Eine Etappe umbauen" (Philipp, stage edit, UM-1 tail, FR28)

1. The morning verdict is Gelb and Philipp wants to shorten today's leg. On the hero StageCard he taps "Etappe ändern" — the StageEditor opens in place.
2. He picks a nearer island in the (labeled) island select; the berth select re-filters and he chooses "Merichas — Grün".
3. He taps apply: the button enters pending state (label swaps to spinner — static text under reduced motion), the affected sections dim; the solver reruns (FR28).
4. **Climax:** the whole plan re-renders from the new stage — focus moves to the trip status line, which announces the new verdict ("Round-Trip trägt · Rückkehr Alimos bis Tag 11"); the hero shows the shortened leg. One edit, whole-plan honesty.
5. He collapses the editor; the day is re-decided in under a minute.

Failure path: the solver rejects the edit (no valid continuation) → the error panel renders inside the editor (`role="alert"`), linked to the failing control via `aria-describedby`, and focus moves to it; the previous plan stays untouched until a valid apply.

## Open Questions

1. ~~Naming/wordmark~~ — resolved 2026-08-05: the product name is **SailGreece**.
2. ~~Accent contrast~~ — resolved 2026-08-05: coral kept with the size/weight rules in DESIGN.md.Colors.
3. **Rot/Unbewertet tints**: derived values in DESIGN.md need one visual confirmation against the direction file's mood.
4. **Mobile-first + light-only**: both assumed from context — confirm.
5. **Position/departure controls**: is folding the ControlsBar into the day-context popover + hero stat stepper acceptable, or does Philipp want departure time permanently visible as an editable control?
6. ~~Sticky header~~ — resolved 2026-08-05 (accessibility review): header stays sticky, with `scroll-margin-top` ≥ header height on all focusables (SC 2.4.11).
7. **Dark mode**: out of scope now — revisit after the trip / before open-sourcing?
8. **PWA hygiene scope**: favicon/theme-color/meta yes — anything more (installability) wanted before the trip?
