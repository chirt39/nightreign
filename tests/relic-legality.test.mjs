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
  assert.equal(checkCombination(catalog, [slots[1], slots[0], slots[2]]).status, 'unknown');
  assert.match(checkCombination(catalog, [pair(6002600), slots[1], slots[2]]).message, /第 1 条补选负面/);
  assert.match(checkCombination(catalog, [slots[1], pair(6002600), slots[2]]).message, /第 2 条补选负面/);
  assert.match(checkCombination(catalog, [pair(7003500), pair(), pair(7003500)]).message, /第 1、3 条词条重复/);
  assert.match(checkCombination(catalog, [pair(7000000), pair(7000001)]).message, /词条互斥/);
  assert.equal(checkCombination(catalog, [pair(7001402)]).status, 'partial');
  // Individual pool membership does not prove there is a common normal/deep template.
  assert.match(checkCombination(catalog, [pair(6090000, 6830000), pair(7121700), pair(7003500)]).message, /未找到已核实/);
});

test('manual lookup includes every fixed preset even when random combinations conflict', () => {
  for (const t of catalog.templates.filter(t => t.generation === 'fixed')) {
    const slots = t.presetPositive.map((id, i) => pair(id, t.presetNegative[i]));
    const result = checkCombination(catalog, slots);
    assert.ok(['clear', 'partial'].includes(result.status), String(t.id));
  }
});
