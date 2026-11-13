/* Local battle records. The save parser supplies images, times and map coordinates. */
(() => {
  'use strict';
  const mounted = new WeakMap();
  const register = (node, type, fn, signal) => node.addEventListener(type, fn, { signal });
  const speedOptions = [0.25, 0.5, 1, 1.5, 2];
  const playerColors = ['#9cc6f8', '#f6ab96', '#c6d995'];
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function button(text, title, handler) {
    const node = element('button', 'bh-button', text);
    node.type = 'button';
    if (title) node.title = title;
    node.addEventListener('click', handler);
    return node;
  }
  function localImage(path) {
    if (typeof path !== 'string' || !path) return '';
    try {
      const url = new URL(path, location.origin + '/');
      return url.origin === location.origin && /^https?:$/.test(url.protocol) ? url.href : '';
    } catch { return ''; }
  }
  function portrait(path, name, className) {
    const url = localImage(path);
    if (!url) return element('span', className + ' bh-no-image', name || '—');
    const img = element('img', className);
    img.alt = name || '';
    img.title = name || '';
    img.loading = 'lazy';
    img.src = url;
    return img;
  }
  function when(record) {
    const [date = '', time = ''] = (record.dateTime || '').split('T');
    return { date: date.replaceAll('-', '/'), time: time.slice(0, 8) };
  }
  function labelResult(result) {
    return result === 'win' ? '胜利' : result === 'loss' ? '败北' : '';
  }
  function clock(value) {
    const seconds = Math.max(0, Math.floor(value));
    const pad = n => String(n).padStart(2, '0');
    const minutes = Math.floor(seconds / 60);
    return (minutes >= 60 ? Math.floor(minutes / 60) + ':' + pad(minutes % 60) : minutes) + ':' + pad(seconds % 60);
  }
  function playerLabel(player) {
    return player.playerName || player.name || ('队员 ' + player.slot);
  }
  function drawMembers(record) {
    const members = element('span', 'bh-members');
    for (const player of record.members || []) {
      members.append(portrait(player.icon, playerLabel(player) + ' · ' + player.name, 'bh-member'));
    }
    return members;
  }
  function depthBadge(depth) {
    const badge = element('span', 'bh-depth');
    badge.title = '深度 ' + depth;
    badge.setAttribute('aria-label', badge.title);
    badge.append(portrait('/battle-portraits/depth-' + depth + '.webp', '深度 ' + depth, 'bh-depth-icon'));
    return badge;
  }
  function showItem(details, owner) {
    const dialog = element('dialog', 'bh-item-dialog');
    dialog.setAttribute('aria-label', details.name);
    const close = button('关闭', '关闭装备详情', () => dialog.close());
    const header = element('header');
    header.append(element('h3', '', details.name), close);
    dialog.append(header);
    if (localImage(details.icon)) dialog.append(portrait(details.icon, details.name, 'bh-item-large'));
    for (const effect of details.effects || []) dialog.append(element('p', '', effect));
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => { dialog.remove(); if (owner.isConnected) owner.focus({preventScroll:true}); }, {once:true});
    document.getElementById('battle-history').append(dialog);
    dialog.showModal();
  }
  function equipmentSlot(item) {
    if (!item) {
      const empty = element('span', 'bh-slot bh-slot-empty');
      empty.setAttribute('aria-hidden', 'true');
      return empty;
    }
    const details = globalThis.BattleEquipment.describe(item);
    const node = button('', details.name, () => showItem(details, node));
    node.className = 'bh-slot';
    node.setAttribute('aria-label', details.name);
    node.append(portrait(details.icon, details.name, 'bh-item-icon'));
    return node;
  }
  const memberStats = [['enemies', '击败'], ['flasks', '圣杯瓶'], ['runes', '卢恩']];
  const teamStats = [['enemies', '打倒的敌人'], ['strongEnemies', '打倒的强敌'], ['treasures', '发现的宝物'], ['rescues', '救援我方人物']];
  function teamOverview(record, loadRelics) {
    const section = element('section', 'bh-summary');
    const title = element('h3', 'bh-overview-stage', '历经：' + (record.stage || '—'));
    const result = labelResult(record.result);
    if (result) title.append(element('small', '', result));
    section.append(title);
    const toolbar = element('div', 'bh-kit-tabs');
    const panels = [];
    const tabs = ['装备', '遗物'].map((text, i) => {
      const tab = button(text, '', () => switchKit(i));
      toolbar.append(tab);
      return tab;
    });
    let relicRequest = null;
    async function readRelics() {
      if (!loadRelics) return;
      relicRequest ??= Promise.resolve().then(() => loadRelics(record)).catch(() => null);
      const bySlot = await relicRequest;
      if (!section.isConnected) return;
      for (const [, box, player] of panels) {
        const items = bySlot?.[player.slot];
        if (Array.isArray(items)) {
          box.replaceChildren(...items.map(equipmentSlot));
        } else if (!player.equipment?.relics?.length) {
          box.replaceChildren(element('p', 'bh-unread', '本局暂未读到遗物明细'));
        }
      }
    }
    function switchKit(selected) {
      if (selected === 1) readRelics();
      tabs.forEach((tab, i) => tab.setAttribute('aria-pressed', String(selected === i)));
      for (const [gear, relic] of panels) {
        gear.hidden = selected !== 0;
        relic.hidden = selected !== 1;
      }
    }
    section.append(toolbar);
    for (const player of record.members || []) {
      const card = element('div', 'bh-player-card');
      card.style.setProperty('--bh-player', playerColors[(player.slot - 1) % playerColors.length]);
      const identity = element('div', 'bh-identity');
      identity.append(portrait(player.icon, player.name, 'bh-player-face'));
      const name = element('strong', 'bh-player-title', playerLabel(player));
      name.title = player.name || '';
      if (player.self) name.append(element('small', '', '我'));
      identity.append(name, element('span', 'bh-level', player.level ? 'Lv. ' + player.level : ''));
      const numbers = element('dl', 'bh-player-stats');
      for (const [key, label] of memberStats) {
        const value = player.stats?.[key];
        if (value == null) continue;
        const stat = element('div');
        const term = element('dt');
        term.append(portrait('/battle-portraits/stat-' + key + '.webp', label, 'bh-stat-icon'));
        stat.append(term, element('dd', '', value));
        numbers.append(stat);
      }
      identity.append(numbers);
      card.append(identity);
      const gear = element('div', 'bh-kit'), relic = element('div', 'bh-kit');
      if (player.equipment) {
        const slots = [...(player.equipment.weapons || []), ...(player.equipment.talismans || [])];
        for (const item of slots) gear.append(equipmentSlot(item));
        for (const item of player.equipment.relics || []) relic.append(equipmentSlot(item));
      }
      if (!gear.childElementCount) gear.append(element('p', 'bh-unread', '本局暂未读到装备'));
      if (!relic.childElementCount) relic.append(element('p', 'bh-unread', loadRelics ? '读取中…' : '本局暂未读到遗物明细'));
      card.append(gear, relic);
      panels.push([gear, relic, player]);
      section.append(card);
    }
    switchKit(0);
    const totals = element('dl', 'bh-totals');
    for (const [key, label] of teamStats) {
      const value = record.stats?.[key];
      if (value == null) continue;
      const amount = element('dd', 'bh-stat-total');
      amount.append(portrait('/battle-portraits/stat-' + key + '.webp', '', 'bh-stat-icon'), String(value));
      totals.append(element('dt', '', label), amount);
    }
    if (record.onlineId) totals.append(element('dt', 'bh-online', '联机游玩 ID'), element('dd', 'bh-online', record.onlineId));
    if (totals.childElementCount) section.append(totals);
    return section;
  }
  function canPlay(replay) {
    return replay?.duration > 0 && replay.layers?.some(layer => localImage(layer.image))
      && (replay.tracks?.some(track => track.samples?.length) || replay.events?.some(e => Number.isFinite(e.x) && Number.isFinite(e.y)));
  }
  function mount(root, options) {
    const prior = mounted.get(root);
    if (prior && prior.records === options.records) return prior;
    prior?.destroy();
    const abort = new AbortController();
    const listen = (target, type, fn) => register(target, type, fn, abort.signal);
    const sorted = [...options.records].sort((a, b) => b.timestamp - a.timestamp || b.id - a.id);
    const byId = new Map(sorted.map(record => [String(record.id), record]));
    const listPage = element('section', 'bh-list-page');
    const listTitle = element('header', 'bh-list-heading');
    listTitle.append(portrait('/nav-icons/effects-battle-record.png', '', 'bh-emblem'), element('h2', '', '战果记录'));
    if (options.onAggregate) listTitle.append(button('累计统计', '', options.onAggregate));
    const split = element('div', 'bh-record-split');
    const left = element('section', 'bh-ledger');
    const subhead = element('header', 'bh-list-caption');
    subhead.append(element('h3', '', '战果一览'), element('span', 'bh-count', sorted.length + ' / 100'));
    const list = element('ol', 'bh-list');
    list.setAttribute('aria-label', '按出击时间从新到旧排列的逐局战绩');
    const sidebar = element('aside', 'bh-roster-panel');
    sidebar.setAttribute('aria-label', '所选战果');
    left.append(subhead, list);
    split.append(left, sidebar);
    listPage.append(listTitle, split);
    const detail = element('article', 'bh-detail');
    detail.hidden = true;
    let active = null, highlighted = null;
    let player = null;
    let snapshot = null;
    let request = 0;
    const rowById = new Map();
    const storageKey = 'nightreign-battle-favorites-v1';
    let favorites;
    try { favorites = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')); }
    catch { favorites = new Set(); }
    const favoriteKey = record => [record.timestamp || record.dateTime, record.id, record.onlineId || ''].join('|');
    const favoriteButton = button('登记喜爱', '在本机登记或移除喜爱（2）', () => toggleFavorite(highlighted));
    const detailFavorite = button('登记喜爱', '在本机登记或移除喜爱', () => toggleFavorite(active));
    function updateFavoriteButton(btn, record) {
      const saved = favorites.has(favoriteKey(record));
      btn.setAttribute('aria-pressed', String(saved));
      btn.textContent = saved ? '移除喜爱' : '登记喜爱';
    }
    function toggleFavorite(record) {
      if (!record) return;
      const key = favoriteKey(record);
      const saved = !favorites.has(key);
      if (saved) favorites.add(key);
      else favorites.delete(key);
      try { localStorage.setItem(storageKey, JSON.stringify([...favorites])); } catch { /* In-memory favorites stay available. */ }
      rowById.get(String(record.id))?.toggleAttribute('data-favorite', saved);
      updateFavoriteButton(favoriteButton, record);
      updateFavoriteButton(detailFavorite, record);
    }
    const actions = element('footer', 'bh-list-actions');
    const openButton = button('查看战果', '查看所选战果（Enter）', () => highlighted && enterRecord(highlighted));
    actions.append(openButton, favoriteButton);
    if (sorted.length) listPage.append(actions);
    function select(record) {
      if (highlighted === record) return;
      if (highlighted) rowById.get(String(highlighted.id))?.removeAttribute('aria-current');
      highlighted = record;
      rowById.get(String(record.id))?.setAttribute('aria-current', 'true');
      updateFavoriteButton(favoriteButton, record);
      sidebar.replaceChildren(teamOverview(record, options.loadRelics));
    }
    function enterRecord(record) {
      select(record);
      snapshot = { row: String(record.id), top: list.scrollTop, page: window.scrollY };
      const url = new URL(location.href);
      url.searchParams.set('battleRecord', record.id);
      history.replaceState({ ...history.state, scrollY: snapshot.page, battleList: snapshot }, '', location.href);
      history.pushState({ ...history.state, view: 'records', battleFromList: true, scrollY: 0 }, '', url);
      open(record);
    }
    for (const [index, record] of sorted.entries()) {
      const row = button('', '查看本局队伍，双击进入战果', () => {
        select(record);
        if (matchMedia('(max-width: 760px)').matches) enterRecord(record);
      });
      row.className = 'bh-row';
      row.dataset.battleId = record.id;
      row.toggleAttribute('data-favorite', favorites.has(favoriteKey(record)));
      row.addEventListener('dblclick', () => { if (!active) enterRecord(record); });
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); enterRecord(record); return; }
        const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = sorted[clamp(index + step, 0, sorted.length - 1)];
        select(next);
        rowById.get(String(next.id)).focus();
      });
      const boss = element('span', 'bh-row-boss');
      boss.append(portrait(record.nightlordIcon, record.nightlordName, 'bh-boss'));
      const label = element('span', 'bh-row-stage');
      const shortStage = record.stage?.split('：')[0];
      label.append(element('strong', '', shortStage || '—'));
      label.title = [record.nightlordName, record.stage, labelResult(record.result)].filter(Boolean).join(' · ');
      row.dataset.final = shortStage === '最终日' ? '1' : '0';
      const rank = element('span', 'bh-rank');
      if (record.deepNight) {
        const depth = record.deepNight.after?.depth ?? record.deepNight.depth;
        if (depth) rank.append(depthBadge(depth));
        if (record.deepNight.after?.score != null) {
          rank.append(element('span', 'bh-score', record.deepNight.after.score));
          rank.title = '结算深度 ' + depth + ' · ' + record.deepNight.after.score + ' 分';
        }
      }
      const { date, time } = when(record);
      const stamp = element('time', 'bh-date');
      if (record.dateTime) stamp.dateTime = record.dateTime;
      stamp.append(element('span', '', date), element('span', '', time));
      row.append(boss, label, drawMembers(record), rank, stamp);
      const item = element('li');
      item.append(row);
      list.append(item);
      rowById.set(String(record.id), row);
    }
    if (sorted.length) select(byId.get(history.state?.battleList?.row) || sorted[0]);
    else left.append(element('p', 'bh-quiet', '未读取到逐局战绩。'));
    root.replaceChildren(listPage, detail);
    function close() {
      if (history.state?.battleFromList) { history.back(); return; }
      const url = new URL(location.href);
      url.searchParams.delete('battleRecord');
      history.replaceState({ ...history.state, battleFromList: false }, '', url);
      showList();
    }
    function showList() {
      request++;
      player?.destroy();
      player = null;
      const restore = history.state?.battleList || snapshot;
      const wasOpen = active !== null;
      active = null;
      detail.hidden = true;
      detail.replaceChildren();
      listPage.hidden = false;
      if (wasOpen && restore) requestAnimationFrame(() => {
        if (active || location.hash !== '#records') return;
        list.scrollTop = restore.top;
        rowById.get(restore.row)?.focus({ preventScroll: true });
        window.scrollTo({ top: restore.page, behavior: 'instant' });
      });
    }
    async function open(record) {
      if (active === record) return;
      active = record;
      const token = ++request;
      player?.destroy();
      player = null;
      listPage.hidden = true;
      detail.hidden = false;
      const header = element('header', 'bh-detail-head');
      const emblem = portrait('/nav-icons/journal.png', '', 'bh-emblem');
      const heading = element('h2', '', '战果');
      heading.tabIndex = -1;
      const closeButton = button('关闭', '关闭战果（Q）', close);
      const tools = element('div', 'bh-head-tools');
      updateFavoriteButton(detailFavorite, record);
      tools.append(detailFavorite, closeButton);
      header.append(emblem, heading, tools);
      const summary = teamOverview(record, options.loadRelics);
      detail.replaceChildren(header, summary);
      if (location.hash === '#records') {
        window.scrollTo({ top: 0, behavior: 'instant' });
        heading.focus({ preventScroll: true });
      }
      let replay;
      try { replay = await options.loadReplay?.(record); }
      catch { replay = null; }
      if (token !== request || abort.signal.aborted) return;
      if (!canPlay(replay)) {
        if (replay?.events?.length) {
          const list = element('ol', 'bh-summary-events');
          for (const event of replay.events) list.append(element('li', '', clock(event.time) + '　' + event.label));
          summary.append(element('h3', '', '事件记录'), list);
        }
        return;
      }
      const pane = element('div', 'bh-replay');
      detail.append(pane);
      player = createPlayer(pane, replay, record, summary);
      const toggle = button('查看足迹', '切换足迹与概要（1）', () => {
        const overview = player.toggleMode();
        toggle.textContent = overview ? '查看足迹' : '查看概要';
      });
      tools.prepend(toggle);
      player.toggleSummary = () => toggle.click();
    }
    function syncUrl() {
      if (location.hash !== '#records') { player?.pause(); return; }
      const record = byId.get(new URL(location.href).searchParams.get('battleRecord'));
      if (record) open(record);
      else if (active) showList();
    }
    listen(window, 'popstate', syncUrl);
    listen(window, 'hashchange', syncUrl);
    listen(window, 'nightreign:navigate', event => { if (event.detail?.view !== 'records') player?.pause(); });
    listen(document, 'visibilitychange', () => { if (document.hidden) player?.pause(); });
    listen(document, 'keydown', event => {
      if (!active && !root.hidden && location.hash === '#records' && event.key === '2' &&
          !event.target.closest?.('input,select,textarea,dialog,[contenteditable=true]')) {
        event.preventDefault(); toggleFavorite(highlighted); return;
      }
      if (root.querySelector('dialog[open]') || !active || location.hash !== '#records' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target.closest?.('input,select,textarea,[contenteditable=true]') && event.key !== 'Escape') return;
      if (event.key === 'Escape' || event.key.toLowerCase() === 'q') { event.preventDefault(); close(); }
      else if (event.key === '1' && player) { event.preventDefault(); player.toggleSummary(); }
      else if (player && !detail.querySelector('.bh-replay').hidden) player.keydown(event);
    });
    const api = { records: options.records, destroy() {
      request++;
      player?.destroy();
      abort.abort();
      root.replaceChildren();
      mounted.delete(root);
    }};
    mounted.set(root, api);
    syncUrl();
    return api;
  }

  const svgNS = 'http://www.w3.org/2000/svg';
  function svgNode(tag, attributes) {
    const node = document.createElementNS(svgNS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
  }
  function beforeOrAt(items, time, getTime) {
    let low = 0, high = items.length;
    while (low < high) {
      const mid = low + ((high - low) >> 1);
      if (getTime(items[mid]) <= time) low = mid + 1;
      else high = mid;
    }
    return low - 1;
  }
  const sampleTime = sample => sample.time;
  function createPlayer(pane, replay, record, summary) {
    const layers = replay.layers.filter(layer => localImage(layer.image));
    const events = (replay.events || []).slice().sort((a, b) => a.time - b.time);
    const tracks = (replay.tracks || []).map(track => ({ ...track, samples: track.samples.slice().sort((a, b) => a.time - b.time) }));
    const frameTimes = new Set([0, replay.duration]);
    for (const track of tracks) for (const s of track.samples) frameTimes.add(s.time);
    for (const e of events) frameTimes.add(e.time);
    for (const point of replay.points || []) {
      for (const t of [point.time, point.endTime]) {
        if (Number.isFinite(t) && t >= 0 && t <= replay.duration) frameTimes.add(t);
      }
    }
    const frames = [...frameTimes].sort((a, b) => a - b);
    let time = 0, speedIndex = 2, playing = false, raf = 0, lastWall = 0;
    let selected = -1, zoom = 1, centerX = 0.5, centerY = 0.5;
    let currentLayer = layers[0].id;
    // Coordinates without a recorded floor are a plan projection shared by all backdrops.
    const onCurrentLayer = item => item.layer == null || String(item.layer) === String(currentLayer);
    const grid = element('div', 'bh-replay-grid');
    const mapBox = element('section', 'bh-map');
    const drawing = svgNode('svg', { viewBox: '0 0 1000 1000', tabindex: 0, role: 'img',
      'aria-label': '本局地图与队员轨迹，按加减号缩放，方向键平移' });
    mapBox.append(drawing);
    const base = svgNode('image', { x: 0, y: 0, width: 1000, height: 1000, preserveAspectRatio: 'none' });
    const locations = svgNode('g', {});
    let timedIcons = [];
    const roster = svgNode('g', {});
    const marker = svgNode('circle', { class: 'bh-event-marker', r: 10, fill: 'none', stroke: '#efd27c', 'stroke-width': 3 });
    drawing.append(base, locations, roster, marker);

    const trackShapes = tracks.map((track, i) => {
      const color = playerColors[i % playerColors.length];
      const trail = svgNode('path', { fill: 'none', stroke: color, 'stroke-width': 1.65, 'vector-effect':'non-scaling-stroke', 'stroke-linejoin': 'round' });
      const dot = svgNode('circle', { r: 9, fill: color, stroke: '#142030', 'stroke-width': 3 });
      const title = svgNode('title', {});
      title.textContent = track.name || ('队员 ' + (i + 1));
      dot.append(title);
      roster.append(trail, dot);
      return { trail, dot, index: -2, layer: null };
    });
    function drawMap() {
      for (const icon of timedIcons) {
        const visible = time >= icon.start && time < icon.end;
        if (visible !== icon.visible) {
          icon.node.style.display = visible ? '' : 'none';
          icon.visible = visible;
        }
      }
      tracks.forEach((track, i) => {
        const shape = trackShapes[i];
        const index = beforeOrAt(track.samples, time, sampleTime);
        if (shape.index === index && shape.layer === currentLayer) return;
        let d = '', newLine = true;
        for (let j = 0; j <= index; j++) {
          const s = track.samples[j];
          if (!onCurrentLayer(s) || s.gap || !Number.isFinite(s.x) || !Number.isFinite(s.y)) { newLine = true; continue; }
          if (s.breakBefore) newLine = true;
          d += (newLine ? 'M' : 'L') + (s.x * 1000).toFixed(1) + ' ' + (s.y * 1000).toFixed(1);
          newLine = false;
        }
        shape.trail.setAttribute('d', d);
        const s = track.samples[index];
        const visible = s && onCurrentLayer(s) && !s.gap && Number.isFinite(s.x) && Number.isFinite(s.y);
        shape.dot.style.display = visible ? '' : 'none';
        if (visible) { shape.dot.setAttribute('cx', s.x * 1000); shape.dot.setAttribute('cy', s.y * 1000); }
        shape.index = index;
        shape.layer = currentLayer;
      });
      const event = events[selected];
      const hasMarker = event && event.time === time && onCurrentLayer(event) && Number.isFinite(event.x) && Number.isFinite(event.y);
      marker.style.display = hasMarker ? '' : 'none';
      if (hasMarker) { marker.setAttribute('cx', event.x * 1000); marker.setAttribute('cy', event.y * 1000); }
    }
    const mapTools = element('div', 'bh-map-tools');
    const layerSelect = element('select');
    if (layers.length > 1) {
      layerSelect.setAttribute('aria-label', '地图层级');
      layers.forEach((layer, i) => layerSelect.add(new Option(layer.name, String(i))));
      layerSelect.onchange = () => switchLayer(layers[layerSelect.selectedIndex].id);
      mapTools.append(layerSelect);
    }
    function switchLayer(id) {
      const index = layers.findIndex(layer => String(layer.id) === String(id));
      if (index < 0) return;
      currentLayer = layers[index].id;
      layerSelect.selectedIndex = index;
      const layer = layers[index];
      const bounds = layer.bounds || { x: 0, y: 0, width: 1, height: 1 };
      for (const key of ['x', 'y', 'width', 'height']) base.setAttribute(key, bounds[key] * 1000);
      base.setAttribute('href', localImage(layer.image));
      locations.replaceChildren();
      timedIcons = [];
      for (const point of replay.points || []) {
        if (!onCurrentLayer(point) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
        const x = point.x * 1000, y = point.y * 1000;
        const path = localImage(point.icon);
        const icon = path ? svgNode('image', { href: path, x: x - 22, y: y - 22, width: 44, height: 44 }) : svgNode('circle', { cx: x, cy: y, r: 4, fill: '#efd27c' });
        const name = svgNode('title', {}); name.textContent = point.name || '';
        icon.append(name); locations.append(icon);
        if (Number.isFinite(point.time) || Number.isFinite(point.endTime)) {
          timedIcons.push({ node: icon, start: point.time ?? 0, end: point.endTime ?? Infinity });
        }
      }
      drawMap();
    }
    function view() {
      const half = 0.5 / zoom;
      centerX = clamp(centerX, half, 1 - half);
      centerY = clamp(centerY, half, 1 - half);
      drawing.setAttribute('viewBox', [(centerX - half) * 1000, (centerY - half) * 1000, 2000 * half, 2000 * half].join(' '));
      zoomIn.disabled = zoom >= 6;
      zoomOut.disabled = zoom <= 1;
    }
    function changeZoom(factor) { zoom = clamp(zoom * factor, 1, 6); view(); }
    drawing.onkeydown = event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const delta = 0.12 / zoom;
      switch (event.key) {
        case 'ArrowLeft': centerX -= delta; break;
        case 'ArrowRight': centerX += delta; break;
        case 'ArrowUp': centerY -= delta; break;
        case 'ArrowDown': centerY += delta; break;
        case '+': case '=': changeZoom(1.5); break;
        case '-': changeZoom(1 / 1.5); break;
        default: return;
      }
      event.preventDefault();
      view();
    };
    const zoomIn = button('＋', '放大地图', () => changeZoom(1.5));
    const zoomOut = button('−', '缩小地图', () => changeZoom(1 / 1.5));
    mapTools.append(zoomOut, zoomIn);
    mapBox.append(mapTools);
    let drag = null;
    drawing.onpointerdown = event => {
      if (event.button !== 0 || drag) return;
      drag = { x: event.clientX, y: event.clientY, cx: centerX, cy: centerY, id: event.pointerId };
      drawing.setPointerCapture(event.pointerId);
    };
    drawing.onpointermove = event => {
      if (!drag || event.pointerId !== drag.id) return;
      const unit = 1 / (Math.min(drawing.clientWidth, drawing.clientHeight) * zoom);
      centerX = drag.cx - (event.clientX - drag.x) * unit;
      centerY = drag.cy - (event.clientY - drag.y) * unit;
      view();
    };
    drawing.onlostpointercapture = () => { drag = null; };
    drawing.addEventListener('wheel', event => { event.preventDefault(); changeZoom(event.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
    const badges = element('div', 'bh-map-badges');
    if (record.deepNight?.depth) badges.append(depthBadge(record.deepNight.depth));
    if (localImage(record.nightlordIcon)) {
      const bossSeal = element('div', 'bh-map-seal');
      bossSeal.append(portrait(record.nightlordIcon, record.nightlordName, 'bh-map-lord'));
      badges.append(bossSeal);
    }
    const party = element('div', 'bh-map-party');
    for (const member of record.members || []) {
      const badge = portrait(member.emblem || member.icon, member.name + (member.self ? '（我）' : ''), 'bh-map-member');
      const index = tracks.findIndex(t => t.playerId === member.slot);
      if (index >= 0) badge.style.setProperty('--bh-player', playerColors[index % playerColors.length]);
      party.append(badge);
    }
    badges.append(party);
    mapBox.append(badges);
    const eventPane = element('section','bh-event-pane');
    eventPane.append(element('h3', '', '事件记录'));
    const log = element('ol', 'bh-event-list');
    const eventButtons = events.map((event, i) => {
      const item = element('li');
      const entry = button('', '', () => selectEvent(i));
      entry.append(element('time', '', clock(event.time)), element('span', '', event.label));
      item.append(entry);
      log.append(item);
      return entry;
    });
    eventPane.append(log);
    if (!events.length) eventPane.append(element('p', 'bh-quiet', '未读到已识别事件。'));
    grid.append(mapBox, eventPane, summary);
    const timeline = element('div', 'bh-timeline');
    const currentClock = element('output', 'bh-clock');
    const range = element('input');
    range.type = 'range'; range.min = '0'; range.max = String(replay.duration); range.step = 'any';
    range.setAttribute('aria-label', '回放时间');
    range.oninput = () => seek(Number(range.value));
    const rail = element('div', 'bh-rail');
    const ticks = element('div', 'bh-ticks');
    ticks.setAttribute('aria-hidden', 'true');
    for (const event of events) {
      const tick = element('i');
      tick.style.left = clamp(event.time / replay.duration * 100, 0, 100) + '%';
      ticks.append(tick);
    }
    rail.append(range, ticks);
    timeline.append(rail, currentClock);
    const control = element('div', 'bh-controls');
    const play = button('播放', '播放或暂停（2）', togglePlay);
    const prevFrame = button('上一格', '上一格（←）', () => step(-1));
    const nextFrame = button('下一格', '下一格（→）', () => step(1));
    const prevKey = button('上一重点', '上一个重点事件（F1）', () => jump(-1));
    const nextKey = button('下一重点', '下一个重点事件（F2）', () => jump(1));
    const speed = element('select');
    speed.setAttribute('aria-label', '播放速度');
    speedOptions.forEach((n, i) => speed.add(new Option(n + '×', String(i))));
    speed.selectedIndex = speedIndex;
    speed.onchange = () => { speedIndex = speed.selectedIndex; };
    control.append(play, prevFrame, nextFrame, prevKey, nextKey, speed);
    const keyIndices = events.map((e, i) => e.key === false ? null : i).filter(i => i != null);
    pane.append(grid, timeline, control);
    function render(preferredIndex) {
      const next = preferredIndex ?? (selected >= 0 && events[selected].time === time ? selected : beforeOrAt(events, time, sampleTime));
      if (selected !== next) {
        eventButtons[selected]?.removeAttribute('aria-current');
        selected = next;
        const row = eventButtons[selected];
        if (row) {
          row.setAttribute('aria-current', 'true');
          const distance = row.getBoundingClientRect().top - log.getBoundingClientRect().top;
          if (distance < 0 || distance + row.offsetHeight > log.clientHeight) log.scrollTop += distance - log.clientHeight / 2;
        }
      }
      range.value = String(time);
      range.setAttribute('aria-valuetext', clock(time));
      currentClock.textContent = clock(time) + ' / ' + clock(replay.duration);
      prevFrame.disabled = time <= 0;
      nextFrame.disabled = time >= replay.duration;
      prevKey.disabled = !keyIndices.length || nextKeyIndex(-1) === undefined;
      nextKey.disabled = !keyIndices.length || nextKeyIndex(1) === undefined;
      drawMap();
    }
    function pause() { playing = false; cancelAnimationFrame(raf); play.textContent = '播放'; }
    function seek(value, index) { pause(); time = clamp(value, 0, replay.duration); render(index); }
    function selectEvent(index) {
      const event = events[index];
      seek(event.time, index);
      if (Number.isFinite(event.x) && Number.isFinite(event.y)) {
        if (event.layer != null) switchLayer(event.layer);
        zoom = Math.max(zoom, 2);
        centerX = event.x; centerY = event.y; view();
      }
    }
    function togglePlay() {
      if (playing) { pause(); return; }
      if (time >= replay.duration) seek(0);
      playing = true;
      play.textContent = '暂停';
      lastWall = performance.now();
      raf = requestAnimationFrame(tick);
    }
    function tick(wall) {
      if (!playing) return;
      if (!pane.getClientRects().length || location.hash !== '#records') { pause(); return; }
      // The game's normal results playback advances ten recorded seconds per real second.
      time = Math.min(replay.duration, time + (wall - lastWall) / 1000 * speedOptions[speedIndex] * 10);
      lastWall = wall;
      render();
      if (time >= replay.duration) pause();
      else raf = requestAnimationFrame(tick);
    }
    function step(direction) {
      const index = beforeOrAt(frames, time, t => t);
      const target = direction > 0 ? index + 1 : index - Number(frames[index] === time);
      seek(frames[clamp(target, 0, frames.length - 1)]);
    }
    function nextKeyIndex(direction) {
      const predicate = i => direction > 0
        ? events[i].time > time || (events[i].time === time && i > selected)
        : events[i].time < time || (events[i].time === time && i < selected);
      return direction > 0 ? keyIndices.find(predicate) : keyIndices.findLast(predicate);
    }
    function jump(direction) {
      const index = nextKeyIndex(direction);
      if (index != null) selectEvent(index);
    }
    function keydown(event) {
      switch (event.key) {
        case '2': togglePlay(); break;
        case ' ': if (event.target.closest?.('button')) return; togglePlay(); break;
        case 'ArrowLeft': step(-1); break;
        case 'ArrowRight': step(1); break;
        case 'F1': jump(-1); break;
        case 'F2': jump(1); break;
        case 'ArrowUp':
        case 'ArrowDown': speedIndex = clamp(speedIndex + (event.key === 'ArrowUp' ? 1 : -1), 0, speedOptions.length - 1); speed.selectedIndex = speedIndex; break;
        default: return;
      }
      event.preventDefault();
    }

    let overview = true;
    let resumeAt = 0, resumeEvent = -1;
    function showMode() {
      pane.classList.toggle('bh-overview-mode', overview);
      summary.hidden = !overview;
      eventPane.hidden = timeline.hidden = control.hidden = overview;
      if (overview) {
        resumeAt = time;
        resumeEvent = selected;
        seek(replay.duration);
      } else {
        seek(resumeAt, resumeEvent);
        const current = eventButtons[resumeEvent];
        if (current) {
          const delta = current.getBoundingClientRect().top - log.getBoundingClientRect().top;
          log.scrollTop += delta - log.clientHeight / 2;
        }
      }
    }
    switchLayer(currentLayer);
    view();
    showMode();
    return {
      pause,
      keydown(event) { if (!overview) keydown(event); },
      toggleMode() { overview = !overview; showMode(); return overview; },
      destroy: pause,
    };
  }
  window.NightreignBattleHistory = { mount };
})();
