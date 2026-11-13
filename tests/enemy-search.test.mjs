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
  for (const id of ['21500400', 'encounter-904480312']) {
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

test('legacy nightlord area links use the new label without merging normal and everdark forms', () => {
  const { context, state, $, location } = createAtlas();
  const normal = state.enemyData.rows.find(row => String(row[1]) === '75100020');
  const everdark = state.enemyData.rows.find(row => String(row[1]) === '75110010');
  assert.notEqual(context.enemyEntityKey(normal), context.enemyEntityKey(everdark));
  assert.match(context.enemyDisplayName(everdark), /永夜/);
  assert.equal(context.enemyCategoryLabel(everdark), '夜王');
  $('#enemy-area').options = [{ value: 'all' }, { value: '夜王' }];
  for (const alias of ['第三夜Boss', '永夜Boss', '夜王']) {
    location.href = `http://localhost/?enemyArea=${encodeURIComponent(alias)}&enemyId=75110010#enemies`;
    context.restoreEnemyUrlState(); context.filterEnemies(false);
    assert.equal($('#enemy-area').value, '夜王');
    assert.equal(new URL(location.href).searchParams.get('enemyArea'), '夜王');
    assert.equal(state.enemySelected, everdark);
    assert.ok(state.enemyGroups.some(group => group.key === context.enemyEntityKey(normal)));
    assert.ok(state.enemyGroups.some(group => group.key === context.enemyEntityKey(everdark)));
  }
  state.enemyData.scale.rows = state.enemyData.scale.rows.map(row => row[1] === '第三夜Boss' || row[1] === '永夜Boss' ? [row[0], '夜王', ...row.slice(2)] : row);
  context.buildEnemyMetadata(); context.buildEnemyDisplayIndex();
  assert.notEqual(context.enemyEntityKey(normal), context.enemyEntityKey(everdark));
  assert.equal(context.enemyCategoryLabel(everdark), '夜王');
});

test('removed camp and church areas cannot return through old source or entity fallbacks', () => {
  const { context, state, $, location } = createAtlas();
  const row = state.enemyData.rows.find(row => String(row[1]) === '44700010a');
  const id = String(row[1]);
  delete state.enemyData.displayLocationsBySourceId;
  delete state.enemyData.statLocationsBySourceId;
  state.enemyData.extraLocations = { [id]: ['教堂', '小型营地（大空洞）', '魔法师塔'] };
  state.enemyData.entityLocationsBySourceId = { [id]: ['小型营地', '教堂（大空洞）', '宁姆韦德'] };
  context.buildEnemyMetadata(); context.buildEnemyDisplayIndex(); context.setupEnemyFilters();
  assert.ok(!$('#enemy-area').innerHTML.includes('>教堂<'));
  assert.ok(!$('#enemy-area').innerHTML.includes('小型营地'));
  assert.ok(!$('#enemy-area').innerHTML.includes('魔法师塔'));
  assert.ok(!context.enemySourceNote(row).locations.some(area => /^(教堂|小型营地)/.test(area)));
  assert.ok(!context.enemyDisplayLocations(row).some(area => /^(教堂|小型营地)/.test(area)));
  assert.deepEqual(Array.from(context.displayEnemyLocations(['教堂', '小型营地', '教堂（大空洞）', '大教堂', '大教堂（大空洞）'])), ['大教堂', '大教堂（大空洞）']);
  $('#enemy-area').options = [{ value: 'all' }];
  for (const area of ['教堂', '小型营地']) {
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
    assert.equal(context.damageTargetForRow(state.enemySelected).id, id);
    assert.ok(context.damageEnemyPickerMarkup(entity, state.enemySelected).includes(`value="${id}" selected`));
  }
  picker.open(targets.filter(t => t.id !== '44700010b'), '44700010a');
  assert.equal(context.damageTargetForRow(state.enemyData.rows[1]), null);
  picker.close();
  assert.equal(context.damageEnemyPickerMarkup({}, state.enemySelected), '');
});
