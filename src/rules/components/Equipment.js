import { defineComponent } from "../../lib/ecs-js/index.js";

export const GEAR_SLOTS = Object.freeze([
  "weapon", "armor", "head", "neck", "belt", "gloves", "offhand", "ring1", "ring2", "legs", "feet", "ammo", "ranged",
]);

export const GEAR_SLOT_SET = Object.freeze(new Set(GEAR_SLOTS));
export const NON_AMMO_GEAR_SLOTS = Object.freeze(
  GEAR_SLOTS.filter((slot) => slot !== "ammo"),
);

/**
 * Resolve the equipped slot name for a specific item id.
 * @param {any} equipment
 * @param {number} itemId
 * @returns {string|null}
 */
export function getEquippedSlot(equipment, itemId) {
  if (!equipment || !Number.isInteger(itemId) || itemId <= 0) return null;
  for (const slot of GEAR_SLOTS) {
    if (equipment[slot] === itemId) return slot;
  }
  return null;
}

export const Equipment = defineComponent('Equipment', {
  weapon: null,
  armor: null,
  head: null,
  neck: null,
  belt: null,
  gloves: null,
  offhand: null,
  ring1: null,
  ring2: null,
  legs: null,
  ammo: null,
  ranged: null,
  feet: null,
  dexterityDerived: 0,
  accuracyDerived: 0,
  damagePowerDerived: 0,
  physicalPenetrationDerived: 0,
  bluntPenetrationDerived: 0,
  slashPenetrationDerived: 0,
  piercePenetrationDerived: 0,
  evadeDerived: 0,
  mitigationDerived: 0,
  spellPowerDerived: 0,
  maxHpDerived: 0,
  critChanceDerived: 0,
  critMultDerived: 0,
  manaRegenDerived: 0,
  maxManaDerived: 0,
  staminaRegenDerived: 0,
  maxStaminaDerived: 0,
  kineticDRDerived: 0,
  fireResistDerived: 0,
  coldResistDerived: 0,
  poisonResistDerived: 0,
  acidResistDerived: 0,
  radiationResistDerived: 0,
  electricOhmsDerived: 0,
  bluntResistDerived: 0,
  slashResistDerived: 0,
  pierceResistDerived: 0,
  luckDerived: 0,
  spellHitDerived: 0,
  spellAvoidDerived: 0,
  spellRadiusDerived: 0,
  visionRangeDerived: 0,
  hungerRateDerived: 0,
  polymorphControlDerived: 0,
  polymorphPowerDerived: 0,
  polymorphResistanceDerived: 0,
  polymorphStabilityDerived: 0,
  naturalDamageDice: null,
  naturalScript: null
});
