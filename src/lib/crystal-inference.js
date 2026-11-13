// A crystal group is selected independently of the map pattern and Nightlord.
export function inferCrystalPoints(randomGroups, observedKeys) {
  const observed = new Set(observedKeys);
  const groups = randomGroups.map(group => group.pointKeys)
    .filter(keys => [...observed].every(key => keys.includes(key)));
  const possible = new Set(groups.flat());
  const certain = new Set((groups[0] || []).filter(key =>
    !observed.has(key) && groups.every(keys => keys.includes(key))));
  return { possible, certain, candidateCount: groups.length };
}
