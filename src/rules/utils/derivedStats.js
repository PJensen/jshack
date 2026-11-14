import { children } from "../../lib/ecs-js/index.js";
import { BaseStats } from "../components/BaseStats.js";
import { DerivedExpression } from "../components/DerivedExpression.js";
import { Equipment, NON_AMMO_GEAR_SLOTS } from "../components/Equipment.js";

export const RESOLVED_STAT_DEFAULTS = Object.freeze({
  strength: 0,
  intelligence: 0,
  dexterity: 0,
  vitality: 0,
  accuracy: 0,
  damagePower: 0,
  physicalPenetration: 0,
  bluntPenetration: 0,
  slashPenetration: 0,
  piercePenetration: 0,
  evade: 0,
  mitigation: 0,
  critChancePhysical: 0,
  critChanceSpell: 0,
  critMultPhysical: 0,
  critMultSpell: 0,
  spellHit: 0,
  spellAvoid: 0,
  spellPower: 0,
  luck: 0,
  kineticDR: 0,
  fireResist: 0,
  poisonResist: 0,
  acidResist: 0,
  radiationResist: 0,
  electricOhms: 0,
  bluntResist: 0,
  slashResist: 0,
  pierceResist: 0,
  spellRadius: 0,
  visionRange: 0,
  hungerRate: 0,
  staminaRegen: 0,
  manaRegen: 0,
  critChance: 0,
  critMultiplier: 1.5,
  baseDamageMin: 0,
  baseDamageMax: 0,
});

export const DERIVED_STAGES = Object.freeze(["base", "derived", "final"]);

const DERIVED_VIRTUALS_DEFINED = Symbol.for("jshack:derivedStats:virtuals:defined");
const RESOLVED_STATS_VIRTUAL = Symbol.for("jshack:derivedStats:ResolvedStats");
const DAMAGE_PROFILE_VIRTUAL = Symbol.for("jshack:derivedStats:DamageProfile");

function stageIndex(stage) {
  const normalized = String(stage || "derived").toLowerCase();
  const idx = DERIVED_STAGES.indexOf(normalized);
  return idx >= 0 ? idx : 1;
}

function compareExpressionEntries(a, b) {
  return stageIndex(a.expr.stage) - stageIndex(b.expr.stage)
    || Number(a.expr.priority || 0) - Number(b.expr.priority || 0)
    || a.entityId - b.entityId;
}

function collectSubtree(world, rootId, seen, out) {
  const id = Number(rootId || 0) | 0;
  if (!(id > 0) || seen.has(id) || !world.isAlive?.(id)) return;
  seen.add(id);
  out.push(id);
  for (const childId of children(world, id)) {
    collectSubtree(world, childId, seen, out);
  }
}

export function gatherStatTopology(world, actorId, options = {}) {
  const id = Number(actorId || 0) | 0;
  if (!(id > 0) || !world?.isAlive?.(id)) return [];

  const seen = new Set();
  const out = [];

  collectSubtree(world, id, seen, out);

  const eq = options.equipmentOverride || world.get(id, Equipment);
  if (!eq) return out;

  for (let i = 0; i < NON_AMMO_GEAR_SLOTS.length; i++) {
    const slot = NON_AMMO_GEAR_SLOTS[i];
    const itemId = Number(eq[slot] || 0) | 0;
    if (itemId > 0) collectSubtree(world, itemId, seen, out);
  }

  return out;
}

export function gatherDerivedExpressions(world, actorId, options = {}) {
  const topology = gatherStatTopology(world, actorId, options);
  /** @type {Array<{entityId:number, expr:any}>} */
  const out = [];

  for (let i = 0; i < topology.length; i++) {
    const entityId = topology[i];
    const expr = world.get(entityId, DerivedExpression);
    if (!expr || expr.enabled === false) continue;
    out.push({ entityId, expr });
  }

  out.sort(compareExpressionEntries);
  return out;
}

export function createResolvedStatsSheet() {
  return { ...RESOLVED_STAT_DEFAULTS };
}

function applyBaseStats(sheet, base) {
  if (!base) return;
  const keys = Object.keys(RESOLVED_STAT_DEFAULTS);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = Number(base[key]);
    if (Number.isFinite(value)) sheet[key] = value;
  }
}

function synthesizeCanonicalChannels(sheet) {
  const strength = Number(sheet.strength || 0);
  const intelligence = Number(sheet.intelligence || 0);
  const dexterity = Number(sheet.dexterity || 0);
  const vitality = Number(sheet.vitality || 0);
  const critChance = Number(sheet.critChance || 0);
  const critMultLegacy = Number(sheet.critMultiplier || 1.5);
  const strBonus = Math.floor(Math.max(0, strength - 10) / 2);
  const dexBonus = Math.floor(Math.max(0, dexterity - 10) / 2);
  const vitBonus = Math.floor(Math.max(0, vitality - 10) / 2);
  const intBonus = Math.floor(Math.max(0, intelligence - 10) / 2);

  sheet.accuracy += dexBonus;
  sheet.evade += dexBonus;
  sheet.damagePower += strBonus;
  sheet.mitigation += vitBonus;

  sheet.critChancePhysical += critChance;
  sheet.critChanceSpell += critChance;
  sheet.critChancePhysical += dexBonus * 0.01;
  sheet.critChanceSpell += intBonus * 0.01;
  sheet.critMultPhysical += Math.max(0, critMultLegacy - 1.5);
  sheet.critMultSpell += Math.max(0, critMultLegacy - 1.5);
  sheet.spellHit += intBonus;
  sheet.spellPower += Math.max(0, intelligence);
}

export function evalDerivedExpression(sheet, expr) {
  const target = String(expr?.target || "");
  if (!Object.prototype.hasOwnProperty.call(sheet, target)) return false;

  const kind = String(expr?.kind || "addConst");
  const source = String(expr?.source || "");
  const value = Number(expr?.value || 0);
  const factor = Number(expr?.factor || 0);

  switch (kind) {
    case "addConst":
      sheet[target] += value;
      return true;

    case "addStatScale":
      if (!Object.prototype.hasOwnProperty.call(sheet, source)) return false;
      sheet[target] += Number(sheet[source] || 0) * factor;
      return true;

    case "mulConst":
      sheet[target] *= factor;
      return true;

    case "minConst":
      sheet[target] = Math.max(Number(sheet[target] || 0), value);
      return true;

    case "maxConst":
      sheet[target] = Math.min(Number(sheet[target] || 0), value);
      return true;

    case "overrideConst":
      sheet[target] = value;
      return true;

    default:
      return false;
  }
}

function applyFinalHygiene(sheet) {
  sheet.accuracy = Number(sheet.accuracy || 0);
  sheet.damagePower = Number(sheet.damagePower || 0);
  sheet.physicalPenetration = Math.max(0, Number(sheet.physicalPenetration || 0));
  sheet.bluntPenetration = Math.max(0, Number(sheet.bluntPenetration || 0));
  sheet.slashPenetration = Math.max(0, Number(sheet.slashPenetration || 0));
  sheet.piercePenetration = Math.max(0, Number(sheet.piercePenetration || 0));
  sheet.evade = Number(sheet.evade || 0);
  sheet.mitigation = Math.max(0, Number(sheet.mitigation || 0));
  sheet.critChancePhysical = Math.max(0, Math.min(0.95, Number(sheet.critChancePhysical || 0)));
  sheet.critChanceSpell = Math.max(0, Math.min(0.95, Number(sheet.critChanceSpell || 0)));
  sheet.critMultPhysical = Math.max(0, Number(sheet.critMultPhysical || 0));
  sheet.critMultSpell = Math.max(0, Number(sheet.critMultSpell || 0));
  sheet.spellHit = Number(sheet.spellHit || 0);
  sheet.spellAvoid = Number(sheet.spellAvoid || 0);
  sheet.spellPower = Math.max(0, Number(sheet.spellPower || 0));
  sheet.luck = Number(sheet.luck || 0);
  sheet.critChance = Math.max(0, Math.min(0.95, Number(sheet.critChance || 0)));
  sheet.critMultiplier = Math.max(1, Number(sheet.critMultiplier || 1));
  sheet.baseDamageMin = Math.max(0, Number(sheet.baseDamageMin || 0));
  sheet.baseDamageMax = Math.max(Number(sheet.baseDamageMin || 0), Number(sheet.baseDamageMax || 0));
}

export function resolveDerivedStats(world, actorId, options = {}) {
  const id = Number(actorId || 0) | 0;
  const sheet = createResolvedStatsSheet();

  if (!(id > 0) || !world?.isAlive?.(id)) {
    return Object.freeze(sheet);
  }

  applyBaseStats(sheet, world.get(id, BaseStats));

  const expressions = gatherDerivedExpressions(world, id, options);
  for (let i = 0; i < expressions.length; i++) {
    evalDerivedExpression(sheet, expressions[i].expr);
  }

  synthesizeCanonicalChannels(sheet);
  applyFinalHygiene(sheet);
  return Object.freeze(sheet);
}

export function explainDerivedStats(world, actorId) {
  const id = Number(actorId || 0) | 0;
  const sheet = createResolvedStatsSheet();
  const trace = [];

  if (!(id > 0) || !world?.isAlive?.(id)) {
    return Object.freeze({
      sheet: Object.freeze(sheet),
      trace: Object.freeze(trace),
    });
  }

  applyBaseStats(sheet, world.get(id, BaseStats));
  const expressions = gatherDerivedExpressions(world, id);

  for (let i = 0; i < expressions.length; i++) {
    const { entityId, expr } = expressions[i];
    const target = String(expr.target || "");
    const before = Number(sheet[target] || 0);
    const applied = evalDerivedExpression(sheet, expr);
    if (!applied) continue;
    trace.push(Object.freeze({
      entityId,
      stage: String(expr.stage || "derived"),
      priority: Number(expr.priority || 0),
      target,
      kind: String(expr.kind || "addConst"),
      before,
      after: Number(sheet[target] || 0),
      source: String(expr.source || ""),
      value: Number(expr.value || 0),
      factor: Number(expr.factor || 0),
    }));
  }

  synthesizeCanonicalChannels(sheet);
  applyFinalHygiene(sheet);

  return Object.freeze({
    sheet: Object.freeze(sheet),
    trace: Object.freeze(trace),
  });
}

export function makeDamageProfile(stats) {
  const resolved = stats || RESOLVED_STAT_DEFAULTS;
  return Object.freeze({
    min: Number(resolved.baseDamageMin || 0),
    max: Number(resolved.baseDamageMax || 0),
    critChance: Number(resolved.critChance || 0),
    critMultiplier: Number(resolved.critMultiplier || 1),
  });
}

export function defineDerivedStatVirtuals(world) {
  if (world[DERIVED_VIRTUALS_DEFINED]) return;
  if (typeof world?.defineVirtual !== "function" || typeof world?.vget !== "function") {
    throw new Error("defineDerivedStatVirtuals: installVirtuals(world) must run first");
  }

  world[DERIVED_VIRTUALS_DEFINED] = true;

  world[RESOLVED_STATS_VIRTUAL] = world.defineVirtual("ResolvedStats", (w, id) => {
    return resolveDerivedStats(w, id);
  });

  world[DAMAGE_PROFILE_VIRTUAL] = world.defineVirtual("DamageProfile", (w, id) => {
    return makeDamageProfile(w.vget(id, world[RESOLVED_STATS_VIRTUAL]));
  });
}

export function getResolvedStatsVirtual(world) {
  return world?.[RESOLVED_STATS_VIRTUAL] || null;
}

export function getResolvedStats(world, entityId, options = {}) {
  if (options.equipmentOverride) return resolveDerivedStats(world, entityId, options);
  const Virtual = getResolvedStatsVirtual(world);
  if (Virtual && typeof world?.vget === "function") return world.vget(entityId, Virtual);
  return resolveDerivedStats(world, entityId);
}

export function getDamageProfileVirtual(world) {
  return world?.[DAMAGE_PROFILE_VIRTUAL] || null;
}
