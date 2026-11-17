const channels = {physical:'物理', magic:'魔力', fire:'火', lightning:'雷', holy:'圣'};
const tags = {weaponAttack:'武器攻击', sorcery:'魔法', incantation:'祷告', piercingCounter:'突刺反击', 'atkSubCategory:100':'蓄力攻击命中段'};
const unique = values => [...new Set(values.filter(Boolean))];
const percent = rate => `${rate >= 1 ? '+' : ''}${Math.round((rate - 1) * 10000) / 100}%`;

// Presentation follows the same rules the calculator consumes, not percentages
// parsed from item descriptions. Icons are matched separately by native buff ID.
export function describeDamageBuff(item, choices = []) {
  const rules = item.effects;
  const bonuses = unique(rules.map(rule => {
    const names = rule.channels?.length === 5 ? '全属性' : (rule.channels || []).map(key => channels[key]).join('／');
    return `${rule.countScaling?.type === 'native-instances' ? '每层' : ''}${names}${rule.phase === 'panel' ? '面板攻击力' : '伤害'} ${percent(rule.rate)}`;
  }));
  const durations = unique(rules.map(rule => rule.durationSeconds)).map(seconds => `${seconds} 秒`);
  const scopes = unique(rules.flatMap(rule => [
    ...(rule.tags || []).map(tag => tags[tag]),
    rule.anyTags?.map(tag => tags[tag]).filter(Boolean).join('或'),
  ]));
  const conditions = unique(rules.flatMap(rule => rule.conditions || []));
  const peers = unique(choices.filter(other => other.id !== item.id && item.exclusiveGroup && other.exclusiveGroup === item.exclusiveGroup).map(other => other.name));
  const details = [{label:'伤害加成', value:bonuses.join('；')}];
  const acquisition = unique(rules.map(rule => rule.acquisition));
  if (acquisition.length) details.push({label:'获得条件', value:acquisition.join('；')});
  const counted = rules.find(rule => rule.countScaling?.type === 'native-instances');
  if (counted) {
    details.push({label:'累计规则', value:`逐层相乘，倍率约为 ${counted.countScaling.rate}ⁿ；n 为生效层数，最多 ${counted.countMax} 层。`});
    if (counted.description) details.push({label:'计数范围', value:counted.description});
  }
  if (durations.length) details.push({label:'持续时间', value:durations.join('／')});
  if (scopes.length) details.push({label:'适用攻击', value:scopes.join('；')});
  if (rules.some(rule => rule.useHitDamageCorrection)) details.push({label:'命中段限制', value:'加成按各命中段的增益适用倍率计算，部分命中段可能不生效。'});
  if (conditions.length) details.push({label:'生效条件', value:conditions.join('；')});
  if (peers.length) details.push({label:'覆盖关系', value:`与${peers.join('、')}互相覆盖，保留后选的增益。`});
  if (rules.every(rule => rule.stackRule === 'highest')) details.push({label:'重复效果', value:counted ? '同一奖励的层数汇总只计算一次。' : '同一效果不叠加；临时增益再次触发时刷新持续时间。'});
  if (rules.some(rule => rule.kind === 'reward')) details.push({label:'叠加关系', value:'作为独立局内奖励，与武器附带词条分别计算；当前每项奖励仅选择一次。'});
  return {detail:[...bonuses, ...durations].join(' · '), details, searchText:unique(rules.flatMap(rule => rule.searchTerms || [])).join(' ')};
}
