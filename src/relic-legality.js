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
  return {
    items, effects, pools: rules.pools, version: rules.version,
    itemsById: new Map(items.map(item => [item.id, item])),
    effectsById: new Map(effects.map(effect => [effect.id, effect])),
  };
}

const roles = ['positive', 'negative'];
const fieldNames = {positive: '正面', negative: '负面'};

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
  for (const order of [[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) {
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
    issues.push({slot, role, message});
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
  const usedIds = new Map();
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
      const group = effect.compatibilityId;
      let previous = usedIds.get(effect.id);
      if (!previous && group != null && group >= 0) previous = usedGroups.get(group);
      if (previous) {
        report('anomaly', previous.slot, previous.role, `「${previous.name}」与第 ${slot} 槽的「${effect.name}」互斥。`);
        report('anomaly', slot, role, `「${effect.name}」与第 ${previous.slot} 槽的「${previous.name}」不能在同一件随机遗物上共存。`);
      }
      const source = {slot, role, name: effect.name};
      usedIds.set(effect.id, source);
      if (group != null && group >= 0) usedGroups.set(group, source);
    }
  }
  return {status, issues};
}
