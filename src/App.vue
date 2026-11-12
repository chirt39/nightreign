<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import OverviewPage from './pages/OverviewPage.vue';
import EnemiesPage from './pages/EnemiesPage.vue';
import RelicsPage from './pages/RelicsPage.vue';
import RecordsPage from './pages/RecordsPage.vue';
import BuildsPage from './pages/BuildsPage.vue';
import SourcesPage from './pages/SourcesPage.vue';
import EffectsPage from './pages/EffectsPage.vue';
import WeaponsPage from './pages/WeaponsPage.vue';
import ArtsPage from './pages/ArtsPage.vue';
import SpellsPage from './pages/SpellsPage.vue';
import MapPredictorPage from './pages/MapPredictorPage.vue';

const labels = {
  overview: '圆桌厅堂',
  enemies: '怪物图鉴',
  weapons: '武器图鉴',
  arts: '战技',
  spells: '魔法与祷告',
  map: '地图与夜王推算',
  relics: '遗物仪式',
  records: '日志',
  builds: '遗物装配',
  effects: '词条图鉴',
  sources: '资料说明',
};
const currentView = ref(location.hash.slice(1) in labels ? location.hash.slice(1) : 'overview');
const sidebarOpen = ref(false);
const atlasPages = [
  { view: 'enemies', label: '怪物' },
  { view: 'weapons', label: '武器' },
  { view: 'arts', label: '战技' },
  { view: 'spells', label: '魔法与祷告' },
  { view: 'effects', label: '词条' },
];
const isAtlas = computed(() => atlasPages.some(page => page.view === currentView.value));
const weaponsPage = ref(null);
const artsPage = ref(null);
const scriptsReady = ref(false);
const loadError = ref(false);
const classicScriptVersions = typeof __CLASSIC_SCRIPT_VERSIONS__ === 'undefined' ? null : __CLASSIC_SCRIPT_VERSIONS__;
const catalogJsonVersions = typeof __CATALOG_JSON_VERSIONS__ === 'undefined' ? null : __CATALOG_JSON_VERSIONS__;

function setView(view, updateUrl = true, restoreScrollY = null, cardNavigation = null, sourceSnapshot = null) {
  const nextView = view in labels ? view : 'overview';
  const changed = nextView !== currentView.value;
  if (updateUrl && changed) {
    history.replaceState({
      ...history.state,
      view: currentView.value,
      scrollY: window.scrollY,
      cardNavigation: sourceSnapshot || (['relics', 'weapons'].includes(currentView.value) ? null : history.state?.cardNavigation),
    }, '', location.href);
  }
  currentView.value = nextView;
  const targetUrl = new URL(location.href);
  const hasEffectTarget = ['effectCategory', 'effectId', 'artId', 'spellId'].some(key => targetUrl.searchParams.has(key));
  if (updateUrl && (location.hash !== `#${nextView}` || cardNavigation || hasEffectTarget)) {
    targetUrl.searchParams.delete('effectCategory');
    targetUrl.searchParams.delete('effectId');
    targetUrl.searchParams.delete('artId');
    targetUrl.searchParams.delete('spellId');
    if (cardNavigation?.kind === 'art') targetUrl.searchParams.set('artId', cardNavigation.id);
    targetUrl.hash = nextView;
    const url = cardNavigation?.kind === 'effect'
      ? window.NightreignRelicEffectNavigation.url(cardNavigation)
      : targetUrl.pathname + targetUrl.search + targetUrl.hash;
    const entry = { ...history.state, view: nextView, scrollY: changed ? 0 : window.scrollY, cardNavigation };
    if (changed || cardNavigation) history.pushState(entry, '', url);
    else history.replaceState(entry, '', url);
  }
  closeMobileNavigation(true);
  if (cardNavigation) {
    nextTick(() => {
      if (cardNavigation.kind === 'weapon') weaponsPage.value?.restoreNavigation(cardNavigation);
      else if (cardNavigation.kind === 'art') artsPage.value?.restoreNavigation(cardNavigation);
      else window.NightreignRelicEffectNavigation?.restore(cardNavigation);
    });
  } else if (restoreScrollY !== null) {
    nextTick(() => window.scrollTo({ top: restoreScrollY, behavior: 'auto' }));
  } else if (changed || updateUrl) {
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    window.scrollTo({ top: 0, behavior });
  }
}

function closeMobileNavigation(returnFocus = false) {
  if (!sidebarOpen.value) return;
  sidebarOpen.value = false;
  if (returnFocus) nextTick(() => document.getElementById('mobile-menu')?.focus());
}

function handleGlobalKeydown(event) {
  if (event.key !== 'Escape' || !sidebarOpen.value) return;
  event.preventDefault();
  closeMobileNavigation(true);
}

function handleShellClick(event) {
  if (event.defaultPrevented) return;
  if (event.target.closest('#mobile-menu')) {
    sidebarOpen.value = !sidebarOpen.value;
    return;
  }
  const hashLink = event.target.closest('a[href^="#"]');
  if (hashLink && !hashLink.matches('[data-view], [data-go]')) {
    const view = hashLink.getAttribute('href').slice(1);
    if (view in labels) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      setView(view);
      return;
    }
  }
  const target = event.target.closest('[data-view], [data-go]');
  if (!target) return;
  const view = target.dataset.view || target.dataset.go;
  if (typeof window.navigateTo === 'function') window.navigateTo(view);
  else setView(view);
}

function handleNavigation(event) {
  setView(event.detail?.view, true, null, event.detail?.cardNavigation, event.detail?.source);
}

let restoredHistoryUrl = '';
function handleHashChange() {
  if (restoredHistoryUrl === location.href) {
    restoredHistoryUrl = '';
    return;
  }
  restoredHistoryUrl = '';
  if (location.hash === '#main-content') return;
  setView(location.hash.slice(1), false);
}

function handlePopState(event) {
  restoredHistoryUrl = location.href;
  if (location.hash === '#main-content') {
    const view = event.state?.view in labels ? event.state.view : currentView.value;
    setView(view, false, Number.isFinite(event.state?.scrollY) ? event.state.scrollY : 0);
    return;
  }
  setView(location.hash.slice(1), false, Number.isFinite(event.state?.scrollY) ? event.state.scrollY : 0, event.state?.cardNavigation);
}

function loadClassicScript(file) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `/${file}`;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`${file} 加载失败`));
    document.body.append(script);
  });
}

onMounted(async () => {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  history.replaceState({ ...history.state, view: currentView.value, scrollY: window.scrollY }, '', location.href);
  if (!classicScriptVersions) {
    console.error('动态脚本版本配置缺失，页面功能无法启动。');
    loadError.value = true;
    return;
  }
  if (!catalogJsonVersions || typeof catalogJsonVersions !== 'object') {
    console.error('图鉴数据版本配置缺失，页面功能无法启动。');
    loadError.value = true;
    return;
  }
  window.NIGHTREIGN_CATALOG_VERSIONS = catalogJsonVersions;
  for (const [file, version] of Object.entries(classicScriptVersions)) {
    if (!version) {
      window.NIGHTREIGN_AI_API_BASE = window.NIGHTREIGN_AI_API_BASE || '';
      console.warn('AI API 配置脚本缺失，已使用当前站点默认 API 地址。');
      continue;
    }
    try {
      await loadClassicScript(`${file}?v=${version}`);
    } catch {
      if (file === 'ai-config.js') {
        window.NIGHTREIGN_AI_API_BASE = window.NIGHTREIGN_AI_API_BASE || '';
        console.warn('AI API 配置脚本未加载，将使用当前站点默认 API 地址；若 AI 服务不可用，对话界面会显示错误。');
        continue;
      }
      loadError.value = true;
      return;
    }
  }
  window.addEventListener('nightreign:navigate', handleNavigation);
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('popstate', handlePopState);
  document.addEventListener('keydown', handleGlobalKeydown);
  scriptsReady.value = true;
});

onUnmounted(() => {
  window.removeEventListener('nightreign:navigate', handleNavigation);
  window.removeEventListener('hashchange', handleHashChange);
  window.removeEventListener('popstate', handlePopState);
  document.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
  <main v-if="loadError" class="app-load-error" role="alert" tabindex="-1">
    <h1>页面未能完整加载</h1>
    <p>必要功能暂时无法启动，请刷新页面重试。</p>
  </main>
  <div v-else class="app-shell" :class="{ 'reference-pages': currentView !== 'sources', 'enemies-fullscreen': currentView === 'enemies', 'weapons-fullscreen': currentView === 'weapons', 'map-fullscreen': currentView === 'map', 'ability-fullscreen': currentView === 'arts' || currentView === 'spells' }" :inert="!scriptsReady" :aria-busy="!scriptsReady" @click="handleShellClick">
    <a class="skip-link" href="#main-content">跳转到主要内容</a>
    <aside id="mobile-navigation" class="sidebar" :class="{ open: sidebarOpen }" aria-label="主导航">
      <a class="brand" href="#overview" aria-label="渡夜图鉴首页">
        <img class="brand-image" src="/nightreign-banner.png" alt="ELDEN RING NIGHTREIGN" />
        <span class="brand-caption">渡夜图鉴</span>
      </a>
      <div class="side-divider"></div>
      <p class="side-label">探索</p>
      <nav class="nav-list">
        <button class="nav-link" :class="{ active: currentView === 'overview' }" :aria-current="currentView === 'overview' ? 'page' : null" data-view="overview"><img class="nav-icon" src="/nav-icons/roundtable.webp" alt="" />圆桌厅堂</button>
        <button class="nav-link" :class="{ active: isAtlas }" :aria-current="isAtlas ? 'page' : null" data-view="enemies"><img class="nav-icon" src="/nav-icons/bestiary.webp" alt="" />图鉴</button>
        <button class="nav-link" :class="{ active: currentView === 'map' }" :aria-current="currentView === 'map' ? 'page' : null" data-view="map"><span class="nav-icon map-nav-icon" aria-hidden="true">◇</span>地图与夜王推算</button>
        <button class="nav-link" :class="{ active: currentView === 'relics' }" :aria-current="currentView === 'relics' ? 'page' : null" data-view="relics"><img class="nav-icon" src="/nav-icons/relic-rite.png" alt="" />遗物仪式</button>
        <button class="nav-link" :class="{ active: currentView === 'records' }" :aria-current="currentView === 'records' ? 'page' : null" data-view="records"><img class="nav-icon" src="/nav-icons/journal.png" alt="" />日志</button>
        <button class="nav-link" :class="{ active: currentView === 'builds' }" :aria-current="currentView === 'builds' ? 'page' : null" data-view="builds"><img class="nav-icon" src="/nav-icons/relic-equip.png" alt="" />遗物装配</button>
        <button class="nav-link" :class="{ active: currentView === 'sources' }" :aria-current="currentView === 'sources' ? 'page' : null" data-view="sources"><img class="nav-icon" src="/nav-icons/sources.png" alt="" />资料说明</button>
      </nav>
      <div class="side-bottom"><a class="side-license-link" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">浙ICP备2026092550号-1</a></div>
    </aside>

    <main id="main-content" class="main" tabindex="-1">
      <header class="topbar">
        <button id="mobile-menu" class="icon-button" type="button" :aria-label="sidebarOpen ? '关闭导航' : '打开导航'" :aria-expanded="sidebarOpen" aria-controls="mobile-navigation">☰</button>
        <span class="breadcrumb">ELDEN RING NIGHTREIGN <span>/</span> <b>{{ labels[currentView] }}</b></span>
        <div class="topbar-tools">
          <button id="feedback-suggestion-open" class="button ghost topbar-feedback" type="button">向我提建议</button>
        </div>
      </header>
      <div class="content">
        <nav v-show="isAtlas" class="atlas-navigation" aria-label="图鉴分类">
          <a v-for="page in atlasPages" :key="page.view" :href="`#${page.view}`" :aria-current="currentView === page.view ? 'page' : null">{{ page.label }}</a>
        </nav>
        <OverviewPage :active="currentView === 'overview'" />
        <EnemiesPage :active="currentView === 'enemies'" />
        <WeaponsPage ref="weaponsPage" :active="currentView === 'weapons'" :catalog-versions="catalogJsonVersions" />
        <ArtsPage ref="artsPage" :active="currentView === 'arts'" :catalog-versions="catalogJsonVersions" />
        <SpellsPage :active="currentView === 'spells'" :catalog-versions="catalogJsonVersions" />
        <MapPredictorPage :active="currentView === 'map'" :catalog-versions="catalogJsonVersions" />
        <RelicsPage :active="currentView === 'relics'" />
        <RecordsPage :active="currentView === 'records'" />
        <BuildsPage :active="currentView === 'builds'" />
        <EffectsPage :active="currentView === 'effects'" />
        <SourcesPage :active="currentView === 'sources'" />
      </div>
      <div id="feedback-background-status" class="feedback-background-status" role="status" aria-live="polite" aria-relevant="additions text"></div>
    </main>
  </div>
</template>

<style>
.atlas-navigation{display:flex;flex:0 0 auto;align-items:center;gap:5px;min-width:0;max-width:100%;margin:0 0 12px;padding:0 0 8px;border-bottom:1px solid #3e566e;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin}
.atlas-navigation a{display:flex;flex:0 0 auto;align-items:center;gap:7px;min-height:38px;padding:7px 14px;border:1px solid transparent;border-radius:4px;background:#172638;color:#b8c9d4;white-space:nowrap;font-size:14px}
.atlas-navigation a:hover{border-color:#536c82;color:#e7d5ac}
.atlas-navigation a[aria-current=page]{border-color:#8f7a50;background:#2b3b45;color:#efdcaa}
@media(min-width:851px){
.app-shell.ability-fullscreen>.main{display:flex;height:100dvh;flex-direction:column;overflow:hidden}
.app-shell.ability-fullscreen>.main>.content{display:flex;flex:1;flex-direction:column;min-height:0;overflow:hidden}
}
@media(max-width:850px){.atlas-navigation{gap:4px;margin-bottom:12px}.atlas-navigation a{min-height:36px;padding:6px 11px;font-size:13px}}
</style>
