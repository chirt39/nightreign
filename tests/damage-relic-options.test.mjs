import assert from 'node:assert/strict';
import test from 'node:test';
import { relicChoiceMetadata as describe } from '../src/lib/damage-relic-options.js';

const context = {
  characterId: '1', weaponId: '10', variantId: '11', weaponType: '19', artId: '1051',
  attack: { physical: 150, holy: 80, magic: 0 },
  segments: [
    { tags: ['weaponAttack', 'skill'], rates: { physical: 1, holy: 1 } },
    { tags: ['weaponAttack', 'skill', 'charged'], projectile: { rawBaseComponents: { holy: 170 } } },
  ],
};
test('potential applicability preserves conditional and alternative contacts without requiring current activation', () => {
  assert.equal(describe([{ conditions: ['满血'], channels: ['holy'] }], context).applicable, true);
  assert.equal(describe([{ tags: ['charged'], conditions: ['蓄力'], channels: ['holy'] }], context).applicable, true);
  assert.equal(describe([{ channels: ['physical'] }], context).applicable, true);
  assert.equal(describe([{ channels: ['magic'] }], context).applicable, false);
  assert.equal(describe([{ tags: ['incantation'], channels: ['holy'] }], context).applicable, false);
  assert.equal(describe([{ phase: 'panel', tags: ['charged'], channels: ['holy'] }], context).applicable, false);
});
test('native role, art, weapon and hit-category constraints all restrict candidate scope', () => {
  for (const rule of [{ characterIds: ['10'] }, { artIds: ['20'] }, { weaponIds: ['12'] }, { anyTags: ['heldWeaponType:1'] }, { useHitDamageCorrection: true }]) {
    assert.equal(describe([rule], context).applicable, false);
  }
  assert.equal(describe([{ characterIds:['1'], weaponIds:['11'], artIds:['1051'], anyTags:['heldWeaponType:19'] }], context).applicable, true);
});
test('categories reflect rules and unsupported effects never become supported through a matching name', () => {
  assert.deepEqual(describe([{countKey:'gaol'}],context).categories, ['cumulative']);
  assert.deepEqual(describe([{characterIds:['1'],conditions:['trigger'],tags:['skill']}],context).categories, ['character','conditional','action']);
  assert.deepEqual(describe([{channels:['holy']}],context).categories, ['attribute']);
  const unknown = describe([], {...context,characterNames:['送葬者']}, {name:'【送葬者】提升攻击力'});
  assert.equal(unknown.supported, false);
  assert.equal(unknown.applicable, false);
  assert.ok(unknown.categories.includes('character'));
});
