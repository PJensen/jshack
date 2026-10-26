// rules/data/callbacks/projectile.js
// Projectile impact callback context and shared factory functions for ammo hooks.
// Callbacks are plain (ctx) => void functions invoked via runCallbackList.

import { ActiveEffects } from "../../components/ActiveEffects.js";
import { Position } from "../../components/Position.js";
import { rngInt, rollDice } from "../../utils/rng.js";
import { createCombatStatFacade } from "../../utils/resolveCombatSnapshot.js";
import { createStatusFacade } from "../../utils/statusFacade.js";
import { upsertTimedEffect } from "../../utils/effectSemantics.js";
import { spawnHazard } from "../../utils/hazardSpawn.js";

// ── ProjectileImpactCallbackContext ────────────────────────────────

/**
 * Context passed to projectile/ammo hook callbacks.
 * Exposes deterministic rolls, mutation helpers, stats facade, and a
 * post-damage queue for effects that depend on dealDamage() outcome.
 */
export class ProjectileImpactCallbackContext {
  /**
   * @param {any} world
   * @param {{
   *   phase: string,
   *   attacker: number,
   *   defender?: number,
   *   ammoId: number,
   *   ammoIdentity?: string,
   *   ammoInfo?: any,
   *   style?: string,
   *   distance?: number,
   *   damage?: number,
   *   d20?: number,
   *   totalToHit?: number,
   *   armorClass?: number,
 *   critical?: boolean,
 *   damageType?: string,
 *   armorPenetration?: number,
 *   rng?: () => number,
 *   ammoAffinity?: Record<string, number>,
 * }} frame
   */
  constructor(world, frame) {
    this.world = world;
    this._frame = frame;
    this._cancelled = false;
    this._cancelReason = null;
    this._damageResult = null;
    /** @type {Array<(ctx: ProjectileImpactCallbackContext) => void>} */
    this._resolvedQueue = [];
    this.stats = createCombatStatFacade(world, {
      actor: () => this.attacker,
      attacker: () => this.attacker,
      defender: () => this.defender,
      target: () => this.defender,
      primary: () => this.ammoId,
    });
    this.status = createStatusFacade(world, {
      actor: () => this.attacker,
      attacker: () => this.attacker,
      defender: () => this.defender,
      target: () => this.defender,
      primary: () => this.ammoId,
    });
  }

  get phase() { return String(this._frame.phase || ""); }
  get attacker() { return this._frame.attacker | 0; }
  get defender() { return this._frame.defender | 0; }
  get target() { return this.defender; }
  get ammoId() { return this._frame.ammoId | 0; }
  get ammoIdentity() { return String(this._frame.ammoIdentity || ""); }
  get ammoInfo() { return this._frame.ammoInfo || null; }
  get ammoAffinity() { return this._frame.ammoAffinity || {}; }
  get style() { return String(this._frame.style || "plain"); }
  get distance() { return Number(this._frame.distance || 0) | 0; }
  get d20() { return Number(this._frame.d20 || 0) | 0; }
  get totalToHit() { return Number(this._frame.totalToHit || 0) | 0; }
  get armorClass() { return Number(this._frame.armorClass || 0) | 0; }
  get critical() { return !!this._frame.critical; }
  get damageType() { return String(this._frame.damageType || "pierce"); }
  set damageType(value) {
    const next = String(value || "").toLowerCase();
    if (next === "blunt" || next === "slash" || next === "pierce" || next === "physical") {
      this._frame.damageType = next;
    }
  }
  get armorPenetration() {
    return Math.max(0, Number(this._frame.armorPenetration || 0) | 0);
  }
  set armorPenetration(value) {
    this._frame.armorPenetration = Math.max(0, Number(value || 0) | 0);
  }

  get damage() {
    return Math.max(0, Number(this._frame.damage || 0) | 0);
  }

  set damage(value) {
    this._frame.damage = Math.max(0, Number(value || 0) | 0);
  }

  get cancelled() { return this._cancelled; }
  get cancelReason() { return this._cancelReason; }

  get damageResult() { return this._damageResult; }
  get applied() { return !!this._damageResult?.applied; }
  get killed() { return !!this._damageResult?.killed; }
  get amountApplied() { return Number(this._damageResult?.amount || 0) | 0; }
  get resultReason() { return String(this._damageResult?.reason || ""); }

  get impact() {
    const point = this._frame.impact;
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) return { x: point.x | 0, y: point.y | 0 };
    const pos = this.world.get(this.defender, Position);
    return pos ? { x: pos.x | 0, y: pos.y | 0 } : null;
  }

  spawnHazard(params = {}) {
    const at = this.impact;
    if (!at) return 0;
    const radiusBonus = Number(this.ammoAffinity.hazardRadiusBonus || 0) | 0;
    const spreadBonus = Number(this.ammoAffinity.fireSpreadChanceBonus || 0);
    const meta = params.meta && typeof params.meta === "object" ? { ...params.meta } : {};
    if (spreadBonus) meta.fireSpreadChance = Math.min(1, Number(meta.fireSpreadChance || 0.25) + spreadBonus);
    return spawnHazard(this.world, {
      ...params,
      radius: Math.max(0, (Number(params.radius || 0) | 0) + radiusBonus),
      meta,
      x: at.x,
      y: at.y,
      sourceId: this.attacker,
    });
  }

  cancel(reason) {
    this._cancelled = true;
    this._cancelReason = typeof reason === "string"
      ? { code: reason, message: reason }
      : reason || { code: "CANCELLED", message: "Cancelled" };
  }

  /**
   * @param {number} amount
   */
  addDamage(amount) {
    this.damage = this.damage + Math.max(0, Number(amount || 0) | 0);
    return this.damage;
  }

  /**
   * @param {number} amount
   */
  addArmorPenetration(amount) {
    this.armorPenetration = this.armorPenetration + Math.max(0, Number(amount || 0) | 0);
    return this.armorPenetration;
  }

  /**
   * @param {string} diceExpr
   */
  rollDice(diceExpr) {
    if (typeof this._frame.rng !== "function") return 0;
    return Math.max(0, rollDice(String(diceExpr || "0d1"), this._frame.rng));
  }

  /**
   * @param {number} chancePct
   */
  chance(chancePct) {
    const pct = Math.max(0, Number(chancePct || 0));
    if (!(pct > 0)) return false;
    if (pct >= 100) return true;
    if (typeof this._frame.rng !== "function") return false;
    return rngInt(this._frame.rng, 1, 100) <= pct;
  }

  /** @param {string} eventName @param {any} payload */
  emit(eventName, payload) {
    this.world.emit(eventName, payload);
  }

  /**
   * Push a status effect onto an entity (immediate, not queued).
   * Stacks with existing effects of the same key.
   * @param {number} entityId
   * @param {{ key:string, turnsLeft:number, potency:number, stacks?:number }} effect
   */
  pushEffect(entityId, effect) {
    const ae = this.world.get(entityId, ActiveEffects);
    if (ae && Array.isArray(ae.effects)) {
      upsertTimedEffect(ae.effects, { stacks: 1, ...effect });
      return;
    }
    try { this.world.add(entityId, ActiveEffects, { effects: [{ stacks: 1, ...effect }] }); } catch {} // ECS: may already exist
  }

  /**
   * Register a callback that runs after dealDamage() result is known.
   * @param {(ctx: ProjectileImpactCallbackContext) => void} callback
   */
  deferResolved(callback) {
    if (typeof callback !== "function") return;
    this._resolvedQueue.push(callback);
  }

  /**
   * @param {any} result
   */
  resolveDamageResult(result) {
    this._damageResult = result || null;
  }

  flushResolved() {
    if (this._resolvedQueue.length === 0) return;
    const queue = this._resolvedQueue.slice();
    this._resolvedQueue.length = 0;
    for (let i = 0; i < queue.length; i++) {
      try { queue[i](this); } catch (e) { console.error('[projectile] resolved callback failed:', e); }
    }
  }
}

// ── Factory functions for common projectile callback patterns ─────

/**
 * Add deterministic bonus damage to an actor-impact hit.
 * @param {string} diceExpr
 */
export function bonusDamageOnProjectileActorImpact(diceExpr) {
  const expr = String(diceExpr || "").trim() || "1d1";
  return (ctx) => {
    const extra = ctx.rollDice(expr);
    if (extra > 0) ctx.addDamage(extra);
  };
}

/**
 * Apply a status effect to the defender after damage resolution.
 * @param {{ key:string, turnsLeft:number, potency:number, stacks?:number }} effect
 * @param {string} [emitEvent]
 * @param {{ requireApplied?: boolean, skipIfKilled?: boolean }} [opts]
 */
export function statusEffectOnProjectileActorImpact(effect, emitEvent, opts = {}) {
  const requireApplied = opts.requireApplied !== false;
  const skipIfKilled = opts.skipIfKilled !== false;
  return (ctx) => {
    ctx.deferResolved((resolvedCtx) => {
      if (requireApplied && !resolvedCtx.applied) return;
      if (skipIfKilled && resolvedCtx.killed) return;
      resolvedCtx.pushEffect(resolvedCtx.defender, { stacks: 1, ...effect });
      if (emitEvent) {
        resolvedCtx.emit(emitEvent, {
          actor: resolvedCtx.attacker,
          target: resolvedCtx.defender,
        });
      }
    });
  };
}
