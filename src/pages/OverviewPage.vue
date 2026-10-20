<script setup>
defineProps({ active: Boolean });
</script>

<template>
<section id="view-overview" class="view" :class="{ active }">
          <div class="hero"><div class="hero-content"><p class="eyebrow">NIGHTFARER EXPEDITION · LIMVELD</p><h1>黑夜还没有<br><em>结束</em></h1><p class="hero-copy">选择渡夜者，探索宁姆韦德，在远征尽头迎战夜王。查阅敌人资料、解析遗物，并为下一场出击整备装配。</p><div class="hero-actions"><button class="button primary" data-go="relics">解析遗物存档 <span>↗</span></button><button class="button ghost" data-go="enemies">查阅敌人图鉴 <span>→</span></button></div></div><div class="hero-caption">LIMVELD · THREE-DAY EXPEDITION</div></div>
          <section class="home-agent panel">
            <div class="home-agent-heading"><div><p class="eyebrow">NIGHTREIGN GUIDE</p><h2>黑夜君临助手</h2><p>帮渡夜者解答黑夜君临问题。</p></div></div>
            <div id="agent-chat-log" class="agent-chat-log" role="log" aria-live="polite" aria-label="助手对话记录"><p class="agent-empty">你好，我会判断你的问题是查阅资料还是请求配装。配装时我会在对话中确认角色、供具、普通或深夜范围及配装目标；信息不清楚时会先询问。配装只使用已读取存档中的遗物。</p></div>
            <form id="agent-chat-form" class="agent-chat-form">
              <label class="agent-question-label" for="agent-question">你的问题</label>
              <textarea id="agent-question" minlength="2" maxlength="400" required placeholder="例如：追踪者的专属词条有哪些？／请只用普通遗物，为复仇者搭配偏输出的装配。"></textarea>
              <div class="agent-chat-actions"><span id="agent-question-count">0 / 400 字</span><button id="agent-send" class="button primary" type="submit">发送</button></div>
            </form>
            <p id="agent-status" class="hint" role="status" aria-live="polite">配装时只使用已读取的本机存档遗物；角色、供具或范围不明确时会先向你确认。</p>
            <div id="agent-build-result" hidden></div>
            <button id="agent-apply-build" class="button primary" type="button" hidden>应用配装到装配预览</button>
          </section>
          <div class="section-heading"><div><p class="eyebrow">EXPEDITION DESK</p><h2>远征控制台</h2></div><p>从情报到配装，一处完成</p></div>
          <div class="feature-grid"><button class="feature-card" data-go="enemies"><img class="feature-icon-image" src="/nav-icons/bestiary.webp" alt=""><div><span class="card-kicker">01 / BESTIARY</span><h3>图鉴</h3><p>浏览敌人分类与遭遇资料，查看生命值、魔火雷圣倍率和异常抗性。</p><span class="text-link">查阅图鉴 ↗</span></div></button><button class="feature-card" data-go="relics"><img class="feature-icon-image" src="/nav-icons/relic-rite.png" alt=""><div><span class="card-kicker">02 / RELIC RITE</span><h3>遗物仪式</h3><p>解析本地游戏存档，筛选角色拥有的遗物与全部词条。</p><span class="text-link">读取存档 ↗</span></div></button><button class="feature-card" data-go="builds"><img class="feature-icon-image" src="/nav-icons/relic-equip.png" alt=""><div><span class="card-kicker">03 / RELIC EQUIPMENT</span><h3>遗物装配</h3><p>选择渡夜者与器皿，从已拥有的遗物中装配并查看组合效果。</p><span class="text-link">开始装配 ↗</span></div></button></div>
          <div class="note-panel"><span class="note-icon">i</span><div><strong>关于资料完整度</strong><p>敌人属性与抗性来自社区整理数据。遭遇位置仅显示可核对的信息；部分敌人的刷新点和场景可能不完整。</p></div></div>
        </section>
</template>
