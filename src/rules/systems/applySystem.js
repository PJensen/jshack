import { ApplyIntent } from "../components/Intents/ApplyIntent.js";
import { startGearApplication } from "../content/useActions/gearApplicationAction.js";
import { executeInteraction } from "../interaction/runtime/actionRuntime.js";
import { applyPipeline } from "../interaction/verbs/applyPipeline.js";
/** @typedef {import('../../lib/ecs-js/index.js').World} World */

/**
 * applySystem — resolves ApplyIntent for applying a tool item to a target item.
 *
 * Runtime migration: ApplyIntent now resolves through Action Runtime + apply pipeline.
 * @param {World} world
 */
export function applySystem(world) {
  for (const [actor, intent] of world.query(ApplyIntent)) {
    const toolId = intent.itemId | 0;
    const targetId = intent.targetItemId | 0;
    if (startGearApplication(world, actor, toolId, targetId)) {
      try { world.remove(actor, ApplyIntent); } catch {}
      continue;
    }
    let result = null;
    try {
      result = executeInteraction(world, {
        verb: "apply",
        actor,
        primary: toolId,
        target: targetId,
        params: { intent },
        pipeline: applyPipeline,
      });
    } catch (error) {
      result = {
        schemaVersion: 1,
        kind: "interaction",
        verb: "apply",
        actor,
        primary: toolId,
        target: targetId,
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

    if (result?.canceled && typeof result.reason === "string" && !result.reason.startsWith("APPLY_GATE_")) {
      const detail = result?.detail && typeof result.detail === "object" ? result.detail : {};
      world.emit("item:apply-cancelled", {
        actor,
        toolId,
        targetId,
        code: detail?.code || result.reason,
        message: detail?.message,
        consumesTurn: detail?.consumesTurn,
      });
    }

    world.emit("interaction:result", result);
    try { world.remove(actor, ApplyIntent); } catch {} // ECS: may not exist
  }
}
