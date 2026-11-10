import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { PRIMARY_BOSS_ROLE, displayCategory, layoutMapMarkers, calibratedPointDirectory, collectEvents, collectLayers, definitionOptions, evaluatePattern, eventOptions, findCandidates, nearbyPoints, phaseBossOptions, safeMapAsset } from '../src/lib/map-predictor.js';

// Synthetic state fixtures exercise the filter contract, not game distribution claims.
const known = value => ({ state: 'known', value });
const definitions = { features: { a: { nameZh: '测试建筑', kind: 'building' }, b: { nameZh: '测试事件', kind: 'event' } } };
const point = (coverage = 'known') => ({ attachId: 1, normalized: { x: .5, y: .5 }, features: [{ kind: 'building', state: 'known', sourceId: 'a' }], coverage: { building: coverage, event: 'unknown' } });
const pattern = (patternId, overrides = {}) => ({ patternId, terrain: known('0'), nightlord: { state: 'known', menuRowId: 0, formCertainty: 'menu_only' }, points: [point()], ...overrides });

test('unknown fields do not exclude selected clues', () => {
  assert.equal(evaluatePattern(pattern(0, { terrain: { state: 'unknown' }, nightlord: { state: 'unknown' } }), { filters: { terrain: '1', nightlord: '2', depth: '3', dlc: 'not-all' } }).matches, true);
});
test('verified field contradictions exclude, numeric and string IDs compare equally', () => {
  assert.equal(evaluatePattern(pattern(0), { filters: { nightlord: '0', terrain: 0 } }).matches, true);
  assert.equal(evaluatePattern(pattern(0), { filters: { nightlord: '1' } }).matches, false);
});
test('unknown boss identities do not become hard exclusion', () => {
  const base = pattern(0, { dayBosses: { day1: { state: 'known', sourceId: 5, identityStatus: 'unknown' } } });
  assert.equal(evaluatePattern(base, { filters: { firstNight: '8' } }).matches, true);
  base.dayBosses.day1.identityStatus = 'verified';
  assert.equal(evaluatePattern(base, { filters: { firstNight: '8' } }).matches, false);
});
test('depth restrictions remain active and removed DLC filters are ignored', () => {
  const base = pattern(0, { eligibility: { depths: { state: 'known', values: [1, 2] }, allPlayersHaveDlc: { state: 'known', required: true } } });
  assert.equal(evaluatePattern(base, { filters: { depth: '3' } }).matches, false);
  assert.equal(evaluatePattern(base, { filters: { dlc: 'not-all' } }).matches, true);
  base.eligibility.allPlayersHaveDlc.required = false;
  assert.equal(evaluatePattern(base, { filters: { dlc: 'all' } }).matches, true);
});
test('observations respect per-kind completeness, including confirmed absence', () => {
  const clues = { observations: [{ attachId: '1', terrainId: '0', kind: 'event', sourceId: 'b' }] };
  const base = pattern(0);
  assert.equal(evaluatePattern(base, clues).matches, true);
  base.points[0].coverage.event = 'known_absent';
  assert.equal(evaluatePattern(base, clues).matches, false);
  base.points[0].features.push({ kind: 'event', state: 'known', sourceId: 'b' });
  base.points[0].coverage.event = 'known';
  assert.equal(evaluatePattern(base, clues).matches, true);
});
test('missing point remains unknown instead of absent', () => {
  assert.equal(evaluatePattern(pattern(0, { points: [] }), { observations: [{ attachId: 1, kind: 'building', sourceId: 'a' }] }).matches, true);
});
test('adding reliable clues cannot increase candidate count', () => {
  const patterns = [pattern(0), pattern(1, { terrain: known('1') }), pattern(2, { terrain: { state: 'unknown' } })];
  const before = findCandidates(patterns, {});
  const after = findCandidates(patterns, { filters: { terrain: '0' } });
  assert.equal(after.length, 2); assert.ok(after.every(item => before.includes(item)));
});
test('unknown or missing presence is not a common point', () => {
  const layers = collectLayers([pattern(0), pattern(1, { points: [] })], definitions);
  assert.equal(layers[0].common, false);
  assert.equal(collectLayers([pattern(0), pattern(1)], definitions)[0].common, true);
});
test('same attach point supports multiple kinds without merging their identities', () => {
  const base = pattern(0); base.points[0].features.push({ kind: 'event', state: 'known', sourceId: 'b' });
  assert.equal(collectLayers([base], definitions).length, 2);
});
test('uncalibrated or conflicting positions remain text-only', () => {
  const other = pattern(1); other.points[0].normalized = { x: .6, y: .5 };
  assert.equal(collectLayers([pattern(0), other], definitions)[0].normalized, null);
});
test('selection options exclude unverified raw names', () => {
  assert.deepEqual(definitionOptions({ a: { nameZh: null }, b: { nameZh: '未知对象', identityStatus: 'unknown' }, c: { nameZh: '已核验' } }), [{ value: 'c', label: '已核验' }]);
});
test('click tolerance uses displayed pixels and keeps overlapping alternatives', () => {
  const points = [{ id: 'a', normalized: { x: .5, y: .5 } }, { id: 'b', normalized: { x: .51, y: .5 } }];
  assert.equal(nearbyPoints(points, { x: .5, y: .5 }, 500, 500).length, 2);
  assert.equal(nearbyPoints(points, { x: .8, y: .8 }, 500, 500).length, 0);
});
test('only verified local safe assets render', () => {
  const entry = { status: 'verified', width: 512, height: 512, src: '/map-assets/base-a.webp' };
  assert.equal(safeMapAsset(entry), true);
  for (const src of ['https://example.com/a.png', '/map-assets/../a.png', '/map-assets/%2e%2e/a.png']) assert.equal(safeMapAsset({ ...entry, src }), false);
  assert.equal(safeMapAsset({ ...entry, status: 'unknown' }), false);
});
test('boss choices are restricted to their actual verified stage references', () => {
  const definitions = { a: { nameZh: '首领甲' }, b: { nameZh: '首领乙' }, c: { nameZh: '首领丙' } };
  const patterns = [{ dayBosses: { day1: { state: 'known', sourceId: 'a' }, day2: { state: 'known', sourceId: 'b' } } }, { dayBosses: { day1: { state: 'known', sourceId: 'c', identityStatus: 'unknown' } } }];
  assert.deepEqual(phaseBossOptions(patterns, definitions, 'day1').map(option => option.value), ['a']);
  assert.deepEqual(phaseBossOptions(patterns, definitions, 'day2').map(option => option.value), ['b']);
});
test('unknown terrain does not create a confirmed common map point', () => {
  const base = pattern(0, { terrain: { state: 'unknown' } });
  assert.equal(collectLayers([base], definitions)[0].common, false);
});
test('event families use explicit references, not shared display names', () => {
  const defs = { a: { nameZh: '事件', referenceFamily: 'family-a' }, b: { nameZh: '事件', referenceFamily: 'family-a' }, c: { nameZh: '事件', referenceFamily: 'family-b' } };
  assert.equal(eventOptions(defs).length, 2);
  assert.deepEqual(eventOptions(defs)[0].sourceIds, ['a', 'b']);
});
test('event family and optional day respect unknown, absent and day variants', () => {
  const defs = { events: { a: { nameZh: '事件', referenceFamily: 'same' }, b: { nameZh: '事件', referenceFamily: 'same' } } };
  const clues = { filters: { event: 'family:same', eventDay: '1' } };
  const base = pattern(0, { events: { state: 'known', values: [{ sourceId: 'b', day: 2 }] } });
  assert.equal(evaluatePattern(base, clues, defs).matches, false);
  assert.equal(evaluatePattern(base, { filters: { event: 'family:same' } }, defs).matches, true);
  base.events.values[0].day = null;
  assert.equal(evaluatePattern(base, clues, defs).matches, true);
  base.events = { state: 'unknown' };
  assert.equal(evaluatePattern(base, clues, defs).matches, true);
  base.events = { state: 'known_absent', values: [] };
  assert.equal(evaluatePattern(base, clues, defs).matches, false);
});
test('event outputs are separate from spatial layers and unknown is not common', () => {
  const defs = { events: { a: { nameZh: '事件', referenceFamily: 'one' } } };
  const base = pattern(0, { events: { state: 'known', values: [{ sourceId: 'a', day: 1 }] } });
  assert.equal(collectEvents([base, pattern(1)], defs)[0].common, false);
  assert.equal(collectLayers([base], defs).length, 0);
});
test('actual page watch resets pagination after in-place clue additions and removals', async () => {
  const source = readFileSync(new URL('../src/pages/MapPredictorPage.vue', import.meta.url), 'utf8');
  const registration = source.split('\n').find(line => line.startsWith('watch(clues,'));
  assert.ok(registration);
  const filters = reactive({}), observations = ref([]), candidatePage = ref(3);
  const clues = computed(() => ({ filters: { ...filters }, observations: observations.value }));
  const patterns = Array.from({ length: 25 }, (_, index) => pattern(index));
  patterns[0].points[0].features.push({ kind: 'event', state: 'known', sourceId: 'b' });
  patterns.forEach(item => { item.points[0].coverage.event = 'known'; });
  const candidates = computed(() => findCandidates(patterns, clues.value));
  const visible = computed(() => candidates.value.slice((candidatePage.value - 1) * 12, candidatePage.value * 12));
  const stop = Function('watch', 'clues', 'candidatePage', `return ${registration}`)(watch, clues, candidatePage);
  observations.value.push({ attachId: 1, kind: 'event', sourceId: 'b' });
  await nextTick();
  assert.equal(candidates.value.length, 1); assert.equal(candidatePage.value, 1); assert.equal(visible.value.length, 1);
  candidatePage.value = 2; observations.value.splice(0, 1); await nextTick();
  assert.equal(candidatePage.value, 1); assert.equal(visible.value.length, 12);
  stop();
});
test('display numbers come from all calibrated points per terrain, independent of result order', () => {
  const base = pattern(0, { points: [{ ...point(), attachId: '100' }, { ...point(), attachId: '20' }, { ...point(), attachId: '1' }] });
  const other = pattern(1, { terrain: known('1'), points: [{ ...point(), attachId: '100' }] });
  const first = calibratedPointDirectory([base, other]);
  const reversed = calibratedPointDirectory([other, { ...base, points: [...base.points].reverse() }]);
  for (const [key, entry] of first) assert.equal(reversed.get(key).number, entry.number);
  assert.equal(first.get('["0","1"]').number, 1);
  assert.equal(first.get('["0","20"]').number, 2);
  assert.equal(first.get('["0","100"]').number, 3);
  assert.equal(first.get('["1","100"]').number, 1);
});
test('conflicting calibration is excluded from numbered positions', () => {
  const base = pattern(0), other = pattern(1); other.points[0].normalized = { x: .7, y: .5 };
  assert.equal(calibratedPointDirectory([base, other]).size, 0);
});
const roleDefinitions = { features: { bossA: { nameZh: '测试首领甲', kind: 'monster', role: PRIMARY_BOSS_ROLE }, bossB: { nameZh: '测试首领乙', kind: 'monster', role: PRIMARY_BOSS_ROLE } } };
const bossPattern = (sourceId, coverage = 'known') => pattern(sourceId, { points: [{ ...point(), features: [{ kind: 'monster', state: 'known', role: PRIMARY_BOSS_ROLE, sourceId }], coverage: { monster: 'unknown', [PRIMARY_BOSS_ROLE]: coverage } }] });
const bossClue = { observations: [{ attachId: 1, kind: 'monster', role: PRIMARY_BOSS_ROLE, sourceId: 'bossA' }] };
test('verified primary encounter bosses A and B exclude each other at the same point', () => {
  assert.equal(evaluatePattern(bossPattern('bossA'), bossClue, roleDefinitions).matches, true);
  assert.equal(evaluatePattern(bossPattern('bossB'), bossClue, roleDefinitions).matches, false);
});
test('unknown primary templates remain candidates and ordinary monsters are not excluded', () => {
  assert.equal(evaluatePattern(bossPattern('bossB', 'unknown'), bossClue, roleDefinitions).matches, true);
  const ordinary = { observations: [{ attachId: 1, kind: 'monster', sourceId: 'bossA' }] };
  assert.equal(evaluatePattern(bossPattern('bossB'), ordinary, roleDefinitions).matches, true);
});
test('unverified or mismatched observation roles cannot drive exclusion', () => {
  const definitions = { features: { bossA: { nameZh: '测试首领甲', kind: 'monster' } } };
  assert.equal(evaluatePattern(bossPattern('bossB'), bossClue, definitions).matches, true);
  assert.equal(evaluatePattern(bossPattern('bossB'), bossClue, { features: { bossA: { ...roleDefinitions.features.bossA, identityStatus: 'unknown' } } }).matches, true);
});
test('primary role layers require both feature and definition agreement', () => {
  const base = bossPattern('bossA');
  assert.equal(collectLayers([base], roleDefinitions)[0].role, PRIMARY_BOSS_ROLE);
  delete base.points[0].features[0].role;
  assert.equal(collectLayers([base], roleDefinitions).length, 0);
});


test('display layers distinguish primary bosses and explicitly classified elites', () => {
  assert.equal(displayCategory({ kind: 'building' }), 'building');
  assert.equal(displayCategory({ kind: 'monster', role: PRIMARY_BOSS_ROLE }), 'baseBoss');
  assert.equal(displayCategory({ kind: 'monster' }), null);
  assert.equal(displayCategory({ kind: 'monster' }, { displayCategory: 'fieldElite' }), 'fieldElite');
});

test('overlapping markers spread without altering their actual coordinates', () => {
  const groups = ['a', 'b', 'c'].map(key => ({ key, normalized: { x: .5, y: .5 } }));
  const markers = layoutMapMarkers(groups, 600, 600);
  assert.equal(markers[0].offset, false);
  for (const marker of markers) assert.deepEqual(marker.normalized, { x: .5, y: .5 });
  for (let i = 0; i < markers.length; i++) for (let j = i + 1; j < markers.length; j++)
    assert.ok(Math.hypot(markers[i].markerX - markers[j].markerX, markers[i].markerY - markers[j].markerY) >= 48);
});

test('native field elite at terrain 0 attach 750 filters by its own role coverage', () => {
  const catalog = JSON.parse(readFileSync(new URL('../public/map-catalog.json', import.meta.url), 'utf8'));
  const filters = { terrain: '0' };
  const observation = { terrainId: '0', attachId: '750', kind: 'monster', role: 'fieldElite', sourceId: 'fieldElite:4655' };
  assert.equal(catalog.definitions.features[observation.sourceId].nameZh, '狮子混种');
  const before = findCandidates(catalog.patterns, { filters }, catalog.definitions);
  const after = findCandidates(catalog.patterns, { filters, observations: [observation] }, catalog.definitions);
  assert.ok(after.length > 0 && after.length < before.length);
  assert.ok(after.some(item => item.patternId === '0'));
  const conflicting = before.find(item => !after.includes(item));
  assert.ok(conflicting);
  const unknown = structuredClone(conflicting);
  unknown.points.find(item => String(item.attachId) === '750').coverage.fieldElite = 'unknown';
  assert.equal(evaluatePattern(unknown, { observations: [observation] }, catalog.definitions).matches, true);
  unknown.points = unknown.points.filter(item => String(item.attachId) !== '750');
  assert.equal(evaluatePattern(unknown, { observations: [observation] }, catalog.definitions).matches, true);
});

test('elite coverage does not exclude other monster roles or unresolved elite identities', () => {
  const defs = { features: { elite: { nameZh: '精英甲', kind: 'monster', role: 'fieldElite' }, other: { nameZh: '精英乙', kind: 'monster', role: 'fieldElite' }, ...roleDefinitions.features } };
  const base = pattern(0, { points: [{ ...point(), features: [{ kind: 'monster', state: 'known', role: 'fieldElite', sourceId: 'other' }], coverage: { fieldElite: 'known', monster: 'unknown', [PRIMARY_BOSS_ROLE]: 'unknown' } }] });
  const clue = { observations: [{ attachId: 1, kind: 'monster', role: 'fieldElite', sourceId: 'elite' }] };
  assert.equal(evaluatePattern(base, clue, defs).matches, false);
  assert.equal(evaluatePattern(base, bossClue, defs).matches, true);
  assert.equal(evaluatePattern(base, { observations: [{ attachId: 1, kind: 'monster', sourceId: 'elite' }] }, defs).matches, true);
  base.points[0].features[0].state = 'unknown';
  assert.equal(evaluatePattern(base, clue, defs).matches, true);
  base.points[0].features = [];
  base.points[0].coverage.fieldElite = 'known_absent';
  assert.equal(evaluatePattern(base, clue, defs).matches, false);
});
