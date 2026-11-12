import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareLegalityCatalog, checkRelic } from '../src/relic-legality.js';

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
