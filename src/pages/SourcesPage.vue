<script setup>
defineProps({ active: Boolean });

const sources = [
  { title: '夜之数据 Wiki', description: '怪物基础属性、受伤倍率、异常抗性，以及部分中文词条。',
    links: [['访问原站', 'https://yanweiyuan3.github.io/nightreign-wiki/#/overview']] },
  { title: 'NightreignQuickRef', description: '词条中文说明、分类与叠加规则的补充参考。',
    links: [['访问原站', 'https://xxiixi.github.io/NightreignQuickRef/']] },
  { title: 'Biligame Wiki', description: '遗物中文名、图标、渡夜者图片，以及部分怪物的外观参考。',
    links: [['遗物总览', 'https://wiki.biligame.com/nightreign/遗物总览'], ['渡夜者总览', 'https://wiki.biligame.com/nightreign/渡夜者总览']] },
  { title: '5gamers', description: '补充老旧怀表与恶兆妖鬼的诅咒物的中文名和图片。',
    links: [['老旧怀表', 'https://5gamers.com/zh-CN/elden-ring-nightreign/item/old-pocketwatch'], ['恶兆妖鬼的诅咒物', 'https://5gamers.com/zh-CN/elden-ring-nightreign/item/fell-omen-fetish']] },
  { title: '游民星空', description: '供具中文类型与遗物颜色栏位的资料参考。',
    links: [['访问原站', 'https://www.gamersky.com/handbook/202506/1937870.shtml']] },
  { title: 'Bandai Namco', description: '隐士的官方角色图片，以及地图相关的 DLC 参与条件说明。',
    links: [['官方角色页', 'https://en.bandainamcoent.eu/elden-ring/elden-ring-nightreign/characters'], ['官方更新说明', 'https://en.bandainamcoent.eu/elden-ring/news/elden-ring-nightreign-patch-notes-version-1031']] },
  { title: 'ERN_RelicForge', description: '存档解密、遗物识别与装配推荐的开源基础实现。',
    links: [['访问原项目', 'https://github.com/cetusk/ERN_RelicForge']] },
  { title: 'Smithbox', description: '用于游戏数据提取与比对的工具、地图别名及配置参考。',
    links: [['访问原项目', 'https://github.com/vawser/Smithbox']] },
];
</script>

<template>
  <section id="view-sources" class="view reference-page" :class="{ active }">
    <header class="sources-heading"><h1>资料说明</h1></header>
    <p class="sources-intro">武器、战技、法术、地图与部分图标来自本作游戏数据；战绩与回放读取导入的存档。其他资料参考以下网站。</p>
    <div class="sources-cards">
      <article v-for="source in sources" :key="source.title" class="sources-card">
        <h2>{{ source.title }}</h2>
        <p>{{ source.description }}</p>
        <div class="sources-links">
          <a v-for="[label, url] in source.links" :key="url" :href="url" target="_blank" rel="noopener noreferrer">{{ label }} <span aria-hidden="true">↗</span></a>
        </div>
      </article>
    </div>
    <div class="sources-notes">
      <p>本站为玩家制作的非官方工具。游戏名称、图标与美术素材归各自权利人所有。</p>
      <div class="sources-licenses" aria-label="开源许可">
        <a href="/ERN_RelicForge_LICENSE.txt" target="_blank" rel="noopener noreferrer">ERN_RelicForge · MIT ↗</a>
        <a href="/NightreignQuickRef_LICENSE.txt" target="_blank" rel="noopener noreferrer">NightreignQuickRef · GPLv3 ↗</a>
        <a href="https://github.com/chirt39/nightreign/blob/main/scripts/data/Smithbox-LICENSE.txt" target="_blank" rel="noopener noreferrer">Smithbox 许可 ↗</a>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sources-heading{margin:0 0 12px}
.sources-heading h1{margin:0;color:#ecd7a7;font:600 28px/1.35 'Noto Serif SC',serif}
.sources-intro{margin:0 0 16px;color:#b6c7d2;font-size:14px;line-height:1.8}
.sources-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.sources-card{display:flex;flex-direction:column;min-width:0;padding:16px 18px;border:1px solid #3e566e;border-radius:5px;background:#172739}
.sources-card h2{margin:0;color:#ecd7a7;font-size:18px;line-height:1.5;overflow-wrap:anywhere}
.sources-card p{margin:6px 0 10px;color:#c1d0dc;font-size:14px;line-height:1.8;overflow-wrap:anywhere}
.sources-links,.sources-licenses{display:flex;gap:6px 18px;flex-wrap:wrap}
.sources-links{margin-top:auto}
.sources-links a{color:#e7d5ac;font-size:13px;line-height:1.7;overflow-wrap:anywhere}
.sources-links a:hover,.sources-licenses a:hover{color:#f5d18d;text-decoration:underline;text-underline-offset:3px}
.sources-notes{margin-top:16px;padding-top:12px;border-top:1px solid #314759}
.sources-notes p{margin:0 0 6px;color:#a8bccb;font-size:12px;line-height:1.8}
.sources-licenses a{color:#a8bccb;font-size:12px;line-height:1.8;overflow-wrap:anywhere}
@media(max-width:700px){.sources-heading h1{font-size:24px}.sources-intro{font-size:13px}.sources-cards{grid-template-columns:minmax(0,1fr)}.sources-card{padding:14px 16px}}
</style>
