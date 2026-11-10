<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { PRIMARY_BOSS_ROLE, calibratedPointDirectory, collectEvents, collectLayers, definitionOptions, eventOptions, evaluatePattern, findCandidates, namedDefinition, nearbyPoints, phaseBossOptions, safeMapAsset, validPosition } from '../lib/map-predictor.js';

const props = defineProps({ active: Boolean, catalogVersions: Object });
const catalog = shallowRef(null), manifest = shallowRef(null), loading = ref(false), error = ref('');
const emptyFilters = () => ({ nightlord: '', firstNight: '', secondNight: '', depth: '', dlc: '', terrain: '', event: '', eventDay: '' });
const filters = reactive(emptyFilters()), observations = ref([]), undoStack = ref([]);
const terrainView = ref(''), search = ref(''), zoom = ref(1), failedAssets = ref(new Set()), candidatePage = ref(1), namePage = ref(1);
const selectedGroupKey = ref(''), selectedKind = ref('building'), selectedFeature = ref(''), editing = ref(null), nearby = ref([]), pointStatus = ref('');
const editor = ref(null), resultsPanel = ref(null);
const mapViewport = ref(null), viewportSize = reactive({ width: 0, height: 0 });
let viewportObserver = null, viewportFrame = null;
let controller;
const fields = [
  { key: 'nightlord', label: '已知夜王' },
  { key: 'firstNight', label: '第一夜首领' },
  { key: 'secondNight', label: '第二夜首领' },
  { key: 'depth', label: '深夜等级' },
  { key: 'dlc', label: '队伍 DLC 情况' },
  { key: 'terrain', label: '地图地形' },
  { key: 'event', label: '已见事件' },
];
const showCommon = ref(true), showPossible = ref(true);
const kindLabels = { building: '建筑', monster: '怪物', event: '事件' };
const patterns = computed(() => catalog.value?.patterns || []);
const definitions = computed(() => catalog.value?.definitions || {});
const ready = computed(() => Boolean(catalog.value));
const clues = computed(() => ({ filters: { ...filters }, observations: observations.value }));
const candidates = computed(() => findCandidates(patterns.value, clues.value, definitions.value));
const options = computed(() => ({
  nightlord: definitionOptions(definitions.value.nightlords),
  firstNight: phaseBossOptions(patterns.value, definitions.value.bosses, 'day1'),
  secondNight: phaseBossOptions(patterns.value, definitions.value.bosses, 'day2'),
  terrain: definitionOptions(definitions.value.terrains),
  event: eventOptions(definitions.value.events),
  depth: [...new Set(patterns.value.flatMap(pattern => pattern.eligibility?.depths?.state === 'known' ? pattern.eligibility.depths.values || [] : []))].sort((a, b) => a - b).map(value => ({ value: String(value), label: `深夜 ${value}` })),
  dlc: [{ value: 'all', label: '全员拥有 DLC' }, { value: 'not-all', label: '并非全员拥有 DLC' }],
}));
const allLayers = computed(() => collectLayers(patterns.value, definitions.value));
const pointDirectory = computed(() => calibratedPointDirectory(patterns.value));
const layers = computed(() => collectLayers(candidates.value, definitions.value));
const events = computed(() => collectEvents(candidates.value, definitions.value));
function groupLayers(entries) {
  const groups = new Map();
  entries.forEach(entry => {
    const key = JSON.stringify([entry.terrainId, entry.attachId]);
    if (!groups.has(key)) groups.set(key, { key, terrainId: entry.terrainId, attachId: entry.attachId, normalized: entry.normalized, entries: [] });
    const group = groups.get(key); group.entries.push(entry);
    if (!entry.normalized || !group.normalized || Math.abs(entry.normalized.x - group.normalized.x) > .000001 || Math.abs(entry.normalized.y - group.normalized.y) > .000001) group.normalized = null;
  });
  return [...groups.values()].map(group => ({ ...group, normalized: pointDirectory.value.get(group.key)?.normalized || group.normalized }));
}
const allGroups = computed(() => groupLayers(allLayers.value));
const selectableGroups = computed(() => allGroups.value.filter(group => group.terrainId !== null && validPosition(group.normalized)));
const visibleEntries = computed(() => layers.value.filter(entry => entry.terrainId === terrainView.value && (entry.common ? showCommon.value : showPossible.value)));
const mapGroups = computed(() => groupLayers(visibleEntries.value).filter(group => validPosition(group.normalized)));
const matchingNameGroups = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase();
  return selectableGroups.value.filter(group => (!terrainView.value || group.terrainId === terrainView.value) && (!needle || groupName(group).toLocaleLowerCase().includes(needle)));
});
const nameResultPages = computed(() => Math.max(1, Math.ceil(matchingNameGroups.value.length / 40)));
const nameGroups = computed(() => matchingNameGroups.value.slice((namePage.value - 1) * 40, namePage.value * 40));
const selectedGroup = computed(() => allGroups.value.find(group => group.key === selectedGroupKey.value));
const featureChoices = computed(() => selectedGroup.value?.entries.filter(entry => entry.kind === selectedKind.value) || []);
const chosenFeature = computed(() => featureChoices.value.find(entry => entry.sourceId === selectedFeature.value));
const asset = computed(() => {
  const entry = manifest.value?.terrains?.[terrainView.value];
  return safeMapAsset(entry) && !failedAssets.value.has(entry.src) ? entry : null;
});
const stageSize = computed(() => {
  if (!asset.value || !viewportSize.width || !viewportSize.height) return { width: 0, height: 0 };
  const scale = Math.min(viewportSize.width / asset.value.width, viewportSize.height / asset.value.height) * zoom.value;
  return { width: asset.value.width * scale, height: asset.value.height * scale };
});
function measureViewport() {
  viewportFrame = null;
  const viewport = mapViewport.value;
  if (!viewport) return;
  viewportSize.width = viewport.clientWidth; viewportSize.height = viewport.clientHeight;
}
function scheduleViewportMeasure() {
  if (viewportFrame !== null) cancelAnimationFrame(viewportFrame);
  viewportFrame = requestAnimationFrame(measureViewport);
}
function resetMap() { zoom.value = 1; nextTick(() => { measureViewport(); mapViewport.value?.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }); }
const resultPages = computed(() => Math.max(1, Math.ceil(candidates.value.length / 12)));
const visibleCandidates = computed(() => candidates.value.slice((candidatePage.value - 1) * 12, candidatePage.value * 12));
const nightlordResults = computed(() => {
  const names = new Set(); let unknown = false;
  candidates.value.forEach(pattern => {
    const field = pattern.nightlord;
    const definition = definitions.value.nightlords?.[String(field?.menuRowId)];
    if (field?.state === 'known' && namedDefinition(definition)) names.add(definition.nameZh); else unknown = true;
  });
  return { names: [...names], unknown };
});
const conflicts = computed(() => {
  if (candidates.value.length) return [];
  return [...new Set(patterns.value.flatMap(pattern => evaluatePattern(pattern, clues.value, definitions.value).conflicts))];
});
const currentTerrainEntries = computed(() => layers.value.filter(entry => entry.terrainId === terrainView.value));
function groupName(group) { return [...new Set(group.entries.map(entry => `${entry.name}${entry.role === PRIMARY_BOSS_ROLE ? '（主遭遇首领）' : ''}`))].join(' / '); }
function featureKindLabel(feature) { return feature.role === PRIMARY_BOSS_ROLE ? '该点主遭遇首领（不含普通怪、召唤或突袭）' : kindLabels[feature.kind]; }
function pointNumber(point) { return pointDirectory.value.get(JSON.stringify([point.terrainId, String(point.attachId)]))?.number || '?'; }
function pointLabel(point) {
  const entry = pointDirectory.value.get(JSON.stringify([point.terrainId, String(point.attachId)]));
  if (!entry) return '位置待核对';
  const horizontal = entry.normalized.x < 1 / 3 ? '左' : entry.normalized.x > 2 / 3 ? '右' : '';
  const vertical = entry.normalized.y < 1 / 3 ? '上' : entry.normalized.y > 2 / 3 ? '下' : '';
  return `位置 ${entry.number} · 图上${horizontal || vertical ? `${horizontal}${vertical}方` : '中央'}`;
}
function isObserved(group) { return observations.value.some(entry => entry.attachId === group.attachId && entry.terrainId === group.terrainId); }
function terrainName(value) { const definition = definitions.value.terrains?.[String(value)]; return namedDefinition(definition) ? definition.nameZh : '地形待核对'; }
function lordName(pattern) { const definition = definitions.value.nightlords?.[String(pattern.nightlord?.menuRowId)]; return pattern.nightlord?.state === 'known' && namedDefinition(definition) ? definition.nameZh : '夜王身份待核对'; }
function bossName(pattern, day) { const field = pattern.dayBosses?.[day], definition = definitions.value.bosses?.[String(field?.sourceId)]; return field?.state === 'known' && field.identityStatus !== 'unknown' && namedDefinition(definition) ? definition.nameZh : '待核对'; }
function remember() { undoStack.value.push(JSON.stringify({ filters: { ...filters }, observations: observations.value })); if (undoStack.value.length > 50) undoStack.value.shift(); }
function setFilter(key, value) { if (filters[key] === value) return; remember(); filters[key] = value; if (key === 'event' && !value) filters.eventDay = ''; }
function clearClues() { remember(); Object.assign(filters, emptyFilters()); observations.value = []; closeEditor(); }
function undo() { const previous = undoStack.value.pop(); if (!previous) return; const state = JSON.parse(previous); Object.assign(filters, state.filters); observations.value = state.observations; closeEditor(); }
function removeObservation(index) { remember(); observations.value.splice(index, 1); closeEditor(); }
async function chooseGroup(group, editIndex = editing.value) {
  if (!validPosition(group.normalized) || group.terrainId === null) { pointStatus.value = '该位置尚未校准，暂不能作为已见位置线索。'; return; }
  selectedGroupKey.value = group.key; selectedKind.value = group.entries[0]?.kind || 'building'; selectedFeature.value = ''; editing.value = editIndex; nearby.value = []; pointStatus.value = '';
  await nextTick(); editor.value?.focus({ preventScroll: true }); editor.value?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
}
function editObservation(index) {
  const observation = observations.value[index];
  const group = allGroups.value.find(item => item.attachId === String(observation.attachId) && item.terrainId === observation.terrainId);
  if (!group) return;
  chooseGroup(group, index); selectedKind.value = observation.kind; selectedFeature.value = observation.sourceId;
}
function saveObservation() {
  const group = selectedGroup.value, feature = featureChoices.value.find(entry => entry.sourceId === selectedFeature.value);
  if (!group || !feature) return;
  const observation = { attachId: group.attachId, terrainId: group.terrainId, kind: feature.kind, sourceId: feature.sourceId, name: feature.name, ...(feature.role ? { role: feature.role } : {}) };
  if (observations.value.some((entry, index) => index !== editing.value && entry.attachId === observation.attachId && entry.terrainId === observation.terrainId && entry.kind === observation.kind && entry.sourceId === observation.sourceId)) { pointStatus.value = '这条线索已经添加。'; return; }
  remember(); if (editing.value === null) observations.value.push(observation); else observations.value.splice(editing.value, 1, observation); closeEditor();
  pointStatus.value = `线索已更新，当前有 ${candidates.value.length} 个候选方案。`;
  if (window.matchMedia('(min-width:1151px)').matches) nextTick(() => { if (resultsPanel.value) { resultsPanel.value.scrollTop = 0; resultsPanel.value.focus({ preventScroll: true }); } });
}
function closeEditor() { selectedGroupKey.value = ''; selectedFeature.value = ''; editing.value = null; nearby.value = []; pointStatus.value = ''; }
function mapClicked(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const found = nearbyPoints(mapGroups.value, { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }, rect.width, rect.height, 28);
  if (found.length === 1) chooseGroup(found[0]);
  else { nearby.value = found; selectedGroupKey.value = ''; pointStatus.value = found.length ? '附近有多个点位，请先确认位置。' : '附近没有已核验点位，未添加线索。请放大地图或使用名称选择。'; }
}
function markerClicked(group, event) {
  const rect = event.currentTarget.closest('.map-stage').getBoundingClientRect();
  const found = nearbyPoints(mapGroups.value, group.normalized, rect.width, rect.height, 28);
  if (found.length <= 1) chooseGroup(group);
  else { nearby.value = found; selectedGroupKey.value = ''; pointStatus.value = '附近有多个点位，请先确认位置。'; }
}
function imageFailed(event) { const src = event.target.getAttribute('src'); if (src) failedAssets.value = new Set([...failedAssets.value, src]); }
function showResults() { resultsPanel.value?.focus({ preventScroll: true }); resultsPanel.value?.scrollIntoView({ block: 'start', behavior: 'auto' }); }
async function loadCatalog() {
  if (loading.value || catalog.value) return;
  controller?.abort(); controller = new AbortController(); const signal = controller.signal; loading.value = true; error.value = '';
  const assetVersion = props.catalogVersions?.['map-asset-manifest.json'];
  if (assetVersion) fetch(`/map-asset-manifest.json?v=${assetVersion}`, { signal }).then(response => response.ok ? response.json() : null).then(data => { if (data?.schemaVersion === 1) manifest.value = data; }).catch(() => {});
  try {
    const version = props.catalogVersions?.['map-catalog.json'];
    if (!/^[a-f0-9]{12}$/i.test(version || '')) throw new Error('地图配置资料尚未就绪，请刷新后重试。');
    const response = await fetch(`/map-catalog.json?v=${version}`, { signal });
    if (!response.ok) throw new Error('地图配置读取失败，请重试。');
    const data = await response.json();
    if (data?.schemaVersion !== 1 || !Array.isArray(data.patterns) || !data.definitions) throw new Error('地图资料格式暂不支持，请刷新后重试。');
    catalog.value = data;
    terrainView.value = definitionOptions(data.definitions.terrains)[0]?.value || '';
  } catch (cause) { if (cause.name !== 'AbortError') error.value = cause.message || '地图资料加载失败。'; }
  finally { loading.value = false; }
}
watch(clues, () => { candidatePage.value = 1; }, { deep: true });
watch(() => filters.terrain, value => { if (value) terrainView.value = value; });
watch(terrainView, () => { zoom.value = 1; closeEditor(); });
watch([search, terrainView], () => { namePage.value = 1; });
watch(() => props.active, active => { if (active) loadCatalog(); }, { immediate: true });
watch(mapViewport, viewport => {
  viewportObserver?.disconnect();
  if (!viewport) return;
  if (typeof ResizeObserver !== 'undefined') { viewportObserver = new ResizeObserver(scheduleViewportMeasure); viewportObserver.observe(viewport); }
  scheduleViewportMeasure();
});
watch(asset, () => nextTick(scheduleViewportMeasure));
watch(() => props.active, active => { if (active) nextTick(scheduleViewportMeasure); });
onMounted(() => window.addEventListener('resize', scheduleViewportMeasure));
onBeforeUnmount(() => { controller?.abort(); viewportObserver?.disconnect(); if (viewportFrame !== null) cancelAnimationFrame(viewportFrame); window.removeEventListener('resize', scheduleViewportMeasure); });
</script>

<template>
  <section id="view-map" class="view" :class="{ active }">
    <div class="map-page-heading"><div><p class="eyebrow">DEEP NIGHT / FIELD INTELLIGENCE</p><h1>地图与夜王推算</h1></div><p>选择已知夜王或添加已见线索，查看当前资料支持的地图与夜王候选。</p></div>
    <p v-if="loading" class="map-status" role="status">正在载入地图与配置资料…</p>
    <div v-else-if="error" class="map-status" role="alert"><p>{{ error }}</p><button type="button" class="button" @click="loadCatalog">重新载入</button></div>
    <template v-else-if="ready">
    <p class="map-status">用于深夜模式线索整理 · 候选仅涵盖当前已收录配置，未核验条件不排除候选；夜王身份不代表已确认实战形态。<span v-if="!options.depth.length">配置与深夜等级的适用关系仍待核验。</span></p>
    <div class="map-live-summary"><span>{{ Object.values(filters).filter(Boolean).length }} 项已知条件 · {{ observations.length }} 条位置线索</span><button type="button" @click="showResults">查看 {{ candidates.length }} 个候选方案</button></div>
    <div class="map-workspace">
      <aside class="map-panel map-clues" aria-label="已知线索">
        <h2>已知线索</h2><p class="map-muted">不知道的条件保持“未知”。未标记不代表不存在。</p>
        <div class="map-filter-fields"><label v-for="field in fields" :key="field.key">{{ field.label }}<select :value="filters[field.key]" :disabled="!options[field.key].length" @change="setFilter(field.key, $event.target.value)"><option value="">未知</option><option v-for="option in options[field.key]" :key="option.value" :value="option.value">{{ option.label }}</option></select><small v-if="!options[field.key].length" class="map-muted">暂无已核验选项</small></label></div>
        <label class="map-event-day">事件发生日<select :value="filters.eventDay" :disabled="!filters.event" @change="setFilter('eventDay', $event.target.value)"><option value="">未知</option><option value="1">第一日</option><option value="2">第二日</option></select></label>
        <div class="map-actions"><button type="button" :disabled="!undoStack.length" @click="undo">撤销</button><button type="button" :disabled="!observations.length && !Object.values(filters).some(Boolean)" @click="clearClues">清空线索</button></div>
        <ul class="map-observations" aria-label="已添加位置线索"><li v-for="(observation, index) in observations" :key="index"><strong>{{ observation.name }}</strong><span>{{ terrainName(observation.terrainId) }} · {{ pointLabel(observation) }} · {{ featureKindLabel(observation) }}</span><div class="map-actions"><button type="button" @click="editObservation(index)">编辑</button><button type="button" :aria-label="`删除线索：${observation.name}，${pointLabel(observation)}`" @click="removeObservation(index)">删除</button></div></li></ul>
        <h3>已见位置</h3><p class="map-muted">可在地图选点，或按名称添加建筑、怪物及事件。</p>
        <label>按名称添加<input v-model="search" type="search" placeholder="搜索地点或已见对象" :disabled="!selectableGroups.length"></label>
        <p v-if="!allGroups.length" class="map-muted">当前资料尚无可确认名称的建筑、怪物或事件点位，暂不能添加位置线索。</p>
        <p v-else-if="!selectableGroups.length" class="map-muted">已收录建筑等对象，但位置坐标尚未校准，暂不能添加已见位置线索。</p>
        <ul v-else class="map-name-list"><li v-for="group in nameGroups" :key="group.key"><button type="button" @click="chooseGroup(group)">{{ groupName(group) }}<small>{{ terrainName(group.terrainId) }} · {{ pointLabel(group) }}</small></button></li><li v-if="!nameGroups.length">没有匹配位置，请调整名称或查看地形。</li></ul>
        <p v-if="selectableGroups.length" class="map-muted" role="status">共 {{ matchingNameGroups.length }} 个匹配位置；可输入名称缩小范围。</p>
        <nav v-if="nameResultPages > 1" class="map-actions" aria-label="名称位置列表分页"><button type="button" :disabled="namePage === 1" @click="namePage--">上一页</button><span>{{ namePage }} / {{ nameResultPages }}</span><button type="button" :disabled="namePage === nameResultPages" @click="namePage++">下一页</button></nav>
      </aside>
      <div class="map-panel map-canvas-panel">
        <div class="map-panel-heading"><h2>地图</h2><div class="map-actions"><button type="button" :disabled="!asset || zoom <= 1" aria-label="缩小地图" @click="zoom = Math.max(1, zoom - .25)">−</button><button type="button" :disabled="!asset || zoom >= 3" aria-label="放大地图" @click="zoom = Math.min(3, zoom + .25)">＋</button><button type="button" :disabled="!asset" @click="resetMap">复位</button></div></div>
        <label class="map-terrain-select">查看底图<select v-model="terrainView"><option v-if="!options.terrain.length" value="">地形待核对</option><option v-for="option in options.terrain" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
        <div class="map-layer-controls"><label><input v-model="showCommon" type="checkbox" :disabled="!layers.length">共同点位</label><label><input v-model="showPossible" type="checkbox" :disabled="!layers.length">可能点位</label></div>
        <div v-if="asset" ref="mapViewport" class="map-viewport" :style="{ '--map-aspect': `${asset.width} / ${asset.height}` }" tabindex="0" aria-label="可滚动地图；也可使用下方名称选择位置">
          <div class="map-surface" :style="{ width: `${Math.max(viewportSize.width, stageSize.width)}px`, height: `${Math.max(viewportSize.height, stageSize.height)}px` }">
          <div v-if="stageSize.width > 0" class="map-stage" :style="{ width: `${stageSize.width}px`, height: `${stageSize.height}px` }" @click="mapClicked">
            <img :src="asset.src" :alt="`${terrainName(terrainView)}底图`" draggable="false" @error="imageFailed">
            <button v-for="group in mapGroups" :key="group.key" class="map-marker" :class="{ common: group.entries.every(entry => entry.common), observed: isObserved(group) }" :style="{ left: `${group.normalized.x * 100}%`, top: `${group.normalized.y * 100}%` }" type="button" :aria-label="`${groupName(group)}，${pointLabel(group)}，${group.entries.every(entry => entry.common) ? '共同点位' : '可能点位'}${isObserved(group) ? '，已添加线索' : ''}`" @click.stop="markerClicked(group, $event)"><span aria-hidden="true">{{ pointNumber(group) }}</span></button>
          </div>
          </div>
        </div>
        <div v-else class="map-empty-canvas"><p>当前地形暂无可用的核验底图</p><p class="map-muted">仍可使用名称和文字线索筛选；不会猜测底图或坐标。</p></div>
        <p v-if="asset && !mapGroups.length" class="map-muted">当前候选中暂无可在此底图定位的已核验点位。</p>
        <p v-if="pointStatus" class="map-status" role="status">{{ pointStatus }}</p>
        <div v-if="nearby.length" class="map-overlap-options"><button v-for="group in nearby" :key="group.key" type="button" @click="chooseGroup(group)">{{ pointLabel(group) }} · {{ groupName(group) }}</button></div>
        <section v-if="selectedGroup" ref="editor" class="map-point-editor" tabindex="-1" aria-label="确认位置线索">
          <h3>{{ editing === null ? '添加已见线索' : '编辑已见线索' }}</h3><p>{{ pointLabel(selectedGroup) }} · {{ groupName(selectedGroup) }}</p>
          <p v-if="editing !== null" class="map-muted">可在名称列表或地图改选位置，再确认修改。</p>
          <label>已见对象类型<select v-model="selectedKind" @change="selectedFeature = ''"><option v-for="(label, kind) in kindLabels" :key="kind" :value="kind" :disabled="!selectedGroup.entries.some(entry => entry.kind === kind)">{{ label }}</option></select></label>
          <label>已见对象<select v-model="selectedFeature"><option value="">请选择实际看到的对象</option><option v-for="(entry, index) in featureChoices" :key="entry.key" :value="entry.sourceId">{{ entry.name }}{{ entry.role === PRIMARY_BOSS_ROLE ? '（主遭遇首领）' : '' }}{{ featureChoices.filter(item => item.name === entry.name).length > 1 ? ` · 记录 ${index + 1}` : '' }}</option></select></label>
          <p v-if="chosenFeature?.role === PRIMARY_BOSS_ROLE" class="map-role-note">该点主遭遇首领（不含普通怪、召唤或突袭）</p>
          <div class="map-actions"><button type="button" :disabled="!selectedFeature" @click="saveObservation">确认线索</button><button type="button" @click="closeEditor">取消</button></div>
        </section>
      </div>
      <aside ref="resultsPanel" class="map-panel map-results" tabindex="-1" aria-label="候选结果">
        <h2>候选地图与夜王</h2><p class="map-result-count" role="status">{{ candidates.length }} 个候选方案</p>
        <p v-if="candidates.length === 1" class="map-status">当前已收录方案中的唯一匹配。仅展示该方案已核验的分布。</p>
        <template v-if="!candidates.length"><p class="map-status" role="status">没有匹配方案，已保留全部线索。请检查冲突条件或资料覆盖范围。</p><ul><li v-for="conflict in conflicts" :key="conflict">请复核：{{ conflict }}</li></ul></template>
        <template v-else><p v-if="nightlordResults.names.length">候选夜王：{{ nightlordResults.names.join('、') }}</p><p v-if="nightlordResults.unknown" class="map-muted">部分候选的夜王身份待核对。</p><p class="map-muted">具体普通／强化等实战形态以已核验关联为准，菜单身份不代表确定形态。</p>
          <ul class="map-candidate-list"><li v-for="pattern in visibleCandidates" :key="pattern.patternId"><strong>地图方案 {{ pattern.patternId }}</strong><span>{{ pattern.terrain?.state === 'known' ? terrainName(pattern.terrain.value) : '地形待核对' }}</span><span>{{ lordName(pattern) }}</span><span>第一夜：{{ bossName(pattern, 'day1') }}</span><span>第二夜：{{ bossName(pattern, 'day2') }}</span></li></ul>
          <nav v-if="resultPages > 1" class="map-actions" aria-label="候选方案分页"><button type="button" :disabled="candidatePage === 1" @click="candidatePage--">上一页</button><span>{{ candidatePage }} / {{ resultPages }}</span><button type="button" :disabled="candidatePage === resultPages" @click="candidatePage++">下一页</button></nav>
        </template>
        <h3>共同与可能点位</h3><p class="map-muted">共同：所有候选均确认存在。可能：仅部分候选确认存在，不代表概率。</p>
        <ul class="map-distribution-list"><li v-for="entry in currentTerrainEntries" :key="entry.key"><span class="map-layer-badge" :class="{ common: entry.common }">{{ entry.common ? '共同' : '可能' }}</span> {{ entry.name }} · {{ featureKindLabel(entry) }}<small>{{ pointLabel(entry) }}</small></li></ul><p v-if="!currentTerrainEntries.length" class="map-muted">当前地形暂无可展示的已核验分布。</p>
        <h3>方案事件</h3><p class="map-muted">事件位置尚未核验，不在地图标注落点。</p><ul class="map-event-list"><li v-for="event in events" :key="event.key"><span class="map-layer-badge" :class="{ common: event.common }">{{ event.common ? '共同' : '可能' }}</span> {{ event.name }}<small>{{ event.day ? `第${event.day === 1 ? '一' : '二'}日` : '发生日待核对' }}</small></li></ul><p v-if="!events.length" class="map-muted">暂无可确认的事件记录；未知不表示没有事件。</p>
      </aside>
    </div>
    </template>
  </section>
</template>

<style scoped>
#view-map{font-size:14px;line-height:1.6}
.map-page-heading{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:14px}
.map-page-heading .eyebrow{margin:0 0 4px;font-size:10px}
.map-page-heading h1{margin:0;color:#ecd7a7;font:600 28px/1.35 'Noto Serif SC',serif}
.map-page-heading>p{max-width:500px;margin:0;color:#afbfcb}
.map-status{margin:0 0 12px;padding:10px 14px;border-left:2px solid #bea36c;background:#172a3b;color:#d8dfdf}
.map-live-summary{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px;color:#beccd4}.map-live-summary button{min-height:42px;padding:7px 12px;border:1px solid #aa945f;border-radius:3px;background:#273547;color:#ead3a0;font:inherit}.map-live-summary button:focus-visible,.map-results:focus{outline:2px solid #e4c482;outline-offset:3px}.map-results{scroll-margin-top:16px}
.map-workspace{display:grid;grid-template-columns:minmax(205px,.85fr) minmax(0,2fr) minmax(205px,.85fr);align-items:start;gap:12px}
.map-panel{min-width:0;padding:14px;border:1px solid #3c5065;border-radius:4px;background:#142231}
.map-panel h2{margin:0 0 10px;color:#e3cd9c;font-size:18px}
.map-panel h3{margin:18px 0 8px;color:#d6c493;font-size:15px}
.map-muted{margin:6px 0 12px;color:#aebfcb;font-size:14px}
.map-filter-fields{display:grid;gap:10px}
.map-panel label{display:grid;gap:4px;color:#c5d0d7;font-size:14px}
.map-panel select,.map-panel input[type=search]{width:100%;min-width:0;min-height:42px;padding:8px;border:1px solid #52677d;border-radius:3px;background:#101c29;color:#e5e8e5;font:inherit}
.map-panel button{min-height:40px;padding:7px 10px;border:1px solid #56677a;border-radius:3px;background:#1b2d40;color:#e2d3af;font:inherit;cursor:pointer}
.map-panel button:disabled,.map-panel select:disabled,.map-panel input:disabled{opacity:.55;cursor:default}
.map-panel button:focus-visible,.map-panel input:focus-visible,.map-panel select:focus-visible{outline:2px solid #e4c482;outline-offset:3px}
.map-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px}
.map-panel-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}
.map-panel-heading .map-actions{margin-top:0}
.map-panel-heading h2{margin:0}
.map-layer-controls{display:flex;flex-wrap:wrap;gap:14px;margin:12px 0}
.map-layer-controls label{display:flex;align-items:center;gap:6px}
.map-layer-controls input{accent-color:#d3b87a;width:17px;height:17px}
.map-empty-canvas{display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:340px;padding:20px;border:1px dashed #496078;border-radius:3px;background:radial-gradient(ellipse,#203348,#0f1d2b);color:#d4c295;text-align:center}
.map-empty-canvas p{margin:4px 0}
.map-terrain-select{margin-top:12px}
.map-event-day{margin-top:10px}.map-event-list{list-style:none;padding:0;max-height:260px;overflow:auto}.map-event-list li{padding:7px 0;border-bottom:1px solid #354a5e}.map-event-list small{display:block;color:#afbfcb}
.map-observations,.map-name-list,.map-candidate-list,.map-distribution-list{list-style:none;margin:10px 0;padding:0}
.map-observations li,.map-candidate-list li{display:grid;gap:3px;padding:9px 0;border-bottom:1px solid #354a5e;overflow-wrap:anywhere}
.map-observations li>span,.map-candidate-list li>span{color:#adbdc9}
.map-observations .map-actions{margin-top:5px}
.map-name-list{max-height:260px;overflow:auto}
.map-name-list button{display:block;width:100%;margin-bottom:6px;text-align:left;overflow-wrap:anywhere}
.map-name-list small,.map-distribution-list small{display:block;color:#a7bac9;font-size:13px}
.map-viewport{max-width:100%;max-height:65vh;aspect-ratio:var(--map-aspect);overflow:auto;border:1px solid #475f76;border-radius:3px;overscroll-behavior:contain;background:#0f1d2b}
.map-surface{display:grid;place-items:center}
.map-stage{position:relative;isolation:isolate}
.map-stage>img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;user-select:none}
.map-stage .map-marker{position:absolute;display:grid;place-items:center;width:44px;height:44px;min-height:44px;padding:0;transform:translate(-50%,-50%);border:0;border-radius:50%;background:transparent;color:#fff;font-size:12px;font-weight:700;z-index:1}
.map-marker>span{display:grid;place-items:center;width:28px;height:28px;border:2px solid #b8d7ff;border-radius:50%;background:#234e80}
.map-marker.common>span{border-color:#f0d39a;background:#64512e}
.map-marker.observed>span{outline:3px solid #8ee2bb;outline-offset:2px}
.map-stage .map-marker.observed{z-index:2}
.map-stage .map-marker:focus-visible{outline:3px solid white;outline-offset:3px;z-index:3}
.map-point-editor{margin-top:14px;padding:12px;border:1px solid #ab935f;border-radius:3px;background:#1b2c3d;scroll-margin-top:18px}
.map-point-editor h3{margin-top:0}.map-point-editor label+label{margin-top:10px}
.map-role-note{padding:8px;border-left:2px solid #c6ac73;background:#24394c;color:#eed9ad;font-size:14px}
.map-point-editor:focus{outline:2px solid #d7bd82;outline-offset:2px}
.map-overlap-options{display:grid;gap:7px}
.map-result-count{margin:5px 0;font-size:20px;font-weight:650;color:#efd8a3}
.map-distribution-list{max-height:320px;overflow:auto}.map-distribution-list li{padding:7px 0;border-bottom:1px solid #354a5e;overflow-wrap:anywhere}
.map-layer-badge{display:inline-block;padding:1px 5px;border:1px solid #6a9ccb;border-radius:3px;background:#234569;color:#e0edff;font-size:12px}
.map-layer-badge.common{border-color:#bba26a;background:#514529;color:#f2dfb7}
@media(min-width:1151px){
  #view-map.active{display:flex;flex:1;min-height:0;flex-direction:column}
  .map-page-heading,.map-status,.map-live-summary{flex-shrink:0}
  .map-page-heading{gap:14px;margin-bottom:8px}
  .map-status{margin-bottom:8px;padding:7px 12px}
  .map-live-summary{margin-bottom:8px}
  .map-workspace{flex:1;min-height:0;align-items:stretch}
  .map-panel{min-height:0;max-height:100%;overflow:auto;scrollbar-gutter:stable}
  .map-clues .map-filter-fields{gap:7px}
  .map-filter-fields .map-muted{margin:0;font-size:13px}
  .map-canvas-panel{position:relative;display:flex;flex-direction:column;overflow:hidden}
  .map-canvas-panel>.map-panel-heading,.map-canvas-panel>.map-terrain-select,.map-canvas-panel>.map-layer-controls,.map-canvas-panel>.map-status,.map-canvas-panel>.map-muted{flex-shrink:0}
  .map-viewport{flex:1;min-height:120px;max-height:none;aspect-ratio:auto}
  .map-empty-canvas{flex:1;min-height:120px}
  .map-point-editor,.map-overlap-options{position:absolute;z-index:3;left:10px;right:10px;bottom:10px;max-height:65%;overflow:auto;overscroll-behavior:contain;box-shadow:0 8px 28px #0009}
  .map-point-editor{margin-top:0}
  .map-overlap-options{padding:10px;border:1px solid #ab935f;border-radius:3px;background:#1b2c3d}
  .map-point-editor h3{margin-bottom:5px}.map-point-editor>p{margin:5px 0}
  .map-point-editor label+label{margin-top:7px}
  .map-point-editor .map-actions{margin-top:8px}
}
@media(max-width:1150px){.map-workspace{grid-template-columns:minmax(210px,.8fr) minmax(0,1.8fr)}.map-results{grid-column:1/-1}}
@media(max-width:850px){.map-page-heading{align-items:flex-start;flex-direction:column;gap:8px}.map-workspace{grid-template-columns:minmax(0,1fr)}.map-results{grid-column:auto}.map-filter-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.map-empty-canvas{min-height:260px}}
@media(max-width:420px){.map-panel{padding:12px}.map-page-heading h1{font-size:25px}.map-filter-fields{gap:8px}.map-panel-heading{align-items:flex-start;flex-direction:column}}
</style>
