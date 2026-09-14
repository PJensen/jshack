import { applyStatusEffect } from './effects.js';

export function applyWandStasis(world, targetId) {
  const id = Number(targetId || 0) | 0;
  if (!(id > 0) || !world?.isAlive?.(id)) return false;
  applyStatusEffect(world, id, {
    key: 'stasis',
    turnsLeft: 20,
    stacks: 1,
    potency: 1,
  });
  return true;
}
