<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { calculateDamage, calculatePanel } from '../lib/damage-calculator.js';
import { damageShowcase } from '../lib/damage-showcase.js';
import { hasAutomaticProjectile } from '../lib/damage-panel.js';
import DamagePicker from '../components/DamagePicker.vue';
import DamageFormula from '../components/DamageFormula.vue';
import DamageEquipmentCard from '../components/DamageEquipmentCard.vue';
import DamageProjectileInputs from '../components/DamageProjectileInputs.vue';

const props = defineProps({ active: Boolean, catalogVersions: Object });
const files = ['weapon-catalog.json', 'damage-panel.json', 'damage-actions.json', 'damage-effects.json', 'damage-targets.json', 'arts-catalog.json', 'damage-weapon-traits.json', 'relic_rule_effects.json'];
const catalogs = shallowRef(null), loading = ref(false), error = ref('');
const weaponId = ref(''), variantId = ref(''), artId = ref(''), actionId = ref('');
const mode = ref('auto'), characterId = ref(''), level = ref(''), reinforcement = ref('');
const quality = ref('native'), weaponTraitSlots = ref([]);
const picker = ref(''), savedRelics = ref([]), editingRelicId = ref(null);
const customLimit = 3, relicLimit = 6;
let nextCustomId = 0;
const portraitVersion = ref(0);
function portraitsReady() { portraitVersion.value++; }
const statLabels = { strength: '力气', dexterity: '灵巧', intelligence: '智力', faith: '信仰', arcane: '感应' };
const statGainInputs = reactive(Object.fromEntries(Object.keys(statLabels).map(key => [key, 0])));
const selectedSegmentIds = ref([]), selectionOrder = ref([]), conditions = reactive({});
const projectileInputs = ref({});
const enchantEnabled = ref(false);
const targetId = ref('');
const hasReturn = ref(false);
const channelLabels = { physical: '物理', magic: '魔力', fire: '火', lightning: '雷', holy: '圣' };
const manualValues = reactive(Object.fromEntries(Object.keys(channelLabels).map(key => [key, ''])));
let controller = null, request = null, targetInitialized = false;
const weapons = computed(() => catalogs.value?.weapons.weapons || []);
const weapon = computed(() => weapons.value.find(item => String(item.id) === weaponId.value));
const variant = computed(() => weapon.value?.variants?.find(item => String(item.id) === variantId.value));
const showcaseSelection = computed(() => damageShowcase.find(item => item.weaponId === weaponId.value && item.variantId === variantId.value && item.artId === artId.value));
const outsideShowcase = computed(() => Boolean(catalogs.value && (weaponId.value || artId.value) && !showcaseSelection.value));
function variantArtIds(item) { return ['fixed', 'pool'].includes(item?.skill?.kind) ? (item.skill.itemIds || []).map(String) : []; }
const incompatibleArt = computed(() => Boolean(artId.value && variant.value && !variantArtIds(variant.value).includes(artId.value)));
const panelCatalog = computed(() => catalogs.value?.panel);
const qualityProfile = computed(() => panelCatalog.value?.variants?.[variantId.value]?.qualityProfile);
const nativeQualityColor = computed(() => qualityProfile.value?.colorByReinforcement?.[String(reinforcement.value)] || qualityProfile.value?.baseColor);
const canRed = computed(() => qualityProfile.value?.redAvailable === true);
const colors = { purple: '紫色', gold: '金色', blue: '蓝色', green: '绿色', white: '白色', red: '红色' };
const qualityColor = computed(() => quality.value === 'red' ? 'red' : colors[nativeQualityColor.value] ? nativeQualityColor.value : 'unknown');
const qualityName = computed(() => quality.value === 'red' ? '红武' : colors[qualityColor.value] || '品质待核对');
function selectUpgrade(value) {
  if (value === 'red' && canRed.value) quality.value = 'red';
  else if (reinforcementOptions.value.some(item => String(item.id) === value)) {
    quality.value = 'native';
    reinforcement.value = value;
  }
}
const traits = computed(() => catalogs.value?.traits?.traits || []);
const traitById = computed(() => new Map(traits.value.map(item => [String(item.id), item])));
const selectedWeaponTraits = computed(() => weaponTraitSlots.value.map(slot => ({ ...slot, trait: traitById.value.get(slot.traitId) })).filter(slot => slot.trait));
const equipmentTraits = computed(() => weaponTraitSlots.value.map(slot => { const trait = traitById.value.get(slot.traitId); return { ...slot, polarity: trait?.polarity || slot.polarity, name: trait?.name || '', detail: trait ? traitDetail(trait) : '' }; }));
const traitStatGains = computed(() => Object.fromEntries(Object.keys(statLabels).map(key => [key, selectedWeaponTraits.value.reduce((sum, slot) => sum + (slot.trait.statGains?.[key] || 0), 0)])));
const statGains = computed(() => Object.fromEntries(Object.entries(statGainInputs).map(([key, value]) => [key, numberOrNull(value) == null ? null : Number(value) + traitStatGains.value[key]])));
const baseStats = computed(() => panelCatalog.value?.characterStats?.[characterId.value]?.[String(level.value)] || {});
const reinforcementOptions = computed(() => (panelCatalog.value?.reinforcements || []).filter(item => panelCatalog.value?.variants?.[variantId.value]?.reinforcements?.includes(Number(item.id))));
const actions = computed(() => catalogs.value?.actions.actions || []);
const effects = computed(() => catalogs.value?.effects.effects || []);
const relics = computed(() => catalogs.value?.effects.relics || []);
const targets = computed(() => catalogs.value?.targets.targets || []);
const selectedTarget = computed(() => targets.value.find(item => String(item.id) === targetId.value));
const targetPortrait = computed(() => {
  portraitVersion.value;
  return selectedTarget.value && window.NightreignDamageEnemyPicker?.portrait(selectedTarget.value) || '/enemy-images/image-pending.svg';
});
async function openExternalPicker(kind) {
  if (picker.value) { picker.value = ''; await nextTick(); }
  window.dispatchEvent(new CustomEvent('damage-open-picker', {detail:{kind, targetId:targetId.value, targets:targets.value}}));
}
async function acceptPicked(event) {
  const item = event.detail;
  if (!item) return;
  if (!catalogs.value) await loadCatalogs();
  if (item.kind === 'enemy' && targets.value.some(entry=>String(entry.id)===String(item.targetId))) {
    targetId.value = String(item.targetId);
  }
  if (item.kind === 'relic' && item.instanceId && Array.isArray(item.effects)) {
    addPersonalRelic('instance:' + item.instanceId, item.name, item.effects);
  }
}
const effectById = computed(() => new Map(effects.value.map(item => [String(item.id), item])));
const relicCount = computed(() => selectionOrder.value.filter(item => item.kind === 'relic').length);
function canAddRelic(id) {
  return relicCount.value < relicLimit && !checked('relic', id);
}
const relicById = computed(() => new Map([...relics.value,...savedRelics.value].map(item => [String(item.id), item])));
const definitions = computed(() => catalogs.value?.definitions?.definitions || {});
const nativeRelicRules = computed(() => {
  const groups = new Map();
  for (const effect of effects.value.filter(item=>item.kind==='relic')) {
    const id = String(effect.nativeEffectId);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(effect);
  }
  return groups;
});
function addPersonalRelic(id, name, entries, edit = false) {
  if (!entries.length || (edit ? !checked('relic', id) : !canAddRelic(id))) return;
  const rows = entries.map(entry=>({id:String(entry.id),name:entry.name || definitions.value[entry.id]?.name || '#' + entry.id}));
  const effectIds = rows.flatMap(entry=>(nativeRelicRules.value.get(entry.id) || []).map(rule=>rule.id));
  const unmodelledEffectIds = rows.filter(entry=>!nativeRelicRules.value.has(entry.id)).map(entry=>entry.id);
  savedRelics.value = [...savedRelics.value.filter(item=>item.id!==id), {id,name,rows,effectIds,unmodelledEffectIds}];
  if (!edit) toggleEffect('relic',id,true);
}
function relicDetails(relic) {
  if (!relic) return [];
  const missing = new Set((relic.unmodelledEffectIds || []).map(String));
  const rows = relic.rows || (relic.nativeEffectIds || []).map(id=>({id:String(id),name: definitions.value[id]?.name || nativeRelicRules.value.get(String(id))?.[0]?.name || '#' + id}));
  return rows.map(entry=>({...entry,missing:missing.has(String(entry.id))}));
}
const customChoices = computed(()=>Object.values(definitions.value).filter(item=>!item.type?.startsWith('减益')).map(item=>({
  id:String(item.id), name:item.name, detail:nativeRelicRules.value.has(String(item.id)) ? item.explanation : '未计入伤害'
})));
const editingRelic = computed(() => savedRelics.value.find(item => item.id === editingRelicId.value));
function editRelic(id) {
  editingRelicId.value = id;
  picker.value = 'relic';
}
function closePicker() {
  picker.value = '';
  editingRelicId.value = null;
}
function addCustom(entries) {
  const allowed = new Map(customChoices.value.map(item => [item.id, item]));
  const ids = [...new Set(entries.map(item => item.id))];
  if (!ids.length || ids.length > customLimit || ids.some(id => !allowed.has(id))) return;
  const rows = ids.map(id => allowed.get(id));
  if (editingRelic.value) {
    addPersonalRelic(editingRelic.value.id, editingRelic.value.name, rows, true);
  } else {
    if (relicCount.value >= relicLimit) return;
    nextCustomId++;
    addPersonalRelic('custom:' + nextCustomId, '自定义遗物 ' + nextCustomId, rows);
  }
  closePicker();
}
const effectChoices = computed(() => {
  const groups = new Map();
  for (const effect of effects.value) {
    const id = effect.buffId ? `buff:${effect.buffId}` : effect.nativeEffectId != null ? `native:${effect.nativeEffectId}` : String(effect.id);
    if (!groups.has(id)) groups.set(id, { id, name: effect.name, exclusiveGroup: effect.exclusiveGroup, effects: [] });
    groups.get(id).effects.push(effect);
  }
  return [...groups.values()];
});
const effectChoiceById = computed(() => new Map(effectChoices.value.map(item => [item.id, item])));
const compatibleActions = computed(() => actions.value.filter(item => {
  if (!showcaseSelection.value) return false;
  if (item.scope?.heroId != null && String(item.scope.heroId) !== characterId.value) return false;
  if (!variant.value && !artId.value) return false;
  if (incompatibleArt.value || weaponId.value && !variant.value) return false;
  if (artId.value && String(item.artId) !== artId.value) return false;
  if (item.artId != null && variant.value && !variantArtIds(variant.value).includes(String(item.artId))) return false;
  if (item.weaponIds?.length && (!variant.value || !item.weaponIds.map(String).includes(variantId.value))) return false;
  if (item.weaponTypes?.length && !weapon.value) return false;
  if (weapon.value && item.weaponTypes?.length && !item.weaponTypes.map(String).some(id => [String(weapon.value.categoryId), weapon.value.categoryLabel].includes(id))) return false;
  return true;
}));
const action = computed(() => compatibleActions.value.find(item => String(item.id) === actionId.value));
function isChargedAction(item) {
  return item?.scope?.charged ?? Boolean(item?.name.includes('蓄力'));
}
const chargeChoices = computed(() => {
  const sameFp = compatibleActions.value.filter(item => item.scope?.enoughFp === action.value?.scope?.enoughFp);
  const base = sameFp.find(item => !isChargedAction(item));
  const charged = sameFp.find(isChargedAction);
  return base && charged ? [base, charged] : [];
});
function setInsufficientFp(insufficient) {
  const candidates = compatibleActions.value.filter(item => (item.scope?.enoughFp === false) === insufficient);
  const next = candidates.find(item => isChargedAction(item) === isChargedAction(action.value)) || candidates[0];
  if (next) actionId.value = String(next.id);
}
const advancedDialog = ref(null);
const advancedPanel = ref('');
function openAdvanced(panel) {
  advancedPanel.value = panel;
  advancedDialog.value.toggleAttribute('data-reserve-gutter', window.innerWidth > document.documentElement.clientWidth);
  advancedDialog.value.showModal();
  const body = advancedDialog.value.querySelector('.damage-dialog-body');
  if (body) body.scrollTop = 0;
}
watch(() => props.active, active => {
  if (!active && advancedDialog.value?.open) advancedDialog.value.close();
});
const segments = computed(() => (action.value?.segments || []).map(item => ({ ...item, id: String(item.id) })));
const allArts = computed(() => catalogs.value?.arts.entries || []);
const selectedArt = computed(() => allArts.value.find(item => String(item.id) === artId.value));
function effectIdsForSelection(item) { return item.kind === 'trait' ? traitById.value.get(weaponTraitSlots.value.find(slot => slot.id === item.id)?.traitId)?.effectIds || [] : relicById.value.get(item.id)?.effectIds || []; }
const weaponTraitRuleIds = computed(() => new Set(selectedWeaponTraits.value.flatMap(slot => slot.trait.effectIds || []).map(String)));
function providedByWeapon(item) { return item.effects.some(effect => weaponTraitRuleIds.value.has(String(effect.id))); }
const selectedEffects = computed(() => selectionOrder.value.flatMap(item => item.kind === 'effect' ? (effectChoiceById.value.get(item.id)?.effects || []).filter(effect => !weaponTraitRuleIds.value.has(String(effect.id))) : effectIdsForSelection(item).map(id => effectById.value.get(String(id))).filter(Boolean)));
const unmodelledRelics = computed(() => selectionOrder.value.filter(item => item.kind === 'relic').map(item => relicById.value.get(item.id)).filter(item => item?.unmodelledEffectIds?.length));
const unmodelledTraits = computed(() => selectedWeaponTraits.value.filter(slot => ['partial', 'missing-rule'].includes(slot.trait.calculationStatus) || slot.trait.unmodelledEffectIds?.length || (slot.trait.effectIds || []).some(id => !effectById.value.has(String(id))) || !slot.trait.calculationStatus && !slot.trait.effectIds?.length && !slot.trait.statGains));
const conditionOptions = computed(() => {
  const names = new Map((catalogs.value?.effects.conditions || []).map(item => [String(item.id), item.name]));
  const result = new Map();
  for (const effect of selectedEffects.value) {
    const values = Array.isArray(effect.conditions) ? effect.conditions : Object.keys(effect.conditions || {});
    for (const item of values) {
      const id = typeof item === 'object' ? String(item.id) : String(item);
      if (!result.has(id)) result.set(id, names.get(id) || (typeof item === 'object' ? item.name || id : id));
    }
  }
  return [...result].map(([id, name]) => ({ id, name }));
});
function numberOrNull(value) { return value == null || typeof value === 'string' && !value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value); }
function channelsFrom(values) { return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, numberOrNull(value)])); }
const automaticPanel = computed(() => {
  if (!showcaseSelection.value || quality.value === 'red' && !canRed.value) return null;
  if (Object.values(statGains.value).some(value => !Number.isInteger(value))) return null;
  if (!panelCatalog.value || !variantId.value || !characterId.value || level.value === '' || reinforcement.value === '') return null;
  return calculatePanel({ catalog: panelCatalog.value, variantId: variantId.value, characterId: characterId.value, level: Number(level.value), reinforcement: Number(reinforcement.value), statGains: statGains.value, quality: quality.value });
});
const panel = computed(() => mode.value === 'manual' ? channelsFrom(manualValues) : automaticPanel.value);
function fillManualPanel() { if (automaticPanel.value) Object.assign(manualValues, automaticPanel.value); }
const target = computed(() => {
  const record = selectedTarget.value;
  if (!record) return null;
  const channels = Object.keys(channelLabels);
  const defense = Object.fromEntries(channels.map(key => [
    key, numberOrNull(record.defense?.[key]) ?? numberOrNull(record.baseDefense?.[key]),
  ]));
  return {
    id: String(record.id), name: record.name, defense, taken: channelsFrom(record.taken || {}),
    useTakenEstimate: channels.every(key => numberOrNull(record.defense?.[key]) == null && defense[key] != null),
  };
});
const result = computed(() => {
  if (!catalogs.value) return { kind: 'unavailable', total: null, rows: [], missing: ['计算资料尚未载入'] };
  if (outsideShowcase.value) return { kind: 'unavailable', total: null, rows: [], missing: ['当前变体或战技尚未收录，可点击「选择武器」更换。'] };
  const calculated = calculateDamage({ panel: panel.value, segments: segments.value, selectedSegmentIds: selectedSegmentIds.value, effects: selectedEffects.value, conditions: { ...conditions }, manualPanel: mode.value === 'manual', target: target.value, characterId: characterId.value, weaponId: weaponId.value, variantId: variantId.value, weaponType: weapon.value?.categoryId, weaponPhysicalTypes: panelCatalog.value?.variants?.[variantId.value]?.physicalTypes, artId: artId.value || action.value?.artId, allowReferenceDefense: true, projectileInputs: projectileInputs.value, projectileContext: { catalog: panelCatalog.value, variantId: variantId.value, characterId: characterId.value, level: Number(level.value), reinforcement: Number(reinforcement.value), quality: quality.value, statGains: statGains.value, manualPanel: mode.value === 'manual' }, weaponEnchant: mode.value === 'auto' && enchantEnabled.value ? action.value?.appliedWeaponEffects?.[0] : null });
  if (!unmodelledRelics.value.length && !unmodelledTraits.value.length) return calculated;
  return { ...calculated, kind: calculated.kind === 'unavailable' ? 'unavailable' : 'partial', hasUnmodelledRelic: true, missing: [...calculated.missing, ...unmodelledRelics.value.map(item => `「${item.name}」有未计入的词条`), ...unmodelledTraits.value.map(slot => `武器词条「${slot.trait.name}」尚有未计入的效果`)] };
});
function basis(value) { return value.basis || (value.kind === 'hp' ? 'hp' : value.kind === 'beforeDefense' ? 'beforeDefense' : null); }
function resultTitle(value) {
  if (value.kind === 'unavailable') return '暂无法计算';
  const title = value.referenceEstimate ? '参考估算扣血' : basis(value) === 'hp' ? '预计生命伤害' : '防御前伤害';
  const label = value.projectileEstimate ? `${title} · 弹体单发估算` : title;
  return value.kind === 'partial' ? `已计算部分 · ${label}` : label;
}
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function display(value) { return finite(value) ? value.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '—'; }
function actionName(item) {
  if (!item) return selectedArt.value?.name || '尚未选择动作';
  return item.name.replace(/^动作组 \d+ · /, '')
    .replace(/Jump Attack ([NF]) (Normal|Hard) (Right|Both)/g, (_, step, kind, hand) => `${hand === 'Right' ? '右手' : '双手'}跳跃${kind === 'Normal' ? '轻' : '重'}攻击（${step}）`)
    .replace(/Attack Right/g, '右手').replace(/Attack Both/g, '双手')
    .replace(/Charged Heavy/g, '蓄力重攻击').replace(/Light|Ligh\b/g, '轻攻击').replace(/Heavy/g, '重攻击')
    .replace(/Dash/g, '冲刺').replace(/Backstep/g, '后撤步攻击').replace(/Step/g, '垫步').replace(/Counter/g, '反击').replace(/Start/g, '起手').replace(/End/g, '释放');
}
const tagLabels = { normalAttack: '普通攻击', skill: '战技', light: '轻攻击', heavy: '重攻击', melee: '近战', initialAttack: '首击', jump: '跳跃' };
function segmentDescription(item) { return (item.tags || []).map(tag => tagLabels[tag]).filter(Boolean).join('、'); }
function hitDescription(item) {
  const known = Number.isInteger(item.hits) && item.hits > 0 && (hasAutomaticProjectile(item) || Object.keys(channelLabels).every(key => finite(item.rates?.[key]) && item.rates[key] >= 0));
  return known ? `${item.hits} 次命中` : '命中次数待核对';
}
function rowChannels(row) {
  const physicalLabels = { normal: '普通', slash: '斩击', strike: '打击', thrust: '突刺' };
  return (row.activeChannels || []).filter(key => Object.hasOwn(channelLabels, key)).map(key => ({ key, label: key === 'physical' ? physicalLabels[row.physicalType] || '物理（类型待核对）' : channelLabels[key] }));
}
const pickerChoices = computed(()=>{
  if (picker.value === 'weapon') return damageShowcase.map(entry => ({
    id: entry.variantId, name: entry.name, image: entry.weaponImage, detail: entry.artName
  }));
  if (picker.value==='trait') return availableWeaponTraits.value.map(trait => ({
    id: String(trait.id), name: trait.name, detail: traitDetail(trait)
  }));
  if (picker.value==='effect') return effectChoices.value.filter(item=>item.effects.some(effect=>effect.kind!=='relic')).map(item=>({
    id:item.id, name:item.name, disabled:checked('effect',item.id) || providedByWeapon(item),
    detail:item.effects[0].buffId && item.effects[0].durationSeconds ? `持续 ${item.effects[0].durationSeconds} 秒` :
      item.effects[0].anyTags?.includes('atkSubCategory:124') ? '仅对带双手共持标记的武器命中生效' :
      item.effects[0].anyTags?.includes('atkSubCategory:125') ? '仅对带双持标记的武器命中生效' : ''
  }));
  return relics.value.map(item=>({id:String(item.id),name:item.name,image:item.image,detail:relicDetails(item).map(row=>row.name + (row.missing ? '（未计入）' : '')).join('、'),disabled:checked('relic',item.id)}));
});
function pickItem(id) {
  if (picker.value === 'weapon') {
    const entry = damageShowcase.find(item => item.variantId === id);
    if (entry) chooseShowcase(entry);
  } else if (picker.value==='trait') addWeaponTrait(id);
  else if (picker.value==='relic' || picker.value==='effect') toggleEffect(picker.value,id,true);
  picker.value='';
}
function checked(kind, id) { return selectionOrder.value.some(item => item.kind === kind && item.id === String(id)); }
function toggleEffect(kind, id, enabled) {
  if (kind === 'trait') { removeWeaponTrait(id); return; }
  id = String(id);
  if (kind === 'relic' && enabled && !canAddRelic(id)) return;
  let remaining = selectionOrder.value.filter(item => item.kind !== kind || item.id !== id);
  if (!enabled && kind === 'relic') savedRelics.value = savedRelics.value.filter(item=>item.id!==id);
  const group = kind === 'effect' ? effectChoiceById.value.get(id)?.exclusiveGroup : null;
  if (enabled && group) remaining = remaining.filter(item => item.kind !== 'effect' || effectChoiceById.value.get(item.id)?.exclusiveGroup !== group);
  selectionOrder.value = enabled ? [...remaining, { kind, id }] : remaining;
}
function selectionName(item) { return item.kind === 'trait' ? traitById.value.get(weaponTraitSlots.value.find(slot => slot.id === item.id)?.traitId)?.name || '武器词条' : (item.kind === 'effect' ? effectChoiceById.value : relicById.value).get(item.id)?.name || item.id; }
function traitDetail(trait) {
  const labels = { ...statLabels, vigor: '生命力', mind: '集中力', endurance: '耐力' };
  const gains = Object.entries({ ...trait.statGains, ...trait.nonAttackStatGains }).filter(([, value]) => finite(value) && value !== 0).map(([key, value]) => `${labels[key] || key} ${value > 0 ? '+' : ''}${value}`);
  const rates = (trait.effectIds || []).map(id => effectById.value.get(String(id))).filter(effect => finite(effect?.rate) && effect.rate !== 1).map(effect => {
    const names = effect.channels?.length && effect.channels.length < 5 ? effect.channels.map(key => channelLabels[key] || key).join('/') : '全属性';
    const percent = Math.round((effect.rate - 1) * 10000) / 100;
    return `${names}${effect.phase === 'panel' ? '面板' : '伤害'} ${percent > 0 ? '+' : ''}${percent}%${effect.conditions?.length || effect.tags?.length || effect.anyTags?.length ? '（有适用条件）' : ''}`;
  });
  const compactName = trait.name.replace(/\s/g, '').replace(/＋/g, '+');
  const extraGains = Object.entries({ ...trait.statGains, ...trait.nonAttackStatGains }).some(([key, value]) => !compactName.includes(`${labels[key] || key}${value > 0 ? '+' : ''}${value}`)) ? gains : [];
  return [...(trait.polarity === 'negative' ? ['负面词条'] : []), ...extraGains, ...new Set(rates)].join('；') || (trait.calculationStatus === 'non-damage' ? '非伤害用途，不计入伤害数值' : ['partial', 'missing-rule'].includes(trait.calculationStatus) ? '伤害规则尚未完整覆盖' : '');
}
function chooseShowcase(entry) {
  if (showcaseSelection.value?.variantId === entry.variantId) return;
  if (variantId.value !== entry.variantId) reinforcement.value = '0';
  weaponId.value = entry.weaponId; variantId.value = entry.variantId; artId.value = entry.artId; actionId.value = '';
  quality.value = 'native'; pruneWeaponTraits(true); chooseVariant();
}
const traitProfiles = computed(() => (catalogs.value?.traits?.profiles || []).filter(profile =>
  String(profile.weaponId) === weaponId.value && String(profile.artId) === artId.value &&
  profile.isCursed === (quality.value === 'red')
));
function fitsRedSlots(ids, poolIds) {
  if (!ids.length) return true;
  const [first, ...remaining] = ids;
  return poolIds.some((pool, index) =>
    catalogs.value.traits.pools[pool]?.includes(first) &&
    fitsRedSlots(remaining, poolIds.filter((_, slot) => slot !== index))
  );
}
function fitsWeaponTraits(trait, slots) {
  const equipped = slots.map(slot => traitById.value.get(slot.traitId));
  if (trait.polarity === 'corpse') return !equipped.some(item => item.polarity === 'corpse');
  const randomIds = equipped.filter(item => item.polarity !== 'corpse').map(item => Number(item.id));
  if (randomIds.length >= 3) return false;
  if (quality.value !== 'red') return true;
  return traitProfiles.value.some(profile => fitsRedSlots([...randomIds, Number(trait.id)], profile.redTraitSlots));
}
function traitOptions() {
  const poolIds = new Set(traitProfiles.value.flatMap(profile => profile.isCursed ? profile.redTraitSlots : profile.slotPoolIds));
  const weaponStats = panelCatalog.value?.variants?.[variantId.value];
  const compatibleSegments = compatibleActions.value.flatMap(action => action.segments);
  const canDealChannel = (segment, channel) => (segment.rates?.[channel] > 0 && weaponStats?.attack?.[channel] > 0) ||
    segment.flat?.[channel] > 0 || (hasAutomaticProjectile(segment) && segment.projectile.rawBaseComponents[channel] > 0);
  return traits.value.filter(trait => {
    if (trait.polarity === 'corpse') {
      return trait.calculationStatus === 'stat-gains' && trait.weaponIds?.some(id => String(id) === weaponId.value) &&
        Object.entries(trait.statGains || {}).some(([stat, gain]) => weaponStats?.scaling?.[stat] > 0 && gain > 0);
    }
    if (trait.calculationStatus !== 'supported' || (trait.polarity === 'negative' && quality.value !== 'red')) return false;
    const inPool = trait.poolIds?.some(id => poolIds.has(id));
    return inPool && trait.effectIds.some(id => {
      const rule = effectById.value.get(id);
      if (!rule || !finite(rule.rate) || rule.rate === 1 || rule.tags?.includes('critical')) return false;
      return compatibleSegments.some(segment => {
        if (!segment.rates && !hasAutomaticProjectile(segment)) return false;
        if (rule.channels?.length && !rule.channels.some(channel => canDealChannel(segment, channel))) return false;
        const tags = segment.tags || [];
        return (!rule.tags?.length || rule.tags.every(tag => tags.includes(tag) || tag === 'heldWeaponType:' + weapon.value?.categoryId)) &&
          (!rule.anyTags?.length || rule.anyTags.some(tag => tags.includes(tag)));
      });
    });
  });
}
const availableWeaponTraits = computed(() => traitOptions().filter(trait =>
  !checked('trait', trait.id) && fitsWeaponTraits(trait, weaponTraitSlots.value)
));
function toggleCondition(id, enabled) {
  if (enabled && id === '满血') for (const key of Object.keys(conditions)) if (key.startsWith('低血量攻击效果已触发')) conditions[key] = false;
  if (enabled && id.startsWith('低血量攻击效果已触发')) conditions['满血'] = false;
  conditions[id] = enabled;
}
function pruneWeaponTraits(reset=false) {
  const allowed = new Map(reset ? [] : traitOptions().map(trait => [String(trait.id), trait]));
  const retained = [];
  for (const slot of weaponTraitSlots.value) {
    const trait = allowed.get(slot.traitId);
    if (trait && fitsWeaponTraits(trait, retained)) retained.push(slot);
  }
  weaponTraitSlots.value = retained;
  selectionOrder.value = selectionOrder.value.filter(item => item.kind !== 'trait' || retained.some(slot => slot.id === item.id));
}
function defaultSegments() {
  if (['1051', '1037', '1017', '214'].includes(artId.value)) {
    const first = segments.value.find(hasAutomaticProjectile);
    if (first) return [String(first.id)];
  }
  return segments.value.map(item => String(item.id));
}
function addWeaponTrait(traitId) {
  const id = String(traitId);
  const trait = availableWeaponTraits.value.find(item => String(item.id) === id);
  if (!trait) return;
  weaponTraitSlots.value.push({id,traitId:id,polarity:trait.polarity});
  selectionOrder.value.push({kind:'trait',id});
}
function removeWeaponTrait(traitId) {
  const id = String(traitId);
  weaponTraitSlots.value = weaponTraitSlots.value.filter(slot=>slot.id!==id);
  selectionOrder.value = selectionOrder.value.filter(item=>item.kind!=='trait' || item.id!==id);
}
function normalizeReinforcement() {
  if (reinforcement.value === '' || !reinforcementOptions.value.some(item => Number(item.id) === Number(reinforcement.value))) reinforcement.value = String(reinforcementOptions.value[0]?.id ?? '');
}
function chooseVariant() { normalizeReinforcement(); chooseAction(); }
function chooseAction() {
  const enoughFp = compatibleActions.value.filter(item => item.scope?.enoughFp !== false);
  const normal = enoughFp.filter(item => item.scope?.charged !== true && !item.name.includes('蓄力'));
  if (!compatibleActions.value.some(item => String(item.id) === actionId.value)) actionId.value = String(normal[0]?.id || enoughFp[0]?.id || compatibleActions.value[0]?.id || '');
}
function readUrl() {
  hasReturn.value = Boolean(history.state?.damageReturn);
  const params = new URL(location.href).searchParams;
  weaponId.value = params.get('damageWeapon') || '';
  variantId.value = params.get('damageVariant') || '';
  artId.value = params.get('damageArt') || '';
  actionId.value = params.get('damageAction') || '';
}
function goBack() { history.back(); }
function normalizeSelection() {
  if (catalogs.value && !targetInitialized) {
    targetInitialized = true;
    if (!targetId.value && targets.value.some(item => String(item.id) === '75100020')) {
      targetId.value = '75100020';
    }
  }
  if (!weaponId.value && !artId.value) {
    const entry = damageShowcase[0]; weaponId.value = entry.weaponId; variantId.value = entry.variantId; artId.value = entry.artId;
  } else {
    const entry = damageShowcase.find(item => (!weaponId.value || item.weaponId === weaponId.value) && (!variantId.value || item.variantId === variantId.value) && (!artId.value || item.artId === artId.value));
    if (entry) { weaponId.value = entry.weaponId; variantId.value = entry.variantId; artId.value = entry.artId; }
  }
  if (!characterId.value) characterId.value = String(panelCatalog.value?.characters?.[0]?.id ?? '');
  if (level.value === '') level.value = panelCatalog.value?.levels?.includes(15) ? 15 : panelCatalog.value?.levels?.[0] ?? '';
  normalizeReinforcement();
  chooseAction();
}
function writeUrl() {
  if (!props.active || !catalogs.value) return;
  const url = new URL(location.href);
  const values = { damageWeapon: weaponId.value, damageVariant: variantId.value, damageArt: artId.value, damageAction: actionId.value };
  for (const [key, value] of Object.entries(values)) if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  url.hash = 'damage';
  history.replaceState({ ...history.state, view: 'damage', cardNavigation: { kind: 'damage', weaponId: weaponId.value, variantId: variantId.value, artId: artId.value, actionId: actionId.value } }, '', url);
}
async function loadCatalogs() {
  if (catalogs.value) return;
  if (loading.value) return request;
  loading.value = true; error.value = ''; controller = new AbortController();
  request = (async () => {
    try {
      const values = await Promise.all(files.map(async file => {
        const version = props.catalogVersions?.[file];
        const response = await fetch(`/${file}${version ? `?v=${version}` : ''}`, { signal: controller.signal, ...(version ? {} : { cache: 'no-store' }) });
        if (!response.ok) throw new Error('伤害计算资料暂未就绪，请稍后重试。');
        return response.json();
      }));
      catalogs.value = Object.fromEntries(['weapons', 'panel', 'actions', 'effects', 'targets', 'arts', 'traits','definitions'].map((key, index) => [key, values[index]]));
      normalizeSelection();
    } catch (cause) { if (cause.name !== 'AbortError') error.value = cause.message || '计算资料载入失败'; }
    finally { loading.value = false; }
  })();
  return request;
}
async function restoreNavigation(snapshot) {
  readUrl();
  await loadCatalogs();
  weaponId.value = String(snapshot.weaponId || ''); variantId.value = String(snapshot.variantId || ''); artId.value = String(snapshot.artId || ''); actionId.value = String(snapshot.actionId || '');
  normalizeSelection();
  await nextTick(); writeUrl();
}
function locationChanged() { if (props.active && location.hash === '#damage') { readUrl(); if (catalogs.value) normalizeSelection(); } }
watch([actionId, variantId, characterId, level, reinforcement, quality, statGains, mode, manualValues, enchantEnabled], () => { projectileInputs.value = {}; }, { deep: true });
watch(actionId, () => { enchantEnabled.value = false; });
watch(quality, value => { if (value === 'red') mode.value = 'auto'; });
watch([variantId, quality, reinforcement], () => { for (const key of Object.keys(manualValues)) manualValues[key] = ''; pruneWeaponTraits(); });
watch(action, () => { selectedSegmentIds.value = defaultSegments(); });
watch(characterId, chooseAction);
watch([weaponId, variantId, artId, actionId], writeUrl);
watch(() => props.active, async active => { if (active) { readUrl(); await loadCatalogs(); if (props.active) { normalizeSelection(); writeUrl(); } } }, { immediate: true });
onMounted(() => { window.addEventListener('damage-picked',acceptPicked); window.addEventListener('nightreign:enemy-portraits-ready',portraitsReady); window.addEventListener('popstate', locationChanged); window.addEventListener('hashchange', locationChanged); });
onBeforeUnmount(() => { window.removeEventListener('damage-picked',acceptPicked); window.removeEventListener('nightreign:enemy-portraits-ready',portraitsReady); controller?.abort(); window.removeEventListener('popstate', locationChanged); window.removeEventListener('hashchange', locationChanged); });
defineExpose({ restoreNavigation });
</script>

<template>
  <section id="view-damage" class="view reference-page damage-page" :class="{ active }">
    <header class="damage-heading"><div><h1>伤害计算器</h1></div><button v-if="hasReturn" type="button" @click="goBack">返回上一页</button></header>
    <p v-if="loading" role="status">正在载入面板、动作和目标资料…</p>
    <div v-else-if="error" class="damage-notice" role="alert"><p>{{ error }}</p><button type="button" @click="loadCatalogs">重新载入</button></div>
    <div v-else-if="catalogs" class="damage-workspace">
      <div class="damage-inputs">
        <section class="damage-card damage-common"><h2>武器与角色</h2>
          <button class="damage-weapon-trigger" type="button" aria-label="选择武器" @click="picker='weapon'">
            <img v-if="showcaseSelection" :src="showcaseSelection.weaponImage" alt="">
            <span><strong>{{ showcaseSelection?.name || weapon?.name || '选择武器' }}</strong><small>{{ showcaseSelection?.artName || selectedArt?.name }}<template v-if="artId === '1051' && action?.scope?.enoughFp && action.fpCosts?.length"> · 每发 {{ action.fpCosts[0] }} 专注值</template></small></span><span aria-hidden="true">›</span>
          </button>
          <p v-if="outsideShowcase" class="damage-notice" role="status">{{ weapon?.name || selectedArt?.name || '链接中的装备' }}：当前变体或战技未纳入本轮预览，尚未替换为其他武器。可点击「选择武器」更换，或返回原详情。</p>
          <div class="damage-fields damage-core-fields">
            <label>角色<select v-model="characterId"><option v-for="item in panelCatalog?.characters || []" :key="item.id" :value="String(item.id)">{{ item.name }}</option></select></label>
            <label>等级<select v-model="level"><option v-for="item in panelCatalog?.levels || []" :key="item" :value="item">{{ item }}</option></select></label>

          </div>
          <div v-if="chargeChoices.length || (artId !== '1051' && action?.fpCosts?.length) || action?.scope?.enoughFp === false" class="damage-action-field">
            <div v-if="chargeChoices.length" class="charge-choices" role="group" aria-label="蓄力方式">
              <button v-for="item in chargeChoices" :key="item.id" type="button" :aria-pressed="actionId === String(item.id)" @click="actionId = String(item.id)">{{ isChargedAction(item) ? '蓄力' : '普通' }}</button>
            </div>
            <p v-if="action?.scope?.enoughFp === false" class="damage-fp">专注值不足</p>
            <p v-else-if="action?.fpCosts?.length" class="damage-fp">专注值消耗 · 起手 {{ action.fpCosts[0] }}<template v-for="(cost, index) in action.fpCosts.slice(1)" :key="index"> · 追加{{ action.fpCosts.length > 2 ? index + 1 : '' }} +{{ cost }}</template></p>
          </div>
        </section>
        <section class="damage-card damage-loadout">
          <h2 class="loadout-heading-line">当前配装 <span class="relic-count" role="status">已装备 {{ relicCount }}/{{ relicLimit }} 件遗物</span></h2>
            <button class="damage-target-card" type="button" aria-label="选择怪物" @click="openExternalPicker('enemy')">
              <img v-if="selectedTarget" :src="targetPortrait" alt=""><span><small>目标怪物</small><strong>{{ selectedTarget?.name || '选择怪物' }}</strong></span><span aria-hidden="true">›</span>
            </button>
          <div class="loadout-actions">
            <button v-if="showcaseSelection" type="button" :disabled="!availableWeaponTraits.length" @click="picker='trait'">添加武器词条</button>
            <button type="button" @click="picker='effect'">添加局内词条或增益</button>
            <button type="button" :disabled="relicCount >= relicLimit" @click="picker='relic'">添加遗物</button>
          </div>
          <details v-if="selectionOrder.length" class="damage-equipped">
            <summary>查看或编辑当前配装</summary>
            <ul class="loadout-selected">
            <li v-for="item in selectionOrder" :key="item.kind+':'+item.id">
              <img v-if="item.kind === 'relic' && relicById.get(item.id)?.image" class="loadout-portrait" :src="relicById.get(item.id).image" alt="" width="28" height="28">
              <span>{{ item.kind === 'trait' && traitById.get(item.id)?.polarity === 'negative' ? '负面 · ' : '' }}{{ selectionName(item) }}</span>
              <button v-if="item.kind === 'relic' && item.id.startsWith('custom:')" type="button" :aria-label="'编辑' + selectionName(item)" @click="editRelic(item.id)">编辑</button>
              <button type="button" :aria-label="'移除'+selectionName(item)" @click="toggleEffect(item.kind,item.id,false)">×</button>
              <ul v-if="item.kind==='relic'"><li v-for="(row,index) in relicDetails(relicById.get(item.id))" :key="index">{{ row.name }}<small v-if="row.missing">未计入</small></li></ul>
            </li>
          </ul>
          </details>
          <fieldset v-if="conditionOptions.length" class="damage-conditions"><legend>当前满足的条件</legend><label v-for="item in conditionOptions" :key="item.id"><input :checked="conditions[item.id] || false" type="checkbox" @change="toggleCondition(item.id, $event.target.checked)">{{ item.name }}</label></fieldset>
        </section>
        <div class="damage-tools">
          <button type="button" aria-haspopup="dialog" @click="openAdvanced('equipment')">装备面板与局内属性</button>
          <button type="button" aria-haspopup="dialog" @click="openAdvanced('segments')">命中段 · {{ selectedSegmentIds.length }} 段</button>
        </div>
        <dialog ref="advancedDialog" class="damage-edit-dialog" aria-labelledby="damage-edit-title"
          @close="advancedPanel = ''" @click="event => { if (event.target === advancedDialog) advancedDialog.close(); }">
          <div class="damage-dialog-frame">
            <header><h2 id="damage-edit-title">{{ advancedPanel === 'equipment' ? '装备面板与局内属性' : '命中段' }}</h2>
              <button type="button" autofocus @click="advancedDialog.close()">完成</button>
            </header>
            <div class="damage-dialog-body">
              <template v-if="advancedPanel === 'equipment'">
          <div class="damage-fields">
            <label>武器强化<select :value="quality === 'red' ? 'red' : reinforcement" @change="selectUpgrade($event.target.value)"><option v-for="item in reinforcementOptions" :key="item.id" :value="String(item.id)">{{ [item.name, colors[qualityProfile?.colorByReinforcement?.[item.id]]].filter(Boolean).join(' · ') }}</option><option v-if="canRed" value="red">红武</option></select></label>
          </div>
          <DamageEquipmentCard v-if="showcaseSelection" :entry="showcaseSelection" :panel="panel" :quality-name="qualityName" :quality-color="qualityColor" :traits="equipmentTraits" :manual="mode === 'manual'" />

            <fieldset class="damage-mode"><legend>面板来源</legend><label><input v-model="mode" type="radio" value="auto">自动面板（参数推算）</label><label><input v-model="mode" type="radio" value="manual">手填最终面板</label></fieldset>
            <button v-if="mode === 'manual'" type="button" :disabled="!automaticPanel" @click="fillManualPanel">从当前自动推算面板填入</button>
            <fieldset class="damage-stat-gains"><legend>局内获得的攻击相关属性</legend><p class="damage-note">填写击杀胜利后实际获得的属性点，不是击杀数。手填最终面板已包含这些收益，不再重复叠加。</p><div class="damage-channels"><label v-for="(name, key) in statLabels" :key="key">{{ name }}<small>基础 {{ display(baseStats[key]) }}<template v-if="traitStatGains[key]"> · 词条 +{{ traitStatGains[key] }}</template></small><input v-model="statGainInputs[key]" type="number" min="0" step="1" inputmode="numeric" :disabled="mode === 'manual'" :aria-label="`胜利获得的${name}点数`"></label></div></fieldset>
            <div class="damage-channels"><label v-for="(name, key) in channelLabels" :key="key">{{ name }}<input v-if="mode === 'manual'" v-model="manualValues[key]" type="number" min="0" step="any" inputmode="decimal" placeholder="未填写"><output v-else>{{ display(panel?.[key]) }}</output></label></div>
            <p v-if="mode === 'manual'" class="damage-note">手填面板视为已包含面板增益，不会重复叠加。比较不同面板增益前，请先更换手填面板。</p><p v-else-if="!panel" class="damage-note">这组自动面板资料尚未收录，可改用手填最终面板。</p><p v-else class="damage-note">自动面板为游戏参数推算值。</p>
              </template>
              <template v-else-if="advancedPanel === 'segments'">
                <label v-if="compatibleActions.some(item => item.scope?.enoughFp === false)" class="damage-check"><input type="checkbox" :checked="action?.scope?.enoughFp === false" @change="setInsufficientFp($event.target.checked)">专注值不足</label>
            <p v-if="incompatibleArt" class="damage-note">所选战技不适用于这个武器变体，请更换武器或战技。</p><p v-else-if="!compatibleActions.length" class="damage-note">{{ selectedArt ? `「${selectedArt.name}」的命中记录尚未收录，请保留该战技等待补充。` : '当前武器的动作尚未收录。' }}</p><div v-if="segments.length" class="damage-segment-tools"><button type="button" @click="selectedSegmentIds = segments.map(item => String(item.id))">全选命中段</button><button type="button" @click="selectedSegmentIds = []">清空</button></div>
            <ul class="damage-segments"><li v-for="(item, index) in segments" :key="item.id"><label><input v-model="selectedSegmentIds" type="checkbox" :value="String(item.id)"><span>{{ item.name.startsWith('攻击参数') ? `命中段 ${index + 1}` : item.name }}<small>{{ hitDescription(item) }}<template v-if="segmentDescription(item)"> · {{ segmentDescription(item) }}</template></small></span></label></li></ul>
            <label v-if="action?.appliedWeaponEffects?.length" class="damage-check"><input v-model="enchantEnabled" type="checkbox" :disabled="mode === 'manual'">炎击火焰附魔已生效</label><p v-if="action?.appliedWeaponEffects?.length && mode === 'manual'" class="damage-note">手填面板已含附魔，不再追加附魔面板。</p>
            <DamageProjectileInputs v-model="projectileInputs" :segments="segments" :selected-ids="selectedSegmentIds" :upgrade-step="quality === 'red' ? qualityProfile?.redReinforcement : Number(reinforcement)" />
              </template>
            </div>
          </div>
        </dialog>
      </div>
      <aside class="damage-result" aria-label="伤害计算结果">
        <section class="damage-card damage-total"><p class="damage-result-kind">{{ resultTitle(result) }}</p>
          <div class="damage-headline-numbers"><div><span>本次总伤害</span><output aria-live="polite">{{ display(result.total) }}</output></div></div>
          <p>本次命中 {{ selectedSegmentIds.length }} 段</p>

          <DamageFormula :result="result" />
        </section>
        <details v-if="result.missing?.length" class="damage-card damage-result-notes"><summary>计算说明 · {{ result.missing.length }} 项</summary><ul class="damage-missing"><li v-for="(item, index) in result.missing" :key="index">{{ item }}</li></ul></details>
          <details class="damage-card damage-advanced"><summary>逐段结果 · {{ result.rows?.length || 0 }} 段</summary><p v-if="!result.rows?.length" class="damage-note">选择动作并补全面板后查看结果。</p><article v-for="row in result.rows || []" :key="row.id" class="damage-row"><header><h3>{{ row.name }}</h3><strong>{{ display(row.total) }}</strong></header><dl class="damage-channel-results"><div v-for="channel in rowChannels(row)" :key="channel.key"><dt>{{ channel.label }}</dt><dd>{{ display(row.channels?.[channel.key]) }}</dd></div></dl><p v-if="row.applied?.length" class="damage-note">已生效：{{ row.applied.join('、') }}</p><ul v-if="row.missing?.length" class="damage-missing"><li v-for="(item, index) in row.missing" :key="index">{{ item }}</li></ul></article></details>
      </aside>
    </div>
    <DamagePicker v-if="picker" :kind="picker" :choices="pickerChoices" :custom-choices="customChoices" :editing-relic="editingRelic" :custom-limit="customLimit"
      @pick="pickItem" @custom="addCustom" @ritual="openExternalPicker('relic')" @close="closePicker" />
  </section>
</template>
<style scoped>
.damage-page{min-width:0;color:#dce5e9;font-family:Arial,'Microsoft YaHei',sans-serif}.damage-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.damage-heading h1{margin:0;color:#ecd7a7;font:500 25px/1.4 'Noto Serif SC',serif}.eyebrow{margin:0;font-size:10px;color:#a7b7c5;letter-spacing:.12em}.damage-workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(250px,.48fr);gap:12px;align-items:start}.damage-inputs,.damage-result{display:grid;gap:8px;min-width:0}.damage-result{position:sticky;top:12px;max-height:calc(100dvh - 30px);overflow:auto;overscroll-behavior:contain}.damage-card{min-width:0;padding:12px;border:1px solid #3e566e;border-radius:5px;background:#132131}.damage-card h2{margin:0 0 8px;color:#e7d5ac;font-size:14px;font-weight:500}.damage-card h3{margin:12px 0 8px;color:#c8d4dc;font-size:13px;font-weight:500}.damage-weapon-cards{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;margin-bottom:12px}.damage-page .damage-weapon-cards button{display:grid;justify-items:center;align-content:start;gap:3px;min-width:0;padding:5px 2px;background:#152737;border-color:#3e566e}.damage-weapon-cards button[aria-pressed=true]{border-color:#d2b674;box-shadow:inset 0 -2px #d2b674;background:#253540}.damage-weapon-cards img{width:100%;height:48px;object-fit:contain}.damage-weapon-cards strong{font-size:11px;font-weight:400;overflow-wrap:anywhere}.damage-weapon-cards small{font-size:9px;color:#9db3c4}.damage-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:10px}.damage-core-fields{grid-template-columns:minmax(0,1fr) minmax(0,.65fr)}.damage-page label{display:grid;gap:4px;min-width:0;color:#bdcdd7;font-size:11px}.damage-page input,.damage-page select{box-sizing:border-box;min-width:0;width:100%;min-height:34px;padding:6px;border:1px solid #4c657b;border-radius:3px;background:#101d2a;color:#e0e7e9;font:inherit;font-size:12px}.damage-page button{min-height:32px;padding:6px 9px;border:1px solid #596b7e;border-radius:3px;background:#1b2d40;color:#e7d5ac;font:inherit;font-size:12px;cursor:pointer}.damage-page button:disabled,.damage-page input:disabled{opacity:.45}.damage-page button:focus-visible,.damage-page input:focus-visible,.damage-page select:focus-visible,.damage-page summary:focus-visible{outline:2px solid #d5b477;outline-offset:2px}.damage-weapon-slots,.damage-stat-gains{min-width:0;margin:8px 0 10px;padding:8px 0;border:0;border-top:1px solid #33495b}.damage-weapon-slots legend,.damage-stat-gains legend{padding-right:8px;color:#d8c7a1;font-size:12px}.damage-trait-search{display:grid;grid-template-columns:minmax(0,1fr) 60px;gap:8px}.damage-trait-slots{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:8px}.damage-target-picker{padding-top:10px;margin-bottom:0;border-top:1px solid #33495b;grid-template-columns:.8fr 1.2fr}.damage-mode,.damage-conditions{display:flex;flex-wrap:wrap;gap:8px 12px;margin:10px 0;padding:8px 0;border:0;border-top:1px solid #33495b}.damage-mode legend,.damage-conditions legend{padding-right:8px;color:#d8c7a1;font-size:12px}.damage-page .damage-mode label,.damage-page .damage-conditions label,.damage-page .damage-check,.damage-options label,.damage-segments label{display:flex;align-items:center;gap:7px;min-height:30px}.damage-page input[type=checkbox],.damage-page input[type=radio]{flex:0 0 16px;width:16px;min-height:16px;height:16px;padding:0;accent-color:#ccb17a}.damage-channels{display:grid;grid-template-columns:repeat(auto-fit,minmax(65px,1fr));gap:8px}.damage-channels output{padding:8px;border:1px solid #34495b;background:#192b3d;color:#e7d5ac;font-size:16px;font-variant-numeric:tabular-nums}.damage-note,.damage-notice{margin:8px 0 0;font-size:11px;line-height:1.6;color:#aebfcc;overflow-wrap:anywhere}.damage-stat-gains p{margin:0 0 8px}.damage-stat-gains small{font-size:10px}.damage-default-note{font-size:10px}.damage-segments,.damage-options{list-style:none;padding:0;margin:10px 0}.damage-segments li,.damage-options li{padding:5px 0;border-bottom:1px solid #2d4356}.damage-segments small{display:block;margin-top:3px;color:#9fb2c1;font-size:11px}.damage-segment-tools,.damage-selected,.damage-pagination{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px}.damage-options{max-height:245px;overflow:auto;overscroll-behavior:contain}.damage-card details{padding-top:8px;margin-top:10px;border-top:1px solid #33495b}.damage-card summary{color:#dacba6;cursor:pointer;font-size:12px;line-height:1.6}.damage-advanced>summary{margin:0}.damage-advanced[open]>summary{margin-bottom:12px}.damage-selected button{font-size:11px}.damage-pagination{justify-content:space-between;color:#aebfcc;font-size:12px}.damage-total{border-top:2px solid #b99b64}.damage-result-kind{margin:0;color:#d9cba7;font-size:12px;line-height:1.6;overflow-wrap:anywhere}.damage-headline-numbers{display:grid;grid-template-columns:1fr;align-items:baseline;gap:10px;padding:14px 0;border-bottom:1px solid #33495b}.damage-headline-numbers>div{min-width:0}.damage-headline-numbers span{display:block;margin-bottom:4px;font-size:10px;color:#9eb2c2}.damage-headline-numbers output{display:block;color:#f0dca9;font:400 28px/1.2 Arial,'Microsoft YaHei',sans-serif;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.damage-headline-numbers .positive{color:#a4d1af}.damage-headline-numbers .negative{color:#e1a699}.damage-total>p:not(.damage-result-kind){font-size:11px;color:#aebfcc;line-height:1.6;margin:8px 0}.damage-missing{margin:8px 0 0;padding-left:16px;color:#d9b48e;font-size:11px;line-height:1.7;overflow-wrap:anywhere}.damage-row{padding:10px 0;border-top:1px solid #33495b}.damage-row header{display:flex;justify-content:space-between;gap:10px;align-items:baseline}.damage-row header h3{margin:0;color:#dfcfa8;font-size:13px;overflow-wrap:anywhere}.damage-row header strong{color:#e8d9ad;font-variant-numeric:tabular-nums;white-space:nowrap}.damage-channel-results{display:flex;flex-wrap:wrap;gap:8px 18px;margin:10px 0;font-size:11px}.damage-channel-results dt{color:#9eb2c2}.damage-channel-results dd{margin:3px 0 0;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.damage-notice{padding:10px;border:1px solid #5a4e3e;background:#292b30}
@media(max-width:1050px){.damage-workspace{display:flex;flex-direction:column}.damage-inputs{order:2;width:100%}.damage-result{position:static;display:contents;max-height:none;overflow:visible}.damage-result>.damage-card{order:3;width:100%;box-sizing:border-box}.damage-result>.damage-total{order:1}.damage-weapon-cards img{height:58px}.damage-headline-numbers{padding:9px 0}.damage-page input,.damage-page select{min-height:40px;font-size:14px}.damage-page button{min-height:36px}.damage-weapon-cards strong{font-size:12px}}
@media(max-width:600px){.damage-weapon-cards{grid-template-columns:repeat(3,minmax(0,1fr))}.damage-core-fields{grid-template-columns:repeat(3,minmax(0,1fr))}.damage-core-fields label:nth-last-child(-n+2){grid-column:span 1}.damage-fields.damage-target-picker{grid-template-columns:minmax(0,1fr)}.damage-card{padding:12px}.damage-channels{grid-template-columns:repeat(3,minmax(0,1fr))}.damage-heading h1{font-size:23px}.damage-weapon-cards small{font-size:10px}.damage-trait-slots{grid-template-columns:minmax(0,1fr)}}

.loadout-actions,.damage-target-picker{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.damage-target-picker{margin-top:12px}.damage-target-card{display:flex;align-items:center;gap:10px;text-align:left;flex:1;min-width:160px}.damage-target-card img{height:40px;width:40px;object-fit:cover}.damage-target-card>span:first-of-type{display:grid;gap:3px}.damage-target-card>span:last-of-type{margin-left:auto}.damage-target-card small,.loadout-selected ul{color:#aec1d0}.loadout-selected,.loadout-selected ul{padding:0;list-style:none}.loadout-selected{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0}.loadout-selected>li{padding:4px 7px;border:1px solid #354c60;border-radius:4px;font-size:12px}.loadout-selected>li>button{background:transparent;border:0;min-height:24px;margin-left:4px}.loadout-selected ul li{font-size:11px;line-height:1.6}.loadout-selected small{margin-left:6px;color:#e2bd87}
.loadout-portrait { vertical-align: middle; margin-right: 6px; object-fit: contain; }
.relic-count{align-self:center;color:#b6c6d3;font-size:.85rem;font-variant-numeric:tabular-nums}
.damage-common{display:grid;grid-template-columns:minmax(130px,.9fr) minmax(0,1.2fr);gap:8px 12px;align-items:end}
.damage-common h2,.damage-action-field,.damage-common>.damage-notice{grid-column:1/-1}
.damage-common h2,.damage-core-fields{margin:0}
.damage-core-fields{grid-template-columns:minmax(0,1fr) minmax(0,.65fr)}
.loadout-heading-line{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.damage-fp{margin:4px 0 0;font-size:12px;color:#d8c7a1;font-variant-numeric:tabular-nums}
.damage-weapon-trigger{display:flex;align-items:center;text-align:left;gap:6px;min-width:0}
.damage-weapon-trigger img{width:36px;height:36px;object-fit:contain}
.damage-weapon-trigger strong,.damage-weapon-trigger small{display:block;line-height:1.4}
.damage-weapon-trigger small{color:#b5c7d3}
.damage-weapon-trigger span:last-child{margin-left:auto}
.damage-loadout>.damage-target-card{width:100%;margin-bottom:8px}
.damage-headline-numbers{padding:4px 0 8px}
.damage-headline-numbers span{display:none}
@media(max-width:600px){
  .damage-common{grid-template-columns:minmax(118px,.95fr) minmax(0,1.3fr);gap:7px}
  .damage-workspace{gap:8px}
  .damage-common h2,.damage-loadout h2{margin-bottom:3px}
  .damage-heading{margin-bottom:6px}
  .damage-page .damage-total>p{margin:3px 0}
  .damage-total{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:8px}
  .damage-total .damage-headline-numbers{padding:0;border:0}
  .damage-total .damage-formula{grid-column:1/-1;margin-top:4px;padding-top:4px}
  .damage-page .damage-total>p:not(.damage-result-kind){grid-column:1/-1}
  .loadout-actions{gap:5px}
  .relic-count{font-size:12px}
}
.charge-choices,.damage-tools{display:flex;gap:8px;flex-wrap:wrap}
.charge-choices button[aria-pressed=true]{border-color:#c8ac70;background:#293748;color:#f3d89e}
.damage-tools button{flex:1 1 auto}
.damage-edit-dialog{position:fixed;inset:0;margin:auto;width:min(640px,calc(100% - 24px));max-width:none;max-height:calc(100dvh - 24px);padding:0;overflow:hidden;color:#dce5e9;background:#142435;border:1px solid #657c91;border-radius:6px}
.damage-edit-dialog::backdrop{background:#07101bc9}
.damage-dialog-frame{display:flex;flex-direction:column;max-height:calc(100dvh - 28px)}
.damage-dialog-frame>header{flex:none;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #3e566e}
.damage-dialog-frame h2{margin:0;color:#e7d5ac;font-size:17px}
.damage-dialog-body{padding:14px;min-height:0;overflow:auto;overscroll-behavior:contain}
:global(html:has(.damage-edit-dialog[open])){overflow:hidden}
:global(html:has(.damage-edit-dialog[open][data-reserve-gutter])){scrollbar-gutter:stable}
</style>
