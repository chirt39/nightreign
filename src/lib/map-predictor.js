export const FEATURE_KINDS = ['building', 'monster', 'event'];
export const PRIMARY_BOSS_ROLE = 'primarySmallBaseBoss';
export const FIELD_ELITE_ROLE = 'fieldElite';
export const MAP_DISPLAY_CATEGORIES = ['building', 'fieldElite'];
export function buildingIconPath(manifest, sourceId) {
  const entry = manifest?.icons?.[sourceId], path = entry?.src;
  return entry?.status === 'verified' && typeof path === 'string' && /^\/?map-icons\/[A-Za-z0-9_-]+\.(?:png|webp)$/i.test(path) ? `/${path.replace(/^\//, '')}` : null;
}
export function pointIconPath(manifest, worldMapPointIconId) {
  const entry = manifest?.pointIcons?.[worldMapPointIconId], path = entry?.src;
  return entry?.status === 'verified' && typeof path === 'string' && /^\/?map-icons\/[A-Za-z0-9_-]+\.(?:png|webp)$/i.test(path) ? `/${path.replace(/^\//, '')}` : null;
}
export function nightlordPortrait(definition, manifest, iconManifest) {
  const native = iconManifest?.nightlords?.[definition?.menuRowId];
  if (native?.status === 'verified' && native.iconId === definition?.menuIconId && typeof native.src === 'string' && /^\/?map-icons\/[A-Za-z0-9_-]+\.(?:png|webp)$/i.test(native.src)) return `/${native.src.replace(/^\//, '')}`;
  const entry = Object.values(manifest?.images || {}).find(image => image.matchStatus === 'verified' && image.imageKind === 'nightboss-menu-portrait' && image.sourceParam?.iconId === definition?.menuIconId && String(image.sourceParam?.rowId) === String(definition?.menuRowId));
  return typeof entry?.path === 'string' && /^enemy-images\/[A-Za-z0-9_-]+\.(?:png|jpe?g|webp)$/i.test(entry.path) ? `/${entry.path}` : null;
}
export function displayCategory(feature, definition = {}) {
  if (feature.kind === 'building') return 'building';
  const category = feature.displayCategory || definition.displayCategory;
  if (['baseBoss', 'fieldElite'].includes(category)) return category;
  return feature.role === PRIMARY_BOSS_ROLE ? 'baseBoss' : null;
}
const id = value => value == null ? null : String(value);
const hasValue = value => value !== '' && value !== null && value !== undefined;
export function namedDefinition(definition) {
  const unverified = ['unknown', 'unverified', 'pending', 'raw_ids_only', 'raw_id_only'];
  return Boolean(definition && typeof definition.nameZh === 'string' && definition.nameZh.trim() && !unverified.includes(definition.identityStatus) && !unverified.includes(definition.status));
}
export function definitionOptions(definitions = {}) {
  return Object.entries(definitions).filter(([, value]) => namedDefinition(value)).map(([value, entry]) => ({ value, label: entry.nameZh }));
}
export function phaseBossOptions(patterns, definitions, day) {
  const referenced = new Set(patterns.filter(pattern => pattern.dayBosses?.[day]?.state === 'known' && pattern.dayBosses[day].identityStatus !== 'unknown').map(pattern => id(pattern.dayBosses[day].sourceId)));
  return definitionOptions(definitions).filter(option => referenced.has(option.value));
}
export function validPosition(position) {
  return Boolean(position && Number.isFinite(position.x) && Number.isFinite(position.y) && position.x >= 0 && position.x <= 1 && position.y >= 0 && position.y <= 1);
}
export function referenceMapGroups(points = [], terrainId, visibility) {
  return points.filter(point => point.filterable === false && point.terrainId === terrainId && point.displayCategory === 'fieldElite' && visibility[point.displayCategory] && validPosition(point.normalized)).map(point => ({
    key: `reference:${point.key}`, terrainId: point.terrainId, normalized: point.normalized, reference: point,
    entries: [{ name: point.nameZh, displayCategory: point.displayCategory }],
  }));
}
export function safeMapAsset(entry) {
  return Boolean(entry?.status === 'verified' && Number.isFinite(entry.width) && entry.width > 0 && Number.isFinite(entry.height) && entry.height > 0 && typeof entry.src === 'string' && /^\/map-assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:png|webp|jpe?g)$/i.test(entry.src));
}
function valueConflict(field, expected, actual) {
  if (!hasValue(expected)) return false;
  if (field?.state === 'known_absent') return true;
  return field?.state === 'known' && hasValue(actual) && id(actual) !== id(expected);
}
export function eventOptions(definitions = {}) {
  const groups = new Map();
  Object.entries(definitions).forEach(([sourceId, definition]) => {
    if (!namedDefinition(definition)) return;
    const value = definition.referenceFamily ? `family:${definition.referenceFamily}` : `id:${sourceId}`;
    if (!groups.has(value)) groups.set(value, { value, names: new Set(), sourceIds: [] });
    const group = groups.get(value); group.names.add(definition.nameZh); group.sourceIds.push(sourceId);
  });
  return [...groups.values()].map(({ names, ...option }) => ({ ...option, label: [...names].join(' / ') }));
}
export function evaluatePattern(pattern, clues = {}, definitions = {}) {
  const filters = clues.filters || {}, conflicts = [];
  if (valueConflict(pattern.terrain, filters.terrain, pattern.terrain?.value)) conflicts.push('地图地形');
  if (valueConflict(pattern.nightlord, filters.nightlord, pattern.nightlord?.menuRowId)) conflicts.push('夜王身份');
  for (const [key, day, label] of [['firstNight', 'day1', '第一夜首领'], ['secondNight', 'day2', '第二夜首领']]) {
    const field = pattern.dayBosses?.[day];
    if (field?.identityStatus !== 'unknown' && valueConflict(field, filters[key], field?.sourceId)) conflicts.push(label);
  }
  const depths = pattern.eligibility?.depths;
  if (hasValue(filters.depth) && depths?.state === 'known' && Array.isArray(depths.values) && !depths.values.some(value => id(value) === id(filters.depth))) conflicts.push('深夜等级');
  const selectedEvent = eventOptions(definitions.events).find(option => option.value === filters.event);
  if (selectedEvent) {
    const events = pattern.events;
    if (events?.state === 'known_absent') conflicts.push('已见事件');
    else if (events?.state === 'known' && Array.isArray(events.values)) {
      const matching = events.values.filter(event => selectedEvent.sourceIds.includes(id(event.sourceId)));
      const unidentified = events.values.some(event => !hasValue(event.sourceId) || !namedDefinition(definitions.events?.[id(event.sourceId)]));
      if (!matching.length && !unidentified) conflicts.push('已见事件');
      else if (matching.length && hasValue(filters.eventDay) && !unidentified && !matching.some(event => !hasValue(event.day) || id(event.day) === id(filters.eventDay))) conflicts.push('事件发生日');
    }
  }
  for (const [index, observation] of (clues.observations || []).entries()) {
    if (!FEATURE_KINDS.includes(observation.kind) || !hasValue(observation.sourceId) || !hasValue(observation.attachId)) continue;
    if (observation.role) {
      const definition = definitions.features?.[id(observation.sourceId)];
      if (![PRIMARY_BOSS_ROLE, FIELD_ELITE_ROLE].includes(observation.role) || observation.kind !== 'monster' || definition?.kind !== 'monster' || definition.role !== observation.role || !namedDefinition(definition)) continue;
    }
    if (valueConflict(pattern.terrain, observation.terrainId, pattern.terrain?.value)) { conflicts.push(`位置线索 ${index + 1} 的地形`); continue; }
    const point = pattern.points?.find(item => id(item.attachId) === id(observation.attachId));
    if (!point) continue;
    const matching = point.features?.some(feature => feature.kind === observation.kind && feature.state === 'known' && (feature.role || null) === (observation.role || null) && id(feature.sourceId) === id(observation.sourceId));
    if (observation.role) {
      const uncertain = point.features?.some(feature => feature.role === observation.role && (feature.state !== 'known' || feature.kind !== observation.kind || !namedDefinition(definitions.features?.[id(feature.sourceId)]) || definitions.features?.[id(feature.sourceId)]?.role !== observation.role));
      if (!matching && !uncertain && ['known', 'known_absent'].includes(point.coverage?.[observation.role])) conflicts.push(`位置线索 ${index + 1} 的${observation.role === FIELD_ELITE_ROLE ? '野外精英怪' : '主遭遇首领'}`);
    } else if (!matching && ['known', 'known_absent'].includes(point.coverage?.[observation.kind])) conflicts.push(`位置线索 ${index + 1}`);
  }
  return { matches: conflicts.length === 0, conflicts };
}
export function findCandidates(patterns, clues, definitions = {}) {
  return patterns.filter(pattern => evaluatePattern(pattern, clues, definitions).matches);
}
export function collectEvents(patterns, definitions = {}) {
  const groups = new Map(), options = eventOptions(definitions.events);
  patterns.forEach((pattern, index) => {
    if (pattern.events?.state !== 'known') return;
    for (const event of pattern.events.values || []) {
      const option = options.find(item => item.sourceIds.includes(id(event.sourceId)));
      if (!option) continue;
      const day = [1, 2].includes(Number(event.day)) ? Number(event.day) : null, key = JSON.stringify([option.value, day]);
      if (!groups.has(key)) groups.set(key, { key, name: option.label, day, members: new Set() });
      groups.get(key).members.add(index);
    }
  });
  return [...groups.values()].map(({ members, ...event }) => ({ ...event, common: members.size === patterns.length }));
}
export function collectLayers(patterns, definitions = {}) {
  const entries = new Map();
  patterns.forEach((pattern, patternIndex) => {
    const terrainId = pattern.terrain?.state === 'known' ? id(pattern.terrain.value) : null;
    for (const point of pattern.points || []) for (const feature of point.features || []) {
      const definition = definitions.features?.[id(feature.sourceId)];
      if (feature.state !== 'known' || !FEATURE_KINDS.includes(feature.kind) || definition?.kind !== feature.kind || !namedDefinition(definition)) continue;
      if ((feature.role || null) !== (definition.role || null)) continue;
      const position = validPosition(feature.displayNormalized) ? feature.displayNormalized : point.normalized;
      const key = JSON.stringify([terrainId, id(point.attachId), feature.kind, id(feature.sourceId), feature.role || null]);
      if (!entries.has(key)) entries.set(key, { key, terrainId, attachId: id(point.attachId), kind: feature.kind, role: feature.role || null, displayCategory: displayCategory(feature, definition), worldMapPointIconId: definition.worldMapPointIconId ?? null, sourceId: id(feature.sourceId), name: definition.nameZh, normalized: validPosition(position) ? { ...position } : null, members: new Set(), positionConsistent: true });
      const entry = entries.get(key);
      entry.members.add(patternIndex);
      if (!validPosition(position) || !entry.normalized || Math.abs(position.x - entry.normalized.x) > 0.000001 || Math.abs(position.y - entry.normalized.y) > 0.000001) entry.positionConsistent = false;
    }
  });
  return [...entries.values()].map(({ members, positionConsistent, ...entry }) => ({ ...entry, normalized: positionConsistent ? entry.normalized : null, common: entry.terrainId !== null && members.size === patterns.length, candidateCount: members.size }));
}
export function nearbyPoints(points, click, width, height, tolerance = 24) {
  if (!validPosition(click) || !(width > 0) || !(height > 0)) return [];
  return points.filter(point => validPosition(point.normalized)).map(point => ({ ...point, distance: Math.hypot((point.normalized.x - click.x) * width, (point.normalized.y - click.y) * height) })).filter(point => point.distance <= tolerance).sort((a, b) => a.distance - b.distance);
}
export function coincidentMarkers(points, target, width, height) {
  return nearbyPoints(points, target.normalized, width, height, 3);
}
export function buildingChoicesAtPosition(groups, target, deduplicate = true) {
  if (!validPosition(target?.normalized)) return [];
  const matches = [target, ...groups.filter(group => group.key !== target.key && group.terrainId === target.terrainId && validPosition(group.normalized) && Math.abs(group.normalized.x - target.normalized.x) < 0.000001 && Math.abs(group.normalized.y - target.normalized.y) < 0.000001)];
  if (!deduplicate) return matches.flatMap(group => group.entries.filter(entry => entry.kind === 'building'));
  const choices = new Map();
  for (const group of matches) for (const entry of group.entries) if (entry.kind === 'building' && !choices.has(entry.sourceId)) choices.set(entry.sourceId, entry);
  return [...choices.values()];
}
export function pointChoiceContext(clues, target, groups) {
  const kind = target.entries[0].kind, role = target.entries[0].role || null;
  return { ...clues, observations: (clues.observations || []).filter(observation => {
    if (id(observation.terrainId) !== id(target.terrainId) || observation.kind !== kind || (observation.role || null) !== role) return true;
    if (id(observation.attachId) === id(target.attachId)) return false;
    if (kind !== 'building') return true;
    const other = groups.find(group => id(group.terrainId) === id(observation.terrainId) && id(group.attachId) === id(observation.attachId));
    return !validPosition(other?.normalized) || !validPosition(target.normalized) || Math.abs(other.normalized.x - target.normalized.x) >= 0.000001 || Math.abs(other.normalized.y - target.normalized.y) >= 0.000001;
  }) };
}
export function possiblePointChoices(patterns, clues, choices, definitions) {
  const remaining = findCandidates(patterns, clues, definitions);
  return choices.filter(choice => remaining.some(pattern => evaluatePattern(pattern, { observations: [choice] }, definitions).matches));
}
export function withoutPointObservations(observations, point) {
  return observations.filter(item => id(item.terrainId) !== id(point.terrainId) || id(item.attachId) !== id(point.attachId));
}
export function confirmedBuildingKeys(patterns, terrainId, definitions) {
  const relevant = patterns.filter(pattern => pattern.terrain?.state !== 'known' || id(pattern.terrain.value) === id(terrainId));
  if (!relevant.length) return new Set();
  const entries = collectLayers(relevant, definitions).filter(entry => entry.kind === 'building' && entry.common && validPosition(entry.normalized) && entry.terrainId === id(terrainId));
  return new Set(entries.filter(entry => relevant.every(pattern => {
    const point = pattern.points?.find(item => id(item.attachId) === entry.attachId);
    const buildings = point?.features?.filter(feature => feature.kind === 'building' && (feature.state !== 'known' || namedDefinition(definitions.features?.[id(feature.sourceId)]))) || [];
    return pattern.terrain?.state === 'known' && point?.coverage?.building === 'known' && buildings.length > 0 && buildings.every(feature => feature.state === 'known' && id(feature.sourceId) === entry.sourceId);
  })).map(entry => JSON.stringify([entry.terrainId, entry.attachId, entry.sourceId])));
}
export function confirmedFieldEliteKeys(patterns, terrainId, definitions) {
  const relevant = patterns.filter(pattern => pattern.terrain?.state !== 'known' || id(pattern.terrain.value) === id(terrainId));
  if (!relevant.length) return new Set();
  return new Set(collectLayers(relevant, definitions).filter(entry => entry.role === FIELD_ELITE_ROLE && entry.common && entry.terrainId === id(terrainId) && validPosition(entry.normalized) && relevant.every(pattern => {
    const point = pattern.points?.find(item => id(item.attachId) === entry.attachId);
    const features = point?.features?.filter(feature => feature.role === FIELD_ELITE_ROLE) || [];
    return pattern.terrain?.state === 'known' && point?.coverage?.fieldElite === 'known' && features.length > 0 && features.every(feature => feature.state === 'known' && feature.kind === 'monster' && id(feature.sourceId) === entry.sourceId);
  })).map(entry => JSON.stringify([entry.terrainId, entry.attachId, entry.sourceId])));
}
// Keep native positions; dense markers shrink and expose their names on interaction.
export function layoutMapMarkers(groups, width, height) {
  return groups.map(group => ({ ...group, markerX: group.normalized.x * width, markerY: group.normalized.y * height,
    dense: groups.some(other => other.key !== group.key && Math.hypot((other.normalized.x - group.normalized.x) * width, (other.normalized.y - group.normalized.y) * height) < 44),
  }));
}
export function calibratedPointDirectory(patterns) {
  const points = new Map();
  for (const pattern of patterns) {
    if (pattern.terrain?.state !== 'known' || !hasValue(pattern.terrain.value)) continue;
    for (const point of pattern.points || []) {
      if (!hasValue(point.attachId) || !validPosition(point.normalized)) continue;
      const terrainId = id(pattern.terrain.value), attachId = id(point.attachId), key = JSON.stringify([terrainId, attachId]);
      if (!points.has(key)) points.set(key, { key, terrainId, attachId, normalized: { ...point.normalized }, conflict: false });
      const saved = points.get(key);
      if (Math.abs(saved.normalized.x - point.normalized.x) > .000001 || Math.abs(saved.normalized.y - point.normalized.y) > .000001) saved.conflict = true;
    }
  }
  const result = new Map(), counters = new Map();
  [...points.values()].filter(point => !point.conflict).sort((a, b) => a.terrainId.localeCompare(b.terrainId, 'en', { numeric: true }) || a.attachId.localeCompare(b.attachId, 'en', { numeric: true })).forEach(({ conflict, ...point }) => {
    const number = (counters.get(point.terrainId) || 0) + 1;
    counters.set(point.terrainId, number); result.set(point.key, { ...point, number });
  });
  return result;
}
