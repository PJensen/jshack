import { getPassiveBonuses } from "./passiveBonuses.js";
import { resolveDerivedStats } from "./derivedStats.js";

/**
 * Merge all stat inputs into a canonical stat view for combat/damage consumers.
 * Derived-expression stats are authoritative semantic channels; passive/equipment
 * bonuses are treated as additional input sources to those channels.
 *
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} entityId
 */
export function resolveCanonicalStats(world, entityId) {
  const id = Number(entityId || 0) | 0;
  const resolved = resolveDerivedStats(world, id);
  const passive = getPassiveBonuses(world, id);

  const baseDexterity = Number(resolved?.dexterity || 0);
  const dexterityDerived = Number(passive?.dexterityDerived || 0);
  const totalDexterity = baseDexterity + dexterityDerived;
  const baseDexBonus = Math.floor(Math.max(0, baseDexterity - 10) / 2);
  const totalDexBonus = Math.floor(Math.max(0, totalDexterity - 10) / 2);
  const dexBonusDelta = totalDexBonus - baseDexBonus;

  const accuracyDerived = Number(passive?.accuracyDerived || 0);
  const damagePowerDerived = Number(passive?.damagePowerDerived || 0);
  const physicalPenetrationDerived = Number(passive?.physicalPenetrationDerived || 0);
  const bluntPenetrationDerived = Number(passive?.bluntPenetrationDerived || 0);
  const slashPenetrationDerived = Number(passive?.slashPenetrationDerived || 0);
  const piercePenetrationDerived = Number(passive?.piercePenetrationDerived || 0);
  const evadeDerived = Number(passive?.evadeDerived || 0);
  const mitigationDerived = Number(passive?.mitigationDerived || 0);
  const spellPowerDerived = Number(passive?.spellPowerDerived || 0);
  const critChanceDerived = Number(passive?.critChanceDerived || 0);
  const critMultDerived = Number(passive?.critMultDerived || 0);

  return Object.freeze({
    ...resolved,
    dexterity: totalDexterity,
    accuracy: Number(resolved?.accuracy || 0) + accuracyDerived + dexBonusDelta,
    damagePower: Number(resolved?.damagePower || 0) + damagePowerDerived,
    physicalPenetration: Number(resolved?.physicalPenetration || 0) + physicalPenetrationDerived,
    bluntPenetration: Number(resolved?.bluntPenetration || 0) + bluntPenetrationDerived,
    slashPenetration: Number(resolved?.slashPenetration || 0) + slashPenetrationDerived,
    piercePenetration: Number(resolved?.piercePenetration || 0) + piercePenetrationDerived,
    evade: Number(resolved?.evade || 0) + evadeDerived + dexBonusDelta,
    mitigation: Number(resolved?.mitigation || 0) + mitigationDerived,
    spellPower: Number(resolved?.spellPower || 0) + spellPowerDerived,
    critChancePhysical: Number(resolved?.critChancePhysical || 0) + critChanceDerived + (dexBonusDelta * 0.01),
    critChanceSpell: Number(resolved?.critChanceSpell || 0) + critChanceDerived,
    critMultPhysical: Number(resolved?.critMultPhysical || 0) + critMultDerived,
    critMultSpell: Number(resolved?.critMultSpell || 0) + critMultDerived,
    luck: Number(resolved?.luck || 0) + Number(passive?.luckDerived || 0),
    spellHit: Number(resolved?.spellHit || 0) + Number(passive?.spellHitDerived || 0),
    spellAvoid: Number(resolved?.spellAvoid || 0) + Number(passive?.spellAvoidDerived || 0),
    kineticDR: Number(resolved?.kineticDR || 0) + Number(passive?.kineticDRDerived || 0),
    fireResist: Number(resolved?.fireResist || 0) + Number(passive?.fireResistDerived || 0),
    coldResist: Number(resolved?.coldResist || 0) + Number(passive?.coldResistDerived || 0),
    poisonResist: Number(resolved?.poisonResist || 0) + Number(passive?.poisonResistDerived || 0),
    acidResist: Number(resolved?.acidResist || 0) + Number(passive?.acidResistDerived || 0),
    radiationResist: Number(resolved?.radiationResist || 0) + Number(passive?.radiationResistDerived || 0),
    electricOhms: Number(resolved?.electricOhms || 0) + Number(passive?.electricOhmsDerived || 0),
    bluntResist: Number(resolved?.bluntResist || 0) + Number(passive?.bluntResistDerived || 0),
    slashResist: Number(resolved?.slashResist || 0) + Number(passive?.slashResistDerived || 0),
    pierceResist: Number(resolved?.pierceResist || 0) + Number(passive?.pierceResistDerived || 0),
    spellRadius: Number(resolved?.spellRadius || 0) + Number(passive?.spellRadiusDerived || 0),
    visionRange: Number(resolved?.visionRange || 0) + Number(passive?.visionRangeDerived || 0),
    hungerRate: Number(resolved?.hungerRate || 0) + Number(passive?.hungerRateDerived || 0),
    staminaRegen: Number(resolved?.staminaRegen || 0) + Number(passive?.staminaRegenDerived || 0),
    manaRegen: Number(resolved?.manaRegen || 0) + Number(passive?.manaRegenDerived || 0),
  });
}
