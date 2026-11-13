import { buildingIconPath, pointIconPath, validPosition } from './map-predictor.js';
import extraPointIcons from './battle-point-icons.json';

// B1 exports contain only occupied tile columns/rows. Align their crop to the
// six-by-six L0 tile grid (top-left origin), including transparent tile gaps.
const underground = {
  0: ['limveld-L0_B1-4d707b23b921.webp', 1, 1, 3, 4],
  1: ['limveld-frost-L0_B1-f569a3650f9b.webp', 2, 1, 2, 4],
  2: ['limveld-volcanic-L0_B1-db1227dd6f2c.webp', 2, 1, 3, 4],
  3: ['limveld-corruption-L0_B1-2dabd9856cbe.webp', 1, 1, 3, 2],
  4: ['great-hollow-L0_B1-3933ab3423af.webp', 1, 1, 4, 4],
  5: ['limveld-L0_B1-4d707b23b921.webp', 1, 1, 3, 4],
};

let resources;
async function readCatalog(file) {
  const version = window.NIGHTREIGN_CATALOG_VERSIONS?.[file];
  const response = await fetch('/' + file + (version ? '?v=' + version : ''));
  if (!response.ok) throw new Error('回放地图资料加载失败');
  return response.json();
}

export async function forPattern(patternId) {
  resources ??= Promise.all(['map-catalog.json', 'map-asset-manifest.json', 'map-icon-manifest.json'].map(readCatalog))
    .catch(error => { resources = undefined; throw error; });
  const [catalog, assets, icons] = await resources;
  const pattern = catalog.patterns.find(row => row.patternId === String(patternId));
  if (!pattern || pattern.terrain.state !== 'known') return null;
  const terrain = pattern.terrain.value;
  const surface = assets.terrains[terrain];
  if (surface?.status !== 'verified') return null;
  const layers = [{ id: '0', name: '地上', image: surface.src }];
  if (underground[terrain]) {
    const [file, x, y, width, height] = underground[terrain];
    layers.push({ id: 'B1', name: '地下', image: '/map-assets/' + file,
      bounds: { x: x / 6, y: y / 6, width: width / 6, height: height / 6 } });
  }
  const points = [];
  for (const point of pattern.points) {
    if (!validPosition(point.normalized)) continue;
    for (const feature of point.features) {
      if (feature.state !== 'known') continue;
      const definition = catalog.definitions.features[feature.sourceId];
      const icon = feature.role === 'fieldElite'
        ? pointIconPath(icons, definition?.worldMapPointIconId)
        : buildingIconPath(icons, feature.sourceId);
      if (icon && definition?.nameZh) {
        points.push({ ...point.normalized, sourceId: Number(point.attachId), layer: '0', name: definition.nameZh, icon });
      }
    }
  }
  const pointIcons = { ...extraPointIcons }, pointNames = {};
  for (const [key, entry] of Object.entries(icons.icons)) {
    pointIcons[entry.worldMapPointIconId] = buildingIconPath(icons, key);
    pointNames[entry.worldMapPointIconId] = entry.nameZh;
  }
  for (const id of [16, 28]) {
    pointIcons[id] = pointIconPath(icons, id);
    pointNames[id] = id === 16 ? '野外精英' : '强力野外精英';
  }
  return { layers, points, pointIcons, pointNames, terrainId: Number(terrain), nightlordId: Number(pattern.nightlord.menuRowId),
    name: catalog.definitions.terrains[terrain]?.nameZh };
}
