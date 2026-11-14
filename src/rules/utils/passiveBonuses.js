import { ItemInfo } from "../components/ItemInfo.js";
import { Equipment, NON_AMMO_GEAR_SLOTS } from "../components/Equipment.js";
import { Hamingja } from "../components/Hamingja.js";
import { getAffixPassiveRefs } from "../data/affixes.js";
import { runScript, ScriptVerb } from "../scripting.js";

export const PASSIVE_BONUS_DEFAULTS = Object.freeze({
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
});

const PASSIVE_BONUSES_DEFINED = Symbol.for("jshack:passiveBonuses:virtuals:defined");
const PASSIVE_BONUSES_VIRTUAL = Symbol.for("jshack:passiveBonuses:PassiveBonuses");

const BONUS_KEY_MAP = Object.freeze({
  dexterity: "dexterityDerived",
  accuracy: "accuracyDerived",
  damagePower: "damagePowerDerived",
  physicalPenetration: "physicalPenetrationDerived",
  bluntPenetration: "bluntPenetrationDerived",
  slashPenetration: "slashPenetrationDerived",
  piercePenetration: "piercePenetrationDerived",
  evade: "evadeDerived",
  mitigation: "mitigationDerived",
  spellPower: "spellPowerDerived",
  maxHp: "maxHpDerived",
  critChance: "critChanceDerived",
  critMult: "critMultDerived",
  manaRegen: "manaRegenDerived",
  maxMana: "maxManaDerived",
  staminaRegen: "staminaRegenDerived",
  maxStamina: "maxStaminaDerived",
  kineticDR: "kineticDRDerived",
  fireResist: "fireResistDerived",
  coldResist: "coldResistDerived",
  poisonResist: "poisonResistDerived",
  acidResist: "acidResistDerived",
  radiationResist: "radiationResistDerived",
  electricOhms: "electricOhmsDerived",
  bluntResist: "bluntResistDerived",
  slashResist: "slashResistDerived",
  pierceResist: "pierceResistDerived",
  luck: "luckDerived",
  spellHit: "spellHitDerived",
  spellAvoid: "spellAvoidDerived",
  spellRadius: "spellRadiusDerived",
  visionRange: "visionRangeDerived",
  hungerRate: "hungerRateDerived",
  polymorphControl: "polymorphControlDerived",
  polymorphPower: "polymorphPowerDerived",
  polymorphResistance: "polymorphResistanceDerived",
  polymorphStability: "polymorphStabilityDerived",
});

function createPassiveBonusBag() {
  return { ...PASSIVE_BONUS_DEFAULTS };
}

function normalizeBonusKey(key) {
  const normalized = String(key || "");
  if (Object.prototype.hasOwnProperty.call(PASSIVE_BONUS_DEFAULTS, normalized)) return normalized;
  return BONUS_KEY_MAP[normalized] || "";
}

function addPassiveBonus(acc, key, value) {
  const derivedKey = normalizeBonusKey(key);
  if (!derivedKey) return;
  const num = Number(value);
  if (!Number.isFinite(num)) return;
  acc[derivedKey] += num;
}

function markAndAddPassiveBonus(acc, touched, key, value) {
  const normalized = String(key || "");
  if (normalized === "attack") {
    touched.add("accuracyDerived");
    touched.add("damagePowerDerived");
    addPassiveBonus(acc, "accuracyDerived", value);
    addPassiveBonus(acc, "damagePowerDerived", value);
    return;
  }
  if (normalized === "defense") {
    touched.add("evadeDerived");
    addPassiveBonus(acc, "evadeDerived", value);
    return;
  }
  const derivedKey = normalizeBonusKey(key);
  if (!derivedKey) return;
  touched.add(derivedKey);
  addPassiveBonus(acc, derivedKey, value);
}

function applyItemBonuses(acc, touched, bonuses) {
  if (!bonuses || typeof bonuses !== "object") return;
  for (const [key, value] of Object.entries(bonuses)) {
    markAndAddPassiveBonus(acc, touched, key, value);
  }
}

function runAffixPassives(world, acc, touched, entityId, itemId, affixIds) {
  for (let i = 0; i < (affixIds || []).length; i++) {
    const aId = affixIds[i];
    const passiveRefs = getAffixPassiveRefs(aId);
    for (let j = 0; j < passiveRefs.length; j++) {
      runScript(passiveRefs[j], ScriptVerb.AffixPassive, world, {
        world,
        entityId,
        itemId,
        addBonus: (key, value) => markAndAddPassiveBonus(acc, touched, key, value),
      });
    }
  }
}

export function resolvePassiveBonuses(world, entityId, options = {}) {
  const id = Number(entityId || 0) | 0;
  const acc = createPassiveBonusBag();
  if (!(id > 0) || !world?.isAlive?.(id)) return Object.freeze(acc);

  const touched = new Set();
  const eq = options.equipmentOverride || world.get(id, Equipment);

  if (eq) {
    for (let i = 0; i < NON_AMMO_GEAR_SLOTS.length; i++) {
      const slot = NON_AMMO_GEAR_SLOTS[i];
      const itemId = Number(eq[slot] || 0) | 0;
      if (!(itemId > 0) || !world.isAlive(itemId)) continue;
      const info = world.get(itemId, ItemInfo);
      if (!info) continue;
      applyItemBonuses(acc, touched, info.bonuses);
      runAffixPassives(world, acc, touched, id, itemId, info.affixes);
    }

    const keys = Object.keys(PASSIVE_BONUS_DEFAULTS);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (touched.has(key)) continue;
      addPassiveBonus(acc, key, eq[key]);
    }
  }

  const hamingja = world.get(id, Hamingja);
  if (hamingja) addPassiveBonus(acc, "luck", hamingja.luck);

  return Object.freeze(acc);
}

export function definePassiveBonusVirtuals(world) {
  if (world[PASSIVE_BONUSES_DEFINED]) return;
  if (typeof world?.defineVirtual !== "function" || typeof world?.vget !== "function") {
    throw new Error("definePassiveBonusVirtuals: installVirtuals(world) must run first");
  }
  world[PASSIVE_BONUSES_DEFINED] = true;
  world[PASSIVE_BONUSES_VIRTUAL] = world.defineVirtual("PassiveBonuses", (w, id) => resolvePassiveBonuses(w, id));
}

export function getPassiveBonusesVirtual(world) {
  return world?.[PASSIVE_BONUSES_VIRTUAL] || null;
}

export function getPassiveBonuses(world, entityId, options = {}) {
  if (options.equipmentOverride) return resolvePassiveBonuses(world, entityId, options);
  const Virtual = getPassiveBonusesVirtual(world);
  if (Virtual && typeof world?.vget === "function") return world.vget(entityId, Virtual);
  return resolvePassiveBonuses(world, entityId);
}

/**
 * Effective maximum HP = base Vitality.maxHp + equipment maxHpDerived bonus.
 * Mirrors how maxMana/maxStamina are handled in regen systems.
 * @param {any} world
 * @param {number} entityId
 * @param {{ maxHp: number }} [vit] - pre-fetched Vitality (avoids double-lookup when caller already has it)
 * @returns {number}
 */
export function effectiveMaxHp(world, entityId, vit) {
  const baseMax = vit ? (vit.maxHp | 0) : 0;
  const passive = getPassiveBonuses(world, entityId);
  return baseMax + Number(passive?.maxHpDerived ?? 0);
}

export function effectiveMaxMana(world, entityId, mana) {
  const baseMax = mana ? (Number(mana.maxMana) | 0) : 0;
  const passive = getPassiveBonuses(world, entityId);
  return baseMax + Number(passive?.maxManaDerived ?? 0);
}

export function effectiveMaxStamina(world, entityId, stamina) {
  const baseMax = stamina ? (Number(stamina.maxStamina) | 0) : 0;
  const passive = getPassiveBonuses(world, entityId);
  return baseMax + Number(passive?.maxStaminaDerived ?? 0);
}
