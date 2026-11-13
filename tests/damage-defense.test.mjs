import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DAMAGE_DEFENSE_MODEL, resolveDamageChannel } from '../src/lib/damage-defense.js';

const data = JSON.parse(readFileSync(new URL('../public/damage-targets.json', import.meta.url), 'utf8'));

test('channel estimate requires a real defense and leaves rounding to the caller', () => {
  assert.equal(resolveDamageChannel(100, null, 1), null);
  assert.equal(resolveDamageChannel(100, 100, null), null);
  assert.equal(resolveDamageChannel(-1, 100, 1), null);
  assert.equal(resolveDamageChannel(0, 100, 1), 0);
  assert.equal(resolveDamageChannel(100, 100, .8), 32);
  assert.equal(resolveDamageChannel(250, 100, 1), 175);
  assert.equal(resolveDamageChannel(800, 100, 1), 720);
  assert.equal(resolveDamageChannel(100, 0, 1), 90);
  assert.ok(!Number.isInteger(resolveDamageChannel(123, 100, 1.1)));
  assert.match(DAMAGE_DEFENSE_MODEL.status, /unverified/);
  assert.equal(DAMAGE_DEFENSE_MODEL.defaultMode, 'pre_defense');
  assert.equal(DAMAGE_DEFENSE_MODEL.estimateRequiresOptIn, true);
});

test('targets preserve exact source variants and flag unresolved defenses', () => {
  const atlas = JSON.parse(readFileSync(new URL('../public/enemy-data.json', import.meta.url), 'utf8'));
  assert.deepEqual(data.targets.map(t => t.source.atlasSourceId), atlas.rows.map(row => String(row[1])));
  assert.equal(data.defaultMode, 'pre_defense');
  assert.equal(data.estimateRequiresOptIn, true);
  assert.equal(new Set(data.targets.map(target => target.id)).size, data.targets.length);
  assert.ok(data.targets.every(target => target.defense === null));
  assert.ok(data.targets.every(target => Object.keys(target.baseDefense).join(',') === 'physical,magic,fire,lightning,holy'));
  const snowTroll = data.targets.find(target => target.id === '46020050');
  assert.deepEqual(snowTroll.baseDefense, { physical: 100, magic: 100, fire: 100, lightning: 100, holy: 100 });
  assert.equal(snowTroll.taken.normal, 1);
  assert.equal(snowTroll.taken.slash, 1.1);
  assert.equal(snowTroll.source.npcParamId, '46020050');
  assert.ok(snowTroll.source.locations.includes('山顶'));
  assert.equal(data.targets.filter(target => target.source.takenStatus.startsWith('manual')).length, 7);
  assert.ok(data.targets.filter(target => target.source.takenStatus.startsWith('manual')).every(target => Object.values(target.taken).every(value => value === null)));
  for (const sourceId of ['45050010', '46020030', '46000110', '43511120', '43510040']) {
    assert.ok(!data.targets.some(target => target.source.atlasSourceId === sourceId));
  }
});
