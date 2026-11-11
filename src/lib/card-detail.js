import { onBeforeUnmount, onMounted } from 'vue';

// Keep legacy-rendered cards and their controls intact; only their placement changes.
export function useCardDetail(listRef, detailRef, { cardSelector, titleSelector, subtitleSelector, emptyText }) {
  let observer, selectedKey = '', cards = new Map(), buttons = new Map();
  function select(key) {
    const card = cards.get(key);
    if (!card) return;
    selectedKey = key;
    for (const [id, button] of buttons) button.setAttribute('aria-pressed', String(id === key));
    detailRef.value.replaceChildren(card);
  }
  function sync() {
    const list = listRef.value, detail = detailRef.value;
    if (!list || !detail) return;
    const incoming = [...list.querySelectorAll(cardSelector)];
    if (!incoming.length && list.querySelector('.atlas-list-row')) return;
    observer.disconnect(); cards = new Map(); buttons = new Map();
    if (!incoming.length) {
      selectedKey = '';
      const text = document.createElement('p'); text.className = 'atlas-detail-empty'; text.textContent = emptyText;
      detail.replaceChildren(text);
    } else {
      const rows = incoming.map((card, index) => {
        const title = card.querySelector(titleSelector)?.textContent.trim() || '未命名项目';
        const subtitle = card.querySelector(subtitleSelector)?.textContent.trim() || '';
        const key = card.id || `${title}:${subtitle}:${index}`;
        cards.set(key, card);
        const button = document.createElement('button'); button.type = 'button'; button.className = 'atlas-list-row';
        const image = card.querySelector('img.relic-thumb'); if (image) button.append(image.cloneNode(true));
        const copy = document.createElement('span'), name = document.createElement('strong'), note = document.createElement('small');
        name.textContent = title; note.textContent = subtitle; copy.append(name, note); button.append(copy);
        button.addEventListener('click', () => select(key)); buttons.set(key, button);
        return button;
      });
      list.replaceChildren(...rows);
      select(cards.has(selectedKey) ? selectedKey : cards.keys().next().value);
    }
    observer.observe(list, { childList: true });
  }
  onMounted(() => { observer = new MutationObserver(sync); sync(); });
  onBeforeUnmount(() => { observer?.disconnect(); cards.clear(); buttons.clear(); });
}
