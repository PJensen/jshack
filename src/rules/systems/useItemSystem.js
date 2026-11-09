import { UseIntent } from "../components/Intents/UseIntent.js";
import { startFoodEating } from "../content/useActions/foodEatingAction.js";
import { ItemInfo } from "../components/ItemInfo.js";
import { executeInteraction } from "../interaction/runtime/actionRuntime.js";
import { usePipeline } from "../interaction/verbs/usePipeline.js";
/** @typedef {import('../../lib/ecs-js/index.js').World} World */

/**
 * useItemSystem — resolves UseIntent for generic item use.
 *
 * Runtime migration: UseIntent now resolves through Action Runtime + use pipeline.
 */

/**
 * @param {World} world
 */
export function useItemSystem(world) {
  for (const [actor, intent] of world.query(UseIntent)) {
    const itemId = intent.itemId | 0;
    if (String(world.get(itemId, ItemInfo)?.type || "").toLowerCase() === "food") {
      if (startFoodEating(world, actor, itemId)) {
        try { world.remove(actor, UseIntent); } catch {}
        continue;
      }
    }
    let result = null;
    try {
      result = executeInteraction(world, {
        verb: "use",
        actor,
        primary: itemId,
        target: intent.targetId | 0,
        params: { intent },
        pipeline: usePipeline,
      });
    } catch (error) {
      result = {
        schemaVersion: 1,
        kind: "interaction",
        verb: "use",
        actor,
        primary: itemId,
        target: intent.targetId | 0,
        ok: false,
        canceled: true,
        reason: "RUNTIME_ERROR",
        detail: { message: String(error?.message || error || "unknown runtime error") },
        metrics: { committedOps: 0, emittedEvents: 0 },
        payload: null,
        breadcrumbs: [],
        warnings: [{ code: "runtime:error", detail: { message: String(error?.message || error || "") } }],
      };
    }

    if (result?.canceled && typeof result.reason === "string" && !result.reason.startsWith("USE_GATE_")) {
      const detail = result?.detail && typeof result.detail === "object" ? result.detail : {};
      world.emit("item:use-cancelled", {
        actor,
        itemId,
        code: detail?.code || result.reason,
        message: detail?.message,
        consumesTurn: detail?.consumesTurn,
      });
    }

    world.emit("interaction:result", result);
    try { world.remove(actor, UseIntent); } catch {} // ECS: may not exist
  }
}
