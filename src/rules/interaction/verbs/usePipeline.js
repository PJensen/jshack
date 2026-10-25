import { Consumable } from "../../components/Consumable.js";
import { Equipment, getEquippedSlot } from "../../components/Equipment.js";
import { MaterialState } from "../../components/MaterialState.js";
import { findUsePayload } from "../../content/items/usePayloads.js";
import { queueShopDebtForUnauthorizedUse } from "../../utils/shopClaims.js";
import { interceptUseForWaterDamage } from "../../utils/waterExposure.js";
import { getCatalogItem } from "../../data/itemCatalog.js";
import { itemAbilityPipeline } from "./itemAbilityPipeline.js";

/**
 * @param {any} value
 */
function normalizeUseHookResult(value) {
  if (typeof value === "boolean") return { consumed: value };
  if (value && typeof value === "object") {
    return {
      consumed: value.consumed === true,
      cancelled: value.cancelled === true,
      code: value.code,
      message: value.message,
      consumesTurn: value.consumesTurn,
      detail: value.detail,
      spellId: value.spellId,
    };
  }
  return { consumed: false };
}

function shouldCreateShopDebtForUse({ info, identity, hookResult }) {
  if (!hookResult) return false;
  if (String(info?.type || "") === "learn" && hookResult.spellId) return true;
  if (String(identity || "").startsWith("book_") && hookResult.spellId) return true;
  return false;
}

function classifyUnauthorizedUse({ info, identity }) {
  if (String(info?.type || "") === "learn" || String(identity || "").startsWith("book_")) {
    return "knowledge_theft";
  }
  return "unauthorized_use";
}

/**
 * @param {any} ctx
 * @param {any} payload
 * @param {any} state
 */
function runUseHooks(ctx, payload, state) {
  const out = {};
  const phases = [
    ["beforeUse", payload.beforeUse],
    ["onUse", payload.onUse],
    ["afterUse", payload.afterUse],
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
 * Canonical use interaction pipeline.
 * Hook-only note:
 * - Runtime resolves use behavior through payload objects and helper callbacks.
 * - No legacy item-use-def adapter remains in this pipeline.
 * @param {any} ctx
 */
export function usePipeline(ctx) {
  const actor = ctx.actor | 0;
  const itemId = ctx.primary | 0;
  const intent = (ctx.params?.intent && typeof ctx.params.intent === "object")
    ? ctx.params.intent
    : null;

  const metrics = {
    consumed: false,
    payloadMatched: false,
    path: "none",
  };

  if (!(actor > 0) || !(itemId > 0)) {
    ctx.cancel({ code: "USE_GATE_INVALID", message: "Missing actor or item for use action." });
    return { metrics };
  }
  if (!ctx.query.alive(actor)) {
    ctx.cancel({ code: "USE_GATE_NO_ACTOR", message: "Actor is not alive." });
    return { metrics };
  }
  if (!ctx.query.alive(itemId)) {
    ctx.cancel({ code: "USE_GATE_NO_ITEM", message: "Item no longer exists." });
    return { metrics };
  }
  const equippedSlot = getEquippedSlot(ctx.query.get(actor, Equipment), itemId);
  if (!ctx.rules.hasItemInInventory(actor, itemId) && !equippedSlot) {
    ctx.cancel({ code: "USE_GATE_NOT_OWNED", message: "Item is not in inventory." });
    return { metrics };
  }

  const info = ctx.query.itemInfo(itemId);
  const cons = /** @type any */ (ctx.query.get(itemId, Consumable));
  const identity = String(ctx.query.identity(itemId) || "").toLowerCase();
  const state = {
    actor,
    itemId,
    identity,
    info,
    intent,
    consumable: cons,
    materialState: ctx.query.get(itemId, MaterialState),
    effectParams: (cons?.effectParams && typeof cons.effectParams === "object") ? cons.effectParams : {},
  };

  const def = getCatalogItem(identity);
  const abilityId = String(intent?.abilityId || (def?._contentDefaultAbility ? Object.keys(def._contentAbilities || {})[0] : "") || "");
  if (abilityId) {
    const ability = def?._contentAbilities?.[abilityId];
    if (!ability) return ctx.cancel({ code: "ABILITY_UNKNOWN", message: "Unknown item ability.", consumesTurn: false });
    return itemAbilityPipeline(ctx, ability, state, equippedSlot);
  }

  const payload = findUsePayload(state);
  const wetIntercept = interceptUseForWaterDamage(ctx, state);
  if (wetIntercept?.cancelled) {
    ctx.cancel({
      code: String(wetIntercept.code || "USE_CANCELLED"),
      message: String(wetIntercept.message || "Use action cancelled."),
      consumesTurn: wetIntercept.consumesTurn === true,
    });
    return {
      metrics,
      payload: {
        defId: null,
        path: "waterIntercept",
        hookResult: wetIntercept,
      },
    };
  }
  if (wetIntercept?.consumed) {
    ctx.mutate.consume(itemId, actor);
    ctx.io.emit("item:used", { actor, itemId });
    metrics.consumed = true;
    metrics.path = "waterIntercept";
    return {
      metrics,
      payload: {
        defId: null,
        path: "waterIntercept",
        hookResult: wetIntercept,
      },
    };
  }

  if (!payload) {
    return { metrics, payload: { defId: null, path: "none" } };
  }
  metrics.payloadMatched = true;
  metrics.path = String(payload.source || "payload");

  const hookOut = runUseHooks(ctx, payload, state);
  if (!ctx.cancelled) {
    const hookResult = normalizeUseHookResult(hookOut.onUse);
    if (hookResult.cancelled) {
      ctx.cancel({
        code: String(hookResult.code || "USE_CANCELLED"),
        message: String(hookResult.message || "Use action cancelled."),
        consumesTurn: hookResult.consumesTurn === true,
        detail: hookResult.detail,
      });
    }
    if (!ctx.cancelled && shouldCreateShopDebtForUse({ info, identity, hookResult })) {
      queueShopDebtForUnauthorizedUse(ctx, {
        actorId: actor,
        itemId,
        identity,
        reason: classifyUnauthorizedUse({ info, identity }),
      });
    }
    if (!ctx.cancelled && hookResult.consumed) {
      ctx.mutate.consume(itemId, actor);
      ctx.io.emit("item:used", { actor, itemId });
      metrics.consumed = true;
    }
    return {
      metrics,
      payload: {
        defId: String(payload.id || ""),
        path: String(payload.source || "payload"),
        hooks: hookOut,
        hookResult,
      },
    };
  }

  return {
    metrics,
    payload: {
      defId: String(payload.id || ""),
      path: String(payload.source || "payload"),
      hooks: hookOut,
    },
  };
}
