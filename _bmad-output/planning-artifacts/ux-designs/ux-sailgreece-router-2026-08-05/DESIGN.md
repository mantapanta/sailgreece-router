---
name: SailGreece Router
description: Consumer-warm visual system for the Cyclades round-trip planner — white cards, soft layered shadows, one Aegean-coral accent, one Ampel palette, pill actions. Replaces the legacy creme/navy/serif language.
status: draft
updated: 2026-08-05
sources:
  - _bmad-output/planning-artifacts/prds/prd-sailgreece-router-2026-07-30/prd.md
  - _bmad-output/planning-artifacts/briefs/brief-sailgreece-router-2026-07-30/brief.md
  - _bmad-output/planning-artifacts/architecture/architecture-sailgreece-router-2026-07-30/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/research/technical-windy-api-google-maps-stack-research-2026-07-30.md
colors:
  surface-page: '#faf9f7'
  surface-card: '#ffffff'
  surface-inset: '#faf9f7'
  surface-track: '#f0eeea'
  ink-primary: '#23211e'
  ink-secondary: '#6f6a62'
  ink-tertiary: '#98928a'
  border-hairline: '#ecebe7'
  accent: '#f2604d'
  accent-deep: '#d94c3a'
  accent-tint: '#fdeeec'
  accent-gradient-end: '#e5893c'
  on-accent: '#ffffff'
  focus-ring: '#f2604d'
  ampel-gruen: '#1a9d5c'
  ampel-gruen-tint: '#e4f5ec'
  ampel-gruen-text: '#147a47'
  ampel-gelb: '#e09112'
  ampel-gelb-tint: '#fcf3e0'
  ampel-gelb-text: '#a86c09'
  ampel-gelb-text-strong: '#7a5306'
  ampel-rot: '#d93636'
  ampel-rot-tint: '#fbe9e9'
  ampel-rot-text: '#a72020'
  ampel-unbewertet: '#b6b1a9'
  ampel-unbewertet-tint: '#f0eeea'
  ampel-unbewertet-text: '#6f6a62'
  alt-route-1: '#6f4a9c'
  alt-route-2: '#1f7a8c'
  alt-route-3: '#b05f2c'
  map-line-sailed: '#1a9d5c'
  map-line-casing: '#ffffff'
typography:
  display:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
    fontSize: 30px
    fontWeight: '800'
    lineHeight: '1.05'
    letterSpacing: -0.03em
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
    fontSize: 19px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.45'
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.3'
  overline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
    fontSize: 13px
    fontWeight: '700'
    lineHeight: '1.3'
    letterSpacing: 0.06em
  micro-label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
    fontSize: 11px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: 0.07em
  caption:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
    fontSize: 12.5px
    fontWeight: '400'
    lineHeight: '1.35'
  footnote:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
    fontSize: 11.5px
    fontWeight: '400'
    lineHeight: '1.4'
rounded:
  sm: 8px
  md: 14px
  lg: 20px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '7': 32px
  '8': 40px
  page-margin: 16px
  card-padding: 20px
  content-max: 1280px
components:
  button-primary:
    background: '{colors.accent}'
    foreground: '{colors.on-accent}'
    radius: '{rounded.full}'
    shadow: '0 4px 14px rgba(242,96,77,0.35)'
    min-height: 48px
  button-secondary:
    background: '{colors.surface-card}'
    foreground: '{colors.ink-primary}'
    border: '1px solid {colors.border-hairline}'
    radius: '{rounded.full}'
    shadow: '0 1px 2px rgba(30,25,20,0.08), 0 2px 8px rgba(30,25,20,0.06)'
    min-height: 44px
  button-ghost:
    background: 'transparent'
    foreground: '{colors.accent-deep}'
    radius: '{rounded.full}'
    min-height: 44px
  button-text:
    background: 'transparent'
    foreground: '{colors.ink-primary}'
    decoration: 'underline, offset 2px'
  segmented-tabs:
    track: '{colors.surface-track}'
    active-background: '{colors.surface-card}'
    active-foreground: '{colors.ink-primary}'
    inactive-foreground: '{colors.ink-secondary}'
    radius: '{rounded.full}'
    active-shadow: '0 1px 2px rgba(30,25,20,0.08), 0 2px 8px rgba(30,25,20,0.06)'
  card:
    background: '{colors.surface-card}'
    radius: '{rounded.lg}'
    shadow: '0 1px 2px rgba(30,25,20,0.06), 0 10px 30px rgba(30,25,20,0.08)'
    margin-x: '{spacing.page-margin}'
    padding: '{spacing.card-padding}'
  stat-tile:
    background: '{colors.surface-inset}'
    divider: '{colors.border-hairline}'
    radius: '{rounded.md}'
    label: '{typography.micro-label}'
    value: '{typography.headline}'
  ampel-badge:
    radius: '{rounded.full}'
    dot-size: 9px
    typography: '{typography.overline}'
  chip:
    background: '{colors.surface-track}'
    foreground: '{colors.ink-secondary}'
    radius: '{rounded.full}'
    typography: '{typography.caption}'
  status-line:
    typography: '{typography.caption}'
    foreground: '{colors.ink-secondary}'
    emphasis: '{colors.ink-primary}'
    dot-size: 9px
  info-chip:
    circle-background: '{colors.surface-track}'
    circle-foreground: '{colors.ink-tertiary}'
    text: '{colors.ink-secondary}'
    typography: '{typography.caption}'
  popover:
    background: '{colors.surface-card}'
    radius: '{rounded.md}'
    shadow: '0 2px 6px rgba(30,25,20,0.10), 0 16px 40px rgba(30,25,20,0.16)'
    max-width: 320px
  select:
    background: '{colors.surface-card}'
    border: '1px solid {colors.border-hairline}'
    radius: '{rounded.md}'
    min-height: 44px
  stepper:
    background: '{colors.surface-inset}'
    button-size: 44px
    radius: '{rounded.md}'
    value: '{typography.headline}'
  avatar:
    size: 34px
    radius: '{rounded.full}'
    background: 'linear-gradient(135deg, {colors.accent} 0%, {colors.accent-gradient-end} 100%)'
    foreground: '{colors.on-accent}'
  avatar-menu:
    background: '{colors.surface-card}'
    radius: '{rounded.md}'
    shadow: '0 2px 6px rgba(30,25,20,0.10), 0 16px 40px rgba(30,25,20,0.16)'
    item-min-height: 44px
  provenance-line:
    typography: '{typography.footnote}'
    foreground: '{colors.ink-tertiary}'
  warn-note:
    radius: '{rounded.md}'
    typography: '{typography.body-sm}'
  skeleton:
    base: '{colors.surface-track}'
    highlight: '{colors.surface-inset}'
    radius: '{rounded.md}'
---

## Brand & Style

SailGreece Router is a private skipper's tool with the finish of a modern consumer travel product — the register is Airbnb-class polish, not marine-instrument or brochure. The reference composition is `.working/direction-consumer-warm.html` (the chosen direction; this spine wins on conflict), and the current-state baseline it corrects is `imports/screenshot-mobile-tagesansicht-ist-zustand.png`.

The read at 07:00 in a sunlit cockpit should feel like a booking confirmation: white cards on a warm off-white page, generous whitespace, soft layered shadows, one warm Aegean-coral accent, pill-shaped actions. Today's destination stands large and emotional; everything operational visibly steps back. The system is friendly but never playful — the Ampel verdict is safety information and is treated with quiet seriousness.

This language **replaces** the legacy Y.CO-inspired creme/navy/serif system entirely (PRD NFR1 named that aesthetic; the redesign supersedes its palette and type while keeping NFR1's day-by-day structure, sticky split, and whitespace discipline). No serif headlines, no navy chrome, no letterspaced-caps `.versal` voice as default.

**Wordmark.** The product name is set as a wordmark, not a repository name: `Sail` in {colors.ink-primary} + `Greece` in {colors.accent}, {typography.headline}, no lowercase-hyphenated treatment anywhere in the UI. [ASSUMPTION] Final product name and spelling ("SailGreece" vs. another treatment) are still open with Philipp; the treatment register (proper wordmark, accent-colored fragment) is decided.

[ASSUMPTION] Light theme is the only mode (sunlight readability at the helm argues for it; dark mode not requested, open for later).

## Colors

All values below are the **single source of truth**. They live once as CSS custom properties; every TypeScript color constant (`AMPEL_CSS_COLOR` in `AmpelBadge.tsx`, `REST_LINE_COLOR`/`SAILED_LINE_COLOR` in `MapView.tsx`, `altRouteColors.ts`, the `WindBarb.tsx` default) must reference these same values — the current codebase carries two divergent Ampel palettes (`#3a7d44/#d9a441/#b0413e` vs `#3f7d4f/#c8952a/#b3423a`) and ~20 raw hex values outside tokens; all are retired by this file. No raw hex outside the token layer.

### Surfaces & ink

- **Page (`{colors.surface-page}`)** — the warm off-white app canvas. Slightly warm to avoid clinical white and reduce glare.
- **Card (`{colors.surface-card}`)** — pure white. Every content container is a white card; contrast against the page comes from shadow, not border.
- **Inset (`{colors.surface-inset}`)** — page-tone tiles *inside* white cards (stat grid, berth line). Depth by tone, one level only.
- **Track (`{colors.surface-track}`)** — segmented-tab track, info-chip circle, unbewertet tint, skeleton base. The lowest-contrast structural gray-beige.
- **Ink** — three steps only: `{colors.ink-primary}` for content, `{colors.ink-secondary}` for supporting text (≈5.3:1 on white), `{colors.ink-tertiary}` for non-essential meta (provenance, frame labels; ≈3.1:1 — never for information that exists nowhere else in stronger ink or behind a tap).
- **Hairline (`{colors.border-hairline}`)** — row dividers inside list cards and the divider grid between stat tiles. Never as a card outline.

### Accent (Aegean coral)

- **`{colors.accent}`** — the one brand color. Used for: the primary pill button, the wordmark fragment, selected states of interactive elements, and the focus ring. Never for status — status belongs to the Ampel palette exclusively.
- **`{colors.accent-deep}`** — coral for *text*: ghost-button labels, the day kicker ("Tag 1 · Samstag, 8. August"), inline "show more" rows. Also the hover/pressed shift of `{colors.accent}` fills.
- **`{colors.accent-tint}`** — coral wash for selected-chip backgrounds. Sparingly.
- **`{colors.accent-gradient-end}`** — exists solely as the second stop of the avatar gradient. Not used anywhere else.

**Contrast honesty:** `{colors.on-accent}` on `{colors.accent}` measures ≈3.2:1 and `{colors.accent-deep}` on white ≈4.2:1 — below strict AA for normal text. Rule: coral fills carry text only at ≥16px weight 700; coral text is only ever ≥14px weight 600 and always paired with a second affordance (position, chevron, underline). Whether to darken `accent-deep` for strict AA is an open question for Philipp (see EXPERIENCE.md Open Questions).

### Ampel (the one palette)

Four states, each with a strong hue (dots, map lines, pin markers), a tint (badge/note backgrounds), and a text color for use *on* that tint (all text-on-tint pairs target ≥4.5:1):

| State | Hue | Tint | Text on tint |
|---|---|---|---|
| Grün | `{colors.ampel-gruen}` | `{colors.ampel-gruen-tint}` | `{colors.ampel-gruen-text}` |
| Gelb | `{colors.ampel-gelb}` | `{colors.ampel-gelb-tint}` | `{colors.ampel-gelb-text}` (long copy: `{colors.ampel-gelb-text-strong}`) |
| Rot | `{colors.ampel-rot}` | `{colors.ampel-rot-tint}` | `{colors.ampel-rot-text}` |
| Unbewertet | `{colors.ampel-unbewertet}` | `{colors.ampel-unbewertet-tint}` | `{colors.ampel-unbewertet-text}` |

[ASSUMPTION] The direction file renders the Grün and Gelb pairings; the Rot and Unbewertet tint/text values are derived to the same lightness logic and need one visual pass.

Ampel color is **never the only carrier of meaning** — every Ampel surface also carries its German text label ("Grün", "Gelb", "Rot", "Unbewertet") or an equivalent verbal verdict. No emoji (🟢🟡🔴⚪, ⚓/⚠/⛔, 📌) as meaning carriers anywhere.

### Map & routes

- Sailed track: solid `{colors.map-line-sailed}` (identical to `{colors.ampel-gruen}` — one green, not two).
- Rest-trip track: dashed, colored by the rest-trip Ampel verdict using the Ampel hues above (retires the divergent `REST_LINE_COLOR` set).
- Line casing: `{colors.map-line-casing}` under every polyline for legibility on hybrid imagery.
- Alternative routes: `{colors.alt-route-1}` / `{colors.alt-route-2}` / `{colors.alt-route-3}` — retained from the current code; deliberately outside the Ampel hue ranges so an alternative is never mistaken for a verdict.
- Wind barbs: `{colors.ink-primary}` strokes with white halo (replaces the navy default in `WindBarb.tsx`).
- Muted place pins (not relevant today): `{colors.ampel-unbewertet}`.

## Typography

**One family.** The humanist system sans stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`) for everything — no webfont (the direction file loads none), no serif anywhere. This kills the current serif/sans mixing that reads as restless.

The ramp:

- `{typography.display}` — today's destination only ("Kythnos"). One per screen, maximum.
- `{typography.headline}` — wordmark, stat values, place names in Ortsdetail.
- `{typography.body}` / `{typography.body-sm}` — running text, list rows, notes. Semibold (600–650) inline for emphasis, never a size change.
- `{typography.label}` — button and tab labels (primary full-width CTAs step up to 16px, weight stays 700).
- `{typography.overline}` — uppercase section titles ("REST-TRIP", "OPTIONSRAUM") and the day kicker. Together with `micro-label` this is the **only** uppercase-tracked role; it replaces the six divergent `.versal` recipes.
- `{typography.micro-label}` — uppercase stat-tile labels ("ABFAHRT", "WIND").
- `{typography.caption}` — trip status line, chips, option metadata.
- `{typography.footnote}` — provenance line, attribution. Tertiary ink, never load-bearing.

**Tabular numerals** (`font-variant-numeric: tabular-nums`) on everything quantitative: times ("12:00"), knots ("NNE 18 kn"), distances ("17 sm"), durations ("5,5 h"), day numbers in lists. German number formatting (decimal comma, narrow no-break space before units).

## Layout & Spacing

Fixed 4-based scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 (`{spacing.1}`–`{spacing.8}`) — replaces the ~25 ad-hoc rem values in the current stylesheet. Named anchors: `{spacing.page-margin}` (16px card side margins on mobile), `{spacing.card-padding}` (20px inside cards), `{spacing.content-max}` (1280px desktop content width, carried over from the current shell).

**One alignment logic** (kills the header zigzag): every screen is a single left-aligned column. The right edge is reserved for exactly two things — status (Ampel pill, state dot, chevron) and identity (avatar). Nothing else right-aligns; nothing centers except primary-button labels, the provenance footnote, and empty-state copy.

Vertical rhythm: `{spacing.6}` between sections (section title included), `{spacing.3}`–`{spacing.4}` between elements inside a card, `{spacing.2}` between a label and its value.

## Elevation & Depth

Soft, layered, always warm-tinted (`rgba(30,25,20,…)` — never pure-black shadows):

- **Level 0** — flat: insets, tracks, chips. Tone difference only.
- **Level 1** — `0 1px 2px rgba(30,25,20,0.08), 0 2px 8px rgba(30,25,20,0.06)`: active tab segment, secondary buttons.
- **Level 2** — `0 1px 2px rgba(30,25,20,0.06), 0 10px 30px rgba(30,25,20,0.08)`: all cards. The signature "lifted card" look.
- **Level 3** — `0 2px 6px rgba(30,25,20,0.10), 0 16px 40px rgba(30,25,20,0.16)`: popovers, menus, sheets — anything floating above cards.
- **Accent glow** — `0 4px 14px rgba(242,96,77,0.35)`: primary pill button only.

Borders are not an elevation device. Cards get shadow, not outline; hairlines live only *inside* cards.

## Shapes

- `{rounded.lg}` (20px) — cards. The defining silhouette.
- `{rounded.md}` (14px) — nested surfaces inside cards: stat grids, berth lines, warn notes, popovers, selects, skeletons.
- `{rounded.sm}` (8px) — rare small rectangles (e.g. map stage-number capsules).
- `{rounded.full}` — every button, tab, badge, chip, pill. Actions are pills, period.
- Circles — avatar, Ampel dots, info-chip circle.

Imagery (place photos, satellite heroes) follows its container radius exactly.

## Components

One button system, one badge system — the five legacy ad-hoc button recipes and all native unstyled buttons are retired.

- **Button / primary** — coral pill, `{components.button-primary}`. 16px/700 label for full-width CTAs ("Etappe ändern"). One primary action per card maximum. Hover/pressed: fill shifts to `{colors.accent-deep}`. Disabled: `{colors.surface-track}` fill, `{colors.ink-tertiary}` text, no shadow.
- **Button / secondary** — white pill with hairline border and Level-1 shadow, `{components.button-secondary}`. For real-but-not-primary actions ("Route ansehen", "Als Hauptroute übernehmen" in list contexts, "Schließen").
- **Button / ghost** — coral text pill, no chrome, `{components.button-ghost}`. Low-commitment actions under a primary ("Wie kommt die Zeit zustande?").
- **Button / text** — inline underlined ink link, `{components.button-text}`. Navigation-in-prose ("← Zurück", berth-name links into Ortsdetail).
- **Segmented tabs** — `{components.segmented-tabs}`: pill track, white active segment with Level-1 shadow. Two segments ("Heute" / "Karte"). Whole segments are tap targets.
- **Card** — `{components.card}`. Two variants: *hero card* (padded content) and *list card* (edge-to-edge rows divided by hairlines, `{spacing.4}` row padding, chevron affordance in `{colors.ampel-unbewertet}`).
- **Stat tile grid** — `{components.stat-tile}`: 2-column grid of inset tiles separated by a 1px hairline grid, micro-label over tabular headline value ("ABFAHRT / 12:00").
- **Ampel badge** — `{components.ampel-badge}`: pill in the state's tint, 9px dot in the state hue, text label in the state's text color ("● Grün"). The only status badge in the system. Never a bare dot without a label on first-glance surfaces (bare 9px dots allowed only inside dense list rows whose expanded form shows the labeled badge).
- **State chip** (Optionsraum) — `{components.chip}` shape with Ampel tints: "offen" on `{colors.ampel-gruen-tint}`, "offen · Vorbehalt" and "schließt Tag X" on `{colors.ampel-gelb-tint}`, "geschlossen" on `{colors.ampel-unbewertet-tint}` — always with text.
- **Trip status line** — `{components.status-line}`: one caption line, state dot + bold verdict + "·"-separated facts ("**Round-Trip unter Vorbehalt** · Rückkehr Alimos bis Tag 11 · Meltemi-fest bis Tag 4"). Replaces the fat rest-trip banner.
- **Warn note** — `{components.warn-note}`: rounded inset in the verdict's Ampel tint with matching text color, inside the stage card ("**Böen bis 28 kn am Kap** — Abfahrt vor 10:00 empfohlen."). A note, not a banner: card-width, quiet, no icon required.
- **Info chip + popover** — `{components.info-chip}`: small "i" circle + caption text with a dotted-underlined link word; tap/click opens `{components.popover}`. The vehicle for progressive disclosure (forecast assumption, provenance detail, and the content of every legacy `title` tooltip).
- **Form controls** — `{components.select}` (styled, hairline border, ≥44px) and `{components.stepper}` (– / value / + with 44px buttons; for Abfahrtszeit and Liegezeit-Stunden). No native unstyled controls; `<option>` text carries plain German labels plus the Ampel word where needed ("Loutra — Grün"), never emoji.
- **Avatar + menu** — `{components.avatar}`: 34px gradient circle with initial, top right of the header; opens `{components.avatar-menu}` (name, e-mail, "Abmelden"). There is no wide Abmelden button anywhere.
- **Provenance line** — `{components.provenance-line}`: centered footnote at the page end ("Forecast: ECMWF · Lauf 05.08. 09:00 · abgerufen 16:19 ⟳") with inline refresh affordance (44px hit area despite the small glyph). Never in the header or hero.
- **Skeleton** — `{components.skeleton}`: rounded blocks in track/inset tones matching the final layout (status line, hero card, three list rows), subtle opacity pulse. Replaces the global "Lade …" text.

**Composed surfaces** (behavior in EXPERIENCE.md; visually they are strict compositions of the primitives above — no bespoke styling):

- **Two-line header** — wordmark + `{components.avatar}` on line 1; `{components.segmented-tabs}` + refresh ghost affordance on line 2. Page background, no card, no shadow.
- **StageCard** — hero variant: `{components.card}` containing display destination, `{components.ampel-badge}`, optional `{components.warn-note}`, `{components.stat-tile}` grid, berth line, button row. Row variant: list-card row (overline day tag in tabular figures, place in 600, Ampel dot, chevron).
- **Berth line** — `{colors.surface-inset}` row at `{rounded.md}`: text-link place name, "Liegeplatz" caption, `{components.ampel-badge}` right.
- **StageEditor** — inset panel inside the StageCard: `{components.select}` ×2, `{components.stepper}`, secondary + ghost buttons, error panel slot.
- **OptionRow / AlternativeRow** — list-card rows composed of state `{components.chip}`s, `{components.ampel-badge}`, caption metadata, secondary button; AlternativeRow adds its identity dot in `{colors.alt-route-1}`–`{colors.alt-route-3}`.
- **Breakdown table** — `{typography.micro-label}` headers, `{typography.body-sm}` tabular-figure cells, hairline row dividers, `{rounded.md}` clipping container.
- **Error / hint panels** — `{rounded.md}` insets: error = `{colors.ampel-rot-tint}` + `{colors.ampel-rot-text}`; hint = `{colors.surface-track}` + `{colors.ink-secondary}`. Two distinct components, never interchanged.

## Do's and Don'ts

| Do | Don't |
|---|---|
| One wordmark treatment: `Sail` + coral `Greece`, {typography.headline} | Render the repo name ("sailgreece-router") or any lowercase-hyphenated brand string in the UI |
| Two-line compact header: wordmark + avatar, then tabs + refresh | A wide "Abmelden" button, provenance data, or the date range in the header/hero |
| Provenance as a quiet footer line with popover + refresh | A mandatory data-provenance strip under the header |
| Forecast-assumption notice as info chip → popover | A fat full-width notice banner ("Ab Tag 7 …") in the main flow |
| One left-aligned column; right edge only for status + avatar | Alignment zigzag (left/right/center alternating) in header or cards |
| Every color from `colors.*`; TS constants reference the same values | Raw hex in CSS or TS; parallel Ampel palettes |
| One sans family, one button system (primary/secondary/ghost/text), one Ampel palette | Serif headlines, native unstyled buttons, per-view button recipes |
| Ampel = tinted pill + dot + German text label | Color-only status, bare dots as sole first-glance signal, emoji as meaning (🟢⚓⛔📌) |
| Pills for actions, 20px cards, soft layered warm shadows | Square corners on actions, hard borders as card outlines, pure-black shadows |
| Coral for brand / action / selection only | Coral for warnings or verdicts (Ampel territory) |
| Tabular numerals and German number format for all times/knots/distances | Proportional digits in stat tiles or tables |
| ≥44px tap targets, visible `:focus-visible` ring in {colors.focus-ring} everywhere | Meaning only in `title` tooltips or hover states |
