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
  RoutesStagingFileSchema,
  PolarStagingFileSchema,
} from '../src/domain/schema/seeding.ts';
import type { Place } from '../src/domain/schema/place.ts';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, 'data');
const REVIEW = join(here, 'review');

function sectorLine(s: { fromDeg: number; toDeg: number } & Record<string, unknown>): string {
  const limit = 'maxKn' in s ? `bis ${s['maxKn']} kn` : `bis ${s['maxM']} m`;
  const wrap = s.fromDeg > s.toDeg ? ' (Wrap über Nord)' : '';
  return `geschützt aus ${s.fromDeg}°–${s.toDeg}°${wrap}, ${limit}`;
}

function placeSection(p: Place): string {
  const lines: string[] = [];
  lines.push(`### ${p.name} (\`${p.id}\`, ${p.type})`);
  lines.push('');
  lines.push('**Schutzprofil (sicherheitsrelevant — zuerst prüfen!):**');
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
      '> FR24: Schutzprofile zuerst prüfen — sie steuern die Nacht-Ampel. ' +
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

  // Routes overview
  try {
    const raw = JSON.parse(readFileSync(join(DATA, 'routes.json'), 'utf8'));
    const parsed = RoutesStagingFileSchema.safeParse(raw);
    if (parsed.success) {
      const md: string[] = ['# Review: Routenbibliothek', ''];
      md.push(`Status: **${parsed.data.approved ? 'FREIGEGEBEN' : 'NICHT freigegeben'}**`);
      md.push('');
      md.push(`Quelle: ${parsed.data.sourceNote}`);
      md.push('');
      for (const r of [...parsed.data.routes].sort((a, b) => a.escalationRank - b.escalationRank)) {
        md.push(`## ${r.name} (\`${r.id}\`, Eskalationsstufe ${r.escalationRank}${r.isReturnChain ? ', Rückfallkette' : ''})`);
        md.push('');
        md.push('| Etappe | Distanz | Warnungen | Rebasing |');
        md.push('|---|---|---|---|');
        for (const leg of r.legs) {
          md.push(
            `| ${leg.fromIslandId} → ${leg.toIslandId} | ${leg.distanceNm} sm | ${leg.windWarnings.join('; ') || '—'} | ${leg.rebasedFrom ? `ursprünglich ${leg.rebasedFrom}-basiert` : '—'} |`,
          );
        }
        md.push('');
      }
      writeFileSync(join(REVIEW, 'routes.md'), md.join('\n'));
      count++;
    }
  } catch (e) {
    console.error('routes.json nicht lesbar:', e);
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
