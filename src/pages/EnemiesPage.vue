<script setup>
defineProps({ active: Boolean });
</script>

<template>
<section id="view-enemies" class="view reference-page" :class="{ active }">
          <div class="page-intro reference-heading"><p class="eyebrow">BESTIARY / MONSTER ARCHIVE</p><h1>怪物图鉴</h1><p>按名称、分类、区域或遭遇 ID 筛选敌人，查看伤害倍率、异常抗性与韧性等属性。</p></div>
          <div class="toolbar"><label class="search-field"><span>⌕</span><input id="enemy-search" type="search" placeholder="搜索怪物名称、ID 或分类" autocomplete="off"></label><select id="enemy-filter" aria-label="怪物分类"><option value="all">全部敌人</option></select><select id="enemy-area" aria-label="出现区域与遭遇"><option value="all">全部区域 / 遭遇</option></select><span class="result-count" id="enemy-count">载入中…</span></div>
          <div class="enemy-layout"><div class="enemy-list-column"><div class="enemy-list" id="enemy-list" aria-label="怪物列表"></div><div id="enemy-pagination" class="pagination enemy-pagination" aria-label="怪物页数" hidden></div></div><article class="enemy-detail" id="enemy-detail"><div class="empty-state"><span>⚔</span><h3>选择一名敌人</h3><p>属性、抗性和可核对的出现位置会显示在这里。</p></div></article></div>
        </section>
</template>

<style scoped>
#enemy-detail :deep(.enemy-encounter-members){margin-top:16px;padding-top:12px;border-top:1px solid #3e566e}
#enemy-detail :deep(.enemy-encounter-members h3){margin:0;color:#e7d5ac;font-size:15px}
#enemy-detail :deep(.enemy-encounter-members ul){display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:8px;list-style:none;padding:0;margin:10px 0 0}
#enemy-detail :deep(.enemy-encounter-members li){display:flex;align-items:baseline;justify-content:space-between;gap:8px;min-width:0;padding:10px;border:1px solid #40536b;border-radius:3px;background:#1a2a3d;font-size:14px;line-height:1.65}
#enemy-detail :deep(.enemy-encounter-members li>:first-child){min-width:0;overflow-wrap:anywhere}
#enemy-detail :deep(.enemy-encounter-members li>:nth-child(2)){flex-shrink:0;color:#a5b8c8}
#enemy-detail :deep(.enemy-encounter-members a){color:#e7d5ac;text-decoration:underline;text-underline-offset:3px}
#enemy-detail :deep(.enemy-encounter-members a:hover){color:#f0d69f}
#enemy-detail :deep(.enemy-encounter-members p){color:#afc1ce;font-size:13px}
</style>
