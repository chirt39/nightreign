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
