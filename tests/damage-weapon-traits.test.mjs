import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateDamage} from '../src/lib/damage-calculator.js';
import {calculatePanel} from '../src/lib/damage-panel.js';

const read = file => JSON.parse(readFileSync(new URL(`../public/${file}`, import.meta.url)));
const data = read('damage-weapon-traits.json'), effects = read('damage-effects.json');
const panel = read('damage-panel.json');
const byId = new Map(data.traits.map(trait => [trait.id, trait]));
const rules = new Map(effects.effects.map(effect => [effect.id, effect]));
const selectedEffects = id => byId.get(id).effectIds.map(key => rules.get(key));

test('six weapon/skill pairs use referenced custom templates and exact pool provenance', () => {
  assert.deepEqual(data.weapons.map(w => [w.id, w.artId]), [
    [19020000,1051], [9040000,1177], [9080000,112], [9010000,214], [1070000,1017], [1160000,1037],
  ]);
  assert.equal(data.weapons.find(w => w.id === 9010000).variantId, 9010500);
  const profiles = new Map(data.profiles.map(profile => [profile.id, profile]));
  for (const profile of profiles.values()) {
    assert.equal(profile.slotPoolIds.length, 6);
    assert.ok(profile.dropReferenceExamples.length);
    for (const pool of profile.slotPoolIds.filter(id => id != null)) {
      for (const id of data.pools[pool]) assert.ok(byId.has(id), `pool ${pool}: ${id}`);
    }
  }
  for (const trait of data.traits) {
    for (const origin of trait.sourceRefs ?? []) {
      const profile = profiles.get(origin.customWeaponId);
      assert.equal(profile.weaponId, origin.weaponId);
      const slot = Number(origin.field.split('_').at(-1)) - 1;
      assert.equal(profile.slotPoolIds[slot], origin.poolId);
      assert.ok(data.pools[origin.poolId].includes(trait.id));
    }
    for (const id of trait.effectIds) assert.ok(rules.has(id));
  }
});

test('positive, negative and corpse options preserve native distinctions', () => {
  assert.ok(data.traits.some(t => t.polarity === 'positive'));
  assert.ok(data.traits.some(t => t.polarity === 'negative'));
  assert.equal(data.traits.filter(t => t.polarity === 'corpse').length, 30);
  // A helpful-looking title is still isDebuff=1 in the native table.
  assert.equal(byId.get(8520001).polarity, 'negative');
  assert.equal(byId.get(8520001).calculationStatus, 'non-damage');
  assert.deepEqual(byId.get(8850500).modes, ['deep']);
  assert.deepEqual(byId.get(8350001).weaponIds, [9010000, 9080000]);
});

test('missing damage rules are never conflated with unrelated utility or neutral multipliers', () => {
  for (const id of [8821000, 8610300, 8880000]) {
    assert.equal(byId.get(id).calculationStatus, 'missing-rule');
    assert.deepEqual(byId.get(id).effectIds, []);
  }
  assert.equal(byId.get(8200101).calculationStatus, 'non-damage');
  assert.ok(!effects.effects.some(effect => [8821000, 8821050].includes(effect.nativeEffectId)));
  assert.ok(byId.get(8810050).effectIds.length);
});

test('corpse aliases represent fixed attribute payloads, not ranks derived from ID tails', () => {
  assert.deepEqual(byId.get(9990800).statGains, {dexterity: 3, arcane: 3});
  assert.deepEqual(byId.get(9990810).statGains, {dexterity: 6, arcane: 6});
  assert.deepEqual(byId.get(9990820).statGains, {dexterity: 9, arcane: 9});
  assert.ok(byId.get(9990800).aliasIds.includes(9990801));
  assert.ok(byId.get(9990820).aliasIds.includes(9990899));
  assert.equal(byId.get(9990800).sourceCharacterId, '8');
  assert.equal(byId.get(9990800).characterIds, undefined);
  assert.deepEqual(byId.get(9990800).effectIds, []);
  assert.equal(byId.get(9990800).calculationStatus, 'stat-gains');
  assert.equal(byId.get(9990200).calculationStatus, 'non-damage');
});

test('corpse attribute points recalculate the weapon curve and combine with actual victory gains', () => {
  const calculate = statGains => calculatePanel({catalog: panel, variantId: '9080000', characterId: '8',
    level: 10, reinforcement: 0, statGains});
  const base = calculate({});
  const inherited = calculate(byId.get(9990800).statGains);
  assert.ok(base && inherited);
  assert.ok(inherited.physical > base.physical);
  const both = calculate({dexterity: 5, arcane: 3}); // corpse +3 DEX/+3 ARC, actual victory +2 DEX.
  assert.ok(both.physical >= inherited.physical);
  assert.equal(data.victoryAttributeGains.pointsPerKill, null);
  assert.equal(data.victoryAttributeGains.automaticEnemyMapping, 'unverified');
  assert.equal(data.victoryAttributeGains.skipWhenManualPanel, true);
});

test('native negative damage multiplier is conditional, and caster bonuses exclude weapon skills', () => {
  const values = physical => ({physical, magic: 0, fire: 0, lightning: 0, holy: 0});
  const base = {panel: values(100), allowReferenceDefense: true,
    target: {defense: {physical:100,magic:100,fire:100,lightning:100,holy:100},
      taken: {neutral:1,magic:1,fire:1,lightning:1,holy:1}},
    segments: [{id:'hit',name:'hit',rates:values(1),physicalType:'neutral',tags:['weaponAttack','skill']}]};
  const penalty = selectedEffects(8810050);
  const calculate = (selected, conditions = []) => calculateDamage({...base, effects: selected, conditions}).total;
  assert.equal(calculate(penalty), 40);
  assert.ok(Math.abs(calculate(penalty, penalty[0].conditions) - 37.2) < 1e-9);
  assert.equal(calculate(selectedEffects(8851200)), 40);
  assert.ok(Math.abs(calculate(selectedEffects(8850500)) - 43.2) < 1e-9);
});
