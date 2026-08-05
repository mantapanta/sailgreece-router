---
baseline_commit: a60fca6
---

# Story 1.4: Platzdetail redesign

Status: ready-for-dev

Epic 1: **UX Redesign — Consumer Warm** (ad hoc epic; the UX spines in
`_bmad-output/planning-artifacts/ux-designs/ux-sailgreece-router-2026-08-05/` are BINDING,
status final). Stories 1.1 (tokens, button system `.btn-primary/.btn-secondary/.btn-ghost/
.btn-text`, `.icon-button`, two-layer `:focus-visible`, global reduced-motion rule,
`--header-h` 120px, `.visually-hidden`), 1.2 (Tagesansicht rebuild: `.card-surface`,
`.stat-grid`/`.stat-tile`, `.warn-note` + tint modifiers, `.chip`, `.info-chip`, `.popover`,
`.skeleton`, `.section-title`, restyled `.ampel` pill, `AMPEL_LABEL` export, PositionPopover
contract, `dayViewModel.ts` helper pattern, error/hint split) and 1.3 (Karte rebuild:
`TripStatusLine` extraction, `resolveMapsEnv` — PlaceDetailView already consumes it,
`MapViewSkeleton` pattern, `DEMO_MAP_ID` dead repo-wide) are DONE on this branch. Read all
three story files' Dev Agent Records + File Lists before starting — their vocabulary is what
this story composes from.

This is the **epic-closing story**: it rebuilds the last unredesigned view (Platzdetail),
restyles the sign-in gate, ships the small StageEditor a11y delta 1.2 deferred, retires the
legacy alias variables that lose their final consumers here, and removes the last
title-only meaning (wind barb).

## Story

As **Philipp (the skipper and only user)**,
I want **the Platzdetail rebuilt to the Consumer-Warm spine — the place opens as a fused
hero card (photo → live satellite → gradient fallback, all with scrim and caption, clipped
to the card radius), a display-type title block with the Nacht-AmpelBadge and a one-line
verdict—reason, standing caveats as warn-notes, the night verdict as badge + stat tiles +
window, the three Qualitäten as 5-dot ink meters, and the shelter profile as a sector tile
grid in Ampel tints with the German rating word per wind direction — plus the epic close-out
(auth card, StageEditor error wiring, alias retirement, barb aria-label)**,
so that **the evening berth check (Key Flow 3) reads like the rest of the app: the night
verdict with the protecting sector named in one glance, qualities that never look like
verdicts, wave values visibly non-scoring, and no surface left in the legacy creme/navy
language**.

## Scope boundary (read before implementing)

**IN scope (this story):**

- (a) PlaceDetailView rebuilt per DESIGN.md composed surface "Platzdetail" + the adopted
  mockup `mockups/keyscreen-ortsdetail-consumer-warm.html` (binding for composition; the
  spine wins on conflict — deviations listed in VERIFY 8): fused hero ladder in the place
  card, title block, description, warn-notes, Nacht-Ampel section card, Qualitäten meters,
  Schutzprofil sector grid, source footnote.
- (b) "← Zurück" restyled as `.btn-text` — **behavior byte-identical** (returns to the
  prior view per AD-11; `onBack` prop untouched).
- (c) States: invalid place (error panel + conservative copy + Unbewertet badge + Zurück),
  valid place with unbewertet night, heading hierarchy (`h1` = place name).
- (d) Epic close-out sweep, explicitly bounded:
  (i) SignInView / `.auth-card` restyled to the card language (white card, `--shadow-2`,
  Google button in the `.btn-secondary` recipe — **Google logo SVG and sign-in flow
  untouched**; the AuthGate "Anmeldung wird geprüft …" card inherits via the same classes);
  (ii) StageEditor delta (VERIFY 5 — only the genuinely missing bits): apply-error
  `aria-describedby` + focus-to-error, the three `className="secondary"` buttons →
  `.btn-secondary`, the "Standard" button's `title` becomes visible label text. NO other
  editor change — inputs keep inherited tokens only;
  (iii) legacy alias retirement: delete the dead legacy CSS blocks this story orphans,
  re-grep each of the 13 aliases, delete the truly unconsumed ones from the alias block,
  keep the rest and list them as remaining debt (VERIFY 6);
  (iv) the MapView wind-barb `title` tooltip gets a same-text `aria-label` (+`role="img"`)
  so its meaning is no longer title-only.

**EXPLICITLY NOT in scope (do not touch):**

- Any new features; any solver/domain/adapter change (`placeViewModel.ts` imports existing
  domain pure functions — it computes DISPLAY aggregation only, no new verdicts).
- Calc-panel internals (StageMap/WindBasis/Breakdown content and structure), including the
  Breakdown `title` tooltips (documented later a11y debt) and `AmpelBadge`'s redundant
  `title` (label is visible text — harmless, documented).
- Dark mode; PWA beyond 1.1; MapView/DayView visuals beyond the named surgical edits
  (barb aria-label; StageEditor delta).
- A Platzdetail skeleton (VERIFY 7 — the loading branch is unreachable for this view).
- The 1.3 open tags for Philipp (per-alt map toggling, map-side position affordance) —
  they stay open, they are not this story's.

**The app must remain fully functional end-to-end after this story** — sign-in,
Tagesansicht (stage edit incl. error path, calc panel, berth links), Karte (all 1.3
behavior), Platzdetail (hero on all three tiers, night verdict, qualities, shelter,
Zurück), refresh, sign-out.

## VERIFY resolutions (spine vs. code reality — decided for this story)

1. **"Küste" for the kicker: NO coast data exists.** The mock's kicker reads
   "Kythnos · Westküste"; `IslandSchema` (island.ts) has `id/name/coordinates/description/
   guestPickup` — no coast field, and nothing derivable without inventing. **Resolution:
   the kicker is "{Insel} · {Hafen|Marina|Bucht}"** — island name + the place-type label
   the view already derives (`place.type`). Real data only; the current hero caption
   already pairs exactly these two.
2. **Night window fields: REAL, and they are 18–09, not the mock's 20–08.**
   `params.nightStartHourAthens` (default 18) / `params.nightEndHourAthens` (default 9),
   validated `end < start` (params.ts). The current view already renders
   "Bewertungszeitraum: 18:00–9:00 Uhr …". **Resolution: window label from the params via
   a pure helper `nightWindowLabel`** → "18:00–09:00" (zero-padded, tabular). The mock's
   "20:00–08:00" is illustration, never copy.
3. **Sector grid semantics: the domain owns the per-direction verdict — reuse it, invent
   NO threshold.** Ground truth (`domain/ampel.ts`): `windSectorLimitKn(sectors, deg)` →
   most generous covering sector's `maxKn`, or `null` = luv rule ("never green under
   meaningful wind"); **`windHourAmpel(sectors, deg, kn, params)` is THE domain verdict
   for wind from a direction** — gruen only when `kn ≤ limit − params.gelbReserveKn`
   (reserve!), gelb up to the limit, **rot above it**; uncovered direction: gelb when
   `kn ≤ params.openSectorMaxKn`, else rot. Curated data (seeding/) spans maxKn 12–40 —
   26 sectors lie BELOW 30 kn, so any mapping that cannot show rot for a
   covered-but-overwhelmed sector misstates the domain (and a "gut" at limit = 30 would
   claim a green the domain refuses — reserve). `waveSectors` carry `maxM` the same way
   and are non-scoring (module head, skipper decision 2026-08-05). **Resolution: 8 tiles
   at the main compass directions (center degrees 0/45/…/315); each tile's rating IS
   `windHourAmpel(shelter.windSectors, centerDeg, params.meltemiWorstCase.twsKn,
   params)` — the app's own worst-case planning wind (default 30 kn) probed per
   direction through the domain's own function** (ui→domain pure-fn import, `format.ts`
   precedent). Word + tint: no covering sector → **"offen"** (rot tint; the luv rule —
   "Richtung liegt in keinem Schutzsektor"); verdict gruen → **"gut · bis {limit} kn"**
   (gruen tint — holds the worst case incl. the domain's reserve); verdict gelb →
   **"mäßig · bis {limit} kn"** (gelb tint — worst case reaches the limit, no reserve
   left); verdict rot → **"schwach · bis {limit} kn"** (rot tint — the curated limit
   lies under the worst case). The kn number rides in the word line, so color is never
   the only carrier — and the two rot states differ in visible text ("offen" vs
   "schwach · bis {limit} kn"). Wave per tile: same sector lookup over `waveSectors`
   (`Math.max` mirror of the wind rule), rendered de-emphasized ("Welle bis 0,4 m", "–"
   when uncovered). **Precision guard:** the grid samples 8 center degrees — a narrow
   curated sector could fall between them, so the exact curated sectors render verbatim
   as a caption legend below the grid (nothing the old table said is lost); the reading
   aid names the probe ("bewertet am Meltemi-Worst-Case der Planung, {twsKn} kn") so a
   tint never claims more than it is.
   **[TAG FOR PHILIPP: tint boundaries are the domain's own (`windHourAmpel` at
   `meltemiWorstCase.twsKn` = 30 kn). Confirm the probe wind, the word "schwach" for
   covered-but-under-worst-case, and that "schwach" and "offen" share the rot tint.]**
4. **Tile direction names: international notation (NE/E/SE), NOT the mock's NO/O/SO.**
   `compassPoint` (domain/geo.ts) speaks N/NNE/NE/…, and every reason string in the app
   says "aus NNE". One vocabulary per app — the tile that the reason "Wind 22 kn aus N"
   points at must be labeled the way the reason names it. **Resolution: tile labels via
   `compassPoint(centerDeg)`** (N, NE, E, SE, S, SW, W, NW). The mock's German notation
   is not adopted. **[TAG FOR PHILIPP: confirm NE/O-free notation on the tiles.]**
5. **StageEditor after 1.2 — what actually shipped (DayView.tsx lines 247–381):** visible,
   programmatically associated labels EXIST (label-wrapped selects/input — nothing to do);
   the apply error is an `.error-panel` with `role="alert"` but has **NO `aria-describedby`
   link and NO focus move** (EXPERIENCE StageEditor row demands both); the three buttons
   still carry `className="secondary"` (unstyled — 1.2's documented deviation 7); the
   "Standard" button hides the default value in a `title`
   ("Zurück auf den Standardwert ({stopHoursDefault} h)" — the value is dynamic).
   **Resolution: the delta is exactly (a) error div
   gets `id` + `tabIndex={-1}` + focus on failed apply, both selects get
   `aria-describedby` while the error shows; (b) `className="secondary"` →
   `"btn-secondary"` (3×); (c) "Standard" → visible label
   "Standard ({stopHoursDefault} h)", `title` deleted.** Nothing else in the editor.
6. **Alias retirement — measured, not assumed.** Grep on the baseline (each
   `var(--{alias})` outside the alias block itself): `--ink` **0** consumers (retire
   immediately); `--sans` 2 (both in the legacy auth block — die with (d)(i));
   `--serif` 5 → after this story's deletions exactly TWO remain: the global
   `h1, h2, h3 { font-family: var(--serif); … }` rule (styles.css ~437) and `.option-name`
   (~1701, a frozen DayView consumer). Since `--serif: var(--font-sans)` (identical
   computed value, "serif is eliminated" per the alias's own comment), BOTH declarations
   are retargeted to `var(--font-sans)` in place (zero visual change) — then `--serif`
   retires too.
   The other TEN aliases (`--creme`, `--creme-card`, `--navy`, `--navy-soft`, `--muted`,
   `--hairline`, `--gruen`, `--gelb`, `--rot`, `--grau`) keep real consumers in the frozen
   DayView sub-surfaces (`.badge`/`.leg-chip`/`.state-chip`, `.stage-map-*`, option/alt
   rows, `.versal`, `.reasons`, ampel dots) — they STAY, listed as remaining debt in the
   Dev Notes. The retirement task is a verification LOOP (delete blocks → re-grep every
   alias → delete only zero-consumer lines), not a fixed list, so a drifted baseline can't
   orphan a live variable.
7. **Platzdetail loading state: the "Lade Daten …" branch is unreachable for this view.**
   App.tsx initializes `view = { kind: 'tag' }` and Platzdetail is only entered from a
   rendered view (berth line, pin, row) — by then `snapshot`/`assessment` exist and are
   never cleared (react-query keeps the last data during refetch). 1.3 wrote "Platzdetail
   keeps the plain hint until 1.4"; **resolution: the plain hint STAYS (dead-in-practice
   branch, honest fallback), no PlaceDetailSkeleton is built.** Documented here so the
   epic closes without a silent gap.
8. **Mock deviations (binding-for-composition EXCEPTIONS):** (i) kicker "Westküste" — no
   data (VERIFY 1); (ii) night window 20:00–08:00 — params say 18/09 (VERIFY 2);
   (iii) quality names "Schutz/Versorgung/Atmosphäre" — the REAL schema qualities are
   `schoenheit`/`restaurant`/`badestrand` (place.ts `PlaceQualitiesSchema`), rendered as
   "Schönheit"/"Restaurant"/"Badestrand" exactly as the current view names them;
   (iv) tile direction words NO/O/SO — international notation per VERIFY 4; (v) the mock's
   per-tile wave values are *typische Wellenhöhe im Becken* — our curated data carries
   wave LIMITS (`maxM`), so the tile footnote reads "Welle bis {m} m" (a limit, not a
   typical value) and the legend says so; (vi) the mock's tertiary-ink kicker/section
   titles → `--ink-secondary` (tertiary never carries information — DESIGN ink rule);
   (vii) "Zurück zu Tag 1" — the view does not know the return context (App passes only
   `onBack`), and behavior preservation is binding: the label stays "← Zurück"
   (enriching it would need App plumbing — later polish, not this story);
   (viii) mock's `#a86c09` Gelb text — the token layer's `--ampel-gelb-text` (`#7a5306`)
   wins (single source).

## Acceptance Criteria

1. **Fused place card with the 3-tier hero ladder.** The view opens (after the Zurück
   button) with ONE white card (`--surface-card`, `--radius-lg`, `--shadow-2`,
   `overflow: hidden` so imagery clips to the 20px radius, **no border**) whose first
   element is the hero. The EXISTING ladder logic is reused (photo → satellite → gradient;
   same source ranking, same `resolveMapsEnv` guard from 1.3 — the env read at lines 49–52
   stays as is):
   (i) **Photo tier** (`place.photoUrl` set): 240px block, photo as cover background;
   (ii) **Satellite tier** (`maps.ok`, no photo): 240px block with the same `<Map>`
   (mapId, `defaultZoom={14}`, `mapTypeId="hybrid"`, `gestureHandling="cooperative"`,
   `disableDefaultUI` + zoom/fullscreen controls) and `AdvancedMarker` — the marker's
   `title={place.name}` prop is DELETED (meaning never in tooltips; the caption carries
   the name). The existing aerial-photo honesty note ("Luftbild der Bucht — Position … ·
   keine Seekarte …", verbatim) moves INSIDE the card as a footnote line directly under
   the hero (11.5px, `--ink-secondary`), no longer a floating paragraph;
   (iii) **Gradient tier** (no photo, `!maps.ok`): 190px block with the mock's navy-warm
   imagery gradient (`radial-gradient(ellipse 70% 60% at 78% 18%, rgba(229,137,60,0.18),
   transparent 65%), linear-gradient(160deg, #22303e 0%, #31424f 55%, #4a5561 100%)` —
   documented as IMAGERY values with a comment referencing the mock's hex block, not UI
   chrome) and a centered translucent chip **"Kein Foto verfügbar"**
   (`rgba(255,255,255,0.14)` pill, white 12.5px/600, backdrop-blur optional).
   **ALL three tiers** carry (a) the bottom scrim (96px,
   `linear-gradient(rgba(20,32,40,0) → rgba(20,32,40,0.55))`) and (b) the white caption
   "{place.name} — {Hafen|Marina|Bucht}" (13px/600, text-shadow), positioned bottom-left
   with `pointer-events: none` (the satellite map must keep its gestures — the existing
   comment's intent is preserved). The old `.place-hero*` classes and the navy gradient
   are gone.

2. **Title block inside the place card.** Under the hero, padded content: (i) overline
   kicker "{Insel} · {Hafen|Marina|Bucht}" (13px/700, +0.06em, uppercase,
   `--ink-secondary`; island via `island?.name ?? place.islandId` as today — VERIFY 1: no
   coast invented); (ii) a title row — the place name as the view's **`h1`** in display
   type (30px/800/−0.03em/1.05, `--ink-primary`) with the Nacht-`<AmpelBadge>` right
   (existing component, existing pill recipe; `night?.ampel ?? 'unbewertet'`); (iii) the
   **verdict sub-line** (caption type, `--ink-secondary`): "**{Ampel-Wort} — {Grund}** ·
   bewertet für {18:00–09:00}" — bold segment in `--ink-primary` 600; the Grund is
   `night.reasons[0]` when present, else the factual fallback per VERIFY-copy table
   (verdict—reason phrasing per Voice & Tone; window per VERIFY 2, from the pure helper);
   (iv) `place.description` as body text (15px/1.5, `--ink-primary`) when present.

3. **Warn-notes for standing caveats.** Each `place.warnings[]` entry renders inside the
   title card as a `components.warn-note` — the EXISTING `.warn-note` recipe from 1.2 with
   the **gelb** tint modifier (`--ampel-gelb-tint` bg + `--ampel-gelb-text`,
   `--radius-md`, body-sm): plain warning text, **no ⚠, no icon** (the `⚠ ` prefix dies —
   last emoji-as-meaning in the repo's views). The legacy `.warnung` class (JSX + CSS)
   is gone.

4. **Nacht-Ampel section card.** `h2.section-title` "Nacht-Ampel" (1.2 recipe), then a
   `.card-surface`: (i) head row — `<AmpelBadge>` + the window "{18:00}–{09:00}" (caption,
   tabular) + the day caption "Kommende Nacht · Tag {day} · {formatTripDayDate(…)}"
   (nothing the current heading said is lost); (ii) the **stat tile grid** — the EXISTING
   `.stat-grid`/`.stat-tile` recipe (2 columns, hairline divider grid, `--surface-inset`
   tiles, micro-label over 19px/700 tabular value): tile 1 "MAX. WIND" →
   "{Math.round(maxWindKn)} kn · {compass(windDirDeg)}", tile 2 "WELLE (OFFENE SEE)" →
   "{formatWaveM(maxWaveM)}" — each "–" when null (never an empty tile); (iii) under the
   grid the non-scoring honesty line as visible caption text (replaces the `.badge-info`
   `title` tooltip, meaning preserved): "Die Welle ist der Modellwert für die offene See
   am Ort des Platzes — im Hafen oder hinter der Landzunge gilt sie nicht; sie geht nicht
   in die Ampel ein."; (iv) `night.reasons` as the quiet `ul.reasons` list (all reasons,
   as today). The old `.badges`/`.badge`/`.badge-info` markup in this view is gone
   (the CSS classes stay — DayView consumes them).

5. **Qualitäten as 5-dot meters.** `h2.section-title` "Qualitäten", then a `.card-surface`
   with three rows (hairline-divided): quality name (14.5px/600, fixed-width column) ·
   the meter · the text value "{n} von 5" right-aligned (caption, tabular,
   `--ink-secondary`). The meter is five 9px circles: filled = `--ink-primary`, empty =
   `--surface-track` — **NEVER Ampel hues, never coral** (qualities are not verdicts);
   the meter element carries `role="img"` +
   `aria-label="{Name}: {n} von 5"` and its dots are presentation-only. Names/values from
   the REAL schema (VERIFY 8iii): "Schönheit" → `qualities.schoenheit`, "Restaurant" →
   `qualities.restaurant`, "Badestrand" → `qualities.badestrand` (0 is a valid value:
   "0 von 5", zero filled dots). The `stars()` function and every `●`/`○` string are gone
   from the repo.

6. **Schutzprofil sector tile grid.** `h2.section-title` "Sicherer Liegeplatz", then a
   `.card-surface`: (i) a 4-column grid (2 rows) of 8 sector tiles at `--radius-md`, one
   per main compass direction in compass order N → NW, each tile: direction micro-label
   (11px/600 uppercase, tabular) + rating word line (12.5px/700) + wave footnote
   (11.5px/400, tabular). Tint + word per VERIFY 3 from the tested helper (the rating is
   the domain's `windHourAmpel` at the worst-case probe — four words, three tints):
   **gut** (gruen tint, dir/word in `--ampel-gruen-text`, word "gut · bis {limit} kn"),
   **mäßig** (gelb tint, `--ampel-gelb-text`, "mäßig · bis {limit} kn"), **schwach**
   (rot tint, `--ampel-rot-text`, "schwach · bis {limit} kn" — covered, but the limit
   lies under the worst case), **offen** (rot tint, `--ampel-rot-text`, word "offen" —
   no covering sector); wave footnote "Welle bis {formatWaveM(maxM)}" /
   "–", in the tile's text color at reduced opacity or `--ink-secondary` — de-emphasized,
   non-scoring. Direction labels per VERIFY 4 (`compassPoint`: N/NE/E/SE/S/SW/W/NW).
   The grid is a `role="img"`-free plain list; each tile carries the full text visibly
   (color never the only carrier — the word lines differ per state, incl. between the
   two rot states).
   (ii) Below the grid, caption lines preserving everything the old table said:
   the reading aid "Schutz je Windrichtung aus den kuratierten Sektoren, bewertet am
   Meltemi-Worst-Case der Planung ({twsKn} kn); die Wellenwerte sind kuratierte Grenzen
   und bewerten nichts."; the scoring honesty line VERBATIM from
   today: "**Die Ampel hängt allein an den Wind-Sektoren.** Die Wellen-Zeilen stehen als
   kuratiertes Wissen über den Platz da, bewerten aber nichts: die Wellenhöhe des Modells
   gilt für die offene See, nicht für den Liegeplatz dahinter."; and the exact curated
   sectors as a legend (precision guard, VERIFY 3): one line per sector — "Wind
   {fromDeg}°–{toDeg}° ({compass}–{compass}){' · über Nord' when wrapped} bis {maxKn} kn"
   and "Welle …° bis {maxM} m" (the current table's cell content, re-set as footnote
   type).
   (iii) The source footnote closes the card VERBATIM: "Quelle: {shelter.sourceNote}.
   Enthält ggf. Material aus CruisersWiki (CC-Lizenz, Attribution erforderlich)."
   (11.5px, `--ink-secondary` — the CruisersWiki attribution lives here per the module
   head's Consistency Conventions; keep the module-head comment).
   `table.shelter-table` and `.sektor-inaktiv` (JSX + CSS) are gone.

7. **"← Zurück" as `.btn-text`, behavior identical.** The back button becomes
   `<button type="button" className="btn-text" onClick={onBack}>← Zurück</button>` in BOTH
   branches (valid + invalid). `onBack` and the App-side view restore (AD-11) are
   untouched; label unchanged (VERIFY 8vii). The `.back-link` class (JSX + CSS) is gone.

8. **States + heading hierarchy.** (i) **Invalid place** (`!place`): Zurück (AC 7), `h1` =
   `invalid?.name ?? placeId`, an `.error-panel` with `role="alert"` carrying the current
   copy ("Dieses Platz-Dokument ist ungültig und kann nicht bewertet werden (Ampel:
   unbewertet). {invalid.error}") **plus** the State-Patterns sentence "Keine kuratierten
   Schutzdaten — konservativ behandeln." (NFR6), and the Unbewertet `<AmpelBadge>`.
   (ii) **Valid place, unbewertet night** (no assessment entry or ampel unbewertet): the
   badge shows Unbewertet and the verdict sub-line reads "Unbewertet — {night.reasons[0]
   ?? 'keine Bewertung für diese Nacht'}" (a valid place ALWAYS has curated shelter —
   schema-mandatory — so the "Keine kuratierten Schutzdaten" copy belongs ONLY to the
   invalid branch; the qualities and shelter sections render normally). (iii) Headings:
   exactly one `h1` (place name / invalid name); "Nacht-Ampel", "Qualitäten", "Sicherer
   Liegeplatz" are `h2.section-title`; no `span.versal` remains in this view. (iv) The
   App-level loading hint for the platz branch stays as-is (VERIFY 7).

9. **SignInView / auth card restyle (close-out a).** `.auth-gate` centers on
   `--surface-page`; `.auth-card` becomes a white card (`--surface-card`, `--radius-lg`,
   `--shadow-2`, no border, `--space-card-padding`+); `.auth-brand` renders the wordmark
   treatment (19px/800/−0.02em, `Sail` in `--ink-primary` + `.wordmark-accent` span
   already in the JSX, sub-line "Kykladen · Törnplanung" as micro-label 11px/600
   letterspaced uppercase `--ink-secondary`); `.auth-lead` in body-sm `--ink-secondary`.
   The Google button becomes `className="btn-secondary google-button"` — the 1.1
   `.btn-secondary` pill recipe (white, hairline border, Level-1 shadow, ≥44px) plus a
   small `.google-button { width: 100%; gap: var(--space-3); justify-content: center; display: inline-flex; align-items: center; }`
   supplement; **the GoogleMark SVG (brand hexes sanctioned), the button label "Mit Google
   anmelden", `onClick={() => void signIn()}`, the `configured` gate and both error panels
   are untouched** (error panels already carry the 1.2 recipe; give both `role="alert"` if
   not present). The AuthGate "Anmeldung wird geprüft …" card restyles automatically (same
   classes — one implementation, State Patterns). The card stays centered text (gate
   screen — sanctioned exception, documented). Legacy `.google-button` recipe (navy fill,
   uppercase tracking, hover) and the serif `.auth-brand` are gone.

10. **StageEditor delta (close-out b — VERIFY 5, nothing more).** In DayView's
    StageEditor: (i) the error div gets `id="stage-editor-error"`, `tabIndex={-1}` and a
    ref; on a failed apply, after `setError(…)`, focus moves to it (effect or
    `requestAnimationFrame` after render); (ii) both selects carry
    `aria-describedby="stage-editor-error"` while `error !== null` (undefined otherwise);
    (iii) the three `className="secondary"` buttons become `className="btn-secondary"`;
    (iv) the "Standard" button reads "Standard ({snapshot.params.stopHoursDefault} h)"
    and its `title` is deleted. Labels are already visible/associated — no markup change
    to them. NOTHING else in the editor changes.

11. **Alias retirement (close-out c — VERIFY 6, as a verification loop).**
    (i) Delete the legacy CSS blocks this story orphans, each grep-verified against `.tsx`
    consumers FIRST: the legacy `.card` block starting ~line 518 (`.card`,
    `.card .headline`, `.card .beschreibung`, `.card .platz-zeile` ×2 — zero consumers
    since 1.2/1.3), the
    legacy auth recipes replaced in AC 9, the Platzdetail legacy blocks (`.place-hero` ×~6
    incl. `.place-hero-legende`, `table.shelter-table` ×3 + `.sektor-inaktiv`,
    `.badge-info`, `.warnung`, `.back-link`), and the dead rule `.alt-route
    button.secondary, .option-row button.secondary` (its consumers were swapped to
    `.btn-secondary` in 1.2; the last three `"secondary"` buttons die in AC 10).
    (ii) Then run the alias loop: for each of `--creme --creme-card --navy --navy-soft
    --ink --muted --hairline --gruen --gelb --rot --grau --serif --sans`, grep
    `var(--{alias})` across `src/` excluding the alias-block definition lines; **delete
    from the alias block exactly those with zero consumers** (expected per VERIFY 6:
    `--ink`, `--sans`, and — after retargeting the two surviving
    `font-family: var(--serif)` declarations (`h1,h2,h3` ~437 and `.option-name` ~1701)
    → `var(--font-sans)` (computed-identical, zero visual change) — `--serif`).
    (iii) Aliases with remaining consumers STAY in the block untouched; the Dev Agent
    Record lists them with consumer counts as remaining debt (expected: the ten in
    VERIFY 6). The alias block's header comment is updated to name the surfaces that
    still hold them (DayView calc panel / options / alt routes / badges / stage-map).
    (iv) Raw legacy hexes that die with the deleted blocks (`#4e6b8c`, `#d7dfea`, the
    `.warnung` `#e4cf9f` border) are gone; the remaining legacy-section hexes
    (`.badge-doppelschlag`, `.rueckweg-zeile`, `.state-chip` borders, `#eef`) stay per
    the 1.1 exception (frozen surfaces).

12. **Wind-barb aria-label (close-out d).** In MapView's `WindLayer`, the `.wind-barb`
    div gains `role="img"` and an `aria-label` with the SAME text as its `title`
    (`Wind aus {compass} ({deg}°), {kn} kn` — extract the template string to one local
    const used for both attributes). The `title` may stay (now redundant hover
    convenience, no longer title-only meaning); the 1.3 DoD invariant "exactly one
    `title=` in MapView" still holds. No other MapView change.

13. **Pure logic in tested helpers (AD-2).** New `src/ui/placeViewModel.ts` (pure, no
    React; imports only domain types + `windSectorLimitKn`/`windHourAmpel`/
    `sectorContains` from `domain/ampel.ts` and `compassPoint` from `domain/geo.ts`)
    exporting:
    `sectorTiles(shelter, params)` (8 tiles per VERIFY 3/4, incl. the wave lookup),
    `nightWindowLabel(startHour, endHour)` ("18:00–09:00", zero-padded),
    `nightVerdictLine(night)` (`{ ampel, text }` with the reason/fallback rule of AC 2/8).
    New `formatWaveM(m: number | null)` in `format.ts` ("0,3 m" — German decimal comma —
    / "–"). Both covered by new `src/ui/__tests__/placeViewModel.test.ts` + appended
    `format.test.ts` cases (append-only). **No component/DOM tests (AD-2).** The view
    calls helpers and renders — no rating/threshold logic inline in JSX.

14. **Definition of done / non-regression.** (a) `npm test` green — all existing tests
    untouched (append-only for format), new `placeViewModel.test.ts` green; (b)
    `npm run build` (`tsc --noEmit && vite build`) green (`noUnusedLocals`: deleting
    `stars()` and the badges JSX must also delete imports that die with them); (c) all DoD
    greps in Dev Notes clean, incl. the alias-retirement loop output pasted into the Dev
    Agent Record; (d) manual smoke via `npm run dev` at 390px and desktop: Platzdetail
    from berth line AND from a map pin (photo tier if a photoUrl exists, satellite tier
    with env set, gradient tier with env unset — check scrim/caption/chip on each, radius
    clipping, satellite pan/zoom still works with the caption overlaying) → verdict
    sub-line + warn-notes → night tiles + reasons → quality meters (incl. a 0-value) →
    sector grid vs. the old table's data (same sectors legible in the legend) → "← Zurück"
    returns to the exact prior view in both entry paths → invalid-place branch (fake id) →
    sign-in gate restyled (button flow works) → StageEditor failed apply focuses the error
    → wind-barb announces via aria-label (devtools accessibility pane); (e) all NEW
    strings German; no emoji as meaning carriers anywhere in `src/ui/views/`.

## Tasks / Subtasks

- [ ] **Task 1 — `placeViewModel.ts` + `formatWaveM` + tests (write first)** (AC: 13)
  - [ ] 1.1 Implement `sectorTiles` / `nightWindowLabel` / `nightVerdictLine` per the
        reference in Dev Notes; `placeViewModel.test.ts` red → green (cases: wrap sector
        330–60 covers N; full-circle 0–360 covers all 8; uncovered → offen/null; with
        `DEFAULT_PARAMS` (meltemi 30, Reserve 3): limit 35 → gut, limit 33 → gut
        (boundary: 30 ≤ 33−3), limit 30 → mäßig, limit 20 → schwach; wave lookup incl.
        most-generous-wins overlap + null; window label zero-padding "18:00–09:00";
        verdict-line fallbacks for gruen / unbewertet / undefined night, reason
        passthrough).
  - [ ] 1.2 `formatWaveM` in `format.ts`; append `format.test.ts` cases ("0,3 m", "1,0 m",
        null → "–"). Do not modify existing cases.
- [ ] **Task 2 — CSS: Platzdetail redesign block + deletions** (AC: 1–8, 11i)
  - [ ] 2.1 Add the reference blocks (Dev Notes) under
        `/* ---- place detail (redesign, Story 1.4) ---- */`: `.place-card`, `.hero` +
        tier/scrim/caption/chip classes, `.hero-legende`, `.place-head`/`.place-kicker`/
        `.place-title-row`/`.place-title`/`.ampel-sub`/`.place-desc`, `.night-head`/
        `.night-window`, `.quality-row`/`.meter`/`.quality-value`, `.shelter-grid`/
        `.sector` + three tint modifiers, `.shelter-legend`/`.shelter-source`.
  - [ ] 2.2 Delete (grep each against `.tsx` first): `.place-hero` block, `shelter-table`
        block + `.sektor-inaktiv`, `.badge-info`, `.warnung`, `.back-link`, the legacy
        `.card` block (~518–556), the dead `.alt-route button.secondary, .option-row
        button.secondary` rule. Keep `.badges`/`.badge`/`.badge-doppelschlag`/`.versal`/
        `.reasons`/`.beschreibung`-scoped rules — DayView consumes them.
- [ ] **Task 3 — PlaceDetailView rebuild** (AC: 1, 2, 3, 4, 5, 6, 7, 8)
  - [ ] 3.1 Restructure `PlaceHero` → hero-inside-card (3 tiers, shared scrim + caption
        component, fallback chip, satellite legende as in-card footnote, marker `title`
        deleted); keep the source-ranking doc comment + the pointer-events rationale.
  - [ ] 3.2 Title block (kicker, `h1` display, AmpelBadge, verdict sub-line via
        `nightVerdictLine` + `nightWindowLabel`, description) + warn-notes.
  - [ ] 3.3 Nacht-Ampel card (`.stat-grid` reuse, wave honesty caption replacing the
        `title`, reasons list, day/date caption).
  - [ ] 3.4 Qualitäten meters (5-dot, `role="img"` aria-labels, "n von 5"); delete
        `stars()`.
  - [ ] 3.5 Schutzprofil grid via `sectorTiles(place.shelter, snapshot.params)` +
        captions/legend/source footnote.
  - [ ] 3.6 Zurück → `.btn-text` (both branches); invalid branch per AC 8; heading pass
        (h1/h2, `.versal` gone from this view).
- [ ] **Task 4 — SignInView / auth restyle** (AC: 9)
  - [ ] 4.1 JSX: button `className="btn-secondary google-button"`; `role="alert"` on the
        two error panels if missing. Flow/logo untouched.
  - [ ] 4.2 CSS: rewrite `.auth-gate`/`.auth-card`/`.auth-brand`(+small)/`.auth-lead`;
        replace `.google-button` recipe with the width/gap supplement; keep
        `.auth-card code` (restyled minimal). AuthGate card inherits (verify visually).
- [ ] **Task 5 — StageEditor delta** (AC: 10) — exactly VERIFY 5's four points, nothing
      else in DayView.
- [ ] **Task 6 — Wind-barb aria-label** (AC: 12) — one-const/two-attributes edit in
      MapView's `WindLayer`; keep the existing comment about the number living in the
      tooltip, extend it to name the aria-label.
- [ ] **Task 7 — Alias retirement loop** (AC: 11)
  - [ ] 7.1 After Tasks 2–4: retarget the two surviving `font-family: var(--serif)`
        declarations (`h1,h2,h3` and `.option-name`) → `var(--font-sans)`
        (computed-identical).
  - [ ] 7.2 Run the loop (Dev Notes grep); delete zero-consumer alias lines
        (expected: `--ink`, `--sans`, `--serif`); update the alias-block comment; record
        kept aliases + counts in the Dev Agent Record as remaining debt.
- [ ] **Task 8 — Verify DoD** (AC: 14)
  - [ ] 8.1 All DoD greps; `npm test`; `npm run build`.
  - [ ] 8.2 Manual smoke per AC 14(d) — **if headless, substitute build + greps and hand
        the browser smoke list to the reviewer** (same protocol as 1.1–1.3).

## Dev Notes

### Stack and constraints — read first (unchanged from 1.1–1.3)

- **No new dependencies.** React 19.2 + Vite 8.2 + TS 5.9 + vanilla CSS custom properties;
  `@vis.gl/react-google-maps` for the satellite tier (already imported here).
- **Layering:** `ui` imports `domain` types AND pure functions (`format.ts` /
  `dayViewModel.ts` precedent) — `placeViewModel.ts` imports `windSectorLimitKn`,
  `windHourAmpel`, `sectorContains` (domain/ampel.ts), `compassPoint` (domain/geo.ts).
  It computes DISPLAY aggregation from curated data + params; **it never re-derives a
  night verdict** — the verdict is `assessment.nightAmpeln[...]`, read, not computed;
  the sector tiles' rating is `windHourAmpel` itself at the worst-case probe, no
  UI-invented threshold (AD-2).
- **AD-11/AD-12:** zero new view state beyond what exists; zero trip actions; `onBack` /
  `onOpenPlace` contracts untouched.
- **tsconfig:** `strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` —
  deleting `stars()` and the badge JSX must delete dead imports.
- **Formatting:** reuse `format.ts` (`compass`, `formatTripDayDate`); the ONLY addition is
  `formatWaveM`. Tabular numerals on all quantitative text; German decimal comma.
- **tokens:** no new TS color constants needed; the fallback-gradient hexes live in CSS as
  documented IMAGERY values (mock hex block reference), not chrome — the TS raw-hex grep
  is unaffected.
- **German UI / English code**; commit style: short imperative sentence, no prefix tags.

### German copy — the exact strings

| Where | String |
|---|---|
| Back button | `← Zurück` (unchanged) |
| Hero caption (all tiers) | `{place.name} — {Hafen\|Marina\|Bucht}` |
| Fallback chip | `Kein Foto verfügbar` |
| Satellite footnote (verbatim, moved) | `Luftbild der Bucht — Position {lat}° N, {lon}° E. Zoomen und verschieben ist möglich; der Ausschnitt ist keine Seekarte und ersetzt keine Hafenhandbuch-Angabe.` |
| Kicker | `{Insel} · {Hafen\|Marina\|Bucht}` |
| Verdict sub-line | `{Ampel-Wort} — {Grund}` + ` · bewertet für {18:00–09:00}` |
| Grund fallback gruen | `Wind der Nacht innerhalb der Schutzsektoren` |
| Grund fallback unbewertet / missing night | `keine Bewertung für diese Nacht` |
| Section titles (h2) | `Nacht-Ampel` · `Qualitäten` · `Sicherer Liegeplatz` |
| Night day caption | `Kommende Nacht · Tag {day} · {formatTripDayDate(…)}` |
| Stat labels | `Max. Wind` · `Welle (offene See)` (micro-label uppercases visually) |
| Stat values | `{Math.round(kn)} kn · {compass}` · `{formatWaveM(m)}`; missing → `–` |
| Wave honesty caption | `Die Welle ist der Modellwert für die offene See am Ort des Platzes — im Hafen oder hinter der Landzunge gilt sie nicht; sie geht nicht in die Ampel ein.` |
| Quality names | `Schönheit` · `Restaurant` · `Badestrand` |
| Quality value / aria | `{n} von 5` / `aria-label="{Name}: {n} von 5"` |
| Sector words | `gut · bis {limit} kn` / `mäßig · bis {limit} kn` / `schwach · bis {limit} kn` / `offen` |
| Sector wave footnote | `Welle bis {formatWaveM(maxM)}` / `–` |
| Shelter reading aid | `Schutz je Windrichtung aus den kuratierten Sektoren, bewertet am Meltemi-Worst-Case der Planung ({twsKn} kn); die Wellenwerte sind kuratierte Grenzen und bewerten nichts.` |
| Shelter scoring honesty (verbatim, kept) | `Die Ampel hängt allein an den Wind-Sektoren. Die Wellen-Zeilen stehen als kuratiertes Wissen über den Platz da, bewerten aber nichts: die Wellenhöhe des Modells gilt für die offene See, nicht für den Liegeplatz dahinter.` |
| Sector legend rows (ex-table cells) | `Wind {from}°–{to}° ({compass}–{compass})[ · über Nord] bis {maxKn} kn` / `Welle {from}°–{to}° (…)[ · über Nord] bis {maxM} m` |
| Source footnote (verbatim, kept) | `Quelle: {sourceNote}. Enthält ggf. Material aus CruisersWiki (CC-Lizenz, Attribution erforderlich).` |
| Invalid place | current sentence (kept) + `Keine kuratierten Schutzdaten — konservativ behandeln.` |
| Auth (all kept) | `Kykladen · Törnplanung` · lead paragraph · `Mit Google anmelden` · `Anmeldung wird geprüft …` · Firebase error text |
| StageEditor Standard button | `Standard ({stopHoursDefault} h)` (title deleted) |
| Wind-barb aria-label | `Wind aus {compass} ({deg}°), {kn} kn` (same as the title) |

### `src/ui/placeViewModel.ts` — reference implementation (new file, tested)

```ts
/**
 * Pure Platzdetail view-model derivations (Story 1.4) — tested, no React.
 * Reuses the domain's own sector functions (AD-2: the semantics live in
 * domain/ampel.ts; here is only the 8-direction DISPLAY sampling — the rating
 * per tile is windHourAmpel itself, probed at the app's worst-case planning
 * wind, so no threshold is invented here). The tiles summarize the curated
 * statement — the exact sectors render verbatim as a legend below the grid,
 * so a narrow sector between two center degrees is never silently lost.
 */
import { sectorContains, windHourAmpel, windSectorLimitKn } from '../domain/ampel.ts';
import { compassPoint } from '../domain/geo.ts';
import type { Params } from '../domain/schema/params.ts';
import type { ShelterProfile, WaveSector } from '../domain/schema/shelter.ts';
import type { PlaceNightAssessment } from '../domain/schema/snapshot.ts';
import type { Ampel } from '../domain/schema/common.ts';

export type SectorRating = 'gut' | 'maessig' | 'schwach' | 'offen';

export interface SectorTile {
  /** International notation via compassPoint — the reasons' vocabulary. */
  dir: string;
  centerDeg: number;
  rating: SectorRating;
  /** Curated wind limit governing this direction; null = luv (kein Sektor). */
  limitKn: number | null;
  /** Curated wave limit (non-scoring); null = uncovered. */
  waveMaxM: number | null;
}

const TILE_DEGREES = [0, 45, 90, 135, 180, 225, 270, 315];

function waveLimitM(sectors: WaveSector[], deg: number): number | null {
  // Mirror of windSectorLimitKn's documented most-generous-wins decision.
  const matching = sectors.filter((s) => sectorContains(s, deg));
  return matching.length > 0 ? Math.max(...matching.map((s) => s.maxM)) : null;
}

/**
 * Rating = die Domänen-Funktion windHourAmpel am Meltemi-Worst-Case der
 * eigenen Planung (params.meltemiWorstCase.twsKn) — KEINE eigene Schwelle:
 *   gruen → gut (hält den Worst-Case einschließlich der gelbReserveKn),
 *   gelb  → mäßig (Worst-Case erreicht die Grenze, keine Reserve mehr),
 *   rot   → schwach (kuratierte Grenze liegt unter dem Worst-Case),
 *   kein Sektor → offen (Luv-Regel, nie grün) — vorab kurzgeschlossen, damit
 *   "offen" nie vom Probe-Wind abhängt.
 */
export function sectorTiles(shelter: ShelterProfile, params: Params): SectorTile[] {
  return TILE_DEGREES.map((centerDeg) => {
    const limitKn = windSectorLimitKn(shelter.windSectors, centerDeg);
    let rating: SectorRating;
    if (limitKn === null) {
      rating = 'offen';
    } else {
      const verdict = windHourAmpel(
        shelter.windSectors,
        centerDeg,
        params.meltemiWorstCase.twsKn,
        params,
      );
      rating = verdict === 'gruen' ? 'gut' : verdict === 'gelb' ? 'maessig' : 'schwach';
    }
    return {
      dir: compassPoint(centerDeg),
      centerDeg,
      rating,
      limitKn,
      waveMaxM: waveLimitM(shelter.waveSectors, centerDeg),
    };
  });
}

/** "18:00–09:00" — the real AD-9 window from params, zero-padded, tabular. */
export function nightWindowLabel(startHour: number, endHour: number): string {
  const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return `${pad(startHour)}–${pad(endHour)}`;
}

/** Verdict — reason for the title sub-line (Voice & Tone: Wort zuerst). */
export function nightVerdictLine(night: PlaceNightAssessment | undefined): {
  ampel: Ampel;
  text: string;
} {
  const ampel = night?.ampel ?? 'unbewertet';
  const reason = night?.reasons[0];
  if (reason) return { ampel, text: reason };
  return {
    ampel,
    text:
      ampel === 'gruen'
        ? 'Wind der Nacht innerhalb der Schutzsektoren'
        : 'keine Bewertung für diese Nacht',
  };
}
```

`formatWaveM` in `format.ts` (next to `formatKn` — same "–" convention, German comma):

```ts
export function formatWaveM(m: number | null): string {
  if (m === null) return '–';
  return `${m.toFixed(1).replace('.', ',')} m`;
}
```

Rating → presentation mapping lives in the VIEW (one lookup object, no logic):
`{ gut: { cls: 'gruen', word: (kn) => `gut · bis ${kn} kn` }, maessig: { cls: 'gelb', … },
schwach: { cls: 'rot', word: (kn) => `schwach · bis ${kn} kn` },
offen: { cls: 'rot', word: () => 'offen' } }`.

### Reference CSS (add under `/* ---- place detail (redesign, Story 1.4) ---- */`; delete the legacy blocks per Task 2.2)

```css
/* ---- fused place card + hero ladder ---- */
.place-card {
  background: var(--surface-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-2);
  overflow: hidden;            /* imagery clips to the 20px radius (DESIGN Shapes) */
  margin-top: var(--space-3);
}
.hero { position: relative; height: 240px; overflow: hidden; }
.hero.fallback { height: 190px; }
.hero-photo { position: absolute; inset: 0; background-size: cover; background-position: center; }
.hero-map-canvas { position: absolute; inset: 0; }
/* IMAGERY values (mock keyscreen-ortsdetail hex block "Hero-Fallback"), not UI chrome:
   navy-warm gradient + a whisper of accent-gradient-end warmth. */
.hero-fallback-bg {
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 70% 60% at 78% 18%, rgba(229, 137, 60, 0.18) 0%, rgba(229, 137, 60, 0) 65%),
    linear-gradient(160deg, #22303e 0%, #31424f 55%, #4a5561 100%);
}
.hero-scrim {
  position: absolute; inset: auto 0 0 0; height: 96px;
  background: linear-gradient(180deg, rgba(20, 32, 40, 0) 0%, rgba(20, 32, 40, 0.55) 100%);
  pointer-events: none;
}
.hero-caption {
  position: absolute; left: var(--space-5); right: var(--space-5); bottom: var(--space-4);
  color: #fff;
  font: 600 13px/1.35 var(--font-sans); letter-spacing: 0.01em;
  text-shadow: 0 1px 3px rgba(20, 32, 40, 0.5);
  pointer-events: none;        /* the satellite tier's gestures belong to the map */
}
.hero-fallback-chip {
  position: absolute; left: 50%; top: 44%; transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.14); color: #fff;
  font: 600 12.5px/1.35 var(--font-sans);
  padding: 7px 14px; border-radius: var(--radius-full);
  backdrop-filter: blur(2px); white-space: nowrap;
}
.hero-legende {                /* satellite honesty note, in-card footnote */
  padding: var(--space-3) var(--space-5) 0;
  font: 400 11.5px/1.4 var(--font-sans); color: var(--ink-secondary);
}

/* ---- title block ---- */
.place-head { padding: var(--space-4) var(--space-5) 0; }
.place-kicker {
  font: 700 13px/1.3 var(--font-sans); letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--ink-secondary);
}
.place-title-row {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: var(--space-3); margin-top: var(--space-1);
}
.place-title {
  font: 800 30px/1.05 var(--font-sans); letter-spacing: -0.03em;
  color: var(--ink-primary); margin: 0;
}
.place-title-row .ampel { flex: none; margin-top: var(--space-1); }
.ampel-sub {
  margin-top: var(--space-2);
  font: 400 12.5px/1.35 var(--font-sans); color: var(--ink-secondary);
  font-variant-numeric: tabular-nums;
}
.ampel-sub strong { font-weight: 600; color: var(--ink-primary); }
.place-desc { padding: var(--space-3) var(--space-5) 0; font: 400 15px/1.5 var(--font-sans); color: var(--ink-primary); }
.place-card .warn-note { margin: var(--space-3) var(--space-5) 0; }
.place-card-pad { height: var(--space-5); }

/* ---- night section head ---- */
.night-head { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.night-window { font: 400 12.5px/1.35 var(--font-sans); color: var(--ink-secondary); font-variant-numeric: tabular-nums; }
.night-caption { font: 400 12.5px/1.35 var(--font-sans); color: var(--ink-secondary); font-variant-numeric: tabular-nums; }
.wave-note { margin-top: var(--space-3); font: 400 12.5px/1.35 var(--font-sans); color: var(--ink-secondary); }

/* ---- quality meters (NEVER Ampel/coral — qualities are not verdicts) ---- */
.quality-row {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) 0; border-bottom: 1px solid var(--border-hairline);
}
.quality-row:first-of-type { padding-top: var(--space-1); }
.quality-row:last-of-type { border-bottom: 0; padding-bottom: var(--space-1); }
.quality-name { font: 600 14.5px/1.35 var(--font-sans); width: 108px; flex: none; color: var(--ink-primary); }
.meter { display: inline-flex; gap: 5px; align-items: center; }
.meter i { width: 9px; height: 9px; border-radius: var(--radius-full); background: var(--surface-track); }
.meter i.fill { background: var(--ink-primary); }
.quality-value {
  margin-left: auto; font: 400 12.5px/1.35 var(--font-sans);
  color: var(--ink-secondary); font-variant-numeric: tabular-nums; white-space: nowrap;
}

/* ---- shelter sector grid ---- */
.shelter-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-2); }
.sector { border-radius: var(--radius-md); padding: var(--space-2); text-align: center; }
.sector .dir {
  font: 600 11px/1.3 var(--font-sans); letter-spacing: 0.07em; text-transform: uppercase;
  opacity: 0.8;
}
.sector .word { font: 700 12.5px/1.35 var(--font-sans); margin-top: 2px; font-variant-numeric: tabular-nums; }
.sector .wave { font: 400 11.5px/1.4 var(--font-sans); margin-top: var(--space-1); opacity: 0.75; font-variant-numeric: tabular-nums; }
.sector.gruen { background: var(--ampel-gruen-tint); color: var(--ampel-gruen-text); }
.sector.gelb  { background: var(--ampel-gelb-tint);  color: var(--ampel-gelb-text); }
.sector.rot   { background: var(--ampel-rot-tint);   color: var(--ampel-rot-text); }
.shelter-legend { margin-top: var(--space-3); font: 400 12.5px/1.4 var(--font-sans); color: var(--ink-secondary); }
.shelter-legend strong { font-weight: 600; color: var(--ink-primary); }
.shelter-sectors { margin: var(--space-2) 0 0; padding-left: 1.1rem; font: 400 11.5px/1.5 var(--font-sans); color: var(--ink-secondary); font-variant-numeric: tabular-nums; }
.shelter-source { margin-top: var(--space-3); font: 400 11.5px/1.4 var(--font-sans); color: var(--ink-secondary); }

/* ---- auth (redesign — replaces the navy/serif gate) ---- */
.auth-gate {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  padding: var(--space-7) var(--space-page-margin);
  background: var(--surface-page);
}
.auth-card {
  width: 100%; max-width: 420px;
  background: var(--surface-card); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-2);
  padding: var(--space-7) var(--space-6);
  text-align: center;          /* gate screen — sanctioned centering exception */
}
.auth-brand { font: 800 19px/1.2 var(--font-sans); letter-spacing: -0.02em; color: var(--ink-primary); }
.auth-brand small {
  display: block; margin-top: var(--space-2);
  font: 600 11px/1.3 var(--font-sans); letter-spacing: 0.07em; text-transform: uppercase;
  color: var(--ink-secondary);
}
.auth-lead { margin: var(--space-5) 0; font: 400 14px/1.45 var(--font-sans); color: var(--ink-secondary); }
.google-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-3); width: 100%; }
.auth-card .error-panel { margin: var(--space-4) 0 0; text-align: left; }
.auth-card code { font-size: 12.5px; word-break: break-all; }
```

Notes: `.wordmark-accent` (coral `Greece`) already exists from 1.1 and the JSX already
emits it inside `.auth-brand`. The two 2px-scrim/gradient rgba values are the mock's
imagery documentation, kept as comments. The `.place-card .warn-note` margin scoping keeps
1.2's hero-card `.warn-note` margins untouched.

### Reference JSX skeleton for PlaceDetailView (adapt, don't paste blindly)

```tsx
const night = assessment.nightAmpeln[place.id]?.[day];
const verdict = nightVerdictLine(night);
const windowLabel = nightWindowLabel(
  snapshot.params.nightStartHourAthens,
  snapshot.params.nightEndHourAthens,
);
const tiles = sectorTiles(place.shelter, snapshot.params);
const typeLabel = /* unchanged derivation */;

<button type="button" className="btn-text" onClick={onBack}>← Zurück</button>

<section className="place-card">
  <PlaceHero place={place} typeLabel={typeLabel} />          {/* AC 1: tier + scrim + caption */}
  {/* satellite tier only: */} {heroTier === 'map' && <p className="hero-legende">Luftbild der Bucht — …</p>}
  <div className="place-head">
    <div className="place-kicker">{islandLabel} · {typeLabel}</div>
    <div className="place-title-row">
      <h1 className="place-title">{place.name}</h1>
      <AmpelBadge ampel={verdict.ampel} />
    </div>
    <p className="ampel-sub">
      <strong>{AMPEL_LABEL[verdict.ampel]} — {verdict.text}</strong> · bewertet für {windowLabel}
    </p>
  </div>
  {place.description && <p className="place-desc">{place.description}</p>}
  {place.warnings?.map((w) => (
    <div className="warn-note gelb" key={w}>{w}</div>
  ))}
  <div className="place-card-pad" />
</section>

<h2 className="section-title">Nacht-Ampel</h2>
<section className="card-surface">
  <div className="night-head">
    <AmpelBadge ampel={verdict.ampel} />
    <span className="night-window">{windowLabel}</span>
    <span className="night-caption">Kommende Nacht · Tag {day} · {formatTripDayDate(snapshot.params.tripStartDate, day)}</span>
  </div>
  <div className="stat-grid">
    <div className="stat-tile">
      <div className="label">Max. Wind</div>
      <div className="value">
        {night?.maxWindKn != null ? <>{Math.round(night.maxWindKn)} kn · {compass(night.windDirDeg)}</> : '–'}
      </div>
    </div>
    <div className="stat-tile">
      <div className="label">Welle (offene See)</div>
      <div className="value">{formatWaveM(night?.maxWaveM ?? null)}</div>
    </div>
  </div>
  <p className="wave-note">Die Welle ist der Modellwert für die offene See am Ort des Platzes — im Hafen oder hinter der Landzunge gilt sie nicht; sie geht nicht in die Ampel ein.</p>
  {night && night.reasons.length > 0 && (
    <ul className="reasons">{night.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
  )}
</section>

<h2 className="section-title">Qualitäten</h2>
<section className="card-surface">
  {([['Schönheit', place.qualities.schoenheit],
     ['Restaurant', place.qualities.restaurant],
     ['Badestrand', place.qualities.badestrand]] as const).map(([name, n]) => (
    <div className="quality-row" key={name}>
      <span className="quality-name">{name}</span>
      <span className="meter" role="img" aria-label={`${name}: ${n} von 5`}>
        {[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < n ? 'fill' : undefined} />)}
      </span>
      <span className="quality-value">{n} von 5</span>
    </div>
  ))}
</section>

<h2 className="section-title">Sicherer Liegeplatz</h2>
<section className="card-surface">
  <div className="shelter-grid">
    {tiles.map((t) => {
      const p = SECTOR_PRESENTATION[t.rating];   // { cls, word } lookup, view-local
      return (
        <div className={`sector ${p.cls}`} key={t.centerDeg}>
          <div className="dir">{t.dir}</div>
          <div className="word">{p.word(t.limitKn)}</div>
          <div className="wave">{t.waveMaxM !== null ? `Welle bis ${formatWaveM(t.waveMaxM)}` : '–'}</div>
        </div>
      );
    })}
  </div>
  <p className="shelter-legend">Schutz je Windrichtung aus den kuratierten Sektoren, bewertet am Meltemi-Worst-Case der Planung ({snapshot.params.meltemiWorstCase.twsKn} kn); die Wellenwerte sind kuratierte Grenzen und bewerten nichts.</p>
  <p className="shelter-legend"><strong>Die Ampel hängt allein an den Wind-Sektoren.</strong> Die Wellen-Zeilen stehen als kuratiertes Wissen über den Platz da, bewerten aber nichts: die Wellenhöhe des Modells gilt für die offene See, nicht für den Liegeplatz dahinter.</p>
  <ul className="shelter-sectors">
    {place.shelter.windSectors.map((s, i) => (
      <li key={`w${i}`}>Wind {s.fromDeg}°–{s.toDeg}° ({compass(s.fromDeg)}–{compass(s.toDeg)}){s.fromDeg > s.toDeg ? ' · über Nord' : ''} bis {s.maxKn} kn</li>
    ))}
    {place.shelter.waveSectors.map((s, i) => (
      <li key={`s${i}`}>Welle {s.fromDeg}°–{s.toDeg}° ({compass(s.fromDeg)}–{compass(s.toDeg)}){s.fromDeg > s.toDeg ? ' · über Nord' : ''} bis {s.maxM} m</li>
    ))}
  </ul>
  <p className="shelter-source">Quelle: {place.shelter.sourceNote}. Enthält ggf. Material aus CruisersWiki (CC-Lizenz, Attribution erforderlich).</p>
</section>
```

Hero tiers (inside `PlaceHero`, ladder ranking unchanged — keep the doc comment):

```tsx
const caption = <div className="hero-caption">{place.name} — {typeLabel}</div>;

if (place.photoUrl) return (
  <div className="hero">
    <div className="hero-photo" style={{ backgroundImage: `url(${place.photoUrl})` }} />
    <div className="hero-scrim" /> {caption}
  </div>
);
if (maps.ok) return (
  <div className="hero">
    <div className="hero-map-canvas">
      <APIProvider apiKey={maps.env.apiKey}>
        <Map className="hero-map-canvas" mapId={maps.env.mapId} defaultCenter={position}
             defaultZoom={14} mapTypeId="hybrid" gestureHandling="cooperative"
             disableDefaultUI zoomControl fullscreenControl>
          <AdvancedMarker position={position} />   {/* title prop deleted (AC 1ii) */}
        </Map>
      </APIProvider>
    </div>
    <div className="hero-scrim" /> {caption}
  </div>
);
return (
  <div className="hero fallback">
    <div className="hero-fallback-bg" />
    <div className="hero-fallback-chip">Kein Foto verfügbar</div>
    <div className="hero-scrim" /> {caption}
  </div>
);
```

(Scrim and caption carry `pointer-events: none` via CSS, so the satellite tier keeps its
pan/zoom — the existing rationale comment moves to the new classes. `PlaceHero` should
also report which tier it rendered — return the tier or lift the `maps.ok`/`photoUrl`
check into the parent — so the card knows whether to append `.hero-legende`.)

StageEditor error wiring (Task 5 — the whole delta):

```tsx
const errorRef = useRef<HTMLDivElement | null>(null);
const apply = (islandId: string | null, placeId?: string) => {
  setError(null);
  const ok = editStage(stage.day, islandId, placeId);
  if (!ok) {
    setError('Mit diesem Ziel …');                 // text unchanged
    requestAnimationFrame(() => errorRef.current?.focus());
    return;
  }
  onClose();
};
// selects: aria-describedby={error ? 'stage-editor-error' : undefined}
// error panel:
{error && (
  <div className="error-panel" role="alert" id="stage-editor-error" tabIndex={-1} ref={errorRef}>
    {error}
  </div>
)}
```

Wind-barb (Task 6, MapView `WindLayer`):

```tsx
const barbText = `Wind aus ${compass(p.dirDeg)} (${Math.round(p.dirDeg)}°), ${formatKn(p.knots)}`;
<div className="wind-barb" role="img" aria-label={barbText} title={barbText}>
```

### Source tree — CURRENT STATE / CHANGES / PRESERVE per file

**`src/ui/views/PlaceDetailView.tsx` (257 lines — read it fully)**
- CURRENT: module head (FR5 + CruisersWiki attribution note); `stars()` (●○ strings);
  `PlaceHero` (3-tier ladder: photoUrl bg-div → `resolveMapsEnv`-guarded hybrid Map with
  `AdvancedMarker title=` → navy-gradient div; caption `.place-hero-caption` with
  `.versal` + `.headline`; satellite legende as sibling `<p>`); main component — day/
  place/invalid lookups, invalid branch (`.back-link`, h1, `.error-panel`, badge), island/
  night/typeLabel derivations, `.back-link`, hero, description `.beschreibung`, `⚠`
  `.warnung` blocks, Nacht-Ampel `.section` (versal + h2 + badge + `.badges` with wind
  badge and `title`-tooltip wave `.badge-info` + `.reasons` + window paragraph),
  Qualitäten `.section` (badges with `stars()`), shelter `.section`
  (`table.shelter-table` + `.sektor-inaktiv` wave rows + two honesty paragraphs +
  source note).
- CHANGES: Task 3 — full rebuild per AC 1–8. Every legacy class emission
  (`place-hero*`, `versal`, `headline`, `beschreibung`, `badges`, `badge`, `badge-info`,
  `warnung`, `back-link`, `shelter-table`, `sektor-inaktiv`, `section`) leaves this file;
  `stars()` deleted; imports add `AMPEL_LABEL`, `formatWaveM`, `placeViewModel` helpers.
- PRESERVE: the module-head attribution comment (update wording if needed, keep the
  Consistency-Conventions pointer); the hero source-ranking doc comment (tiers unchanged
  in RANK); the `resolveMapsEnv` call + Story-1.3 comment (lines 46–52) byte-identical;
  the pointer-events rationale (moves to the new classes); the invalid/`unbewertet`
  semantics; `onBack`/`onOpenPlace`-free prop surface (this view takes no `onOpenPlace`);
  all German honesty copy named PRESERVE in the ACs.

**`src/ui/styles.css` (2275 lines)**
- CURRENT: token layer + alias block (lines 89–104); legacy `.versal`/`h1,h2,h3` serif
  rule (427–449); `.section`/`.badges`/`.badge` (451–478); restyled `.ampel` (480–510);
  legacy `.card` block (~518–556, **zero `.tsx` consumers** — verify again);
  `.reasons`/`.state-chip`/`.leg-chip`; 1.2 error/hint; legacy auth block (626–704); 1.3
  map block; stage-map block (1182–1239); place-detail legacy block (1241–1389:
  `.place-hero`×~6, `shelter-table`×3+`.sektor-inaktiv`, `.badge-doppelschlag`,
  `.rueckweg-zeile`, `.badge-info`, `.warnung`, `.back-link`); footer; 1.2 day-view
  redesign blocks (incl. `.stat-grid`/`.stat-tile`, `.warn-note`, `.section-title`,
  `.card-surface`); dead `.alt-route button.secondary, .option-row button.secondary`
  (~1763).
- CHANGES: Task 2 (add place-detail + auth redesign blocks; delete the listed legacy
  blocks) + Task 7 (retarget line ~437 to `var(--font-sans)`; delete zero-consumer alias
  lines; update the alias-block comment).
- PRESERVE: `.versal`/`.section`/`.badges`/`.badge`/`.badge-doppelschlag`/
  `.rueckweg-zeile`/`.reasons`/`.state-chip`/`.leg-chip`/`.stage-map*`/`.breakdown*`/
  `.wind-basis*`/`.option-*`/`.alt-*` (frozen DayView sub-surfaces consume them), the
  whole 1.2 and 1.3 redesign blocks, `.hint-panel`/`.error-panel`, all media queries,
  the ten surviving aliases.

**`src/ui/views/SignInView.tsx` (67 lines)**
- CHANGES: Task 4.1 only — button class + `role="alert"` on the two error panels.
- PRESERVE: `GoogleMark` SVG verbatim (brand hexes are the documented grep exception),
  `useAuth` wiring, all copy, the `configured` branch structure.

**`src/ui/views/DayView.tsx`**
- CHANGES: Task 5 only (StageEditor lines ~247–381: error id/tabIndex/ref/focus,
  `aria-describedby` on the two selects, three button classes, Standard label + title
  removal). The 1.2 surface is otherwise frozen.
- PRESERVE: everything else byte-identical — labels, selects' onChange semantics, the
  Liegezeit input, `editor-actions` structure, all other components.

**`src/ui/views/MapView.tsx`**
- CHANGES: Task 6 only (barb `role="img"` + `aria-label`, shared const). PRESERVE: the
  whole 1.3 surface; the "exactly one `title=`" invariant.

**`src/ui/format.ts`** — CHANGES: + `formatWaveM` only.

**New files:** `src/ui/placeViewModel.ts`, `src/ui/__tests__/placeViewModel.test.ts`.

**Small edits:** `src/ui/__tests__/format.test.ts` (append-only).

**Untouched (verify by diff):** everything under `src/domain/` (`ampel.ts`/`geo.ts` are
only IMPORTED) and `src/adapters/`, all `src/app/` (App.tsx included — no loading-branch
change, VERIFY 7), `src/ui/tokens.ts`, `src/ui/mapsEnv.ts`, `src/ui/dayViewModel.ts`,
`src/ui/mapPath.ts`, `src/ui/stageText.ts`, `src/ui/windField.ts`, all
`src/ui/components/*` (AmpelBadge keeps its redundant `title` — documented),
`index.html`, `.env.example`, `README.md`, all configs, all existing tests.

### Accessibility floor for this story's surfaces

- One `h1` per view state: place name (valid) / invalid name (invalid). Section titles are
  real `h2.section-title`. No `span.versal` headings remain in PlaceDetailView.
- Quality meters: `role="img"` + `aria-label="{Name}: {n} von 5"`; dots decorative.
- Sector tiles: full meaning in visible text (direction + word + kn + wave) — color never
  the only carrier; no roles needed (static content).
- No meaning in tooltips: the wave `title` (badge-info) becomes visible caption text; the
  hero marker `title` dies; the StageEditor Standard `title` becomes label text; the
  wind barb gains `aria-label` (title now redundant). AmpelBadge's `title` and the
  Breakdown column `title`s are the documented survivors (label visible / later pass).
- Error panels `role="alert"`; StageEditor error additionally `aria-describedby`-linked
  and focused on failed apply (EXPERIENCE StageEditor row).
- `.btn-text` Zurück ≥44px hit area — verify; if the bare recipe is shorter, wrap with
  padding (min-height via a `.back-row` wrapper is fine, no new recipe).
- Focus: the two-layer `:focus-visible` ring is global since 1.1 — verify it renders on
  the Zurück button, the Google button, and the satellite map controls.
- Reduced motion: no new animation is introduced (hero has none; backdrop-filter is
  static).
- `lang="de"` copy throughout; all decorative glyphs (`←` inside the labeled button is
  text, fine).

### Testing rules

- vitest, node env, `src/**/__tests__/*.test.ts` only; NO component/DOM tests (AD-2).
- New: `placeViewModel.test.ts` — minimum cases: (sector, with `DEFAULT_PARAMS` from
  `domain/schema/params.ts` — the ampel.test.ts precedent) wrap sector 330–60 covers N
  (0°) and misses E; full circle 0–360 covers all 8; direction with no sector →
  `offen`/`limitKn: null`; limit 35 and limit 33 → `gut` (33 is the gruen boundary:
  meltemi 30 ≤ 33 − Reserve 3); limit 30 → `maessig` (no reserve left); limit 20 →
  `schwach` (under the worst case — the domain's rot, NOT mäßig);
  overlapping wind sectors → most generous wins (mirrors the domain's documented
  decision); wave lookup covered/uncovered; (window) `nightWindowLabel(18, 9)` ===
  `'18:00–09:00'`; (verdict) reason passthrough, gruen fallback, unbewertet fallback,
  `undefined` night → unbewertet.
- Append: `format.test.ts` — `formatWaveM(0.3)` === `'0,3 m'`, `formatWaveM(1)` ===
  `'1,0 m'`, `formatWaveM(null)` === `'–'`.
- Fixtures as plain typed object literals (dayViewModel.test.ts pattern); do not modify
  existing tests; `npm test` and `npm run build` green.

### DoD greps (run from repo root; first block must return NOTHING)

```bash
# dead classes / functions / strings:
grep -rn 'place-hero\|shelter-table\|sektor-inaktiv' src/
grep -rn 'back-link\|warnung\|badge-info' src/ui/   # src/ui only: "Vorwarnung" in domain/options.ts is a legit hit
grep -rn 'stars(' src/ui/
grep -rn '●\|○' src/
grep -rn '⚠' src/ui/ src/app/
grep -rn 'className="secondary"' src/
grep -n 'versal\|beschreibung\|"badge\|badges' src/ui/views/PlaceDetailView.tsx
grep -n 'title=' src/ui/views/PlaceDetailView.tsx
grep -rn 'Bewertungszeitraum' src/          # replaced by "bewertet für …"
# legacy auth recipe gone (its 0.18em uppercase tracking is unique to it in the file):
grep -n 'letter-spacing: 0.18em' src/ui/styles.css
# legacy .card block gone:
grep -n '^\.card {\|\.card \.headline\|\.card \.platz-zeile' src/ui/styles.css
```

These checks must print OK:

```bash
# platz card + copy present:
grep -q 'Kein Foto verfügbar' src/ui/views/PlaceDetailView.tsx && echo OK
grep -q 'konservativ behandeln' src/ui/views/PlaceDetailView.tsx && echo OK
grep -q 'CruisersWiki' src/ui/views/PlaceDetailView.tsx && echo OK
# StageEditor delta landed:
grep -q 'stage-editor-error' src/ui/views/DayView.tsx && echo OK
test "$(grep -c 'btn-secondary' src/ui/views/DayView.tsx)" -eq 8 && echo OK  # baseline 5 + the 3 swapped
# wind barb: still exactly ONE title=, now with aria-label:
test "$(grep -c 'title=' src/ui/views/MapView.tsx)" -eq 1 \
  && grep -q 'aria-label={barbText}\|aria-label={' src/ui/views/MapView.tsx && echo OK
# single TS color source (unchanged rule, SignInView logo excepted):
grep -rniE "#[0-9a-f]{6}\b" src --include='*.ts' --include='*.tsx' | grep -v 'ui/tokens.ts' | grep -v 'SignInView'
```

Alias-retirement loop (Task 7 — run AFTER all deletions; paste the output into the Dev
Agent Record):

```bash
for v in creme creme-card navy navy-soft ink muted hairline gruen gelb rot grau serif sans; do
  n=$(grep -rn -- "var(--$v)" src/ | grep -v 'transitional aliases' \
      | grep -cv -- "--$v: var(");   # exclude the alias's own definition line
  echo "--$v: $n consumers";
done
# every alias reported 0 must be DELETED from the alias block; every alias > 0 stays
# and is listed as debt. Expected zeros: --ink, --sans, --serif (after the h1,h2,h3
# retarget). Then verify the deleted names appear nowhere:
grep -n -- '--ink:\|--sans:\|--serif:' src/ui/styles.css
```

Exception rules, stated for the record: `GoogleMark`'s four brand hexes stay (sanctioned
since 1.1's grep exception); `AmpelBadge`'s `title` stays (visible label carries the
meaning); Breakdown's three column `title`s stay (calc panel frozen; later a11y pass);
the imagery gradient hexes in `.hero-fallback-bg` are documented mock-imagery values, not
chrome; the ten surviving aliases are debt owned by the frozen DayView sub-surfaces, not
by this epic.

### Project Structure Notes

- New: `src/ui/placeViewModel.ts`, `src/ui/__tests__/placeViewModel.test.ts`.
- Modified: `src/ui/views/PlaceDetailView.tsx` (rebuild), `src/ui/styles.css`
  (place-detail + auth blocks in; legacy blocks + retired aliases out),
  `src/ui/views/SignInView.tsx` (class + role only), `src/ui/views/DayView.tsx`
  (StageEditor delta only), `src/ui/views/MapView.tsx` (barb aria-label only),
  `src/ui/format.ts` (+`formatWaveM`), `src/ui/__tests__/format.test.ts` (append-only).
- Layering intact: `placeViewModel.ts` imports only `domain/` pure functions + types
  (dayViewModel precedent); no view computes ratings inline; nothing in `app/`/`domain/`
  changes.

### References

- **DESIGN.md (BINDING, final):**
  `_bmad-output/planning-artifacts/ux-designs/ux-sailgreece-router-2026-08-05/DESIGN.md` —
  composed surface **Platzdetail** (hero ladder, title block, 5-dot meters never
  Ampel/coral, sector grid in Ampel tints + word, wave footnote non-scoring, source
  footnote); `components.card/stat-tile/warn-note/chip/ampel-badge`; § Colors (ink rules —
  tertiary never informational; Gelb text-on-tint; accent never for status); § Typography
  (display 30/800 for the place name, overline kicker, micro-label, caption, footnote,
  tabular numerals); § Shapes (imagery follows container radius); § Elevation (Level 2
  cards — no border outlines); Do's & Don'ts (no emoji, no color-only status, no meaning
  in tooltips).
- **EXPERIENCE.md (BINDING, final):** same folder — § Component Patterns row
  **Platzdetail** (ladder degrades, meters with aria-label, sector grid semantics,
  "← Zurück" returns to prior scroll state AD-11); § State Patterns "Place unbewertet /
  invalid" (badge + konservativ copy; error panel + Zurück) + error-vs-hint split;
  § Voice & Tone (verdict — reason phrasing); § Key Flow 3 (evening berth check — the
  scene this surface serves); § Accessibility Floor (h1 = place name, no hover-only
  meaning); § Component Patterns row StageEditor (visible labels, `aria-describedby`,
  focus to error).
- **Mockup (binding for composition, with the VERIFY-8 deviations):**
  `…/mockups/keyscreen-ortsdetail-consumer-warm.html` — fused card + hero/scrim/caption
  (l. 117–162, 285–304), title block (164–186, 291–298), warn-note (188–193, 302),
  Nacht-Ampel head/tiles/reason (202–214, 306–318), quality meters (216–227, 320–338),
  shelter grid + legend + source (229–239, 340–355), fallback frame (366–428).
- **Story 1.1:** `1-1-design-tokens-and-two-line-header.md` — tokens, `.btn-*`,
  `.icon-button`, focus/motion rules, alias block contract ("each alias dies when its
  consuming section is restyled"), raw-hex exceptions.
- **Story 1.2:** `1-2-tagesansicht-redesign.md` — `.card-surface`/`.stat-grid`/
  `.stat-tile`/`.warn-note`/`.chip`/`.section-title`/`.reasons` recipes, `AMPEL_LABEL`,
  error/hint split, StageEditor scope note + Dev-Record deviation 7 (buttons kept
  `className="secondary"` — the delta this story closes), manual-smoke substitute
  protocol.
- **Story 1.3:** `1-3-karte-redesign.md` — `resolveMapsEnv` (PlaceDetailView lines 46–52),
  the wind-barb `title` documented as the surviving debt this story now covers, the
  "exactly one title= in MapView" DoD invariant, `MapViewSkeleton`/loading-branch shape
  (VERIFY 7 context).
- **Architecture:** `…/architecture-sailgreece-router-2026-07-30/ARCHITECTURE-SPINE.md` —
  AD-2 (no UI tests; no domain math in views — sector sampling reuses domain functions),
  AD-4 (curated shelter normative), AD-9 (night window bounds), AD-11 (in-memory view
  switching — Zurück contract).
- **PRD:** `…/prd-sailgreece-router-2026-07-30/prd.md` — FR5 (place detail: photo,
  qualities, shelter, night ampel), FR8 (night window verdict), NFR6 (uncurated never
  green — konservativ copy), NFR3 (seamanship disclaimer stays in the footer, not here).
- **Code ground truth (read 2026-08-05, commit `a60fca6`):**
  `src/ui/views/PlaceDetailView.tsx` (whole file), `src/domain/schema/place.ts`
  (`PlaceQualitiesSchema`: schoenheit 1–5, restaurant/badestrand 0–5),
  `src/domain/schema/shelter.ts` (WindSector fromDeg/toDeg/maxKn, WaveSector maxM,
  sourceNote), `src/domain/schema/snapshot.ts` (`PlaceNightAssessment`: ampel, maxWindKn,
  windDirDeg, maxWaveM — non-scoring doc —, basis, reasons),
  `src/domain/schema/params.ts` (nightStartHourAthens 18 / nightEndHourAthens 9,
  meltemiWorstCase.twsKn 30, openSectorMaxKn 10, gelbReserveKn 3, stopHoursDefault),
  `src/domain/ampel.ts` (sectorContains, windSectorLimitKn, luv rule, wave-non-scoring
  module head), `src/domain/geo.ts` (compassPoint — international notation),
  `src/ui/styles.css` (alias block 89–104 + consumer map per VERIFY 6),
  `src/ui/views/SignInView.tsx`, `src/ui/views/DayView.tsx` (StageEditor 247–381),
  `src/ui/views/MapView.tsx` (WindLayer barb title ~166), `src/ui/format.ts`,
  `src/ui/components/AmpelBadge.tsx` (`AMPEL_LABEL`), `src/app/App.tsx` (View union,
  platz loading branch, onBack), `seeding/data/islands/*.json` (real sector shapes).

### Open items tagged for Philipp

1. **Sector rating derivation (VERIFY 3):** each tile's rating is the domain's own
   `windHourAmpel` probed at `params.meltemiWorstCase.twsKn` (30 kn — the app's own
   worst-case wind): gut/mäßig/schwach for covered directions, offen (rot tint) for
   uncovered ones. Confirm the probe wind, the word "schwach", and rot tint for both
   schwach and offen.
2. **Tile compass notation (VERIFY 4):** N/NE/E/SE… (the app's reason vocabulary), not
   the mock's N/NO/O/SO. Confirm.
3. **Hero caption text:** "{Name} — {Hafen|Marina|Bucht}" on all tiers (the mock's
   berth-level caption "Loutra — Gemeindekai" has no data source at place level). Confirm.
4. **"← Zurück" label** stays plain (mock shows "Zurück zu Tag 1" — would need App
   plumbing; later polish if wanted).
5. **Auth card stays centered** (gate screen exception to the left-align rule). Confirm.
6. Carried over, still open from 1.3: per-alternative map toggling dropped for the single
   "Alternativen" chip; no map-side position affordance.

## Dev Agent Record

### Agent Model Used

_(to be filled by the dev agent)_

### Debug Log References

_(to be filled by the dev agent — include the baseline test count, the TDD red→green runs
for placeViewModel/formatWaveM, and the pasted alias-retirement loop output)_

### Completion Notes List

_(to be filled by the dev agent — list every deviation with its rationale; explicitly
record: which aliases were retired vs. kept + consumer counts (remaining debt), the
manual-smoke substitution if headless (build + greps + reviewer smoke list per AC 14d),
and the resolution of each TAG-FOR-PHILIPP item if any got decided mid-implementation)_

### File List

_(to be filled by the dev agent)_

## Change Log

_(to be filled by the dev agent)_
