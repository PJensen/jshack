import { Channeling } from "../../components/Channeling.js";
import { Position } from "../../components/Position.js";
import { defineUseAction } from "./useActionRegistry.js";
import { cookAtFire, cookRecipeAtFire } from "../cooking/cookingGame.js";
import { inventoryContains } from "../../utils/inventoryFacade.js";

export const COOKING_TURNS = 5;
export const COOKING_ACTION_ID = "cooking";

function isAdjacent(world, actorId, targetId) {
  const actor = world.get(actorId, Position);
  const target = world.get(targetId, Position);
  if (!actor || !target) return false;
  return Math.max(Math.abs((actor.x | 0) - (target.x | 0)), Math.abs((actor.y | 0) - (target.y | 0))) <= 1;
}

function completeCooking(world, actorId, channel) {
  const fireId = Number(channel?.targetId || 0) | 0;
  const actionData = channel?.actionData && typeof channel.actionData === "object"
    ? channel.actionData
    : {};

  if (!(fireId > 0) || !world.isAlive(fireId) || !isAdjacent(world, actorId, fireId)) {
    world.emit("cooking:failed", {
      actor: actorId,
      targetId: fireId,
      itemId: Number(actionData.itemId || 0) | 0,
      recipeKey: String(actionData.recipe || ""),
      reason: "fire_unavailable",
    });
    return;
  }

  const recipe = String(actionData.recipe || "").trim().toLowerCase();
  if (recipe) cookRecipeAtFire(world, actorId, fireId, recipe);
  else cookAtFire(world, actorId, fireId, Number(actionData.itemId || 0) | 0);
}

export function startCooking(world, actorId, fireId, { itemId = 0, recipe = "" } = {}) {
  installCookingAction();
  const actor = Number(actorId || 0) | 0;
  const fire = Number(fireId || 0) | 0;
  if (!(actor > 0) || !(fire > 0) || !world.isAlive(fire)) return false;
  const requestedRecipe = String(recipe || "").trim().toLowerCase();
  const requestedItem = Number(itemId || 0) | 0;
  if (!requestedRecipe && (!(requestedItem > 0) || !world.isAlive(requestedItem) || !inventoryContains(world, actor, requestedItem))) {
    world.emit("cooking:failed", { actor, targetId: fire, itemId: requestedItem, reason: "not_owned" });
    return false;
  }
  if (world.has(actor, Channeling) || !isAdjacent(world, actor, fire)) return false;

  const pos = world.get(actor, Position);
  try {
    world.add(actor, Channeling, {
      mode: "cast",
      turnsRemaining: COOKING_TURNS,
      turnsTotal: COOKING_TURNS,
      spellId: "cooking",
      channelId: "cooking",
      itemActionId: COOKING_ACTION_ID,
      targetId: fire,
      actionData: {
        itemId: requestedItem,
        recipe: requestedRecipe,
      },
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
    spellId: "cooking",
    channelId: "cooking",
    channelLabel: "Cooking",
    castTime: COOKING_TURNS,
    mode: "cooking",
    fireId: fire,
  });
  return true;
}

export function installCookingAction() {
  defineUseAction(COOKING_ACTION_ID, { onComplete: completeCooking });
}
