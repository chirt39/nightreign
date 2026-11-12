<script setup>
import { computed, onMounted, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { getLegalityCatalog, checkRelic } from '../relic-legality.js';
import RelicLegalityPicker from './RelicLegalityPicker.vue';

const catalog = shallowRef(null);
const loading = ref(false);
const loadError = ref('');
const opened = ref(false);
const tab = ref('draft');
const mode = ref('normal');
const itemId = ref(null);
const positive = ref([]);
const negative = ref([]);
const draftResult = shallowRef(null);
const collection = shallowRef([]);
const checked = shallowRef(null);
const selectedStatus = ref('anomaly');
const labels = { anomaly: '发现异常', unknown: '待核对', clear: '未发现异常', partial: '未完成' };
const item = computed(() => catalog.value?.items.find(entry => String(entry.id) === String(itemId.value)));
const items = computed(() => (catalog.value?.items || []).filter(entry => entry.mode === mode.value));
const effects = computed(() => catalog.value?.effects || []);
const effectNames = computed(() => new Map(effects.value.map(entry => [String(entry.id), entry.name])));
const itemNames = computed(() => new Map((catalog.value?.items || []).map(entry => [String(entry.id), entry.name])));
const slotCount = computed(() => item.value ? Math.max(item.value.positive.length, item.value.negative.length) : 0);
const activeSlots = computed(() => Array.from({ length: slotCount.value }, (_, index) => index)
  .filter(index => item.value.positive[index] != null || item.value.negative[index] != null));
const selectedResults = computed(() => (checked.value || []).filter(entry => bucket(entry.result.status) === selectedStatus.value));

function bucket(status) { return status === 'partial' ? 'unknown' : status; }
function resultCount(status) { return (checked.value || []).filter(entry => bucket(entry.result.status) === status).length; }
function pool(role, index) {
  const id = item.value?.[role]?.[index];
  return id == null ? [] : catalog.value?.pools[id] || [];
}
function preset(role) {
  return Array.from({ length: slotCount.value }, (_, index) => {
    const ids = pool(role, index);
    return ids.length === 1 ? ids[0] : null;
  });
}
function resetDraft() {
  positive.value = preset('positive');
  negative.value = preset('negative');
  draftResult.value = null;
}
watch(itemId, resetDraft);
watch(mode, () => { itemId.value = null; draftResult.value = null; });
watch([positive, negative], () => { draftResult.value = null; }, { deep: true });
async function loadCatalog() {
  loading.value = true;
  loadError.value = '';
  try { catalog.value = await getLegalityCatalog(); }
  catch { loadError.value = '检查资料未能加载，请重试。'; }
  finally { loading.value = false; }
}
function checkDraft() {
  draftResult.value = checkRelic(catalog.value, {
    itemId: itemId.value,
    rawEffectSlots: Array.from({ length: slotCount.value }, (_, index) => ({
      positive: positive.value[index] ?? null, negative: negative.value[index] ?? null,
    })),
  }, { draft: true });
}
function refreshCollection() {
  collection.value = window.NightreignRelicCollection?.() || [];
  checked.value = null;
}
function checkCollection() {
  const current = window.NightreignRelicCollection?.() || [];
  collection.value = current;
  checked.value = current.map(relic => ({ relic, result: checkRelic(catalog.value, relic, { draft: false }) }));
  selectedStatus.value = ['anomaly', 'unknown', 'clear'].find(status => resultCount(status)) || 'anomaly';
}
function effectName(id) {
  if (id == null || id === 0xffffffff) return '空位';
  const name = effectNames.value.get(String(id));
  return name ? `${name} · #${id}` : `未收录词条 · #${id}`;
}
function itemName(relic) {
  return itemNames.value.get(String(relic.itemId)) || relic.name || relic.itemNameEn || '未收录遗物';
}
function collectionSlots(relic) {
  return Array.isArray(relic.rawEffectSlots) ? relic.rawEffectSlots : [];
}
function issueLabel(issue) {
  return `${issue.slot == null ? '整体' : '槽位 ' + issue.slot}${issue.role === 'positive' ? ' · 正面' : issue.role === 'negative' ? ' · 负面' : ''}`;
}
onMounted(() => {
  refreshCollection();
  window.addEventListener('nightreign:collection-changed', refreshCollection);
});
onBeforeUnmount(() => window.removeEventListener('nightreign:collection-changed', refreshCollection));
watch(opened, value => { if (value && !catalog.value && !loading.value) loadCatalog(); });
</script>

<template>
  <section class="legality-panel" aria-label="遗物合法性检测">
    <button type="button" class="panel-toggle" :aria-expanded="opened" aria-controls="relic-legality-content" @click="opened = !opened">
      <span>遗物合法性检测</span><span aria-hidden="true">{{ opened ? '−' : '＋' }}</span>
    </button>
    <div v-if="opened" id="relic-legality-content" class="panel-body">
      <p class="intro">选择遗物和词条，检测组合是否符合已收录的词条池；空位按未完成处理。</p>
      <p v-if="loading" role="status">正在加载检查资料…</p>
      <div v-else-if="loadError" role="alert"><p>{{ loadError }}</p><button type="button" class="action" @click="loadCatalog">重试</button></div>
      <template v-else-if="catalog">
        <div class="tabs" role="group" aria-label="检查方式">
          <button type="button" :aria-pressed="tab === 'draft'" @click="tab = 'draft'">自定义遗物</button>
          <button type="button" :aria-pressed="tab === 'collection'" @click="tab = 'collection'">检测收藏<span v-if="collection.length"> · {{ collection.length }}</span></button>
        </div>
        <div v-if="tab === 'draft'" class="draft-workspace">
          <div class="draft-controls">
            <label class="mode-control">遗物模式<select v-model="mode"><option value="normal">普通（含独特）</option><option value="deep">深夜</option></select></label>
            <RelicLegalityPicker v-model="itemId" :options="items" label="具体遗物" />
          </div>
          <template v-if="item">
            <p class="hint">单一候选已自动预填。可展开槽位搜索名称或 ID，或显示池外词条测试冲突。</p>
            <div class="slot-grid">
              <fieldset v-for="index in activeSlots" :key="`${itemId}:${index}`" class="slot-card">
                <legend>槽位 {{ index + 1 }}</legend>
                <RelicLegalityPicker v-if="item.positive[index] != null" v-model="positive[index]" :options="effects" :allowed-ids="pool('positive', index)" :label="`正面词条 ${index + 1}`" />
                <RelicLegalityPicker v-if="item.negative[index] != null" v-model="negative[index]" :options="effects" :allowed-ids="pool('negative', index)" :label="`负面词条 ${index + 1}`" />
              </fieldset>
            </div>
            <div class="draft-actions"><button type="button" class="action" @click="checkDraft">检测组合</button><button type="button" class="action secondary" @click="resetDraft">恢复预填</button></div>
            <div v-if="draftResult" class="draft-result" role="status" :data-status="draftResult.status">
              <strong>{{ labels[draftResult.status] }}</strong>
              <ul v-if="draftResult.issues.length"><li v-for="(issue, index) in draftResult.issues" :key="index"><span>{{ issueLabel(issue) }}：</span>{{ issue.message }}</li></ul>
              <p v-else>{{ draftResult.status === 'partial' ? '继续填写空位后可再次检查。' : '当前已填写组合未发现词条池异常。' }}</p>
            </div>
          </template>
          <p v-else class="hint">先选择模式与具体遗物，再填写词条。</p>
        </div>
        <div v-else class="collection-workspace">
          <p v-if="!collection.length" class="hint">尚无可检测的收藏，请先在上方读取存档，或使用“自定义遗物”。</p>
          <button v-else type="button" class="action" @click="checkCollection">检测当前 {{ collection.length }} 件遗物</button>
          <template v-if="checked">
            <div class="result-counts" role="group" aria-label="按检查结果查看">
              <button v-for="status in ['anomaly', 'unknown', 'clear']" :key="status" type="button" :aria-pressed="selectedStatus === status" :data-status="status" @click="selectedStatus = status"><span>{{ labels[status] }}</span><strong>{{ resultCount(status) }}</strong></button>
            </div>
            <p class="hint" role="status">{{ labels[selectedStatus] }} · {{ selectedResults.length }} 件，以下显示全部对应遗物。</p>
            <div class="checked-grid">
              <article v-for="(entry, index) in selectedResults" :key="`${entry.relic.id}:${index}`" class="checked-card" :data-status="entry.result.status">
                <h3>{{ itemName(entry.relic) }}</h3>
                <p class="identity">实例 #{{ entry.relic.id }} · 道具 #{{ entry.relic.itemId }}</p>
                <ol v-if="collectionSlots(entry.relic).length" class="checked-slots"><li v-for="(slot, slotIndex) in collectionSlots(entry.relic)" :key="slotIndex"><span>槽位 {{ slotIndex + 1 }}</span><p>{{ effectName(slot.positive) }}</p><p class="negative">{{ effectName(slot.negative) }}</p></li></ol>
                <ul v-if="entry.result.issues.length" class="issues"><li v-for="(issue, issueIndex) in entry.result.issues" :key="issueIndex"><strong>{{ issueLabel(issue) }}：</strong>{{ issue.message }}</li></ul>
                <p v-else class="hint">当前资料未发现异常。</p>
              </article>
            </div>
            <p v-if="!selectedResults.length" class="hint">此分类没有遗物。</p>
          </template>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.legality-panel{margin:10px 0 14px;border:1px solid #3e566e;border-radius:5px;background:#132131;color:#dce6e9;min-width:0}.panel-toggle{display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;min-height:42px;padding:9px 12px;border:0;border-radius:4px;background:#1b2d40;color:#e7d5ac;font:600 14px/1.5 'Noto Sans SC',sans-serif;text-align:left;cursor:pointer}.panel-body{padding:14px;min-width:0}.intro,.hint{margin:0 0 12px;color:#afc1ce;font-size:13px;line-height:1.65}.tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}.tabs button,.action{min-height:38px;padding:7px 12px;border:1px solid #536c82;border-radius:4px;background:#1b2d40;color:#e7d5ac;font:inherit;font-size:13px;cursor:pointer}.tabs button[aria-pressed=true]{border-color:#d3b77b;background:#2b3b45}.draft-controls{display:grid;grid-template-columns:minmax(160px,1fr) minmax(0,3fr);gap:12px;align-items:start;margin-bottom:12px}.mode-control{display:grid;gap:5px;font-size:13px;color:#c7d3da}.mode-control select{min-height:40px;width:100%;min-width:0;padding:7px 10px;border:1px solid #4c657b;border-radius:4px;background:#101d2a;color:#e0e7e9}.slot-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}.slot-card{display:grid;align-content:start;gap:12px;margin:0;padding:12px;border:1px solid #425a70;border-radius:4px;min-width:0}.slot-card legend{padding:0 5px;color:#d3b77b;font-size:13px}.draft-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.secondary{color:#c7d3da}.draft-result{margin-top:14px;padding:12px;border:1px solid #536c82;border-radius:4px;background:#172638;overflow-wrap:anywhere}.draft-result>strong{color:#e7d5ac}.draft-result p{margin:6px 0 0;font-size:13px}.draft-result ul,.issues{margin:8px 0 0;padding-left:20px;font-size:13px;line-height:1.7;overflow-wrap:anywhere}.result-counts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:14px 0 10px}.result-counts button{display:flex;justify-content:space-between;align-items:center;gap:8px;min-width:0;min-height:46px;padding:8px 10px;border:1px solid #536c82;border-radius:4px;background:#172638;color:#dce6e9;text-align:left;cursor:pointer;font:inherit;font-size:13px}.result-counts strong{font-size:20px}.result-counts button[aria-pressed=true]{border-color:#d3b77b;background:#2b3b45}.checked-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:12px}.checked-card{padding:12px;border:1px solid #425a70;border-radius:4px;background:#172638;min-width:0;overflow-wrap:anywhere}.checked-card[data-status=anomaly]{border-left:3px solid #c58a7f}.checked-card h3{margin:0;font:600 15px/1.6 'Noto Sans SC',sans-serif}.identity{margin:5px 0 10px;color:#a5b8c8;font-size:11px}.checked-slots{margin:0;padding:0;list-style:none}.checked-slots li{padding:8px 0;border-top:1px solid #3e566e}.checked-slots li>span{color:#a5b8c8;font-size:11px}.checked-slots p{margin:4px 0 0;font-size:13px;line-height:1.65}.negative{color:#a9c2d9}.checked-card>.hint{margin-top:12px}button:focus-visible,select:focus-visible{outline:1px solid #91a5ba;outline-offset:2px}@media(max-width:600px){.panel-body{padding:10px}.draft-controls{grid-template-columns:minmax(0,1fr)}.result-counts{gap:5px}.result-counts button{flex-direction:column;align-items:flex-start;gap:3px;font-size:12px;padding:7px}.slot-grid,.checked-grid{grid-template-columns:minmax(0,1fr)}}
</style>
