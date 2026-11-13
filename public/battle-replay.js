/* PC result bank (USERDATA_12). Expects the parser's four-byte-stripped cleanData. */
(() => {
  'use strict';
  const BANK_HEADER = 16;
  const SLOT_BYTES = 35844;
  const DCX_HEADER = 76;
  const MAX_DETAIL_BYTES = 1024 * 1024;
  const MAP_SIZE = 1536;
  const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (d, i) => d.getUint16(i, true);
  const u32 = (d, i) => d.getUint32(i, true);
  const f32 = (d, i) => d.getFloat32(i, true);
  // The 12-bit axes are unsigned mini-floats. Project each cell's midpoint
  // to map texels; grid spacing varies toward the western/eastern edge.
  const axis = value => ((1+((value&255)+0.5)/256)*2**((value>>>8)+3)-8)/MAP_SIZE;
  const magic = (d, i, value) => d.getUint32(i, false) === value;
  let labelRequest;

  function requestLabels() {
    if (!labelRequest) labelRequest = fetch('./battle-log-labels.json')
      .then(r => {
        if (!r.ok) throw new Error('无法读取战果事件名称');
        return r.json();
      }).catch(error => { labelRequest = null; throw error; });
    return labelRequest;
  }

  // Consume only the declared DFLT member. Limit both the declared and actual output.
  async function unpack(member, expectedLength) {
    const reader = new Blob([member]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    const result = new Uint8Array(expectedLength);
    let pos = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.length > expectedLength - pos) {
          await reader.cancel();
          throw new RangeError('战果明细长度不符');
        }
        result.set(value, pos);
        pos += value.length;
      }
    } finally {
      reader.releaseLock();
    }
    if (pos !== result.length) throw new RangeError('战果明细不完整');
    return result;
  }

  function directory(data) {
    const entries = [];
    if (!data || data.byteLength < BANK_HEADER) return entries;
    const d = view(data);
    if (!magic(d, 0, 0x52534c54) || u32(d, 4) !== 6) return entries;
    const end = u32(d, 8);
    if (end < BANK_HEADER || end > data.byteLength || (end - BANK_HEADER) % SLOT_BYTES !== 0) return entries;
    for (let slot = BANK_HEADER; slot < end; slot += SLOT_BYTES) {
      const length = u32(d, slot);
      const pos = slot + 4;
      if (length <= DCX_HEADER || length > SLOT_BYTES - 4) continue;
      if (!magic(d,pos,0x44435800) || !magic(d,pos+24,0x44435300)
        || !magic(d,pos+36,0x44435000) || !magic(d,pos+40,0x44464c54) || !magic(d,pos+68,0x44434100)) continue;
      const expected = d.getUint32(pos+28, false);
      if (expected < 12 || expected > MAX_DETAIL_BYTES || d.getUint32(pos+32, false) !== length-DCX_HEADER) continue;
      entries.push({ member: data.subarray(pos+DCX_HEADER, pos+length), expected });
    }
    return entries;
  }

  function readDetail(raw) {
    const d = view(raw);
    const version = u32(d, 0);
    if (version !== 7 && version !== 9) return null;
    let pos = 9 + d.getUint8(8) * 22; // Recorded contraction circles (day, phase, radius, centre, times).
    const patternId = u32(d,pos);
    const terrain = d.getUint8(pos+4);
    pos += 5;
    function table(width, visit) {
      const count = u16(d,pos);
      pos += 2;
      if (pos + count*width > d.byteLength) throw new RangeError('战果明细表不完整');
      const start = pos;
      pos += count*width;
      if (!visit) return;
      return Array.from({length:count}, (_,i) => visit(start+i*width));
    }
    const sightings = table(12, p => ({
      id:u32(d,p), kind:d.getUint8(p+4), value:u32(d,p+4), start:u16(d,p+8), end:u16(d,p+10)
    }));
    const pointConfig = new Map(table(10, p => [u32(d,p),u16(d,p+4)]));
    const tracks = Array.from({length:3}, () => table(8, p => {
      const time = u32(d,p)/1000;
      const packed = u32(d,p+4);
      if ((packed >>> 8) === 0) return {time,gap:true};
      const x = axis(packed >>> 20);
      const y = axis((packed >>> 8)&4095);
      return x>=0 && y>=0 && x<=1 && y<=1 ? {time,x,y} : {time,gap:true};
    }));
    const logs = table(25, p => ({
      time:u32(d,p)/1000, type:u32(d,p+4), argumentKind:d.getUint8(p+8),
      argument:u32(d,p+9), px:f32(d,p+13), py:f32(d,p+17)
    }));
    const relics = globalThis.BattleEquipment?.readReplayRelics?.(d, pos, version) ?? null;
    return { id:u32(d,4), patternId, terrain, tracks, logs, sightings, pointConfig, relics };
  }

  function mapPoints(detail, map, labels) {
    const fixed = map.points || [];
    const byId = new Map(fixed.map(point => [Number(point.sourceId),point]));
    const result = [];
    for (const start of detail.sightings.filter(r => r.kind === 0 && r.value)) {
      const x = axis(start.value >>> 20), y = axis((start.value >>> 8)&4095);
      if (x>1 || y>1) continue;
      const source = byId.get(start.id);
      const iconId = detail.pointConfig.get(start.id) || labels.pointIconIds?.[start.id];
      const end = start.end === 65535 ? Infinity : start.end/10;
      const states = [{time:start.start/10, iconId}, ...detail.sightings
        .filter(r => r.kind===2 && r.id===start.id && r.start>=start.start && r.start/10<end)
        .map(r => ({time:r.start/10,iconId:r.value>>>16}))];
      for (let i=0; i<states.length; i++) {
        const state = states[i];
        const endTime = states[i+1]?.time ?? end;
        const icon = map.pointIcons?.[state.iconId] || (state.iconId ? null : source?.icon);
        if (endTime <= state.time || (!state.iconId && !source)) continue;
        result.push({
          x,y,icon,time:state.time,sourceId:start.id,
          name:source?.name || map.pointNames?.[state.iconId] || '地点',
          ...(source?.layer ? {layer:source.layer} : {}),
          ...(Number.isFinite(endTime) ? {endTime} : {})
        });
      }
    }
    const unique = new Map(result.map(p => [
      [p.x,p.y,p.layer||'',p.icon,p.time||0,p.endTime||''].join('|'),p
    ]));
    return [...unique.values()];
  }

  function eventFor(log, sequence, members, labels, defeats) {
    let label = labels.events[log.type];
    if (!label) return null;
    const key = defeats.has(log.type) || log.type === 5001 || log.type === 5005;
    if (label.includes('<?text1?>')) {
      let name;
      if (log.argumentKind === 1) name = labels.enemies[log.argument];
      if (log.argumentKind === 3) name = labels.weapons[log.argument];
      if (log.argumentKind === 5) {
        const player = members.find(m => m.slot === log.argument);
        name = player?.playerName || (player?.name ? player.name+'（队员 '+log.argument+'）' : '队员 '+log.argument);
      }
      if (!name) return null;
      label = label.replace('<?text1?>',name);
    }
    if (/<\?[^>]+\?>/.test(label)) return null;
    const event = {sequence, time:log.time, label, key};
    if ((log.px || log.py) && log.px>=0 && log.py>=0 && log.px<=MAP_SIZE && log.py<=MAP_SIZE) {
      event.x = log.px/MAP_SIZE;
      event.y = log.py/MAP_SIZE;
    }
    return event;
  }

  async function open(data, integrations = {}) {
    const details = new Map();
    const duplicates = new Set();
    for (const {member, expected} of directory(data)) {
      let item;
      try { item = readDetail(await unpack(member, expected)); }
      catch { continue; } // A damaged member must not remove the other results or any summary.
      if (!item || duplicates.has(item.id)) continue;
      if (details.has(item.id)) {
        details.delete(item.id);
        duplicates.add(item.id);
      } else details.set(item.id,item);
    }
    async function match(id, summary) {
        const detail = details.get(Number(id));
        if (!detail || Number(summary?.id) !== detail.id) return null;
        const loadMap = integrations.forPattern || globalThis.BattleReplayMap?.forPattern;
        if (!loadMap) return null;
        const map = await loadMap(detail.patternId);
        if (!map?.layers?.length || map.nightlordId !== summary.nightlordId ||
          Number(map.terrainId) !== detail.terrain) return null;
        const members = summary.members || [];
        const self = members.find(member => member.self);
        const teamSlots = new Set(members.map(member => member.slot));
        const endMs = summary.durationMs;
        if (!self || !Number.isFinite(endMs) || detail.logs.some(log => log.time*1000 > endMs+1 ||
          ((log.type === 5001 || log.type === 5005) &&
          (log.argument === self.slot || !teamSlots.has(log.argument))))) return null;
        // Track 0 is the local player (about 2s cadence); the remote streams (5s)
        // follow the same occupied slot order as the party summary.
        const people = [self, ...members.filter(member => !member.self)];
        if (detail.tracks.some((track,i) => track.length && (!people[i] || track.at(-1).time*1000 > endMs+1))) return null;
        const relicsBySlot = detail.relics && Object.fromEntries(people.map((member,i) => [member.slot, detail.relics[i]]));
        return { detail, map, members, people, relicsBySlot };
    }
    return {
      size:details.size,
      has:id => details.has(Number(id)),
      async getRelics(id, summary) {
        return (await match(id, summary))?.relicsBySlot ?? null;
      },
      async get(id, summary) {
        const matched = await match(id, summary);
        if (!matched) return null;
        const { detail, map, members, people, relicsBySlot } = matched;
        const labels = await (integrations.labels || requestLabels());
        const tracks = detail.tracks.flatMap((samples,i) => {
          if (!samples.some(s => !s.gap)) return [];
          const member = people[i];
          return [{playerId:member.slot, name:member.playerName || member.name || (i===0?'我':'队友 '+i), samples}];
        });
        const defeats = new Set(labels.defeats);
        const events = detail.logs.map((log,i) => eventFor(log,i,members,labels,defeats)).filter(Boolean);
        if (!tracks.length) return events.length || relicsBySlot ? { events, tracks:[], layers:[], duration:0, relicsBySlot } : null;
        let duration = (Number(summary.durationMs)||0)/1000;
        for (const t of tracks) duration = Math.max(duration,t.samples.at(-1).time);
        if (events.length) duration = Math.max(duration,events.at(-1).time);
        if (duration<=0) return null;
        const points = mapPoints(detail, map, labels);
        return {duration, layers:map.layers, points, events, tracks, patternId:detail.patternId, relicsBySlot};
      }
    };
  }

  globalThis.BattleReplay = {open};
})();
