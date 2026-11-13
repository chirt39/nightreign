<script setup>
import { computed } from 'vue';
import { hasAutomaticProjectile } from '../lib/damage-panel.js';
const props = defineProps({ modelValue: { type: Object, default: () => ({}) }, segments: Array, selectedIds: Array, upgradeStep: { type: Number, default: null } });
const emit = defineEmits(['update:modelValue']);
const labels = {physical:'物理', magic:'魔力', fire:'火', lightning:'雷', holy:'圣'};
const editable = computed(() => (props.segments || []).filter(segment =>
  props.selectedIds?.includes(segment.id) && segment.manualChannels?.length && !segment.rates && !hasAutomaticProjectile(segment)));
function baseNote(segment, type) {
  const raw = segment.projectile?.rawBaseComponents?.[type];
  if (!Number.isFinite(raw)) return '';
  const rate = segment.projectile?.baseAtkRatesByReinforcement?.[props.upgradeStep]?.baseAtkRate;
  return Number.isFinite(rate)
    ? `强化后基础 ${Number((raw * rate).toFixed(2))}（${raw} × ${rate}，未含角色补正）`
    : `原始基础 ${raw}（未含强化与角色补正）`;
}
function update(id, type, text) {
  const values = { ...props.modelValue[id] };
  const value = Number(text);
  if (text.trim() && Number.isFinite(value) && value >= 0) values[type] = value;
  else delete values[type];
  emit('update:modelValue', { ...props.modelValue, [id]: values });
}
</script>

<template>
  <details v-if="editable.length" class="projectile-inputs">
    <summary>手填弹体伤害分量</summary>
    <p>填单次命中、过防和伤害加成前的已知数值。留空时该段仅列入待核对项。</p>
    <fieldset v-for="segment in editable" :key="segment.id">
      <legend>{{ segment.name }} · {{ Number.isInteger(segment.hits) && segment.hits > 0 ? `${segment.hits} 次命中` : '命中次数待核对' }}</legend>
      <label v-for="type in segment.manualChannels" :key="type">
        {{ labels[type] }}<input type="number" step="any" min="0" inputmode="decimal" placeholder="未填写"
          :value="modelValue[segment.id]?.[type] ?? ''" @input="update(segment.id, type, $event.target.value)">
        <small v-if="baseNote(segment, type)">{{ baseNote(segment, type) }}</small>
      </label>
    </fieldset>
  </details>
</template>

<style scoped>
.projectile-inputs { margin-top: 12px; font-size: 13px; }
.projectile-inputs summary { color:#dec996; cursor:pointer; }
.projectile-inputs p { color:#b5c6d1; }
.projectile-inputs fieldset { border:0; padding:0 0 8px; margin:8px 0; }
.projectile-inputs legend { padding:0; }
.projectile-inputs label { display:inline-flex; flex-wrap:wrap; align-items:center; gap:7px; margin:5px 12px 0 0; }
.projectile-inputs input { width:7em; }
</style>
