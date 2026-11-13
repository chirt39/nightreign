import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculatePanel } from '../src/lib/damage-panel.js';

const catalog = JSON.parse(readFileSync(new URL('../public/damage-panel.json', import.meta.url), 'utf8'));
const calculate = (overrides = {}, data = catalog) => calculatePanel({ catalog: data, variantId: '1000000', characterId: '1', level: 15, reinforcement: 0, ...overrides });
const five = physical => ({ physical, magic: 0, fire: 0, lightning: 0, holy: 0 });

test('level one already scales: NR dagger 58, STR 5 / DEX 4, raw coefficients 13 / 73', () => {
  // Graph 0 at 5 and 4: 20% and 16%; 58 * (1 + .13*.20 + .73*.16) × 0.6 = 39.77.
  assert.deepEqual(calculate({ level: 1 }), five(39));
});

test('NR level knots and intermediate attribute allocation are used for both DLC heroes too', () => {
  assert.equal(catalog.characters.length, 10);
  assert.deepEqual(catalog.levels, Array.from({ length: 15 }, (_, i) => i + 1));
  assert.deepEqual(catalog.characterStats['1']['3'], { strength: 20, dexterity: 17, intelligence: 4, faith: 4, arcane: 10 });
  assert.equal(catalog.characterStats['1']['15'].strength, 50);
  assert.equal(catalog.characterStats['9']['15'].intelligence, 28);
  assert.equal(catalog.characterStats['10']['15'].faith, 41);
  assert.notEqual(calculate({ characterId: '5' }).physical, calculate().physical);
});

test('the fractional base and scaling are combined before truncation; upgrade is variant relative', () => {
  // 58 * (1 + .13*1.6992 + .73*1.4208) × 0.6 = 78.58.
  assert.deepEqual(calculate(), five(78));
  assert.deepEqual(calculate({ reinforcement: 1 }), five(96));
  assert.deepEqual(calculate({ reinforcement: 2 }), five(117));
  assert.deepEqual(calculate({ reinforcement: 3 }), five(133));
  assert.equal(calculate({ variantId: '3080000', reinforcement: 3 }), null);
});

test('split damage is calculated per element and per-element graphs can differ', () => {
  assert.deepEqual(calculate({ variantId: '1140500' }), { physical: 44, magic: 0, fire: 44, lightning: 0, holy: 0 });
  assert.deepEqual(calculate({ variantId: '3080500' }), { physical: 82, magic: 0, fire: 76, lightning: 0, holy: 0 });
});

test('scaling letters never participate in calculation', () => {
  const edited = structuredClone(catalog);
  edited.variants['1000000'].scalingGrades = { strength: 'S', dexterity: '-' };
  assert.deepEqual(calculate({}, edited), five(78));
  edited.variants['1000000'].scaling.dexterity = 0;
  assert.notDeepEqual(calculate({}, edited), five(78));
});

test('element enable flags, overrides and influence rates alter the applicable attribute only', () => {
  const edited = structuredClone(catalog);
  const rules = edited.elementCorrections['10000'].physical;
  for (const rule of Object.values(rules)) rule.enabled = false;
  assert.deepEqual(calculate({}, edited), five(34));
  rules.strength.enabled = true;
  rules.strength.override = 100;
  rules.strength.influence = 50;
  // 58 * (1 + (.5-1) + 1*1.6992*.5) × 0.6 = 46.97.
  assert.deepEqual(calculate({}, edited), five(46));
});

test('zero damage channels stay zero; missing/nonlinear correction data does not become base AR', () => {
  const edited = structuredClone(catalog);
  delete edited.correctionGraphs['0'];
  assert.equal(calculate({}, edited), null);
  const nonlinear = structuredClone(catalog);
  nonlinear.correctionGraphs['0'].exponents[0] = 2;
  assert.equal(calculate({}, nonlinear), null);
  const missing = structuredClone(catalog);
  delete missing.variants['1000000'].scaling.dexterity;
  assert.equal(calculate({}, missing), null);
});

test('unsupported variants expose reasons and produce null', () => {
  for (const [variantId, variant] of Object.entries(catalog.variants)) {
    if (variant.unavailableReasons.length) assert.equal(calculate({ variantId }), null);
  }
  assert.equal(catalog.summary.supportedVariants, 1727);
});

test('invalid selections are rejected and inputs are not mutated', () => {
  for (const input of [{ level: 0 }, { level: 16 }, { level: 1.5 }, { level: '15' }, { reinforcement: -1 }, { reinforcement: 4 }, { reinforcement: null }, { characterId: 'missing' }, { variantId: 'missing' }]) {
    assert.equal(calculate(input), null);
  }
  assert.equal(calculatePanel(), null);
  const before = JSON.stringify(catalog);
  calculate();
  assert.equal(JSON.stringify(catalog), before);
});

test('explicit stat gains enter the ability curve before AR, including curve-knot crossings', () => {
  // DEX 40 -> 50 crosses graph-0 knot 49; STR remains 50.
  assert.deepEqual(calculate({ statGains: { dexterity: 10 } }), five(85));
  assert.deepEqual(calculate({ statGains: { strength: 10 } }), five(79));
  const pickup = catalog.statGainExamples.find(row => row.spEffectId === '7000402');
  assert.deepEqual(pickup.statGains, { strength: 0, dexterity: 3, intelligence: 0, faith: 0, arcane: 0 });
  assert.deepEqual(calculate({ statGains: pickup.statGains }), five(80));
  const gains = { dexterity: 10 };
  calculate({ statGains: gains });
  assert.deepEqual(gains, { dexterity: 10 });
  assert.equal(catalog.characterStats['1']['15'].dexterity, 40);
});

test('six requested variants retain their own native color and exact upgrade path', () => {
  for (const id of ['19020000', '9040000', '1070000', '1160000']) {
    const p = catalog.variants[id].qualityProfile;
    assert.equal(p.baseColor, 'purple');
    assert.equal(p.canVolcano, true);
    assert.equal(p.volcanoReinforcement, 1);
    assert.deepEqual(p.colorByReinforcement, { 0: 'purple', 1: 'gold' });
  }
  for (const id of ['9080000', '9010500']) {
    const p = catalog.variants[id].qualityProfile;
    assert.equal(p.baseColor, 'blue');
    assert.equal(p.volcanoReinforcement, 2);
    assert.deepEqual(p.colorByReinforcement, { 0: 'blue', 1: 'purple', 2: 'gold' });
  }
});

test('volcano selects the gold table row once, regardless of an already selected purple upgrade', () => {
  const halo = { variantId: '19020000', quality: 'volcano' };
  assert.deepEqual(calculate(halo), { physical: 102, magic: 0, fire: 0, lightning: 0, holy: 63 });
  assert.deepEqual(calculate({ ...halo, reinforcement: 1 }), calculate(halo));
  const fang = { variantId: '9010500', quality: 'volcano' };
  assert.deepEqual(calculate(fang), { physical: 77, magic: 0, fire: 71, lightning: 0, holy: 0 });
  assert.deepEqual(calculate({ ...fang, reinforcement: 1 }), calculate(fang));
  assert.deepEqual(calculate({ ...fang, reinforcement: 2 }), calculate(fang));
  assert.deepEqual(calculate({ variantId: '9010500', quality: 'native', reinforcement: 2 }), calculate(fang));
  const alreadyGold = Object.keys(catalog.variants).find(id => catalog.variants[id].qualityProfile.baseColor === 'gold');
  assert.equal(catalog.variants[alreadyGold].qualityProfile.canVolcano, false);
  assert.equal(calculate({ variantId: alreadyGold, quality: 'volcano' }), null);
});

test('red panels apply the drop tier and one red correction before integer rounding', () => {
  for (const id of ['19020000', '9040000', '1070000', '1160000']) {
    const p = catalog.variants[id].qualityProfile;
    assert.equal(p.redAvailable, true);
    assert.ok(p.redConfigurationIds.length > 0);
    assert.ok(p.redDropConfigurationIds.length > 0);
    assert.equal(p.redReinforcement, 0);
    assert.equal(p.redCanVolcano, false);
    const red = calculate({ variantId: id, quality: 'red' });
    const purple = calculate({ variantId: id });
    for (const key of Object.keys(purple)) {
      assert.ok(red[key] >= Math.floor(purple[key] * 1.10) && red[key] <= Math.floor((purple[key] + 1) * 1.10));
    }
    assert.deepEqual(calculate({ variantId: id, quality: 'red', reinforcement: 1 }), red);
  }
  assert.equal(catalog.variants['9080000'].qualityProfile.redAvailable, null);
  assert.equal(catalog.variants['9010500'].qualityProfile.redAvailable, null);
});

test('unknown qualities and unsupported stat values fail without inventing caps or bonuses', () => {
  for (const input of [{ quality: 'purple' }, { quality: null }, { statGains: null },
    { statGains: [] }, { statGains: { dexterity: '3' } }, { statGains: { dexterity: 1.5 } },
    { statGains: { dexterity: -41 } }, { statGains: { strength: 100 } }]) {
    assert.equal(calculate(input), null);
  }
  assert.deepEqual(calculate({ statGains: {} }), calculate());
});

test('all supported real combinations yield five nonnegative integers without upgrade fallback', () => {
  let combinations = 0;
  for (const [variantId, variant] of Object.entries(catalog.variants)) {
    if (variant.unavailableReasons.length) continue;
    for (const character of catalog.characters) {
      for (const level of catalog.levels) {
        for (const reinforcement of variant.reinforcements) {
          const result = calculate({ variantId, characterId: character.id, level, reinforcement });
          assert.ok(result, `${variantId}/${character.id}/${level}/+${reinforcement}`);
          assert.deepEqual(Object.keys(result), ['physical', 'magic', 'fire', 'lightning', 'holy']);
          assert.ok(Object.values(result).every(x => Number.isInteger(x) && x >= 0));
          combinations += 1;
        }
      }
    }
  }
  assert.ok(combinations > 500000);
});
