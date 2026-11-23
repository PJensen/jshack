import { registerScript, ScriptVerb } from "../scripting.js";
import { Vitality } from "../components/Vitality.js";
import { Position } from "../components/Position.js";
import { createFrom } from "../../lib/ecs-js/archetype.js";
import { Monster } from "../archetypes/Creatures.js";
import { getMonster } from "../data/monsters.js";
import { dealDamage } from "../utils/dealDamage.js";
import { attach } from "../../lib/ecs-js/hierarchy.js";
import { findNearestValidTileAround } from "../utils/queries.js";
import { combatSeed, mulberry32, rngInt, rollDice } from "../utils/rng.js";
import { Mana } from "../components/Mana.js";
import { Stamina } from "../components/Stamina.js";
import { Faction } from "../components/Faction.js";
import { ActiveEffects } from "../components/ActiveEffects.js";
import { areFactionsHostile } from "../utils/factionHostility.js";
import { spawnMonsterEntity } from "../utils/spawnMonsterEntity.js";
import { spawnHazard } from "../utils/hazardSpawn.js";
import { HazardArea } from "../components/HazardArea.js";
import { forEachInRadius } from "../utils/spatialIndex.js";
import { clamp01Or, clampInt } from "../utils/numberCoerce.js";
import { computeImpactVectorXY, computeProjectileDelay } from "../utils/projectileKinematics.js";
import { getTile } from "../environment/dungeon/tileMap.js";
import { TILE_WALL } from "../environment/dungeon/constants.js";
import { startFlood } from "../systems/floodSystem.js";
import { WaterTrapOpened } from "../../events/WaterTrapOpened.js";

const ARROW_TRAP_PROJECTILE_SPEED = 22;
const ARROW_TRAP_PROJECTILE_MIN_DURATION = 0.06;
const ARROW_TRAP_PROJECTILE_MAX_DURATION = 0.35;

function pushTimedEffect(world, target, effect) {
  if (!(target > 0) || !effect || typeof effect !== "object") return;
  const existing = world.get(target, ActiveEffects);
  const next = Array.isArray(existing?.effects) ? existing.effects.slice() : [];
  next.push({
    key: String(effect.key || ""),
    turnsLeft: Math.max(1, Number(effect.turnsLeft || 1) | 0),
    potency: Number.isFinite(effect.potency) ? Number(effect.potency) : 1,
    stacks: Math.max(1, Number(effect.stacks || 1) | 0),
    sourceId: Number(effect.sourceId || 0) | 0,
    startedAtTurn: Number.isFinite(world?.step) ? Number(world.step) : 0,
  });
  if (existing) world.set(target, ActiveEffects, { effects: next });
  else world.add(target, ActiveEffects, { effects: next });
}

function findNearestHostile(world, anchor, victimId, maxDistance = 6) {
  const srcPos = world.get(victimId, Position);
  const srcFaction = world.get(victimId, Faction)?.key || "";
  if (!srcPos) return 0;
  let bestId = 0;
  let bestDist = Infinity;
  for (const [id, pos, vit] of world.query(Position, Vitality)) {
    if (!(id > 0) || id === victimId) continue;
    if (!pos || !vit || Number(vit.hp || 0) <= 0) continue;
    const faction = world.get(id, Faction)?.key || "";
    if (!areFactionsHostile(srcFaction, faction)) continue;
    const dx = Math.abs((pos.x | 0) - (srcPos.x | 0));
    const dy = Math.abs((pos.y | 0) - (srcPos.y | 0));
    const dist = Math.max(dx, dy);
    if (dist > maxDistance) continue;
    if (dist < bestDist) {
      bestDist = dist;
      bestId = id;
    }
  }
  return bestId;
}

function findArrowTrapOrigin(trapX, trapY, maxDistance = 12) {
  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
  ];
  let best = null;
  for (const dir of dirs) {
    for (let dist = 1; dist <= maxDistance; dist++) {
      const x = trapX + dir.dx * dist;
      const y = trapY + dir.dy * dist;
      if (getTile(x, y) === TILE_WALL) {
        if (!best || dist < best.dist) best = { x, y, dist };
        break;
      }
    }
  }
  if (best) return { x: best.x, y: best.y };
  return { x: trapX, y: trapY - 1 };
}


// Spike trap: deals percentage of max HP as damage.
// Params: { percent?: number } // 0..1
registerScript('trap_spike', {
  [ScriptVerb.TrapTrigger]: (world, ctx) => {
    const target = Number(ctx?.targetId || 0) || 0;
    if (!world.isAlive(target)) return;
    const vit = world.get(target, Vitality);
    if (!vit) return;
    const pos = world.get(target, Position);
    const pct = Math.max(0, Math.min(1, Number(ctx?.params?.percent ?? 0.5)));
    const amount = Math.max(1, Math.floor(vit.maxHp * pct));
    dealDamage(world, {
      target,
      amount,
      source: Number(ctx?.trapId || 0) || 0,
      type: 'pierce',
      cause: 'a pit full of sharp spikes',
      at: pos ? { x: pos.x, y: pos.y } : undefined,
    });
  }
});

// Shock trap: deals electric damage and applies the 'shocked' status for 2 turns.
// Damage reduced to 15% of max HP (down from 30%) because the sensory overload
// (stun, blindness, deafness) is now a significant additional gameplay penalty.
// Params: { percent?: number } // 0..1 fraction of max HP
registerScript('trap_shock', {
  [ScriptVerb.TrapTrigger]: (world, ctx) => {
    const target = Number(ctx?.targetId || 0) || 0;
    if (!world.isAlive(target)) return;
    const vit = world.get(target, Vitality);
    if (!vit) return;
    const pos = world.get(target, Position);
    const pct = Math.max(0, Math.min(1, Number(ctx?.params?.percent ?? 0.15)));
    const amount = Math.max(1, Math.floor(vit.maxHp * pct));
    dealDamage(world, {
      target,
      amount,
      source: Number(ctx?.trapId || 0) || 0,
      type: 'lightning',
      cause: 'a jolt of mass electrocution',
      at: pos ? { x: pos.x, y: pos.y } : undefined,
    });
    // Electrocution (stun + blind + deafen) is auto-applied by the damaged-event
    // listener in electrocute.js — no explicit call needed here.
    // Emit event for display layer (flash, ringing messages)
    world.emit?.('shock_trap:sensory', {
      target,
      at: pos ? { x: pos.x, y: pos.y } : undefined,
    });
  }
});

// Snake trap: spawns a cluster of snakes around the trigger point.
// Params: { count?: number } — number of snakes (default 3)
registerScript('trap_snake', {
  [ScriptVerb.TrapTrigger]: (world, ctx) => {
    const trapId = Number(ctx?.trapId || 0) || 0;
    const trapPos = world.get(trapId, Position);
    if (!trapPos) return;

    const snakeDef = getMonster('snake');
    if (!snakeDef) return;

    const count = Number(ctx?.params?.count ?? 4);
    // Offsets for adjacent tiles (cardinal + diagonal)
    const offsets = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    for (let i = 0; i < count && i < offsets.length; i++) {
      const [dx, dy] = offsets[i];
      const child = createFrom(world, Monster, {
        x: trapPos.x + dx,
        y: trapPos.y + dy,
        name: snakeDef.name,
        identity: snakeDef.id,
        maxHp: snakeDef.baseHp,
        faction: 'enemy',
        accuracyDerived: snakeDef.attack,
        damagePowerDerived: snakeDef.attack,
        evadeDerived: snakeDef.defense,
        naturalDamageDice: snakeDef.damageDice,
        sizeClass: snakeDef.sizeClass,
        massKg: snakeDef.massKg,
        resistances: snakeDef.resistances,
        speed: snakeDef.speed,
      });
      // Attach to the trap entity so destroySubtree cleans up on floor transition.
      try { attach(world, child, trapId); } catch (e) { console.error('[traps] hierarchy attach failed:', e); }
    }
  }
});

// Pit trap: trapdoor that drops the player one floor down at the same world position.
// Params: { percent?: number }
// The placement constraint (N+1 forward look) ensures the landing tile on the next
// floor is always TILE_FLOOR; see populate.js / isPitLandingViable.
registerScript("trap_pit", {
  [ScriptVerb.TrapTrigger]: (world, ctx) => {
    const trapId = Number(ctx?.trapId || 0) | 0;
    const target = Number(ctx?.targetId || 0) | 0;
    if (!(trapId > 0) || !(target > 0) || !world.isAlive(target)) return;
    const trapPos = world.get(trapId, Position);
    if (!trapPos) return;

    const damagePct = clamp01Or(ctx?.params?.percent, 0.08);

    // Deal blunt fall damage before the floor transition so it's visible.
    const vit = world.get(target, Vitality);
    if (vit) {
      const amount = Math.max(1, Math.floor(Number(vit.maxHp || 0) * damagePct));
      dealDamage(world, {
        target,
        amount,
        source: trapId,
        type: "blunt",
        cause: "a long fall into a pit",
        at: { x: trapPos.x | 0, y: trapPos.y | 0 },
      });
    }

    // Signal transition controller — player drops to next floor at same XY.
    world.emit?.("trap:pit:fall", {
      trapId,
      targetId: target,
      x: trapPos.x | 0,
      y: trapPos.y | 0,
    });
  },
});

// Water trap: opens the ceiling and starts a finite, turn-by-turn shallow flood.
registerScript("trap_water", {
  [ScriptVerb.TrapTrigger]: (world, ctx) => {
    const trapId = Number(ctx?.trapId || 0) | 0;
    if (!(trapId > 0) || !world.isAlive(trapId)) return;
    const at = world.get(trapId, Position);
    if (!at) return;
    startFlood(world, trapId, ctx?.params || {});
    world.emit(new WaterTrapOpened({ trapId, at }));
  },
});

// Siphon trap: drains a resource and optionally transfers to a nearby hostile.
// Params: { resource?: 'hp'|'mana'|'stamina'|'drain', percent?: number, healNearestEnemy?: boolean }
// resource='drain' drains both mana and stamina simultaneously.
registerScript("trap_siphon", {
  [ScriptVerb.TrapTrigger]: (world, ctx) => {
    const trapId = Number(ctx?.trapId || 0) | 0;
    const target = Number(ctx?.targetId || 0) | 0;
    if (!(trapId > 0) || !(target > 0) || !world.isAlive(target)) return;

    const resource = String(ctx?.params?.resource || "hp").toLowerCase();
    const pct = clamp01Or(ctx?.params?.percent, 0.15);
    const healNearestEnemy = ctx?.params?.healNearestEnemy !== false;

    let drained = 0;

    function drainMana() {
      const mana = world.get(target, Mana);
      if (!mana) return 0;
      const cap = Math.max(0, Number(mana.maxMana || 0) | 0);
      const amount = Math.max(1, Math.floor(cap * pct));
      const before = Math.max(0, Number(mana.mana || 0));
      const after = Math.max(0, before - amount);
      const lost = Math.max(0, before - after);
      world.set(target, Mana, { ...mana, mana: after, regenCooldown: Math.max(Number(mana.regenCooldown || 0), 1) });
      return lost;
    }

    function drainStamina() {
      const stamina = world.get(target, Stamina);
      if (!stamina) return 0;
      const cap = Math.max(0, Number(stamina.maxStamina || 0) | 0);
      const amount = Math.max(1, Math.floor(cap * pct));
      const before = Math.max(0, Number(stamina.stamina || 0));
      const after = Math.max(0, before - amount);
      const lost = Math.max(0, before - after);
      world.set(target, Stamina, { ...stamina, stamina: after, regenCooldown: Math.max(Number(stamina.regenCooldown || 0), 1) });
      return lost;
    }

    if (resource === "drain") {
      drained = drainMana() + drainStamina();
    } else if (resource === "mana") {
      drained = drainMana();
    } else if (resource === "stamina") {
      drained = drainStamina();
    } else {
      const vit = world.get(target, Vitality);
      if (vit) {
        const cap = Math.max(1, Number(vit.maxHp || 1) | 0);
        const amount = Math.max(1, Math.floor(cap * pct));
        const pos = world.get(target, Position);
        const out = dealDamage(world, {
          target,
          amount,
          source: trapId,
          type: "arcane",
          cause: "having the life sucked out by a siphon trap",
          at: pos ? { x: pos.x | 0, y: pos.y | 0 } : undefined,
        });
        drained = Math.max(0, Number(out?.amount || 0));
      }
    }

    if (drained > 0 && healNearestEnemy) {
      const enemyId = findNearestHostile(world, trapId, target, 6);
      if (enemyId > 0) {
        const vit = world.get(enemyId, Vitality);
        if (vit && Number(vit.hp || 0) > 0) {
          const before = Number(vit.hp || 0);
          const maxHp = Math.max(1, Number(vit.maxHp || 1) | 0);
          const after = Math.min(maxHp, before + drained);
          const healed = Math.max(0, after - before);
          if (healed > 0) {
            world.set(enemyId, Vitality, { ...vit, hp: after });
            world.emit?.("healed", { target: enemyId, amount: healed, source: trapId, cause: "trap_siphon" });
          }
        }
      }
    }

    world.emit?.("trap:siphon", {
      trapId,
      targetId: target,
      resource,
      amount: drained,
    });
  },
});

// Rust trap: temporary anti-gear suppression via existing weakened status.
// Params: { stat?: 'armor'|'attack', amount?: number, duration?: number }
registerScript("trap_rust", {
  [ScriptVerb.TrapTrigger]: (world, ctx) => {
    const trapId = Number(ctx?.trapId || 0) | 0;
    const target = Number(ctx?.targetId || 0) | 0;
    if (!(trapId > 0) || !(target > 0) || !world.isAlive(target)) return;
    const stat = String(ctx?.params?.stat || "armor").toLowerCase();
    const amount = clampInt(ctx?.params?.amount, 2, 1);
    const duration = clampInt(ctx?.params?.duration, 20, 1);

    pushTimedEffect(world, target, {
      key: "weakened",
      turnsLeft: duration,
      potency: amount,
      stacks: 1,
      sourceId: trapId,
    });

    world.emit?.("trap:rust", {
      trapId,
      targetId: target,
      stat,
      amount,
      duration,
    });
  },
});

// Swarm trap: releases many weak creatures around the trap.
// Params: { monsterId?: string, count?: number }
registerScript("trap_swarm", {
  [ScriptVerb.TrapTrigger]: (world, ctx) => {
    const trapId = Number(ctx?.trapId || 0) | 0;
    if (!(trapId > 0)) return;
    const trapPos = world.get(trapId, Position);
    if (!trapPos) return;

    const monsterId = String(ctx?.params?.monsterId || "spider").trim().toLowerCase();
    const def = getMonster(monsterId);
    if (!def) return;
    const count = clampInt(ctx?.params?.count, 6, 1);

    const seed = combatSeed(world.seed, world.step, trapId, Number(ctx?.targetId || 0) | 0, 0x5A57);
    const rand = mulberry32(seed);
    const offsets = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [1, -1], [-1, 1], [1, 1],
      [-2, 0], [2, 0], [0, -2], [0, 2],
    ];

    for (let i = offsets.length - 1; i > 0; i--) {
      const j = rngInt(rand, 0, i);
      const tmp = offsets[i];
      offsets[i] = offsets[j];
      offsets[j] = tmp;
    }

    let spawned = 0;
    for (let i = 0; i < offsets.length && spawned < count; i++) {
      const ox = offsets[i][0];
      const oy = offsets[i][1];
      const spot = findNearestValidTileAround(world, { x: trapPos.x + ox, y: trapPos.y + oy }, { maxDistance: 1 });
      if (!spot) continue;
      const child = spawnMonsterEntity(world, {
        x: spot.x,
        y: spot.y,
        name: def.name,
        identity: def.id,
        maxHp: def.baseHp,
        faction: "enemy",
        accuracyDerived: def.attack,
        damagePowerDerived: def.attack,
        evadeDerived: def.defense,
        naturalDamageDice: def.damageDice,
        sizeClass: def.sizeClass,
        massKg: def.massKg,
        resistances: def.resistances,
        speed: def.speed,
        creatureType: def.creatureType,
      });
      try { attach(world, child, trapId); } catch {}
      spawned++;
    }

    world.emit?.("trap:swarm", {
      trapId,
      monsterId,
      count: spawned,
      at: { x: trapPos.x | 0, y: trapPos.y | 0 },
    });
  },
});

// Arrow trap: reusable pressure plate that fires from the nearest cardinal wall.
// Params: { dice?: string, damage?: number, type?: string, maxWallDistance?: number }
registerScript("trap_arrow", {
  [ScriptVerb.TrapTrigger]: (world, ctx) => {
    const trapId = Number(ctx?.trapId || 0) | 0;
    const target = Number(ctx?.targetId || 0) | 0;
    if (!(trapId > 0) || !(target > 0) || !world.isAlive(target)) return;
    const trapPos = world.get(trapId, Position);
    const targetPos = world.get(target, Position);
    if (!trapPos || !targetPos) return;

    const tx = trapPos.x | 0;
    const ty = trapPos.y | 0;
    const maxWallDistance = clampInt(ctx?.params?.maxWallDistance, 12, 1);
    const from = findArrowTrapOrigin(tx, ty, maxWallDistance);
    const seed = combatSeed(world.seed, world.step, trapId, target, 0xA770);
    const rng = mulberry32(seed);
    const dice = String(ctx?.params?.dice || "").trim();
    const fallbackDamage = clampInt(ctx?.params?.damage, 8, 1);
    const amount = dice ? Math.max(1, rollDice(dice, rng)) : fallbackDamage;
    const damageType = String(ctx?.params?.type || "pierce").toLowerCase();
    const projectileDelay = computeProjectileDelay(
      from,
      { x: tx, y: ty },
      ARROW_TRAP_PROJECTILE_SPEED,
      ARROW_TRAP_PROJECTILE_MIN_DURATION,
      ARROW_TRAP_PROJECTILE_MAX_DURATION,
    );

    world.emit?.("ranged:shot", {
      attacker: trapId,
      target,
      hit: true,
      damage: amount,
      style: "plain",
      projectileSpeed: ARROW_TRAP_PROJECTILE_SPEED,
      from,
      to: { x: tx, y: ty },
    });
    dealDamage(world, {
      target,
      amount,
      source: trapId,
      type: damageType,
      cause: "an arrow trap",
      at: { x: targetPos.x | 0, y: targetPos.y | 0 },
      projectileDelay,
      impactVector: computeImpactVectorXY(from.x, from.y, tx, ty),
      projectileKind: "arrow",
    });
  },
});

// ── Gas trap: creates poison gas cloud. If victim is burning, EXPLODES. ──
registerScript("trap_gas", {
  [ScriptVerb.TrapTrigger]: (world, ctx) => {
    const trapId = Number(ctx?.trapId || 0) | 0;
    const targetId = Number(ctx?.targetId || 0) | 0;
    if (!(trapId > 0)) return;
    const trapPos = world.get(trapId, Position);
    if (!trapPos) return;
    const tx = trapPos.x | 0;
    const ty = trapPos.y | 0;

    // Check if the victim is burning — if so, the gas ignites into an explosion
    let victimBurning = false;
    if (targetId > 0) {
      const ae = world.get(targetId, ActiveEffects);
      if (ae && Array.isArray(ae.effects)) {
        victimBurning = ae.effects.some(e => e.key === 'burn' || e.key === 'burning');
      }
    }
    // Also check for nearby fire hazards
    if (!victimBurning) {
      for (const [, hpos, ha] of world.query(Position, HazardArea)) {
        if (!ha || ha.kind !== 'fire') continue;
        const dx = Math.abs((hpos.x | 0) - tx);
        const dy = Math.abs((hpos.y | 0) - ty);
        if (dx <= (ha.radius || 0) + 1 && dy <= (ha.radius || 0) + 1) {
          victimBurning = true;
          break;
        }
      }
    }

    if (victimBurning) {
      // EXPLOSION — big AoE fire damage
      const EXPLOSION_RADIUS = 3;
      const EXPLOSION_DMG = 12;
      forEachInRadius(world, tx, ty, EXPLOSION_RADIUS, (id) => {
        const vit = world.get(id, Vitality);
        if (!vit || (vit.hp | 0) <= 0) return;
        dealDamage(world, {
          target: id, amount: EXPLOSION_DMG, source: 0,
          type: 'fire', cause: 'an exploding gas trap',
          at: { x: tx, y: ty },
        });
      });
      // Spawn short-lived fire hazard at the explosion site
      spawnHazard(world, {
        x: tx, y: ty,
        kind: 'fire', medium: 'floor',
        radius: 1, tickDamage: 3, damageType: 'fire',
        turnsLeft: 4, sourceId: 0,
      });
      world.emit('trap:gas_explosion', { trapId, at: { x: tx, y: ty }, radius: EXPLOSION_RADIUS });
    } else {
      // Normal gas: spawn a poison gas cloud
      spawnHazard(world, {
        x: tx, y: ty,
        kind: 'gas', medium: 'air',
        radius: 2, tickDamage: 2, damageType: 'poison',
        turnsLeft: 8, sourceId: 0,
      });
      world.emit('trap:gas', { trapId, at: { x: tx, y: ty } });
    }
  },
});
