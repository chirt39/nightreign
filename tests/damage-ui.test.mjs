import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { ref, shallowRef, computed, reactive, watch, nextTick, effectScope } from 'vue';
import { calculateDamage, calculatePanel } from '../src/lib/damage-calculator.js';
import { damageShowcase } from '../src/lib/damage-showcase.js';
import { hasAutomaticProjectile } from '../src/lib/damage-panel.js';
import { relicChoiceMetadata } from '../src/lib/damage-relic-options.js';

const source = fs.readFileSync(new URL('../src/pages/DamageCalculatorPage.vue', import.meta.url), 'utf8');
const script = source.match(/<script setup>([^]*?)<\/script>/)[1].replace(/^import .*;\r?\n/gm, '');
const load = name => JSON.parse(fs.readFileSync(new URL(`../public/${name}.json`, import.meta.url), 'utf8'));

async function createCalculator(t, keepInitialSelection = false) {
  const scope = effectScope();
  t.after(() => scope.stop());
  const context = {
    ref, shallowRef, computed, reactive, watch, nextTick, calculateDamage, calculatePanel, damageShowcase, hasAutomaticProjectile, relicChoiceMetadata,
    defineProps: () => ({ active: false }), defineExpose() {}, onMounted() {}, onBeforeUnmount() {},
    URL, location: { href: 'http://localhost/#damage' }, history: { state: {}, replaceState() {} },
  };
  vm.createContext(context);
  scope.run(() => vm.runInContext(script, context));
  const get = name => vm.runInContext(name, context);
  get('catalogs').value = { weapons: load('weapon-catalog'), panel: load('damage-panel'), actions: load('damage-actions'), effects: load('damage-effects'), targets: load('damage-targets'), arts: load('arts-catalog'), traits: load('damage-weapon-traits'), definitions:load('relic_rule_effects'), crossMode:load('relic_effect_cross_mode') };
  context.normalizeSelection(); await nextTick();
  if (keepInitialSelection) return { context, get };
  get('targetId').value = '';
  context.chooseShowcase(damageShowcase.find(item => item.artId === '112')); await nextTick();
  get('selectedSegmentIds').value = get('segments').value.filter(item => item.rates).map(item => item.id);
  return { context, get };
}

test('automatic panel uses integer upgrade offsets; manual missing fields remain missing', async t => {
  const { context, get } = await createCalculator(t);
  assert.ok(get('panel').value?.physical > 0);
  assert.equal(get('result').value.kind, 'beforeDefense');
  assert.ok(get('result').value.total > 0);
  get('mode').value = 'manual'; await nextTick();
  assert.equal(get('result').value.total, null);
  assert.equal(context.numberOrNull(' '), null);
  assert.equal(context.numberOrNull(0), 0);
  for (const key of Object.keys(get('manualValues'))) get('manualValues')[key] = key === 'physical' ? 200 : 0;
  assert.ok(get('result').value.total > 0);
  assert.equal(get('reinforcementOptions').value.some(item => Number(item.id) === Number(get('reinforcement').value)), true);
});

test('variant action whitelist cannot fall back to the weapon group ID', async t => {
  const { context, get } = await createCalculator(t);
  const entry = damageShowcase.find(item => item.artId === '214');
  context.chooseShowcase(entry);
  const weapon = get('weapon').value, variant = get('variant').value;
  get('catalogs').value = { ...get('catalogs').value, actions: { actions: [{ id: 'wrong-base', artId: entry.artId, weaponIds: [String(weapon.id)], segments: [] }, { id: 'right-variant', artId: entry.artId, weaponIds: [String(variant.id)], segments: [] }] } };
  assert.deepEqual(Array.from(get('compatibleActions').value, item => item.id), ['right-variant']);
  const art = get('allArts').value.find(item => !context.variantArtIds(variant).includes(String(item.id)));
  get('artId').value = String(art.id);
  assert.equal(get('incompatibleArt').value, true);
  assert.equal(get('compatibleActions').value.length, 0);
  context.normalizeSelection(); await nextTick();
  assert.equal(get('selectedArt').value.name, art.name);
  assert.equal(get('outsideShowcase').value, true);
  assert.equal(get('variantId').value, entry.variantId);
});

test('selected effect rules are atomic, preserve selection order and replace exclusive buffs', async t => {
  const { context, get } = await createCalculator(t);
  get('catalogs').value = { ...get('catalogs').value, effects: { ...get('catalogs').value.effects, effects: [
    { id: 'one:physical', nativeEffectId: 1, name: '多属性效果', phase: 'panel', rate: 1.1, channels: ['physical'], conditions: ['满血'] },
    { id: 'one:magic', nativeEffectId: 1, name: '多属性效果', phase: 'panel', rate: 1.1, channels: ['magic'] },
    { id: 'a', buffId: 'a', name: '先选增益', exclusiveGroup: 'body', phase: 'panel', rate: 1.1, conditions: ['先选效果生效中'] },
    { id: 'b', buffId: 'b', name: '后选增益', exclusiveGroup: 'body', phase: 'panel', rate: 1.2, conditions: ['后选效果生效中'] },
  ] } };
  assert.equal(get('conditionOptions').value.length, 0);
  context.toggleEffect('effect', 'native:1', true);
  assert.deepEqual(Array.from(get('selectedEffects').value, item => item.id), ['one:physical', 'one:magic']);
  context.toggleEffect('effect', 'buff:a', true); context.toggleEffect('effect', 'buff:b', true);
  assert.deepEqual(Array.from(get('selectedEffects').value, item => item.id), ['one:physical', 'one:magic', 'b']);
  assert.deepEqual(Array.from(get('conditionOptions').value, item => item.id), ['满血', '后选效果生效中']);
  get('mode').value = 'manual';
  for (const key of Object.keys(get('manualValues'))) get('manualValues')[key] = key === 'physical' ? 200 : 0;
  const withPanelRules = get('result').value.total;
  get('selectionOrder').value = [];
  assert.equal(get('result').value.total, withPanelRules, 'handwritten final panel does not apply panel buffs twice');
});

test('in-run categories follow their actual sources while override groups still work across categories', async t => {
  const { context, get } = await createCalculator(t);
  get('picker').value = 'effect';
  const choices = get('pickerChoices').value;
  assert.equal(choices.find(item => item.id === 'buff:reward:8100001').category, 'field');
  assert.ok(!choices.some(item => item.id.startsWith('native:')), 'weapon AttachEffect rows are not independent rewards');
  assert.equal(choices.find(item => item.id === 'buff:goods:1210').category, 'goods');
  assert.equal(choices.find(item => item.id === 'buff:magic:6050').category, 'art');
  assert.equal(choices.find(item => item.id === 'buff:art:1010').category, 'art');
  assert.equal(context.effectCategory({kind:'event',buffId:'event:example'}), 'event');
  context.toggleEffect('effect', 'buff:goods:1210', true);
  context.toggleEffect('effect', 'buff:magic:6050', true);
  assert.equal(get('selectionOrder').value.length, 1);
  assert.equal(get('selectionOrder').value[0].id, 'buff:magic:6050');
});

test('target picker uses each atlas form’s defense and susceptibility, with pre-defense fallback for missing data', async t => {
  const { context, get } = await createCalculator(t, true);
  const atlas = get('catalogs').value;
  const original = get('selectedTarget').value;
  get('catalogs').value = { ...atlas, targets: { targets: [
    original,
    { ...original, id: 'immune', taken: { holy: 0 } },
    { ...original, id: 'missing-defense', baseDefense: { physical: 100 }, defense: null },
    { ...original, id: 'missing-rate', taken: {} },
  ] } };
  const pick = targetId => context.acceptPicked({ detail: { kind: 'enemy', targetId } });
  const baseline = get('result').value.total;
  await pick('immune');
  assert.equal(get('result').value.basis, 'hp');
  assert.equal(get('result').value.total, 0);
  for (const incomplete of ['missing-defense', 'missing-rate']) {
    await pick(incomplete);
    assert.equal(get('result').value.basis, 'beforeDefense');
    assert.match(context.resultTitle(get('result').value), /防御前伤害/);
    assert.ok(get('result').value.total > 0);
  }
  await pick(original.id);
  assert.equal(get('result').value.total, baseline);
});

test('unmodelled relic effects remain explicit and cannot fabricate a complete result', async t => {
  const { context, get } = await createCalculator(t);
  const choice = get('customChoices').value.find(item => item.modes.includes('普通') && !get('nativeRelicRules').value.has(item.id));
  const draft = structuredClone(JSON.parse(JSON.stringify(get('relicSlots').value)));
  draft[0].rows = [choice];
  context.saveRelicSlots(draft);
  assert.equal(get('result').value.kind, 'partial');
  assert.equal(get('result').value.hasUnmodelledRelic, true);
  get('selectedSegmentIds').value = [];
  assert.equal(get('result').value.total, null);
});

test('hero-specific actions remain restricted in manual mode, which can start from the current inferred panel', async t => {
  const { context, get } = await createCalculator(t);
  get('mode').value = 'manual';
  context.fillManualPanel();
  assert.equal(get('manualValues').physical, get('automaticPanel').value.physical);
  const variantId = get('variantId').value;
  get('catalogs').value = { ...get('catalogs').value, actions: { actions: [
    { id: 'hero-8', artId: get('artId').value, name: '专属动作', weaponIds: [variantId], scope: { heroId: 8 }, segments: [] },
  ] } };
  get('characterId').value = '1'; await nextTick();
  assert.equal(get('compatibleActions').value.length, 0);
  get('characterId').value = '8'; await nextTick();
  assert.equal(get('compatibleActions').value[0].id, 'hero-8');
});

function draftSlots(get, assignments) {
  return Array.from(get('relicSlots').value, slot => ({ ...slot, rows: (assignments[slot.id] ?? slot.rows.map(row => row.id)).map(id => ({ id })) }));
}

test('six fixed positions enforce normal/deep pools and three positive effects each', async t => {
  const { context, get } = await createCalculator(t);
  get('targetId').value = '75100020';
  const baseline = get('result').value.total;
  context.saveRelicSlots(draftSlots(get, { 'normal:1': ['7001402'], 'deep:1': ['7001402'] }));
  assert.equal(get('relicCount').value, 2, 'native shared ordinary effects can occur in deep relics');
  assert.ok(get('result').value.total > baseline);
  const original = JSON.stringify(get('relicSlots').value);
  for (const invalid of [
    {'normal:1':['6001400']}, {'deep:1':['7001400']},
    {'normal:1':['7001402','7001402']}, {'normal:1':['7001400','7001500','7001600','7001700']},
    {'normal:1':['6820000']}, {'normal:1':['99999999']},
  ]) {
    context.saveRelicSlots(draftSlots(get, invalid));
    assert.equal(JSON.stringify(get('relicSlots').value), original);
  }
  const slots = draftSlots(get, {});
  slots.push({ id:'normal:4', mode:'normal', rows:[] });
  context.saveRelicSlots(slots);
  assert.equal(JSON.stringify(get('relicSlots').value), original);
});

test('all six positions can be edited and cleared without shifting other positions; cancel keeps state', async t => {
  const { context, get } = await createCalculator(t);
  const assignments = Object.fromEntries(get('relicSlots').value.map(slot => [slot.id, ['7001402']]));
  context.saveRelicSlots(draftSlots(get, assignments));
  assert.equal(get('normalRelicCount').value, 3);
  assert.equal(get('deepRelicCount').value, 3);
  const original = JSON.stringify(get('relicSlots').value);
  context.editRelic('deep:2'); context.closePicker();
  assert.equal(JSON.stringify(get('relicSlots').value), original);
  context.saveRelicSlots(draftSlots(get, { 'normal:2':['7001600','7001700','7001800'], 'deep:3':[] }));
  assert.equal(get('relicCount').value, 5);
  assert.equal(get('relicSlots').value[1].rows.length, 3);
  assert.equal(get('relicSlots').value[4].rows[0].id, '7001402');
  assert.equal(get('selectionOrder').value.length, 5);
  context.toggleEffect('relic','normal:1',false);
  assert.equal(get('relicSlots').value[0].rows.length,0);
  assert.equal(get('relicCount').value,4);
});

test('Balancers positive effects apply their melee-weapon and skill rules to the Halo projectile', async t => {
  const { context, get } = await createCalculator(t, true);
  const base = get('result').value.total;
  context.saveRelicSlots(draftSlots(get, {'normal:1':['7006600','7006700']}));
  assert.ok(Math.abs(get('result').value.total - base * 1.06 * 1.15) < 1e-8);
});

test('victory counts share one value across relic copies and recalculate the displayed result', async t => {
  const { context, get } = await createCalculator(t, true);
  assert.match(get('customChoices').value.find(item => item.id === '7060000').detail, /最多 10 层/);
  assert.doesNotMatch(get('customChoices').value.find(item => item.id === '7060000').detail, /无限/);
  const base = get('result').value.total;
  context.saveRelicSlots(draftSlots(get, {'normal:1':['7060000','7060200'], 'normal:2':['7060000']}));
  assert.equal(get('result').value.total, base);
  assert.equal(get('countOptions').value.length, 2);
  const [gaol, invader] = get('countOptions').value;
  context.setEffectCount(gaol, '3');
  context.setEffectCount(invader, '2');
  assert.ok(Math.abs(get('result').value.total / base - 1.1577 * 1.1449) < 1e-10);
  context.setEffectCount(gaol, '99');
  assert.equal(get('effectCounts')[gaol.id], 10);
  context.setEffectCount(gaol, '-1');
  context.setEffectCount(invader, '');
  assert.equal(get('result').value.total, base);
  context.toggleEffect('relic','normal:1',false);
  assert.equal(get('countOptions').value.length, 1);
});

test('character relic conditions follow the selected character and never activate automatically', async t => {
  const { context, get } = await createCalculator(t, true);
  context.saveRelicSlots(draftSlots(get, {'normal:1':['7036800']}));
  assert.equal(get('conditionOptions').value.length, 0);
  get('characterId').value = '10'; await nextTick();
  const base = get('result').value.total;
  const condition = get('conditionOptions').value[0].id;
  context.toggleCondition(condition, true);
  assert.ok(Math.abs(get('result').value.total / base - 1.18) < 1e-10);
  get('characterId').value = '1'; await nextTick();
  assert.equal(get('conditionOptions').value.length, 0);
  const other = get('result').value.total;
  context.toggleEffect('relic','normal:1',false);
  assert.equal(get('result').value.total, other);
});

test('relic picker metadata follows actual Halo contacts and selected character without deleting equipped effects', async t => {
  const { context, get } = await createCalculator(t, true);
  const choice = id => get('customChoices').value.find(item => item.id === id);
  for (const id of ['7001402', '7001800', '7006600', '7006700', '7060000']) assert.equal(choice(id).applicable, true, id);
  assert.equal(choice('7001500').applicable, false);
  assert.equal(choice('7036800').applicable, false);
  get('characterId').value = '10'; await nextTick();
  assert.equal(choice('7036800').applicable, true);
  context.saveRelicSlots(draftSlots(get, {'normal:1':['7036800']}));
  get('characterId').value = '1'; await nextTick();
  assert.equal(choice('7036800').applicable, false);
  assert.equal(get('relicSlots').value[0].rows[0].id, '7036800');
  get('mode').value = 'manual';
  context.fillManualPanel();
  get('manualValues').magic = 50;
  assert.equal(choice('7001500').applicable, true, 'manual elemental AR must not be hidden by the weapon base channel');
});

test('row channels use their actual physical subtype and preserve zero from immunity without inventing unknown channels', async t => {
  const { context } = await createCalculator(t);
  const row = { physicalType: 'slash', activeChannels: ['physical', 'fire'], channels: { physical: 0, fire: 120, magic: 0 } };
  assert.deepEqual(Array.from(context.rowChannels(row), item => item.label), ['斩击', '火']);
  assert.equal(context.display(row.channels.physical), '0');
  assert.equal(context.rowChannels({ channels: {} }).length, 0);
  assert.equal(context.rowChannels({ activeChannels: ['physical'] })[0].label, '物理（类型待核对）');
  assert.equal(context.hitDescription({ rates: null, hits: 1 }), '命中次数待核对');
  assert.equal(context.hitDescription({ rates: { physical: 1, magic: 0, fire: 0, lightning: 0, holy: 0 }, hits: 2 }), '2 次命中');
});

test('a post-defense-only gain preserves the pre-defense basis', async t => {
  const { context, get } = await createCalculator(t);
  get('catalogs').value = { ...get('catalogs').value, effects: { effects: [{ id: 'final-up', nativeEffectId: 98, name: '防御后增益', phase: 'final', rate: 1.1, channels: ['physical'] }], relics: [] } };
  context.toggleEffect('effect', 'native:98', true);
  assert.equal(get('result').value.basis, 'beforeDefense');
});

test('six image cards preserve exact variant and art IDs; unsupported links never change to another weapon', async t => {
  const { context, get } = await createCalculator(t);
  assert.equal(damageShowcase.length, 6);
  for (const entry of damageShowcase) {
    for (const file of [entry.weaponImage, entry.artImage, ...entry.statuses.map(status => status.icon)]) assert.ok(fs.existsSync(new URL(`../public${file}`, import.meta.url)));
    context.chooseShowcase(entry); await nextTick();
    assert.equal(get('showcaseSelection').value.variantId, entry.variantId);
    assert.equal(get('artId').value, entry.artId);
    assert.ok(get('action').value.scope.enoughFp !== false, 'insufficient-FP actions are never defaults');
    assert.ok(!get('action').value.name.includes('蓄力'), 'default is the uncharged route');
  }
  get('weaponId').value = '1000000'; get('variantId').value = '1000000'; get('artId').value = '101';
  context.normalizeSelection(); await nextTick();
  assert.equal(get('weaponId').value, '1000000');
  assert.equal(get('outsideShowcase').value, true);
  assert.equal(get('result').value.total, null);
  get('weaponId').value = '9010000'; get('variantId').value = '9010500'; get('artId').value = '';
  context.normalizeSelection(); await nextTick();
  assert.equal(get('showcaseSelection').value.name, '火焰长牙');
  assert.equal(get('artId').value, '214');
});

test('current purple quality can become gold while red is evidence-backed and never reuses a manual panel', async t => {
  const { context, get } = await createCalculator(t);
  const profile = get('qualityProfile').value;
  const purple = Object.entries(profile.colorByReinforcement).find(([, color]) => color === 'purple')[0];
  get('reinforcement').value = purple; await nextTick();
  assert.equal(get('qualityColor').value, 'purple');
  context.selectUpgrade(String(Number(purple) + 1)); await nextTick();
  assert.equal(get('qualityColor').value, 'gold');
  assert.ok(get('automaticPanel').value);
  context.selectUpgrade(purple); await nextTick();
  assert.equal(get('qualityColor').value, 'purple');
  assert.equal(get('canRed').value, false, 'unknown red availability is not offered');
  context.chooseShowcase(damageShowcase[0]); await nextTick();
  assert.equal(get('canRed').value, true);
  get('mode').value = 'manual'; context.fillManualPanel();
  assert.ok(get('manualValues').physical > 0);
  context.selectUpgrade('red'); await nextTick();
  assert.ok(get('automaticPanel').value.physical > 0);
  assert.equal(get('mode').value, 'auto');
  assert.equal(get('qualityColor').value, 'red');
  assert.equal(get('manualValues').physical, '');
  get('manualValues').physical = 456;
  context.chooseShowcase(damageShowcase[1]); await nextTick();
  assert.equal(get('manualValues').physical, '');
  assert.equal(get('canRed').value, true);
});

test('add only eligible positive traits, enforce the three-slot limit and allow removal', async t => {
  const { context, get } = await createCalculator(t);
  const candidates = context.traitOptions();
  assert.ok(candidates.length>3);
  assert.ok(candidates.every(trait=>trait.polarity === 'positive' || trait.calculationStatus === 'stat-gains'));
  for (const trait of candidates.slice(0,4)) context.addWeaponTrait(trait.id);
  assert.equal(get('weaponTraitSlots').value.length,3);
  context.removeWeaponTrait(candidates[0].id);
  context.addWeaponTrait(candidates[1].id);
  assert.equal(get('weaponTraitSlots').value.length,2);
  context.addWeaponTrait(candidates[3].id);
  assert.equal(get('weaponTraitSlots').value.length,3);
});

test('red traits share one configured roll per pool and allow one extra corpse trait', async t => {
  const {context, get} = await createCalculator(t, true);
  get('quality').value = 'red'; await nextTick();
  const ids = () => get('availableWeaponTraits').value.map(item => item.id);
  assert.ok(!ids().includes(8810050) && ids().includes(8850650) && ids().includes(8850550));
  context.addWeaponTrait(8850650);
  assert.ok(!ids().includes(8850550), 'same special slot cannot grant physical and elemental bonuses');
  context.addWeaponTrait(8100402);
  assert.ok(!ids().includes(8350002), 'same standard slot cannot grant holy and skill bonuses');
  context.addWeaponTrait(8810050);
  assert.equal(get('weaponTraitSlots').value.length, 2, 'removed trait does not occupy the third slot');
  get('picker').value = 'trait';
  assert.ok(!get('equipmentTraits').value.some(item => item.traitId === '8810050'));
  const corpse = get('availableWeaponTraits').value.find(item => item.polarity === 'corpse');
  context.addWeaponTrait(corpse.id);
  assert.equal(get('weaponTraitSlots').value.length, 3);
  assert.equal(ids().length, 0);
  get('quality').value = 'native'; await nextTick();
  assert.deepEqual(Array.from(get('weaponTraitSlots').value, slot => slot.traitId), ['8100402', String(corpse.id)]);
  context.addWeaponTrait(8350002);
  get('quality').value = 'red'; await nextTick();
  assert.deepEqual(Array.from(get('weaponTraitSlots').value, slot => slot.traitId), ['8100402', String(corpse.id)]);
});

test('victory points and positive trait stat gains affect inferred AR once while manual final AR is unchanged', async t => {
  const { context, get } = await createCalculator(t);
  get('level').value = 1; await nextTick();
  const original = get('automaticPanel').value.physical;
  get('statGainInputs').dexterity = 9; await nextTick();
  assert.ok(get('automaticPanel').value.physical > original);
  get('mode').value = 'manual'; await nextTick();
  Object.assign(get('manualValues'), { physical: 333, magic: 0, fire: 0, lightning: 0, holy: 0 });
  get('statGainInputs').dexterity = 12; await nextTick();
  assert.equal(get('panel').value.physical, 333);
  get('projectileInputs').value = { sample: { physical: 120 } };
  get('statGainInputs').dexterity++; await nextTick();
  assert.equal(Object.keys(get('projectileInputs').value).length, 0);
  context.toggleCondition('满血', true);
  context.toggleCondition('低血量攻击效果已触发（原生阈值84.99%）', true);
  assert.equal(get('conditions')['满血'], false);
  context.toggleCondition('满血', true);
  assert.equal(get('conditions')['低血量攻击效果已触发（原生阈值84.99%）'], false);
});

test('legacy duplicate weapon effects count once and are no longer offered as independent rewards', async t => {
  const { context, get } = await createCalculator(t);
  const trait = context.traitOptions().find(item => item.calculationStatus === 'supported' && item.effectIds.length);
  assert.ok(trait);
  const choice = get('effectChoices').value.find(item => item.effects.some(effect => trait.effectIds.includes(effect.id)));
  assert.ok(choice);
  context.toggleEffect('effect', choice.id, true);
  context.addWeaponTrait(trait.id);
  for (const id of trait.effectIds) assert.equal(get('selectedEffects').value.filter(item => item.id === id).length, 1);
  assert.equal(context.providedByWeapon(choice), true);
  get('picker').value = 'effect';
  assert.ok(!get('pickerChoices').value.some(item => item.id === choice.id));
  const hidden = get('traits').value.filter(item => ['missing-rule', 'non-damage'].includes(item.calculationStatus) || item.name.includes('致命一击'));
  assert.ok(hidden.some(item => item.name.includes('致命一击')));
  assert.ok(hidden.some(item => item.name.includes('附加异常状态')));
  const available = new Set(context.traitOptions().map(item => item.id));
  assert.ok(hidden.every(item => !available.has(item.id)));
  context.addWeaponTrait(hidden[0].id);
  assert.equal(get('weaponTraitSlots').value.length, 1);
});

test('independent physical rewards remain selectable with a weapon trait and apply their own native multiplier', async t => {
  const { context, get } = await createCalculator(t);
  get('targetId').value = '75100020';
  const trait = context.traitOptions().find(item => item.effectIds.some(id => {
    const rule = get('effectById').value.get(id);
    return rule.channels?.includes('physical') && !rule.conditions?.length;
  }));
  assert.ok(trait);
  context.addWeaponTrait(trait.id);
  get('picker').value = 'effect';
  const rewardId = 'buff:reward:8100000';
  assert.equal(get('pickerChoices').value.find(item => item.id === rewardId).disabled, false);
  const baseline = get('result').value.total;
  context.pickItem(rewardId);
  assert.equal(get('weaponTraitSlots').value.length, 1);
  assert.ok(context.checked('effect', rewardId));
  assert.ok(Math.abs(get('result').value.total / baseline - 1.06) < 1e-10);
  get('picker').value = 'effect';
  assert.equal(get('pickerChoices').value.find(item => item.id === rewardId).disabled, true);
  assert.equal(get('pickerChoices').value.find(item => item.id === 'buff:reward:8100001').disabled, false);
  context.toggleEffect('effect', rewardId, false);
  assert.equal(get('result').value.total, baseline);
  // Reverse selection order must also preserve the independent reward.
  context.removeWeaponTrait(trait.id);
  context.toggleEffect('effect', rewardId, true);
  context.addWeaponTrait(trait.id);
  assert.equal(get('weaponTraitSlots').value.length, 1);
  assert.ok(context.checked('effect', rewardId));
  assert.ok(Math.abs(get('result').value.total / baseline - 1.06) < 1e-10);
});

test('verified event reward is categorized separately and applies only while its native trigger is active', async t => {
  const { context, get } = await createCalculator(t);
  get('targetId').value = '75100020';
  get('picker').value = 'effect';
  const eventChoice = get('pickerChoices').value.find(item => item.id === 'buff:event:4');
  assert.ok(eventChoice);
  assert.equal(eventChoice.category, 'event');
  const baseline = get('result').value.total;
  context.pickItem(eventChoice.id);
  assert.equal(get('result').value.total, baseline, 'selecting a reward does not claim its trigger has occurred');
  const rules = get('selectedEffects').value;
  assert.ok(rules.every(rule => rule.durationSeconds === 20));
  const conditions = [...new Set(rules.flatMap(rule => rule.conditions || []))];
  assert.ok(conditions.length);
  for (const condition of conditions) context.toggleCondition(condition, true);
  assert.ok(Math.abs(get('result').value.total / baseline - 1.15) < 1e-10);
  context.toggleCondition(conditions.at(-1), false);
  assert.equal(get('result').value.total, baseline);
});


test('halo and golden blade default to just the first FP projectile; all contacts remain available', async t => {
  const { context, get } = await createCalculator(t);
  for (const art of ['1051', '1037']) {
    context.chooseShowcase(damageShowcase.find(item => item.artId === art)); await nextTick();
    assert.equal(get('action').value.scope.enoughFp, true);
    assert.equal(get('selectedSegmentIds').value.length, 1);
    const hit = get('segments').value.find(item => item.id === get('selectedSegmentIds').value[0]);
    assert.ok(hit.tags.includes('projectile'));
    assert.equal(hit.inputStage, 1);
    if (art === '1051') assert.ok(get('segments').value.length > 1);
  }
  assert.ok(!source.includes(`v-if="!['1051', '1037', '1017'].includes(artId)"`));
});

test('projectile context uses the inferred panel and labels its estimate', async t => {
  const { context, get } = await createCalculator(t);
  assert.match(context.resultTitle({kind:'beforeDefense',projectileEstimate:true}), /弹体单发估算/);
  assert.match(source, /projectileContext: \{ catalog: panelCatalog.value, variantId: variantId.value/);
});

test('first initialization selects ordinary Adel and returning to the calculator preserves the newly picked monster', async t => {
  const { context, get } = await createCalculator(t, true);
  assert.equal(get('targetId').value, '75100020');
  assert.equal(get('selectedTarget').value.source.disasterForm, false);
  assert.deepEqual(Object.values(get('target').value.defense), [100, 100, 100, 100, 100]);
  assert.equal(get('target').value.taken.holy, 1);
  assert.match(context.resultTitle(get('result').value), /^参考估算扣血/);
  const snapshot = Object.fromEntries(['weaponId', 'variantId', 'artId', 'actionId'].map(key => [key, get(key).value]));
  const other = get('targets').value.find(item => String(item.id) !== '75100020' && item.baseDefense);
  await context.acceptPicked({ detail: { kind: 'enemy', targetId: other.id } });
  context.chooseShowcase(damageShowcase[5]); await nextTick();
  await context.restoreNavigation(snapshot);
  assert.equal(get('target').value.id, String(other.id));
  assert.equal(get('target').value.taken.holy, other.taken.holy);
});

test('manual projectile fields use per-contact automatic support, retain unknown inputs and show known automatic hit counts', async t => {
  const { context, get } = await createCalculator(t);
  const allSegments = get('actions').value.flatMap(action => action.segments);
  const automatic = allSegments.filter(hasAutomaticProjectile);
  assert.ok(automatic.length > 0);
  const unsupported = { id: 'unknown-projectile', name: '待核对弹体', rates: null, hits: 2, manualChannels: ['fire'] };
  const component = fs.readFileSync(new URL('../src/components/DamageProjectileInputs.vue', import.meta.url), 'utf8');
  const childScript = component.match(/<script setup>([^]*?)<\/script>/)[1].replace(/^import .*;\r?\n/gm, '');
  const childProps = { segments: [...allSegments, unsupported], selectedIds: [...allSegments.map(item => item.id), unsupported.id], modelValue: {} };
  const child = { computed, hasAutomaticProjectile, defineProps: () => childProps, defineEmits: () => () => {} };
  vm.createContext(child); vm.runInContext(childScript, child);
  const editable = vm.runInContext('editable.value', child);
  assert.ok(editable.some(item => item.id === unsupported.id));
  assert.ok(editable.every(item => !hasAutomaticProjectile(item)));
  for (const segment of automatic) {
    assert.equal(context.hitDescription(segment), `${segment.hits} 次命中`);
    assert.ok(!editable.some(item => item.id === segment.id));
  }
  const unresolved = allSegments.find(item => item.id === 'missing-attack-40000-2');
  assert.ok(unresolved);
  assert.equal(hasAutomaticProjectile(unresolved), false);
  assert.equal(context.hitDescription(unresolved), '命中次数待核对');
  assert.match(component, /segment.hits.*次命中/);
});

test('catalog final defense takes precedence over base defense, including zero', async t => {
  const { get } = await createCalculator(t, true);
  assert.equal(get('target').value.useTakenEstimate, true);
  const current = get('selectedTarget').value;
  get('catalogs').value = { ...get('catalogs').value, targets: { targets: [{ ...current, defense: { holy: 0 } }] } };
  assert.equal(get('target').value.useTakenEstimate, false);
  assert.equal(get('target').value.defense.holy, 0);
  assert.equal(get('target').value.defense.physical, 100);
});


test('removed low-health -7% trait cannot enter damage through either picker or an old loadout', async t => {
  const { context, get } = await createCalculator(t, true);
  get('quality').value = 'red'; await nextTick();
  const baseline = get('result').value.total;
  assert.ok(get('catalogs').value.traits.traits.some(item => item.id === 8810050), 'native source retained');
  assert.ok(!get('traits').value.some(item => item.id === 8810050));
  assert.ok(!get('effectChoices').value.some(item => item.id === 'native:8810050'));
  context.addWeaponTrait(8810050);
  assert.equal(get('weaponTraitSlots').value.length, 0);
  get('conditions')['低血量攻击效果已触发（原生阈值84.99%）'] = true;
  get('selectionOrder').value = [{kind:'trait',id:'8810050'}, {kind:'effect',id:'native:8810050'}];
  get('weaponTraitSlots').value = [{id:'8810050',traitId:'8810050',polarity:'negative'}];
  await nextTick();
  assert.equal(get('weaponTraitSlots').value.length, 0);
  assert.equal(get('selectionOrder').value.length, 0);
  assert.equal(get('selectedEffects').value.length, 0);
  assert.equal(get('equipmentTraits').value.length, 0);
  assert.equal(get('result').value.total, baseline);
  assert.ok(get('traits').value.some(item => item.id === 8810000), 'separate -5% trait retained');
});
