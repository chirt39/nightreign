import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { describeDamageBuff } from '../src/lib/damage-buff-details.js';

const data = JSON.parse(fs.readFileSync(new URL('../public/damage-effects.json', import.meta.url)));
const icons = JSON.parse(fs.readFileSync(new URL('../public/damage-buff-icons.json', import.meta.url)));
const choices = [...new Set(data.effects.filter(rule => ['buff','reward','event'].includes(rule.kind)).map(rule => rule.buffId))].map(id => {
  const effects = data.effects.filter(rule => rule.buffId === id);
  return {id, effects, name:effects[0].name, exclusiveGroup:effects[0].exclusiveGroup};
});
const describe = id => describeDamageBuff(choices.find(item => item.id === id), choices);

test('buff details retain exact fractional percentages, duration and hit scope', () => {
  assert.match(describe('art:603').detail, /11\.5%.*45 秒/);
  assert.match(describe('art:1197').detail, /12\.5%.*30 秒/);
  assert.match(describe('art:1010').details.find(row => row.label === '命中段限制').value, /各命中段/);
  assert.match(describe('goods:11014').details.find(row => row.label === '适用攻击').value, /蓄力攻击/);
  assert.match(describe('reward:8330103').details.find(row => row.label === '适用攻击').value, /魔法或祷告/);
  assert.match(describe('magic:6050').detail, /物理／火伤害 \+20%/);
  assert.ok(describe('event:4').details.some(row => row.label === '生效条件' && row.value.includes('冻伤')));
  assert.match(describe('event:8970000').detail, /每层全属性伤害 \+2%/);
  assert.match(describe('event:8970000').details.find(row => row.label === '累计规则').value, /1\.02ⁿ.*10 层/);
  assert.match(describe('event:8970000').details.find(row => row.label === '计数范围').value, /获得奖励前/);
});

test('whole-buff replacement lists exact peer effects instead of saying all bonuses stack', () => {
  const detail = describe('goods:1210').details.find(row => row.label === '覆盖关系').value;
  assert.match(detail, /狂热香药/);
  assert.match(detail, /火焰啊，赐予我力量/);
  assert.ok(!detail.includes('黄金树立誓'));
  assert.ok(describe('event:4').details.some(row => row.label === '重复效果' && row.value.includes('不叠加')));
});

test('each supported selectable buff uses a verified native icon file', () => {
  for (const item of choices) {
    const icon = icons.icons[item.id];
    assert.ok(icon?.image, item.id);
    assert.ok(Number.isInteger(icon.iconId));
    assert.ok(fs.existsSync(new URL('../public' + icon.image, import.meta.url)), icon.image);
  }
});
