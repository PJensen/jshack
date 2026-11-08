// src/rules/ai/policyAction.js
// Map the neural network's output index → a concrete game intent for a monster.
//
// Action space (14 outputs):
//   0-7   Movement directions (N, NE, E, SE, S, SW, W, NW)
//   8     Wait / hold position
//   9-12  Cast learnedSpells[0-3]
//   13    Use ranged weapon (keeps existing RangedAttackIntent or adds one)
//
// Integration contract:
//   • Called AFTER aiChaseSystem has run.
//   • If entity already has CastSpellIntent the hook already decided — skip.
//   • Movement direction: preserve an existing MoveIntent from aiChaseSystem;
//     otherwise apply the policy-chosen direction.
//   • Spell cast:  remove MoveIntent + add CastSpellIntent + mark cooldown.
//   • Wait (8):    remove MoveIntent (monster holds its position this turn).
//   • Ranged (13): leave existing RangedAttackIntent if present; otherwise pass.

import { MoveIntent }        from '../components/Intents/MoveIntent.js';
import { CastSpellIntent }   from '../components/Intents/CastSpellIntent.js';
import { RangedAttackIntent } from '../components/Intents/RangedAttackIntent.js';
import { Mana }              from '../components/Mana.js';
import { isAiOnCooldown, startAiCooldown } from '../utils/aiCooldowns.js';

// Must match the key used by castSpellOnLOS so cooldowns are shared.
const SPELL_CAST_COOLDOWN_KEY = Symbol.for("jshack:ai:castSpellOnLOS:cooldown");
const POLICY_SPELL_COOLDOWN   = 8; // turns between policy-initiated casts

function spellSlot(actorId, spellId) {
  return `${actorId | 0}:${String(spellId || '')}`;
}

// Ordered direction table: index 0 = N, clockwise.
export const MOVE_DIRS = [
  { dx:  0, dy: -1 }, // 0 N
  { dx:  1, dy: -1 }, // 1 NE
  { dx:  1, dy:  0 }, // 2 E
  { dx:  1, dy:  1 }, // 3 SE
  { dx:  0, dy:  1 }, // 4 S
  { dx: -1, dy:  1 }, // 5 SW
  { dx: -1, dy:  0 }, // 6 W
  { dx: -1, dy: -1 }, // 7 NW
];

export const ACTION_WAIT      = 8;
export const ACTION_SPELL_0   = 9;
export const ACTION_SPELL_MAX = 12; // inclusive
export const ACTION_RANGED    = 13;
export const ACTION_COUNT     = 14;

/**
 * Apply the network's chosen action to the entity.
 * Returns the action index actually applied (may fall back if spell unavailable).
 *
 * @param {any}    world
 * @param {number} actorId
 * @param {number} targetId
 * @param {number} actionIdx   0-13 from argmax(forward())
 * @param {string[]} learnedSpells  brain.learnedSpellIds
 */
export function applyAction(world, actorId, targetId, actionIdx, learnedSpells) {
  // ── Spell cast (9-12) ───────────────────────────────────────────────────────
  if (actionIdx >= ACTION_SPELL_0 && actionIdx <= ACTION_SPELL_MAX) {
    const spellIdx = actionIdx - ACTION_SPELL_0;
    const spellId  = learnedSpells[spellIdx];

    if (spellId) {
      const slot = spellSlot(actorId, spellId);
      const onCooldown = isAiOnCooldown(world, SPELL_CAST_COOLDOWN_KEY, slot);
      const mana = world.get(actorId, Mana);
      const hasMana = !mana || mana.mana >= 8;

      if (!onCooldown && hasMana) {
        // Remove any movement intent before casting
        if (world.has(actorId, MoveIntent)) {
          try { world.remove(actorId, MoveIntent); } catch {}
        }
        try {
          world.add(actorId, CastSpellIntent, { spellId, targetId, x: null, y: null });
          startAiCooldown(world, SPELL_CAST_COOLDOWN_KEY, slot, POLICY_SPELL_COOLDOWN);
          return actionIdx;
        } catch {
          // CastSpellIntent already present (unlikely but guard it)
        }
      }
    }

    // Spell unavailable — fall back to move toward target (actionIdx 4 = S approximation;
    // actual direction is computed in the fallback block below by the caller, but we can
    // return ACTION_WAIT so existing MoveIntent from aiChaseSystem is preserved).
    return ACTION_WAIT; // don't override movement, let chase-system move stand
  }

  // ── Wait / hold (8) ─────────────────────────────────────────────────────────
  if (actionIdx === ACTION_WAIT) {
    if (world.has(actorId, MoveIntent)) {
      try { world.remove(actorId, MoveIntent); } catch {}
    }
    return ACTION_WAIT;
  }

  // ── Ranged (13) ─────────────────────────────────────────────────────────────
  if (actionIdx === ACTION_RANGED) {
    // If aiChaseSystem already set a RangedAttackIntent, leave it.
    // Otherwise policy can't add ranged without weapon validation, so just wait.
    if (!world.has(actorId, RangedAttackIntent)) {
      // Nothing to do; let the turn pass
    }
    return ACTION_RANGED;
  }

  // ── Movement (0-7) ──────────────────────────────────────────────────────────
  if (actionIdx >= 0 && actionIdx <= 7) {
    const dir = MOVE_DIRS[actionIdx];
    if (world.has(actorId, MoveIntent)) {
      return actionIdx;
    }
    try {
      world.add(actorId, MoveIntent, { dx: dir.dx, dy: dir.dy });
    } catch {}
    return actionIdx;
  }

  return actionIdx;
}

/**
 * Argmax helper (re-exported for callers that want it alongside this module).
 * @param {Float64Array} probs
 * @returns {number}
 */
export function argmax(probs) {
  let best = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
  return best;
}
