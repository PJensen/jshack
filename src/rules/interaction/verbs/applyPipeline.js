import { resolveApplyPayload } from "../../content/items/applyPayloads.js";
import { Equipment, getEquippedSlot } from "../../components/Equipment.js";

/**
 * @param {any} value
 */
function normalizeApplyHookResult(value) {
  if (typeof value === "boolean") return { applied: value, consumedTool: false };
  if (value && typeof value === "object") {
    return {
      applied: value.applied === true,
      consumedTool: value.consumedTool === true,
      resultType: value.resultType,
    };
  }
  return { applied: false, consumedTool: false };
}

/**
 * @param {any} ctx
 * @param {any} def
 * @param {any} state
 */
function runApplyHooks(ctx, def, state) {
  const out = {};
  const phases = [
    ["beforeApply", def.beforeApply],
    ["onApply", def.onApply],
    ["afterApply", def.afterApply],
  ];
  for (let i = 0; i < phases.length; i++) {
    const [phase, fn] = phases[i];
    if (typeof fn !== "function") continue;
    out[phase] = fn(ctx, state);
    if (ctx.cancelled) break;
  }
  return out;
}

/**
 * Canonical apply interaction pipeline.
 * Hook-only note:
 * - Runtime resolves apply behavior through payload hooks in content defs.
 * - No legacy apply-def callback adapter remains in this pipeline.
 * @param {any} ctx
 */
export function applyPipeline(ctx) {
  const actor = ctx.actor | 0;
  const toolId = ctx.primary | 0;
  const targetId = ctx.target | 0;

  const metrics = {
    applied: false,
    payloadMatched: false,
    path: "none",
    consumedTool: false,
  };

  if (!(actor > 0) || !(toolId > 0) || !(targetId > 0)) {
    ctx.cancel({ code: "APPLY_GATE_INVALID", message: "Missing actor/tool/target for apply action." });
    return { metrics };
  }
  if (!ctx.query.alive(actor)) {
    ctx.cancel({ code: "APPLY_GATE_NO_ACTOR", message: "Actor is not alive." });
    return { metrics };
  }
  if (!ctx.query.alive(toolId) || !ctx.query.alive(targetId)) {
    ctx.cancel({ code: "APPLY_GATE_MISSING_ITEM", message: "Tool or target item no longer exists." });
    return { metrics };
  }
  const targetEquippedSlot = getEquippedSlot(ctx.query.get(actor, Equipment), targetId);
  if (!ctx.rules.hasItemInInventory(actor, toolId) || (!ctx.rules.hasItemInInventory(actor, targetId) && !targetEquippedSlot)) {
    ctx.cancel({ code: "APPLY_GATE_NOT_OWNED", message: "Tool and target must both be in inventory." });
    return { metrics };
  }

  const { state, payloadDef } = resolveApplyPayload(ctx.query, {
    actor,
    toolId,
    targetId,
  });
  if (payloadDef) {
    metrics.payloadMatched = true;
    metrics.path = "payload";
    const hookOut = runApplyHooks(ctx, payloadDef, state);
    if (ctx.cancelled) {
      return {
        metrics,
        payload: {
          defId: String(payloadDef.id || ""),
          hooks: hookOut,
        },
      };
    }

    const hookResult = normalizeApplyHookResult(hookOut.onApply);
    metrics.applied = hookResult.applied;
    metrics.consumedTool = hookResult.consumedTool;
    if (hookResult.consumedTool) {
      ctx.mutate.consume(toolId, actor);
      ctx.io.emit("item:used", { actor, itemId: toolId });
    }

    return {
      metrics,
      payload: {
        defId: String(payloadDef.id || ""),
        hooks: hookOut,
        hookResult,
      },
    };
  }
  return { metrics, payload: { defId: null, path: "none" } };
}
