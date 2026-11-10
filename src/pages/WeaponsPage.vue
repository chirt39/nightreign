<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({ active: Boolean, catalogVersions: Object });
const catalog = ref(null), images = ref({}), loading = ref(false), error = ref('');
const skillImages = ref({});
const query = ref(''), category = ref('all'), weaponId = ref(''), variantId = ref(''), page = ref(1);
const failedImages = ref(new Set());
const detailHeading = ref(null);
const pageSize = 24;
let controller = null;
const attackLabels = { physical: '物理', magic: '魔力', fire: '火', lightning: '雷', holy: '圣' };
const abilityLabels = { strength: '力气', dexterity: '灵巧', intelligence: '智力', faith: '信仰', arcane: '感应' };
const displayValue = value => value === null || value === undefined || value === '' ? '待核对' : String(value);
const displayScalingGrade = value => value === '-' ? '—' : (typeof value === 'string' && /^[SABCDE]$/.test(value) ? value : '待核对');
const weapons = computed(() => catalog.value?.weapons || []);
const categories = computed(() => catalog.value?.categories || []);
const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  return weapons.value.filter(weapon => (category.value === 'all' || weapon.categoryId === category.value) && (!needle || [weapon.name, weapon.id, ...(weapon.aliases || []), ...(weapon.variants || []).flatMap(v => [v.name, v.label, v.id])].join(' ').toLocaleLowerCase().includes(needle)));
});
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)));
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const selected = computed(() => weaponId.value ? weapons.value.find(weapon => weapon.id === weaponId.value) : filtered.value[0]);
const unknownWeapon = computed(() => Boolean(catalog.value && weaponId.value && !selected.value));
const variant = computed(() => {
  const weapon = selected.value;
  if (!weapon) return null;
  return weapon.variants?.find(item => item.id === variantId.value) || weapon.variants?.find(item => item.id === weapon.representativeVariantId) || weapon.variants?.[0] || null;
});
const unknownVariant = computed(() => Boolean(variantId.value && selected.value && !selected.value.variants?.some(item => item.id === variantId.value)));
function imageFor(weapon, currentVariant = null) {
  for (const icon of [currentVariant?.iconId, weapon?.iconId]) {
    const entry = images.value[String(icon)];
    if (entry?.status === 'verified' && typeof entry.src === 'string' && /^\/weapon-images\/[A-Za-z0-9_-]+\.(?:webp|png|jpe?g)$/i.test(entry.src) && !failedImages.value.has(entry.src)) return entry.src;
  }
  return '';
}
function imageFailed(event) { failedImages.value = new Set([...failedImages.value, event.target.getAttribute('src')]); }
function attackIcon(key) {
  const src = `/enemy-attribute-icons/damage-${key}.png`;
  return Object.hasOwn(attackLabels, key) && !failedImages.value.has(src) ? src : '';
}
function skillImageFor(index, name) {
  const skill = variant.value?.skill;
  if (!Array.isArray(skill?.itemIds) || skill.itemIds.length !== skill.names?.length) return '';
  const id = skill.itemIds[index];
  if (typeof id !== 'string') return '';
  const definition = catalog.value?.skillDefinitions?.[id];
  if (!definition || definition.id !== id || definition.name !== name || definition.iconId == null) return '';
  const entry = skillImages.value[String(definition.iconId)];
  return entry?.status === 'verified' && typeof entry.src === 'string' && /^\/skill-images\/[A-Za-z0-9_-]+\.(?:webp|png|jpe?g)$/i.test(entry.src) && !failedImages.value.has(entry.src) ? entry.src : '';
}
function readUrl() {
  const params = new URL(location.href).searchParams;
  query.value = params.get('weaponQ') || '';
  category.value = params.get('weaponCategory') || 'all';
  weaponId.value = params.get('weaponId') || '';
  variantId.value = params.get('weaponVariant') || '';
  page.value = 1;
  if (catalog.value) normalizeLocation();
}
function normalizeLocation() {
  if (!categories.value.some(item => item.id === category.value)) category.value = 'all';
  const index = filtered.value.findIndex(item => item.id === weaponId.value);
  page.value = index >= 0 ? Math.floor(index / pageSize) + 1 : 1;
}
function writeUrl(push = false) {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries({ weaponId: weaponId.value, weaponVariant: variantId.value, weaponQ: query.value, weaponCategory: category.value === 'all' ? '' : category.value })) {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  }
  const state = { ...history.state };
  if (push) history.pushState(state, '', url); else history.replaceState(state, '', url);
}
function filterChanged(push = false) { page.value = 1; weaponId.value = ''; variantId.value = ''; writeUrl(push); }
function clearFilters() { query.value = ''; category.value = 'all'; filterChanged(true); }
async function selectWeapon(weapon) {
  weaponId.value = weapon.id; variantId.value = ''; writeUrl(true);
  if (window.matchMedia('(max-width:850px)').matches) {
    await nextTick(); detailHeading.value?.focus({ preventScroll: true });
    detailHeading.value?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
}
function selectVariant() { weaponId.value = selected.value.id; writeUrl(true); }
function turnPage(step) {
  page.value = Math.min(pageCount.value, Math.max(1, page.value + step));
  weaponId.value = filtered.value[(page.value - 1) * pageSize]?.id || ''; variantId.value = ''; writeUrl(true);
}
async function loadCatalog() {
  if (loading.value || catalog.value) return;
  controller?.abort(); loading.value = true; error.value = ''; controller = new AbortController();
  const signal = controller.signal;
  const imageVersion = props.catalogVersions?.['weapon-image-manifest.json'];
  if (imageVersion) fetch(`/weapon-image-manifest.json?v=${imageVersion}`, { signal }).then(response => response.ok ? response.json() : null).then(data => { if (data?.schemaVersion === 1 && data.images && !Array.isArray(data.images)) images.value = data.images; }).catch(() => {});
  const skillImageVersion = props.catalogVersions?.['skill-image-manifest.json'];
  if (skillImageVersion) fetch(`/skill-image-manifest.json?v=${skillImageVersion}`, { signal }).then(response => response.ok ? response.json() : null).then(data => { if (data?.schemaVersion === 1 && data.images && typeof data.images === 'object' && !Array.isArray(data.images)) skillImages.value = data.images; }).catch(() => {});
  try {
    const version = props.catalogVersions?.['weapon-catalog.json'];
    if (!/^[a-f0-9]{12}$/i.test(version || '')) throw new Error('武器资料版本尚未就绪，请刷新页面后重试。');
    const response = await fetch(`/weapon-catalog.json?v=${version}`, { signal });
    if (!response.ok) throw new Error('暂时无法读取武器资料，请重试。');
    const data = await response.json();
    if (data?.schemaVersion !== 1 || !Array.isArray(data.weapons) || !Array.isArray(data.categories)) throw new Error('武器资料格式暂不支持，请刷新页面后重试。');
    catalog.value = data; normalizeLocation();
  } catch (cause) { if (cause.name !== 'AbortError') error.value = cause.message || '武器资料载入失败，请重试。'; }
  finally { loading.value = false; }
}
function locationChanged() { readUrl(); }
onMounted(() => { readUrl(); window.addEventListener('popstate', locationChanged); window.addEventListener('hashchange', locationChanged); });
onBeforeUnmount(() => { controller?.abort(); window.removeEventListener('popstate', locationChanged); window.removeEventListener('hashchange', locationChanged); });
watch(() => props.active, active => { if (active) { readUrl(); loadCatalog(); } }, { immediate: true });
</script>

<template>
  <section id="view-weapons" class="view" :class="{ active }">
    <div class="page-intro"><p class="eyebrow">ARMORY / WEAPON ARCHIVE</p><h1>武器图鉴</h1><p>查找武器与参数变体，查看基础攻击、能力补正和战技。</p></div>
    <p v-if="loading" class="weapon-notice" role="status">正在载入武器资料…</p>
    <div v-else-if="error" class="weapon-notice" role="alert"><p>{{ error }}</p><button class="button" type="button" @click="loadCatalog">重新载入</button></div>
    <template v-else-if="catalog">
      <div class="weapon-toolbar">
        <label class="weapon-search">搜索武器<input v-model="query" type="search" placeholder="名称、别名或编号" @input="filterChanged()"></label>
        <label>武器分类<select v-model="category" @change="filterChanged(true)"><option value="all">全部分类</option><option v-for="item in categories" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
        <button class="button ghost" type="button" @click="clearFilters">清空筛选</button>
        <span class="weapon-count" role="status">{{ filtered.length }} 件武器</span>
      </div>
      <div class="weapon-layout">
        <div class="weapon-list-panel">
          <ul v-if="visible.length" class="weapon-list" aria-label="武器列表">
            <li v-for="weapon in visible" :key="weapon.id"><button type="button" class="weapon-row" :class="{ selected: selected?.id === weapon.id }" :aria-pressed="selected?.id === weapon.id" @click="selectWeapon(weapon)">
              <span class="weapon-thumbnail"><img v-if="imageFor(weapon)" :src="imageFor(weapon)" alt="" loading="lazy" @error="imageFailed"><span v-else aria-hidden="true">⚔</span></span>
              <span class="weapon-row-copy"><strong>{{ weapon.name }}</strong><small>{{ weapon.categoryLabel || '分类待核对' }}</small></span><span v-if="weapon.dlc === true" class="weapon-dlc">DLC</span>
            </button></li>
          </ul>
          <div v-else class="weapon-notice"><strong>没有找到匹配武器</strong><p>试试其他名称或分类，或清空筛选。</p></div>
          <nav v-if="pageCount > 1" class="weapon-pagination" aria-label="武器列表分页"><button type="button" :disabled="page === 1" @click="turnPage(-1)">上一页</button><span>{{ page }} / {{ pageCount }}</span><button type="button" :disabled="page === pageCount" @click="turnPage(1)">下一页</button></nav>
        </div>
        <article class="weapon-detail" aria-label="武器详情">
          <div v-if="unknownWeapon" class="weapon-notice" role="status"><h2>未找到链接中的武器</h2><p>该编号可能已变更，请从列表重新选择。</p></div>
          <template v-else-if="selected">
            <header class="weapon-detail-heading"><span class="weapon-portrait"><img v-if="imageFor(selected, variant)" :src="imageFor(selected, variant)" :alt="selected.name" @error="imageFailed"><span v-else aria-label="暂无核验图片">⚔</span></span><div><p class="weapon-category">{{ selected.categoryLabel || '分类待核对' }} <span v-if="selected.dlc === true" class="weapon-dlc">DLC</span></p><h2 ref="detailHeading" tabindex="-1">{{ selected.name }}</h2><p class="weapon-id">资料编号 {{ selected.id }}</p></div></header>
            <label v-if="selected.variants?.length" class="weapon-variant">参数变体<select :value="variant?.id" @change="variantId = $event.target.value; selectVariant()"><option v-for="item in selected.variants" :key="item.id" :value="item.id">{{ item.label || item.name || '待核对变体' }}</option></select></label>
            <p v-if="unknownVariant" class="weapon-note" role="status">链接中的参数变体不存在，当前展示默认变体。请重新选择。</p>
            <template v-if="variant">
              <section class="weapon-section"><h3>基础攻击</h3><dl class="weapon-stat-grid"><div v-for="(label, key) in attackLabels" :key="key"><dt class="weapon-attack-label"><img v-if="attackIcon(key)" :src="attackIcon(key)" class="weapon-attack-icon" width="18" height="18" alt="" @error="imageFailed"><span v-else class="weapon-attack-icon weapon-icon-placeholder" aria-hidden="true"></span><span>{{ label }}</span></dt><dd>{{ displayValue(variant.attack?.[key]) }}</dd></div></dl><p v-if="variant.attackTypes?.length" class="weapon-note">攻击类型：{{ variant.attackTypes.join('、') }}</p></section>
              <section class="weapon-section"><h3>能力补正</h3><dl class="weapon-stat-grid"><div v-for="(label, key) in abilityLabels" :key="key"><dt>{{ label }}</dt><dd>{{ displayScalingGrade(variant.scalingGrades?.[key]) }}</dd></div></dl></section>
              <section class="weapon-section"><h3>{{ variant.skill?.kind === 'fixed' ? '固定战技' : variant.skill?.kind === 'pool' ? '战技候选池' : '战技' }}</h3><ul v-if="variant.skill?.names?.length" class="weapon-skill-list"><li v-for="(name, index) in variant.skill.names" :key="`${index}-${name}`"><span class="weapon-skill-icon"><img v-if="skillImageFor(index, name)" :src="skillImageFor(index, name)" width="30" height="30" alt="" loading="lazy" @error="imageFailed"><span v-else class="weapon-icon-placeholder" aria-hidden="true"></span></span><span class="weapon-skill-name">{{ name }}</span></li></ul><p v-else>待核对</p><p v-if="variant.skill?.kind === 'pool'" class="weapon-note">以下为可能出现的战技，不代表这件武器固定拥有全部战技。</p><p v-if="variant.skill?.note" class="weapon-note">{{ variant.skill.note }}</p></section>
            </template>
            <p v-else class="weapon-note">该武器的参数变体待核对。</p>
          </template>
          <div v-else class="weapon-notice">选择武器后，在这里查看属性与战技。</div>
        </article>
      </div>
    </template>
  </section>
</template>
