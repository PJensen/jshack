import { attach } from "../../lib/ecs-js/index.js";
import { ActivationGate } from "../components/ActivationGate.js";
import { DerivedExpression } from "../components/DerivedExpression.js";
import { ProcEffect } from "../components/ProcEffect.js";
import { ProcNode } from "../components/ProcNode.js";
import { ScriptRef } from "../components/ScriptRef.js";
import { DERIVED_STAGES, RESOLVED_STAT_DEFAULTS } from "./derivedStats.js";

export const RESOLVED_STAT_KEYS = Object.freeze(Object.keys(RESOLVED_STAT_DEFAULTS));

export const DERIVED_EXPRESSION_KINDS = Object.freeze({
  AddConst: "addConst",
  AddStatScale: "addStatScale",
  MulConst: "mulConst",
  MinConst: "minConst",
  MaxConst: "maxConst",
  OverrideConst: "overrideConst",
});

export const ACTIVATION_GATE_KINDS = Object.freeze({
  EventKind: "eventKind",
  Chance: "chance",
  CritOnly: "critOnly",
  SourceStatAtLeast: "sourceStatAtLeast",
  TargetTag: "targetTag",
  HealthBelowPct: "healthBelowPct",
  DamageType: "damageType",
  HasActionTag: "hasActionTag",
  OncePerTurn: "oncePerTurn",
  HasCharge: "hasCharge",
});

export const PROC_EFFECT_KINDS = Object.freeze({
  BonusDamageFlat: "bonusDamageFlat",
  BonusDamageScaleFromSourceStat: "bonusDamageScaleFromSourceStat",
  AddCritChance: "addCritChance",
  RestoreResource: "restoreResource",
  ApplyStatus: "applyStatus",
  AttachTimedBuff: "attachTimedBuff",
  ModifyCombatStat: "modifyCombatStat",
  SpawnEntity: "spawnEntity",
  ConsumeCharge: "consumeCharge",
});

function normalizeStage(stage) {
  const normalized = String(stage || "derived").toLowerCase();
  return DERIVED_STAGES.includes(normalized) ? normalized : "derived";
}

function withPriority(opts = {}) {
  return Number.isFinite(opts.priority) ? Number(opts.priority) : 0;
}

function withEnabled(opts = {}) {
  return opts.enabled !== false;
}

function assertStatKey(key, fieldName = "target") {
  const normalized = String(key || "");
  if (!RESOLVED_STAT_KEYS.includes(normalized)) {
    throw new Error(`statProcAuthoring: unknown ${fieldName} stat '${normalized}'`);
  }
  return normalized;
}

function assertPct(value, fieldName) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 1) {
    throw new Error(`statProcAuthoring: ${fieldName} must be between 0 and 1`);
  }
  return num;
}

export function exprAddConst(target, value, opts = {}) {
  return {
    target: assertStatKey(target),
    kind: DERIVED_EXPRESSION_KINDS.AddConst,
    source: "",
    value: Number(value || 0),
    factor: 0,
    stage: normalizeStage(opts.stage),
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function exprAddStatScale(target, source, factor, opts = {}) {
  return {
    target: assertStatKey(target),
    kind: DERIVED_EXPRESSION_KINDS.AddStatScale,
    source: assertStatKey(source, "source"),
    value: 0,
    factor: Number(factor || 0),
    stage: normalizeStage(opts.stage),
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function exprMulConst(target, factor, opts = {}) {
  return {
    target: assertStatKey(target),
    kind: DERIVED_EXPRESSION_KINDS.MulConst,
    source: "",
    value: 0,
    factor: Number(factor || 0),
    stage: normalizeStage(opts.stage),
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function exprMinConst(target, value, opts = {}) {
  return {
    target: assertStatKey(target),
    kind: DERIVED_EXPRESSION_KINDS.MinConst,
    source: "",
    value: Number(value || 0),
    factor: 0,
    stage: normalizeStage(opts.stage),
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function exprMaxConst(target, value, opts = {}) {
  return {
    target: assertStatKey(target),
    kind: DERIVED_EXPRESSION_KINDS.MaxConst,
    source: "",
    value: Number(value || 0),
    factor: 0,
    stage: normalizeStage(opts.stage),
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function exprOverrideConst(target, value, opts = {}) {
  return {
    target: assertStatKey(target),
    kind: DERIVED_EXPRESSION_KINDS.OverrideConst,
    source: "",
    value: Number(value || 0),
    factor: 0,
    stage: normalizeStage(opts.stage),
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function gateEventKind(eventKind, opts = {}) {
  return {
    kind: ACTIVATION_GATE_KINDS.EventKind,
    a: String(eventKind || ""),
    b: 0,
    c: "",
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function gateChance(chance, opts = {}) {
  return {
    kind: ACTIVATION_GATE_KINDS.Chance,
    a: "",
    b: assertPct(chance, "chance"),
    c: "",
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function gateCritOnly(opts = {}) {
  return {
    kind: ACTIVATION_GATE_KINDS.CritOnly,
    a: "",
    b: 0,
    c: "",
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function gateSourceStatAtLeast(stat, threshold, opts = {}) {
  return {
    kind: ACTIVATION_GATE_KINDS.SourceStatAtLeast,
    a: assertStatKey(stat, "source"),
    b: Number(threshold || 0),
    c: "",
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function gateTargetTag(tag, opts = {}) {
  return {
    kind: ACTIVATION_GATE_KINDS.TargetTag,
    a: String(tag || ""),
    b: 0,
    c: "",
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function gateHealthBelowPct(pct, opts = {}) {
  return {
    kind: ACTIVATION_GATE_KINDS.HealthBelowPct,
    a: "",
    b: assertPct(pct, "healthBelowPct"),
    c: String(opts.subject || "target"),
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function gateDamageType(type, opts = {}) {
  return {
    kind: ACTIVATION_GATE_KINDS.DamageType,
    a: String(type || ""),
    b: 0,
    c: "",
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function gateHasActionTag(tag, opts = {}) {
  return {
    kind: ACTIVATION_GATE_KINDS.HasActionTag,
    a: String(tag || ""),
    b: 0,
    c: "",
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function gateOncePerTurn(key, opts = {}) {
  return {
    kind: ACTIVATION_GATE_KINDS.OncePerTurn,
    a: String(key || ""),
    b: 0,
    c: "",
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function gateHasCharge(minimum = 1, opts = {}) {
  return {
    kind: ACTIVATION_GATE_KINDS.HasCharge,
    a: "",
    b: Math.max(1, Number(minimum || 1)),
    c: "",
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function effectBonusDamageFlat(min, max = min, damageType = "physical", opts = {}) {
  return {
    kind: PROC_EFFECT_KINDS.BonusDamageFlat,
    a: Number(min || 0),
    b: Number(max || min || 0),
    c: String(damageType || "physical"),
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function effectBonusDamageScaleFromSourceStat(stat, factor, damageType = "physical", opts = {}) {
  return {
    kind: PROC_EFFECT_KINDS.BonusDamageScaleFromSourceStat,
    a: assertStatKey(stat, "source"),
    b: Number(factor || 0),
    c: String(damageType || "physical"),
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function effectAddCritChance(amount, opts = {}) {
  return {
    kind: PROC_EFFECT_KINDS.AddCritChance,
    a: Number(amount || 0),
    b: 0,
    c: "",
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function effectRestoreResource(resource, amount, opts = {}) {
  return {
    kind: PROC_EFFECT_KINDS.RestoreResource,
    a: String(resource || ""),
    b: Number(amount || 0),
    c: String(opts.target || "source"),
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function effectApplyStatus(statusKey, turnsLeft, potency = 1, opts = {}) {
  return {
    kind: PROC_EFFECT_KINDS.ApplyStatus,
    a: String(statusKey || ""),
    b: Math.max(0, Number(turnsLeft || 0)),
    c: Number(potency || 1),
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function effectAttachTimedBuff(buffKey, duration, opts = {}) {
  return {
    kind: PROC_EFFECT_KINDS.AttachTimedBuff,
    a: String(buffKey || ""),
    b: Math.max(0, Number(duration || 0)),
    c: String(opts.target || "source"),
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function effectSpawnEntity(kind, count = 1, opts = {}) {
  return {
    kind: PROC_EFFECT_KINDS.SpawnEntity,
    a: String(kind || ""),
    b: Math.max(1, Number(count || 1)),
    c: String(opts.anchor || "target"),
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function effectConsumeCharge(amount = 1, opts = {}) {
  return {
    kind: PROC_EFFECT_KINDS.ConsumeCharge,
    a: Math.max(1, Number(amount || 1)),
    b: 0,
    c: "",
    priority: withPriority(opts),
    enabled: withEnabled(opts),
  };
}

export function addAttachedComponent(world, parentId, Comp, record) {
  const id = world.create();
  world.add(id, Comp, record);
  attach(world, id, parentId);
  return id;
}

export function attachDerivedExpression(world, parentId, expression) {
  return addAttachedComponent(world, parentId, DerivedExpression, expression);
}

export function attachProcGate(world, procNodeId, gate) {
  return addAttachedComponent(world, procNodeId, ActivationGate, gate);
}

export function attachProcEffect(world, procNodeId, effect) {
  return addAttachedComponent(world, procNodeId, ProcEffect, effect);
}

export function attachProcScript(world, procNodeId, ref, params = {}) {
  const record = {
    ref: typeof ref === "string" ? ref : ref?.ref ?? ref?.key ?? ref?.id ?? null,
    params: typeof ref === "object" && ref && !Array.isArray(ref)
      ? { ...(ref.params || ref.args || {}), ...params }
      : { ...params },
  };
  if (world.has(procNodeId, ScriptRef)) {
    world.set(procNodeId, ScriptRef, record);
    return procNodeId;
  }
  world.add(procNodeId, ScriptRef, record);
  return procNodeId;
}

export function attachProcNode(world, parentId, spec = {}) {
  const procNodeId = addAttachedComponent(world, parentId, ProcNode, {
    priority: withPriority(spec),
    enabled: withEnabled(spec),
  });

  const gates = Array.isArray(spec.gates) ? spec.gates : [];
  const effects = Array.isArray(spec.effects) ? spec.effects : [];

  for (let i = 0; i < gates.length; i++) attachProcGate(world, procNodeId, gates[i]);
  for (let i = 0; i < effects.length; i++) attachProcEffect(world, procNodeId, effects[i]);
  if (spec.script) attachProcScript(world, procNodeId, spec.script, spec.scriptParams || {});

  return procNodeId;
}
