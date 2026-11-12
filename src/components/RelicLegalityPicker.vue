<script setup>
import { computed, ref, useId } from 'vue';
const props = defineProps({
  modelValue: { default: null },
  options: { type: Array, default: () => [] },
  label: { type: String, required: true },
});
const emit = defineEmits(['update:modelValue']);
const details = ref(null);
const query = ref('');
const inputId = useId();
const selected = computed(() => props.options.find(option => String(option.id) === String(props.modelValue)));
const eligible = computed(() => {
  const search = query.value.trim().toLocaleLowerCase();
  return props.options.filter(option => !search || `${option.name} ${option.id}`.toLocaleLowerCase().includes(search));
});
function choose(id) {
  emit('update:modelValue', id);
  details.value.open = false;
  query.value = '';
  details.value.querySelector('summary').focus();
}
</script>

<template>
  <div class="legality-picker">
    <span class="picker-label">{{ label }}</span>
    <details ref="details">
      <summary :aria-label="`${label}：${selected ? selected.name : modelValue != null ? '#' + modelValue : '空位'}`">
        <span>{{ selected ? selected.name : modelValue != null ? '#' + modelValue : '空位' }}<small v-if="selected">#{{ selected.id }}</small></span>
      </summary>
      <div class="picker-menu">
        <label :for="inputId">搜索名称或 ID</label>
        <input :id="inputId" v-model="query" type="search" placeholder="输入名称或 ID" autocomplete="off">
        <button type="button" class="clear-option" @click="choose(null)">保留空位</button>
        <p class="picker-count">{{ eligible.length }} 项匹配<span v-if="eligible.length > 80">，显示前 80 项，请缩小搜索范围</span></p>
        <div class="picker-options" :aria-label="label + '候选项'">
          <button v-for="option in eligible.slice(0, 80)" :key="option.id" type="button" :aria-pressed="String(modelValue) === String(option.id)" @click="choose(option.id)">
            <span>{{ option.name }}</span><small>#{{ option.id }}</small>
          </button>
        </div>
        <p v-if="!eligible.length" class="picker-count">没有匹配项，可修改搜索条件。</p>
      </div>
    </details>
  </div>
</template>

<style scoped>
.legality-picker{min-width:0}.picker-label{display:block;margin-bottom:5px;color:#c7d3da;font-size:13px}details{min-width:0}summary{min-height:40px;padding:8px 10px;border:1px solid #4c657b;border-radius:4px;background:#101d2a;cursor:pointer;color:#e0e7e9;font-size:13px;overflow-wrap:anywhere}summary>span{display:inline}small{margin-left:8px;color:#a5b8c8;font-size:11px}.picker-menu{padding:10px;border:1px solid #4c657b;border-top:0;border-radius:0 0 4px 4px;background:#152438}.picker-menu>label{display:block;color:#c7d3da;font-size:12px}.picker-menu>input{box-sizing:border-box;min-height:38px;width:100%;min-width:0;margin:5px 0 8px;padding:7px 9px;border:1px solid #536c82;border-radius:3px;background:#101d2a;color:#e0e7e9}.picker-options{display:grid;gap:4px;max-height:260px;overflow:auto}.picker-options button,.clear-option{width:100%;padding:8px 9px;border:1px solid #425a70;border-radius:3px;background:#1b2d40;color:#e7e1d3;cursor:pointer;text-align:left;font:inherit;font-size:13px;overflow-wrap:anywhere}.picker-options button[aria-pressed=true]{border-color:#d3b77b;background:#2b3b45}.picker-options button:hover,.clear-option:hover{border-color:#91a5ba}.picker-count{margin:8px 0;color:#a5b8c8;font-size:12px}button:focus-visible,summary:focus-visible,input:focus-visible{outline:1px solid #91a5ba;outline-offset:2px}
</style>
