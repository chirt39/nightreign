import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import '../public/battle-equipment.js';

const api = globalThis.BattleEquipment;
const EMPTY = 0xffffffff;
const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

test('weapon and talisman slots use separate item categories and retain spell and extra trait', async t => {
  const url = new URL('../public/battle-equipment-catalog.json', import.meta.url);
  const data = JSON.parse(await readFile(url, 'utf8'));
  t.mock.method(globalThis, 'fetch', async () => ({ok: true, json: async () => data}));
  await api.loadCatalog();
  const buf = Buffer.alloc(592, 255);
  for (const [offset, value] of [[0x48, 41750002], [0x4c, 401], [0x50, 8850850],
    [0x70, 7120500], [0x98, 110000], [0x228, 0x200003e8]]) buf.writeUInt32LE(value, offset);
  const items = api.read(view(buf), 0);
  assert.equal(items.weapons.filter(Boolean).length, 1);
  assert.equal(items.talismans.filter(Boolean).length, 1);
  assert.match(api.describe(items.weapons[0]).name, /铁之眼的弓 \+2/);
  assert.equal(api.describe(items.weapons[0]).effects.length, 3);
  assert.match(api.describe(items.weapons[0]).effects.join(' '), /13%/);
  assert.equal(api.describe(items.talismans[0]).name, '红琥珀链坠');
  assert.match(api.describe({...items.weapons[0], id:41750099}).name, /#41750099/);
});

test('v9 relics retain player, slot and negative associations past variable tables', () => {
  const tables = Buffer.alloc(2 + 80 + 2 + 42);
  tables.writeUInt16LE(1); tables.writeUInt16LE(1, 82);
  const members = [];
  for (let i = 0; i < 3; i++) {
    const header = Buffer.alloc(4 + 4 * i + 5);
    header.writeUInt16LE(i); header.writeUInt16LE(1, 2);
    const body = Buffer.alloc(6 * 28, 255);
    body.writeUInt32LE(0x80000000 + 100 + i, i * 28);
    body.writeUInt32LE(7000000 + i, i * 28 + 4);
    body.writeUInt32LE(6500000 + i, i * 28 + 16);
    members.push(header, body);
  }
  const bytes = Buffer.concat([tables, ...members]);
  const people = api.readReplayRelics(view(bytes), 0, 9);
  assert.equal(people.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(people[i].filter(Boolean).length, 1);
    assert.equal(people[i][i].id, 100 + i);
    assert.deepEqual(people[i][i].pairs, [{positive:7000000+i,negative:6500000+i},
      {positive:EMPTY,negative:EMPTY},{positive:EMPTY,negative:EMPTY}]);
  }
  assert.equal(api.readReplayRelics(view(bytes.subarray(0, bytes.length-1)), 0, 9), null);
  assert.equal(api.readReplayRelics(view(tables), 0, 7), null);
});
