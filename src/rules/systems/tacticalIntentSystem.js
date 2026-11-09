import { MoveIntent } from "../components/Intents/MoveIntent.js";
import { CastSpellIntent } from "../components/Intents/CastSpellIntent.js";
import { RangedAttackIntent } from "../components/Intents/RangedAttackIntent.js";
import { TacticalIntent } from "../components/TacticalIntent.js";

/** Resolve authoritative tactical objectives into existing action intents. */
export function tacticalIntentSystem(world) {
  const now = world.step | 0;
  for (const [id, tactical] of world.query(TacticalIntent)) {
    if (tactical.expiresAtStep <= now) {
      world.remove(id, TacticalIntent);
      continue;
    }

    // Casting and ranged attacks own the action this turn, but the tactical
    // objective remains meaningful until this resolver consumes the decision.
    if (world.has(id, CastSpellIntent) || world.has(id, RangedAttackIntent)) {
      if (world.has(id, MoveIntent)) world.remove(id, MoveIntent);
      world.remove(id, TacticalIntent);
      continue;
    }

    if (world.has(id, MoveIntent)) world.remove(id, MoveIntent);
    if (tactical.kind !== "hold" && (tactical.dx !== 0 || tactical.dy !== 0)) {
      world.add(id, MoveIntent, { dx: tactical.dx, dy: tactical.dy });
    }
    world.remove(id, TacticalIntent);
  }
}
