import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { ref, shallowRef, computed, reactive, watch, nextTick, effectScope } from 'vue';
import { calculateDamage, calculatePanel } from '../src/lib/damage-calculator.js';
import { damageShowcase } from '../src/lib/damage-showcase.js';
import { hasAutomaticProjectile } from '../src/lib/damage-panel.js';

const source = fs.readFileSync(new URL('../src/pages/DamageCalculatorPage.vue', import.meta.url), 'utf8');
const script = source.match(/<script setup>([^]*?)<\/script>/)[1].replace(/^import .*;\r?\n/gm, '');
const load = name => JSON.parse(fs.readFileSync(new URL(`../public/${name}.json`, import.meta.url), 'utf8'));

async function createCalculator(t, keepInitialSelection = false) {
  const scope = effectScope();
  t.after(() => scope.stop());
  const context = {
    ref, shallowRef, computed, reactive, watch, nextTick, calculateDamage, calculatePanel, damageShowcase, hasAutomaticProjectile,
    defineProps: () => ({ active: false }), defineExpose() {}, onMounted() {}, onBeforeUnmount() {},
    URL, location: { href: 'http://localhost/#damage' }, history: { state: {}, replaceState() {} },
  };
  vm.createContext(context);
  scope.run(() => vm.runInContext(script, context));
  const get = name => vm.runInContext(name, context);
  get('catalogs').value = { weapons: load('weapon-catalog'), panel: load('damage-panel'), actions: load('damage-actions'), effects: load('damage-effects'), targets: load('damage-targets'), arts: load('arts-catalog'), traits: load('damage-weapon-traits'), definitions:load('relic_rule_effects') };
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

test('unmodelled relic traits are marked beside partially modelled selections', async t => {
  const { context, get } = await createCalculator(t);
  get('catalogs').value.effects.relics = [{ id: 'unknown', name: '有缺失词条的遗物', effectIds: [], unmodelledEffectIds: [123] }];
  context.toggleEffect('relic', 'unknown', true);
  assert.equal(get('result').value.kind, 'partial');
  assert.equal(get('result').value.hasUnmodelledRelic, true);
  assert.ok(get('result').value.missing.some(item => item.includes('有未计入的词条')));
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

test('custom and imported relics resolve native relic IDs, retain unknown effects and respect instance identity', async t => {
  const { context, get } = await createCalculator(t);
  const eligible = get('customChoices').value.find(item=>get('nativeRelicRules').value.has(item.id));
  assert.ok(eligible);
  context.addCustom([eligible]);
  assert.equal(get('savedRelics').value.length,1);
  assert.ok(get('selectedEffects').value.length);
  const event = {detail:{kind:'relic',instanceId:'7',name:'测试遗物',effects:[{id:eligible.id,name:eligible.name},{id:'999999',name:'未知效果'}]}};
  await context.acceptPicked(event); await context.acceptPicked(event);
  assert.equal(get('savedRelics').value.length,2);
  assert.deepEqual(Array.from(context.relicDetails(get('savedRelics').value[1]),item=>item.missing),[false,true]);
  context.toggleEffect('relic','instance:7',false);
  assert.equal(get('unmodelledRelics').value.length,0);
});

test('editing a three-effect custom relic replaces its original rules in place', async t => {
  const { context, get } = await createCalculator(t, true);
  const byId = new Map(get('customChoices').value.map(item => [item.id,item]));
  const ids = [...get('nativeRelicRules').value.keys()].filter(id => byId.has(id) && id !== '7001800').slice(0, 3);
  context.addCustom(ids.map(id => byId.get(id)));
  context.editRelic('custom:1');
  context.closePicker();
  assert.equal(get('savedRelics').value[0].rows.length, 3);
  context.editRelic('custom:1');
  context.addCustom([...ids, '7001800'].map(id => byId.get(id)));
  assert.equal(get('editingRelicId').value, 'custom:1');
  const before = get('result').value.total;
  context.addCustom([...ids.slice(0,2), '7001800'].map(id => byId.get(id)));
  assert.equal(get('savedRelics').value[0].rows[2].id, '7001800');
  assert.equal(get('selectionOrder').value.length, 1);
  assert.ok(get('result').value.total > before);
  assert.equal(get('editingRelicId').value, null);
});

test('official, save and custom relics share six slots; edits at capacity keep their slot', async t => {
  const { context, get } = await createCalculator(t, true);
  const rule = get('customChoices').value[0];
  const [first, second, third] = get('relics').value;
  const equip = relic => context.toggleEffect('relic', relic.id, true);
  const imported = id => context.acceptPicked({detail:{kind:'relic', instanceId:id, name:'存档样本', effects:[rule]}});
  equip(first); await imported(4); equip(second);
  for (let i = 0; i < 3; i++) context.addCustom([rule]);
  const ids = () => Array.from(get('selectionOrder').value, row => row.id);
  const full = ids();
  assert.equal(get('relicCount').value, 6);
  equip(third); await imported(5); context.addCustom([rule]);
  context.editRelic('custom:1'); context.addCustom([get('customChoices').value[1]]);
  assert.deepEqual(ids(), full);
  assert.equal(get('savedRelics').value.length, 4);
  context.toggleEffect('relic', first.id, false); await imported(5);
  assert.deepEqual(ids(), [...full.slice(1), 'instance:5']);
});

test('the two Balancers relics apply their melee-weapon and skill rules to the Halo projectile', async t => {
  const { context, get } = await createCalculator(t, true);
  const base = get('result').value.total;
  for (const name of ['安定者的遗志', '安定的遗志']) {
    const relic = get('relics').value.find(item => item.name === name);
    context.toggleEffect('relic', relic.id, true);
    assert.ok(Math.abs(get('result').value.total - base * 1.06 * 1.15) < 1e-8);
    context.toggleEffect('relic', relic.id, false);
  }
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
  assert.ok(ids().includes(8810050) && ids().includes(8850650) && ids().includes(8850550));
  context.addWeaponTrait(8850650);
  assert.ok(!ids().includes(8850550), 'same special slot cannot grant physical and elemental bonuses');
  context.addWeaponTrait(8100402);
  assert.ok(!ids().includes(8350002), 'same standard slot cannot grant holy and skill bonuses');
  context.addWeaponTrait(8810050);
  get('picker').value = 'trait';
  assert.ok(get('equipmentTraits').value.some(item => item.polarity === 'negative' && item.detail.includes('负面词条')));
  const corpse = get('availableWeaponTraits').value.find(item => item.polarity === 'corpse');
  context.addWeaponTrait(corpse.id);
  assert.equal(get('weaponTraitSlots').value.length, 4);
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

test('a weapon trait also visible in temporary effects is applied only once; non-damage traits are not damage gaps', async t => {
  const { context, get } = await createCalculator(t);
  const trait = context.traitOptions().find(item => item.calculationStatus === 'supported' && item.effectIds.length);
  assert.ok(trait);
  const choice = get('effectChoices').value.find(item => item.effects.some(effect => trait.effectIds.includes(effect.id)));
  assert.ok(choice);
  context.toggleEffect('effect', choice.id, true);
  context.addWeaponTrait(trait.id);
  for (const id of trait.effectIds) assert.equal(get('selectedEffects').value.filter(item => item.id === id).length, 1);
  assert.equal(context.providedByWeapon(choice), true);
  const hidden = get('traits').value.filter(item => ['missing-rule', 'non-damage'].includes(item.calculationStatus) || item.name.includes('致命一击'));
  assert.ok(hidden.some(item => item.name.includes('致命一击')));
  assert.ok(hidden.some(item => item.name.includes('附加异常状态')));
  const available = new Set(context.traitOptions().map(item => item.id));
  assert.ok(hidden.every(item => !available.has(item.id)));
  context.addWeaponTrait(hidden[0].id);
  assert.equal(get('weaponTraitSlots').value.length, 1);
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
