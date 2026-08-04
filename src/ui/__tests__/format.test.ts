import { describe, expect, it } from 'vitest';
import { formatAthensTime } from '../format.ts';

/**
 * Die Stunden-Achse des Snapshots ist normativ UTC, angezeigt wird Ortszeit
 * Athen (AD-9). Der Törn liegt im August, also in der Sommerzeit — aber ein
 * fest verdrahtetes +03:00 wäre im Winter falsch, und genau das soll dieser
 * Test verhindern.
 */
describe('formatAthensTime — UTC-Achse, Anzeige in Ortszeit Athen', () => {
  it('rechnet im Sommer (EEST) um +3 h', () => {
    expect(formatAthensTime('2026-08-08T06:00:00Z')).toBe('09:00');
    expect(formatAthensTime('2026-08-08T21:00:00Z')).toBe('00:00');
  });

  it('rechnet im Winter (EET) um +2 h — kein fest verdrahtetes +03:00', () => {
    expect(formatAthensTime('2026-01-15T06:00:00Z')).toBe('08:00');
  });

  it('zeigt Mitternacht als 00:00, nicht als 24:00 (ICU-hourCycle)', () => {
    expect(formatAthensTime('2026-08-07T21:00:00Z')).toBe('00:00');
  });

  it('reicht den Fallback der Simulation unverändert durch', () => {
    // domain/scoring.ts setzt '+7h', wenn die Achse die Stunde nicht deckt.
    expect(formatAthensTime('+7h')).toBe('+7h');
  });
});
