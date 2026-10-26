const tabs = [
  ['overview', '⌂', '首页'],
  ['enemies', '◉', '图鉴'],
  ['relics', '◇', '遗物'],
  ['builds', '⌘', '配装'],
];
const moreTabs = [
  ['records', '日志'],
  ['effects', '词条'],
  ['sources', '资料'],
];

function navigate(view) {
  window.dispatchEvent(new CustomEvent('nightreign:navigate', { detail: { view } }));
}

export function setupMobileNav() {
  const nav = document.createElement('nav');
  nav.className = 'heybox-mobile-nav';
  nav.setAttribute('aria-label', '主导航');
  nav.innerHTML = [
    ...tabs.map(([view, icon, label]) => `<button type="button" data-view="${view}" aria-label="${label}"><span aria-hidden="true">${icon}</span><small>${label}</small></button>`),
    '<button type="button" id="heybox-more-toggle" aria-expanded="false" aria-controls="heybox-more-menu"><span aria-hidden="true">•••</span><small>更多</small></button>',
  ].join('');

  const menu = document.createElement('div');
  menu.id = 'heybox-more-menu';
  menu.className = 'heybox-more-menu';
  menu.hidden = true;
  menu.setAttribute('aria-label', '更多页面');
  menu.innerHTML = moreTabs.map(([view, label]) => `<button type="button" data-view="${view}">${label}</button>`).join('');
  document.body.append(menu, nav);

  const toggle = nav.querySelector('#heybox-more-toggle');
  const closeMenu = () => {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  };
  const syncActive = () => {
    const active = document.querySelector('.view.active')?.id?.replace('view-', '');
    for (const button of nav.querySelectorAll('[data-view]')) {
      if (button.dataset.view === active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    for (const button of menu.querySelectorAll('[data-view]')) {
      if (button.dataset.view === active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    closeMenu();
  };

  for (const button of [...nav.querySelectorAll('[data-view]'), ...menu.querySelectorAll('[data-view]')]) {
    button.addEventListener('click', () => navigate(button.dataset.view));
  }
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(expanded));
    menu.hidden = !expanded;
  });
  document.addEventListener('click', event => {
    if (!nav.contains(event.target) && !menu.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenu();
  });
  window.addEventListener('nightreign:navigate', syncActive);
  window.addEventListener('hashchange', syncActive);
  window.addEventListener('popstate', syncActive);
  new MutationObserver(syncActive).observe(document.querySelector('#app'), { subtree: true, attributes: true, attributeFilter: ['class'] });
  syncActive();
}
