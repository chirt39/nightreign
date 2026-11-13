import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDamage } from '../src/lib/damage-calculator.js';

const five = (physical, fire = 0) => ({ physical, magic:0, fire, lightning:0, holy:0 });
const blade = {id:'blade', name:'刀身', physicalType:'slash', tags:['skill','melee'], hits:1, rates:five(1),flat:five(10)};
const wave = {id:'wave', name:'剑气', physicalType:null, tags:['skill','projectile'],hits:2,rates:five(0,1)};
const action = {panel:five(100,50),segments:[blade,wave],selectedSegmentIds:['blade','wave']};

test('mixed damage: use only selected hits, eligible effects and active conditions',()=>{
  const effects = [
    {id:'f',name:'火属性剑气',phase:'hit',rate:1.2,channels:['fire'],tags:['projectile'],conditions:['满血']},
    {id:'p',name:'刀身',phase:'hit',rate:1.1,tags:['melee'],channels:['physical']},
  ];
  const withBuff = calculateDamage({...action,effects,conditions:['满血']});
  assert.equal(withBuff.kind,'beforeDefense');
  assert.ok(Math.abs(withBuff.total-241)<1e-8);
  assert.deepEqual(withBuff.rows.map(x=>x.applied),[['刀身'],['火属性剑气']]);
  assert.equal(calculateDamage({...action,selectedSegmentIds:['wave'],effects,conditions:[]}).total,100);
});

test('a captured panel already includes panel buffs, and flat attack is independent of weapon scaling',()=>{
  const effects = [{id:'f',name:'物理面板',phase:'panel',rate:1.25,channels:['physical']}];
  const normal = calculateDamage({...action,effects,selectedSegmentIds:['blade']});
  const manual = calculateDamage({...action,manualPanel:true,panel:five(125,50),effects,selectedSegmentIds:['blade']});
  assert.equal(normal.total,135);
  assert.equal(manual.total,normal.total);
  assert.deepEqual(manual.rows[0].applied,[]);
});

test('an unknown selected strike yields a subtotal; selecting only unknown strikes never yields zero',()=>{
  const unknown={id:'unknown',name:'风暴派生',rates:null};
  const mixed = calculateDamage({...action,segments:[blade,unknown],selectedSegmentIds:['blade','unknown']});
  assert.equal(mixed.kind,'partial');
  assert.equal(mixed.basis,'beforeDefense');
  assert.equal(mixed.total,110);
  assert.equal(mixed.rows[1].total,null);
  assert.equal(calculateDamage({...action,segments:[unknown],selectedSegmentIds:['unknown']}).total,null);
});

test('missing fire defense downgrades the whole split hit to one consistent pre-defense scale',()=>{
  const target={defense:{physical:60,fire:null},taken:{slash:0.4,fire:0.5}};
  const result=calculateDamage({...action,target});
  assert.equal(result.kind,'beforeDefense');
  assert.equal(result.total,210);
});
test('same-group temporary buffs replace the whole previous effect, with exact per-hit subtype gates',()=>{
  const effects = [
    {id:'old',name:'旧状态',exclusiveGroup:'body',rate:1.5,phase:'hit',channels:['fire']},
    {id:'new',name:'新状态',exclusiveGroup:'body',rate:1.2,phase:'hit',anyTags:['atkSubCategory:111','atkSubCategory:112']},
  ];
  const result=calculateDamage({...action,effects,segments:[blade,{...wave,tags:['projectile','atkSubCategory:112']}]});
  assert.equal(result.total,230);
  assert.deepEqual(result.rows.map(row=>row.applied),[[],['新状态']]);
});

test('immune channels deal zero even when attack and final bonuses are nonzero',()=>{
  const result=calculateDamage({...action,target:{defense:five(0,0),taken:{slash:0,fire:0}},
    allowReferenceDefense:true,effects:[{id:'buff',name:'测试终伤',phase:'final',rate:2}]});
  assert.equal(result.kind,'hp');
  assert.equal(result.total,0);
});
