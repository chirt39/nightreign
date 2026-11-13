/* PC battle summary v303 and result detail v9. All offsets are local to a member. */
(() => {
  'use strict';
  const NONE = 0xffffffff;
  const readId = (view, at) => view.getUint32(at, true);
  const present = id => id !== NONE && id !== 0;
  let catalog, pending;

  function readWeapon(view, at) {
    const id = readId(view, at);
    // 110000 = 徒手. The game presents an empty weapon slot for this record.
    if (!present(id) || id === 110000) return null;
    return {
      kind: 'weapon', id, artId: readId(view, at + 4),
      effects: [8, 12, 16, 40].map(delta => readId(view, at + delta)).filter(present),
      spells: [20, 24].map(delta => readId(view, at + delta)).filter(present),
    };
  }

  function read(view, memberOffset) {
    const weapons = Array.from({length: 6}, (_, i) => readWeapon(view, memberOffset + 0x48 + 80 * i));
    const talismans = [0x228, 0x22c].map(delta => {
      const value = readId(view, memberOffset + delta);
      return value >>> 28 === 2 ? {kind: 'talisman', id: value & 0x0fffffff} : null;
    });
    return {weapons, talismans, relics: []};
  }

  function readReplayRelics(view, offset, version) {
    if (version !== 9) return null;
    let pos = offset;
    const has = bytes => pos >= 0 && pos + bytes <= view.byteLength;
    function skipTable(width) {
      if (!has(2)) return false;
      const length = 2 + width * view.getUint16(pos, true);
      if (!has(length)) return false;
      pos += length;
      return true;
    }
    if (!skipTable(80) || !skipTable(42)) return null;
    const people = [];
    for (let player = 0; player < 3; player++) {
      if (!has(4)) return null;
      const count = view.getUint16(pos, true);
      const extra = view.getUint16(pos + 2, true);
      const headerSize = 4 + count * 4 + extra * 5;
      if (!has(headerSize + 6 * 28)) return null;
      pos += headerSize;
      const relics = [];
      for (let slot = 0; slot < 6; slot++, pos += 28) {
        const ref = readId(view, pos);
        if (!present(ref)) { relics.push(null); continue; }
        if (ref >>> 28 !== 8) return null;
        const pairs = [0, 1, 2].map(i => ({
          positive: readId(view, pos + 4 + i * 4),
          negative: readId(view, pos + 16 + i * 4),
        }));
        relics.push({kind: 'relic', id: ref & 0x0fffffff, pairs});
      }
      people.push(relics);
    }
    return pos === view.byteLength ? people : null;
  }

  function loadCatalog() {
    const file = 'battle-equipment-catalog.json';
    const version = globalThis.NIGHTREIGN_CATALOG_VERSIONS?.[file];
    const url = './' + file + (version ? '?v=' + encodeURIComponent(version) : '');
    if (!pending) pending = fetch(url).then(response => {
      if (!response.ok) throw new Error('无法读取战果装备图鉴');
      return response.json();
    }).then(data => { catalog = data; return data; }).catch(error => { pending = null; throw error; });
    return pending;
  }

  function effectName(id) {
    return catalog?.effects[id] || '词条 #' + id;
  }

  function describe(item) {
    if (!item) return null;
    const {id, kind} = item;
    if (kind === 'weapon') {
      const exact = catalog?.weapons[id];
      const level = id % 100;
      const base = catalog?.weapons[id - level];
      const variant = exact || (base && level <= base[2] ? base : null);
      const effects = [];
      if (present(item.artId)) effects.push('战技 · ' + (catalog?.arts[item.artId] || '#' + item.artId));
      for (const spell of item.spells || []) effects.push(catalog?.spells[spell] || '法术 #' + spell);
      effects.push(...(item.effects || []).map(effectName));
      const name = variant ? variant[0] + (!exact && level ? ' +' + level : '') : '武器 #' + id;
      return {kind, name, icon: variant?.[1] || null, effects};
    }
    const isRelic = kind === 'relic';
    const row = (isRelic ? catalog?.relics : catalog?.talismans)?.[id];
    const effects = [];
    if (isRelic) {
      for (const pair of item.pairs || []) {
        if (present(pair.positive)) effects.push(effectName(pair.positive));
        if (present(pair.negative)) effects.push('负面 · ' + effectName(pair.negative));
      }
    } else if (row?.[2]) effects.push(row[2]);
    return {kind, name: row?.[0] || (isRelic ? '遗物 #' : '护符 #') + id,
      icon: catalog?.icons[row?.[1]] || null, effects};
  }

  globalThis.BattleEquipment = {read, readReplayRelics, loadCatalog, describe};
})();
