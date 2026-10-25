// src/content/scriptCtx.js
// ScriptCtx — the unified scripting context for content DSL hooks.
// Wraps the interaction runtime context behind a clean, expressive API.

import { interpolate } from './helpers.js';
import { getPresentation } from './registry.js';
import { createWorldFacade } from './worldFacade.js';

/**
 * ScriptCtx provides a Papyrus-style scripting surface for content authors.
 * It wraps the interaction context (from executeInteraction / createFacets)
 * so that item hooks, monster hooks, and any future scripted behavior all
 * use the same consistent API.
 *
 * Usage in a DSL hook:
 *   onUse(ctx) {
 *     ctx.heal(ctx.user, '2d6+4');
 *     ctx.cure(ctx.user, 'poison');
 *     ctx.message('{user} feels the poison drain away.');
 *     ctx.vfx.floatText(ctx.user, 'CURED', { color: '#55dd55' });
 *     ctx.consume();
 *   }
 */
export class ScriptCtx {
  /**
   * @param {object} ictx - Interaction context (has .query, .mutate, .io, .helpers, .rng)
   * @param {object} state - Hook state { actor, itemId, target, identity, identified, ... }
   */
  constructor(ictx, state) {
    this._ctx = ictx;
    this._state = state || {};
    this._consumed = false;
    this._results = {};
  }

  // ── Identity accessors ────────────────────────────────────────────

  /** Entity that triggered this action (usually the player). */
  get user() { return Number(this._state.actor || this._ctx.actor || 0) | 0; }

  /** Target entity (if any). */
  get target() { return Number(this._state.target || this._ctx.target || 0) | 0; }

  /** The item entity this hook is attached to. */
  get item() { return Number(this._state.itemId || this._ctx.primary || 0) | 0; }

  /** Alias — the entity this script belongs to. */
  get self() { return this.item; }

  /** The identity string of the item. */
  get identity() { return String(this._state.identity || ''); }

  /** Whether the item has been identified by the player. */
  get identified() { return !!this._state.identified; }

  /** Throw landing position (available in onThrow hooks). */
  get targetPos() {
    const tx = this._state.targetX;
    const ty = this._state.targetY;
    if (tx != null && ty != null) return { x: tx | 0, y: ty | 0 };
    // Fallback: target entity position
    if (this.target && this._ctx._entitiesInRadius) {
      // Use query to get position
      const pos = this._ctx.query?.get?.(this.target, this._ctx._Position);
      if (pos) return { x: pos.x | 0, y: pos.y | 0 };
    }
    return null;
  }

  // ── Healing & Damage ──────────────────────────────────────────────

  /**
   * Heal an entity.
   * @param {number} entity
   * @param {string|number} amount - flat number or dice expression "2d6+4"
   */
  heal(entity, amount) {
    const val = typeof amount === 'string'
      ? this._ctx.helpers.roll(amount)
      : Math.max(0, Number(amount) | 0);
    this._ctx.helpers.heal(entity, val);
    return val;
  }

  /**
   * Deal damage to an entity.
   * @param {number} entity
   * @param {string|number} amount
   * @param {string} [source="script"] - damage source label
   */
  damage(entity, amount, source = "script") {
    const val = typeof amount === 'string'
      ? this._ctx.helpers.roll(amount)
      : Math.max(0, Number(amount) | 0);
    this._ctx.helpers.damage(entity, val, source);
    return val;
  }

  // ── Effects & Status ──────────────────────────────────────────────

  /**
   * Apply a timed effect (buff or debuff).
   * @param {number} entity
   * @param {string} key - effect key ("regen", "stoneskin", "poison", etc.)
   * @param {number} [turns=30]
   * @param {object} [opts]
   * @param {number} [opts.potency=1]
   * @param {string} [opts.stack="refresh"]
   * @param {number} [opts.maxStacks=1]
   * @param {object} [opts.meta] - extra metadata
   */
  buff(entity, key, turns = 30, opts = {}) {
    this._ctx.helpers.addEffect(entity, {
      key,
      potency: opts.potency ?? 1,
      turnsLeft: turns,
      onsetLeft: opts.onsetLeft ?? 0,
      peakLeft: opts.peakLeft ?? 0,
      stack: opts.stack ?? "refresh",
      maxStacks: opts.maxStacks ?? 1,
      sourceId: this.item,
      sourceActorId: this.user,
      sourceKind: 'item',
      sourceKey: this.identity,
      meta: {
        source: this.identity || "script",
        ...(opts.meta || {}),
      },
    });
  }

  /** Alias for buff — semantic clarity for negative effects. */
  apply(entity, key, turns = 10, opts = {}) {
    return this.buff(entity, key, turns, opts);
  }

  /**
   * Remove effects by key.
   * @param {number} entity
   * @param {string|string[]} keys
   */
  cure(entity, keys) {
    this._ctx.helpers.clearEffects(entity, Array.isArray(keys) ? keys : [keys]);
  }

  /** Alias for cure. */
  removeBuff(entity, keys) { return this.cure(entity, keys); }

  cancel(message = "You cannot use that.") {
    return this._ctx.cancel(typeof message === 'string'
      ? { code: 'USE_CANCELLED', message, consumesTurn: false }
      : message);
  }

  /**
   * Check if an entity has a status.
   * @param {number} entity
   * @param {string} statusKey
   * @returns {boolean}
   */
  hasStatus(entity, statusKey) {
    return this._ctx.helpers.hasStatus(entity, statusKey);
  }

  /**
   * Check if an entity has an active effect.
   * @param {number} entity
   * @param {string} effectKey
   * @returns {boolean}
   */
  hasEffect(entity, effectKey) {
    return this._ctx.helpers.hasEffect(entity, effectKey);
  }

  // ── Dice & RNG ────────────────────────────────────────────────────

  /**
   * Roll dice using deterministic RNG.
   * @param {string} expr - "2d6+4", "1d8", etc.
   * @returns {number}
   */
  roll(expr) {
    return this._ctx.helpers.roll(String(expr));
  }

  /**
   * Chance check.
   * @param {number} pct - percentage (0-100) or probability (0-1)
   * @returns {boolean}
   */
  chance(pct) {
    return this._ctx.helpers.chance(pct);
  }

  /**
   * Random integer in [min, max] inclusive.
   */
  int(min, max) {
    return this._ctx.helpers.int(min, max);
  }

  /**
   * Pick a random element from an array.
   * @template T
   * @param {T[]} values
   * @returns {T|null}
   */
  pick(values) {
    return this._ctx.helpers.pick(values);
  }

  // ── Item ──────────────────────────────────────────────────────────

  /** Consume (destroy) the item. Marks this hook as having consumed. */
  consume() {
    this._consumed = true;
  }

  // ── Cooldown ──────────────────────────────────────────────────────

  /**
   * Set a cooldown on the item (in game turns).
   * @param {number} turns
   */
  setCooldown(turns) {
    if (this._ctx._setCooldown) {
      this._ctx._setCooldown(this.item, turns);
    }
  }

  /**
   * Check if the item is on cooldown.
   * @returns {boolean}
   */
  isOnCooldown() {
    if (this._ctx._isOnCooldown) return this._ctx._isOnCooldown(this.item);
    return false;
  }

  /**
   * Get remaining cooldown turns.
   * @returns {number}
   */
  cooldownRemaining() {
    if (this._ctx._cooldownRemaining) return this._ctx._cooldownRemaining(this.item);
    return 0;
  }

  // ── Local State ───────────────────────────────────────────────────

  /**
   * Read the local script state for an entity.
   * Returns a shallow copy — mutate via setState().
   * @param {number} [entity] - defaults to self
   * @returns {object}
   */
  state(entity) {
    const id = entity ?? this.self;
    if (this._ctx._getScriptState) return { ...this._ctx._getScriptState(id) };
    // Fallback: query ScriptState component directly
    const ss = this._ctx.query?.get?.(id, this._ctx._ScriptState);
    return ss ? { ...ss.data } : {};
  }

  /**
   * Patch the local script state for an entity.
   * @param {number} entityOrPatch - entity ID, or patch object (defaults to self)
   * @param {object} [maybePatch] - patch object if first arg is entity ID
   */
  setState(entityOrPatch, maybePatch) {
    let id, patch;
    if (typeof entityOrPatch === 'object' && !maybePatch) {
      id = this.self;
      patch = entityOrPatch;
    } else {
      id = entityOrPatch ?? this.self;
      patch = maybePatch;
    }
    if (this._ctx._setScriptState) {
      this._ctx._setScriptState(id, patch);
    } else if (this._ctx._mutateScriptState) {
      this._ctx._mutateScriptState(id, patch);
    }
  }

  // ── Vitals ─────────────────────────────────────────────────────────

  /**
   * Get an entity's HP as a fraction 0–1.
   * @param {number} entity
   * @returns {number}
   */
  hpPercent(entity) {
    if (this._ctx._hpPercent) return this._ctx._hpPercent(entity);
    return 1.0;
  }

  // ── Semantic Queries ──────────────────────────────────────────────

  /**
   * Check if an entity has a tag.
   * @param {number} entity
   * @param {string} tag
   * @returns {boolean}
   */
  hasTag(entity, tag) {
    if (this._ctx._hasTag) return this._ctx._hasTag(entity, tag);
    // Fallback: check ItemInfo.tags
    const info = this._ctx.query?.get?.(entity, this._ctx._ItemInfo);
    if (info && Array.isArray(info.tags) && info.tags.includes(tag)) return true;
    return false;
  }

  /**
   * Find entities within Chebyshev radius of a position or entity.
   * @param {number|{x:number,y:number}} center - entity ID or position
   * @param {number} radius
   * @param {{ tag?: string, faction?: string }} [filter]
   * @returns {number[]} entity IDs
   */
  entitiesInRadius(center, radius, filter) {
    if (this._ctx._entitiesInRadius) {
      return this._ctx._entitiesInRadius(center, radius, filter);
    }
    return [];
  }

  /**
   * Get the tile identity at a world position.
   * @param {number|{x:number,y:number}} posOrEntity
   * @returns {string|null}
   */
  tileAt(posOrEntity) {
    if (this._ctx._tileAt) return this._ctx._tileAt(posOrEntity);
    return null;
  }

  // ── Lighting ───────────────────────────────────────────────────────

  /**
   * Set a dynamic point light on an entity. Persists across frames
   * until changed or cleared. Radius 0 removes the light.
   *
   * @param {number} entity - entity to anchor the light to
   * @param {number} radius - light radius in tiles (0 to remove)
   * @param {{ color?: string, pattern?: string, softness?: number, temporal?: object }} [opts]
   *
   * opts.pattern — named pattern: 'torch', 'holy', 'breathe', 'occult',
   *   'pulse', 'storm', 'biolum', 'heartbeat', 'candle', 'ember', 'void'
   *
   * opts.temporal — authored temporal definition (overrides pattern):
   *   {
   *     speed:  1.0,     // base animation speed
   *     sway:   0.10,    // slow sinusoidal sway amplitude
   *     wobble: 0.06,    // medium wobble amplitude
   *     jitter: 0.04,    // random frame-to-frame jitter
   *     rShift: 0,       // red color shift (-1 to 1)
   *     gShift: 0,       // green color shift
   *     bShift: 0,       // blue color shift
   *   }
   */
  light(entity, radius, opts = {}) {
    // If an authored temporal spec is provided, register it as a named pattern
    let pattern = opts.pattern || 'holy';
    if (opts.temporal) {
      const tp = opts.temporal;
      pattern = `_content_${this.identity}_${entity}`;
      this._emit('content:light:registerPattern', {
        name: pattern,
        speed:  tp.speed  ?? 1.0,
        sway:   tp.sway   ?? 0.10,
        wobble: tp.wobble  ?? 0.06,
        jitter: tp.jitter  ?? 0.04,
        rShift: tp.rShift  ?? 0,
        gShift: tp.gShift  ?? 0,
        bShift: tp.bShift  ?? 0,
      });
    }
    this._emit('content:light:set', {
      entity,
      radius,
      color: opts.color || '#fff5c8',
      pattern,
      softness: opts.softness || 10,
    });
  }

  // ── Presentation ──────────────────────────────────────────────────

  /**
   * Emit a semantic presentation event.
   * Looks up the co-located presentation spec and emits it for display.
   * In headless mode, this is a no-op. Simulation truth is unaffected.
   *
   * @param {string} presentationId - key into this thing's `presentations` block
   * @param {object} [payload] - data for template interpolation in the presentation
   */
  present(presentationId, payload = {}) {
    const spec = getPresentation(this.identity, presentationId);
    this._emit('script:present', {
      entity: payload.target ?? payload.entity ?? this.self,
      id: presentationId,
      identity: this.identity,
      spec,
      payload: { ...payload, user: this.user, target: this.target, item: this.item },
    });
  }

  // ── Messaging ─────────────────────────────────────────────────────

  /**
   * Log a message. Supports {user}, {target}, {item}, {self} interpolation.
   * @param {string} template
   * @param {string} [type="system"] - "system", "combat", "danger", "good"
   */
  message(template, type = "system") {
    const text = this._interpolate(template);
    this._ctx.helpers.message(text, type);
  }

  // ── VFX ───────────────────────────────────────────────────────────

  get vfx() {
    const self = this;
    return {
      /**
       * Floating text above an entity.
       * @param {number} entity
       * @param {string} text
       * @param {{ color?: string, life?: number }} [opts]
       */
      floatText(entity, text, opts = {}) {
        self._emit('script:vfx:floatText', {
          entity, text,
          color: opts.color || '#ffffff',
          life: opts.life || 0.8,
        });
      },

      /**
       * Particle burst around an entity.
       * @param {number} entity
       * @param {{ color?: string, count?: number, speed?: number, life?: number }} [opts]
       */
      burst(entity, opts = {}) {
        self._emit('script:vfx:burst', {
          entity,
          color: opts.color || '#ffffff',
          count: opts.count || 8,
          speed: opts.speed || 1.0,
          life: opts.life || 0.3,
        });
      },

      /**
       * Beam effect between two entities.
       * @param {number} from
       * @param {number} to
       * @param {{ color?: string, width?: number, life?: number }} [opts]
       */
      beam(from, to, opts = {}) {
        self._emit('script:vfx:beam', {
          from, to,
          color: opts.color || '#ffffff',
          width: opts.width || 2,
          life: opts.life || 0.4,
        });
      },

      /**
       * Glow aura around an entity.
       * @param {number} entity
       * @param {{ color?: string, radius?: number, life?: number }} [opts]
       */
      glow(entity, opts = {}) {
        self._emit('script:vfx:glow', {
          entity,
          color: opts.color || '#ffffff',
          radius: opts.radius || 1.0,
          life: opts.life || 1.0,
        });
      },

      /**
       * Explosion burst.
       * @param {number} entity
       * @param {{ color?: string, radius?: number, count?: number }} [opts]
       */
      explosion(entity, opts = {}) {
        self._emit('script:vfx:explosion', {
          entity,
          color: opts.color || '#ff6633',
          radius: opts.radius || 2,
          count: opts.count || 16,
        });
      },
    };
  }

  // ── Sound ─────────────────────────────────────────────────────────

  /**
   * Play a sound effect.
   * @param {string} soundId
   * @param {object} [opts]
   */
  sound(soundId, opts) {
    this._emit('audio:play', { id: soundId, ...(opts || {}) });
  }

  // ── Spawning ──────────────────────────────────────────────────────

  /**
   * Spawn an item at a position.
   * @param {string} itemId
   * @param {{ x: number, y: number }} [at]
   * @param {object} [opts]
   * @returns {number|null} entity id
   */
  spawnItem(itemId, at, opts) {
    return this._ctx.helpers.spawnItem(itemId, at, opts);
  }

  /**
   * Spawn a monster at a position.
   * @param {string} monsterId
   * @param {{ x: number, y: number }} [at]
   * @param {object} [opts]
   * @returns {number|null} entity id
   */
  spawnMonster(monsterId, at, opts) {
    return this._ctx.helpers.spawnMonster(monsterId, at, opts);
  }

  /**
   * Spawn a hazard (fire, poison cloud, etc.).
   * @param {object} spec - hazard spec
   * @param {{ x: number, y: number }} [at]
   */
  spawnHazard(spec, at) {
    return this._ctx.helpers.hazardSpawn(spec, at);
  }

  // ── Raw access (escape hatch) ─────────────────────────────────────

  /**
   * Emit a raw event on the world event bus.
   * @param {string} event
   * @param {object} [payload]
   */
  emit(event, payload = {}) {
    this._emit(event, payload);
  }

  /**
   * Get a component value from an entity.
   * @param {number} entity
   * @param {Function} Component
   * @returns {object|null}
   */
  get(entity, Component) {
    return this._ctx.query.get(entity, Component);
  }

  /**
   * Check if an entity has a component.
   * @param {number} entity
   * @param {Function} Component
   * @returns {boolean}
   */
  has(entity, Component) {
    try { return !!this._ctx.query.get(entity, Component); }
    catch { return false; }
  }

  /**
   * Store a result value — hooks can return data to the pipeline.
   * @param {string} key
   * @param {*} value
   */
  result(key, value) {
    this._results[key] = value;
  }

  // ── Internal ──────────────────────────────────────────────────────

  _emit(event, payload) {
    if (this._ctx.helpers?.emit) {
      this._ctx.helpers.emit(event, payload);
    } else if (this._ctx.io?.emit) {
      this._ctx.io.emit(event, payload);
    }
  }

  _interpolate(template) {
    const q = this._ctx.query;
    const bindings = {
      user: (q?.name ? q.name(this.user) : null) || 'You',
      target: (q?.name ? q.name(this.target) : null) || 'something',
      item: (q?.name ? q.name(this.item) : null) || this.identity || 'the item',
      self: (q?.name ? q.name(this.self) : null) || 'it',
    };
    return interpolate(template, bindings);
  }
}

/**
 * Wrap a DSL hook function into an interaction-pipeline-compatible hook.
 * The returned function has the signature (ictx, state) => result
 * expected by drinkPipeline, usePipeline, etc.
 *
 * When called from the interaction pipeline, the ictx has query/helpers/io
 * but lacks the extended world-backed APIs (state, spatial, cooldown).
 * We detect this and bridge the gap by overlaying a worldFacade's APIs
 * onto the interaction context, so the ScriptCtx gets the full surface.
 *
 * @param {(ctx: ScriptCtx) => void} dslHook
 * @returns {(ictx: object, state: object) => object}
 */
export function compileHook(dslHook) {
  return (ictx, state) => {
    const augmented = _ensureExtendedCtx(ictx, state);
    const ctx = new ScriptCtx(augmented, state);
    dslHook(ctx);
    return { consumed: ctx._consumed, ...ctx._results };
  };
}

/**
 * If the interaction context is missing the extended APIs (_getScriptState,
 * _entitiesInRadius, etc.), overlay them from a worldFacade built from
 * the raw world reference that the interaction pipeline provides.
 */
function _ensureExtendedCtx(ictx, state) {
  // Already has extended APIs (e.g. came from worldFacade directly)
  if (ictx._getScriptState) return ictx;

  // Need the raw world to build extended APIs
  const world = ictx.world;
  if (!world || typeof world.get !== 'function') return ictx;

  const actor = Number(state?.actor || ictx.actor || 0) | 0;
  const itemId = Number(state?.itemId || ictx.primary || 0) | 0;

  // Build a worldFacade for the extended APIs only
  const facade = createWorldFacade(world, actor, itemId);
  const pendingStates = new Map();
  const readState = (id) => {
    if (!pendingStates.has(id)) pendingStates.set(id, { ...facade._getScriptState(id) });
    return pendingStates.get(id);
  };
  const patchState = (id, patch) => {
    if (!ictx.query.get(id, facade._ScriptState)) return;
    const data = { ...readState(id), ...patch };
    pendingStates.set(id, data);
    ictx.mutate.patchComponent(id, facade._ScriptState, { data });
  };

  // Overlay extended APIs onto the interaction context.
  // Keep the interaction context's helpers/query/io (they're richer),
  // but add the world-backed APIs that the interaction context lacks.
  return {
    ...ictx,
    _ScriptState:       facade._ScriptState,
    _ItemInfo:          facade._ItemInfo,
    _getScriptState:    readState,
    _setScriptState:    patchState,
    _mutateScriptState: patchState,
    _hasTag:            facade._hasTag.bind(facade),
    _entitiesInRadius:  facade._entitiesInRadius.bind(facade),
    _hpPercent:         facade._hpPercent.bind(facade),
    _tileAt:            facade._tileAt.bind(facade),
    _setCooldown:       (id, turns) => ictx.mutate.queue({ type: 'setItemCooldown', entityId: id, turns }),
    _isOnCooldown:      facade._isOnCooldown.bind(facade),
    _cooldownRemaining: facade._cooldownRemaining.bind(facade),
  };
}
