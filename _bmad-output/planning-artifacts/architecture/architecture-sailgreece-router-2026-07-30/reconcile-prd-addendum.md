---
title: "Quellen-Abgleich: PRD-Addendum ↔ Architecture Spine"
type: reconciliation
created: 2026-07-30
inputs:
  - _bmad-output/planning-artifacts/prds/prd-sailgreece-router-2026-07-30/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-sailgreece-router-2026-07-30/ARCHITECTURE-SPINE.md
status: final
---

# Quellen-Abgleich: PRD-Addendum ↔ Architecture Spine

Frage: Sind die technischen Vorgaben des PRD-Addendums im Spine angekommen oder
bewusst deferred? Prüfung Punkt für Punkt.

## 1. Firestore/GCP-Entscheidung

**Status: angekommen (vollständig).**

- Firestore als DB: AD-1 (Client-only SPA, Firestore Web SDK direkt), AD-5
  (flache Collections `islands`/`places`/`routes`/`config`, ein Schreiber),
  Stack-Tabelle (Firebase JS SDK 12.x, firebase-tools 15.x, firebase-admin).
- Google-Universum-Prinzip: konsistent umgesetzt — Firebase Hosting (AD-8),
  Google Maps (Stack: `@vis.gl/react-google-maps`), Geolocation-Adapter.
- Vercel explizit vom Tisch: implizit erledigt (AD-8 wählt klassisches Firebase
  Hosting und grenzt sogar Firebase App Hosting bewusst ab).
- Auth: Addendum sagt „ggf. Firebase Auth, falls Zugriffsschutz gewünscht";
  Spine deferred Auth explizit („per PRD out of scope") — bewusste Entscheidung,
  kein Versäumnis.

## 2. Polar-Datenmodell (FR15/FR26-Detail)

**Status: teilweise angekommen — zwei Lücken.**

| Addendum-Vorgabe | Im Spine? | Beleg |
| --- | --- | --- |
| Tabelle Geschwindigkeit = f(TWA, TWS) | Ja (implizit) | `domain/polar.ts`, Firestore `config`-Dokument `polar`, ER-Diagramm `CONFIG ||--|| POLAR` |
| Interpolation zwischen Stützstellen | Ja | Design Paradigm nennt „Polar-Interpolation" als Domänenlogik in `src/domain/` |
| Offset (+0,5 kn Saona) als konfigurierbarer Parameter | Ja | AD-3 („Polare + Offset" im Snapshot), AD-8 („Tuning-Parameter (Polar-Offset, …) im `config`-Dokument") |
| **Motorfahrt als separater Parameter (~8 kn), Offset gilt dort nicht** | **Nein** | Nirgends im Spine erwähnt — weder in AD-3/AD-8 noch im `config`-Schema-Umriss; der Detailentscheid „Zuschlag/Abschlag gegenan über Polare bzw. Motor-Regel" (lt. Addendum ausdrücklich für die Architektur-Phase) taucht auch nicht unter *Deferred* auf |
| **Fallback: Brief-Pauschalwerte, solange keine Polare geladen** | **Nein** | Kein Fallback-Verhalten im Spine (weder Rule noch Deferred) |
| Verifikation Polar-Transkript vor DB-Import (Screenshot-Rekonstruktion) | Nein (grenzwertig) | AD-4 validiert nur Schema-Konformität; die inhaltliche Verifikation des rekonstruierten Transkripts ist eher Seeding-Task als Architektur — als offener Punkt aber nirgends notiert |

## 3. Seeding-Ablauf (KI-Recherche → eine Review-Runde → validierter Import)

**Status: teilweise angekommen — eine Lücke.**

- Validierter Import: Ja — AD-4 (Zod-Schemas, „validieren strikt vor jedem
  Import"), AD-5 (Seeding-Skripte als einziger Schreiber), NFR6-Kopplung
  („unkuratierter oder invalider Platz erhält keine grüne Ampel").
- Insel-orientiert iterativ: Ja — Structural Seed: `seeding/` =
  „Kurations-Staging (JSON je Insel) + Import-Skripte".
- **Die „eine Abstimmungsrunde" (kompakte Review-Sicht, v. a. sicherheits-
  relevante Schutzprofile, Philipp bestätigt einmal): fehlt.** Der Spine kennt
  nur maschinelle Validierung; der verpflichtende Human-Review-Schritt zwischen
  KI-Recherche und Import ist weder als Rule noch als Deferred-Eintrag
  abgebildet. Da NFR6 gerade auf „kuratiert" abstellt, sollte der Review-Schritt
  im Seeding-Ablauf (z. B. Staging-JSON → Review-Artefakt → Import erst nach
  Freigabe) explizit verankert werden.
- Umfang 100–150 Plätze: im Spine nicht quantifiziert; unkritisch, da das
  flache Collection-Design (AD-5) und das Insel-Staging skalierungsneutral sind.

## 4. Google-Maps-Kosten-Hinweise

**Status: nicht angekommen — steht nirgendwo im Spine.**

- Free-Tier 10.000 Map-Loads/Monat: nicht erwähnt (nur die Key-Absicherung via
  Referrer-Restriction in AD-8).
- **Dashed-Line-Workaround via Symbol-Icons (`repeat`): nicht erwähnt.** Die
  Stack-Tabelle behauptet sogar „Polyline nativ" bei `@vis.gl/react-google-maps`
  — das deckt gestrichelte Linien nicht ab; das Workaround-Wissen aus der
  Tech-Recherche geht damit für die Bau-Phase verloren, obwohl geplante/alternative
  Routen (Optionsraum, F6) genau solche Linien-Differenzierung brauchen dürften.
- Empfehlung: eine Zeile in den Consistency Conventions oder ein Deferred-Eintrag
  („Routen-Linienstile: dashed via Symbol-`repeat`-Icons, Free-Tier-Budget
  unkritisch") genügt.

## 5. Y.CO-Design-Patterns als UX-Input

**Status: bewusst deferred (korrekt).**

- Deferred-Eintrag: „UI-Komponentenstruktur & Y.CO-Umsetzung (Sticky-Split,
  Tageskarten, responsive Stapelung): UX-Phase / Umsetzung; Pattern-Extrakt
  liegt im PRD-Addendum."
- Zusätzlich referenziert die Capability-Map F1 die „NFR1-Patterns (Addendum)".
- Sauber: Verweis auf die Quelle statt Duplikat, Zuständigkeit (UX-Phase) benannt.

## 6. Karten-Stack-Abwägung

**Status: angekommen (Entscheidung), Begründung/Kosten nicht (siehe Punkt 4).**

Google Maps JS API ist im Stack fixiert (`@vis.gl/react-google-maps` 1.x,
referrer-restricted Key in AD-8); die dokumentierten Kosten der Entscheidung
(Billing-Setup, Dashed-Line-Workaround, Free-Tier) sind nicht übernommen.

## Ergebnis

| # | Lücke | Schwere |
| --- | --- | --- |
| L1 | Motorfahrt (~8 kn) als separater Parameter — vom Addendum explizit an die Architektur-Phase delegiert, im Spine weder geregelt noch deferred | Mittel |
| L2 | Fallback auf Brief-Pauschalwerte ohne geladene Polare fehlt komplett | Mittel |
| L3 | Human-Review-Runde im Seeding-Ablauf (sicherheitsrelevante Schutzprofile) nicht verankert — nur maschinelle Validierung | Mittel–Hoch (NFR6) |
| L4 | Google-Maps-Kostenhinweise fehlen; Dashed-Line-Symbol-Workaround nirgends notiert, Stack-Tabelle suggeriert „Polyline nativ" reiche | Niedrig–Mittel |
| L5 | Verifikation des aus Screenshot rekonstruierten Polar-Transkripts vor Import nirgends als offener Punkt notiert | Niedrig |

Alles Übrige (Firestore/GCP, Polare-als-Config + Offset + Interpolation,
validierter insel-orientierter Import, Y.CO-Deferral, Maps-Stack-Wahl) ist im
Spine angekommen oder sauber deferred.
