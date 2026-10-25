import { attach, destroySubtree, getParent } from "../../lib/ecs-js/hierarchy.js";
import { EffectChanged } from "../../events/EffectChanged.js";
import { ActiveEffects } from "../components/ActiveEffects.js";
import { Duration } from "../components/Duration.js";
import { EffectInstance } from "../components/EffectInstance.js";
import { EffectImmunities } from "../components/EffectImmunities.js";
import { PeriodicEffect } from "../components/PeriodicEffect.js";
import { Source } from "../components/Source.js";
import { StatusEffectNode } from "../components/StatusEffectNode.js";
import { TimedEffectNode } from "../components/TimedEffectNode.js";
import { Vitality } from "../components/Vitality.js";
import { Mana } from "../components/Mana.js";
import { Stamina } from "../components/Stamina.js";
import { getEffectDefinition } from "../data/effectInstances.js";
import { applyHealing } from "./applyHealing.js";
import { dealDamage } from "./dealDamage.js";
import { effectiveMaxMana, effectiveMaxStamina } from "./passiveBonuses.js";
import { childrenWith } from "./topology.js";

export function applyEffectInstance(world, actor, effect) {
  const def = getEffectDefinition(effect?.key);
  if (!def) throw new Error(`Unknown effect definition: ${effect?.key}`);
  if (!world.isAlive(actor)) throw new Error("Effect target must be alive");
  const turns = effect.turnsLeft;
  if (turns !== Infinity && (!Number.isInteger(turns) || turns < 1)) throw new Error("Effect duration must be positive");
  const potency = effect.potency ?? 1;
  if (!Number.isFinite(potency) || potency < 0) throw new Error("Effect potency must be non-negative");
  const immunities = world.get(actor, EffectImmunities)?.immuneTo || [];
  if ([def.id, ...def.statuses].some((key) => immunities.includes(key))) return 0;
  const now = Number(world.time || 0);
  let nodeId = 0;
  for (const [id, instance] of childrenWith(world, actor, EffectInstance)) {
    if (instance.definitionId !== def.id || def.stacking === "independent") continue;
    const source = world.get(id, Source);
    if (def.match === "actor" && instance.sourceActorId !== (effect.sourceActorId || 0)) continue;
    if (def.match === "item" && source?.id !== (effect.sourceId || 0)) continue;
    if (def.stacking === "replace" || !(world.get(id, Duration)?.turnsLeft > 0)) {
      removeEffectInstance(world, id, "replaced");
    } else nodeId = id;
    break;
  }
  const refreshed = nodeId > 0;
  if (!refreshed) {
    nodeId = world.create();
    attach(world, nodeId, actor);
    world.add(nodeId, StatusEffectNode, { key: def.id, potency, stacks: 1 });
    world.add(nodeId, TimedEffectNode, { key: def.id });
    world.add(nodeId, Duration, { turnsLeft: turns, maxTurns: turns, startedAtTurn: world.step, onsetLeft: Math.max(0, Number(effect.onsetLeft || 0) | 0) });
    world.add(nodeId, EffectInstance, { definitionId: def.id, sourceActorId: effect.sourceActorId || 0, appliedAt: now, processedAt: now, permanent: turns === Infinity });
    for (const op of def.periodic) {
      const child = world.create();
      attach(world, child, nodeId);
      world.add(child, PeriodicEffect, { ...op, baseAmount: op.amount, amount: op.amount * potency, ticksLeft: op.interval });
    }
  } else {
    const duration = world.get(nodeId, Duration);
    duration.turnsLeft = def.stacking === "extend" ? duration.turnsLeft + turns : Math.max(duration.turnsLeft, turns);
    duration.maxTurns = Math.max(duration.maxTurns, duration.turnsLeft);
    duration.onsetLeft = Math.min(duration.onsetLeft, Math.max(0, Number(effect.onsetLeft || 0) | 0));
    const instance = world.get(nodeId, EffectInstance);
    instance.permanent = duration.turnsLeft === Infinity;
    instance.sourceActorId = effect.sourceActorId || 0;
    const status = world.get(nodeId, StatusEffectNode);
    status.potency = Math.max(status.potency, potency);
    if (def.stacking === "stack") status.stacks = Math.min(def.maxStacks, status.stacks + 1);
    for (const [, op] of childrenWith(world, nodeId, PeriodicEffect)) {
      op.amount = op.baseAmount * status.potency * status.stacks;
    }
  }
  const source = { kind: effect.sourceKind || "", id: effect.sourceId || 0, key: effect.sourceKey || "" };
  if (world.has(nodeId, Source)) world.set(nodeId, Source, source);
  else world.add(nodeId, Source, source);
  world.emit(new EffectChanged({ actor, instanceId: nodeId, key: def.id, phase: refreshed ? "refreshed" : "applied" }));
  return nodeId;
}

export function removeEffectInstance(world, nodeId, reason = "removed") {
  const instance = world.get(nodeId, EffectInstance);
  if (!instance) return false;
  const actor = getParent(world, nodeId);
  // Disable immediately, including when structural destruction is deferred.
  world.get(nodeId, Duration).turnsLeft = 0;
  world.emit(new EffectChanged({ actor, instanceId: nodeId, key: instance.definitionId, phase: "removed", reason }));
  destroySubtree(world, nodeId);
  return true;
}

export function snapshotEffectInstances(world, actor) {
  const rows = [];
  for (const [id, instance] of childrenWith(world, actor, EffectInstance)) {
    const duration = world.get(id, Duration);
    if (!(duration?.turnsLeft > 0) || duration.onsetLeft > 0) continue;
    const status = world.get(id, StatusEffectNode);
    const source = world.get(id, Source);
    rows.push({ instanceId: id, key: instance.definitionId, turns: duration.turnsLeft, stacks: status.stacks, potency: status.potency, sourceId: source?.id || 0, sourceKey: source?.key || "" });
  }
  return rows;
}

// Old saves and legacy producers enter through this same materialization path.
export function migrateLegacyEffectInstances(world) {
  for (const [actor, active] of world.query(ActiveEffects)) {
    const retained = [];
    for (const effect of active.effects) {
      if (!getEffectDefinition(effect?.key)) { retained.push(effect); continue; }
      if (effect.turnsLeft > 0) applyEffectInstance(world, actor, effect);
    }
    if (retained.length !== active.effects.length) active.effects = retained;
  }
}

export function tickEffectInstances(world) {
  const now = Number(world.time || 0);
  for (const [id, instance, duration] of world.query(EffectInstance, Duration)) {
    const actor = getParent(world, id);
    if (!world.isAlive(actor) || world.get(actor, Vitality)?.hp <= 0) {
      removeEffectInstance(world, id, "death");
      continue;
    }
    if (!(duration.turnsLeft > 0)) { removeEffectInstance(world, id, "expired"); continue; }
    if (instance.processedAt === now || instance.appliedAt === now) continue;
    instance.processedAt = now;
    if (duration.onsetLeft > 0) { duration.onsetLeft--; continue; }
    for (const [, op] of childrenWith(world, id, PeriodicEffect)) {
      op.ticksLeft--;
      if (op.ticksLeft > 0) continue;
      op.ticksLeft = op.interval;
      const source = instance.sourceActorId;
      if (op.operation === "damage") dealDamage(world, { target: actor, source, amount: op.amount, type: op.damageType, cause: instance.definitionId });
      else if (op.operation === "heal") applyHealing(world, { target: actor, source, amount: op.amount, cause: instance.definitionId });
      else {
        const isMana = op.operation.startsWith("mana_");
        const Comp = isMana ? Mana : Stamina;
        const resource = world.get(actor, Comp);
        if (!resource) continue;
        const field = isMana ? "mana" : "stamina";
        const cap = isMana ? effectiveMaxMana(world, actor, resource) : effectiveMaxStamina(world, actor, resource);
        const amount = op.operation.endsWith("_drain") ? -op.amount : op.amount;
        resource[field] = Math.max(0, Math.min(cap, resource[field] + amount));
      }
    }
    if (duration.turnsLeft !== Infinity) duration.turnsLeft--;
    if (duration.turnsLeft <= 0) removeEffectInstance(world, id, "expired");
  }
}

// JSON encodes Infinity as null. The explicit lifecycle flag restores permanence.
export function normalizeEffectSnapshot(snapshot) {
  const permanent = new Set((snapshot?.comps?.EffectInstance || []).filter(([, row]) => row.permanent).map(([id]) => id));
  if (!permanent.size) return snapshot;
  return { ...snapshot, comps: { ...snapshot.comps, Duration: (snapshot.comps.Duration || []).map(([id, row]) => permanent.has(id) ? [id, { ...row, turnsLeft: Infinity, maxTurns: Infinity }] : [id, row]) } };
}
