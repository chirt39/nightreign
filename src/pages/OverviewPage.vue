<script setup>
defineProps({ active: Boolean });
</script>

<template>
<section id="view-overview" class="view" :class="{ active }">
          <div class="hero"><div class="hero-content"><p class="eyebrow">NIGHTFARER EXPEDITION · LIMVELD</p><h1>黑夜还没有<br><em>结束</em></h1><p class="hero-copy">选择渡夜者，探索宁姆韦德，在远征尽头迎战夜王。查阅敌人资料、解析遗物，并为下一场出击整备装配。</p><div class="hero-actions"><button class="button primary" data-go="relics">解析遗物存档 <span>↗</span></button><button class="button ghost" data-go="enemies">查阅敌人图鉴 <span>→</span></button></div></div><div class="hero-caption">LIMVELD · THREE-DAY EXPEDITION</div></div>
          <div class="section-heading"><div><p class="eyebrow">EXPEDITION DESK</p><h2>远征控制台</h2></div><p>从情报到配装，一处完成</p></div>
          <div class="feature-grid"><button class="feature-card" data-go="enemies"><img class="feature-icon-image" src="/nav-icons/bestiary.webp" alt=""><div><span class="card-kicker">01 / BESTIARY</span><h3>图鉴</h3><p>浏览敌人分类与遭遇资料，查看生命值、魔火雷圣倍率和异常抗性。</p><span class="text-link">查阅图鉴 ↗</span></div></button><button class="feature-card" data-go="relics"><img class="feature-icon-image" src="/nav-icons/relic-rite.png" alt=""><div><span class="card-kicker">02 / RELIC RITE</span><h3>遗物仪式</h3><p>解析本地游戏存档，筛选角色拥有的遗物与全部词条。</p><span class="text-link">读取存档 ↗</span></div></button><button class="feature-card" data-go="builds"><img class="feature-icon-image" src="/nav-icons/relic-equip.png" alt=""><div><span class="card-kicker">03 / RELIC EQUIPMENT</span><h3>遗物装配</h3><p>选择渡夜者与器皿，从已拥有的遗物中装配并查看组合效果。</p><span class="text-link">开始装配 ↗</span></div></button></div>
          <div class="note-panel"><span class="note-icon">i</span><div><strong>关于资料完整度</strong><p>敌人属性与抗性来自社区整理数据。遭遇位置仅显示可核对的信息；部分敌人的刷新点和场景可能不完整。</p></div></div>
        </section>
</template>
