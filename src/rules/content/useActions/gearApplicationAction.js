import { Channeling } from "../../components/Channeling.js";
import { ItemInfo } from "../../components/ItemInfo.js";
import { NamedIdentity } from "../../components/NamedIdentity.js";
import { Position } from "../../components/Position.js";
import { Equipment } from "../../components/Equipment.js";
import { defineChannelAction } from "./useActionRegistry.js";
import { executeInteraction } from "../../interaction/runtime/actionRuntime.js";
import { applyPipeline } from "../../interaction/verbs/applyPipeline.js";
import { inventoryContains } from "../../utils/inventoryFacade.js";
import { resolveApplyPayloadForWorld } from "../items/applyPayloads.js";

export const GEAR_APPLICATION_TURNS = 2;
export const GEAR_APPLICATION_ACTION_ID = "gear_application";

function actorOwnsItem(world, actorId, itemId) {
  if (inventoryContains(world, actorId, itemId)) return true;
  const equipment = world.get(actorId, Equipment);
  return Object.values(equipment || {}).some((value) => (Number(value || 0) | 0) === (itemId | 0));
}

function emitApplyResult(world, result, actor, toolId, targetId) {
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
}

function completeGearApplication(world, actorId, channel) {
  const toolId = Number(channel?.actionData?.toolId || 0) | 0;
  const targetId = Number(channel?.targetId || 0) | 0;
  let result;
  try {
    result = executeInteraction(world, {
      verb: "apply",
      actor: actorId,
      primary: toolId,
      target: targetId,
      params: { intent: { itemId: toolId, targetItemId: targetId } },
      pipeline: applyPipeline,
    });
  } catch (error) {
    result = {
      schemaVersion: 1,
      kind: "interaction",
      verb: "apply",
      actor: actorId,
      primary: toolId,
      target: targetId,
      ok: false,
      canceled: true,
      reason: "RUNTIME_ERROR",
      detail: { message: String(error?.message || error || "unknown runtime error") },
      metrics: { committedOps: 0, emittedEvents: 0 },
      payload: null,
      breadcrumbs: [],
      warnings: [],
    };
  }
  emitApplyResult(world, result, actorId, toolId, targetId);
}

export function startGearApplication(world, actorId, toolId, targetId) {
  installGearApplicationAction();
  const actor = Number(actorId || 0) | 0;
  const tool = Number(toolId || 0) | 0;
  const target = Number(targetId || 0) | 0;
  if (!(actor > 0) || !(tool > 0) || !(target > 0)) return false;
  if (!world.isAlive(tool) || !world.isAlive(target) || world.has(actor, Channeling)) return false;
  if (!actorOwnsItem(world, actor, tool) || !actorOwnsItem(world, actor, target)) return false;
  if (String(world.get(target, ItemInfo)?.type || "") !== "equip") return false;
  const toolIdentity = String(world.get(tool, NamedIdentity)?.identity || "").toLowerCase();
  if (!toolIdentity.startsWith("scroll_enchant_") && toolIdentity !== "potion_oil") return false;
  if (!resolveApplyPayloadForWorld(world, { actor, toolId: tool, targetId: target }).payloadDef) return false;

  const pos = world.get(actor, Position);
  try {
    world.add(actor, Channeling, {
      mode: "cast",
      turnsRemaining: GEAR_APPLICATION_TURNS,
      turnsTotal: GEAR_APPLICATION_TURNS,
      spellId: "gear_application",
      channelId: "applying",
      itemActionId: GEAR_APPLICATION_ACTION_ID,
      targetId: target,
      actionData: { toolId: tool },
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
    spellId: "gear_application",
    channelId: "applying",
    channelLabel: "Applying",
    castTime: GEAR_APPLICATION_TURNS,
    mode: "applying",
    toolId: tool,
    targetId: target,
  });
  return true;
}

export function installGearApplicationAction() {
  defineChannelAction(GEAR_APPLICATION_ACTION_ID, { onComplete: completeGearApplication });
}
