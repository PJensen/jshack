// src/main/targeting/targetingController.js
// Unified targeting subsystem: enemy-cycling, tile-targeting, throw-targeting.
// Owns all targeting state and keyboard/pointer input for target selection.

import { chebyshevScalar, manhattanScalar } from "../../rules/utils/distance.js";
import { forEachInRadius } from "../../rules/utils/spatialIndex.js";
import { hasLOS } from "../../shared/math/gridLOS.js";
import { buildBlocksVisionMap, blockedCallback } from "../../rules/utils/vision.js";
import { Position } from "../../rules/components/Position.js";
import { Faction } from "../../rules/components/Faction.js";
import { Vitality } from "../../rules/components/Vitality.js";
import { TargetLock } from "../../rules/components/TargetLock.js";
import { isVisible as isTileVisible } from "../../rules/environment/dungeon/exploredMap.js";
import { resolveProjectileImpact } from "../../rules/utils/projectileImpact.js";

/**
 * Scan for visible enemies in range of a player position.
 * Returns sorted array (nearest first) suitable for cycling.
 *
 * @param {object} world
 * @param {number} px  player x
 * @param {number} py  player y
 * @param {number} range  Chebyshev range
 * @param {{ playerId?: number, includeSelf?: boolean }} [opts]
 * @returns {Array<{id:number, x:number, y:number}>}
 */
export function scanVisibleEnemies(world, px, py, range, opts = {}) {
  const playerId = opts.playerId ?? 0;
  const blocked = buildBlocksVisionMap(world);
  const isBlocked = blockedCallback(blocked);

  /** @type {Array<{id:number, x:number, y:number}>} */
  const enemies = [];
  if (opts.includeSelf && playerId > 0) {
    enemies.push({ id: playerId, x: px, y: py });
  }
  forEachInRadius(world, px, py, range, (eid, pos) => {
    if (eid === playerId) return;
    const fac = world.get(eid, Faction);
    if (!fac || fac.key !== 'enemy') return;
    const vit = /** @type any */ (world.get(eid, Vitality));
    if (!vit || (vit.hp | 0) <= 0) return;
    if (!hasLOS(px, py, pos.x | 0, pos.y | 0, isBlocked)) return;
    if (!isTileVisible(pos.x | 0, pos.y | 0)) return;
    enemies.push({ id: eid, x: pos.x | 0, y: pos.y | 0 });
  });

  enemies.sort((a, b) => {
    const da = chebyshevScalar(a.x, a.y, px, py);
    const db = chebyshevScalar(b.x, b.y, px, py);
    return da - db;
  });
  return enemies;
}

/**
 * Clamp a tile target to Chebyshev range from an origin.
 */
export function clampTargetToRange(fromX, fromY, toX, toY, maxRange) {
  const ox = Number(fromX) | 0;
  const oy = Number(fromY) | 0;
  const tx = Number(toX) | 0;
  const ty = Number(toY) | 0;
  const range = Math.max(0, Number(maxRange) | 0);

  const dx = tx - ox;
  const dy = ty - oy;
  const dist = chebyshevScalar(ox, oy, tx, ty);
  if (dist <= range || range <= 0) return { x: tx, y: ty };

  const scale = range / Math.max(1, dist);
  const cx = ox + Math.round(dx * scale);
  const cy = oy + Math.round(dy * scale);
  return { x: cx, y: cy };
}

/**
 * Convert world-space coordinate to nearest tile center index.
 */
export function worldToTile(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

/**
 * @param {string} s
 */
export function bracketizeName(s) {
  const str = String(s ?? '');
  if (str.startsWith('[') && str.endsWith(']')) return str;
  return `[${str}]`;
}

// ── Targeting modes ──────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   spellId: string,
 *   spellName: string,
 *   range: number,
 *   radius?: number,
 *   requiresLOS: boolean,
 *   requiresVisible?: boolean,
 *   validateTarget?: (x:number, y:number, ctx:{ player:{id:number,pos:{x:number,y:number}} }) => string | null | undefined | false,
 * }} SpellTargeting
 *
 * @typedef {{
 *   actorId: number,
 *   itemId: number,
 *   itemName: string,
 *   range: number,
 * }} ThrowTargeting
 *
 * @typedef {{
 *   spellId: string,
 *   spellName: string,
 *   range: number,
 *   enemies: Array<{id:number, x:number, y:number}>,
 *   index: number,
 *   onConfirm?: (enemyId: number) => void,
 * }} EnemyTargeting
 *
 * @typedef {{ actorId:number, itemId:number, itemName:string, range:number, isBow?:boolean }} RangedTargeting
 */

/**
 * Create a TargetingController — the single source of truth for all
 * targeting state (spell tiles, thrown items, enemy cycling).
 *
 * @param {object} deps
 * @param {object} deps.world
 * @param {{ log: (entry:{text:string,type:string})=>void }} deps.messageLog
 * @param {() => ({id:number, pos:{x:number,y:number}}|null)} deps.playerEntity
 * @param {(action:object) => void} deps.dispatchRules
 * @param {(x:number, y:number) => boolean} deps.isVisibleAt
 */
export function createTargetingController({ world, messageLog, playerEntity, dispatchRules, isVisibleAt }) {
  /** @type {SpellTargeting|null} */
  let _spell = null;
  /** @type {ThrowTargeting|null} */
  let _throw = null;
  /** @type {EnemyTargeting|null} */
  let _enemy = null;
  /** @type {RangedTargeting|null} */
  let _ranged = null;
  /** @type {{x:number,y:number}|null} */
  let _cursor = null;

  function log(text) {
    try { messageLog.log({ text, type: 'system' }); } catch (e) { console.debug('[targeting] messageLog failed:', e); }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function isActive() { return !!(_spell || _throw || _enemy || _ranged); }
  function getCursor() { return _cursor; }
  function getSpell() { return _spell; }
  function getThrow() { return _throw; }
  function getEnemy() { return _enemy; }
  function getRanged() { return _ranged; }
  function getRangedImpact() {
    if (!_ranged || !_cursor) return null;
    const pe = playerEntity();
    if (!pe) return null;
    const blocked = buildBlocksVisionMap(world);
    const impact = resolveProjectileImpact(
      world,
      { x: pe.pos.x | 0, y: pe.pos.y | 0 },
      _cursor,
      blockedCallback(blocked),
      pe.id,
    );
    return { x: impact.x | 0, y: impact.y | 0, kind: impact.kind };
  }

  function cancelAll() {
    _spell = null;
    _throw = null;
    _enemy = null;
    _ranged = null;
    _cursor = null;
  }

  /**
   * Open enemy-cycling targeting reticle.
   * @param {object} opts
   * @param {string} opts.spellId
   * @param {string} opts.spellName
   * @param {number} opts.range
   * @param {Array<{id:number,x:number,y:number}>} opts.enemies
   * @param {((id:number)=>void)} [opts.onConfirm]
   */
  function openEnemyTargeting({ spellId, spellName, range, enemies, onConfirm }) {
    _enemy = {
      spellId,
      spellName,
      range,
      enemies,
      index: 0,
      onConfirm: onConfirm || null,
    };
    _cursor = enemies.length > 0 ? { x: enemies[0].x, y: enemies[0].y } : null;
    _spell = null;
    _throw = null;
    log(`Choose target for ${spellName}. Tab to cycle enemies, Enter to confirm, Esc to cancel.`);
  }

  function openRangedPointTargeting(opts) {
    _ranged = { ...opts };
    _spell = null;
    _throw = null;
    _enemy = null;
    const pe = playerEntity();
    if (pe) _cursor = { x: pe.pos.x | 0, y: pe.pos.y | 0 };
    log(`Choose a tile for ${bracketizeName(opts.itemName)}. Tap a tile to fire. Esc cancels.`);
  }

  /**
   * Open tile-targeted spell targeting.
   * @param {SpellTargeting} opts
   * @param {string} prompt  e.g. "Choose blink destination..."
   */
  function openSpellTargeting(opts, prompt) {
    _spell = { ...opts };
    _throw = null;
    _enemy = null;
    const pe = playerEntity();
    if (pe) _cursor = { x: pe.pos.x | 0, y: pe.pos.y | 0 };
    log(prompt);
  }

  /**
   * Open throw targeting.
   * @param {ThrowTargeting} opts
   */
  function openThrowTargeting(opts) {
    _throw = { ...opts };
    _spell = null;
    _enemy = null;
    const pe = playerEntity();
    if (pe) _cursor = { x: pe.pos.x | 0, y: pe.pos.y | 0 };
    log(`Throw ${bracketizeName(opts.itemName)} where? Tap/click a tile or use arrow keys + Enter (up to ${opts.range}). Press Esc to cancel.`);
  }

  /**
   * Toggle spell targeting for a spell that's already active → cancel it.
   * Returns true if toggled off.
   */
  function toggleSpellOff(spellId) {
    if (_spell?.spellId === spellId) {
      log(`${_spell.spellName} targeting cancelled.`);
      _spell = null;
      _cursor = null;
      return true;
    }
    return false;
  }

  /**
   * Toggle enemy targeting for a spell that's already cycling → cancel it.
   * Returns true if toggled off.
   */
  function toggleEnemyOff(spellId) {
    if (_enemy?.spellId === spellId) {
      log(`${_enemy.spellName} targeting cancelled.`);
      _enemy = null;
      _cursor = null;
      return true;
    }
    return false;
  }

  // ── Keyboard handling ─────────────────────────────────────────────────────

  function _handleEscape(ev) {
    if (_enemy) {
      log(`${_enemy.spellName} targeting cancelled.`);
      _enemy = null;
      _cursor = null;
      ev.preventDefault();
      return true;
    }
    if (_spell) {
      log(`${_spell.spellName} targeting cancelled.`);
      _spell = null;
      _cursor = null;
      ev.preventDefault();
      return true;
    }
    if (_throw) {
      log(`${bracketizeName(_throw.itemName)} throw cancelled.`);
      _throw = null;
      _cursor = null;
      ev.preventDefault();
      return true;
    }
    if (_ranged) {
      log(`${bracketizeName(_ranged.itemName)} targeting cancelled.`);
      _ranged = null;
      _cursor = null;
      ev.preventDefault();
      return true;
    }
    return false;
  }

  function _handleEnemyKeys(ev) {
    if (!_enemy) return false;

    if (ev.key === 'Tab') {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.shiftKey) {
        _enemy.index = (_enemy.index - 1 + _enemy.enemies.length) % _enemy.enemies.length;
      } else {
        _enemy.index = (_enemy.index + 1) % _enemy.enemies.length;
      }
      const enemy = _enemy.enemies[_enemy.index];
      const livePos = world.get(enemy.id, Position);
      _cursor = livePos ? { x: livePos.x | 0, y: livePos.y | 0 } : { x: enemy.x, y: enemy.y };
      return true;
    }

    if (ev.key === 'Enter') {
      ev.preventDefault();
      ev.stopPropagation();
      const pe = playerEntity();
      if (!pe) { cancelAll(); return true; }
      const enemy = _enemy.enemies[_enemy.index];
      const onConfirm = _enemy.onConfirm;
      const spellId = _enemy.spellId;
      _enemy = null;
      _cursor = null;
      if (typeof onConfirm === 'function') {
        onConfirm(enemy.id);
      } else {
        dispatchRules({
          type: 'rules.castActiveSpell',
          payload: { spellId, targetId: enemy.id, x: enemy.x, y: enemy.y },
        });
      }
      return true;
    }

    // Swallow direction keys so they don't become movement while targeting
    const _DIR_KEYS = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','d','w','s','h','j','k','l','y','u','b','n'];
    if (_DIR_KEYS.includes(ev.key)) {
      ev.preventDefault();
      ev.stopPropagation();
      return true;
    }
    return false;
  }

  function _selectHostileTarget(targetId) {
    const id = Number(targetId || 0) | 0;
    if (!(id > 0)) return false;
    dispatchRules({ type: 'rules.setHostileTarget', payload: { targetId: id } });
    return true;
  }

  function _cycleHostileTarget(reverse = false) {
    const pe = playerEntity();
    if (!pe) return false;
    const enemies = scanVisibleEnemies(world, pe.pos.x | 0, pe.pos.y | 0, 64, { playerId: pe.id });
    if (!enemies.length) {
      log('No visible hostile targets.');
      return true;
    }
    const current = Number(world.get(pe.id, TargetLock)?.targetId || 0) | 0;
    let index = enemies.findIndex((enemy) => enemy.id === current);
    index = reverse ? (index <= 0 ? enemies.length - 1 : index - 1) : (index + 1) % enemies.length;
    if (index < 0) index = reverse ? enemies.length - 1 : 0;
    _selectHostileTarget(enemies[index].id);
    return true;
  }

  function _handleTileKeys(ev) {
    if (_ranged) {
      if (ev.key === 'Tab') {
        ev.preventDefault();
        ev.stopPropagation();
        _ranged = null;
        _cursor = null;
        _cycleHostileTarget(ev.shiftKey);
        return true;
      }
      if (ev.key === 'Enter' || ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','a','d','w','s','h','j','k','l','y','u','b','n'].includes(ev.key)) {
        ev.preventDefault();
        ev.stopPropagation();
        return true;
      }
      return false;
    }
    if (!_spell && !_throw) return false;
    if (!_cursor) return false;

    /** @type {Record<string, number[]>} */
    const KEY_DIR = {
      ArrowLeft:  [-1,  0], ArrowRight: [1,  0],
      ArrowUp:    [ 0, -1], ArrowDown:  [0,  1],
      h: [-1,  0], l: [1,  0], k: [ 0, -1], j: [0,  1],
      y: [-1, -1], u: [1, -1], b: [-1,  1], n: [1,  1],
    };
    const dir = KEY_DIR[ev.key];
    if (dir) {
      const pe = playerEntity();
      if (!pe) return false;
      ev.preventDefault();
      ev.stopPropagation();
      const nx = _cursor.x + dir[0];
      const ny = _cursor.y + dir[1];
      const activeRange = _spell?.range ?? _throw?.range ?? 0;
      const clamped = clampTargetToRange(pe.pos.x, pe.pos.y, nx, ny, activeRange);
      _cursor.x = clamped.x | 0;
      _cursor.y = clamped.y | 0;
      return true;
    }

    if (ev.key === 'Enter') {
      ev.preventDefault();
      ev.stopPropagation();
      const pe = playerEntity();
      if (!pe) { cancelAll(); return true; }
      const tx = _cursor.x | 0;
      const ty = _cursor.y | 0;
      const px = pe.pos.x | 0;
      const py = pe.pos.y | 0;

      if (_spell) {
        const pending = _spell;
        const clamped = clampTargetToRange(px, py, tx, ty, pending.range);
        const finalTx = clamped.x | 0;
        const finalTy = clamped.y | 0;
        const dist = chebyshevScalar(finalTx, finalTy, px, py);
        if (!(dist > 0)) {
          log(`${pending.spellName} needs another tile.`);
          return true;
        }
        if (pending.requiresLOS) {
          const blocked = buildBlocksVisionMap(world);
          const isBlocked = blockedCallback(blocked);
          if (!hasLOS(px, py, finalTx, finalTy, isBlocked)) {
            log(`${pending.spellName} target must be in line of sight.`);
            return true;
          }
        }
        if (pending.requiresVisible && !isVisibleAt(finalTx, finalTy)) {
          log(`${pending.spellName} target must be visible.`);
          return true;
        }
        if (typeof pending.validateTarget === 'function') {
          const message = pending.validateTarget(finalTx, finalTy, { player: pe });
          if (message) {
            log(String(message));
            return true;
          }
        }
        _spell = null;
        _cursor = null;
        if (typeof pending.onConfirm === 'function') {
          pending.onConfirm(finalTx, finalTy);
        } else {
          dispatchRules({ type: 'rules.castActiveSpell', payload: { spellId: pending.spellId, targetId: pe.id, x: finalTx, y: finalTy } });
        }
        return true;
      }

      if (_throw?.itemId) {
        const pending = _throw;
        if ((pending.actorId | 0) !== (pe.id | 0)) { cancelAll(); return true; }
        const clamped = clampTargetToRange(px, py, tx, ty, pending.range);
        const finalTx = clamped.x | 0;
        const finalTy = clamped.y | 0;
        const dist = chebyshevScalar(finalTx, finalTy, px, py);
        if (!(dist > 0)) {
          log(`${bracketizeName(pending.itemName)} must target another tile.`);
          return true;
        }
        _throw = null;
        _cursor = null;
        dispatchRules({ type: 'rules.throwItem', payload: { itemId: pending.itemId, x: finalTx, y: finalTy } });
        return true;
      }
      return true;
    }

    return false;
  }

  // ── Pointer (tap/click) handling ──────────────────────────────────────────

  /**
   * Handle pointer-down on canvas for enemy targeting (tap to select/confirm).
   * @param {number} tapX  world-space tile X
   * @param {number} tapY  world-space tile Y
   * @returns {boolean} true if event was consumed
   */
  function handleEnemyPointer(tapX, tapY) {
    if (!_enemy) return false;
    const pe = playerEntity();
    if (!pe) { cancelAll(); return true; }

    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < _enemy.enemies.length; i++) {
      const e = _enemy.enemies[i];
      const d = manhattanScalar(e.x, e.y, tapX, tapY);
      if (d < bestDist) { bestIdx = i; bestDist = d; }
    }
    if (bestIdx < 0) return true;

    const selected = _enemy.enemies[bestIdx];

    // Tapping already-selected enemy → confirm
    if (_enemy.index === bestIdx) {
      const onConfirm = _enemy.onConfirm;
      const spellId = _enemy.spellId;
      _enemy = null;
      _cursor = null;
      if (typeof onConfirm === 'function') {
        onConfirm(selected.id);
      } else {
        dispatchRules({
          type: 'rules.castActiveSpell',
          payload: { spellId, targetId: selected.id, x: selected.x, y: selected.y },
        });
      }
      return true;
    }

    // Otherwise → select this enemy (snap reticle)
    _enemy.index = bestIdx;
    _cursor = { x: selected.x, y: selected.y };
    return true;
  }

  /**
   * Handle pointer-down on canvas for tile/throw targeting.
   * @param {number} rawTx  world-space tile X
   * @param {number} rawTy  world-space tile Y
   * @returns {boolean} true if event was consumed
   */
  function handleTilePointer(rawTx, rawTy) {
    if (_ranged) {
      const pe = playerEntity();
      if (!pe) { cancelAll(); return true; }
      const pending = _ranged;
      const clamped = clampTargetToRange(pe.pos.x, pe.pos.y, rawTx, rawTy, pending.range);
      const aimedEnemy = pending.isBow
        ? scanVisibleEnemies(world, pe.pos.x | 0, pe.pos.y | 0, pending.range, { playerId: pe.id })
          .find((enemy) => enemy.x === (clamped.x | 0) && enemy.y === (clamped.y | 0))
        : null;
      _ranged = null;
      _cursor = null;
      dispatchRules({
        type: pending.isBow ? 'rules.rangedAttack' : 'rules.useItem',
        payload: pending.isBow
          ? { targetId: aimedEnemy?.id || 0, toX: clamped.x | 0, toY: clamped.y | 0 }
          : { itemId: pending.itemId, targetId: pe.id, x: clamped.x | 0, y: clamped.y | 0 },
      });
      return true;
    }
    if (!_spell && !_throw?.itemId) return false;
    const pe = playerEntity();
    if (!pe) { cancelAll(); return true; }

    if (_spell) {
      const pending = _spell;
      const px = pe.pos.x | 0;
      const py = pe.pos.y | 0;
      const clamped = clampTargetToRange(px, py, rawTx, rawTy, pending.range);
      const tx = clamped.x | 0;
      const ty = clamped.y | 0;
      const dist = chebyshevScalar(tx, ty, px, py);
      if (!(dist > 0)) {
        log(`${pending.spellName} needs another tile.`);
        return true;
      }
      if (pending.requiresLOS) {
        const blocked = buildBlocksVisionMap(world);
        const isBlocked = blockedCallback(blocked);
        if (!hasLOS(px, py, tx, ty, isBlocked)) {
          log(`${pending.spellName} target must be in line of sight.`);
          return true;
        }
      }
      if (pending.requiresVisible && !isVisibleAt(tx, ty)) {
        log(`${pending.spellName} target must be visible.`);
        return true;
      }
      if (typeof pending.validateTarget === 'function') {
        const message = pending.validateTarget(tx, ty, { player: pe });
        if (message) {
          log(String(message));
          return true;
        }
      }
      _spell = null;
      _cursor = null;
      if (typeof pending.onConfirm === 'function') {
        pending.onConfirm(tx, ty);
      } else {
        dispatchRules({
          type: 'rules.castActiveSpell',
          payload: { spellId: pending.spellId, targetId: pe.id, x: tx, y: ty },
        });
      }
      return true;
    }

    if (_throw?.itemId) {
      const pending = _throw;
      if ((pending.actorId | 0) !== (pe.id | 0)) { cancelAll(); return true; }
      const px = pe.pos.x | 0;
      const py = pe.pos.y | 0;
      const clamped = clampTargetToRange(px, py, rawTx, rawTy, pending.range);
      const tx = clamped.x | 0;
      const ty = clamped.y | 0;
      const dist = chebyshevScalar(tx, ty, px, py);
      if (!(dist > 0)) {
        log(`${bracketizeName(pending.itemName)} must target another tile.`);
        return true;
      }
      _throw = null;
      _cursor = null;
      dispatchRules({
        type: 'rules.throwItem',
        payload: { itemId: pending.itemId, x: tx, y: ty },
      });
      return true;
    }

    return false;
  }

  // ── Install keyboard listeners ────────────────────────────────────────────

  function installKeyboardHandlers() {
    addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') _handleEscape(ev);
    });

    addEventListener('keydown', (ev) => {
      if (!_spell && !_throw && !_enemy && !_ranged && ev.key === 'Tab') {
        ev.preventDefault();
        ev.stopPropagation();
        _cycleHostileTarget(ev.shiftKey);
        return;
      }
      if (_handleEnemyKeys(ev)) return;
    }, { capture: true });

    addEventListener('keydown', (ev) => {
      if (_handleTileKeys(ev)) return;
    }, { capture: true });
  }

  /**
   * Install pointer handlers on a canvas element.
   * @param {HTMLCanvasElement} canvas
   * @param {(ev:PointerEvent) => [number,number]} clientToWorld  returns [wx, wy]
   */
  function installPointerHandlers(canvas, clientToWorld) {
    canvas.addEventListener('pointermove', (ev) => {
      if (!_ranged) return;
      const pe = playerEntity();
      if (!pe) return;
      const [wx, wy] = clientToWorld(ev);
      const clamped = clampTargetToRange(pe.pos.x, pe.pos.y, worldToTile(wx), worldToTile(wy), _ranged.range);
      _cursor = { x: clamped.x | 0, y: clamped.y | 0 };
    }, { capture: true });

    canvas.addEventListener('pointerdown', (ev) => {
      if (!_enemy) return;
      const [wx, wy] = clientToWorld(ev);
      const tapX = worldToTile(wx);
      const tapY = worldToTile(wy);
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
      handleEnemyPointer(tapX, tapY);
    }, { capture: true });

    canvas.addEventListener('pointerdown', (ev) => {
      if (!_spell && !_throw?.itemId && !_ranged) return;
      const [wx, wy] = clientToWorld(ev);
      const rawTx = worldToTile(wx);
      const rawTy = worldToTile(wy);
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
      handleTilePointer(rawTx, rawTy);
    }, { capture: true });

    canvas.addEventListener('pointerdown', (ev) => {
      if (isActive()) return;
      const [wx, wy] = clientToWorld(ev);
      const tapX = worldToTile(wx);
      const tapY = worldToTile(wy);
      const pe = playerEntity();
      if (!pe) return;
      const enemies = scanVisibleEnemies(world, pe.pos.x | 0, pe.pos.y | 0, 64, { playerId: pe.id });
      const selected = enemies.find((enemy) => enemy.x === tapX && enemy.y === tapY);
      if (!selected) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
      _selectHostileTarget(selected.id);
    }, { capture: true });
  }

  return {
    // State queries
    isActive,
    getCursor,
    getSpell,
    getThrow,
    getEnemy,
    getRanged,
    getRangedImpact,

    // Actions
    cancelAll,
    openEnemyTargeting,
    openRangedPointTargeting,
    openSpellTargeting,
    openThrowTargeting,
    toggleSpellOff,
    toggleEnemyOff,

    // Pointer events
    handleEnemyPointer,
    handleTilePointer,

    // Installation
    installKeyboardHandlers,
    installPointerHandlers,

    // Utilities (re-exported for consumers)
    scanVisibleEnemies,
    clampTargetToRange,
    worldToTile,
    bracketizeName,
  };
}
