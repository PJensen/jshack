import { children } from "../../lib/ecs-js/index.js";
import { destroySubtree } from "../../lib/ecs-js/hierarchy.js";
import { AffixTopologyNode } from "../components/AffixTopologyNode.js";
import { Equipment, NON_AMMO_GEAR_SLOTS } from "../components/Equipment.js";
import { ItemInfo } from "../components/ItemInfo.js";
import { ProcNode } from "../components/ProcNode.js";
import { getAffixTriggers, getAffixTriggerScripts } from "../data/affixes.js";
import { resolveDerivedStats } from "./derivedStats.js";
import { evaluateProcNode, createProcAccumulator } from "./procEvaluator.js";
import { addAttachedComponent, attachProcNode, gateEventKind } from "./statProcAuthoring.js";

function destroyAffixChildren(world, itemId) {
  const affixChildren = [];
  for (const childId of children(world, itemId)) {
    if (!world.get(childId, AffixTopologyNode)) continue;
    affixChildren.push(childId);
  }
  for (let i = 0; i < affixChildren.length; i++) {
    destroySubtree(world, affixChildren[i]);
  }
}

function attachAffixNode(world, itemId, affixId) {
  return addAttachedComponent(world, itemId, AffixTopologyNode, {
    affixId: String(affixId || ""),
  });
}

export function ensureAffixTopology(world, itemId) {
  const resolvedItemId = Number(itemId || 0) | 0;
  if (!(resolvedItemId > 0) || !world?.isAlive?.(resolvedItemId)) return;
  const info = world.get(resolvedItemId, ItemInfo);
  if (!info) return;

  destroyAffixChildren(world, resolvedItemId);

  const affixes = Array.isArray(info.affixes) ? info.affixes : [];
  for (let i = 0; i < affixes.length; i++) {
    const affixId = String(affixes[i] || "");
    if (!affixId) continue;
    const affixNodeId = attachAffixNode(world, resolvedItemId, affixId);
    const triggers = getAffixTriggers(affixId);
    for (let j = 0; j < triggers.length; j++) {
      const trigger = String(triggers[j] || "");
      if (!trigger) continue;
      const scripts = getAffixTriggerScripts(affixId, trigger);
      for (let k = 0; k < scripts.length; k++) {
        attachProcNode(world, affixNodeId, {
          priority: j * 100 + k,
          gates: [gateEventKind(trigger)],
          script: scripts[k],
        });
      }
    }
  }
}

function gatherItemProcNodes(world, itemId) {
  /** @type {Array<number>} */
  const out = [];
  const stack = [Number(itemId || 0) | 0];
  while (stack.length > 0) {
    const entityId = stack.pop();
    if (!(entityId > 0) || !world.isAlive?.(entityId)) continue;
    if (world.get(entityId, ProcNode)) out.push(entityId);
    for (const childId of children(world, entityId)) stack.push(childId);
  }
  return out;
}

export function ensureEquippedAffixTopology(world, actorId, options = {}) {
  const resolvedActorId = Number(actorId || 0) | 0;
  if (!(resolvedActorId > 0) || !world?.isAlive?.(resolvedActorId)) return;
  const eq = world.get(resolvedActorId, Equipment);
  if (!eq) return;
  const includeSlots = Array.isArray(options.includeSlots) ? new Set(options.includeSlots) : null;
  const excludeSlots = new Set(Array.isArray(options.excludeSlots) ? options.excludeSlots : []);

  for (let i = 0; i < NON_AMMO_GEAR_SLOTS.length; i++) {
    const slot = NON_AMMO_GEAR_SLOTS[i];
    if (includeSlots && !includeSlots.has(slot)) continue;
    if (excludeSlots.has(slot)) continue;
    const itemId = Number(eq[slot] || 0) | 0;
    if (itemId > 0) ensureAffixTopology(world, itemId);
  }
}

export function evaluateEquippedAffixProcs(world, actorId, ctx, options = {}) {
  const resolvedActorId = Number(actorId || 0) | 0;
  const out = options.out || createProcAccumulator();
  if (!(resolvedActorId > 0) || !world?.isAlive?.(resolvedActorId)) return out;

  ensureEquippedAffixTopology(world, resolvedActorId, options);

  const eq = world.get(resolvedActorId, Equipment);
  if (!eq) return out;

  const sourceStats = options.sourceStats || resolveDerivedStats(world, Number(ctx?.source || resolvedActorId) | 0);
  const targetStats = options.targetStats
    || ((Number(ctx?.target || 0) > 0) ? resolveDerivedStats(world, Number(ctx.target) | 0) : {});
  const ctxKind = String(ctx?.kind || "");
  const ctxSource = Number(ctx?.source || 0) | 0;
  const ctxTarget = Number(ctx?.target || 0) | 0;
  const includeSlots = Array.isArray(options.includeSlots) ? new Set(options.includeSlots) : null;
  const excludeSlots = new Set(Array.isArray(options.excludeSlots) ? options.excludeSlots : []);

  // Defensive default: when evaluating on-hit reactions for the damaged actor,
  // do not evaluate weapon procs unless caller explicitly requests includeSlots.
  if (!includeSlots && ctxKind === "onHit" && resolvedActorId === ctxTarget && resolvedActorId !== ctxSource) {
    excludeSlots.add("weapon");
  }

  for (let i = 0; i < NON_AMMO_GEAR_SLOTS.length; i++) {
    const slot = NON_AMMO_GEAR_SLOTS[i];
    if (includeSlots && !includeSlots.has(slot)) continue;
    if (excludeSlots.has(slot)) continue;
    const itemId = Number(eq[slot] || 0) | 0;
    if (!(itemId > 0) || !world.isAlive?.(itemId)) continue;

    const procNodes = gatherItemProcNodes(world, itemId);
    for (let j = 0; j < procNodes.length; j++) {
      evaluateProcNode(world, procNodes[j], { ...ctx, actor: resolvedActorId, item: itemId, slot }, sourceStats, targetStats, out);
    }
  }

  return out;
}

export function evaluateItemProcs(world, actorId, itemId, ctx, options = {}) {
  const resolvedActorId = Number(actorId || 0) | 0;
  const resolvedItemId = Number(itemId || 0) | 0;
  const out = options.out || createProcAccumulator();
  if (!(resolvedActorId > 0) || !(resolvedItemId > 0) || !world?.isAlive?.(resolvedItemId)) return out;

  ensureAffixTopology(world, resolvedItemId);
  const sourceStats = options.sourceStats || resolveDerivedStats(world, Number(ctx?.source || resolvedActorId) | 0);
  const targetStats = options.targetStats || {};
  const procNodes = gatherItemProcNodes(world, resolvedItemId);
  for (let i = 0; i < procNodes.length; i++) {
    evaluateProcNode(world, procNodes[i], {
      ...ctx,
      actor: resolvedActorId,
      item: resolvedItemId,
    }, sourceStats, targetStats, out);
  }
  return out;
}
