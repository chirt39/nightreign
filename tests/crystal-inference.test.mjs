import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inferCrystalPoints } from '../src/lib/crystal-inference.js';

const { randomGroups, points } = JSON.parse(readFileSync(new URL('../scripts/data/great_hollow_resonating_crystals.json', import.meta.url)));
const key = id => 'great-hollow-resonating-crystal-' + id;

test('unmarked Great Hollow shows 21 possible crystals; none guaranteed', () => {
  const { possible, certain, candidateCount } = inferCrystalPoints(randomGroups, []);
  assert.equal(candidateCount, 4);
  assert.deepEqual(possible, new Set(points.map(point => point.key)));
  assert.equal(possible.size, 21);
  assert.equal(certain.size, 0);
});

test('shared crystal retains groups 1 and 3, and only their other shared crystal is red', () => {
  const first = key(164364021), second = key(164384021);
  const { possible, certain, candidateCount } = inferCrystalPoints(randomGroups, [first]);
  assert.equal(candidateCount, 2);
  assert.equal(possible.size, 14);
  assert.deepEqual(certain, new Set([second]));
  const narrowed = inferCrystalPoints(randomGroups, [first, key(164574021)]);
  assert.equal(narrowed.candidateCount, 1);
  assert.deepEqual(narrowed.possible, new Set(randomGroups[0].pointKeys));
  assert.equal(narrowed.certain.size, 6);
  assert.ok(narrowed.certain.has(second));
  assert.deepEqual(inferCrystalPoints(randomGroups, [key(164574021), first]), narrowed);
});

test('an exclusive crystal locks a group of eight; tagged crystals are never red', () => {
  const single = key(164574021);
  const result = inferCrystalPoints(randomGroups, new Set([single]));
  assert.deepEqual(result.possible, new Set(randomGroups[0].pointKeys));
  assert.equal(result.certain.size, 7);
  assert.equal(result.certain.has(single), false);
  assert.equal(inferCrystalPoints(randomGroups, randomGroups[0].pointKeys).certain.size, 0);
});
