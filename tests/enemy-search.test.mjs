import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const data = JSON.parse(fs.readFileSync(new URL('../public/enemy-data.json', import.meta.url), 'utf8'));

function createAtlas() {
  const nodes = new Map();
  const $ = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      value: 'all', innerHTML: '', scrollTop: 0, events: {},
      scrollIntoView() {}, querySelector() { return null; },
      addEventListener(name, handler) { this.events[name] = handler; },
      dispatchEvent() {},
    });
    return nodes.get(selector);
  };
  const location = { href: 'http://localhost/#enemies' };
  const history = {
    state: {}, updates: 0,
    replaceState(_state, _title, url) { location.href = String(url); this.updates++; },
  };
  const context = { $, URL, Event, location, history, window: {}, esc: value => String(value ?? '') };
  vm.createContext(context);
  vm.runInContext([
    source.match(/const state =[^\n]*/)[0],
    source.match(/const fmt =[^\n]*/)[0],
    source.slice(source.indexOf('const bossRe='), source.indexOf('function effectName(')),
    source.match(/function renderPagination\([^]*?\n\}/)[0],
  ].join('\n'), context);
  const state = vm.runInContext('state', context);
  state.enemyData = structuredClone(data);
  context.buildEnemyMetadata();
  context.buildEnemyDisplayIndex();
  context.setupEnemyFilters();
  $('#enemy-search').value = '';
  context.filterEnemies();
  return { context, state, $, location, history };
}

test('opening a specific atlas source keeps its own numbers and calculator target', () => {
  const {context,state,$} = createAtlas();
  const targets = JSON.parse(fs.readFileSync(new URL('../public/damage-targets.json', import.meta.url))).targets;
  const id = '37000010a';
  const row = state.enemyRowsById.get(id);
  $('#enemy-area').value = '遗迹';
  context.renderEnemyDetail(row);
  assert.ok($('#enemy-detail').innerHTML.includes(`data-enemy-id="${id}"`));
  context.window.NightreignDamageEnemyPicker.open(targets, id);
  context.renderEnemyDetail(row);
  const html = $('#enemy-detail').innerHTML;
  assert.ok(html.includes(`data-enemy-id="${id}"`));
  assert.ok(html.includes(`data-damage-target-pick="${id}"`));
});

test('Wormface and the Fire Prelate default to their placed encounter statistics', () => {
  const {context,state,$} = createAtlas();
  $('#enemy-search').value = '巨型蚯蚓脸';
  context.filterEnemies();
  const row = context.enemyListRecord(state.enemyGroups.find(group => group.name === '巨型蚯蚓脸')).row;
  assert.equal(String(row[1]), '45803020a');
  assert.deepEqual(row.slice(13,18), [308,231,231,231,231]);
  $('#enemy-search').value = '火焰主教';
  for (const area of ['all','火山口']) {
    $('#enemy-area').value = area;
    context.filterEnemies();
    const prelate = context.enemyListRecord(state.enemyGroups.find(group => group.name === '火焰主教')).row;
    assert.equal(String(prelate[1]), '39100130');
    assert.equal(context.enemyMetricDisplay(prelate,7), '×0.9');
    assert.equal(context.enemyMetricDisplay(prelate,9), '×0.8');
  }
});

test('mine occurrences merge into ordinary cards while keeping source records and location filters', () => {
  const { context, state, $ } = createAtlas();
  const row = id => state.enemyData.rows.find(r => String(r[1]) === id);
  const ordinary = row('43400000'), mine = row('43401120');
  assert.deepEqual(mine.slice(2), ordinary.slice(2));
  assert.equal(context.enemyEntityKey(mine), context.enemyEntityKey(ordinary));
  const pumpkin = state.enemyEntities.get(context.enemyEntityKey(ordinary));
  assert.equal(pumpkin.name, '发狂南瓜头士兵');
  const stats = pumpkin.statGroups.find(group => group.records.some(r => r.row === mine));
  assert.ok(stats.records.some(r => r.row === ordinary));
  assert.ok(context.enemySourceNote(mine).locations.includes('矿洞'));
  assert.ok(!context.enemySourceNote(ordinary).locations.includes('矿洞'), 'do not change the original record occurrence');
  $('#enemy-area').value = '矿洞';
  context.filterEnemies();
  for (const id of ['43400000', '46000000', '43511120']) {
    const key = context.enemyEntityKey(row(id));
    assert.equal(state.enemyGroups.filter(group => group.key === key).length, 1);
    assert.ok(context.enemyDisplayLocations(row(id)).includes('矿洞'));
  }
  assert.ok(!state.enemyGroups.some(group => group.name.includes('(矿洞)')));
  assert.equal(context.enemyEntityKey(row('43511120')), context.enemyEntityKey(row('43510020a')));
  assert.ok(!context.enemyRowDisplayLocations(row('43510000')).includes('矿洞'));
  assert.ok(!row('46000110'));
});

test('mine trolls, swamp corpses and nightlord summons open their own combat profiles', () => {
  const {context,state,$} = createAtlas();
  const troll = state.enemyRowsById.get('46030010');
  const group = state.enemyEntities.get(context.enemyEntityKey(troll));
  assert.equal(group, state.enemyEntities.get(context.enemyEntityKey(state.enemyRowsById.get('46000030'))));
  context.renderEnemyDetail(troll);
  const detail = $('#enemy-detail').innerHTML;
  assert.match(detail,/aria-pressed="true">矿洞山妖/);
  assert.match(detail,/矿洞（大空洞）/);
  const corpse = state.enemyGroups.find(g => g.records.some(({row}) => String(row[1])==='36626010'));
  assert.equal(String(context.enemyListRecord(corpse).row[1]),'36626010');
  for(const id of ['76500010','76510010','76510110','76600010']){
    const summon = state.enemyRowsById.get(id);
    assert.deepEqual([...context.enemyRowDisplayLocations(summon)],['夜王']);
    assert.equal(state.enemyData.nativeCardEvidence[id].encounterRole,'夜王战召唤物');
    assert.ok(!context.enemyEntityKey(summon).startsWith('nightlord:'));
  }
});

test('ordinary and large demi-humans share one card and the Queen owns the field boss encounter', () => {
  const { context, state, $ } = createAtlas();
  const rows = state.enemyData.rows.filter(r => /^(大型)?亚人(?: |$)/.test(r[0]));
  assert.equal(rows.length, 23);
  const keys = new Set(rows.map(r => context.enemyEntityKey(r)));
  assert.equal(keys.size, 1);
  const [key] = keys;
  assert.equal(state.enemyEntities.get(key).name, '亚人');
  const targets = JSON.parse(fs.readFileSync(new URL('../public/damage-targets.json', import.meta.url))).targets;
  assert.ok(![...targets.map(t => t.name), ...state.enemyData.rows.map(r => r[0])].some(name => name.includes('兜帽小亚人')));
  for (const id of ['41000040', '41001040', '41002040']) {
    const target = targets.find(t => t.id === id);
    assert.equal(target.name, '亚人 (亚人女王随从)');
    assert.deepEqual(target.source.locations, []);
    assert.deepEqual(Array.from(context.enemySourceNote(state.enemyRowsById.get(id)).locations), []);
  }
  $('#enemy-search').value = '大型亚人';
  context.filterEnemies();
  assert.deepEqual(Array.from(state.enemyGroups, g => g.name), ['亚人']);
  $('#enemy-search').value = '亚人';
  $('#enemy-area').value = '原野Boss';
  context.filterEnemies();
  assert.ok(!state.enemyGroups.some(g => g.key === key));
  assert.ok(state.enemyGroups.some(g => g.key === context.enemyEntityKey(state.enemyRowsById.get('41300020'))));
  const summon = state.enemyRowsById.get('49801110');
  assert.equal(context.enemyEntityKey(summon), context.enemyEntityKey(state.enemyRowsById.get('49801010')));
  assert.ok(context.enemySourceNote(summon).sourceName.includes('提比娅的唤声船召唤物'));
  assert.ok(!state.enemyMetaLocations.has('提比娅的唤声船召唤物'));
});

test('reviewed profiles split within the same site and retain their own searchable locations', () => {
  const { context, state, $ } = createAtlas();
  const entity = id => state.enemyEntities.get(context.enemyEntityKey(state.enemyRowsById.get(id)));
  const immune = entity('51900010'), susceptible = entity('51900020');
  assert.notEqual(immune.key, susceptible.key);
  assert.equal(immune.name, '蜘蛛蝎 · 中毒 免疫');
  assert.equal(susceptible.name, '蜘蛛蝎 · 中毒 252');
  $('#enemy-search').value = '蜘蛛蝎';
  $('#enemy-area').value = '沼泽';
  context.filterEnemies();
  assert.ok(state.enemyGroups.some(group => group.key === immune.key));
  assert.ok(!state.enemyGroups.some(group => group.key === susceptible.key));
  $('#enemy-area').value = '遗迹（大空洞）';
  context.filterEnemies();
  assert.ok([immune, susceptible].every(x => state.enemyGroups.some(group => group.key === x.key)));
  const blood = entity('36615010a');
  assert.deepEqual(new Set(blood.locations), new Set(['遗迹','遗迹（大空洞）','沼泽','腐败森林']));
  assert.notEqual(entity('36614000').key, entity('36610020').key);
  assert.deepEqual([...entity('36614000').locations], []);
  assert.deepEqual([...context.enemyDisplayLocations(state.enemyRowsById.get('36614000'))], []);
  assert.deepEqual([...context.enemyRowDisplayLocations(state.enemyRowsById.get('44800100'))], ['沼泽']);
  assert.equal(entity('44800200').key,entity('44800100').key);
  assert.equal(context.enemyRateView(entity('44800200'),state.enemyRowsById.get('44800200')).locations,'大教堂（大空洞）');
  assert.notEqual(entity('70000000').key, entity('70000110').key);
  assert.equal(entity('34715200').key, entity('34715310a').key);
  assert.equal(entity('34715000').key, entity('34715310a').key);
  assert.notEqual(String(entity('34715000').statGroups[0].anchor.row[1]), '34715000');
  assert.equal(entity('21400000').key, entity('21400210').key);
  assert.notEqual(entity('40000010').key, entity('40000110').key);
  assert.equal(entity('40000010').key, entity('40001010').key);
  assert.notEqual(entity('42100110').key, entity('42101010').key);
  assert.equal(entity('42101010').key, entity('42101110').key);
  assert.equal(entity('43530020').key, entity('43531210a').key);
  assert.equal(state.enemyRowsById.has('21500100'), false);
  for (const id of ['39703110', '37000030', '30000120', '30801020', '43730020', '43732020', '43736020', '43132020']) {
    assert.deepEqual([...context.enemySourceNote(state.enemyRowsById.get(id)).locations], ['夜晚Boss前哨战']);
  }
  assert.ok(!context.enemyLocationDifferences(immune).has(13));
});

test('slug forms keep their own names, fire multipliers and placed NPC locations', () => {
  const { context, state, $ } = createAtlas();
  const sources = [['40401010', '火蛞蝓', 0, '火山口'], ['40400030', '蛞蝓', 1.2, '东部地下要塞（大空洞）']];
  for (const [id, name, multiplier, area] of sources) {
    const row = state.enemyRowsById.get(id);
    assert.equal(context.enemyDamageMultiplier(row[10]), multiplier);
    $('#enemy-search').value = '蛞蝓';
    $('#enemy-area').value = area;
    context.filterEnemies();
    assert.deepEqual(Array.from(state.enemyGroups, group => group.name), [name]);
    assert.ok(state.enemyFiltered.some(record => record.row === row));
  }
});

test('a missing value and numeric zero do not imply two known location values', () => {
  const { context, state } = createAtlas();
  const row = state.enemyRowsById.get('51900010');
  const withValue = value => Object.assign([...row], {24: value});
  const byPoise = values => context.enemyLocationDifferences({
    statGroups: [{records: values.map(value => ({row: withValue(value)}))}],
  }).has(24);
  assert.equal(byPoise([null, 0, '']), false);
  assert.equal(byPoise([null, 0, 10]), true);
});

test('Chinese composition leaves results and URL unchanged until the word is committed', () => {
  const { context, state, $, history } = createAtlas();
  const input = $('#enemy-search'), initialUpdates = history.updates;
  const initialResults = state.enemyGroups;
  input.events.compositionstart();
  input.value = 'bai'; input.events.input({ isComposing: true });
  input.value = '白金之子'; input.events.input({ isComposing: false });
  assert.equal(state.enemyGroups, initialResults);
  assert.equal(history.updates, initialUpdates);
  input.events.compositionend();
  assert.equal(history.updates, initialUpdates + 1);
  assert.ok(state.enemyGroups.length > 0);
  assert.ok(state.enemyGroups.every(group => group.name.includes('白金之子')));
  input.events.input({ isComposing: false });
  assert.equal(history.updates, initialUpdates + 1, 'the final input event does not filter twice');
  input.value = ''; input.events.input({});
  assert.ok(state.enemyGroups.length > 1);
  context.computeEnemyMetadata = () => assert.fail('search recomputes metadata');
  context.enemySearchText = () => assert.fail('search recomputes normalized fields');
  for (const query of ['夜王', 'Boss', '34700310a', '祖灵']) {
    input.value = query; input.events.input({});
    assert.ok(state.enemyGroups.length > 0, query);
  }
});

test('deleted IDs and index-only URLs cannot select an unrelated card', () => {
  const { context, state, $, location } = createAtlas();
  for (const id of ['21500400', 'encounter-904480312', '46001000', '46008000', '46003000']) {
    assert.ok(!state.enemyData.rows.some(row => String(row[1]) === id));
    const remaining = state.enemyData.rows.filter(row => String(row[1]) !== id);
    assert.equal(context.resolveEnemyUrlMatch(remaining.map((row, index) => ({ row, index })), remaining, 0, id), null);
  }
  assert.equal(context.resolveEnemyUrlMatch(state.enemyFiltered, state.enemyData.rows, 0, ''), null);
  $('#enemy-area').options = [{ value: 'all' }];
  location.href = 'http://localhost/?enemyId=removed-record&enemyRecordIndex=0#enemies';
  state.enemySelected = state.enemyData.rows[0];
  context.restoreEnemyUrlState(); context.filterEnemies(false);
  assert.equal(state.enemySelected, null);
  assert.ok(!new URL(location.href).searchParams.has('enemyId'));
});

test('an existing ID restores the card with a stale index, page, and previous/next navigation', () => {
  const { context, state, $, location } = createAtlas();
  const row = state.enemyData.rows.find(row => String(row[1]) === '44700010a');
  $('#enemy-area').options = [{ value: 'all' }];
  location.href = 'http://localhost/?enemyId=44700010a&enemyRecordIndex=0&enemyType=boss#enemies';
  context.restoreEnemyUrlState(); context.filterEnemies(false);
  assert.equal(state.enemySelected, row);
  assert.equal(state.enemyPage, Math.floor(context.enemyDetailGroupIndex() / state.enemyPageSize) + 1);
  assert.ok(!new URL(location.href).searchParams.has('enemyType'));
  const step = context.enemyDetailGroupIndex() > 0 ? -1 : 1;
  context.navigateEnemyDetail(step); context.navigateEnemyDetail(-step);
  assert.equal(context.enemyEntityKey(state.enemySelected), context.enemyEntityKey(row));
  const boundary = state.enemyGroups[state.enemyPageSize - 1].statGroups[0].anchor.row;
  state.enemySelected = boundary;
  context.navigateEnemyDetail(1);
  assert.equal(state.enemyPage, 2);
  context.navigateEnemyDetail(-1);
  assert.equal(state.enemyPage, 1);
  $('#enemy-search').value = '白金之子'; $('#enemy-area').value = '沼泽'; context.filterEnemies();
  assert.ok(state.enemyGroups.length > 0);
  assert.ok(state.enemyGroups.every(group => group.locations.includes('沼泽')));
  $('#enemy-search').value = '没有这名敌人'; context.filterEnemies();
  assert.equal(state.enemyGroups.length, 0);
  assert.equal(state.enemyPage, 1);
});

test('legacy encounter data does not create member-only cards, and rebuilding invalidates search fields', () => {
  const { context, state, $ } = createAtlas();
  const rowCount = state.enemyData.rows.length;
  state.enemyData.encounters = [{ id: 'encounter-999999', name: '旧遭遇', members: [{ enemyId: '44700010a' }] }];
  context.buildEnemyMetadata(); context.buildEnemyDisplayIndex();
  assert.equal(state.enemyData.rows.length, rowCount);
  assert.ok(![...state.enemyEntities.keys()].some(key => key.startsWith('encounter:')));
  const row = state.enemyData.rows.find(row => String(row[1]) === '44700010a');
  state.enemyData.displayLocationsBySourceId[String(row[1])] = ['测试新地点'];
  context.buildEnemyMetadata(); context.buildEnemyDisplayIndex(); context.setupEnemyFilters();
  $('#enemy-search').value = '测试新地点'; $('#enemy-area').value = 'all'; context.filterEnemies();
  assert.ok(state.enemyGroups.some(group => group.key === context.enemyEntityKey(row)));
  assert.ok(!$('#enemy-detail').innerHTML.includes('enemy-encounter-members'));
});

test('legacy nightlord links select the original form on its shared card', () => {
  const { context, state, $, location } = createAtlas();
  const normal = state.enemyData.rows.find(row => String(row[1]) === '75100020');
  const everdark = state.enemyData.rows.find(row => String(row[1]) === '75110010');
  assert.equal(context.enemyEntityKey(normal), context.enemyEntityKey(everdark));
  assert.equal(context.enemyDisplayName(everdark), '“黑夜之爵”艾德雷');
  assert.equal(context.enemyCategoryLabel(everdark), '夜王');
  $('#enemy-area').options = [{ value: 'all' }, { value: '夜王' }];
  for (const alias of ['第三夜Boss', '永夜Boss', '夜王']) {
    location.href = `http://localhost/?enemyArea=${encodeURIComponent(alias)}&enemyId=75110010#enemies`;
    context.restoreEnemyUrlState(); context.filterEnemies(false);
    assert.equal($('#enemy-area').value, '夜王');
    assert.equal(new URL(location.href).searchParams.get('enemyArea'), '夜王');
    assert.equal(state.enemySelected, everdark);
    assert.equal(state.enemyGroups.filter(group => group.key === context.enemyEntityKey(normal)).length, 1);
    assert.ok($('#enemy-detail').innerHTML.includes('data-enemy-id="75110010"'));
  }
  state.enemyData.scale.rows = state.enemyData.scale.rows.map(row => row[1] === '第三夜Boss' || row[1] === '永夜Boss' ? [row[0], '夜王', ...row.slice(2)] : row);
  context.buildEnemyMetadata(); context.buildEnemyDisplayIndex();
  assert.equal(context.enemyEntityKey(normal), context.enemyEntityKey(everdark));
  assert.equal(context.enemyCategoryLabel(everdark), '夜王');
});

test('legacy evergaol link restores the shared location and original enemy', () => {
  const { context, state, $, location } = createAtlas();
  $('#enemy-area').options = [{ value: 'all' }, { value: '封印监牢' }];
  location.href = 'http://localhost/?enemyArea=古代封印监牢&enemyId=49801030#enemies';
  context.restoreEnemyUrlState();
  context.filterEnemies(false);
  assert.equal($('#enemy-area').value, '封印监牢');
  assert.equal(new URL(location.href).searchParams.get('enemyArea'), '封印监牢');
  assert.equal(String(state.enemySelected[1]), '49801030');
});

test('nightlord grouping preserves clone and phase searches and every calculator target', () => {
  const { context, state, $ } = createAtlas();
  const {targets} = JSON.parse(fs.readFileSync(new URL('../public/damage-targets.json', import.meta.url)));
  context.window.NightreignDamageEnemyPicker.open(targets, '75003210');
  const entity = state.enemyEntities.get(context.enemyEntityKey(state.enemySelected));
  assert.equal(entity.name, '“黑夜野兽”格拉狄乌斯');
  assert.equal(entity.records.length, 6);
  for (const {row} of entity.records) {
    context.renderEnemyDetail(row);
    assert.ok($('#enemy-detail').innerHTML.includes(`data-damage-target-pick="${row[1]}"`));
    assert.ok(!$('#enemy-detail').innerHTML.includes('data-damage-target-record'));
  }
  context.renderEnemyDetail(state.enemySelected);
  assert.ok($('#enemy-detail').innerHTML.includes('data-damage-target-pick="75003210"'));
  context.window.NightreignDamageEnemyPicker.close();
  for (const [query, name] of [['分身','“黑夜野兽”格拉狄乌斯'], ['75300120','“坚盾”弗堤士']]) {
    $('#enemy-area').value = '夜王';
    $('#enemy-search').value = query;
    context.filterEnemies();
    assert.deepEqual(Array.from(state.enemyGroups, group => group.name), [name]);
  }
  const normal = state.enemyRowsById.get('75100020'), everdark = state.enemyRowsById.get('75110010');
  everdark[13] += 1;
  context.buildEnemyDisplayIndex();
  assert.equal(context.enemyEntityKey(normal), context.enemyEntityKey(everdark));
  for (let i = 5; i < 13; i++) {
    everdark[i] += 1;
    context.buildEnemyDisplayIndex();
    assert.notEqual(context.enemyEntityKey(normal), context.enemyEntityKey(everdark));
    everdark[i] = normal[i];
  }
  normal[5] = everdark[5] = null;
  context.buildEnemyDisplayIndex();
  assert.notEqual(context.enemyEntityKey(normal), context.enemyEntityKey(everdark));
});

test('expedition health bars use phase-specific rates and omit retired encounters', () => {
  const { context, state, $ } = createAtlas();
  const { targets } = JSON.parse(fs.readFileSync(new URL('../public/damage-targets.json', import.meta.url)));
  const phases = [
    ['76100010', '反叛的史柴格斯', [1, 1.1, 1, 1.1, 1, 1.2, .9, 1.25]],
    ['76100010-phase2', '冲动的史柴格斯', [.95, 1.045, .95, 1.045, .95, 1.092, .855, 1.15]],
  ];
  $('#enemy-search').value = '史柴格斯';
  $('#enemy-area').value = '夜王';
  context.filterEnemies();
  assert.equal(state.enemyGroups.filter(group => group.key.startsWith('nightlord:')).length, 2);
  assert.equal(state.enemyGroups.filter(group => group.name.includes('召唤')).length, 3);
  for (const [id, name, rates] of phases) {
    const row = state.enemyRowsById.get(id), target = targets.find(t => t.id === id);
    assert.ok(context.enemyDisplayName(row).startsWith(name));
    assert.equal(target.source.npcParamId, '76100010');
    assert.deepEqual(Object.values(target.taken), rates);
    assert.deepEqual(rates.map((_, i) => context.enemyMetricDisplay(row, 5 + i)), rates.map(rate => '×' + rate));
    context.window.NightreignDamageEnemyPicker.open(targets, id);
    assert.ok($('#enemy-detail').innerHTML.includes(`data-damage-target-pick="${id}"`));
    context.window.NightreignDamageEnemyPicker.close();
  }
  for (const id of ['76100020', '49000040', '75600110']) {
    assert.ok(!state.enemyRowsById.has(id));
    assert.ok(!targets.some(t => t.id === id));
  }

});

test('Animus shows its own portrait in both encounters and in the calculator', () => {
  const {context, state} = createAtlas();
  state.enemyImageManifest = JSON.parse(fs.readFileSync(new URL('../public/enemy-image-verified.json', import.meta.url)));
  state.enemyImageCandidates = JSON.parse(fs.readFileSync(new URL('../public/enemy-image-candidates.json', import.meta.url))).images;
  const {targets} = JSON.parse(fs.readFileSync(new URL('../public/damage-targets.json', import.meta.url)));
  for (const id of ['75210000','75210010']) {
    const path = 'enemy-images/candidate-eldenpedia-44cef6129c675aa3.png';
    assert.equal(context.enemyPortraitPath(id).path, path);
    assert.equal(context.window.NightreignDamageEnemyPicker.portrait(targets.find(t => t.id === id)), './'+path);
  }
  assert.equal(context.enemyPortraitPath('75200000').path, 'enemy-images/nightboss-41822.png');
  assert.equal(context.enemyPortraitPath('75200120').path, 'enemy-images/nightboss-41842.png');
});

test('Harmonia aliases, shared member card, worm target and expedition portraits', () => {
  const { context, state, $ } = createAtlas();
  const { targets } = JSON.parse(fs.readFileSync(new URL('../public/damage-targets.json', import.meta.url)));
  state.enemyImageManifest = JSON.parse(fs.readFileSync(new URL('../public/enemy-image-verified.json', import.meta.url)));
  $('#enemy-area').value = '夜王';
  for (const alias of ['七仙女', '安定者', '哈尔莫妮亚']) {
    $('#enemy-search').value = alias;
    context.filterEnemies();
    assert.equal(state.enemyGroups.length, 2);
    assert.equal(state.enemyGroups[0].records.length, 21);
    assert.equal(state.enemyGroups[1].records.length, 1);
  }
  const members = state.enemyGroups[0].records;
  for (const { row } of members) {
    const id = String(row[1]);
    assert.deepEqual(Array.from(row.slice(38,42)), Array(4).fill('No'));
    const target = targets.find(t => t.id === id);
    assert.deepEqual(Object.values(target.taken), [1,.92,1.1,1,1,.92,.9,.7]);
    context.renderEnemyDetail(row);
    assert.ok($('#enemy-detail').innerHTML.includes('nightboss-41828.png'));
    assert.ok(!$('#enemy-detail').innerHTML.includes('data-enemy-form='));
    assert.equal(context.window.NightreignDamageEnemyPicker.cardName(target), state.enemyGroups[0].name);
    assert.ok(context.window.NightreignDamageEnemyPicker.portrait(target).endsWith('41828.png'));
  }
  for (const id of ['76100010','76100010-phase2']) {
    assert.ok(context.enemyPortraitPath(id).path.endsWith('41829.png'));
  }
  const worm = targets.find(t => t.id === '46410010');
  assert.deepEqual(Object.values(worm.taken), [1.12,1.232,1.12,1.232,1.12,1.12,1.12,.672]);
  assert.ok(context.enemyPortraitPath(worm.id).path.endsWith('41848.png'));
  for (const id of ['21500600','21500610','21500620']) assert.ok(!targets.some(t => t.id === id));
});

test('removed areas cannot return through old source or entity fallbacks', () => {
  const { context, state, $, location } = createAtlas();
  const row = state.enemyData.rows.find(row => String(row[1]) === '44700010a');
  const id = String(row[1]);
  delete state.enemyData.displayLocationsBySourceId;
  delete state.enemyData.statLocationsBySourceId;
  state.enemyData.extraLocations = { [id]: ['教堂', '小型营地（大空洞）', '魔法师塔'] };
  state.enemyData.entityLocationsBySourceId = { [id]: ['小型营地', '教堂（大空洞）', '宁姆韦德', '大空洞'] };
  context.buildEnemyMetadata(); context.buildEnemyDisplayIndex(); context.setupEnemyFilters();
  assert.ok(!$('#enemy-area').innerHTML.includes('>大空洞<'));
  assert.ok(!context.enemyDisplayLocations(row).includes('大空洞'));
  assert.ok(!$('#enemy-area').innerHTML.includes('>教堂<'));
  assert.ok(!$('#enemy-area').innerHTML.includes('小型营地'));
  assert.ok(!$('#enemy-area').innerHTML.includes('魔法师塔'));
  assert.ok(!context.enemySourceNote(row).locations.some(area => /^(教堂|小型营地)/.test(area)));
  assert.ok(!context.enemyDisplayLocations(row).some(area => /^(教堂|小型营地)/.test(area)));
  assert.deepEqual(Array.from(context.displayEnemyLocations(['教堂', '小型营地', '教堂（大空洞）', '大教堂', '大教堂（大空洞）'])), ['大教堂', '大教堂（大空洞）']);
  $('#enemy-area').options = [{ value: 'all' }];
  for (const area of ['教堂', '小型营地', '大空洞']) {
    location.href = `http://localhost/?enemyArea=${encodeURIComponent(area)}&enemyId=44700010a#enemies`;
    context.restoreEnemyUrlState(); context.filterEnemies(false);
    assert.equal($('#enemy-area').value, 'all');
    assert.ok(!new URL(location.href).searchParams.has('enemyArea'));
    assert.equal(state.enemySelected, row);
  }
});

test('target picker binds disaster forms and duplicate source IDs to their catalogue rows', () => {
  const { context, state } = createAtlas();
  const { targets } = JSON.parse(fs.readFileSync(new URL('../public/damage-targets.json', import.meta.url)));
  const picker = context.window.NightreignDamageEnemyPicker;
  for (const id of ['44700010b', '37010030#row1116']) {
    picker.open(targets, id);
    const entity = state.enemyEntities.get(context.enemyEntityKey(state.enemySelected));
    assert.equal(picker.cardName(targets.find(t => t.id === id)), entity.name);
    assert.equal(context.damageTargetForRow(state.enemySelected).id, id);
    assert.ok(context.damageEnemyPickerMarkup(state.enemySelected).includes(`data-damage-target-pick="${id}"`));
  }
  picker.open(targets.filter(t => t.id !== '44700010b'), '44700010a');
  assert.equal(context.damageTargetForRow(state.enemyData.rows[1]), null);
  picker.close();
  assert.equal(context.damageEnemyPickerMarkup(state.enemySelected), '');
});

test('fort filtering separates verified stat profiles and opens their own record', () => {
  const { context, state, $ } = createAtlas();
  $('#enemy-area').value = '小型要塞';
  context.filterEnemies();
  const records = state.enemyFiltered;
  const ids = new Set(records.map(item => String(item.row[1])));
  assert.equal(ids.size, 48);
  assert.equal(state.enemyGroups.length, 11);
  assert.deepEqual([...ids].sort(), [...state.enemyData.fortVariantSources].sort());
  for (const id of ['40400020a','40900010b','43714020a']) assert.ok(ids.has(id));
  for (const id of ['43510000','37024010b','37020000']) assert.ok(!ids.has(id));
  for (const group of state.enemyGroups) {
    const sources = [...group.records, ...group.pairedDisaster].filter(({row}) => ids.has(String(row[1])));
    assert.equal(new Set(sources.map(({row}) => JSON.stringify(row.slice(5, 13)))).size, 1);
    assert.ok(group.locations.includes('小型要塞'));
  }
  const group = id => state.enemyEntities.get(records.find(item => String(item.row[1]) === id).key);
  assert.equal(group('43510020a'), group('43510020b'));
  assert.equal(group('43714020a'), group('43710010b'));
  assert.equal(group('43714020a').name, '普通士兵');
  assert.equal(group('43710010a'), group('43716010a'));
  const mageLocations = state.enemyData.displayLocationsBySourceId['37020020a'];
  assert.ok(mageLocations.includes('遗迹') && mageLocations.includes('西部地下要塞（大空洞）'));
  assert.ok(state.enemyData.displayLocationsBySourceId['44900010a'].includes('要塞'));
  assert.equal(group('33500020a').statGroups[0].anchor.row[6], 35);
  assert.equal(group('33500020a').statGroups[0].anchor.row[7], 10);
});

test('cracked Crystalians share one card across locations, weapons and source IDs', () => {
  const { context, state, $ } = createAtlas();
  const ids = ['33500020a', '33500020b', '33500010', '33501010', '33501040', '33502010'];
  for (const query of ['结晶人', '结晶人 - 法杖', '结晶人 - 圆刃刀', '结晶人 - 矛', ...ids]) {
    $('#enemy-search').value = query;
    context.filterEnemies();
    assert.deepEqual(Array.from(state.enemyGroups, group => group.name), ['结晶人']);
    const card = state.enemyGroups[0];
    assert.deepEqual(new Set(card.locations), new Set(['封印监牢', '小型要塞']));
    const sources = [...card.records, ...card.pairedDisaster].map(record => record.row);
    assert.deepEqual(sources.map(row => String(row[1])).sort(), [...ids].sort());
    for (const row of sources) assert.deepEqual(row.slice(5, 13), [10, 35, 10, 35, 40, 40, 40, 40]);
  }
  for (const name of ['凯丹佣兵 - 马', '闪电光球', '凯丹佣兵']) {
    $('#enemy-search').value = name;
    context.filterEnemies();
    assert.equal(state.enemyGroups.length, name === '凯丹佣兵' ? 1 : 0);
  }
});

test('golem weapons have separate atlas cards, locations and calculator selections', () => {
  const { context, state, $ } = createAtlas();
  const targets = JSON.parse(fs.readFileSync(new URL('../public/damage-targets.json', import.meta.url))).targets;
  $('#enemy-search').value = '魔像守卫';
  context.filterEnemies();
  assert.deepEqual(new Set(state.enemyGroups.map(group => group.name)), new Set(['魔像守卫-大弓', '魔像守卫-戟']));
  for (const [area, name, npc, poise] of [
    ['大教堂', '魔像守卫-戟', '46600030', 120],
    ['小型要塞', '魔像守卫-大弓', '46601010', 90],
  ]) {
    $('#enemy-area').value = area;
    context.filterEnemies();
    assert.equal(state.enemyGroups.length, 1);
    const [card] = state.enemyGroups;
    assert.equal(card.name, name);
    assert.deepEqual([...card.locations], [area]);
    const {row} = context.enemyListRecord(card);
    assert.equal(row[24], poise);
    assert.equal(String(row[1]), npc + 'a');
    for (const suffix of ['a','b']) {
      const target = targets.find(t => t.id === npc + suffix);
      assert.equal(context.window.NightreignDamageEnemyPicker.cardName(target), name);
      assert.deepEqual(target.source.locations, [area]);
    }
  }
});

test('giant rats display 84 sleep resistance across sources and omit the location difference', () => {
  const { context, state, $ } = createAtlas();
  const swamp = state.enemyRowsById.get('40900310');
  const card = state.enemyEntities.get(context.enemyEntityKey(swamp));
  assert.equal(swamp[17], 'Immune');
  for (const {row} of [...card.records, ...card.pairedDisaster]) {
    assert.equal(context.enemyMetricDisplay(row, 17), '84');
  }
  assert.equal(context.enemyMetricDisplay(state.enemyRowsById.get('46600030a'), 17), '免疫');
  assert.ok(!context.enemyLocationDifferences(card).has(17));
  $('#enemy-area').value = '沼泽';
  context.renderEnemyDetail(swamp);
  assert.match($('#enemy-detail').innerHTML, /催眠<\/span><strong>84<\/strong>/);
});

test('verified swamp immunities follow the card and appear next to poise in the core section', () => {
  const {context, state, $} = createAtlas();
  for (const [id, note] of [['38000030','腐败沼泽免疫腐败'], ['40900010a','催眠沼泽免疫催眠']]) {
    context.renderEnemyDetail(state.enemyRowsById.get(id));
    const html = $('#enemy-detail').innerHTML;
    assert.match(html, /韧性值<\/span><strong>[^<]+<\/strong><\/div><aside[^>]+地点备注/);
    assert.ok(html.includes(note));
    assert.doesNotMatch(html, /地点与记录差异|data-enemy-difference-open/);
  }
  context.renderEnemyDetail(state.enemyRowsById.get('37022010a'));
  assert.doesNotMatch($('#enemy-detail').innerHTML, /地点备注/);
});

test('a noted immunity only removes its own source and status from differences', () => {
  const {context, state} = createAtlas();
  const swamp = state.enemyRowsById.get('38000010');
  const cathedral = state.enemyRowsById.get('38000030');
  const other = [...state.enemyRowsById.get('38000050')];
  other[14] = 350;
  other[15] = 200;
  const differences = context.enemyLocationDifferences({statGroups:[{records:[swamp, cathedral, other].map(row => ({row}))}]});
  assert.ok(!differences.get(14).has('沼泽'));
  assert.deepEqual([...differences.get(14).get('东部地下要塞（大空洞）')], ['350']);
  assert.ok(differences.get(15).has('沼泽'));
});

test('all monster details omit attribute poise damage while retaining core poise', () => {
  const { context, state, $ } = createAtlas();
  for (const card of state.enemyEntities.values()) {
    assert.ok([...context.enemyLocationDifferences(card).keys()].every(index => index < 42));
    if (!card.statGroups.length) continue;
    context.renderEnemyDetail(card.statGroups[0].anchor.row);
    const html = $('#enemy-detail').innerHTML;
    assert.doesNotMatch(html, /属性削韧|削韧[·．]/);
    assert.doesNotMatch(html, /韧性回复时间/);
    assert.match(html, /韧性值/);
  }
});

test('fort sources share one ordinary representative and one reviewed portrait per eight-rate profile', () => {
  const { context, state, $ } = createAtlas();
  $('#enemy-area').value = '小型要塞';
  context.filterEnemies();
  const portraits = state.enemyData.smallFortRepresentatives;
  assert.equal(Object.keys(portraits).length, 11);
  for (const group of state.enemyGroups) {
    const {row} = group.representative;
    const id = String(row[1]);
    assert.ok(state.enemyData.fortVariantSources.includes(id));
    assert.equal(context.enemyListRecord(group).row, row);
    const path = portraits[id];
    if (path) {
      assert.match(path, /^enemy-images\/[\w-]+\.(?:jpe?g|png|webp)$/i);
      if (id === '40400020a') {
        assert.equal(path, 'enemy-images/fort-40400020.png');
        assert.equal(group.representative.imageKind, 'game-model-render');
      } else assert.doesNotMatch(path, /fort-/);
      assert.ok(fs.existsSync(new URL('../public/' + path, import.meta.url)));
    }
    for (const {row: source} of [...group.records,...group.pairedDisaster]) {
      if (!state.enemyData.fortVariantSources.includes(String(source[1]))) continue;
      assert.deepEqual(source.slice(5,13),row.slice(5,13));
      assert.equal(context.enemyPortraitPath(source[1])?.path ?? null, path);
      context.renderEnemyDetail(source);
      const html = $('#enemy-detail').innerHTML;
      assert.ok(html.includes('data-enemy-id="' + source[1] + '"'));
      assert.ok(html.includes(path || 'image-pending.svg'));
      assert.ok(!html.includes('data-enemy-form='));
      assert.equal(html.includes('查看模型大图'), id === '40400020a');
      const selectedLocations = context.enemyRateView(group,source)?.locations || context.enemyLocationSummary(group);
      assert.ok(html.includes(selectedLocations));
      if (group.name === '普通士兵') {
        assert.ok(selectedLocations.includes('小型要塞'));
        assert.ok(!selectedLocations.includes('东部地下要塞（大空洞）'));
      }
    }
  }
  const form = id => state.enemyAppearanceById.get(id);
  assert.deepEqual([...form('44700010a').locations], ['小型要塞']);
  assert.deepEqual([...form('44702010').locations], ['大教堂（大空洞）']);
  assert.deepEqual([...form('40900310').locations], ['沼泽']);
  assert.ok(!form('40900010a').locations.includes('锻造村'));
  assert.equal(form('40400020a'), form('40400030'));
  assert.notEqual(form('40400020a'), form('40400010'));
});

test('ordinary cathedral filter matches rolled placements and uses one illustrated representative per damage type', () => {
  const { context, state, $ } = createAtlas();
  $('#enemy-area').value = '大教堂';
  context.filterEnemies();
  const expectedNpcs = [
    '36100020','36200010','40700010','40710010','46600030','41000010','41001010','41002010',
    '41010010','42000010','42000110','39000020','41610010','43810110','43811010','43150010',
    '43152010','43153010','43550020','43750010','43752010','43754010','43756010',
  ];
  const targets = JSON.parse(fs.readFileSync(new URL('../public/damage-targets.json', import.meta.url))).targets;
  const rows = [...state.enemyFiltered].map(({row}) => String(row[1]));
  assert.equal(rows.length, 43);
  assert.deepEqual(new Set(rows.map(id => id.replace(/[ab]$/, ''))), new Set(expectedNpcs));
  assert.deepEqual(new Set(targets.filter(t => t.source.locations.includes('大教堂')).map(t => t.id)), new Set(rows));
  assert.deepEqual(new Set(state.enemyData.cathedralSources), new Set(rows));
  assert.equal(state.enemyGroups.length, 12);
  for (const group of state.enemyGroups) {
    const record = context.enemyListRecord(group);
    assert.equal(context.enemyRegionalRepresentative(group,record.row[1]).row, record.row);
    assert.equal(group.representative.area, '大教堂');
    assert.ok(!String(record.row[1]).endsWith('b'));
    const {path} = context.enemyPortraitPath(record.row[1]);
    assert.ok(fs.existsSync(new URL('../public/' + path, import.meta.url)));
    for (const {row} of [...group.filteredRecords, ...group.filteredPairedDisaster]) {
      assert.deepEqual(row.slice(5,13).filter((_,i)=>i+5!==group.rateIndex), record.row.slice(5,13).filter((_,i)=>i+5!==group.rateIndex));
      const target = targets.find(t => t.id === String(row[1]));
      assert.equal(context.window.NightreignDamageEnemyPicker.cardName(target), group.name);
    }
  }
  const soldiers = state.enemyGroups.filter(g => g.name.startsWith('灵庙无头士兵'));
  assert.equal(soldiers.length,1);
  assert.deepEqual(new Set(soldiers[0].rateOptions.keys()), new Set([0,10]));
  assert.ok(state.enemyData.displayLocationsBySourceId['39000010'].includes('火山口'));
  assert.ok(!state.enemyData.displayLocationsBySourceId['36200015'].includes('大教堂'));
});

test('cathedral cross-region records keep the placed night waves, crater and city on the correct cards', () => {
  const { context, state, $ } = createAtlas();
  const cards = new Map(['43810110a','43550020a'].map(id => {
    const card = state.enemyEntities.get(context.enemyEntityKey(state.enemyRowsById.get(id)));
    return [card.name, card];
  }));
  const cultist = cards.get('罪恶荆棘信徒'), knight = cards.get('灵庙无头骑士');
  assert.deepEqual(new Set(cultist.locations), new Set(['火山口','大教堂','夜晚Boss前哨战']));
  assert.deepEqual(new Set(knight.locations), new Set(['大教堂','“隐城”诺克拉缇欧','夜晚Boss前哨战']));
  const targets = JSON.parse(fs.readFileSync(new URL('../public/damage-targets.json', import.meta.url))).targets;
  for (const [query, card, ids] of [
    ['恶魔王子',cultist,['43810020','43811020']], ['洞底恶魔',cultist,['43810120','43811020']],
    ['负伤恶魔',cultist,['43810120','43811020']], ['死骑士',knight,['43550040']],
  ]) {
    $('#enemy-search').value = query;
    $('#enemy-area').value = '夜晚Boss前哨战';
    context.filterEnemies();
    const group = state.enemyGroups.find(g => g.key === card.key);
    assert.deepEqual(new Set(group.filteredRecords.map(r => String(r.row[1]))), new Set(ids));
    for (const id of ids) {
      const t = targets.find(t => t.id === id);
      assert.deepEqual(t.source.locations, ['夜晚Boss前哨战']);
      assert.equal(context.window.NightreignDamageEnemyPicker.cardName(t), card.name);
    }
  }
  for (const id of ['43810010','43810110a','43811010a']) assert.ok(state.enemyData.displayLocationsBySourceId[id].includes('火山口'));
  assert.deepEqual(state.enemyData.displayLocationsBySourceId['43550030'], ['“隐城”诺克拉缇欧']);
});

test('mausoleum soldiers use only placed sources and their two eight-rate profiles', () => {
  const {context, state, $} = createAtlas();
  const waves = ['43150020','43152020'];
  const city = '“隐城”诺克拉缇欧';
  const targets = JSON.parse(fs.readFileSync(new URL('../public/damage-targets.json', import.meta.url))).targets;
  $('#enemy-search').value = '灵庙无头士兵';
  context.filterEnemies();
  assert.equal(state.enemyGroups.length, 1);
  const rows = state.enemyFiltered.map(({row}) => row);
  const placed = ['43150010','43150310','43152010','43153010',...waves,'43750010','43750510','43752010','43754010','43756010'];
  assert.deepEqual(new Set(rows.map(r => String(r[1]).replace(/[ab]$/,''))), new Set(placed));
  for (const row of rows) {
    const id = String(row[1]), heavy = id.startsWith('4315');
    assert.deepEqual(row.slice(5,13), [0,heavy ? 10 : 0,0,-10,0,0,-20,-20]);
    assert.ok(row.slice(13,20).every(v => v === 'Immune'));
    assert.equal(row[24],30);
    assert.equal(row[27],null);
    const card = state.enemyEntities.get(context.enemyEntityKey(row));
    assert.deepEqual(new Set(card.locations), new Set(['大教堂',city,'夜晚Boss前哨战']));
    const target = targets.find(t => t.id === id);
    assert.equal(context.window.NightreignDamageEnemyPicker.cardName(target), card.name);
    assert.deepEqual(target.source.locations, state.enemyData.displayLocationsBySourceId[id]);
    assert.ok(!target.name.includes('大型营地'));
  }
  $('#enemy-area').value = '夜晚Boss前哨战';
  context.filterEnemies();
  assert.deepEqual(new Set(state.enemyFiltered.map(({row}) => String(row[1]))), new Set(waves));
  $('#enemy-area').value = '大型营地';
  context.filterEnemies();
  assert.equal(state.enemyGroups.length,0);
});

test('Hollow cathedral groups the 51 published sources by complete rates and selects the regional portrait', () => {
  const {context,state,$} = createAtlas();
  const area = '大教堂（大空洞）';
  $('#enemy-area').value = area;
  context.filterEnemies();
  const portraits = state.enemyData.hollowCathedralRepresentatives;
  const sources = new Set(state.enemyFiltered.map(({row}) => String(row[1])));
  assert.equal(sources.size, 51);
  const magePhoto = state.enemyData.smallFortRepresentatives['37020020a'];
  assert.equal(magePhoto, 'enemy-images/37020020.jpg');
  assert.equal(portraits['37022010a'], magePhoto);
  assert.ok(!state.enemyData.modelPortraitSources.includes('37022010a'));
  assert.deepEqual(sources, new Set(state.enemyData.hollowCathedralSources));
  assert.equal(state.enemyGroups.length, 28);
  assert.ok(state.enemyGroups.every(group=>!group.name.includes(' · ')));
  const seen = new Set();
  const targets = JSON.parse(fs.readFileSync(new URL('../public/damage-targets.json', import.meta.url))).targets;
  for (const group of state.enemyGroups) {
    const {row} = context.enemyListRecord(group), id = String(row[1]);
    assert.ok(id in portraits);
    seen.add(id);
    for (const {row: other} of group.filteredRecords) {
      const rep=context.enemyRegionalRepresentative(group,other[1]);
      assert.deepEqual(other.slice(5,13),rep.row.slice(5,13));
      seen.add(String(rep.row[1]));
    }
    context.renderEnemyDetail(row);
    assert.ok($('#enemy-detail').innerHTML.includes(portraits[id]));
    const t = targets.find(t => t.id === id);
    assert.equal(context.window.NightreignDamageEnemyPicker.cardName(t), group.name);
  }
  assert.deepEqual(seen, new Set(Object.keys(portraits)));
  assert.deepEqual(new Set(targets.filter(t => t.source.locations.includes(area)).map(t => t.id)),sources);
  for (const id of ['30600020','33000010','33202010','42801100','44800020','44800200','44810020','71000010','49801010','76200110']) assert.ok(!sources.has(id));
  const row = id => state.enemyRowsById.get(id);
  state.enemyImageManifest = JSON.parse(fs.readFileSync(new URL('../public/enemy-image-verified.json', import.meta.url)));
  for (const [id, render] of [['35005510','35005510'], ['44800100','44800110']]) {
    assert.equal(context.enemyPortraitPath(id).path, `enemy-images/form-${render}.png`);
  }
  assert.equal(context.enemyRateView(state.enemyEntities.get(context.enemyEntityKey(row('42801110'))),row('42801110')), null);
  const imps = state.enemyData.rows.filter(r => r[0].startsWith('小恶魔'));
  assert.equal(imps.length, 24);
  assert.ok(imps.every(r => r[24] === 30));
  assert.ok(!state.enemyData.rows.some(r => r[0].startsWith('小米兰达花')));
  assert.equal(context.enemyEntityKey(row('33200220')),context.enemyEntityKey(row('33202220')));
  assert.equal(context.enemyEntityKey(row('35004040')),context.enemyEntityKey(row('35002040')));
  for(const [ids,labels] of [
    [['33201110','46000040'],['变身前','山妖形态']],
    [['53110010','53200010'],['普通','首领']],
    [['35004040','35005510'],['圣 ×1.4','圣 ×1']],
  ]){
    const card=state.enemyEntities.get(context.enemyEntityKey(row(ids[0])));
    for(const [i,id] of ids.entries()){
      assert.equal(context.enemyEntityKey(row(id)),card.key);
      const view=context.enemyRateView(card,row(id));
      assert.ok(view.controls.includes(`aria-pressed="true">${labels[i]}</button>`));
      assert.doesNotMatch(view.controls,/disabled/);
      assert.equal(view.locations.includes(area),id!=='35005510');
    }
  }
  assert.notEqual(context.enemyEntityKey(row('53120010')),context.enemyEntityKey(row('53200010')));
  assert.equal(context.enemyEntityKey(row('33001110')),context.enemyEntityKey(row('33001030')));
  const nox = state.enemyEntities.get(context.enemyEntityKey(row('33001030')));
  assert.equal(nox.name, '诺克斯剑士');
  assert.equal(context.enemyMetricDisplay(row('33001110'),6),'×1.1');
  assert.equal(context.window.NightreignDamageEnemyPicker.cardName(targets.find(t => t.id === '33001110')), nox.name);
  const expected = state.enemyData.smallFortRepresentatives['44700010a'];
  assert.equal(portraits['44702010'],expected);
  assert.ok(!state.enemyData.modelPortraitSources.includes('44702010'));
  assert.equal(context.enemyPortraitPath('44702010').path,expected);
  $('#enemy-area').value = '小型要塞';
  assert.equal(context.enemyPortraitPath('44702010').path,expected);
});

test('commoner differences compare located records and report the immune ruins encounter', () => {
  const {context,state,$} = createAtlas();
  const row = state.enemyRowsById.get('43002010');
  const entity = state.enemyEntities.get(context.enemyEntityKey(row));
  assert.equal(context.enemyLocationDifferences(entity).size,0);
  context.renderEnemyDetail(row);
  assert.match($('#enemy-detail').innerHTML,/卢恩熊遗迹免疫中毒、腐败、出血、冻伤、催眠/);
  assert.doesNotMatch($('#enemy-detail').innerHTML,/出现地点未收录|地点与记录差异/);
});

test('ruins and evergaol beastmen share rates and resistances, with poise tied to the placed actor', () => {
  const {context,state,$} = createAtlas();
  const {targets} = JSON.parse(fs.readFileSync(new URL('../public/damage-targets.json', import.meta.url)));
  const placed = {
    '遗迹': ['39700210','39700310','39702210','39701120'].flatMap(id => [id+'a',id+'b']),
    '封印监牢': ['39701110','39702310','39703010'],
  };
  for (const [area,ids] of Object.entries(placed)) {
    $('#enemy-area').value = area;
    $('#enemy-search').value = '法姆亚兹拉的兽人';
    context.filterEnemies();
    assert.equal(state.enemyGroups.length, 1);
    const representative = context.enemyListRecord(state.enemyGroups[0]).row;
    assert.equal(String(representative[1]), area === '遗迹' ? '39701120a' : '39701110');
    assert.equal(representative[24], 65);
    assert.deepEqual(new Set(state.enemyFiltered.map(({row}) => String(row[1]))),new Set(ids));
    const inArea = targets.filter(t => t.source.npcParamId.startsWith('3970') && t.source.locations.includes(area));
    assert.deepEqual(new Set(inArea.map(t => t.id)),new Set(ids));
    for (const target of inArea) {
      const row = state.enemyRowsById.get(target.id);
      assert.deepEqual(row.slice(5,13), [0,-10,0,0,0,-20,20,0]);
      assert.deepEqual(row.slice(13,20), [112,112,154,154,84,'Immune','Immune']);
      assert.equal(row[24], ['39701110','39701120'].includes(target.source.npcParamId) ? 65 : 30);
      assert.deepEqual(Object.values(target.taken), [1,1.1,1,1,1,1.2,0.8,1]);
    }
  }
});

test('evergaol filtering uses the placed combatants and one illustrated card per damage profile', () => {
  const { context, state, $ } = createAtlas();
  const { forms } = JSON.parse(fs.readFileSync(new URL('../scripts/data/enemy_evergaol.json', import.meta.url)));
  const { targets } = JSON.parse(fs.readFileSync(new URL('../public/damage-targets.json', import.meta.url)));
  const area = '封印监牢';
  $('#enemy-area').value = area;
  context.filterEnemies();
  const expected = new Set(forms.flatMap(form => form.sources));
  assert.equal(expected.size, 28);
  assert.equal(state.enemyGroups.length, 18);
  assert.deepEqual(new Set(state.enemyFiltered.map(({row}) => String(row[1]))), expected);
  assert.deepEqual(new Set(targets.filter(t => t.source.locations.includes(area)).map(t => t.id)), expected);
  for (const form of forms) {
    const group = state.enemyGroups.find(group => group.filteredRecords.some(({row}) => String(row[1]) === form.sources[0]));
    assert.deepEqual(new Set(group.filteredRecords.map(({row}) => String(row[1]))), new Set(form.sources));
    assert.equal(new Set(group.filteredRecords.map(({row}) => JSON.stringify(row.slice(5, 13)))).size, 1);
    const rep = context.enemyRegionalRepresentative(group);
    assert.equal(String(rep.row[1]), form.sources[0]);
    assert.equal(rep.path, form.path);
    assert.equal(rep.imageKind, form.imageKind || 'representative-photo');
  }
});

test('large camp matches only the rolled NPCs and presents one illustrated card per profile', () => {
  const {context, state, $} = createAtlas();
  const area = '大型营地';
  const {forms} = JSON.parse(fs.readFileSync(new URL('../scripts/data/enemy_large_camp.json', import.meta.url)));
  const {targets} = JSON.parse(fs.readFileSync(new URL('../public/damage-targets.json', import.meta.url)));
  $('#enemy-area').value = area;
  context.filterEnemies();
  const ids = new Set(state.enemyFiltered.map(({row}) => String(row[1])));
  const nativeId = id => id.replace(/[ab]$/, '');
  assert.equal(ids.size, 125);
  assert.equal(state.enemyGroups.length, 21);
  assert.deepEqual(new Set([...ids].map(nativeId)), new Set(forms.flatMap(form => form.npcIds)));
  assert.deepEqual(ids, new Set(targets.filter(t => t.source.locations.includes(area)).map(t => t.id)));
  for (const form of forms) {
    const source=state.enemyRowsById.get(form.representative);
    const group=state.enemyGroups.find(g=>g.key===context.enemyEntityKey(source));
    const rep=context.enemyRegionalRepresentative(group,form.representative);
    assert.equal(rep.path, form.path);
    const placed = [...group.filteredRecords, ...group.filteredPairedDisaster]
      .filter(({row})=>group.rateIndex==null || row[group.rateIndex]===source[group.rateIndex]);
    assert.deepEqual(new Set(placed.map(({row}) => nativeId(String(row[1])))), new Set(form.npcIds));
    assert.equal(new Set(placed.map(({row}) => JSON.stringify(row.slice(5,13)))).size, 1);
  }
  for (const id of ['30100270','30101250','30102240']) {
    const target = targets.find(t => t.id === id);
    assert.equal(target.taken.lightning, 1);
    assert.deepEqual(target.source.locations, [area]);
  }
  for (const id of ['30100100','43540010a','36615010b','44600000']) assert.ok(!ids.has(id));
});

test('giant crabs share the standard card, while sleep crabs retain their holy weakness', () => {
  const {context, state, $} = createAtlas();
  const card = id => state.enemyEntities.get(context.enemyEntityKey(state.enemyRowsById.get(id)));
  const regular = card('22700010');
  assert.equal(regular.name, '大螃蟹');
  assert.equal(regular.records.length, 10);
  assert.equal(card('22740010'),regular);
  assert.deepEqual(new Set(regular.locations), new Set(['夜晚Boss前哨战','大教堂（大空洞）','沼泽']));
  for (const {row} of regular.records) assert.deepEqual(row.slice(5,12), [35,35,0,35,20,20,20]);
  for (const query of ['骤死大螃蟹','普通大螃蟹','22761020']) {
    $('#enemy-search').value=query;
    context.filterEnemies();
    assert.deepEqual(Array.from(state.enemyGroups, g => g.name), ['大螃蟹']);
  }
  assert.equal(card('22740030'),regular);
  assert.equal(state.enemyRowsById.get('22740030')[12], -40);
  $('#enemy-area').value='大教堂（大空洞）';
  const sleep=context.enemyRateView(regular,state.enemyRowsById.get('22740030'));
  assert.match(sleep.controls,/<button[^>]*data-enemy-rate="\d+" aria-pressed="false">普通／骤死型<\/button>/);
  assert.match(sleep.controls,/aria-pressed="true">催眠型<\/button>/);
  assert.deepEqual(new Set(sleep.locations.split('、')),new Set(['大教堂（大空洞）','沼泽']));
  assert.equal(state.enemyRowsById.get('22740020')[17],'Immune');
  assert.equal(state.enemyRowsById.get('22740030')[17],84);
  assert.match(context.enemyImmunityNoteMarkup(regular,state.enemyRowsById.get('22740030')),/杜鹃骑士所在的沼泽免疫催眠/);
  assert.doesNotMatch(context.enemyImmunityNoteMarkup(regular,state.enemyRowsById.get('22700010')),/沼泽免疫催眠/);
  const ordinary=context.enemyRateView(regular,state.enemyRowsById.get('22700010'));
  assert.equal(ordinary.locations,'夜晚Boss前哨战');
  $('#enemy-area').value='all';
  context.setupEnemyFilters();
  assert.doesNotMatch($('#enemy-area').innerHTML, /地点未收录/);
  $('#enemy-search').value='36614000';
  context.filterEnemies();
  context.renderEnemyDetail(state.enemyRowsById.get('36614000'));
  assert.doesNotMatch($('#enemy-detail').innerHTML, /enemy-detail-locations|地点未收录/);
  assert.doesNotMatch($('#enemy-list').innerHTML, /<small>|地点未收录/);
});

test('each choice selects a complete damage profile and its matching calculator source', () => {
  const {context,state,$}=createAtlas();
  const targets=JSON.parse(fs.readFileSync(new URL('../public/damage-targets.json',import.meta.url))).targets;
  const picker=context.window.NightreignDamageEnemyPicker;
  picker.open(targets,'33200220');
  for(const group of state.enemyEntities.values()){
    if(!group.rateOptions)continue;
    const fixed=new Set();
    assert.ok(group.rateOptions.size>=2 && !group.key.startsWith('nightlord:'));
    for(const [value,entries] of group.rateOptions){
      const signature=entries[0].row.slice(5,13);
      for(const {row} of entries){
        assert.equal(row[group.rateIndex],value);
        assert.deepEqual(row.slice(5,13),signature);
        fixed.add(JSON.stringify(row.slice(5,13).filter((_,i)=>i+5!==group.rateIndex)));
      }
      const record=context.enemyRateRecord(group,entries);
      assert.ok(record);
      context.renderEnemyDetail(record.row);
      const detail=$('#enemy-detail').innerHTML;
      assert.match(detail,/class="enemy-form-options"/);
      assert.doesNotMatch(detail,/地点与记录差异|data-enemy-difference-open/);
      const target=context.damageTargetForRow(record.row);
      assert.equal(picker.cardName(target),group.name);
      const channel=['normal','slash','strike','thrust','magic','fire','lightning','holy'][group.rateIndex-5];
      assert.equal(target.taken[channel],context.enemyDamageMultiplier(value));
      assert.deepEqual(['normal','slash','strike','thrust','magic','fire','lightning','holy'].map(k=>target.taken[k]),signature.map(context.enemyDamageMultiplier));
    }
    if(!group.key.endsWith(':hollow-forms') && group.name!=='山妖') assert.equal(fixed.size,1);
  }
  const silver=state.enemyEntities.get(context.enemyEntityKey(state.enemyRowsById.get('33200220')));
  assert.equal(silver.name,'银色泪滴');
  assert.deepEqual(new Set(silver.rateOptions.keys()),new Set([0,-100]));
  $('#enemy-area').value='大教堂（大空洞）';
  for(const [rate,entries] of silver.rateOptions){
    const {row}=context.enemyRateRecord(silver,entries);
    context.renderEnemyDetail(row);
    const html=$('#enemy-detail').innerHTML;
    assert.match(html,/<h2>银色泪滴<\/h2><div class="enemy-form-options" role="group" aria-label="倍率切换">/);
    assert.doesNotMatch(html,/倍率备注/);
    assert.ok(html.includes(`aria-pressed="true">雷 ${context.enemyDamageText(rate)}</button>`));
    assert.ok(html.includes(`data-damage-target-pick="${row[1]}"`));
    assert.ok(context.enemyElementSummary(row).includes(`enemy-element-line ${rate===0?'damage-neutral':'damage-high'}`));
    assert.ok(!context.enemyLocationDifferences(silver).has(11));
  }
  $('#enemy-area').value='夜晚Boss前哨战';
  assert.ok(!context.enemyRateRecord(silver,silver.rateOptions.get(0)));
  assert.equal(context.damageTargetForRow(context.enemyRateRecord(silver,silver.rateOptions.get(-100)).row).taken.lightning,2);
});
