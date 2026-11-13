<script setup>
defineProps({ active: Boolean });
</script>

<template>
<section id="view-records" class="view reference-page" :class="{ active }">
          <div class="page-intro reference-heading"><h1>出击战绩</h1></div>
          <div id="records-empty" class="note-panel"><div><strong>读取 PC 存档查看出击战绩</strong><p>选择 NR0000.sl2，在此设备查看每次出击。</p></div></div>
          <div id="records-import-bar"><button type="button" id="battle-import">选择存档</button><input id="battle-save-file" type="file" accept=".sl2,application/octet-stream" hidden><span id="battle-save-status" role="status"></span></div>
          <div id="battle-history" hidden></div>
          <div id="records-panel" class="record-dashboard" hidden>
            <div><button id="battle-list-back" type="button">返回逐局战绩</button></div>
            <section class="record-panel"><header class="record-header"><span class="record-emblem" aria-hidden="true">♜</span><div><p class="eyebrow">RECORD / OVERVIEW</p><h2>战斗记录－概要</h2></div></header><div id="record-overview" class="record-list"></div></section>
            <div class="record-grid two"><section class="record-panel"><header class="record-header"><span class="record-emblem" aria-hidden="true">Ⅰ</span><div><p class="eyebrow">NIGHTFARERS</p><h2>渡夜者使用次数</h2></div></header><div id="record-characters" class="record-list"></div></section><section class="record-panel"><header class="record-header"><span class="record-emblem" aria-hidden="true">Ⅱ</span><div><p class="eyebrow">NIGHTLORDS</p><h2>夜王战绩</h2></div></header><div id="record-nightlords" class="record-list"></div></section></div>
            <section class="record-panel"><header class="record-header"><span class="record-emblem" aria-hidden="true">Ⅲ</span><div><p class="eyebrow">ALL EXPEDITIONS</p><h2>战斗记录－累计</h2></div></header><div class="record-grid two"><div><h3 class="record-subtitle">累计数据</h3><div id="record-total" class="record-list"></div></div><div><h3 class="record-subtitle">最高纪录</h3><div id="record-peak" class="record-list"></div></div></div></section>
            <section class="record-panel"><header class="record-header"><span class="record-emblem" aria-hidden="true">Ⅳ</span><div><p class="eyebrow">DEEP NIGHT</p><h2>战斗记录（深层区域）</h2></div></header><div class="record-grid two"><div><h3 class="record-subtitle">累计数据</h3><div id="record-deep-total" class="record-list"></div></div><div><h3 class="record-subtitle">最高纪录</h3><div id="record-deep-peak" class="record-list"></div></div></div></section>
            <p id="record-method" class="record-method"></p>
          </div>
        </section>
</template>

<style scoped>
#records-import-bar { display:flex; align-items:center; gap:12px; margin:10px 0; font-size:14px; }
#battle-import, #battle-list-back { padding:7px 14px; border:1px solid #506073; border-radius:3px; background:#1b2737; color:#e6deca; font:inherit; cursor:pointer; }
#view-records:has(#records-empty[hidden]) > .page-intro,
#view-records:has(.bh-detail:not([hidden])) > #records-import-bar { display:none; }
</style>
