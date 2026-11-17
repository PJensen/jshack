import { Faction } from "../components/Faction.js";
import { AggroState, AGGRO_LEVELS } from "../components/AggroState.js";
import { Disposition } from "../components/Disposition.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import {
  OFFENSE_ATTRIBUTION,
  OFFENSE_DEFS,
  OFFENSE_KINDS,
  OFFENSE_SEVERITY,
  OFFENSE_SOURCES,
} from "../data/offenses.js";
import { areFactionsHostile } from "./factionHostility.js";

const PROTECTED_SOCIAL_FACTIONS = new Set(["shopkeeper", "townfolk", "neutral"]);

function normalizeFaction(value) {
  return String(value || "").trim().toLowerCase();
}

function nameOf(world, id) {
  const ni = world.get(id, NamedIdentity);
  return String(ni?.name || ni?.identity || "that creature");
}

function severityName(value) {
  const n = Number(value || 0) | 0;
  for (const [key, level] of Object.entries(OFFENSE_SEVERITY)) {
    if (level === n) return key;
  }
  return "none";
}

function normalizeSeverity(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(5, Number(value) | 0));
  return OFFENSE_SEVERITY.none;
}

function offenseDef(kind) {
  return OFFENSE_DEFS[kind] || OFFENSE_DEFS[OFFENSE_KINDS.none];
}

function alreadyHostileToActor(world, actorId, targetId) {
  const aggro = world.get(targetId, AggroState);
  if (aggro && (
    Number(aggro.targetId || 0) === actorId ||
    Number(aggro.forcedTargetId || 0) === actorId ||
    Number(aggro.highestThreatId || 0) === actorId
  )) return true;

  for (const [, disposition] of world.query(Disposition)) {
    if (Number(disposition?.subjectId || 0) !== targetId
      || Number(disposition?.objectId || 0) !== actorId) continue;
    if (Number(disposition.maxSeverity || 0) >= OFFENSE_SEVERITY.serious
      || Number(disposition.score || 0) <= -30) return true;
  }

  return aggro?.alertLevel === AGGRO_LEVELS.hunting && Number(aggro.targetId || 0) === actorId;
}

export function isProtectedSocialTarget(world, actorId, targetId) {
  const targetFaction = normalizeFaction(world.get(targetId, Faction)?.key);
  if (!PROTECTED_SOCIAL_FACTIONS.has(targetFaction)) return false;
  const actorFaction = normalizeFaction(world.get(actorId, Faction)?.key);
  if (!actorFaction) return true;
  return !areFactionsHostile(actorFaction, targetFaction);
}

export function classifyActorTargetAction(world, spec = {}) {
  const actorId = Number(spec.actorId || 0) | 0;
  const targetId = Number(spec.targetId || 0) | 0;
  const actionKind = String(spec.actionKind || "unknown");
  const source = String(spec.source || OFFENSE_SOURCES.intentionalDirect);
  const attribution = String(spec.attribution || OFFENSE_ATTRIBUTION.known);
  const targetName = targetId > 0 ? nameOf(world, targetId) : "that creature";
  const protectedTarget = targetId > 0 && isProtectedSocialTarget(world, actorId, targetId);

  let offenseKind = OFFENSE_KINDS.none;
  if (protectedTarget) {
    if (actionKind === "melee_attack" || actionKind === "ranged_attack") {
      offenseKind = OFFENSE_KINDS.assault;
    } else if (actionKind === "polymorph" || actionKind === "stasis" || actionKind === "mind_control") {
      offenseKind = OFFENSE_KINDS.bodilyViolation;
    } else if (source === OFFENSE_SOURCES.recklessArea || source === OFFENSE_SOURCES.intentionalArea) {
      offenseKind = OFFENSE_KINDS.recklessEndangerment;
    }
  }

  const def = offenseDef(offenseKind);
  const severity = normalizeSeverity(spec.severity ?? def.severity);
  const requiresConfirm = protectedTarget && severity >= OFFENSE_SEVERITY.minor
    && !alreadyHostileToActor(world, actorId, targetId);

  return Object.freeze({
    actorId,
    targetId,
    actionKind,
    source,
    attribution,
    protectedTarget,
    offenseKind,
    offenseLabel: def.label,
    severity,
    severityName: severityName(severity),
    requiresConfirm,
    message: requiresConfirm
      ? `${def.label}: ${actionKind === "melee_attack" ? "attack" : "target"} ${targetName}?`
      : "",
  });
}

export function classifyShopClaimOffense(spec = {}) {
  const reason = String(spec.reason || spec.claimKind || "");
  const claimKind = String(spec.claimKind || reason || "unauthorized_use");
  const severity = normalizeSeverity(spec.severity);
  const attribution = String(spec.attribution || OFFENSE_ATTRIBUTION.known);
  let offenseKind = OFFENSE_KINDS.shopLaw;
  if (
    reason.includes("carried") ||
    reason.includes("thrown") ||
    reason.includes("consum") ||
    reason.includes("destroyed")
  ) {
    offenseKind = OFFENSE_KINDS.theft;
  } else if (reason.includes("knowledge") || reason.includes("learn")) {
    offenseKind = OFFENSE_KINDS.fraud;
  } else if (reason.includes("teleport") || reason.includes("blink")) {
    offenseKind = OFFENSE_KINDS.shopLaw;
  } else if (reason.includes("polymorph") || reason.includes("transform")) {
    offenseKind = OFFENSE_KINDS.bodilyViolation;
  }

  const def = offenseDef(offenseKind);
  return Object.freeze({
    source: OFFENSE_SOURCES.shopLaw,
    attribution,
    offenseKind,
    offenseLabel: def.label,
    severity,
    severityName: severityName(severity),
    reason,
    claimKind,
  });
}

export { OFFENSE_ATTRIBUTION, OFFENSE_KINDS, OFFENSE_SEVERITY, OFFENSE_SOURCES };
