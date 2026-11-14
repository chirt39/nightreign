// Validate both sources with the same, versioned native rules. The large tables
// are requested only when a player opens the inspector.
let catalog;
export async function getLegalityCatalog() {
  if (catalog) return catalog;
  const [{ default: rules }] = await Promise.all([
    import('./data/relic-legality.json'),
    window.NightreignCatalogReady,
  ]);
  catalog = prepareLegalityCatalog(rules, window.NightreignLegalityNames);
  return catalog;
}

export function prepareLegalityCatalog(rules, labels) {
  const items = Object.entries(rules.items).map(([key, rule]) => ({
    ...rule, id: Number(key), name: rule.name || labels?.item(key) || `遗物 #${key}`,
  }));
  const effects = Object.entries(rules.effects).map(([key, rule]) => ({
    ...rule, id: Number(key), name: labels?.effect(key) || rule.name || `词条 #${key}`,
  }));
  // Colour and item variants with the same ordered pools admit the same combinations.
  const templates = new Map();
  const negativeEligible = new Set();
  for (const item of items) {
    const key = JSON.stringify([item.generation, item.positive, item.negative]);
    if (templates.has(key)) continue;
    templates.set(key, item);
    item.positive.forEach((pool, i) => {
      if (item.negative[i] != null) {
        for (const id of rules.pools[pool]) negativeEligible.add(id);
      }
    });
  }
  return {
    items, effects, pools: rules.pools, version: rules.version,
    templates: [...templates.values()], negativeEligible,
    itemsById: new Map(items.map(item => [item.id, item])),
    effectsById: new Map(effects.map(effect => [effect.id, effect])),
  };
}

const roles = ['positive', 'negative'];
const fieldNames = {positive: '正面', negative: '负面'};
const otherOrders = [[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];

// A repeated ID or a shared, nonnegative compatibility group conflicts on a random relic.
function conflictKey(effect) {
  return effect.compatibilityId >= 0 && effect.compatibilityId != null
    ? 'group:' + effect.compatibilityId : 'id:' + effect.id;
}

function canRollPair(catalog, item, index, pair) {
  return roles.every(role => {
    const pool = item[role][index];
    const id = pair?.[role];
    if (id == null) return pool == null;
    return catalog.pools[pool]?.includes(Number(id));
  });
}

// The save's ordering relative to the native draws is not verified. If a
// permutation fits all three draws, report the discrepancy as unresolved.
function canRollInAnotherOrder(catalog, item, slots) {
  for (const order of otherOrders) {
    if (order.every((source, i) => canRollPair(catalog, item, i, slots[source]))) return true;
  }
  return false;
}

export function checkRelic(catalog, relic, {draft = false} = {}) {
  const item = catalog.itemsById.get(Number(relic.itemId));
  const issues = [];
  let status = 'clear';
  const priorities = {clear: 0, partial: 1, unknown: 2, anomaly: 3};
  function report(level, slot, role, message) {
    if (priorities[level] > priorities[status]) status = level;
    issues.push({status: level, slot, role, message});
  }
  if (relic.identificationStatus === 'pending') {
    report('unknown', null, null, '已识别为可能的遗物，存档记录格式仍待核对。');
    return {status, issues};
  }
  if (!item) {
    report('unknown', null, null, '当前版本没有可核对的遗物生成规则。');
    return {status, issues};
  }
  const slots = relic.rawEffectSlots;
  if (!Array.isArray(slots) || (!draft && slots.length < 4)) {
    report('unknown', null, null, '缺少原始槽位，请重新导入存档。');
    return {status, issues};
  }
  const usedGroups = new Map();
  const orderUncertain = canRollInAnotherOrder(catalog, item, slots);
  for (let index = 0; index < Math.max(3, slots.length); index++) {
    const pair = slots[index];
    const slot = index + 1;
    if (index >= 3) {
      if (roles.some(role => pair?.[role] != null)) report('unknown', slot, null, '此槽位超出当前三槽生成表。');
      continue;
    }
    for (const role of roles) {
      const poolId = item[role][index];
      const id = pair?.[role];
      const label = fieldNames[role] + '词条';
      if (id == null) {
        if (poolId != null) {
          const level = draft ? 'partial' : orderUncertain ? 'unknown' : 'anomaly';
          const message = role === 'negative' && pair?.positive != null
            ? '该槽的正面词条需要配一个负面词条。'
            : (draft ? `尚未选择${label}。` : `该槽应有${label}。`);
          report(level, slot, role, message);
        }
        continue;
      }
      const effect = catalog.effectsById.get(Number(id));
      if (!effect) {
        report('unknown', slot, role, `词条 #${id} 未收录。`);
        continue;
      }
      if (effect.negative !== (role === 'negative')) {
        report('anomaly', slot, role, `「${effect.name}」不能作为${label}。`);
        continue;
      }
      if (poolId == null || !catalog.pools[poolId]?.includes(Number(id))) {
        if (orderUncertain) report('unknown', slot, role, '可对应其他抽选槽，当前排列待核对。');
        else report('anomaly', slot, role, poolId == null
          ? `该遗物在此处没有${label}槽。` : `「${effect.name}」不在此槽的抽选池。`);
      }
      if (item.generation === 'fixed') continue;
      const key = conflictKey(effect);
      const previous = usedGroups.get(key);
      if (previous) {
        report('anomaly', previous.slot, previous.role, `「${previous.name}」与第 ${slot} 槽的「${effect.name}」互斥。`);
        report('anomaly', slot, role, `「${effect.name}」与第 ${previous.slot} 槽的「${previous.name}」不能在同一件随机遗物上共存。`);
      }
      const source = {slot, role, name: effect.name};
      usedGroups.set(key, source);
    }
  }
  return {status, issues};
}

export function checkCombination(catalog, slots) {
  const seen = new Map();
  const conflicts = [];
  let conflict = '';
  let count = 0;
  for (let i = 0; i < slots.length; i++) {
    const pair = slots[i];
    if (pair?.positive != null) {
      count++;
    } else if (pair?.negative != null) {
      return {status: 'partial', message: `请先选择第 ${i + 1} 条主词条。`};
    }
    for (const role of roles) {
      const id = pair?.[role];
      if (id == null) continue;
      const effect = catalog.effectsById.get(Number(id));
      if (!effect) return {status: 'unknown', message: `第 ${i + 1} 条的词条 #${id} 尚未收录。`};
      const key = conflictKey(effect);
      const prev = seen.get(key);
      if (prev) {
        const subject = role === 'negative' && prev.role === 'negative' ? '负面词条' : '词条';
        if (!conflict) conflict = `第 ${prev.slot}、${i + 1} 条${subject}${effect.id === prev.id ? '重复' : '互斥'}，请替换其中一条。`;
        conflicts.push(`第 ${prev.slot} 槽的${fieldNames[prev.role]}词条「${prev.name}」与第 ${i + 1} 槽的${fieldNames[role]}词条「${effect.name}」${effect.id === prev.id ? '重复' : '属于同一互斥组'}，不能在同一件随机遗物上共存；当前排列也不符合已收录的固定遗物配置。`);
      }
      seen.set(key, {slot: i + 1, id: effect.id, role, name: effect.name});
    }
  }
  if (!count) return {status: 'partial', message: '请先选择词条。'};

  // Unfilled fields are wildcards; only selected positions constrain a template.
  // A fixed preset is allowed to witness an exception to random-relic restrictions.
  const candidates = conflict ? catalog.templates.filter(t => t.generation === 'fixed') : catalog.templates;
  const matches = (item, selected) =>
    [0,1,2].every(i => roles.every(role => {
      const id = selected[i]?.[role];
      return id == null || catalog.pools[item[role][i]]?.includes(Number(id));
    }));
  const matching = candidates.some(item => matches(item, slots));
  if (matching) return {status: 'clear', message: '未发现异常'};
  const reasons = [];
  for (let i = 0; i < 3; i++) {
    for (const role of roles) {
      const id = slots[i]?.[role];
      if (id == null) continue;
      const effect = catalog.effectsById.get(Number(id));
      if (effect.negative !== (role === 'negative')) {
        reasons.push(`第 ${i + 1} 槽的「${effect.name}」是${effect.negative ? '负面' : '正面'}词条，不能放在${fieldNames[role]}词条位置。`);
      }
    }
  }
  if (reasons.length) return {status: 'anomaly', message: conflict || '异常', reasons};
  if (conflict) return {status: 'anomaly', message: conflict, reasons: conflicts};

  // Diagnose with the same wildcard semantics as the check. Never treat a blank
  // manual field as a missing required effect or move its negative independently.
  const reordered = otherOrders.find(order =>
    candidates.some(item => matches(item, order.map(source => slots[source]))));
  if (reordered) {
    const moves = reordered.flatMap((source, target) => source !== target && slots[source]?.positive != null
      ? [`第 ${source + 1} 槽「${catalog.effectsById.get(Number(slots[source].positive)).name}」移到第 ${target + 1} 槽${slots[source].negative != null ? '（负面词条随同移动）' : ''}`] : []);
    reasons.push(`当前词条顺序不符合生成配置；${moves.join('，')}后才能匹配一份已收录配置。`);
  } else {
    for (let i = 0; i < 3; i++) {
      const pair = slots[i];
      if (pair?.positive == null) continue;
      let unsupported = false;
      for (const role of roles) {
        const id = pair[role];
        if (id == null) continue;
        if (!candidates.some(item => catalog.pools[item[role][i]]?.includes(Number(id)))) {
          reasons.push(`第 ${i + 1} 槽的${fieldNames[role]}词条「${catalog.effectsById.get(Number(id)).name}」不在任何已收录配置的该位置候选中。`);
          unsupported = true;
        }
      }
      if (!unsupported && pair.negative != null && !candidates.some(item => roles.every(role =>
        catalog.pools[item[role][i]]?.includes(Number(pair[role]))))) {
        reasons.push(`第 ${i + 1} 槽的正面词条「${catalog.effectsById.get(Number(pair.positive)).name}」与负面词条「${catalog.effectsById.get(Number(pair.negative)).name}」不能按当前配对出现在同一份已收录配置中。`);
      }
    }
    if (!reasons.length) reasons.push('所选词条分别能出现在各自位置，但无法按当前槽位及正负配对同时出现在同一份已收录的普通或深夜遗物生成配置中。');
  }
  return {status: 'anomaly', message: '异常', reasons};
}
