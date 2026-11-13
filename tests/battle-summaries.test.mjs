import assert from 'node:assert/strict';
import test from 'node:test';
import '../public/battle-summaries.js';

test('a final-day loss and a partial two-player party survive ring ordering', () => {
  const start = 0x54a8;
  const width = 1872;
  const data = new Uint8Array(start + width * 4);
  const view = new DataView(data.buffer);
  view.setUint32(0, 303, true);
  function setRow(index, id, date, result) {
    const base = start + index * width;
    view.setUint32(base, id, true);
    view.setBigUint64(base + 4, BigInt(Date.parse(date)) * 10000n + 116444736000000000n, true);
    view.setUint8(base + 0x24, 4);
    view.setUint8(base + 0x28, result);
    view.setUint8(base + 0x2a, 2);
    for (let i = 0; i < 3; i++) view.setUint32(base + 0x54 + i * 592, 0xffffffff, true);
    return base;
  }
  const base = setRow(0, 100, '2026-03-01T12:30:01Z', 0);
  view.setBigUint64(base + 0x1c, 191217056n, true);
  view.setUint8(base + 0x29, 2);
  for (const [position, depth, score] of [[0x40, 4, 4000], [1860, 3, 3800], [1864, 3, 3450]]) {
    view.setUint8(base + position, depth);
    view.setUint16(base + position + 1, score, true);
  }
  view.setUint32(base + 0x3c, 7, true);
  view.setUint32(base + 0x54, 3, true);
  view.setUint16(base + 0x7a, 4, true);
  view.setUint32(base + 0x54 + 2 * 592, 1, true);
  view.setUint16(base + 0x7a + 2 * 592, 9, true);
  view.setUint16(base + 0x58 + 2 * 592, '星'.charCodeAt(0), true);
  view.setUint32(base + 0x54 + 2 * 592 + 0x2c, 5, true);
  setRow(2, 92, '2026-02-23T01:00:00Z', 1);
  const rows = globalThis.NightreignBattleSummaries.parse(data);
  assert.deepEqual(rows.map(r => r.id), [100, 92]);
  assert.equal(rows[0].stage, '最终日');
  assert.equal(rows[0].result, 'loss');
  assert.equal(rows[0].timestamp, Date.parse('2026-03-01T12:30:01Z'));
  assert.equal(rows[0].onlineId, '00000-00000-01912-17056');
  assert.equal(rows[0].stats.rescues, 7);
  assert.deepEqual(rows[0].deepNight, {depth: 4, before: {depth: 3, score: 3800}, after: {depth: 3, score: 3450}});
  assert.equal(rows[1].deepNight, null);
  assert.equal(rows[0].members[1].playerName, '星');
  assert.equal(rows[0].members[1].stats.flasks, 5);
  view.setUint8(base + 1864, 5);
  view.setUint16(base + 1865, 10000, true);
  assert.deepEqual(globalThis.NightreignBattleSummaries.parse(data)[0].deepNight.after, {depth: 5, score: 9999});
  view.setUint32(base + 1864, 0, true);
  assert.equal(globalThis.NightreignBattleSummaries.parse(data)[0].deepNight.after, null);
  assert.deepEqual(rows[0].members.map(m => [m.slot, m.self, m.name]), [[3, true, '女爵'], [1, false, '学者']]);
});
