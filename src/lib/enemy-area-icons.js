import { buildingIconPath } from './map-predictor.js';

const enemyAreaBuildingKeys = new Map([
  ['遗迹', 'buildingCategory:ruins'],
  ['小型要塞', 'buildingCategory:fort'],
  ['要塞', 'buildingCategory:castle'],
  ['要塞楼顶Boss', 'buildingCategory:castle'],
  ['要塞底层Boss', 'buildingCategory:castle'],
  ['大型营地', 'buildingCategory:mainencampment'],
  ['大教堂', 'buildingCategory:greatchurch'],
  ['沼泽', 'buildingCategory:marsh'],
  ['锻造村', 'buildingCategory:forge'],
]);

export function enemyAreaIcon(manifest, area) {
  const name = area.replace(/（大空洞）$/, '');
  const key = enemyAreaBuildingKeys.get(name);
  return key ? buildingIconPath(manifest, key) : null;
}
