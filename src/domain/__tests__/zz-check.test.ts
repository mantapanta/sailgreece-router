import { describe, it } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { landCrossingNm, crossesLand, seaRoute, isOnLand, landInsetNm } from '../searoute.ts';

const places: Record<string, any> = {};
for (const f of globSync('seeding/data/islands/*.json')) {
  for (const p of JSON.parse(readFileSync(f, 'utf8')).places ?? []) places[p.id] = p.coordinates;
}
describe('check', () => {
  it('werte', () => {
    const pairs: [string, any, any][] = [
      ['nord-Syros -> Grammata', { lat: 37.5118, lon: 24.9059 }, places['syros-grammata']],
      ['-> Ornos quer ueber Mykonos', { lat: 37.52, lon: 25.1865 }, places['mykonos-ornos']],
    ];
    for (const [n, a, b] of pairs) {
      console.log(n, '| landCrossingNm', landCrossingNm(a, b).toFixed(3), '| crossesLand', crossesLand(a, b));
    }
    const rb = places['poros-vathy-russian-bay'];
    console.log('Russian Bay inset', landInsetNm(rb).toFixed(3), 'onLand', isOnLand(rb));
    const out = seaRoute([rb, { lat: 37.55, lon: 23.55 }]);
    console.log('Russian Bay -> offene See: unresolved', out.unresolved, 'nm', out.nm.toFixed(1));
  });
});
