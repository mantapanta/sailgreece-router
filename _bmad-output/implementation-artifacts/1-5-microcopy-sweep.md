---
baseline_commit: feeab43a31f720a61dc400adf759331d41c8e468
---

# Story 1.5: UI microcopy sweep

Status: in-progress

Epic 1: **UX Redesign — Consumer Warm** (ad hoc epic; the UX spines in
`_bmad-output/planning-artifacts/ux-designs/ux-sailgreece-router-2026-08-05/` are BINDING,
status final). Stories 1.1–1.4 are DONE and merged on this branch — they rebuilt every
surface and authored most of today's copy. **Read their Dev Agent Records + File Lists
first** (`1-1-*.md` … `1-4-*.md`): strings those stories' spines mandate are canonical by
definition and are marked `ok-canonical` in this story's inventory — they are never "fixed".

This is the **epic-final story** (decided by Philipp 2026-08-05): a copy-only sweep of
every user-visible German string. It is **AUDIT-DRIVEN, not rewrite-everything**. The core
deliverable is a COMPLETE INVENTORY of every user-visible string, audited against the nine
binding rules below, with fixes applied ONLY where a rule is violated. Conforming copy
stays **byte-identical** — no churn, no taste edits, no "while I'm here".

## Story

As **Philipp (the skipper and only user)**,
I want **every user-visible German string inventoried and audited against the binding
Voice-and-Tone rules, the PRD glossary, and the German format rules — with violations
fixed as string-only edits and everything conforming left byte-identical**,
so that **the app speaks with ONE seemannschaftlich-sachliche voice everywhere: no emoji
as meaning, no exclamation in warnings, one vocabulary (Etappe/Platz/Optionsraum/Törntag),
verdict—reason phrasing, German number formats through one helper layer — and the redesign
epic closes with copy as disciplined as its visuals**.

## Scope boundary (read before implementing)

**IN scope (this story) — exactly four diff shapes, nothing else:**

- (a) **String-literal edits**: JSX text nodes, attribute strings (`aria-label`, `title`,
  `placeholder`, `alt`), TS string constants/templates in `src/**` and `index.html` —
  including domain reason-string builders (they ARE user-visible) and adapter error
  strings that render in UI error panels (`src/adapters/auth.ts`, `firestore.ts`).
- (b) **Format routing**: replacing an inline number/date formatting expression
  (`toFixed`, string-built times) with a call to an existing — or new, pure, append-only
  tested — `src/ui/format.ts` helper; and swapping a displayed expression to an existing
  pure naming helper already imported in the file (`stageText.ts` `islandName`/`placeName`)
  where the data inputs are unchanged. No other expression changes.
- (c) **Test assertion updates on strings** changed under (a)/(b), in the same edit —
  string-only, no logic, no fixture restructuring.
- (d) The **inventory artifact**
  `_bmad-output/implementation-artifacts/microcopy-inventory-1-5.md`.

**EXPLICITLY NOT in scope (do not touch):**

- NO layout: no JSX structure changes, no added/removed DOM elements (deleting an
  emoji-only text node like `{'⏰ '}` counts as a string deletion and is fine), no
  className changes, no CSS (`styles.css` untouched).
- NO logic: no control flow, no new props/state/lookups, no schema/type changes (the
  `OptionState` union values `'schliesst' | 'zu'` are schema keys, NOT display strings —
  they stay; only their display labels change).
- NO tooltip migration: the Breakdown `title` tooltips and `AmpelBadge`'s redundant
  `title` are documented 1.4 debt — their TEXT is audited, their EXISTENCE stays.
- NO new UI states (e.g. `planUnreadable` has no UI rendering today — that is a missing
  feature, not a copy fix; record it as an observation in the inventory, do not build it).
- If a longer fixed string genuinely breaks a layout: **FLAG it in the inventory and the
  Dev Agent Record, do not silently restyle.** If a fix would require logic changes:
  **WAIVE with reason, never hack** (waiver protocol in Dev Notes).

**The app must remain fully functional and visually byte-identical (except string
content) after this story.**

## Acceptance Criteria

1. **Inventory exists and is complete.**
   `_bmad-output/implementation-artifacts/microcopy-inventory-1-5.md` contains one table
   row per user-visible German string:
   `string (or template) | file:line | surface | verdict | note`, where verdict is one of
   `ok` / `ok-canonical` (spine- or prior-story-mandated) / `violation → fixed (rule #)` /
   `waived (rule #, reason)`. Harvest sources: JSX text, `aria-label`, `title`,
   `placeholder`, `alt` in `src/**/*.tsx`; string literals rendered from the `src/ui/*.ts`
   helpers (`format.ts`, `stageText.ts`, `dayViewModel.ts`, `placeViewModel.ts`,
   `mapsEnv.ts` env names are code — mark n/a); domain reason builders under `src/domain/`;
   UI-rendered adapter error strings (`auth.ts`, `firestore.ts` loader error); and
   `index.html` document strings (title, meta description).

2. **Inventory is cross-checked against a file listing.** The inventory ends with a
   coverage table listing EVERY file from the harvest set (five views incl. SignInView and
   the AuthGate branch in `App.tsx`, all 12 `src/ui/components/*.tsx`, `App.tsx`, the four
   viewModel/stageText/format helpers + `mapsEnv.ts`, every `src/domain/*.ts` file with
   German user-visible literals, `index.html`) with either "N strings inventoried" or
   "none (no user-visible strings)" — no file silently skipped.

3. **Zero unwaived violations.** Every inventory row is `ok`, `ok-canonical`, `fixed`, or
   `waived` with a stated reason; a waiver is legal only where the fix would require
   logic changes (e.g. resolving island IDs inside domain builders) or a layout change.
   Conforming rows' strings are byte-identical to the baseline commit.

4. **Vocabulary is ONE, repo-wide, PRD-glossary verbatim.** In user-visible copy:
   Etappe, Hauptroute, Alternativ-Route, Optionsraum, Rest-Trip, Ampel, Törntag, Platz
   (never "Ort" as a noun for a Platz), Hafentag, Liegeplatz (only for the berth
   line/berth sense), Point of Return expressed ONLY as "Umkehrtag"/"Spätester Umkehrtag"
   (no third coinage). Option-state display words follow the spine chip set exactly:
   "offen" / "offen · Vorbehalt" / "schließt Tag X" / "geschlossen" — the current display
   labels `'schliesst'` and `'zu'` (DayView `OPTION_STATE_LABEL`) are fixed; the schema
   union values stay untouched. German ß orthography in user-visible strings (no Swiss
   "schliesst"/"liess" — comments exempt). Vocabulary drift is fixed repo-wide
   consistently: one term, everywhere it appears, including domain reason strings.

5. **Register and pattern rules hold everywhere** (rules 1–3, 7, 8 in Dev Notes):
   no exclamation mark in any warning/error/hint string; no cheering or dramatizing (incl.
   no ALL-CAPS shouting inside sentences — "HEUTE entscheiden", "NICHT gedeckt" are audit
   items); Ampel verdicts phrased verdict—reason (color word first, one decisive clause,
   sailing constraints not engine internals); deadlines as Törntag ("bis Tag 4", calendar
   date in parentheses where space allows); error texts name cause AND recovery, hint
   texts guide, never a bare "Fehler"; empty states are explicit content.

6. **Buttons are verb-first infinitives.** Every `<button>` label and button-like
   `aria-label` in the inventory either conforms ("Etappe ändern", "Route ansehen",
   "Aktualisieren"-style) or is a sanctioned non-action label (tab names "Heute"/"Karte",
   the ghost question "Wie kommt die Zeit zustande?" — spine-canonical) — deviations
   fixed or waived, none unexamined.

7. **German formats flow through `src/ui/format.ts`.**
   (i) No inline `toFixed`/`toLocaleString`/`toLocaleDateString`/`new Intl.*` in
   `src/ui/**` or `src/app/**` outside `format.ts` (the two coordinate `toFixed(4)` sites
   — PlaceDetailView hero legend, StageMap waypoint title — may alternatively be waived
   as technical coordinates; decide and record).
   (ii) Decimal values render with comma ("5,5 h", "12,3 sm" — the Breakdown/WindBasis
   `toFixed(1)` point-decimals are violations), times as zero-padded "HH:MM"
   (`{departureHour}:00` sites route through `formatHourOfDay`).
   (iii) Unit spacing: `format.ts` helpers emit the narrow no-break space (U+202F) before
   units per DESIGN.md typography ("5,5 h", "18 kn", "17 sm", "0,3 m"), and user-visible
   literal unit mentions follow the same convention; never inside `<code>`, IDs, URLs, or
   ISO stamps. Helper tests updated accordingly (string-only).
   (iv) Domain reason strings with number formatting (`arrival.toFixed(1)` "Uhr" in
   solver.ts, the decimal-hour "17,5 Uhr" in abfahrt.ts) are fixed string-level where
   possible (comma at minimum); a true HH:MM conversion inside domain needs logic → fix
   only if a pure string-level route exists, else waive with reason.

8. **No emoji as meaning; abbreviations covered.** No emoji in user-visible strings (the
   `⏰` in DayView's abfahrt-zeile is removed; the aria-hidden decorative glyphs `✎`, `⟳`,
   `›`, `−`/`+`, `→` as route direction notation, and `←` in "← Zurück" are sanctioned —
   record them as ok). Quantitative abbreviations (kn, sm, TWA) have a reading-aid
   expansion once per surface where they appear (DayView's "Wie sind die Werte zu lesen?"
   and the Karte legend already exist — audit Platzdetail; if missing there, extend an
   EXISTING legend/footnote string, never add DOM).

9. **Domain reason strings audited under the same rubric** (rules 2 and 5 especially),
   fixed as string-literal edits only, with any domain test assertion on a changed string
   updated in the same edit (`options.test.ts`, `konzept.test.ts`, `ampel.test.ts`,
   `assess.test.ts`, `abfahrt.test.ts`, `zielmodell.test.ts` are the known string-assert
   suites). Reason strings that render raw IDs (island IDs in konzept.ts tor notes and
   Konzeptwechsel hint, `legId` in solver violation texts) are fixed only if a pure
   string-level or sanctioned-helper route exists — otherwise waived, never hacked.

10. **Green and copy-only.** `npm test` and `npm run build` (`tsc --noEmit && vite build`)
    pass. `git diff --stat` against `baseline_commit` shows ONLY: `.ts`/`.tsx` string and
    format-routing edits, test files, the inventory file, and this story file — no
    `styles.css`, no config, no schema value changes, no new components. All DoD greps in
    Dev Notes pass.

## Tasks / Subtasks

- [ ] **Task 1 — Read the rubric sources (AC: all).** EXPERIENCE.md §Voice and Tone +
  Vocabulary note + State Patterns + Key Flows quotes; DESIGN.md §Do's and Don'ts +
  Typography (number format sentence); PRD glossary (`prd.md` §"Begriffe", lines ~135–148);
  Dev Agent Records of stories 1.1–1.4 (canonical strings). Then `git rev-parse HEAD` and
  confirm it equals `baseline_commit` (else record the actual one in the Dev Agent Record).

- [ ] **Task 2 — Extract the inventory (AC: 1, 2).** Build
  `microcopy-inventory-1-5.md` mechanically first, verdicts later:
  - [ ] 2.1 Grep harvest: JSX text nodes and `aria-label|title=|placeholder=|alt=` in
    `src/**/*.tsx`; German string literals (umlauts/ß or German keywords) in
    `src/ui/*.ts`, `src/app/*.tsx`, `src/domain/**/*.ts` (skip comments and
    `__tests__`), `src/adapters/auth.ts` + `firestore.ts`; `index.html`.
  - [ ] 2.2 Classify each hit: user-visible vs. console-only (`console.warn/error` in
    tripContext/firestore = "dev console, out of audit" rows) vs. code (env var names,
    IDs, CSS classes = excluded).
  - [ ] 2.3 Write the coverage cross-check table (AC 2) from the file listing in Dev
    Notes — every file accounted for.

- [ ] **Task 3 — Audit pass (AC: 3–9).** Walk every inventory row against the nine rules;
  mark `ok` / `ok-canonical` (cite the spine/story source) / `violation (rule #)` /
  `waive-candidate`. The suspect areas in Dev Notes get an explicit line-by-line pass.

- [ ] **Task 4 — Fix UI-layer violations (AC: 4, 5, 6, 8).** String-literal edits in
  views/components/App/index.html. Known fixes from the story-prep audit (verify each,
  the list is a floor not a ceiling): remove `⏰` (DayView ~699); `OPTION_STATE_LABEL`
  `'schliesst'`→`'schließt Tag'`-conform / `'zu'`→`'geschlossen'` (DayView ~816–821; keep
  keys); "eine Option schliesst an dem Tag"→"schließt" (DayView ~1513); "liess sich nicht
  berechnen"→"ließ" (DayView ~376); audit the Optionsraum deadline badge wording against
  the chip set ("schließt Tag X" appears somewhere visible per option).

- [ ] **Task 5 — Route formats through helpers (AC: 7).**
  - [ ] 5.1 `format.ts`: add/adjust pure helpers so no view needs `toFixed` — decimal-comma
    one-decimal distance/speed ("12,3 sm", "6,5 kn"); switch unit spacing to U+202F in
    `formatHours`/`formatKn`/`formatWaveM`/new helpers; update `format.test.ts`
    (append/adjust, string-only).
  - [ ] 5.2 Swap the inline sites: DayView WindBasis ~126, Breakdown ~210/213/231;
    PlaceDetailView shelter list raw `{s.maxKn} kn` / `{s.maxM} m` (~313/320 →
    `formatKn`/`formatWaveM`); `{departureHour}:00`-style times (~597, ~636, ~705) →
    `formatHourOfDay`. Decide-and-record the two coordinate `toFixed(4)` sites (waiver ok).
  - [ ] 5.3 Literal unit mentions in user-visible strings get U+202F consistently (UI and
    domain); update affected test assertions; verify no U+202F leaked into `<code>`
    content, IDs, or ISO stamps.

- [ ] **Task 6 — Fix domain reason strings (AC: 9, 4, 5).** String-literal-only edits +
  same-edit test assertion updates. Known items (verify): options.ts `deriveDecisionPoints`
  "HEUTE entscheiden"→sachlich ("Heute entscheiden: …"), "schliesst am Tag X"→"schließt
  Tag X", "ab morgen ist diese Option zu"→"…geschlossen" (tests options.test.ts
  ~413–437); options.ts ~319/410 comment-vs-string check; solver/abfahrt Uhr-decimals per
  AC 7(iv); konzept.ts tor-note "NICHT gedeckt" caps + island-ID rendering (waive the ID
  resolution — logic; decide the caps question on register grounds and record; test
  konzept.test.ts ~385/399/143 pins 'gedeckt'/'NICHT gedeckt'/'syros'). Every waived row
  names the blocking logic.

- [ ] **Task 7 — Aria/sr-only audit (AC: 5, 6, 8).** All `aria-label`s and
  `.visually-hidden` texts read aloud in the same register: RefreshButton, AvatarMenu,
  PositionPopover, drag handle, legend button, map pins/capsules ("Ort + Ampel-Wort"
  pattern is spine-canonical), boat marker, stepper buttons, skeleton texts (note the
  "Karte wird geladen …" vs "Karte lädt …" pair in MapViewSkeleton — canonical is
  "Karte lädt …" for the visible caption; audit, align only if genuinely divergent in
  meaning, record).

- [ ] **Task 8 — Vocabulary sweep greps (AC: 4).** Run the Dev Notes greps for "Ort",
  Swiss-ss, third Umkehr coinages, "Möglichkeitsraum" (UI must say Optionsraum),
  Ziel/Etappenziel/Tagesziel drift (PRD sanctions "Tagesziel = Insel" — DayView's
  "Tagesziel (Insel)" label is glossary-conform; record), Liegeplatz-vs-Platz misuse.
  Fix drift repo-wide consistently.

- [ ] **Task 9 — DoD verification (AC: 10).** `npm test`, `npm run build`, all DoD greps
  green; `git diff` reviewed file-by-file for copy-only shape; inventory verdicts final
  (zero unwaived violations); fill the Dev Agent Record + File List + Change Log.

## Dev Notes

### The nine binding rules (audit rubric — verbatim)

Sources: EXPERIENCE.md §Voice and Tone + Vocabulary note; DESIGN.md §Do's and Don'ts +
§Typography; PRD §4 "Begriffe" (glossary). Quoted as decided for this story:

1. **Register**: seemannschaftlich-sachlich, kurz. Never cheers, never dramatizes.
   NO exclamation marks in warnings/errors anywhere. (EXPERIENCE: "Microcopy rules —
   seemannschaftlich-sachlich, kurz. The app computes and compares; it never cheers,
   never dramatizes. No exclamation marks in warnings, ever.")
2. **Verdict—reason pattern**: color word first, then ONE decisive reason clause
   ("Gelb — Böen bis 28 kn am Kap"). Reasons name sailing constraints (kn, TWA,
   Tagesbudget, Rückkehrfenster), never engine internals. (EXPERIENCE: "Ampel verdicts
   are phrased as verdict — reason: the color word first ('Gelb'), then the single
   decisive reason in one clause. Reasons name the constraint in sailing terms (kn, TWA,
   Tagesbudget, Rückkehrfenster), not engine internals.")
3. **Deadlines always as Törntag** ("bis Tag 4"), calendar date in parentheses where
   space allows. (EXPERIENCE: "Deadlines are always phrased as Törntag ('bis Tag 4'),
   with the calendar date in parentheses where space allows.")
4. **Buttons: verb-first infinitives** ("Etappe ändern", "Route ansehen",
   "Aktualisieren"). (EXPERIENCE: "Buttons are verb-first infinitives: 'Etappe ändern',
   'Route ansehen', 'Als Hauptroute übernehmen', 'Aktualisieren', 'Abmelden'.")
5. **ONE vocabulary, PRD glossary verbatim**: Etappe, Hauptroute, Alternativ-Route,
   Optionsraum, Rest-Trip, Ampel, Törntag, Platz (never "Ort"), Hafentag, Point of
   Return/Umkehrpunkt — sanctioned UI phrasings "Umkehrtag"/"Spätester Umkehrtag", no
   third coinage (EXPERIENCE Vocabulary note: "One concept, these two phrasings only —
   no third coinage."). Hunt drift: Ziel vs Etappenziel vs Tagesziel (PRD: "Tagesziel =
   Insel"), Liegeplatz (= berth within a Platz) vs Platz, Schlag/Doppelschlag,
   Ansteuerung. Option states per spine chips: offen / offen · Vorbehalt / schließt
   Tag X / geschlossen.
6. **German number/date formats**: decimal comma, narrow no-break space before units,
   times "HH:MM", "5,5 h", "18 kn", "17 sm" — all via `src/ui/format.ts` helpers; flag
   any inline Intl/toFixed/toLocaleString bypassing them. (DESIGN Typography: "German
   number formatting (decimal comma, narrow no-break space before units)"; "Tabular
   numerals … times ('12:00'), knots ('NNE 18 kn'), distances ('17 sm'), durations
   ('5,5 h')".)
7. **Error texts name cause AND recovery; hint texts guide. Never a bare "Fehler".**
   The EXPERIENCE State Patterns table has the canonical examples ("Forecast nicht
   erreichbar — Anzeige beruht auf dem Lauf von 09:00.", "Gespeicherter Plan nicht
   lesbar." + recovery, "Kein GPS-Zugriff — Position manuell wählen.", "Anmeldung nicht
   konfiguriert.", "Karte nicht verfügbar."). Existing copy that names cause+recovery in
   its own words conforms — State Pattern examples are canonical patterns, not byte
   mandates for pre-existing conforming text.
8. **Empty states are explicit content, never silence.** Canonical: "Keine Optionen mehr
   offen — Rückweg fixiert." (EXPERIENCE Do-table + State Patterns.)
9. **No emoji as meaning**; abbreviations (kn, sm, TWA) get their reading-aid/abbr
   expansion once per surface. (EXPERIENCE: "icons are decorative (aria-hidden) because
   text always carries the meaning"; "All quantitative abbreviations get abbr/full text
   once per surface (kn, sm, TWA) via the reading-aid popover"; Interaction Primitives
   "Banned: … emoji as semantics".)

### Canonical strings (ok-canonical — never "fix" these)

Mandated by the spine and/or authored by stories 1.1–1.4 as spine implementations.
NNBSP unit-spacing (AC 7iii) may touch their whitespace; words stay byte-identical:

- Verdicts (dayViewModel.ts): "Round-Trip trägt" / "Round-Trip unter Vorbehalt" /
  "Kein gültiger Round-Trip" / "Round-Trip unbewertet"; suffix "— Vorschlag mit der
  geringsten Verletzung" (TripStatusLine).
- Status/detail: "Rückkehr Alimos bis Tag {N}", "(inkl. Puffertag)", "Spätester
  Umkehrtag: Tag {N}", "Meltemi-fest bis Tag {N}" / "Meltemi-fest bis: …" / "heute
  nicht", "Stand vor {h} h", "Entscheidungspunkte".
- Shell: wordmark Sail/Greece, tabs "Heute"/"Karte", "Abmelden", "Konto",
  "Forecast aktualisieren", "Aktualisierung läuft …", "Ansicht",
  "Forecast: {model} · Lauf {stamp} · abgerufen {stamp}", "Anmeldung wird geprüft …",
  footer disclaimer + attribution lines.
- Tagesansicht: "Tag {N} · {Datum}" kicker, "Position: {Platz}", "Etappe ändern",
  "Wie kommt die Zeit zustande?" / "Rechnung ausblenden", stat labels
  Abfahrt/Fahrtzeit/Ankunft/Wind, "Liegeplatz", "Vorschlag", "Festgelegt", "Pickup",
  "Hafentag in {Insel}", "Weiter am {Wt}: {A} → {B}", "Rest-Trip", "Optionsraum",
  "Bereits gefahren ({N})", "Alle {N} Tage anzeigen"/"Weniger anzeigen",
  "{N} Optionen offen"/"1 Option offen", "Nächste Deadline: Tag {N}",
  "Keine Optionen mehr offen — Rückweg fixiert." (+ its caption),
  "Noch keine Hauptroute festgelegt." + "Vorschlag übernehmen",
  "Ab Tag {N} beruht die Planung auf einer Annahme.", "Route ansehen"/"Vorschau
  schließen", "Als Hauptroute übernehmen", "Diese Option verfolgen" is deliberately
  GONE (1.2 fusion — do not reintroduce), StageEditor labels ("Tagesziel (Insel)",
  "— Hafentag: hier bleiben —", "— Vorschlag der App übernehmen —", "Festlegung lösen",
  "Schließen", "Standard ({h}:00)").
- Position popover: "Position bearbeiten", "Platz", "Platz wählen …", "GPS-Fix aktiv",
  "GPS erneut abfragen", "Manuelle Position lösen", "Kein GPS-Zugriff — Position
  manuell wählen.", "Törntag (Test)", "Automatisch (aus dem Datum)".
- Karte (1.3): "Etappen", "Windfiedern", "Alternativen", "Seezeichen", "Legende",
  "Hinweg"/"Rückweg", "Durchgezogen = gefahren", "Gestrichelt = geplant", "Pfeile
  zeigen die Fahrtrichtung.", "Schaft zeigt, woher der Wind kommt.", "Wende: {Insel}
  (Tag {N})", "· heute", "· gefahren", "Hafentag: {…}", "Karte nicht verfügbar.",
  "Etappenliste ein-/ausklappen", "Bootsposition", pin aria pattern
  "{Ort} — {Ampel-Wort}", "Karte lädt …" (skeleton caption).
- Platzdetail (1.4): "← Zurück", "Kein Foto verfügbar", "Nacht-Ampel", "Qualitäten",
  "Sicherer Liegeplatz", sector words "gut/mäßig/schwach · bis {kn} kn" and "offen",
  "{n} von 5", "Keine kuratierten Schutzdaten — konservativ behandeln.", wave-honesty
  captions, source footnote, "Wind der Nacht innerhalb der Schutzsektoren" / "keine
  Bewertung für diese Nacht" (placeViewModel, tested).
- Ampel words (AmpelBadge AMPEL_LABEL): "Grün", "Gelb", "Rot", "Unbewertet".
- index.html: title "SailGreece", meta description (1.1).

### Suspect areas (pre-audited — inspect these explicitly)

Pre-redesign copy surviving in surfaces the redesign froze, plus copy that arrived from
main's newest features (written OUTSIDE the spine — the likeliest violators). Line
numbers are baseline-commit approximations:

1. **Calc panel (frozen by 1.2/1.4)** — `DayView.tsx` WindBasis/Breakdown:
   `toFixed(1)` point-decimals at ~126 ("6.5 kn"), ~210/213 ("12.3 sm"), ~231 (rule 6);
   column-header `title` tooltips ~214/219/226 (text audit only — existence is 1.4
   debt); reading aid "Wie sind die Werte zu lesen?" exists (rule 9 satisfied here);
   `l.legId.replace('--', ' → ')` at ~800 renders raw lowercase island IDs as the leg
   heading (rule 2 — engine internals; fix via existing stageText naming helpers only if
   it stays a pure display swap, else waive). Same fallback in `stageText.ts` ~86.
2. **Abfahrtsempfehlung "abfahrt-zeile"** (from main) — `DayView.tsx` ~695–724: the
   `{'⏰ '}` emoji (rule 9, remove); "Empfohlene Abfahrt {HH:MM} → vor Anker ca. {HH:MM}
   (Ziel: {h}:00)" — `${h}:00` not zero-padded (rule 6); button `title` ~715 (register
   audit); `abfahrt.ts` hinweis "Ankunft erst gegen 17,5 Uhr" decimal-hour (rule 6,
   AC 7iv; test `abfahrt.test.ts` ~41).
3. **Entscheidungstor "tor-zeile"** (from main) — `DayView.tsx` ~731–735 renders
   `konzept.ts` ~526–530 notes verbatim: "Entscheidungstor {name}: Festlegung hinter das
   Tor (Tag {N}, {islandId}) ist gedeckt/NICHT gedeckt …" — raw island IDs (rule 2 —
   waive candidate, needs name resolution in domain) and "NICHT" caps (rule 1 register
   call — decide + record; tests konzept.test.ts ~385/399 pin 'gedeckt'/'NICHT gedeckt').
4. **KonzeptPanel + Konzept warnings** (from main) — `DayView.tsx` ~844–911,
   `konzept.ts` KONZEPT_NAME/KONZEPT_BESCHREIBUNG/gruende, `options.ts` ~232
   konzeptWarnung, konzept.ts wechselHinweis ~564–577 (renders island ID via
   `currentIslandId` — "ab syros" — rule 2 waive candidate; test ~143 pins 'syros').
   Register audit of "kippt die Lage, wird umgeschwenkt" etc. — likely ok, verify.
5. **Optionsraum state labels** — `DayView.tsx` `OPTION_STATE_LABEL` ~816–821:
   'schliesst' (ß + missing "Tag X" against the spine chip set — the deadline badge
   ~1060–1066 carries "bis Tag {N}"; decide whether the chip says "schließt Tag {N}" or
   the badge remains the carrier, record) and 'zu' → "geschlossen" (rule 5). Intro text
   ~1513 "schliesst". Domain twins in `options.ts` deriveDecisionPoints ~430–434:
   "HEUTE entscheiden" (rule 1), "schliesst am Tag {N}" (rules 3/5 — "schließt Tag {N}"),
   "ab morgen ist diese Option zu" (rule 5 — "geschlossen"); tests options.test.ts
   ~413–437 pin these strings — update in the same edit.
6. **Zwischenstopp-löschen help + StageEditor** (from main) — `DayView.tsx` ~335–391:
   "liess sich nicht berechnen" (Swiss ss, rule 4-orthography under AC 4); the two
   `beschreibung` paragraphs (register audit — likely ok); chip `title`s ~546/553/565
   (text audit; "Zwei Schläge an einem Tag" vocabulary is PRD-conform "Schlag").
7. **Solver violation texts** — `solver.ts` ~419–815: `arrival.toFixed(1)` "Uhr"
   point-decimal ×2 (~674, ~815 — rule 6, AC 7iv); `legId`/islandId renderings
   (~419, ~553, ~599, ~631 — rule 2 waive candidates); register generally good, audit.
8. **App shell errors** — `App.tsx` ~140–156: "Bibliothek konnte nicht geladen werden:
   {raw error.message}" — recovery not named + raw technical detail (rule 7; a
   string-only fix can add the recovery clause, the `error.message` interpolation is
   existing logic — keep it, it is the cause detail); "Open-Meteo nicht erreichbar —
   angezeigt wird der letzte Datenstand …" (conforms, ok); "Lade Daten …" platz-branch
   (1.3-sanctioned, ok-canonical).
9. **Sign-in surface** — `SignInView.tsx` (lead copy, config error panel) +
   `adapters/auth.ts` ~78–190 error strings (rendered in the error panel): register and
   cause+recovery audit — mostly good, inventory them all.
10. **PlaceDetailView shelter list** — raw `{s.maxKn} kn` / `{s.maxM} m` ~313/320
    (rule 6 — decimal-point risk on maxM; route through formatKn/formatWaveM); "am Ort
    des Platzes" ~244 ("Ort" as location-of-Platz, not a synonym — decide + record);
    coordinate `toFixed(4)` ~117–118 (AC 7i decide-or-waive).
11. **MapViewSkeleton** — "Karte wird geladen …" (~13, sr/caption) vs "Karte lädt …"
    (~26): spine canonical caption is "Karte lädt …" — audit the pair, align only if
    divergence is real duplication of meaning; record.

### Per-file string-location map (harvest coverage — AC 2 checklist)

| File | What lives there |
|---|---|
| `src/ui/views/DayView.tsx` | THE bulk: WindBasis/Breakdown (headers, titles, reading aid), StageEditor, StageCard (chips, stat tiles, warn notes, abfahrt-zeile, tor-zeile, return-note, berth line), KonzeptPanel, AltPreview, OptionRow (+OPTION_STATE_LABEL, KONZEPT_KURZ, EIGNUNG_LABEL), AlternativeRow, shell sections (day context, proposal card, outdated-plan hint, assumption chip+detail, Rest-Trip, Optionsraum, Bereits gefahren), maps-missing hints |
| `src/ui/views/MapView.tsx` | Legend popover, layer chips, itinerary rows, sheet head, pin/capsule/boat aria-labels, barbText, maps-missing panel, "Noch keine Hauptroute" hint |
| `src/ui/views/PlaceDetailView.tsx` | SECTOR_PRESENTATION words, hero captions/legende, invalid-place panel, night section, Qualitäten, shelter grid + sector list + source |
| `src/ui/views/SignInView.tsx` | brand small, lead, config error, Google button |
| `src/app/App.tsx` | RefreshButton labels, tabs/nav aria, error panels, "Lade Daten …", footer provenance + detail + footnotes, AuthGate card |
| `src/ui/components/TripStatusLine.tsx` | status line + rest-trip detail copy (mostly canonical) |
| `src/ui/components/PositionPopover.tsx` | position control copy incl. dev Törntag select |
| `src/ui/components/AvatarMenu.tsx` | "Konto", "Angemeldet", "Abmelden" |
| `src/ui/components/AmpelBadge.tsx` | AMPEL_LABEL + redundant title (text audit only) |
| `src/ui/components/StageMap.tsx` | waypoint marker `title` (coords toFixed(4)) |
| `src/ui/components/RouteMap.tsx` | stage marker `title` "Etappe {n} (Tag {d})" |
| `src/ui/components/DayViewSkeleton.tsx` / `MapViewSkeleton.tsx` | loading texts |
| `src/ui/components/WindBarb.tsx`, `Polyline.tsx`, `SeamarkLayer.tsx` | expect none — confirm and record "none" |
| `src/ui/format.ts` | 'unbekannt', '–', units, pointOfSail words ("gegenan", "Am Wind", …) — helper layer itself |
| `src/ui/stageText.ts` | name fallbacks (raw-ID fallback ~86) |
| `src/ui/dayViewModel.ts` | verdict labels, "Stand vor {h} h" (tested) |
| `src/ui/placeViewModel.ts` | night verdict lines, window label (tested) |
| `src/ui/mapsEnv.ts` | env names only — code, record n/a |
| `src/domain/scoring.ts` | day-budget reasons (~44–62), horizon reasons (~345–427, ~587) |
| `src/domain/ampel.ts` | night-ampel reasons (~125–129, ~154, ~196, ~240) — tested |
| `src/domain/assess.ts` | position notes (~65–81), place-invalid reason (~365), rest-trip reasons (~560–578) — tested |
| `src/domain/options.ts` | costNote/note (~173–176), option reasons (~259–322), decision points (~430–441) — tested |
| `src/domain/konzept.ts` | KONZEPT_NAME/BESCHREIBUNG (~63–76), lage gruende, tor notes (~509–530), wechselHinweis (~564–577) — tested |
| `src/domain/solver.ts` | violation texts (~419–815), return-check notes (~1660–1685) |
| `src/domain/ppr.ts` | ppr reasons (~418–442) |
| `src/domain/abfahrt.ts` | hinweis (~102–105) — tested |
| `src/domain/persistence.ts` | Fortschreibung notes (~235, ~252) — check UI visibility, classify |
| `src/domain/schema/*.ts` | zod `message:` strings — seeding/dev-report surface, classify (likely "dev console/report, out of audit"), record |
| `src/adapters/auth.ts` | sign-in error strings (~78, ~175–190) — user-visible via SignInView |
| `src/adapters/firestore.ts` | ~189 config error (user-visible via library error panel); console.error lines out of audit |
| `src/app/tripContext.tsx`, `usePlanning.ts`, `planningContext.tsx`, `authContext.tsx` | expect console-only/none — confirm, record |
| `index.html` | title, meta description |

### Waiver protocol

A violation may be WAIVED (never hacked) when the fix requires anything beyond the four
sanctioned diff shapes — typically: resolving IDs to names inside domain builders (new
data flow), converting decimal hours to HH:MM inside domain (new formatting logic in the
wrong layer), moving meaning out of a `title` tooltip (structure — 1.4 debt), or a fixed
string that breaks layout (flag instead). Each waiver row in the inventory states:
rule #, the blocking change class, and the one-line suggested future fix. Waivers are
counted and listed verbatim in the Dev Agent Record — Philipp reviews them as a block.

### DoD checks / greps (all must pass at the end)

```bash
# 1) Tests + build
npm test && npm run build

# 2) No exclamation marks in user-visible warn/error/hint strings (expect: no hits in
#    string literals/JSX text — comments and code (!== , !foo) excluded by eye):
grep -rn --include='*.ts' --include='*.tsx' -P "['\"\`][^'\"\`]*[a-zäöüß] ?![^=]" src | grep -v __tests__ | grep -viE '^\s*\S+:\s*(//|\*)'

# 3) Emoji sweep (expect: only sanctioned glyphs ✎ ⟳ › ← → − ·, all aria-hidden or
#    notation; the ⏰ must be gone):
python3 -c "
import re,pathlib
p=re.compile(r'[\U0001F000-\U0001FAFF☀-➿⌀-⏿]')
for f in list(pathlib.Path('src').rglob('*.ts*'))+[pathlib.Path('index.html')]:
    if '__tests__' in str(f): continue
    for i,l in enumerate(f.read_text().splitlines(),1):
        if p.search(l): print(f,i,l.strip()[:80])
"

# 4) 'Ort' as a noun for Platz in user-visible copy (expect: zero, or only the
#    documented 'am Ort des Platzes' decision):
grep -rn --include='*.tsx' --include='*.ts' -w -E 'Ort|Orte|Ortes' src | grep -v __tests__ | grep -viE ':\s*(//|\*|\{/\*)'

# 5) Swiss-ss in user-visible strings (expect: zero in string literals; comments exempt):
grep -rn --include='*.ts' --include='*.tsx' -E "['\"\`][^'\"\`]*(schliesst|liess|heisst|ausserhalb|grosse?|weiss)[^'\"\`]*['\"\`]" src | grep -v __tests__

# 6) Inline formatting outside format.ts (expect: zero in src/ui + src/app outside
#    format.ts, minus documented coordinate waivers; domain per AC 7iv):
grep -rn --include='*.ts' --include='*.tsx' -E 'toFixed|toLocaleString|toLocaleDateString|new Intl\.' src/ui src/app | grep -v 'src/ui/format.ts' | grep -v __tests__

# 7) Un-padded clock times built by hand (expect: zero — all through formatHourOfDay):
grep -rn --include='*.tsx' -E '\{[A-Za-z_.]+\}:00' src/ui

# 8) Option display labels conform (expect: 'schließt' and 'geschlossen' present,
#    'schliesst'/'zu' absent as DISPLAY strings — schema keys exempt):
grep -n "OPTION_STATE_LABEL" -A 6 src/ui/views/DayView.tsx

# 9) Copy-only diff shape:
git diff --stat <baseline_commit> -- . ':!_bmad-output'   # only .ts/.tsx/tests
git diff <baseline_commit> -- src/ui/styles.css           # MUST be empty
```

### Testing

- Existing suites are the safety net: 28 files / 452 tests green at baseline. String
  assertion updates are sanctioned ONLY for strings this story changes, in the same edit.
- New tests: only append-only cases for new/changed `format.ts` helpers
  (`format.test.ts`) — assert the exact German output incl. U+202F (write it as ` `
  in the assertion for greppability).
- No component/DOM tests exist and none are added (project testing rule: pure helpers
  only).
- Manual smoke (headless substitute per 1.1–1.4 protocol): build + DoD greps; reviewer
  smoke list = read every changed string in place at 390px — especially the Breakdown
  table columns (decimal commas), the abfahrt-zeile without ⏰, the Optionsraum chips
  ("schließt …"/"geschlossen"), status-line detail decision points ("Heute entscheiden:
  …"), Platzdetail shelter list units — and confirm no string wraps into a broken layout
  (else FLAG per scope boundary).

### References

- EXPERIENCE.md — §Voice and Tone (incl. Do/Don't table), §Vocabulary note, §State
  Patterns, §Interaction Primitives ("Banned"), §Accessibility Floor (abbr rule), Key
  Flows (canonical quotes):
  `_bmad-output/planning-artifacts/ux-designs/ux-sailgreece-router-2026-08-05/EXPERIENCE.md`
- DESIGN.md — §Do's and Don'ts, §Typography (German number format), §Components (chip
  state words, status line, warn note):
  `_bmad-output/planning-artifacts/ux-designs/ux-sailgreece-router-2026-08-05/DESIGN.md`
- PRD glossary — §4 "Begriffe" (~lines 135–148):
  `_bmad-output/planning-artifacts/prds/prd-sailgreece-router-2026-07-30/prd.md`
- Prior stories (canonical copy + frozen surfaces + Dev Agent Records):
  `_bmad-output/implementation-artifacts/1-1-design-tokens-and-two-line-header.md`,
  `1-2-tagesansicht-redesign.md`, `1-3-karte-redesign.md`, `1-4-platzdetail-redesign.md`
- Deferred work register (do not re-open closed decisions):
  `_bmad-output/implementation-artifacts/deferred-work.md`

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### Waivers (verbatim list for Philipp)

### File List

## Change Log
