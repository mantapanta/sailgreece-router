/**
 * Parse the WindySail polar export (Fountaine Pajot 45) into the staging
 * JSON seeding/data/polar.json — validated against the SAME Zod schema the
 * app uses (AD-4). Runs directly with Node >= 22.18 (type stripping):
 *
 *   npm run seed:polar
 *
 * The generated file stays `approved: false`: per AD-10 the polar is only
 * imported after verification against the original export file.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PolarSchema, isStrictlyAscending } from '../src/domain/schema/polar.ts';
import type { Polar } from '../src/domain/schema/polar.ts';
import { PolarStagingFileSchema } from '../src/domain/schema/seeding.ts';

const here = dirname(fileURLToPath(import.meta.url));
const INPUT = join(
  here,
  '../_bmad-output/planning-artifacts/prds/prd-sailgreece-router-2026-07-30/inputs/polar-fountaine-pajot-45.txt',
);
const OUTPUT = join(here, 'data/polar.json');

export function parseWindySailPolar(text: string, sourceNote: string): Polar {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length < 2) throw new Error('Polar-Datei enthält keine Datenzeilen');

  const headerCells = lines[0]!.split(/\s+/);
  if (!/^TWA/i.test(headerCells[0] ?? '')) {
    throw new Error(`Unerwartete Kopfzeile: '${lines[0]}'`);
  }
  const twsKn = headerCells.slice(1).map(Number);
  if (twsKn.some((v) => !Number.isFinite(v))) {
    throw new Error('TWS-Kopfzeile enthält Nicht-Zahlen');
  }

  const twaDeg: number[] = [];
  const speeds: number[][] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(/\s+/).map(Number);
    if (cells.length !== twsKn.length + 1) {
      throw new Error(
        `Zeile hat ${cells.length - 1} Werte, erwartet ${twsKn.length}: '${line}'`,
      );
    }
    if (cells.some((v) => !Number.isFinite(v))) {
      throw new Error(`Zeile enthält Nicht-Zahlen: '${line}'`);
    }
    twaDeg.push(cells[0]!);
    speeds.push(cells.slice(1));
  }

  // Explicit, message-friendly duplicate/sort check (the schema enforces it
  // too — interp1 relies on strictly ascending grid axes).
  if (!isStrictlyAscending(twsKn)) {
    throw new Error('TWS-Kopfzeile ist nicht streng aufsteigend (Duplikat/Sortierfehler im Export?)');
  }
  if (!isStrictlyAscending(twaDeg)) {
    throw new Error('TWA-Spalte ist nicht streng aufsteigend (Duplikat/Sortierfehler im Export?)');
  }

  return PolarSchema.parse({ twaDeg, twsKn, speeds, sourceNote });
}

function main() {
  const text = readFileSync(INPUT, 'utf8');
  const polar = parseWindySailPolar(
    text,
    'WindySail-Export "Fountaine Pajot 45.txt" (Transkript aus Phone-Screenshot, ' +
      'PRD-Addendum 2026-07-30) — vor Import gegen Originaldatei verifizieren',
  );
  const staging = PolarStagingFileSchema.parse({
    approved: false,
    sourceNote:
      'Transkript aus Screenshot — AD-10: Import erst nach Verifikation gegen die Original-Exportdatei',
    polar,
  });
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(staging, null, 2) + '\n');
  console.log(
    `polar.json geschrieben: ${polar.twaDeg.length} TWA-Stufen x ${polar.twsKn.length} TWS-Stufen -> ${OUTPUT}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
