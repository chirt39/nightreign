// Elden Ring's published defense-ratio curve is used as an estimate here.
// Nightreign's exact order and per-channel rounding have not been verified.
export const DAMAGE_DEFENSE_MODEL = Object.freeze({
  status: 'elden-ring-curve-estimate; nightreign-unverified',
  defaultMode: 'pre_defense',
  estimateRequiresOptIn: true,
  input: 'attack is one channel after motion value and pre-defense modifiers',
  order: 'attack / defense ratio, defense attenuation, then target taken rate',
  rounding: 'none; caller may round only after the game-specific rule is verified',
  source: 'https://github.com/dimitrijejankov/er-stats/blob/main/CalculatingDamage.md',
});

export function resolveDamageChannel(attack, defense, takenRate) {
  if (![attack, defense, takenRate].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) return null;
  if (attack === 0) return 0;
  const ratio = defense === 0 ? Infinity : attack / defense;
  const multiplier = ratio < 0.125 ? 0.1
    : ratio < 1 ? 0.1 + (ratio - 0.125) ** 2 / 2.552
      : ratio < 2.5 ? 0.7 - (2.5 - ratio) ** 2 / 7.5
        : ratio < 8 ? 0.9 - (8 - ratio) ** 2 / 151.25
          : 0.9;
  return attack * multiplier * takenRate;
}
