// rules/systems/intentValidationSystem.js
// Pre-validation pass that strips intents from actors who cannot act.
// Runs first in the 'intents' phase so downstream systems can assume valid actors.
//
// Currently strips intents for:
//   - Dead actors (hp <= 0)
//   - Sleeping actors
//   - Stunned actors (have "stunned" status), except WaitIntent

import { Vitality } from "../components/Vitality.js";
import { MoveIntent } from "../components/Intents/MoveIntent.js";
import { FlyIntent } from "../components/Intents/FlyIntent.js";
import { AttackIntent } from "../components/Intents/AttackIntent.js";
import { AttackDirectionIntent } from "../components/Intents/AttackDirectionIntent.js";
import { WaitIntent } from "../components/Intents/WaitIntent.js";
import { DrinkIntent } from "../components/Intents/DrinkIntent.js";
import { UseIntent } from "../components/Intents/UseIntent.js";
import { ThrowIntent } from "../components/Intents/ThrowIntent.js";
import { ApplyIntent } from "../components/Intents/ApplyIntent.js";
import { EquipIntent } from "../components/Intents/EquipIntent.js";
import { DropIntent } from "../components/Intents/DropIntent.js";
import { PickupIntent } from "../components/Intents/PickupIntent.js";
import { CastSpellIntent } from "../components/Intents/CastSpellIntent.js";
import { RangedAttackIntent } from "../components/Intents/RangedAttackIntent.js";
import { EngraveIntent } from "../components/Intents/EngraveIntent.js";
import { PrayIntent } from "../components/Intents/PrayIntent.js";
import { DisarmIntent } from "../components/Intents/DisarmIntent.js";
import { InteractIntent } from "../components/Intents/InteractIntent.js";
import { SearchIntent } from "../components/Intents/SearchIntent.js";
import { SetPostureIntent } from "../components/Intents/SetPostureIntent.js";
import { Channeling } from "../components/Channeling.js";
import { statusStrength } from "../utils/statusFacade.js";
import { sleepPreventsAction } from "../utils/sleep.js";

/** All intent components that should be stripped when an actor cannot act. */
const ALL_INTENTS = [
  MoveIntent, FlyIntent, AttackIntent, AttackDirectionIntent, WaitIntent, DrinkIntent, UseIntent,
  ThrowIntent, ApplyIntent, EquipIntent, DropIntent, PickupIntent,
  CastSpellIntent, RangedAttackIntent, EngraveIntent, PrayIntent,
  DisarmIntent, InteractIntent, SearchIntent,
  SetPostureIntent,
];

/** Intents stripped while stunned (WaitIntent is allowed to burn the turn). */
const STUNNED_BLOCKED = ALL_INTENTS.filter(c => c !== WaitIntent);

/** Intents stripped during stasis; MoveIntent is retained as an explicit cancellation. */
const STASIS_BLOCKED = ALL_INTENTS.filter(c => c !== WaitIntent && c !== MoveIntent);

/** Intents stripped while rooted (can act but cannot move). */
const ROOTED_BLOCKED = [MoveIntent, FlyIntent];

/** Intents stripped during channeling (everything except WaitIntent). */
const CHANNELING_BLOCKED = ALL_INTENTS.filter(c => c !== WaitIntent);

/**
 * Remove a list of intent components from an entity.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} id
 * @param {readonly any[]} intents
 * @returns {boolean}
 */
function stripIntents(world, id, intents) {
  let removed = false;
  for (let i = 0; i < intents.length; i++) {
    if (world.has(id, intents[i])) {
      try { world.remove(id, intents[i]); } catch {}
      removed = true;
    }
  }
  return removed;
}

/**
 * Remove all intent components from an entity.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} id
 * @returns {boolean}
 */
function stripAllIntents(world, id) {
  return stripIntents(world, id, ALL_INTENTS);
}

/**
 * Mark a queued movement as cancelled while leaving it available for the
 * movement consumer to observe and consume.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} id
 * @param {string} reason
 * @returns {boolean}
 */
function cancelMoveIntent(world, id, reason) {
  const intent = world.get(id, MoveIntent);
  if (!intent) return false;
  if (intent.cancelled === true && intent.cancelReason === reason) return false;
  world.set(id, MoveIntent, {
    ...intent,
    cancelled: true,
    cancelReason: String(reason || "unknown"),
  });
  return true;
}

/**
 * Intent validation system — runs first in the intents phase.
 * Strips invalid intents from actors who are dead or stunned so downstream
 * systems never process actions for incapacitated entities. Stunned actors
 * may only keep WaitIntent, which lets the player explicitly burn the turn.
 *
 * @param {import('../../lib/ecs-js/index.js').World} world
 */
export function intentValidationSystem(world) {
  for (const [id, vit] of world.query(Vitality)) {
    // Dead actors cannot act
    if (vit.hp <= 0) {
      stripAllIntents(world, id);
      continue;
    }

    // Sleeping actors cannot act until a wake event clears the sleep status.
    if (sleepPreventsAction(world, id)) {
      const blocked = stripAllIntents(world, id);
      if (blocked) {
        try {
          world.emit?.("intent:blocked", { actor: id, reason: "asleep" });
        } catch (e) {
          console.debug("[intentValidationSystem] emit intent:blocked failed:", e);
        }
      }
      continue;
    }

    // Stunned actors may only wait
    const stunned = statusStrength(world, id, "stunned") > 0;
    const inStasis = statusStrength(world, id, "stasis") > 0;
    if (stunned) {
      const blocked = stripIntents(world, id, STUNNED_BLOCKED);
      if (blocked) {
        try {
          world.emit?.("intent:blocked", { actor: id, reason: "stunned" });
        } catch (e) {
          console.debug("[intentValidationSystem] emit intent:blocked failed:", e);
        }
      }
      continue;
    }

    // Stasis may only wait. Keep MoveIntent as an explicit cancellation so
    // downstream consumers can observe why the attempted move was rejected.
    if (inStasis) {
      const cancelled = cancelMoveIntent(world, id, "stasis");
      const blocked = stripIntents(world, id, STASIS_BLOCKED) || cancelled;
      if (blocked) {
        try {
          world.emit?.("intent:blocked", { actor: id, reason: "stasis" });
        } catch (e) {
          console.debug("[intentValidationSystem] emit intent:blocked failed:", e);
        }
      }
      continue;
    }

    // Rooted actors can act but cannot move
    const rooted = statusStrength(world, id, "rooted") > 0;
    if (rooted) {
      const blocked = stripIntents(world, id, ROOTED_BLOCKED);
      if (blocked) {
        try {
          world.emit?.("intent:blocked", { actor: id, reason: "rooted" });
        } catch (e) {
          console.debug("[intentValidationSystem] emit intent:blocked failed:", e);
        }
      }
    }

    // Channeling actors can only wait — strip everything else
    if (world.has(id, Channeling)) {
      for (let i = 0; i < CHANNELING_BLOCKED.length; i++) {
        if (world.has(id, CHANNELING_BLOCKED[i])) {
          try { world.remove(id, CHANNELING_BLOCKED[i]); } catch {}
        }
      }
    }
  }
}
