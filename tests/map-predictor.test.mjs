import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { pointChoiceContext, possiblePointChoices, buildingChoicesAtPosition, confirmedFieldEliteKeys, confirmedBuildingKeys, coincidentMarkers, withoutPointObservations, PRIMARY_BOSS_ROLE, MAP_DISPLAY_CATEGORIES, buildingIconPath, pointIconPath, nightlordPortrait, displayCategory, layoutMapMarkers, referenceMapGroups, calibratedPointDirectory, collectEvents, collectLayers, definitionOptions, evaluatePattern, eventOptions, findCandidates, nearbyPoints, phaseBossOptions, safeMapAsset } from '../src/lib/map-predictor.js';

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

test('dense markers retain exact native positions without leader lines', () => {
  const groups = ['a', 'b', 'c'].map(key => ({ key, normalized: { x: .5, y: .5 } }));
  const markers = layoutMapMarkers(groups, 600, 600);
  for (const marker of markers) {
    assert.deepEqual(marker.normalized, { x: .5, y: .5 });
    assert.equal(marker.markerX, 300); assert.equal(marker.markerY, 300);
    assert.equal(marker.dense, true); assert.equal(marker.offset, undefined);
  }
  assert.equal(layoutMapMarkers([groups[0]], 600, 600)[0].dense, false);
  assert.equal(nearbyPoints(markers, { x: .5, y: .5 }, 600, 600, 24).length, 3);
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


test('reference markers follow terrain and layer visibility without entering candidate filtering', () => {
  const reference = { key: 'fixed', terrainId: '2', nameZh: '参考首领', normalized: { x: .4, y: .6 }, displayCategory: 'fieldElite', filterable: false };
  const visibility = { fieldElite: true };
  const groups = referenceMapGroups([reference], '2', visibility);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].reference, reference);
  assert.equal(groups[0].attachId, undefined);
  assert.equal(groups[0].entries[0].sourceId, undefined);
  assert.equal(referenceMapGroups([reference], '1', visibility).length, 0);
  assert.equal(referenceMapGroups([{ ...reference, displayCategory: 'baseBoss' }], '2', { baseBoss: true }).length, 0);
  assert.deepEqual(MAP_DISPLAY_CATEGORIES, ['building', 'fieldElite']);
  assert.equal(referenceMapGroups([reference], '2', { fieldElite: false }).length, 0);
  assert.equal(referenceMapGroups([{ ...reference, filterable: true }], '2', visibility).length, 0);
  assert.equal(referenceMapGroups([{ ...reference, normalized: null }], '2', visibility).length, 0);
  const candidates = [pattern(0)];
  assert.deepEqual(findCandidates(candidates, { referencePoints: [reference] }), candidates);
});


test('building icons resolve explicit definition mappings to local assets', () => {
  const manifest = { icons: { 'smallBaseMap:1': { src: 'map-icons/building-1.png', status: 'verified' } } };
  assert.equal(buildingIconPath(manifest, 'smallBaseMap:1'), '/map-icons/building-1.png');
  assert.equal(buildingIconPath(manifest, 'smallBaseMap:2'), null);
  assert.equal(buildingIconPath({ icons: { a: { src: 'https://example.com/a.png', status: 'verified' } } }, 'a'), null);
});

test('nightlord portraits use verified menu identity and DLC has an honest fallback', () => {
  const catalog = JSON.parse(readFileSync(new URL('../public/map-catalog.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../public/enemy-image-verified.json', import.meta.url), 'utf8'));
  assert.equal(nightlordPortrait(catalog.definitions.nightlords['0'], manifest), '/enemy-images/nightboss-41820.png');
  assert.equal(nightlordPortrait(catalog.definitions.nightlords['8'], manifest), null);
  assert.equal(nightlordPortrait(catalog.definitions.nightlords['9'], manifest), null);
});


test('native blue and red elite icons follow explicit definition metadata; references remain neutral', () => {
  const catalog = JSON.parse(readFileSync(new URL('../public/map-catalog.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../public/map-icon-manifest.json', import.meta.url), 'utf8'));
  assert.match(pointIconPath(manifest, 16), /elite-normal-/);
  assert.match(pointIconPath(manifest, 28), /elite-strong-/);
  assert.equal(pointIconPath(manifest, null), null);
  const nativeLayers = collectLayers(catalog.patterns.slice(0, 1), catalog.definitions).filter(entry => entry.role === 'fieldElite');
  assert.ok(nativeLayers.length > 0);
  for (const entry of nativeLayers) {
    assert.equal(entry.worldMapPointIconId, catalog.definitions.features[entry.sourceId].worldMapPointIconId);
    assert.ok(pointIconPath(manifest, entry.worldMapPointIconId));
  }
  const references = referenceMapGroups(catalog.referencePoints, '1', { fieldElite: true });
  assert.ok(references.length > 0);
  for (const group of references) assert.equal(pointIconPath(manifest, group.entries[0].worldMapPointIconId), null);
});

test('both DLC nightlord portraits use verified native menu assets', () => {
  const catalog = JSON.parse(readFileSync(new URL('../public/map-catalog.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../public/map-icon-manifest.json', import.meta.url), 'utf8'));
  for (const id of ['8', '9']) assert.equal(nightlordPortrait(catalog.definitions.nightlords[id], {}, manifest), manifest.nightlords[id].src);
});


test('only actual coincident points share a position picker and point cancellation removes all its clues', () => {
  const a = { key: 'a', terrainId: '0', attachId: '1', normalized: { x: .5, y: .5 } };
  const b = { ...a, key: 'b', attachId: '2' };
  const near = { ...a, key: 'near', normalized: { x: .54, y: .5 } };
  assert.deepEqual(coincidentMarkers([a,b,near], a, 500,500).map(p=>p.key), ['a','b']);
  const clues = [{ terrainId:'0', attachId:'1', kind:'building' }, { terrainId:'0', attachId:'1', kind:'monster' }, { terrainId:'1', attachId:'1', kind:'building' }];
  assert.deepEqual(withoutPointObservations(clues,a), [clues[2]]);
});

test('red building certainty ignores raw IDs but requires every candidate coverage and consistent position', () => {
  const defs = { features: { ...definitions.features, raw: { kind:'building', nameZh:null, identityStatus:'raw_id_only' } } };
  const a = pattern(0), b = pattern(1);
  for (const p of [a,b]) p.points[0].features.unshift({ kind:'building', state:'known', sourceId:'raw' });
  const key = '["0","1","a"]';
  assert.ok(confirmedBuildingKeys([a,b],'0',defs).has(key));
  for (const change of [p=>p.points[0].coverage.building='unknown', p=>p.points=[], p=>p.points[0].normalized={x:.6,y:.5}, p=>p.points[0].features[1].state='unknown', p=>p.terrain={state:'unknown'}]) {
    const uncertain=structuredClone(b);change(uncertain);
    assert.equal(confirmedBuildingKeys([a,uncertain],'0',defs).has(key),false);
  }
  assert.equal(confirmedBuildingKeys([],'0',defs).size,0);
});

test('real marked mountain scenario exposes other confirmed buildings and all DLC choices exist', () => {
  const c=JSON.parse(readFileSync(new URL('../public/map-catalog.json',import.meta.url),'utf8'));
  const filters={terrain:'1',nightlord:'0',firstNight:'4924',secondNight:'4860'};
  const observation={terrainId:'1',attachId:'100',kind:'building',sourceId:'buildingCategory:greatchurch'};
  const remaining=findCandidates(c.patterns,{filters,observations:[observation]},c.definitions);
  const certain=confirmedBuildingKeys(remaining,'1',c.definitions);
  assert.ok(remaining.length>0);
  assert.ok(certain.has('["1","101","buildingCategory:ruins"]'));
  const choices=collectLayers(c.patterns,c.definitions).filter(e=>e.kind==='building');
  assert.ok(choices.some(e=>e.sourceId==='buildingCategory:marsh'));
  assert.ok(choices.some(e=>e.sourceId==='buildingCategory:forge'));
});

test('south lake elite display correction preserves native point and filter identity', () => {
  const c=JSON.parse(readFileSync(new URL('../public/map-catalog.json',import.meta.url),'utf8'));
  const p=c.patterns.find(p=>String(p.terrain.value)==='0'&&p.points.some(pt=>pt.features.some(f=>f.displayNormalized)));
  const pt=p.points.find(pt=>pt.features.some(f=>f.displayNormalized)),f=pt.features.find(f=>f.displayNormalized);
  const entry=collectLayers([p],c.definitions).find(e=>e.attachId===String(pt.attachId)&&e.sourceId===f.sourceId);
  assert.deepEqual(entry.normalized,f.displayNormalized);
  assert.notDeepEqual(entry.normalized,pt.normalized);
  assert.equal(evaluatePattern(p,{observations:[{terrainId:'0',attachId:pt.attachId,kind:f.kind,role:f.role,sourceId:f.sourceId}]},c.definitions).matches,true);
});


test('ordinary physical building position exposes DLC choices bound to their real slots', () => {
  const c=JSON.parse(readFileSync(new URL('../public/map-catalog.json',import.meta.url),'utf8'));
  const layers=collectLayers(c.patterns,c.definitions).filter(e=>e.kind==='building'&&e.terrainId==='0'&&e.normalized);
  const bySlot=new Map();
  for(const e of layers){const key=JSON.stringify([e.terrainId,e.attachId]);if(!bySlot.has(key))bySlot.set(key,{key,terrainId:e.terrainId,attachId:e.attachId,normalized:e.normalized,entries:[]});bySlot.get(key).entries.push(e);}
  const groups=[...bySlot.values()],normal=groups.find(g=>g.attachId==='101');
  const choices=buildingChoicesAtPosition(groups,normal);
  for(const category of ['marsh','forge']){const e=choices.find(e=>e.sourceId==='buildingCategory:'+category);assert.ok(e);assert.equal(e.attachId,'2101');}
  assert.equal(new Set(choices.map(e=>e.sourceId)).size,choices.length);
  assert.ok(normal.entries.every(e=>!['buildingCategory:marsh','buildingCategory:forge'].includes(e.sourceId)));
});


test('actual viewport measurement is invariant when scrollbar content dimensions alternate', () => {
  const source=readFileSync(new URL('../src/pages/MapPredictorPage.vue',import.meta.url),'utf8');
  const measure=source.slice(source.indexOf('function measureViewport()'),source.indexOf('function scheduleViewportMeasure()'));
  const viewport={clientWidth:1030,clientHeight:619,getBoundingClientRect:()=>({width:1046.6667,height:636})};
  const size={width:0,height:0};
  const run=Function('mapViewport','getComputedStyle','viewportSize',`let viewportFrame,viewportContentBox;${measure};return box=>{viewportContentBox=box;measureViewport();return {...viewportSize};}`)({value:viewport},()=>({borderLeftWidth:'.666667px',borderRightWidth:'.666667px',borderTopWidth:'.666667px',borderBottomWidth:'.666667px'}),size);
  assert.deepEqual(run({width:1030,height:619}),{width:1045,height:634});
  viewport.clientHeight=635;
  assert.deepEqual(run({width:1030,height:634.666}),{width:1045,height:634});
});

test('choice editing removes only the same class at its real or shared building slot', () => {
  const defs={features:{a:{kind:'building',nameZh:'建筑甲'},c:{kind:'building',nameZh:'建筑乙'},b:{kind:'event',nameZh:'事件'}}};
  const choices=[{kind:'building',terrainId:'0',attachId:'1',sourceId:'a'},{kind:'building',terrainId:'0',attachId:'1',sourceId:'c'}];
  const target={key:'one',terrainId:'0',attachId:'1',normalized:{x:.5,y:.5},entries:choices};
  const shared={...target,key:'dlc',attachId:'2001'};
  const clues={filters:{terrain:'0'},observations:[choices[0],{...choices[0],attachId:'2001'},{terrainId:'0',attachId:'2',kind:'event',sourceId:'b'}]};
  const ctx=pointChoiceContext(clues,target,[target,shared]);
  assert.deepEqual(ctx.observations,[clues.observations[2]]);assert.equal(ctx.filters,clues.filters);
  const first=pattern(0),second=pattern(1);second.points[0].features[0].sourceId='c';
  assert.deepEqual(possiblePointChoices([first,second],pointChoiceContext({observations:[choices[0]]},target,[target]),choices,defs).map(e=>e.sourceId),['a','c']);
  first.points.push({attachId:'2',features:[{kind:'event',state:'known',sourceId:'b'}],coverage:{event:'known'}});
  second.points.push({attachId:'2',features:[],coverage:{event:'known_absent'}});
  assert.deepEqual(possiblePointChoices([first,second],ctx,choices,defs).map(e=>e.sourceId),['a']);
  const unknown=pattern(2);unknown.points[0].coverage.building='unknown';
  assert.equal(possiblePointChoices([unknown],{},[choices[1]],defs).length,1);
  unknown.points=[];assert.equal(possiblePointChoices([unknown],{},[choices[1]],defs).length,1);
});

test('real marked clues narrow building and elite choices while keeping DLC sources', () => {
  const c=JSON.parse(readFileSync(new URL('../public/map-catalog.json',import.meta.url),'utf8'));
  const bySlot=new Map();
  for(const e of collectLayers(c.patterns,c.definitions).filter(e=>e.terrainId==='1'&&e.normalized&&MAP_DISPLAY_CATEGORIES.includes(e.displayCategory))){if(!bySlot.has(e.attachId))bySlot.set(e.attachId,{key:e.attachId,terrainId:e.terrainId,attachId:e.attachId,normalized:e.normalized,entries:[]});bySlot.get(e.attachId).entries.push(e);}
  const groups=[...bySlot.values()];
  const clues={filters:{terrain:'1',nightlord:'0'},observations:[{terrainId:'1',attachId:'104',kind:'building',sourceId:'buildingCategory:fort'}]};
  const target=bySlot.get('108'),raw=buildingChoicesAtPosition(groups,target,false);
  const building=possiblePointChoices(c.patterns,pointChoiceContext(clues,target,groups),raw,c.definitions);
  const names=[...new Set(building.map(e=>e.name))];
  assert.ok(names.includes('大型营地'));assert.ok(names.includes('沼泽'));assert.ok(names.includes('锻造村'));
  assert.equal(names.includes('大教堂'),false);assert.equal(names.includes('要塞'),false);
  const elite=bySlot.get('750');
  assert.equal(possiblePointChoices(c.patterns,{filters:clues.filters},elite.entries,c.definitions).length,4);
  assert.deepEqual(possiblePointChoices(c.patterns,pointChoiceContext(clues,elite,groups),elite.entries,c.definitions).map(e=>e.name),['老狮子','米兰达之花']);
});


test('elite red certainty requires every remaining candidate identity, coverage and coordinate', () => {
  const defs={features:{a:{kind:'monster',role:'fieldElite',nameZh:'精英甲'},b:{kind:'monster',role:'fieldElite',nameZh:'精英乙'}}};
  const make=()=>pattern(0,{points:[{attachId:'1',normalized:{x:.5,y:.5},features:[{kind:'monster',role:'fieldElite',sourceId:'a',state:'known'}],coverage:{fieldElite:'known'}}]});
  const a=make(),b=make(),key='["0","1","a"]';
  assert.ok(confirmedFieldEliteKeys([a,b],'0',defs).has(key));
  assert.ok(confirmedFieldEliteKeys([a],'0',defs).has(key));
  for(const mutate of [p=>p.points[0].features[0].sourceId='b',p=>p.points[0].coverage.fieldElite='unknown',p=>p.points=[],p=>p.points[0].normalized={x:.6,y:.5},p=>p.points[0].features[0].state='unknown',p=>p.terrain={state:'unknown'}]){
    const changed=make();mutate(changed);assert.equal(confirmedFieldEliteKeys([a,changed],'0',defs).has(key),false);
  }
  assert.equal(confirmedFieldEliteKeys([],'0',defs).size,0);
  assert.equal(confirmedFieldEliteKeys([a],'0',{features:{a:{...defs.features.a,identityStatus:'unverified'}}}).size,0);
});

test('native filtered scenario confirms elites before any manual point marking', () => {
  const c=JSON.parse(readFileSync(new URL('../public/map-catalog.json',import.meta.url),'utf8'));
  const remaining=findCandidates(c.patterns,{filters:{terrain:'1',nightlord:'0',firstNight:'4924',secondNight:'4860'}},c.definitions);
  const red=confirmedFieldEliteKeys(remaining,'1',c.definitions);
  assert.ok(remaining.length>0);assert.ok(red.size>0);
  for(const key of red){const [terrain,attach,source]=JSON.parse(key);assert.equal(terrain,'1');assert.ok(remaining.every(p=>p.points.some(pt=>String(pt.attachId)===attach&&pt.coverage.fieldElite==='known'&&pt.features.some(f=>f.sourceId===source))));}
});
