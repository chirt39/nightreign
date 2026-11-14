<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue';

const dialog = ref(null);
const subject = ref('');
const reasons = ref([]);
let origin = null;

async function open(title, messages) {
  if (!messages?.length) return;
  subject.value = title;
  reasons.value = [...new Set(messages)];
  if (dialog.value.open) return;
  const root = document.documentElement;
  origin = {
    element: document.activeElement, x: window.scrollX, y: window.scrollY,
    overflow: root.style.overflow, gutter: root.style.scrollbarGutter,
  };
  root.style.scrollbarGutter = 'stable';
  root.style.overflow = 'hidden';
  await nextTick();
  dialog.value.showModal();
}
function restorePosition() {
  if (!origin) return;
  const saved = origin;
  origin = null;
  document.documentElement.style.overflow = saved.overflow;
  document.documentElement.style.scrollbarGutter = saved.gutter;
  if (saved.element?.isConnected) saved.element.focus({ preventScroll: true });
  window.scrollTo({ left: saved.x, top: saved.y, behavior: 'instant' });
}
function close() { dialog.value?.close(); }
onBeforeUnmount(restorePosition);
defineExpose({ open, close });
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="relic-anomaly-dialog" aria-labelledby="relic-anomaly-title" @close="restorePosition" @click="($event.target === dialog) && close()">
      <header>
        <h2 id="relic-anomaly-title">异常原因</h2>
        <button type="button" aria-label="关闭异常说明" autofocus @click="close">×</button>
      </header>
      <div class="anomaly-dialog-content">
        <p v-if="subject" class="anomaly-subject">{{ subject }}</p>
        <ul><li v-for="reason in reasons" :key="reason">{{ reason }}</li></ul>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.relic-anomaly-dialog{width:min(520px,calc(100vw - 24px));max-height:calc(100dvh - 32px);padding:0;border:1px solid #a99162;border-radius:5px;background:#152637;color:#dce6e9;box-shadow:0 24px 80px #0009;overflow:hidden}
.relic-anomaly-dialog[open]{display:flex;flex-direction:column}
.relic-anomaly-dialog::backdrop{background:#050b14bb}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px;border-bottom:1px solid #3e566e;flex-shrink:0}
h2{margin:0;color:#e7d5ac;font:600 19px/1.5 'Noto Sans SC',sans-serif}
header button{width:40px;height:40px;flex-shrink:0;border:1px solid #536c82;border-radius:4px;background:#1b2d40;color:#e7d5ac;font:26px/1 sans-serif;cursor:pointer}
.anomaly-dialog-content{padding:16px 20px;overflow:auto;overscroll-behavior:contain;min-height:0;overflow-wrap:anywhere;font-size:14px;line-height:1.8}
.anomaly-subject{margin:0 0 12px;color:#e7d5ac;font-weight:600}
ul{margin:0;padding-left:20px}li+li{margin-top:10px}
button:focus-visible{outline:1px solid #91a5ba;outline-offset:2px}
@media(max-width:600px){header{padding:10px 14px}.anomaly-dialog-content{padding:14px}}
</style>
