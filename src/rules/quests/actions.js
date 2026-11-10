import { QuestState } from "../components/QuestState.js";
import { QuestVars } from "../components/QuestVars.js";
import { QuestLog } from "../components/QuestLog.js";
import { createItemById } from "../utils/itemFactory.js";
import { addToInventory } from "../utils/inventoryFacade.js";

function cloneData(data) {
  if (!data || typeof data !== "object") return {};
  return { ...data };
}

export function setVar(key, valueOrFn) {
  return (ctx) => {
    const rec = ctx.world.get(ctx.qid, QuestVars);
    const data = cloneData(rec?.data);
    data[key] = typeof valueOrFn === "function" ? valueOrFn(ctx) : valueOrFn;
    ctx.world.set(ctx.qid, QuestVars, { data });
  };
}

export function incVar(key, amount = 1) {
  return (ctx) => {
    const rec = ctx.world.get(ctx.qid, QuestVars);
    const data = cloneData(rec?.data);
    const delta = typeof amount === "function" ? Number(amount(ctx) || 0) : Number(amount || 0);
    data[key] = Number(data[key] || 0) + delta;
    ctx.world.set(ctx.qid, QuestVars, { data });
  };
}

export function emit(eventName, payloadOrFn = undefined) {
  return (ctx) => {
    const payload = typeof payloadOrFn === "function" ? payloadOrFn(ctx) : payloadOrFn;
    ctx.world.emit?.(eventName, payload);
  };
}

export function setStatus(status) {
  return (ctx) => {
    const state = ctx.world.get(ctx.qid, QuestState);
    if (!state) return;
    ctx.world.set(ctx.qid, QuestState, {
      ...state,
      status: String(status || state.status || "active"),
    });
  };
}

export function noteError(message) {
  return (ctx) => {
    const log = ctx.world.get(ctx.qid, QuestLog);
    if (!log) return;
    ctx.world.set(ctx.qid, QuestLog, {
      ...log,
      lastError: String(typeof message === "function" ? message(ctx) : message || ""),
    });
  };
}

function rewardOptions(ctx) {
  const authored = Array.isArray(ctx.def?.journal?.rewardItems)
    ? ctx.def.journal.rewardItems.filter((item) => item?.itemId)
    : [];
  if (authored.length > 0) return authored;
  return (Array.isArray(ctx.def?.journal?.rewardItemIds) ? ctx.def.journal.rewardItemIds : [])
    .map((itemId) => ({ itemId }));
}

export function isSelectedReward(ctx) {
  const rewardId = String(ctx.payload?.rewardId || "");
  return ctx.def?.journal?.rewardChoice === true
    && rewardOptions(ctx).some((option) => String(option.itemId || "") === rewardId)
    && !ctx.vars?.rewardGranted;
}

export function grantSelectedReward() {
  return (ctx) => {
    const rewardId = String(ctx.payload?.rewardId || "");
    const option = rewardOptions(ctx).find((entry) => String(entry.itemId || "") === rewardId);
    if (!option) return false;
    const itemId = createItemById(ctx.world, rewardId, { count: Math.max(1, Number(option.count || 1) | 0) });
    if (!(itemId > 0) || !addToInventory(ctx.world, Number(ctx.bind.player || 0) | 0, itemId)) {
      if (itemId > 0) {
        try { ctx.world.destroy(itemId); } catch {}
      }
      return false;
    }
    const gold = Math.max(0, Number(ctx.def?.journal?.rewardGold || ctx.vars?.rewardGold || 0) | 0);
    if (gold > 0) {
      const goldId = createItemById(ctx.world, "gold", { count: gold });
      if (goldId > 0) addToInventory(ctx.world, Number(ctx.bind.player || 0) | 0, goldId);
    }
    const rec = ctx.world.get(ctx.qid, QuestVars);
    ctx.world.set(ctx.qid, QuestVars, {
      data: { ...(rec?.data || {}), rewardChoice: rewardId, rewardGranted: true },
    });
    return true;
  };
}
