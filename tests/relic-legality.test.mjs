import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareLegalityCatalog, checkRelic, checkCombination } from '../src/relic-legality.js';

const raw = JSON.parse(readFileSync(new URL('../src/data/relic-legality.json', import.meta.url)));
const catalog = prepareLegalityCatalog(raw);
const pair = (positive = null, negative = null) => ({positive, negative});
function check(itemId, slots, draft = false) {
  const rawEffectSlots = Array.from({length: 4}, (_, i) => slots[i] ?? pair());
  return checkRelic(catalog, {itemId, rawEffectSlots}, {draft});
}

test('shared normal effect fits the second deep slot in either entry point', () => {
  const slots = [pair(6002600, 6820000), pair(7001402)];
  for (const draft of [false, true]) assert.equal(check(2000001, slots, draft).status, 'clear');
  assert.equal(check(2000001, [slots[1], slots[0]]).status, 'unknown');
  assert.equal(check(2000001, [pair(6002600), slots[1]]).status, 'anomaly');
  assert.equal(check(2000001, [pair(6002600), slots[1]], true).status, 'partial');
});

test('two individually rollable levels of the same effect conflict within one relic', () => {
  const result = check(101, [pair(7000000), pair(7000001)]);
  assert.equal(result.status, 'anomaly');
  assert.ok(result.issues.some(issue => issue.slot === 2 && issue.message.includes('第 1 槽')));
  const mixed = check(101, [pair(7000000), pair(7000001), pair(99999999)]);
  assert.deepEqual([...new Set(mixed.issues.filter(i => i.status === 'anomaly').map(i => i.slot))].sort(), [1, 2]);
  assert.ok(mixed.issues.some(i => i.slot === 3 && i.status === 'unknown'));
});

test('named fixed presets use the supplied order and exact effect IDs', () => {
  const fixed = catalog.items.filter(item => item.generation === 'fixed');
  assert.ok(fixed.length > 0);
  for (const item of fixed) {
    const slots = item.presetPositive.map((id, i) => pair(id, item.presetNegative[i]));
    assert.equal(check(item.id, slots).status, 'clear', String(item.id));
  }
  assert.equal(check(2000, [pair(7000000), pair(7120100)]).status, 'anomaly');
});

test('unresolved identities and missing original slots cannot pass', () => {
  assert.equal(check(30029, [pair(7001402)]).status, 'unknown');
  assert.equal(check(100, [pair(99999999)]).status, 'unknown');
  assert.equal(checkRelic(catalog, {itemId: 100, effects: [[{id:7001402}]]}).status, 'unknown');
  assert.equal(checkRelic(catalog, {itemId: 100, identificationStatus: 'pending',
    rawEffectSlots: [pair(7001402, 6820000), pair(), pair(), pair()]}).status, 'unknown');
  assert.equal(check(100, [pair(7001402), pair(), pair(), pair(7001402)]).status, 'unknown');
  assert.equal(check(100, [pair(7001402, 6820000)]).status, 'anomaly');
});

test('manual selection searches all templates and keeps a negative with its positive', () => {
  const slots = [pair(6002600, 6820000), pair(7001402), pair(6630000)];
  assert.equal(checkCombination(catalog, slots).status, 'clear');
  assert.equal(checkCombination(catalog, [slots[1], slots[0], slots[2]]).status, 'anomaly');
  assert.equal(checkCombination(catalog, [pair(6002600), slots[1], slots[2]]).status, 'clear');
  assert.equal(checkCombination(catalog, [slots[1], pair(6002600), slots[2]]).status, 'anomaly');
  // Moving only the negative to a different positive cannot satisfy the template.
  assert.equal(checkCombination(catalog, [pair(6002600), pair(7001402, 6820000), slots[2]]).status, 'anomaly');
  assert.match(checkCombination(catalog, [pair(7003500), pair(), pair(7003500)]).message, /第 1、3 条词条重复/);
  assert.match(checkCombination(catalog, [pair(7000000), pair(7000001)]).message, /词条互斥/);
  // Individual pool membership does not prove there is a common normal/deep template.
  assert.equal(checkCombination(catalog, [pair(6090000, 6830000), pair(7121700), pair(7003500)]).status, 'anomaly');
});

test('manual empty fields are unspecified without moving selected slots', () => {
  for (const slots of [
    [pair(7001402)],
    [pair(6002600)],
    [pair(6002600, 6820000)],
    [pair(), pair(7001402)],
    [pair(), pair(), pair(7001402)],
    [pair(6002600), pair(), pair(6630000)],
    [pair(), pair(6002600)],
    [pair(), pair(6002600, 6820000)],
    [pair(10000)],
  ]) {
    assert.deepEqual(checkCombination(catalog, slots), {status: 'clear', message: '未发现异常'});
  }
  assert.equal(checkCombination(catalog, [pair(), pair(10000)]).status, 'anomaly');
});

test('manual empty input and unknown IDs keep their unresolved states', () => {
  assert.equal(checkCombination(catalog, []).status, 'partial');
  assert.equal(checkCombination(catalog, [pair(), pair(), pair()]).status, 'partial');
  assert.equal(checkCombination(catalog, [pair(null, 6820000)]).status, 'partial');
  assert.equal(checkCombination(catalog, [pair(99999999)]).status, 'unknown');
  assert.equal(checkCombination(catalog, [pair(6002600, 99999999)]).status, 'unknown');
  assert.equal(checkCombination(catalog, [pair(6820000)]).status, 'anomaly');
});

test('manual lookup includes every fixed preset even when random combinations conflict', () => {
  for (const t of catalog.templates.filter(t => t.generation === 'fixed')) {
    const slots = t.presetPositive.map((id, i) => pair(id, t.presetNegative[i]));
    const result = checkCombination(catalog, slots);
    assert.equal(result.status, 'clear', String(t.id));
  }
});

test('manual fixed preset exceptions require a direct match', () => {
  const rules = {
    items: {
      1: {generation: 'fixed', positive: [10, 11, null], negative: [null, null, null]},
      2: {generation: 'random', positive: [12, 12, null], negative: [null, null, null]},
    },
    pools: {10: [1], 11: [2], 12: [1, 2]},
    effects: {1: {negative: false, compatibilityId: 7}, 2: {negative: false, compatibilityId: 7}},
  };
  const fixedCatalog = prepareLegalityCatalog(rules);
  assert.equal(checkCombination(fixedCatalog, [pair(1), pair(2)]).status, 'clear');
  assert.equal(checkCombination(fixedCatalog, [pair(2), pair(1)]).status, 'anomaly');
  assert.equal(checkCombination(fixedCatalog, [pair(1), pair(1)]).status, 'anomaly');
  const randomCatalog = prepareLegalityCatalog({...rules, items: {2: rules.items[2]}});
  assert.equal(checkCombination(randomCatalog, [pair(1), pair(2)]).status, 'anomaly');
});

test('combination reasons identify wrong roles, conflicts and reordered pairs', () => {
  const role = checkCombination(catalog, [pair(6820000)]);
  assert.match(role.reasons.join(''), /第 1 槽.*是负面词条.*正面词条位置/);
  const duplicate = checkCombination(catalog, [pair(7003500), pair(), pair(7003500)]);
  assert.match(duplicate.reasons.join(''), /第 1 槽.*第 3 槽.*重复/);
  const exclusive = checkCombination(catalog, [pair(7000000), pair(7000001)]);
  assert.match(exclusive.reasons.join(''), /同一互斥组/);
  const reordered = checkCombination(catalog, [pair(7001402), pair(6002600, 6820000), pair(6630000)]);
  assert.match(reordered.reasons.join(''), /当前词条顺序不符合生成配置/);
  assert.match(reordered.reasons.join(''), /负面词条随同移动/);
  assert.equal(checkCombination(catalog, [pair(6002600), pair(7001402), pair(6630000)]).reasons, undefined);
  assert.equal(checkCombination(catalog, [pair(99999999)]).reasons, undefined);
});

test('combination reasons distinguish unsupported slots, pairings and joint templates', () => {
  const rules = {
    items: {
      1: {generation: 'random', positive: [10, 11, null], negative: [20, null, null]},
      2: {generation: 'random', positive: [12, 13, null], negative: [21, null, null]},
    },
    pools: {10: [1], 11: [2], 12: [3], 13: [4], 20: [5], 21: [6]},
    effects: Object.fromEntries([1,2,3,4,5,6,7].map(id => [id,
      {name: `测试词条${id}`, negative: id === 5 || id === 6, compatibilityId: id}])),
  };
  const c = prepareLegalityCatalog(rules);
  assert.match(checkCombination(c, [pair(7)]).reasons.join(''), /第 1 槽.*测试词条7.*不在任何已收录配置/);
  assert.match(checkCombination(c, [pair(1, 6)]).reasons.join(''), /测试词条1.*测试词条6.*当前配对/);
  assert.match(checkCombination(c, [pair(1), pair(4)]).reasons.join(''), /分别能出现在各自位置.*同时出现在同一份/);
  // Partial input does not invent a missing-negative anomaly.
  assert.deepEqual(checkCombination(c, [pair(1)]), {status: 'clear', message: '未发现异常'});
});
