<script>
let activePickerClose = null;
</script>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
const props = defineProps({
  modelValue: { default: null },
  options: { type: Array, default: () => [] },
  label: { type: String, required: true },
});
const emit = defineEmits(['update:modelValue']);
const trigger = ref(null);
const popup = ref(null);
const searchInput = ref(null);
const opened = ref(false);
const query = ref('');
const popupStyle = ref({});
const inputId = useId();
const popupId = useId();
let pagePosition = null;
const selected = computed(() => props.options.find(option => String(option.id) === String(props.modelValue)));
const selectedName = computed(() => selected.value?.name || (props.modelValue != null ? '#' + props.modelValue : '空位'));
const eligible = computed(() => {
  const search = query.value.trim().toLocaleLowerCase();
  return props.options.filter(option => !search || `${option.name} ${option.id}`.toLocaleLowerCase().includes(search));
});

function positionPopup() {
  if (!opened.value || !trigger.value) return;
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft || 0;
  const viewportTop = viewport?.offsetTop || 0;
  const viewportWidth = viewport?.width || window.innerWidth;
  const viewportHeight = viewport?.height || window.innerHeight;
  const rect = trigger.value.getBoundingClientRect();
  const margin = 8;
  const minTop = viewportTop + margin;
  const maxBottom = viewportTop + viewportHeight - margin;
  const mobile = viewportWidth <= 600;
  const width = mobile ? viewportWidth - margin * 2 : Math.min(Math.max(rect.width, 320), viewportWidth - margin * 2);
  const left = mobile ? viewportLeft + margin : Math.max(viewportLeft + margin, Math.min(rect.left, viewportLeft + viewportWidth - width - margin));
  const below = Math.max(0, maxBottom - rect.bottom - 5);
  const above = Math.max(0, rect.top - minTop - 5);
  const downward = below >= 240 || below >= above;
  const available = mobile ? maxBottom - minTop : downward ? below : above;
  const height = Math.min(480, Math.max(0, available));
  // Very short desktop windows use the visible viewport, keeping search reachable.
  const useViewport = mobile || height < 150;
  popupStyle.value = {
    left: `${left}px`,
    top: `${useViewport ? minTop : downward ? rect.bottom + 5 : rect.top - height - 5}px`,
    width: `${width}px`,
    height: `${useViewport ? Math.min(480, maxBottom - minTop) : height}px`,
  };
}
function containPopupScroll(event) {
  if (!event.target.closest('.picker-options') && event.cancelable) event.preventDefault();
}
function closePicker(restoreFocus = true) {
  if (!opened.value) return;
  opened.value = false;
  searchInput.value?.blur();
  window.removeEventListener('resize', positionPopup);
  window.visualViewport?.removeEventListener('resize', positionPopup);
  window.visualViewport?.removeEventListener('scroll', positionPopup);
  document.removeEventListener('keydown', handleKeydown, true);
  if (activePickerClose === closeOtherPicker) activePickerClose = null;
  if (restoreFocus) {
    const position = pagePosition;
    nextTick(() => {
      trigger.value?.focus({ preventScroll: true });
      if (position) window.scrollTo({ ...position, behavior: 'instant' });
    });
  }
}
function closeOtherPicker() { closePicker(false); }
async function openPicker() {
  if (opened.value) { closePicker(); return; }
  activePickerClose?.();
  activePickerClose = closeOtherPicker;
  query.value = '';
  pagePosition = { top: window.scrollY, left: window.scrollX };
  opened.value = true;
  window.addEventListener('resize', positionPopup);
  window.visualViewport?.addEventListener('resize', positionPopup);
  window.visualViewport?.addEventListener('scroll', positionPopup);
  document.addEventListener('keydown', handleKeydown, true);
  await nextTick();
  positionPopup();
  searchInput.value?.focus({ preventScroll: true });
}
function handleKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closePicker();
    return;
  }
  if (event.key !== 'Tab' || !popup.value) return;
  const controls = [...popup.value.querySelectorAll('button:not([disabled]), input:not([disabled])')];
  const first = controls[0], last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault(); last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first?.focus();
  }
}
function choose(id) {
  emit('update:modelValue', id);
  closePicker();
}
watch(query, () => {
  const list = popup.value?.querySelector('.picker-options');
  if (list) list.scrollTop = 0;
});
onBeforeUnmount(() => closePicker(false));
</script>

<template>
  <div class="legality-picker">
    <span class="picker-label">{{ label }}</span>
    <button ref="trigger" type="button" class="picker-trigger" :aria-label="`${label}：${selectedName}`" :title="selectedName" aria-haspopup="dialog" :aria-expanded="opened" :aria-controls="opened ? popupId : undefined" @click="openPicker">
      <span>{{ selectedName }}</span><small v-if="selected">#{{ selected.id }}</small><span class="picker-arrow" aria-hidden="true">▾</span>
    </button>
    <Teleport to="body">
      <template v-if="opened">
        <div class="picker-backdrop" aria-hidden="true" @pointerdown.prevent="closePicker()" @wheel.prevent @touchmove.prevent></div>
        <div :id="popupId" ref="popup" class="picker-menu" :style="popupStyle" @wheel="containPopupScroll" @touchmove="containPopupScroll" role="dialog" aria-modal="true" :aria-label="label">
          <div class="picker-heading"><label :for="inputId">{{ label }} · 搜索名称或 ID</label><button type="button" class="picker-close" aria-label="关闭选择器" @click="closePicker()">×</button></div>
          <input :id="inputId" ref="searchInput" v-model="query" type="search" placeholder="输入名称或 ID" autocomplete="off">
          <div class="picker-tools"><button type="button" class="clear-option" @click="choose(null)">保留空位</button><span class="picker-count" aria-live="polite">{{ eligible.length }} 项匹配</span></div>
          <div class="picker-options" :aria-label="label + '候选项'">
            <button v-for="option in eligible" :key="option.id" type="button" :aria-pressed="String(modelValue) === String(option.id)" @click="choose(option.id)">
              <span>{{ option.name }}</span><small>#{{ option.id }}</small>
            </button>
            <p v-if="!eligible.length" class="picker-count">没有匹配项，可修改搜索条件。</p>
          </div>
        </div>
      </template>
    </Teleport>
  </div>
</template>

<style scoped>
.legality-picker{min-width:0}
.picker-label{display:block;margin-bottom:5px;color:#c7d3da;font-size:13px}
.picker-trigger{display:flex;align-items:center;gap:8px;width:100%;min-width:0;height:40px;padding:8px 10px;border:1px solid #4c657b;border-radius:4px;background:#101d2a;color:#e0e7e9;font:13px/1.5 'Noto Sans SC',sans-serif;text-align:left;cursor:pointer}
.picker-trigger>span:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
small{flex-shrink:0;color:#a5b8c8;font-size:11px}
.picker-arrow{flex-shrink:0;color:#a5b8c8}
.picker-backdrop{position:fixed;inset:0;z-index:10000;background:transparent;touch-action:none;overscroll-behavior:none}
.picker-menu{position:fixed;z-index:10001;display:grid;grid-template-rows:auto auto auto minmax(0,1fr);gap:7px;box-sizing:border-box;min-width:0;max-width:calc(100% - 16px);padding:10px;border:1px solid #536c82;border-radius:5px;background:#152438;color:#e0e7e9;box-shadow:0 8px 28px #0008;overflow:hidden}
.picker-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;font:12px/1.5 'Noto Sans SC',sans-serif}
.picker-heading label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.picker-close{flex-shrink:0;width:28px;height:28px;padding:0;border:1px solid #425a70;border-radius:3px;background:#1b2d40;color:#e0e7e9;font-size:20px;line-height:1;cursor:pointer}
.picker-menu>input{box-sizing:border-box;width:100%;min-width:0;height:38px;padding:7px 9px;border:1px solid #536c82;border-radius:3px;background:#101d2a;color:#e0e7e9;font:14px/1.5 'Noto Sans SC',sans-serif}
.picker-tools{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.clear-option{padding:5px 9px;border:1px solid #425a70;border-radius:3px;background:#1b2d40;color:#e7e1d3;font:12px/1.5 'Noto Sans SC',sans-serif;cursor:pointer}
.picker-count{margin:0;color:#a5b8c8;font:12px/1.5 'Noto Sans SC',sans-serif}
.picker-options{display:flex;flex-direction:column;gap:4px;min-height:0;min-width:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;touch-action:pan-y;scrollbar-gutter:stable;-webkit-overflow-scrolling:touch}
.picker-options button{display:flex;align-items:flex-start;gap:8px;flex-shrink:0;width:100%;min-width:0;padding:8px 9px;border:1px solid #425a70;border-radius:3px;background:#1b2d40;color:#e7e1d3;text-align:left;font:13px/1.5 'Noto Sans SC',sans-serif;cursor:pointer}
.picker-options button>span{flex:1;min-width:0;overflow-wrap:anywhere}
.picker-options button[aria-pressed=true]{border-color:#d3b77b;background:#2b3b45}
.picker-options button:hover,.clear-option:hover,.picker-close:hover{border-color:#91a5ba}
button:focus-visible,input:focus-visible{outline:1px solid #91a5ba;outline-offset:2px}
@media(max-width:600px){.picker-menu>input{font-size:16px}}
@media(max-height:400px){.picker-menu{gap:5px;padding:7px}.picker-close{width:24px;height:24px}.picker-menu>input{height:34px;padding:5px 9px}.clear-option{padding:3px 8px}}
</style>
