/**
 * Sync contract between the TS token module and the CSS custom properties:
 * every hex in COLORS must appear in the :root block of styles.css. Values
 * change in DESIGN.md first, then in both files together (see tokens.ts).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COLORS } from '../tokens.ts';

const cssPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'styles.css');
const css = readFileSync(cssPath, 'utf8');

/** The first :root block (the token layer; the alias block references vars only). */
function rootBlock(source: string): string {
  const start = source.indexOf(':root');
  expect(start).toBeGreaterThanOrEqual(0);
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  return source.slice(open + 1, close);
}

describe('tokens.ts ↔ styles.css sync', () => {
  const root = rootBlock(css);

  for (const [key, hex] of Object.entries(COLORS)) {
    it(`:root carries ${key} (${hex})`, () => {
      expect(root.toLowerCase()).toContain(hex.toLowerCase());
    });
  }
});
