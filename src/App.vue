<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import OverviewPage from './pages/OverviewPage.vue';
import EnemiesPage from './pages/EnemiesPage.vue';
import RelicsPage from './pages/RelicsPage.vue';
import RecordsPage from './pages/RecordsPage.vue';
import BuildsPage from './pages/BuildsPage.vue';
import SourcesPage from './pages/SourcesPage.vue';

const labels = {
  overview: '圆桌厅堂',
  enemies: '图鉴',
  relics: '遗物仪式',
  records: '日志',
  builds: '遗物装配',
  sources: '资料说明',
};
const currentView = ref(location.hash.slice(1) in labels ? location.hash.slice(1) : 'overview');
const sidebarOpen = ref(false);

function setView(view, updateUrl = true) {
  currentView.value = view in labels ? view : 'overview';
  if (updateUrl) history.replaceState(null, '', `#${currentView.value}`);
  sidebarOpen.value = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleShellClick(event) {
  if (event.target.closest('#mobile-menu')) {
    sidebarOpen.value = !sidebarOpen.value;
    return;
  }
  const target = event.target.closest('[data-view], [data-go]');
  if (!target) return;
  const view = target.dataset.view || target.dataset.go;
  if (typeof window.navigateTo === 'function') window.navigateTo(view);
  else setView(view);
}

function handleNavigation(event) {
  setView(event.detail?.view);
}

function handleHashChange() {
  setView(location.hash.slice(1), false);
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
  window.addEventListener('nightreign:navigate', handleNavigation);
  window.addEventListener('hashchange', handleHashChange);
  for (const file of ['crypto-js.min.js', 'relic-parser.js', 'save-editor.js', 'app.js?v=20261017-monster-names', 'save-editor-ui.js']) {
    try {
      await loadClassicScript(file);
    } catch (error) {
      console.error(error);
      loadError.value = error instanceof Error ? error.message : '前端脚本启动失败';
      return;
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('nightreign:navigate', handleNavigation);
  window.removeEventListener('hashchange', handleHashChange);
});
</script>

<template>
  <div class="app-shell" @click="handleShellClick">
    <aside class="sidebar" :class="{ open: sidebarOpen }" aria-label="主导航">
      <a class="brand" href="#overview" aria-label="渡夜图鉴首页">
        <img class="brand-image" src="/nightreign-banner.png" alt="ELDEN RING NIGHTREIGN" />
        <span class="brand-caption">渡夜图鉴</span>
      </a>
      <div class="side-divider"></div>
      <p class="side-label">探索</p>
      <nav class="nav-list">
        <button class="nav-link" :class="{ active: currentView === 'overview' }" data-view="overview"><img class="nav-icon" src="/nav-icons/roundtable.webp" alt="" />圆桌厅堂</button>
        <button class="nav-link" :class="{ active: currentView === 'enemies' }" data-view="enemies"><img class="nav-icon" src="/nav-icons/bestiary.webp" alt="" />图鉴 <b id="nav-enemy-count">—</b></button>
        <button class="nav-link" :class="{ active: currentView === 'relics' }" data-view="relics"><img class="nav-icon" src="/nav-icons/relic-rite.png" alt="" />遗物仪式</button>
        <button class="nav-link" :class="{ active: currentView === 'records' }" data-view="records"><img class="nav-icon" src="/nav-icons/journal.png" alt="" />日志</button>
        <button class="nav-link" :class="{ active: currentView === 'builds' }" data-view="builds"><img class="nav-icon" src="/nav-icons/relic-equip.png" alt="" />遗物装配</button>
        <button class="nav-link" :class="{ active: currentView === 'sources' }" data-view="sources"><img class="nav-icon" src="/nav-icons/sources.png" alt="" />资料说明</button>
      </nav>
      <div class="side-bottom"><span class="pulse-dot"></span> 离线资料 · 本地解析<br /><small>存档始终留在你的浏览器中</small></div>
    </aside>

    <main class="main">
      <header class="topbar">
        <button id="mobile-menu" class="icon-button" aria-label="打开导航">☰</button>
        <span class="breadcrumb">ELDEN RING NIGHTREIGN <span>/</span> <b>{{ labels[currentView] }}</b></span>
        <span class="topbar-right">非官方玩家工具 <i></i> 数据快照</span>
      </header>
      <div class="content">
        <OverviewPage :active="currentView === 'overview'" />
        <EnemiesPage :active="currentView === 'enemies'" />
        <RelicsPage :active="currentView === 'relics'" />
        <RecordsPage :active="currentView === 'records'" />
        <BuildsPage :active="currentView === 'builds'" />
        <SourcesPage :active="currentView === 'sources'" />
      </div>
      <footer>渡夜图鉴 · 玩家制作的非官方工具 <span>ELDEN RING NIGHTREIGN 为其权利人商标</span></footer>
    </main>
  </div>
</template>
