// src/rules/utils/dealDamage.js
// Canonical damage pipeline. ALL damage in the game flows through here.
import { Died } from "../../events/Died.js";
import { Resistances } from "../components/Resistences.js";
import { Vitality } from "../components/Vitality.js";
import { Player } from "../components/Player.js";
import { KnockbackPending } from "../components/KnockbackPending.js";
import { Equipment } from "../components/Equipment.js";
import { Material } from "../components/Material.js";
import { ItemInfo } from "../components/ItemInfo.js";
import { ActiveEffects } from "../components/ActiveEffects.js";
import { isEntityInvulnerable } from "./effectGuards.js";
import { MATERIAL_CATALOG } from "../data/materials.js";
import { ELECTRIC_DAMAGE_TUNING } from "../data/electricDamageTuning.js";
import { createStatusEvent } from "../../shared/events/statusEvent.js";
import { resolveCanonicalStats } from "./canonicalStats.js";
import { createLegacyCombatFrame, runLegacyMonsterHook } from "./legacyAffixDispatch.js";
import { ensureEquippedAffixTopology, evaluateEquippedAffixProcs } from "./affixTopology.js";
import { applyProcAccumulator } from "./procApplication.js";
import { clamp } from "../../shared/math/math.js";
import { getShieldArcMultiplier } from "./combatPositioning.js";
import { consumeShieldGuardStack, refreshShieldGuard } from "./shieldGuard.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { effectStrength, statusStrength } from "./statusFacade.js";
import { Physiology } from "../components/Physiology.js";
import { getMonster } from "../data/monsters.js";
import { resolveWeaponFamily } from "../data/weaponFamilies.js";
import { tryHandlePlayerPseudoDeath } from "./deathModes.js";
import { recordDamageApplied } from "./damageApplied.js";
import { recordDeathApplied } from "./deathApplied.js";
import { applyHealing } from "./applyHealing.js";

function resolveEventWeaponFamily(world, weaponId) {
  if (!(weaponId > 0) || !world.isAlive(weaponId)) return "";
  const info = world.get(weaponId, ItemInfo);
  return String(info?.weaponFamily || resolveWeaponFamily(info || {}) || "");
}

// ── Electric tuning constants (moved from typedDamage.js) ───────────
const BASE_ELECTRIC_OHMS = Number(ELECTRIC_DAMAGE_TUNING.baseOhms);
const BASE_BODY_CONDUCTIVITY = Number(ELECTRIC_DAMAGE_TUNING.baseBodyConductivity);
const RESIST_MULTIPLIER_MIN = Number(ELECTRIC_DAMAGE_TUNING.resistMultiplierMin);
const RESIST_MULTIPLIER_MAX = Number(ELECTRIC_DAMAGE_TUNING.resistMultiplierMax);
const CONDUCTIVITY_SCALE = Number(ELECTRIC_DAMAGE_TUNING.conductivityScale);
const CONDUCTIVITY_MULTIPLIER_MIN = Number(ELECTRIC_DAMAGE_TUNING.conductivityMultiplierMin);
const CONDUCTIVITY_MULTIPLIER_MAX = Number(ELECTRIC_DAMAGE_TUNING.conductivityMultiplierMax);
const SLOT_WEIGHT_TABLE = Object.entries(ELECTRIC_DAMAGE_TUNING.slotWeights || {});

const MATERIAL_CONDUCTIVITY = new Map(
  MATERIAL_CATALOG.map((row) => [String(row?.id || ""), Number(row?.Material?.conductivity ?? BASE_BODY_CONDUCTIVITY)]),
);

// ── Electric resistance helpers (moved from typedDamage.js) ─────────

/** @param {any} resist */
export function electricMultiplier(resist) {
  const ohms = Number(resist?.electric?.ohms);
  if (ohms === Infinity) return 0;
  if (!Number.isFinite(ohms)) return 1;
  if (ohms <= 0) return RESIST_MULTIPLIER_MAX;
  return clamp(BASE_ELECTRIC_OHMS / ohms, RESIST_MULTIPLIER_MIN, RESIST_MULTIPLIER_MAX);
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} targetId
 */
export function equippedConductivityMultiplier(world, targetId) {
  const eq = world.get(targetId, Equipment);
  if (!eq) return 1;
  let weighted = 0;
  let totalWeight = 0;
  for (let i = 0; i < SLOT_WEIGHT_TABLE.length; i++) {
    const [slot, rawWeight] = SLOT_WEIGHT_TABLE[i];
    const weight = Number(rawWeight);
    if (!(weight > 0)) continue;
    const itemId = Number(eq[slot] || 0) | 0;
    if (!(itemId > 0) || !world.isAlive(itemId)) continue;
    const mat = world.get(itemId, Material);
    const kind = String(mat?.kind || "");
    if (!kind) continue;
    const conductivity = MATERIAL_CONDUCTIVITY.has(kind)
      ? Number(MATERIAL_CONDUCTIVITY.get(kind))
      : BASE_BODY_CONDUCTIVITY;
    if (!Number.isFinite(conductivity)) continue;
    weighted += conductivity * weight;
    totalWeight += weight;
  }
  if (totalWeight <= 0) return 1;
  const avgConductivity = weighted / totalWeight;
  return clamp(
    1 + (avgConductivity - BASE_BODY_CONDUCTIVITY) * CONDUCTIVITY_SCALE,
    CONDUCTIVITY_MULTIPLIER_MIN,
    CONDUCTIVITY_MULTIPLIER_MAX,
  );
}

// ── Active-effect resist bonus ───────────────────────────────────────
/** Sum raw potency of active resist effects matching the given key. */
function activeResistBonus(world, targetId, effectKey) {
  const ae = world.get(targetId, ActiveEffects);
  if (!ae || !Array.isArray(ae.effects)) return 0;
  let total = 0;
  for (let i = 0; i < ae.effects.length; i++) {
    const e = ae.effects[i];
    if (!e || e.key !== effectKey) continue;
    if (Number.isInteger(e.onsetLeft) && e.onsetLeft > 0) continue;
    if (!((e.turnsLeft | 0) > 0)) continue;
    total += Number(e.potency) || 0;
  }
  return total;
}

function activeEffectMetaValue(world, targetId, effectKey, field) {
  const ae = world.get(targetId, ActiveEffects);
  if (!ae || !Array.isArray(ae.effects)) return 0;
  for (let i = 0; i < ae.effects.length; i++) {
    const e = ae.effects[i];
    if (!e || e.key !== effectKey) continue;
    if (Number.isInteger(e.onsetLeft) && e.onsetLeft > 0) continue;
    if (!((e.turnsLeft | 0) > 0)) continue;
    return Math.max(0, Number(e.meta?.[field] || 0));
  }
  return 0;
}

// ── Resistance resolution ───────────────────────────────────────────

/**
 * Resolve final damage after applying type-based resistances.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} targetId
 * @param {number} rawAmount
 * @param {string} type
 * @param {number} [armorPenetration=0]
 * @returns {number}
 */
export function resolveResistance(world, targetId, rawAmount, type, armorPenetration = 0) {
  const resist = world.get(targetId, Resistances);
  if (!resist) return rawAmount;

  const resolved = resolveCanonicalStats(world, targetId);
  const penetration = Math.max(0, Number(armorPenetration || 0));

  const applyKineticChip = (value, multiplier = 1) => {
    if (!(rawAmount > 0)) return 0;
    if (!(multiplier > 0)) return 0;
    return Math.max(1, Math.max(0, Math.floor(Number(value) || 0)));
  };

  switch (type) {
    case 'electric':
    case 'plasma':
    case 'lightning': {
      const potionOhms = activeResistBonus(world, targetId, "resist_electric") * 1000;
      const wardOhms = effectStrength(world, targetId, "harmony_ward") * 1000;
      const ohmBonus = Number(resolved?.electricOhms ?? 0) + potionOhms + wardOhms;
      const baseOhms = resist?.electric?.ohms;
      const effectiveOhms = baseOhms === Infinity ? Infinity
        : (Number.isFinite(baseOhms) ? baseOhms + ohmBonus : ohmBonus);
      const rMult = electricMultiplier({ electric: { ohms: effectiveOhms } });
      if (rMult <= 0) return 0;
      const gMult = equippedConductivityMultiplier(world, targetId);
      return Math.max(0, Math.floor(rawAmount * rMult * gMult));
    }
    case 'blunt': {
      const drBonus = Number(resolved?.mitigation ?? 0) + Number(resolved?.kineticDR ?? 0);
      const multBonus = Number(resolved?.bluntResist ?? 0);
      const spectral = activeResistBonus(world, targetId, "spectral_form");
      const effectiveDR = Math.max(0, ((resist.kinetic?.DR || 0) + drBonus) - penetration);
      const afterDR = Math.max(0, rawAmount - effectiveDR);
      const effectiveMult = Math.max(0, (resist.kinetic?.bluntMult ?? 1.0) - multBonus);
      const afterMult = afterDR * effectiveMult;
      return applyKineticChip(spectral > 0 ? Math.floor(afterMult * 0.5) : afterMult, effectiveMult);
    }
    case 'slash': {
      const drBonus = Number(resolved?.mitigation ?? 0) + Number(resolved?.kineticDR ?? 0);
      const multBonus = Number(resolved?.slashResist ?? 0);
      const spectral = activeResistBonus(world, targetId, "spectral_form");
      const effectiveDR = Math.max(0, ((resist.kinetic?.DR || 0) + drBonus) - penetration);
      const afterDR = Math.max(0, rawAmount - effectiveDR);
      const effectiveMult = Math.max(0, (resist.kinetic?.slashMult ?? 1.0) - multBonus);
      const afterMult = afterDR * effectiveMult;
      return applyKineticChip(spectral > 0 ? Math.floor(afterMult * 0.5) : afterMult, effectiveMult);
    }
    case 'pierce': {
      const drBonus = Number(resolved?.mitigation ?? 0) + Number(resolved?.kineticDR ?? 0);
      const multBonus = Number(resolved?.pierceResist ?? 0);
      const spectral = activeResistBonus(world, targetId, "spectral_form");
      const effectiveDR = Math.max(0, ((resist.kinetic?.DR || 0) + drBonus) - penetration);
      const afterDR = Math.max(0, rawAmount - effectiveDR);
      const effectiveMult = Math.max(0, (resist.kinetic?.pierceMult ?? 1.0) - multBonus);
      const afterMult = afterDR * effectiveMult;
      return applyKineticChip(spectral > 0 ? Math.floor(afterMult * 0.5) : afterMult, effectiveMult);
    }
    case 'physical': {
      const drBonus = Number(resolved?.mitigation ?? 0) + Number(resolved?.kineticDR ?? 0);
      const spectral = activeResistBonus(world, targetId, "spectral_form");
      const effectiveDR = Math.max(0, ((resist.kinetic?.DR || 0) + drBonus) - penetration);
      const afterDR = rawAmount - effectiveDR;
      const afterSpectral = spectral > 0 ? Math.floor(afterDR * 0.5) : afterDR;
      return applyKineticChip(afterSpectral, 1);
    }
    case 'fire': {
      const bonus = Number(resolved?.fireResist ?? 0)
        + activeResistBonus(world, targetId, "resist_fire")
        + effectStrength(world, targetId, "harmony_ward")
        + activeResistBonus(world, targetId, "fire_blood")
        + activeResistBonus(world, targetId, "frost_blood");
      const effectiveMult = Math.max(0, (resist.thermal?.burnMult ?? 1.0) - bonus);
      return Math.max(0, Math.floor(rawAmount * effectiveMult));
    }
    case 'cold':
    case 'frost': {
      const bonus = Number(resolved?.coldResist ?? 0)
        + activeResistBonus(world, targetId, "resist_cold")
        + activeResistBonus(world, targetId, "frost_blood");
      const effectiveMult = Math.max(0, 1.0 - bonus);
      return Math.max(0, Math.floor(rawAmount * effectiveMult));
    }
    case 'poison': {
      const bonus = Number(resolved?.poisonResist ?? 0)
        + activeResistBonus(world, targetId, "resist_poison")
        + effectStrength(world, targetId, "harmony_ward");
      const effectiveMult = Math.max(0, (resist.chemical?.toxMult ?? 1.0) - bonus);
      return Math.max(0, Math.floor(rawAmount * effectiveMult));
    }
    case 'acid': {
      const bonus = Number(resolved?.acidResist ?? 0)
        + activeResistBonus(world, targetId, "resist_acid")
        + effectStrength(world, targetId, "harmony_ward");
      const effectiveMult = Math.max(0, (resist.chemical?.acidMult ?? 1.0) - bonus);
      return Math.max(0, Math.floor(rawAmount * effectiveMult));
    }
    case 'radiation': {
      const bonus = Number(resolved?.radiationResist ?? 0);
      const effectiveMult = Math.max(0, (resist.radiation?.gamma ?? 1.0) - bonus);
      return Math.max(0, Math.floor(rawAmount * effectiveMult));
    }
    default:
      return rawAmount;
  }
}

// ── The pipeline ────────────────────────────────────────────────────

/**
 * @typedef {Object} DamageSpec
 * @property {number}  target              - Entity ID receiving damage
 * @property {number}  amount              - Raw damage (pre-resistance)
 * @property {number}  [source=0]          - Entity ID that caused damage (0 = environmental)
 * @property {string}  [type='physical']   - Damage type for resistance resolution
 * @property {string}  [cause]             - Human-readable cause for messages
 * @property {{x:number,y:number}} [at]    - Override position for floating text
 * @property {boolean} [critical=false]    - Mark as critical hit
 * @property {boolean} [bypassInvuln=false]- Skip invulnerability check
 * @property {boolean} [bypassResist=false]- Skip resistance resolution
 * @property {boolean} [noTrigger=false]   - Suppress affix/hook triggers (prevents retaliate loops)
 * @property {boolean} [missed=false]      - Spell or attack missed before damage was applied
 * @property {number}  [hitChancePct=0]    - Hit chance used for miss reporting
 * @property {string}  [spellId=""]        - Spell id for spell-miss reporting
 * @property {{dx:number,dy:number,force:number}} [knockback] - Push target after damage is applied.
 * @property {boolean} [offhand=false]     - Mark as off-hand hit (for display layer)
 * @property {number}  [projectileDelay=0] - Seconds before float text appears (projectile travel time)
 * @property {number}  [armorPenetration=0]- Reduces effective kinetic DR for this hit
 * @property {{dx:number,dy:number}} [impactVector] - Normalized travel direction for impact VFX
 * @property {string} [projectileKind=""]  - Optional projectile classifier for display VFX (e.g. 'arrow')
 * @property {{weaponClass?:string,weaponLengthCm?:number,weaponVfxProfile?:string|object,attackKind?:string,offhand?:boolean}} [impactProfile] - Optional melee impact profile for display VFX
 */

/**
 * @typedef {Object} DamageResult
 * @property {boolean} applied  - Whether HP was deducted
 * @property {boolean} killed   - Whether target reached 0 HP
 * @property {number}  amount   - Final damage dealt (after resistances)
 * @property {number}  rawAmount- Original damage before resistances
 * @property {string}  reason   - 'applied' | 'invalid-target' | 'no-vitality' | 'zero-amount' | 'missed' | 'invulnerable' | 'resisted'
 */

const ZERO_RESULT = Object.freeze({ applied: false, killed: false, amount: 0, rawAmount: 0 });

/**
 * Canonical damage pipeline. ALL damage in the game flows through here.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {DamageSpec} spec
 * @returns {DamageResult}
 */
export function dealDamage(world, spec) {
  const target = Number(spec.target || 0) | 0;
  if (!(target > 0) || !world.isAlive(target)) {
    return { ...ZERO_RESULT, reason: 'invalid-target' };
  }

  const vit = world.get(target, Vitality);
  if (!vit || (vit.hp | 0) <= 0) {
    return { ...ZERO_RESULT, reason: 'no-vitality' };
  }

  const rawAmount = Math.max(0, Number(spec.amount || 0) | 0);
  if (rawAmount <= 0) {
    return { ...ZERO_RESULT, reason: 'zero-amount' };
  }

  const source = Number(spec.source || 0) | 0;
  const type = String(spec.type || 'physical').toLowerCase();
  const armorPenetration = Math.max(0, Number(spec.armorPenetration || 0));
  const cause = spec.cause || type;
  const critical = !!spec.critical;

  if (spec.missed) {
    world.emit('status', createStatusEvent({ id: target, kind: 'miss', source }));
    if (String(spec.spellId || cause).startsWith('spell') || String(cause).startsWith('spell:')) {
      world.emit('spell:miss', {
        actor: source,
        source,
        targetId: target,
        spellId: String(spec.spellId || ''),
        cause,
        at: spec.at || undefined,
        hitChancePct: Number(spec.hitChancePct || 0),
      });
    }
    return { ...ZERO_RESULT, rawAmount, reason: 'missed' };
  }

  // Step 2: Invulnerability / stasis gate
  if (!spec.bypassInvuln && isEntityInvulnerable(world, target)) {
    world.emit('status', createStatusEvent({ id: target, kind: 'immune', source }));
    return { ...ZERO_RESULT, rawAmount, reason: 'invulnerable' };
  }
  if (statusStrength(world, target, "stasis") > 0) {
    world.emit('status', createStatusEvent({ id: target, kind: 'immune', source }));
    return { ...ZERO_RESULT, rawAmount, reason: 'stasis' };
  }

  // Step 3: Resistance resolution
  let finalAmount = spec.bypassResist
    ? rawAmount
    : resolveResistance(world, target, rawAmount, type, armorPenetration);

  // Mark of Death amplification: +35% damage to marked targets
  const markStrength = statusStrength(world, target, "marked") + effectStrength(world, target, "mark_of_death");
  if (finalAmount > 0 && markStrength > 0) {
    finalAmount = Math.ceil(finalAmount * (1 + 0.35 * markStrength));
  }

  // Desperate vulnerability: critically wounded targets take +50% damage
  const hpPct = (vit.hp | 0) / (vit.maxHp | 0);
  if (finalAmount > 0 && hpPct > 0 && hpPct < 0.05 && !world.has(target, Player)) {
    finalAmount = Math.ceil(finalAmount * 1.5);
  }

  // Front-arc shield mitigation (only when an actual offhand shield is equipped
  // and the guard state is currently active).
  if (finalAmount > 0 && source > 0 && world.isAlive(source)) {
    refreshShieldGuard(world, target);
    const shieldArcMult = getShieldArcMultiplier(world, source, target, type);
    if (shieldArcMult < 1) {
      const guard = consumeShieldGuardStack(world, target, {
        source,
        at: spec.at || undefined,
        damageAmount: finalAmount,
      });
      if (guard.guarded) {
        finalAmount = Math.max(1, Math.floor(finalAmount * shieldArcMult));
        const targetEquipment = world.get(target, Equipment);
        const shieldId = Number(targetEquipment?.offhand || 0) | 0;
        world.emit("shield:guarded", {
          id: target,
          source,
          shieldId,
          stacks: Number(guard.stacks || 0) | 0,
          at: spec.at || undefined,
          broken: !!guard.broken,
        });
      }
    }
  }

  if (finalAmount <= 0) {
    world.emit('status', createStatusEvent({ id: target, kind: 'resist', source }));
    return { ...ZERO_RESULT, rawAmount, reason: 'resisted' };
  }

  // Step 4: Apply damage
  const hpBefore = vit.hp | 0;
  const maxHp = vit.maxHp | 0;
  vit.hp = Math.max(0, hpBefore - finalAmount);
  const hpAfter = vit.hp | 0;

  // Step 4b: Queue knockback (resolved by knockbackSystem this tick).
  const kb = spec.knockback;
  if (kb && (kb.dx || kb.dy)) {
    try {
      world.add(target, KnockbackPending, {
        dx:    Math.sign(Number(kb.dx)    || 0),
        dy:    Math.sign(Number(kb.dy)    || 0),
        force: Math.max(1, Math.min(5, (Number(kb.force) || 1) | 0)),
      });
    } catch { /* entity may already have a pending knockback; keep the first */ }
  }

  // Step 5: Emit 'damaged'
  const _phys = world.get(target, Physiology);
  const eventWeaponFamily = resolveEventWeaponFamily(world, Number(spec.weaponId || 0) | 0);
  const damagedPayload = {
    target,
    amount: finalAmount,
    hpBefore,
    hpAfter,
    maxHp,
    rawAmount,
    type,
    source,
    weaponId: Number(spec.weaponId || 0) | 0,
    weaponFamily: eventWeaponFamily,
    cause,
    critical,
    at: spec.at || undefined,
    noTrigger: !!spec.noTrigger,
    offhand: !!spec.offhand,
    projectileDelay: spec.projectileDelay || 0,
    impactVector: spec.impactVector || undefined,
    projectileKind: String(spec.projectileKind || ''),
    impactProfile: spec.impactProfile || undefined,
    targetKind: String(world.get(target, NamedIdentity)?.identity || ''),
    goreType: String(getMonster(String(world.get(target, NamedIdentity)?.identity || ''))?.goreType || 'blood'),
    sizeClass: String(_phys?.sizeClass || 'M'),
    massKg: Number(_phys?.massKg) || 80,
  };
  recordDamageApplied(world, {
    ...damagedPayload,
    step: world.step | 0,
  });
  world.emit('damaged', damagedPayload);

  // Iron Flesh owns its recoil mechanic rather than projecting a generic
  // thorns status. Suppress the recursive trigger path on the recoil hit.
  if (!spec.noTrigger && source > 0 && world.isAlive(source) && type === 'physical') {
    const ironRecoil = activeEffectMetaValue(world, target, 'iron_flesh', 'recoilDamage');
    const barkRecoil = activeEffectMetaValue(world, target, 'barkskin', 'recoilDamage');
    const recoil = Math.max(ironRecoil, barkRecoil);
    if (recoil > 0) {
      dealDamage(world, {
        target: source,
        amount: recoil,
        source: target,
        type: 'nature',
        cause: ironRecoil >= barkRecoil ? 'iron_flesh:recoil' : 'barkskin:recoil',
        bypassResist: true,
        noTrigger: true,
      });
    }
  }

  if (!spec.noTrigger) {
    ensureEquippedAffixTopology(world, target);
    const out = evaluateEquippedAffixProcs(world, target, {
      kind: "onDamaged",
      source,
      target,
      damage: {
        amount: finalAmount,
        type,
        crit: critical,
        blocked: false,
      },
      tags: new Set([String(type || "physical")]),
      scratch: {},
    });
    applyProcAccumulator(world, out, { applyDamage: dealDamage });

    const frame = createLegacyCombatFrame(world, {
      attacker: source,
      defender: target,
      weaponId: Number(spec.weaponId || 0) | 0,
      damage: finalAmount,
      world,
    }, {
      retaliate: (amount) => {
        dealDamage(world, {
          target: source,
          amount: Math.max(0, amount | 0),
          source: target,
          type: 'physical',
          cause: 'retaliation',
          bypassResist: true,
          noTrigger: true,
        });
      },
    });
    runLegacyMonsterHook(world, target, "onDamaged", frame);
  }

  // Step 6: Death check
  let killed = (vit.hp | 0) <= 0;

  // Lichdom echo: one-time death save from lich corpse buff
  if (killed) {
    const lichdoomPot = activeResistBonus(world, target, "lichdom_echo");
    if (lichdoomPot > 0) {
      vit.hp = 1;
      killed = false;
      // Consume the effect (one-time save)
      const lichAe = world.get(target, ActiveEffects);
      if (lichAe && Array.isArray(lichAe.effects)) {
        lichAe.effects = lichAe.effects.filter(e => e.key !== "lichdom_echo");
      }
      world.emit('lichdom_echo:saved', { id: target, source });
    }
  }

  if (killed) {
    const pseudoDeath = tryHandlePlayerPseudoDeath(world, target, {
      killer: source,
      cause,
    });
    if (pseudoDeath) {
      killed = false;
    }
  }

  if (killed) {
    const diedPayload = {
      id: target, killer: source, cause,
      weaponId: Number(spec.weaponId || 0) | 0,
      weaponFamily: eventWeaponFamily,
      damageType: type,
      critical,
      amount: finalAmount,
      goreType: String(getMonster(String(world.get(target, NamedIdentity)?.identity || ''))?.goreType || 'blood'),
      sizeClass: String(world.get(target, Physiology)?.sizeClass || 'M'),
      impactProfile: spec.impactProfile || undefined,
      targetKind: String(world.get(target, NamedIdentity)?.identity || ''),
      at: spec.at || undefined,
    };
    const diedEvent = new Died(diedPayload);
    recordDeathApplied(world, {
      ...diedEvent,
      target,
      step: world.step | 0,
    });
    world.emit(diedEvent);
    world.emit('died', diedEvent.toLegacyPayload());

    if (!spec.noTrigger && source > 0 && world.isAlive(source)) {
      ensureEquippedAffixTopology(world, source);

      const killCtxBase = {
        source,
        target,
        damage: {
          amount: finalAmount,
          type,
          crit: critical,
          blocked: false,
        },
        tags: new Set(["kill", String(type || "physical")]),
        scratch: {},
      };

      const onKillOut = evaluateEquippedAffixProcs(world, source, {
        ...killCtxBase,
        kind: "onKill",
      });
      applyProcAccumulator(world, onKillOut, { applyDamage: dealDamage });

      if (critical) {
        const onCritKillOut = evaluateEquippedAffixProcs(world, source, {
          ...killCtxBase,
          kind: "onCritKill",
        });
        applyProcAccumulator(world, onCritKillOut, { applyDamage: dealDamage });
      }
    }

    // Battle fury: on-kill heal for the killer
    if (source > 0 && world.isAlive(source)) {
      const furyPot = activeResistBonus(world, source, "battle_fury");
      const roarPot = effectStrength(world, source, "primal_roar");
      const killHealPot = Math.max(furyPot, roarPot);
      if (killHealPot > 0) {
        const sourceVit = world.get(source, Vitality);
        if (sourceVit && (sourceVit.hp | 0) > 0) {
          const healAmt = 5 * killHealPot;
          const healed = applyHealing(world, {
            target: source,
            amount: healAmt,
            source,
            cause: roarPot > 0 ? 'primal_roar' : 'battle_fury',
          }).amount;
          world.emit(roarPot > 0 ? 'primal_roar:heal' : 'battle_fury:heal', { id: source, amount: healed });
        }
      }
    }
  }

  return { applied: true, killed, amount: finalAmount, rawAmount, reason: 'applied' };
}
