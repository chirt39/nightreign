const ELEMENTS = ['physical', 'magic', 'fire', 'lightning', 'holy'];
const STATS = ['strength', 'dexterity', 'intelligence', 'faith', 'arcane'];
const finite = value => typeof value === 'number' && Number.isFinite(value);

// The shipped weapon curves are piecewise linear (all adjPt exponents are 1).
// Repeated final knots are legal in NR's single-segment curves 4 and 16.
function correction(graph, value) {
  if (!graph || !finite(value) || !Array.isArray(graph.points)
      || !Array.isArray(graph.exponents) || graph.exponents.some(x => x !== 1)) return null;
  const points = graph.points;
  if (points.length !== 5 || points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(finite))) return null;
  if (value < points[0][0] || value > points.at(-1)[0]) return null;
  if (value === points[0][0]) return points[0][1] / 100;
  for (let i = 1; i < points.length; i += 1) {
    const [left, low] = points[i - 1];
    const [right, high] = points[i];
    if (right > left && value <= right) return (low + (high - low) * (value - left) / (right - left)) / 100;
  }
  return null;
}

function resolveWeaponStats({ catalog, variantId, characterId, level, reinforcement,
  statGains = {}, quality = 'native' } = {}) {
  if (!catalog || catalog.schemaVersion !== 1 || !Number.isInteger(level)
      || !Number.isInteger(reinforcement) || !catalog.levels?.includes(level)) return null;
  const variant = catalog.variants?.[String(variantId)];
  const stats = catalog.characterStats?.[String(characterId)]?.[String(level)];
  if (!variant || !stats || !Array.isArray(variant.unavailableReasons)
      || variant.unavailableReasons.length || !variant.reinforcements?.includes(reinforcement)) return null;
  if (!['native', 'volcano', 'red'].includes(quality) || !statGains || typeof statGains !== 'object' || Array.isArray(statGains)) return null;
  let targetReinforcement = reinforcement;
  let panelRate = 1;
  if (quality === 'red') {
    const profile = variant.qualityProfile;
    if (!profile?.redAvailable || !variant.reinforcements.includes(profile.redReinforcement) ||
        !finite(catalog.redQuality?.panelRate) || catalog.redQuality.panelRate <= 0) return null;
    targetReinforcement = profile.redReinforcement;
    panelRate = catalog.redQuality.panelRate;
  }
  if (quality === 'volcano') {
    const profile = variant.qualityProfile;
    if (!profile?.canVolcano || !Number.isInteger(profile.volcanoReinforcement)
        || !variant.reinforcements.includes(profile.volcanoReinforcement)) return null;
    targetReinforcement = profile.volcanoReinforcement;
  }
  const effectiveStats = {};
  for (const stat of STATS) {
    const gain = statGains[stat] === undefined ? 0 : statGains[stat];
    if (!Number.isInteger(gain) || !finite(stats[stat])) return null;
    effectiveStats[stat] = stats[stat] + gain;
    if (!Number.isSafeInteger(effectiveStats[stat]) || effectiveStats[stat] < 0) return null;
  }
  const upgrade = catalog.reinforcementRows?.[String(Number(variant.reinforceTypeId) + targetReinforcement)];
  const element = catalog.elementCorrections?.[variant.elementCorrectionId];
  if (!upgrade || !element || STATS.some(stat => !finite(stats[stat]) || stats[stat] < 0)) return null;
  return { catalog, variant, upgrade, element, effectiveStats, targetReinforcement, panelRate };
}

function attackCorrection({ catalog, variant, upgrade, element, effectiveStats }, type) {
  const graph = catalog.correctionGraphs?.[variant.correctionGraphIds?.[type]];
  let bonus = 0;
  for (const stat of STATS) {
    const rule = element[type]?.[stat];
    if (!rule || typeof rule.enabled !== 'boolean') return null;
    if (!rule.enabled) continue;
    const rawCoefficient = rule.override >= 0 ? rule.override : variant.scaling?.[stat];
    const scalingRate = upgrade.scaling?.[stat];
    const growth = correction(graph, effectiveStats[stat]);
    if (!finite(rule.override) || !finite(rule.influence) || !finite(rawCoefficient)
        || rawCoefficient < 0 || !finite(scalingRate) || scalingRate < 0 || growth === null) return null;
    const influence = rule.influence / 100;
    bonus += influence - 1 + rawCoefficient / 100 * scalingRate * growth * influence;
  }
  return 1 + bonus;
}

export function calculatePanel(input) {
  const stats = resolveWeaponStats(input);
  if (!stats) return null;
  const { variant, upgrade } = stats;
  const result = {};
  for (const type of ELEMENTS) {
    const rawBase = variant.attack?.[type];
    const attackRate = upgrade.attack?.[type];
    if (!finite(rawBase) || rawBase < 0 || !finite(attackRate) || attackRate < 0) return null;
    if (rawBase === 0) { result[type] = 0; continue; }
    const factor = attackCorrection(stats, type);
    if (factor === null) return null;
    const attack = rawBase * attackRate * factor * stats.catalog.observedAttackScale * stats.panelRate;
    if (!finite(attack) || attack < 0) return null;
    result[type] = Math.floor(attack);
  }
  return result;
}

// These additive bullets inherit the weapon's elemental stat correction. Their
// base uses ReinforceParamWeapon.baseAtkRate, independently of displayed AR.
export function hasAutomaticProjectile(segment) {
  return segment.calculationStatus === 'native-additive-projectile-estimate' &&
    Boolean(segment.evidence?.weaponVariantId && segment.projectile);
}

export function calculateProjectileBase(segment, input, factors = {}) {
  if (!hasAutomaticProjectile(segment) || String(input?.variantId) !== segment.evidence.weaponVariantId) return null;
  const stats = resolveWeaponStats(input);
  if (!stats) return null;
  // Independent projectile power has a separate native path from contact AR.
  const qualityRate = input.quality === 'red' ? stats.catalog.redQuality?.projectileRate : 1;
  if (!finite(qualityRate) || qualityRate <= 0) return null;
  const override = segment.evidence.overwriteAttackElementCorrectId;
  if (override >= 0) {
    stats.element = stats.catalog.elementCorrections?.[String(override)];
    if (!stats.element) return null;
  }
  const { baseAtkRatesByReinforcement, rawBaseComponents } = segment.projectile;
  const rate = baseAtkRatesByReinforcement?.[stats.targetReinforcement];
  if (!finite(rate?.baseAtkRate) || rate.baseAtkRate <= 0 ||
      rate.reinforceRowId !== Number(stats.variant.reinforceTypeId) + stats.targetReinforcement) return null;
  const result = {};
  for (const channel of ELEMENTS) {
    const base = rawBaseComponents?.[channel];
    if (!finite(base) || base < 0) return null;
    if (base === 0) continue;
    const correction = attackCorrection(stats, channel);
    if (correction === null) return null;
    const amount = base * qualityRate * rate.baseAtkRate * correction * stats.catalog.observedAttackScale;
    if (!finite(amount) || amount < 0) return null;
    factors[channel] = { base, qualityRate, reinforcement: rate.baseAtkRate, correction, commonScale: stats.catalog.observedAttackScale };
    result[channel] = amount;
  }
  return result;
}
