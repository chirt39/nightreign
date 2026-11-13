import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import '../public/battle-replay.js';

function table(rows) {
  const count = Buffer.alloc(2);
  count.writeUInt16LE(rows.length);
  return Buffer.concat([count, ...rows]);
}

function log(ms, type, target) {
  const row = Buffer.alloc(25);
  row.writeUInt32LE(ms);
  row.writeUInt32LE(type, 4);
  row[8] = 5;
  row.writeUInt32LE(target, 9);
  return row;
}

function fixture() {
  const header = Buffer.alloc(14);
  header.writeUInt32LE(9);
  header.writeUInt32LE(77, 4);
  header.writeUInt32LE(100, 9);
  const sample = Buffer.alloc(8);
  sample.writeUInt32LE(1000);
  sample.writeUInt32LE((1400 * 2**20 + 1550 * 256), 4);
  const raw = Buffer.concat([
    header, table([]), table([]), table([sample]), table([]), table([]),
    table([log(1610, 5005, 1), log(1634, 5001, 2)])
  ]);
  const zip = deflateSync(raw);
  const bank = Buffer.alloc(16 + 35844);
  bank.write('RSLT'); bank.writeUInt32LE(6, 4); bank.writeUInt32LE(bank.length, 8);
  bank.writeUInt32LE(76 + zip.length, 16);
  const dcx = bank.subarray(20);
  for (const [pos, magic] of [[0, 'DCX'], [24, 'DCS'], [36, 'DCP'], [40, 'DFLT'], [68, 'DCA']]) dcx.write(magic,pos);
  dcx.writeUInt32BE(raw.length, 28); dcx.writeUInt32BE(zip.length, 32);
  zip.copy(dcx, 76);
  return bank;
}

const summary = { id:77, nightlordId:3, durationMs:2000,
  members:[{slot:3,self:true,name:'我'}, {slot:1,name:'队友甲'}, {slot:2,name:'队友乙'}] };
const services = { forPattern:async id => id===100 && {nightlordId:3,terrainId:0,layers:[{id:'0'}]},
  labels:{events:{5005:'救援了<?text1?>',5001:'受到<?text1?>救援'}, defeats:[]} };

test('decode a real-format member, preserve rescue direction and same-second order, reject a mismatched summary',async () => {
  const index = await globalThis.BattleReplay.open(fixture(), services);
  assert.equal(index.size,1);
  const replay = await index.get(77, summary);
  assert.deepEqual(replay.events.map(e=>[e.time,e.label]),[[1.61,'救援了队友甲（队员 1）'],[1.634,'受到队友乙（队员 2）救援']]);
  // 12-bit axis exponent 5 has one pixel per cell; exponent 6 has two.
  assert.equal(replay.tracks[0].samples[0].x, (256+120+0.5-8)/1536);
  assert.equal(replay.tracks[0].samples[0].y, ((256+14+0.5)*2-8)/1536);
  assert.equal(await index.get(77,{...summary,nightlordId:2}),null);
  assert.equal(await index.get(77,{...summary,durationMs:1000}),null);
  assert.equal(await index.get(7,summary),null);
});

test('ambiguous record IDs never select a different run; an invalid member leaves valid neighbors intact',async () => {
  const bank = fixture();
  const twice = Buffer.concat([bank, bank.subarray(16)]);
  twice.writeUInt32LE(twice.length,8);
  assert.equal((await globalThis.BattleReplay.open(twice,services)).size,0);
  twice.writeUInt32BE(100000001,20+28);
  assert.equal((await globalThis.BattleReplay.open(twice,services)).size,1);
});
