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

test('mine occurrences merge into ordinary cards while keeping source records and location filters', () => {
  const { context, state, $ } = createAtlas();
  const row = id => state.enemyData.rows.find(r => String(r[1]) === id);
  const ordinary = row('43400000'), mine = row('43401120');
  assert.deepEqual(mine.slice(2), ordinary.slice(2));
  assert.equal(context.enemyEntityKey(mine), context.enemyEntityKey(ordinary));
  const pumpkin = state.enemyEntities.get(context.enemyEntityKey(ordinary));
  assert.equal(pumpkin.name, '发狂南瓜头士兵 · 中毒 112');
  const stats = pumpkin.statGroups.find(group => group.records.some(r => r.row === mine));
  assert.ok(stats.records.some(r => r.row === ordinary));
  assert.ok(context.enemySourceNote(mine).locations.includes('矿洞'));
  assert.ok(!context.enemySourceNote(ordinary).locations.includes('矿洞'), 'do not change the original record occurrence');
  $('#enemy-area').value = '矿洞';
  context.filterEnemies();
  for (const id of ['43400000', '46000000', '43510000']) {
    const key = context.enemyEntityKey(row(id));
    assert.equal(state.enemyGroups.filter(group => group.key === key).length, 1);
    assert.ok(context.enemyDisplayLocations(row(id)).includes('矿洞'));
  }
  assert.ok(!state.enemyGroups.some(group => group.name.includes('(矿洞)')));
  assert.ok(!row('46000110') && !row('43511120'), 'merged occurrences do not recreate duplicate cards');
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
  assert.deepEqual([...blood.locations].sort(), ['遗迹', '遗迹（大空洞）'].sort());
  assert.notEqual(entity('36614000').key, entity('36610020').key);
  assert.deepEqual([...entity('36614000').locations], []);
  assert.deepEqual([...context.enemyDisplayLocations(state.enemyRowsById.get('36614000'))], ['出现地点未收录']);
  assert.deepEqual([...entity('44800100').locations], ['沼泽']);
  assert.deepEqual([...entity('44800200').locations], ['大教堂（大空洞）']);
  assert.notEqual(entity('70000000').key, entity('70000110').key);
  assert.notEqual(entity('34715200').key, entity('34715310a').key);
  assert.equal(entity('34715000').key, entity('34715310a').key);
  assert.notEqual(String(entity('34715000').statGroups[0].anchor.row[1]), '34715000');
  assert.notEqual(entity('21400000').key, entity('21400210').key);
  assert.equal(entity('40000010').key, entity('40000110').key);
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

test('expedition health bars use phase-specific rates and Nightlord recovery times', () => {
  const { context, state, $ } = createAtlas();
  const { targets } = JSON.parse(fs.readFileSync(new URL('../public/damage-targets.json', import.meta.url)));
  const phases = [
    ['76100010', '反叛的史柴格斯', [1, 1.1, 1, 1.1, 1, 1.2, .9, 1.25]],
    ['76100010-phase2', '冲动的史柴格斯', [.95, 1.045, .95, 1.045, .95, 1.092, .855, 1.15]],
  ];
  $('#enemy-search').value = '史柴格斯';
  $('#enemy-area').value = '夜王';
  context.filterEnemies();
  assert.equal(state.enemyGroups.length, 2);
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
  for (const [id, normal, everdark] of [['49000010', '12.308', '23.605'], ['75600020', '9.231', '6.154']]) {
    const entity = state.enemyEntities.get(context.enemyEntityKey(state.enemyRowsById.get(id)));
    const recovery = context.enemyLocationDifferences(entity).get(27);
    assert.deepEqual([...recovery.get('夜王（普通）')], [normal]);
    assert.deepEqual([...recovery.get('夜王（永夜）')], [everdark]);
    assert.equal(recovery.size, 2);
  }
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
  assert.equal(state.enemyGroups.length, 12);
  assert.deepEqual([...ids].sort(), [...state.enemyData.fortVariantSources].sort());
  for (const id of ['40400020a','40900010b','43714020a']) assert.ok(ids.has(id));
  for (const id of ['43510000','37024010b','37020000']) assert.ok(!ids.has(id));
  for (const group of state.enemyGroups) {
    const sources = [...group.records, ...group.pairedDisaster];
    assert.equal(new Set(sources.map(({row}) => JSON.stringify(row.slice(5, 20)))).size, 1);
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
  const ids = ['33500020a', '33500020b', '33500010', '33501010', '33502010'];
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

test('golem search and area filters keep both weapon cards and pair their disaster records', () => {
  const { context, state, $ } = createAtlas();
  $('#enemy-search').value = '魔像守卫';
  context.filterEnemies();
  assert.equal(state.enemyGroups.length, 2);
  for (const [area, name, npc, poise] of [
    ['大教堂', '魔像守卫－戟', '46600030', 120],
    ['小型要塞', '魔像守卫－大弓', '46601010', 90],
  ]) {
    $('#enemy-area').value = area;
    context.filterEnemies();
    assert.equal(state.enemyGroups.length, 1);
    const [card] = state.enemyGroups;
    assert.equal(card.name, name);
    assert.deepEqual([...card.locations], [area]);
    assert.equal(card.statGroups[0].anchor.row[24], poise);
    assert.deepEqual([...card.records, ...card.pairedDisaster].map(r => r.row[1]).sort(), [npc + 'a', npc + 'b']);
  }
});
