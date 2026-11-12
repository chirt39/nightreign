<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
const props = defineProps({ active: Boolean, catalogVersions: Object, kind: { type: String, required: true } });
const isArts = props.kind === 'arts';
const title = isArts ? '战技' : '魔法与祷告';
const file = isArts ? 'arts-catalog.json' : 'spells-catalog.json';
const keys = isArts ? { id: 'artId', query: 'artQ', page: 'artPage' } : { id: 'spellId', query: 'spellQ', page: 'spellPage' };
const entries = shallowRef([]);
const loaded = ref(false), loading = ref(false), error = ref('');
const query = ref(''), type = ref('all'), selectedId = ref(''), page = ref(1);
const failedImages = ref(new Set());
const heading = ref(null), detailRoot = ref(null);
const pageSize = 24;
let controller = null, request = null;
const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  return entries.value.filter(entry => (isArts || type.value === 'all' || entry.type === type.value) &&
    (!needle || `${entry.name} ${entry.id} ${entry.description || ''}`.toLocaleLowerCase().includes(needle)));
});
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)));
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const selected = computed(() => selectedId.value ? entries.value.find(entry => entry.id === selectedId.value) : visible.value[0]);
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
  if (!['all', 'sorcery', 'incantation'].includes(type.value)) type.value = 'all';
  const target = entries.value.find(entry => entry.id === selectedId.value);
  if (target && !filtered.value.includes(target)) { query.value = ''; type.value = 'all'; }
  const index = filtered.value.findIndex(entry => entry.id === selectedId.value);
  page.value = index >= 0 ? Math.floor(index / pageSize) + 1 : Math.min(pageCount.value, Math.max(1, page.value));
}
function readUrl() {
  const params = new URL(location.href).searchParams;
  query.value = params.get(keys.query) || '';
  type.value = isArts ? 'all' : params.get('spellType') || 'all';
  selectedId.value = params.get(keys.id) || '';
  page.value = Math.max(1, Number.parseInt(params.get(keys.page), 10) || 1);
  if (loaded.value) normalizeLocation();
}
function writeUrl(push = false) {
  const url = new URL(location.href);
  const values = { [keys.id]: selectedId.value, [keys.query]: query.value, [keys.page]: page.value > 1 ? String(page.value) : '' };
  if (!isArts) values.spellType = type.value === 'all' ? '' : type.value;
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
function selectEntry(entry) { selectedId.value = entry.id; writeUrl(true); focusDetail(); }
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
    entries.value = data.entries.map(entry => ({ ...entry, id: String(entry.id) }));
    loaded.value = true;
    normalizeLocation();
    if (props.active && selectedId.value) focusDetail();
  } catch (cause) {
    if (cause.name !== 'AbortError') error.value = cause.message || '资料载入失败，请重试。';
  } finally { loading.value = false; }
}
async function restoreNavigation(snapshot) {
  await loadCatalog();
  query.value = ''; type.value = 'all'; selectedId.value = String(snapshot.id);
  normalizeLocation();
  const url = new URL(location.href);
  url.searchParams.set(keys.id, selectedId.value);
  url.searchParams.delete(keys.query); url.searchParams.delete(keys.page);
  history.replaceState(history.state, '', url);
  await focusDetail();
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
        <div v-if="!isArts" class="ability-types" role="group" aria-label="法术分类"><button v-for="category in [{id:'all',name:'全部'},{id:'sorcery',name:'魔法'},{id:'incantation',name:'祷告'}]" :key="category.id" type="button" :aria-pressed="type === category.id" @click="type = category.id; filterChanged()">{{ category.name }}</button></div>
        <span class="ability-count" role="status">{{ filtered.length }} 项</span>
      </div>
      <div class="ability-layout">
        <div class="ability-list-panel">
          <ul v-if="visible.length" class="ability-list" :aria-label="title + '列表'">
            <li v-for="entry in visible" :key="entry.id"><button type="button" :aria-pressed="selected?.id === entry.id" @click="selectEntry(entry)"><span class="ability-thumbnail"><img v-if="imageFor(entry)" :src="imageFor(entry)" alt="" loading="lazy" @error="imageFailed(entry)"><span v-else aria-hidden="true">◇</span></span><span class="ability-row-copy"><strong>{{ entry.name }}</strong><small>{{ isArts ? '#' + entry.id : typeName(entry) }}</small></span></button></li>
          </ul>
          <p v-else class="ability-notice">没有找到匹配的{{ title }}，请更换搜索条件。</p>
          <nav v-if="pageCount > 1" class="ability-pagination" :aria-label="title + '列表分页'"><button type="button" :disabled="page === 1" @click="turnPage(-1)">上一页</button><span>{{ page }} / {{ pageCount }}</span><button type="button" :disabled="page === pageCount" @click="turnPage(1)">下一页</button></nav>
        </div>
        <article ref="detailRoot" class="ability-detail" :aria-label="title + '详情'">
          <template v-if="selected">
            <header class="ability-detail-heading"><span class="ability-portrait"><img v-if="imageFor(selected)" :src="imageFor(selected)" :alt="selected.name" @error="imageFailed(selected)"><span v-else aria-label="暂无图片">◇</span></span><div><p v-if="!isArts" class="ability-meta">{{ typeName(selected) }}</p><h2 ref="heading" tabindex="-1">{{ selected.name }}</h2><p class="ability-meta">#{{ selected.id }}</p></div></header>
            <p v-if="!isArts" class="ability-fp">消耗专注值：{{ selected.fp == null ? '待核对' : selected.fp }}</p>
            <div class="ability-description">{{ selected.description || '说明暂未收录。' }}</div>
            <template v-if="isArts">
              <section class="ability-weapons"><h3>固定战技武器<span> · {{ selected.fixedWeapons?.length || 0 }}</span></h3><ul v-if="selected.fixedWeapons?.length"><li v-for="weapon in selected.fixedWeapons" :key="weapon.id">{{ weapon.name }} <small>#{{ weapon.id }}</small></li></ul><p v-else>暂未收录</p></section>
              <details class="ability-weapons"><summary>可能出现的武器 · {{ selected.possibleWeapons?.length || 0 }}</summary><ul v-if="selected.possibleWeapons?.length"><li v-for="weapon in selected.possibleWeapons" :key="weapon.id">{{ weapon.name }} <small>#{{ weapon.id }}</small></li></ul><p v-else>暂未收录</p></details>
            </template>
          </template>
          <div v-else-if="selectedId" class="ability-notice" role="status">未找到链接中的{{ title }}，请从列表重新选择。</div>
          <p v-else class="ability-notice">选择{{ title }}后查看详情。</p>
        </article>
      </div>
    </template>
  </section>
</template>

<style scoped>
.ability-page{min-width:0;min-height:0}.ability-page .reference-heading{display:flex;align-items:baseline;border:0;background:none;margin:0 0 12px;padding:0}.ability-page .reference-heading::before{display:none}.ability-page .reference-heading h1{margin:0;color:#ecd7a7;font:600 28px/1.35 'Noto Serif SC',serif}.ability-toolbar{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;flex-shrink:0;padding:10px 12px;margin-bottom:12px;border:1px solid #3e566e;border-radius:5px;background:#132131}.ability-search{display:grid;flex:1 1 260px;gap:4px;min-width:0;color:#c7d3da;font-size:13px}.ability-search input{box-sizing:border-box;width:100%;height:40px;padding:7px 10px;border:1px solid #4c657b;border-radius:4px;background:#101d2a;color:#e0e7e9;font:14px 'Noto Sans SC',sans-serif}.ability-types{display:flex;gap:5px}.ability-types button,.ability-pagination button,.ability-notice button{min-height:38px;padding:6px 12px;border:1px solid #536c82;border-radius:4px;background:#1b2d40;color:#e7d5ac;font:14px 'Noto Sans SC',sans-serif;cursor:pointer}.ability-types button[aria-pressed=true]{border-color:#b89e65;background:#2b3b45}.ability-count{margin:0 0 7px;color:#b6c7d2;font-size:13px}.ability-layout{display:grid;grid-template-columns:minmax(250px,280px) minmax(0,1fr);gap:14px;min-width:0;min-height:0}.ability-list-panel,.ability-detail{min-width:0;min-height:0;border:1px solid #3e566e;border-radius:5px;background:#132131}.ability-list-panel{display:flex;flex-direction:column;overflow:hidden}.ability-list{list-style:none;margin:0;padding:5px;min-height:0;overflow:auto;overscroll-behavior:contain}.ability-list li{min-width:0}.ability-list button{display:flex;align-items:center;gap:10px;width:100%;min-width:0;min-height:64px;padding:8px;border:0;border-bottom:1px solid #33495a;border-radius:3px;background:transparent;color:#dce6e9;text-align:left;cursor:pointer}.ability-list button[aria-pressed=true]{background:#2b3b45;box-shadow:inset 3px 0 #d5bd7d;color:#efdcaa}.ability-list button:hover{background:#203346}.ability-thumbnail{display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;background:#101d2a;color:#a5b8c8}.ability-thumbnail img{width:100%;height:100%;object-fit:contain}.ability-row-copy{display:grid;gap:4px;min-width:0}.ability-row-copy strong{font-size:14px;font-weight:500;line-height:1.5;overflow-wrap:anywhere}.ability-row-copy small{font-size:11px;color:#a5b8c8}.ability-pagination{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:6px;padding:8px;border-top:1px solid #3e566e;font-size:13px}.ability-pagination button{padding:5px 8px;font-size:13px}.ability-pagination button:disabled{opacity:.45;cursor:default}.ability-detail{padding:18px;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.ability-detail-heading{display:flex;align-items:flex-start;gap:14px;margin-bottom:14px;min-width:0}.ability-detail-heading>div{min-width:0}.ability-portrait{display:grid;place-items:center;flex:0 0 80px;width:80px;height:80px;background:#101d2a;color:#a5b8c8}.ability-portrait img{width:100%;height:100%;object-fit:contain}.ability-detail h2{margin:0;color:#ecd7a7;font:600 24px/1.5 'Noto Serif SC',serif;overflow-wrap:anywhere;scroll-margin-top:16px}.ability-meta{margin:3px 0;color:#a5b8c8;font-size:12px}.ability-description{white-space:pre-line;overflow-wrap:anywhere;line-height:1.85;font-size:14px;color:#d4dde3}.ability-fp{margin:0 0 12px;color:#d4c29a;font-size:14px}.ability-weapons{margin-top:18px;padding-top:12px;border-top:1px solid #3e566e;font-size:14px;overflow-wrap:anywhere}.ability-weapons h3,.ability-weapons summary{margin:0;color:#e7d5ac;font-size:14px;font-weight:500}.ability-weapons summary{cursor:pointer}.ability-weapons h3 span{font-size:12px;color:#a5b8c8}.ability-weapons ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:6px 14px;list-style:none;padding:0;margin:12px 0 0}.ability-weapons small{color:#a5b8c8;font-size:10px}.ability-weapons p,.ability-notice{font-size:14px;color:#afc1ce}.ability-notice{padding:12px}button:focus-visible,input:focus-visible,h2:focus-visible{outline:1px solid #91a5ba;outline-offset:2px}
@media(min-width:851px){.ability-page.active{display:flex;flex:1;flex-direction:column}.ability-page .page-intro{flex:0 0 auto}.ability-layout{flex:1}.ability-list{flex:1}.ability-detail{height:100%}}
@media(max-width:850px){.ability-page .reference-heading h1{font-size:24px}.ability-layout{grid-template-columns:minmax(0,1fr)}.ability-list{max-height:280px}.ability-detail{overflow:visible;min-height:220px;padding:14px}.ability-portrait{flex-basis:64px;width:64px;height:64px}.ability-detail h2{font-size:22px}.ability-count{margin-bottom:8px}.ability-types{flex-wrap:wrap}}
</style>
