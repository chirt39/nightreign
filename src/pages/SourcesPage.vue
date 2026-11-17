<script setup>
import { computed, ref } from 'vue';

defineProps({ active: Boolean });
const category = ref('all');
const categories = [
  ['all', '全部'], ['native', '游戏数据与图标'], ['atlas', '怪物与装备图鉴'],
  ['relics', '遗物与词条'], ['map', '地图与共鸣结晶'], ['save', '存档与战果回放'], ['license', '开源与许可'],
];
const docs = (file) => `https://github.com/chirt39/nightreign/blob/main/docs/${file}.md`;
const sources = [
  { id: 'native', title: '游戏参数与中文文本', type: '游戏原生数据', groups: ['native', 'atlas', 'relics'],
    description: '武器变体、强化、战技与法术说明，以及已核对的攻击段、特殊效果和遗物生成规则，来自本作参数与中文文本。',
    links: [['武器数据', docs('WEAPON_DATA')], ['战技与法术', docs('ARTS_SPELLS')], ['遗物检测依据', docs('RELIC_LEGALITY')]] },
  { id: 'native-images', title: '游戏图标与模型', type: '游戏原生素材', groups: ['native', 'atlas', 'map'],
    description: '武器、战技、法术、夜王和建筑图标取自游戏图集；部分怪物头像使用本地游戏模型渲染。图片逐项保留对应与来源记录。',
    links: [['图标来源', docs('NAVIGATION_ICON_SOURCES')], ['怪物图片台账', docs('ENEMY_IMAGES')]] },
  { id: 'native-map', title: '地图配置与共鸣结晶', type: '游戏原生数据', groups: ['native', 'map'],
    description: '地图方案、据点、野外精英和结晶位置按游戏场景、地图标记及事件配置核对。底图由原生地图瓦片拼接，结晶推算使用游戏中的四组配置。',
    links: [['地图依据', docs('MAP_DATA')], ['底图与坐标', docs('MAP_ASSETS')]] },
  { id: 'wiki', title: '夜之数据 Wiki', type: '社区资料', groups: ['atlas', 'relics'],
    description: '怪物基础属性、受伤倍率、异常抗性和部分中文词条的既有来源。新增地点与后续修正另按本作数据核对。',
    links: [['查看原站', 'https://yanweiyuan3.github.io/nightreign-wiki/#/overview']] },
  { id: 'quickref', title: 'NightreignQuickRef', type: '社区资料 · GPLv3', groups: ['relics', 'license'],
    description: '补充词条中文说明、分类及叠加规则。本站使用的资料快照与后续原生修正分别留档。',
    links: [['黑夜君临速查手册', 'https://xxiixi.github.io/NightreignQuickRef/'], ['GPLv3 许可', '/NightreignQuickRef_LICENSE.txt']] },
  { id: 'biligame', title: 'Biligame Wiki', type: '名称与图片参考', groups: ['atlas', 'relics'],
    description: '对照遗物中文名、图标和渡夜者图片；部分怪物使用《艾尔登法环》Wiki 的外观资料参考，具体对应保留在图片台账中。',
    links: [['遗物总览', 'https://wiki.biligame.com/nightreign/遗物总览'], ['渡夜者总览', 'https://wiki.biligame.com/nightreign/渡夜者总览'], ['怪物图片依据', docs('ENEMY_IMAGES')]] },
  { id: '5gamers', title: '5gamers', type: '遗物资料补充', groups: ['relics'],
    description: '补充「老旧怀表」与「恶兆妖鬼的诅咒物」的中文名称及图片，作为原遗物总览未收录条目的来源。',
    links: [['老旧怀表', 'https://5gamers.com/zh-CN/elden-ring-nightreign/item/old-pocketwatch'], ['恶兆妖鬼的诅咒物', 'https://5gamers.com/zh-CN/elden-ring-nightreign/item/fell-omen-fetish']] },
  { id: 'gamersky', title: '游民星空', type: '供具名称参考', groups: ['relics'],
    description: '供具中文类型与颜色栏位资料用于遗物装配页面的名称对照。',
    links: [['供具资料', 'https://www.gamersky.com/handbook/202506/1937870.shtml']] },
  { id: 'official', title: 'Bandai Namco', type: '官方图片与更新说明', groups: ['atlas', 'map'],
    description: '隐士的角色图片来自官方角色页；地图方案涉及的 DLC 参与条件参考官方更新说明。',
    links: [['官方角色页', 'https://en.bandainamcoent.eu/elden-ring/elden-ring-nightreign/characters'], ['1.03.1 更新说明', 'https://en.bandainamcoent.eu/elden-ring/news/elden-ring-nightreign-patch-notes-version-1031']] },
  { id: 'replay', title: '存档记录与游戏事件文本', type: '本项目解析与核对', groups: ['save'],
    description: '逐局时间、队员、装备、战果与行动轨迹读取该局存档记录，事件名称对照游戏文本。摘要与明细按记录编号关联，只有摘要的记录展示概要。',
    links: [['逐局战果依据', docs('BATTLE_HISTORY')]] },
  { id: 'forge', title: 'ERN_RelicForge', type: '开源代码 · MIT', groups: ['save', 'relics', 'license'],
    description: '存档解密、遗物识别与装配推荐的基础实现。本站的逐局战果解析和回放另行核对与实现。',
    links: [['原项目', 'https://github.com/cetusk/ERN_RelicForge'], ['MIT 许可', '/ERN_RelicForge_LICENSE.txt']] },
  { id: 'smithbox', title: 'Smithbox', type: '工具与配置参考', groups: ['map', 'license'],
    description: '社区地图别名、英文配置名和字段定义用于本作数据的提取与比对。游戏数值仍以对应的原生记录为依据。',
    links: [['采用版本', 'https://github.com/vawser/Smithbox/tree/610d3412c1d9433749720eab9739f8911b1b8fe9/src/Smithbox.Data/Assets'], ['许可记录', 'https://github.com/chirt39/nightreign/blob/main/scripts/data/Smithbox-LICENSE.txt']] },
];
const visibleSources = computed(() => sources.filter(source => category.value === 'all' || source.groups.includes(category.value)));
</script>

<template>
  <section id="view-sources" class="view reference-page" :class="{ active }">
    <header class="sources-heading">
      <h1>资料说明</h1><p>按用途查阅资料来源、核对依据与开源许可。</p>
    </header>
    <nav class="sources-nav" aria-label="资料来源分类">
      <button v-for="[id, label] in categories" :key="id" type="button" :aria-pressed="category === id" :class="{ selected: category === id }" @click="category = id">{{ label }}</button>
    </nav>
    <div class="sources-cards">
      <article v-for="source in visibleSources" :key="source.id" class="sources-card">
        <header><p>{{ source.type }}</p><h2>{{ source.title }}</h2></header>
        <p class="source-description">{{ source.description }}</p>
        <div class="sources-links">
          <a v-for="[label, url] in source.links" :key="url" :href="url" target="_blank" rel="noopener noreferrer">{{ label }} <span aria-hidden="true">↗</span></a>
        </div>
      </article>
    </div>
    <div class="sources-notes">
      <p>游戏名称、图标与美术素材归各自权利人所有；开源代码与资料按各自许可使用。本站为玩家制作的非官方工具。</p>
      <a :href="docs('DATA')" target="_blank" rel="noopener noreferrer">完整来源与版本记录 ↗</a>
    </div>
  </section>
</template>

<style scoped>
.sources-heading{display:flex;align-items:baseline;gap:8px 16px;flex-wrap:wrap;margin:0 0 12px}
.sources-heading h1{margin:0;color:#ecd7a7;font:600 28px/1.35 'Noto Serif SC',serif}
.sources-heading p{margin:0;color:#b6c7d2;font-size:14px;line-height:1.6}
.sources-nav{display:flex;gap:8px;padding:12px;margin-bottom:12px;border:1px solid #3e566e;border-radius:5px;background:#132131;overflow-x:auto}
.sources-nav button{flex-shrink:0;min-height:40px;padding:7px 12px;border:1px solid #536c82;border-radius:4px;background:#1b2d40;color:#e7d5ac;font-size:14px;white-space:nowrap}
.sources-nav button:hover{border-color:#bda56e}
.sources-nav button.selected{background:#2b3b43;border-color:#d5ab67;color:#f5d18d}
.sources-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.sources-card{display:flex;flex-direction:column;min-width:0;padding:18px;border:1px solid #3e566e;border-radius:5px;background:#172739}
.sources-card header p{margin:0 0 6px;color:#a8bccb;font-size:12px}
.sources-card h2{margin:0;color:#ecd7a7;font-size:18px;line-height:1.5}
.source-description{margin:12px 0 16px;color:#c1d0dc;font-size:14px;line-height:1.85;overflow-wrap:anywhere}
.sources-links{display:flex;gap:8px 16px;flex-wrap:wrap;margin-top:auto;padding-top:12px;border-top:1px solid #314759}
.sources-links a,.sources-notes a{color:#e7d5ac;font-size:13px;line-height:1.7;overflow-wrap:anywhere}
.sources-links a:hover,.sources-notes a:hover{color:#f5d18d;text-decoration:underline;text-underline-offset:3px}
.sources-notes{display:flex;align-items:baseline;gap:8px 20px;flex-wrap:wrap;margin-top:16px;padding:12px 0;border-top:1px solid #314759}
.sources-notes p{margin:0;color:#a8bccb;font-size:12px;line-height:1.8}
@media(max-width:1250px){.sources-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:700px){.sources-heading{align-items:flex-start;flex-direction:column;gap:5px}.sources-heading h1{font-size:24px}.sources-heading p{font-size:13px}.sources-cards{grid-template-columns:minmax(0,1fr)}.sources-card{padding:16px}.sources-nav{padding:10px}}
</style>
