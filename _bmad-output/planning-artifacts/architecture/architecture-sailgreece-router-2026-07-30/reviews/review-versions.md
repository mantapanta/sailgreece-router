# Review: Versions- und Realitätscheck — ARCHITECTURE-SPINE.md

- **Reviewtyp:** Verifikation aller committeten Stack-Versionen und fachlichen Realitätsannahmen gegen Web-Quellen und Live-Registry (kein Vertrauen auf Trainingswissen)
- **Geprüftes Artefakt:** `_bmad-output/planning-artifacts/architecture/architecture-sailgreece-router-2026-07-30/ARCHITECTURE-SPINE.md`
- **Reviewdatum:** 2026-07-30
- **Methode:** Live-Abfragen gegen `registry.npmjs.org` (dist-tags, exakte Versionslisten), Tarball-Inspektion (`@vis.gl/react-google-maps@1.9.0` — `dist/index.d.ts`), WebSearch gegen offizielle Doku (Firebase, Google Maps Platform, Open-Meteo, Node.js-Release-Schedule)

## Verdict: **PASS — alle committeten Entscheidungen bestätigt**

Jede im Spine genannte Version existiert und ist zum Stichtag 2026-07-30 die aktuelle
Linie (bzw. exakt `latest`). Alle vier fachlichen Realitätsannahmen sind durch
offizielle Dokumentation gedeckt. Keine Halluzination, keine veraltete Angabe
gefunden. Drei Anmerkungen auf Note-Level (keine Blocker, keine Änderung am Spine
zwingend erforderlich).

---

## Teil A — Stack-Versionen (Quelle: npm-Registry live, 2026-07-30)

| Spine-Angabe | Registry `latest` (2026-07-30) | Befund |
| --- | --- | --- |
| Vite 8.x (8.2.0) | **8.2.0** | ✅ Exakt `latest`. Vite 8 (Rolldown) erschien März 2026; 8.1.x- und 8.2.0-Releases existieren in der Registry. (Hinweis: einzelne Web-Artikel nennen noch 8.0.16 als „latest" — Stand Juni; die Registry ist maßgeblich und bestätigt 8.2.0.) |
| React 19.x (19.2.8) | **19.2.8** | ✅ Exakt `latest`; GitHub-Release v19.2.8 vom 21. Juli 2026 bestätigt. |
| TypeScript 5.9.x, „bewusst nicht 7.0 — GA erst Juli 2026" | `latest` = **7.0.2** | ✅ Faktisch korrekt: TS 7.0 (Go-nativer Compiler) ging am **8. Juli 2026** GA — der Spine-Vorbehalt „GA erst Juli 2026, Tooling reift" stimmt (Ökosystem: Vue/Svelte-Tooling u. a. noch nicht nachgezogen). 5.9.x existiert stabil (aktuellster Patch: **5.9.3**). Siehe Anmerkung A1 zu TS 6.0. |
| Firebase JS SDK (modular) 12.x | **12.16.0** | ✅ 12.x ist die aktuelle Major-Linie. |
| firebase-tools (CLI) 15.x | **15.25.0** | ✅ 15.x ist die aktuelle Major-Linie. |
| @vis.gl/react-google-maps 1.x | **1.9.0** | ✅ 1.x aktuell. **Kernclaim „AdvancedMarker + Polyline nativ" per Tarball-Inspektion bestätigt** — siehe Teil B. |
| TanStack Query 5.x | **5.101.4** | ✅ 5.x ist die aktuelle Major-Linie. |
| Zod 4.x | **4.4.3** | ✅ 4.x ist die aktuelle Major-Linie. |
| Vitest 4.x | **4.1.10** | ✅ 4.x ist die aktuelle Major-Linie (5.0 nur als Beta). |
| firebase-admin „aktuell" (Node 22 LTS) | **14.2.0** | ✅ firebase-admin 14.x aktuell. Node 22: **noch LTS, aber seit Okt 2025 Maintenance-LTS** (EOL 30. Apr 2027); Active LTS ist Node 24. Siehe Anmerkung A2. |

## Teil B — Kernclaim @vis.gl/react-google-maps: AdvancedMarker UND Polyline nativ?

**Bestätigt — nicht nur per Doku, sondern per Inspektion des veröffentlichten
Pakets.** Tarball `react-google-maps-1.9.0.tgz` von der npm-Registry geladen;
`dist/index.d.ts` deklariert und exportiert:

- `declare const AdvancedMarker: React.ForwardRefExoticComponent<…AdvancedMarkerElementOptions…>` (Zeile 180)
- `declare const Polyline: React.ForwardRefExoticComponent<Omit<google.maps.PolylineOptions, "map" | "path"> & PolylineEventProps…>` (Zeile 581)
- Export-Liste enthält beide: `export { …, AdvancedMarker, …, Polygon, Polyline, … }` — dazu `Circle`, `Rectangle`, `useAdvancedMarkerRef`.

Das ist relevant, weil Polyline in frühen 1.x-Versionen der Library **nur als
kopierbares Example** existierte (nicht exportiert). In 1.9.0 ist Polyline ein
echter Library-Export. Der Spine-Claim ist für die gepinnte Version korrekt.

„Offizielle Google-Empfehlung": im Wesentlichen korrekt — die Library wurde vom
Google-Maps-Platform-Team gemeinsam mit vis.gl angekündigt, wird in den offiziellen
Maps-JS-API-Doku-Beispielen (developers.google.com) verwendet und Google committet
sich zur Pflege. Präzise formuliert ist sie „von Google empfohlen und mitgetragen,
gepflegt von vis.gl/OpenJS" — nicht „von Google offiziell supportet". Für den
Spine-Zweck ausreichend genau. (Anmerkung A3.)

## Teil C — Fachliche Realitätsannahmen

### C1 — Firestore Security Rules `read: true, write: false` ✅ valides Muster

Offizielle Firebase-Doku (`firebase.google.com/docs/rules/basics`,
„Get started with Cloud Firestore Security Rules") führt genau dieses Muster:
`allow read: if true; allow write: if false;` ist die dokumentierte Form für
öffentlich lesbare, nicht schreibbare Daten. Die bekannte Produktions-Warnung der
Doku betrifft `write: if true` (offene Schreibrechte) — nicht dieses Muster.
Seeding via firebase-admin umgeht Security Rules per Design (Admin SDK), der
„einzige Schreiber"-Ansatz von AD-5 funktioniert also exakt wie beschrieben.

### C2 — Open-Meteo: keyless + CORS aus dem Browser, inkl. Marine API ✅ bestätigt (per Doku)

- **Keyless:** Open-Meteo erfordert für nicht-kommerzielle Nutzung keinen API-Key
  und keine Registrierung (offizielle Doku + GitHub-Repo: „Free Weather Forecast
  API for non-commercial use", ~10.000 Calls/Tag).
- **CORS:** Direktzugriff aus dem Browser ist der dokumentierte Primär-Use-Case;
  CORS ist API-seitig offen (mehrfach unabhängig bestätigt).
- **Marine API:** eigener Endpoint `marine-api.open-meteo.com/v1/marine`
  (Wellenhöhe, -richtung, -periode, Swell etc.), gleiche Konditionen — keyless,
  browser-tauglich (offizielle Doku-Seite „Marine Weather API").
- *Methodischer Hinweis:* Ein Live-CORS-Preflight-Test aus dieser Sandbox war nicht
  möglich (Egress-Proxy blockt `api.open-meteo.com` per Policy — 403 vom Proxy,
  nicht von Open-Meteo). Bestätigung daher doku-basiert; Konfidenz hoch, da
  Browser-Direktzugriff das dokumentierte Kernszenario der API ist.
- *Lizenz-Randnote:* Free Tier ist an **nicht-kommerzielle Nutzung** gebunden —
  für ein privates Solo-Törn-Tool erfüllt.

### C3 — Google-Maps-Key per HTTP-Referrer-Restriction im öffentlichen Bundle ✅ akzeptiertes Muster

Googles offizielle Security-Guidance
(`developers.google.com/maps/api-security-best-practices`) benennt
HTTP-Referrer-Restrictions als **den** vorgesehenen Mechanismus für Browser-Keys;
Maps-JS-API-Keys sind by design clientseitig sichtbar. Das Spine-Muster
(„öffentlich by design" + Referrer-Restriction) entspricht der offiziellen
Empfehlung. Ergänzung siehe Anmerkung A4 (zusätzliche API-Restriction).

### C4 — Klassisches Firebase Hosting (nicht App Hosting) für statische Vite-SPA ✅ exakt die offizielle Empfehlung

Firebase-eigene Doku und Blog („App Hosting vs. the original Hosting",
`firebase.google.com/docs/app-hosting/product-comparison`): App Hosting zielt auf
SSR-Frameworks (Next.js, Angular) und **erfordert Blaze**; für rein statische Apps
empfiehlt Firebase ausdrücklich das klassische Hosting (performanter,
kosteneffizienter, Spark-Plan-fähig). Die „Prevents"-Begründung in AD-8 („zielt
auf SSR-Frameworks, braucht Blaze") ist wortgetreu durch die offizielle Doku
gedeckt.

---

## Anmerkungen (Note-Level, keine Blocker)

- **A1 — TS 6.0 existiert stabil (6.0.2/6.0.3):** Der Spine kontrastiert nur
  „5.9.x vs. 7.0". TS 6.0 ist die stabile JS-basierte Brücken-Release-Linie zu 7.0.
  Pinning auf 5.9.x ist konservativ-vertretbar (maximale Ökosystem-Kompatibilität,
  9-Tage-Projekt); wer „aktuellste JS-Compiler-Linie" will, nähme 6.0.x. Kein
  Fehler, aber die Begründungszeile könnte 6.0 erwähnen.
- **A2 — „Node 22 LTS" ist Maintenance-LTS:** Seit Okt 2025 ist Node 24 Active
  LTS; Node 22 ist Maintenance (EOL 30.04.2027). Für Seeding-Skripte mit Laufzeit
  bis Aug 2026 völlig unkritisch — die Bezeichnung „LTS" stimmt weiterhin, nur
  „aktuelles LTS" wäre Node 24.
- **A3 — „offizielle Google-Empfehlung":** korrekt im Sinne von „von Google
  empfohlen, in offiziellen Doku-Beispielen verwendet, Pflege-Commitment" —
  formal aber ein OpenJS/vis.gl-Projekt ohne Google-Support-SLA. Unwesentlich für
  die Entscheidung.
- **A4 — Maps-Key-Härtung:** Googles Best Practice empfiehlt zusätzlich zur
  Referrer-Restriction eine **API-Restriction** (Key nur für Maps JavaScript API
  freischalten). Der Spine erwähnt nur die Referrer-Restriction; die
  API-Restriction ist ein Ein-Klick-Zusatz bei der Key-Anlage — als
  Umsetzungsnotiz empfehlenswert, kein Architektur-Delta.

## Quellen (Auswahl)

- npm-Registry (live, 2026-07-30): dist-tags für `vite`, `react`, `typescript`, `firebase`, `firebase-tools`, `@vis.gl/react-google-maps`, `@tanstack/react-query`, `zod`, `vitest`, `firebase-admin`
- Tarball-Inspektion: `https://registry.npmjs.org/@vis.gl/react-google-maps/-/react-google-maps-1.9.0.tgz` → `dist/index.d.ts`
- [Vite 8.0 is out!](https://vite.dev/blog/announcing-vite8) · [InfoQ: Vite 8 Rust-Bundler](https://www.infoq.com/news/2026/05/vite-v8-rust/)
- [React 19.2.8 Release (21. Juli 2026)](https://github.com/react/react/releases/tag/v19.2.8) · [react.dev: React 19.2](https://react.dev/blog/2025/10/01/react-19-2)
- [TypeScript 7.0 GA (Go-nativer Compiler, 8. Juli 2026)](https://byteiota.com/typescript-7-go-native-compiler/) · [TS 7 GA Migration Playbook](https://www.digitalapplied.com/blog/typescript-7-0-ga-native-compiler-migration-playbook-2026)
- [Firebase JS SDK Release Notes](https://firebase.google.com/support/release-notes/js) · [firebase@12.12.0+](https://github.com/firebase/firebase-js-sdk/releases)
- [Firebase: Basic Security Rules](https://firebase.google.com/docs/rules/basics) · [Get started with Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Open-Meteo GitHub (free, non-commercial, keyless)](https://github.com/open-meteo/open-meteo) · [Marine Weather API](https://open-meteo.com/en/docs/marine-weather-api)
- [Google Maps Platform Security Guidance](https://developers.google.com/maps/api-security-best-practices) · [Best practices: Restricting API keys](https://mapsplatform.google.com/resources/blog/google-maps-platform-best-practices-restricting-api-keys/)
- [Firebase Blog: App Hosting vs. the original Hosting](https://firebase.blog/posts/2024/05/app-hosting-vs-hosting/) · [App Hosting Product Comparison](https://firebase.google.com/docs/app-hosting/product-comparison)
- [Google Maps Platform Blog: React components for the Maps JS API](https://mapsplatform.google.com/resources/blog/introducing-react-components-for-the-maps-javascript-api/) · [OpenJS: vis.gl react-google-maps 1.0](https://openjsf.org/blog/visgl-1.0-react-google-maps) · [RGM Basic Map auf developers.google.com](https://developers.google.com/maps/documentation/javascript/examples/rgm-basic-map)
- [Node.js EOL-Timeline (Node 22 Maintenance, Node 24 Active LTS)](https://www.herodevs.com/blog-posts/node-js-end-of-life-dates-you-should-be-aware-of)
