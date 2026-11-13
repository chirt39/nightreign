import { readFileSync } from 'node:fs';

const origin = 'https://nightreign.cn';
const read = file => JSON.parse(readFileSync(new URL('../public/' + file, import.meta.url), 'utf8'));
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const pathFor = key => '/relics/' + encodeURIComponent(key) + '/';

function page(path, title, description, body) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${origin}${path}"><link rel="icon" href="/nightreign-banner.png"><link rel="stylesheet" href="/relic-guide.css"></head><body><header><nav aria-label="主导航"><a href="/">渡夜图鉴</a> / <a href="/relics/">遗物图鉴</a></nav></header><main>${body}</main><footer><a href="https://beian.miit.gov.cn/">浙ICP备2026092550号-1</a></footer></body></html>`;
}

export function relicSearchPages() {
  const entries = Object.values(read('relic_catalog_zh.json').items);
  const fixed = new Map(read('damage-effects.json').relics.map(item => [item.key, item]));
  const effects = new Map(read('effect_encyclopedia.json').entries.filter(e => e.category === 'normal-outside').map(e => [String(e.id), e]));
  const pages = new Map();
  const groups = new Map();
  for (const relic of entries) {
    const {key, name_zh: name, category} = relic;
    const image = '/' + relic.image.replace(/^\.\//, '');
    const path = pathFor(key);
    const rows = fixed.get(key)?.rows;
    const summary = rows ? rows.map(r => r.name).join('、') : '具体词条随掉落结果而定，可在遗物仪式中查看你的这件遗物。';
    const details = rows ? '<h2>遗物效果</h2><dl>' + rows.map(row => {
      const effect = effects.get(String(row.id));
      if (!effect) return `<dt>${escape(row.name)}</dt>`;
      const href = '/?effectCategory=normal-outside&amp;effectId=' + encodeURIComponent(row.id) + '#effects';
      return `<dt><a href="${href}">${escape(row.name)}</a></dt><dd>${escape(effect.explanation || '')}${effect.stackability ? `<small>${escape(effect.stackability)}</small>` : ''}</dd>`;
    }).join('') + '</dl>' : `<p>${summary}</p>`;
    const body = `<img class="portrait" src="${escape(image)}" alt=""><p>${escape(category)}遗物</p><h1>${escape(name)}</h1>${details}<nav><a href="/#relics">查看我的遗物</a> · <a href="/#effects">打开词条图鉴</a></nav>`;
    pages.set(path.slice(1)+'index.html', page(path, `${name}｜黑夜君临遗物图鉴 · 渡夜图鉴`, `${name}（${category}）。${summary}`, body));
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(`<li><a href="${path}"><img src="${escape(image)}" width="48" height="48" loading="lazy" alt="">${escape(name)}</a></li>`);
  }
  const intro = '按名称和种类查找黑夜君临遗物，查看固定遗物的效果、词条和叠加规则。';
  const list = [...groups].map(([category, cards]) => `<section><h2>${escape(category)}</h2><ul>${cards.join('')}</ul></section>`).join('');
  pages.set('relics/index.html', page('/relics/', '黑夜君临遗物图鉴｜遗物效果与词条 · 渡夜图鉴', intro, `<h1>黑夜君临遗物图鉴</h1><p>${intro}</p><nav><a href="/#relics">查看我的遗物</a> · <a href="/#effects">词条图鉴</a></nav>${list}`));
  const urls = ['/', '/relics/', ...entries.map(r => pathFor(r.key))];
  pages.set('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(path=>`<url><loc>${origin}${path}</loc></url>`).join('')+'</urlset>');
  pages.set('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
  return pages;
}

export function relicSearchPlugin() {
  return {
    name: 'relic-search-pages',
    generateBundle() {
      for (const [fileName, source] of relicSearchPages()) this.emitFile({type:'asset', fileName, source});
    },
    configureServer(server) {
      const pages = relicSearchPages();
      server.middlewares.use((req, res, next) => {
        const path = req.url.split('?')[0].slice(1);
        const content = pages.get(path.endsWith('/') ? path + 'index.html' : path);
        if (!content) return next();
        res.setHeader('Content-Type', (path === 'robots.txt' ? 'text/plain' : path === 'sitemap.xml' ? 'application/xml' : 'text/html') + '; charset=utf-8');
        res.end(content);
      });
    }
  };
}
