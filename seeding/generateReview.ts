/**
 * FR24 — generate the one-round review view: one Markdown file per island in
 * seeding/review/, shelter profiles FIRST (safety-relevant). Philipp reviews,
 * corrects the staging JSON if needed, then sets `approved: true`.
 *
 *   npm run seed:review
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IslandStagingFileSchema,
  LegsStagingFileSchema,
  VariantsStagingFileSchema,
  KiteSpotsStagingFileSchema,
  PolarStagingFileSchema,
} from '../src/domain/schema/seeding.ts';
import type { Place } from '../src/domain/schema/place.ts';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, 'data');
const REVIEW = join(here, 'review');

function sectorLine(s: { fromDeg: number; toDeg: number } & Record<string, unknown>): string {
  const limit = 'maxKn' in s ? `bis ${s['maxKn']} kn` : `bis ${s['maxM']} m`;
  // Full circle is only expressible as exactly 0–360 (schema rejects point
  // sectors like 350–350) — mark it VISIBLY so a reviewer questions
  // "protected from every direction" instead of skimming past it.
  if (s.fromDeg === 0 && s.toDeg === 360) {
    return `**RUNDUMSCHUTZ (0°–360°, alle Richtungen!)**, ${limit}`;
  }
  const wrap = s.fromDeg > s.toDeg ? ' (Wrap über Nord)' : '';
  return `geschützt aus ${s.fromDeg}°–${s.toDeg}°${wrap}, ${limit}`;
}

/** Ja/Nein/Ortsangabe — eine fehlende Angabe bleibt sichtbar leer, nie „nein". */
function jaNein(v: boolean | string | null | undefined): string {
  if (v === true) return 'ja';
  if (v === false) return 'nein';
  if (typeof v === 'string') return v;
  return '—';
}

/**
 * Liegeplatz-Details: die Angaben, die erst AM Platz entscheiden. Sie steuern
 * keine Ampel, aber der Reviewer muss sie sehen — Tiefe und Grössenlimit sind
 * die einzigen harten Ausschlusskriterien der Bibliothek, und Müll, Strom und
 * Reservierbarkeit sind das, wonach an Bord tatsächlich gefragt wird.
 */
function berthingSection(p: Place): string[] {
  const b = p.berthingDetails;
  if (!b) return ['**Liegeplatz-Details:** nicht recherchiert.', ''];
  const depth = b.depthAtBerthM
    ? `${b.depthAtBerthM.min}–${b.depthAtBerthM.max} m`
    : '—';
  const rows: [string, string][] = [
    ['Anlegeart', b.mooringType],
    ['Wassertiefe', depth],
    ['Grössenlimit (LoA)', b.maxLoaM ? `${b.maxLoaM} m` : '—'],
    ['Haltegrund', b.anchorHoldingGround ?? '—'],
    ['Haltequalität', `${b.holdingQuality ?? '—'}${b.holdingNote ? ` — ${b.holdingNote}` : ''}`],
    ['Seegras', b.seagrassNote ?? '—'],
    ['Kapazität', b.capacityYachts ? `${b.capacityYachts} Yachten` : '—'],
    ['Reservierbar', `${jaNein(b.reservationPossible)}${b.reservationChannel ? ` — ${b.reservationChannel}` : ''}`],
    ['Müllentsorgung', jaNein(b.wasteDisposal)],
    ['Landstrom / Wasser', `${jaNein(b.shorePower)} / ${jaNein(b.water)}`],
    ['Diesel am Steg', jaNein(b.fuelDock)],
    ['Duschen / WC', jaNein(b.showersToilets)],
    ['Versorgung an Land', b.provisioningAshore ?? '—'],
    ['Preis', b.priceIndicationEur ?? '—'],
    ['Hafengebühren', b.portAuthorityFees ?? '—'],
    ['Schwell', b.swellExposureNote ?? '—'],
    ['Fährverkehr', b.ferryTrafficNote ?? '—'],
    ['Beiboot-Anlandung', b.dinghyLanding ?? '—'],
    ['Auflagen', b.restrictions ?? '—'],
    ['UKW-Kanal', b.vhfChannel ?? '—'],
  ];
  return [
    `**Liegeplatz-Details** (Konfidenz: ${b.confidence}):`,
    '',
    '| Angabe | Wert |',
    '|---|---|',
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
    '',
    `Quellen: ${b.sources.join('; ')}`,
    '',
  ];
}

/**
 * Gastronomie-Subebene. Steht NACH den Liegeplatz-Details, weil sie nichts
 * entscheidet — aber mit den Reservierungskontakten sichtbar, denn eine
 * veraltete Telefonnummer fällt nur auf, wenn sie jemand liest.
 */
function gastroSection(p: Place): string[] {
  if (!p.restaurants?.length) return [];
  const lines = [`**Gastronomie (${p.restaurants.length})** — bewertet nichts, Anzeige nur:`, ''];
  lines.push('| Lokal | Bewertung | Küche | Spezialitäten | Anlandung / Weg | Reservierung | Konfidenz |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of [...p.restaurants].sort((a, b) => b.qualityRating - a.qualityRating)) {
    lines.push(
      `| ${r.name} (\`${r.id}\`) | ${r.qualityRating.toFixed(1)}/5 | ${r.cuisineType ?? '—'} | ` +
        `${r.signatureDishes.join(', ') || '—'} | ${r.accessInfo ?? '—'} | ` +
        `${r.reservationInfo ?? '—'} | ${r.confidence} |`,
    );
  }
  lines.push('');
  lines.push(
    `Quellen: ${[...new Set(p.restaurants.flatMap((r) => r.sources))].join('; ')}`,
  );
  lines.push('');
  return lines;
}

function placeSection(p: Place): string {
  const lines: string[] = [];
  lines.push(`### ${p.name} (\`${p.id}\`, ${p.type})`);
  lines.push('');
  lines.push('**Sicherer Liegeplatz (sicherheitsrelevant — zuerst prüfen!):**');
  lines.push('');
  lines.push('| Art | Sektor |');
  lines.push('|---|---|');
  for (const s of p.shelter.windSectors) lines.push(`| Wind | ${sectorLine(s)} |`);
  for (const s of p.shelter.waveSectors) lines.push(`| Welle | ${sectorLine(s)} |`);
  lines.push('');
  lines.push(`Quelle: ${p.shelter.sourceNote}`);
  lines.push('');
  lines.push(
    `Koordinaten: ${p.coordinates.lat.toFixed(4)}, ${p.coordinates.lon.toFixed(4)} · ` +
      `Qualitäten: Schönheit ${p.qualities.schoenheit}/5, Restaurant ${p.qualities.restaurant}/5, ` +
      `Badestrand ${p.qualities.badestrand}/5`,
  );
  if (p.warnings?.length) {
    lines.push('');
    lines.push(`Warnungen: ${p.warnings.map((w) => `⚠ ${w}`).join(' · ')}`);
  }
  lines.push('');
  lines.push(...berthingSection(p));
  lines.push(...gastroSection(p));
  return lines.join('\n');
}

function main() {
  mkdirSync(REVIEW, { recursive: true });
  const islandsDir = join(DATA, 'islands');
  const files = readdirSync(islandsDir).filter((f) => f.endsWith('.json'));
  let count = 0;

  for (const file of files.sort()) {
    const raw = JSON.parse(readFileSync(join(islandsDir, file), 'utf8'));
    const parsed = IslandStagingFileSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(`ÜBERSPRUNGEN (ungültig): ${file}`);
      for (const issue of parsed.error.issues) {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      }
      continue;
    }
    const { island, places, approved, sourceNote } = parsed.data;
    const md: string[] = [];
    md.push(`# Review: ${island.name} (\`${island.id}\`)`);
    md.push('');
    md.push(`Status: **${approved ? 'FREIGEGEBEN' : 'NICHT freigegeben'}** (\`approved: ${approved}\`)`);
    md.push('');
    md.push(`Quelle der Datei: ${sourceNote}`);
    md.push('');
    md.push(
      '> FR24: Sichere Liegeplätze zuerst prüfen — sie steuern die Nacht-Ampel. ' +
        'Sektorsemantik: „geschützt gegen Wind/Welle KOMMEND AUS fromDeg° im ' +
        'Uhrzeigersinn bis toDeg°", Grenzen inklusiv, Wrap über Nord erlaubt.',
    );
    md.push('');
    md.push(`## Plätze (${places.length})`);
    md.push('');
    for (const p of places) md.push(placeSection(p));
    md.push('---');
    md.push(
      `Freigabe: in \`seeding/data/islands/${file}\` das Feld \`approved\` auf \`true\` setzen, dann \`npm run seed:import\`.`,
    );
    md.push('');
    writeFileSync(join(REVIEW, `${basename(file, '.json')}.md`), md.join('\n'));
    count++;
  }

  // Leg library + variants overview (AD-4: legs are first-class)
  try {
    const legsRaw = JSON.parse(readFileSync(join(DATA, 'legs.json'), 'utf8'));
    const variantsRaw = JSON.parse(readFileSync(join(DATA, 'variants.json'), 'utf8'));
    const legsParsed = LegsStagingFileSchema.safeParse(legsRaw);
    const variantsParsed = VariantsStagingFileSchema.safeParse(variantsRaw);
    if (legsParsed.success && variantsParsed.success) {
      const legs = legsParsed.data.legs;
      const md: string[] = ['# Review: Etappen- und Variantenbibliothek', ''];
      md.push(
        `Status Etappen: **${legsParsed.data.approved ? 'FREIGEGEBEN' : 'NICHT freigegeben'}** · ` +
          `Varianten: **${variantsParsed.data.approved ? 'FREIGEGEBEN' : 'NICHT freigegeben'}**`,
      );
      md.push('');
      md.push(`Quelle: ${legsParsed.data.sourceNote}`);
      md.push('');

      // BREAKING notice: legs a variant names but the library no longer has.
      // A removed leg id silently shortens a route at runtime, so it must be
      // visible in the review rather than discovered on the water.
      const legIds = new Set(legs.map((l) => l.id));
      const dangling = variantsParsed.data.variants.flatMap((v) =>
        v.legIds.filter((id) => !legIds.has(id)).map((id) => `${v.id} → ${id}`),
      );
      if (dangling.length > 0) {
        md.push('## BREAKING — Varianten referenzieren fehlende Etappen');
        md.push('');
        for (const d of dangling) md.push(`- ${d}`);
        md.push('');
      }
      const unused = legs
        .filter((l) => !variantsParsed.data.variants.some((v) => v.legIds.includes(l.id)))
        .map((l) => l.id);
      if (unused.length > 0) {
        md.push(`## Nicht referenzierte Etappen (${unused.length})`);
        md.push('');
        md.push(unused.join(', '));
        md.push('');
      }

      md.push(`## Etappen (${legs.length})`);
      md.push('');
      md.push('| Etappe | Distanz | Wegpunkte | Warnungen | Rebasing |');
      md.push('|---|---|---|---|---|');
      for (const leg of [...legs].sort((a, b) => a.id.localeCompare(b.id))) {
        md.push(
          `| \`${leg.id}\` | ${leg.distanceNm} sm | ${leg.waypoints.length} | ` +
            `${leg.windWarnings.join('; ') || '—'} | ` +
            `${leg.rebasedFrom ? `ursprünglich ${leg.rebasedFrom}-basiert` : '—'} |`,
        );
      }
      md.push('');

      md.push('## Varianten');
      md.push('');
      for (const v of [...variantsParsed.data.variants].sort(
        (a, b) => a.escalationRank - b.escalationRank,
      )) {
        const vLegs = v.legIds.map((id) => legs.find((l) => l.id === id)).filter((l) => l);
        const nm = vLegs.reduce((s, l) => s + (l ? l.distanceNm : 0), 0);
        md.push(
          `### ${v.name} (\`${v.id}\`, Eskalationsstufe ${v.escalationRank}` +
            `${v.isReturnChain ? ', Rückfallkette' : ''})`,
        );
        md.push('');
        md.push(`${v.legIds.length} Etappen, ${nm} sm gesamt`);
        md.push('');
        md.push(v.legIds.map((id) => `\`${id}\``).join(' → '));
        md.push('');
      }
      writeFileSync(join(REVIEW, 'legs-und-varianten.md'), md.join('\n'));
      count++;
    } else {
      console.error(
        'legs.json/variants.json ungültig:',
        legsParsed.success ? variantsParsed.error?.issues : legsParsed.error.issues,
      );
    }
  } catch (e) {
    console.error('legs.json/variants.json nicht lesbar:', e);
  }

  /**
   * Kite-Spots (schema/kite.ts). Eigene Review-Sicht, weil die Quellenlage eine
   * andere ist als bei den Liegeplätzen: hier steht Revierwissen ohne
   * Revierführer. Die Tabelle zeigt darum Konfidenz und Quelle je Spot in
   * derselben Zeile wie die Windrichtung — der Reviewer soll beim Lesen sehen,
   * wie belastbar der Eintrag ist, und nicht erst in der Datei nachsehen.
   */
  try {
    const raw = JSON.parse(readFileSync(join(DATA, 'kitespots.json'), 'utf8'));
    const parsed = KiteSpotsStagingFileSchema.safeParse(raw);
    if (parsed.success) {
      const { kiteSpots, approved, sourceNote } = parsed.data;
      const md: string[] = ['# Review: Kite-Spots', ''];
      md.push(`Status: **${approved ? 'FREIGEGEBEN' : 'NICHT freigegeben'}** (\`approved: ${approved}\`)`);
      md.push('');
      md.push(`Quelle der Datei: ${sourceNote}`);
      md.push('');
      md.push(
        '> Kite-Spots bewerten NICHTS: keine Ampel, kein Solver, kein Budget liest ' +
          'ein Feld. Sektorsemantik wie beim Liegeplatz, aber umgekehrt gemeint — ' +
          '„der Spot funktioniert mit Wind KOMMEND AUS fromDeg° im Uhrzeigersinn ' +
          'bis toDeg°". Zu prüfen sind vor allem: Windrichtung, `refPlaceId` ' +
          '(Forecast-Bezug UND Anzeigeort) und die Gefahren-Liste.',
      );
      md.push('');
      md.push(`## Spots (${kiteSpots.length})`);
      md.push('');
      md.push('| Spot | Insel | Wind aus | Wasser | Start | Level | Bezugsplatz | Konfidenz |');
      md.push('|---|---|---|---|---|---|---|---|');
      for (const s of [...kiteSpots].sort((a, b) => a.id.localeCompare(b.id))) {
        const sectors = s.windSectors
          .map((w) => `${w.fromDeg}°–${w.toDeg}°${w.fromDeg > w.toDeg ? ' (Wrap über Nord)' : ''}`)
          .join(' / ');
        md.push(
          `| ${s.name} (\`${s.id}\`) | ${s.islandId} | ${sectors} | ${s.water} | ` +
            `${s.launch.join(', ')} | ${s.level} | \`${s.refPlaceId}\` | ${s.confidence} |`,
        );
      }
      md.push('');
      for (const s of [...kiteSpots].sort((a, b) => a.id.localeCompare(b.id))) {
        md.push(`### ${s.name} (\`${s.id}\`)`);
        md.push('');
        md.push(
          `Koordinaten: ${s.coordinates.lat.toFixed(4)}, ${s.coordinates.lon.toFixed(4)}`,
        );
        md.push('');
        md.push(`Weg vom Bezugsplatz: ${s.accessInfo}`);
        md.push('');
        if (s.hazards.length > 0) {
          md.push(`Gefahren: ${s.hazards.map((h) => `⚠ ${h}`).join(' · ')}`);
          md.push('');
        }
        if (s.localNote) {
          md.push(`Vor Ort: ${s.localNote}`);
          md.push('');
        }
        md.push(`Quellen: ${s.sources.join('; ')}`);
        md.push('');
      }
      md.push('---');
      md.push(
        'Freigabe: in `seeding/data/kitespots.json` das Feld `approved` auf `true` setzen, dann `npm run seed:import`.',
      );
      md.push('');
      writeFileSync(join(REVIEW, 'kite-spots.md'), md.join('\n'));
      count++;
    } else {
      console.error('kitespots.json ungültig:', parsed.error.issues);
    }
  } catch (e) {
    console.error('kitespots.json nicht lesbar:', e);
  }

  // Polar overview
  try {
    const raw = JSON.parse(readFileSync(join(DATA, 'polar.json'), 'utf8'));
    const parsed = PolarStagingFileSchema.safeParse(raw);
    if (parsed.success) {
      const p = parsed.data.polar;
      const md: string[] = ['# Review: Polardiagramm', ''];
      md.push(`Status: **${parsed.data.approved ? 'FREIGEGEBEN' : 'NICHT freigegeben'}**`);
      md.push('');
      md.push(`Quelle: ${p.sourceNote}`);
      md.push('');
      md.push(`Raster: TWA ${p.twaDeg.join('/')}° × TWS ${p.twsKn.join('/')} kn`);
      md.push('');
      md.push('AD-10: Import erst nach Verifikation gegen die Original-Exportdatei.');
      md.push('');
      writeFileSync(join(REVIEW, 'polar.md'), md.join('\n'));
      count++;
    }
  } catch (e) {
    console.error('polar.json nicht lesbar:', e);
  }

  console.log(`${count} Review-Dateien nach ${REVIEW} geschrieben.`);
}

main();
