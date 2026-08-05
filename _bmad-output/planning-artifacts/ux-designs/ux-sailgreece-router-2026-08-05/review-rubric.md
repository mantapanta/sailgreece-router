# Spine Pair Review — sailgreece-router

Reviewed: `DESIGN.md` + `EXPERIENCE.md` (2026-08-05) against `design-md-spec.md`, the four shape examples, `.memlog.md`, and all four frontmatter sources (prd.md, brief.md, ARCHITECTURE-SPINE.md, Windy/Maps research). All contrast ratios below were recomputed from the frontmatter hex values.

## Overall verdict

A disciplined, near-contract-ready pair: every token reference in both files resolves, every color has a hex, sections are in canonical order, and the three Key Flows cover both PRD user moments with protagonist, climax, and failure paths. Four issues would leak into downstream work if source-extracted today: the Gelb text-on-tint pair fails the spine's own ≥4.5:1 claim, the Karte key-screen mock is an orphaned reference whose layout decisions contradict the spine, the Hafentag view that the architecture explicitly deferred to UX is unaddressed, and the Ortsdetail surface has flow narrative but no component spec. Fix those and the pair extracts cleanly.

## 1. Flow coverage — strong

Sources define exactly two user moments (PRD §3: UM-1 Morgenentscheidung, UM-2 Abendcheck). Flow 1 covers UM-1, Flows 2–3 cover UM-2 (evening refresh + berth check). All three name Philipp as protagonist, use numbered steps, carry a bolded climax beat, and end with a failure path grounded in real FRs (FR18 least-violating plan, NFR6 unbewertet). Step content traces verbatim to FR19/FR20/FR27/FR29/FR30/FR32.

### Findings
- **medium** UM-1 explicitly includes "bei Bedarf editiert Philipp die Etappe" (prd.md §3), but no flow exercises FR28 stage editing — StageEditor exists only as a Component Patterns row (EXPERIENCE.md, Component Patterns). The solver-rerun-and-replan moment (pending state → whole plan re-renders → status line may flip) is the riskiest interaction in the app and has no narrative walkthrough. *Fix:* add an editing beat to Flow 1 (or a short Flow 4) that runs select → apply → pending → re-rendered plan → error path.

## 2. Token completeness — adequate

All 33 color tokens carry hex values; 9 typography roles fully specified per spec type rules; rounded/spacing complete; 19 component token objects defined. Every `{path.to.token}` reference in both files (93 in DESIGN.md, 24 in EXPERIENCE.md) resolves to a frontmatter token — zero dangling references. Contrast is stated for the load-bearing combinations (ink steps, coral pairs, Ampel text-on-tint) and the stated values for ink-secondary (5.37), ink-tertiary (3.08), on-accent (3.20), accent-deep (4.16) verify against the hex.

### Findings
- **high** The spine claims "all text-on-tint pairs target ≥4.5:1" (DESIGN.md, Colors → Ampel), but `{colors.ampel-gelb-text}` `#a86c09` on `{colors.ampel-gelb-tint}` `#fcf3e0` measures **3.95:1**. The Gelb badge label is 13px/700 overline — not WCAG large text — and this is the safety palette; downstream code will mirror a failing pair while the spine asserts it passes. (Grün 4.76, Rot 6.25, Unbewertet 4.63 all pass; gelb-text-strong 6.21 passes.) *Fix:* darken `ampel-gelb-text` to ≈`#916008` or below, or make `ampel-gelb-text-strong` the badge/text default and demote `ampel-gelb-text` to large-text-only.
- **low** `{colors.focus-ring}` equals `{colors.accent}`, so the focus ring around coral-filled controls (primary button, selected chips) is same-hue-on-same-hue with only a 2px offset gap carrying the signal. *Fix:* one sentence stating ring behavior on accent fills (e.g. ink ring or white-inner/coral-outer double ring).
- **low** The four shadow recipes exist only as raw literals, repeated across five component tokens and the Elevation prose (six places to keep in sync). *Fix:* a `shadows` token group (level-1/2/3/accent-glow) referenced via `{shadows.*}`, or declare the Elevation section the single source.

## 3. Component coverage — adequate

Cross-extraction of every component name used anywhere: all 19 frontmatter component tokens have a visual spec in DESIGN.md.Components with real rules (states, sizing, usage boundaries), and DESIGN's composed surfaces (Two-line header, StageCard, Berth line, StageEditor, OptionRow/AlternativeRow, Breakdown table, Error/hint panels) each have a matching behavioral row in EXPERIENCE.md.Component Patterns. Names are consistent across both files with the exceptions below.

### Findings
- **high** The Ortsdetail surface (FR5 — one of only five IA surfaces) has no component spec in either spine: hero photo treatment, the Qualitäten display (Schönheit/Restaurant/Badestrand — chips? ratings?), and the Schutzprofil sector table exist only as narrative inside Flow 3, including the load-bearing rule "wave rows visibly de-emphasized as non-scoring" (EXPERIENCE.md, Flow 3 step 4). A consumer cannot build this screen from the contract. *Fix:* add an Ortsdetail composed-surface entry in DESIGN.md.Components and a behavioral row (incl. sector-table semantics) in Component Patterns.
- **medium** Map markers have scattered fragments (Ampel hue for pins in DESIGN.Colors, `{rounded.sm}` for "map stage-number capsules" in Shapes, keyboard rules in Accessibility Floor) but no component row defining anatomy, size, label typography, or focus-ring rendering on a Google Maps marker. *Fix:* one "Map marker" row in each spine.
- **medium** "Position control" (EXPERIENCE.md, Component Patterns) has behavioral rules but no visual composition in DESIGN.md — the day-context edit affordance and the popover's internal layout (place select + two actions + hint slot) are unspecified. *Fix:* add it to DESIGN's composed-surfaces list.
- **low** Name drift: EXPERIENCE says "Breakdown expander", DESIGN says "Breakdown table" for the same FR30 surface. *Fix:* pick one name.

## 4. State coverage — adequate

State Patterns is the strongest section of the pair: 14 states across every surface — cold load, auth check, both sign-in errors, solver pending, empty Optionsraum, no-main-route, no-valid-round-trip, stale forecast, offline, plan-unreadable (AD-12), GPS denied, missing Maps key, unbewertet place, disabled — each with named copy and a concrete treatment, plus the error/hint component split. Offline, permission-denied, empty, and cold-load are all present per surface.

### Findings
- **high** Hafentag/Puffer-Tag (PRD §4, FR31): ARCHITECTURE-SPINE.md → Deferred explicitly hands "Hafentag-UX (was die Tagesansicht an einem Hafentag zeigt)" to the UX phase, and the plan model already carries the Hafentag day-type. Neither spine addresses it — not a state, not a flow, not even an Open Question. On 15.8. the hero StageCard has no destination/Ampel/stat-grid to show. *Fix:* define the Tagesansicht harbor-day treatment (or explicitly park it in Open Questions with a named owner).
- **medium** FR31 Gäste-Pickup is a *hard* validity condition and the PRD says "die App schlägt den besten Pickup-Punkt vor" — but no surface, state, or copy shows the pickup constraint, the proposed pickup harbor, or a violation of it (it would surface only as an anonymous "verletzte Bedingung" in the red state). *Fix:* name where the pickup day appears in the Rest-Trip list and how a pickup violation is worded.
- **medium** No rule for when the hero switches from today's stage to tomorrow's: Flow 1 shows today in the hero, Flow 2 step 2 shows "the hero card for tomorrow" after the evening refresh, but no state/rule says what the Tagesansicht heroes after arrival (evening, UM-2). Implementers will guess. *Fix:* one sentence in State Patterns or IA ("after X o'clock / once position = destination, hero shows Tag N+1" or similar).

## 5. Visual reference coverage — thin

Inventory: `imports/` has 1 file, `.working/` has 6, no `mockups/` or `wireframes/`. Referenced with purpose: `imports/screenshot-mobile-tagesansicht-ist-zustand.png` (both spines + reconcile doc — baseline being corrected), `.working/direction-consumer-warm.html` (both spines — chosen direction), `.working/ui-inventory-ist-zustand.md` (EXPERIENCE header — current-state ground truth), and the three rejected directions (`direction-yacht-brochure/cockpit-instrument/editorial-minimal.html`, EXPERIENCE Inspiration). Spines-win-on-conflict is stated once in each spine (DESIGN Brand & Style; EXPERIENCE header).

### Findings
- **high** `.working/keyscreen-karte-consumer-warm.html` is an **orphan** — referenced by neither spine — and it actively contradicts EXPERIENCE.md's Karte spec: the mock renders a mobile bottom sheet (spine: stacked map-above-list ≤860px), floating layer chips + legend popover (spine: "compact control row"), and the Rückweg as gray dashed "Annahme" (spine: rest-trip dashed in the Ampel verdict hue). The memlog records the mock's decisions as "vorbehaltlich Philipps Review". Because the spines-win clause enumerates only the *other* three reference files, a consumer opening the workspace has two conflicting Karte specs and no stated winner. *Fix:* either reconcile (the mock's decisions look more worked-out than the spine's one-liner) or cite the file in EXPERIENCE's Karte paragraph as superseded/rejected.
- **low** `reconcile-screenshot-mobile-tagesansicht.md` row 2 is stale: it says the wordmark spelling is open as [ASSUMPTION], while both spines record it decided 2026-08-05 ("SailGreece"). *Fix:* update the row.

## 6. Bloat & overspecification — strong

Both files are tight. DESIGN.md's editorial voice is earned and every prose paragraph ends in a rule; EXPERIENCE.md stays behavioral (tables where tables work, no persona/FR restatement — FRs are cited by ID, not repeated). The brownfield remediation detail in DESIGN.Colors (naming `AmpelBadge.tsx`, `MapView.tsx`, `altRouteColors.ts`, `WindBarb.tsx` — all verified to exist in `src/ui/`) is borderline architecture territory but load-bearing for the token-consolidation contract; keep it. No pixel specs where tokens cover it; no decorative narrative. No findings.

## 7. Inheritance discipline — adequate

All four `sources` paths resolve from repo root. FR/NFR/AD citations spot-checked verbatim against prd.md and ARCHITECTURE-SPINE.md — FR13/18/19/20/21/22/27/28/29/30/31/32, NFR1–3/5/6, AD-11/AD-12 all accurate in ID and meaning (including the subtle ones: FR32 no Törntag select, FR27 no GPS button, AD-12 `planUnreadable` never silent reset). EXPERIENCE token references all resolve to DESIGN tokens by name. PRD glossary terms (Etappe, Hauptroute, Alternativ-Route, Optionsraum, Rest-Trip, Ampel, Törntag) used verbatim.

### Findings
- **medium** Surface name "Ortsdetail" violates the source glossary: PRD §4 reserves **Platz** for the concept ("Platz = Bucht, Ankerplatz oder Hafen"), FR5 calls the screen "Platz-Detailansicht", and the architecture names it `PlaceDetailView`. "Ort" appears nowhere in the sources. *Fix:* rename to "Platzdetail" (or state the mapping once).
- **low** "Umkehrtag" / "Spätester Umkehrtag" (status-line detail, OptionRow) is a coinage — the PRD term is **Point of Return** (synonym: Umkehrpunkt). Close enough to read, loose enough to fork copy. *Fix:* align on the PRD term or add it to a one-line vocabulary note.
- **low** Both spines cite "(decided 2026-08-05)" for the SailGreece wordmark and the coral-contrast rule, but `.memlog.md` records neither decision — its last entry still has naming implicitly open. Decision provenance breaks for anyone auditing the trail. *Fix:* append the two decision entries to the memlog.

## 8. Shape fit — strong

DESIGN.md: frontmatter matches the spec (name, description, colors flat kebab-case hex, typography objects, rounded, spacing, components with `{path}` refs); body sections present in exactly the canonical order Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts. EXPERIENCE.md: all eight required defaults present; Inspiration & Anti-patterns present and triggered (memlog records Airbnb reference + three rejected directions); Responsive & Platform present and triggered (multi-surface, three breakpoints + iPhone specifics). Invented sections earn their place: "Forecast Trust & Provenance" binds FR13/FR30/NFR5 into one coherent pattern no default section owns; "Open Questions" is an honest parking lot (two resolved items kept struck-through as record). [ASSUMPTION] tags (8) are used exactly as the memlog intends. No Mermaid used, none needed. No findings.

## Mechanical notes

- **All cross-file token references resolve** — no `{path.to.token}` in either spine points at a missing frontmatter key; no frontmatter color lacks a hex.
- **Name inconsistencies:** "Ortsdetail" vs PRD "Platz-Detailansicht"/arch `PlaceDetailView` (§7); "Breakdown expander" vs "Breakdown table" (§3); "Umkehrtag" vs "Umkehrpunkt" (§7).
- **Broken/missing cross-refs:** `.working/keyscreen-karte-consumer-warm.html` referenced by no spine yet conflicting (§5); `reconcile-screenshot-mobile-tagesansicht.md` row 2 stale on the wordmark decision (§5); memlog missing the two 2026-08-05 decisions the spines cite (§7). All other referenced files (`direction-*.html`, `ui-inventory-ist-zustand.md`, the screenshot, all four sources) exist at the cited paths.
- **Frontmatter completeness:** both spines carry name/status/updated/sources; DESIGN adds the spec-required `description`. `status: draft` is consistent with the open questions.
- **Verified computations:** contrast ratios recomputed from hex — the spine's stated ≈ values are honest except the Gelb text-on-tint pair (3.95:1 vs claimed ≥4.5:1, §2).
- **Code anchors verified:** `AmpelBadge.tsx`, `MapView.tsx`, `WindBarb.tsx`, `altRouteColors.ts` all exist under `src/ui/` — the brownfield retirement list in DESIGN.Colors points at real files.
