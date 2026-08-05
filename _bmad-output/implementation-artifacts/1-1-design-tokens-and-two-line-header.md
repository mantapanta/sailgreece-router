# Story 1.1: Design tokens and two-line header

Status: ready-for-dev

Epic 1: **UX Redesign — Consumer Warm** (ad hoc epic; no epics.md exists — the UX spines in
`_bmad-output/planning-artifacts/ux-designs/ux-sailgreece-router-2026-08-05/` are the source
and are BINDING, status final). This is the **foundation slice**: token layer, base
primitives, the new app chrome (two-line header + footer provenance). Everything else of the
redesign builds on top of this story.

## Story

As **Philipp (the skipper and only user)**,
I want **the app chrome replaced by the Consumer-Warm design foundation — one token layer
(CSS + TS), one button system, and a calm two-line header with segmented tabs, avatar menu
and refresh glyph, with provenance demoted to a quiet footer line**,
so that **the whole app immediately inherits the warm consumer palette, the screen-filling
navy topbar/notice-bar chrome disappears, and every later redesign story (DayView, Karte,
Platzdetail) can compose from finished primitives instead of inventing styles**.

## Scope boundary (read before implementing)

**IN scope (this story):**

- (a) DESIGN.md token layer as CSS custom properties in `src/ui/styles.css`, replacing the
  legacy creme/navy tokens.
- (b) ONE TypeScript token module (`src/ui/tokens.ts`) as the single source for all TS color
  consumers — retiring the two divergent Ampel palettes (`AmpelBadge.tsx` vs `MapView.tsx`).
- (c) Base primitives the header needs: button system classes (primary/secondary/ghost/text),
  segmented tabs, global two-layer `:focus-visible` indicator, global reduced-motion rule.
- (d) The new two-line header in `src/app/App.tsx`: SailGreece wordmark, segmented tabs
  "Heute"/"Karte" with `aria-current="page"`, avatar → menu (name, e-mail, "Abmelden"),
  refresh glyph with 44px hit area.
- (e) Notice-bar removed; provenance ("Forecast: ECMWF · Lauf … · abgerufen … ⟳") demoted to
  the footer with `aria-live="polite"` and a detail expander.
- (f) `index.html` PWA hygiene (title, meta description, theme-color, favicon).

**EXPLICITLY NOT in scope (later stories — do not touch):**

- DayView/Tagesansicht restructure (trip status line, hero StageCard, Hafentag variant,
  rest-trip list card, Optionsraum summary row, skeletons, stale-forecast escalation).
- Folding the ControlsBar into the day-context popover. **ControlsBar STAYS as-is
  functionally and structurally** — it is restyled only passively, by inheriting the
  re-pointed legacy CSS variables. Its Törntag select, position select, GPS button and
  Abfahrt select keep working exactly as today. (Yes, EXPERIENCE.md says the header must not
  contain a Törntag select or GPS button — it doesn't today and won't; those live in the
  ControlsBar inside `main`, which is a later story's problem.)
- Karte bottom sheet / full-bleed mobile map, layer chips, legend popover.
- Platzdetail restyle (hero ladder, quality meters, shelter sector grid).
- Skeleton loading states (the "Lade Bibliothek und Forecast …" hint panel stays for now).
- Migrating legacy `title` tooltips to info chips/popovers (except: none may be ADDED).

**The app must remain fully functional end-to-end after this story** — sign-in, Tagesansicht,
Karte, Platzdetail, stage editing, refresh, sign-out.

## Acceptance Criteria

1. **CSS token layer replaces the legacy `:root`.** `src/ui/styles.css` `:root` contains the
   complete DESIGN.md token set as CSS custom properties (exact names and values in Dev Notes:
   all `colors.*`, radius scale, spacing scale, the four named shadow levels + accent glow,
   `--font-sans`). The legacy values `#f7f3ea`, `#fffdf7`, `#1b2a41`, `#2d4059`, `#24303f`,
   `#6b7684`, `#ddd6c7`, `#3a7d44`, `#d9a441`, `#b0413e`, `#9aa5b1` and the Georgia serif
   stack no longer appear anywhere in the file. `body` renders `--surface-page` background,
   `--ink-primary` text, the system sans stack at 15px/1.5. No serif renders anywhere in the
   app (the `h1/h2/h3` rule and all `.headline`/`.option-name`/`.auth-brand`/`.place-hero
   .headline` recipes fall back to sans via the re-pointed `--serif` alias).

2. **Legacy variable aliases keep every existing selector working.** The legacy variable
   names (`--creme`, `--creme-card`, `--navy`, `--navy-soft`, `--ink`, `--muted`,
   `--hairline`, `--gruen`, `--gelb`, `--rot`, `--grau`, `--serif`, `--sans`) are re-declared
   in `:root` as aliases onto the nearest new tokens per the mapping table in Dev Notes, so
   all untouched legacy sections (cards, banners, tables, controls, map, place detail)
   immediately inherit the calmer palette without a single selector breaking. Given: the app
   is running; when: any view renders; then: no element shows creme/navy chrome and the
   AmpelBadge dots show the new single palette (Gelb dots render the graphic variant
   `#b8770c`).

3. **`src/ui/tokens.ts` exists and is the ONLY TypeScript color source.** It mirrors every
   `colors.*` hex from DESIGN.md, exports `AMPEL_HEX`, `AMPEL_GRAPHIC_HEX` (both
   `Record<Ampel, string>`), `ALT_ROUTE_COLORS`, `MAP_LINE_SAILED`, `MAP_LINE_CASING`,
   `INK_PRIMARY`, and carries a sync comment; `styles.css` carries the matching sync comment
   (values change in DESIGN.md first, then in both files together). It imports only the
   `Ampel` type from `src/domain/schema/common.ts` — no other imports.

4. **One Ampel palette, everywhere.** `AMPEL_CSS_COLOR` in `AmpelBadge.tsx` (`#3a7d44/…`) and
   `REST_LINE_COLOR`/`SAILED_LINE_COLOR` in `MapView.tsx` (`#3f7d4f/…`) are deleted; MapView
   consumes `AMPEL_GRAPHIC_HEX` (rest-trip line + marker pins) and `MAP_LINE_SAILED` from
   `tokens.ts`. `altRouteColors.ts` re-exports/consumes `ALT_ROUTE_COLORS` from `tokens.ts`.
   `WindBarb.tsx` default stroke is `INK_PRIMARY` (`#23211e`), not `#1b2a41`. `Polyline.tsx`
   casing default is `MAP_LINE_CASING`. Values: gruen `#1a9d5c`, gelb `#e09112` (graphic
   variant `#b8770c` for dots + lines on light ground and on the map), rot `#d93636`,
   unbewertet `#b6b1a9`.

5. **Base primitives exist in CSS exactly per DESIGN.md.** `.btn-primary` (coral pill,
   19px/700 CTA label — the size is load-bearing for white-on-coral contrast, min-height
   48px, accent-glow shadow, hover/pressed `--accent-deep`, disabled = `--surface-track` fill
   + `--ink-tertiary` text + no shadow), `.btn-secondary` (white pill, hairline border,
   Level-1 shadow, min-height 44px), `.btn-ghost` (coral `--accent-text` text pill, no
   chrome, min-height 44px), `.btn-text` (inline underlined ink link, underline offset 2px),
   `.segmented-tabs` (track `--surface-track`, pill radius, active segment white with Level-1
   shadow, active `--ink-primary` / inactive `--ink-secondary`, 14px/600 labels). A global
   two-layer `:focus-visible` rule renders a 2px `--focus-ring` outer ring plus a 2px white
   gap on EVERY interactive element (zero focus styling exists today). A global
   `prefers-reduced-motion: reduce` rule disables all non-essential animation.

6. **Two-line header replaces the topbar + notice-bar.** Line 1: wordmark left, avatar
   (34px gradient circle with initial) right. Line 2: segmented tabs "Heute"/"Karte" left,
   refresh ghost glyph right. Nothing else: **no date range, no provenance, no Törntag
   select, no GPS button, no wide Abmelden button** in the header. The header sits on the
   page background (no card, no shadow, hairline bottom border allowed), is `position:
   sticky; top: 0`, and every focusable element carries `scroll-margin-top` ≥ header height
   so keyboard focus is never obscured (SC 2.4.11). Landmarks after this story:
   `<header>` (wordmark + tabs), `<nav>` (tab row), one `<main>`, `<footer>`.

7. **Wordmark.** Rendered as `Sail` in `--ink-primary` + `Greece` in `--accent`, 19px/700
   (typography.headline), tight tracking. The strings "sailgreece-router" and "Router" appear
   NOWHERE in the rendered UI — including the AuthGate checking card, `SignInView`'s
   `.auth-brand`, and the `index.html` `<title>` (all updated to the SailGreece wordmark
   treatment).

8. **Tabs behave per EXPERIENCE.md.** Plain `<button>`s (NOT a `tablist`), labels "Heute" and
   "Karte", the active view's button carries `aria-current="page"` (the Platzdetail view
   keeps the tab of the view it was opened from current, as today). Tap switches the view
   instantly via in-memory state (AD-11 — no router, no URLs). Whole segments are tap targets
   ≥44px tall.

9. **Avatar menu.** Tapping the avatar opens a Level-3-elevated menu anchored top-right
   containing: full name (never truncated), e-mail, and an "Abmelden" item (≥44px item
   height) wired to the existing `signOut()`. Esc and backdrop tap close it; focus moves into
   the menu on open, is trapped while open, and returns to the avatar button on close.
   The avatar button has an accessible German name (e.g. `aria-label="Konto"`) and
   `aria-expanded`.

10. **Refresh glyph (header).** A ghost icon button, visual glyph ⟳ with a ≥44×44px hit
    area, `aria-label="Forecast aktualisieren"`. Click triggers `forecastQuery.refetch()`
    (FR13). While `forecastQuery.isFetching`: the glyph spins (CSS animation) and the button
    is disabled per the disabled spec; under `prefers-reduced-motion` the spin is disabled
    and the glyph swaps to a static pending state ("…" text swap) instead.

11. **Provenance demoted to the footer.** The notice-bar div and its `.notice-bar`/
    `.datenstand` CSS are deleted. The footer (contentinfo) renders, centered, in footnote
    type (11.5px) and `--ink-secondary` (never tertiary): `Forecast: {model} · Lauf
    {run} · abgerufen {fetched-at} ⟳` with (i) `aria-live="polite"` on the text container,
    (ii) an inline refresh affordance with ≥44px hit area triggering the same refetch, and
    (iii) tap on the provenance TEXT toggling a detail expander (simple `aria-expanded`
    button + panel is acceptable this story — no popover primitive exists yet; meaning must
    NOT live in a `title` tooltip) showing Modell, Modelllauf, Abgerufen and Cache-TTL
    (derived from `STALE_TIME_MS`, i.e. "1 h"). The footer additionally keeps the Open-Meteo
    attribution (CC BY 4.0 link), keeps the curation note, and gains the NFR3 seamanship
    disclaimer ("Ersetzt nicht das seemännische Urteil — Modell-Konsens parallel prüfen." or
    equivalent), each in footnote type.

12. **The old chrome is GONE.** Grep proves no remaining references: `.topbar`, `.brand`,
    `.notice-bar`, `.datenstand`, `.account-chip` (component AND CSS, including the
    ≤860px media-query rule), the old header `.tabs` recipe, the uppercase date-range line
    (`formatTripRange` call in App.tsx removed — beware `noUnusedLocals`: also remove the
    import), and the wide "ABMELDEN" button.

13. **`index.html` PWA hygiene.** `lang="de"` kept; `<title>SailGreece</title>`; German
    `<meta name="description">`; `<meta name="theme-color" content="#faf9f7">` (=
    surface-page); an inline `data:image/svg+xml` favicon (coral rounded square, white "S");
    viewport gains `viewport-fit=cover`, and header/footer pad with
    `env(safe-area-inset-*)`.

14. **Definition of done / non-regression.** (a) `npm test` (vitest) green — all existing
    tests in `src/ui/__tests__/` and `src/domain/**/__tests__/` untouched and passing;
    (b) `npm run build` (`tsc --noEmit && vite build`) succeeds; (c) manual smoke via
    `npm run dev`: sign-in gate renders, Tagesansicht renders with ControlsBar working,
    Karte renders with polylines/pins/wind barbs in the new palette, Platzdetail opens and
    "← Zurück" returns, avatar menu signs out; (d) no references to deleted CSS classes
    remain in any `.tsx`; (e) the hygiene greps in Dev Notes § "DoD greps" all come back
    empty; (f) all NEW UI strings are German; no emoji as meaning carriers anywhere.

## Tasks / Subtasks

- [ ] **Task 1 — Create `src/ui/tokens.ts`** (AC: 3, 4)
  - [ ] 1.1 Mirror the full DESIGN.md `colors.*` table as a `COLORS` const (exact hex values
        from the token tables in Dev Notes), with the sync-comment header.
  - [ ] 1.2 Export `AMPEL_HEX: Record<Ampel, string>` (gruen `#1a9d5c`, gelb `#e09112`, rot
        `#d93636`, unbewertet `#b6b1a9`) and `AMPEL_GRAPHIC_HEX: Record<Ampel, string>`
        (same, but gelb `#b8770c`) with a comment explaining the Gelb graphic variant
        (≈2.6:1 on white is too weak as a standalone graphic; dots/lines on light ground and
        map lines use the graphic variant).
  - [ ] 1.3 Export `ALT_ROUTE_COLORS` (`#6f4a9c`, `#1f7a8c`, `#b05f2c`), `MAP_LINE_SAILED`
        (`#1a9d5c`), `MAP_LINE_CASING` (`#ffffff`), `INK_PRIMARY` (`#23211e`).
  - [ ] 1.4 (Recommended) Add `src/ui/__tests__/tokens.test.ts`: reads `styles.css` via
        `node:fs` (vitest runs in node env) and asserts every hex in `COLORS` appears in the
        `:root` block — mechanizes the "must stay in sync" contract. Keep it a pure
        constants/file test (AD-2: no component tests).

- [ ] **Task 2 — Re-point all TS color consumers** (AC: 4)
  - [ ] 2.1 `AmpelBadge.tsx`: delete the `AMPEL_CSS_COLOR` export (MapView is its only
        importer).
  - [ ] 2.2 `MapView.tsx`: delete `REST_LINE_COLOR` and `SAILED_LINE_COLOR`; import
        `AMPEL_GRAPHIC_HEX` and `MAP_LINE_SAILED` from `../tokens.ts`; rest-trip line color =
        `AMPEL_GRAPHIC_HEX[assessment.restTripAmpel]`, sailed = `MAP_LINE_SAILED`, marker
        pins = `AMPEL_GRAPHIC_HEX[ampel]`.
  - [ ] 2.3 `altRouteColors.ts`: `export { ALT_ROUTE_COLORS } from './tokens.ts'` style
        re-point (keep `altRouteColor(index)` helper and its doc comment; values now live in
        tokens.ts only).
  - [ ] 2.4 `WindBarb.tsx`: default `color = INK_PRIMARY` (import from `../tokens.ts`).
  - [ ] 2.5 `Polyline.tsx`: default `casingColor = MAP_LINE_CASING`.
  - [ ] 2.6 Leave the four Google-brand hexes in `SignInView.tsx`'s Google logo SVG
        untouched — they are Google's logo colors, not design tokens (sanctioned exception).

- [ ] **Task 3 — Rewrite the `styles.css` token layer + legacy alias block** (AC: 1, 2)
  - [ ] 3.1 Replace the `:root` block with the full new token set (names/values in Dev
        Notes) plus the sync comment.
  - [ ] 3.2 Add the legacy alias block (mapping table in Dev Notes) directly beneath it,
        commented as transitional ("legacy sections restyled in later stories consume these
        aliases; do not use in new code").
  - [ ] 3.3 Update the base rules: `body` background/color/font per AC1; delete the serif
        stack; `h1/h2/h3` keep working via aliases (they become sans + ink automatically).
  - [ ] 3.4 Replace the file-head comment (the "Y.CO-inspired" line is no longer true) with
        a pointer to DESIGN.md as the visual contract.
  - [ ] 3.5 (SHOULD) Sweep the obvious raw-hex warn/error recipes in legacy sections onto
        Ampel tint/text tokens per the "recommended raw-hex sweep" table in Dev Notes.

- [ ] **Task 4 — Add primitive CSS: buttons, tabs, focus, motion** (AC: 5)
  - [ ] 4.1 `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-text` per the component
        token specs (Dev Notes has a reference implementation).
  - [ ] 4.2 `.segmented-tabs` + segment buttons per spec.
  - [ ] 4.3 Global `:focus-visible` two-layer rule (2px `--focus-ring` outline,
        `outline-offset: 2px`, `box-shadow: 0 0 0 2px var(--on-accent)` as the white gap).
  - [ ] 4.4 Global `@media (prefers-reduced-motion: reduce)` rule killing animations and
        transitions (`animation: none; transition: none` on `*`), plus the refresh-glyph
        static swap hook.
  - [ ] 4.5 Global `scroll-margin-top: calc(var(--header-h) + 8px)` on
        `a, button, input, select, textarea, summary, [tabindex]`.

- [ ] **Task 5 — Build the two-line header in `App.tsx`** (AC: 6, 7, 8, 12)
  - [ ] 5.1 Replace `<header className="topbar">…</header>` and the notice-bar div with the
        new `<header className="app-header">` structure (reference JSX in Dev Notes): line 1
        wordmark + `<AvatarMenu />`; line 2 `<nav aria-label="Ansicht">` with the two tab
        buttons + `<RefreshButton />`.
  - [ ] 5.2 Tabs: `aria-current={activeTab === 'tag' ? 'page' : undefined}` (keep the
        existing `activeTab` derivation including the Platzdetail `returnTo` logic), labels
        "Heute" / "Karte" (rename from "Tagesansicht").
  - [ ] 5.3 Delete the `AccountChip` component; remove the `formatTripRange` import (the
        date-range line dies; `noUnusedLocals` would fail the build otherwise). Keep
        `formatStamp` (still used by footer + error panels).
  - [ ] 5.4 Header CSS: sticky, `z-index: 100`, page background, safe-area top padding,
        define `--header-h` (104px, must be ≥ real rendered height at 390px viewport);
        bump `.map-sticky` `top` to `calc(var(--header-h) + 1rem)` so the sticky map no
        longer slides under the sticky header.
  - [ ] 5.5 Delete the `.topbar`, `.brand`, old `.tabs`, `.notice-bar`, `.datenstand`,
        `.account-chip` CSS blocks including the `.account-chip` rule inside the ≤860px
        media query.

- [ ] **Task 6 — AvatarMenu component** (AC: 9)
  - [ ] 6.1 New `AvatarMenu` (may live in `App.tsx` or `src/ui/components/AvatarMenu.tsx` —
        prefer the component file per repo convention). 34px circle button,
        `background: linear-gradient(135deg, var(--accent) 0%, var(--accent-gradient-end)
        100%)`, white 14px/700 initial from `displayName ?? email ?? 'S'`.
  - [ ] 6.2 Menu panel: Level-3 shadow (`--shadow-3`), `--radius-md`, white card, absolute
        below the avatar, right-aligned; identity block (name in label type, e-mail in
        caption type/`--ink-secondary`), hairline divider, "Abmelden" item ≥44px calling
        `void signOut()`.
  - [ ] 6.3 Behavior: toggle on avatar click; invisible fixed backdrop closes on click; Esc
        closes; focus the first item on open; simple focus trap while open; return focus to
        the avatar button on close; `aria-haspopup="menu"`, `aria-expanded` on the trigger.

- [ ] **Task 7 — RefreshButton (header)** (AC: 10)
  - [ ] 7.1 Ghost icon button using `usePlanning().forecastQuery`; disabled + spinning while
        `isFetching`; ⟳ glyph as text or inline SVG (`aria-hidden`), button carries
        `aria-label="Forecast aktualisieren"`.
  - [ ] 7.2 44×44px hit area (`.icon-button` recipe in Dev Notes); spin via CSS keyframes;
        reduced-motion: no spin, glyph swaps to "…" while fetching.

- [ ] **Task 8 — Footer provenance** (AC: 11)
  - [ ] 8.1 Replace `<footer className="attribution">` with `<footer className="app-footer">`:
        provenance line (centered footnote, `--ink-secondary`) with `aria-live="polite"`,
        refresh affordance (same disabled/spin rules as Task 7, ≥44px hit area), detail
        expander button on the text (`aria-expanded` + panel with Modell / Modelllauf /
        Abgerufen / `Cache-TTL: 1 h` from `STALE_TIME_MS`), then Open-Meteo attribution +
        curation note + NFR3 disclaimer as separate footnote lines. Safe-area bottom padding.
  - [ ] 8.2 Reuse `formatStamp` for run/fetched (or `formatAthensTime` for the time-only
        mock format — either is acceptable; do not invent a third formatter). Model string
        from `assessment.model`; render "…" placeholders while `assessment` is null, exactly
        as the notice-bar did.
  - [ ] 8.3 Delete `footer.attribution` CSS; add `.app-footer`/`.provenance` CSS per Dev
        Notes.

- [ ] **Task 9 — Brand strings + index.html** (AC: 7, 13)
  - [ ] 9.1 AuthGate checking card and `SignInView` `.auth-brand`: replace
        "sailgreece-router" with the wordmark markup (`Sail<span class="wordmark-accent">
        Greece</span>`); keep the "Kykladen · Törnplanung" subline; do NOT restyle the auth
        card beyond what the aliases do.
  - [ ] 9.2 `index.html`: title, meta description, theme-color, favicon, viewport-fit per
        the exact snippet in Dev Notes.

- [ ] **Task 10 — Verify DoD** (AC: 12, 14)
  - [ ] 10.1 Run every grep in Dev Notes § "DoD greps" — all must be empty.
  - [ ] 10.2 `npm test` and `npm run build` green.
  - [ ] 10.3 `npm run dev` manual smoke: all four surfaces + avatar sign-out + both refresh
        affordances + keyboard walk (Tab through header: wordmark is not focusable, avatar,
        tabs, refresh all show the two-layer ring; focus into main is not hidden under the
        sticky header).

## Dev Notes

### Stack and constraints — read first

- **No new dependencies.** React 19.2 + Vite 8.2 + TypeScript 5.9 + vanilla CSS custom
  properties (`src/ui/styles.css`) is the entire styling stack (Architecture § Stack). No
  CSS-in-JS, no Tailwind, no component library, no webfont (the design uses the system sans
  stack), no router (AD-11), no new npm packages. No web research needed.
- **Layering (Architecture, Design Paradigm):** `domain` imports nothing from other layers;
  `ui` may import `domain` types; **nobody imports from `app`** — so `tokens.ts` lives in
  `src/ui/`, and `App.tsx` (in `app/`) may import it, but tokens.ts must not import from
  `app/`. `tokens.ts` imports only `type { Ampel } from '../domain/schema/common.ts'`.
- **AD-11:** view switching is in-memory `useState<View>` in `Shell` — keep it exactly;
  tabs must never look like links (segmented control, not anchors).
- **AD-2 / testing standards:** vitest, node environment, tests only under
  `src/**/__tests__/*.test.ts` (see `vitest.config.ts`); domain modules carry fixture tests;
  **UI components stay test-free** — do not add component/DOM tests. The optional
  `tokens.test.ts` (Task 1.4) is a constants/file-sync test, which is fine.
- **tsconfig:** `strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` —
  removing a usage without removing its import fails `npm run build`.
- **Conventions:** React components `PascalCase.tsx`, everything else `camelCase.ts`. UI
  strings German; code/identifiers/comments English. Commit style (git log): short
  imperative sentence, no prefix tags (e.g. "Finalize UX spines: …").
- **German formatting:** all times/knots already go through `src/ui/format.ts`
  (`formatStamp`, `formatAthensTime`, `formatKn`, `formatHours`) — reuse, never inline a new
  `Intl` formatter. Quantitative text gets `font-variant-numeric: tabular-nums`.

### Token tables (the single source, copied verbatim from DESIGN.md frontmatter)

**Colors** — CSS custom property = `--<key>`; `COLORS` key in tokens.ts = camelCase:

| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| surface-page | `#faf9f7` | | ampel-gruen | `#1a9d5c` |
| surface-card | `#ffffff` | | ampel-gruen-tint | `#e4f5ec` |
| surface-inset | `#faf9f7` | | ampel-gruen-text | `#147a47` |
| surface-track | `#f0eeea` | | ampel-gelb | `#e09112` |
| ink-primary | `#23211e` | | ampel-gelb-graphic | `#b8770c` |
| ink-secondary | `#6f6a62` | | ampel-gelb-tint | `#fcf3e0` |
| ink-tertiary | `#98928a` | | ampel-gelb-text | `#7a5306` |
| border-hairline | `#ecebe7` | | ampel-rot | `#d93636` |
| accent | `#f2604d` | | ampel-rot-tint | `#fbe9e9` |
| accent-deep | `#d94c3a` | | ampel-rot-text | `#a72020` |
| accent-text | `#c23a28` | | ampel-unbewertet | `#b6b1a9` |
| accent-tint | `#fdeeec` | | ampel-unbewertet-tint | `#f0eeea` |
| accent-gradient-end | `#e5893c` | | ampel-unbewertet-text | `#6f6a62` |
| on-accent | `#ffffff` | | alt-route-1 | `#6f4a9c` |
| focus-ring | `#f2604d` | | alt-route-2 | `#1f7a8c` |
| map-line-sailed | `#1a9d5c` | | alt-route-3 | `#b05f2c` |
| map-line-casing | `#ffffff` | | | |

Ink rules that bind this story: `--ink-secondary` (≈5.3:1) carries ALL informational meta
(provenance, footnotes); `--ink-tertiary` (≈3.1:1) is restricted to disabled states and
decorative glyphs — it never carries information.

**Typography roles** (one family: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
"Helvetica Neue", sans-serif` = `--font-sans`; no webfont, no serif anywhere):

| Role | Size/weight | LH | Tracking | Used this story by |
|---|---|---|---|---|
| display | 30px/800 | 1.05 | −0.03em | (later: hero destination) |
| headline | 19px/700 | 1.2 | −0.01em | **wordmark** |
| body | 15px/400 | 1.5 | — | body default |
| body-sm | 14px/400 | 1.45 | — | — |
| label | 14px/600 | 1.3 | — | **tab labels**, secondary/ghost button labels, menu name |
| **cta** | **19px/700** | 1.2 | — | `.btn-primary` label — **load-bearing: white-on-coral is ≈3.2:1 and passes ONLY as WCAG large text (≥18.66px/700). Never shrink it.** |
| overline | 13px/700 | 1.3 | +0.06em | (later: section h2s) |
| micro-label | 11px/600 | 1.3 | +0.07em | (later: stat tiles) |
| caption | 12.5px/400 | 1.35 | — | avatar-menu e-mail |
| footnote | 11.5px/400 | 1.4 | — | **provenance line, attribution, disclaimer** |

**Radius:** `--radius-sm: 8px`, `--radius-md: 14px`, `--radius-lg: 20px`,
`--radius-full: 9999px`. Actions are pills (`--radius-full`), period.

**Spacing** (4-based, replaces the ~25 ad-hoc rem values over time): `--space-1: 4px`,
`--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`, `--space-5: 20px`, `--space-6: 24px`,
`--space-7: 32px`, `--space-8: 40px`; anchors `--space-page-margin: 16px`,
`--space-card-padding: 20px`, `--content-max: 1280px`.

**Shadows — the Elevation section is the single source; exactly four levels + one glow, all
warm-tinted `rgba(30,25,20,…)`, never pure black:**

```css
--shadow-1: 0 1px 2px rgba(30, 25, 20, 0.08), 0 2px 8px rgba(30, 25, 20, 0.06);   /* active tab, secondary buttons */
--shadow-2: 0 1px 2px rgba(30, 25, 20, 0.06), 0 10px 30px rgba(30, 25, 20, 0.08); /* all cards */
--shadow-3: 0 2px 6px rgba(30, 25, 20, 0.10), 0 16px 40px rgba(30, 25, 20, 0.16); /* popovers, menus (avatar menu!) */
--shadow-accent-glow: 0 4px 14px rgba(242, 96, 77, 0.35);                         /* primary pill only */
```

No component may carry a shadow that is not one of these four.

**Component tokens used this story** (from DESIGN.md `components`):

- `button-primary`: bg accent / fg on-accent / cta type / radius full / shadow accent-glow /
  min-height 48px. Hover/pressed: accent-deep. Disabled: surface-track fill, ink-tertiary
  text, no shadow. One primary per card max.
- `button-secondary`: bg surface-card / fg ink-primary / 1px border-hairline / radius full /
  shadow-1 / min-height 44px.
- `button-ghost`: transparent / fg accent-text / radius full / min-height 44px.
- `button-text`: transparent / fg ink-primary / underline offset 2px.
- `segmented-tabs`: track surface-track / active bg surface-card / active fg ink-primary /
  inactive fg ink-secondary / radius full / active shadow-1.
- `avatar`: 34px circle, `linear-gradient(135deg, accent 0%, accent-gradient-end 100%)`,
  fg on-accent. (`accent-gradient-end` exists ONLY for this gradient.)
- `avatar-menu`: bg surface-card / radius-md / shadow-3 / item min-height 44px.
- `provenance-line`: footnote type / ink-secondary.

**Focus indicator (binding, DESIGN.md Colors):** every `:focus-visible` = 2px `--focus-ring`
outer ring + 2px white inner gap; the gap is part of the indicator. On coral fills the white
gap carries the signal.

### The TS token module — `src/ui/tokens.ts` (new file)

```ts
/**
 * Design tokens — TypeScript mirror of the CSS custom properties in styles.css.
 *
 * Google Maps polylines/markers and SVG defaults cannot consume CSS variables,
 * so every TS color constant lives HERE and nowhere else. MUST stay in sync
 * with the :root block in src/ui/styles.css — values change in
 * _bmad-output/planning-artifacts/ux-designs/ux-sailgreece-router-2026-08-05/DESIGN.md
 * first, then in both files together.
 */
import type { Ampel } from '../domain/schema/common.ts';

export const COLORS = {
  surfacePage: '#faf9f7',
  /* … every colors.* key from the table above, camelCased … */
} as const;

/** Ampel hues — badges-on-tint context (raw hue). */
export const AMPEL_HEX: Record<Ampel, string> = {
  gruen: '#1a9d5c', gelb: '#e09112', rot: '#d93636', unbewertet: '#b6b1a9',
};

/**
 * Graphic variant: standalone dots and lines on light ground / map imagery.
 * Gelb #e09112 is ≈2.6:1 on white — too weak as a bare graphic; #b8770c is ≥3:1.
 */
export const AMPEL_GRAPHIC_HEX: Record<Ampel, string> = {
  gruen: '#1a9d5c', gelb: '#b8770c', rot: '#d93636', unbewertet: '#b6b1a9',
};

export const ALT_ROUTE_COLORS = ['#6f4a9c', '#1f7a8c', '#b05f2c'] as const;
export const MAP_LINE_SAILED = '#1a9d5c';
export const MAP_LINE_CASING = '#ffffff';
export const INK_PRIMARY = '#23211e';
```

Consumers after this story: `MapView.tsx` (AMPEL_GRAPHIC_HEX, MAP_LINE_SAILED),
`altRouteColors.ts` (ALT_ROUTE_COLORS), `WindBarb.tsx` (INK_PRIMARY), `Polyline.tsx`
(MAP_LINE_CASING). `AmpelBadge.tsx` keeps NO color constants (its dots are CSS classes).
The map "sailed" green is IDENTICAL to ampel-gruen by design — one green, not two.

### Legacy → new token mapping (the migration strategy for the 1369-line stylesheet)

This story REPLACES: the `:root` token block; the header/topbar/notice-bar/account-chip/old
tabs sections; the footer section; and ADDS the primitives (buttons, segmented tabs, focus,
motion, header, avatar menu, provenance). It does NOT rewrite the remaining legacy sections
(cards, banners, option rows, breakdown tables, place hero, map sidebar, auth card, controls
— all restyled in later stories). Instead the legacy variable NAMES are re-declared as
aliases so every untouched selector instantly inherits the calm palette:

```css
/* ---- transitional aliases — legacy sections only; new code uses the real tokens.
       Each alias dies when its consuming section is restyled (Stories 1.2+). ---- */
:root {
  --creme: var(--surface-page);        /* was #f7f3ea  — page canvas */
  --creme-card: var(--surface-card);   /* was #fffdf7  — cards go pure white */
  --navy: var(--ink-primary);          /* was #1b2a41  — chrome/headline ink */
  --navy-soft: var(--ink-secondary);   /* was #2d4059  — supporting ink */
  --ink: var(--ink-primary);           /* was #24303f */
  --muted: var(--ink-secondary);       /* was #6b7684 */
  --hairline: var(--border-hairline);  /* was #ddd6c7 */
  --gruen: var(--ampel-gruen);         /* was #3a7d44 */
  --gelb: var(--ampel-gelb-graphic);   /* was #d9a441 — dots/borders on light ground
                                          take the GRAPHIC variant per DESIGN.md */
  --rot: var(--ampel-rot);             /* was #b0413e */
  --grau: var(--ampel-unbewertet);     /* was #9aa5b1 */
  --serif: var(--font-sans);           /* serif is eliminated — no serif anywhere */
  --sans: var(--font-sans);
}
```

Notes on side effects (all intended): legacy card headlines, `.option-name`, `.auth-brand`,
`.place-hero .headline` lose serif; `.controls button`, `.stage-number`, `.google-button`
turn from navy to ink-primary (near-black warm) — acceptable interim, replaced by real
button classes in later stories; `.ampel .dot` for Gelb renders `#b8770c` (correct per the
graphic-variant rule since these are bare dots on light ground).

**Recommended raw-hex sweep in legacy sections (SHOULD, not MUST — none are on the banned
grep list):** `#f7ecd7`/`#fdf8ee` → `var(--ampel-gelb-tint)`; `#8a6414` →
`var(--ampel-gelb-text)`; `#f3dedd`/`#f6e2df` → `var(--ampel-rot-tint)`; `#8c2f24` →
`var(--ampel-rot-text)`; `#e5efe2` → `var(--ampel-gruen-tint)`; `#e9eef4` →
`var(--surface-track)`. Leave the odd border colors (`#e4cf9f`, `#ddb3b1`, `#e3b6af`,
`#bcd3bf`) and `.place-hero`'s `#4e6b8c` gradient stop alone if the sweep gets fiddly —
those sections are rebuilt in later stories.

### Reference CSS for the new sections

```css
/* ---- header (two-line, sticky) ---- */
:root { --header-h: 104px; } /* keep ≥ rendered height at 390px viewport */

.app-header {
  position: sticky; top: 0; z-index: 100;
  background: var(--surface-page);
  padding: calc(var(--space-2) + env(safe-area-inset-top)) var(--space-5) var(--space-3);
  border-bottom: 1px solid var(--border-hairline);
}
.header-line1 { display: flex; align-items: center; justify-content: space-between; }
.header-line2 { display: flex; align-items: center; margin-top: var(--space-3); }

.wordmark { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; color: var(--ink-primary); }
.wordmark-accent { color: var(--accent); }

/* ---- segmented tabs ---- */
.segmented-tabs {
  display: flex; gap: var(--space-1);
  background: var(--surface-track); border-radius: var(--radius-full);
  padding: 3px; width: max-content;
}
.segmented-tabs button {
  border: 0; background: transparent; cursor: pointer;
  padding: 10px var(--space-5); border-radius: var(--radius-full);
  font: 600 14px/1.3 var(--font-sans); color: var(--ink-secondary);
  min-height: 44px;
}
.segmented-tabs button[aria-current='page'] {
  background: var(--surface-card); color: var(--ink-primary); box-shadow: var(--shadow-1);
}

/* ---- icon button (refresh, ≥44px hit area) ---- */
.icon-button {
  margin-left: auto; border: 0; background: transparent; cursor: pointer;
  width: 44px; height: 44px; border-radius: var(--radius-full);
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--accent-text); font-size: 18px;
}
.icon-button:disabled { color: var(--ink-tertiary); cursor: default; }
.icon-button .spin { animation: refresh-spin 1s linear infinite; display: inline-block; }
@keyframes refresh-spin { to { transform: rotate(360deg); } }

/* ---- button system ---- */
.btn-primary {
  border: 0; cursor: pointer; border-radius: var(--radius-full);
  background: var(--accent); color: var(--on-accent);
  font: 700 19px/1.2 var(--font-sans);            /* cta — size is load-bearing */
  min-height: 48px; padding: 0 var(--space-6);
  box-shadow: var(--shadow-accent-glow);
}
.btn-primary:hover, .btn-primary:active { background: var(--accent-deep); }
.btn-primary:disabled { background: var(--surface-track); color: var(--ink-tertiary); box-shadow: none; cursor: default; }
.btn-secondary {
  cursor: pointer; border-radius: var(--radius-full);
  background: var(--surface-card); color: var(--ink-primary);
  border: 1px solid var(--border-hairline); box-shadow: var(--shadow-1);
  font: 600 14px/1.3 var(--font-sans); min-height: 44px; padding: 0 var(--space-5);
}
.btn-ghost {
  border: 0; cursor: pointer; background: transparent; border-radius: var(--radius-full);
  color: var(--accent-text); font: 600 14px/1.3 var(--font-sans);
  min-height: 44px; padding: 0 var(--space-4);
}
.btn-text {
  border: 0; background: transparent; cursor: pointer; padding: 0;
  color: var(--ink-primary); text-decoration: underline; text-underline-offset: 2px;
  font: 400 15px/1.5 var(--font-sans);
}

/* ---- focus: two-layer indicator, global ---- */
:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;                       /* the 2px gap … */
  box-shadow: 0 0 0 2px var(--on-accent);    /* … painted white: part of the indicator */
}
a, button, input, select, textarea, summary, [tabindex] {
  scroll-margin-top: calc(var(--header-h) + 8px);   /* SC 2.4.11 under sticky header */
}

/* ---- avatar + menu ---- */
.avatar-wrap { position: relative; }
.avatar {
  width: 34px; height: 34px; border-radius: var(--radius-full); border: 0; cursor: pointer;
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-gradient-end) 100%);
  color: var(--on-accent); font: 700 14px/1 var(--font-sans);
  display: inline-flex; align-items: center; justify-content: center;
}
.menu-backdrop { position: fixed; inset: 0; z-index: 110; background: transparent; }
.avatar-menu {
  position: absolute; right: 0; top: calc(100% + var(--space-2)); z-index: 120;
  min-width: 220px; background: var(--surface-card);
  border-radius: var(--radius-md); box-shadow: var(--shadow-3);
  padding: var(--space-2) 0;
}
.avatar-menu-identity { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-hairline); }
.avatar-menu-name { display: block; font: 600 14px/1.3 var(--font-sans); color: var(--ink-primary); }
.avatar-menu-email { display: block; font: 400 12.5px/1.35 var(--font-sans); color: var(--ink-secondary); margin-top: 2px; }
.avatar-menu button {
  display: flex; align-items: center; width: 100%; min-height: 44px;
  border: 0; background: transparent; cursor: pointer; padding: 0 var(--space-4);
  font: 400 15px/1.5 var(--font-sans); color: var(--ink-primary); text-align: left;
}
.avatar-menu button:hover { background: var(--surface-inset); }

/* ---- footer / provenance ---- */
.app-footer {
  padding: var(--space-6) var(--space-5) calc(var(--space-6) + env(safe-area-inset-bottom));
  text-align: center;
}
.provenance {
  font: 400 11.5px/1.4 var(--font-sans); color: var(--ink-secondary);
  font-variant-numeric: tabular-nums;
  display: flex; align-items: center; justify-content: center; gap: var(--space-1);
}
.provenance-text { border: 0; background: transparent; cursor: pointer; padding: var(--space-2); font: inherit; color: inherit; }
.provenance-detail {
  margin: var(--space-2) auto 0; max-width: 320px; text-align: left;
  background: var(--surface-card); border-radius: var(--radius-md); box-shadow: var(--shadow-3);
  padding: var(--space-3) var(--space-4); font: 400 12.5px/1.5 var(--font-sans); color: var(--ink-secondary);
}
.app-footer .footnote { font: 400 11.5px/1.4 var(--font-sans); color: var(--ink-secondary); margin: var(--space-2) 0 0; }
.app-footer a { color: var(--ink-secondary); }

/* ---- reduced motion, global ---- */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

### Reference JSX for the header/footer (adapt, don't paste blindly)

```tsx
<header className="app-header">
  <div className="header-line1">
    <div className="wordmark">Sail<span className="wordmark-accent">Greece</span></div>
    <AvatarMenu />
  </div>
  <div className="header-line2">
    <nav className="segmented-tabs" aria-label="Ansicht">
      <button type="button" aria-current={activeTab === 'tag' ? 'page' : undefined}
              onClick={() => setView({ kind: 'tag' })}>Heute</button>
      <button type="button" aria-current={activeTab === 'karte' ? 'page' : undefined}
              onClick={() => setView({ kind: 'karte' })}>Karte</button>
    </nav>
    <button type="button" className="icon-button" aria-label="Forecast aktualisieren"
            onClick={() => forecastQuery.refetch()} disabled={forecastQuery.isFetching}>
      <span aria-hidden="true" className={forecastQuery.isFetching ? 'spin' : undefined}>⟳</span>
    </button>
  </div>
</header>
```

Reduced-motion glyph swap: render `…` instead of the spinning `⟳` while fetching when
`window.matchMedia('(prefers-reduced-motion: reduce)').matches` — or, simpler and
acceptable, keep the ⟳ static (the global CSS rule already kills the spin) and add a
visually-hidden "Aktualisierung läuft …" text while disabled. Either satisfies "static
glyph swap"; do not ship a spinning-only pending signal.

Footer:

```tsx
<footer className="app-footer">
  <p className="provenance" aria-live="polite">
    <button type="button" className="provenance-text" aria-expanded={detailOpen}
            onClick={() => setDetailOpen((o) => !o)}>
      Forecast: {assessment?.model ?? '…'} · Lauf {formatStamp(assessment?.modelRunIso ?? null)} ·
      abgerufen {assessment ? formatStamp(assessment.fetchedAtIso) : '…'}
    </button>
    <button type="button" className="icon-button" aria-label="Forecast aktualisieren"
            onClick={() => forecastQuery.refetch()} disabled={forecastQuery.isFetching}>
      <span aria-hidden="true">⟳</span>
    </button>
  </p>
  {detailOpen && (
    <div className="provenance-detail">
      <p>Modell: {assessment?.model ?? '…'}</p>
      <p>Modelllauf: {formatStamp(assessment?.modelRunIso ?? null)}</p>
      <p>Abgerufen: {assessment ? formatStamp(assessment.fetchedAtIso) : '…'}</p>
      <p>Cache-TTL: {Math.round(STALE_TIME_MS / 3_600_000)} h</p>
    </div>
  )}
  <p className="footnote">
    Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0)
  </p>
  <p className="footnote">
    Sichere Liegeplätze quellenbasiert kuratiert (Heikell, CruisersWiki u. a.) —
    unkuratierte Plätze erscheinen nie grün.
  </p>
  <p className="footnote">
    Ersetzt nicht das seemännische Urteil — Modell-Konsens parallel prüfen (z. B. Windy).
  </p>
</footer>
```

(The ⟳ character is a glyph with an `aria-label`ed button, not an emoji-as-meaning — the
DESIGN.md provenance spec itself renders "⟳". `STALE_TIME_MS` imports from
`./usePlanning.ts`, already imported in App.tsx.)

### index.html — exact target

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="description" content="SailGreece — privater Törnplaner für den Kykladen-Round-Trip: Tagesentscheidung, Ampel-Bewertung, Karte und Rückkehrfenster." />
    <meta name="theme-color" content="#faf9f7" />
    <link rel="icon" href='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="%23f2604d"/><text x="50" y="70" font-family="-apple-system,sans-serif" font-size="56" font-weight="700" text-anchor="middle" fill="%23ffffff">S</text></svg>' />
    <title>SailGreece</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/app/main.tsx"></script>
  </body>
</html>
```

No service worker, no manifest, no install prompt — "PWA-ish" hygiene only (EXPERIENCE.md
Foundation).

### Source tree — CURRENT STATE / CHANGES / PRESERVE per file

**`src/ui/styles.css` (1369 lines)**
- CURRENT: line 1–18 legacy `:root` (creme/navy/serif + old Ampel `#3a7d44/#d9a441/#b0413e/#9aa5b1`).
  Sections in order: base/reset; header (`.topbar` navy bar, `.brand` serif + uppercase
  small, `.tabs` bordered uppercase buttons, `.notice-bar` + `.datenstand` refresh button);
  generic (`main.content` 1280px, `.versal` six-way-divergent uppercase recipe, serif
  `h1/h2/h3`, `.section` hairlines, `.badges/.badge`, `.ampel` + per-state dot classes);
  day view (cards, state chips, leg chips, `.controls` = ControlsBar, error/hint panels);
  auth (`.auth-gate/.auth-card/.auth-brand/.google-button`, `.account-chip`); map view
  (`.map-split`, `.map-sticky` with `top: 1rem`, itinerary cards, route toggles,
  `.marker-pin`, wind barb halo, wind legend); stage map (FR30); place detail (`.place-hero`
  navy gradient, shelter table); footer (`footer.attribution` navy); ≤860px media query
  (incl. `.account-chip` wrap rule); Round-Trip sections (resttrip banner, stage cards/editor,
  breakdown + its ≤700px stacking, wind-basis, stage numbers, legend, option rows, alt
  routes, details expanders). Raw hex sprinkled through warn/frist/state recipes.
- CHANGES: Tasks 3–5, 8 (token block + aliases, delete topbar/brand/old-tabs/notice-bar/
  datenstand/account-chip/footer.attribution CSS and the `.account-chip` media-query rule,
  add header/tabs/buttons/focus/motion/avatar/footer sections, bump `.map-sticky` top, new
  file-head comment).
- PRESERVE: every other selector byte-for-byte where possible — DayView/MapView/
  PlaceDetailView/SignInView reference ~50 classes (`.card`, `.versal`, `.controls`,
  `.stage-*`, `.option-*`, `.alt-*`, `.breakdown*`, `.place-hero*`, `.shelter-table`,
  `.hint-panel`, `.error-panel`, `.auth-*`, `.google-button`, `.map-*`, `.itinerary-card`,
  `.marker-pin`, `.wind-*`, `.legend*`, `.badge*`, `.ampel*`, `.back-link`, `.warnung`,
  `.rueckweg-zeile`, `.resttrip-*`, `.leg-chip`, `.state-chip`, `.pin-chip`,
  `.suggestion-chip`, `.past-list`, `.reasons`, `.lesehilfe`, `.hint-annahme`,
  `.badge-annahme`, `.badge-doppelschlag`, `.badge-frist`, `.badge-info`,
  `.sektor-inaktiv`, `.stage-number`, `.alt-farbe`, `.alt-toggles`, `.wind-basis*`) — all
  must keep resolving. Both media queries (≤860px map stack minus the account-chip rule;
  ≤700px breakdown stacking + alt-stage) stay.

**`src/app/App.tsx` (308 lines)**
- CURRENT: `queryClient` w/ `STALE_TIME_MS`; `View` union (tag/karte/platz+returnTo);
  `ControlsBar` (Törntag select, Position select, "GPS abfragen" button, "Manuelle Position
  lösen", Abfahrt select, inline gps error styled `var(--rot)`); `AccountChip` (photo, name
  span w/ `title`, wide uppercase Abmelden button); `Shell` (topbar with
  "sailgreece-router" brand + `formatTripRange` date-range small line, `.tabs` nav
  "Tagesansicht"/"Karte" with `.active` class, AccountChip; notice-bar with
  Modell/Modelllauf/abgerufen + "Aktualisieren" button; `main.content` with library/forecast
  error panels, ControlsBar (hidden on platz view), "Lade Bibliothek und Forecast …" hint,
  the three views; `footer.attribution` with Open-Meteo + curation note); `AuthGate`
  (checking card with "sailgreece-router" auth-brand; SignInView; providers); `App` root.
- CHANGES: Tasks 5–9 — new header (wordmark/AvatarMenu/segmented tabs "Heute"·"Karte" with
  `aria-current`/RefreshButton), notice-bar deleted, AccountChip deleted, footer rewritten,
  AuthGate brand string → wordmark markup, `formatTripRange` import removed. `Shell` needs
  `forecastQuery` + `assessment` where header/footer render (already destructured from
  `usePlanning()`).
- PRESERVE: `View` union and `activeTab` derivation (incl. platz→returnTo tab logic);
  `openPlace`; ControlsBar untouched incl. its `view.kind !== 'platz'` gating; the two
  error panels; the loading hint; the view switch; provider nesting and the AuthGate
  gate-before-providers rationale; `queryClient` config.

**`src/ui/components/AmpelBadge.tsx`**
- CURRENT: renders `.ampel ampel-{ampel}` dot+label (German labels correct); exports
  `AMPEL_CSS_COLOR` with the FIRST divergent palette (`#3a7d44/#d9a441/#b0413e/#9aa5b1`).
- CHANGES: delete `AMPEL_CSS_COLOR` (only importer is MapView, which moves to tokens.ts).
- PRESERVE: the component itself — markup, labels, the `title` attr (redundant but its
  removal is a later-story concern), the `label?` prop.

**`src/ui/views/MapView.tsx` (561 lines)**
- CURRENT: `REST_LINE_COLOR` = SECOND divergent palette (`#3f7d4f/#c8952a/#b3423a/#8b8b8b`),
  `SAILED_LINE_COLOR = '#3f7d4f'`; imports `AMPEL_CSS_COLOR` from AmpelBadge for marker
  pins; itinerary sidebar, wind layer, alt-route toggles, `mapId` fallback `'DEMO_MAP_ID'`.
- CHANGES: swap the two constants + the AmpelBadge color import for
  `AMPEL_GRAPHIC_HEX`/`MAP_LINE_SAILED` from `../tokens.ts` (Task 2.2). NOTHING else — the
  Karte redesign (bottom sheet, legend popover, DEMO_MAP_ID removal, keyboard-operable
  pins) is a later story.
- PRESERVE: all behavior, the hover sync, wind field logic, the `DEMO_MAP_ID` fallback
  (EXPERIENCE.md wants it gone, but that belongs to the Karte story).

**`src/ui/altRouteColors.ts`**
- CURRENT: `ALT_ROUTE_COLORS = ['#6f4a9c', '#1f7a8c', '#b05f2c']` + `altRouteColor(index)`.
- CHANGES: values move to tokens.ts; this file re-exports and keeps the helper + doc
  comment (the "deliberately outside Ampel hues" rationale still holds — DESIGN.md retained
  these exact values).
- PRESERVE: the `altRouteColor` signature (used by DayView and MapView).

**`src/ui/components/WindBarb.tsx`**
- CURRENT: default prop `color = '#1b2a41'` (navy).
- CHANGES: `color = INK_PRIMARY` from `../tokens.ts`. The white halo lives in CSS
  (`.wind-barb svg` drop-shadow) and stays.
- PRESERVE: everything else (barb math is tested indirectly via windField tests).

**`src/ui/components/Polyline.tsx`**
- CURRENT: `casingColor = '#ffffff'` default.
- CHANGES: default from `MAP_LINE_CASING`.

**`src/ui/views/SignInView.tsx`**
- CURRENT: `.auth-brand` renders "sailgreece-router"; Google logo SVG with Google-brand hex.
- CHANGES: brand string → wordmark markup (Task 9.1). Google hexes stay (documented
  exception).
- PRESERVE: sign-in flow, error panels, layout.

**`index.html`** — CURRENT: bare (`lang="de"`, title "sailgreece-router", no description/
theme-color/favicon). CHANGES: full snippet above.

**`src/ui/format.ts` + `src/ui/__tests__/`**
- CURRENT: tests cover `formatAthensTime`, `compass`, `formatWindFrom`, `pointOfSail`
  (format.test.ts), mapPath, windField. `formatTripRange` is NOT tested and after this story
  NOT used — leave the export in place (harmless, may return in a later story) or delete it;
  if deleted, nothing else references it. Do not modify any test.
- `vitest.config.ts`: node environment, `src/**/__tests__/**/*.test.ts` — a new
  `tokens.test.ts` (Task 1.4) is picked up automatically.

### Accessibility floor for this story's surfaces

- Landmarks: `header` (banner), `nav` (tab row, `aria-label="Ansicht"`), one `main`,
  `footer` (contentinfo).
- Tap targets ≥44px: tab segments, refresh (both), avatar-menu items. The 34px avatar
  visual is spec; give the button itself a ≥44px hit area (padding or pseudo-element).
- `aria-live="polite"` on the provenance container; no meaning in `title` tooltips for
  anything NEW.
- Focus: two-layer ring everywhere (AC5); avatar menu traps focus and returns it; Esc
  closes menu and detail expander (expander Esc optional this story — it's a plain
  disclosure, not a popover).
- German accessible names: "Konto", "Forecast aktualisieren", "Ansicht".
- No emoji as semantics (⟳ glyph is aria-hidden inside a labeled button).
- Known deferred a11y debt (do NOT fix here): heading hierarchy repair, 16px input font in
  ControlsBar, legacy `title` tooltips, map pin keyboard operability — later stories.

### DoD greps (all must return nothing; run from repo root)

```bash
# banned legacy hex anywhere in source (git history excluded by construction):
grep -rniE '#f7f3ea|#1b2a41|#3a7d44|#3f7d4f|#d9a441|#c8952a|#b0413e|#b3423a|#fffdf7|#9aa5b1|#8b8b8b|#2d4059|#24303f|#6b7684|#ddd6c7' src/ index.html
# deleted chrome classes/components:
grep -rn 'topbar\|notice-bar\|account-chip\|datenstand\|AccountChip' src/
# repo-name brand string out of the UI (package.json/README/scripts may keep it):
grep -rn 'sailgreece-router' src/ index.html
# serif really gone:
grep -rni 'georgia\|serif' src/ui/styles.css   # only the --font-sans stack's "sans-serif" may remain
# single TS color source (only tokens.ts and the sanctioned Google-logo SVG may carry hex):
grep -rniE "#[0-9a-f]{6}\b" src --include='*.ts' --include='*.tsx' | grep -v 'ui/tokens.ts' | grep -v 'SignInView'
```

Exception rule, stated for the record: legacy CSS sections may keep NON-banned raw hex
(e.g. `#e4cf9f`, `#4e6b8c`) and legacy components intentionally keep consuming the mapped
alias variables — that is the migration design, not a violation.

### Project Structure Notes

- New files: `src/ui/tokens.ts`, `src/ui/components/AvatarMenu.tsx` (optional split — may
  live in App.tsx; prefer the component file), optionally
  `src/ui/__tests__/tokens.test.ts`.
- Modified: `src/ui/styles.css`, `src/app/App.tsx`, `src/ui/components/AmpelBadge.tsx`,
  `src/ui/components/WindBarb.tsx`, `src/ui/components/Polyline.tsx`,
  `src/ui/views/MapView.tsx`, `src/ui/views/SignInView.tsx`, `src/ui/altRouteColors.ts`,
  `index.html`.
- Untouched (verify by diff): everything under `src/domain/`, `src/adapters/`,
  `src/app/tripContext.tsx`, `src/app/planningContext.tsx`, `src/app/usePlanning.ts`,
  `src/app/authContext.tsx`, `src/ui/views/DayView.tsx`, `src/ui/views/PlaceDetailView.tsx`,
  `src/ui/mapPath.ts`, `src/ui/windField.ts`, `src/ui/format.ts` (unless deleting the
  now-unused `formatTripRange`), all seeding/, all configs except none.
- Alignment: matches the Architecture Structural Seed (`ui/` owns view code and now the
  token module; `app/` composes; domain untouched). No conflicts detected.

### References

- **DESIGN.md (BINDING, final):**
  `_bmad-output/planning-artifacts/ux-designs/ux-sailgreece-router-2026-08-05/DESIGN.md` —
  frontmatter token tables (lines 11–214); § Brand & Style (wordmark decision); § Colors
  (ink rules, contrast honesty + coral size rule, focus indicator, Ampel palette + Gelb
  graphic variant, map & routes); § Typography (ramp, tabular numerals); § Layout & Spacing;
  § Elevation & Depth (single source for shadows); § Shapes; § Components (button system,
  segmented tabs, avatar, avatar-menu, provenance-line; composed surface "Two-line header");
  § Do's and Don'ts.
- **EXPERIENCE.md (BINDING, final):** same folder — § Foundation (no router, PWA-ish
  hygiene); § Information Architecture ("Two-line header" block: exact header content and
  exclusions; "Provenance and notices"); § Component Patterns rows "Two-line header",
  "Avatar menu", "Refresh + provenance"; § Interaction Primitives (44px, focus-visible,
  popover/expander contracts, reduced motion); § Accessibility Floor (landmarks, aria-live,
  lang); § Responsive & Platform (safe-area, 390px primary viewport); § Open Questions
  (sticky header resolved 2026-08-05).
- **Mockup (header composition reference):**
  `…/ux-sailgreece-router-2026-08-05/mockups/direction-consumer-warm.html` lines 72–101
  (header CSS), 229–241 (header markup), 202–207 + 301–303 (provenance footer).
- **Architecture:** `_bmad-output/planning-artifacts/architecture/architecture-sailgreece-router-2026-07-30/ARCHITECTURE-SPINE.md`
  — Design Paradigm (layering), AD-2 (testing: UI test-free), AD-7 (STALE_TIME_MS ≈ 1 h =
  FR13 TTL), AD-11 (no router, view state in memory), Consistency Conventions (German UI /
  English code, permanent NFR3 + Datenstand visibility, Open-Meteo attribution), § Stack.
- **PRD:** `_bmad-output/planning-artifacts/prds/prd-sailgreece-router-2026-07-30/prd.md` —
  FR13 (cache TTL 1–3 h + visible Datenstand), FR27 (GPS auto at start, no button — why the
  header has none), FR32 (Törntag from date — why the header has no day select), NFR1
  (superseded palette, kept structure), NFR3 (seamanship disclaimer).
- **Current code ground truth:** files listed in Project Structure Notes, read 2026-08-05;
  `.working/ui-inventory-ist-zustand.md` (same UX folder) for the current-state inventory.

## Dev Agent Record

### Agent Model Used

(placeholder)

### Debug Log References

### Completion Notes List

### File List
