# Accessibility Review — sailgreece-router

Adversarial WCAG 2.2 AA review of `DESIGN.md` + `EXPERIENCE.md` (pre-implementation), mobile-web lens: one-handed iPhone use, bright sunlight, wet fingers, boat motion. All contrast ratios below were recomputed from the token hex values in `DESIGN.md` (WCAG relative-luminance formula), not taken from the spec's claims. Sunlight glare effectively *lowers* perceived contrast, so every "barely passes" pair is treated as at-risk.

## Verdict

The spine pair is a serious, mostly self-aware accessibility contract — it explicitly repairs every red flag in the ist-zustand inventory (focus styles, clickable divs, hover-only meaning, headings, live regions, color-only status). However, the contrast arithmetic does not hold: the Gelb text-on-tint pair breaks the spec's own ≥4.5:1 rule on the single most safety-critical surface (the yellow verdict badge and warn note), the coral text/fill size rules are calibrated below the actual WCAG large-text thresholds, and `ink-tertiary` is sanctioned as a text color at ~2.9–3.1:1. These are token-level fixes — cheap now, expensive after implementation.

## Findings

### Critical

**C1 — Gelb text-on-tint fails the spec's own ≥4.5:1 rule on the safety verdict.**
Location: `DESIGN.md` → Colors → Ampel table (+ `components.ampel-badge`, `components.warn-note`); exercised by `EXPERIENCE.md` Flow 2 steps 1–2.
`ampel-gelb-text` `#a86c09` on `ampel-gelb-tint` `#fcf3e0` measures **3.95:1** — below the stated target "all text-on-tint pairs target ≥4.5:1". The Ampel badge label is `{typography.overline}` = 13px/700, which is *not* WCAG large text (threshold: ≥18.66px bold or ≥24px), so 4.5:1 applies and the pair fails. The same color also fails on its other spec'd surfaces: **4.36:1** on white card, **4.15:1** on page (`#faf9f7`). This is the hero badge "● Gelb", the state chips "offen · Vorbehalt" / "schließt Tag X", and (if an implementer reads "long copy" narrowly) the warn note "Böse bis 28 kn am Kap …" — precisely the surfaces Flow 2's yellow-day decision hangs on, read in glare. The other three Ampel pairs pass (Grün 4.76, Rot 6.25, Unbewertet 4.63), so this is not a systemic derivation error — it's one bad token.
Fix: darken `ampel-gelb-text` to ≈`#8f5e07` (5.05:1 on tint, ≥4.9 on white/page) or simply retire it and promote `ampel-gelb-text-strong` `#7a5306` (6.21:1 on tint, 6.85 on white) to be *the* Gelb text color; keep one value. Update the Ampel table and delete the "long copy" split — a two-tier text color invites the failing tier onto short safety strings.

### High

**H1 — The coral-fill text rule is calibrated below the WCAG large-text threshold.**
Location: `DESIGN.md` → Colors → "Contrast honesty" (binding rule decided 2026-08-05).
`on-accent` white on `accent` `#f2604d` = **3.20:1** (claim ≈3.2 confirmed). The mitigation rule says "coral fills carry text only at ≥16px weight 700" — but 16px/700 is **normal text** under WCAG (large-text starts at 18.66px bold), so the primary CTA "Etappe ändern" at 16px/700 needs 4.5:1 and gets 3.2. The rule as written codifies an AA failure on the app's primary action, on a phone, in sunlight.
Fix (pick one, state it in the rule): (a) raise the floor to ≥19px weight 700 so the large-text 3:1 threshold genuinely applies and 3.2:1 passes; (b) make primary-button fills `accent-deep` `#d94c3a` (white-on-fill 4.16:1 — passes large-text at any of these sizes with margin, keeps coral for the brandmark/selection); (c) darken `accent` itself. Note the hover state already shifts fills to `accent-deep`, so (b) costs almost nothing visually.

**H2 — Coral *text* rule also fails: 14px/600 at 4.16:1.**
Location: `DESIGN.md` → Colors → "Contrast honesty"; used by `button-ghost`, the day kicker "Tag 1 · Samstag, 8. August", inline "show more" rows.
`accent-deep` `#d94c3a` on white = **4.16:1** (claim ≈4.2 confirmed); on page `#faf9f7` = **3.96:1**. The rule permits it at "≥14px weight 600" — normal text, 4.5:1 required. The "second affordance (position, chevron, underline)" pairing helps recognizability, but WCAG 1.4.3 has no redundancy exemption: the *words* still have to be legible. The day kicker is content, not an affordance, and sits directly on the page surface (3.96:1).
Fix: add a dedicated coral-text token ≈`#c23a28` (5.34:1 on white) for ghost labels and inline links, or set the kicker in `ink-secondary` and reserve `accent-deep` text for ≥18.66px/700 contexts. Alternatively raise the size floor to ≥19px/700 (then 4.16 and 3.96 pass large-text 3:1).

**H3 — `ink-tertiary` is sanctioned as a text color at 2.9–3.1:1; WCAG has no "non-essential text" exemption.**
Location: `DESIGN.md` → Colors → Surfaces & ink ("`ink-tertiary` … ≈3.1"), `components.provenance-line`, `components.info-chip` (circle-foreground); `EXPERIENCE.md` → Forecast Trust ("data age: provenance footer on every view").
`#98928a` measures **3.08:1** on white, **2.93:1** on page (where the footer actually sits), **2.66:1** on track (info-chip circle, disabled fills). 1.4.3 exempts only decorative, disabled, and logo text — "non-essential meta" is not a category. Worse, the spec makes this text load-bearing: "the skipper must always be able to answer 'how fresh is this'" and the answer's *only always-visible home* is the tertiary-ink footnote "abgerufen 16:19". 2.93:1 at 11.5px is illegible in a bright cockpit.
Fix: either darken `ink-tertiary` to ≥4.5:1 on page (≈`#767169`), or restrict the token by rule to genuinely exempt uses (disabled states, decorative glyphs) and set the provenance/footnote text in `ink-secondary` (5.10:1 on page). Update the "never for information that exists nowhere else" clause — the fetched-at time currently *is* such information (the popover behind a tap doesn't satisfy 1.4.3 for the visible line).

**H4 — Stale-forecast state: the status-line half of the treatment is unspecified, and the age note fails contrast at 11.5px.**
Location: `EXPERIENCE.md` → State Patterns → "Stale forecast" (Surface column says "Footer + status line"; the Treatment column describes only the footer).
At the 07:00 glance (Flow 1), a stale verdict is the one thing that must not be missed — but the described signal (provenance note "Stand vor 4 h" + primary-toned refresh glyph) lives in the page footer, below the fold on a 390×844 viewport with a hero card, stats and three list sections above it. The table names the status line as a stale surface, then never says what it does. And the age note itself is `{colors.ampel-gelb-text}` `#a86c09` at footnote 11.5px: **4.15:1** on page — fails 4.5:1 (and see C1).
Fix: specify the status-line stale treatment explicitly — e.g. the trip status line gains a leading "Stand vor 4 h" segment in the (fixed, per C1) Gelb text color with the Gelb dot, announced via its existing `aria-live="polite"`. Set the footer age note in `ampel-gelb-text-strong` (6.51:1 on page). State that staleness is always visible above the fold on Tagesansicht.

**H5 — Bare Ampel dots in collapsed Rest-Trip rows are spec-sanctioned color-only meaning — at 9px, with a 2.55:1 yellow.**
Location: `DESIGN.md` → Components → Ampel badge ("bare 9px dots allowed only inside dense list rows whose expanded form shows the labeled badge") + StageCard row variant; `EXPERIENCE.md` → Tagesansicht §5 and Component Patterns → StageCard (row).
The collapsed row is "day · destination · Ampel dot · chevron" — the per-day verdict is carried *only* by dot color until the user expands. That is exactly the SC 1.4.1 pattern the spec bans elsewhere ("Ampel color is never the only carrier of meaning"), made worse by: `ampel-gelb` `#e09112` on white = **2.55:1** (fails even the 3:1 graphics threshold; on its own tint 2.31:1), 9px is sub-perceptual in glare/motion, and Grün `#1a9d5c` vs Gelb `#e09112` is a classic deutan confusion pair. Scanning the rest-trip list for "which day goes yellow" is a core Flow-2 task.
Fix: delete the bare-dot exemption. Collapsed rows get the verdict *word* in caption size (there is horizontal room: "Tag 4 · Serifos · Gelb ›"), or a micro Ampel badge (tint pill + dot + word). Independently, `#e09112` should be checked everywhere it appears as a non-text graphic on light ground (dots, map lines) — it fails 3:1 against white/tints; a darker graphic-gelb (≈`#b8770c`) for dots/lines would clear 3:1 while the tint/text pair stays as-is.

### Medium

**M1 — Karte: verdict semantics are color-only on the map surface; pins have no legibility spec on hybrid imagery.**
Location: `DESIGN.md` → Map & routes; `EXPERIENCE.md` → Karte layout + Map↔list sync.
Good: dash pattern distinguishes sailed vs rest (non-color), casing is spec'd for polylines, alt-routes are outside Ampel hues, wind barbs get a halo. Gaps: (a) the rest-trip line's *color* encodes the rest-trip verdict with no textual statement of that verdict anywhere on the Karte view (the trip status line is spec'd only for Tagesansicht); (b) place pins are "Ampel-colored where relevant" — verdict-by-pin-color only, Grün/Gelb indistinguishable for CVD users, and reaching the text costs two taps; (c) pins and stage-number capsules get no white halo/casing rule, yet sit on hybrid satellite imagery (muted pins `#b6b1a9` vs white 2.13:1 — against dark sea imagery they may be fine, but nothing is specified); (d) legend content for the new compact control row is not specified (the old legend explained solid/dashed/Ampel — the redesigned one must too).
Fix: put the trip status line (or a one-line textual verdict chip) on the Karte view; give pins a white casing ring like polylines; encode verdict on pins redundantly (letterform or distinct glyph per state — note "G"/"G" collision between Grün/Gelb, so use shape or the dot count style); spec the legend text.

**M2 — Focus ring: single coral ring is marginal-to-failing on several real backgrounds.**
Location: `DESIGN.md` → Do's ("visible `:focus-visible` ring in {colors.focus-ring} everywhere"); `EXPERIENCE.md` → Interaction Primitives ("2px, 2px offset").
Ring `#f2604d` vs adjacent surface: white **3.20:1** (pass), page **3.04:1** (pass by 0.04 — gone in sunlight), accent-tint selected chips **2.84:1** (fail), and against the coral primary button the ring is **1.0:1** — only the 2px offset gap saves it, and that mechanism is never stated. 1.4.11 requires 3:1 for the focus indicator against adjacent colors.
Fix: specify a two-layer indicator (e.g. 2px `#f2604d` outer + 1px/2px white inner gap explicitly named as part of the spec), or ring in `accent-deep` `#d94c3a` (3.96:1 on page). State that the ring must contrast with *both* the control fill and the surrounding surface.

**M3 — StageEditor form semantics are unspecified: labels, error association, stepper pattern.**
Location: `EXPERIENCE.md` → Component Patterns → StageEditor; `DESIGN.md` → `components.select` / `components.stepper`.
The spec lists controls (island select, berth select, Liegezeit stepper, "Standard" reset) but never requires visible `<label>`s with programmatic association, never says the error panel is tied to the failing control (`aria-describedby`, focus moved to the error on failed apply), and gives no accessible pattern for the – / value / + stepper (group label "Liegezeit", button names "Liegezeit verringern/erhöhen", value announced on change — otherwise a screen reader hears two unlabeled buttons). The ist-zustand at least had `.stage-editor label`.
Fix: add to the StageEditor behavioral row: every control has a visible, associated label; apply-errors get `role="alert"` (already spec'd) *plus* `aria-describedby` linkage and focus; stepper implemented as labeled group with named buttons and live value (or `role="spinbutton"`).

**M4 — The rest-trip detail "sheet/expander" is undecided and, if a sheet, has no keyboard/focus spec.**
Location: `EXPERIENCE.md` → Tagesansicht §1, Component Patterns → Trip status line ("as expander/sheet").
Popovers get a complete contract (one at a time, Esc, backdrop, toggle, focus return). The status-line detail — the FR19/FR20 decision surface of Flow 2 — is left as "sheet/expander" with neither pattern committed. A bottom sheet needs: focus moved in on open, Esc + backdrop + explicit close, focus return to the status line, scroll containment, `aria-modal` decision. An expander needs `aria-expanded` and in-place growth. These have different implementations; leaving it open guarantees an ad-hoc one.
Fix: decide (expander is simpler and fits the no-router, no-modal-on-modal rules), and either way write its open/close/focus contract next to the popover contract.

**M5 — Keyboard parity for map↔list sync and the two-step pin gesture is not specified.**
Location: `EXPERIENCE.md` → Component Patterns → Map↔list sync; Accessibility Floor (map pins).
Pins are made keyboard-operable (`role="button"`, `tabIndex=0`, Enter/Space) — good. But: (a) the sync rule covers "hover (desktop) *and* tap (touch)"; keyboard focus on an itinerary card should also highlight the pin (the "hover may preview, tap must reach" rule forgets focus); (b) the two-step pin interaction (first tap highlights, second opens) needs its keyboard/AT translation — does first Enter highlight and second Enter open? A screen-reader user gets no feedback that step one happened unless it's announced; (c) pins have no accessible-name spec — it should be "Ort + verdict" ("Loutra — Grün, Liegeplatz"), otherwise keyboard users tab through anonymous buttons.
Fix: add focus to the sync triggers; spec pin accessible names including the Ampel word; spec the two-step gesture for keyboard (recommend: single activation opens Ortsdetail for keyboard/AT, highlight on focus — the two-step dance is a fat-finger guard, not needed for keys).

**M6 — Focus is orphaned when the solver re-renders the whole plan.**
Location: `EXPERIENCE.md` → Component Patterns → StageEditor / AlternativeRow ("result re-renders the whole plan"), Forecast Trust → Snapshot semantics.
After "Als Hauptroute übernehmen" or a StageEditor apply, the triggering button's subtree may be unmounted by the re-render — keyboard focus falls to `<body>`, and a screen-reader user is teleported to nowhere. The verdict change is announced (status line `aria-live`) but focus destination is unspecified.
Fix: specify focus landing after plan re-render — e.g. focus moves to the trip status line (which announces the new verdict) or stays on the still-existing equivalent control; never silently to body.

**M7 — Stat-tile micro-label ink color is unspecified; 11px uppercase in sunlight is the floor of the floor.**
Location: `DESIGN.md` → `components.stat-tile` (has `label`/`value` typography but no foreground token), Typography → micro-label.
"ABFAHRT / WIND" labels pair with the safety-relevant values (12:00, NNE 18 kn). With no ink token stated, an implementer will plausibly reach for `ink-tertiary` (3.08:1 → fails at 11px, see H3). 11px with 0.07em tracking is a sane improvement over the legacy 0.28em recipes, but it is the absolute minimum for glare conditions.
Fix: state `label` foreground = `ink-secondary` (5.37:1) explicitly in the stat-tile (and breakdown-table header) spec; consider 11.5–12px for micro-label given the cockpit context. Same check for `provenance-line` (see H3).

**M8 — Expander/disclosure ARIA is never specified (`aria-expanded`, `aria-controls`), nor the segmented tabs' semantics.**
Location: `EXPERIENCE.md` → Interaction Primitives → Expanders; Component Patterns → Two-line header.
The spine specifies `aria-live`, `role="alert"`, `role="status"`, `role="button"` for pins — but the app is expander-driven (status-line detail, Rest-Trip rows, Optionsraum, calc panel, Alternativ-Routen, reasons) and no rule requires `aria-expanded` on the triggers, so state changes are invisible to AT. The "Heute/Karte" segmented control's semantics are also undecided (visually tabs, functionally full view switches — plain buttons with `aria-pressed`/`aria-current`, or a `tablist`; either works, but pick one).
Fix: add to Interaction Primitives: every expander trigger carries `aria-expanded` (+`aria-controls` where the region is not adjacent); chevron rotation is the visual mirror of that attribute. Decide tab semantics in the header row.

### Low

**L1 — `prefers-reduced-motion` is scoped to expanders only.** (`EXPERIENCE.md` → Interaction Primitives.) The skeleton "opacity pulse" (`DESIGN.md` skeleton), the refresh glyph spin, and the solver pending spinner are animations outside that rule. Fix: one global rule — reduced motion disables pulse and decorative spin; pending states fall back to the already-spec'd text ("Aktualisierung läuft …") and a static glyph swap.

**L2 — Landmarks and the invisible-h1 case are unstated.** (`EXPERIENCE.md` → Accessibility Floor.) Heading repair is spec'd, but not `header/nav/main/footer` landmarks (banner, navigation for the tab row, main per view, contentinfo for provenance/disclaimer), and the Karte view's `h1` ("Karte") has no visible text slot in the layout — say it's visually hidden. Fix: one sentence adding the four landmarks and the sr-only h1 rule.

**L3 — Chevron affordance color `ampel-unbewertet` `#b6b1a9` = 2.13:1 on white.** (`DESIGN.md` → Components → Card, list variant.) The only visible cue that a row expands fails the 3:1 graphics threshold, and borrowing a *status* color for a navigation glyph muddies the "Ampel = status only" rule. Fix: chevrons in `ink-tertiary` at minimum (3.08:1) — better `ink-secondary`; reserve `ampel-unbewertet` for the Unbewertet state.

**L4 — Info-chip "i" circle: `ink-tertiary` on `surface-track` = 2.66:1.** (`DESIGN.md` → `components.info-chip`.) Redundant with the dotted-underlined link word, so not a blocker, but the affordance glyph itself is sub-3:1. Fix: circle foreground `ink-secondary` (4.63:1 on track).

**L5 — Sticky header vs Focus Not Obscured (SC 2.4.11, new in 2.2 AA).** (`EXPERIENCE.md` → Component Patterns → Two-line header, "sticky on scroll [ASSUMPTION]".) Keyboard-scrolling backwards through the day view can land focus under the sticky header. Fix: if the header stays sticky, spec `scroll-margin-top` ≥ header height on all focusable elements (also answers Open Question 6 with an a11y datapoint for "scrolls away").

**L6 — Marginal pairs to watch in glare (all technically passing).** `ink-secondary` on `surface-track` chips 4.63:1 at 12.5px; `ink-secondary` on page 5.10:1; focus ring on page 3.04:1 (see M2); alt-route-3 `#b05f2c` on white 4.65:1 if ever used as text. No token change required, but the spec should add one sentence: "no passing pair may be moved to a smaller size or lighter surface than specified here without re-measuring" — that rule is currently implicit.

**L7 — Berth text-link as sole entry to Ortsdetail; one-handed reach.** (`EXPERIENCE.md` → Berth line, Flow 3.) Inline text links are exempt from the 44px rule, but a wet-thumb tap on an inline link inside an inset row is the Flow-3 entry point. Fix: make the whole berth line row the tap target for Ortsdetail (link stays for semantics). Reach note: all primary actions (hero CTA, status line, footer refresh) sit in mid/low screen — good; the header refresh duplicate covers the top. No change needed beyond keeping it that way.

## What the spec already does well

Preserve these when applying fixes — several directly repair ist-zustand failures:

- **Focus floor exists at all**: `:focus-visible` 2px/2px-offset ring "on every interactive element", explicitly called "a floor, not polish" (vs. zero focus rules today). M2 tunes the color, not the principle.
- **Hover-only meaning is banned outright** — every legacy `title` tooltip is given a named touch path (info chip / popover / expander), and "hover may preview, tap must reach" is a genuinely good rule (extend to focus, M5).
- **Map markers become keyboard-operable** (`role="button"`, `tabIndex=0`, Enter/Space, visible ring) — fixes the clickable-div pins.
- **Ampel is text-first**: tint + dot + German word, emoji banned as semantics, coral fenced off from status, one palette with per-state text colors — the *architecture* is right; only the Gelb value (C1) and the bare-dot exemption (H5) leak.
- **44px targets everywhere**, including the small refresh glyph (explicit 44px hit area) and stepper buttons — exceeds SC 2.5.8's 24px.
- **Live-region plan**: `aria-live="polite"` on provenance and the status line, `role="alert"` errors vs `role="status"` pending, verdict changes announced after refresh — plus the error-vs-hint component split.
- **Heading repair** (one h1 per view, real h2 sections), `lang="de"`, `abbr` expansion once per surface, decorative icons `aria-hidden`.
- **Honest states**: empty Optionsraum gets words instead of a hidden section; stale data escalates instead of hiding; offline keeps the last snapshot usable.
- **Voice rules** keep safety copy short, verdict-first ("Gelb — …"), deadline-explicit ("bis Tag 4") — exactly right for the <10s glance.
- **Contrast honesty as a practice**: the spec measures and states its own ratios (ink-secondary 5.3 and accent claims verified accurate within rounding). The failures above are calibration errors, not concealment — keep the practice, fix the thresholds.
- Tabular numerals, 16px iOS input floor, `prefers-reduced-motion` on expanders, per-section skeletons, one-at-a-time popovers with focus return.
