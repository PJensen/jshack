import { Channeling } from "../../components/Channeling.js";
import { ItemInfo } from "../../components/ItemInfo.js";
import { Position } from "../../components/Position.js";
import { executeInteraction } from "../../interaction/runtime/actionRuntime.js";
import { usePipeline } from "../../interaction/verbs/usePipeline.js";
import { inventoryContains } from "../../utils/inventoryFacade.js";
import { defineUseAction } from "./useActionRegistry.js";

export const FOOD_EATING_TURNS = 5;
export const FOOD_EATING_ACTION_ID = "food_eating";

function isFood(world, itemId) {
  return String(world.get(itemId, ItemInfo)?.type || "").toLowerCase() === "food";
}

function completeFoodEating(world, actorId, channel) {
  const itemId = Number(channel?.targetId || 0) | 0;
  if (!world.isAlive(itemId) || !inventoryContains(world, actorId, itemId) || !isFood(world, itemId)) {
    world.emit("item:use-cancelled", {
      actor: actorId,
      itemId,
      code: "FOOD_NO_LONGER_AVAILABLE",
      message: "The food is no longer available.",
      consumesTurn: false,
    });
    return;
  }

  const result = executeInteraction(world, {
    verb: "use",
    actor: actorId,
    primary: itemId,
    target: actorId,
    params: { intent: { itemId, targetId: actorId } },
    pipeline: usePipeline,
  });
  if (result?.canceled && typeof result.reason === "string" && !result.reason.startsWith("USE_GATE_")) {
    const detail = result?.detail && typeof result.detail === "object" ? result.detail : {};
    world.emit("item:use-cancelled", {
      actor: actorId,
      itemId,
      code: detail?.code || result.reason,
      message: detail?.message,
      consumesTurn: detail?.consumesTurn,
    });
  }
  world.emit("interaction:result", result);
}

export function startFoodEating(world, actorId, itemId) {
  installFoodEatingAction();
  const actor = Number(actorId || 0) | 0;
  const item = Number(itemId || 0) | 0;
  if (!(actor > 0) || !(item > 0) || !world.isAlive(item)) return false;
  if (!isFood(world, item) || !inventoryContains(world, actor, item)) return false;
  if (world.has(actor, Channeling)) return false;

  const pos = world.get(actor, Position);
  try {
    world.add(actor, Channeling, {
      mode: "cast",
      turnsRemaining: FOOD_EATING_TURNS,
      turnsTotal: FOOD_EATING_TURNS,
      spellId: "food_eating",
      channelId: "eating",
      itemActionId: FOOD_EATING_ACTION_ID,
      targetId: item,
      breakOnMove: true,
      breakOnDamage: true,
      anchorX: pos ? (pos.x | 0) : null,
      anchorY: pos ? (pos.y | 0) : null,
    });
  } catch {
    return false;
  }

  world.emit("channeling:start", {
    actor,
    spellId: "food_eating",
    channelId: "eating",
    channelLabel: "Eating",
    mode: "food",
    castTime: FOOD_EATING_TURNS,
    itemId: item,
  });
  return true;
}

export function installFoodEatingAction() {
  defineUseAction(FOOD_EATING_ACTION_ID, {
    onComplete: completeFoodEating,
  });
}
