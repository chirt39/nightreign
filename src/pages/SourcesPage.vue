<script setup>
defineProps({ active: Boolean });

const sources = [
  { title: '小辛 · B站 UP主', description: '整理并分享《黑夜君临》资料，本站多项资料参考了她的整理成果。', links: [] },
  { title: '夜之数据 Wiki', description: '怪物基础属性、受伤倍率、异常抗性，以及部分中文词条。',
    links: [['访问原站', 'https://yanweiyuan3.github.io/nightreign-wiki/#/overview']] },
  { title: 'NightreignQuickRef', description: '词条中文说明、分类与叠加规则的补充参考。',
    links: [['访问原站', 'https://xxiixi.github.io/NightreignQuickRef/']] },
  { title: 'Biligame Wiki', description: '遗物中文名、图标、渡夜者图片，以及部分怪物的外观参考。',
    links: [['遗物总览', 'https://wiki.biligame.com/nightreign/遗物总览'], ['渡夜者总览', 'https://wiki.biligame.com/nightreign/渡夜者总览']] },
  { title: 'ERN_RelicForge', description: '存档解密、遗物识别与装配推荐的开源基础实现。',
    links: [['访问原项目', 'https://github.com/cetusk/ERN_RelicForge']] },
  { title: 'Smithbox', description: '用于游戏数据提取与比对的工具、地图别名及配置参考。',
    links: [['访问原项目', 'https://github.com/vawser/Smithbox']] },
];
</script>

<template>
  <section id="view-sources" class="view reference-page" :class="{ active }">
    <header class="sources-heading"><h1>资料说明</h1></header>
    <p class="sources-intro">武器、战技、法术、地图与部分图标来自本作游戏数据；战绩与回放读取导入的存档。其他资料参考以下整理者、网站与开源项目。</p>
    <div class="sources-cards">
      <article v-for="source in sources" :key="source.title" class="sources-card">
        <h2>{{ source.title }}</h2>
        <p>{{ source.description }}</p>
        <div v-if="source.links.length" class="sources-links">
          <a v-for="[label, url] in source.links" :key="url" :href="url" target="_blank" rel="noopener noreferrer">{{ label }} <span aria-hidden="true">↗</span></a>
        </div>
      </article>
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
.sources-links{display:flex;gap:6px 18px;flex-wrap:wrap}
.sources-links{margin-top:auto}
.sources-links a{color:#e7d5ac;font-size:13px;line-height:1.7;overflow-wrap:anywhere}
.sources-links a:hover{color:#f5d18d;text-decoration:underline;text-underline-offset:3px}
@media(max-width:700px){.sources-heading h1{font-size:24px}.sources-intro{font-size:13px}.sources-cards{grid-template-columns:minmax(0,1fr)}.sources-card{padding:14px 16px}}
</style>
