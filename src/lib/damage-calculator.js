import { calculateProjectileBase, hasAutomaticProjectile } from './damage-panel.js';
import { DAMAGE_DEFENSE_MODEL, resolveDamageChannel } from './damage-defense.js';
export { calculatePanel } from './damage-panel.js';

const channels = ['physical', 'magic', 'fire', 'lightning', 'holy'];
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const blankResult = missing => ({ kind: 'unavailable', basis: null, total: null, rows: [], missing });

function resolveOverrides(effects) {
  const lastByGroup = new Map();
  for (const effect of effects) {
    if (effect.exclusiveGroup) lastByGroup.set(effect.exclusiveGroup, effect.buffId ?? effect.id);
  }
  return effects.filter(effect => !effect.exclusiveGroup ||
    lastByGroup.get(effect.exclusiveGroup) === (effect.buffId ?? effect.id));
}

function activeEffects(input, segment) {
  const conditions = new Set(Array.isArray(input.conditions) || input.conditions instanceof Set
    ? input.conditions : Object.keys(input.conditions ?? {}).filter(key => input.conditions[key]));
  const eligible = (input.effects ?? []).filter(effect => {
    if (!numeric(effect.rate) || effect.rate === 1) return false;
    if (input.manualPanel && effect.phase === 'panel') return false;
    if (effect.conditions?.some(condition => !conditions.has(condition))) return false;
    if (effect.characterIds?.length && !effect.characterIds.map(String).includes(String(input.characterId))) return false;
    if (effect.artIds?.length && !effect.artIds.map(String).includes(String(input.artId))) return false;
    if (effect.weaponIds?.length && !effect.weaponIds.map(String).some(id => [String(input.weaponId), String(input.variantId)].includes(id))) return false;
    return true;
  });
  const tags = new Set(segment.tags);
  if (input.weaponType != null) tags.add('heldWeaponType:' + input.weaponType);
  return resolveOverrides(eligible).filter(effect =>
    (!effect.tags?.length || effect.tags.every(tag => tags.has(tag))) &&
    (!effect.anyTags?.length || effect.anyTags.some(tag => tags.has(tag)))).flatMap(effect => {
    if (!effect.useHitDamageCorrection) return [effect];
    const percent = segment.evidence?.spEffectDamageCorrectionPercent;
    if (!numeric(percent) || percent === 0) return [];
    return [percent === 100 ? effect : { ...effect, rate: 1 + (effect.rate - 1) * percent / 100 }];
  });
}

// Non-stacking groups pick their active member per channel and phase.
function scale(value, effects, phase, channel, applied, factors) {
  if (!value) return value;
  const groups = new Map();
  for (const effect of effects) {
    if (effect.phase !== phase || (effect.channels?.length && !effect.channels.includes(channel))) continue;
    const key = effect.stackGroup || effect.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(effect);
  }
  for (const members of groups.values()) {
    const rule = members[0].stackRule || 'multiply';
    if (rule === 'highest') {
      const winner = members.reduce((a, b) => b.rate > a.rate ? b : a);
      applied.add(winner.name);
      factors.push({ name: winner.name, factor: winner.rate });
      value *= winner.rate;
    } else {
      for (const member of members) applied.add(member.name);
      const factor = rule === 'add'
        ? 1 + members.reduce((sum, effect) => sum + effect.rate - 1, 0)
        : members.reduce((product, effect) => product * effect.rate, 1);
      factors.push({ name: members.map(member => member.name).join('、'), factor });
      value *= factor;
    }
  }
  return value;
}

function prepareHit(segment, input) {
  const inherited = segment.evidence?.physicalTypeWeaponField;
  const physicalType = segment.physicalType ?? input.weaponPhysicalTypes?.[inherited] ?? null;
  const row = {physicalType, id: segment.id, name: segment.name, hits: segment.hits ?? 1, formula: {}, total: null, channels: {}, activeChannels: [], applied: [], missing: []};
  const effects = activeEffects(input, segment), applied = new Set();
  const projectileFactors = {};
  let rates = segment.rates;
  let base = segment.flat;
  if (!rates && hasAutomaticProjectile(segment)) {
    base = calculateProjectileBase(segment, input.projectileContext, projectileFactors);
    if (!base) {
      row.missing.push('缺少弹体所需的角色、等级或武器品质数据');
      return {row};
    }
    rates = Object.fromEntries(channels.map(key => [key, 0]));
    row.projectileEstimate = true;
  } else if (!rates && segment.manualChannels?.length) {
    const provided = input.projectileInputs?.[segment.id];
    if (!segment.manualChannels.every(key => channels.includes(key) && numeric(provided?.[key]))) {
      row.missing.push('缺少弹体的防御前伤害分量');
      return {row};
    }
    rates = Object.fromEntries(channels.map(key => [key, 0]));
    base = Object.fromEntries(segment.manualChannels.map(key => [key, provided[key]]));
    row.manualProjectile = true;
  }
  if (!rates || !Number.isInteger(row.hits) || row.hits < 1) {
    row.missing.push('缺少已核实的命中数据');
    return {row};
  }
  for (const channel of channels) {
    const rate = rates[channel], flat = base?.[channel] ?? 0;
    if (!numeric(rate) || !numeric(flat)) { row.missing.push('缺少属性攻击数据'); break; }
    if (rate && !numeric(input.panel?.[channel])) { row.missing.push('缺少武器面板'); break; }
    if (!rate && !flat) { row.channels[channel] = 0; continue; }
    const formula = { panel: rate ? input.panel[channel] : null, rate, flat, projectile: projectileFactors[channel],
      panelFactors: [], hitFactors: [], finalFactors: [], enchant: 0 };
    row.formula[channel] = formula;
    let weaponPart = rate ? scale(input.panel[channel], effects, 'panel', channel, applied, formula.panelFactors) * rate : 0;
    const enchant = input.weaponEnchant;
    if (!input.manualPanel && enchant?.useAtkParamAttackPowerCorrect && segment.tags?.includes('weaponAttack') &&
        segment.inputStage === enchant.inputStage && enchant.additiveAttack?.[channel] > 0 && rate > 0) {
      formula.enchant = enchant.additiveAttack[channel];
      weaponPart += formula.enchant * rate;
      applied.add('炎击火焰附魔');
    }
    row.channels[channel] = scale(weaponPart + flat, effects, 'hit', channel, applied, formula.hitFactors);
    formula.beforeDefense = row.channels[channel];
  }
  if (row.missing.length) row.channels = {};
  row.applied = [...applied];
  row.activeChannels = channels.filter(channel => row.channels[channel] > 0);
  return {row, effects, applied};
}

export function calculateDamage(input) {
  const selected = new Set(input.selectedSegmentIds ?? (input.segments ?? []).map(s => s.id));
  const hits = (input.segments ?? []).filter(segment => selected.has(segment.id)).map(s => prepareHit(s, input));
  if (!hits.length) return blankResult(['请选择命中段']);
  const usable = hits.filter(hit => !hit.row.missing.length);
  const target = input.target;
  const missing = new Set(hits.flatMap(hit => hit.row.missing));
  const referenceModel = DAMAGE_DEFENSE_MODEL.verified !== true;
  // Atlas targets currently share the comparison dummy's 100 base defense.
  // Predict from relative susceptibility; explicit defense uses the separate curve.
  const relativeTarget = target?.useTakenEstimate === true;
  function targetDamage(amount, channel, type) {
    const rate = target?.taken?.[type];
    if (relativeTarget && target.defense?.[channel] === 100) return numeric(rate) ? amount * rate : null;
    return resolveDamageChannel(amount, target?.defense?.[channel], rate);
  }
  let postDefense = Boolean(target) && (!referenceModel || input.allowReferenceDefense === true);
  for (const {row} of usable) {
    for (const channel of channels.filter(key => row.channels[key] > 0)) {
      const type = channel === 'physical' ? row.physicalType : channel;
      const damage = targetDamage(row.channels[channel], channel, type);
      if (!numeric(damage)) {
        postDefense = false;
        if (target) missing.add('目标防御、受伤倍率或攻击类型不完整');
      }
    }
  }
  let total = 0;
  for (const {row, effects, applied} of usable) {
    if (!postDefense && effects.some(effect => effect.phase === 'final' &&
      channels.some(ch => row.channels[ch] > 0 && (!effect.channels?.length || effect.channels.includes(ch))))) {
      row.missing.push('防御后生效的加成未计入防御前伤害');
      missing.add(row.missing.at(-1));
    }
    let singleHit = 0;
    for (const channel of channels) {
      let amount = row.channels[channel];
      if (postDefense && amount > 0) {
        const type = channel === 'physical' ? row.physicalType : channel;
        const formula = row.formula[channel];
        formula.taken = target.taken[type];
        if (!(relativeTarget && target.defense[channel] === 100)) {
          formula.defense = target.defense[channel];
          formula.afterCurve = resolveDamageChannel(amount, formula.defense, 1);
        }
        amount = targetDamage(amount, channel, type);
        amount = scale(amount, effects, 'final', channel, applied, formula.finalFactors);
      }
      singleHit += amount;
      row.channels[channel] = amount * row.hits;
    }
    // Keep full precision for comparisons; the preview formats the display value.
    row.total = singleHit * row.hits;
    row.applied = [...applied];
    total += row.total;
  }
  const basis = postDefense ? 'hp' : 'beforeDefense';
  return {
    kind: usable.length === 0 ? 'unavailable' : usable.length < hits.length ? 'partial' : basis,
    projectileEstimate: usable.some(({row}) => row.projectileEstimate),
    referenceEstimate: postDefense && referenceModel, basis: usable.length ? basis : null, total: usable.length ? total : null,
    rows: hits.map(hit => hit.row), missing: [...missing],
  };
}
