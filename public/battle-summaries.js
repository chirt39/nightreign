// PC USERDATA_10, offsets relative to the existing parser's cleanData.
// The result list is a 100-slot ring and is independent of USERDATA_12.
(() => {
  'use strict';

  const PROFILE_VERSION = 303;
  const FIRST_RECORD = 0x54a8;
  const RECORD_SIZE = 1872;
  const MAX_RECORDS = 100;
  const FIRST_MEMBER = 0x54;
  const MEMBER_SIZE = 592;
  const FILETIME_UNIX_EPOCH = 116444736000000000n;

  // CL_MenuText 146500–146504. Reaching the final day is also possible on a loss.
  const STAGES = ['初始日：白天', '初始日：夜晚', '中间日：白天', '中间日：夜晚', '最终日'];
  const CHARACTERS = [
    null, '追踪者', '守护者', '铁之眼', '女爵', '无赖', '复仇者', '隐士', '执行者', '学者', '送葬者',
  ];
  // NightBossMenuParam largeBossIconId. DLC normal portraits use the map's existing assets.
  const NIGHTLORDS = [
    '格拉狄乌斯', '艾德雷', '格诺斯塔', '玛利斯', '利普拉',
    '弗格尔', '卡莉果', '布德奇冥', '哈尔莫妮亚', '史柴格斯',
  ];
  const DLC_NORMAL = {
    8: '/map-icons/nightlord-8-normal-41828-12859eae55e1.png',
    9: '/map-icons/nightlord-9-normal-41829-151a9c9853c4.png',
  };

  function nightlordIcon(id, variant) {
    if (!NIGHTLORDS[id]) return null;
    if (variant === 1 && (id < 7 || id === 8)) return '/enemy-images/nightboss-' + (41840 + id) + '.png';
    return DLC_NORMAL[id] || '/enemy-images/nightboss-' + (41820 + id) + '.png';
  }

  function readMembers(view, base) {
    const members = [];
    for (let index = 0; index < 3; index++) {
      const offset = base + FIRST_MEMBER + index * MEMBER_SIZE;
      const slot = view.getUint32(offset, true);
      if (slot < 1 || slot > 3) continue;
      const characterId = view.getUint16(offset + 0x26, true);
      const character = CHARACTERS[characterId];
      const level = view.getUint32(offset + 0x28, true);
      const nameBytes = new Uint8Array(view.buffer, view.byteOffset + offset + 4, 34);
      const playerName = nameDecoder.decode(nameBytes).split('\0', 1)[0];
      members.push({
        slot, self: index === 0, characterId, name: character || '未知角色', playerName,
        icon: character ? '/battle-portraits/face-' + characterId + '.webp' : null,
        emblem: character ? '/battle-portraits/emblem-' + characterId + '.webp' : null,
        level: level || null,
        stats: {
          enemies: countAt(view, offset + 0x34),
          flasks: countAt(view, offset + 0x2c),
          runes: countAt(view, offset + 0x30),
        },
        equipment: globalThis.BattleEquipment?.read(view, offset),
      });
    }
    return members;
  }

  const nameDecoder = new TextDecoder('utf-16le');

  function countAt(view, offset) {
    const value = view.getUint32(offset, true);
    return value === 0xffffffff ? null : value;
  }

  function ratingAt(view, offset) {
    const depth = view.getUint8(offset);
    const score = view.getUint16(offset + 1, true);
    // The native cap is 10000. The game's result screen prints 9999 there.
    return depth >= 1 && depth <= 5 && score <= 10000 ? { depth, score: Math.min(score, 9999) } : null;
  }

  function deepNightAt(view, base) {
    if (view.getUint8(base + 0x29) !== 2) return null;
    // The lobby's expedition depth can differ from the local player's rank.
    return {
      depth: ratingAt(view, base + 0x40)?.depth ?? null,
      before: ratingAt(view, base + 1860),
      after: ratingAt(view, base + 1864),
    };
  }

  function onlineIdAt(view, base) {
    const id = view.getBigUint64(base + 0x1c, true);
    if (id === 0n || id === 0xffffffffffffffffn) return null;
    return id.toString().padStart(20, '0').match(/.{5}/g).join('-');
  }

  function localDateTime(epochMs) {
    const date = new Date(epochMs);
    const pad = value => String(value).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
      + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  }

  function parse(cleanData) {
    if (!(cleanData instanceof Uint8Array) || cleanData.byteLength < FIRST_RECORD) return [];
    const view = new DataView(cleanData.buffer, cleanData.byteOffset, cleanData.byteLength);
    if (view.getUint32(0, true) !== PROFILE_VERSION) return [];
    const summaries = [];
    const slots = Math.min(MAX_RECORDS, Math.floor((view.byteLength - FIRST_RECORD) / RECORD_SIZE));
    for (let index = 0; index < slots; index++) {
      const base = FIRST_RECORD + index * RECORD_SIZE;
      const ticks = view.getBigUint64(base + 4, true);
      if (ticks < FILETIME_UNIX_EPOCH) continue;
      const timestamp = Number((ticks - FILETIME_UNIX_EPOCH) / 10000n);
      // Unused rows carry sentinels; real sessions follow the game's 2025 release.
      if (timestamp < Date.UTC(2025, 0) || timestamp >= Date.UTC(10000, 0)) continue;
      const id = view.getUint32(base, true);
      if (id === 0xffffffff) continue;
      const phase = view.getUint8(base + 0x24);
      const result = view.getUint8(base + 0x28);
      const lord = view.getUint8(base + 0x2a);
      const variant = view.getUint8(base + 0x2b);
      summaries.push({
        id, timestamp, dateTime: localDateTime(timestamp), durationMs: view.getUint32(base + 12, true),
        stage: STAGES[phase] ?? null, result: result === 1 ? 'win' : result === 0 ? 'loss' : null,
        nightlordId: lord, nightlordName: NIGHTLORDS[lord] ?? null,
        nightlordIcon: nightlordIcon(lord, variant), members: readMembers(view, base),
        deepNight: deepNightAt(view, base), onlineId: onlineIdAt(view, base),
        stats: {
          enemies: countAt(view, base + 0x2c),
          strongEnemies: countAt(view, base + 0x30),
          treasures: countAt(view, base + 0x34),
          rescues: countAt(view, base + 0x3c),
        },
      });
    }
    return summaries.sort((a, b) => b.timestamp - a.timestamp || b.id - a.id);
  }

  globalThis.NightreignBattleSummaries = {parse};
})();
