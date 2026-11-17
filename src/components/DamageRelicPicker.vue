<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  slots: { type: Array, required: true },
  choices: { type: Array, required: true },
  initialSlotId: { type: String, default: '' },
});
const emit = defineEmits(['save', 'close']);
const dialog = ref(null);
const cloneSlots = slots => slots.map(slot => ({ ...slot, rows: slot.rows.map(row => ({ ...row })) }));
const draft = ref(cloneSlots(props.slots));
const firstSlot = draft.value.find(slot => slot.id === props.initialSlotId)
  || draft.value.find(slot => slot.mode === 'normal' && !slot.rows.length)
  || draft.value.find(slot => slot.mode === 'normal')
  || draft.value[0];
const selectedSlotId = ref(firstSlot?.id);
const query = ref('');
const activeSlot = computed(() => draft.value.find(slot => slot.id === selectedSlotId.value));
const groups = [
  { mode: 'normal', label: '普通遗物' },
  { mode: 'deep', label: '深夜遗物' },
];
const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase();
const candidates = computed(() => {
  const mode = activeSlot.value?.mode === 'deep' ? '深夜' : '普通';
  const search = normalize(query.value).trim();
  return props.choices.filter(item => item.modes.includes(mode)
    && normalize(`${item.name} ${item.detail || ''} ${item.id}`).includes(search));
});
const isSelected = id => activeSlot.value?.rows.some(row => row.id === id);

function selectSlot(id) {
  selectedSlotId.value = id;
  query.value = '';
}
function toggleEffect(item) {
  const rows = activeSlot.value?.rows;
  if (!rows) return;
  const index = rows.findIndex(row => row.id === item.id);
  if (index >= 0) rows.splice(index, 1);
  else if (rows.length < 3) rows.push({ id: item.id, name: item.name });
}
function removeEffect(id) {
  const rows = activeSlot.value?.rows;
  const index = rows?.findIndex(row => row.id === id) ?? -1;
  if (index >= 0) rows.splice(index, 1);
}
function save() {
  emit('save', cloneSlots(draft.value));
  emit('close');
}

let origin;
onMounted(() => {
  const root = document.documentElement;
  origin = {
    element: document.activeElement, x: window.scrollX, y: window.scrollY,
    overflow: root.style.overflow, gutter: root.style.scrollbarGutter,
  };
  root.style.scrollbarGutter = 'stable';
  root.style.overflow = 'hidden';
  dialog.value.showModal();
});
onBeforeUnmount(() => {
  dialog.value?.close();
  if (!origin) return;
  document.documentElement.style.overflow = origin.overflow;
  document.documentElement.style.scrollbarGutter = origin.gutter;
  if (origin.element?.isConnected) origin.element.focus({ preventScroll: true });
  window.scrollTo({ left: origin.x, top: origin.y, behavior: 'instant' });
});
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="damage-relic-picker-dialog" aria-labelledby="damage-relic-picker-title"
      @keydown.esc.stop.prevent="emit('close')" @cancel.prevent="emit('close')"
      @click="event => { if (event.target === dialog) emit('close'); }">
      <div class="relic-picker-frame">
        <header>
          <h2 id="damage-relic-picker-title">遗物词条</h2>
          <button type="button" class="close-button" aria-label="关闭遗物词条选择" @click="emit('close')">×</button>
        </header>
        <div class="slot-groups">
          <section v-for="group in groups" :key="group.mode" :aria-label="group.label">
            <h3>{{ group.label }}</h3>
            <div class="slot-buttons">
              <button v-for="slot in draft.filter(item => item.mode === group.mode)" :key="slot.id"
                type="button" :aria-label="`${slot.label}，已选 ${slot.rows.length} 个词条`"
                :aria-pressed="selectedSlotId === slot.id" @click="selectSlot(slot.id)">
                <span>{{ slot.label }}</span><small>{{ slot.rows.length }} / 3</small>
              </button>
            </div>
          </section>
        </div>
        <input v-model="query" type="search" placeholder="搜索遗物词条" aria-label="搜索遗物词条" autofocus>
        <div class="selected-effects" aria-label="当前遗物已选词条">
          <div v-for="row in activeSlot?.rows" :key="row.id" class="selected-effect">
            <span>{{ row.name }}</span>
            <button type="button" :aria-label="`移除${row.name}`" @click="removeEffect(row.id)">×</button>
          </div>
        </div>
        <div class="relic-picker-results" aria-label="遗物词条候选">
          <button v-for="item in candidates" :key="item.id" type="button" class="relic-picker-option"
            :aria-pressed="isSelected(item.id)" :disabled="activeSlot?.rows.length >= 3 && !isSelected(item.id)"
            @click="toggleEffect(item)">
            <span>{{ item.name }}</span><small v-if="item.detail">{{ item.detail }}</small>
          </button>
          <p v-if="!candidates.length">没有匹配的词条</p>
        </div>
        <footer>
          <small>{{ activeSlot?.label }} · {{ activeSlot?.rows.length || 0 }} / 3</small>
          <div class="footer-actions">
            <button type="button" @click="emit('close')">取消</button>
            <button type="button" class="save-button" @click="save">完成</button>
          </div>
        </footer>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.damage-relic-picker-dialog{position:fixed;inset:0;margin:auto;width:min(620px,calc(100vw - 24px));max-width:none;max-height:none;padding:0;background:#142435;color:#e5e9eb;border:1px solid #778692;border-radius:6px;box-shadow:0 16px 70px #0009;overflow:hidden}
.damage-relic-picker-dialog::backdrop{background:#07101bc9}
.relic-picker-frame{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:16px;height:min(720px,calc(100dvh - 24px));min-height:0}
header,footer{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-shrink:0}
h2{font-size:18px;color:#e7d4a4;margin:0}
h3{font-size:12px;font-weight:500;color:#adbfcb;margin:0 0 5px}
button,input{box-sizing:border-box;border:1px solid #52687d;background:#192d40;color:inherit;padding:7px 10px;min-height:35px;border-radius:3px;font:inherit;font-size:13px}
button{cursor:pointer}button:disabled{opacity:.48;cursor:default}
button:focus-visible,input:focus-visible{outline:1px solid #b2c7d9;outline-offset:2px}
button[aria-pressed=true],.save-button{color:#f2d59f;border-color:#bb9d63;background:#293646}
.close-button{font:24px/1 sans-serif;width:36px;padding:4px}
.slot-groups{display:grid;gap:8px;flex-shrink:0}
.slot-buttons{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.slot-buttons button{display:flex;align-items:center;justify-content:space-between;gap:4px;min-width:0}
.slot-buttons span{overflow-wrap:anywhere}
small{font-size:12px;line-height:1.4;color:#adbfcb}
.slot-buttons small{white-space:nowrap;font-variant-numeric:tabular-nums}
input{width:100%;background:#0c1a27;flex-shrink:0}
.selected-effects{height:96px;flex-shrink:0;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:4px}
.selected-effect{display:flex;align-items:center;gap:6px;background:#26394a;border:1px solid #52687d;border-radius:3px;padding:3px 4px 3px 8px;font-size:12px;flex-shrink:0}
.selected-effect span{flex:1;min-width:0;overflow-wrap:anywhere}
.selected-effect button{flex-shrink:0;min-height:24px;width:26px;padding:0;border-color:transparent;background:transparent;font:19px/1 sans-serif}
.relic-picker-results{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:5px;scrollbar-gutter:stable}
.relic-picker-option{display:grid;text-align:left;gap:3px;flex:none;overflow-wrap:anywhere}
.relic-picker-results p{margin:8px 0;font-size:13px;color:#adbfcb}
.footer-actions{display:flex;gap:8px}
@media(max-width:500px){.relic-picker-frame{padding:12px;gap:9px}.slot-buttons button{padding:6px;flex-direction:column;gap:2px}.slot-buttons small{font-size:11px}}
@media(max-height:600px){.relic-picker-frame{padding:10px;gap:6px}.slot-groups{gap:5px}.selected-effects{height:60px}h3{margin-bottom:3px}.slot-buttons button{padding-block:4px}.slot-buttons small{font-size:11px}}
</style>
