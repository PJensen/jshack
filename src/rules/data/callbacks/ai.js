// rules/data/callbacks/ai.js
// AI callback context and shared factory functions for monster AI hooks.
// Callbacks are plain (ctx) => void functions invoked via runCallbackList.

import { HazardArea } from "../../components/HazardArea.js";
import { CastSpellIntent } from "../../components/Intents/CastSpellIntent.js";
import { Channeling } from "../../components/Channeling.js";
import { Faction } from "../../components/Faction.js";
import { Mana } from "../../components/Mana.js";
import { NamedIdentity } from "../../components/NamedIdentity.js";
import { Position } from "../../components/Position.js";
import { ActiveEffects } from "../../components/ActiveEffects.js";
import { Stamina } from "../../components/Stamina.js";
import { Vitality } from "../../components/Vitality.js";
import { getSpell } from "../../data/spells.js";
import { bresenhamLine } from "../../../shared/math/bresenham.js";
import { dealDamage } from "../../utils/dealDamage.js";
import { upsertTimedEffect } from "../../utils/effectSemantics.js";
import { ensureActiveEffects } from "../../utils/effects.js";
import { spawnHazard } from "../../utils/hazardSpawn.js";
import { findNearestValidTileAround } from "../../utils/queries.js";
import { worldChance } from "../../utils/rng.js";
import { chebyshev, manhattan } from "../../utils/distance.js";
import { spellCost, spellCostResource } from "../../data/spells.js";
import { isAiOnCooldown, startAiCooldown } from "../../utils/aiCooldowns.js";
import { statusStrength } from "../../utils/statusFacade.js";

const SELF_THROW_COOLDOWN_KEY = Symbol.for("jshack:ai:selfThrowNearTargetOnSeen:cooldown");
const FIRE_BREATH_COOLDOWN_KEY = Symbol.for("jshack:ai:fireBreathLineOnLOS:cooldown");
const SPELL_CAST_COOLDOWN_KEY = Symbol.for("jshack:ai:castSpellOnLOS:cooldown");
const ABILITY_WINDUP_KEY = Symbol.for("jshack:ai:abilityWindup:state");

/**
 * @param {number} actor
 * @param {number} target
 * @returns {string}
 */
function selfThrowCooldownSlot(actor, target) {
  return `${actor | 0}:${target | 0}`;
}

/**
 * @param {import("../../../lib/ecs-js/index.js").World} world
 * @param {number} actor
 * @param {number} target
 * @param {number} cooldownTurns
 * @returns {boolean}
 */
function selfThrowOnCooldown(world, actor, target, cooldownTurns) {
  if (!(cooldownTurns > 0)) return false;
  return isAiOnCooldown(world, SELF_THROW_COOLDOWN_KEY, selfThrowCooldownSlot(actor, target));
}

/**
 * @param {import("../../../lib/ecs-js/index.js").World} world
 * @param {number} actor
 * @param {number} target
 * @param {number} cooldownTurns
 */
function markSelfThrowUsed(world, actor, target, cooldownTurns) {
  startAiCooldown(world, SELF_THROW_COOLDOWN_KEY, selfThrowCooldownSlot(actor, target), cooldownTurns);
}

/**
 * @param {import("../../../lib/ecs-js/index.js").World} world
 * @param {number} actor
 * @param {number} cooldownTurns
 * @returns {boolean}
 */
function fireBreathOnCooldown(world, actor, cooldownTurns) {
  if (!(cooldownTurns > 0)) return false;
  return isAiOnCooldown(world, FIRE_BREATH_COOLDOWN_KEY, String(actor | 0));
}

/**
 * @param {import("../../../lib/ecs-js/index.js").World} world
 * @param {number} actor
 * @param {number} cooldownTurns
 */
function markFireBreathUsed(world, actor, cooldownTurns) {
  startAiCooldown(world, FIRE_BREATH_COOLDOWN_KEY, String(actor | 0), cooldownTurns);
}

/**
 * @param {number} actor
 * @param {string} spellId
 * @returns {string}
 */
function spellCastCooldownSlot(actor, spellId) {
  return `${actor | 0}:${String(spellId || "")}`;
}

/**
 * @param {import("../../../lib/ecs-js/index.js").World} world
 * @param {number} actor
 * @param {string} spellId
 * @param {number} cooldownTurns
 * @returns {boolean}
 */
function spellCastOnCooldown(world, actor, spellId, cooldownTurns) {
  if (!(cooldownTurns > 0)) return false;
  return isAiOnCooldown(world, SPELL_CAST_COOLDOWN_KEY, spellCastCooldownSlot(actor, spellId));
}

/**
 * @param {import("../../../lib/ecs-js/index.js").World} world
 * @param {number} actor
 * @param {string} spellId
 * @param {number} cooldownTurns
 */
function markSpellCastUsed(world, actor, spellId, cooldownTurns) {
  startAiCooldown(world, SPELL_CAST_COOLDOWN_KEY, spellCastCooldownSlot(actor, spellId), cooldownTurns);
}

/**
 * @param {import("../../../lib/ecs-js/index.js").World} world
 * @returns {Map<string, { readyStep:number, targetId:number, targetX:number, targetY:number }>}
 */
function ensureAbilityWindupState(world) {
  const rec = world[ABILITY_WINDUP_KEY];
  if (rec instanceof Map) return rec;
  const created = new Map();
  world[ABILITY_WINDUP_KEY] = created;
  return created;
}

/**
 * @param {number} actor
 * @param {string} abilityId
 * @returns {string}
 */
function abilityWindupSlot(actor, abilityId) {
  return `${actor | 0}:${String(abilityId || "")}`;
}

// -- SeenCallbackContext --

/**
 * Context passed to monster AI sight callbacks.
 * Provides cancel(), emit(), and handled flag for "action consumed".
 */
export class SeenCallbackContext {
  /**
   * @param {any} world
   * @param {{
   *   actor: number,
   *   target: number,
   *   actorPos?: { x:number, y:number } | null,
   *   targetPos?: { x:number, y:number } | null,
   * }} frame
   */
  constructor(world, frame) {
    this.world = world;
    this._frame = frame;
    this._cancelled = false;
    this._cancelReason = null;
    this._handled = false;
  }

  get actor() { return this._frame.actor | 0; }
  get target() { return this._frame.target | 0; }

  get actorPos() {
    const pos = this.world.get(this.actor, Position);
    if (pos) return { x: pos.x | 0, y: pos.y | 0 };
    const fallback = this._frame.actorPos;
    return fallback ? { x: fallback.x | 0, y: fallback.y | 0 } : null;
  }

  get targetPos() {
    const pos = this.world.get(this.target, Position);
    if (pos) return { x: pos.x | 0, y: pos.y | 0 };
    const fallback = this._frame.targetPos;
    return fallback ? { x: fallback.x | 0, y: fallback.y | 0 } : null;
  }

  get cancelled() { return this._cancelled; }
  get cancelReason() { return this._cancelReason; }
  get handled() { return this._handled; }
  get canActThisTurn() {
    return this._frame.canActThisTurn !== false
      && statusStrength(this.world, this.actor, "stasis") <= 0;
  }
  get hasQueuedMove() { return !!this._frame.hasQueuedMove; }

  /**
   * @param {unknown} reason
   */
  cancel(reason) {
    this._cancelled = true;
    this._cancelReason = typeof reason === "string"
      ? { code: reason, message: reason }
      : reason || { code: "CANCELLED", message: "Cancelled" };
  }

  /** @param {boolean} [value] */
  setHandled(value = true) {
    this._handled = !!value;
  }

  /** @param {string} eventName @param {any} payload */
  emit(eventName, payload) {
    this.world.emit(eventName, payload);
  }
}

// -- Gaze exposure tracking --

const GAZE_EXPOSURE_KEY = Symbol.for('jshack:ai:gazeExposure');

/** @param {any} world @returns {Map<string, {count:number, lastTurn:number}>} */
function ensureGazeExposureState(world) {
  if (world[GAZE_EXPOSURE_KEY] instanceof Map) return world[GAZE_EXPOSURE_KEY];
  const m = new Map();
  world[GAZE_EXPOSURE_KEY] = m;
  return m;
}

// -- Factory functions --

/**
 * Teleport-throw the monster near the seen target and optionally collide.
 * Landing is always on a valid walkable/unblocked tile, never on top of target.
 *
 * @param {{ searchRadius?: number, fallbackSearchRadius?: number, cooldownTurns?: number }} [opts]
 */
export function selfThrowNearTargetOnSeen(opts = {}) {
  const searchRadius = Math.max(1, Number.isFinite(opts.searchRadius) ? (Number(opts.searchRadius) | 0) : 1);
  const fallbackSearchRadius = Math.max(searchRadius, Number.isFinite(opts.fallbackSearchRadius) ? (Number(opts.fallbackSearchRadius) | 0) : 2);
  const cooldownTurns = Math.max(0, Number.isFinite(opts.cooldownTurns) ? (Number(opts.cooldownTurns) | 0) : 0);
  const chance = Number.isFinite(opts.chance) ? Math.max(0, Math.min(1, opts.chance)) : 1;

  return (ctx) => {
    if (!ctx || ctx.cancelled) return;
    if (!ctx.canActThisTurn || ctx.hasQueuedMove) return;
    if (!worldChance(ctx.world, chance)) return;
    const from = ctx.actorPos;
    const target = ctx.targetPos;
    if (!from || !target) return;
    if (selfThrowOnCooldown(ctx.world, ctx.actor, ctx.target, cooldownTurns)) return;

    const exclude = [
      { x: target.x | 0, y: target.y | 0 },
      { x: from.x | 0, y: from.y | 0 },
    ];

    let landing = findNearestValidTileAround(ctx.world, target, { maxDistance: searchRadius, exclude });
    if (!landing && fallbackSearchRadius > searchRadius) {
      landing = findNearestValidTileAround(ctx.world, target, { maxDistance: fallbackSearchRadius, exclude });
    }

    if (!landing) {
      if (manhattan(from, target) === 1) {
        ctx.emit("bump:attack", { attacker: ctx.actor, target: ctx.target, via: "onSeen:self-throw" });
        markSelfThrowUsed(ctx.world, ctx.actor, ctx.target, cooldownTurns);
        ctx.setHandled(true);
      }
      return;
    }

    ctx.world.set(ctx.actor, Position, { x: landing.x | 0, y: landing.y | 0 });
    ctx.emit("moved", {
      id: ctx.actor,
      from: { x: from.x | 0, y: from.y | 0 },
      to: { x: landing.x | 0, y: landing.y | 0 },
    });
    ctx.emit("item:thrown", {
      itemId: ctx.actor,
      from: { x: from.x | 0, y: from.y | 0 },
      to: { x: landing.x | 0, y: landing.y | 0 },
      targetId: ctx.target,
      source: "monster:onSeen",
      mode: "self-throw",
    });

    if (manhattan(landing, target) === 1) {
      ctx.emit("bump:attack", { attacker: ctx.actor, target: ctx.target, via: "onSeen:self-throw" });
    }
    markSelfThrowUsed(ctx.world, ctx.actor, ctx.target, cooldownTurns);
    ctx.setHandled(true);
  };
}

/**
 * Fire breath: deal immediate fire damage along a line to the target tile and
 * leave short-lived floor fire hazards behind.
 *
 * @param {{
 *   minRange?: number,
 *   maxRange?: number,
 *   cooldownTurns?: number,
 *   chance?: number,
 *   damage?: number,
 *   hazardDamage?: number,
 *   hazardTurns?: number,
 *   burnTurns?: number,
 *   burnPotency?: number,
 * }} [opts]
 */
export function fireBreathLineOnLOS(opts = {}) {
  const minRange = Math.max(1, Number.isFinite(opts.minRange) ? (Number(opts.minRange) | 0) : 2);
  const maxRange = Math.max(minRange, Number.isFinite(opts.maxRange) ? (Number(opts.maxRange) | 0) : 6);
  const cooldownTurns = Math.max(0, Number.isFinite(opts.cooldownTurns) ? (Number(opts.cooldownTurns) | 0) : 6);
  const chance = Number.isFinite(opts.chance) ? Math.max(0, Math.min(1, opts.chance)) : 1;
  const damage = Math.max(0, Number.isFinite(opts.damage) ? (Number(opts.damage) | 0) : 4);
  const hazardDamage = Math.max(0, Number.isFinite(opts.hazardDamage) ? (Number(opts.hazardDamage) | 0) : 1);
  const hazardTurns = Math.max(1, Number.isFinite(opts.hazardTurns) ? (Number(opts.hazardTurns) | 0) : 2);
  const burnTurns = Math.max(1, Number.isFinite(opts.burnTurns) ? (Number(opts.burnTurns) | 0) : 3);
  const burnPotency = Math.max(1, Number.isFinite(opts.burnPotency) ? (Number(opts.burnPotency) | 0) : 2);

  return (ctx) => {
    if (!ctx || ctx.cancelled) return;
    if (!ctx.canActThisTurn || ctx.hasQueuedMove) return;
    if (!worldChance(ctx.world, chance)) return;

    const from = ctx.actorPos;
    const target = ctx.targetPos;
    if (!from || !target) return;

    const dist = chebyshev(from, target);
    if (dist < minRange || dist > maxRange) return;
    if (fireBreathOnCooldown(ctx.world, ctx.actor, cooldownTurns)) return;

    /** @type {Array<{ x:number, y:number }>} */
    const tiles = [];
    for (const [x, y] of bresenhamLine(from.x | 0, from.y | 0, target.x | 0, target.y | 0)) {
      if (chebyshev(from, { x, y }) > maxRange) break;
      tiles.push({ x: x | 0, y: y | 0 });
    }
    if (tiles.length <= 0) return;

    const tileKeys = new Set(tiles.map((tile) => `${tile.x},${tile.y}`));
    /** @type {number[]} */
    const hitIds = [];
    /** @type {number[]} */
    const hazardIds = [];
    const actorIdentity = String(ctx.world.get(ctx.actor, NamedIdentity)?.identity || "dragon");

    for (const [id, pos, vit] of ctx.world.query(Position, Vitality)) {
      if (id === ctx.actor) continue;
      if (!pos || !vit || (vit.hp | 0) <= 0) continue;
      if (!tileKeys.has(`${pos.x | 0},${pos.y | 0}`)) continue;

      const result = dealDamage(ctx.world, {
        target: id,
        amount: damage,
        source: ctx.actor,
        type: "fire",
        at: { x: pos.x | 0, y: pos.y | 0 },
        cause: "monster:firebreath",
      });
      if (!result.applied) continue;

      hitIds.push(id);
      if (!result.killed) {
        const ae = ensureActiveEffects(ctx.world, id);
        if (ae) {
          upsertTimedEffect(ae.effects, {
            key: "burn",
            turnsLeft: burnTurns,
            potency: burnPotency,
            stacks: 1,
            startedAtTurn: Number(ctx.world.step || 0) | 0,
            sourceId: ctx.actor,
          });
          try { ctx.world.set(id, ActiveEffects, ae); } catch {}
        }
        ctx.emit("proc:burning", { actor: ctx.actor, target: id });
      }
    }

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const existing = findFireHazardAt(ctx.world, tile.x, tile.y);
      if (existing > 0) {
        const hazard = ctx.world.get(existing, HazardArea);
        if (hazard) {
          hazard.turnsLeft = Math.max(hazard.turnsLeft | 0, hazardTurns);
          hazard.tickDamage = Math.max(hazard.tickDamage | 0, hazardDamage);
          hazard.damageType = "fire";
          hazard.cause = "monster:firebreath";
          hazard.sourceId = ctx.actor | 0;
          hazard.sourceKind = actorIdentity;
          ctx.world.emit("hazard:spawned", {
            hazardId: existing,
            kind: "fire",
            medium: String(hazard.medium || "floor").toLowerCase() === "floor" ? "floor" : "air",
            at: { x: tile.x | 0, y: tile.y | 0 },
            turnsLeft: hazard.turnsLeft | 0,
            radius: hazard.radius | 0,
            tickDamage: hazard.tickDamage | 0,
            damageType: hazard.damageType,
            cause: hazard.cause,
            sourceId: hazard.sourceId | 0,
            sourceKind: hazard.sourceKind || "",
            identity: "dragon_fire",
            name: "Dragon Fire",
          });
        }
        hazardIds.push(existing);
        continue;
      }

      const hazardId = spawnHazard(ctx.world, {
        x: tile.x | 0,
        y: tile.y | 0,
        kind: "fire",
        medium: "floor",
        turnsLeft: hazardTurns,
        radius: 0,
        tickDamage: hazardDamage,
        damageType: "fire",
        cause: "monster:firebreath",
        sourceId: ctx.actor | 0,
        sourceKind: actorIdentity,
        identity: "dragon_fire",
        name: "Dragon Fire",
        meta: { source: "dragon_firebreath" },
      });
      if (hazardId > 0) hazardIds.push(hazardId);
    }

    markFireBreathUsed(ctx.world, ctx.actor, cooldownTurns);
    ctx.emit("monster:firebreath", {
      actor: ctx.actor,
      target: ctx.target,
      from: { x: from.x | 0, y: from.y | 0 },
      to: { x: tiles[tiles.length - 1].x | 0, y: tiles[tiles.length - 1].y | 0 },
      tiles: tiles.map((tile) => ({ x: tile.x | 0, y: tile.y | 0 })),
      hitIds,
      hazardIds,
      damage,
      hazardDamage,
      hazardTurns,
    });
    ctx.setHandled(true);
  };
}

/**
 * @param {import("../../../lib/ecs-js/index.js").World} world
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function findFireHazardAt(world, x, y) {
  for (const [id, pos, hazard] of world.query(Position, HazardArea)) {
    if (!pos || !hazard) continue;
    if ((pos.x | 0) !== (x | 0) || (pos.y | 0) !== (y | 0)) continue;
    if (String(hazard.kind || "").toLowerCase() !== "fire") continue;
    if ((hazard.radius | 0) !== 0) continue;
    return id | 0;
  }
  return 0;
}

/**
 * Gaze aura: starts a channeled gaze_beam spell when the eye has LOS.
 * The channeling system handles countdown, interruption (stun/silence/LOS break),
 * and fires the gaze_beam script on completion (stun + mindwipe).
 * Each turn in LOS emits escalating `proc:gaze:message` and `proc:gaze:charging`
 * events for UI wiring.
 *
 * @param {number} [exposureTurns=8] - channel duration (turns before gaze fires)
 */
export function gazeOnLOS(exposureTurns = 8) {
  const castTime = Math.max(1, Math.trunc(exposureTurns));

  const MESSAGES = [
    "The Floating Eye's unblinking gaze washes over you.",
    "Your thoughts feel sluggish under its stare...",
    "The eye's gaze presses deeper into your mind.",
    "Your concentration is slipping away...",
    "The Floating Eye's gaze sears into your mind!",
  ];

  return (ctx) => {
    if (!ctx || ctx.cancelled) return;
    if (!ctx.canActThisTurn) return;
    const world = ctx.world;
    const actor = ctx.actor | 0;
    const target = ctx.target | 0;
    const now = (Number(world.step) || 0) | 0;

    // If already channeling gaze_beam, emit progress events
    const ch = world.has(actor, Channeling) ? world.get(actor, Channeling) : null;
    if (ch && String(ch.spellId || '') === 'gaze_beam') {
      const elapsed = Math.max(0, (ch.turnsTotal | 0) - (ch.turnsRemaining | 0));
      const msgIdx = Math.min(elapsed, MESSAGES.length - 1);
      ctx.emit('proc:gaze:message', {
        actor, target, step: elapsed + 1, message: MESSAGES[msgIdx],
      });
      ctx.emit('proc:gaze:charging', {
        actor, target, chargeCount: elapsed + 1, total: ch.turnsTotal | 0, turn: now,
      });
      return;
    }

    // Don't start a new channel if already channeling something else
    if (ch) return;

    // Start gaze beam channel
    const actorPos = ctx.actorPos;
    try {
      world.add(actor, Channeling, {
        mode: 'cast',
        turnsRemaining: castTime,
        turnsTotal: castTime,
        manaPerTick: 0,
        spellId: 'gaze_beam',
        targetId: target,
        x: null,
        y: null,
        breakOnNoLos: true,
        breakOnMove: true,
        anchorX: actorPos ? (actorPos.x | 0) : null,
        anchorY: actorPos ? (actorPos.y | 0) : null,
      });
    } catch { return; }

    // First escalating message on channel start
    ctx.emit('proc:gaze:message', {
      actor, target, step: 1, message: MESSAGES[0],
    });
    ctx.emit('proc:gaze:charging', {
      actor, target, chargeCount: 1, total: castTime, turn: now,
    });
  };
}

/**
 * Queue a CastSpellIntent for a monster while it has LOS to target.
 * Uses cooldown/chance/range gating and optional ally-count cap to avoid
 * runaway summon spam.
 *
 * @param {{
 *   spellId: string,
 *   abilityId?: string,
 *   abilityName?: string,
 *   targeting?: "enemy"|"self",
 *   minRange?: number,
 *   maxRange?: number,
 *   cooldownTurns?: number,
 *   chance?: number,
 *   consumeTurn?: boolean,
 *   telegraphTurns?: number,
 *   maxAlliesInRadius?: number,
 *   allyRadius?: number,
 * }} opts
 */
export function castSpellOnLOS(opts) {
  const spellId = String(opts?.spellId || "").trim();
  const abilityId = String(opts?.abilityId || spellId || "").trim();
  const abilityName = String(opts?.abilityName || abilityId || spellId || "").trim();
  const targeting = String(opts?.targeting || "enemy") === "self" ? "self" : "enemy";
  const minRange = Math.max(0, Number.isFinite(opts?.minRange) ? (Number(opts.minRange) | 0) : 0);
  const maxRangeOpt = Number.isFinite(opts?.maxRange) ? (Number(opts.maxRange) | 0) : -1;
  const cooldownTurns = Math.max(0, Number.isFinite(opts?.cooldownTurns) ? (Number(opts.cooldownTurns) | 0) : 8);
  const chance = Number.isFinite(opts?.chance) ? Math.max(0, Math.min(1, Number(opts.chance))) : 1;
  const consumeTurn = opts?.consumeTurn !== false;
  const telegraphTurns = Math.max(0, Number.isFinite(opts?.telegraphTurns) ? (Number(opts.telegraphTurns) | 0) : 0);
  const maxAlliesInRadius = Number.isFinite(opts?.maxAlliesInRadius) ? (Number(opts.maxAlliesInRadius) | 0) : -1;
  const allyRadius = Math.max(1, Number.isFinite(opts?.allyRadius) ? (Number(opts.allyRadius) | 0) : 6);

  return (ctx) => {
    if (!ctx || ctx.cancelled) return;
    if (!spellId) return;
    if (!ctx.canActThisTurn || ctx.hasQueuedMove) return;
    const now = Number(ctx.world.step || 0) | 0;
    const windupStore = ensureAbilityWindupState(ctx.world);
    const windupKey = abilityWindupSlot(ctx.actor, abilityId);
    const pendingWindup = windupStore.get(windupKey) || null;
    const windupReady = !!(pendingWindup && now >= (Number(pendingWindup.readyStep || 0) | 0));

    if (!windupReady && !worldChance(ctx.world, chance)) return;
    if (ctx.world.has(ctx.actor, CastSpellIntent) || ctx.world.has(ctx.actor, Channeling)) return;

    const spell = getSpell(spellId);
    if (!spell) return;
    if (spellCastOnCooldown(ctx.world, ctx.actor, spellId, cooldownTurns)) return;

    const actorPos = ctx.actorPos;
    const targetPos = ctx.targetPos;
    const maxRange = maxRangeOpt >= 0
      ? Math.max(minRange, maxRangeOpt)
      : Math.max(minRange, Number(spell.range || 8) | 0);

    if (!windupReady && targeting !== "self") {
      if (!actorPos || !targetPos) return;
      const dist = chebyshev(actorPos, targetPos);
      if (dist < minRange || dist > maxRange) return;
    }

    if (maxAlliesInRadius >= 0) {
      const faction = String(ctx.world.get(ctx.actor, Faction)?.key || "").trim();
      if (faction && actorPos) {
        let allies = 0;
        for (const [_id, pos, fac, vit] of ctx.world.query(Position, Faction, Vitality)) {
          if (!pos || !fac || !vit || (vit.hp | 0) <= 0) continue;
          if (String(fac.key || "") !== faction) continue;
          if (chebyshev(actorPos, pos) > allyRadius) continue;
          allies++;
        }
        if (allies > maxAlliesInRadius) return;
      }
    }

    const resource = spellCostResource(spell);
    const need = Math.max(0, Number(spellCost(spell)));
    if (resource === "stamina") {
      const stamina = ctx.world.get(ctx.actor, Stamina);
      if (stamina) {
        const have = Number(stamina.stamina || 0);
        if (have < need) return;
      }
    } else if (resource === "life") {
      const vitality = ctx.world.get(ctx.actor, Vitality);
      if (vitality) {
        const have = Number(vitality.hp || 0);
        if (have - need < 1) return;
      }
    } else {
      const mana = ctx.world.get(ctx.actor, Mana);
      if (mana && Number(mana.mana || 0) < need) return;
    }

    if (telegraphTurns > 0 && !windupReady) {
      const readyStep = now + telegraphTurns;
      windupStore.set(windupKey, {
        readyStep,
        targetId: (ctx.target | 0) > 0 ? (ctx.target | 0) : 0,
        targetX: actorPos ? (targetPos?.x ?? actorPos.x) | 0 : 0,
        targetY: actorPos ? (targetPos?.y ?? actorPos.y) | 0 : 0,
      });
      ctx.emit("monster:ability:windup", {
        actor: ctx.actor,
        targetId: (ctx.target | 0) > 0 ? (ctx.target | 0) : 0,
        abilityId,
        abilityName,
        spellId,
        turns: telegraphTurns,
        at: actorPos ? { x: actorPos.x | 0, y: actorPos.y | 0 } : undefined,
      });
      if (consumeTurn) ctx.setHandled(true);
      return;
    }

    const castIntent = { spellId };
    if (targeting !== "self") {
      const pendingTargetId = Number(pendingWindup?.targetId || 0) | 0;
      const chosenTarget = pendingTargetId > 0 ? pendingTargetId : (ctx.target | 0);
      if (chosenTarget > 0) castIntent.targetId = chosenTarget;
      if (Number.isFinite(pendingWindup?.targetX) && Number.isFinite(pendingWindup?.targetY)) {
        castIntent.x = Number(pendingWindup.targetX) | 0;
        castIntent.y = Number(pendingWindup.targetY) | 0;
      }
    }

    try {
      ctx.world.add(ctx.actor, CastSpellIntent, castIntent);
    } catch {
      return;
    }

    markSpellCastUsed(ctx.world, ctx.actor, spellId, cooldownTurns);
    if (pendingWindup) windupStore.delete(windupKey);
    ctx.emit("monster:castSpellIntent", {
      actor: ctx.actor,
      spellId,
      targetId: Number(castIntent.targetId || 0) | 0,
    });
    ctx.emit("monster:ability:cast", {
      actor: ctx.actor,
      targetId: Number(castIntent.targetId || 0) | 0,
      abilityId,
      abilityName,
      spellId,
      telegraphed: !!pendingWindup,
    });
    if (consumeTurn) ctx.setHandled(true);
  };
}
