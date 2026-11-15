import { CritRandomizerState } from "../components/CritRandomizerState.js";

const MAX_BAG_SIZE = 100;

function stateKeys(kind) {
  return kind === "spell"
    ? { chance: "spellChance", crits: "spellCritsRemaining", nonCrits: "spellNonCritsRemaining" }
    : { chance: "physicalChance", crits: "physicalCritsRemaining", nonCrits: "physicalNonCritsRemaining" };
}

function buildBag(chance) {
  const bounded = Math.max(0.0001, Math.min(0.9999, Number(chance) || 0));
  const tolerance = Math.max(0.005, bounded * 0.03);
  for (let size = 2; size <= MAX_BAG_SIZE; size++) {
    const crits = Math.max(1, Math.min(size - 1, Math.round(bounded * size)));
    if (Math.abs((crits / size) - bounded) <= tolerance) {
      return { crits, nonCrits: size - crits };
    }
  }
  const crits = Math.max(1, Math.min(MAX_BAG_SIZE - 1, Math.round(bounded * MAX_BAG_SIZE)));
  return { crits, nonCrits: MAX_BAG_SIZE - crits };
}

function normalizedChance(chance) {
  return Math.max(0, Math.min(1, Number(chance) || 0));
}

function resetBag(state, keys, chance) {
  const bag = buildBag(chance);
  state[keys.chance] = chance;
  state[keys.crits] = bag.crits;
  state[keys.nonCrits] = bag.nonCrits;
}

/** @param {import('../../lib/ecs-js/index.js').World} world */
export function rollBaggedCrit(world, actorId, kind, chance, rng, forcedCrit = false) {
  const resolvedChance = normalizedChance(chance);
  if (!(actorId > 0)) return forcedCrit || (resolvedChance >= 1) || (resolvedChance > 0 && rng() < resolvedChance);
  let state = world.get(actorId, CritRandomizerState);
  if (!state) {
    world.add(actorId, CritRandomizerState, {});
    state = world.get(actorId, CritRandomizerState);
  }
  const keys = stateKeys(kind);

  if (forcedCrit) {
    state[keys.chance] = -1;
    state[keys.crits] = 0;
    state[keys.nonCrits] = 0;
    return true;
  }
  if (resolvedChance >= 1) {
    state[keys.chance] = -1;
    state[keys.crits] = 0;
    state[keys.nonCrits] = 0;
    return true;
  }
  if (!(resolvedChance > 0)) {
    state[keys.chance] = -1;
    state[keys.crits] = 0;
    state[keys.nonCrits] = 0;
    return false;
  }

  if (state[keys.chance] !== resolvedChance
      || (!(state[keys.crits] > 0) && !(state[keys.nonCrits] > 0))) {
    resetBag(state, keys, resolvedChance);
  }

  const total = state[keys.crits] + state[keys.nonCrits];
  const isCrit = state[keys.crits] > 0 && rng() * total < state[keys.crits];
  if (isCrit) state[keys.crits]--;
  else state[keys.nonCrits]--;
  return isCrit;
}
