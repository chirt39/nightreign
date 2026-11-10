export const FEATURE_KINDS = ['building', 'monster', 'event'];
export const PRIMARY_BOSS_ROLE = 'primarySmallBaseBoss';
export const FIELD_ELITE_ROLE = 'fieldElite';
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
  return points.filter(point => point.filterable === false && point.terrainId === terrainId && ['fieldElite', 'baseBoss'].includes(point.displayCategory) && visibility[point.displayCategory] && validPosition(point.normalized)).map(point => ({
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
      const key = JSON.stringify([terrainId, id(point.attachId), feature.kind, id(feature.sourceId), feature.role || null]);
      if (!entries.has(key)) entries.set(key, { key, terrainId, attachId: id(point.attachId), kind: feature.kind, role: feature.role || null, displayCategory: displayCategory(feature, definition), sourceId: id(feature.sourceId), name: definition.nameZh, normalized: validPosition(point.normalized) ? { ...point.normalized } : null, members: new Set(), positionConsistent: true });
      const entry = entries.get(key);
      entry.members.add(patternIndex);
      if (!validPosition(point.normalized) || !entry.normalized || Math.abs(point.normalized.x - entry.normalized.x) > 0.000001 || Math.abs(point.normalized.y - entry.normalized.y) > 0.000001) entry.positionConsistent = false;
    }
  });
  return [...entries.values()].map(({ members, positionConsistent, ...entry }) => ({ ...entry, normalized: positionConsistent ? entry.normalized : null, common: entry.terrainId !== null && members.size === patterns.length, candidateCount: members.size }));
}
export function nearbyPoints(points, click, width, height, tolerance = 24) {
  if (!validPosition(click) || !(width > 0) || !(height > 0)) return [];
  return points.filter(point => validPosition(point.normalized)).map(point => ({ ...point, distance: Math.hypot((point.normalized.x - click.x) * width, (point.normalized.y - click.y) * height) })).filter(point => point.distance <= tolerance).sort((a, b) => a.distance - b.distance);
}
// Spread overlapping hit targets on the map while retaining their true coordinates.
export function layoutMapMarkers(groups, width, height) {
  const placed = [];
  return groups.map(group => {
    const origin = { x: group.normalized.x * width, y: group.normalized.y * height };
    let position = origin;
    // Labels are at most 100px wide below a 44px hit target; include both and a gap.
    for (let attempt = 0; placed.some(other => Math.abs(other.x - position.x) < 112 && Math.abs(other.y - position.y) < 64) && attempt < 200; attempt++) {
      const angle = attempt * 2.4, radius = 64 * Math.sqrt(1 + attempt / 4);
      position = { x: Math.max(56, Math.min(width - 56, origin.x + Math.cos(angle) * radius)), y: Math.max(24, Math.min(height - 40, origin.y + Math.sin(angle) * radius)) };
    }
    placed.push(position);
    return { ...group, markerX: position.x, markerY: position.y, offset: position !== origin };
  });
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
