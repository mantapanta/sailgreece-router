# Validation Report — sailgreece-router

- **DESIGN.md:** `_bmad-output/planning-artifacts/ux-designs/ux-sailgreece-router-2026-08-05/DESIGN.md`
- **EXPERIENCE.md:** `_bmad-output/planning-artifacts/ux-designs/ux-sailgreece-router-2026-08-05/EXPERIENCE.md`
- **Run at:** 2026-08-05T14:45+02:00

## Overall verdict

Ein diszipliniertes, nahezu vertragsreifes Spine-Paar: Jede Token-Referenz in beiden Dateien löst auf, jede Farbe trägt einen Hex-Wert, die Sektionen stehen in kanonischer Reihenfolge, und die drei Key Flows decken beide PRD-User-Moments mit Protagonist, Climax und Failure-Path ab. Vier Punkte würden bei einer Source-Extraktion heute in die nachgelagerte Arbeit durchsickern: Das Gelb-Text-auf-Tint-Paar verfehlt die spine-eigene ≥4.5:1-Zusage, der Karte-Keyscreen-Mock ist eine verwaiste Referenz, deren Layout-Entscheidungen dem Spine widersprechen, die von der Architektur explizit an UX übergebene Hafentag-Ansicht bleibt unadressiert, und die Ortsdetail-Oberfläche hat Flow-Narrativ, aber keine Komponenten-Spezifikation. Mit diesen Fixes extrahiert das Paar sauber.

Das Accessibility-Review verschiebt das Bild spürbar: Das Gelb-Paar ist nicht nur ein Rubrik-Befund, sondern ein kritischer Kontrastfehler (3.95:1) auf der sicherheitskritischsten Oberfläche — dem Verdict-Badge und der Warn-Note eines Gelb-Tages, gelesen im Sonnenlicht. Zusätzlich sind die Coral-Regeln aus „Contrast honesty" unterhalb der tatsächlichen WCAG-Großtext-Schwellen kalibriert (16px/700 bzw. 14px/600 sind normaler Text, für den 4.5:1 gilt, nicht 3:1), und `ink-tertiary` wird bei ~2.9–3.1:1 als Textfarbe für lasttragende Information (Abrufzeitpunkt der Prognose) sanktioniert. Das sind durchweg Token-Level-Fixes — jetzt billig, nach der Implementierung teuer.

## Category verdicts

- Flow coverage — strong
- Token completeness — adequate
- Component coverage — adequate
- State coverage — adequate
- Visual reference coverage — thin
- Bloat & overspecification — strong
- Inheritance discipline — adequate
- Shape fit — strong

## Findings by severity

### Critical (1)

**[Token completeness + Accessibility]** — ampel-gelb-text auf ampel-gelb-tint verfehlt die eigene ≥4.5:1-Regel auf dem Sicherheits-Verdict (3.95:1) (§ DESIGN.md → Colors → Ampel; components.ampel-badge / warn-note; EXPERIENCE.md Flow 2 steps 1–2)
Von beiden Reviewern gemeldet (Rubrik §2 high + Accessibility C1) — hier einmal als Critical konsolidiert. The spine claims "all text-on-tint pairs target ≥4.5:1", but `ampel-gelb-text` `#a86c09` on `ampel-gelb-tint` `#fcf3e0` measures **3.95:1**. The Ampel badge label is `{typography.overline}` = 13px/700 — not WCAG large text (threshold ≥18.66px bold or ≥24px), so 4.5:1 applies and the pair fails. The same color also fails on white card (4.36:1) and page `#faf9f7` (4.15:1). This is the hero badge "● Gelb", the state chips "offen · Vorbehalt" / "schließt Tag X", and possibly the warn note — precisely the surfaces Flow 2's yellow-day decision hangs on, read in glare. The other three Ampel pairs pass (Grün 4.76, Rot 6.25, Unbewertet 4.63) — one bad token, no systemic derivation error. Downstream code will mirror a failing pair while the spine asserts it passes.
Fix: Darken `ampel-gelb-text` to ≈`#8f5e07` (5.05:1 on tint, ≥4.9 on white/page) or retire it and promote `ampel-gelb-text-strong` `#7a5306` (6.21:1 on tint, 6.85 on white) to be *the* Gelb text color; keep one value. Update the Ampel table and delete the "long copy" split — a two-tier text color invites the failing tier onto short safety strings.

### High (8)

**[Component coverage]** — Ortsdetail-Oberfläche (FR5) hat in keinem Spine eine Komponenten-Spezifikation (§ EXPERIENCE.md → Flow 3 step 4)
The Ortsdetail surface (FR5 — one of only five IA surfaces) has no component spec in either spine: hero photo treatment, the Qualitäten display (Schönheit/Restaurant/Badestrand), and the Schutzprofil sector table exist only as narrative inside Flow 3, including the load-bearing rule "wave rows visibly de-emphasized as non-scoring". A consumer cannot build this screen from the contract.
Fix: Add an Ortsdetail composed-surface entry in DESIGN.md.Components and a behavioral row (incl. sector-table semantics) in Component Patterns.

**[State coverage]** — Hafentag/Puffer-Tag (FR31) in keinem Spine adressiert — trotz explizitem Architektur-Handover (§ PRD §4, FR31; ARCHITECTURE-SPINE.md → Deferred)
ARCHITECTURE-SPINE.md → Deferred explicitly hands "Hafentag-UX (was die Tagesansicht an einem Hafentag zeigt)" to the UX phase, and the plan model already carries the Hafentag day-type. Neither spine addresses it — not a state, not a flow, not even an Open Question. On 15.8. the hero StageCard has no destination/Ampel/stat-grid to show.
Fix: Define the Tagesansicht harbor-day treatment (or explicitly park it in Open Questions with a named owner).

**[Visual reference coverage]** — keyscreen-karte-consumer-warm.html ist verwaist — und widerspricht der Karte-Spezifikation aktiv (§ .working/keyscreen-karte-consumer-warm.html; EXPERIENCE.md → Karte)
The mock is referenced by neither spine and actively contradicts EXPERIENCE.md's Karte spec: mobile bottom sheet (spine: stacked map-above-list ≤860px), floating layer chips + legend popover (spine: "compact control row"), Rückweg as gray dashed "Annahme" (spine: rest-trip dashed in the Ampel verdict hue). The memlog records the mock's decisions as "vorbehaltlich Philipps Review". Because the spines-win clause enumerates only the *other* three reference files, a consumer has two conflicting Karte specs and no stated winner.
Fix: Either reconcile (the mock's decisions look more worked-out than the spine's one-liner) or cite the file in EXPERIENCE's Karte paragraph as superseded/rejected.

**[Accessibility H1]** — Coral-Fill-Textregel unterhalb der WCAG-Großtext-Schwelle kalibriert (§ DESIGN.md → Colors → "Contrast honesty")
`on-accent` white on `accent` `#f2604d` = **3.20:1**. The mitigation rule says "coral fills carry text only at ≥16px weight 700" — but 16px/700 is *normal text* under WCAG (large-text starts at 18.66px bold), so the primary CTA "Etappe ändern" needs 4.5:1 and gets 3.2. The rule as written codifies an AA failure on the app's primary action, on a phone, in sunlight.
Fix: (a) raise the floor to ≥19px weight 700 so the large-text 3:1 threshold genuinely applies; (b) make primary-button fills `accent-deep` `#d94c3a` (white-on-fill 4.16:1, passes large-text with margin; hover already shifts to `accent-deep`, so this costs almost nothing); or (c) darken `accent` itself. State the choice in the rule.

**[Accessibility H2]** — Coral-Text-Regel fällt ebenfalls durch: 14px/600 bei 4.16:1 (§ DESIGN.md → Colors → "Contrast honesty"; button-ghost, Day-Kicker, Inline-Rows)
`accent-deep` `#d94c3a` on white = **4.16:1**; on page `#faf9f7` = **3.96:1**. The rule permits it at "≥14px weight 600" — normal text, 4.5:1 required. WCAG 1.4.3 has no redundancy exemption for the "second affordance" pairing. The day kicker "Tag 1 · Samstag, 8. August" is content, not an affordance, and sits directly on the page surface (3.96:1).
Fix: Add a dedicated coral-text token ≈`#c23a28` (5.34:1 on white) for ghost labels and inline links, or set the kicker in `ink-secondary` and reserve `accent-deep` text for ≥18.66px/700 contexts. Alternatively raise the size floor to ≥19px/700.

**[Accessibility H3]** — ink-tertiary als Textfarbe bei 2.9–3.1:1 sanktioniert; WCAG kennt keine „non-essential text"-Ausnahme (§ DESIGN.md → Colors → Surfaces & ink; components.provenance-line, components.info-chip; EXPERIENCE.md → Forecast Trust)
`#98928a` measures **3.08:1** on white, **2.93:1** on page (where the footer actually sits), **2.66:1** on track. 1.4.3 exempts only decorative, disabled, and logo text. Worse, the spec makes this text load-bearing: "the skipper must always be able to answer 'how fresh is this'" and the answer's *only always-visible home* is the tertiary-ink footnote "abgerufen 16:19". 2.93:1 at 11.5px is illegible in a bright cockpit.
Fix: Either darken `ink-tertiary` to ≥4.5:1 on page (≈`#767169`), or restrict the token by rule to genuinely exempt uses and set the provenance/footnote text in `ink-secondary` (5.10:1 on page). Update the "never for information that exists nowhere else" clause — the fetched-at time currently *is* such information.

**[Accessibility H4]** — Stale-Forecast: Statuszeilen-Behandlung unspezifiziert, Altersnotiz verfehlt den Kontrast bei 11.5px (§ EXPERIENCE.md → State Patterns → "Stale forecast")
At the 07:00 glance (Flow 1), a stale verdict is the one thing that must not be missed — but the described signal lives in the page footer, below the fold on a 390×844 viewport. The table names the status line as a stale surface, then never says what it does. And the age note itself is `{colors.ampel-gelb-text}` `#a86c09` at footnote 11.5px: **4.15:1** on page — fails 4.5:1 (see the Critical finding).
Fix: Specify the status-line stale treatment explicitly — e.g. a leading "Stand vor 4 h" segment in the (fixed) Gelb text color with the Gelb dot, announced via the existing `aria-live="polite"`. Set the footer age note in `ampel-gelb-text-strong` (6.51:1 on page). State that staleness is always visible above the fold on Tagesansicht.

**[Accessibility H5]** — Nackte Ampel-Punkte in eingeklappten Rest-Trip-Zeilen sind spec-sanktionierte reine Farbcodierung — bei 9px, mit einem 2.55:1-Gelb (§ DESIGN.md → Components → Ampel badge / StageCard row; EXPERIENCE.md → Tagesansicht §5)
The collapsed row is "day · destination · Ampel dot · chevron" — the per-day verdict is carried *only* by dot color until expanded. That is exactly the SC 1.4.1 pattern the spec bans elsewhere ("Ampel color is never the only carrier of meaning"), made worse by: `ampel-gelb` `#e09112` on white = **2.55:1** (fails even the 3:1 graphics threshold), 9px is sub-perceptual in glare/motion, and Grün `#1a9d5c` vs Gelb `#e09112` is a classic deutan confusion pair. Scanning the rest-trip list for "which day goes yellow" is a core Flow-2 task.
Fix: Delete the bare-dot exemption. Collapsed rows get the verdict *word* in caption size ("Tag 4 · Serifos · Gelb ›"), or a micro Ampel badge. Independently, check `#e09112` everywhere it appears as a non-text graphic on light ground; a darker graphic-gelb (≈`#b8770c`) for dots/lines would clear 3:1 while the tint/text pair stays as-is.

### Medium (14)

**[Flow coverage]** — Etappen-Editing (FR28) hat keinen Flow-Durchlauf (§ prd.md §3; EXPERIENCE.md → Component Patterns)
UM-1 explicitly includes "bei Bedarf editiert Philipp die Etappe", but no flow exercises FR28 stage editing — StageEditor exists only as a Component Patterns row. The solver-rerun-and-replan moment (pending state → whole plan re-renders → status line may flip) is the riskiest interaction in the app and has no narrative walkthrough.
Fix: Add an editing beat to Flow 1 (or a short Flow 4) that runs select → apply → pending → re-rendered plan → error path.

**[Component coverage]** — Map-Marker haben verstreute Fragmente, aber keine Komponentenzeile (§ DESIGN.md → Colors / Shapes / Accessibility Floor)
Map markers have scattered fragments (Ampel hue for pins, `{rounded.sm}` for "map stage-number capsules", keyboard rules) but no component row defining anatomy, size, label typography, or focus-ring rendering on a Google Maps marker.
Fix: One "Map marker" row in each spine.

**[Component coverage]** — „Position control" ohne visuelle Komposition in DESIGN.md (§ EXPERIENCE.md → Component Patterns)
"Position control" has behavioral rules but no visual composition in DESIGN.md — the day-context edit affordance and the popover's internal layout (place select + two actions + hint slot) are unspecified.
Fix: Add it to DESIGN's composed-surfaces list.

**[State coverage]** — Gäste-Pickup-Bedingung (FR31) hat keine Oberfläche, keinen State und keine Copy (§ PRD FR31)
FR31 Gäste-Pickup is a *hard* validity condition and the PRD says "die App schlägt den besten Pickup-Punkt vor" — but no surface, state, or copy shows the pickup constraint, the proposed pickup harbor, or a violation of it (it would surface only as an anonymous "verletzte Bedingung" in the red state).
Fix: Name where the pickup day appears in the Rest-Trip list and how a pickup violation is worded.

**[State coverage]** — Keine Regel für den Hero-Wechsel von heutiger auf morgige Etappe (§ EXPERIENCE.md → Flow 1 / Flow 2 step 2)
Flow 1 shows today in the hero, Flow 2 step 2 shows "the hero card for tomorrow" after the evening refresh, but no state/rule says what the Tagesansicht heroes after arrival (evening, UM-2). Implementers will guess.
Fix: One sentence in State Patterns or IA ("after X o'clock / once position = destination, hero shows Tag N+1" or similar).

**[Inheritance discipline]** — „Ortsdetail" verletzt das Quell-Glossar (PRD: Platz / „Platz-Detailansicht") (§ PRD §4 / FR5; Architektur: PlaceDetailView)
PRD §4 reserves **Platz** for the concept ("Platz = Bucht, Ankerplatz oder Hafen"), FR5 calls the screen "Platz-Detailansicht", and the architecture names it `PlaceDetailView`. "Ort" appears nowhere in the sources.
Fix: Rename to "Platzdetail" (or state the mapping once).

**[Accessibility M1]** — Karte: Verdict-Semantik nur über Farbe; Pins ohne Lesbarkeits-Spezifikation auf Hybrid-Bildern (§ DESIGN.md → Map & routes; EXPERIENCE.md → Karte)
Gaps: (a) the rest-trip line's *color* encodes the rest-trip verdict with no textual statement of that verdict anywhere on the Karte view; (b) place pins are "Ampel-colored where relevant" — verdict-by-pin-color only, Grün/Gelb indistinguishable for CVD users, text costs two taps; (c) pins and stage-number capsules get no white halo/casing rule on hybrid satellite imagery (muted pins `#b6b1a9` vs white 2.13:1); (d) legend content for the new compact control row is not specified.
Fix: Put the trip status line (or a one-line textual verdict chip) on the Karte view; give pins a white casing ring like polylines; encode verdict on pins redundantly (shape or dot-count style — note the "G"/"G" collision between Grün/Gelb); spec the legend text.

**[Accessibility M2]** — Focus-Ring: einlagiger Coral-Ring auf mehreren realen Hintergründen grenzwertig bis durchgefallen (§ DESIGN.md → Do's; EXPERIENCE.md → Interaction Primitives)
Ring `#f2604d` vs adjacent surface: white **3.20:1** (pass), page **3.04:1** (pass by 0.04 — gone in sunlight), accent-tint selected chips **2.84:1** (fail), coral primary button **1.0:1** — only the 2px offset gap saves it, and that mechanism is never stated. 1.4.11 requires 3:1 against adjacent colors.
Fix: Specify a two-layer indicator (2px `#f2604d` outer + white inner gap explicitly named as part of the spec), or ring in `accent-deep` `#d94c3a` (3.96:1 on page). State that the ring must contrast with *both* the control fill and the surrounding surface.

**[Accessibility M3]** — StageEditor-Formularsemantik unspezifiziert: Labels, Fehlerverknüpfung, Stepper-Pattern (§ EXPERIENCE.md → Component Patterns → StageEditor; DESIGN.md → components.select / components.stepper)
The spec lists controls but never requires visible labels with programmatic association, never ties the error panel to the failing control (`aria-describedby`, focus moved on failed apply), and gives no accessible pattern for the – / value / + stepper — otherwise a screen reader hears two unlabeled buttons. The ist-zustand at least had `.stage-editor label`.
Fix: Add to the StageEditor behavioral row: every control has a visible, associated label; apply-errors get `role="alert"` *plus* `aria-describedby` linkage and focus; stepper implemented as labeled group with named buttons and live value (or `role="spinbutton"`).

**[Accessibility M4]** — Rest-Trip-Detail „Sheet/Expander" unentschieden — und als Sheet ohne Tastatur-/Fokus-Spezifikation (§ EXPERIENCE.md → Tagesansicht §1; Component Patterns → Trip status line)
Popovers get a complete contract; the status-line detail — the FR19/FR20 decision surface of Flow 2 — is left as "sheet/expander" with neither pattern committed. A bottom sheet needs focus-in on open, Esc + backdrop + explicit close, focus return, scroll containment, an `aria-modal` decision; an expander needs `aria-expanded` and in-place growth. Leaving it open guarantees an ad-hoc implementation.
Fix: Decide (expander is simpler and fits the no-router, no-modal-on-modal rules), and either way write its open/close/focus contract next to the popover contract.

**[Accessibility M5]** — Tastatur-Parität für Map↔List-Sync und die Zwei-Schritt-Pin-Geste fehlt (§ EXPERIENCE.md → Component Patterns → Map↔list sync; Accessibility Floor)
(a) the sync rule covers hover and tap; keyboard focus on an itinerary card should also highlight the pin; (b) the two-step pin interaction needs its keyboard/AT translation — a screen-reader user gets no feedback that step one happened unless it's announced; (c) pins have no accessible-name spec.
Fix: Add focus to the sync triggers; spec pin accessible names including the Ampel word ("Loutra — Grün, Liegeplatz"); spec the two-step gesture for keyboard (recommend: single activation opens Ortsdetail for keyboard/AT, highlight on focus — the two-step dance is a fat-finger guard, not needed for keys).

**[Accessibility M6]** — Fokus verwaist beim Solver-Re-Render des gesamten Plans (§ EXPERIENCE.md → Component Patterns → StageEditor / AlternativeRow; Forecast Trust)
After "Als Hauptroute übernehmen" or a StageEditor apply, the triggering button's subtree may be unmounted by the re-render — keyboard focus falls to `<body>`, and a screen-reader user is teleported to nowhere. The verdict change is announced but focus destination is unspecified.
Fix: Specify focus landing after plan re-render — e.g. focus moves to the trip status line (which announces the new verdict) or stays on the still-existing equivalent control; never silently to body.

**[Accessibility M7]** — Stat-Tile-Micro-Label ohne Ink-Farbe; 11px Uppercase im Sonnenlicht ist der Boden des Bodens (§ DESIGN.md → components.stat-tile; Typography → micro-label)
"ABFAHRT / WIND" labels pair with the safety-relevant values (12:00, NNE 18 kn). With no ink token stated, an implementer will plausibly reach for `ink-tertiary` (3.08:1 → fails at 11px, see H3).
Fix: State `label` foreground = `ink-secondary` (5.37:1) explicitly in the stat-tile (and breakdown-table header) spec; consider 11.5–12px for micro-label given the cockpit context. Same check for `provenance-line`.

**[Accessibility M8]** — Expander-/Disclosure-ARIA nie spezifiziert (aria-expanded, aria-controls); Segmented-Tabs-Semantik offen (§ EXPERIENCE.md → Interaction Primitives → Expanders; Component Patterns → Two-line header)
The app is expander-driven (status-line detail, Rest-Trip rows, Optionsraum, calc panel, Alternativ-Routen, reasons) and no rule requires `aria-expanded` on the triggers, so state changes are invisible to AT. The "Heute/Karte" segmented control's semantics are also undecided (plain buttons with `aria-pressed`/`aria-current`, or a `tablist`; either works, but pick one).
Fix: Add to Interaction Primitives: every expander trigger carries `aria-expanded` (+`aria-controls` where the region is not adjacent); chevron rotation is the visual mirror of that attribute. Decide tab semantics in the header row.

### Low (13)

**[Token completeness]** — Focus-Ring auf Coral-Füllungen ist Ton-in-Ton (§ DESIGN.md → Colors, focus-ring)
`{colors.focus-ring}` equals `{colors.accent}`, so the focus ring around coral-filled controls (primary button, selected chips) is same-hue-on-same-hue with only a 2px offset gap carrying the signal.
Fix: One sentence stating ring behavior on accent fills (e.g. ink ring or white-inner/coral-outer double ring).

**[Token completeness]** — Schatten-Rezepte nur als Rohliterale an sechs Stellen (§ DESIGN.md → Elevation & Depth; fünf Komponenten-Tokens)
The four shadow recipes exist only as raw literals, repeated across five component tokens and the Elevation prose (six places to keep in sync).
Fix: A `shadows` token group (level-1/2/3/accent-glow) referenced via `{shadows.*}`, or declare the Elevation section the single source.

**[Component coverage]** — Namensdrift: „Breakdown expander" vs. „Breakdown table" (§ EXPERIENCE.md / DESIGN.md, FR30-Oberfläche)
EXPERIENCE says "Breakdown expander", DESIGN says "Breakdown table" for the same FR30 surface.
Fix: Pick one name.

**[Visual reference coverage]** — Reconcile-Dokument Zeile 2 veraltet (Wordmark-Entscheidung) (§ reconcile-screenshot-mobile-tagesansicht.md, row 2)
Row 2 says the wordmark spelling is open as [ASSUMPTION], while both spines record it decided 2026-08-05 ("SailGreece").
Fix: Update the row.

**[Inheritance discipline]** — „Umkehrtag" ist eine Neuprägung — PRD-Begriff ist „Point of Return" (Umkehrpunkt) (§ Status-line detail, OptionRow)
"Umkehrtag" / "Spätester Umkehrtag" is a coinage — the PRD term is **Point of Return** (synonym: Umkehrpunkt). Close enough to read, loose enough to fork copy.
Fix: Align on the PRD term or add it to a one-line vocabulary note.

**[Inheritance discipline]** — Memlog fehlen die beiden zitierten Entscheidungen vom 2026-08-05 (§ .memlog.md; DESIGN/EXPERIENCE "(decided 2026-08-05)")
Both spines cite "(decided 2026-08-05)" for the SailGreece wordmark and the coral-contrast rule, but `.memlog.md` records neither decision. Decision provenance breaks for anyone auditing the trail.
Fix: Append the two decision entries to the memlog.

**[Accessibility L1]** — prefers-reduced-motion nur auf Expander gescoped (§ EXPERIENCE.md → Interaction Primitives)
The skeleton "opacity pulse", the refresh glyph spin, and the solver pending spinner are animations outside that rule.
Fix: One global rule — reduced motion disables pulse and decorative spin; pending states fall back to the already-spec'd text ("Aktualisierung läuft …") and a static glyph swap.

**[Accessibility L2]** — Landmarks und der Fall des unsichtbaren h1 unbenannt (§ EXPERIENCE.md → Accessibility Floor)
Heading repair is spec'd, but not `header/nav/main/footer` landmarks, and the Karte view's `h1` ("Karte") has no visible text slot in the layout.
Fix: One sentence adding the four landmarks and the sr-only h1 rule.

**[Accessibility L3]** — Chevron-Farbe ampel-unbewertet #b6b1a9 bei 2.13:1 auf Weiß (§ DESIGN.md → Components → Card, list variant)
The only visible cue that a row expands fails the 3:1 graphics threshold, and borrowing a *status* color for a navigation glyph muddies the "Ampel = status only" rule.
Fix: Chevrons in `ink-tertiary` at minimum (3.08:1) — better `ink-secondary`; reserve `ampel-unbewertet` for the Unbewertet state.

**[Accessibility L4]** — Info-Chip-„i"-Kreis: ink-tertiary auf surface-track bei 2.66:1 (§ DESIGN.md → components.info-chip)
Redundant with the dotted-underlined link word, so not a blocker, but the affordance glyph itself is sub-3:1.
Fix: Circle foreground `ink-secondary` (4.63:1 on track).

**[Accessibility L5]** — Sticky-Header vs. Focus Not Obscured (SC 2.4.11, neu in 2.2 AA) (§ EXPERIENCE.md → Component Patterns → Two-line header)
Keyboard-scrolling backwards through the day view can land focus under the sticky header ("sticky on scroll [ASSUMPTION]").
Fix: If the header stays sticky, spec `scroll-margin-top` ≥ header height on all focusable elements (also answers Open Question 6 with an a11y datapoint).

**[Accessibility L6]** — Grenzwertige Paare im Grellicht (alle technisch bestanden) (§ DESIGN.md → Colors)
`ink-secondary` on `surface-track` chips 4.63:1 at 12.5px; `ink-secondary` on page 5.10:1; focus ring on page 3.04:1 (see M2); alt-route-3 `#b05f2c` on white 4.65:1 if ever used as text.
Fix: No token change required, but add one sentence: "no passing pair may be moved to a smaller size or lighter surface than specified here without re-measuring" — that rule is currently implicit.

**[Accessibility L7]** — Berth-Textlink als einziger Einstieg ins Ortsdetail; Einhand-Erreichbarkeit (§ EXPERIENCE.md → Berth line, Flow 3)
Inline text links are exempt from the 44px rule, but a wet-thumb tap on an inline link inside an inset row is the Flow-3 entry point. Reach: all primary actions sit in mid/low screen — good.
Fix: Make the whole berth line row the tap target for Ortsdetail (link stays for semantics). No change needed on reach beyond keeping it that way.

## Reviewer files

- `review-rubric.md`
- `review-accessibility.md`
