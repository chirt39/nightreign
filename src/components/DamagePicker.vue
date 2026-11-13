<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
const props = defineProps({
  kind: {type:String, required:true}, choices: {type:Array, required:true},
  customChoices: {type:Array, default:()=>[]}, editingRelic: Object, customLimit: {type:Number, required:true}
});
const emit = defineEmits(['close','pick','custom','ritual']);
const dialog = ref(null), query = ref(''), tab = ref(props.kind === 'relic' ? 'custom' : '');
const draft = ref(props.editingRelic?.rows.map(row => ({ ...row })) || []);
const custom = computed(() => props.kind === 'relic' && tab.value === 'custom');
const titles = {weapon:'选择武器',trait:'添加武器词条',effect:'添加局内词条或临时增益',relic:'添加遗物'};
const options = computed(() => (custom.value ? props.customChoices : props.choices).filter(item =>
  `${item.name} ${item.detail || ''} ${item.id}`.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())));
watch(tab,()=>{query.value='';});
onMounted(() => dialog.value.showModal());
onBeforeUnmount(() => dialog.value?.close());
function pick(item) {
  if (!custom.value) { emit('pick', item.id); return; }
  const index = draft.value.findIndex(selected=>selected.id===item.id);
  if (index >= 0) draft.value.splice(index,1);
  else if (draft.value.length < props.customLimit) draft.value.push(item);
}
function chosen(id) { return draft.value.some(item=>item.id===id); }
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialog" class="damage-picker-dialog" aria-labelledby="damage-picker-title" @keydown.esc.stop.prevent="$emit('close')" @cancel.prevent="$emit('close')" @click="event => { if(event.target===dialog) $emit('close'); }">
      <div class="picker-frame">
        <header><h2 id="damage-picker-title">{{ editingRelic ? '编辑' + editingRelic.name : titles[kind] }}</h2><button type="button" aria-label="关闭" @click="$emit('close')">×</button></header>
        <div v-if="kind==='relic' && !editingRelic" class="picker-tabs">
          <button type="button" @click="$emit('ritual')">我的遗物 ↗</button>
          <button type="button" :aria-pressed="custom" @click="tab='custom'">自定义遗物</button>
          <button type="button" :aria-pressed="!custom" @click="tab='official'">官方遗物</button>
        </div>
        <input v-model="query" type="search" aria-label="搜索选项" :placeholder="custom ? '搜索遗物正面词条' : '搜索名称或效果'" autofocus>
        <div v-if="custom && draft.length" class="picker-chips"><button v-for="item in draft" :key="item.id" type="button" :aria-label="'移除'+item.name" @click="pick(item)">{{ item.name }} ×</button></div>
        <div class="picker-results">
          <button v-for="item in options" :key="item.id" type="button" class="picker-option" :class="{ illustrated: item.image }" :aria-pressed="custom ? chosen(item.id) : undefined" :disabled="custom ? draft.length>=customLimit && !chosen(item.id) : item.disabled" @click="pick(item)">
            <img v-if="item.image" :src="item.image" width="40" height="40" loading="lazy" alt=""><span>{{ item.name }}</span><small v-if="item.detail">{{ item.detail }}</small>
          </button>
          <p v-if="!options.length">没有匹配的选项</p>
        </div>
        <footer v-if="custom"><small>已选 {{ draft.length }} / {{ customLimit }} 个正面词条</small><button type="button" :disabled="!draft.length" @click="$emit('custom',draft)">{{ editingRelic ? '保存修改' : '添加这件遗物' }}</button></footer>
      </div>
    </dialog>
  </Teleport>
</template>
<style scoped>
.damage-picker-dialog{position:fixed;inset:0;margin:auto;width:min(530px,calc(100vw - 24px));max-width:none;max-height:none;padding:0;background:#142435;color:#e5e9eb;border:1px solid #778692;border-radius:6px;box-shadow:0 16px 70px #0009;overflow:visible}
.damage-picker-dialog::backdrop{background:#07101bc9}.picker-frame{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:16px;height:min(540px,calc(100dvh - 32px))}.picker-frame header,.picker-frame footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.picker-frame h2{font-size:18px;color:#e7d4a4;margin:0}.picker-frame button,.picker-frame input{border:1px solid #52687d;background:#192d40;color:inherit;padding:7px 10px;min-height:35px;border-radius:3px;font:inherit;font-size:13px}.picker-frame button{cursor:pointer}.picker-frame button:disabled{opacity:.48;cursor:default}.picker-frame [aria-pressed=true]{color:#f2d59f;border-color:#bb9d63;background:#293646}.picker-frame header button{font-size:20px;line-height:1}.picker-tabs,.picker-chips{display:flex;gap:6px;flex-wrap:wrap}.picker-frame input{width:100%;background:#0c1a27}.picker-results{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:5px}.picker-results p,.picker-frame small{color:#adbfcb}.picker-frame .picker-option{display:grid;text-align:left;gap:3px;flex:none}.picker-option small{font-size:12px;line-height:1.4}.picker-frame footer button{color:#f2d59f}
.picker-frame .illustrated { grid-template-columns: 40px minmax(0, 1fr); column-gap: 10px; align-items: center; }
.illustrated img { grid-row: 1 / span 2; object-fit: contain; }
.illustrated small { grid-column: 2; }
.picker-chips { max-height: min(24dvh, 125px); overflow-y: auto; }
</style>
