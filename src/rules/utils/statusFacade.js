import { ActiveEffects } from "../components/ActiveEffects.js";
import { Beatitude } from "../components/Beatitude.js";
import { Duration } from "../components/Duration.js";
import { Equipment, NON_AMMO_GEAR_SLOTS } from "../components/Equipment.js";
import { SleepState } from "../components/SleepState.js";
import { Status } from "../components/Status.js";
import { StatusEffectNode } from "../components/StatusEffectNode.js";
import { TimedEffectNode } from "../components/TimedEffectNode.js";
import { EFFECT_DEFS } from "../data/effectDefs.js";
import { SPELL_DEFS } from "../data/spells.js";
import { descendantsWith } from "./topology.js";
import { getEffectDefinition } from "../data/effectInstances.js";

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

export const STATUS_ALIASES = Object.freeze(new Map([
  ["asleep", "sleep"],
  ["sleeping", "sleep"],
]));

/** Shared status sources for capabilities not authored by an effect definition. */
const STATUS_CAPABILITIES = Object.freeze({
  invisible: ["concealed"],
  cursed: ["cursed"],
  phase_shift: ["phase_shift"],
  rooted: ["immobilized"],
  stunned: ["immobilized", "action_locked"],
  frozen: ["immobilized", "frozen"],
  slowed: ["slowed"],
  confused: ["spell_impaired"],
  mindwiped: ["spell_impaired"],
  mindlocked: ["spell_impaired"],
  hallucinating: ["spell_impaired"],
  silence: ["silenced"],
  silenced: ["silenced"],
  sleep: ["immobilized", "action_locked"],
  stasis: ["immobilized", "action_locked"],
});

// Stasis is topology-only. Do not let an old ActiveEffects or Status write
// make it appear active again after its canonical migration.
const TOPOLOGY_ONLY_KEYS = new Set(["stasis"]);

export function canonicalStatusType(value) {
  const key = normalizeKey(value);
  return STATUS_ALIASES.get(key) || key;
}

function hasPositiveDuration(duration) {
  return duration === Infinity || (Number.isFinite(Number(duration)) && Number(duration) > 0);
}

function normalizeStrength(potency, stacks) {
  const p = Number.isFinite(potency) ? Number(potency) : 1;
  const s = Number.isInteger(stacks) && stacks > 0 ? stacks : 1;
  return Math.max(1, Math.round(Math.max(0, p) * s));
}

/**
 * @param {any} effect
 */
function isActiveEffect(effect) {
  if (!effect || typeof effect !== "object") return false;
  if ((Number(effect.onsetLeft || 0) | 0) > 0) return false;
  return hasPositiveDuration(effect.turnsLeft);
}

/**
 * Map effect keys -> projected semantic statuses.
 * Lower-cased on build.
 */
const EFFECT_KEY_TO_STATUSES = (() => {
  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (let i = 0; i < EFFECT_DEFS.length; i++) {
    const def = EFFECT_DEFS[i];
    const keys = Array.isArray(def?.keys) ? def.keys : [];
    const statuses = Array.isArray(def?.statuses)
      ? def.statuses.map((s) => normalizeKey(s)).filter(Boolean)
      : [];
    if (statuses.length <= 0) continue;
    for (let k = 0; k < keys.length; k++) {
      const key = normalizeKey(keys[k]);
      if (!key || out.has(key)) continue;
      out.set(key, statuses);
    }
  }
  for (const spell of Object.values(SPELL_DEFS)) {
    const key = normalizeKey(spell?.id);
    const statuses = Array.isArray(spell?.activeEffect?.statuses)
      ? spell.activeEffect.statuses.map((value) => normalizeKey(value)).filter(Boolean)
      : [];
    if (key && statuses.length > 0) out.set(key, statuses);
  }
  return out;
})();

const EFFECT_KEY_TO_CAPABILITIES = (() => {
  const out = new Map();
  for (let i = 0; i < EFFECT_DEFS.length; i++) {
    const def = EFFECT_DEFS[i];
    const capabilities = Array.isArray(def?.capabilities)
      ? def.capabilities.map((value) => normalizeKey(value)).filter(Boolean)
      : [];
    if (capabilities.length <= 0) continue;
    for (const rawKey of def.keys || []) {
      const key = normalizeKey(rawKey);
      if (key) out.set(key, capabilities);
    }
  }
  for (const spell of Object.values(SPELL_DEFS)) {
    const key = normalizeKey(spell?.id);
    const capabilities = Array.isArray(spell?.activeEffect?.capabilities)
      ? spell.activeEffect.capabilities.map((value) => normalizeKey(value)).filter(Boolean)
      : [];
    if (key && capabilities.length > 0) out.set(key, capabilities);
  }
  return out;
})();

function validEntity(world, entityId) {
  const id = Number(entityId || 0) | 0;
  if (!(id > 0)) return false;
  if (typeof world?.isAlive === "function") return !!world.isAlive(id);
  return true;
}

function readTopologyEffect(world, nodeId, effectNode, fallbackKey = "") {
  const key = normalizeKey(effectNode?.key || fallbackKey);
  if (!key) return null;

  const duration = world.get(nodeId, Duration);
  if (!duration) return null;
  if ((Number(duration?.onsetLeft || 0) | 0) > 0) return null;
  if (!hasPositiveDuration(duration?.turnsLeft)) return null;

  return {
    key,
    turnsLeft: duration.turnsLeft === Infinity ? Infinity : Number(duration.turnsLeft || 0) | 0,
    onsetLeft: Number(duration.onsetLeft || 0) | 0,
    potency: effectNode?.potency,
    stacks: effectNode?.stacks,
  };
}

function collectTopologyEffects(world, entityId) {
  const out = [];
  const seen = new Set();

  for (const [nodeId, effectNode] of descendantsWith(world, entityId, StatusEffectNode)) {
    const row = readTopologyEffect(world, nodeId, effectNode);
    if (!row) continue;
    out.push(row);
    seen.add(nodeId);
  }

  for (const [nodeId, timedNode] of descendantsWith(world, entityId, TimedEffectNode)) {
    if (seen.has(nodeId)) continue;
    const row = readTopologyEffect(world, nodeId, timedNode);
    if (!row) continue;
    out.push(row);
  }

  return out;
}

/**
 * Build a topology-aware status/effect snapshot for one entity.
 *
 * - Effects are read from runtime topology nodes first.
 * - Legacy ActiveEffects entries are included for migrated keys with no topology row.
 * - Statuses are projected from active effects via EFFECT_DEFS.
 * - If a status has no projected active-effect value, falls back to Status component.
 *
 * @param {{ get:(id:number, Comp:any)=>any, isAlive?:(id:number)=>boolean }} world
 * @param {number} entityId
 */
export function snapshotStatusState(world, entityId) {
  const id = Number(entityId || 0) | 0;
  if (!validEntity(world, id)) return null;

  /** @type {Map<string, number>} */
  const effectStrengths = new Map();
  /** @type {Map<string, number>} */
  const projectedStatusStrengths = new Map();
  /** @type {Map<string, number>} */
  const capabilityStrengths = new Map();
  /** @type {Map<string, Array<{kind:string, key:string, strength:number}>>} */
  const capabilitySources = new Map();

  const topologyEffects = collectTopologyEffects(world, id);
  const topologyKeys = new Set(topologyEffects.map((effect) => effect.key));

  const ae = world.get(id, ActiveEffects);
  const legacyEffects = Array.isArray(ae?.effects) ? ae.effects : [];
  const effects = topologyEffects.concat(
    legacyEffects.filter((effect) => {
      const key = normalizeKey(effect?.key);
      return !topologyKeys.has(key) && !TOPOLOGY_ONLY_KEYS.has(key);
    })
  );
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i];
    if (!isActiveEffect(e)) continue;
    const key = normalizeKey(e.key);
    if (!key) continue;

    const strength = normalizeStrength(e.potency, e.stacks);
    effectStrengths.set(key, (effectStrengths.get(key) || 0) + strength);

    const statuses = getEffectDefinition(key)?.statuses || EFFECT_KEY_TO_STATUSES.get(key);
    if (Array.isArray(statuses)) {
      for (let s = 0; s < statuses.length; s++) {
        const statusType = canonicalStatusType(statuses[s]);
        projectedStatusStrengths.set(statusType, (projectedStatusStrengths.get(statusType) || 0) + strength);
      }
    }

    const capabilities = getEffectDefinition(key)?.capabilities || EFFECT_KEY_TO_CAPABILITIES.get(key) || [];
    for (const capability of capabilities) {
      const rows = capabilitySources.get(capability) || [];
      rows.push(Object.freeze({ kind: "effect", key, strength }));
      capabilitySources.set(capability, rows);
      capabilityStrengths.set(capability, Number(capabilityStrengths.get(capability) || 0) + strength);
    }
  }

  /** @type {Map<string, number>} */
  const statusStrengths = new Map(projectedStatusStrengths);
  const stat = world.get(id, Status);
  if (stat && Array.isArray(stat.statuses)) {
    for (let i = 0; i < stat.statuses.length; i++) {
      const s = stat.statuses[i];
      const type = canonicalStatusType(s?.type);
      if (!type) continue;
      if (!hasPositiveDuration(s?.duration)) continue;
      if (TOPOLOGY_ONLY_KEYS.has(type)) continue;
      // ActiveEffects is canonical for projected statuses.
      if (projectedStatusStrengths.has(type)) continue;
      const strength = normalizeStrength(s?.potency, s?.stacks);
      statusStrengths.set(type, (statusStrengths.get(type) || 0) + strength);
    }
  }

  // Cursed equipped items contribute a 'cursed' status penalty each.
  // Blessed items grant no passive bonus — their benefit lives in their stats.
  {
    const eq = world.get(id, Equipment);
    if (eq) {
      let cursedCount = 0;
      for (let i = 0; i < NON_AMMO_GEAR_SLOTS.length; i++) {
        const slotId = Number(eq[NON_AMMO_GEAR_SLOTS[i]] || 0) | 0;
        if (slotId <= 0) continue;
        const beat = world.get(slotId, Beatitude);
        if (beat?.state === 'cursed') cursedCount++;
      }
      if (cursedCount > 0) {
        statusStrengths.set('cursed', (statusStrengths.get('cursed') || 0) + cursedCount);
      }
    }
  }

  const sleep = world.get(id, SleepState);
  if (sleep?.asleep === true) {
    statusStrengths.set("sleep", Math.max(1, Number(statusStrengths.get("sleep") || 0)));
  }

  const effectRows = Array.from(effectStrengths.entries())
    .map(([key, strength]) => Object.freeze({ key, strength }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const derivedStatusRows = Array.from(projectedStatusStrengths.entries())
    .map(([type, strength]) => Object.freeze({ type, strength }))
    .sort((a, b) => a.type.localeCompare(b.type));
  const allStatusRows = Array.from(statusStrengths.entries())
    .map(([type, strength]) => Object.freeze({ type, strength }))
    .sort((a, b) => a.type.localeCompare(b.type));

  for (const [statusType, capabilities] of Object.entries(STATUS_CAPABILITIES)) {
    const strength = Math.max(0,
      Number(statusStrengths.get(statusType) || 0)
      - Number(projectedStatusStrengths.get(statusType) || 0));
    if (strength <= 0) continue;
    for (const capability of capabilities) {
      const rows = capabilitySources.get(capability) || [];
      rows.push(Object.freeze({ kind: "status", key: statusType, strength }));
      capabilitySources.set(capability, rows);
      capabilityStrengths.set(capability, Number(capabilityStrengths.get(capability) || 0) + strength);
    }
  }
  for (const [capability, rows] of capabilitySources) {
    capabilitySources.set(capability, Object.freeze(rows));
  }

  return Object.freeze({
    entityId: id,
    effects: Object.freeze(effectRows),
    // Semantic status list is derived from active effects.
    statuses: Object.freeze(derivedStatusRows),
    // Compatibility list includes fallback Status-only entries.
    allStatuses: Object.freeze(allStatusRows),
    effectStrengths,
    derivedStatusStrengths: projectedStatusStrengths,
    statusStrengths,
    capabilityStrengths,
    capabilitySources,
  });
}

/**
 * @param {{ get:(id:number, Comp:any)=>any, isAlive?:(id:number)=>boolean }} world
 * @param {number} entityId
 * @param {string} effectKey
 */
export function effectStrength(world, entityId, effectKey) {
  const key = normalizeKey(effectKey);
  if (!key) return 0;
  const snap = snapshotStatusState(world, entityId);
  if (!snap) return 0;
  return Number(snap.effectStrengths.get(key) || 0);
}

/**
 * @param {{ get:(id:number, Comp:any)=>any, isAlive?:(id:number)=>boolean }} world
 * @param {number} entityId
 * @param {string} effectKey
 */
export function hasEffect(world, entityId, effectKey) {
  return effectStrength(world, entityId, effectKey) > 0;
}

/**
 * @param {{ get:(id:number, Comp:any)=>any, isAlive?:(id:number)=>boolean }} world
 * @param {number} entityId
 * @param {string} statusType
 */
export function statusStrength(world, entityId, statusType) {
  const key = canonicalStatusType(statusType);
  if (!key) return 0;
  const snap = snapshotStatusState(world, entityId);
  if (!snap) return 0;
  return Number(snap.statusStrengths.get(key) || 0);
}

/**
 * @param {{ get:(id:number, Comp:any)=>any, isAlive?:(id:number)=>boolean }} world
 * @param {number} entityId
 * @param {string} statusType
 */
export function hasStatus(world, entityId, statusType) {
  return statusStrength(world, entityId, statusType) > 0;
}

/**
 * @param {{ get:(id:number, Comp:any)=>any, isAlive?:(id:number)=>boolean }} world
 * @param {number} entityId
 * @param {string[]} statusTypes
 */
export function hasAnyStatus(world, entityId, statusTypes) {
  if (!Array.isArray(statusTypes) || statusTypes.length <= 0) return false;
  for (let i = 0; i < statusTypes.length; i++) {
    if (hasStatus(world, entityId, statusTypes[i])) return true;
  }
  return false;
}

/**
 * @param {{ get:(id:number, Comp:any)=>any, isAlive?:(id:number)=>boolean }} world
 * @param {number} entityId
 * @param {string} capability
 */
export function capabilityStrength(world, entityId, capability) {
  const key = normalizeKey(capability);
  if (!key) return 0;
  const snap = snapshotStatusState(world, entityId);
  if (!snap) return 0;
  return Number(snap.capabilityStrengths.get(key) || 0);
}

/**
 * @param {{ get:(id:number, Comp:any)=>any, isAlive?:(id:number)=>boolean }} world
 * @param {number} entityId
 * @param {string} capability
 */
export function hasCapability(world, entityId, capability) {
  return capabilityStrength(world, entityId, capability) > 0;
}

/**
 * @param {{ get:(id:number, Comp:any)=>any, isAlive?:(id:number)=>boolean }} world
 * @param {number} entityId
 * @param {string} capability
 */
export function capabilitySources(world, entityId, capability) {
  const key = normalizeKey(capability);
  if (!key) return [];
  const snap = snapshotStatusState(world, entityId);
  return snap?.capabilitySources.get(key) || [];
}

/**
 * Status/effect facade with per-context memoization.
 *
 * @param {{ get:(id:number, Comp:any)=>any, isAlive?:(id:number)=>boolean }} world
 * @param {{
 *   actor?: () => number,
 *   primary?: () => number,
 *   target?: () => number,
 *   attacker?: () => number,
 *   defender?: () => number,
 * }} [anchors]
 */
export function createStatusFacade(world, anchors = {}) {
  const cache = new Map();

  /**
   * @param {number} entityId
   */
  function snapshot(entityId) {
    const id = Number(entityId || 0) | 0;
    if (!validEntity(world, id)) return null;
    if (cache.has(id)) return cache.get(id);
    const next = snapshotStatusState(world, id);
    cache.set(id, next);
    return next;
  }

  /**
   * @param {number} entityId
   * @param {string} key
   */
  function readStatusStrength(entityId, key) {
    const normalized = canonicalStatusType(key);
    if (!normalized) return 0;
    const snap = snapshot(entityId);
    if (!snap) return 0;
    return Number(snap.statusStrengths.get(normalized) || 0);
  }

  /**
   * @param {number} entityId
   * @param {string} key
   */
  function readEffectStrength(entityId, key) {
    const normalized = normalizeKey(key);
    if (!normalized) return 0;
    const snap = snapshot(entityId);
    if (!snap) return 0;
    return Number(snap.effectStrengths.get(normalized) || 0);
  }

  function readCapabilityStrength(entityId, key) {
    const normalized = normalizeKey(key);
    if (!normalized) return 0;
    const snap = snapshot(entityId);
    if (!snap) return 0;
    return Number(snap.capabilityStrengths.get(normalized) || 0);
  }

  /**
   * @param {"actor"|"primary"|"target"|"attacker"|"defender"} name
   */
  function readAnchorId(name) {
    const getter = anchors[name];
    return typeof getter === "function" ? (getter() | 0) : 0;
  }

  /**
   * @param {"actor"|"primary"|"target"|"attacker"|"defender"} name
   */
  function snapshotFromAnchor(name) {
    return snapshot(readAnchorId(name));
  }

  /**
   * @param {"actor"|"primary"|"target"|"attacker"|"defender"} name
   * @param {string} statusType
   */
  function anchorHasStatus(name, statusType) {
    return readStatusStrength(readAnchorId(name), statusType) > 0;
  }

  /**
   * @param {"actor"|"primary"|"target"|"attacker"|"defender"} name
   * @param {string} statusType
   */
  function anchorStatusStrength(name, statusType) {
    return readStatusStrength(readAnchorId(name), statusType);
  }

  return Object.freeze({
    snapshot,
    hasStatus(entityId, statusType) {
      return readStatusStrength(entityId, statusType) > 0;
    },
    statusStrength(entityId, statusType) {
      return readStatusStrength(entityId, statusType);
    },
    hasAnyStatus(entityId, statusTypes) {
      if (!Array.isArray(statusTypes) || statusTypes.length <= 0) return false;
      for (let i = 0; i < statusTypes.length; i++) {
        if (readStatusStrength(entityId, statusTypes[i]) > 0) return true;
      }
      return false;
    },
    hasEffect(entityId, effectKey) {
      return readEffectStrength(entityId, effectKey) > 0;
    },
    effectStrength(entityId, effectKey) {
      return readEffectStrength(entityId, effectKey);
    },
    hasCapability(entityId, capability) {
      return readCapabilityStrength(entityId, capability) > 0;
    },
    capabilityStrength(entityId, capability) {
      return readCapabilityStrength(entityId, capability);
    },
    capabilitySources(entityId, capability) {
      const normalized = normalizeKey(capability);
      if (!normalized) return [];
      return snapshot(entityId)?.capabilitySources.get(normalized) || [];
    },
    actor() { return snapshotFromAnchor("actor"); },
    primary() { return snapshotFromAnchor("primary"); },
    target() { return snapshotFromAnchor("target"); },
    attacker() { return snapshotFromAnchor("attacker"); },
    defender() { return snapshotFromAnchor("defender"); },
    actorHasStatus(statusType) { return anchorHasStatus("actor", statusType); },
    targetHasStatus(statusType) { return anchorHasStatus("target", statusType); },
    attackerHasStatus(statusType) { return anchorHasStatus("attacker", statusType); },
    defenderHasStatus(statusType) { return anchorHasStatus("defender", statusType); },
    actorStatusStrength(statusType) { return anchorStatusStrength("actor", statusType); },
    targetStatusStrength(statusType) { return anchorStatusStrength("target", statusType); },
    attackerStatusStrength(statusType) { return anchorStatusStrength("attacker", statusType); },
    defenderStatusStrength(statusType) { return anchorStatusStrength("defender", statusType); },
  });
}
