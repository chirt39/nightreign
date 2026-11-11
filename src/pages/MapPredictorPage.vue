<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { buildingChoicesAtPosition, pointChoiceContext, possiblePointChoices, coincidentMarkers, confirmedBuildingKeys, confirmedFieldEliteKeys, withoutPointObservations, MAP_DISPLAY_CATEGORIES, buildingIconPath, pointIconPath, nightlordPortrait, calibratedPointDirectory, collectLayers, definitionOptions, eventOptions, findCandidates, layoutMapMarkers, nearbyPoints, phaseBossOptions, referenceMapGroups, safeMapAsset, validPosition } from '../lib/map-predictor.js';

const props = defineProps({ active: Boolean, catalogVersions: Object });
const catalog = shallowRef(null), manifest = shallowRef(null), iconManifest = shallowRef(null), enemyImages = shallowRef(null), loading = ref(false), error = ref('');
const emptyFilters = () => ({ nightlord: '', firstNight: '', secondNight: '', depth: '', terrain: '', event: '', eventDay: '' });
const filters = reactive(emptyFilters()), observations = ref([]), undoStack = ref([]);
const candidatePage = ref(1), search = ref(''), namePage = ref(1), zoom = ref(1.65), failedAssets = ref(new Set());
const selectedReference = ref(null), overlapChoices = ref([]), controlDialog = ref(null), controlPanel = ref('more');
const selectedGroupKey = ref(''), pointDialog = ref(null);
const layerVisibility = reactive({ building: true, fieldElite: true });
const layerLabels = { building: '建筑', fieldElite: '野外精英怪' };
const dragging = ref(false); let dragStart = null, suppressMapClick = false;
const mapViewport = ref(null), viewportSize = reactive({ width: 0, height: 0 });
let controller, viewportObserver = null, viewportFrame = null;
const patterns = computed(() => catalog.value?.patterns || []);
const definitions = computed(() => catalog.value?.definitions || {});
const clues = computed(() => ({ filters: { ...filters }, observations: observations.value }));
const candidates = computed(() => findCandidates(patterns.value, clues.value, definitions.value));
const currentCandidate = computed(() => candidates.value[candidatePage.value - 1]);
const terrainView = computed(() => {
  if (filters.terrain) return filters.terrain;
  if (currentCandidate.value) return currentCandidate.value.terrain?.state === 'known' ? String(currentCandidate.value.terrain.value) : '';
  return observations.value[0]?.terrainId || options.value.terrain[0]?.value || '';
});
const options = computed(() => ({
  nightlord: definitionOptions(definitions.value.nightlords), terrain: definitionOptions(definitions.value.terrains),
  firstNight: phaseBossOptions(patterns.value, definitions.value.bosses, 'day1'),
  secondNight: phaseBossOptions(patterns.value, definitions.value.bosses, 'day2'),
  event: eventOptions(definitions.value.events),
}));
const moreFields = [{ key: 'firstNight', label: '第一夜首领' }, { key: 'secondNight', label: '第二夜首领' }, { key: 'event', label: '已见事件' }];
const pointDirectory = computed(() => calibratedPointDirectory(patterns.value));
function groupLayers(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (!MAP_DISPLAY_CATEGORIES.includes(entry.displayCategory)) continue;
    const key = JSON.stringify([entry.terrainId, entry.attachId]);
    if (!groups.has(key)) groups.set(key, { key, terrainId: entry.terrainId, attachId: entry.attachId, normalized: entry.normalized, entries: [] });
    groups.get(key).entries.push(entry);
  }
  return [...groups.values()];
}
const allGroups = computed(() => groupLayers(collectLayers(patterns.value, definitions.value)).filter(group => group.terrainId !== null && validPosition(group.normalized)));
const availableGroups = computed(() => allGroups.value.filter(group => group.terrainId === terrainView.value));
const candidateGroups = computed(() => {
  const groups = groupLayers(collectLayers(currentCandidate.value ? [currentCandidate.value] : [], definitions.value));
  for (const observation of observations.value) {
    const source = allGroups.value.find(item => item.terrainId === observation.terrainId && item.attachId === observation.attachId);
    if (!source) continue;
    const entry = source.entries.find(item => item.sourceId === observation.sourceId && (item.role || null) === (observation.role || null));
    if (!entry) continue;
    let group = groups.find(item => item.key === source.key);
    if (!group) { group = { ...source, entries: [] }; groups.push(group); }
    group.entries = group.entries.filter(item => item.kind !== entry.kind || (item.role || null) !== (entry.role || null));
    group.entries.unshift(entry);
  }
  return groups.filter(group => group.terrainId === terrainView.value && validPosition(group.normalized));
});
const mapGroups = computed(() => {
  const visible = candidateGroups.value.map(group => ({ ...group, entries: group.entries.filter(entry => layerVisibility[entry.displayCategory] || isObserved(group)) })).filter(group => group.entries.length);
  const result = [];
  for (const group of visible.sort((a,b) => Number(isObserved(b)) - Number(isObserved(a)))) {
    if (group.entries[0].kind === 'building' && result.some(item => item.entries[0].kind === 'building' && sameBuildingPosition(item, group))) continue;
    result.push(group);
  }
  return result;
});
function sameBuildingPosition(a,b) { return a.terrainId === b.terrainId && a.normalized && b.normalized && Math.abs(a.normalized.x-b.normalized.x)<.000001 && Math.abs(a.normalized.y-b.normalized.y)<.000001; }
const certainBuildings = computed(() => observations.value.length ? confirmedBuildingKeys(candidates.value, terrainView.value, definitions.value) : new Set());
const certainElites = computed(() => confirmedFieldEliteKeys(candidates.value, terrainView.value, definitions.value));
function isCertain(group) { return !group.reference && !isObserved(group) && group.entries.some(entry => (entry.kind === 'building' ? certainBuildings.value : certainElites.value).has(JSON.stringify([group.terrainId, group.attachId, entry.sourceId]))); }
const referenceGroups = computed(() => referenceMapGroups(catalog.value?.referencePoints, terrainView.value, layerVisibility));
const displayedMarkers = computed(() => layoutMapMarkers([...mapGroups.value, ...referenceGroups.value], stageSize.value.width, stageSize.value.height));
const matchingNameGroups = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase();
  return availableGroups.value.filter(group => !needle || `${group.entries.map(entry => entry.name).join(' ')} ${pointLabel(group)}`.toLocaleLowerCase().includes(needle));
});
const nameResultPages = computed(() => Math.max(1, Math.ceil(matchingNameGroups.value.length / 24)));
const nameGroups = computed(() => matchingNameGroups.value.slice((namePage.value - 1) * 24, namePage.value * 24));
const selectedGroup = computed(() => allGroups.value.find(group => group.key === selectedGroupKey.value));
const selectedChoices = computed(() => {
  const group = selectedGroup.value;
  if (!group) return [];
  const choices = group.entries.some(entry => entry.kind === 'building') ? buildingChoicesAtPosition(allGroups.value, group, false) : group.entries;
  const context = pointChoiceContext(clues.value, group, allGroups.value);
  const possible = possiblePointChoices(patterns.value, context, choices, definitions.value);
  const unique = new Map();
  for (const entry of [...choices.filter(isSelected), ...possible]) if (!unique.has(entry.sourceId)) unique.set(entry.sourceId, entry);
  return [...unique.values()];
});
const candidateNightlords = computed(() => {
  const ids = new Set(candidates.value.filter(pattern => pattern.nightlord?.state === 'known').map(pattern => String(pattern.nightlord.menuRowId)));
  return options.value.nightlord.filter(option => ids.has(option.value));
});
const selectedNightlord = computed(() => options.value.nightlord.find(option => option.value === filters.nightlord));
function portrait(value) { const path = nightlordPortrait(definitions.value.nightlords?.[value], enemyImages.value, iconManifest.value); return path && !failedAssets.value.has(path) ? path : null; }
function buildingIcon(entry) { const path = entry?.displayCategory === 'building' ? buildingIconPath(iconManifest.value, entry.sourceId) : null; return path && !failedAssets.value.has(path) ? path : null; }
function markerIcon(entry) { const path = entry?.displayCategory === 'fieldElite' ? pointIconPath(iconManifest.value, entry.worldMapPointIconId) : buildingIcon(entry); return path && !failedAssets.value.has(path) ? path : null; }
function setNightlord(value) { setFilter('nightlord', value); controlDialog.value?.close(); }
async function openControls(panel) { closeDialog(); controlPanel.value = panel; await nextTick(); if (!controlDialog.value?.open) controlDialog.value?.showModal(); }
const filterTags = computed(() => moreFields.filter(field => filters[field.key]).map(field => ({ key: field.key, text: `${field.label}：${options.value[field.key].find(option => option.value === filters[field.key])?.label || '待核对'}${field.key === 'event' && filters.eventDay ? ` · 第${filters.eventDay === '1' ? '一' : '二'}日` : ''}` })));
const asset = computed(() => { const entry = manifest.value?.terrains?.[terrainView.value]; return safeMapAsset(entry) && !failedAssets.value.has(entry.src) ? entry : null; });
const stageSize = computed(() => {
  if (!asset.value || !viewportSize.width || !viewportSize.height) return { width: 0, height: 0 };
  const scale = Math.min(viewportSize.width / asset.value.width, viewportSize.height / asset.value.height) * zoom.value;
  return { width: asset.value.width * scale, height: asset.value.height * scale };
});
function measureViewport() {
  viewportFrame = null;
  const viewport = mapViewport.value;
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect(), style = getComputedStyle(viewport);
  // Scrollbars change the content box; size the map from the fixed outer box instead.
  const width = rect.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
  const height = rect.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth);
  viewportSize.width = Math.max(0, Math.floor(width)); viewportSize.height = Math.max(0, Math.floor(height));
}
function scheduleViewportMeasure() { if (viewportFrame !== null) cancelAnimationFrame(viewportFrame); viewportFrame = requestAnimationFrame(measureViewport); }
function resetMap(full = false) { zoom.value = full ? 1 : 1.65; nextTick(() => { measureViewport(); centerMap(); }); }
function centerMap() { const viewport = mapViewport.value; if (viewport) viewport.scrollTo({ top: Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2), left: Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2), behavior: 'auto' }); }
function startDrag(event) { if (event.button !== 0 || !mapViewport.value) return; dragStart = { id: event.pointerId, x: event.clientX, y: event.clientY, left: mapViewport.value.scrollLeft, top: mapViewport.value.scrollTop }; suppressMapClick = false; }
function moveDrag(event) { if (!dragStart || dragStart.id !== event.pointerId) return; const dx = event.clientX - dragStart.x, dy = event.clientY - dragStart.y; if (!dragging.value && Math.hypot(dx, dy) < 6) return; dragging.value = true; suppressMapClick = true; mapViewport.value.setPointerCapture(event.pointerId); mapViewport.value.scrollLeft = dragStart.left - dx; mapViewport.value.scrollTop = dragStart.top - dy; }
function stopDrag() { dragStart = null; dragging.value = false; }
function pointNumber(point) { return pointDirectory.value.get(JSON.stringify([point.terrainId, String(point.attachId)]))?.number || '?'; }
function pointLabel(point) { return `位置 ${pointNumber(point)}`; }
function groupName(group) { return group.reference?.nameZh || (group.entries.length === 1 ? group.entries[0].name : `${pointLabel(group)} · ${group.entries.length} 项已知对象`); }
function groupCategory(group) { return group.reference ? '参考位置' : group.entries[0]?.kind === 'building' ? '建筑位置' : '野外精英位置'; }
function terrainName(value) { return definitions.value.terrains?.[String(value)]?.nameZh || '地形待核对'; }
function isObserved(group) { return observations.value.some(entry => entry.attachId === group.attachId && entry.terrainId === group.terrainId); }
function isSelected(entry) { return observations.value.some(item => item.attachId === entry.attachId && item.terrainId === entry.terrainId && item.sourceId === entry.sourceId && (item.role || null) === (entry.role || null)); }
function remember() { undoStack.value.push(JSON.stringify({ filters: { ...filters }, observations: observations.value })); if (undoStack.value.length > 50) undoStack.value.shift(); }
function setFilter(key, value) { if (filters[key] === value) return; remember(); filters[key] = value; if (key === 'event' && !value) filters.eventDay = ''; }
function clearClues() { remember(); Object.assign(filters, emptyFilters()); observations.value = []; closeDialog(); resetMap(); }
function undo() { const previous = undoStack.value.pop(); if (!previous) return; const state = JSON.parse(previous); Object.assign(filters, state.filters); observations.value = state.observations; closeDialog(); }
function removePoint(group) { remember(); observations.value = withoutPointObservations(observations.value, group).filter(item => !(item.kind === 'building' && group.entries[0].kind === 'building' && sameBuildingPosition(allGroups.value.find(p => p.terrainId === item.terrainId && p.attachId === item.attachId) || {}, group))); }
function clearObservations() { remember(); observations.value = []; }
async function showPointDialog() { await nextTick(); if (pointDialog.value && !pointDialog.value.open) pointDialog.value.showModal(); }
function chooseGroup(group) { if (!group) return; overlapChoices.value = []; selectedReference.value = null; selectedGroupKey.value = group.key; controlDialog.value?.close(); showPointDialog(); }
function openMarker(group) { controlDialog.value?.close(); if (group.reference) { overlapChoices.value = []; selectedGroupKey.value = ''; selectedReference.value = group.reference; showPointDialog(); } else chooseGroup(allGroups.value.find(item => item.key === group.key)); }
function openMapMatches(found) { if (!found.length) return; if (found.length === 1) openMarker(found[0]); else { selectedGroupKey.value = ''; selectedReference.value = null; overlapChoices.value = found; showPointDialog(); } }
function mapClicked(event) { if (suppressMapClick) { suppressMapClick = false; return; } const rect = event.currentTarget.getBoundingClientRect(); openMapMatches(nearbyPoints(displayedMarkers.value, { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }, rect.width, rect.height, 16)); }
function markerClicked(group, event) { if (event.detail > 0 && suppressMapClick) { suppressMapClick = false; return; } openMapMatches(coincidentMarkers(displayedMarkers.value, group, stageSize.value.width, stageSize.value.height)); }
function selectFeature(feature) {
  const group = selectedGroup.value;
  if (!group) return;
  const selected = isSelected(feature);
  const observation = { attachId: feature.attachId, terrainId: feature.terrainId, kind: feature.kind, sourceId: feature.sourceId, name: feature.name, ...(feature.role ? { role: feature.role } : {}) };
  remember();
  observations.value = observations.value.filter(item => {
    if (feature.kind === 'building' && item.kind === 'building') {
      const previous = allGroups.value.find(point => point.terrainId === item.terrainId && point.attachId === item.attachId);
      return !previous || !sameBuildingPosition(previous, group);
    }
    return !(item.attachId === observation.attachId && item.terrainId === observation.terrainId && item.kind === feature.kind && (item.role || null) === (feature.role || null));
  });
  if (!selected) observations.value.push(observation);
  closeDialog(); nextTick(() => mapViewport.value?.focus({ preventScroll: true }));
}
function closeDialog() { pointDialog.value?.close(); selectedReference.value = null; overlapChoices.value = []; selectedGroupKey.value = ''; }
function turnCandidate(step) { candidatePage.value = Math.min(candidates.value.length, Math.max(1, candidatePage.value + step)); closeDialog(); }
function imageFailed(event) { const src = event.target.getAttribute('src'); if (src) failedAssets.value = new Set([...failedAssets.value, src]); }
const referenceSourceUrl = computed(() => /^https?:\/\//i.test(selectedReference.value?.source?.url || '') ? selectedReference.value.source.url : null);
const iconPath = kind => kind === 'building' ? 'M3 10 12 3l9 7M5 9v12h14V9M9 21v-8h6v8' : kind === 'fieldElite' ? 'm12 3 8 5v8l-8 5-8-5V8l8-5M8 10h.01M16 10h.01M8 16l4-3 4 3' : 'm4 3 17 17-3 1L3 6V3h3M16 3l5 3-6 6M3 20l6-6M3 17l4 4';
async function loadCatalog() {
  if (loading.value || catalog.value) return;
  controller?.abort(); controller = new AbortController(); const signal = controller.signal; loading.value = true; error.value = '';
  fetch('/map-icon-manifest.json', { signal }).then(response => response.ok ? response.json() : null).then(data => { iconManifest.value = data; }).catch(() => {});
  const portraitVersion = props.catalogVersions?.['enemy-image-verified.json'];
  fetch(`/enemy-image-verified.json${portraitVersion ? `?v=${portraitVersion}` : ''}`, { signal }).then(response => response.ok ? response.json() : null).then(data => { enemyImages.value = data; }).catch(() => {});
  const assetVersion = props.catalogVersions?.['map-asset-manifest.json'];
  if (assetVersion) fetch(`/map-asset-manifest.json?v=${assetVersion}`, { signal }).then(response => response.ok ? response.json() : null).then(data => { if (data?.schemaVersion === 1) manifest.value = data; }).catch(() => {});
  try {
    const version = props.catalogVersions?.['map-catalog.json'];
    if (!/^[a-f0-9]{12}$/i.test(version || '')) throw new Error('地图资料尚未就绪，请刷新后重试。');
    const response = await fetch(`/map-catalog.json?v=${version}`, { signal });
    if (!response.ok) throw new Error('地图资料读取失败，请重试。');
    const data = await response.json();
    if (data?.schemaVersion !== 1 || !Array.isArray(data.patterns) || !data.definitions) throw new Error('地图资料格式暂不支持，请刷新后重试。');
    catalog.value = data;
  } catch (cause) { if (cause.name !== 'AbortError') error.value = cause.message || '地图资料加载失败。'; }
  finally { loading.value = false; }
}
watch(clues, () => { candidatePage.value = 1; }, { deep: true });
watch(terrainView, () => { closeDialog(); resetMap(); });
watch([search, terrainView], () => { namePage.value = 1; });
watch(() => props.active, active => { if (active) { loadCatalog(); nextTick(scheduleViewportMeasure); } }, { immediate: true });
watch(mapViewport, viewport => { viewportObserver?.disconnect(); if (!viewport) return; if (typeof ResizeObserver !== 'undefined') { viewportObserver = new ResizeObserver(scheduleViewportMeasure); viewportObserver.observe(viewport, { box: 'border-box' }); } scheduleViewportMeasure(); });
watch(asset, () => nextTick(scheduleViewportMeasure));
watch(stageSize, () => { if (!dragging.value) nextTick(centerMap); });
onMounted(() => window.addEventListener('resize', scheduleViewportMeasure));
onBeforeUnmount(() => { controller?.abort(); viewportObserver?.disconnect(); if (viewportFrame !== null) cancelAnimationFrame(viewportFrame); window.removeEventListener('resize', scheduleViewportMeasure); });
</script>

<template>
  <section id="view-map" class="view reference-page" :class="{ active }">
    <p v-if="loading" role="status">正在载入地图…</p>
    <div v-else-if="error" role="alert"><p>{{ error }}</p><button type="button" @click="loadCatalog">重新载入</button></div>
    <template v-else-if="catalog">
      <div class="map-workspace">
        <aside class="map-conditions" aria-label="地图推算条件">
          <header class="map-heading reference-heading"><h1>地图与夜王推算</h1></header>
          <div class="map-mobile-summary"><strong role="status">剩余 {{ candidates.length }} 张地图</strong><button type="button" @click="openControls('conditions')">条件与结果</button></div>
          <div class="map-desktop-conditions">
            <div class="map-toolbar">
              <label>地形<select :value="filters.terrain" @change="setFilter('terrain', $event.target.value)"><option value="">全部地形</option><option v-for="option in options.terrain" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
              <button class="map-nightlord-choice" type="button" aria-label="选择已知夜王" @click="openControls('nightlords')"><img v-if="selectedNightlord && portrait(selectedNightlord.value)" :src="portrait(selectedNightlord.value)" alt="" @error="imageFailed"><span>已知夜王：{{ selectedNightlord?.label || '不选' }}</span></button>
              <div class="map-condition-actions"><button type="button" @click="clearClues">重置</button><button type="button" :disabled="!undoStack.length" @click="undo">撤销</button><button type="button" @click="openControls('more')">更多线索{{ filterTags.length ? ` · ${filterTags.length}` : '' }}</button></div>
            </div>
            <div class="map-result-bar">
              <strong role="status">剩余 {{ candidates.length }} 张地图</strong>
              <div class="map-candidate-switch" aria-label="候选地图切换"><button type="button" :disabled="candidatePage <= 1" @click="turnCandidate(-1)">上一张</button><span>{{ candidates.length ? candidatePage : 0 }} / {{ candidates.length }}</span><button type="button" :disabled="candidatePage >= candidates.length" @click="turnCandidate(1)">下一张</button></div>
              <span>当前地图：{{ terrainName(terrainView) }}</span>
            </div>
            <button class="map-results-open" type="button" @click="openControls('results')">可能夜王 · {{ candidateNightlords.length }} 位 <span aria-hidden="true">›</span></button>
            <p class="map-marking-help"><i class="manual"></i>手动标注 <i class="certain"></i>剩余候选一致</p>
          </div>
        </aside>
        <div class="map-canvas-panel">
          <div class="map-canvas-tools">
            <div v-if="!candidates.length" class="map-conflict" role="alert">线索冲突或超出资料范围，请取消标注或修改条件。<button v-if="observations.length" type="button" @click="clearObservations">清除全部标注</button></div>
            <div class="map-layer-switches" aria-label="地图图层"><label v-for="(label, category) in layerLabels" :key="category"><input v-model="layerVisibility[category]" type="checkbox">{{ label }}</label></div>
            <div class="map-zoom"><button type="button" :disabled="!asset || zoom <= 1" aria-label="缩小地图" @click="zoom = Math.max(1, zoom - .25)">−</button><button type="button" :disabled="!asset || zoom >= 3" aria-label="放大地图" @click="zoom = Math.min(3, zoom + .25)">＋</button><button type="button" :disabled="!asset" @click="resetMap(true)">全图适配</button></div>
          </div>
          <div v-if="asset" ref="mapViewport" class="map-viewport" :class="{ dragging }" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="stopDrag" @pointercancel="stopDrag" tabindex="0" aria-label="地图，点击图标标记，拖动平移">
            <div class="map-surface" :style="{ width: `${stageSize.width}px`, height: `${stageSize.height}px` }"><div v-if="stageSize.width > 0" class="map-stage" :style="{ width: `${stageSize.width}px`, height: `${stageSize.height}px` }" @click="mapClicked">
              <img :src="asset.src" :alt="`${terrainName(terrainView)}底图`" draggable="false" @error="imageFailed">
              <div v-for="group in displayedMarkers" :key="group.key" class="map-marker-anchor" :style="{ left: `${group.markerX}px`, top: `${group.markerY}px` }">
                <button class="map-marker" :class="{ observed: isObserved(group), certain: isCertain(group), reference: group.reference, dense: group.dense, 'game-icon': markerIcon(group.entries[0]), building: group.entries[0].displayCategory === 'building', elite: group.entries[0].displayCategory === 'fieldElite' }" type="button" :aria-label="group.reference ? `${groupName(group)}，参考位置` : `${pointLabel(group)}，${groupName(group)}，${isObserved(group) ? '已标注' : '推算点位'}`" @click.stop="markerClicked(group, $event)" :title="groupName(group)"><span aria-hidden="true"><img v-if="markerIcon(group.entries[0])" :src="markerIcon(group.entries[0])" alt="" draggable="false" @error="imageFailed"><svg v-else viewBox="0 0 24 24"><path :d="iconPath(group.entries[0].displayCategory)" /></svg></span><small>{{ groupName(group) }}<em v-if="group.reference">参考</em></small></button>
                <button v-if="isObserved(group)" type="button" class="map-marker-remove" :aria-label="`取消${pointLabel(group)}的全部标注`" title="取消该点全部标注" @pointerdown.stop @click.stop="removePoint(group)">×</button>
              </div>
            </div></div>
          </div>
          <div v-else class="map-empty">底图暂不可用，请在更多线索中按名称标记。</div>
        </div>
      </div>
      <dialog ref="controlDialog" class="map-point-dialog map-control-dialog" aria-labelledby="map-control-title">
        <header><h2 id="map-control-title">{{ { nightlords: '选择已知夜王', more: '更多线索', results: '可能夜王', conditions: '条件与结果' }[controlPanel] }}</h2><button type="button" aria-label="关闭条件" @click="controlDialog.close()">×</button></header>
        <div v-if="controlPanel === 'nightlords'" class="map-nightlord-options" role="radiogroup" aria-label="已知夜王"><button type="button" role="radio" :aria-checked="!filters.nightlord" @click="setNightlord('')">不选</button><button v-for="option in options.nightlord" :key="option.value" type="button" role="radio" :aria-checked="filters.nightlord === option.value" @click="setNightlord(option.value)"><img v-if="portrait(option.value)" :src="portrait(option.value)" alt="" @error="imageFailed"><span v-else class="map-portrait-fallback">图片待补</span>{{ option.label }}</button></div>
        <section v-else-if="controlPanel === 'results'" class="map-nightlords" aria-label="候选夜王"><ul><li v-for="option in candidateNightlords" :key="option.value"><img v-if="portrait(option.value)" :src="portrait(option.value)" alt="" @error="imageFailed"><span v-else class="map-portrait-fallback">图片待补</span><span>{{ option.label }}</span></li></ul><p v-if="!candidateNightlords.length">暂无候选</p></section>
        <template v-else>
          <template v-if="controlPanel === 'conditions'"><label>地形<select :value="filters.terrain" @change="setFilter('terrain', $event.target.value)"><option value="">全部地形</option><option v-for="option in options.terrain" :key="option.value" :value="option.value">{{ option.label }}</option></select></label><button class="map-nightlord-choice" type="button" @click="openControls('nightlords')">已知夜王：{{ selectedNightlord?.label || '不选' }}</button><p>剩余 {{ candidates.length }} 张地图 · {{ terrainName(terrainView) }}</p><div class="map-candidate-switch"><button type="button" :disabled="candidatePage <= 1" @click="turnCandidate(-1)">上一张</button><span>{{ candidates.length ? candidatePage : 0 }} / {{ candidates.length }}</span><button type="button" :disabled="candidatePage >= candidates.length" @click="turnCandidate(1)">下一张</button></div><button type="button" @click="openControls('results')">可能夜王 · {{ candidateNightlords.length }} 位</button></template>
          <div class="map-more-fields"><label v-for="field in moreFields" :key="field.key">{{ field.label }}<select :value="filters[field.key]" @change="setFilter(field.key, $event.target.value)"><option value="">不选</option><option v-for="option in options[field.key]" :key="option.value" :value="option.value">{{ option.label }}</option></select></label><label>事件发生日<select :value="filters.eventDay" :disabled="!filters.event" @change="setFilter('eventDay', $event.target.value)"><option value="">不选</option><option value="1">第一日</option><option value="2">第二日</option></select></label></div>
          <div class="map-condition-actions"><button type="button" :disabled="!undoStack.length" @click="undo">撤销上一步</button><button type="button" @click="clearClues">重置条件</button></div>
          <details class="map-name-picker"><summary>按名称标记位置</summary><label>地点或首领<input v-model="search" type="search" placeholder="搜索名称或位置编号"></label><ul><li v-for="group in nameGroups" :key="group.key"><button type="button" @click="chooseGroup(group)">{{ pointLabel(group) }} · {{ groupCategory(group) }}</button></li></ul><p v-if="!nameGroups.length">没有匹配位置。</p><nav v-if="nameResultPages > 1" class="map-name-pagination" aria-label="位置名称分页"><button type="button" :disabled="namePage === 1" @click="namePage--">上一页</button><span>{{ namePage }} / {{ nameResultPages }}</span><button type="button" :disabled="namePage === nameResultPages" @click="namePage++">下一页</button></nav></details>
        </template>
      </dialog>
      <dialog ref="pointDialog" class="map-point-dialog" aria-labelledby="map-point-title" @close="selectedGroupKey = ''; selectedReference = null; overlapChoices = []">
        <header><h2 id="map-point-title">{{ overlapChoices.length ? '选择重合位置' : selectedReference ? `${selectedReference.nameZh} · 参考位置` : selectedGroup ? (selectedGroup.entries[0].kind === 'building' ? '建筑位置' : pointLabel(selectedGroup)) : '选择已见对象' }}</h2><button type="button" aria-label="关闭选择" @click="closeDialog">×</button></header>
        <div v-if="overlapChoices.length" class="map-feature-choices map-overlap-choices"><button v-for="group in overlapChoices" :key="group.key" type="button" @click="openMarker(group)"><img v-if="markerIcon(group.entries[0])" :src="markerIcon(group.entries[0])" alt="" @error="imageFailed"><svg v-else viewBox="0 0 24 24" aria-hidden="true"><path :d="iconPath(group.entries[0].displayCategory)" /></svg><span>{{ group.reference ? groupName(group) : pointLabel(group) }}<small>{{ groupCategory(group) }}</small></span></button></div>
        <div v-else-if="selectedReference" class="map-reference-info"><p>{{ selectedReference.locationNote }}</p><p class="map-reference-note">参考位置，仅供查看，不参与地图筛选。</p><p class="map-reference-source">来源：{{ selectedReference.source?.author }} · <a v-if="referenceSourceUrl" :href="referenceSourceUrl" target="_blank" rel="noopener noreferrer">{{ selectedReference.source?.label }}</a><span v-else>{{ selectedReference.source?.label }}</span></p></div>
        <template v-else-if="selectedGroup"><template v-for="(label, category) in layerLabels" :key="category"><h3 v-if="selectedChoices.some(entry => entry.displayCategory === category)">{{ label }}</h3><div class="map-feature-choices"><button v-for="entry in selectedChoices.filter(item => item.displayCategory === category)" :key="entry.key" type="button" :aria-pressed="isSelected(entry)" :class="{ selected: isSelected(entry) }" @click="selectFeature(entry)"><img v-if="markerIcon(entry)" :src="markerIcon(entry)" alt="" @error="imageFailed"><svg v-else viewBox="0 0 24 24" aria-hidden="true"><path :d="iconPath(entry.displayCategory)" /></svg><span>{{ entry.name }}</span><span v-if="isSelected(entry)" class="map-selected-check" aria-hidden="true">✓</span></button></div></template></template>
      </dialog>
    </template>
  </section>
</template>

<style scoped>
.map-workspace,.map-conditions{min-width:0}.map-conditions{margin-bottom:12px}
#view-map{font-size:14px;line-height:1.5;min-width:0}.map-heading{display:flex;align-items:center;gap:20px;margin-bottom:10px}.map-heading h1{margin:0;color:#ecd7a7;font:600 25px/1.35 'Noto Serif SC',serif;white-space:nowrap}.map-heading p{margin:0;color:#b6c7d2;font-size:12px}
button,select,input{font:inherit}button,summary{cursor:pointer}button{min-height:38px;padding:6px 12px;border:1px solid #536c82;border-radius:4px;background:#1b2d40;color:#e7d5ac}button:disabled{opacity:.4;cursor:default}button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid #ecd39a;outline-offset:2px}
label{display:grid;gap:4px;min-width:0;color:#c7d3da}select,input{width:100%;min-width:0;min-height:40px;padding:7px 10px;border:1px solid #4c657b;border-radius:4px;background:#101d2a;color:#e0e7e9}
.map-toolbar{display:flex;align-items:flex-end;gap:12px;margin-bottom:10px}.map-toolbar label,.map-nightlord-field{width:220px}.map-toolbar>button{min-height:40px}
.map-result-bar{position:relative;display:flex;align-items:center;flex-wrap:wrap;gap:10px 20px;margin:0 0 7px}.map-result-bar>strong{font-size:17px;color:#f0dab0}.map-candidate-switch{display:flex;align-items:center;gap:10px}.map-candidate-switch>span{min-width:64px;text-align:center;font-variant-numeric:tabular-nums}.map-more{margin-left:auto}.map-more>summary{padding:8px 12px;border:1px solid #536c82;border-radius:4px;color:#d7c496;list-style:none}.map-more[open]>summary{border-color:#d0b477;background:#29394a}.map-more-content{position:static;z-index:5;top:calc(100% + 7px);right:0;width:min(650px,100%);max-height:none;overflow:visible;padding:12px 0 0;border:0;background:none}.map-more-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.map-more-actions{margin-top:12px}.map-name-picker{margin-top:12px;border-top:1px solid #3a5065;padding-top:12px}.map-name-picker>summary{color:#d8c28f}.map-name-picker label{margin-top:10px}.map-name-picker ul{list-style:none;padding:0;max-height:none;overflow:visible}.map-name-picker li+li{margin-top:5px}.map-name-picker li button{width:100%;text-align:left;overflow-wrap:anywhere}.map-name-pagination{display:flex;align-items:center;gap:10px}
.map-clue-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.map-clue-tag{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:2px 4px 2px 9px;border:1px solid #708a6f;border-radius:4px;background:#243d36;color:#ddeddd}.map-clue-tag>span{overflow-wrap:anywhere}.map-tag-name{min-height:32px;padding:2px 0;border:0;background:none;color:inherit;overflow-wrap:anywhere;text-align:left}.map-tag-remove{min-height:32px;width:32px;padding:0;border:0;background:none;color:inherit;font-size:21px;flex-shrink:0}
.map-nightlords{margin:0 0 10px;color:#b8c9d4;font-size:14px}.map-conflict{margin:0 0 10px;padding:8px 12px;border-left:2px solid #d08b78;background:#392b2b;color:#f0c6b9}
.map-canvas-panel{display:flex;flex-direction:column;min-width:0;min-height:0;padding:10px;border:1px solid #3e566e;border-radius:5px;background:#132131}.map-canvas-tools{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.map-canvas-tools>div{display:flex;gap:6px}.map-legend{display:flex;align-items:center;gap:6px;color:#b4c5d1;font-size:13px}.map-legend i{display:inline-block;width:10px;height:10px;border-radius:50%;background:#446e9c;border:1px solid #b4d2ed}.map-legend i.observed{background:#528e70;border-color:#a5e5bc;margin-right:0}.map-legend i:not(.observed){margin-left:8px}
.map-viewport{max-width:100%;height:72dvh;min-height:420px;overflow:auto;overscroll-behavior:contain;touch-action:none;cursor:grab;background:#0d1926;border:1px solid #324b62;border-radius:3px}.map-surface{display:grid;place-items:center;min-width:100%;min-height:100%}.map-stage{position:relative;isolation:isolate}.map-viewport.dragging{cursor:grabbing}.map-layer-switches{display:flex;gap:12px;flex-wrap:wrap}.map-layer-switches label{display:flex;align-items:center;gap:5px;font-size:12px}.map-layer-switches input{width:16px;min-height:16px;accent-color:#c9b16e}.map-stage>img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;user-select:none}.map-stage .map-marker{--marker-size:32px;--marker-hit:36px;position:absolute;display:grid;place-items:center;width:var(--marker-hit);height:var(--marker-hit);min-height:var(--marker-hit);padding:0;transform:translate(-50%,-50%);border:0;border-radius:50%;background:transparent;z-index:1}.map-marker svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.map-marker small{display:none;position:absolute;top:calc(50% + var(--marker-size)/2 + 4px);max-width:180px;width:max-content;white-space:normal;padding:3px 6px;border:1px solid #8c7a53;border-radius:3px;background:#0c1a29f5;color:#f0e0bc;font-size:12px;pointer-events:none}.map-marker:hover small,.map-marker:focus-visible small{display:block}.map-marker.building{--marker-size:40px;--marker-hit:44px}.map-marker.dense{--marker-size:28px;--marker-hit:32px}.map-marker.building.dense{--marker-size:32px;--marker-hit:36px}.map-marker>span>img{width:100%;height:100%;object-fit:contain}.map-marker.game-icon>span{background:transparent;border:0;border-radius:0}.map-marker.dense svg{width:17px;height:17px}.map-marker:hover,.map-marker:focus-visible{z-index:4}.map-marker>span{display:grid;place-items:center;width:var(--marker-size);height:var(--marker-size);border:1px solid #c3d7ed;border-radius:50%;background:#234d79;color:#fff;font-size:12px;font-weight:650}.map-marker.observed{z-index:2}.map-marker.observed>span{background:#326e4e;border-color:#b8edcc;outline:3px solid #8de0ae;outline-offset:1px}.map-stage .map-marker:focus-visible{outline:3px solid white;outline-offset:2px;z-index:3}.map-empty{display:grid;place-items:center;min-height:280px;color:#bacbd5}.map-point-status{margin:8px 0 0;color:#d7c69d}
.map-marker.reference>span{border:2px dashed #e6c98a;background:#3c3541}.map-marker small em{margin-left:4px;font-size:10px;font-style:normal;color:#f4cf88}.map-reference-info{padding-top:6px;line-height:1.8}.map-reference-note,.map-reference-source{color:#b6c7d2;font-size:13px}.map-reference-source a{color:#e6cc95;text-decoration:underline}
.map-point-dialog{width:min(650px,calc(100% - 28px));max-height:80dvh;margin:auto;padding:18px;border:1px solid #9c8559;border-radius:6px;background:#142637;color:#e4e9e5;box-shadow:0 20px 65px #000b}.map-point-dialog::backdrop{background:#050f1bd1}.map-point-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px}.map-point-dialog h2{margin:0;color:#e6d0a2;font-size:19px}.map-point-dialog header button{width:38px;padding:0;font-size:23px;flex-shrink:0}.map-point-dialog h3{margin:16px 0 8px;color:#bdccd6;font-size:14px;font-weight:500}.map-feature-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.map-feature-choices button{display:flex;align-items:center;gap:10px;min-height:60px;text-align:left;padding:10px;overflow-wrap:anywhere}.map-feature-choices img{width:30px;height:30px;object-fit:contain;flex-shrink:0}.map-overlap-choices small{display:block;color:#d5c08d;font-size:12px}.map-feature-choices svg{width:30px;height:30px;flex-shrink:0;fill:none;stroke:#d8c18b;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.map-feature-choices button.selected{border-color:#a9d7ab;background:#2b4939;color:#e1f4df}.map-selected-check{margin-left:auto;color:#bde8bd}.map-overlap-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:16px}.map-overlap-choices button{text-align:left}.map-overlap-choices small{display:block;margin-top:4px;color:#b1c4d1}
.map-nightlord-field{display:grid;gap:4px;color:#c7d3da}.map-nightlord-picker>summary{display:flex;align-items:center;gap:8px;min-height:44px;padding:4px 8px;border:1px solid #4c657b;border-radius:4px;background:#101d2a;color:#e0e7e9;list-style:none}.map-nightlord-picker img,.map-nightlord-options .map-portrait-fallback{width:38px;height:38px;object-fit:cover;flex-shrink:0}.map-picker-arrow{margin-left:auto}.map-nightlord-options{display:grid;gap:5px;max-height:none;overflow:visible;padding:6px 0}.map-nightlord-options button{display:flex;align-items:center;gap:8px;text-align:left}.map-nightlord-options button[aria-checked=true]{border-color:#d6bd7c;background:#334339}.map-portrait-fallback{display:grid;place-items:center;width:36px;height:36px;flex-shrink:0;border:1px solid #4c657b;background:#1b2935;font-size:10px;color:#b7c2cc;line-height:1.2;text-align:center}.map-nightlords h2{margin:0 0 8px;font-size:13px;font-weight:500;color:#b8c9d4}.map-nightlords ul{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;list-style:none;margin:0;padding:0}.map-nightlords li{display:flex;align-items:center;gap:6px;min-width:0;font-size:12px;line-height:1.3}.map-nightlords li img{width:36px;height:36px;object-fit:cover;flex-shrink:0}.map-nightlords li>span:last-child{overflow-wrap:anywhere}
@media(min-width:1151px){
#view-map.active{display:flex;flex:1;min-height:0;flex-direction:column}
.map-workspace{display:grid;grid-template-columns:300px minmax(0,1fr);gap:14px;align-items:start}
.map-conditions{margin-bottom:0;min-height:0;overflow:visible;padding:14px;border:1px solid #3e566e;border-radius:5px;background:#132131}
.map-heading{align-items:flex-start;flex-direction:column;gap:8px;margin-bottom:18px}.map-heading h1{font-size:23px}.map-heading p{font-size:13px;line-height:1.7}
.map-toolbar{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-bottom:16px}.map-toolbar label,.map-nightlord-field{width:auto}.map-toolbar>button{justify-self:start}
.map-result-bar{gap:12px;align-items:flex-start;flex-direction:column;border-top:1px solid #3a5065;padding-top:14px;margin-bottom:12px}.map-result-bar>strong{font-size:18px}.map-candidate-switch{width:100%;justify-content:space-between;gap:5px}.map-candidate-switch button{padding:6px 10px}.map-candidate-switch>span{min-width:54px}
.map-more{margin:0;width:100%}.map-more-content{position:static;width:100%;max-height:none;padding:12px 0 0;border:0;box-shadow:none;background:none}.map-more-fields{grid-template-columns:minmax(0,1fr)}.map-name-pagination{gap:5px;font-size:12px}.map-name-pagination button{padding:5px 8px}
.map-clue-tags{max-height:none;overflow:visible}.map-nightlords{font-size:13px;line-height:1.8;margin:0}.map-canvas-panel{position:sticky;top:12px;height:calc(100dvh - 78px);min-height:500px}.map-viewport{flex:1;height:auto;min-height:0}.map-canvas-tools{flex-wrap:wrap;flex-shrink:0}.map-layer-switches{gap:8px}
}
@media(max-width:850px){.map-heading{align-items:flex-start;flex-direction:column;gap:5px}.map-heading h1{font-size:23px}.map-toolbar{gap:8px}.map-toolbar label,.map-nightlord-field{flex:1;width:auto;min-width:0}.map-result-bar{gap:8px}.map-result-bar>strong{font-size:16px}.map-more{margin-left:0}.map-candidate-switch>span{min-width:45px}.map-more-content{width:100%;padding:12px}.map-canvas-panel{padding:7px}.map-clue-tags{max-height:none}.map-nightlords{line-height:1.6}.map-canvas-tools{flex-wrap:wrap}.map-point-dialog{padding:14px}.map-feature-choices{gap:6px}.map-feature-choices button{gap:7px;padding:8px}.map-feature-choices svg{width:25px;height:25px}.map-viewport{height:68dvh;min-height:420px}.map-layer-switches{gap:8px}.map-canvas-tools>div{flex-wrap:wrap}}
@media(max-width:380px){.map-toolbar{flex-wrap:wrap}.map-toolbar label,.map-nightlord-field{flex-basis:40%}.map-toolbar>button{width:100%}.map-feature-choices,.map-overlap-choices{grid-template-columns:minmax(0,1fr)}}

#view-map.active{display:flex;flex:1;flex-direction:column;min-height:0;width:100%;margin:0}
.map-workspace{display:grid;grid-template-columns:300px minmax(0,1fr);gap:12px;flex:1;min-height:0;align-items:stretch}
.map-conditions{min-height:0;margin:0;padding:14px;overflow:visible;border:1px solid #3e566e;border-radius:5px;background:#132131}
.map-mobile-summary{display:none}.map-heading{margin-bottom:12px}.map-toolbar{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin:0 0 12px}.map-toolbar label{width:auto}.map-condition-actions{display:flex;flex-wrap:wrap;gap:6px}.map-condition-actions button{padding:6px 9px}
.map-nightlord-choice{display:flex;align-items:center;gap:8px;width:100%;text-align:left;min-height:44px}.map-nightlord-choice img{width:34px;height:34px;object-fit:contain;flex-shrink:0}
.map-result-bar{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding-top:12px;margin-bottom:12px;border-top:1px solid #3a5065}.map-candidate-switch{width:100%;justify-content:space-between;gap:6px}.map-results-open{width:100%;display:flex;justify-content:space-between}.map-marking-help{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:#b5c5cf}.map-marking-help i{width:12px;height:12px;border:2px solid #8de0ae}.map-marking-help .certain{border-color:#ed807b}
.map-canvas-panel{position:static;height:auto;min-height:0;display:flex;flex-direction:column}.map-viewport{flex:1;min-height:0;height:auto}.map-canvas-tools{display:flex;flex-shrink:0;flex-wrap:wrap}.map-canvas-tools .map-conflict{display:flex;align-items:center;flex-wrap:wrap;gap:8px;flex:1 0 100%;margin:0;padding:6px 8px;font-size:13px}.map-zoom{margin-left:auto}
.map-marker-anchor{position:absolute;width:0;height:0;z-index:1}.map-marker-anchor:has(.observed){z-index:3}.map-marker-anchor:hover,.map-marker-anchor:focus-within{z-index:5}
.map-stage .map-marker{--marker-size:40px;--marker-hit:44px;left:0;top:0}.map-marker.building{--marker-size:48px;--marker-hit:52px}.map-marker.dense{--marker-size:32px;--marker-hit:36px}.map-marker.building.dense{--marker-size:40px;--marker-hit:44px}
.map-marker.certain:not(.observed)>span{outline:3px solid #ec7771;outline-offset:2px}.map-marker.observed>span{outline:3px solid #8de0ae;outline-offset:2px}
.map-marker-remove{position:absolute;left:17px;top:-32px;width:22px;height:22px;min-height:22px;padding:0;border:1px solid #bde8cd;border-radius:50%;background:#24573d;color:#fff;font-size:18px;line-height:1;z-index:6}
.map-control-dialog{width:min(640px,calc(100% - 24px));overflow:auto;max-height:calc(100dvh - 24px)}.map-point-dialog{overflow:auto;max-height:calc(100dvh - 24px)}.map-point-dialog>header{position:sticky;top:-18px;z-index:2;padding:6px 0;background:#142637}.map-control-dialog>label,.map-control-dialog>.map-nightlord-choice,.map-control-dialog>.map-candidate-switch{margin-top:12px}.map-more-fields{margin-top:16px}.map-control-dialog .map-condition-actions{margin-top:14px}.map-nightlord-options{grid-template-columns:repeat(2,minmax(0,1fr));max-height:none;overflow:visible;margin-top:12px}.map-nightlords{margin-top:18px}.map-nightlords ul{gap:12px}.map-selection-help{color:#b8cbd6;font-size:13px;margin:12px 0}
@media(max-width:1150px),(max-height:650px){
.map-workspace{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);gap:8px}.map-conditions{padding:8px 10px}.map-heading{margin:0 0 7px}.map-desktop-conditions{display:none}.map-mobile-summary{display:flex;align-items:center;justify-content:space-between;gap:8px}.map-mobile-summary strong{font-size:15px;color:#ecd7a7}.map-mobile-summary button{min-height:34px;padding:5px 10px}.map-canvas-panel{padding:7px}.map-viewport{height:auto;min-height:0}.map-layer-switches{gap:8px}.map-canvas-tools{gap:5px}.map-zoom{gap:4px}.map-zoom button{min-height:32px;padding:4px 8px;font-size:12px}
}
@media(max-width:480px){.map-heading h1{font-size:22px}.map-point-dialog{padding:12px}.map-point-dialog>header{top:-12px}.map-more-fields{grid-template-columns:minmax(0,1fr)}.map-nightlord-options{gap:6px}.map-nightlord-options button{padding:6px;font-size:13px}.map-nightlord-options img{width:32px;height:32px}.map-canvas-tools .map-conflict{font-size:12px}.map-conflict button{font-size:12px;min-height:30px}}
.map-marker.elite:not(.reference) small{display:block;max-width:120px;text-align:center;font-size:11px;line-height:1.3;padding:2px 4px}.map-marker.elite:hover small,.map-marker.elite:focus-visible small{max-width:180px}
</style>
