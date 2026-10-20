const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/relic-optimizer.js'), 'utf8');
const { RelicOptimizer, WorstFirstHeap } = vm.runInNewContext(
  source + '\n;({ RelicOptimizer, WorstFirstHeap })'
);
const effects = JSON.parse(fs.readFileSync(path.join(root, 'public/effects_data.json'), 'utf8')).effects;

function relic(id, keys, itemType = 'Relic', itemColor = 'Red') {
  return { id, itemType, itemColor, effects: keys.map(key => [{ id, key }]) };
}

function optimizer(relics, specs, stackingData) {
  return new RelicOptimizer(relics, specs, null, stackingData);
}

test('effect data includes all three stacking kinds used by the website policy', () => {
  assert.equal(effects['7000000'].stackable, true);
  assert.equal(effects['6090000'].stackable, 'conditional');
  assert.equal(effects['7060000'].stackable, false);
});

test('normal and combined recommendations use full, 70%, and one-time scores', () => {
  const relics = Array.from({ length: 6 }, (_, i) =>
    relic(i + 1, ['sample'], i < 3 ? 'Relic' : 'DeepRelic')
  );
  for (const [kind, expectedNormal, expectedCombined] of [
    [true, 30, 60], ['conditional', 24, 45], [false, 10, 10],
  ]) {
    const opt = optimizer(relics, [{ key: 'sample', priority: 'preferred', weight: 10, cap: 6 }], { sample: kind });
    assert.equal(opt._fastStackingScore(Int32Array.of(3)), expectedNormal);
    const normal = opt.optimizeCombined(['Red', 'Red', 'Red'], ['Red', 'Red', 'Red'], {
      normalTypes: ['Relic'], deepTypes: [], candidatesPerSlot: 6, topN: 1,
    });
    assert.equal(normal[0].score, expectedNormal);
    const combined = opt.optimizeCombined(['Red', 'Red', 'Red'], ['Red', 'Red', 'Red'], {
      candidatesPerSlot: 6, topN: 1,
    });
    assert.equal(combined[0].score, expectedCombined);
  }
});

test('effective-count cap limits stackable and conditional repeats, never raises non-stackable score', () => {
  for (const [kind, expected] of [[true, 20], ['conditional', 17], [false, 10]]) {
    const opt = optimizer([], [{ key: 'sample', priority: 'preferred', weight: 10, cap: 2 }], { sample: kind });
    assert.equal(opt._fastStackingScore(Int32Array.of(6)), expected);
  }
});

test('all slot enumeration shapes use the same conditional score', () => {
  const relics = [relic(1, ['sample']), relic(2, ['sample']), relic(3, ['sample'])];
  const opt = optimizer(relics, [{ key: 'sample', priority: 'preferred', weight: 10, cap: 3 }], {
    sample: 'conditional',
  });
  const [a, b, c] = relics.map(r => opt._compactRelic(r));
  assert.equal(opt._enumerateCombos([[a, b, c], [a, b, c], [a, b, c]], ['Red', 'Red', 'Red'])[0][0], 24);
  assert.equal(opt._enumerateCombos([[a], [b], [c]], ['Red', 'Green', 'Blue'])[0][0], 24);
  assert.equal(opt._enumerateCombos([[a, b], [a, b], [c]], ['Red', 'Red', 'Blue'])[0][0], 24);
  assert.equal(opt._enumerateCombos([[a], [b], [c]], ['Red', 'Any', 'Blue'])[0][0], 24);
  assert.equal(opt._enumerateCombos([[a], [b]], ['Red', 'Blue'])[0][0], 17);
});

test('concentration bonus counts different target keys and exclusions still invalidate a result', () => {
  const specs = [
    { key: 'core', priority: 'required', scope: 'any', weight: 10, cap: 1 },
    { key: 'high', priority: 'preferred', weight: 100, cap: 1 },
    { key: 'bad', priority: 'required', exclude: true, weight: 100 },
  ];
  const relics = [relic(1, ['core', 'high']), relic(2, []), relic(3, ['bad'])];
  const opt = optimizer(relics, specs, { core: false, high: true, bad: false });
  assert.equal(opt.scoreRelic(relics[0]), 115);
  const result = opt.optimizeCombined(['Red', 'Red', 'Red'], ['Red', 'Red', 'Red'], {
    normalTypes: ['Relic'], deepTypes: [], candidatesPerSlot: 3, topN: 1,
  })[0];
  assert.equal(result.score, 15);
  assert.equal(result.required_met, false);
  assert.equal(result.excluded_present.has('bad'), true);

  const duplicate = optimizer([relic(4, ['high', 'high'])], [specs[1]], { high: true });
  assert.equal(duplicate.scoreRelic(duplicate.allRelics[0]), 100);
});

test('required coverage outranks a higher numeric score in normal and combined modes', () => {
  const normal = [relic(1, ['core']), relic(2, ['high']), relic(3, ['high']), relic(4, ['high'])];
  const deep = [relic(5, [], 'DeepRelic'), relic(6, [], 'DeepRelic'), relic(7, [], 'DeepRelic')];
  const specs = [
    { key: 'core', priority: 'required', scope: 'any', weight: 10, cap: 1 },
    { key: 'high', priority: 'preferred', weight: 100, cap: 3 },
  ];
  const opt = optimizer([...normal, ...deep], specs, { core: false, high: true });
  const normalOnly = opt.optimizeCombined(['Red', 'Red', 'Red'], ['Red', 'Red', 'Red'], {
    normalTypes: ['Relic'], deepTypes: [], candidatesPerSlot: 7, topN: 1,
  })[0];
  assert.equal(normalOnly.required_met, true);
  assert.equal(normalOnly.score, 210);
  const combined = opt.optimizeCombined(['Red', 'Red', 'Red'], ['Red', 'Red', 'Red'], {
    candidatesPerSlot: 7, topN: 1,
  })[0];
  assert.equal(combined.required_met, true);
  assert.equal(combined.score, 210);
});

test('combined-result heap retains the best N scores', () => {
  const heap = new WorstFirstHeap();
  heap.push([-10, 0, 0]);
  heap.push([-20, 0, 1]);
  heap.push([-30, 0, 2]);
  assert.equal(heap.peek()[0], -10);
  heap.replace([-40, 0, 3]);
  assert.equal(heap.peek()[0], -20);
  assert.deepEqual([heap.pop()[0], heap.pop()[0], heap.pop()[0]], [-20, -30, -40]);
});

test('combined top results keep required coverage, repeat discounts, and exclusion penalties', () => {
  const relics = [
    relic(1, ['core', 'x']), relic(2, ['x']), relic(3, ['x', 'bad']), relic(4, ['y']),
    relic(5, ['x'], 'DeepRelic', 'Blue'), relic(6, ['y'], 'DeepRelic', 'Blue'),
    relic(7, ['y'], 'DeepRelic', 'Blue'), relic(8, [], 'DeepRelic', 'Blue'),
  ];
  const specs = [
    { key: 'core', priority: 'required', scope: 'any', weight: 10, cap: 6 },
    { key: 'x', priority: 'preferred', weight: 20, cap: 6 },
    { key: 'y', priority: 'preferred', weight: 8, cap: 6 },
    { key: 'bad', priority: 'required', exclude: true, weight: 15 },
  ];
  const opt = optimizer(relics, specs, { core: false, x: 'conditional', y: true, bad: false });
  const results = opt.optimizeCombined(['Red', 'Red', 'Red'], ['Blue', 'Blue', 'Blue'], {
    candidatesPerSlot: 8, topN: 3,
  });
  assert.deepEqual(Array.from(results, r => r.score), [87, 79, 79]);
  assert.equal(results.every(r => r.required_met), true);
  assert.equal(results.every(r => r.normal_relics.some(x => x.id === 1)), true);
  assert.equal(results.every(r => r.excluded_present.size === 0), true);
  const display = opt.formatResults(results, { key: 'sample-vessel' }, {
    combined: true, character: 'Revenant', types: ['Relic', 'DeepRelic'], candidates: 8,
  });
  assert.deepEqual(Array.from(display.results, r => r.score), [87, 79, 79]);
  assert.equal(display.results.every(r => r.requiredMet), true);
});
