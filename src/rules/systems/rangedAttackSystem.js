// rules/systems/rangedAttackSystem.js
// Processes RangedAttackIntent: validates bow, ammo, LOS, range, then resolves d20 combat.

import { RangedAttackIntent } from '../components/Intents/RangedAttackIntent.js';
import { Equipment } from '../components/Equipment.js';
import { Inventory } from '../components/Inventory.js';
import { Vitality } from '../components/Vitality.js';
import { Collider } from '../components/Collider.js';
import { ItemInfo } from '../components/ItemInfo.js';
import { Stamina } from '../components/Stamina.js';
import { Faction } from '../components/Faction.js';
import { Position } from '../components/Position.js';
import { NamedIdentity } from '../components/NamedIdentity.js';
import { Player } from '../components/Player.js';
import { COMBAT_POSTURES } from '../components/CombatPosture.js';
import { hasLOS } from '../../shared/math/gridLOS.js';
import { buildBlocksVisionMap, blockedCallback } from '../utils/vision.js';
import { mulberry32, rngInt, rollDice, combatSeed, pct } from '../utils/rng.js';
import { dealDamage } from '../utils/dealDamage.js';
import { applyWeaponCoatingOnHit } from '../data/weaponCoatings.js';
import { addToInventory, inventoryItems, removeFromInventory } from '../utils/inventoryFacade.js';
import { resolveCombatSnapshot } from '../utils/resolveCombatSnapshot.js';
import { areFactionsHostile } from '../utils/factionHostility.js';
import { createStatusEvent } from '../../shared/events/statusEvent.js';
import { runAmmoScripts } from '../utils/projectileScriptDispatch.js';
import { ensureEquippedAffixTopology } from '../utils/affixTopology.js';
import { buildProcContext, applyPendingDamageProcPhase, applyReactionProcPhase } from '../utils/procPhases.js';
import { getAmmoDef } from '../data/ammo.js';
import { createItemById } from '../utils/itemFactory.js';
import { breakStealthOnOffense } from '../utils/stealthAmbush.js';
import { isTargetHiddenByInvisibility } from '../utils/spellTargeting.js';
import {
  calculateBlindedPhysicalDamage,
  getBlindedCritChanceBonusPct,
  getBlindedCritMultBonus,
} from '../utils/blindnessExposure.js';
import { STAMINA_REGEN_COOLDOWN } from '../data/regenConstants.js';
import { getEntityFacingConeDegrees, getNormalizedEntityFacing, isPointInFacingCone } from '../utils/facing.js';
import { getPositionalAttackBonus } from '../utils/combatPositioning.js';
import { setCombatPosture } from '../utils/posture.js';
import { chebyshevScalar } from '../utils/distance.js';
import { computeImpactVectorXY, computeMissEndpoint, computeProjectileDelay } from '../utils/projectileKinematics.js';
import { bresenhamLine } from '../../shared/math/bresenham.js';

const RANGED_PROJECTILE_SPEED = 18;
const RANGED_PROJECTILE_MIN_DURATION = 0.06;
const RANGED_PROJECTILE_MAX_DURATION = 0.4;
const EMBEDDED_ARROW_RECOVERY_CHANCE = 0.22;
const BLUNT_ARROW_SPEED_MULT = 0.9;
const PIERCING_ARROW_SPEED_MULT = 1.1;

/** @param {import('../../lib/ecs-js/index.js').World} world */
export function rangedAttackSystem(world) {
  const intents = world.query(RangedAttackIntent);
  if (intents.count({ cheap: true }) === 0) return;

  // Build blocking map once per tick when needed
  const blocked = buildBlocksVisionMap(world);
  const isBlocked = blockedCallback(blocked);

  for (const [attacker, intent] of intents) {
    const defender = intent.targetId | 0;
    if (!world.isAlive(defender)) { world.remove(attacker, RangedAttackIntent); continue; }

    const apos = world.get(attacker, Position);
    const dpos = world.get(defender, Position);
    if (!apos || !dpos) { world.remove(attacker, RangedAttackIntent); continue; }

    const atkVit = world.get(attacker, Vitality);
    const defVit = world.get(defender, Vitality);
    if (!atkVit || !defVit) { world.remove(attacker, RangedAttackIntent); continue; }

    // Require a bow in the ranged slot
    const eq = world.get(attacker, Equipment);
    ensureEquippedAffixTopology(world, attacker);
    ensureEquippedAffixTopology(world, defender);
    const weaponId = eq?.ranged || 0;
    const weaponInfo = weaponId ? world.get(weaponId, ItemInfo) : null;
    if (!weaponInfo || weaponInfo.subtype !== 'bow') {
      world.remove(attacker, RangedAttackIntent);
      continue;
    }

    // Find ammo: prefer equipped ammo slot, fall back to first ammo in inventory
    const inv = world.get(attacker, Inventory);
    let ammoId = 0;
    let ammoInfo = null;
    const equippedAmmo = eq?.ammo || 0;
    if (equippedAmmo && world.isAlive(equippedAmmo)) {
      const info = world.get(equippedAmmo, ItemInfo);
      if (info && info.type === 'ammo') { ammoId = equippedAmmo; ammoInfo = info; }
    }
    if (!ammoId) {
      for (const itemId of inventoryItems(world, attacker)) {
        const info = world.get(itemId, ItemInfo);
        if (info && info.type === 'ammo') { ammoId = itemId; ammoInfo = info; break; }
      }
    }
    if (!ammoId || !ammoInfo) {
      world.emit?.('ranged:no-ammo', { attacker });
      world.remove(attacker, RangedAttackIntent);
      continue;
    }

    const ammoIdentity = String(
      world.get(ammoId, NamedIdentity)?.identity
      || ammoInfo.subtype
      || 'ammo_arrows',
    ).toLowerCase();
    const ammoStyle = ammoInfo.subtype || (ammoIdentity.includes('fire') ? 'fire' : 'plain');
    const projectileSpeed = RANGED_PROJECTILE_SPEED * (
      ammoStyle === 'blunt'
        ? BLUNT_ARROW_SPEED_MULT
        : (ammoStyle === 'piercing' ? PIERCING_ARROW_SPEED_MULT : 1)
    );

    const ax = apos.x | 0, ay = apos.y | 0;
    const tx = dpos.x | 0, ty = dpos.y | 0;
    const dist = chebyshevScalar(ax, ay, tx, ty);
    const facing = getNormalizedEntityFacing(world, attacker);
    const coneDegrees = getEntityFacingConeDegrees(world, attacker);
    if (facing && !isPointInFacingCone(ax, ay, tx, ty, facing.dx, facing.dy, coneDegrees)) {
      world.emit?.('ranged:blocked', { attacker, target: defender, reason: 'facing' });
      world.remove(attacker, RangedAttackIntent);
      continue;
    }

    // LOS check
    if (!hasLOS(ax, ay, tx, ty, isBlocked)) {
      let wallImpact = { x: tx, y: ty };
      for (const [x, y] of bresenhamLine(ax, ay, tx, ty)) {
        if (isBlocked(x, y)) { wallImpact = { x, y }; break; }
      }
      runAmmoScripts(world, ammoIdentity, 'onProjectileWallImpact', {
        phase: 'projectile-wall-impact',
        attacker,
        defender,
        ammoId,
        ammoIdentity,
        ammoInfo,
        style: ammoStyle,
        distance: dist,
        damage: 0,
        impact: wallImpact,
      });
      world.emit?.('ranged:blocked', { attacker, target: defender });
      world.remove(attacker, RangedAttackIntent);
      continue;
    }

    // Range check (Chebyshev distance)
    const maxRange = weaponInfo.range || 8;
    if (dist > maxRange) {
      world.emit?.('ranged:out-of-range', { attacker, target: defender, distance: dist, range: maxRange });
      world.remove(attacker, RangedAttackIntent);
      continue;
    }

    // Faction check
    const af = world.get(attacker, Faction)?.key || '';
    const df = world.get(defender, Faction)?.key || '';
    if (!areFactionsHostile(af, df)) {
      world.remove(attacker, RangedAttackIntent);
      continue;
    }

    if (isTargetHiddenByInvisibility(world, {
      sourceId: attacker,
      targetId: defender,
      sourcePos: apos,
      targetPos: dpos,
      allowAdjacentInvisibleTarget: true,
      hostileOnly: true,
    })) {
      world.emit?.('ranged:blocked', { attacker, target: defender, reason: 'invisible' });
      world.remove(attacker, RangedAttackIntent);
      continue;
    }

    // Stamina gate: ranged attacks consume weapon staminaCost.
    const staminaCost = Math.max(0, Number(weaponInfo.staminaCost ?? 6));
    const stamina = world.get(attacker, Stamina);
    if (stamina) {
      const have = Number(stamina.stamina ?? 0);
      if (have < staminaCost) {
        world.emit?.('attack:insufficient-stamina', {
          attacker,
          defender,
          weaponId,
          mode: 'ranged',
          need: staminaCost,
          have,
        });
        world.emit?.('ranged:insufficient-stamina', {
          attacker,
          target: defender,
          weaponId,
          need: staminaCost,
          have,
        });
        world.remove(attacker, RangedAttackIntent);
        continue;
      }
      world.set(attacker, Stamina, {
        ...stamina,
        stamina: have - staminaCost,
        regenCooldown: STAMINA_REGEN_COOLDOWN,
      });
    }
    setCombatPosture(world, attacker, COMBAT_POSTURES.aggressive, { reason: 'attack:ranged' });

    // d20 roll
    const atkSnapshot = resolveCombatSnapshot(world, attacker, { mode: 'ranged' });
    const defSnapshot = resolveCombatSnapshot(world, defender, { mode: 'ranged' });
    const positional = getPositionalAttackBonus(world, attacker, defender);
    const blindExposure = Math.max(0, Number(defSnapshot?.status?.blinded || 0));
    breakStealthOnOffense(world, attacker, { reason: 'attack', mode: 'ranged', targetId: defender });
    const attackBonus = atkSnapshot.attackBonus + positional.attackBonus;
    const armorClass = defSnapshot.armorClass;
    const rangePenalty = Math.floor(dist / 3);
    let armorPenetration = Math.max(0, Number(atkSnapshot.physicalPenetration || 0))
      + Math.max(0, Number(atkSnapshot.piercePenetration || 0));

    const seed = combatSeed(world.seed, world.step, attacker, defender);
    const r = mulberry32(seed);
    const d20 = rngInt(r, 1, 20);
    const totalToHit = d20 + attackBonus - rangePenalty;
    let isCrit = d20 === 20;
    const isNat1 = d20 === 1;

    if (!isCrit && (isNat1 || totalToHit < armorClass)) {
      const missTo = computeMissEndpoint(world, apos, dpos, {
        sourceId: attacker,
        targetId: defender,
        key: 'ranged:shot',
        salt: 0x52a9,
        maxAngleDeg: 15,
        minDistanceScale: 1.2,
        distanceExtraScale: 0.2,
      });
      runAmmoScripts(world, ammoIdentity, 'onProjectileMiss', {
        phase: 'projectile-miss',
        attacker,
        defender,
        ammoId,
        ammoIdentity,
        ammoInfo,
        style: ammoStyle,
        distance: dist,
        damage: 0,
        d20,
        totalToHit,
        armorClass,
        critical: isCrit,
        rng: r,
        impact: { x: Math.round(missTo.x), y: Math.round(missTo.y) },
      });
      world.emit?.('status', createStatusEvent({ id: defender, kind: 'miss', source: attacker }));
      world.emit?.('ranged:missed-target', { attacker, target: defender });
      const missRay = resolveMissRayImpact(world, {
        attacker,
        defender,
        from: { x: apos.x | 0, y: apos.y | 0 },
        intended: { x: dpos.x | 0, y: dpos.y | 0 },
        missTo,
        isBlocked,
      });
      if (missRay?.hitTargetId > 0) {
        const strayId = missRay.hitTargetId | 0;
        const strayPos = world.get(strayId, Position);
        if (strayPos) {
          const sx = strayPos.x | 0;
          const sy = strayPos.y | 0;
          const strayDist = chebyshevScalar(ax, ay, sx, sy);
          const strayAtkSnapshot = resolveCombatSnapshot(world, attacker, { mode: 'ranged' });
          const strayDefSnapshot = resolveCombatSnapshot(world, strayId, { mode: 'ranged' });
          const strayPositional = getPositionalAttackBonus(world, attacker, strayId);
          const strayBlindExposure = Math.max(0, Number(strayDefSnapshot?.status?.blinded || 0));
          const strayAttackBonus = strayAtkSnapshot.attackBonus + strayPositional.attackBonus;
          const strayArmorClass = strayDefSnapshot.armorClass;
          const strayRangePenalty = Math.floor(strayDist / 3);
          let strayArmorPenetration = Math.max(0, Number(strayAtkSnapshot.physicalPenetration || 0))
            + Math.max(0, Number(strayAtkSnapshot.piercePenetration || 0));
          const strayTotalToHit = d20 + strayAttackBonus - strayRangePenalty;

          const baseDice = weaponInfo.damageDice || '1d6';
          const damageRoll = rollDice(baseDice, r);
          const flatBonus = strayAtkSnapshot.damageFlatBonus;
          let strayDamage = Math.max(1, damageRoll + flatBonus);
          strayDamage = Math.max(1, Math.floor(strayDamage * strayPositional.damageMult));
          if ((Number(strayAtkSnapshot?.posture?.lastMoveStep ?? -1) | 0) === (Number(world.step || 0) | 0)) {
            strayDamage += 1;
          }

          let strayIsCrit = false;
          const strayBlindCritBonusPct = getBlindedCritChanceBonusPct(strayBlindExposure);
          const strayCritPct = (strayAtkSnapshot.critChance * 100) + (strayAtkSnapshot.luck || 0) + strayBlindCritBonusPct;
          if (strayCritPct > 0) strayIsCrit = pct(r, strayCritPct);
          const strayBlindCritMultBonus = getBlindedCritMultBonus(strayBlindExposure);
          const strayCritMult = 2 + (strayAtkSnapshot.critMult || 0) + strayBlindCritMultBonus;
          if (strayIsCrit) strayDamage = Math.max(1, Math.floor(strayDamage * strayCritMult));
          strayDamage = calculateBlindedPhysicalDamage(strayDamage, strayBlindExposure);

          const strayProcScratch = {};
          let strayDamageType = 'pierce';
          strayDamage = applyPendingDamageProcPhase(world, attacker, buildProcContext('onBeforeHit', {
            source: attacker,
            target: strayId,
            item: weaponId,
            damage: strayDamage,
            damageType: strayDamageType,
            crit: strayIsCrit,
            scratch: strayProcScratch,
            tags: ['ranged', 'projectile', `relation:${strayPositional.relation}`],
          }), () => r(), { excludeSlots: ['weapon', 'offhand'] });

          const strayActorImpactCtx = runAmmoScripts(world, ammoIdentity, 'onProjectileActorImpact', {
            phase: 'projectile-actor-impact',
            attacker,
            defender: strayId,
            ammoId,
            ammoIdentity,
            ammoInfo,
            style: ammoStyle,
            distance: strayDist,
            damage: strayDamage,
            d20,
            totalToHit: strayTotalToHit,
            armorClass: strayArmorClass,
            critical: strayIsCrit,
            damageType: strayDamageType,
            armorPenetration: strayArmorPenetration,
            rng: r,
          });
          if (strayActorImpactCtx) {
            strayDamage = Math.max(0, strayActorImpactCtx.damage);
            strayDamageType = strayActorImpactCtx.damageType;
            strayArmorPenetration = Math.max(0, strayActorImpactCtx.armorPenetration);
          }
          strayDamage = applyPendingDamageProcPhase(world, attacker, buildProcContext('onHit', {
            source: attacker,
            target: strayId,
            item: weaponId,
            damage: strayDamage,
            damageType: strayDamageType,
            crit: strayIsCrit,
            scratch: strayProcScratch,
            tags: ['ranged', 'projectile', `relation:${strayPositional.relation}`],
          }), () => r(), { excludeSlots: ['weapon', 'offhand'] });
          applyReactionProcPhase(world, strayId, buildProcContext('onHit', {
            source: attacker,
            target: strayId,
            item: weaponId,
            damage: strayDamage,
            damageType: strayDamageType,
            crit: strayIsCrit,
            scratch: strayProcScratch,
            tags: ['ranged', 'projectile', `relation:${strayPositional.relation}`],
          }), { excludeSlots: ['weapon'] });

          applyWeaponCoatingOnHit(world, {
            attacker,
            defender: strayId,
            weaponId: ammoId,
            didHit: strayDamage > 0,
          });

          const strayResult = dealDamage(world, {
            target: strayId,
            amount: strayDamage,
            source: attacker,
            type: strayDamageType,
            cause: 'ranged',
            critical: strayIsCrit,
            armorPenetration: strayArmorPenetration,
            projectileDelay: computeProjectileDelay(
              { x: ax, y: ay },
              { x: sx, y: sy },
              projectileSpeed,
              RANGED_PROJECTILE_MIN_DURATION,
              RANGED_PROJECTILE_MAX_DURATION,
            ),
            impactVector: computeImpactVectorXY(ax, ay, sx, sy),
            projectileKind: 'arrow',
          });
          if (strayActorImpactCtx) {
            strayActorImpactCtx.resolveDamageResult(strayResult);
            strayActorImpactCtx.flushResolved();
          }
          if (strayResult?.applied) {
            tryRecoverEmbeddedArrow(world, {
              attacker,
              defender: strayId,
              ammoIdentity,
              rng: r,
            });
            world.emit?.('ranged:miss-behind-hit', {
              attacker,
              missedTarget: defender,
              target: strayId,
              damage: strayResult.amount | 0,
              missTo,
            });
          }
        }
      }
      // Consume ammo on miss (whether or not a behind hit occurs)
      consumeAmmo(world, attacker, ammoId, ammoInfo);
      world.emit?.('ranged:shot', {
        attacker,
        target: defender,
        hit: false,
        style: ammoStyle,
        projectileSpeed,
        from: { x: apos.x, y: apos.y },
        to: { x: dpos.x, y: dpos.y },
        missTo,
      });
      world.remove(attacker, RangedAttackIntent);
      continue;
    }

    // Roll damage
    const baseDice = weaponInfo.damageDice || '1d6';
    const damageRoll = rollDice(baseDice, r);
    const flatBonus = atkSnapshot.damageFlatBonus;
    let dmg = Math.max(1, damageRoll + flatBonus);
    dmg = Math.max(1, Math.floor(dmg * positional.damageMult));
    if ((Number(atkSnapshot?.posture?.lastMoveStep ?? -1) | 0) === (Number(world.step || 0) | 0)) {
      dmg += 1; // movement commitment momentum
    }

    // Secondary crit check: critChanceDerived (decimal) + luck (integer %)
    if (!isCrit) {
      const blindCritBonusPct = getBlindedCritChanceBonusPct(blindExposure);
      const critPct = (atkSnapshot.critChance * 100) + (atkSnapshot.luck || 0) + blindCritBonusPct;
      if (critPct > 0) isCrit = pct(r, critPct);
    }
    const blindCritMultBonus = getBlindedCritMultBonus(blindExposure);
    const critMult = 2 + (atkSnapshot.critMult || 0) + blindCritMultBonus;
    if (isCrit) dmg = Math.max(1, Math.floor(dmg * critMult));
    dmg = calculateBlindedPhysicalDamage(dmg, blindExposure);
    const procScratch = {};
    let damageType = 'pierce';
    dmg = applyPendingDamageProcPhase(world, attacker, buildProcContext('onBeforeHit', {
      source: attacker,
      target: defender,
      item: weaponId,
      damage: dmg,
      damageType,
      crit: isCrit,
      scratch: procScratch,
      tags: ['ranged', 'projectile', `relation:${positional.relation}`],
    }), () => r(), { excludeSlots: ['weapon', 'offhand'] });

    const actorImpactCtx = runAmmoScripts(world, ammoIdentity, 'onProjectileActorImpact', {
      phase: 'projectile-actor-impact',
      attacker,
      defender,
      ammoId,
      ammoIdentity,
      ammoInfo,
      style: ammoStyle,
      distance: dist,
      damage: dmg,
      d20,
      totalToHit,
      armorClass,
      critical: isCrit,
      damageType,
      armorPenetration,
      rng: r,
    });
    if (actorImpactCtx) {
      dmg = Math.max(0, actorImpactCtx.damage);
      damageType = actorImpactCtx.damageType;
      armorPenetration = Math.max(0, actorImpactCtx.armorPenetration);
    }
    dmg = applyPendingDamageProcPhase(world, attacker, buildProcContext('onHit', {
      source: attacker,
      target: defender,
      item: weaponId,
      damage: dmg,
      damageType,
      crit: isCrit,
      scratch: procScratch,
      tags: ['ranged', 'projectile', `relation:${positional.relation}`],
    }), () => r(), { excludeSlots: ['weapon', 'offhand'] });
    applyReactionProcPhase(world, defender, buildProcContext('onHit', {
      source: attacker,
      target: defender,
      item: weaponId,
      damage: dmg,
      damageType,
      crit: isCrit,
      scratch: procScratch,
      tags: ['ranged', 'projectile', `relation:${positional.relation}`],
    }), { excludeSlots: ['weapon'] });

    // Ammo coating (e.g. paralysis-coated arrows)
    applyWeaponCoatingOnHit(world, {
      attacker, defender, weaponId: ammoId,
      didHit: dmg > 0,
    });

    // Apply damage through canonical pipeline
    const result = dealDamage(world, {
      target: defender,
      amount: dmg,
      source: attacker,
      type: damageType,
      cause: 'ranged',
      critical: isCrit,
      armorPenetration,
      projectileDelay: computeProjectileDelay(
        { x: ax, y: ay },
        { x: tx, y: ty },
        projectileSpeed,
        RANGED_PROJECTILE_MIN_DURATION,
        RANGED_PROJECTILE_MAX_DURATION,
      ),
      impactVector: computeImpactVectorXY(ax, ay, tx, ty),
      projectileKind: 'arrow',
    });
    if (actorImpactCtx) {
      actorImpactCtx.resolveDamageResult(result);
      actorImpactCtx.flushResolved();
    }

    // Consume ammo
    consumeAmmo(world, attacker, ammoId, ammoInfo);
    tryRecoverEmbeddedArrow(world, {
      attacker,
      defender,
      ammoIdentity,
      rng: r,
    });

    world.emit?.('ranged:shot', {
      attacker,
      target: defender,
      hit: true,
      damage: dmg,
      style: ammoStyle,
      projectileSpeed,
      from: { x: apos.x, y: apos.y },
      to: { x: dpos.x, y: dpos.y },
    });
    world.remove(attacker, RangedAttackIntent);
  }
}

/** Decrement ammo count; destroy entity if last arrow. */
function consumeAmmo(world, owner, ammoId, ammoInfo) {
  if (ammoInfo.count > 1) {
    ammoInfo.count -= 1;
  } else {
    // Last arrow: remove from inventory, clear equip slot, destroy entity
    removeFromInventory(world, owner, ammoId);
    const eq = world.get(owner, Equipment);
    if (eq && eq.ammo === ammoId) eq.ammo = null;
    world.destroy(ammoId);
  }
}

function normalizeRecoverableAmmoIdentity(ammoIdentity) {
  const canonical = String(getAmmoDef(ammoIdentity)?.id || '').trim();
  if (canonical) return canonical;
  const normalized = String(ammoIdentity || '').trim().toLowerCase();
  if (normalized.startsWith('ammo_')) return normalized;
  return '';
}

function resolveAmmoEntityIdentity(world, ammoId) {
  if (!(ammoId > 0) || !world.isAlive(ammoId)) return '';
  const identity = String(
    world.get(ammoId, NamedIdentity)?.identity
    || world.get(ammoId, ItemInfo)?.subtype
    || '',
  ).trim().toLowerCase();
  return normalizeRecoverableAmmoIdentity(identity);
}

function tryRecoverEmbeddedArrow(world, { attacker, defender, ammoIdentity, rng }) {
  if (!(defender > 0) || !world.isAlive(defender)) return;
  if (world.has(defender, Player)) return;
  if (!world.has(defender, Inventory)) return;
  if (typeof rng !== 'function' || rng() >= EMBEDDED_ARROW_RECOVERY_CHANCE) return;

  const recoverIdentity = normalizeRecoverableAmmoIdentity(ammoIdentity);
  if (!recoverIdentity) return;

  const equippedAmmoId = Number(world.get(defender, Equipment)?.ammo || 0) | 0;
  if (equippedAmmoId > 0 && resolveAmmoEntityIdentity(world, equippedAmmoId) === recoverIdentity) {
    world.mutate(equippedAmmoId, ItemInfo, (rec) => {
      rec.count = Math.max(1, Number(rec.count || 0) | 0) + 1;
    });
    return;
  }

  const recoveredId = createItemById(world, recoverIdentity, { count: 1 });
  if (!(recoveredId > 0)) return;
  if (!addToInventory(world, defender, recoveredId, { silent: true, mergeCompatible: true })) {
    world.destroy(recoveredId);
    return;
  }
}

function tileKey(x, y) {
  return `${x | 0},${y | 0}`;
}

function buildTileOccupants(world) {
  /** @type {Map<string, number[]>} */
  const byTile = new Map();
  for (const [id, pos] of world.query(Position)) {
    const k = tileKey(pos.x, pos.y);
    if (!byTile.has(k)) byTile.set(k, []);
    byTile.get(k).push(id);
  }
  return byTile;
}

function resolveMissRayImpact(world, { attacker, defender, from, intended, missTo, isBlocked }) {
  const fx = Number(from?.x || 0) | 0;
  const fy = Number(from?.y || 0) | 0;
  const tx = Number(intended?.x || 0);
  const ty = Number(intended?.y || 0);
  const mx = Math.round(Number(missTo?.x || tx));
  const my = Math.round(Number(missTo?.y || ty));
  const aimDx = tx - fx;
  const aimDy = ty - fy;
  const aimLen = Math.hypot(aimDx, aimDy) || 1;
  const ux = aimDx / aimLen;
  const uy = aimDy / aimLen;
  const byTile = buildTileOccupants(world);
  const attackerFaction = String(world.get(attacker, Faction)?.key || '');

  for (const [x, y] of bresenhamLine(fx, fy, mx, my)) {
    if (isBlocked(x, y)) {
      return { kind: 'wall', x, y, hitTargetId: 0 };
    }

    const ids = byTile.get(tileKey(x, y));
    if (!ids || ids.length === 0) continue;

    let blocker = 0;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i] | 0;
      if (id === attacker) continue;
      const pos = world.get(id, Position);
      if (!pos) continue;
      const forward = ((Number(pos.x) - fx) * ux) + ((Number(pos.y) - fy) * uy);
      if (forward <= (aimLen + 0.01)) continue; // only allow targets behind intended endpoint

      const vit = world.get(id, Vitality);
      const hp = Number(vit?.hp || 0);
      const col = world.get(id, Collider);
      const fac = String(world.get(id, Faction)?.key || '');
      if (id !== defender && hp > 0 && areFactionsHostile(attackerFaction, fac)) {
        return { kind: 'entity', x: pos.x | 0, y: pos.y | 0, hitTargetId: id };
      }
      if (id !== defender && (hp > 0 || !!col?.solid)) blocker = id;
    }
    if (blocker > 0) return { kind: 'entity-block', x, y, hitTargetId: 0, blockerId: blocker };
  }
  return null;
}
