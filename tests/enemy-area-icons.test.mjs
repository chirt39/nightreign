import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { enemyAreaIcon } from '../src/lib/enemy-area-icons.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../public/map-icon-manifest.json', import.meta.url), 'utf8'));
const data = JSON.parse(fs.readFileSync(new URL('../public/enemy-data.json', import.meta.url), 'utf8'));
const actualAreas = new Set(Object.values(data.displayLocationsBySourceId).flat());

test('actual atlas areas use the verified building keys, including ruins and the small fort', () => {
  const expected = [
    ['遗迹', 'buildingCategory:ruins'],
    ['遗迹（大空洞）', 'buildingCategory:ruins'],
    ['小型要塞', 'buildingCategory:fort'],
    ['要塞', 'buildingCategory:castle'],
    ['要塞楼顶Boss', 'buildingCategory:castle'],
    ['要塞底层Boss', 'buildingCategory:castle'],
    ['大型营地', 'buildingCategory:mainencampment'],
    ['大教堂', 'buildingCategory:greatchurch'],
    ['大教堂（大空洞）', 'buildingCategory:greatchurch'],
    ['沼泽', 'buildingCategory:marsh'],
    ['锻造村', 'buildingCategory:forge'],
  ];
  for (const [area, key] of expected) {
    assert.ok(actualAreas.has(area), `${area} is a real atlas option`);
    const entry = manifest.icons[key];
    assert.equal(entry.status, 'verified');
    assert.equal(enemyAreaIcon(manifest, area), entry.src);
    assert.ok(fs.existsSync(new URL(`../public${entry.src}`, import.meta.url)));
  }
  assert.equal(enemyAreaIcon(manifest, '小型要塞（大空洞）'), manifest.icons['buildingCategory:fort'].src);
});

test('the central castle uses native icon 42010, independently of small fort icon 42006', () => {
  const castle = manifest.icons['buildingCategory:castle'];
  assert.equal(castle.worldMapPointIconId, 11);
  assert.equal(castle.iconId, 42010);
  assert.equal(castle.source.pointParamRowId, 64433700);
  assert.equal(castle.source.sprite, 'MENU_MenuIcon_42010.png');
  assert.equal(castle.resampled, false);
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL(`../public${castle.src}`, import.meta.url))).digest('hex'), castle.sha256);
  assert.equal(manifest.icons['buildingCategory:fort'].iconId, 42006);
  assert.notEqual(enemyAreaIcon(manifest, '要塞'), enemyAreaIcon(manifest, '小型要塞'));
});

test('unmatched areas, unverified entries and invalid image paths remain text-only', () => {
  for (const area of ['all', '原野Boss', '出现地点未收录', '东部地下要塞（大空洞）', '小型营地', '教堂', '教堂（大空洞）']) {
    assert.equal(enemyAreaIcon(manifest, area), null);
  }
  assert.equal(enemyAreaIcon(null, '大教堂'), null);
  const make = entry => ({ icons: { 'buildingCategory:castle': { nameZh: '中央主城', ...entry } } });
  assert.equal(enemyAreaIcon(make({ status: 'candidate', src: '/map-icons/castle.png' }), '要塞'), null);
  assert.equal(enemyAreaIcon(make({ status: 'verified', src: 'https://example.com/image.png' }), '要塞'), null);
});
