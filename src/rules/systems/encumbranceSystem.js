import { Inventory } from "../components/Inventory.js";
import { Encumbrance } from "../components/Encumbrance.js";
import { getCarriedWeight } from "../utils/inventoryFacade.js";
import { getCarryCapacity, resolveEncumbrance } from "../utils/encumbrance.js";
import { applyStatusEffect, removeStatusEffect } from "../utils/effects.js";
import { StatusEffectNode } from "../components/StatusEffectNode.js";
import { descendantsWith } from "../utils/topology.js";

function syncEncumberedStatus(world, actorId, active) {
  if (active) {
    let hasStatus = false;
    for (const [, node] of descendantsWith(world, actorId, StatusEffectNode)) {
      if (String(node?.key || "").trim().toLowerCase() === "encumbered") {
        hasStatus = true;
        break;
      }
    }
    if (!hasStatus) applyStatusEffect(world, actorId, { key: "encumbered", turnsLeft: Infinity, sourceKind: "encumbrance" });
    return;
  }
  removeStatusEffect(world, actorId, "encumbered");
}

/**
 * Recomputes Encumbrance from the authoritative inventory-root weight.
 *
 * current       = total carried weight of the inventory root subtree.
 * limit         = effective max stamina * tunable kg-per-stamina multiplier.
 *
 * Both flags are false when limit is null/0 (unlimited carry).
 *
 * Phase: effects (runs after equipmentSystem so gear changes are committed).
 */
export function encumbranceSystem(world) {
  for (const [id, , enc] of world.query(Inventory, Encumbrance)) {
    const current = getCarriedWeight(world, id);
    enc.current = current;

    const state = resolveEncumbrance(current, getCarryCapacity(world, id));
    enc.limit = state.limit;
    enc.hardLimit = state.hardLimit;
    enc.loadRatio = state.loadRatio;
    enc.overloaded = state.overloaded;
    enc.heavilyLoaded = state.heavilyLoaded;
    syncEncumberedStatus(world, id, state.heavilyLoaded || state.overloaded);
  }
}
