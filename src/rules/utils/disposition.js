import { attach, children } from "../../lib/ecs-js/hierarchy.js";
import { AggroState, AGGRO_LEVELS, SEARCH_TURNS_HUNTING_GRACE } from "../components/AggroState.js";
import { Disposition, DISPOSITION_BANDS } from "../components/Disposition.js";
import { Faction } from "../components/Faction.js";
import { Position } from "../components/Position.js";
import { Vitality } from "../components/Vitality.js";
import { OFFENSE_ATTRIBUTION, OFFENSE_SEVERITY } from "../data/offenses.js";
import { shopReputationTerms } from "./reputation.js";
import { hasLOS } from "../../shared/math/gridLOS.js";
import { buildBlocksVisionMap, blockedCallback } from "./vision.js";
import { forEachInRadius } from "./spatialIndex.js";

const INSTALLED = Symbol.for("jshack:disposition:offense-listeners:installed");
const SOCIAL_WITNESS_FACTIONS = new Set(["shopkeeper", "townfolk", "neutral"]);
const WITNESS_RADIUS = 12;

function normId(value) {
  return Number(value || 0) | 0;
}

function clampScore(value) {
  return Math.max(-100, Math.min(100, Number(value || 0)));
}

function clampSeverity(value) {
  return Math.max(0, Math.min(5, Number(value || 0) | 0));
}

function severityDelta(severity) {
  switch (clampSeverity(severity)) {
    case OFFENSE_SEVERITY.minor: return -6;
    case OFFENSE_SEVERITY.serious: return -18;
    case OFFENSE_SEVERITY.major: return -35;
    case OFFENSE_SEVERITY.severe: return -60;
    case OFFENSE_SEVERITY.unforgivable: return -90;
    default: return 0;
  }
}

export function dispositionBand(score) {
  const n = clampScore(score);
  if (n <= -85) return DISPOSITION_BANDS.wrathful;
  if (n <= -60) return DISPOSITION_BANDS.furious;
  if (n <= -30) return DISPOSITION_BANDS.angry;
  if (n <= -10) return DISPOSITION_BANDS.wary;
  if (n >= 30) return DISPOSITION_BANDS.trusted;
  return DISPOSITION_BANDS.neutral;
}

export function getDispositionRecord(world, subjectId, objectId) {
  const subject = normId(subjectId);
  const object = normId(objectId);
  if (!(subject > 0) || !(object > 0)) return null;

  if (world?.isAlive?.(subject)) {
    for (const childId of children(world, subject)) {
      const rec = world.get(childId, Disposition);
      if (rec && normId(rec.subjectId) === subject && normId(rec.objectId) === object) {
        return Object.freeze({ id: childId | 0, ...rec, band: dispositionBand(rec.score) });
      }
    }
  }

  for (const [id, rec] of world.query(Disposition)) {
    if (normId(rec.subjectId) === subject && normId(rec.objectId) === object) {
      return Object.freeze({ id: id | 0, ...rec, band: dispositionBand(rec.score) });
    }
  }
  return null;
}

function upsertDisposition(world, subjectId, objectId, patch) {
  const subject = normId(subjectId);
  const object = normId(objectId);
  if (!(subject > 0) || !(object > 0) || subject === object) return null;

  const existing = getDispositionRecord(world, subject, object);
  const next = {
    subjectId: subject,
    objectId: object,
    score: clampScore((existing?.score || 0) + Number(patch.delta || 0)),
    maxSeverity: Math.max(clampSeverity(existing?.maxSeverity || 0), clampSeverity(patch.severity || 0)),
    lastOffenseTurn: Number(patch.turn || 0) | 0,
    lastOffenseKind: String(patch.offenseKind || existing?.lastOffenseKind || "none"),
  };

  const id = existing?.id || world.create();
  if (existing) world.set(id, Disposition, next);
  else {
    world.add(id, Disposition, next);
    if (world?.isAlive?.(subject)) attach(world, id, subject);
  }
  return Object.freeze({ id: id | 0, ...next, band: dispositionBand(next.score) });
}

function isSocialWitness(world, id) {
  const fac = String(world.get(id, Faction)?.key || "").trim().toLowerCase();
  if (!SOCIAL_WITNESS_FACTIONS.has(fac)) return false;
  const vit = world.get(id, Vitality);
  return !vit || Number(vit.hp || 0) > 0;
}

function isSocialSubject(world, id) {
  const fac = String(world.get(id, Faction)?.key || "").trim().toLowerCase();
  return SOCIAL_WITNESS_FACTIONS.has(fac);
}

function collectWitnesses(world, actorId, victimId) {
  const actor = normId(actorId);
  const victim = normId(victimId);
  const at = world.get(victim, Position) || world.get(actor, Position);
  if (!at) return [];

  const witnesses = [];
  const blocked = blockedCallback(buildBlocksVisionMap(world));
  forEachInRadius(world, at.x | 0, at.y | 0, WITNESS_RADIUS, (id, pos) => {
    if (id === actor || id === victim) return;
    if (!isSocialWitness(world, id)) return;
    if (!hasLOS(pos.x | 0, pos.y | 0, at.x | 0, at.y | 0, blocked)) return;
    witnesses.push(id | 0);
  });
  return witnesses;
}

function maybeEscalateAggro(world, subjectId, objectId, rec, offense) {
  if (String(offense?.reason || "") === "thrown_out") return;
  const severity = clampSeverity(offense?.severity);
  if (severity < OFFENSE_SEVERITY.serious && rec.band !== DISPOSITION_BANDS.furious && rec.band !== DISPOSITION_BANDS.wrathful) {
    return;
  }

  const pos = world.get(objectId, Position);
  let aggro = world.get(subjectId, AggroState);
  if (!aggro && isSocialSubject(world, subjectId)) {
    try {
      world.add(subjectId, AggroState, {
        alertLevel: AGGRO_LEVELS.unaware,
        searchTurnsLeft: 0,
      });
      aggro = world.get(subjectId, AggroState);
    } catch {}
  }
  if (aggro && pos) {
    aggro.targetId = objectId | 0;
    aggro.targetReason = String(offense?.offenseKind || "offense");
    aggro.alertLevel = AGGRO_LEVELS.hunting;
    aggro.lastKnownX = pos.x | 0;
    aggro.lastKnownY = pos.y | 0;
    aggro.searchTurnsLeft = SEARCH_TURNS_HUNTING_GRACE;
  }

  world.emit("disposition:aggro-requested", {
    subjectId,
    objectId,
    disposition: rec,
    offense,
  });
}

export function applyOffenseDisposition(world, spec = {}) {
  const actorId = normId(spec.actorId ?? spec.actor);
  const victimId = normId(spec.victimId ?? spec.targetId ?? spec.shopkeeperId);
  if (!(actorId > 0) || !(victimId > 0) || actorId === victimId) return null;

  const offense = spec.offense || {};
  const attribution = String(spec.attribution || offense.attribution || OFFENSE_ATTRIBUTION.known);
  const severity = clampSeverity(spec.severity ?? offense.severity);
  const offenseKind = String(spec.offenseKind || offense.offenseKind || "unknown");
  const turn = Number(spec.turn ?? world?.step ?? 0) | 0;
  const baseDelta = severityDelta(severity);
  if (baseDelta === 0) return null;
  if (attribution === OFFENSE_ATTRIBUTION.unknown) {
    const event = Object.freeze({
      actorId,
      victimId,
      offense: Object.freeze({ ...offense, offenseKind, severity, attribution }),
    });
    world.emit("offense:unattributed", event);
    return event;
  }
  const attributionScale = attribution === OFFENSE_ATTRIBUTION.suspected ? 0.5 : 1.0;

  const changed = [];
  const victimRec = upsertDisposition(world, victimId, actorId, {
    delta: Math.ceil(baseDelta * attributionScale),
    severity,
    offenseKind,
    turn,
  });
  if (victimRec) {
    changed.push(victimRec);
    maybeEscalateAggro(world, victimId, actorId, victimRec, { ...offense, offenseKind, severity, attribution });
  }

  const explicitWitnesses = Array.isArray(spec.witnessIds) ? spec.witnessIds : null;
  const witnessIds = explicitWitnesses || (spec.collectWitnesses === false ? [] : collectWitnesses(world, actorId, victimId));
  const appliedWitnessIds = [];
  const seen = new Set([victimId]);
  for (const rawWitnessId of witnessIds) {
    const witnessId = normId(rawWitnessId);
    if (!(witnessId > 0) || witnessId === actorId || seen.has(witnessId)) continue;
    seen.add(witnessId);
    appliedWitnessIds.push(witnessId);
    const witnessRec = upsertDisposition(world, witnessId, actorId, {
      delta: Math.ceil(baseDelta * 0.5 * attributionScale),
      severity,
      offenseKind,
      turn,
    });
    if (witnessRec) changed.push(witnessRec);
  }

  const event = Object.freeze({
    actorId,
    victimId,
    offense: Object.freeze({ ...offense, offenseKind, severity, attribution }),
    witnessIds: Object.freeze(appliedWitnessIds),
    records: Object.freeze(changed),
  });
  world.emit("disposition:changed", event);
  return event;
}

export function shopDispositionTerms(world, spec = {}) {
  const shopkeeperId = normId(spec.shopkeeperId);
  const actorId = normId(spec.actorId ?? spec.actor);
  const buyMarkup = Number(spec.buyMarkup ?? 1.0);
  const sellDiscount = Number(spec.sellDiscount ?? 0.5);
  const rec = getDispositionRecord(world, shopkeeperId, actorId);
  const band = rec?.band || DISPOSITION_BANDS.neutral;
  const reputationTerms = shopReputationTerms(world, { actorId, buyMarkup: 1.0, sellDiscount: 1.0 });

  let buyMultiplier = 1.0;
  let sellMultiplier = 1.0;
  if (band === DISPOSITION_BANDS.wary) {
    buyMultiplier = 1.1;
    sellMultiplier = 0.9;
  } else if (band === DISPOSITION_BANDS.angry) {
    buyMultiplier = 1.3;
    sellMultiplier = 0.75;
  } else if (band === DISPOSITION_BANDS.furious) {
    buyMultiplier = 1.6;
    sellMultiplier = 0.5;
  } else if (band === DISPOSITION_BANDS.wrathful) {
    buyMultiplier = 2.0;
    sellMultiplier = 0.25;
  }

  return Object.freeze({
    buyMarkup: Math.max(0.1, buyMarkup * buyMultiplier * reputationTerms.buyMarkup),
    sellDiscount: Math.max(0, Math.min(1, sellDiscount * sellMultiplier * reputationTerms.sellDiscount)),
    disposition: rec,
    band,
    reputationBand: reputationTerms.band,
    shopkeeperReputation: reputationTerms.shopkeeperReputation,
    townReputation: reputationTerms.townReputation,
  });
}

export function installDispositionOffenseListeners(world) {
  if (world[INSTALLED]) return;
  world[INSTALLED] = true;

  world.on("offense:committed", (ev = {}) => {
    applyOffenseDisposition(world, ev);
  });

  world.on("shop:claim-recorded", (ev = {}) => {
    applyOffenseDisposition(world, {
      actorId: ev.actorId ?? ev.actor,
      victimId: ev.shopkeeperId,
      offense: ev.offense,
      severity: ev.severity,
      offenseKind: ev.offense?.offenseKind || ev.claimKind || ev.reason,
      collectWitnesses: false,
    });
  });
}
