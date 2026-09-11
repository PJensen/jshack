// rules/scripts/spells.js
// Minimal spell script registry and runner (pure rules; deterministic).
/** @typedef {import('../../lib/ecs-js/index.js').World} World */

/**
 * Register built-in spell scripts here. Handlers may mutate the world,
 * spawn projectiles, apply status, or emit semantic events.
 * Signature: (world, actor, spell, intent) => void
 */
const REGISTRY = Object.create(null);

import { Position } from "../components/Position.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { DungeonState } from "../components/DungeonState.js";
import { Faction } from "../components/Faction.js";
import { Vitality } from "../components/Vitality.js";
import { Mana } from "../components/Mana.js";
import { Brain } from "../components/Brain.js";
import { Collider } from "../components/Collider.js";
import { ActiveEffects } from "../components/ActiveEffects.js";
import { Physiology } from "../components/Physiology.js";
import { isWalkable } from "../environment/dungeon/tileMap.js";
import { buildBlocksVisionMap, blockedCallback } from "../utils/vision.js";
import { hasLOS } from "../../shared/math/gridLOS.js";
import { bresenhamLine } from "../../shared/math/bresenham.js";
import { dealDamage } from "../utils/dealDamage.js";
import { applyHealing } from "../utils/applyHealing.js";
import { findNearestValidTileAround } from "../utils/queries.js";
import { combatSeed, hashString32, mulberry32, rollDice, pct } from "../utils/rng.js";
import { statusStrength } from "../utils/statusFacade.js";
import { upsertTimedEffect } from "../utils/effectSemantics.js";
import { applyStatusEffect, ensureActiveEffects } from "../utils/effects.js";
import { areFactionsAllied, areFactionsHostile } from "../utils/factionHostility.js";
import { chebyshev, chebyshevScalar } from "../utils/distance.js";
import { buildSpellDamageSpec, createSpellDamageContext, emitSpellMiss, getSpellHitChancePct, getSpellIntelligenceBonus, rollSpellHit, scaleSpellDamage } from "../utils/spellDamage.js";
import { hasSpellLineOfSight } from "../utils/spellTargeting.js";
import { computeMissEndpoint } from "../utils/projectileKinematics.js";
import { isVisible as isTileVisible } from "../environment/dungeon/exploredMap.js";
import { getPassiveBonuses, effectiveMaxHp, effectiveMaxMana, effectiveMaxStamina } from "../utils/passiveBonuses.js";
import { Stamina } from "../components/Stamina.js";
import { spawnHazard } from "../utils/hazardSpawn.js";
import { createFrom } from "../../lib/ecs-js/archetype.js";
import { Monster } from "../archetypes/Creatures.js";
import { PetState } from "../components/PetState.js";
import { blind, getEffectiveVisionRange } from "../utils/blind.js";
import { Player } from "../components/Player.js";
import { Equipment, NON_AMMO_GEAR_SLOTS } from "../components/Equipment.js";
import { ItemInfo } from "../components/ItemInfo.js";
import { Channeling } from "../components/Channeling.js";
import { KnockbackPending } from "../components/KnockbackPending.js";
import { Lifespan } from "../components/Lifespan.js";
import { VoidHole } from "../components/VoidHole.js";
import { AggroState, AGGRO_LEVELS, SEARCH_TURNS_ALERTED } from "../components/AggroState.js";
import { hasEquippedProcPackageInSlot } from "../utils/spellProcGear.js";
import { resolveCombatSnapshot } from "../utils/resolveCombatSnapshot.js";
import { CreatureType, CREATURE_TYPES } from "../components/CreatureType.js";
import { getTile } from "../environment/dungeon/tileMap.js";
import { TILE_WATER, TILE_SHALLOW_WATER, TILE_WATER_DEEP } from "../environment/dungeon/constants.js";
import { isWetAt } from "../utils/wetTileMap.js";
import { WeatherState } from "../components/WeatherState.js";
import {
  calculateBlindedPhysicalDamage,
  getBlindedCritChanceBonusPct,
  getBlindedCritMultBonus,
} from "../utils/blindnessExposure.js";
import { Web } from "../archetypes/RoomFeatures.js";
import { spawnWeb } from "../utils/spawnWeb.js";
import { ALL_DIRS } from "../utils/directions.js";
import { forEachInRadius } from "../utils/spatialIndex.js";
import { resolveScrollEffectDuration } from "../utils/scrollReading.js";
import { attachEntityToCurrentFloor } from "../utils/floorEntities.js";
import { ArcaneBarrageCast, MagicMissileCast } from "../../events/ArcaneProjectileCast.js";
import { FearSpellCast } from "../../events/FearSpellCast.js";
import { FrostNovaCast } from "../../events/FrostNovaCast.js";

/** @returns {any|null} */
function _getWeather(world) {
  for (const [, ws] of world.query(WeatherState)) return ws;
  return null;
}

const FLASH_HEAL_TUNING = Object.freeze({
  healFraction: 0.22,
  minimumHeal: 1,
  splash: Object.freeze({
    // Reserved for future spell-rank gating; currently always active.
    unlockLevel: 1,
    radius: 1,
    damage: 2,
    type: 'physical',
  }),
});

/**
 * Placeholder for upcoming spell-rank progression.
 * @param {World} world
 * @param {number} actor
 * @param {{ [k:string]: any }} spell
 * @param {{ [k:string]: any }} intent
 * @returns {number}
 */
function getFlashHealSpellLevel(world, actor, spell, intent) {
  void world; void actor; void spell; void intent;
  return 1;
}

/**
 * Build a LOS blocker callback that accounts for terrain opacity and entities
 * with Collider.blocksSight (e.g. closed doors).
 *
 * @param {World} world
 * @returns {(x:number, y:number) => boolean}
 */
function createLOSBlocker(world) {
  return blockedCallback(buildBlocksVisionMap(world));
}

/**
 * @param {World} world
 * @param {number} sourceId
 * @param {number} targetId
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} to
 * @param {string} key
 * @param {number} salt
 */
function resolveMissTo(world, sourceId, targetId, from, to, key, salt) {
  return computeMissEndpoint(world, from, to, {
    sourceId,
    targetId,
    key,
    salt,
    maxAngleDeg: 15,
  });
}

/**
 * @param {World} world
 * @param {number} actor
 * @param {{ radius?:number }} spell
 * @returns {number}
 */
function resolveSpellRadius(world, actor, spell) {
  const base = Math.max(0, Number(spell?.radius || 0) | 0);
  const passive = getPassiveBonuses(world, actor);
  const bonus = Math.max(0, Math.floor(Number(passive?.spellRadiusDerived || 0)));
  return Math.max(0, base + bonus);
}

/**
 * @param {World} world
 * @param {number} actor
 * @param {{ range?:number, id?:string }} spell
 * @param {{ x?:number, y?:number }} intent
 * @returns {{ ok:boolean, center?:{x:number,y:number}, reason?:string, range?:number }}
 */
function resolveStormCenter(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return { ok: false, reason: "no_caster_pos" };
  const tx = Number(intent?.x);
  const ty = Number(intent?.y);
  const maxRange = Math.max(1, Number.isFinite(spell?.range) ? (Number(spell.range) | 0) : 10);
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
    return { ok: false, reason: "no_target", range: maxRange };
  }
  const center = { x: tx | 0, y: ty | 0 };
  const dist = chebyshev(apos, center);
  if (!(dist > 0) || dist > maxRange) {
    return { ok: false, reason: "out_of_range", range: maxRange };
  }
  const isBlocked = createLOSBlocker(world);
  if (!hasSpellLineOfSight(world, {
    sourceId: actor,
    sourcePos: apos,
    targetPos: center,
    range: maxRange,
    isBlocked,
    allowFlyingOccupantAtTarget: true,
  })) {
    return { ok: false, reason: "blocked_los", range: maxRange };
  }
  return { ok: true, center };
}

/**
 * @param {World} world
 * @param {number} actor
 * @param {{ id?:string, boltsPerTick?:number }} spell
 * @param {{ x?:number, y?:number }} intent
 * @param {{ type:'cold'|'fire', cause:string, eventName:string, burn?:boolean, frost?:boolean, baseDamage:number }} tuning
 */
function runStormScript(world, actor, spell, intent, tuning) {
  const storm = resolveStormCenter(world, actor, spell, intent);
  if (!storm.ok || !storm.center) {
    world.emit(`${String(tuning.eventName)}:failed`, {
      actor,
      spellId: spell.id,
      reason: storm.reason || "invalid_target",
      range: storm.range,
    });
    return;
  }

  const radius = resolveSpellRadius(world, actor, spell);
  const center = storm.center;
  const tiles = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      tiles.push({ x: center.x + dx, y: center.y + dy });
    }
  }
  if (tiles.length <= 0) return;

  const boltCount = Math.max(1, Number(spell?.boltsPerTick || 3) | 0);
  const impactRadius = 1;
  const impactKeys = new Set();
  /** @type {Array<{x:number,y:number, radius:number}>} */
  const impacts = [];
  const centerSalt = ((((center.x & 0xffff) << 16) ^ (center.y & 0xffff)) ^ hashString32(String(spell?.id || ""))) >>> 0;
  const rng = mulberry32(combatSeed(world.seed, world.step, actor, boltCount, centerSalt));

  while (impacts.length < boltCount && impactKeys.size < tiles.length) {
    const idx = (rng() * tiles.length) | 0;
    const pick = tiles[idx];
    const key = `${pick.x},${pick.y}`;
    if (impactKeys.has(key)) continue;
    impactKeys.add(key);
    impacts.push({ x: pick.x, y: pick.y, radius: impactRadius });
  }

  for (let i = 0; i < impacts.length; i++) {
    const impact = impacts[i];
    for (const [id, pos] of world.query(Position)) {
      const vit = /** @type any */ (world.get(id, Vitality));
      if (!vit || (vit.hp | 0) <= 0) continue;
      const dist = Math.max(Math.abs((pos.x | 0) - impact.x), Math.abs((pos.y | 0) - impact.y));
      if (dist > impactRadius) continue;

      const result = dealDamage(world, buildSpellDamageSpec(world, actor, id, {
        spell,
        baseAmount: tuning.baseDamage,
        type: tuning.type,
        cause: tuning.cause,
        at: { x: impact.x, y: impact.y },
        salt: centerSalt ^ (id * 131) ^ (i + 1),
      }));

      if (result.applied && !result.killed && tuning.burn) {
        const ae = /** @type any */ (world.get(id, ActiveEffects));
        const effect = createSpellDotEffect(world, actor, spell, {
          key: "burn",
          turnsLeft: 3,
          potency: Math.max(1, scaleSpellDamage(world, actor, 1)),
          stacks: 1,
          cause: `${tuning.cause}:burn`,
          type: "fire",
        });
        if (ae && Array.isArray(ae.effects)) upsertTimedEffect(ae.effects, effect);
        else {
          try { world.add(id, ActiveEffects, { effects: [effect] }); } catch {}
        }
      }
      if (result.applied && !result.killed && tuning.frost) {
        let ae = /** @type any */ (world.get(id, ActiveEffects));
        if (!ae) {
          try { world.add(id, ActiveEffects, { effects: [] }); } catch {}
          ae = /** @type any */ (world.get(id, ActiveEffects));
        }
        if (ae && Array.isArray(ae.effects)) {
          const existing = ae.effects.find((effect) => effect?.key === "frost");
          if (existing) {
            existing.turnsLeft = Math.max(Number(existing.turnsLeft || 0), 2);
            existing.stacks = Math.min(3, Math.max(1, Number(existing.stacks || 1)) + 1);
          } else {
            ae.effects.push({
              key: "frost",
              turnsLeft: 2,
              potency: 1,
              stacks: 1,
              startedAtTurn: world.step,
              sourceId: actor,
            });
          }
        }
      }
    }

    if (tuning.burn) {
      try {
        spawnHazard(world, {
          x: impact.x,
          y: impact.y,
          kind: "fire",
          medium: "floor",
          turnsLeft: 3,
          radius: 0,
          tickDamage: 2,
          damageType: "fire",
          cause: "firestorm_fire",
          sourceId: actor,
          sourceKind: "firestorm",
          identity: "firestorm_fire",
          name: "Firestorm Fire",
          meta: { source: "firestorm", delivery: "storm_impact" },
        });
      } catch {}
    }
  }

  let currentDepth = 0;
  for (const [, ds] of world.query(DungeonState)) {
    currentDepth = Number(ds?.currentDepth || 0) | 0;
    break;
  }

  world.emit(tuning.eventName, {
    actor,
    origin: center,
    radius,
    depth: currentDepth,
    impacts,
    boltsPerTick: impacts.length,
  });
}

/**
 * Snapshot a spell-sourced DOT so future ticks do not depend on live caster stats.
 * This is shared by distinct effects like Agony and true fire burns from spells
 * such as Meteor or future Conflagurate-style effects.
 *
 * @param {World} world
 * @param {number} actor
 * @param {{ id?:string, [k:string]:any }} spell
 * @param {{
 *   key:string,
 *   turnsLeft:number,
 *   potency:number,
 *   stacks?:number,
 *   cause?:string,
 *   type?:string,
 * }} options
 */
function createSpellDotEffect(world, actor, spell, options) {
  const ctx = createSpellDamageContext(world, actor, spell, {
    cause: options?.cause,
    type: options?.type,
  });
  return {
    key: String(options?.key || "").toLowerCase(),
    turnsLeft: Math.max(0, Number(options?.turnsLeft || 0) | 0),
    potency: Math.max(1, Number(options?.potency || 1) | 0),
    stacks: Math.max(1, Number(options?.stacks || 1) | 0),
    startedAtTurn: world.step,
    sourceId: ctx.sourceId,
    spellId: ctx.spellId,
    meta: { spellDamage: ctx },
  };
}

// Example: Lightning — auto-target nearest enemy and chain to up to 3 foes.
/** @param {World} world @param {number} actor @param {{id:string,name:string,manaCost:number,[k:string]:any}} spell @param {{[k:string]:any}} intent */
REGISTRY['lightning'] = function lightningScript(world, actor, spell, intent) {
  // Find actor position
  /** @type {{x:number,y:number}|null} */
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');
  const isBlocked = createLOSBlocker(world);

  const MAX_R = 12; // tiles
  const CHAIN_MAX = 3;
  const CHAIN_RADIUS = 8;
  const hasConductionLens = hasEquippedProcPackageInSlot(world, actor, "offhand", "conductionLens");
  const maxChainCount = hasConductionLens ? (CHAIN_MAX + 1) : CHAIN_MAX;

  // Helper: distance squared
  const d2 = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0; return dx*dx + dy*dy; };

  // Collect candidate targets (hostiles only)
  /** @type {Array<{id:number,x:number,y:number}>} */
  const candidates = [];
  for (const [id, p] of world.query(Position)) {
    if (id === actor) continue;
    const fac = /** @type any */ (world.get(id, Faction));
    if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp|0) <= 0) continue;
    if (actorFaction === 'player' && !isTileVisible(p.x | 0, p.y | 0)) continue;
    // within max radius (LOS is checked per-hop, not globally)
    if (d2(apos.x, apos.y, p.x, p.y) <= MAX_R*MAX_R) {
      candidates.push({ id, x: p.x, y: p.y });
    }
  }

  // First target must be in LOS from the caster
  candidates.sort((a,b)=> d2(apos.x,apos.y,a.x,a.y) - d2(apos.x,apos.y,b.x,b.y));
  let first = null;
  for (const c of candidates) {
    if (hasSpellLineOfSight(world, {
      sourceId: actor,
      targetId: c.id,
      sourcePos: apos,
      targetPos: c,
      range: MAX_R,
      isBlocked,
    })) { first = c; break; }
  }
  if (!first) {
    // Nothing visible to hit; emit a short self-burst semantic
    world.emit('spell:bolt', { actor, targetId: actor, spellId: spell.id, from: {x: apos.x, y: apos.y}, to: {x: apos.x, y: apos.y}, chainIndex: 0 });
    return;
  }

  const used = new Set();
  const chain = [];
  used.add(first.id);
  chain.push(first);

  // Chain to up to CHAIN_MAX-1 additional targets, nearest to current within CHAIN_RADIUS
  while (chain.length < maxChainCount) {
    const last = chain[chain.length - 1];
    let best = null; let bestD2 = Infinity;
    for (const c of candidates) {
      if (used.has(c.id)) continue;
      const dist2 = d2(last.x, last.y, c.x, c.y);
      if (dist2 <= CHAIN_RADIUS*CHAIN_RADIUS && dist2 < bestD2
          && hasSpellLineOfSight(world, {
            sourceId: last.id,
            targetId: c.id,
            sourcePos: last,
            targetPos: c,
            range: CHAIN_RADIUS,
            isBlocked,
          })) { best = c; bestD2 = dist2; }
    }
    if (!best) break;
    used.add(best.id);
    chain.push(best);
  }

  // Rain boosts lightning: +50% damage
  const _ws = _getWeather(world);
  const _rainMult = (_ws && (_ws.current === 'rain' || _ws.current === 'heavy_rain')) ? 1.5 : 1.0;

  // Apply damage along the chain and emit semantic bolt events for display
  for (let i=0; i<chain.length; i++) {
    const segFrom = (i === 0) ? { x: apos.x, y: apos.y } : { x: chain[i-1].x, y: chain[i-1].y };
    const segTo = { x: chain[i].x, y: chain[i].y };
    const targetId = chain[i].id;
    world.emit('spell:bolt', { actor, targetId, spellId: spell.id, from: segFrom, to: segTo, chainIndex: i });

    // Damage model: base 7 → attenuate per chain, boosted by rain
    const rawBase = (hasConductionLens && i >= CHAIN_MAX)
      ? Math.max(1, Math.round(7 * 0.4))
      : Math.max(1, Math.round(7 * Math.pow(0.7, i)));
    const base = Math.max(1, Math.round(rawBase * _rainMult));
    dealDamage(world, buildSpellDamageSpec(world, actor, targetId, {
      spell,
      baseAmount: base,
      type: 'electric',
      cause: 'spell:lightning',
      at: segTo,
      salt: i + 1,
    }));
  }
  if (hasConductionLens && chain.length > CHAIN_MAX) {
    world.emit("proc:conductionLens", { actor, spellId: spell.id, extraChains: chain.length - CHAIN_MAX });
  }

  // ── Rain bonus: +50% damage and +1 chain target in rain ──────────
  // (applied above via damage model; here we just emit the semantic)
  const ws = _getWeather(world);
  const isRaining = ws && (ws.current === 'rain' || ws.current === 'heavy_rain');

  // ── Lightning in water: caster takes backlash ────────────────────
  const WATER_TILES_LIGHTNING = new Set([7, 15, 17]); // TILE_WATER, TILE_WATER_DEEP, TILE_SHALLOW_WATER
  const casterTile = getTile(apos.x | 0, apos.y | 0);
  if (WATER_TILES_LIGHTNING.has(casterTile) && chain.length > 0) {
    const backlashDmg = Math.max(1, Math.round(7 * 0.5));
    dealDamage(world, buildSpellDamageSpec(world, actor, actor, {
      spell,
      baseAmount: backlashDmg,
      type: 'electric',
      cause: 'spell:lightning:backlash',
      at: { x: apos.x, y: apos.y },
      salt: 0xBAC1,
    }));
    world.emit('spell:lightning:backlash', { actor, damage: backlashDmg });
  }

  // ── Wet arc: targets standing on wet tiles arc at full damage, no chain cap ──
  const WET_ARC_RADIUS = 10;
  // Arc nodes = caster + all chain targets (arcs propagate from any of these)
  const arcNodes = [{ x: apos.x, y: apos.y }, ...chain.map(c => ({ x: c.x, y: c.y }))];
  let arcIdx = 0;
  for (const [id, p] of world.query(Position)) {
    if (used.has(id)) continue;
    const fac = world.get(id, Faction);
    if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
    const vit = world.get(id, Vitality);
    if (!vit || (vit.hp | 0) <= 0) continue;
    if (actorFaction === 'player' && !isTileVisible(p.x | 0, p.y | 0)) continue;
    if (d2(apos.x, apos.y, p.x, p.y) > WET_ARC_RADIUS * WET_ARC_RADIUS) continue;
    if (!isWetAt(world, p.x | 0, p.y | 0)) continue;
    // Find nearest arc node with LOS
    let srcNode = null; let srcD2 = Infinity;
    for (const node of arcNodes) {
      const dist2 = d2(node.x, node.y, p.x, p.y);
      if (dist2 < srcD2 && hasSpellLineOfSight(world, {
        sourceId: actor,
        targetId: id,
        sourcePos: node,
        targetPos: { x: p.x, y: p.y },
        range: WET_ARC_RADIUS,
        isBlocked,
      })) { srcNode = node; srcD2 = dist2; }
    }
    if (!srcNode) continue;
    used.add(id);
    world.emit('spell:bolt', {
      actor, targetId: id, spellId: spell.id,
      from: { x: srcNode.x, y: srcNode.y },
      to: { x: p.x, y: p.y },
      chainIndex: chain.length + arcIdx,
      wet: true,
    });
    dealDamage(world, buildSpellDamageSpec(world, actor, id, {
      spell,
      baseAmount: Math.max(1, Math.round(7 * _rainMult)),
      type: 'electric',
      cause: 'spell:lightning:arc',
      at: { x: p.x, y: p.y },
      salt: 0xA2C0 + arcIdx,
    }));
    arcNodes.push({ x: p.x, y: p.y }); // wet arcs can propagate from newly hit wet targets
    arcIdx++;
  }
  if (arcIdx > 0) {
    world.emit('spell:lightning:wetarc', { actor, spellId: spell.id, arcCount: arcIdx });
  }
};

// Blastwave — AoE knockback centered on caster. Pushes entities away; damage attenuated by distance.
REGISTRY['blastwave'] = function blastwaveScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;

  const RADIUS = 2;
  const BASE_DMG = 6;

  // Build entity-based blocking set (solid colliders like doors)
  // Terrain walls are handled by tileMap.isWalkable()
  const blocking = new Set();
  for (const [id, pos] of world.query(Position)) {
    const col = /** @type any */ (world.get(id, Collider));
    if (col && col.solid) blocking.add(`${pos.x},${pos.y}`);
  }

  // Find targets within Chebyshev RADIUS, excluding caster, with hp > 0
  /** @type {Array<{id:number, dist:number, dx:number, dy:number}>} */
  const targets = [];
  for (const [id, pos] of world.query(Position)) {
    if (id === actor) continue;
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) continue;
    const dx = (pos.x | 0) - (apos.x | 0);
    const dy = (pos.y | 0) - (apos.y | 0);
    const dist = chebyshevScalar(pos.x | 0, pos.y | 0, apos.x | 0, apos.y | 0);
    if (dist >= 1 && dist <= RADIUS) {
      targets.push({ id, dist, dx: Math.sign(dx), dy: Math.sign(dy) });
    }
  }

  const knockbacks = [];
  for (const t of targets) {
    const pos = /** @type any */ (world.get(t.id, Position));
    const pushDist = Math.max(1, RADIUS - t.dist + 1); // dist 1 → push 2, dist 2 → push 1

    // Walk push path, stop at blocking tiles
    let cx = pos.x | 0, cy = pos.y | 0;
    for (let step = 0; step < pushDist; step++) {
      const nx = cx + t.dx;
      const ny = cy + t.dy;
      if (!isWalkable(nx, ny) || blocking.has(`${nx},${ny}`)) break;
      cx = nx;
      cy = ny;
    }
    if (cx !== (pos.x | 0) || cy !== (pos.y | 0)) {
      pos.x = cx;
      pos.y = cy;
    }
    knockbacks.push({ id: t.id, x: cx, y: cy });

    // Damage attenuated by distance
    const dmg = Math.max(1, Math.round(BASE_DMG / t.dist));
    dealDamage(world, buildSpellDamageSpec(world, actor, t.id, {
      spell,
      baseAmount: dmg,
      type: 'physical',
      cause: 'spell:blastwave',
      salt: t.id,
    }));
  }

  world.emit('spell:blastwave', { actor, origin: { x: apos.x, y: apos.y }, knockbacks, radius: RADIUS });
};

// Frost Nova — AoE freeze centered on caster. Damages and roots hostile creatures in range.
REGISTRY['frost_nova'] = function frostNovaScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;

  const actorFaction = String(world.get(actor, Faction)?.key || 'player');
  const RADIUS = Math.max(1, Number(spell?.radius || 2) | 0);
  const BASE_DMG = 4;
  const FREEZE_TURNS = 8;

  /** @type {Array<{id:number, dist:number, x:number, y:number}>} */
  const targets = [];
  for (const [id, pos] of world.query(Position)) {
    if (id === actor) continue;
    const fac = /** @type any */ (world.get(id, Faction));
    if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) continue;
    const dist = chebyshevScalar(pos.x | 0, pos.y | 0, apos.x | 0, apos.y | 0);
    if (dist >= 1 && dist <= RADIUS) targets.push({ id, dist, x: pos.x | 0, y: pos.y | 0 });
  }

  const frozen = [];
  for (const t of targets) {
    const dmg = Math.max(1, Math.round(BASE_DMG / t.dist));
    const result = dealDamage(world, buildSpellDamageSpec(world, actor, t.id, {
      spell,
      baseAmount: dmg,
      type: 'cold',
      cause: 'spell:frost_nova',
      at: { x: t.x, y: t.y },
      salt: t.id,
    }));
    if (!result.applied || result.killed) continue;

    const ae = ensureActiveEffectList(world, t.id);
    if (!ae) continue;
    upsertTimedEffect(ae.effects, {
      key: 'frost', turnsLeft: FREEZE_TURNS, potency: 1, stacks: 1, sourceId: actor,
    });
    upsertTimedEffect(ae.effects, {
      key: 'rooted', turnsLeft: FREEZE_TURNS, potency: 1, stacks: 1, sourceId: actor,
    });
    frozen.push({ id: t.id, x: t.x, y: t.y });
  }

  world.emit(new FrostNovaCast({ actor, origin: { x: apos.x, y: apos.y }, frozen, radius: RADIUS }));
};

// Blink — targeted teleport up to 10 tiles.
// Confused/hallucinating casters blink in a deterministic random direction.
REGISTRY['blink'] = function blinkScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;

  const from = { x: apos.x | 0, y: apos.y | 0 };
  const maxRange = Math.max(1, Number.isFinite(spell?.range) ? (Number(spell.range) | 0) : 10);
  const confusedPower = statusStrength(world, actor, "confused");
  const hallucinPower = (
    statusStrength(world, actor, "hallucinating")
    + statusStrength(world, actor, "hallucination")
    + statusStrength(world, actor, "hallucinated")
    + statusStrength(world, actor, "mindwiped")
  );
  const randomized = confusedPower > 0 || hallucinPower > 0;

  let requested = null;
  if (randomized) {
    const posSalt = (((from.x & 0xffff) << 16) ^ (from.y & 0xffff)) >>> 0;
    const r = mulberry32(combatSeed(world.seed, world.step, actor, posSalt, 0xB11E7));
    const { dx, dy } = ALL_DIRS[(r() * ALL_DIRS.length) | 0];
    const dist = 1 + ((r() * maxRange) | 0);
    requested = { x: from.x + dx * dist, y: from.y + dy * dist };
  } else {
    const tx = Number(intent?.x);
    const ty = Number(intent?.y);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
      world.emit('spell:blink:failed', { actor, spellId: spell.id, reason: 'no_target', range: maxRange });
      return;
    }
    requested = { x: tx | 0, y: ty | 0 };
  }

  const requestedDist = chebyshev(from, requested);
  if (requestedDist <= 0 || requestedDist > maxRange) {
    world.emit('spell:blink:failed', { actor, spellId: spell.id, reason: 'out_of_range', requested, range: maxRange });
    return;
  }

  const landing = findNearestValidTileAround(world, requested, {
    maxDistance: 1,
    exclude: [from],
  });
  if (!landing) {
    world.emit('spell:blink:failed', { actor, spellId: spell.id, reason: 'no_safe_landing', requested, range: maxRange });
    return;
  }

  const landingDist = chebyshev(from, landing);
  if (landingDist <= 0 || landingDist > maxRange) {
    world.emit('spell:blink:failed', { actor, spellId: spell.id, reason: 'landing_out_of_range', requested, range: maxRange });
    return;
  }

  world.set(actor, Position, { x: landing.x | 0, y: landing.y | 0 });
  world.emit('moved', { id: actor, from, to: { x: landing.x | 0, y: landing.y | 0 } });
  world.emit('spell:blink', {
    actor,
    spellId: spell.id,
    from,
    to: { x: landing.x | 0, y: landing.y | 0 },
    requested,
    randomized,
    randomReason: randomized ? (confusedPower > 0 ? "confused" : "hallucinating") : null,
    range: maxRange,
  });
};

// Phase Strike — offensive blink that damages and stuns enemies along the teleport path.
REGISTRY['phase_strike'] = function phaseStrikeScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');

  const from = { x: apos.x | 0, y: apos.y | 0 };
  const maxRange = Math.max(1, Number.isFinite(spell?.range) ? (Number(spell.range) | 0) : 10);
  const confusedPower = statusStrength(world, actor, "confused");
  const hallucinPower = (
    statusStrength(world, actor, "hallucinating")
    + statusStrength(world, actor, "hallucination")
    + statusStrength(world, actor, "hallucinated")
    + statusStrength(world, actor, "mindwiped")
  );
  const randomized = confusedPower > 0 || hallucinPower > 0;

  let requested = null;
  if (randomized) {
    const posSalt = (((from.x & 0xffff) << 16) ^ (from.y & 0xffff)) >>> 0;
    const r = mulberry32(combatSeed(world.seed, world.step, actor, posSalt, 0xB11E7));
    const { dx, dy } = ALL_DIRS[(r() * ALL_DIRS.length) | 0];
    const dist = 1 + ((r() * maxRange) | 0);
    requested = { x: from.x + dx * dist, y: from.y + dy * dist };
  } else {
    const tx = Number(intent?.x);
    const ty = Number(intent?.y);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
      world.emit('spell:phase_strike:failed', { actor, spellId: spell.id, reason: 'no_target', range: maxRange });
      return;
    }
    requested = { x: tx | 0, y: ty | 0 };
  }

  const requestedDist = chebyshev(from, requested);
  if (requestedDist <= 0 || requestedDist > maxRange) {
    world.emit('spell:phase_strike:failed', { actor, spellId: spell.id, reason: 'out_of_range', requested, range: maxRange });
    return;
  }

  const landing = findNearestValidTileAround(world, requested, {
    maxDistance: 1,
    exclude: [from],
  });
  if (!landing) {
    world.emit('spell:phase_strike:failed', { actor, spellId: spell.id, reason: 'no_safe_landing', requested, range: maxRange });
    return;
  }

  const landingDist = chebyshev(from, landing);
  if (landingDist <= 0 || landingDist > maxRange) {
    world.emit('spell:phase_strike:failed', { actor, spellId: spell.id, reason: 'landing_out_of_range', requested, range: maxRange });
    return;
  }

  // Build a spatial lookup of living enemies on this floor
  /** @type {Map<string, Array<{id:number, x:number, y:number}>>} */
  const enemyByTile = new Map();
  for (const [id, p] of world.query(Position)) {
    if (id === actor) continue;
    const fac = /** @type any */ (world.get(id, Faction));
    if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) continue;
    const key = (p.x | 0) + ',' + (p.y | 0);
    let list = enemyByTile.get(key);
    if (!list) { list = []; enemyByTile.set(key, list); }
    list.push({ id, x: p.x | 0, y: p.y | 0 });
  }

  // Walk the Bresenham line and collect hit enemies (no duplicates)
  const STUN_TURNS = 3;
  /** @type {Array<{id:number, x:number, y:number}>} */
  const hits = [];
  const hitIds = new Set();
  for (const [bx, by] of bresenhamLine(from.x, from.y, landing.x | 0, landing.y | 0)) {
    const list = enemyByTile.get(bx + ',' + by);
    if (!list) continue;
    for (const ent of list) {
      if (hitIds.has(ent.id)) continue;
      hitIds.add(ent.id);
      hits.push(ent);
    }
  }

  // Teleport the actor
  world.set(actor, Position, { x: landing.x | 0, y: landing.y | 0 });
  world.emit('moved', { id: actor, from, to: { x: landing.x | 0, y: landing.y | 0 } });

  // Resolve weapon + gear stats for damage pipeline
  const atkEq = /** @type any */ (world.get(actor, Equipment));
  const weaponId = atkEq?.weapon || 0;
  const atkSnapshot = resolveCombatSnapshot(world, actor, { mode: 'melee' });

  // Determine weapon dice and damage type
  let baseDice = null;
  let damageType = 'physical';
  if (weaponId) {
    const info = /** @type any */ (world.get(weaponId, ItemInfo));
    baseDice = info?.damageDice ? String(info.damageDice) : null;
    const rawType = String(info?.damageType || 'physical').toLowerCase();
    if (rawType === 'blunt' || rawType === 'slash' || rawType === 'pierce') damageType = rawType;
  }
  if (!baseDice) baseDice = world.has(actor, Player) ? '1d2' : '1d8';

  // Apply damage and stun to each hit enemy
  for (const h of hits) {
    const defSnapshot = resolveCombatSnapshot(world, h.id, { mode: 'melee' });
    const blindExposure = Math.max(0, Number(defSnapshot?.status?.blinded || 0));
    const hitSeed = combatSeed(world.seed, world.step, actor, h.id, 0xB11E7);
    const r = mulberry32(hitSeed);

    // Roll weapon damage + gear flat bonus
    const damageRoll = rollDice(baseDice, r);
    let dmg = Math.max(0, Math.floor(damageRoll + atkSnapshot.damageFlatBonus));

    // Crit resolution (gear crit chance + blind bonus)
    let isCrit = false;
    const blindCritBonusPct = getBlindedCritChanceBonusPct(blindExposure);
    const critPct = (atkSnapshot.critChance * 100) + (atkSnapshot.luck || 0) + blindCritBonusPct;
    if (critPct > 0) isCrit = pct(r, critPct);
    const blindCritMultBonus = getBlindedCritMultBonus(blindExposure);
    const critMult = 2 + (atkSnapshot.critMult || 0) + blindCritMultBonus;
    if (isCrit) dmg = Math.max(1, Math.floor(dmg * critMult));

    // Blind physical damage bonus
    dmg = calculateBlindedPhysicalDamage(dmg, blindExposure);

    // Gear damage multiplier
    if (atkSnapshot.damageMult > 1) dmg = Math.max(1, Math.floor(dmg * atkSnapshot.damageMult));

    const _phDx = Number(h.x || 0) - Number(from.x || 0);
    const _phDy = Number(h.y || 0) - Number(from.y || 0);
    const _phMag = Math.hypot(_phDx, _phDy) || 1;
    dealDamage(world, {
      target: h.id, amount: Math.max(1, dmg), source: actor,
      type: damageType, cause: 'spell:phase_strike',
      critical: isCrit,
      impactVector: { dx: _phDx / _phMag, dy: _phDy / _phMag },
    });

    // Apply stun via ActiveEffects
    let ae = /** @type any */ (world.get(h.id, ActiveEffects));
    if (!ae) {
      try { world.add(h.id, ActiveEffects, { effects: [] }); } catch {}
      ae = /** @type any */ (world.get(h.id, ActiveEffects));
    }
    if (ae && Array.isArray(ae.effects)) {
      const existing = ae.effects.find(/** @param {any} e */ (e) => e.key === 'stun');
      if (existing) {
        existing.turnsLeft = Math.max(existing.turnsLeft, STUN_TURNS);
      } else {
        ae.effects.push({ key: 'stun', turnsLeft: STUN_TURNS, potency: 1, stacks: 1, startedAtTurn: world.step, sourceId: actor });
      }
    }
  }

  world.emit('spell:phase_strike', {
    actor,
    spellId: spell.id,
    from,
    to: { x: landing.x | 0, y: landing.y | 0 },
    requested,
    hits: hits.map(h => ({ id: h.id, x: h.x, y: h.y })),
    randomized,
    randomReason: randomized ? (confusedPower > 0 ? "confused" : "hallucinating") : null,
    range: maxRange,
  });
};

// Homecoming — queues an app-level teleport request back to dungeon depth 0.
REGISTRY['homecoming'] = function homecomingScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;

  let fromDepth = 0;
  for (const [, ds] of world.query(DungeonState)) {
    fromDepth = Number(ds?.currentDepth || 0) | 0;
    break;
  }

  world.emit('dungeon:teleport-depth', {
    actor,
    source: 'scroll_homecoming',
    targetDepth: 0,
    returnTicket: {
      depth: fromDepth,
      x: apos.x | 0,
      y: apos.y | 0,
    },
  });
};

// Hearthstone — 10-turn channeled version of homecoming.
REGISTRY['hearthstone'] = function hearthstoneScript(world, actor, _spell, _intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;

  let fromDepth = 0;
  for (const [, ds] of world.query(DungeonState)) {
    fromDepth = Number(ds?.currentDepth || 0) | 0;
    break;
  }

  world.emit('dungeon:teleport-depth', {
    actor,
    source: 'hearthstone',
    targetDepth: 0,
    returnTicket: {
      depth: fromDepth,
      x: apos.x | 0,
      y: apos.y | 0,
    },
  });
};

// Meteor — AoE damage at target position. Full damage at radius 1, half at radius 2.
REGISTRY['meteor'] = function meteorScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');
  const isBlocked = createLOSBlocker(world);

  const RADIUS = 2;
  const BASE_DMG = 10;
  const MAX_R = Math.max(1, Number.isFinite(spell?.range) ? (Number(spell.range) | 0) : 12);
  const confusedPower = statusStrength(world, actor, "confused");
  const hallucinPower = (
    statusStrength(world, actor, "hallucinating")
    + statusStrength(world, actor, "hallucination")
    + statusStrength(world, actor, "hallucinated")
    + statusStrength(world, actor, "mindwiped")
  );
  const randomized = confusedPower > 0 || hallucinPower > 0;

  // Determine impact center:
  // - disoriented cast: deterministic random target from caster LOS cone
  // - directed cast: use intent x/y and validate LOS/range
  // - fallback: nearest enemy in LOS (kept for non-targeting callers)
  let ox, oy;
  if (randomized) {
    /** @type {Array<{x:number,y:number}>} */
    const candidates = [];
    for (let dy = -MAX_R; dy <= MAX_R; dy++) {
      for (let dx = -MAX_R; dx <= MAX_R; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tx = (apos.x | 0) + dx;
        const ty = (apos.y | 0) + dy;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (dist > MAX_R) continue;
        if (!hasLOS(apos.x | 0, apos.y | 0, tx, ty, isBlocked)) continue;
        candidates.push({ x: tx, y: ty });
      }
    }
    if (candidates.length <= 0) {
      world.emit('spell:meteor:failed', { actor, spellId: spell.id, reason: 'no_los_target', range: MAX_R });
      return;
    }
    const posSalt = (((apos.x | 0) & 0xffff) << 16) ^ ((apos.y | 0) & 0xffff);
    const r = mulberry32(combatSeed(world.seed, world.step, actor, candidates.length, 0x0CE7E0A));
    const pick = candidates[(r() * candidates.length) | 0];
    ox = pick.x | 0;
    oy = pick.y | 0;
  } else if (intent && intent.x != null && intent.y != null) {
    ox = intent.x | 0;
    oy = intent.y | 0;
    const dist = chebyshevScalar(ox | 0, oy | 0, apos.x | 0, apos.y | 0);
    if (!(dist > 0) || dist > MAX_R) {
      world.emit('spell:meteor:failed', { actor, spellId: spell.id, reason: 'out_of_range', range: MAX_R, requested: { x: ox, y: oy } });
      return;
    }
    if (!hasSpellLineOfSight(world, {
      sourceId: actor,
      sourcePos: apos,
      targetPos: { x: ox, y: oy },
      range: MAX_R,
      isBlocked,
      allowFlyingOccupantAtTarget: true,
    })) {
      world.emit('spell:meteor:failed', { actor, spellId: spell.id, reason: 'blocked_los', range: MAX_R, requested: { x: ox, y: oy } });
      return;
    }
  } else {
    // Auto-target nearest visible enemy with hp > 0 (fallback path)
    let bestId = 0, bestD2 = Infinity;
    for (const [id, pos] of world.query(Position)) {
      if (id === actor) continue;
      const fac = /** @type any */ (world.get(id, Faction));
      if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
      const vit = /** @type any */ (world.get(id, Vitality));
      if (!vit || (vit.hp | 0) <= 0) continue;
      const dx = (pos.x | 0) - (apos.x | 0);
      const dy = (pos.y | 0) - (apos.y | 0);
      const d2 = dx * dx + dy * dy;
      if (d2 > (MAX_R * MAX_R)) continue;
      if (d2 < bestD2 && hasSpellLineOfSight(world, {
        sourceId: actor,
        targetId: id,
        sourcePos: apos,
        targetPos: pos,
        range: MAX_R,
        isBlocked,
      })) { bestId = id; bestD2 = d2; }
    }
    if (!bestId) {
      world.emit('spell:meteor:failed', { actor, spellId: spell.id, reason: 'no_target', range: MAX_R });
      return;
    }
    const tp = /** @type any */ (world.get(bestId, Position));
    ox = tp.x | 0;
    oy = tp.y | 0;
  }

  // Apply AoE damage + burning
  for (const [id, pos] of world.query(Position)) {
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) continue;
    const ddx = (pos.x | 0) - ox, ddy = (pos.y | 0) - oy;
    const dist = Math.sqrt(ddx * ddx + ddy * ddy);
    if (dist > RADIUS) continue;
    const dmg = dist <= 1.5 ? BASE_DMG : Math.max(1, Math.floor(BASE_DMG / 2));
    const result = dealDamage(world, buildSpellDamageSpec(world, actor, id, {
      spell,
      baseAmount: dmg,
      type: 'fire',
      cause: 'spell:meteor',
      salt: ((ox & 0xffff) << 16) ^ (oy & 0xffff) ^ dist ^ id,
    }));
    // Apply burning to survivors
    if (result.applied && !result.killed) {
      const ae = /** @type any */ (world.get(id, ActiveEffects));
      const effect = createSpellDotEffect(world, actor, spell, {
        key: 'burn',
        turnsLeft: 4,
        potency: scaleSpellDamage(world, actor, 3),
        stacks: 1,
        cause: 'spell:meteor:burn',
        type: 'fire',
      });
      if (ae && Array.isArray(ae.effects)) {
        upsertTimedEffect(ae.effects, effect);
      } else {
        try { world.add(id, ActiveEffects, { effects: [effect] }); } catch {} // ECS: may already exist
      }
      world.emit('proc:burning', { actor, target: id });
    }
  }

  for (let dy = -RADIUS; dy <= RADIUS; dy++) {
    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > RADIUS) continue;
      try {
        spawnHazard(world, {
          x: ox + dx,
          y: oy + dy,
          kind: "fire",
          medium: "floor",
          turnsLeft: dist <= 1 ? 3 : 2,
          radius: 0,
          tickDamage: dist <= 1 ? 2 : 1,
          damageType: "fire",
          cause: "meteor_fire",
          sourceId: actor,
          sourceKind: "meteor",
          identity: "meteor_fire",
          name: "Meteor Fire",
          meta: { source: "meteor", delivery: "impact" },
        });
      } catch {}
    }
  }

  let currentDepth = 0;
  for (const [, ds] of world.query(DungeonState)) {
    currentDepth = Number(ds?.currentDepth || 0) | 0;
    break;
  }

  world.emit('spell:meteor', {
    actor,
    from: { x: apos.x, y: apos.y },
    origin: { x: ox, y: oy },
    radius: RADIUS,
    depth: currentDepth,
    randomized,
    randomReason: randomized ? (confusedPower > 0 ? "confused" : "hallucinating") : null,
  });
};

// Frost — auto-target nearest enemy in LOS; apply cold damage + slow effect scaled by mass.
// Heavier creatures shrug off frost faster; lighter ones freeze longer.
REGISTRY['frost'] = function frostScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');
  const isBlocked = createLOSBlocker(world);

  const MAX_R = 10;
  const BASE_DMG = 4;

  const d2 = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0; return dx * dx + dy * dy; };

  // Collect living enemy candidates in range
  /** @type {Array<{id:number,x:number,y:number,dist2:number}>} */
  const candidates = [];
  for (const [id, p] of world.query(Position)) {
    if (id === actor) continue;
    const fac = /** @type any */ (world.get(id, Faction));
    if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) continue;
    if (actorFaction === 'player' && !isTileVisible(p.x | 0, p.y | 0)) continue;
    const dist2 = d2(apos.x, apos.y, p.x, p.y);
    if (dist2 <= MAX_R * MAX_R) {
      candidates.push({ id, x: p.x, y: p.y, dist2 });
    }
  }

  // Pick nearest with LOS
  candidates.sort((a, b) => a.dist2 - b.dist2);
  let target = null;
  for (const c of candidates) {
    if (hasSpellLineOfSight(world, {
      sourceId: actor,
      targetId: c.id,
      sourcePos: apos,
      targetPos: c,
      range: MAX_R,
      isBlocked,
    })) { target = c; break; }
  }
  if (!target) {
    // No valid target; emit a fizzle pulse at caster
    world.emit('spell:frost', { actor, targetId: actor, at: { x: apos.x, y: apos.y }, from: { x: apos.x, y: apos.y }, duration: 0, mass: 0, projectileDelay: 0, fizzle: true });
    return;
  }

  // Projectile travel duration (must match display-layer frostbolt: speed 8, min 0.1, max 0.6)
  const _frostDist = Math.hypot(target.x - apos.x, target.y - apos.y) || 1;
  const _frostDelay = Math.max(0.1, Math.min(0.6, _frostDist / 8));

  // Apply cold damage
  const frostResult = dealDamage(world, buildSpellDamageSpec(world, actor, target.id, {
    spell,
    baseAmount: BASE_DMG,
    type: 'cold',
    cause: 'spell:frost',
    at: { x: target.x, y: target.y },
    projectileDelay: _frostDelay,
  }));

  // Compute frost duration from target mass: lighter = longer slow
  // Base 5 turns, -1 per 30kg above 40kg, min 2 turns
  const phys = /** @type any */ (world.get(target.id, Physiology));
  const massKg = (phys && typeof phys.massKg === 'number') ? phys.massKg : 80;
  const baseDuration = 5;
  const massPenalty = Math.floor(Math.max(0, massKg - 40) / 30);
  const duration = Math.max(2, baseDuration - massPenalty);

  if (frostResult.applied) {
    // Apply frost effect via ActiveEffects (ECS-compliant: read-then-mutate)
    let ae = /** @type any */ (world.get(target.id, ActiveEffects));
    if (!ae) {
      try { world.add(target.id, ActiveEffects, { effects: [] }); } catch {} // ECS: may already exist
      ae = /** @type any */ (world.get(target.id, ActiveEffects));
    }
    if (ae && Array.isArray(ae.effects)) {
      const existing = ae.effects.find(/** @param {any} e */ (e) => e.key === 'frost');
      if (existing) {
        existing.turnsLeft = Math.max(existing.turnsLeft, duration);
        existing.stacks = Math.min((existing.stacks || 1) + 1, 3);
      } else {
        ae.effects.push({ key: 'frost', turnsLeft: duration, potency: 1, stacks: 1, startedAtTurn: world.step, sourceId: actor });
      }
      if (hasEquippedProcPackageInSlot(world, actor, "offhand", "glacierSigil")) {
        const stun = ae.effects.find(/** @param {any} e */ (e) => e.key === "stun");
        if (stun) {
          stun.turnsLeft = Math.max(Number(stun.turnsLeft || 0), 1);
          stun.potency = Math.max(Number(stun.potency || 1), 1);
        } else {
          ae.effects.push({ key: "stun", turnsLeft: 1, potency: 1, stacks: 1, startedAtTurn: world.step, sourceId: actor });
        }
        world.emit("proc:glacierSigil", { actor, targetId: target.id });
      }
    }
  }

  // Emit semantic event for display VFX
  const frostFrom = { x: apos.x, y: apos.y };
  const frostAt = { x: target.x, y: target.y };
  const frostMissed = frostResult.reason === 'missed';
  world.emit('spell:frost', {
    actor,
    targetId: target.id,
    from: frostFrom,
    at: frostAt,
    duration: frostResult.applied ? duration : 0,
    mass: massKg,
    projectileDelay: _frostDelay,
    missed: frostMissed,
    missTo: frostMissed ? resolveMissTo(world, actor, target.id, frostFrom, frostAt, 'spell:frost', 0x1075) : undefined,
  });
};

REGISTRY["blizzard"] = function blizzardScript(world, actor, spell, intent) {
  runStormScript(world, actor, spell, intent, {
    type: "cold",
    cause: "spell:blizzard",
    eventName: "spell:blizzard",
    frost: true,
    baseDamage: 2,
  });
};

REGISTRY["firestorm"] = function firestormScript(world, actor, spell, intent) {
  runStormScript(world, actor, spell, intent, {
    type: "fire",
    cause: "spell:firestorm",
    eventName: "spell:firestorm",
    burn: true,
    baseDamage: 2,
  });
};

// Heal — restore HP to self or target. Range 6 tiles, heals 20-35 HP based on caster intelligence.
REGISTRY['heal'] = function healScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;

  // Determine target: intent position or self
  let targetId = actor;
  let targetPos = { x: apos.x, y: apos.y };

  const tx = Number(intent?.x);
  const ty = Number(intent?.y);
  if (Number.isFinite(tx) && Number.isFinite(ty)) {
    const maxRange = Math.max(1, Number.isFinite(spell?.range) ? (Number(spell.range) | 0) : 6);
    const dist = chebyshev(apos, { x: tx | 0, y: ty | 0 });
    if (dist <= maxRange) {
      // Find entity at target position — allow targeting undead enemies too
      for (const [id, p] of world.query(Position)) {
        if (p.x === (tx | 0) && p.y === (ty | 0)) {
          const fac = /** @type any */ (world.get(id, Faction));
          const ct = world.get(id, CreatureType);
          if (!fac || fac.key === 'ally' || id === actor || ct?.type === CREATURE_TYPES.undead) {
            targetId = id;
            targetPos = { x: p.x, y: p.y };
            break;
          }
        }
      }
    }
  }

  // Calculate heal/damage amount: 20-35 based on intelligence
  const brain = /** @type any */ (world.get(actor, Brain));
  const intBonus = brain?.intelligence ? Math.floor((brain.intelligence - 10) / 2) : 0;
  const healSalt = (((apos.x | 0) & 0xffff) << 16) ^ ((apos.y | 0) & 0xffff);
  const r = mulberry32(combatSeed(world.seed, world.step, actor, targetId, healSalt));
  const baseHeal = 20 + (r() * 16) | 0; // 20-35
  const amount = Math.max(1, baseHeal + intBonus);

  // Heal damages undead — positive energy sears the dead
  const targetCT = world.get(targetId, CreatureType);
  if (targetCT?.type === CREATURE_TYPES.undead) {
    dealDamage(world, buildSpellDamageSpec(world, actor, targetId, {
      spell,
      baseAmount: amount,
      type: 'holy',
      cause: 'spell:heal',
      at: targetPos,
      salt: 0x4EA1,
    }));
    world.emit('spell:heal:undead', { actor, targetId, at: targetPos, amount });
    return;
  }

  // Check if target needs healing
  const vit = /** @type any */ (world.get(targetId, Vitality));
  const hpCap = effectiveMaxHp(world, targetId, vit);
  if (!vit || (vit.hp | 0) >= hpCap) {
    world.emit('spell:heal', { actor, targetId, at: targetPos, amount: 0, reason: 'full_health' });
    return;
  }

  const actualHeal = applyHealing(world, {
    target: targetId,
    amount,
    source: actor,
    cause: 'spell:heal',
  }).amount;
  world.emit('spell:heal', { actor, targetId, at: targetPos, amount: actualHeal });
};

// Flash Heal — high-cost, self-only instant heal.
REGISTRY['flash_heal'] = function flashHealScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;

  const vit = /** @type any */ (world.get(actor, Vitality));
  const flashHpCap = effectiveMaxHp(world, actor, vit);
  if (!vit || (vit.hp | 0) >= flashHpCap) {
    world.emit('spell:flash_heal', { actor, targetId: actor, at: { x: apos.x, y: apos.y }, amount: 0, reason: 'full_health' });
    return;
  }

  const maxHp = flashHpCap;
  const spellLevel = getFlashHealSpellLevel(world, actor, spell, intent);
  const amount = Math.max(FLASH_HEAL_TUNING.minimumHeal, Math.floor(maxHp * FLASH_HEAL_TUNING.healFraction));

  const actualHeal = applyHealing(world, {
    target: actor,
    amount,
    source: actor,
    cause: 'spell:flash_heal',
  }).amount;

  /** @type {Array<{id:number, amount:number, at:{x:number,y:number}}>} */
  const splashHits = [];
  const splash = FLASH_HEAL_TUNING.splash;
  if (spellLevel >= splash.unlockLevel && splash.radius > 0 && splash.damage > 0) {
    const actorFaction = /** @type any */ (world.get(actor, Faction))?.key || '';
    for (const [id, pos] of world.query(Position)) {
      if (id === actor) continue;
      const targetVit = /** @type any */ (world.get(id, Vitality));
      if (!targetVit || (targetVit.hp | 0) <= 0) continue;
      const dist = Math.max(Math.abs((pos.x | 0) - (apos.x | 0)), Math.abs((pos.y | 0) - (apos.y | 0)));
      if (dist < 1 || dist > (splash.radius | 0)) continue;
      const targetFaction = /** @type any */ (world.get(id, Faction))?.key || '';
      if (!areFactionsHostile(actorFaction, targetFaction)) continue;
      const result = dealDamage(world, buildSpellDamageSpec(world, actor, id, {
        spell,
        baseAmount: splash.damage | 0,
        type: splash.type,
        cause: 'spell:flash_heal',
        at: { x: pos.x | 0, y: pos.y | 0 },
        salt: id,
      }));
      if (result.applied && result.amount > 0) {
        splashHits.push({ id, amount: result.amount, at: { x: pos.x | 0, y: pos.y | 0 } });
      }
    }
  }

  world.emit('spell:flash_heal', {
    actor,
    targetId: actor,
    at: { x: apos.x, y: apos.y },
    amount: actualHeal,
    spellLevel,
    splashHits,
  });
};

// Smite — holy bolt against a hostile target in line of sight.
REGISTRY['smite'] = function smiteScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const isBlocked = createLOSBlocker(world);

  const maxRange = Math.max(1, Number(spell?.range || 8));
  const d2 = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0; return dx * dx + dy * dy; };

  let preferredTargetId = Number(intent?.targetId || 0) | 0;
  if (!(preferredTargetId > 0)) {
    const tx = Number(intent?.x);
    const ty = Number(intent?.y);
    if (Number.isFinite(tx) && Number.isFinite(ty)) {
      for (const [id, p] of world.query(Position)) {
        if ((p.x | 0) === (tx | 0) && (p.y | 0) === (ty | 0)) {
          preferredTargetId = id | 0;
          break;
        }
      }
    }
  }

  /** @type {Array<{id:number,x:number,y:number,dist2:number}>} */
  const candidates = [];
  for (const [id, p] of world.query(Position)) {
    if (id === actor) continue;
    const fac = /** @type any */ (world.get(id, Faction));
    if (!fac) continue;
    const actorFaction = /** @type any */ (world.get(actor, Faction))?.key || 'player';
    if (!areFactionsHostile(actorFaction, fac.key)) continue;
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) continue;
    const dist2 = d2(apos.x, apos.y, p.x, p.y);
    if (dist2 <= maxRange * maxRange) {
      candidates.push({ id, x: p.x | 0, y: p.y | 0, dist2 });
    }
  }

  candidates.sort((a, b) => {
    if (a.id === preferredTargetId && b.id !== preferredTargetId) return -1;
    if (b.id === preferredTargetId && a.id !== preferredTargetId) return 1;
    return a.dist2 - b.dist2;
  });

  let target = null;
  for (const c of candidates) {
    if (hasSpellLineOfSight(world, {
      sourceId: actor,
      targetId: c.id,
      sourcePos: apos,
      targetPos: c,
      range: maxRange,
      isBlocked,
    })) {
      target = c;
      break;
    }
  }

  if (!target) {
    world.emit('spell:smite', { actor, targetId: actor, at: { x: apos.x, y: apos.y }, fizzle: true });
    return;
  }

  const result = dealDamage(world, buildSpellDamageSpec(world, actor, target.id, {
    spell,
    baseAmount: 6,
    type: 'holy',
    cause: 'spell:smite',
    at: { x: target.x, y: target.y },
    salt: target.id,
  }));

  const smiteAt = { x: target.x, y: target.y };
  const smiteMissed = result.reason === 'missed';
  world.emit('spell:smite', {
    actor,
    targetId: target.id,
    at: smiteAt,
    amount: result.amount || 0,
    missed: smiteMissed,
    missTo: smiteMissed ? resolveMissTo(world, actor, target.id, { x: apos.x, y: apos.y }, smiteAt, 'spell:smite', 0x5a17) : undefined,
  });

  // Dazzle: anyone with LOS to the impact gets a brief vision reduction (the flash).
  {
    const SCAN = 12;
    let playerDazzled = false;
    for (const [eid, epos] of world.query(Position)) {
      if (!world.get(eid, Brain)) continue;
      const dx = (epos.x | 0) - (target.x | 0);
      const dy = (epos.y | 0) - (target.y | 0);
      if (Math.abs(dx) > SCAN || Math.abs(dy) > SCAN) continue;
      if (!hasLOS(epos.x | 0, epos.y | 0, target.x | 0, target.y | 0, isBlocked)) continue;
      const curVision = getEffectiveVisionRange(world, eid);
      const rampOut = (world.rand() < 0.5) ? 2 : 3;
      blind(world, eid, Math.max(1, curVision - 2), 0, 0, rampOut, undefined, eid === target.id ? { stack: true } : {});
      if (world.has(eid, Player)) playerDazzled = true;
    }
    if (playerDazzled) {
      world.emit('spell:smite:dazzle');
    }
  }
};

// Boar Charge — straight-line rush, impact damage, and light knockback.
REGISTRY["boar_charge"] = function boarChargeScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || "").trim();
  const from = { x: apos.x | 0, y: apos.y | 0 };

  const targetId = Number(intent?.targetId || 0) | 0;
  const targetPos = targetId > 0 ? world.get(targetId, Position) : null;
  const fallbackPos = (Number.isFinite(intent?.x) && Number.isFinite(intent?.y))
    ? { x: Number(intent.x) | 0, y: Number(intent.y) | 0 }
    : null;
  const focus = targetPos ? { x: targetPos.x | 0, y: targetPos.y | 0 } : fallbackPos;
  if (!focus) {
    world.emit("spell:boar_charge:failed", { actor, reason: "no_target" });
    return;
  }

  const range = Math.max(2, Number(spell?.range || 4) | 0);
  const impactDamage = Math.max(1, Number(spell?.impactDamage || 6) | 0);
  const stunTurns = Math.max(1, Number(spell?.stunTurns || 1) | 0);
  const dxRaw = (focus.x | 0) - (from.x | 0);
  const dyRaw = (focus.y | 0) - (from.y | 0);
  const dist = chebyshevScalar(focus.x | 0, focus.y | 0, from.x | 0, from.y | 0);
  if (dist < 2) {
    world.emit("spell:boar_charge:failed", { actor, reason: "too_close" });
    return;
  }

  let dx = 0;
  let dy = 0;
  if (Math.abs(dxRaw) >= Math.abs(dyRaw)) dx = Math.sign(dxRaw);
  else dy = Math.sign(dyRaw);
  if (dx === 0 && dy === 0) return;

  let curX = from.x | 0;
  let curY = from.y | 0;
  for (let step = 0; step < range; step++) {
    const nx = curX + dx;
    const ny = curY + dy;
    if (!isWalkable(nx, ny)) break;

    let blocked = false;
    for (const [id, pos, col, vit] of world.query(Position, Collider, Vitality)) {
      if (id === actor) continue;
      if ((pos.x | 0) !== nx || (pos.y | 0) !== ny) continue;
      const solid = !!col?.solid;
      const alive = (vit?.hp | 0) > 0;
      if (solid || alive) {
        blocked = true;
        break;
      }
    }
    if (blocked) break;

    curX = nx;
    curY = ny;
    if (Math.max(Math.abs((focus.x | 0) - curX), Math.abs((focus.y | 0) - curY)) <= 1) break;
  }

  const to = { x: curX | 0, y: curY | 0 };
  if (to.x === from.x && to.y === from.y) {
    world.emit("spell:boar_charge:failed", { actor, reason: "blocked" });
    return;
  }

  world.set(actor, Position, to);
  world.emit("moved", { id: actor, from, to });
  world.emit("item:thrown", {
    itemId: actor,
    from: { x: from.x | 0, y: from.y | 0 },
    to: { x: to.x | 0, y: to.y | 0 },
    targetId: targetId > 0 ? targetId : 0,
    source: "monster:charge",
    mode: "self-throw",
  });

  let struckTarget = 0;
  let strikeAmount = 0;
  let missed = false;
  for (const [id, pos, fac, vit] of world.query(Position, Faction, Vitality)) {
    if (id === actor) continue;
    if (!fac || !vit || (vit.hp | 0) <= 0) continue;
    if (!areFactionsHostile(actorFaction, String(fac.key || ""))) continue;
    const adjacent = Math.max(Math.abs((pos.x | 0) - to.x), Math.abs((pos.y | 0) - to.y)) <= 1;
    if (!adjacent) continue;
    if (targetId > 0 && id !== targetId) continue;

    const result = dealDamage(world, buildSpellDamageSpec(world, actor, id, {
      spell,
      baseAmount: impactDamage,
      type: "physical",
      cause: "spell:boar_charge",
      at: { x: pos.x | 0, y: pos.y | 0 },
      salt: id ^ 0xb04,
    }));
    struckTarget = id | 0;
    strikeAmount = Number(result?.amount || 0) | 0;
    missed = result?.reason === "missed";
    if (!result.killed) {
      try { world.add(id, KnockbackPending, { dx, dy, force: 1 }); } catch {}
      let ae = /** @type any */ (world.get(id, ActiveEffects));
      if (!ae || !Array.isArray(ae.effects)) {
        try { world.add(id, ActiveEffects, { effects: [] }); } catch {}
        ae = /** @type any */ (world.get(id, ActiveEffects));
      }
      if (ae?.effects) {
        upsertTimedEffect(ae.effects, {
          key: "stun",
          turnsLeft: stunTurns,
          potency: 1,
          stacks: 1,
          startedAtTurn: world.step,
          sourceId: actor,
        });
      }
    }
    break;
  }

  world.emit("spell:boar_charge", {
    actor,
    targetId: struckTarget || targetId || 0,
    from,
    to,
    hit: struckTarget > 0 && !missed,
    amount: strikeAmount,
    missed,
  });
};

/**
 * Canonical close-range hostile strike for monster abilities that pair
 * immediate damage with a timed status.
 *
 * @param {World} world
 * @param {number} actor
 * @param {{ [k:string]: any }} spell
 * @param {{ [k:string]: any }} intent
 * @param {{
 *   eventName: string,
 *   baseAmount: number,
 *   damageType?: string,
 *   cause?: string,
 *   salt?: number,
 *   statusKey?: string,
 *   statusTurns?: number,
 *   statusPotency?: number,
 * }} tuning
 */
function runMeleeStatusStrike(world, actor, spell, intent, tuning) {
  const eventName = String(tuning?.eventName || "").trim();
  if (!eventName) return;

  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || "").trim();
  const targetId = Number(intent?.targetId || 0) | 0;
  if (!(targetId > 0)) {
    world.emit(`${eventName}:failed`, { actor, reason: "no_target" });
    return;
  }

  const tpos = world.get(targetId, Position);
  const tvit = world.get(targetId, Vitality);
  const tfac = world.get(targetId, Faction);
  if (!tpos || !tvit || (tvit.hp | 0) <= 0 || !tfac || !areFactionsHostile(actorFaction, String(tfac.key || ""))) {
    world.emit(`${eventName}:failed`, { actor, reason: "invalid_target" });
    return;
  }

  const range = Math.max(1, Number(spell?.range || 1) | 0);
  const dist = Math.max(Math.abs((apos.x | 0) - (tpos.x | 0)), Math.abs((apos.y | 0) - (tpos.y | 0)));
  if (dist > range) {
    world.emit(`${eventName}:failed`, { actor, reason: "out_of_range" });
    return;
  }

  const cause = String(tuning?.cause || eventName);
  const baseAmount = Math.max(0, Number(tuning?.baseAmount || 0) | 0);
  const damageType = String(tuning?.damageType || "physical");
  const saltBase = Number(tuning?.salt || 0) | 0;
  const result = dealDamage(world, buildSpellDamageSpec(world, actor, targetId, {
    spell,
    baseAmount,
    type: damageType,
    cause,
    at: { x: tpos.x | 0, y: tpos.y | 0 },
    salt: targetId ^ saltBase,
  }));

  const statusKey = String(tuning?.statusKey || "").trim();
  if (result.applied && !result.killed && statusKey) {
    const ae = ensureActiveEffects(world, targetId);
    if (ae?.effects) {
      upsertTimedEffect(ae.effects, {
        key: statusKey,
        turnsLeft: Math.max(1, Number(tuning?.statusTurns || 1) | 0),
        potency: Math.max(1, Number(tuning?.statusPotency || 1) | 0),
        stacks: 1,
        startedAtTurn: world.step,
        sourceId: actor,
      });
    }
  }

  world.emit(eventName, {
    actor,
    targetId,
    at: { x: tpos.x | 0, y: tpos.y | 0 },
    amount: result.amount | 0,
    hit: result.applied,
    missed: result.reason === "missed",
  });
}

// Boar Bite — close-range snap that briefly weakens the target.
REGISTRY["boar_bite"] = function boarBiteScript(world, actor, spell, intent) {
  runMeleeStatusStrike(world, actor, spell, intent, {
    eventName: "spell:boar_bite",
    baseAmount: 2,
    damageType: "physical",
    cause: "spell:boar_bite",
    salt: 0xb17e,
    statusKey: "weakened",
    statusTurns: 1,
    statusPotency: 1,
  });
};

// Rat Gnaw — close-range tearing bite with brief bleed pressure.
REGISTRY["rat_gnaw"] = function ratGnawScript(world, actor, spell, intent) {
  runMeleeStatusStrike(world, actor, spell, intent, {
    eventName: "spell:rat_gnaw",
    baseAmount: 1,
    damageType: "physical",
    cause: "spell:rat_gnaw",
    salt: 0x0a71,
    statusKey: "bleed",
    statusTurns: 2,
    statusPotency: 1,
  });
};

// Dirty Trick — goblin melee cheap-shot that briefly blinds.
REGISTRY["goblin_dirty_trick"] = function goblinDirtyTrickScript(world, actor, spell, intent) {
  runMeleeStatusStrike(world, actor, spell, intent, {
    eventName: "spell:goblin_dirty_trick",
    baseAmount: 2,
    damageType: "physical",
    cause: "spell:goblin_dirty_trick",
    salt: 0xd1e7,
    statusKey: "blinded",
    statusTurns: 1,
    statusPotency: 1,
  });
};

// Snake Fang — close-range venom strike with a short poison payload.
REGISTRY["snake_fang"] = function snakeFangScript(world, actor, spell, intent) {
  runMeleeStatusStrike(world, actor, spell, intent, {
    eventName: "spell:snake_fang",
    baseAmount: 2,
    damageType: "physical",
    cause: "spell:snake_fang",
    salt: 0x5a9e,
    statusKey: "poison",
    statusTurns: 4,
    statusPotency: 1,
  });
};

// Spider Lunge — close-range body-check that leaves targets staggered.
REGISTRY["spider_lunge"] = function spiderLungeScript(world, actor, spell, intent) {
  runMeleeStatusStrike(world, actor, spell, intent, {
    eventName: "spell:spider_lunge",
    baseAmount: 2,
    damageType: "physical",
    cause: "spell:spider_lunge",
    salt: 0x5a1d,
    statusKey: "stagger",
    statusTurns: 1,
    statusPotency: 1,
  });
};

// Bat Shriek — short confusion pulse plus nearby aggro wake-up.
// confuseTurns on the spell controls whether confusion is applied (0 = no confusion).
REGISTRY["bat_shriek"] = function batShriekScript(world, actor, spell, _intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || "").trim();
  const radius = Math.max(1, Number(spell?.radius || 4) | 0);
  const confuseTurns = Math.max(0, Number(spell?.confuseTurns || 0) | 0);

  let playerPos = null;
  for (const [id, _player, p] of world.query(Player, Position)) {
    if (id <= 0 || !p) continue;
    playerPos = { x: p.x | 0, y: p.y | 0 };
    break;
  }

  /** @type {number[]} */
  const affectedIds = [];
  /** @type {number[]} */
  const alertedIds = [];
  for (const [id, pos, fac, vit] of world.query(Position, Faction, Vitality)) {
    if (id === actor) continue;
    if (!fac || !vit || (vit.hp | 0) <= 0) continue;
    const dist = Math.max(Math.abs((pos.x | 0) - (apos.x | 0)), Math.abs((pos.y | 0) - (apos.y | 0)));
    if (dist > radius) continue;

    if (confuseTurns > 0 && areFactionsHostile(actorFaction, String(fac.key || ""))) {
      let ae = /** @type any */ (world.get(id, ActiveEffects));
      if (!ae || !Array.isArray(ae.effects)) {
        try { world.add(id, ActiveEffects, { effects: [] }); } catch {}
        ae = /** @type any */ (world.get(id, ActiveEffects));
      }
      if (ae?.effects) {
        upsertTimedEffect(ae.effects, {
          key: "confused",
          turnsLeft: confuseTurns,
          potency: 1,
          stacks: 1,
          startedAtTurn: world.step,
          sourceId: actor,
        });
        try { world.set(id, ActiveEffects, ae); } catch {}
      }
      affectedIds.push(id | 0);
    }

    if (String(fac.key || "") === actorFaction) {
      const aggro = world.get(id, AggroState);
      if (aggro) {
        aggro.alertLevel = AGGRO_LEVELS.alerted;
        aggro.searchTurnsLeft = SEARCH_TURNS_ALERTED;
        if (playerPos) {
          aggro.lastKnownX = playerPos.x | 0;
          aggro.lastKnownY = playerPos.y | 0;
        }
        alertedIds.push(id | 0);
      }
    }
  }

  world.emit("spell:bat_shriek", {
    actor,
    at: { x: apos.x | 0, y: apos.y | 0 },
    radius,
    affectedIds,
    alertedIds,
  });
};

REGISTRY["mass_delirium"] = function massDeliriumScript(world, actor, spell, _intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const radius = Math.max(1, Number(spell?.radius || 32) | 0);
  const duration = resolveScrollEffectDuration(world, actor, {
    baseTurns: Number(spell?.baseTurns || 50) | 0,
    minTurns: 50,
    maxTurns: 240,
  });
  const affectedIds = [];

  forEachInRadius(world, apos.x | 0, apos.y | 0, radius, (id) => {
    const target = Number(id || 0) | 0;
    if (!(target > 0) || target === actor) return;
    const vit = world.get(target, Vitality);
    if (!vit || (vit.hp | 0) <= 0) return;
    applyStatusEffect(world, target, {
      key: "confused",
      turnsLeft: duration.turns,
      maxTurns: duration.turns,
      potency: 1,
      stacks: 1,
      startedAtTurn: world.step | 0,
      sourceId: actor,
      sourceKind: "scroll",
      sourceKey: "scroll_mass_delirium",
    });
    affectedIds.push(target);
  });

  world.emit("spell:mass_delirium", {
    actor,
    at: { x: apos.x | 0, y: apos.y | 0 },
    radius,
    duration: duration.turns,
    affectedIds,
  });
};

// Web Spit — places a web tile at impact and slows the target.
REGISTRY["web_spit"] = function webSpitScript(world, actor, spell, intent) {
  const targetId = Number(intent?.targetId || 0) | 0;
  const targetPos = targetId > 0 ? world.get(targetId, Position) : null;
  const tx = targetPos ? (targetPos.x | 0) : (Number.isFinite(intent?.x) ? (Number(intent.x) | 0) : NaN);
  const ty = targetPos ? (targetPos.y | 0) : (Number.isFinite(intent?.y) ? (Number(intent.y) | 0) : NaN);
  if (!Number.isInteger(tx) || !Number.isInteger(ty)) {
    world.emit("spell:web_spit:failed", { actor, reason: "no_target" });
    return;
  }
  if (!isWalkable(tx, ty)) {
    world.emit("spell:web_spit:failed", { actor, reason: "blocked" });
    return;
  }

  let spawned = false;
  try {
    spawned = spawnWeb(world, tx, ty) > 0;
  } catch {}

  let slowed = false;
  if (targetId > 0) {
    const vit = /** @type any */ (world.get(targetId, Vitality));
    if (vit && (vit.hp | 0) > 0) {
      const ae = ensureActiveEffects(world, targetId);
      const slowTurns = Math.max(1, Number(spell?.slowTurns || 2) | 0);
      const slowPotency = Math.max(1, Number(spell?.slowPotency || 1) | 0);
      upsertTimedEffect(ae.effects, {
        key: "slowed",
        turnsLeft: slowTurns,
        potency: slowPotency,
        stacks: 1,
        startedAtTurn: world.step,
        sourceId: actor,
      });
      try { world.set(targetId, ActiveEffects, ae); } catch {}
      slowed = true;
    }
  }

  world.emit("spell:web_spit", {
    actor,
    targetId,
    at: { x: tx, y: ty },
    spawned,
    slowed,
    radius: Number(spell?.radius || 0) | 0,
  });
};

// Wolf Howl — alert nearby same-faction allies toward the player.
REGISTRY["wolf_howl"] = function wolfHowlScript(world, actor, spell, _intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || "").trim();
  const radius = Math.max(1, Number(spell?.radius || 6) | 0);
  const rallyTurns = Math.max(1, Number(spell?.rallyTurns || 5) | 0);
  const auraId = spawnHazard(world, {
    x: apos.x | 0,
    y: apos.y | 0,
    kind: "ally_aura",
    medium: "air",
    turnsLeft: rallyTurns,
    radius,
    cause: "spell:wolf_howl",
    sourceId: actor,
    sourceKind: "wolf_howl",
    identity: "wolf_howl_aura",
    name: "Pack Aura",
    meta: {
      effectKey: "hastened",
      effectTurns: 2,
      potency: 1,
    },
  });
  let playerPos = null;
  for (const [id, _player, p] of world.query(Player, Position)) {
    if (!(id > 0) || !p) continue;
    playerPos = { x: p.x | 0, y: p.y | 0 };
    break;
  }

  /** @type {number[]} */
  const alertedIds = [];
  /** @type {number[]} */
  const ralliedIds = [];
  for (const [id, pos, fac, vit] of world.query(Position, Faction, Vitality)) {
    if (id === actor) continue;
    if (!pos || !fac || !vit || (vit.hp | 0) <= 0) continue;
    if (!areFactionsAllied(actorFaction, fac.key)) continue;
    const dist = Math.max(Math.abs((pos.x | 0) - (apos.x | 0)), Math.abs((pos.y | 0) - (apos.y | 0)));
    if (dist > radius) continue;

    applyStatusEffect(world, id, {
      key: "hastened",
      turnsLeft: rallyTurns,
      potency: 1,
      stacks: 1,
      sourceId: actor,
      sourceKind: "spell",
      sourceKey: "wolf_howl",
    });
    ralliedIds.push(id | 0);

    const aggro = world.get(id, AggroState);
    if (aggro) {
      aggro.alertLevel = AGGRO_LEVELS.hunting;
      aggro.searchTurnsLeft = SEARCH_TURNS_ALERTED;
      if (playerPos) {
        aggro.lastKnownX = playerPos.x | 0;
        aggro.lastKnownY = playerPos.y | 0;
      }
      alertedIds.push(id | 0);
    }
  }

  world.emit("spell:wolf_howl", {
    actor,
    at: { x: apos.x | 0, y: apos.y | 0 },
    radius,
    alertedIds,
    ralliedIds,
    rallyTurns,
    auraId,
  });
};

// Shield Bash — adjacent impact with 1-tile knockback and brief stun.
REGISTRY["shield_bash"] = function shieldBashScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || "").trim();
  const targetId = Number(intent?.targetId || 0) | 0;
  if (!(targetId > 0)) {
    world.emit("spell:shield_bash:failed", { actor, reason: "no_target" });
    return;
  }
  const tpos = world.get(targetId, Position);
  const tvit = world.get(targetId, Vitality);
  const tfac = world.get(targetId, Faction);
  if (!tpos || !tvit || (tvit.hp | 0) <= 0 || !tfac || !areFactionsHostile(actorFaction, String(tfac.key || ""))) {
    world.emit("spell:shield_bash:failed", { actor, reason: "invalid_target" });
    return;
  }
  const dist = Math.max(Math.abs((apos.x | 0) - (tpos.x | 0)), Math.abs((apos.y | 0) - (tpos.y | 0)));
  if (dist > Math.max(1, Number(spell?.range || 1) | 0)) {
    world.emit("spell:shield_bash:failed", { actor, reason: "out_of_range" });
    return;
  }

  const dx = Math.sign((tpos.x | 0) - (apos.x | 0));
  const dy = Math.sign((tpos.y | 0) - (apos.y | 0));
  const result = dealDamage(world, buildSpellDamageSpec(world, actor, targetId, {
    spell,
    baseAmount: 3,
    type: "physical",
    cause: "spell:shield_bash",
    at: { x: tpos.x | 0, y: tpos.y | 0 },
    salt: targetId ^ 0xba51,
  }));
  if (result.applied && !result.killed) {
    try { world.add(targetId, KnockbackPending, { dx, dy, force: 1 }); } catch {}
    let ae = /** @type any */ (world.get(targetId, ActiveEffects));
    if (!ae || !Array.isArray(ae.effects)) {
      try { world.add(targetId, ActiveEffects, { effects: [] }); } catch {}
      ae = /** @type any */ (world.get(targetId, ActiveEffects));
    }
    if (ae?.effects) {
      upsertTimedEffect(ae.effects, {
        key: "stun",
        turnsLeft: 1,
        potency: 1,
        stacks: 1,
        startedAtTurn: world.step,
        sourceId: actor,
      });
    }
  }
  world.emit("spell:shield_bash", {
    actor,
    targetId,
    at: { x: tpos.x | 0, y: tpos.y | 0 },
    amount: result.amount | 0,
    hit: result.applied,
    missed: result.reason === "missed",
  });
};

// Acid Spit — ranged acid hit + weakened + short acid hazard patch.
REGISTRY["acid_spit"] = function acidSpitScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || "").trim();
  const targetId = Number(intent?.targetId || 0) | 0;
  const targetPos = targetId > 0 ? world.get(targetId, Position) : null;
  const tx = targetPos ? (targetPos.x | 0) : (Number.isFinite(intent?.x) ? (Number(intent.x) | 0) : NaN);
  const ty = targetPos ? (targetPos.y | 0) : (Number.isFinite(intent?.y) ? (Number(intent.y) | 0) : NaN);
  const range = Math.max(1, Number(spell?.range || 6) | 0);
  if (!Number.isInteger(tx) || !Number.isInteger(ty)) {
    world.emit("spell:acid_spit:failed", { actor, reason: "no_target", range });
    return;
  }
  const dist = Math.max(Math.abs((apos.x | 0) - tx), Math.abs((apos.y | 0) - ty));
  if (dist > range) {
    world.emit("spell:acid_spit:failed", { actor, reason: "out_of_range", range });
    return;
  }

  let struckId = 0;
  let amount = 0;
  if (targetId > 0 && world.isAlive(targetId)) {
    const fac = world.get(targetId, Faction);
    const vit = world.get(targetId, Vitality);
    if (fac && vit && (vit.hp | 0) > 0 && areFactionsHostile(actorFaction, String(fac.key || ""))) {
      const result = dealDamage(world, buildSpellDamageSpec(world, actor, targetId, {
        spell,
        baseAmount: 3,
        type: "acid",
        cause: "spell:acid_spit",
        at: { x: tx | 0, y: ty | 0 },
        salt: targetId ^ 0xac1d,
      }));
      if (result.applied) {
        struckId = targetId;
        amount = result.amount | 0;
      }
    }
  }
  if (!(struckId > 0)) {
    for (const [id, pos, fac, vit] of world.query(Position, Faction, Vitality)) {
      if ((pos.x | 0) !== tx || (pos.y | 0) !== ty) continue;
      if (!fac || !vit || (vit.hp | 0) <= 0) continue;
      if (!areFactionsHostile(actorFaction, String(fac.key || ""))) continue;
      const result = dealDamage(world, buildSpellDamageSpec(world, actor, id, {
        spell,
        baseAmount: 3,
        type: "acid",
        cause: "spell:acid_spit",
        at: { x: tx | 0, y: ty | 0 },
        salt: id ^ 0xac1d,
      }));
      if (!result.applied) continue;
      struckId = id | 0;
      amount = result.amount | 0;
      break;
    }
  }

  if (struckId > 0) {
    let ae = /** @type any */ (world.get(struckId, ActiveEffects));
    if (!ae || !Array.isArray(ae.effects)) {
      try { world.add(struckId, ActiveEffects, { effects: [] }); } catch {}
      ae = /** @type any */ (world.get(struckId, ActiveEffects));
    }
    if (ae?.effects) {
      upsertTimedEffect(ae.effects, {
        key: "weakened",
        turnsLeft: 2,
        potency: 1,
        stacks: 1,
        startedAtTurn: world.step,
        sourceId: actor,
      });
    }
  }

  const hazardId = spawnHazard(world, {
    x: tx | 0,
    y: ty | 0,
    kind: "acid",
    medium: "floor",
    turnsLeft: 2,
    radius: 0,
    tickDamage: 1,
    damageType: "acid",
    cause: "spell:acid_spit",
    sourceId: actor,
    sourceKind: "acid_spitter",
    identity: "acid_spit_pool",
    name: "Acid Pool",
  });

  world.emit("spell:acid_spit", {
    actor,
    targetId: struckId || targetId || 0,
    at: { x: tx | 0, y: ty | 0 },
    amount: amount | 0,
    hazardId: hazardId | 0,
    hit: struckId > 0,
  });
};

// Poison Spit - ranged poison hit + poison DOT + short poison hazard patch.
REGISTRY["poison_spit"] = function poisonSpitScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || "").trim();
  const targetId = Number(intent?.targetId || 0) | 0;
  const targetPos = targetId > 0 ? world.get(targetId, Position) : null;
  const tx = targetPos ? (targetPos.x | 0) : (Number.isFinite(intent?.x) ? (Number(intent.x) | 0) : NaN);
  const ty = targetPos ? (targetPos.y | 0) : (Number.isFinite(intent?.y) ? (Number(intent.y) | 0) : NaN);
  const range = Math.max(1, Number(spell?.range || 5) | 0);
  if (!Number.isInteger(tx) || !Number.isInteger(ty)) {
    world.emit("spell:poison_spit:failed", { actor, reason: "no_target", range });
    return;
  }
  const dist = Math.max(Math.abs((apos.x | 0) - tx), Math.abs((apos.y | 0) - ty));
  if (dist > range) {
    world.emit("spell:poison_spit:failed", { actor, reason: "out_of_range", range });
    return;
  }

  let struckId = 0;
  let amount = 0;
  const tryStrike = (id) => {
    const fac = world.get(id, Faction);
    const vit = world.get(id, Vitality);
    if (!fac || !vit || (vit.hp | 0) <= 0) return false;
    if (!areFactionsHostile(actorFaction, String(fac.key || ""))) return false;
    const result = dealDamage(world, buildSpellDamageSpec(world, actor, id, {
      spell,
      baseAmount: 2,
      type: "poison",
      cause: "spell:poison_spit",
      at: { x: tx | 0, y: ty | 0 },
      salt: id ^ 0x70150,
    }));
    if (!result.applied) return false;
    struckId = id | 0;
    amount = result.amount | 0;
    return true;
  };

  if (targetId > 0 && world.isAlive(targetId)) tryStrike(targetId);
  if (!(struckId > 0)) {
    for (const [id, pos] of world.query(Position)) {
      if ((pos.x | 0) !== tx || (pos.y | 0) !== ty) continue;
      if (tryStrike(id)) break;
    }
  }

  if (struckId > 0) {
    const ae = ensureActiveEffects(world, struckId);
    if (ae?.effects) {
      upsertTimedEffect(ae.effects, {
        key: "poison",
        turnsLeft: 4,
        potency: 1,
        stacks: 1,
        startedAtTurn: world.step,
        sourceId: actor,
      });
    }
  }

  const hazardId = spawnHazard(world, {
    x: tx | 0,
    y: ty | 0,
    kind: "poison",
    medium: "floor",
    turnsLeft: 2,
    radius: 0,
    tickDamage: 1,
    damageType: "poison",
    cause: "spell:poison_spit",
    sourceId: actor,
    sourceKind: "giant_frog",
    identity: "poison_spit_pool",
    name: "Poison Slime",
  });

  world.emit("spell:poison_spit", {
    actor,
    targetId: struckId || targetId || 0,
    at: { x: tx | 0, y: ty | 0 },
    amount: amount | 0,
    hazardId: hazardId | 0,
    hit: struckId > 0,
  });
};

// Death Volley — elite archer cone replacement: target tile + orthogonal neighbors.
REGISTRY["death_volley"] = function deathVolleyScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || "").trim();
  const targetId = Number(intent?.targetId || 0) | 0;
  const tpos = targetId > 0 ? world.get(targetId, Position) : null;
  const tx = tpos ? (tpos.x | 0) : (Number.isFinite(intent?.x) ? (Number(intent.x) | 0) : NaN);
  const ty = tpos ? (tpos.y | 0) : (Number.isFinite(intent?.y) ? (Number(intent.y) | 0) : NaN);
  const range = Math.max(1, Number(spell?.range || 10) | 0);
  if (!Number.isInteger(tx) || !Number.isInteger(ty)) {
    world.emit("spell:death_volley:failed", { actor, reason: "no_target", range });
    return;
  }
  const dist = Math.max(Math.abs((apos.x | 0) - tx), Math.abs((apos.y | 0) - ty));
  if (dist > range) {
    world.emit("spell:death_volley:failed", { actor, reason: "out_of_range", range });
    return;
  }

  const hits = [];
  const impactPoints = [
    { x: tx, y: ty },
    { x: tx + 1, y: ty },
    { x: tx - 1, y: ty },
    { x: tx, y: ty + 1 },
    { x: tx, y: ty - 1 },
  ];
  for (let i = 0; i < impactPoints.length; i++) {
    const at = impactPoints[i];
    for (const [id, pos, fac, vit] of world.query(Position, Faction, Vitality)) {
      if (id === actor) continue;
      if (!fac || !vit || (vit.hp | 0) <= 0) continue;
      if (!areFactionsHostile(actorFaction, String(fac.key || ""))) continue;
      if ((pos.x | 0) !== (at.x | 0) || (pos.y | 0) !== (at.y | 0)) continue;
      const result = dealDamage(world, buildSpellDamageSpec(world, actor, id, {
        spell,
        baseAmount: 4,
        type: "pierce",
        cause: "spell:death_volley",
        at: { x: at.x | 0, y: at.y | 0 },
        salt: (id * 131) ^ (i * 911),
      }));
      if (!result.applied) continue;
      hits.push({ id: id | 0, at: { x: at.x | 0, y: at.y | 0 }, amount: result.amount | 0 });
      break;
    }
  }

  world.emit("spell:death_volley", {
    actor,
    targetId,
    origin: { x: tx | 0, y: ty | 0 },
    impacts: impactPoints.map((p) => ({ x: p.x | 0, y: p.y | 0 })),
    hits,
  });
};

// Summon Skeleton — spawn a friendly skeleton near the caster.
REGISTRY['summon_skeleton'] = function summonSkeletonScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || "").trim().toLowerCase();
  const summonFaction = (actorFaction === "player" || actorFaction === "pet" || actorFaction === "summoned")
    ? "summoned"
    : (actorFaction || "summoned");

  // Find a walkable tile near the caster
  const spawnTile = findNearestValidTileAround(world, apos, {
    maxDistance: 2,
    exclude: [{ x: apos.x, y: apos.y }],
  });
  if (!spawnTile) {
    world.emit('spell:summon_skeleton:failed', { actor, spellId: spell.id, reason: 'no_space' });
    return;
  }

  // Create a friendly skeleton entity
  const skeletonId = createFrom(world, Monster, {
    x: spawnTile.x,
    y: spawnTile.y,
    name: 'Summoned Skeleton',
    identity: 'skeleton',
    faction: summonFaction,
    maxHp: 12,
    accuracyDerived: 2,
    damagePowerDerived: 2,
    evadeDerived: 2,
    naturalDamageDice: '1d6',
    sizeClass: 'M',
    massKg: 25,
    speed: 2,
    resistances: {
      kinetic: { DR: 4, bluntMult: 1.5, pierceMult: 0.5, slashMult: 0.7 },
      chemical: { toxMult: 0 },
    },
  });

  // Make skeleton commandable via pet commands (default: aggressive)
  try {
    world.add(skeletonId, PetState, {
      state: 'aggressive',
      targetX: null,
      targetY: null,
      targetItemId: 0,
      stateEnteredTurn: world.step,
      lastPlayerX: apos.x,
      lastPlayerY: apos.y,
      commandCooldown: 0,
      rangedCooldown: 0,
    });
  } catch {}

  world.emit('spell:summon_skeleton', {
    actor,
    skeletonId,
    faction: summonFaction,
    at: { x: spawnTile.x, y: spawnTile.y },
  });
};

// Shadow Bolt — high-damage shadow projectile, no status effect.
REGISTRY['shadow_bolt'] = function shadowBoltScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');
  const isBlocked = createLOSBlocker(world);

  const MAX_R = Number(spell.range || 10);
  const BASE_DMG = 8;

  const d2 = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0; return dx * dx + dy * dy; };

  // Collect living hostile candidates in range
  /** @type {Array<{id:number,x:number,y:number,dist2:number}>} */
  const candidates = [];
  for (const [id, p] of world.query(Position)) {
    if (id === actor) continue;
    const fac = /** @type any */ (world.get(id, Faction));
    if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) continue;
    if (actorFaction === 'player' && !isTileVisible(p.x | 0, p.y | 0)) continue;
    const dist2 = d2(apos.x, apos.y, p.x, p.y);
    if (dist2 <= MAX_R * MAX_R) {
      candidates.push({ id, x: p.x, y: p.y, dist2 });
    }
  }

  // Pick nearest with LOS
  candidates.sort((a, b) => a.dist2 - b.dist2);
  let target = null;
  for (const c of candidates) {
    if (hasSpellLineOfSight(world, {
      sourceId: actor,
      targetId: c.id,
      sourcePos: apos,
      targetPos: c,
      range: MAX_R,
      isBlocked,
    })) { target = c; break; }
  }
  if (!target) {
    world.emit('spell:shadow_bolt', { actor, targetId: actor, from: { x: apos.x, y: apos.y }, to: { x: apos.x, y: apos.y }, fizzle: true });
    return;
  }

  // Projectile travel duration (must match display-layer shadow_bolt: speed 10, min 0.08, max 0.7)
  const _sbDist = Math.hypot(target.x - apos.x, target.y - apos.y) || 1;
  const _sbDelay = Math.max(0.08, Math.min(0.7, _sbDist / 10));

  // Apply shadow damage — no status effect
  const result = dealDamage(world, buildSpellDamageSpec(world, actor, target.id, {
    spell,
    baseAmount: BASE_DMG,
    type: 'shadow',
    cause: 'spell:shadow_bolt',
    at: { x: target.x, y: target.y },
    projectileDelay: _sbDelay,
  }));

  // Emit VFX event
  const shadowFrom = { x: apos.x, y: apos.y };
  const shadowTo = { x: target.x, y: target.y };
  const shadowMissed = result.reason === 'missed';
  world.emit('spell:shadow_bolt', {
    actor,
    targetId: target.id,
    from: shadowFrom,
    to: shadowTo,
    missed: shadowMissed,
    missTo: shadowMissed ? resolveMissTo(world, actor, target.id, shadowFrom, shadowTo, 'spell:shadow_bolt', 0xb01a) : undefined,
  });
};

// Agony — auto-rotating shadow DOT.  Each cast picks the visible enemy that
// needs agony most: missing it entirely → lowest remaining turnsLeft → nearest.
REGISTRY['agony'] = function agonyScript(world, actor, spell, _intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');

  const MAX_R = Math.max(1, Number(spell.range || 8));
  const isBlocked = createLOSBlocker(world);
  const d2 = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0; return dx * dx + dy * dy; };

  // Collect all hostile candidates in range with LOS
  /** @type {Array<{id:number,x:number,y:number,dist2:number}>} */
  const candidates = [];
  for (const [id, p] of world.query(Position)) {
    if (id === actor) continue;
    const fac = /** @type any */ (world.get(id, Faction));
    if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) continue;
    const dist2v = d2(apos.x, apos.y, p.x, p.y);
    if (dist2v > MAX_R * MAX_R) continue;
    if (!hasSpellLineOfSight(world, {
      sourceId: actor, targetId: id,
      sourcePos: apos, targetPos: p,
      range: MAX_R, isBlocked,
    })) continue;
    candidates.push({ id, x: p.x, y: p.y, dist2: dist2v });
  }

  if (candidates.length === 0) {
    world.emit('spell:agony', { actor, targetId: actor, fizzle: true });
    return;
  }

  // Pick the enemy that needs agony most:
  //   1. missing agony entirely  2. lowest turnsLeft  3. nearest
  /** @param {{id:number}} c */
  const agonyTurnsLeft = (c) => {
    const ae = /** @type any */ (world.get(c.id, ActiveEffects));
    if (!ae || !Array.isArray(ae.effects)) return -1;           // no effects → missing
    const eff = ae.effects.find(e => e && e.key === 'agony' && (e.turnsLeft | 0) > 0);
    return eff ? (eff.turnsLeft | 0) : -1;                     // -1 = missing
  };
  candidates.sort((a, b) => {
    const aLeft = agonyTurnsLeft(a);
    const bLeft = agonyTurnsLeft(b);
    // Missing agony first (−1 sorts before any positive turnsLeft)
    if (aLeft !== bLeft) return aLeft - bLeft;
    // Tiebreak: nearest
    return a.dist2 - b.dist2;
  });

  const best = candidates[0];
  const targetId = best.id;
  const tpos = { x: best.x, y: best.y };

  // Hit roll
  const hitChancePct = getSpellHitChancePct(world, actor, targetId);
  if (!rollSpellHit(world, actor, targetId, spell)) {
    emitSpellMiss(world, actor, targetId, spell, {
      cause: 'spell:agony',
      hitChancePct,
      at: tpos,
    });
    world.emit('spell:agony', {
      actor, targetId,
      from: { x: apos.x, y: apos.y }, at: tpos,
      missed: true, hitChancePct,
    });
    return;
  }

  // Intelligence scaling
  const intBonus = getSpellIntelligenceBonus(world, actor);
  const basePotency = 1 + Math.floor(intBonus / 8);
  const baseDuration = Math.min(10, 6 + Math.floor(intBonus / 4));

  // Apply agony DOT via ActiveEffects
  const agonyEffect = createSpellDotEffect(world, actor, spell, {
    key: 'agony',
    turnsLeft: baseDuration,
    potency: basePotency,
    stacks: 1,
    cause: 'spell:agony',
    type: 'shadow',
  });
  const ae = /** @type any */ (world.get(targetId, ActiveEffects));
  if (ae && Array.isArray(ae.effects)) {
    upsertTimedEffect(ae.effects, agonyEffect);
  } else {
    try { world.add(targetId, ActiveEffects, { effects: [agonyEffect] }); } catch {}
  }

  // Emit VFX event
  world.emit('spell:agony', {
    actor, targetId,
    from: { x: apos.x, y: apos.y }, at: tpos,
    potency: basePotency, duration: baseDuration,
  });
};

REGISTRY['fear'] = function fearScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;

  const actorFaction = String(world.get(actor, Faction)?.key || 'player');
  const MAX_R = Math.max(1, Number(spell.range || 8));
  const isBlocked = createLOSBlocker(world);
  const d2 = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0; return dx * dx + dy * dy; };

  let targetId = Number(intent?.targetId || 0) | 0;
  let tpos = targetId ? /** @type any */ (world.get(targetId, Position)) : null;

  if (!targetId || !tpos) {
    /** @type {Array<{id:number,x:number,y:number,dist2:number}>} */
    const candidates = [];
    for (const [id, p] of world.query(Position)) {
      if (id === actor) continue;
      const fac = /** @type any */ (world.get(id, Faction));
      if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
      const vit = /** @type any */ (world.get(id, Vitality));
      if (!vit || (vit.hp | 0) <= 0) continue;
      const dist2v = d2(apos.x, apos.y, p.x, p.y);
      if (dist2v <= MAX_R * MAX_R) candidates.push({ id, x: p.x, y: p.y, dist2: dist2v });
    }
    candidates.sort((a, b) => a.dist2 - b.dist2);
    let found = null;
    for (const c of candidates) {
      if (hasSpellLineOfSight(world, {
        sourceId: actor,
        targetId: c.id,
        sourcePos: apos,
        targetPos: c,
        range: MAX_R,
        isBlocked,
      })) { found = c; break; }
    }
    if (!found) {
      world.emit(new FearSpellCast({
        actor,
        targetId: actor,
        from: { x: apos.x, y: apos.y },
        at: { x: apos.x, y: apos.y },
        fizzle: true,
        reason: 'no_target',
      }));
      return;
    }
    targetId = found.id;
    tpos = { x: found.x, y: found.y };
  }

  const vit = /** @type any */ (world.get(targetId, Vitality));
  if (!vit || (vit.hp | 0) <= 0) {
    world.emit(new FearSpellCast({
      actor,
      targetId,
      from: { x: apos.x, y: apos.y },
      at: { x: tpos?.x ?? apos.x, y: tpos?.y ?? apos.y },
      fizzle: true,
      reason: 'invalid_target',
    }));
    return;
  }

  if (!hasSpellLineOfSight(world, {
    sourceId: actor,
    targetId,
    sourcePos: apos,
    targetPos: tpos,
    range: MAX_R,
    isBlocked,
  })) {
    world.emit(new FearSpellCast({
      actor,
      targetId,
      from: { x: apos.x, y: apos.y },
      at: { x: tpos.x, y: tpos.y },
      fizzle: true,
      reason: 'no_los',
    }));
    return;
  }

  const dist = chebyshev(apos, tpos);
  if (dist > MAX_R) {
    world.emit(new FearSpellCast({
      actor,
      targetId,
      from: { x: apos.x, y: apos.y },
      at: { x: tpos.x, y: tpos.y },
      fizzle: true,
      reason: 'out_of_range',
    }));
    return;
  }

  const fearFrom = { x: apos.x, y: apos.y };
  const fearAt = { x: tpos.x, y: tpos.y };
  const travelDist = Math.hypot(fearAt.x - fearFrom.x, fearAt.y - fearFrom.y) || 1;
  const projectileDelay = Math.max(0.08, Math.min(0.7, travelDist / 10));
  const hitChancePct = getSpellHitChancePct(world, actor, targetId);
  if (!rollSpellHit(world, actor, targetId, spell)) {
    emitSpellMiss(world, actor, targetId, spell, {
      cause: 'spell:fear',
      hitChancePct,
      at: fearAt,
    });
    world.emit(new FearSpellCast({
      actor,
      targetId,
      from: fearFrom,
      at: fearAt,
      missed: true,
      missTo: resolveMissTo(world, actor, targetId, fearFrom, fearAt, 'spell:fear', 0xfea2),
      projectileDelay,
    }));
    return;
  }

  const intBonus = getSpellIntelligenceBonus(world, actor);
  const duration = Math.min(7, 4 + Math.floor(intBonus / 6));
  const fearEffect = {
    key: 'fear',
    turnsLeft: duration,
    potency: 1,
    stacks: 1,
    startedAtTurn: world.step,
    sourceId: actor,
  };
  const ae = /** @type any */ (world.get(targetId, ActiveEffects));
  if (ae && Array.isArray(ae.effects)) {
    upsertTimedEffect(ae.effects, fearEffect);
  } else {
    try { world.add(targetId, ActiveEffects, { effects: [fearEffect] }); } catch {}
  }

  world.emit(new FearSpellCast({
    actor,
    targetId,
    from: fearFrom,
    at: fearAt,
    projectileDelay,
    duration,
  }));
};

// Bog Curse - auto-targeting marsh hex used by overworld witches.
REGISTRY['bog_curse'] = function bogCurseScript(world, actor, spell, _intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');
  const range = Math.max(1, Number(spell?.range || 6) | 0);
  const isBlocked = createLOSBlocker(world);
  const d2 = (x0, y0, x1, y1) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    return dx * dx + dy * dy;
  };

  let best = null;
  for (const [id, pos] of world.query(Position)) {
    if (id === actor) continue;
    const fac = /** @type any */ (world.get(id, Faction));
    if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) continue;
    const dist2v = d2(apos.x, apos.y, pos.x, pos.y);
    if (dist2v > range * range) continue;
    if (!hasSpellLineOfSight(world, {
      sourceId: actor,
      targetId: id,
      sourcePos: apos,
      targetPos: pos,
      range,
      isBlocked,
    })) continue;
    if (!best || dist2v < best.dist2) best = { id, pos: { x: pos.x | 0, y: pos.y | 0 }, dist2: dist2v };
  }

  if (!best) {
    world.emit('spell:bog_curse', { actor, targetId: actor, fizzle: true });
    return;
  }

  const targetId = best.id;
  const hitChancePct = getSpellHitChancePct(world, actor, targetId);
  if (!rollSpellHit(world, actor, targetId, spell)) {
    emitSpellMiss(world, actor, targetId, spell, {
      cause: 'spell:bog_curse',
      hitChancePct,
      at: best.pos,
    });
    world.emit('spell:bog_curse', {
      actor,
      targetId,
      from: { x: apos.x, y: apos.y },
      at: best.pos,
      missed: true,
      hitChancePct,
    });
    return;
  }

  const intBonus = getSpellIntelligenceBonus(world, actor);
  const curseTurns = Math.min(10, 6 + Math.floor(intBonus / 5));
  const cursePotency = 1 + Math.floor(intBonus / 10);
  const ae = ensureActiveEffects(world, targetId);
  if (ae?.effects) {
    upsertTimedEffect(ae.effects, {
      key: 'cursed',
      turnsLeft: curseTurns,
      potency: cursePotency,
      stacks: 1,
      startedAtTurn: world.step,
      sourceId: actor,
    });
    upsertTimedEffect(ae.effects, {
      key: 'slowed',
      turnsLeft: 2,
      potency: 1,
      stacks: 1,
      startedAtTurn: world.step,
      sourceId: actor,
    });
  }

  world.emit('spell:bog_curse', {
    actor,
    targetId,
    from: { x: apos.x, y: apos.y },
    at: best.pos,
    potency: cursePotency,
    duration: curseTurns,
  });
};

// Life Tap — sacrifice HP to restore mana. Mana gained = 150% of HP spent, scaled by INT.
REGISTRY['lifetap'] = function lifetapScript(world, actor, spell, intent) {
  const vit = /** @type any */ (world.get(actor, Vitality));
  const mana = /** @type any */ (world.get(actor, Mana));
  if (!vit || !mana) return;

  const hpSpent = Number(spell?.lifeCost ?? 8);
  // HP is already deducted by castSpellSystem (costResource:'life').
  // Calculate mana restored: 150% of HP spent, plus INT scaling.
  const intBonus = getSpellIntelligenceBonus(world, actor);
  const manaGained = Math.round(hpSpent * 1.5 + intBonus * 0.5);
  const maxM = effectiveMaxMana(world, actor, mana);
  const before = Number(mana.mana || 0);
  mana.mana = Math.min(maxM, before + manaGained);
  const actual = mana.mana - before;

  world.emit('spell:lifetap', {
    actor,
    hpSpent,
    manaGained: actual,
  });
};

// Drain Life — latch onto one hostile target and siphon each turn until broken.
// This applies a timed channel effect to the caster; per-turn siphon happens in
// effectSystem when the channel effect ticks.
REGISTRY['drain_life'] = function drainLifeScript(world, actor, spell, intent) {
  const isChannelTick = !!intent?._channelTick;
  const apos = /** @type any */ (world.get(actor, Position));
  const actorVit = /** @type any */ (world.get(actor, Vitality));
  if (!apos || !actorVit || (actorVit.hp | 0) <= 0) return;

  const actorFaction = String(world.get(actor, Faction)?.key || 'player');
  const isBlocked = createLOSBlocker(world);

  const RANGE = Math.max(1, Number.isFinite(spell?.range) ? (Number(spell.range) | 0) : 6);
  const DURATION = Math.max(1, Number.isFinite(spell?.duration) ? (Number(spell.duration) | 0) : 4);
  const BASE_TICK = Math.max(1, Number.isFinite(spell?.baseTickDamage) ? (Number(spell.baseTickDamage) | 0) : 2);
  const HEAL_FRACTION = Math.max(
    0,
    Number.isFinite(spell?.healFraction) ? Number(spell.healFraction) : 0.75,
  );

  /**
   * @param {number} id
   * @param {{x:number,y:number}|null} pos
   * @returns {boolean}
   */
  const isValidTarget = (id, pos) => {
    if (!id || id === actor || !pos) return false;

    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) return false;

    const fac = /** @type any */ (world.get(id, Faction));
    if (!fac || !areFactionsHostile(actorFaction, fac.key)) return false;

    if (chebyshev(apos, pos) > RANGE) return false;

    if (!hasSpellLineOfSight(world, {
      sourceId: actor,
      targetId: id,
      sourcePos: apos,
      targetPos: pos,
      range: RANGE,
      isBlocked,
    })) {
      return false;
    }

    if (actorFaction === 'player' && !isTileVisible(pos.x | 0, pos.y | 0)) return false;
    return true;
  };

  let targetId = Number(intent?.targetId) | 0;
  let targetPos = targetId > 0 ? /** @type any */ (world.get(targetId, Position)) : null;

  // If no explicit target, fall back to nearest valid hostile in LOS/range.
  if (!isChannelTick && !isValidTarget(targetId, targetPos)) {
    targetId = 0;
    targetPos = null;
    /** @type {Array<{ id:number, pos:{x:number,y:number}, dist:number }>} */
    const candidates = [];
    for (const [id, pos] of world.query(Position)) {
      if (!isValidTarget(id, pos)) continue;
      candidates.push({ id, pos, dist: chebyshev(apos, pos) });
    }
    candidates.sort((a, b) => a.dist - b.dist);
    if (candidates.length > 0) {
      targetId = candidates[0].id;
      targetPos = candidates[0].pos;
    }
  }

  if (!isValidTarget(targetId, targetPos)) {
    world.emit('spell:drain_life:failed', {
      actor,
      spellId: spell?.id,
      reason: isChannelTick ? 'channel_lost_target' : 'no_valid_target',
      range: RANGE,
    });
    if (isChannelTick && world.has(actor, Channeling)) {
      try { world.remove(actor, Channeling); } catch {}
      world.emit('channeling:cancelled', { actor, spellId: spell?.id || 'drain_life', reason: 'invalid_target' });
    }
    return;
  }

  let ae = /** @type any */ (world.get(actor, ActiveEffects));
  if (!ae) {
    try { world.add(actor, ActiveEffects, { effects: [] }); } catch {}
    ae = /** @type any */ (world.get(actor, ActiveEffects));
  }
  if (!ae || !Array.isArray(ae.effects)) return;

  const effect = createSpellDotEffect(world, actor, spell, {
    key: 'drain_life_channel',
    turnsLeft: DURATION,
    potency: Math.max(1, scaleSpellDamage(world, actor, BASE_TICK)),
    stacks: 1,
    cause: 'spell:drain_life:tick',
    type: 'shadow',
  });

  effect.meta = effect.meta || {};
  effect.meta.channel = {
    targetId,
    range: RANGE,
    healFraction: HEAL_FRACTION,
    breakOnMove: Boolean(spell?.breakOnMove ?? true),
    breakOnNoLos: true,
    breakOnOutOfRange: true,
    anchorX: apos.x | 0,
    anchorY: apos.y | 0,
  };

  const prev = ae.effects.find((entry) => String(entry?.key || '').toLowerCase() === 'drain_life_channel') || null;
  if (isChannelTick && prev) {
    prev.turnsLeft = Math.max(1, DURATION);
    prev.potency = effect.potency;
    prev.spellId = effect.spellId;
    prev.sourceId = effect.sourceId;
    prev.meta = prev.meta || {};
    prev.meta.spellDamage = effect.meta?.spellDamage;
    prev.meta.channel = {
      ...(prev.meta?.channel || {}),
      ...(effect.meta?.channel || {}),
      anchorX: Number(prev.meta?.channel?.anchorX ?? effect.meta?.channel?.anchorX ?? apos.x) | 0,
      anchorY: Number(prev.meta?.channel?.anchorY ?? effect.meta?.channel?.anchorY ?? apos.y) | 0,
    };
    return;
  }

  const channel = upsertTimedEffect(ae.effects, effect);
  if (channel) {
    const prevChannel = prev?.meta?.channel;
    channel.stacks = 1;
    channel.potency = effect.potency;
    channel.meta = effect.meta;
    channel.sourceId = effect.sourceId;
    channel.spellId = effect.spellId;
    if (prevChannel && channel.meta?.channel) {
      channel.meta.channel.anchorX = Number(prevChannel.anchorX) | 0;
      channel.meta.channel.anchorY = Number(prevChannel.anchorY) | 0;
    }
  }

  world.emit('spell:drain_life:start', {
    actor,
    targetId,
    spellId: spell?.id,
    from: { x: apos.x | 0, y: apos.y | 0 },
    to: { x: targetPos.x | 0, y: targetPos.y | 0 },
    turnsLeft: null,
  });
};

// Gaze Beam — floating eye channeled psychic attack.
// On cast completion: stun + mindwipe stack. Configurable via spell tuning.
REGISTRY['gaze_beam'] = function gazeBeamScript(world, actor, spell, intent) {
  const targetId = Number(intent?.targetId || 0) | 0;
  if (!(targetId > 0)) return;
  const tVit = /** @type any */ (world.get(targetId, Vitality));
  if (!tVit || (tVit.hp | 0) <= 0) return;

  const stunDuration = Math.max(1, Number(spell?.stunTurns ?? 3) | 0);
  const stackLimit = Math.max(1, Number(spell?.stackLimit ?? 4) | 0);
  const stunTurnsLeft = stunDuration + 1; // effectSystem decrements on application tick

  const ae = ensureActiveEffects(world, targetId);
  if (!ae) return;

  // Apply or extend stun
  const existingStun = ae.effects.find(e => e.key === 'stun');
  if (existingStun) {
    existingStun.turnsLeft = Math.max(Number(existingStun.turnsLeft) || 0, stunTurnsLeft);
    existingStun.potency = Math.max(Number(existingStun.potency) || 1, 1);
    existingStun.stacks = Math.max(Number(existingStun.stacks) || 1, 1);
  } else {
    ae.effects.push({ key: 'stun', turnsLeft: stunTurnsLeft, potency: 1, stacks: 1 });
  }

  // Apply or increment mindwipe (up to limit)
  const existingMW = ae.effects.find(e => e.key === 'mindwipe');
  if (existingMW) {
    const currentStacks = Math.max(1, Number(existingMW.stacks) || 1);
    if (currentStacks < stackLimit) {
      existingMW.stacks = currentStacks + 1;
      existingMW.potency = existingMW.stacks;
    }
    existingMW.turnsLeft = Math.max(existingMW.turnsLeft, 3);
  } else {
    ae.effects.push({ key: 'mindwipe', turnsLeft: 3, potency: 1, stacks: 1 });
  }
  world.set(targetId, ActiveEffects, ae);

  world.emit('proc:gaze:stun', { actor, target: targetId, duration: stunDuration });
  world.emit('proc:gaze:mindwipe', {
    actor,
    target: targetId,
    stacks: ae.effects.find(e => e.key === 'mindwipe')?.stacks ?? 1,
  });
};

// Scorch — low fire damage, high crit, applies 15-turn fire vulnerability.
// Uses old Agony targeting: prefer intent.targetId, fallback auto-target nearest.
REGISTRY['scorch'] = function scorchScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');

  const MAX_R = Math.max(1, Number(spell.range || 8));
  const isBlocked = createLOSBlocker(world);
  const d2 = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0; return dx * dx + dy * dy; };

  // Resolve target: prefer intent.targetId, fallback to auto-target nearest hostile
  let targetId = intent?.targetId || 0;
  let tpos = targetId ? /** @type any */ (world.get(targetId, Position)) : null;

  if (!targetId || !tpos) {
    /** @type {Array<{id:number,x:number,y:number,dist2:number}>} */
    const candidates = [];
    for (const [id, p] of world.query(Position)) {
      if (id === actor) continue;
      const fac = /** @type any */ (world.get(id, Faction));
      if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
      const vit = /** @type any */ (world.get(id, Vitality));
      if (!vit || (vit.hp | 0) <= 0) continue;
      const dist2v = d2(apos.x, apos.y, p.x, p.y);
      if (dist2v <= MAX_R * MAX_R) candidates.push({ id, x: p.x, y: p.y, dist2: dist2v });
    }
    candidates.sort((a, b) => a.dist2 - b.dist2);
    let found = null;
    for (const c of candidates) {
      if (hasSpellLineOfSight(world, {
        sourceId: actor, targetId: c.id,
        sourcePos: apos, targetPos: c,
        range: MAX_R, isBlocked,
      })) { found = c; break; }
    }
    if (!found) {
      world.emit('spell:scorch', { actor, targetId: actor, fizzle: true });
      return;
    }
    targetId = found.id;
    tpos = { x: found.x, y: found.y };
  }

  // Validate target alive
  const vit = /** @type any */ (world.get(targetId, Vitality));
  if (!vit || (vit.hp | 0) <= 0) {
    world.emit('spell:scorch', { actor, targetId, fizzle: true });
    return;
  }

  // LOS check
  if (!hasSpellLineOfSight(world, {
    sourceId: actor, targetId,
    sourcePos: apos, targetPos: tpos,
    range: MAX_R, isBlocked,
  })) {
    world.emit('spell:scorch', { actor, targetId, fizzle: true, reason: 'no_los' });
    return;
  }

  // Range check
  const dist = chebyshev(apos, tpos);
  if (dist > MAX_R) {
    world.emit('spell:scorch', { actor, targetId, fizzle: true, reason: 'out_of_range' });
    return;
  }

  // Hit roll — high crit: boost crit chance by 25 percentage points
  const hitChancePct = getSpellHitChancePct(world, actor, targetId);
  if (!rollSpellHit(world, actor, targetId, spell)) {
    emitSpellMiss(world, actor, targetId, spell, {
      cause: 'spell:scorch',
      hitChancePct,
      at: { x: tpos.x, y: tpos.y },
    });
    const scorchFrom = { x: apos.x, y: apos.y };
    const scorchAt = { x: tpos.x, y: tpos.y };
    world.emit('spell:scorch', {
      actor, targetId,
      from: scorchFrom, at: scorchAt,
      missed: true, hitChancePct,
      missTo: resolveMissTo(world, actor, targetId, scorchFrom, scorchAt, 'spell:scorch', 0x5c0c2),
    });
    return;
  }

  // Build damage spec with boosted crit chance
  const ctx = createSpellDamageContext(world, actor, spell, {
    cause: 'spell:scorch',
    type: 'fire',
  });
  ctx.critChancePct = Math.min(95, ctx.critChancePct + 25);

  const baseAmount = scaleSpellDamage(world, actor, 4);
  const salt = world.step ^ 0x5C08;
  // Manual crit roll using boosted context
  const critSeed = combatSeed(world, actor, targetId, salt);
  const critRng = mulberry32(critSeed);
  const critical = (critRng() * 100) < ctx.critChancePct;
  let amount = baseAmount;
  if (critical) amount = Math.max(1, Math.floor(amount * ctx.critMult));

  const _scDx = Number(tpos.x || 0) - Number(apos.x || 0);
  const _scDy = Number(tpos.y || 0) - Number(apos.y || 0);
  const _scMag = Math.hypot(_scDx, _scDy) || 1;
  const result = dealDamage(world, {
    target: targetId,
    amount,
    source: actor,
    type: 'fire',
    cause: 'spell:scorch',
    at: { x: tpos.x, y: tpos.y },
    critical,
    hitChancePct,
    spellId: 'scorch',
    impactVector: { dx: _scDx / _scMag, dy: _scDy / _scMag },
  });

  // Apply fire vulnerability (negative resist_fire) for 15 turns
  if (result.applied && !result.killed) {
    const ae = /** @type any */ (world.get(targetId, ActiveEffects));
    const scorchEffect = {
      key: 'resist_fire',
      turnsLeft: 15,
      potency: -0.3,
      stacks: 1,
      sourceId: actor,
      spellId: 'scorch',
      meta: { source: 'spell:scorch' },
    };
    if (ae && Array.isArray(ae.effects)) {
      // Remove any prior scorch-sourced resist_fire before applying fresh
      ae.effects = ae.effects.filter(e => !(e && e.key === 'resist_fire' && e.meta?.source === 'spell:scorch'));
      ae.effects.push(scorchEffect);
    } else {
      try { world.add(targetId, ActiveEffects, { effects: [scorchEffect] }); } catch {}
    }
  }

  // Emit VFX event
  world.emit('spell:scorch', {
    actor, targetId,
    from: { x: apos.x, y: apos.y },
    at: { x: tpos.x, y: tpos.y },
    amount: result.amount,
    critical,
    missed: false,
  });
};

// Plague Swarm — nature DOT that jumps between enemies every 3 ticks.
REGISTRY['plague_swarm'] = function plagueSwarmScript(world, actor, spell, _intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');

  const MAX_R = Math.max(1, Number(spell.range || 8));
  const isBlocked = createLOSBlocker(world);
  const d2 = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0; return dx * dx + dy * dy; };

  // Collect living hostile candidates in range
  /** @type {Array<{id:number,x:number,y:number,dist2:number}>} */
  const candidates = [];
  for (const [id, p] of world.query(Position)) {
    if (id === actor) continue;
    const fac = /** @type any */ (world.get(id, Faction));
    if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) continue;
    if (actorFaction === 'player' && !isTileVisible(p.x | 0, p.y | 0)) continue;
    const dist2v = d2(apos.x, apos.y, p.x, p.y);
    if (dist2v <= MAX_R * MAX_R) candidates.push({ id, x: p.x, y: p.y, dist2: dist2v });
  }

  // Pick nearest with LOS
  candidates.sort((a, b) => a.dist2 - b.dist2);
  let target = null;
  for (const c of candidates) {
    if (hasSpellLineOfSight(world, {
      sourceId: actor, targetId: c.id,
      sourcePos: apos, targetPos: c,
      range: MAX_R, isBlocked,
    })) { target = c; break; }
  }
  if (!target) {
    world.emit('spell:plague_swarm', { actor, fizzle: true });
    return;
  }

  // Hit roll
  if (!rollSpellHit(world, actor, target.id, spell)) {
    emitSpellMiss(world, actor, target.id, spell, {
      cause: 'spell:plague_swarm',
      hitChancePct: getSpellHitChancePct(world, actor, target.id),
      at: { x: target.x, y: target.y },
    });
    const swarmFrom = { x: apos.x, y: apos.y };
    const swarmAt = { x: target.x, y: target.y };
    world.emit('spell:plague_swarm', {
      actor, targetId: target.id,
      from: swarmFrom, at: swarmAt,
      missed: true,
      missTo: resolveMissTo(world, actor, target.id, swarmFrom, swarmAt, 'spell:plague_swarm', 0x5a77),
    });
    return;
  }

  // Apply swarm DOT
  const intBonus = getSpellIntelligenceBonus(world, actor);
  const basePotency = Math.max(1, 2 + Math.floor(intBonus / 6));
  const duration = 8;

  const swarmEffect = createSpellDotEffect(world, actor, spell, {
    key: 'swarm',
    turnsLeft: duration,
    potency: basePotency,
    stacks: 1,
    cause: 'spell:plague_swarm',
    type: 'nature',
  });
  // Tag with jump metadata so effectSystem can spread it
  swarmEffect.meta.jumpInterval = 3;
  swarmEffect.meta.jumpRadius = 6;
  swarmEffect.meta.jumpsLeft = 3;

  const ae = /** @type any */ (world.get(target.id, ActiveEffects));
  if (ae && Array.isArray(ae.effects)) {
    upsertTimedEffect(ae.effects, swarmEffect);
  } else {
    try { world.add(target.id, ActiveEffects, { effects: [swarmEffect] }); } catch {}
  }

  world.emit('spell:plague_swarm', {
    actor, targetId: target.id,
    from: { x: apos.x, y: apos.y },
    at: { x: target.x, y: target.y },
    potency: basePotency, duration,
    missed: false,
  });
};

// Fireball — fiery projectile with burn DOT.
REGISTRY['fireball'] = function fireballScript(world, actor, spell, _intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');
  const isBlocked = createLOSBlocker(world);

  const MAX_R = Math.max(1, Number(spell.range || 10));
  const BASE_DMG = 8;
  const d2 = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0; return dx * dx + dy * dy; };

  // Collect living hostile candidates in range
  /** @type {Array<{id:number,x:number,y:number,dist2:number}>} */
  const candidates = [];
  for (const [id, p] of world.query(Position)) {
    if (id === actor) continue;
    const fac = /** @type any */ (world.get(id, Faction));
    if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) continue;
    if (actorFaction === 'player' && !isTileVisible(p.x | 0, p.y | 0)) continue;
    const dist2v = d2(apos.x, apos.y, p.x, p.y);
    if (dist2v <= MAX_R * MAX_R) candidates.push({ id, x: p.x, y: p.y, dist2: dist2v });
  }

  // Pick nearest with LOS
  candidates.sort((a, b) => a.dist2 - b.dist2);
  let target = null;
  for (const c of candidates) {
    if (hasSpellLineOfSight(world, {
      sourceId: actor, targetId: c.id,
      sourcePos: apos, targetPos: c,
      range: MAX_R, isBlocked,
    })) { target = c; break; }
  }
  if (!target) {
    world.emit('spell:fireball', { actor, fizzle: true });
    return;
  }

  // Projectile travel duration (matches display-layer fireball: speed 8)
  const dist = Math.hypot(target.x - apos.x, target.y - apos.y) || 1;
  const projDelay = Math.max(0.1, Math.min(0.6, dist / 8));

  // Deal fire damage
  const result = dealDamage(world, buildSpellDamageSpec(world, actor, target.id, {
    spell,
    baseAmount: BASE_DMG,
    type: 'fire',
    cause: 'spell:fireball',
    at: { x: target.x, y: target.y },
    projectileDelay: projDelay,
  }));

  // Apply 2-turn burn to survivors
  if (result.applied && !result.killed) {
    const burnEffect = createSpellDotEffect(world, actor, spell, {
      key: 'burn',
      turnsLeft: 3,   // 3 so first-tick decrement leaves 2 truly burning turns
      potency: scaleSpellDamage(world, actor, 2),
      stacks: 1,
      cause: 'spell:fireball:burn',
      type: 'fire',
    });
    const ae = /** @type any */ (world.get(target.id, ActiveEffects));
    if (ae && Array.isArray(ae.effects)) {
      upsertTimedEffect(ae.effects, burnEffect);
    } else {
      try { world.add(target.id, ActiveEffects, { effects: [burnEffect] }); } catch {}
    }
    world.emit('proc:burning', { actor, target: target.id });
  }

  // Emit VFX event
  const fireballFrom = { x: apos.x, y: apos.y };
  const fireballTo = { x: target.x, y: target.y };
  const fireballMissed = result.reason === 'missed';
  world.emit('spell:fireball', {
    actor,
    targetId: target.id,
    from: fireballFrom,
    to: fireballTo,
    missed: fireballMissed,
    missTo: fireballMissed ? resolveMissTo(world, actor, target.id, fireballFrom, fireballTo, 'spell:fireball', 0xf1b4) : undefined,
  });
};

/**
 * @param {World} world
 * @param {number} entityId
 * @returns {{ effects: any[] } | null}
 */
function ensureActiveEffectList(world, entityId) {
  let ae = /** @type any */ (world.get(entityId, ActiveEffects));
  if (!ae) {
    try { world.add(entityId, ActiveEffects, { effects: [] }); } catch {}
    ae = /** @type any */ (world.get(entityId, ActiveEffects));
  }
  if (!ae) return null;
  if (!Array.isArray(ae.effects)) ae.effects = [];
  return ae;
}

/**
 * @param {any[]} effects
 * @param {string} sourceKey
 * @param {{
 *   startValue:number,
 *   toValue:number,
 *   endValue:number,
 *   rampIn:number,
 *   hold:number,
 *   rampOut:number,
 *   turnsLeft:number,
 * }} envelope
 */
function upsertVisionEnvelope(effects, sourceKey, envelope) {
  const existing = effects.find((e) => (
    e
    && e.key === 'stat_envelope'
    && e.stat === 'visionRange'
    && String(e.meta?.source || '') === sourceKey
  ));
  const next = {
    key: 'stat_envelope',
    stat: 'visionRange',
    turnsLeft: Math.max(1, Number(envelope.turnsLeft || 1) | 0),
    potency: 1,
    startValue: Number(envelope.startValue || 0),
    toValue: Number(envelope.toValue || 0),
    endValue: Number(envelope.endValue || 0),
    rampIn: Math.max(0, Number(envelope.rampIn || 0) | 0),
    hold: Math.max(0, Number(envelope.hold || 0) | 0),
    rampOut: Math.max(0, Number(envelope.rampOut || 0) | 0),
    meta: { source: sourceKey },
  };
  if (existing) Object.assign(existing, next);
  else effects.push(next);
}

REGISTRY['verdant_ward'] = function verdantWardScript(world, actor, _spell, _intent) {
  const pos = /** @type any */ (world.get(actor, Position));
  if (!pos) return;
  const ae = ensureActiveEffectList(world, actor);
  if (!ae) return;

  const DURATION = 30;
  upsertTimedEffect(ae.effects, {
    key: 'regen',
    turnsLeft: DURATION,
    potency: 1,
    stacks: 1,
    sourceId: actor,
  });
  upsertTimedEffect(ae.effects, {
    key: 'stoneskin',
    turnsLeft: DURATION,
    potency: 2,
    stacks: 1,
    sourceId: actor,
  });

  const startVision = getEffectiveVisionRange(world, actor);
  upsertVisionEnvelope(ae.effects, 'spell:verdant_ward', {
    startValue: startVision,
    toValue: startVision + 2,
    endValue: startVision,
    rampIn: 3,
    hold: 20,
    rampOut: 7,
    turnsLeft: DURATION,
  });

  world.emit('spell:verdant_ward', {
    actor,
    at: { x: pos.x, y: pos.y },
    duration: DURATION,
  });
};

REGISTRY['harmony_ward'] = function harmonyWardScript(world, actor, _spell, _intent) {
  const pos = /** @type any */ (world.get(actor, Position));
  if (!pos) return;
  const ae = ensureActiveEffectList(world, actor);
  if (!ae) return;

  const DURATION = 55;
  const RESISTS = ['resist_fire', 'resist_poison', 'resist_electric', 'resist_acid'];
  for (let i = 0; i < RESISTS.length; i++) {
    upsertTimedEffect(ae.effects, {
      key: RESISTS[i],
      turnsLeft: DURATION,
      potency: 1,
      stacks: 1,
      sourceId: actor,
    });
  }

  world.emit('spell:harmony_ward', {
    actor,
    at: { x: pos.x, y: pos.y },
    duration: DURATION,
  });
};

REGISTRY['shadow_veil'] = function shadowVeilScript(world, actor, _spell, _intent) {
  const pos = /** @type any */ (world.get(actor, Position));
  if (!pos) return;
  const ae = ensureActiveEffectList(world, actor);
  if (!ae) return;

  const DURATION = 45;
  upsertTimedEffect(ae.effects, {
    key: 'invisible',
    turnsLeft: DURATION,
    potency: 1,
    stacks: 1,
    sourceId: actor,
  });
  upsertTimedEffect(ae.effects, {
    key: 'phase_shift',
    turnsLeft: DURATION,
    potency: 1,
    stacks: 1,
    sourceId: actor,
  });
  upsertTimedEffect(ae.effects, {
    key: 'shadow_cloak',
    turnsLeft: DURATION,
    potency: 1,
    stacks: 1,
    sourceId: actor,
  });

  const startVision = getEffectiveVisionRange(world, actor);
  upsertVisionEnvelope(ae.effects, 'spell:shadow_veil', {
    startValue: startVision,
    toValue: startVision + 3,
    endValue: startVision,
    rampIn: 2,
    hold: 35,
    rampOut: 8,
    turnsLeft: DURATION,
  });

  world.emit('spell:shadow_veil', {
    actor,
    at: { x: pos.x, y: pos.y },
    duration: DURATION,
  });
};

REGISTRY['rampage'] = function rampageScript(world, actor, _spell, _intent) {
  const pos = world.get(actor, Position);
  if (!pos) return;

  let ae = world.get(actor, ActiveEffects);
  if (!ae) {
    world.add(actor, ActiveEffects, { effects: [] });
    ae = world.get(actor, ActiveEffects);
  }
  ae.effects.push({
    key: 'berserk',
    turnsLeft: 101,
    potency: 1,
    stacks: 1,
    sourceId: actor,
  });

  world.emit('spell:rampage', { actor, at: { x: pos.x, y: pos.y } });
};

REGISTRY['blind'] = function blindScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;

  const actorFaction = String(world.get(actor, Faction)?.key || 'player');
  const MAX_R = Math.max(1, Number(spell.range || 8));
  const isBlocked = createLOSBlocker(world);
  const d2 = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0; return dx * dx + dy * dy; };

  // Resolve target from intent or auto-target nearest hostile
  let targetId = intent?.targetId || 0;
  let tpos = targetId ? /** @type any */ (world.get(targetId, Position)) : null;

  if (!targetId || !tpos) {
    /** @type {Array<{id:number,x:number,y:number,dist2:number}>} */
    const candidates = [];
    for (const [id, p] of world.query(Position)) {
      if (id === actor) continue;
      const fac = /** @type any */ (world.get(id, Faction));
      if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
      const vit = /** @type any */ (world.get(id, Vitality));
      if (!vit || (vit.hp | 0) <= 0) continue;
      const dist2v = d2(apos.x, apos.y, p.x, p.y);
      if (dist2v <= MAX_R * MAX_R) candidates.push({ id, x: p.x, y: p.y, dist2: dist2v });
    }
    candidates.sort((a, b) => a.dist2 - b.dist2);
    let found = null;
    for (const c of candidates) {
      if (hasSpellLineOfSight(world, {
        sourceId: actor,
        targetId: c.id,
        sourcePos: apos,
        targetPos: c,
        range: MAX_R,
        isBlocked,
      })) { found = c; break; }
    }
    if (!found) {
      world.emit('spell:blind', { actor, targetId: actor, fizzle: true, from: { x: apos.x, y: apos.y }, at: { x: apos.x, y: apos.y } });
      return;
    }
    targetId = found.id;
    tpos = { x: found.x, y: found.y };
  }

  // Validate target alive
  const vit = /** @type any */ (world.get(targetId, Vitality));
  if (!vit || (vit.hp | 0) <= 0) {
    world.emit('spell:blind', { actor, targetId, fizzle: true, from: { x: apos.x, y: apos.y }, at: { x: tpos.x, y: tpos.y } });
    return;
  }

  // LOS check
  if (!hasSpellLineOfSight(world, {
    sourceId: actor, targetId,
    sourcePos: apos, targetPos: tpos, range: MAX_R, isBlocked,
  })) {
    world.emit('spell:blind', { actor, targetId, fizzle: true, reason: 'no_los', from: { x: apos.x, y: apos.y }, at: { x: tpos.x, y: tpos.y } });
    return;
  }

  // Range check
  const dist = chebyshev(apos, tpos);
  if (dist > MAX_R) {
    world.emit('spell:blind', { actor, targetId, fizzle: true, reason: 'out_of_range', from: { x: apos.x, y: apos.y }, at: { x: tpos.x, y: tpos.y } });
    return;
  }

  // Apply instant blackout: immediate drop to 0, hold, then recover.
  blind(world, targetId, 0, 0, 16, 4);

  world.emit('spell:blind', {
    actor,
    targetId,
    from: { x: apos.x, y: apos.y },
    at: { x: tpos.x, y: tpos.y },
  });
};

// Earthshatter — self-centered AoE that spawns a 3-tick earthquake hazard.
// Stuns and deals minor physical damage to enemies in radius 1.
// Enhanced (volcanic) variant when caster has the earthshaker affix.
REGISTRY['earthshatter'] = function earthshatterScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;

  const RADIUS = 1;
  const BASE_DMG = 3;
  const QUAKE_TURNS = 3;
  const STUN_TURNS = 2;

  // Check equipped gear for earthshaker affix → enhanced (volcanic) variant.
  let enhanced = false;
  const equip = /** @type any */ (world.get(actor, Equipment));
  if (equip) {
    for (const slot of NON_AMMO_GEAR_SLOTS) {
      const itemId = equip[slot];
      if (!itemId || itemId <= 0) continue;
      const info = /** @type any */ (world.get(itemId, ItemInfo));
      if (info && Array.isArray(info.affixes) && info.affixes.includes("earthshaker")) {
        enhanced = true;
        break;
      }
    }
  }

  const scaledDmg = scaleSpellDamage(world, actor, BASE_DMG);

  spawnHazard(world, {
    x: apos.x,
    y: apos.y,
    kind: "quake",
    medium: "floor",
    turnsLeft: QUAKE_TURNS,
    radius: RADIUS,
    tickDamage: scaledDmg,
    damageType: "physical",
    cause: "spell:earthshatter",
    sourceId: actor,
    sourceKind: "earthshatter",
    identity: enhanced ? "quake_volcanic" : "quake_earth",
    name: enhanced ? "Volcanic Fissure" : "Earthshatter",
    meta: { stunTurns: STUN_TURNS, enhanced },
  });

  world.emit('spell:earthshatter', {
    actor,
    origin: { x: apos.x, y: apos.y },
    radius: RADIUS,
    enhanced,
  });
};

// ─── Generators (resource builders) ─────────────────────────────────────────

/**
 * @param {World} world
 * @param {number} actor
 * @param {{ range?:number }} spell
 * @returns {{ id:number, pos:any, range:number }|null}
 */
function findNearestHostileSpellTarget(world, actor, spell) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return null;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');
  const range = Math.max(1, Number(spell?.range || 10) | 0);
  const isBlocked = blockedCallback(buildBlocksVisionMap(world));

  let bestId = 0;
  let bestPos = null;
  let bestDist = Infinity;
  for (const [id, pos] of world.query(Position)) {
    if (id === actor) continue;
    const fac = /** @type any */ (world.get(id, Faction));
    if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) continue;
    const dist = chebyshevScalar(pos.x | 0, pos.y | 0, apos.x | 0, apos.y | 0);
    if (dist > range || dist >= bestDist) continue;
    if (!hasSpellLineOfSight(world, { sourcePos: apos, targetPos: pos, range, isBlocked })) continue;
    bestId = id;
    bestPos = pos;
    bestDist = dist;
  }

  return bestId && bestPos ? { id: bestId, pos: bestPos, range } : null;
}

/**
 * @param {World} world
 * @param {number} actor
 * @param {any} spell
 * @param {{ baseAmount:number, cause:string, eventCtor:any, lanes?:number, salt:number }} tuning
 */
function runArcaneMissileSpell(world, actor, spell, tuning) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const target = findNearestHostileSpellTarget(world, actor, spell);
  if (!target) {
    world.emit('spell:no-target', { actor, spellId: spell?.id || tuning.cause, range: Math.max(1, Number(spell?.range || 10) | 0) });
    return;
  }

  const from = { x: apos.x, y: apos.y };
  const at = { x: target.pos.x, y: target.pos.y };
  const dist = Math.hypot(at.x - from.x, at.y - from.y) || 1;
  const projectileDelay = Math.max(0.12, Math.min(0.58, dist / 9));
  const result = dealDamage(world, buildSpellDamageSpec(world, actor, target.id, {
    spell,
    baseAmount: tuning.baseAmount,
    type: 'arcane',
    cause: tuning.cause,
    at,
    projectileDelay,
    salt: tuning.salt ^ target.id,
  }));
  const missed = result.reason === "missed";
  const missTo = missed ? resolveMissTo(world, actor, target.id, from, at, tuning.cause, tuning.salt) : undefined;
  world.emit(new tuning.eventCtor({
    actor,
    targetId: target.id,
    from,
    at,
    hit: result.applied,
    missed,
    missTo,
    projectileDelay,
    lanes: tuning.lanes || 1,
  }));
}

function resolveAreaSpellCenter(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return null;
  const range = Math.max(1, Number(spell?.range || 9) | 0);
  const isBlocked = createLOSBlocker(world);

  if (intent && intent.x != null && intent.y != null) {
    const ox = Number(intent.x) | 0;
    const oy = Number(intent.y) | 0;
    const dist = chebyshevScalar(ox, oy, apos.x | 0, apos.y | 0);
    if (!(dist > 0) || dist > range) {
      world.emit('spell:no-target', { actor, spellId: spell?.id || '', reason: 'out_of_range', range, requested: { x: ox, y: oy } });
      return null;
    }
    if (!hasSpellLineOfSight(world, {
      sourceId: actor,
      sourcePos: apos,
      targetPos: { x: ox, y: oy },
      range,
      isBlocked,
      allowFlyingOccupantAtTarget: true,
    })) {
      world.emit('spell:no-target', { actor, spellId: spell?.id || '', reason: 'blocked_los', range, requested: { x: ox, y: oy } });
      return null;
    }
    return { x: ox, y: oy, from: { x: apos.x | 0, y: apos.y | 0 } };
  }

  world.emit('spell:no-target', { actor, spellId: spell?.id || '', reason: 'no_target', range });
  return null;
}

REGISTRY['void_hole'] = function voidHoleScript(world, actor, spell, intent) {
  const center = resolveAreaSpellCenter(world, actor, spell, intent);
  if (!center) return;
  const radius = resolveSpellRadius(world, actor, spell) || 3;
  const holeId = world.create();
  world.add(holeId, Position, { x: center.x, y: center.y });
  world.add(holeId, NamedIdentity, { name: "Void Hole", identity: "void_hole" });
  world.add(holeId, VoidHole, {
    sourceId: actor,
    radius,
    pullSteps: 2,
    tickDamage: 7,
    ageTurns: 0,
    durationTurns: 6,
  });
  world.add(holeId, Lifespan, { turnsLeft: 6, onExpiry: "remove", expiryEvent: "" });
  attachEntityToCurrentFloor(world, holeId);
};

/** Shared helper: auto-target nearest hostile in range + LOS, deal damage, restore resources.
 *  manaPct / staminaPct are fractions of the actor's derived max pool (e.g. 0.06 = 6%). */
function runGeneratorScript(world, actor, spell, { baseAmount, type, cause, manaPct, staminaPct }) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');
  const range = Number(spell?.range || 1) | 0;
  const isBlocked = blockedCallback(buildBlocksVisionMap(world));

  let bestId = 0, bestDist = Infinity;
  for (const [id, pos] of world.query(Position)) {
    if (id === actor) continue;
    const fac = /** @type any */ (world.get(id, Faction));
    if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) continue;
    const dist = chebyshevScalar(pos.x | 0, pos.y | 0, apos.x | 0, apos.y | 0);
    if (dist > range) continue;
    if (!hasSpellLineOfSight(world, { sourcePos: apos, targetPos: pos, range, isBlocked })) continue;
    if (dist < bestDist) { bestDist = dist; bestId = id; }
  }
  if (!bestId) {
    world.emit('spell:no-target', { actor, spellId: spell?.id || cause, range });
    return;
  }

  const tpos = /** @type any */ (world.get(bestId, Position));
  const result = dealDamage(world, buildSpellDamageSpec(world, actor, bestId, {
    spell, baseAmount, type, cause,
    at: { x: tpos.x, y: tpos.y },
  }));

  // Restore resources on hit — % of derived max pool
  let manaRestored = 0, staminaRestored = 0;
  if (result.applied) {
    if (manaPct > 0) {
      const mana = /** @type any */ (world.get(actor, Mana));
      if (mana) {
        const maxM = effectiveMaxMana(world, actor, mana);
        const amount = Math.max(1, Math.round(maxM * manaPct));
        const before = Number(mana.mana || 0);
        mana.mana = Math.min(maxM, before + amount);
        manaRestored = mana.mana - before;
      }
    }
    if (staminaPct > 0) {
      const stam = /** @type any */ (world.get(actor, Stamina));
      if (stam) {
        const maxS = effectiveMaxStamina(world, actor, stam);
        const amount = Math.max(1, Math.round(maxS * staminaPct));
        const before = Number(stam.stamina || 0);
        stam.stamina = Math.min(maxS, before + amount);
        staminaRestored = stam.stamina - before;
      }
    }
  }

  const from = { x: apos.x, y: apos.y };
  const at = { x: tpos.x, y: tpos.y };
  const missed = result.reason === "missed";
  world.emit(cause, {
    actor, targetId: bestId,
    from,
    at,
    hit: result.applied,
    missed,
    missTo: missed ? resolveMissTo(world, actor, bestId, from, at, cause, 0x6e91) : undefined,
    manaRestored,
    staminaRestored,
  });
}

REGISTRY['savage_strike'] = function(world, actor, spell, intent) {
  runGeneratorScript(world, actor, spell, {
    baseAmount: 4, type: 'physical', cause: 'spell:savage_strike',
    manaPct: 0, staminaPct: 0.08,
  });
};

REGISTRY['natures_touch'] = function(world, actor, spell, intent) {
  runGeneratorScript(world, actor, spell, {
    baseAmount: 2, type: 'nature', cause: 'spell:natures_touch',
    manaPct: 0.06, staminaPct: 0,
  });
};

REGISTRY['cheap_shot'] = function(world, actor, spell, intent) {
  runGeneratorScript(world, actor, spell, {
    baseAmount: 3, type: 'physical', cause: 'spell:cheap_shot',
    manaPct: 0.07, staminaPct: 0,
  });
};

REGISTRY['evocation'] = function evocationScript(world, actor, spell, intent) {
  // Only runs on sustained channel ticks (castSpellSystem skips script on initial cast)
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorVit = /** @type any */ (world.get(actor, Vitality));
  if (!actorVit || (actorVit.hp | 0) <= 0) return;

  const mana = /** @type any */ (world.get(actor, Mana));
  if (!mana) return;
  const maxM = effectiveMaxMana(world, actor, mana);
  const currentMana = Number(mana.mana || 0);

  // Already full — cancel channel
  if (currentMana >= maxM) {
    try { world.remove(actor, Channeling); } catch {}
    world.emit('channeling:cancelled', { actor, spellId: spell?.id, reason: 'mana_full' });
    return;
  }

  // Restore mana (INT-scaled)
  const intel = Number(getPassiveBonuses(world, actor).intelligence || 10);
  const baseMana = Math.max(1, Number(spell?.manaPerChannelTick || 6));
  const restored = Math.min(
    Math.round(baseMana + (intel - 10) * 0.4),
    maxM - currentMana,
  );
  if (restored > 0) {
    mana.mana = Math.min(maxM, currentMana + restored);
  }

  world.emit('spell:evocation:tick', {
    actor,
    at: { x: apos.x | 0, y: apos.y | 0 },
    manaRestored: restored,
    manaRemaining: mana.mana,
    manaMax: maxM,
  });
};

REGISTRY['arcane_bolt'] = function(world, actor, spell, intent) {
  runGeneratorScript(world, actor, spell, {
    baseAmount: 3, type: 'arcane', cause: 'spell:arcane_bolt',
    manaPct: 0.05, staminaPct: 0,
  });
};

REGISTRY['magic_missile'] = function magicMissileScript(world, actor, spell, intent) {
  void intent;
  runArcaneMissileSpell(world, actor, spell, {
    baseAmount: 5,
    cause: 'spell:magic_missile',
    eventCtor: MagicMissileCast,
    lanes: 1,
    salt: 0x4d15,
  });
};

REGISTRY['arcane_barrage'] = function arcaneBarrageScript(world, actor, spell, intent) {
  void intent;
  runArcaneMissileSpell(world, actor, spell, {
    baseAmount: 7,
    cause: 'spell:arcane_barrage',
    eventCtor: ArcaneBarrageCast,
    lanes: 3,
    salt: 0xba77,
  });
};

REGISTRY['leech_spores'] = function(world, actor, spell, intent) {
  runGeneratorScript(world, actor, spell, {
    baseAmount: 2, type: 'nature', cause: 'spell:leech_spores',
    manaPct: 0.05, staminaPct: 0.05,
  });
};

REGISTRY['holy_strike'] = function(world, actor, spell, intent) {
  runGeneratorScript(world, actor, spell, {
    baseAmount: 3, type: 'holy', cause: 'spell:holy_strike',
    manaPct: 0.06, staminaPct: 0,
  });
};

// ─── Druid spells ────────────────────────────────────────────────────────────

REGISTRY['entangle'] = function entangleScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');
  const range = Number(spell?.range || 7) | 0;

  // Resolve target: prefer intent (enemy-targeting UI), fall back to auto
  let bestId = intent?.targetId || 0;
  if (bestId) {
    // Validate intent target
    const tpos = /** @type any */ (world.get(bestId, Position));
    const vit = /** @type any */ (world.get(bestId, Vitality));
    if (!tpos || !vit || (vit.hp | 0) <= 0) bestId = 0;
    if (bestId === actor) bestId = 0; // no self-target
    if (bestId && statusStrength(world, bestId, "stunned") > 0) bestId = 0;
    if (bestId && statusStrength(world, bestId, "rooted") > 0) bestId = 0;
  }

  if (!bestId) {
    // Auto-target nearest hostile in range + LOS
    let bestD2 = Infinity;
    for (const [id, pos] of world.query(Position)) {
      if (id === actor) continue;
      const fac = /** @type any */ (world.get(id, Faction));
      if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
      const vit = /** @type any */ (world.get(id, Vitality));
      if (!vit || (vit.hp | 0) <= 0) continue;
      if (statusStrength(world, id, "stunned") > 0) continue;
      if (statusStrength(world, id, "rooted") > 0) continue;
      const dx = (pos.x | 0) - (apos.x | 0), dy = (pos.y | 0) - (apos.y | 0);
      const d2 = dx * dx + dy * dy;
      if (d2 > range * range) continue;
      if (!hasSpellLineOfSight(world, { sourcePos: apos, targetPos: pos, range, isBlocked: blockedCallback(buildBlocksVisionMap(world)) })) continue;
      if (d2 < bestD2) { bestD2 = d2; bestId = id; }
    }
  }
  if (!bestId) return;

  const tpos = /** @type any */ (world.get(bestId, Position));
  const ae = ensureActiveEffectList(world, bestId);
  if (!ae) return;

  const STUN_TURNS = 3;
  const ROOT_TURNS = 15;
  upsertTimedEffect(ae.effects, {
    key: 'stun', turnsLeft: STUN_TURNS + 1, potency: 1, stacks: 1, sourceId: actor,
  });
  upsertTimedEffect(ae.effects, {
    key: 'rooted', turnsLeft: STUN_TURNS + ROOT_TURNS + 1, potency: 1, stacks: 1, sourceId: actor,
  });

  world.emit('spell:entangle', {
    actor, targetId: bestId,
    at: { x: tpos.x, y: tpos.y },
  });
};

REGISTRY['thorn_burst'] = function thornBurstScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');
  const radius = Number(spell?.radius || 3) | 0;
  const isBlocked = blockedCallback(buildBlocksVisionMap(world));

  // Gather all hostiles in radius with LOS
  const targets = [];
  for (const [id, pos] of world.query(Position)) {
    if (id === actor) continue;
    const fac = /** @type any */ (world.get(id, Faction));
    if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) continue;
    const dx = (pos.x | 0) - (apos.x | 0), dy = (pos.y | 0) - (apos.y | 0);
    const d2 = dx * dx + dy * dy;
    if (d2 > radius * radius) continue;
    if (!hasSpellLineOfSight(world, { sourcePos: apos, targetPos: pos, range: radius, isBlocked })) continue;
    targets.push({ id, x: pos.x | 0, y: pos.y | 0 });
  }

  if (targets.length === 0) {
    emitSpellMiss(world, actor, spell);
    return;
  }

  // Deal damage to every target in radius
  const impacts = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    dealDamage(world, buildSpellDamageSpec(world, actor, t.id, {
      spell,
      baseAmount: 6,
      type: 'nature',
      cause: 'spell:thorn_burst',
      at: { x: t.x, y: t.y },
      salt: 0xBEEF ^ (t.id * 131) ^ (i + 1),
    }));
    impacts.push({ x: t.x, y: t.y });

    // 30% poison proc per target
    const rng = mulberry32(combatSeed(world, actor, t.id, 0xBEEF));
    if (rng() < 0.30) {
      const ae = ensureActiveEffectList(world, t.id);
      if (ae) {
        upsertTimedEffect(ae.effects, {
          key: 'poison', turnsLeft: 4, potency: 1, stacks: 1, sourceId: actor,
        });
      }
    }
  }

  world.emit('spell:thorn_burst', {
    actor,
    from: { x: apos.x, y: apos.y },
    impacts,
    radius,
  });
};

// ─── Warden abilities ──────────────────────────────────────────────────────

REGISTRY['war_cry'] = function warCryScript(world, actor, spell, _intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');
  const RADIUS = Number(spell?.radius || 3) | 0;
  const WEAKEN_TURNS = 6;

  let affected = 0;
  const affectedIds = [];
  for (const [id, pos] of world.query(Position)) {
    if (id === actor) continue;
    const fac = /** @type any */ (world.get(id, Faction));
    if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) continue;
    const dx = Math.abs((pos.x | 0) - (apos.x | 0));
    const dy = Math.abs((pos.y | 0) - (apos.y | 0));
    if (Math.max(dx, dy) > RADIUS) continue;

    // Apply weaken
    const ae = ensureActiveEffectList(world, id);
    if (ae) {
      upsertTimedEffect(ae.effects, {
        key: 'weaken', turnsLeft: WEAKEN_TURNS, potency: 1, stacks: 1, sourceId: actor,
      });
    }
    affectedIds.push(id | 0);
    // Reset aggro to alerted (they heard you, but lost focus)
    const aggro = world.get(id, AggroState);
    if (aggro && aggro.alertLevel === AGGRO_LEVELS.hunting) {
      aggro.alertLevel = AGGRO_LEVELS.alerted;
      aggro.searchTurnsLeft = SEARCH_TURNS_ALERTED;
    }
    affected++;
  }

  world.emit('spell:war_cry', { actor, at: { x: apos.x, y: apos.y }, affected, affectedIds });
};

REGISTRY['cleave'] = function cleaveScript(world, actor, spell, _intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');
  const BASE_DMG = 5;

  const hits = [];
  for (const [id, pos] of world.query(Position)) {
    if (id === actor) continue;
    const fac = /** @type any */ (world.get(id, Faction));
    if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) continue;
    const dx = Math.abs((pos.x | 0) - (apos.x | 0));
    const dy = Math.abs((pos.y | 0) - (apos.y | 0));
    if (Math.max(dx, dy) > 1) continue;

    const result = dealDamage(world, buildSpellDamageSpec(world, actor, id, {
      spell,
      baseAmount: BASE_DMG,
      type: 'physical',
      cause: 'spell:cleave',
      at: { x: pos.x, y: pos.y },
      salt: id,
    }));
    hits.push({ id, x: pos.x, y: pos.y, amount: result.amount || 0 });
  }

  world.emit('spell:cleave', {
    actor,
    at: { x: apos.x, y: apos.y },
    hits,
  });
};

REGISTRY['bloodthirst'] = function bloodthirstScript(world, actor, _spell, _intent) {
  const pos = world.get(actor, Position);
  if (!pos) return;

  const ae = ensureActiveEffectList(world, actor);
  if (!ae) return;

  const DURATION = 30;
  upsertTimedEffect(ae.effects, {
    key: 'bloodthirst', turnsLeft: DURATION + 1, potency: 1, stacks: 1, sourceId: actor,
  });

  world.emit('spell:bloodthirst', { actor, at: { x: pos.x, y: pos.y }, duration: DURATION });
};

// ─── Cleric abilities ──────────────────────────────────────────────────────

/** Negative effect keys that purify removes. */
const PURIFY_NEGATIVE_KEYS = new Set([
  'poison', 'poisoned', 'burn', 'burning', 'bleed', 'bleeding',
  'stun', 'stunned', 'stagger', 'staggered', 'curse', 'cursed',
  'weaken', 'weakened', 'confuse', 'confused', 'shock', 'shocked',
  'slowed', 'slow', 'blinded', 'blind', 'agony', 'frost', 'frozen',
  'hallucinating', 'hallucination', 'disease', 'diseased',
  'deafened', 'deaf', 'mindwipe', 'mindwiped',
]);

REGISTRY['purify'] = function purifyScript(world, actor, _spell, _intent) {
  const pos = /** @type any */ (world.get(actor, Position));
  if (!pos) return;
  const ae = /** @type any */ (world.get(actor, ActiveEffects));
  let removed = 0;
  if (ae && Array.isArray(ae.effects)) {
    const before = ae.effects.length;
    ae.effects = ae.effects.filter(e => !PURIFY_NEGATIVE_KEYS.has(String(e?.key || '')));
    removed = before - ae.effects.length;
  }
  world.emit('spell:purify', { actor, at: { x: pos.x, y: pos.y }, removed });
};

REGISTRY['divine_shield'] = function divineShieldScript(world, actor, _spell, _intent) {
  const pos = /** @type any */ (world.get(actor, Position));
  if (!pos) return;
  const ae = ensureActiveEffectList(world, actor);
  if (!ae) return;

  const DURATION = 20;
  upsertTimedEffect(ae.effects, {
    key: 'stoneskin', turnsLeft: DURATION, potency: 3, stacks: 1, sourceId: actor,
  });
  upsertTimedEffect(ae.effects, {
    key: 'shield_guard', turnsLeft: DURATION, potency: 1, stacks: 1, sourceId: actor,
  });
  upsertTimedEffect(ae.effects, {
    key: 'bless', turnsLeft: DURATION, potency: 1, stacks: 1, sourceId: actor,
  });

  world.emit('spell:divine_shield', { actor, at: { x: pos.x, y: pos.y }, duration: DURATION });
};

REGISTRY['consecrate'] = function consecrateScript(world, actor, spell, _intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;

  const RADIUS = Number(spell?.radius || 2) | 0;
  const TURNS = 5;
  const BASE_TICK = 3;
  const scaledDmg = scaleSpellDamage(world, actor, BASE_TICK);

  // Holy ground hazard — damages hostiles
  spawnHazard(world, {
    x: apos.x,
    y: apos.y,
    kind: 'holy',
    medium: 'floor',
    turnsLeft: TURNS,
    radius: RADIUS,
    tickDamage: scaledDmg,
    damageType: 'holy',
    cause: 'spell:consecrate',
    sourceId: actor,
    sourceKind: 'consecrate',
    identity: 'consecrate_ground',
    name: 'Consecrated Ground',
    meta: { casterOnly: true },
  });

  // Regen buff on caster for the duration
  const ae = ensureActiveEffectList(world, actor);
  if (ae) {
    upsertTimedEffect(ae.effects, {
      key: 'regen', turnsLeft: TURNS, potency: 2, stacks: 1, sourceId: actor,
    });
  }

  world.emit('spell:consecrate', {
    actor,
    at: { x: apos.x, y: apos.y },
    radius: RADIUS,
  });
};

// ─── Outlaw abilities ──────────────────────────────────────────────────────

REGISTRY['smoke_bomb'] = function smokeBombScript(world, actor, spell, _intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');
  const RADIUS = Number(spell?.radius || 3) | 0;
  const BLIND_TURNS = 5;

  let affected = 0;
  for (const [id, pos] of world.query(Position)) {
    if (id === actor) continue;
    const fac = /** @type any */ (world.get(id, Faction));
    if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) continue;
    const dx = Math.abs((pos.x | 0) - (apos.x | 0));
    const dy = Math.abs((pos.y | 0) - (apos.y | 0));
    if (Math.max(dx, dy) > RADIUS) continue;

    // Blind the enemy
    blind(world, id, 0, BLIND_TURNS, 0, 2);

    // Reset aggro to unaware — they lost you
    const aggro = world.get(id, AggroState);
    if (aggro) {
      aggro.alertLevel = AGGRO_LEVELS.unaware;
      aggro.searchTurnsLeft = 0;
      aggro.lastKnownX = 0;
      aggro.lastKnownY = 0;
    }
    affected++;
  }

  world.emit('spell:smoke_bomb', { actor, at: { x: apos.x, y: apos.y }, affected });
};

REGISTRY['poison_blade'] = function poisonBladeScript(world, actor, _spell, _intent) {
  const pos = /** @type any */ (world.get(actor, Position));
  if (!pos) return;

  // Find the equipped weapon
  const equip = /** @type any */ (world.get(actor, Equipment));
  const weaponId = equip ? (equip.weapon || equip.offhand || 0) : 0;
  if (!(weaponId > 0)) {
    world.emit('spell:poison_blade', { actor, at: { x: pos.x, y: pos.y }, fizzle: true, reason: 'no_weapon' });
    return;
  }

  const weaponInfo = /** @type any */ (world.get(weaponId, ItemInfo));
  if (!weaponInfo) {
    world.emit('spell:poison_blade', { actor, at: { x: pos.x, y: pos.y }, fizzle: true, reason: 'no_weapon' });
    return;
  }

  const CHARGES = 8;
  const currentCharges = Math.max(0, Number(weaponInfo.coating?.charges || 0) | 0);
  const nextCharges = currentCharges + CHARGES;
  weaponInfo.coating = { kind: 'poison', charges: nextCharges };

  const weaponName = String(/** @type any */ (world.get(weaponId, NamedIdentity))?.name || 'weapon');
  world.emit('spell:poison_blade', {
    actor,
    at: { x: pos.x, y: pos.y },
    weaponId,
    weaponName,
    charges: nextCharges,
  });
};

// ─── Buff / Rotation abilities ──────────────────────────────────────────────

REGISTRY['iron_flesh'] = function ironFleshScript(world, actor, _spell, _intent) {
  const pos = /** @type any */ (world.get(actor, Position));
  if (!pos) return;
  const ae = ensureActiveEffectList(world, actor);
  if (!ae) return;

  const DURATION = 15;
  upsertTimedEffect(ae.effects, {
    key: 'stoneskin', turnsLeft: DURATION + 1, potency: 4, stacks: 1, sourceId: actor,
  });
  upsertTimedEffect(ae.effects, {
    key: 'slowed', turnsLeft: DURATION + 1, potency: 1, stacks: 1, sourceId: actor,
  });
  upsertTimedEffect(ae.effects, {
    key: 'thorns', turnsLeft: DURATION + 1, potency: 2, stacks: 1, sourceId: actor,
  });

  world.emit('spell:iron_flesh', { actor, at: { x: pos.x, y: pos.y }, duration: DURATION });
};

REGISTRY['ignite_weapons'] = function igniteWeaponsScript(world, actor, _spell, _intent) {
  const pos = /** @type any */ (world.get(actor, Position));
  if (!pos) return;
  const ae = ensureActiveEffectList(world, actor);
  if (!ae) return;

  const DURATION = 12;
  upsertTimedEffect(ae.effects, {
    key: 'fire_weapon', turnsLeft: DURATION + 1, potency: 3, stacks: 1, sourceId: actor,
  });

  world.emit('spell:ignite_weapons', { actor, at: { x: pos.x, y: pos.y }, duration: DURATION });
};

REGISTRY['barkskin'] = function barkskinScript(world, actor, _spell, _intent) {
  const pos = /** @type any */ (world.get(actor, Position));
  if (!pos) return;
  const ae = ensureActiveEffectList(world, actor);
  if (!ae) return;

  const DURATION = 20;
  upsertTimedEffect(ae.effects, {
    key: 'stoneskin', turnsLeft: DURATION + 1, potency: 2, stacks: 1, sourceId: actor,
  });
  upsertTimedEffect(ae.effects, {
    key: 'thorns', turnsLeft: DURATION + 1, potency: 1, stacks: 1, sourceId: actor,
  });
  upsertTimedEffect(ae.effects, {
    key: 'regen', turnsLeft: DURATION + 1, potency: 1, stacks: 1, sourceId: actor,
  });

  world.emit('spell:barkskin', { actor, at: { x: pos.x, y: pos.y }, duration: DURATION });
};

REGISTRY['quicken'] = function quickenScript(world, actor, _spell, _intent) {
  const pos = /** @type any */ (world.get(actor, Position));
  if (!pos) return;
  const ae = ensureActiveEffectList(world, actor);
  if (!ae) return;

  const DURATION = 10;
  upsertTimedEffect(ae.effects, {
    key: 'crit_boost', turnsLeft: DURATION + 1, potency: 1, stacks: 1, sourceId: actor,
  });
  upsertTimedEffect(ae.effects, {
    key: 'battle_fury', turnsLeft: DURATION + 1, potency: 1, stacks: 1, sourceId: actor,
  });
  upsertTimedEffect(ae.effects, {
    key: 'stamina_restore', turnsLeft: DURATION + 1, potency: 5, stacks: 1, sourceId: actor,
  });

  world.emit('spell:quicken', { actor, at: { x: pos.x, y: pos.y }, duration: DURATION });
};

REGISTRY['mark_of_death'] = function markOfDeathScript(world, actor, spell, intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');
  const range = Number(spell?.range || 8) | 0;

  // Resolve target from intent or auto-target
  let targetId = intent?.targetId || 0;
  if (targetId) {
    const vit = /** @type any */ (world.get(targetId, Vitality));
    if (!vit || (vit.hp | 0) <= 0) targetId = 0;
    if (targetId === actor) targetId = 0;
  }

  if (!targetId) {
    let bestD2 = Infinity;
    for (const [id, pos] of world.query(Position)) {
      if (id === actor) continue;
      const fac = /** @type any */ (world.get(id, Faction));
      if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
      const vit = /** @type any */ (world.get(id, Vitality));
      if (!vit || (vit.hp | 0) <= 0) continue;
      const dx = (pos.x | 0) - (apos.x | 0), dy = (pos.y | 0) - (apos.y | 0);
      const d2 = dx * dx + dy * dy;
      if (d2 > range * range) continue;
      if (!hasSpellLineOfSight(world, { sourcePos: apos, targetPos: pos, range, isBlocked: blockedCallback(buildBlocksVisionMap(world)) })) continue;
      if (d2 < bestD2) { bestD2 = d2; targetId = id; }
    }
  }
  if (!targetId) return;

  const tpos = /** @type any */ (world.get(targetId, Position));
  const ae = ensureActiveEffectList(world, targetId);
  if (!ae) return;

  const DURATION = 8;
  upsertTimedEffect(ae.effects, {
    key: 'marked', turnsLeft: DURATION + 1, potency: 1, stacks: 1, sourceId: actor,
  });

  world.emit('spell:mark_of_death', {
    actor, targetId,
    at: { x: tpos.x, y: tpos.y },
    duration: DURATION,
  });
};

REGISTRY['primal_roar'] = function primalRoarScript(world, actor, spell, _intent) {
  const apos = /** @type any */ (world.get(actor, Position));
  if (!apos) return;
  const ae = ensureActiveEffectList(world, actor);
  if (!ae) return;
  const actorFaction = String(world.get(actor, Faction)?.key || 'player');

  const DURATION = 12;
  const RADIUS = Number(spell?.radius || 2) | 0;

  // Self buffs
  upsertTimedEffect(ae.effects, {
    key: 'berserk', turnsLeft: DURATION + 1, potency: 1, stacks: 1, sourceId: actor,
  });
  upsertTimedEffect(ae.effects, {
    key: 'battle_fury', turnsLeft: DURATION + 1, potency: 1, stacks: 1, sourceId: actor,
  });

  // Stagger nearby enemies
  let affected = 0;
  for (const [id, pos] of world.query(Position)) {
    if (id === actor) continue;
    const fac = /** @type any */ (world.get(id, Faction));
    if (!fac || !areFactionsHostile(actorFaction, fac.key)) continue;
    const vit = /** @type any */ (world.get(id, Vitality));
    if (!vit || (vit.hp | 0) <= 0) continue;
    const dx = Math.abs((pos.x | 0) - (apos.x | 0));
    const dy = Math.abs((pos.y | 0) - (apos.y | 0));
    if (Math.max(dx, dy) > RADIUS) continue;

    const tae = ensureActiveEffectList(world, id);
    if (tae) {
      upsertTimedEffect(tae.effects, {
        key: 'stagger', turnsLeft: 4, potency: 1, stacks: 1, sourceId: actor,
      });
      affected++;
    }
  }

  world.emit('spell:primal_roar', {
    actor,
    at: { x: apos.x, y: apos.y },
    radius: RADIUS,
    affected,
    duration: DURATION,
  });
};

/**
 * Execute a spell script if present.
 * @param {World} world
 * @param {number} actor
 * @param {{ id:string, name:string, manaCost:number, [k:string]:any }} spell
 * @param {{ [k:string]: any }} intent
 */
export function runSpellScript(world, actor, spell, intent) {
  const key = String(spell?.script || '') || '';
  const fn = key ? REGISTRY[key] : null;
  if (typeof fn === 'function') {
    try { fn(world, actor, spell, intent || {}); } catch (e) { console.error('[spells] script "' + key + '" failed:', e); }
  }
}

/** @param {string} key @param {(world:World, actor:number, spell:any, intent:any)=>void} fn */
export function registerSpellScript(key, fn) {
  if (!key || typeof fn !== 'function') return;
  REGISTRY[String(key)] = fn;
}
