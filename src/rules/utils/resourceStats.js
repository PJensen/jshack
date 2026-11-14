import { Encumbrance } from "../components/Encumbrance.js";
import { Mana } from "../components/Mana.js";
import { Stamina } from "../components/Stamina.js";
import { Vitality } from "../components/Vitality.js";
import { HUNGER_MANA_MULT } from "../data/food.js";
import {
  HEAVY_STAMINA_REGEN_MULTIPLIER,
  OVERLOADED_STAMINA_REGEN_MULTIPLIER,
} from "../data/encumbranceTuning.js";
import { getResolvedStats } from "./derivedStats.js";
import { getPassiveBonuses } from "./passiveBonuses.js";
import { statusStrength } from "./statusFacade.js";

const RESOURCE_CONFIG = Object.freeze({
  health: Object.freeze({
    component: Vitality,
    currentKey: "hp",
    maxKey: "maxHp",
    maxBonusKey: "maxHpDerived",
    regenKey: null,
    regenBonusKey: null,
  }),
  mana: Object.freeze({
    component: Mana,
    currentKey: "mana",
    maxKey: "maxMana",
    maxBonusKey: "maxManaDerived",
    regenKey: "manaRegen",
    regenBonusKey: "manaRegenDerived",
  }),
  stamina: Object.freeze({
    component: Stamina,
    currentKey: "stamina",
    maxKey: "maxStamina",
    maxBonusKey: "maxStaminaDerived",
    regenKey: "staminaRegen",
    regenBonusKey: "staminaRegenDerived",
  }),
});

function resolveRecoveryMultiplier(world, entityId, resource) {
  if (resource === "mana") {
    let multiplier = 1;
    const reasons = [];
    for (const [status, value] of Object.entries(HUNGER_MANA_MULT)) {
      if (statusStrength(world, entityId, status) <= 0) continue;
      const next = Math.min(multiplier, Number(value));
      if (next < multiplier) multiplier = next;
      reasons.push(status);
    }
    return { multiplier, reasons };
  }

  if (resource === "stamina") {
    const encumbrance = world.get(entityId, Encumbrance);
    if (encumbrance?.overloaded) {
      return { multiplier: OVERLOADED_STAMINA_REGEN_MULTIPLIER, reasons: ["overloaded"] };
    }
    if (encumbrance?.heavilyLoaded) {
      return { multiplier: HEAVY_STAMINA_REGEN_MULTIPLIER, reasons: ["heavilyLoaded"] };
    }
  }

  return { multiplier: 1, reasons: [] };
}

/**
 * Resolve the authoritative read model for one actor resource.
 *
 * `nominalRecovery` is the capability before temporary context modifiers.
 * `effectiveRecovery` is what the next eligible regeneration tick can apply.
 * This is read-only; resource systems remain responsible for mutation and
 * cooldown countdowns.
 *
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} entityId
 * @param {"health"|"mana"|"stamina"} resource
 */
export function resolveResourceStats(world, entityId, resource) {
  const id = Number(entityId || 0) | 0;
  const key = String(resource || "").toLowerCase();
  const config = RESOURCE_CONFIG[key];
  if (!config || !(id > 0)) return null;

  const component = world.get(id, config.component);
  if (!component) return null;

  const passive = getPassiveBonuses(world, id);
  const resolved = getResolvedStats(world, id);
  const current = Number(component[config.currentKey] || 0);
  const baseMax = Number(component[config.maxKey] || 0);
  const maxBonus = Number(passive?.[config.maxBonusKey] || 0);
  const max = baseMax + maxBonus;
  const cooldown = Math.max(0, Number(component.regenCooldown || 0));
  const baseRecovery = config.regenKey ? Number(component[config.regenKey] || 0) : 0;
  const passiveRecovery = config.regenBonusKey ? Number(passive?.[config.regenBonusKey] || 0) : 0;
  const derivedRecovery = config.regenKey ? Number(resolved?.[config.regenKey] || 0) : 0;
  const nominalRecovery = Math.max(0, baseRecovery + passiveRecovery + derivedRecovery);
  const context = resolveRecoveryMultiplier(world, id, key);
  const effectiveRecovery = cooldown > 0 ? 0 : nominalRecovery * context.multiplier;
  const suppressionReasons = cooldown > 0
    ? ["cooldown", ...context.reasons]
    : context.reasons;

  return Object.freeze({
    resource: key,
    entityId: id,
    current,
    baseMax,
    maxBonus,
    max,
    baseRecovery,
    passiveRecovery,
    derivedRecovery,
    nominalRecovery,
    recoveryMultiplier: context.multiplier,
    effectiveRecovery,
    regenCooldown: cooldown,
    recoverySuppressed: suppressionReasons.length > 0,
    suppressionReasons: Object.freeze(suppressionReasons),
  });
}
