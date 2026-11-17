const channels = ['physical', 'magic', 'fire', 'lightning', 'holy'];

// Candidate eligibility is potential applicability, not the current trigger state:
// full HP, charging, proc conditions and unchecked hit segments must remain selectable.
export function relicChoiceMetadata(rules = [], context = {}, definition = {}) {
  const categories = new Set();
  for (const rule of rules) {
    if (rule.countKey) categories.add('cumulative');
    if (rule.characterIds?.length) categories.add('character');
    if (rule.conditions?.length) categories.add('conditional');
    if (rule.tags?.length || rule.anyTags?.length || rule.artIds?.length || rule.weaponIds?.length) categories.add('action');
    if (!rule.countKey && !rule.characterIds?.length && !rule.conditions?.length && !rule.tags?.length && !rule.anyTags?.length) categories.add('attribute');
  }
  if (!rules.length) {
    if (context.characterNames?.some(name => definition.name?.includes(`【${name}】`))) categories.add('character');
    if (/攻击力/.test(definition.name || '')) categories.add('attribute');
  }
  const applicable = rules.some(rule => {
    if (rule.characterIds?.length && !rule.characterIds.map(String).includes(String(context.characterId))) return false;
    if (rule.artIds?.length && !rule.artIds.map(String).includes(String(context.artId))) return false;
    if (rule.weaponIds?.length && !rule.weaponIds.map(String).some(id => [context.weaponId, context.variantId].map(String).includes(id))) return false;
    return (context.segments || []).some(segment => {
      const tags = new Set(segment.tags || []);
      if (context.weaponType != null) tags.add('heldWeaponType:' + context.weaponType);
      if (rule.tags?.some(tag => !tags.has(tag))) return false;
      if (rule.anyTags?.length && !rule.anyTags.some(tag => tags.has(tag))) return false;
      if (rule.useHitDamageCorrection && !(segment.evidence?.spEffectDamageCorrectionPercent > 0)) return false;
      return (rule.channels || channels).some(channel => {
        const weaponPart = segment.rates?.[channel] > 0 && context.attack?.[channel] > 0;
        if (rule.phase === 'panel') return weaponPart;
        return weaponPart || segment.flat?.[channel] > 0 || segment.projectile?.rawBaseComponents?.[channel] > 0 || segment.manualChannels?.includes(channel);
      });
    });
  });
  return { supported: rules.length > 0, applicable, categories: [...categories] };
}
