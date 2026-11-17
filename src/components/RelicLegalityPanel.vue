<script setup>
import { computed, onMounted, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { getLegalityCatalog, checkRelic, checkCombination } from '../relic-legality.js';
import RelicLegalityPicker from './RelicLegalityPicker.vue';
import RelicAnomalyDialog from './RelicAnomalyDialog.vue';

const catalog = shallowRef(null);
const loading = ref(false);
const loadError = ref('');
const opened = ref(false);
const tab = ref('combination');
const positive = ref([null, null, null]);
const negative = ref([null, null, null]);
const combinationResult = shallowRef(null);
const collection = shallowRef([]);
const checked = shallowRef(null);
const showAnomalies = ref(false);
const anomalyDialog = ref(null);
const effects = computed(() => catalog.value?.effects || []);
const positiveEffects = computed(() => effects.value.filter(effect => !effect.negative));
const negativeEffects = computed(() => effects.value.filter(effect => effect.negative));
const anomalies = computed(() => (checked.value || []).filter(entry => entry.result.status === 'anomaly'));
const combinationMessage = computed(() => {
  const result = combinationResult.value;
  if (result?.status === 'anomaly') return '异常';
  if (result?.status === 'unknown') return '待核对';
  return result?.message || '';
});

function bucket(status) { return status === 'partial' ? 'unknown' : status; }
function resultCount(status) { return (checked.value || []).filter(entry => bucket(entry.result.status) === status).length; }
function canHaveNegative(index) {
  const id = positive.value[index];
  return id != null && catalog.value?.negativeEligible.has(Number(id));
}
watch(() => [...positive.value], (values, previous) => {
  values.forEach((id, index) => {
    if (id !== previous[index]) negative.value[index] = null;
  });
  combinationResult.value = null;
});
watch(negative, () => { combinationResult.value = null; }, { deep: true });
async function loadCatalog() {
  loading.value = true;
  loadError.value = '';
  try { catalog.value = await getLegalityCatalog(); }
  catch { loadError.value = '检查资料未能加载，请重试。'; }
  finally { loading.value = false; }
}
function checkSelectedCombination() {
  const slots = positive.value.map((id, index) => ({
    positive: id,
    negative: canHaveNegative(index) ? negative.value[index] : null,
  }));
  combinationResult.value = checkCombination(catalog.value, slots);
}
function refreshCollection() {
  collection.value = window.NightreignRelicCollection?.() || [];
  checked.value = null;
  showAnomalies.value = false;
}
function checkCollection() {
  const current = window.NightreignRelicCollection?.() || [];
  collection.value = current;
  const results = current.map(relic => ({ relic, result: checkRelic(catalog.value, relic, { draft: false }) }));
  checked.value = results;
  window.dispatchEvent(new CustomEvent('nightreign:relic-inspection', { detail: results }));
}
function explainCard({ detail }) {
  anomalyDialog.value.open(detail.title, detail.reasons);
}
function closeExplanation() { anomalyDialog.value?.close(); }
function toggleAnomalies() {
  window.dispatchEvent(new CustomEvent('nightreign:relic-anomaly-filter', { detail: !showAnomalies.value }));
}
function syncAnomalyFilter({ detail }) { showAnomalies.value = !!detail; }
onMounted(() => {
  refreshCollection();
  window.addEventListener('nightreign:collection-changed', refreshCollection);
  window.addEventListener('nightreign:explain-relic-anomaly', explainCard);
  window.addEventListener('nightreign:relic-anomaly-filter-changed', syncAnomalyFilter);
  window.addEventListener('hashchange', closeExplanation);
});
onBeforeUnmount(() => {
  window.removeEventListener('nightreign:collection-changed', refreshCollection);
  window.removeEventListener('nightreign:explain-relic-anomaly', explainCard);
  window.removeEventListener('nightreign:relic-anomaly-filter-changed', syncAnomalyFilter);
  window.removeEventListener('hashchange', closeExplanation);
});
watch(opened, value => {
  if (!value) return;
  tab.value = 'combination';
  if (!catalog.value && !loading.value) loadCatalog();
});
</script>

<template>
  <section class="legality-panel" aria-label="遗物合法性检测">
    <button type="button" class="panel-toggle" :aria-expanded="opened" aria-controls="relic-legality-content" @click="opened = !opened">
      <span>遗物合法性检测</span><span aria-hidden="true">{{ opened ? '−' : '＋' }}</span>
    </button>
    <div v-if="opened" id="relic-legality-content" class="panel-body">
      <p v-if="loading" role="status">正在加载检查资料…</p>
      <div v-else-if="loadError" role="alert"><p>{{ loadError }}</p><button type="button" class="action" @click="loadCatalog">重试</button></div>
      <template v-else-if="catalog">
        <div class="inspection-toolbar" :class="{ 'collection-toolbar': tab === 'collection' && collection.length }">
          <div class="tabs" role="group" aria-label="检查方式">
            <button type="button" :aria-pressed="tab === 'combination'" @click="tab = 'combination'">词条组合</button>
            <button type="button" :aria-pressed="tab === 'collection'" @click="tab = 'collection'">检测收藏<span v-if="collection.length"> · {{ collection.length }}</span></button>
          </div>
          <div v-if="tab === 'collection' && collection.length" class="inspection-actions">
            <button type="button" class="action inspection-run" @click="checkCollection">检测当前 {{ collection.length }} 件遗物</button>
            <div v-if="checked" class="inspection-result" role="status">
              <span class="anomaly-count" :class="{ 'has-anomalies': anomalies.length }">异常遗物：<strong>{{ anomalies.length }}</strong> 件</span>
              <span v-if="resultCount('unknown') || !anomalies.length" class="inspection-summary">{{ resultCount('unknown') ? `${resultCount('unknown')} 件待核对` : '未发现异常' }}</span>
            </div>
            <button v-if="anomalies.length || showAnomalies" type="button" class="action anomaly-entry" :aria-pressed="showAnomalies" @click="toggleAnomalies">{{ showAnomalies ? '显示全部遗物' : `查看异常遗物（${anomalies.length}）` }}</button>
          </div>
        </div>
        <div v-if="tab === 'combination'" class="combination-workspace">
          <div class="slot-grid">
            <div v-for="index in 3" :key="index" class="slot-card">
              <RelicLegalityPicker v-model="positive[index - 1]" :options="positiveEffects" :label="`主词条 ${index}`" />
              <RelicLegalityPicker v-if="canHaveNegative(index - 1)" :key="`negative-${index}-${positive[index - 1]}`" v-model="negative[index - 1]" :options="negativeEffects" :label="`负面词条 ${index}`" />
            </div>
          </div>
          <div class="combination-actions"><button type="button" class="action" @click="checkSelectedCombination">检测组合</button></div>
          <p v-if="combinationResult" class="combination-result" role="status" :data-status="combinationResult.status"><button v-if="combinationResult.status === 'anomaly'" type="button" class="anomaly-label" aria-haspopup="dialog" @click="anomalyDialog.open('词条组合', combinationResult.reasons)">异常</button><template v-else>{{ combinationMessage }}</template></p>
        </div>
        <div v-else class="collection-workspace">
          <p v-if="!collection.length" class="hint">尚无可检测的收藏，请先在上方读取存档，或使用“词条组合”。</p>
          <p v-else-if="anomalies.length" class="inspection-help">点击异常查看原因</p>
        </div>
      </template>
    </div>
  </section>
  <RelicAnomalyDialog ref="anomalyDialog" />
</template>

<style scoped>
.anomaly-label{padding:2px 4px;border:0;background:transparent;color:#ffada5;font:600 14px/1.6 'Noto Sans SC',sans-serif;cursor:pointer}
.legality-panel{margin:10px 0 14px;border:1px solid #3e566e;border-radius:5px;background:#132131;color:#dce6e9;min-width:0}.panel-toggle{display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;min-height:42px;padding:9px 12px;border:0;border-radius:4px;background:#1b2d40;color:#e7d5ac;font:600 14px/1.5 'Noto Sans SC',sans-serif;text-align:left;cursor:pointer}.panel-body{padding:14px;min-width:0}.hint{margin:0 0 12px;color:#afc1ce;font-size:13px;line-height:1.65}.inspection-toolbar{margin-bottom:12px}.collection-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;grid-template-areas:"tabs check result filter";align-items:center;gap:8px 12px;margin-bottom:0}.tabs{grid-area:tabs;display:flex;flex-wrap:wrap;gap:8px;min-width:0}.tabs button,.action{min-height:38px;padding:7px 12px;border:1px solid #536c82;border-radius:4px;background:#1b2d40;color:#e7d5ac;font:inherit;font-size:13px;cursor:pointer}.tabs button[aria-pressed=true]{border-color:#d3b77b;background:#2b3b45}.combination-actions{margin-top:14px}.combination-result{margin:14px 0 0;padding:12px;border:1px solid #536c82;border-radius:4px;background:#172638;font-size:14px;line-height:1.7;white-space:pre-line;overflow-wrap:anywhere}.slot-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}.slot-card{display:grid;align-content:start;gap:10px;min-width:0}.inspection-actions{display:contents}.inspection-run{grid-area:check}.inspection-result{grid-area:result;display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font-size:13px}.anomaly-count{white-space:nowrap;color:#afc1ce}.anomaly-count strong{font-variant-numeric:tabular-nums}.anomaly-count.has-anomalies{color:#ffada5}.inspection-summary{color:#afc1ce;font-size:12px;white-space:nowrap}.anomaly-entry{grid-area:filter}.inspection-help{margin:8px 0 0;color:#afc1ce;font-size:12px;line-height:1.5}.inspection-run,.anomaly-entry{white-space:nowrap}button:focus-visible,select:focus-visible{outline:1px solid #91a5ba;outline-offset:2px}@media(max-width:1000px){.collection-toolbar{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"tabs result" "check filter"}.inspection-result{justify-content:flex-end}.inspection-run{justify-self:start}.anomaly-entry{justify-self:end}}@media(max-width:600px){.panel-body{padding:10px}.slot-grid{grid-template-columns:minmax(0,1fr)}.collection-toolbar{gap:8px}.tabs{gap:6px}.tabs button,.action{padding:7px 8px;font-size:12px}.inspection-result{gap:2px;font-size:12px}.inspection-summary{font-size:11px}}@media(max-width:360px){.collection-toolbar{grid-template-columns:minmax(0,1fr);grid-template-areas:"tabs" "result" "check" "filter"}.inspection-result,.anomaly-entry{justify-self:start}.inspection-result{justify-content:flex-start}}
</style>
