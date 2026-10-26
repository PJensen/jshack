import { children } from "../../lib/ecs-js/index.js";
import { ActivationGate } from "../components/ActivationGate.js";
import { CreatureType } from "../components/CreatureType.js";
import { Faction } from "../components/Faction.js";
import { ItemInfo } from "../components/ItemInfo.js";
import { Mana } from "../components/Mana.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { ProcEffect } from "../components/ProcEffect.js";
import { ProcNode } from "../components/ProcNode.js";
import { Position } from "../components/Position.js";
import { ScriptState } from "../components/ScriptState.js";
import { Stamina } from "../components/Stamina.js";
import { Status } from "../components/Status.js";
import { Vitality } from "../components/Vitality.js";
import { runEntityScript, ScriptVerb } from "../scripting.js";
import { gatherStatTopology, resolveDerivedStats } from "./derivedStats.js";
import { forEachInRadius } from "./spatialIndex.js";

function compareByPriorityThenId(a, b) {
  return Number(a.record.priority || 0) - Number(b.record.priority || 0)
    || a.entityId - b.entityId;
}

function gatherDirectChildrenWith(world, parentId, Comp) {
  /** @type {Array<{entityId:number, record:any}>} */
  const out = [];
  for (const childId of children(world, parentId)) {
    const record = world.get(childId, Comp);
    if (!record || record.enabled === false) continue;
    out.push({ entityId: childId, record });
  }
  out.sort(compareByPriorityThenId);
  return out;
}

function getHealthPct(world, entityId) {
  const vit = world.get(entityId, Vitality);
  if (!vit || !(Number(vit.maxHp) > 0)) return 1;
  return Number(vit.hp || 0) / Number(vit.maxHp || 1);
}

function hasSemanticTag(world, entityId, tag) {
  const wanted = String(tag || "");
  if (!wanted) return false;

  const creatureType = world.get(entityId, CreatureType);
  if (String(creatureType?.type || "") === wanted) return true;

  const itemInfo = world.get(entityId, ItemInfo);
  if (String(itemInfo?.type || "") === wanted || String(itemInfo?.slot || "") === wanted) return true;

  const identity = world.get(entityId, NamedIdentity);
  if (String(identity?.identity || "") === wanted) return true;

  const status = world.get(entityId, Status);
  if (Array.isArray(status?.statuses) && status.statuses.some((entry) => String(entry?.type || "") === wanted)) {
    return true;
  }

  return false;
}

function chancePasses(world, value) {
  const chance = Math.max(0, Math.min(1, Number(value || 0)));
  if (chance <= 0) return false;
  if (chance >= 1) return true;
  return world.rand() < chance;
}

export function createProcAccumulator() {
  return {
    bonusDamage: [],
    bonusCritChance: 0,
    statusesToApply: [],
    buffsToAttach: [],
    resourcesToRestore: [],
    vitalityToRestore: [],
    directDamage: [],
    spawnedEntities: [],
    chargesToConsume: [],
    cancelled: false,
    messages: [],
    presentations: [],
    lightEvents: [],
  };
}

function createProcScriptApi(world, out, procNodeId, ctx) {
  return Object.freeze({
    addBonusDamage(min, max = min, type = "physical") {
      out.bonusDamage.push({
        source: procNodeId,
        min: Number(min || 0),
        max: Number(max || min || 0),
        type: String(type || "physical"),
      });
    },
    addCritChance(amount) {
      out.bonusCritChance += Number(amount || 0);
    },
    restoreResource(target, resource, amount) {
      out.resourcesToRestore.push({
        source: procNodeId,
        target: Number(target || 0),
        resource: String(resource || ""),
        amount: Number(amount || 0),
      });
    },
    applyStatus(target, key, turnsLeft, potency = 1) {
      out.statusesToApply.push({
        source: procNodeId,
        target: Number(target || 0),
        status: {
          key: String(key || ""),
          turnsLeft: Math.max(0, Number(turnsLeft || 0)),
          potency: Number(potency || 1),
        },
      });
    },
    attachTimedBuff(target, buff, duration) {
      out.buffsToAttach.push({
        source: procNodeId,
        target: Number(target || 0),
        buff: String(buff || ""),
        duration: Math.max(0, Number(duration || 0)),
      });
    },
    spawnEntity(kind, count = 1, anchor = "target") {
      out.spawnedEntities.push({
        source: procNodeId,
        kind: String(kind || ""),
        count: Math.max(1, Number(count || 1)),
        anchor: String(anchor || "target"),
      });
    },
    consumeCharge(entityId, amount = 1) {
      out.chargesToConsume.push({
        source: procNodeId,
        entityId: Number(entityId || 0),
        amount: Math.max(1, Number(amount || 1)),
      });
    },
    heal(target, amount) {
      out.vitalityToRestore.push({
        source: procNodeId,
        target: Number(target || 0),
        amount: Number(amount || 0),
      });
    },
    dealDamage(target, amount, type = "physical", options = {}) {
      out.directDamage.push({
        source: Number(options.source || ctx?.source || 0) | 0,
        target: Number(target || 0),
        amount: Number(amount || 0),
        type: String(type || "physical"),
        cause: String(options.cause || "proc"),
        bypassResist: !!options.bypassResist,
        bypassInvuln: !!options.bypassInvuln,
        noTrigger: !!options.noTrigger,
        nonLethal: !!options.nonLethal,
        offhand: !!options.offhand,
        at: options.at || undefined,
      });
    },
    cancel() {
      out.cancelled = true;
    },
    message(text, type = "system") {
      out.messages.push({ source: procNodeId, text: String(text || ""), type: String(type || "system") });
    },
    getState(entityId = ctx?.item || ctx?.source) {
      const state = world.get(Number(entityId || 0) | 0, ScriptState);
      return state?.data && typeof state.data === "object" ? { ...state.data } : {};
    },
    setState(patch, entityId = ctx?.item || ctx?.source) {
      const id = Number(entityId || 0) | 0;
      if (!(id > 0) || !world.isAlive?.(id) || !patch || typeof patch !== "object") return;
      const state = world.get(id, ScriptState);
      if (!state) return;
      world.set(id, ScriptState, { data: { ...state.data, ...patch } });
    },
    hasTag(entityId, tag) {
      return hasSemanticTag(world, Number(entityId || 0) | 0, tag);
    },
    roll(sides = 1) {
      const count = Math.max(1, Number(sides || 1) | 0);
      return 1 + Math.floor((typeof world.rand === "function" ? world.rand() : 0) * count);
    },
    present(id, payload = {}) {
      out.presentations.push({
        source: procNodeId,
        entity: Number(payload.target ?? payload.entity ?? ctx?.source ?? 0) | 0,
        id: String(id || ""),
        identity: String(world.get(Number(ctx?.item || 0) | 0, NamedIdentity)?.identity || ""),
        payload: { ...payload, user: Number(ctx?.source || 0) | 0, target: Number(ctx?.target || 0) | 0, item: Number(ctx?.item || 0) | 0 },
      });
    },
    entitiesInRadius(center, radius, filter = {}) {
      const centerPos = typeof center === "number"
        ? world.get(Number(center || 0) | 0, Position)
        : center;
      if (!centerPos) return [];
      const result = [];
      forEachInRadius(world, centerPos.x | 0, centerPos.y | 0, radius, (entityId) => {
        if (typeof center === "number" && entityId === (Number(center) | 0)) return;
        if (filter?.tag && !hasSemanticTag(world, entityId, filter.tag)) return;
        if (filter?.faction && String(world.get(entityId, Faction)?.key || "") !== String(filter.faction)) return;
        result.push(entityId);
      });
      return result;
    },
    light(entityId, radius, opts = {}) {
      const resolvedEntity = Number(entityId || ctx?.source || 0) | 0;
      const identity = String(world.get(Number(ctx?.item || 0) | 0, NamedIdentity)?.identity || "");
      const temporal = opts.temporal && typeof opts.temporal === "object" ? opts.temporal : null;
      const pattern = temporal ? `_proc_${identity}_${resolvedEntity}` : String(opts.pattern || "holy");
      out.lightEvents.push({
        entity: resolvedEntity,
        radius: Number(radius || 0),
        color: String(opts.color || "#fff5c8"),
        pattern,
        softness: Number(opts.softness || 10),
        temporal,
      });
    },
    emit(name, payload = {}) {
      try {
        world.emit?.(String(name || ""), payload);
      } catch {
        // keep proc evaluation deterministic and side-effect bounded
      }
    },
  });
}

function runProcNodeScript(world, procNodeId, ctx, sourceStats, targetStats, out) {
  return runEntityScript(world, procNodeId, ScriptVerb.ProcEvaluate, {
    ...ctx,
    procNodeId,
    event: ctx,
    ctx,
    sourceStats,
    targetStats,
    out,
    proc: createProcScriptApi(world, out, procNodeId, ctx),
  });
}

export function gatherProcNodes(world, actorId) {
  const topology = gatherStatTopology(world, actorId);
  /** @type {Array<{entityId:number, node:any}>} */
  const out = [];

  for (let i = 0; i < topology.length; i++) {
    const entityId = topology[i];
    const node = world.get(entityId, ProcNode);
    if (!node || node.enabled === false) continue;
    out.push({ entityId, node });
  }

  out.sort((a, b) => Number(a.node.priority || 0) - Number(b.node.priority || 0) || a.entityId - b.entityId);
  return out;
}

export function evalGate(world, gate, ctx, sourceStats = {}, targetStats = {}) {
  const kind = String(gate?.kind || "");

  switch (kind) {
    case "eventKind":
      return String(ctx?.kind || "") === String(gate.a || "");

    case "chance":
      return chancePasses(world, gate.b);

    case "critOnly":
      return !!ctx?.damage?.crit;

    case "sourceStatAtLeast":
      return Number(sourceStats?.[String(gate.a || "")] || 0) >= Number(gate.b || 0);

    case "targetTag":
      return hasSemanticTag(world, Number(ctx?.target || 0), gate.a);

    case "healthBelowPct": {
      const subject = String(gate.c || "target") === "source"
        ? Number(ctx?.source || 0)
        : Number(ctx?.target || 0);
      return getHealthPct(world, subject) < Number(gate.b || 0);
    }

    case "damageType":
      return String(ctx?.damage?.type || "") === String(gate.a || "");

    case "hasActionTag":
      return !!ctx?.tags?.has?.(gate.a);

    case "oncePerTurn": {
      const scratch = ctx?.scratch || (ctx.scratch = {});
      const seen = scratch.oncePerTurn || (scratch.oncePerTurn = new Set());
      const key = String(gate.a || gate.c || kind);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }

    case "hasCharge":
      return Number(ctx?.charges ?? ctx?.itemCharges ?? 0) >= Number(gate.b || 1);

    default:
      return false;
  }
}

export function applyProcEffect(world, effect, ctx, sourceStats = {}, targetStats = {}, out = createProcAccumulator(), effectId = 0) {
  const kind = String(effect?.kind || "");

  switch (kind) {
    case "bonusDamageFlat":
      out.bonusDamage.push({
        source: effectId,
        min: Number(effect.a || 0),
        max: Number(effect.b || effect.a || 0),
        type: String(effect.c || ctx?.damage?.type || "physical"),
      });
      break;

    case "bonusDamageScaleFromSourceStat": {
      const key = String(effect.a || "");
      const amount = Number(sourceStats?.[key] || 0) * Number(effect.b || 0);
      out.bonusDamage.push({
        source: effectId,
        min: amount,
        max: amount,
        type: String(effect.c || ctx?.damage?.type || "physical"),
      });
      break;
    }

    case "addCritChance":
      out.bonusCritChance += Number(effect.a || 0);
      break;

    case "restoreResource":
      out.resourcesToRestore.push({
        source: effectId,
        target: String(effect.c || "source") === "target" ? Number(ctx?.target || 0) : Number(ctx?.source || 0),
        resource: String(effect.a || ""),
        amount: Number(effect.b || 0),
      });
      break;

    case "applyStatus":
      out.statusesToApply.push({
        source: effectId,
        target: Number(ctx?.target || 0),
        status: {
          key: String(effect.a || ""),
          turnsLeft: Math.max(0, Number(effect.b || 0)),
          potency: Number(effect.c || 1),
        },
      });
      break;

    case "attachTimedBuff":
      out.buffsToAttach.push({
        source: effectId,
        target: String(effect.c || "source") === "target" ? Number(ctx?.target || 0) : Number(ctx?.source || 0),
        buff: String(effect.a || ""),
        duration: Math.max(0, Number(effect.b || 0)),
      });
      break;

    case "spawnEntity":
      out.spawnedEntities.push({
        source: effectId,
        kind: String(effect.a || ""),
        count: Math.max(1, Number(effect.b || 1)),
        anchor: String(effect.c || "target"),
      });
      break;

    case "consumeCharge":
      out.chargesToConsume.push({
        source: effectId,
        entityId: Number(ctx?.item || ctx?.source || 0),
        amount: Math.max(1, Number(effect.a || 1)),
      });
      break;

    default:
      break;
  }

  return out;
}

export function evaluateProcNode(world, nodeId, ctx, sourceStats = {}, targetStats = {}, out = createProcAccumulator()) {
  const gates = gatherDirectChildrenWith(world, nodeId, ActivationGate);
  for (let i = 0; i < gates.length; i++) {
    if (!evalGate(world, gates[i].record, ctx, sourceStats, targetStats)) return out;
  }

  const effects = gatherDirectChildrenWith(world, nodeId, ProcEffect);
  for (let i = 0; i < effects.length; i++) {
    applyProcEffect(world, effects[i].record, ctx, sourceStats, targetStats, out, effects[i].entityId);
  }

  runProcNodeScript(world, nodeId, ctx, sourceStats, targetStats, out);

  return out;
}

export function evaluateActorProcs(world, actorId, ctx, opts = {}) {
  const resolvedActorId = Number(actorId || ctx?.source || 0) | 0;
  const sourceStats = opts.sourceStats || resolveDerivedStats(world, Number(ctx?.source || resolvedActorId) | 0);
  const targetStats = opts.targetStats
    || ((Number(ctx?.target || 0) > 0) ? resolveDerivedStats(world, Number(ctx.target) | 0) : {});
  const out = opts.out || createProcAccumulator();

  const nodes = gatherProcNodes(world, resolvedActorId);
  for (let i = 0; i < nodes.length; i++) {
    evaluateProcNode(world, nodes[i].entityId, ctx, sourceStats, targetStats, out);
  }

  return out;
}

export function projectResourceRestore(world, entityId, resource, amount) {
  const id = Number(entityId || 0) | 0;
  const key = String(resource || "");
  const delta = Number(amount || 0);

  if (key === "stamina") {
    const stamina = world.get(id, Stamina);
    if (!stamina) return 0;
    const cap = Number(stamina.maxStamina || 0);
    return Math.max(0, Math.min(cap, Number(stamina.stamina || 0) + delta) - Number(stamina.stamina || 0));
  }

  if (key === "mana") {
    const mana = world.get(id, Mana);
    if (!mana) return 0;
    const cap = Number(mana.maxMana || 0);
    return Math.max(0, Math.min(cap, Number(mana.mana || 0) + delta) - Number(mana.mana || 0));
  }

  return Math.max(0, delta);
}
