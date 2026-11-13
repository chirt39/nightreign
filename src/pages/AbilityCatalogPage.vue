<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { abilityGroupNames, abilityGroupNote } from '../lib/ability-groups.js';
const props = defineProps({ active: Boolean, catalogVersions: Object, kind: { type: String, required: true } });
const isArts = props.kind === 'arts';
const title = isArts ? '战技' : '魔法与祷告';
const file = isArts ? 'arts-catalog.json' : 'spells-catalog.json';
const keys = isArts ? { id: 'artId', query: 'artQ', page: 'artPage' } : { id: 'spellId', query: 'spellQ', page: 'spellPage' };
const groupKey = isArts ? 'artGroup' : 'spellGroup';
const group = ref('');
const showAllWeapons = ref(false);
const entries = shallowRef([]);
const loaded = ref(false), loading = ref(false), error = ref('');
const query = ref(''), type = ref('all'), selectedId = ref(''), page = ref(1);
const failedImages = ref(new Set());
const heading = ref(null), detailRoot = ref(null), listRoot = ref(null);
const pageSize = 24;
let controller = null, request = null;
const typeOptions = isArts
  ? [{id:'all',name:'全部'}, {id:'fixed',name:'固定战技'}, {id:'possible',name:'可随机出现'}]
  : [{id:'all',name:'全部'}, {id:'sorcery',name:'魔法'}, {id:'incantation',name:'祷告'}];
function matchesType(entry) {
  if (type.value === 'fixed') return Boolean(entry.fixedWeapons?.length);
  if (type.value === 'possible') return Boolean(entry.possibleWeapons?.length);
  return type.value === 'all' || entry.type === type.value;
}
const groupOptions = computed(() => [...new Set(entries.value.filter(matchesType).flatMap(entry => entry.groups))]);
function chooseType(id) {
  type.value = id;
  if (!groupOptions.value.includes(group.value)) group.value = '';
  filterChanged();
}
const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  return entries.value.filter(entry => matchesType(entry) && (!group.value || entry.groups.includes(group.value)) &&
    (!needle || `${entry.name} ${entry.id} ${entry.description || ''}`.toLocaleLowerCase().includes(needle)));
});
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)));
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const selected = computed(() => selectedId.value ? entries.value.find(entry => entry.id === selectedId.value) : visible.value[0]);
const related = computed(() => {
  if (isArts || !selected.value?.groups.length) return [];
  return entries.value.filter(entry => entry.id !== selected.value.id && entry.groups.some(tag => selected.value.groups.includes(tag)));
});
watch(() => selected.value?.id, () => { showAllWeapons.value = false; });
const typeName = entry => entry.type === 'sorcery' ? '魔法' : entry.type === 'incantation' ? '祷告' : '分类待核对';
function imageFor(entry) {
  if (!entry?.image || failedImages.value.has(entry.image)) return '';
  try {
    const url = new URL(entry.image, location.href);
    return url.origin === location.origin && ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}
function imageFailed(entry) { failedImages.value = new Set([...failedImages.value, entry.image]); }
function normalizeLocation() {
  if (!typeOptions.some(option => option.id === type.value)) type.value = 'all';
  if (!groupOptions.value.includes(group.value)) group.value = '';
  const target = entries.value.find(entry => entry.id === selectedId.value);
  if (target && !filtered.value.includes(target)) { query.value = ''; type.value = 'all'; group.value = ''; }
  const index = filtered.value.findIndex(entry => entry.id === selectedId.value);
  page.value = index >= 0 ? Math.floor(index / pageSize) + 1 : Math.min(pageCount.value, Math.max(1, page.value));
}
function readUrl() {
  const params = new URL(location.href).searchParams;
  query.value = params.get(keys.query) || '';
  type.value = params.get(isArts ? 'artType' : 'spellType') || 'all';
  group.value = params.get(groupKey) || '';
  selectedId.value = params.get(keys.id) || '';
  page.value = Math.max(1, Number.parseInt(params.get(keys.page), 10) || 1);
  if (loaded.value) normalizeLocation();
}
function writeUrl(push = false) {
  const url = new URL(location.href);
  const values = { [keys.id]: selectedId.value, [keys.query]: query.value, [keys.page]: page.value > 1 ? String(page.value) : '' };
  values[isArts ? 'artType' : 'spellType'] = type.value === 'all' ? '' : type.value;
  values[groupKey] = group.value;
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  }
  url.hash = props.kind;
  if (push) history.replaceState({ ...history.state, scrollY: window.scrollY }, '', location.href);
  const state = { ...history.state, view: props.kind, cardNavigation: null, scrollY: window.scrollY };
  if (push) history.pushState(state, '', url); else history.replaceState(state, '', url);
}
function filterChanged() { page.value = 1; selectedId.value = ''; writeUrl(); }
async function focusDetail() {
  await nextTick();
  if (detailRoot.value) detailRoot.value.scrollTop = 0;
  heading.value?.focus({ preventScroll: true });
  if (window.matchMedia('(max-width:850px)').matches) heading.value?.scrollIntoView({ block: 'start', behavior: 'instant' });
}
function selectEntry(entry) {
  selectedId.value = entry.id;
  normalizeLocation();
  writeUrl(true);
  focusDetail();
}
function turnPage(step) {
  page.value = Math.max(1, Math.min(pageCount.value, page.value + step));
  selectedId.value = filtered.value[(page.value - 1) * pageSize]?.id || '';
  writeUrl(true);
}
function loadCatalog() {
  if (loaded.value) return Promise.resolve();
  if (loading.value) return request;
  request = fetchCatalog();
  return request;
}
async function fetchCatalog() {
  controller?.abort();
  controller = new AbortController();
  loading.value = true; error.value = '';
  try {
    const version = props.catalogVersions?.[file];
    if (!/^[a-f0-9]{12}$/i.test(version || '')) throw new Error('资料版本尚未就绪，请刷新页面后重试。');
    const response = await fetch(`/${file}?v=${version}`, { signal: controller.signal });
    if (!response.ok) throw new Error('暂时无法读取资料，请重试。');
    const data = await response.json();
    if (!Array.isArray(data?.entries)) throw new Error('资料格式暂不支持，请刷新页面后重试。');
    entries.value = data.entries.map(entry => ({ ...entry, id: String(entry.id), groups: abilityGroupNames(props.kind, entry), groupNote: abilityGroupNote(props.kind, entry) }));
    loaded.value = true;
    normalizeLocation();
    if (props.active && selectedId.value) focusDetail();
  } catch (cause) {
    if (cause.name !== 'AbortError') error.value = cause.message || '资料载入失败，请重试。';
  } finally { loading.value = false; }
}
async function restoreNavigation(snapshot) {
  await loadCatalog();
  if (snapshot.returnFocus === 'damage') {
    query.value = snapshot.query; type.value = snapshot.type || 'all'; group.value = snapshot.group || ''; selectedId.value = String(snapshot.id);
    page.value = Math.min(pageCount.value, Math.max(1, snapshot.page));
    await nextTick();
    requestAnimationFrame(() => {
      detailRoot.value?.querySelector('[data-damage-entry]')?.focus({ preventScroll: true });
      if (listRoot.value) listRoot.value.scrollTop = snapshot.listScroll;
      if (detailRoot.value) detailRoot.value.scrollTop = snapshot.detailScroll;
      window.scrollTo({ top: snapshot.scrollY, behavior: 'instant' });
    });
    return;
  }
  query.value = ''; type.value = 'all'; group.value = ''; selectedId.value = String(snapshot.id);
  normalizeLocation();
  const url = new URL(location.href);
  url.searchParams.set(keys.id, selectedId.value);
  url.searchParams.delete(keys.query); url.searchParams.delete(keys.page);
  url.searchParams.delete(groupKey); url.searchParams.delete(isArts ? 'artType' : 'spellType');
  history.replaceState(history.state, '', url);
  await focusDetail();
}
function damageUrl() {
  const url = new URL(location.href);
  for (const key of ['damageWeapon', 'damageVariant', 'damageAction']) url.searchParams.delete(key);
  url.searchParams.set('damageArt', selected.value.id); url.hash = 'damage';
  return url.pathname + url.search + url.hash;
}
function openDamage(event) {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.dispatchEvent(new CustomEvent('nightreign:navigate', { detail: {
    view: 'damage', source: { kind: 'art', id: selected.value.id, query: query.value, type: type.value, group: group.value, page: page.value, listScroll: listRoot.value?.scrollTop || 0, detailScroll: detailRoot.value?.scrollTop || 0, scrollY: window.scrollY, returnFocus: 'damage' },
    cardNavigation: { kind: 'damage', artId: selected.value.id },
  } }));
}
function locationChanged() {
  if (location.hash === `#${props.kind}`) readUrl();
}
onMounted(() => { window.addEventListener('popstate', locationChanged); window.addEventListener('hashchange', locationChanged); });
onBeforeUnmount(() => { controller?.abort(); window.removeEventListener('popstate', locationChanged); window.removeEventListener('hashchange', locationChanged); });
watch(() => props.active, active => { if (active) { readUrl(); loadCatalog(); } }, { immediate: true });
defineExpose({ restoreNavigation });
</script>

<template>
  <section :id="`view-${kind}`" class="view reference-page ability-page" :class="{ active }">
    <div class="page-intro reference-heading"><h1>{{ title }}</h1></div>
    <p v-if="loading" class="ability-notice" role="status">正在载入{{ title }}资料…</p>
    <div v-else-if="error" class="ability-notice" role="alert"><p>{{ error }}</p><button type="button" @click="loadCatalog">重新载入</button></div>
    <template v-else-if="loaded">
      <div class="ability-toolbar">
        <label class="ability-search">搜索{{ title }}<input v-model="query" type="search" placeholder="名称、说明或 ID" @input="filterChanged"></label>
        <div class="ability-types" role="group" :aria-label="isArts ? '武器关联' : '法术类型'">
          <button v-for="option in typeOptions" :key="option.id" type="button" :aria-pressed="type === option.id" @click="chooseType(option.id)">{{ option.name }}</button>
        </div>
        <label class="ability-group">加成分类<select v-model="group" @change="filterChanged">
          <option value="">全部分类</option><option v-for="name in groupOptions" :key="name" :value="name">{{ name }}</option>
        </select></label>
        <span class="ability-count" role="status">{{ filtered.length }} 项</span>
      </div>
      <div class="ability-layout">
        <div class="ability-list-panel">
          <ul v-if="visible.length" ref="listRoot" class="ability-list" :aria-label="title + '列表'">
            <li v-for="entry in visible" :key="entry.id"><button type="button" :aria-pressed="selected?.id === entry.id" @click="selectEntry(entry)"><span class="ability-thumbnail"><img v-if="imageFor(entry)" :src="imageFor(entry)" alt="" loading="lazy" @error="imageFailed(entry)"><span v-else aria-hidden="true">◇</span></span><span class="ability-row-copy"><strong>{{ entry.name }}</strong><small>{{ entry.groups.join(' · ') || (isArts ? '#' + entry.id : typeName(entry)) }}</small></span></button></li>
          </ul>
          <p v-else class="ability-notice">没有找到匹配的{{ title }}，请更换搜索条件。</p>
          <nav v-if="pageCount > 1" class="ability-pagination" :aria-label="title + '列表分页'"><button type="button" :disabled="page === 1" @click="turnPage(-1)">上一页</button><span>{{ page }} / {{ pageCount }}</span><button type="button" :disabled="page === pageCount" @click="turnPage(1)">下一页</button></nav>
        </div>
        <article ref="detailRoot" class="ability-detail" :aria-label="title + '详情'">
          <template v-if="selected">
            <header class="ability-detail-heading"><span class="ability-portrait"><img v-if="imageFor(selected)" :src="imageFor(selected)" :alt="selected.name" @error="imageFailed(selected)"><span v-else aria-label="暂无图片">◇</span></span><div><p v-if="!isArts" class="ability-meta">{{ typeName(selected) }}</p><h2 ref="heading" tabindex="-1">{{ selected.name }}</h2><div class="ability-heading-meta"><p class="ability-meta">#{{ selected.id }}</p><p v-if="!isArts" class="ability-fp">
                <template v-if="selected.fpPerRepeat != null">消耗专注值：起手 {{ selected.fp }} · 每次续放 {{ selected.fpPerRepeat }}</template>
                <template v-else-if="selected.fpCharged != null">消耗专注值：普通 {{ selected.fp }} · 蓄力 {{ selected.fpCharged }}</template>
                <template v-else>消耗专注值：{{ selected.fp ?? '待核对' }}</template>
              </p></div></div></header>
            <div v-if="selected.groups.length" class="ability-tags"><span v-for="name in selected.groups" :key="name">{{ name }}</span></div>
            <p v-if="selected.groupNote" class="ability-group-note">{{ selected.groupNote }}</p>
            <div class="ability-description">{{ selected.description || '说明暂未收录。' }}</div>
            <template v-if="isArts">
              <a class="ability-damage-link" data-damage-entry :href="damageUrl()" @click="openDamage">计算此战技伤害</a>
              <section v-if="selected.fixedWeapons?.length" class="ability-weapons"><h3>固定战技武器<span> · {{ selected.fixedWeapons?.length || 0 }}</span></h3><ul><li v-for="weapon in selected.fixedWeapons" :key="weapon.id">{{ weapon.name }} <small>#{{ weapon.id }}</small></li></ul></section>
              <section v-if="selected.possibleWeapons?.length" class="ability-weapons">
                <h3>可能出现的武器 · {{ selected.possibleWeapons.length }}</h3>
                <ul><li v-for="weapon in (showAllWeapons ? selected.possibleWeapons : selected.possibleWeapons.slice(0, 6))" :key="weapon.id">{{ weapon.name }} <small>#{{ weapon.id }}</small></li></ul>
                <button v-if="selected.possibleWeapons.length > 6" type="button" class="ability-damage-link" :aria-expanded="showAllWeapons" @click="showAllWeapons = !showAllWeapons">{{ showAllWeapons ? '收起' : '展开全部' }}</button>
              </section>
            </template>
            <section v-else-if="related.length" class="ability-weapons">
              <h3>同类法术</h3>
              <div class="ability-related"><button v-for="entry in related" :key="entry.id" type="button" @click="selectEntry(entry)">{{ entry.name }}</button></div>
            </section>
          </template>
          <div v-else-if="selectedId" class="ability-notice" role="status">未找到链接中的{{ title }}，请从列表重新选择。</div>
          <p v-else class="ability-notice">选择{{ title }}后查看详情。</p>
        </article>
      </div>
    </template>
  </section>
</template>

<style scoped>
.ability-damage-link{display:inline-flex;align-items:center;min-height:36px;margin:12px 0 0;padding:6px 10px;border:1px solid #596b7e;border-radius:3px;background:#1b2d40;color:#e7d5ac;font-size:13px}.ability-damage-link:focus-visible{outline:2px solid #d5b477;outline-offset:2px}

.ability-page{min-width:0;min-height:0;container:ability-page / inline-size}.ability-page .reference-heading{display:flex;align-items:baseline;border:0;background:none;margin:0 0 12px;padding:0}.ability-page .reference-heading::before{display:none}.ability-page .reference-heading h1{margin:0;color:#ecd7a7;font:600 28px/1.35 'Noto Serif SC',serif}.ability-toolbar{
  display:grid;
  grid-template-columns:minmax(0,1fr) max-content 10rem 3.5rem;
  grid-template-areas:"search types group total";
  align-items:end;
  gap:12px;
  flex-shrink:0;padding:10px 12px;margin-bottom:12px;border:1px solid #3e566e;border-radius:5px;background:#132131}.ability-search{grid-area:search;display:grid;gap:4px;min-width:0;color:#c7d3da;font-size:13px}.ability-search input{box-sizing:border-box;width:100%;height:40px;padding:7px 10px;border:1px solid #4c657b;border-radius:4px;background:#101d2a;color:#e0e7e9;font:14px 'Noto Sans SC',sans-serif}.ability-types{grid-area:types;display:flex;gap:5px}.ability-types button,.ability-pagination button,.ability-notice button{min-height:38px;padding:6px 12px;border:1px solid #536c82;border-radius:4px;background:#1b2d40;color:#e7d5ac;font:14px 'Noto Sans SC',sans-serif;cursor:pointer}.ability-types button[aria-pressed=true]{border-color:#b89e65;background:#2b3b45}.ability-count{grid-area:total;white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums;margin:0 0 7px;color:#b6c7d2;font-size:13px}.ability-layout{display:grid;grid-template-columns:minmax(280px,1fr) minmax(0,1fr);gap:14px;min-width:0;min-height:0}.ability-list-panel,.ability-detail{min-width:0;min-height:0;border:1px solid #3e566e;border-radius:5px;background:#132131}.ability-list-panel{container:ability-catalog-list / inline-size;display:flex;flex-direction:column;overflow:hidden}.ability-list{display:grid;grid-template-columns:minmax(0,1fr);align-content:start;gap:6px;list-style:none;margin:0;padding:5px;min-height:0;overflow:auto;overscroll-behavior:contain}.ability-list li{display:flex;min-width:0}.ability-list button{height:100%;display:flex;align-items:center;gap:10px;width:100%;min-width:0;min-height:64px;padding:8px;border:0;border-bottom:1px solid #33495a;border-radius:3px;background:transparent;color:#dce6e9;text-align:left;cursor:pointer}.ability-list button[aria-pressed=true]{background:#2b3b45;box-shadow:inset 3px 0 #d5bd7d;color:#efdcaa}.ability-list button:hover{background:#203346}.ability-thumbnail{display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;background:#101d2a;color:#a5b8c8}.ability-thumbnail img{width:100%;height:100%;object-fit:contain}.ability-row-copy{display:grid;gap:4px;min-width:0}.ability-row-copy strong{font-size:14px;font-weight:500;line-height:1.5;overflow-wrap:anywhere}.ability-row-copy small{font-size:11px;color:#a5b8c8;white-space:normal;overflow-wrap:anywhere}.ability-pagination{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:6px;padding:8px;border-top:1px solid #3e566e;font-size:13px}.ability-pagination button{padding:5px 8px;font-size:13px}.ability-pagination button:disabled{opacity:.45;cursor:default}.ability-detail{padding:18px;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.ability-detail-heading{display:flex;align-items:flex-start;gap:14px;margin-bottom:14px;min-width:0}.ability-detail-heading>div{min-width:0}.ability-portrait{display:grid;place-items:center;flex:0 0 80px;width:80px;height:80px;background:#101d2a;color:#a5b8c8}.ability-portrait img{width:100%;height:100%;object-fit:contain}.ability-detail h2{margin:0;color:#ecd7a7;font:600 24px/1.5 'Noto Serif SC',serif;overflow-wrap:anywhere;scroll-margin-top:16px}.ability-meta{margin:3px 0;color:#a5b8c8;font-size:12px}.ability-description{white-space:pre-line;overflow-wrap:anywhere;line-height:1.85;font-size:14px;color:#d4dde3}.ability-heading-meta{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 14px;margin-top:3px}.ability-heading-meta p{margin:0}.ability-fp{color:#d4c29a;font-size:14px}.ability-weapons{margin-top:18px;padding-top:12px;border-top:1px solid #3e566e;font-size:14px;overflow-wrap:anywhere}.ability-weapons h3,.ability-weapons summary{margin:0;color:#e7d5ac;font-size:14px;font-weight:500}.ability-weapons summary{cursor:pointer}.ability-weapons h3 span{font-size:12px;color:#a5b8c8}.ability-weapons ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:6px 14px;list-style:none;padding:0;margin:12px 0 0}.ability-weapons small{color:#a5b8c8;font-size:10px}.ability-weapons p,.ability-notice{font-size:14px;color:#afc1ce}.ability-notice{padding:12px}button:focus-visible,input:focus-visible,h2:focus-visible{outline:1px solid #91a5ba;outline-offset:2px}
@container ability-catalog-list (min-width:400px){.ability-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:851px){.ability-page.active{display:flex;flex:1;flex-direction:column}.ability-page .page-intro{flex:0 0 auto}.ability-layout{flex:1}.ability-list{flex:1}.ability-detail{align-self:start;height:auto;max-height:100%;box-sizing:border-box}}
@media(max-width:850px){.ability-page .reference-heading h1{font-size:24px}.ability-layout{grid-template-columns:minmax(0,1fr)}.ability-list{max-height:280px}.ability-detail{overflow:visible;padding:14px}.ability-portrait{flex-basis:64px;width:64px;height:64px}.ability-detail h2{font-size:22px}.ability-count{margin-bottom:8px}.ability-types{flex-wrap:wrap}}
.ability-group{grid-area:group;min-width:0;display:grid;gap:4px;font-size:13px;color:#c7d3da}
.ability-group select,.ability-related button{border:1px solid #4c657b;background:#152738;color:#e0e7e9;border-radius:4px;font:inherit}
.ability-group select{width:100%;min-width:0;height:40px;padding:0 10px}
.ability-tags,.ability-related{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}
.ability-tags span{color:#e7d5ac;border:1px solid #625b49;padding:2px 8px;font-size:13px}
.ability-related button{cursor:pointer;padding:6px 9px}
.ability-group-note{font-size:13px;line-height:1.6;color:#d4c29a}
@container ability-page (max-width: 660px){
  .ability-toolbar{
    grid-template-columns:minmax(0,1fr) 6rem 3.5rem;
    grid-template-areas:"search group group" "types types total";
    gap:8px;
  }
  .ability-types{flex-wrap:wrap}
}
@container ability-page (max-width: 330px){
  .ability-toolbar{
    grid-template-columns:minmax(0,1fr) 3.5rem;
    grid-template-areas:"search search" "types types" "group total";
  }
}
</style>
