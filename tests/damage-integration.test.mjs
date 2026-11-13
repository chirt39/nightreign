import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateDamage, calculatePanel } from '../src/lib/damage-calculator.js';

const load = name => JSON.parse(readFileSync(new URL('../public/damage-' + name + '.json', import.meta.url)));
const { actions } = load('actions'), catalog = load('panel'), { effects } = load('effects');
const monster = load('targets').targets.find(target => target.id === '44700010a');
const input = {panel:calculatePanel({catalog,characterId:'1',variantId:'1000000',level:15,reinforcement:0}),
  weaponPhysicalTypes:catalog.variants['1000000'].physicalTypes,weaponType:'1',
  target:{taken:monster.taken,defense:monster.baseDefense},allowReferenceDefense:true};

test('dagger attack against an Abductor Virgin reacts to the physical relic once',()=>{
  const strike=actions.find(action=>action.id==='motion-20-variation-100-animation-30000');
  assert.ok(strike);
  const opts={...input, segments:strike.segments};
  const base=calculateDamage(opts);
  assert.equal(base.kind,'hp');
  const effect=effects.find(entry=>entry.nativeEffectId===7001400);
  const modified=calculateDamage({...opts,effects:[effect]});
  assert.ok(Math.abs(modified.total/base.total-1.04)<1e-8);
  assert.deepEqual(modified.rows[0].applied,[effect.name]);
  assert.equal(calculateDamage({...opts,manualPanel:true,panel:{...input.panel}}).total,base.total);
});

test('Double Slash switches to the actual variant physical type and sums only selected contacts',()=>{
  const art=actions.find(action=>String(action.artId)==='112' && action.segments.length>2);
  const known=art.segments.filter(s=>s.rates);
  const opts={...input,segments:art.segments};
  const all=calculateDamage({...opts,selectedSegmentIds:known.map(s=>s.id)});
  assert.equal(all.kind,'hp');
  assert.equal(all.rows[0].physicalType,'slash');
  const drop=calculateDamage({...opts,selectedSegmentIds:known.slice(1).map(s=>s.id)});
  assert.ok(Math.abs(all.total-drop.total-all.rows[0].total)<1e-8);
});

test('Storm Ruler does not inherit all five 200% channels from a shared attack record',()=>{
  const art=actions.find(action=>String(action.artId)==='1200');
  assert.equal(calculateDamage({...input,segments:art.segments}).kind,'unavailable');
});

test('shown projectile equation follows the active target and excludes an ineligible bonus', () => {
  const segment = actions.flatMap(a => a.segments).find(s => s.evidence?.atkParamId === 301902901 && s.projectile);
  const projectileContext = { catalog, variantId:'19020000', characterId:'1', level:15, reinforcement:0 };
  const bonus = {id:'holy',name:'测试圣加成',rate:1.12,phase:'final',channels:['holy']};
  const setup = { segments:[segment], projectileContext, effects:[bonus,{...bonus,id:'fire',name:'火',channels:['fire']}],
    target:{defense:{holy:100},taken:{holy:.8},useTakenEstimate:true},allowReferenceDefense:true };
  const result = calculateDamage(setup);
  const step = result.rows[0].formula.holy;
  const {base,reinforcement,correction,commonScale} = step.projectile;
  assert.equal(base,170);
  assert.equal(reinforcement,1.5);
  assert.equal(base*reinforcement*correction*commonScale,step.beforeDefense);
  assert.deepEqual(step.finalFactors,[{name:bonus.name,factor:1.12}]);
  assert.equal(step.beforeDefense*step.taken*1.12,result.total);
  const manual = calculateDamage({...setup,target:{...setup.target,useTakenEstimate:false}});
  const curve = manual.rows[0].formula.holy;
  assert.equal(curve.defense,100);
  assert.equal(curve.afterCurve*curve.taken*1.12,manual.total);
});
