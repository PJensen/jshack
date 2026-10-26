import { TargetLock } from "../components/TargetLock.js";
import { Faction } from "../components/Faction.js";
import { Vitality } from "../components/Vitality.js";

/** Clear persistent hostile locks whose target no longer exists or is hostile. */
export function targetLockSystem(world) {
  for (const [actor, lock] of world.query(TargetLock)) {
    const targetId = Number(lock?.targetId || 0) | 0;
    const vit = targetId > 0 ? world.get(targetId, Vitality) : null;
    const faction = targetId > 0 ? world.get(targetId, Faction) : null;
    if (!(targetId > 0) || !world.isAlive(targetId) || !vit || (vit.hp | 0) <= 0 || faction?.key !== "enemy") {
      world.remove(actor, TargetLock);
    }
  }
}
