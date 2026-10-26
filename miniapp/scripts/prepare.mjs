import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const miniappRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = resolve(miniappRoot, '..');
const generatedSource = join(miniappRoot, '.generated-src');
const generatedPublic = join(miniappRoot, '.generated-public');
const miniappQuickNav = [
  ['enemies', '◉', '图鉴'],
  ['relics', '◇', '遗物仪式'],
  ['records', '▤', '日志'],
  ['builds', '⌘', '遗物装配'],
  ['effects', '✧', '词条图鉴'],
  ['sources', 'ⓘ', '资料说明'],
].map(([view, icon, label]) => `<button type="button" data-go="${view}"><span aria-hidden="true">${icon}</span><b>${label}</b></button>`).join('');

async function replaceGeneratedDirectory(source, destination, filter) {
  const withinMiniapp = relative(miniappRoot, destination);
  if (!withinMiniapp || withinMiniapp.startsWith('..') || isAbsolute(withinMiniapp)) {
    throw new Error('拒绝清理小程序目录之外的路径：' + destination);
  }
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true, filter });
}

function safePublicAsset(source) {
  const name = source.toLowerCase();
  return !(/\.sl2(?:\.|$)/.test(name) || /(?:^|[\\/])\.env(?:\.|$)/.test(name));
}

async function rewriteVue(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) {
      await rewriteVue(filename);
    } else if (entry.isFile() && entry.name.endsWith('.vue')) {
      const original = await readFile(filename, 'utf8');
      let updated = original.replace(/\bsrc="\/([^"]+)"/g, (_match, asset) => ':src="hbAsset(\'' + asset + '\')"');
      if (updated !== original) {
        updated = updated.replace('</script>', 'const hbAsset = name => import.meta.env.BASE_URL + name;\n</script>');
      }
      if (entry.name === 'App.vue') {
        updated = updated.replace(/script\.src = [^;]+;/, 'script.src = import.meta.env.BASE_URL + file;');
      }
      if (entry.name === 'OverviewPage.vue') {
        updated = updated.replace('<section class="home-agent panel">', '<nav class="heybox-home-nav" aria-label="快速导航">' + miniappQuickNav + '</nav>\n<section class="home-agent panel">');
      }
      if (entry.name === 'RelicsPage.vue') {
        updated = updated.replace(/<p class="hint">遗物中文名与图标对照[\s\S]*?<\/p>/, '');
      }
      updated = updated.replaceAll('存档始终留在你的浏览器中', '存档只在当前设备解析');
      updated = updated.replaceAll('文件只在当前浏览器内解析', '文件只在当前设备解析');
      updated = updated.replaceAll('仅在浏览器内调整', '仅在当前设备预览');
      await writeFile(filename, updated);
    }
  }
}

await replaceGeneratedDirectory(resolve(siteRoot, 'src'), generatedSource);
await replaceGeneratedDirectory(resolve(siteRoot, 'public'), generatedPublic, safePublicAsset);
await rewriteVue(generatedSource);

const publicStyle = join(generatedPublic, 'style.css');
const style = await readFile(publicStyle, 'utf8');
await writeFile(publicStyle, style.replace(/^@import url\('https:\/\/fonts\.googleapis\.com\/[^\n]+\n/m, ''));

const apiBase = (process.env.VITE_NIGHTREIGN_API_BASE || '').trim();
if (apiBase) {
  const url = new URL(apiBase);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('VITE_NIGHTREIGN_API_BASE 必须是 HTTPS 域名，不含路径、查询或凭据。');
  }
}
await writeFile(join(generatedPublic, 'ai-config.js'), 'window.NIGHTREIGN_AI_API_BASE = ' + JSON.stringify(apiBase) + ';\n');

const siteApp = join(generatedPublic, 'app.js');
const appCode = await readFile(siteApp, 'utf8');
const importHook = `
window.nightreignLoadTransfer = function (payload) {
  if (!state.items || !state.effects) throw new Error('图鉴资料尚未载入，请稍后再试。');
  const parsed = window.NightreignSaveTransfer.expand(payload, state.items, state.effects);
  state.saveEditor = null;
  state.saveFileName = null;
  invalidateBuildResults();
  showSave(parsed);
  state.equipped = { normal: [null, null, null], deep: [null, null, null] };
  state.selectedRelicIndex = null;
  renderBuildWorkspace();
  try { sessionStorage.setItem('nightreign-parsed-save-v2', JSON.stringify(parsed)); } catch (_) {}
  setSaveStatus('已从当前设备导入 ' + parsed.relics.length + ' 件遗物及战绩。原始存档未上传。');
};
`;
await writeFile(siteApp, appCode.replaceAll('存档在浏览器本地解析', '存档在当前设备本地解析') + importHook);

console.log('小程序已同步站点页面与静态资料。');
