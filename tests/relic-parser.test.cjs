const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createCipheriv } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({ Uint8Array, ArrayBuffer, TextDecoder, console });
vm.runInContext(fs.readFileSync(path.join(root, 'public/crypto-js.min.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'public/relic-parser.js'), 'utf8'), context);
const { parseRelicsFromEntry, parseSaveFile } = context;
const plain = value => JSON.parse(JSON.stringify(value));
const EMPTY = 0xffffffff;
const HANDLE = 0xc0800001;
const write32 = (bytes, offset, value) => new DataView(bytes.buffer, bytes.byteOffset).setUint32(offset, value, true);

// One full antique state plus a separate inventory/sort record in cleanData.
function fragment({ itemId = 100, positive = [7000000], negative = [] } = {}) {
  const data = new Uint8Array(128);
  write32(data, 16, HANDLE);
  write32(data, 20, (0x80000000 | itemId) >>> 0);
  write32(data, 24, (0x80000000 | itemId) >>> 0);
  write32(data, 28, EMPTY);
  for (let slot = 0; slot < 4; slot++) {
    write32(data, 32 + slot * 4, positive[slot] ?? EMPTY);
    write32(data, 72 + slot * 4, negative[slot] ?? EMPTY);
  }
  write32(data, 112, HANDLE);
  write32(data, 116, 1);
  data[120] = 42;
  return data;
}

function encryptedSave(cleanData) {
  const payload = Buffer.alloc(Math.ceil((4 + cleanData.length) / 16) * 16);
  payload.set(cleanData, 4);
  const iv = Buffer.alloc(16, 7);
  const cipher = createCipheriv('aes-128-cbc', Buffer.from('18f6326605bd178a5524523ac0a0c609', 'hex'), iv);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const data = new Uint8Array(96 + iv.length + encrypted.length);
  data.set([0x42, 0x4e, 0x44, 0x34]);
  write32(data, 12, 1);
  write32(data, 40, 96);
  data.set([0x40, 0, 0, 0, 0xff, 0xff, 0xff, 0xff], 64);
  write32(data, 72, iv.length + encrypted.length);
  write32(data, 80, 96);
  data.set(iv, 96);
  data.set(encrypted, 112);
  return data.buffer;
}

test('keeps four original pair positions, unknown IDs, and orphan negatives', () => {
  const data = fragment({ positive: [7000000, null, 15999999, 7000001], negative: [null, 8800000, 15999998, 8800001] });
  const relics = plain(parseRelicsFromEntry(data, new Set([100])));
  assert.equal(relics.length, 1);
  assert.equal(relics[0].sortKey, 42);
  assert.equal(relics[0].identificationStatus, 'verified');
  assert.deepEqual(relics[0].rawEffectSlots, [
    { positive: 7000000, negative: null },
    { positive: null, negative: 8800000 },
    { positive: 15999999, negative: 15999998 },
    { positive: 7000001, negative: 8800001 },
  ]);
  assert.deepEqual(relics[0].effects, [[7000000], [15999999, 15999998], [7000001, 8800001]]);
});

test('a reliably identified negative-only relic is retained without treating negatives as positives', () => {
  const relics = plain(parseRelicsFromEntry(fragment({ positive: [], negative: [null, 8800000] }), new Set([100])));
  assert.equal(relics.length, 1);
  assert.deepEqual(relics[0].effects, []);
  assert.deepEqual(relics[0].rawEffectSlots[1], { positive: null, negative: 8800000 });
});

test('does not truncate native item ID bits 24-27 into another known item', () => {
  const data = fragment({ itemId: 0x01000064 });
  assert.equal(parseRelicsFromEntry(data, new Set([100])).length, 0);
  const relics = parseRelicsFromEntry(data, new Set([0x01000064]));
  assert.equal(relics.length, 1);
  assert.equal(relics[0].itemId, 0x01000064);
});

test('rejects ordinary/short state records and uncorroborated item references', () => {
  const mutations = [
    data => { data[19] = 0x80; },
    data => { data[19] = 0x90; },
    data => { write32(data, 20, 0x40000064); write32(data, 24, 0x40000064); },
    data => { write32(data, 24, 0x80000065); },
    data => { write32(data, 28, 0); },
  ];
  for (const mutate of mutations) {
    const data = fragment();
    mutate(data);
    assert.equal(parseRelicsFromEntry(data, new Set([100])).length, 0);
  }
  assert.equal(parseRelicsFromEntry(fragment().slice(0, 95), new Set([100])).length, 0);
  assert.equal(parseRelicsFromEntry(fragment().slice(0, 120), new Set([100])).length, 0);
  assert.equal(parseRelicsFromEntry(fragment({ itemId: 999 }), new Set([100])).length, 0);
});

test('encrypted BND4 parse publishes raw slots and unknown-effect labels for each supported relic type', () => {
  for (const type of ['Relic', 'DeepRelic', 'UniqueRelic']) {
    const save = encryptedSave(fragment({ positive: [15999999], negative: [null, 8800000] }));
    const output = plain(parseSaveFile(save, { items: { 100: { type, color: 'Red', key: 'testRelic' } } }, { effects: {} }));
    assert.equal(output.totalRelics, 1);
    assert.equal(output.relics[0].itemType, type);
    assert.equal(output.relics[0].effects[0][0].id, 15999999);
    assert.equal(output.relics[0].effects[0][0].name_en, 'Unknown Effect 15999999');
    assert.equal(output.relics[0].rawEffectSlots.length, 4);
    assert.deepEqual(output.relics[0].rawEffectSlots[1], { positive: null, negative: 8800000 });
  }
});

test('Misc item cannot become a relic even with a matching shape and known effects', () => {
  const result = parseSaveFile(encryptedSave(fragment({ itemId: 11 })),
    { items: { 11: { type: 'Misc', key: 'sovereignSigil' } } },
    { effects: { 7000000: { key: 'known' } } });
  assert.equal(result.totalRelics, 0);
});

test('legacy full records retain known evidence as pending, never as verified', () => {
  for (const mutate of [
    data => { data[19] = 0x80; data[115] = 0x80; },
    data => { write32(data, 24, 0x80000065); },
    data => { write32(data, 28, 0); },
  ]) {
    const data = fragment();
    mutate(data);
    const save = encryptedSave(data);
    const items = { items: { 100: { type: 'Relic', color: 'Red' } } };
    const result = parseSaveFile(save, items, { effects: { 7000000: { key: 'known' } } });
    assert.equal(result.totalRelics, 1);
    assert.equal(result.relics[0].identificationStatus, 'pending');
    assert.deepEqual(plain(result.relics[0].rawEffectSlots[0]), { positive: 7000000, negative: null });
    assert.equal(parseSaveFile(save, items, { effects: {} }).totalRelics, 0);
  }
});

test('known effects do not restore short states or a confirmed non-antique item category', () => {
  const shortState = fragment();
  shortState[19] = 0x90;
  shortState[115] = 0x90;
  const goodsState = fragment();
  write32(goodsState, 20, 0x40000064);
  write32(goodsState, 24, 0x40000064);
  for (const data of [shortState, goodsState]) {
    assert.equal(parseRelicsFromEntry(data, new Set([100]), new Set([7000000])).length, 0);
  }
});

test('all 996 mapped relic IDs and all 69 named catalog classes survive verified and legacy fixtures', () => {
  const items = JSON.parse(fs.readFileSync(path.join(root, 'public/items_data.json'), 'utf8')).items;
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/relic_catalog_zh.json'), 'utf8')).items;
  const relicItems = Object.entries(items).filter(([, item]) => ['Relic', 'DeepRelic', 'UniqueRelic'].includes(item.type));
  const validItems = new Set(relicItems.map(([id]) => Number(id)));
  const covered = new Set();
  for (const [id, item] of relicItems) {
    const data = fragment({ itemId: Number(id) });
    const verified = parseRelicsFromEntry(data, validItems);
    assert.equal(verified.length, 1, id);
    assert.equal(verified[0].itemId, Number(id));
    assert.equal(verified[0].identificationStatus, 'verified');
    data[19] = 0x80;
    data[115] = 0x80;
    const legacy = parseRelicsFromEntry(data, validItems, new Set([7000000]));
    assert.equal(legacy.length, 1, id);
    assert.equal(legacy[0].identificationStatus, 'pending');
    covered.add(item.key);
  }
  assert.equal(relicItems.length, 996);
  assert.equal(Object.keys(catalog).length, 69);
  for (const key of Object.keys(catalog)) assert.ok(covered.has(key), key);
});
