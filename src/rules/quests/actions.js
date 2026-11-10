import { QuestState } from "../components/QuestState.js";
import { QuestVars } from "../components/QuestVars.js";
import { QuestLog } from "../components/QuestLog.js";
import { createItemById } from "../utils/itemFactory.js";
import { addToInventory } from "../utils/inventoryFacade.js";
import { listQuestRewardBonusItems, listQuestRewardOptions } from "./rewardOptions.js";

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
  return listQuestRewardOptions(ctx.def, ctx.vars);
}

export function isSelectedReward(ctx) {
  const rewardId = String(ctx.payload?.rewardId || "");
  return ctx.def?.journal?.rewardChoice === true
    && rewardOptions(ctx).some((option) => option.id === rewardId || option.items.some((item) => item.itemId === rewardId))
    && !ctx.vars?.rewardGranted;
}

export function grantSelectedReward() {
  return (ctx) => {
    const rewardId = String(ctx.payload?.rewardId || "");
    const option = rewardOptions(ctx).find((entry) => entry.id === rewardId || entry.items.some((item) => item.itemId === rewardId));
    if (!option) return false;
    const playerId = Number(ctx.bind.player || 0) | 0;
    const granted = [];
    const itemsToGrant = [...option.items, ...listQuestRewardBonusItems(ctx.def, ctx.vars)];
    for (const item of itemsToGrant) {
      const itemId = createItemById(ctx.world, item.itemId, { count: item.count });
      if (!(itemId > 0) || !addToInventory(ctx.world, playerId, itemId)) {
        if (itemId > 0) {
          try { ctx.world.destroy(itemId); } catch {}
        }
        for (const grantedId of granted) {
          try { ctx.world.destroy(grantedId); } catch {}
        }
        return false;
      }
      granted.push(itemId);
    }
    const gold = Math.max(0, Number(ctx.def?.journal?.rewardGold || ctx.vars?.rewardGold || 0) | 0);
    if (gold > 0) {
      const goldId = createItemById(ctx.world, "gold", { count: gold });
      if (goldId > 0) addToInventory(ctx.world, playerId, goldId);
    }
    const rec = ctx.world.get(ctx.qid, QuestVars);
    ctx.world.set(ctx.qid, QuestVars, {
      data: { ...(rec?.data || {}), rewardChoice: option.id, rewardGranted: true },
    });
    return true;
  };
}
