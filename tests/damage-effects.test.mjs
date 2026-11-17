import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {calculateDamage} from '../src/lib/damage-calculator.js';

const data = JSON.parse(readFileSync(new URL('../public/damage-effects.json', import.meta.url)));
const channels = ['physical', 'magic', 'fire', 'lightning', 'holy'];
const values = (physical = 0, magic = 0, fire = 0) => ({physical, magic, fire, lightning: 0, holy: 0});
const rule = id => {
  const found = data.effects.find(effect => effect.nativeEffectId === id);
  assert.ok(found, String(id));
  return found;
};
const buff = id => data.effects.filter(effect => effect.buffId === id);
const segment = (id, tags = [], rates = values(1)) => ({id, name: id, tags, rates, physicalType: 'neutral'});
// Synthetic defense fixture tests phase placement; it does not verify game damage.
const input = {
  panel: values(100, 100, 100),
  target: {defense: Object.fromEntries(channels.map(channel => [channel, 100])),
    taken: {...Object.fromEntries(channels.map(channel => [channel, 1])), neutral: 1}},
  allowReferenceDefense: true,
};
const calculate = (effects, tags = [], extra = {}) => calculateDamage({
  ...input, segments: [segment('hit', tags)], effects, ...extra,
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} vs ${expected}`);

test('native IDs, five-channel names and calculation references stay valid', () => {
  assert.equal(new Set(data.effects.map(effect => effect.id)).size, data.effects.length);
  for (const effect of data.effects) {
    assert.ok(Number.isFinite(effect.rate) && effect.rate > 0);
    assert.ok(effect.channels.every(channel => channels.includes(channel)));
    assert.ok(effect.source.includes(`SpEffectParam#${effect.spEffectId}`));
    assert.ok(effect.stackGroup && effect.stackRule);
  }
  const ids = new Set(data.effects.map(effect => effect.id));
  for (const relic of data.relics) assert.ok(relic.effectIds.every(id => ids.has(id)));
  const balancers = data.relics.find(relic => relic.id === 2070);
  assert.ok(balancers.effectIds.some(id => id.startsWith('relic:7006700:')));
  assert.ok(balancers.unmodelledEffectIds.includes(7006500));
  assert.ok(!data.relics.some(relic => relic.id === 30029));
});

test('official relics retain every named game item, portrait and ordered effect even without damage rules', () => {
  const catalog = JSON.parse(readFileSync(new URL('../public/relic_catalog_zh.json', import.meta.url))).items;
  const categories = new Set(['角色专属', '黑夜王', '永夜王', '特殊遗物']);
  const expected = Object.values(catalog).filter(item => categories.has(item.category));
  assert.deepEqual(data.relics.map(item => item.key).sort(), expected.map(item => item.key).sort());
  for (const relic of data.relics) {
    const entry = catalog[relic.key];
    assert.equal(relic.name, entry.name_zh);
    assert.equal(relic.image, entry.image);
    assert.equal(relic.category, entry.category);
    assert.ok(existsSync(new URL('../public/' + relic.image, import.meta.url)));
    assert.deepEqual(relic.rows.map(row => row.id), relic.nativeEffectIds);
    assert.ok(relic.rows.every(row => row.name.trim()));
  }
  const wills = data.relics.filter(item => item.name.includes('安定'));
  assert.deepEqual(wills.map(item => [item.id, item.rows[2].name]), [
    [2070, '持续恢复专注值'], [2071, '减伤率降低时，偶尔会让敌人攻击失效'],
  ]);
  assert.notEqual(wills[0].image, wills[1].image);
  assert.ok(data.relics.some(item => item.effectIds.length === 0 && item.unmodelledEffectIds.length > 0));
});

test('physical relic multipliers apply after defense without leaking to magic', () => {
  const effect = rule(7001400);
  assert.equal(effect.phase, 'final');
  assert.equal(effect.rate, 1.04);
  assert.deepEqual(effect.channels, ['physical']);
  const result = calculate([effect], [], {segments: [segment('mixed', [], values(1, 1))]});
  close(result.rows[0].channels.physical, 41.6);
  close(result.rows[0].channels.magic, 40);
  // Independent copies really multiply; the compatibility group is irrelevant here.
  close(calculate([effect, effect]).total, 40 * 1.04 ** 2);
});

test('bestial incantation bonus requires both casting domain and native hit category', () => {
  const effect = rule(7044400);
  close(calculate([effect], ['incantation', 'atkSubCategory:23']).total, 44.8);
  close(calculate([effect], ['incantation', 'atkSubCategory:21']).total, 40);
  close(calculate([effect], ['skill', 'atkSubCategory:23']).total, 40);
  close(calculate([effect], ['incantation']).total, 40);
  close(calculate([effect, effect], ['incantation', 'atkSubCategory:23']).total, 40 * 1.12 ** 2);
});

test('skill category bonus applies to its matching segment only', () => {
  const effect = rule(8350000);
  const segments = [segment('skill-part', ['weaponAttack', 'atkSubCategory:111']),
    segment('other-part', ['weaponAttack', 'skill'])];
  const result = calculate([effect], [], {segments});
  close(result.rows[0].total, 46);
  close(result.rows[1].total, 40);
});

test('charged and full-health bonuses require explicit condition toggles', () => {
  const charged = rule(8320100);
  assert.equal(charged.rate, 1.16); // Native 10350000, not the older +6% prose snapshot.
  assert.ok(charged.conditions.includes('已蓄力'));
  close(calculate([charged], ['weaponAttack', 'atkSubCategory:100']).total, 40);
  close(calculate([charged], ['weaponAttack', 'atkSubCategory:100'], {conditions: ['已蓄力']}).total, 46.4);
  close(calculate([charged], ['weaponAttack', 'atkSubCategory:111'], {conditions: ['已蓄力']}).total, 40);
  const full = rule(8670000);
  assert.deepEqual(full.conditions, ['满血']);
  close(calculate([full]).total, 40);
  close(calculate([full], [], {conditions: ['满血']}).total, 42.8);
});

test('same-level grease proc refreshes and distinct levels multiply within weapon scope', () => {
  const base = rule(7030900), higher = rule(6030900);
  const conditions = base.conditions;
  close(calculate([base, base], ['weaponAttack'], {conditions}).total, 44);
  close(calculate([base, higher], ['weaponAttack'], {conditions}).total, 40 * 1.1 * 1.17);
  close(calculate([base], ['incantation'], {conditions}).total, 40);
});

test('body-buff replacement removes the entire prior buff including its fire component', () => {
  const meat = buff('goods:1210'), flame = buff('magic:6050');
  assert.ok(meat.length && flame.length);
  const conditions = [...meat, ...flame].flatMap(effect => effect.conditions);
  const extra = {conditions, segments: [segment('split', [], values(1, 0, 1))]};
  close(calculate([...flame, ...meat], [], extra).total, 88);
  close(calculate([...meat, ...flame], [], extra).total, 96);
});

test('revenant companion damage bonus uses the shared character ID and explicit state', () => {
  const effect = rule(7220000);
  assert.deepEqual(effect.characterIds, ['6']);
  close(calculate([effect], [], {characterId: '6', conditions: effect.conditions}).total, 44);
  close(calculate([effect], [], {characterId: '1', conditions: effect.conditions}).total, 40);
  close(calculate([effect], [], {characterId: '6'}).total, 40);
});

test('verified Bullet recipient buffs keep their damage channels and missing references', () => {
  const vow = buff('magic:6600');
  assert.equal(vow.length, 1);
  assert.equal(vow[0].rate, 1.15);
  assert.equal(vow[0].spEffectId, 1660000);
  assert.equal(vow[0].exclusiveGroup, 'spCategory:160');
  assert.match(vow[0].source, /Bullet#10660000.spEffectId0/);
  assert.ok(vow[0].unresolvedReferences.some(reference => reference.includes('1660001')));
  close(calculate(vow).total, 40);
  close(calculate(vow, [], {conditions: vow[0].conditions}).total, 46);
  const aromatic = buff('goods:3500');
  assert.deepEqual(aromatic[0].channels, ['physical']);
  assert.equal(aromatic[0].rate, 1.1);
  const conditions = [...vow, ...aromatic].flatMap(effect => effect.conditions);
  const extra = {conditions, segments: [segment('split', ['weaponAttack'], values(1, 0, 1))]};
  // Uplifting Aromatic replaces Golden Vow's aura damage, not its own separate barrier slot.
  close(calculate([...vow, ...aromatic], [], extra).total, 84);
  close(calculate([...aromatic, ...vow], [], extra).total, 92);
});

test('unmodelled active-stack counts, flat conversions and missing Bullet definitions are not guessed', () => {
  for (const id of [7032700, 7120000, 7150000, 7031200, 7036300]) {
    assert.ok(!data.effects.some(effect => effect.nativeEffectId === id));
    assert.ok(data.unsupported.some(effect => effect.nativeEffectId === id));
  }
  assert.ok(!data.effects.some(effect => effect.spEffectId === 1660001));
  assert.ok(!data.effects.some(effect => effect.magicId === 6600 && effect.spEffectId === 7037001));
  assert.ok(data.unsupported.some(effect => effect.magicId === 6600 && effect.spEffectId === 1660001));
});


test('victory counts read exact native tiers and duplicate relics do not multiply', () => {
  const gaol = rule(7060000), invasion = rule(7060200);
  assert.equal(gaol.countKey, 'evergaolVictories');
  assert.equal(invasion.countKey, 'invaderVictories');
  assert.equal(gaol.countMax, 10);
  assert.equal(gaol.countScaling.capBehavior, 'retain-last-tier');
  assert.equal(data.metadata.permanentEffectControlFlow.status, 'static-native-verified');
  assert.ok(data.metadata.permanentEffectControlFlow.anchors.some(anchor => anchor.rva === '0x3C8483'));
  close(calculate([gaol], [], {effectCounts: {evergaolVictories: 11}}).total, 40 * 1.6289);
  assert.equal(gaol.phase, 'final');
  assert.deepEqual(gaol.countScaling.rates, [1, 1.05, 1.1025, 1.1577, 1.2155, 1.2763, 1.3401, 1.4072, 1.4775, 1.5514, 1.6289]);
  assert.equal(gaol.countScaling.spEffectIds[3], 7069003);
  assert.equal(invasion.countScaling.spEffectIds[10], 7069210);
  close(calculate([gaol]).total, 40);
  close(calculate([gaol], [], {effectCounts: {evergaolVictories: 3}}).total, 40 * 1.1577);
  close(calculate([gaol, gaol], [], {effectCounts: {evergaolVictories: 3}}).total, 40 * 1.1577);
  close(calculate([gaol, invasion], [], {effectCounts: {evergaolVictories: 3, invaderVictories: 2}}).total, 40 * 1.1577 * 1.1449);
  close(calculate([gaol], [], {manualPanel: true, effectCounts: {evergaolVictories: 3}}).total, 40 * 1.1577);
});

test('character conditional bonuses use native recipients and hit restrictions', () => {
  for (const [id, characterId, rate] of [[7031300, '5', 1.1], [7032900, '7', 1.16], [7036800, '10', 1.18], [7036900, '10', 1.16], [7037000, '10', 1.19]]) {
    const effect = rule(id);
    assert.deepEqual(effect.characterIds, [characterId]);
    close(calculate([effect], [], {characterId, conditions: effect.conditions}).total, 40 * rate);
    close(calculate([effect, effect], [], {characterId, conditions: effect.conditions}).total, 40 * rate);
    close(calculate([effect], [], {characterId: '1', conditions: effect.conditions}).total, 40);
    close(calculate([effect], [], {characterId}).total, 40);
  }
  const prayer = rule(7037000);
  assert.deepEqual(prayer.channels, ['physical']);
  assert.ok(prayer.triggerMagicIds.includes(6050) && prayer.triggerMagicIds.includes(6600));
  assert.ok(!rule(7036900).anyTags); // Category 104 filters activation, not later buffed hits.
  const sword = rule(7034400), counter = rule(7034700);
  close(calculate([sword], ['weaponAttack', 'atkSubCategory:122'], {characterId: '8', conditions: sword.conditions}).total, 54);
  close(calculate([sword], ['weaponAttack', 'atkSubCategory:111'], {characterId: '8', conditions: sword.conditions}).total, 40);
  close(calculate([counter], ['piercingCounter'], {characterId: '3', conditions: counter.conditions}).total, 48);
  close(calculate([counter], [], {characterId: '3', conditions: counter.conditions}).total, 40);
  assert.ok(!data.effects.some(effect => effect.nativeEffectId === 7036300));
});


test('independent enemy rewards preserve real acquisition routes and per-hit domains', () => {
  const rewards = data.effects.filter(effect => effect.kind === 'reward');
  assert.equal(rewards.length, 7);
  for (const effect of rewards) {
    assert.equal(effect.buffId, `reward:${effect.permanentBuffId}`);
    assert.ok(effect.source.includes('ItemLotParam_enemy#'));
    assert.ok(effect.source.includes('ItemTableParam#'));
    assert.ok(effect.source.includes('vagrantItemLotId -> PermanentBuffParam#'));
    assert.equal(effect.stackRule, 'multiply');
    assert.equal(effect.exclusiveGroup, undefined);
    assert.equal(effect.nativeEffectId, undefined);
    assert.equal(effect.goodsId, undefined);
  }
  const physical = buff('reward:8100000');
  const elemental = buff('reward:8100500');
  const spell = buff('reward:8330103');
  close(calculate(physical).total, 40 * 1.06);
  close(calculate(elemental).total, 40);
  close(calculate(spell, ['weaponAttack', 'art']).total, 40);
  close(calculate(spell, ['sorcery']).total, 40 * 1.07);
  close(calculate(spell, ['incantation']).total, 40 * 1.07);
  close(calculate(buff('reward:8430000')).total, 40);
  close(calculate(buff('reward:8430000'), ['piercingCounter']).total, 40 * 1.2);
  close(calculate([...physical, ...buff('reward:8100001')]).total, 40 * 1.06 * 1.09);
  close(calculate([...physical, rule(8100000)]).total, 40 * 1.06 * rule(8100000).rate);
  assert.equal(buff('reward:8100001')[0].nameFmgId, 8100000);
});

test('mountaintop reward only adds its verified active frostbite proc and refreshes duplicates', () => {
  const effects = buff('event:4');
  assert.equal(effects.length, 1);
  const effect = effects[0];
  assert.equal(effect.kind, 'event');
  assert.equal(effect.spEffectId, 6999333);
  assert.equal(effect.durationSeconds, 20);
  assert.equal(effect.rate, 1.15);
  assert.equal(effect.stackRule, 'highest');
  assert.deepEqual(effect.channels, channels);
  assert.ok(effect.source.includes('invocationConditionsStateChange1=2280'));
  close(calculate(effects).total, 40);
  const conditions = Object.fromEntries(effect.conditions.map(name => [name, true]));
  close(calculate(effects, [], {conditions}).total, 46);
  close(calculate([...effects, ...effects], [], {conditions}).total, 46);
  assert.ok(!data.effects.some(row => row.kind === 'event' && [8970000, 8970030, 8970065].includes(row.spEffectId)));
});
