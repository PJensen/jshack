import { Brain } from "../components/Brain.js";
import { Faction } from "../components/Faction.js";
import { Position } from "../components/Position.js";
import { combatSeed, hashString32, mulberry32 } from "./rng.js";
import { createStatusEvent } from "../../shared/events/statusEvent.js";
import { areFactionsHostile } from "./factionHostility.js";
import { resolveCanonicalStats } from "./canonicalStats.js";
import { resolveDerivedStats } from "./derivedStats.js";
import { resolveCombatSnapshot } from "./resolveCombatSnapshot.js";
import { effectStrength, statusStrength } from "./statusFacade.js";

/**
 * Positive-only spell scaling. Baseline INT 10 preserves current damage;
 * extra INT adds modest power without invalidating existing tuning.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} casterId
 * @returns {number}
 */
export function getSpellIntelligenceBonus(world, casterId) {
  const brain = (casterId > 0 && world.isAlive(casterId)) ? world.get(casterId, Brain) : null;
  const resolved = resolveDerivedStats(world, casterId);
  const spellPower = Math.max(
    Number(resolved?.spellPower || 0),
    Number(resolved?.intelligence || 0),
    Number(brain?.intelligence || 0),
    10,
  );
  return Math.max(0, spellPower - 10);
}

function getSpellHitBonus(world, casterId) {
  const brain = (casterId > 0 && world.isAlive(casterId)) ? world.get(casterId, Brain) : null;
  const canonical = resolveCanonicalStats(world, casterId);
  const brainIntelligence = Math.max(0, Number(brain?.intelligence || 0));
  const brainSpellHit = Math.floor(Math.max(0, brainIntelligence - 10) / 2);
  const confusedPenalty = statusStrength(world, casterId, "confused") * 4;
  const mindwipedPenalty = (statusStrength(world, casterId, "mindwiped") + effectStrength(world, casterId, "gaze_beam")) * 6;
  const mindlockedPenalty = statusStrength(world, casterId, "mindlocked") * 10;
  const hallucinatingPenalty = statusStrength(world, casterId, "hallucinating") * 10;
  const impairedPenalty = confusedPenalty + mindwipedPenalty + mindlockedPenalty + hallucinatingPenalty;
  const baseSpellHit = Math.max(
    Number(canonical?.spellHit || 0),
    brainSpellHit,
  );
  return Math.max(0, baseSpellHit - impairedPenalty);
}

function getSpellAvoidBonus(world, targetId) {
  const canonical = resolveCanonicalStats(world, targetId);
  return Math.max(0, Number(canonical?.spellAvoid || 0));
}

function isHostileSpellTarget(world, casterId, targetId) {
  const sourceId = Number(casterId || 0) | 0;
  const defenderId = Number(targetId || 0) | 0;
  if (!(sourceId > 0) || !(defenderId > 0) || sourceId === defenderId) return false;

  const sourceFaction = world.get(sourceId, Faction);
  const targetFaction = world.get(defenderId, Faction);
  if (!sourceFaction || !targetFaction) return false;
  return areFactionsHostile(sourceFaction.key, targetFaction.key);
}

export function getSpellHitChancePct(world, casterId, targetId) {
  const spellHit = getSpellHitBonus(world, casterId);
  const spellAvoid = getSpellAvoidBonus(world, targetId);
  return Math.max(0, Math.min(100, 100 + spellHit - spellAvoid));
}

export function rollSpellHit(world, casterId, targetId, spell = {}, salt = 0) {
  if (!isHostileSpellTarget(world, casterId, targetId)) return true;
  const hitChancePct = getSpellHitChancePct(world, casterId, targetId);
  if (hitChancePct <= 0) return false;
  if (hitChancePct >= 100) return true;

  const key = String(spell?.id || spell?.cause || "spell");
  const rng = mulberry32(combatSeed(world.seed, world.step, casterId | 0, targetId | 0, hashString32(key) ^ 0x51e117 ^ (salt >>> 0)));
  return (rng() * 100) < hitChancePct;
}

export function emitSpellMiss(world, casterId, targetId, spell = {}, options = {}) {
  const sourceId = Number(casterId || 0) | 0;
  const defenderId = Number(targetId || 0) | 0;
  const spellId = String(options?.spellId || spell?.id || "");
  const cause = String(options?.cause || spell?.cause || (spellId ? `spell:${spellId}` : "spell"));
  const hitChancePct = Number.isFinite(options?.hitChancePct)
    ? Number(options.hitChancePct)
    : getSpellHitChancePct(world, sourceId, defenderId);
  const at = options?.at;

  try {
    world.emit?.("status", createStatusEvent({ id: defenderId, kind: "miss", source: sourceId }));
  } catch {}
  try {
    world.emit?.("spell:miss", {
      actor: sourceId,
      source: sourceId,
      targetId: defenderId,
      spellId,
      cause,
      at,
      hitChancePct,
    });
  } catch {}
}

/**
 * @param {number} baseAmount
 * @param {number} intelligenceBonus
 * @returns {number}
 */
export function scaleSpellDamageFromBonus(baseAmount, intelligenceBonus) {
  const base = Math.max(0, Number(baseAmount || 0) | 0);
  if (base <= 0) return 0;
  return Math.max(1, base + Math.floor(Math.max(0, Number(intelligenceBonus || 0)) / 5));
}

/**
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} casterId
 * @param {number} baseAmount
 * @returns {number}
 */
export function scaleSpellDamage(world, casterId, baseAmount) {
  return scaleSpellDamageFromBonus(baseAmount, getSpellIntelligenceBonus(world, casterId));
}

/**
 * Snapshot spell-damage parameters at cast time so timed effects keep their
 * original behavior even if the caster changes gear or later dies.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} casterId
 * @param {{ id?:string, cause?:string }} [spell]
 * @param {{ cause?:string, type?:string, spellId?:string }} [overrides]
 */
export function createSpellDamageContext(world, casterId, spell = {}, overrides = {}) {
  const snap = resolveCombatSnapshot(world, casterId, { mode: "ranged" });
  const intelligenceBonus = getSpellIntelligenceBonus(world, casterId);
  const spellId = String(overrides?.spellId || spell?.id || "");
  return {
    sourceId: Number(casterId || 0) | 0,
    spellId,
    cause: String(overrides?.cause || spell?.cause || (spellId ? `spell:${spellId}` : "spell")),
    type: String(overrides?.type || "physical").toLowerCase(),
    intelligenceBonus,
    critChancePct: Math.max(0, 5 + Math.floor(intelligenceBonus / 2) + (snap?.luck || 0) + ((snap?.critChance || 0) * 100)),
    critMult: Math.max(1, 2 + Number(snap?.critMult || 0)),
  };
}

/**
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} targetId
 * @param {{
 *   sourceId?:number,
 *   spellId?:string,
 *   cause?:string,
 *   critChancePct?:number,
 *   critMult?:number,
 * }} context
 * @param {number} [salt=0]
 * @returns {boolean}
 */
export function rollSpellCriticalFromContext(world, targetId, context = {}, salt = 0) {
  const critPct = Math.max(0, Number(context?.critChancePct || 0));
  if (!(critPct > 0)) return false;
  const key = String(context?.spellId || context?.cause || "spell");
  const sourceId = Number(context?.sourceId || 0) | 0;
  const rng = mulberry32(combatSeed(world.seed, world.step, sourceId, targetId, hashString32(key) ^ (salt >>> 0)));
  return (rng() * 100) < critPct;
}

/**
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} targetId
 * @param {{
 *   sourceId?:number,
 *   spellId?:string,
 *   cause?:string,
 *   type?:string,
 *   critChancePct?:number,
 *   critMult?:number,
 * }} context
 * @param {{
   *   baseAmount:number,
 *   at?:{x:number,y:number},
 *   salt?:number,
 *   noTrigger?:boolean,
 *   bypassInvuln?:boolean,
 *   bypassResist?:boolean,
 *   cause?:string,
 *   type?:string,
 *   missed?:boolean,
 *   hitChancePct?:number,
 *   spellId?:string,
 * }} [options]
 */
export function buildSpellDamageSpecFromContext(world, targetId, context, options = {}) {
  const cause = String(options?.cause || context?.cause || "spell");
  const critical = rollSpellCriticalFromContext(world, targetId, context, Number(options?.salt || 0));
  const critMult = Math.max(1, Number(context?.critMult || 1));
  let amount = Math.max(0, Number(options?.baseAmount || 0) | 0);
  if (critical) amount = Math.max(1, Math.floor(amount * critMult));
  return {
    target: targetId,
    amount,
    source: Number(context?.sourceId || 0) | 0,
    type: String(options?.type || context?.type || "physical"),
    cause,
    at: options?.at,
    critical,
    missed: !!options?.missed,
    hitChancePct: Number(options?.hitChancePct || 0),
    spellId: String(options?.spellId || context?.spellId || ""),
    noTrigger: !!options?.noTrigger,
    bypassInvuln: !!options?.bypassInvuln,
    bypassResist: !!options?.bypassResist,
    projectileDelay: options?.projectileDelay || 0,
    impactVector: options?.impactVector || undefined,
  };
}

/**
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} casterId
 * @param {number} targetId
 * @param {{
 *   spell?: { id?:string, cause?:string },
 *   baseAmount:number,
 *   type?:string,
 *   cause?:string,
 *   at?:{x:number,y:number},
 *   salt?:number,
 *   noTrigger?:boolean,
 *   bypassInvuln?:boolean,
 *   bypassResist?:boolean,
 * }} options
 */
export function buildSpellDamageSpec(world, casterId, targetId, options) {
  const context = createSpellDamageContext(world, casterId, options?.spell || {}, {
    cause: options?.cause,
    type: options?.type,
  });
  const hitChancePct = getSpellHitChancePct(world, casterId, targetId);
  const missed = !rollSpellHit(world, casterId, targetId, options?.spell || {}, Number(options?.salt || 0));
  const powerScaleRaw = Number(options?.spell?.powerScale ?? 1);
  const powerScale = Number.isFinite(powerScaleRaw) ? Math.max(0, powerScaleRaw) : 1;
  const scaled = scaleSpellDamageFromBonus(Number(options?.baseAmount || 0), context.intelligenceBonus);
  const scaledWithPower = scaled <= 0 ? 0 : Math.max(1, Math.round(scaled * powerScale));

  // Auto-derive caster→target impactVector for spells unless caller overrides.
  let impactVector = options?.impactVector;
  if (!impactVector) {
    const cPos = (casterId > 0 && world.isAlive(casterId)) ? world.get(casterId, Position) : null;
    const tPos = (targetId > 0 && world.isAlive(targetId)) ? world.get(targetId, Position) : null;
    if (cPos && tPos) {
      const ddx = Number(tPos.x || 0) - Number(cPos.x || 0);
      const ddy = Number(tPos.y || 0) - Number(cPos.y || 0);
      const mag = Math.hypot(ddx, ddy);
      if (mag > 0) impactVector = { dx: ddx / mag, dy: ddy / mag };
    }
  }

  return buildSpellDamageSpecFromContext(world, targetId, context, {
    ...options,
    baseAmount: scaledWithPower,
    hitChancePct,
    missed,
    spellId: context.spellId,
    impactVector,
  });
}
