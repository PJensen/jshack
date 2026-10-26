import { Equipment, getEquippedSlot } from "../components/Equipment.js";
import { Inventory } from "../components/Inventory.js";
import { Player } from "../components/Player.js";
import { dealDamage } from "../utils/dealDamage.js";
import { applyProcAccumulator } from "../utils/procApplication.js";
import { evaluateItemProcs } from "../utils/affixTopology.js";
import { inventoryItems } from "../utils/inventoryFacade.js";

function evaluate(world, actorId, itemId, kind) {
  const out = evaluateItemProcs(world, actorId, itemId, {
    kind,
    source: actorId,
    target: actorId,
    scratch: {},
  });
  applyProcAccumulator(world, out, { applyDamage: dealDamage });
}

/** Evaluate topology-backed item behavior for carried and equipped items. */
export function itemProcTickSystem(world) {
  for (const [actorId] of world.query(Player, Inventory)) {
    const equipment = world.get(actorId, Equipment);
    const items = inventoryItems(world, actorId);
    for (let i = 0; i < items.length; i++) {
      const itemId = items[i];
      evaluate(world, actorId, itemId, "onTurnWhileCarried");
      if (getEquippedSlot(equipment, itemId)) {
        evaluate(world, actorId, itemId, "onTurnWhileEquipped");
      }
    }
  }
}
