<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { enemyAreaIcon } from '../lib/enemy-area-icons.js';

const props = defineProps({ active: Boolean });
const nativeSelect = ref(null), trigger = ref(null), popup = ref(null);
const options = ref([{ value: 'all', label: '全部区域 / 遭遇' }]);
const selectedValue = ref('all'), opened = ref(false), activeIndex = ref(0);
const manifest = shallowRef(null), failedImages = ref(new Set()), popupStyle = ref({});
const selected = computed(() => options.value.find(option => option.value === selectedValue.value) || options.value[0]);
let typeahead = '', lastTyped = 0;

function icon(area) {
  const path = enemyAreaIcon(manifest.value, area);
  return failedImages.value.has(path) ? null : path;
}
function imageFailed(event) { failedImages.value = new Set([...failedImages.value, event.target.getAttribute('src')]); }
function syncOptions() {
  options.value = Array.from(nativeSelect.value.options, option => ({ value: option.value, label: option.textContent }));
  selectedValue.value = nativeSelect.value.value;
  activeIndex.value = Math.max(0, options.value.findIndex(option => option.value === selectedValue.value));
}
function positionPopup() {
  if (!opened.value || !trigger.value) return;
  const rect = trigger.value.getBoundingClientRect(), viewport = window.visualViewport;
  const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
  const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
  const below = top + height - rect.bottom - 12, above = rect.top - top - 12;
  const downward = below >= 240 || below >= above;
  const maxHeight = Math.min(320, Math.max(0, downward ? below : above));
  const popupWidth = Math.min(Math.max(rect.width, 264), width - 16);
  popupStyle.value = {
    width: `${popupWidth}px`, maxHeight: `${maxHeight}px`,
    left: `${Math.max(left + 8, Math.min(rect.left, left + width - popupWidth - 8))}px`,
    ...(downward ? { top: `${rect.bottom + 4}px` } : { bottom: `${window.innerHeight - rect.top + 4}px` }),
  };
}
function revealActive() {
  nextTick(() => {
    const option = popup.value?.children[activeIndex.value];
    if (!option) return;
    const top = option.offsetTop, bottom = top + option.offsetHeight;
    if (top < popup.value.scrollTop) popup.value.scrollTop = top;
    else if (bottom > popup.value.scrollTop + popup.value.clientHeight) popup.value.scrollTop = bottom - popup.value.clientHeight;
  });
}
function closePicker(restoreFocus = false) {
  opened.value = false;
  if (restoreFocus) trigger.value?.focus({ preventScroll: true });
}
function openPicker() {
  syncOptions();
  opened.value = true;
  typeahead = '';
  positionPopup();
  revealActive();
}
function choose(index) {
  const option = options.value[index];
  if (!option) return;
  const changed = nativeSelect.value.value !== option.value;
  nativeSelect.value.value = option.value;
  selectedValue.value = option.value;
  closePicker(true);
  if (changed) nativeSelect.value.dispatchEvent(new Event('change', { bubbles: true }));
}
function keydown(event) {
  if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.key === 'Tab') { closePicker(); return; }
  if (event.key === 'Escape') { if (opened.value) { event.preventDefault(); closePicker(true); } return; }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (opened.value) choose(activeIndex.value); else openPicker();
    return;
  }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    if (!opened.value) openPicker();
    else if (event.key === 'ArrowDown') activeIndex.value = Math.min(options.value.length - 1, activeIndex.value + 1);
    else if (event.key === 'ArrowUp') activeIndex.value = Math.max(0, activeIndex.value - 1);
    if (event.key === 'Home') activeIndex.value = 0;
    if (event.key === 'End') activeIndex.value = options.value.length - 1;
    revealActive();
    return;
  }
  if (event.key.length === 1) {
    event.preventDefault();
    if (!opened.value) openPicker();
    const now = Date.now();
    typeahead = now - lastTyped < 800 ? typeahead + event.key : event.key;
    lastTyped = now;
    const found = options.value.findIndex(option => option.label.toLocaleLowerCase().startsWith(typeahead.toLocaleLowerCase()));
    if (found >= 0) { activeIndex.value = found; revealActive(); }
  }
}
function outsidePointer(event) {
  if (!trigger.value?.contains(event.target) && !popup.value?.contains(event.target)) closePicker();
}
function pageScrolled(event) {
  if (!popup.value?.contains(event.target)) positionPopup();
}
watch(() => props.active, value => { if (!value) closePicker(); });
onMounted(async () => {
  nativeSelect.value.addEventListener('nightreign:enemy-area-sync', syncOptions);
  document.addEventListener('pointerdown', outsidePointer);
  window.addEventListener('resize', positionPopup);
  window.addEventListener('scroll', pageScrolled, true);
  window.visualViewport?.addEventListener('resize', positionPopup);
  window.visualViewport?.addEventListener('scroll', positionPopup);
  try {
    const response = await fetch('/map-icon-manifest.json');
    if (response.ok) manifest.value = await response.json();
  } catch { /* Filtering remains available without optional icons. */ }
});
onBeforeUnmount(() => {
  nativeSelect.value?.removeEventListener('nightreign:enemy-area-sync', syncOptions);
  document.removeEventListener('pointerdown', outsidePointer);
  window.removeEventListener('resize', positionPopup);
  window.removeEventListener('scroll', pageScrolled, true);
  window.visualViewport?.removeEventListener('resize', positionPopup);
  window.visualViewport?.removeEventListener('scroll', positionPopup);
});
</script>

<template>
  <div class="enemy-area-filter">
    <select id="enemy-area" ref="nativeSelect" hidden aria-hidden="true" tabindex="-1"><option value="all">全部区域 / 遭遇</option></select>
    <button ref="trigger" type="button" class="enemy-area-trigger" role="combobox" aria-label="出现区域与遭遇" aria-haspopup="listbox" :aria-expanded="opened" aria-controls="enemy-area-options" :aria-activedescendant="opened ? `enemy-area-option-${activeIndex}` : undefined" @click="opened ? closePicker() : openPicker()" @keydown="keydown" @blur="closePicker()">
      <img v-if="icon(selected.value)" :src="icon(selected.value)" alt="" aria-hidden="true" @error="imageFailed">
      <span>{{ selected.label }}</span><span class="enemy-area-chevron" aria-hidden="true">⌄</span>
    </button>
    <Teleport to="body">
      <ul v-if="opened" id="enemy-area-options" ref="popup" class="enemy-area-options" role="listbox" aria-label="出现区域与遭遇" :style="popupStyle" @mousedown.prevent>
        <li v-for="(option, index) in options" :id="`enemy-area-option-${index}`" :key="option.value" role="option" :aria-selected="option.value === selectedValue" :class="{ active: index === activeIndex }" @click="choose(index)">
          <img v-if="icon(option.value)" :src="icon(option.value)" alt="" aria-hidden="true" @error="imageFailed">
          <span>{{ option.label }}</span><span v-if="option.value === selectedValue" class="enemy-area-check" aria-hidden="true">✓</span>
        </li>
      </ul>
    </Teleport>
  </div>
</template>

<style scoped>
.enemy-area-filter{min-width:0}
.enemy-area-trigger{display:flex;align-items:center;gap:7px;width:100%;height:36px;min-width:0;padding:4px 9px;border:1px solid #44586c;border-radius:3px;background:#142334;color:#dce4e8;font:inherit;font-size:12px;text-align:left;cursor:pointer}
.enemy-area-trigger>span:first-of-type{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.enemy-area-trigger img,.enemy-area-options img{width:25px;height:25px;flex:0 0 25px;object-fit:contain}
.enemy-area-chevron{margin-left:auto;color:#bda976}
.enemy-area-trigger:hover,.enemy-area-trigger[aria-expanded="true"]{border-color:#b99b64}
.enemy-area-trigger:focus-visible{outline:2px solid #d5b477;outline-offset:2px}
.enemy-area-options{position:fixed;z-index:1000;display:block;overflow:auto;overscroll-behavior:contain;touch-action:pan-y;margin:0;padding:4px;list-style:none;border:1px solid #8c7955;border-radius:4px;background:#142334;box-shadow:0 10px 28px #0008;color:#dce4e8;font-size:13px;scrollbar-gutter:stable}
.enemy-area-options li{display:flex;align-items:center;gap:9px;min-height:40px;padding:6px 9px;border:1px solid transparent;border-radius:2px;line-height:1.5;cursor:pointer}
.enemy-area-options li>span:first-of-type{min-width:0;overflow-wrap:anywhere}
.enemy-area-options li.active,.enemy-area-options li:hover{background:#26394b;border-color:#6a7f8e}
.enemy-area-options li[aria-selected="true"]{color:#ecd6a5}
.enemy-area-check{margin-left:auto;color:#d5b477}
@media(max-width:850px){.enemy-area-filter{flex:1 1 145px;min-width:0}.enemy-area-trigger{height:40px}}
</style>
