// src/rules/systems/combatSystem.js
// Processes AttackIntent: computes damage using derived stats, emits events for affix triggers, applies Vitality changes.

import { AttackIntent } from '../components/Intents/AttackIntent.js';
import { Equipment, NON_AMMO_GEAR_SLOTS } from '../components/Equipment.js';
import { Vitality } from '../components/Vitality.js';
import { applyHealing } from '../utils/applyHealing.js';
import { ItemInfo } from '../components/ItemInfo.js';
import { Faction } from '../components/Faction.js';
import { Player } from '../components/Player.js';
import { STAMINA_REGEN_COOLDOWN } from '../data/regenConstants.js';
import { Position } from '../components/Position.js';
import { Stamina } from '../components/Stamina.js';
import { NamedIdentity } from '../components/NamedIdentity.js';
import { ActiveEffects } from '../components/ActiveEffects.js';
import { COMBAT_POSTURES } from '../components/CombatPosture.js';
import { mulberry32, rngInt, rollDice, combatSeed, pct } from '../utils/rng.js';
import { dealDamage } from '../utils/dealDamage.js';
import { areFactionsHostile } from '../utils/factionHostility.js';
import { resolveCombatSnapshot } from '../utils/resolveCombatSnapshot.js';
import { applyWeaponCoatingOnHit } from '../data/weaponCoatings.js';
import { createStatusEvent } from '../../shared/events/statusEvent.js';
import { Beatitude, BUC_CURSED, BUC_BLESSED } from '../components/Beatitude.js';
import { CreatureType, CREATURE_TYPES } from '../components/CreatureType.js';
import { Traits } from '../components/Traits.js';
import {
    createLegacyCombatFrame,
    runLegacyMonsterHook,
} from '../utils/legacyAffixDispatch.js';
import { ensureEquippedAffixTopology } from '../utils/affixTopology.js';
import { buildProcContext, applyPendingDamageProcPhase, applyReactionProcPhase } from '../utils/procPhases.js';
import { breakStealthOnOffense } from '../utils/stealthAmbush.js';
import {
    calculateBlindedPhysicalDamage,
    getBlindedCritChanceBonusPct,
    getBlindedCritMultBonus,
    getBlindedFumbleChancePct,
} from '../utils/blindnessExposure.js';
import { getEntityFacingConeDegrees, getNormalizedEntityFacing, isPointInFacingCone } from '../utils/facing.js';
import { getPositionalAttackBonus, hasOffhandShield } from '../utils/combatPositioning.js';
import { setCombatPosture } from '../utils/posture.js';
import { upsertTimedEffect } from '../utils/effectSemantics.js';
import { ensureActiveEffects } from '../utils/effects.js';
import { computeImpactVector } from '../utils/projectileKinematics.js';
import { resolveWeaponVisualMeta } from '../data/weaponVisuals.js';
import { resolveWeaponVisualAffinity } from '../data/weaponVisualAffinity.js';
import { resolvePlayerActiveDeity, scoreDeityStanding } from './deitySystem.js';
import { forEachInRadius } from '../utils/spatialIndex.js';
import { resolveWeaponFamily } from '../data/weaponFamilies.js';
import { classifyActorTargetAction, OFFENSE_ATTRIBUTION } from '../utils/offenseClassifier.js';

const BUMP_ATTACK_INSTALLED = Symbol.for('jshack:combat:bumpAttack:installed');

function resolveEventWeaponFamily(world, weaponId) {
    if (!(weaponId > 0) || !world.isAlive(weaponId)) return '';
    const info = world.get(weaponId, ItemInfo);
    return String(info?.weaponFamily || resolveWeaponFamily(info || {}) || '');
}

function resolveWeaponClass(world, weaponId, damageType) {
    if (!(weaponId > 0) || !world.isAlive(weaponId)) return 'unarmed';
    const info = world.get(weaponId, ItemInfo);
    const named = world.get(weaponId, NamedIdentity);
    return resolveWeaponVisualMeta({
        id: named?.identity || '',
        name: named?.name || '',
        subtype: info?.subtype || '',
        damageType,
        twoHanded: info?.twoHanded === true,
        weaponLengthCm: info?.weaponLengthCm,
        weaponVfxProfile: info?.weaponVfxProfile,
    }).weaponClass;
}

function resolveWeaponDamageType(world, weaponId) {
    if (weaponId > 0 && world.isAlive(weaponId)) {
        const info = world.get(weaponId, ItemInfo);
        const rawType = String(info?.damageType || 'physical').toLowerCase();
        if (rawType === 'blunt' || rawType === 'slash' || rawType === 'pierce') return rawType;
    }
    return 'physical';
}

function buildDamageSignature(info, damageType) {
    const bonuses = info?.bonuses || {};
    let blunt = Math.max(0, Number(bonuses.bluntPenetration || 0));
    let pierce = Math.max(0, Number(bonuses.piercePenetration || 0));
    let slash = Math.max(0, Number(bonuses.slashPenetration || 0));
    if (damageType === 'blunt') blunt += 2;
    else if (damageType === 'pierce') pierce += 2;
    else if (damageType === 'slash') slash += 2;
    else {
        blunt += 1;
        pierce += 1;
        slash += 1;
    }
    const total = blunt + pierce + slash;
    if (!(total > 0)) return { blunt: 0.34, pierce: 0.33, slash: 0.33 };
    return {
        blunt: blunt / total,
        pierce: pierce / total,
        slash: slash / total,
    };
}

function buildMeleeImpactProfile(world, sourceId, weaponId, damageType, offhand, facingVector) {
    const info = (weaponId > 0 && world.isAlive(weaponId)) ? world.get(weaponId, ItemInfo) : null;
    const named = (weaponId > 0 && world.isAlive(weaponId)) ? world.get(weaponId, NamedIdentity) : null;
    const visualMeta = resolveWeaponVisualMeta({
        id: named?.identity || '',
        name: named?.name || '',
        subtype: info?.subtype || '',
        damageType,
        twoHanded: info?.twoHanded === true,
        weaponLengthCm: info?.weaponLengthCm,
        weaponVfxProfile: info?.weaponVfxProfile,
    });
    const weaponClass = resolveWeaponClass(world, weaponId, damageType);
    const attackKind = damageType === 'pierce'
        ? 'stab'
        : (damageType === 'slash' ? 'slash' : (damageType === 'blunt' ? 'blunt' : 'strike'));
    const affinity = resolveWeaponVisualAffinity(world, { actorId: sourceId, weaponId });
    return {
        weaponClass,
        weaponLengthCm: visualMeta.weaponLengthCm,
        weaponVfxProfile: visualMeta.weaponVfxProfile,
        attackKind,
        offhand: !!offhand,
        signature: buildDamageSignature(info, damageType),
        facingVector: facingVector || undefined,
        elementTint: affinity?.elementTint || null,
        swingStyle: affinity?.swingStyle || null,
        visualAffinity: affinity || null,
    };
}

// ── Shrine proximity combat scaling ──────────────────────────────────
// Fighting near a shrine scales damage based on deity favor.
// Positive standing → bonus; negative standing → penalty.
const SHRINE_COMBAT_RADIUS = 5;
const SHRINE_SCALING_MAX = 0.25;  // ±25% at extremes
const SHRINE_STANDING_CAP = 8;    // standing ±8 maps to ±1 normalized

/**
 * Compute shrine proximity damage multiplier for an attacker.
 * Returns { mult: number, label: string|null, standing: number, dist: number, shrineId: number, shrineX: number, shrineY: number }
 * where mult is the raw multiplier (e.g. 1.20 for +20%, 0.85 for -15%).
 * Returns mult=1 when no shrine is in range or attacker has no deity.
 */
function computeShrineCombatScaling(world, attackerId) {
    const resolved = resolvePlayerActiveDeity(world, attackerId);
    if (!resolved) return { mult: 1, label: null, standing: 0, dist: -1, shrineId: -1, shrineX: 0, shrineY: 0 };

    const atkPos = world.get(attackerId, Position);
    if (!atkPos) return { mult: 1, label: null, standing: 0, dist: -1, shrineId: -1, shrineX: 0, shrineY: 0 };

    // Find nearest shrine within radius (Chebyshev)
    let nearestDist = Infinity;
    let nearestId = -1;
    let nearestX = 0, nearestY = 0;
    forEachInRadius(world, atkPos.x, atkPos.y, SHRINE_COMBAT_RADIUS, (id, pos) => {
        const ni = world.get(id, NamedIdentity);
        if (ni?.identity !== 'shrine') return;
        const d = Math.max(Math.abs(atkPos.x - pos.x), Math.abs(atkPos.y - pos.y));
        if (d < nearestDist) { nearestDist = d; nearestId = id; nearestX = pos.x; nearestY = pos.y; }
    });

    if (!Number.isFinite(nearestDist)) return { mult: 1, label: null, standing: 0, dist: -1, shrineId: -1, shrineX: 0, shrineY: 0 };

    const standing = scoreDeityStanding(resolved.deity);
    if (standing === -999) return { mult: 1, label: null, standing: 0, dist: nearestDist, shrineId: nearestId, shrineX: nearestX, shrineY: nearestY };

    // Normalize standing to [-1, +1]
    const normalized = Math.max(-1, Math.min(1, standing / SHRINE_STANDING_CAP));
    // Distance falloff: full at dist=0, zero at radius edge
    const distanceFactor = 1 - (nearestDist / SHRINE_COMBAT_RADIUS);
    const scalingAmount = normalized * SHRINE_SCALING_MAX * distanceFactor;
    const mult = 1 + scalingAmount;

    // Determine affix label based on magnitude
    let label = null;
    if (Math.abs(scalingAmount) >= 0.02) {
        label = scalingAmount > 0 ? 'DIVINE FAVOR' : 'DIVINE WRATH';
    }

    return { mult, label, standing, dist: nearestDist, shrineId: nearestId, shrineX: nearestX, shrineY: nearestY };
}

/** @param {import('../../lib/ecs-js/index.js').World} world @param {{attacker:number, defender:number, weaponId:number, damage:number, world:any}} base */
function makeCombatFrame(world, base) {
    return createLegacyCombatFrame(world, base, {
        retaliate: (amount) => {
            dealDamage(world, {
                target: base.attacker,
                amount: Math.max(0, amount | 0),
                source: base.defender,
                type: 'physical',
                cause: 'retaliation',
                bypassResist: true,
                noTrigger: true,
            });
        },
    });
}

function applyDamageTextureEffects(world, {
    attacker, defender, damageType, appliedDamage, critical,
}) {
    if (!(appliedDamage > 0) || !world.isAlive(defender)) return;
    const ae = ensureActiveEffects(world, defender);
    if (!ae) return;

    if (damageType === 'blunt' && appliedDamage >= 4) {
        upsertTimedEffect(ae.effects, {
            key: 'stagger',
            turnsLeft: critical ? 2 : 1,
            potency: 1,
            stacks: 1,
            sourceId: attacker,
            startedAtTurn: world.step,
        });
        world.emit('combat:status:stagger', { attacker, defender, critical: !!critical });
    }
}

/**
 * Install immediate bump-attack listener once per world.
 * Bump attacks are emitted from movement as events so they can resolve within
 * the same tick even when intent adds are deferred.
 * @param {import('../../lib/ecs-js/index.js').World} world
 */
export function installBumpAttackListener(world) {
    if (!world || world[BUMP_ATTACK_INSTALLED]) return;
    world[BUMP_ATTACK_INSTALLED] = true;

    world.on('bump:attack', ({ attacker, target }) => {
        const source = Number(attacker || 0) | 0;
        const defender = Number(target || 0) | 0;
        if (!(source > 0) || !(defender > 0) || source === defender) return;
        try {
            const attempted = resolveMeleeAttack(world, source, defender);
            if (attempted) resolveOffhandAttack(world, source, defender);
        } catch (e) { console.error('[combatSystem] resolveMeleeAttack failed:', e); }
    });

}

/**
 * Core d20 melee hit resolution shared by main-hand and off-hand attacks.
 * Handles: fumble, snapshots, d20 roll, damage dice, crit, proc phases, dealDamage.
 * @returns {boolean} true if the attack was attempted
 */
function resolveHitRoll(world, {
    source, target, weaponId, atkEq,
    hitPenalty, baseDamageMult, seedSalt, fumbleSalt,
    tags, offhand,
}) {
    // Cursed weapon fumble: 20% chance to waste the attack (stamina already spent)
    if (weaponId) {
        const weaponBeat = world.get(weaponId, Beatitude);
        if (weaponBeat && weaponBeat.state === BUC_CURSED) {
            const fumbleSeed = combatSeed(world.seed, world.step, source, target, fumbleSalt);
            const fumbleRng = mulberry32(fumbleSeed);
            if (pct(fumbleRng, 20)) {
                const pos = world.get(source, Position);
                world.emit?.('combat:fumble', {
                    attacker: source, defender: target, weaponId,
                    name: world.get(weaponId, NamedIdentity)?.name || 'weapon',
                    at: pos ? { x: pos.x, y: pos.y } : undefined,
                });
                return true;
            }
        }
    }

    const atkSnapshot = resolveCombatSnapshot(world, source, { mode: 'melee' });
    const defSnapshot = resolveCombatSnapshot(world, target, { mode: 'melee' });
    const blindExposure = Math.max(0, Number(defSnapshot?.status?.blinded || 0));

    // Blinded attacker fumble: swinging without sight
    const atkBlinded = Math.max(0, Number(atkSnapshot?.status?.blinded || 0));
    if (atkBlinded > 0) {
        const blindFumblePct = getBlindedFumbleChancePct(atkBlinded);
        if (blindFumblePct > 0) {
            const bfSeed = combatSeed(world.seed, world.step, source, target, fumbleSalt ^ 0xB11D);
            const bfRng = mulberry32(bfSeed);
            if (pct(bfRng, blindFumblePct)) {
                const pos = world.get(source, Position);
                world.emit?.('combat:fumble', {
                    attacker: source, defender: target, weaponId,
                    name: world.get(weaponId, NamedIdentity)?.name || 'weapon',
                    reason: 'blinded',
                    at: pos ? { x: pos.x, y: pos.y } : undefined,
                });
                return true;
            }
        }
    }

    breakStealthOnOffense(world, source, { reason: 'attack', mode: 'melee', targetId: target });
    const positional = getPositionalAttackBonus(world, source, target);
    const actionTags = Array.isArray(tags) ? [...tags, `relation:${positional.relation}`] : [`relation:${positional.relation}`];
    const attackPos = world.get(source, Position);
    const weaponFamily = resolveEventWeaponFamily(world, weaponId);
    const attackDamageType = resolveWeaponDamageType(world, weaponId);
    const attackFacing = getNormalizedEntityFacing(world, source);
    const attackFacingVector = (attackFacing && Number.isFinite(attackFacing.dx) && Number.isFinite(attackFacing.dy))
        ? { dx: Number(attackFacing.dx), dy: Number(attackFacing.dy) }
        : null;
    const meleeImpactProfile = buildMeleeImpactProfile(
        world,
        source,
        weaponId,
        attackDamageType,
        offhand,
        attackFacingVector,
    );
    world.emit('combat:melee:attack', {
        attacker: source,
        defender: target,
        weaponId: weaponId || 0,
        weaponFamily,
        offhand: !!offhand,
        impactProfile: meleeImpactProfile,
        at: attackPos ? { x: attackPos.x, y: attackPos.y } : undefined,
    });
    let attackBonus = atkSnapshot.attackBonus + hitPenalty + positional.attackBonus;
    const armorClass = defSnapshot.armorClass;

    const seed = combatSeed(world.seed, world.step, source, target, seedSalt);
    const r = mulberry32(seed);
    const d20 = rngInt(r, 1, 20);
    const totalToHit = d20 + attackBonus;
    let isCrit = d20 === 20;
    const isNat1 = d20 === 1;

    if (!isCrit && (isNat1 || totalToHit < armorClass)) {
        world.emit?.('status', {
            ...createStatusEvent({ id: target, kind: 'miss', source }),
            weaponId: weaponId || 0,
            weaponFamily,
            offhand: !!offhand,
            impactProfile: meleeImpactProfile,
        });
        applyPendingDamageProcPhase(world, source, buildProcContext('onMiss', {
            source, target, item: weaponId || 0, damage: 0,
            damageType: 'physical', crit: false, tags: actionTags, scratch: {}, offhand,
        }), () => r());
        return true;
    }

    // ── Dodge check: defender's evade stat grants a chance to avoid the hit entirely ──
    if (!isCrit && defSnapshot.evade > 0) {
        // Dodge chance: evade / (evade + 20) — diminishing returns, caps ~71% at evade=50
        const dodgeChance = defSnapshot.evade / (defSnapshot.evade + 20);
        const dodgeRoll = r();
        if (dodgeRoll < dodgeChance) {
            const dpos = world.get(target, Position);
            world.emit('combat:dodge', {
                defender: target,
                attacker: source,
                weaponId: weaponId || 0,
                weaponFamily,
                offhand: !!offhand,
                impactProfile: meleeImpactProfile,
                at: dpos ? { x: dpos.x, y: dpos.y } : undefined,
            });
            applyPendingDamageProcPhase(world, source, buildProcContext('onMiss', {
                source, target, item: weaponId || 0, damage: 0,
                damageType: 'physical', crit: false, tags: [...actionTags, 'dodged'], scratch: {}, offhand,
            }), () => r());
            return true;
        }
    }

    // ── Parry check: defender with a weapon (not shield) in hand can deflect attacks ──
    if (!isCrit) {
        const defEq = world.get(target, Equipment);
        const defWeaponId = Number(defEq?.weapon || 0) | 0;
        if (defWeaponId > 0 && world.isAlive(defWeaponId) && !hasOffhandShield(world, target)) {
            const defWeaponInfo = world.get(defWeaponId, ItemInfo);
            if (defWeaponInfo?.damageDice) {
                // Dual-wield bonus: +5% parry when offhand also has a weapon
                const offhandId = Number(defEq?.offhand || 0) | 0;
                let dualWieldBonus = 0;
                if (offhandId > 0 && world.isAlive(offhandId)) {
                    const offInfo = world.get(offhandId, ItemInfo);
                    if (offInfo?.damageDice) dualWieldBonus = 0.05;
                }
                // Parry chance: 8% base + 1% per defender evade + 5% dual-wield, capped at 30%
                const parryChance = Math.min(0.30, 0.08 + defSnapshot.evade * 0.01 + dualWieldBonus);
                const parryRoll = r();
                if (parryRoll < parryChance) {
                    const dpos = world.get(target, Position);
                    world.emit('combat:parry', {
                        defender: target,
                        attacker: source,
                        weaponId: defWeaponId,
                        attackerWeaponId: weaponId || 0,
                        weaponName: world.get(defWeaponId, NamedIdentity)?.name || 'weapon',
                        impactProfile: meleeImpactProfile,
                        at: dpos ? { x: dpos.x, y: dpos.y } : undefined,
                        dualWield: dualWieldBonus > 0,
                    });
                    applyPendingDamageProcPhase(world, source, buildProcContext('onMiss', {
                        source, target, item: weaponId || 0, damage: 0,
                        damageType: 'physical', crit: false, tags: [...actionTags, 'parried'], scratch: {}, offhand,
                    }), () => r());
                    return true;
                }
            }
        }
    }

    // Base damage from weapon dice (or fallback)
    let damageType = attackDamageType;
    let baseDice = null;
    if (weaponId) {
        const info = world.get(weaponId, ItemInfo);
        baseDice = info?.damageDice ? String(info.damageDice) : null;
    }
    if (!baseDice) {
        const isPlayer = world.has(source, Player);
        baseDice = isPlayer ? '1d2' : (atkEq?.naturalDamageDice || '1d8');
    }
    const damageRoll = rollDice(baseDice, r);
    const flatBonus = atkSnapshot.damageFlatBonus;
    let dmg = Math.max(0, Math.floor((damageRoll + flatBonus) * baseDamageMult));
    dmg = Math.max(0, Math.floor(dmg * positional.damageMult));
    if ((Number(atkSnapshot?.posture?.lastMoveStep ?? -1) | 0) === (Number(world.step || 0) | 0)) {
        dmg += 1; // momentum chip from same-turn movement commitment
    }

    // Blessed weapon bonus vs undead and demons
    if (weaponId) {
        const weaponBeat = world.get(weaponId, Beatitude);
        if (weaponBeat?.state === BUC_BLESSED) {
            const ct = world.get(target, CreatureType);
            const isHolyTarget = ct?.type === CREATURE_TYPES.undead || ct?.type === CREATURE_TYPES.demon;
            if (isHolyTarget) {
                dmg += 2;
                // 5% chance to proc holy smite (burst of pure light damage)
                const smiteSeed = combatSeed(world.seed, world.step, source, target, 0xB1E55);
                if (pct(mulberry32(smiteSeed), 5)) {
                    dealDamage(world, {
                        target, amount: 3, source,
                        type: 'holy', cause: 'holy_smite',
                    });
                    world.emit('combat:holy_smite', {
                        attacker: source, defender: target, weaponId, damage: 3,
                    });
                }
            }
        }
    }

    let armorPenetration = Math.max(0, Number(atkSnapshot.physicalPenetration || 0));
    if (damageType === 'blunt') armorPenetration += Math.max(0, Number(atkSnapshot.bluntPenetration || 0));
    if (damageType === 'slash') armorPenetration += Math.max(0, Number(atkSnapshot.slashPenetration || 0));
    if (damageType === 'pierce') armorPenetration += Math.max(0, Number(atkSnapshot.piercePenetration || 0));

    if (!isCrit) {
        const blindCritBonusPct = getBlindedCritChanceBonusPct(blindExposure);
        const critPct = (atkSnapshot.critChance * 100) + (atkSnapshot.luck || 0) + blindCritBonusPct;
        if (critPct > 0) isCrit = pct(r, critPct);
    }
    const blindCritMultBonus = getBlindedCritMultBonus(blindExposure);
    const critMult = 2 + (atkSnapshot.critMult || 0) + blindCritMultBonus;
    if (isCrit) dmg = Math.max(1, Math.floor(dmg * critMult));
    dmg = calculateBlindedPhysicalDamage(dmg, blindExposure);
    if (atkSnapshot.damageMult > 1) dmg = Math.max(1, Math.floor(dmg * atkSnapshot.damageMult));

    // Shrine proximity scaling — deity favor modifies damage near shrines
    const shrineScaling = computeShrineCombatScaling(world, source);
    if (shrineScaling.mult !== 1) {
        const preShrDmg = dmg;
        dmg = Math.max(1, Math.floor(dmg * shrineScaling.mult));
        if (dmg !== preShrDmg && shrineScaling.label) {
            world.emit('shrine:combat:scaling', {
                attacker: source,
                target,
                label: shrineScaling.label,
                mult: shrineScaling.mult,
                delta: dmg - preShrDmg,
                standing: shrineScaling.standing,
                dist: shrineScaling.dist,
                shrineId: shrineScaling.shrineId,
                shrineX: shrineScaling.shrineX,
                shrineY: shrineScaling.shrineY,
            });
        }
    }

    // Pre-hit hooks
    const procScratch = {};
    const ctx = makeCombatFrame(world, { attacker: source, defender: target, weaponId: weaponId || 0, damage: dmg, damageType, world });
    world.emit('beforeHit', ctx);
    let finalDmg = Math.max(0, Math.floor(ctx.damage));
    finalDmg = applyPendingDamageProcPhase(world, source, buildProcContext('onBeforeHit', {
        source, target, item: weaponId || 0, damage: finalDmg,
        damageType, crit: isCrit, tags: actionTags, scratch: procScratch, offhand,
    }), () => r());
    ctx.damage = finalDmg;
    runLegacyMonsterHook(world, source, 'onBeforeHit', ctx);
    finalDmg = Math.max(0, Math.floor(ctx.damage));

    const hitCtx = makeCombatFrame(world, { attacker: source, defender: target, weaponId: ctx.weaponId || 0, damage: finalDmg, damageType, world });
    world.emit('hit', hitCtx);
    finalDmg = Math.max(0, Math.floor(hitCtx.damage));
    finalDmg = applyPendingDamageProcPhase(world, source, buildProcContext('onHit', {
        source, target, item: ctx.weaponId || 0, damage: finalDmg,
        damageType, crit: isCrit, tags: actionTags, scratch: procScratch, offhand,
    }), () => r());
    hitCtx.damage = finalDmg;

    applyWeaponCoatingOnHit(world, {
        attacker: source, defender: target, weaponId,
        didHit: finalDmg > 0,
    });

    runLegacyMonsterHook(world, source, 'onHit', hitCtx);
    applyReactionProcPhase(world, target, buildProcContext('onHit', {
        source, target, item: ctx.weaponId || 0, damage: finalDmg,
        damageType, crit: isCrit, tags: actionTags, scratch: procScratch, offhand,
    }), { excludeSlots: ['weapon'] });

    if (finalDmg > 0) {
        const srcPos = world.get(source, Position);
        const dstPos = world.get(target, Position);
        const result = dealDamage(world, {
            target, amount: finalDmg, source,
            type: damageType, cause: 'melee',
            critical: isCrit,
            weaponId,
            armorPenetration,
            impactVector: computeImpactVector(srcPos, dstPos),
            impactProfile: meleeImpactProfile,
            ...(offhand ? { offhand: true } : {}),
        });
        if (result.applied) {
            applyDamageTextureEffects(world, {
                attacker: source,
                defender: target,
                damageType,
                appliedDamage: result.amount,
                critical: isCrit,
            });
            // Ignite Weapons: bonus fire damage on melee hit
            const _fwAe = world.get(source, ActiveEffects);
            const _hasFw = _fwAe && Array.isArray(_fwAe.effects) && _fwAe.effects.some(e => e && e.key === 'fire_weapon' && (e.turnsLeft | 0) > 0);
            if (result.amount > 0 && _hasFw) {
                const fireDmg = 3;
                dealDamage(world, {
                    source, target, amount: fireDmg, type: 'fire',
                    cause: 'proc:fire_weapon', at: spec.at,
                    bypassResist: false,
                });
                // 20% chance to apply burn
                const fwRng = mulberry32(combatSeed(world.seed, world.step, source, target, 0xF1AE));
                if (fwRng() < 0.20) {
                    const tae = world.get(target, ActiveEffects);
                    if (tae && Array.isArray(tae.effects)) {
                        upsertTimedEffect(tae.effects, {
                            key: 'burn', turnsLeft: 3, potency: 1, stacks: 1, sourceId: source,
                        });
                    }
                }
            }
            // Bloodthirst: heal attacker for 25% of melee damage dealt
            const _btAe = _fwAe || world.get(source, ActiveEffects);
            const _hasBt = _btAe && Array.isArray(_btAe.effects) && _btAe.effects.some(e => e && e.key === 'bloodthirst' && (e.turnsLeft | 0) > 0);
            if (result.amount > 0 && _hasBt) {
                const healAmt = Math.max(1, Math.floor(result.amount * 0.25));
                const healed = applyHealing(world, {
                    target: source,
                    amount: healAmt,
                    source,
                    cause: 'bloodthirst',
                }).amount;
                world.emit('proc:bloodthirst', { actor: source, target, healed });
            }
        }
        if (!result.applied && result.reason !== 'invulnerable' && result.reason !== 'resisted') {
            world.emit?.('status', createStatusEvent({ id: target, kind: 'miss', source }));
        }
    } else {
        world.emit?.('status', createStatusEvent({ id: target, kind: 'miss', source }));
    }
    return true;
}

/**
 * Resolve one main-hand melee attack attempt.
 * @returns {boolean} true if the attack was attempted (past range/faction/stamina gates)
 */
export function resolveMeleeAttack(world, attacker, defender, options = {}) {
    const source = Number(attacker || 0) | 0;
    const target = Number(defender || 0) | 0;
    if (!(source > 0) || !(target > 0)) return false;
    if (!world.isAlive(target)) return false;

    const atkVit = world.get(source, Vitality);
    const defVit = world.get(target, Vitality);
    if (!atkVit || !defVit) return false;

    // Range gate: only allow melee from orthogonal adjacency
    const apos = world.get(source, Position);
    const dpos = world.get(target, Position);
    if (!apos || !dpos || (Math.abs((apos.x|0) - (dpos.x|0)) + Math.abs((apos.y|0) - (dpos.y|0))) !== 1) return false;
    const facing = getNormalizedEntityFacing(world, source);
    if (facing) {
        const coneDegrees = getEntityFacingConeDegrees(world, source);
        if (!isPointInFacingCone(apos.x, apos.y, dpos.x, dpos.y, facing.dx, facing.dy, coneDegrees)) return false;
    }

    // Faction hostility gate
    const af = world.get(source, Faction)?.key || '';
    const df = world.get(target, Faction)?.key || '';
    if (!areFactionsHostile(af, df) && options.allowNonHostile !== true) return false;

    const atkEq = world.get(source, Equipment);
    ensureEquippedAffixTopology(world, source);
    ensureEquippedAffixTopology(world, target);

    // Stamina gate
    const atkStam = world.get(source, Stamina);
    const weaponId = atkEq?.weapon || 0;
    let staminaCost = 3;
    if (weaponId) {
        const weaponInfo = world.get(weaponId, ItemInfo);
        staminaCost = Number(weaponInfo?.staminaCost ?? 8);
    }
    if (atkStam) {
        const have = Number(atkStam.stamina ?? 0);
        if (have < staminaCost) {
            world.emit?.('attack:insufficient-stamina', {
                attacker: source, defender: target, weaponId, need: staminaCost, have
            });
            return false;
        }
        world.set(source, Stamina, { ...atkStam, stamina: have - staminaCost, regenCooldown: STAMINA_REGEN_COOLDOWN });
    }
    setCombatPosture(world, source, COMBAT_POSTURES.aggressive, { reason: 'attack:melee' });

    if (options.allowNonHostile === true && !areFactionsHostile(af, df)) {
        const offenseSnapshot = resolveCombatSnapshot(world, source, { mode: 'melee' });
        const offense = classifyActorTargetAction(world, {
            actorId: source,
            targetId: target,
            actionKind: 'melee_attack',
            attribution: Math.max(0, Number(offenseSnapshot?.status?.invisible || 0)) > 0
                ? OFFENSE_ATTRIBUTION.unknown
                : OFFENSE_ATTRIBUTION.known,
        });
        if (offense.offenseKind !== 'none') {
            world.emit('offense:committed', {
                actorId: source,
                victimId: target,
                offense,
            });
        }
    }

    return resolveHitRoll(world, {
        source, target, weaponId, atkEq,
        hitPenalty: 0, baseDamageMult: 1.0,
        seedSalt: undefined, fumbleSalt: 0xF0B1E,
        tags: ['melee'], offhand: false,
    });
}

/**
 * Resolve an off-hand melee attack after the main hand.
 * Only fires if attacker has a 1H weapon in Equipment.offhand.
 */
function resolveOffhandAttack(world, attacker, defender) {
    const source = Number(attacker || 0) | 0;
    const target = Number(defender || 0) | 0;
    if (!(source > 0) || !(target > 0)) return;
    if (!world.isAlive(target)) return;

    const atkEq = world.get(source, Equipment);
    if (!atkEq) return;
    ensureEquippedAffixTopology(world, source);
    ensureEquippedAffixTopology(world, target);
    const offhandId = Number(atkEq.offhand || 0) | 0;
    if (!(offhandId > 0)) return;

    // Only fire if offhand item is a 1H weapon with damageDice
    const offInfo = world.get(offhandId, ItemInfo);
    if (!offInfo || (offInfo.slot !== 'weapon' && offInfo.type !== 'equip')) return;
    if (offInfo.twoHanded) return;
    if (!offInfo.damageDice) return;

    // Defender must still be alive (may have died from main hand)
    const defVit = world.get(target, Vitality);
    if (!defVit || (defVit.hp | 0) <= 0) return;

    // Range gate
    const apos = world.get(source, Position);
    const dpos = world.get(target, Position);
    if (!apos || !dpos || (Math.abs((apos.x|0) - (dpos.x|0)) + Math.abs((apos.y|0) - (dpos.y|0))) !== 1) return;

    // Stamina gate: half cost, rounded up — silently skip if insufficient
    const atkStam = world.get(source, Stamina);
    const fullCost = Number(offInfo.staminaCost ?? 8);
    const halfCost = Math.ceil(fullCost / 2);
    if (atkStam) {
        const have = Number(atkStam.stamina ?? 0);
        if (have < halfCost) return;
        world.set(source, Stamina, { ...atkStam, stamina: have - halfCost, regenCooldown: STAMINA_REGEN_COOLDOWN });
    }

    // Determine penalties (negated by ambidextrous trait)
    const traits = world.get(source, Traits);
    const isAmbi = traits?.ambidextrous === true;

    resolveHitRoll(world, {
        source, target, weaponId: offhandId, atkEq,
        hitPenalty: isAmbi ? 0 : -3,
        baseDamageMult: isAmbi ? 1.0 : 0.75,
        seedSalt: 0x0FF, fumbleSalt: 0x0FF2,
        tags: ['melee', 'offhand'], offhand: true,
    });
}

/** @param {import('../../lib/ecs-js/index.js').World} world */
export function combatSystem(world) {
    for (const [attacker, intent] of world.query(AttackIntent)) {
        try {
            const attempted = resolveMeleeAttack(world, attacker, intent.targetId | 0, {
                allowNonHostile: intent.allowNonHostile === true,
            });
            if (attempted) resolveOffhandAttack(world, attacker, intent.targetId | 0);
        } catch (e) { console.error('[combatSystem] resolveMeleeAttack failed:', e); }
        try { world.remove(attacker, AttackIntent); } catch {} // ECS: may not exist
    }
}
