import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { damageShowcase } from '../src/lib/damage-showcase.js';
import { calculateDamage } from '../src/lib/damage-calculator.js';

const load = file => JSON.parse(fs.readFileSync(new URL('../public/'+file, import.meta.url)));
test('every selectable weapon variant has the actual weapon and compatible art portraits', () => {
  const weapons = load('weapon-catalog.json').weapons, arts = load('arts-catalog.json').entries;
  const images = load('weapon-image-manifest.json').images;
  assert.deepEqual(new Set(damageShowcase.map(x => x.artId)), new Set(['1051','1177','112','214','1017','1037']));
  for (const item of damageShowcase) {
    const variant = weapons.find(x => x.id === item.weaponId).variants.find(x => x.id === item.variantId);
    const art = arts.find(x => x.id === item.artId);
    assert.ok(variant.skill.itemIds.includes(item.artId), item.name);
    assert.equal(item.weaponImage, images[variant.iconId].src);
    assert.equal(item.artImage, art.image);
    for (const path of [item.weaponImage,item.artImage,...item.statuses.map(s=>s.icon)]) {
      assert.ok(fs.existsSync(new URL('../public'+path,import.meta.url)), path);
    }
  }
});

test('unknown projectile scaling requires every verified channel; raw attack and other input channels are not substitutes', () => {
  const projectile={id:'ring',name:'光环',physicalType:null,tags:['projectile'],rates:null,manualChannels:['holy'],hits:1};
  const input={segments:[projectile],panel:{holy:999},selectedSegmentIds:['ring']};
  assert.equal(calculateDamage(input).total,null);
  assert.equal(calculateDamage({...input,projectileInputs:{ring:{magic:170}}}).total,null);
  const result=calculateDamage({...input,projectileInputs:{ring:{holy:240,magic:40}}});
  assert.equal(result.total,240);
  assert.deepEqual(result.rows[0].activeChannels,['holy']);
  assert.equal(result.rows[0].manualProjectile,true);
  assert.equal(calculateDamage({...input,projectileInputs:{ring:{holy:0}}}).total,0);
});
test('Flaming Strike adds the selected weapon enchant once on its follow-up and never re-adds it to a captured panel', () => {
  const action = load('damage-actions.json').actions.find(x => x.artId === '214' && x.scope.enoughFp);
  const blade = action.segments.find(s => s.rates?.fire > 0 && s.inputStage === 2);
  const enchant = action.appliedWeaponEffects[0];
  const input = { segments:[blade], panel:{physical:95,fire:80,magic:0,lightning:0,holy:0} };
  const plain = calculateDamage(input).total;
  const withEnchant = calculateDamage({...input,weaponEnchant:enchant});
  assert.ok(Math.abs(withEnchant.total-plain-35*1.78) < 1e-8);
  assert.ok(withEnchant.rows[0].applied.includes('炎击火焰附魔'));
  const manual = calculateDamage({...input,manualPanel:true,weaponEnchant:enchant,panel:{...input.panel,fire:115}});
  assert.ok(Math.abs(manual.total-withEnchant.total)<1e-8);
});

const panelCatalog = load('damage-panel.json');
const nativeActions = load('damage-actions.json').actions;
function projectileInput(attackId, context = {}) {
  const segment = nativeActions.flatMap(action => action.segments)
    .find(item => item.evidence?.atkParamId === attackId && item.projectile);
  return { segments: [segment], projectileContext: { catalog:panelCatalog, variantId:segment.evidence.weaponVariantId,
    characterId:'1', level:15, reinforcement:0, ...context } };
}

test('native purple single hits reproduce ten Lv15 no-relic training observations for each branch', () => {
  // Funa, 2026-01-16. The chart distinguishes ranged Halo from close contact.
  const heroes = ['1','5','3','2','8','10','4','6','7','9'];
  const observations = [
    [301902901, [323,279,339,298,351,283,317,291,278,232]],
    [300116900, [482,398,528,446,547,410,494,439,423,353]],
    [300107901, [287,227,308,253,328,204,311,239,252,225]],
    [300107900, [352,279,378,311,402,251,381,293,309,276]],
  ];
  for (const [attackId, expected] of observations) {
    assert.deepEqual(heroes.map(characterId => Math.floor(calculateDamage(projectileInput(attackId,{characterId})).total)), expected);
  }
});

test('projectile damage follows selected stats and one reinforcement row, independently of typed weapon AR', () => {
  for (const id of [301902901,301902911,301902921,300116900,300107900,300107901]) {
    const base = calculateDamage(projectileInput(id));
    assert.equal(base.projectileEstimate,true);
    assert.equal(calculateDamage({...projectileInput(id),panel:{holy:9999},manualPanel:true}).total,base.total);
    assert.ok(calculateDamage(projectileInput(id,{level:12})).total < base.total);
    assert.ok(calculateDamage(projectileInput(id,{statGains:{dexterity:3}})).total > base.total);
    const gold = calculateDamage(projectileInput(id,{quality:'volcano'})).total;
    assert.ok(gold > base.total);
    assert.equal(calculateDamage(projectileInput(id,{reinforcement:1})).total,gold);
    const red = calculateDamage(projectileInput(id,{quality:'red'}));
    assert.ok(Math.abs(red.total - base.total * 1.07) < 1e-8);
    const channel = red.rows[0].activeChannels[0];
    assert.equal(red.rows[0].formula[channel].projectile.qualityRate, 1.07);
  }
});

test('recipient buffs use the landed Halo hit; weaker recasts replace the entire aura; hand traits do not affect the ring', () => {
  const effects = load('damage-effects.json').effects;
  const select = key => effects.find(e => e.buffId === key);
  const army = select('art:1010'), skill = select('art:603'), prayer = select('magic:6600'), shield = select('art:1197');
  const hand = effects.find(e => e.nativeEffectId === 8300000);
  const i = {...projectileInput(301902901), target:{defense:{holy:100},taken:{holy:1},useTakenEstimate:true},allowReferenceDefense:true};
  const total = (effects, conditions = effects.flatMap(e => e.conditions || [])) => calculateDamage({...i,effects,conditions}).total;
  const base = total([]);
  for (const [chosen,mult] of [[[army],1.2], [[army,skill],1.115], [[army,prayer],1.15], [[skill,army,shield],1.2*1.125], [[hand],1]]) {
    assert.ok(Math.abs(total(chosen)-base*mult)<1e-8);
  }
  assert.equal(total([army],[]),base);
  const action = nativeActions.find(a => a.segments.some(s=>s.evidence?.atkParamId === 100200));
  const hit = action.segments.find(s=>s.evidence?.atkParamId === 100200);
  const swing = {panel:{physical:100,magic:0,holy:0,fire:0,lightning:0}, segments:[hit], weaponPhysicalTypes:{atkAttribute:'slash',atkAttribute2:'slash'},
    target:{defense:{physical:100},taken:{normal:1,slash:1,thrust:1,strike:1},useTakenEstimate:true},allowReferenceDefense:true};
  const normal = calculateDamage(swing).total;
  assert.ok(normal>0);
  assert.ok(Math.abs(calculateDamage({...swing,effects:[hand]}).total-normal*1.12)<1e-8);
  for (const pct of [0,50]) {
    const adjusted = {...hit,evidence:{...hit.evidence,spEffectDamageCorrectionPercent:pct}};
    assert.ok(Math.abs(calculateDamage({...swing,segments:[adjusted],effects:[hand]}).total-normal*(1+.12*pct/100))<1e-8);
  }
});

test('Flaming Strike fire uses 51040 strength override; other weapon stats do not scale this flame', () => {
  const get = gains => calculateDamage(projectileInput(300200821,{statGains:gains})).total;
  assert.ok(Math.abs(get({}) - 138*1.23*.6*(1+.25*50/33)) < 1e-8);
  assert.ok(get({strength:3}) > get({}));
  assert.equal(get({dexterity:9,faith:4}), get({}));
});

test('atlas target estimate scales one contact by its actual susceptibility; explicit defense follows the separate curve', () => {
  const i = projectileInput(300116900);
  const base = calculateDamage(i).total;
  const target = {defense:{holy:100},taken:{holy:.8},useTakenEstimate:true};
  const buff = {id:'holy',name:'圣属性',phase:'final',channels:['holy'],rate:1.1};
  const result = calculateDamage({...i,target,effects:[buff],allowReferenceDefense:true});
  assert.ok(Math.abs(result.total-base*.8*1.1)<1e-7);
  assert.equal(result.kind,'hp');
  assert.deepEqual(result.rows[0].applied,['圣属性']);
  assert.ok(calculateDamage({...i,target:{...target,useTakenEstimate:false},allowReferenceDefense:true}).total < base*.8);
});
