import { ActiveEffects } from "../components/ActiveEffects.js";
import { AggroState } from "../components/AggroState.js";
import { Faction } from "../components/Faction.js";
import { MoveIntent } from "../components/Intents/MoveIntent.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { Position } from "../components/Position.js";
import { forEachInRadius } from "../utils/spatialIndex.js";
import { createStatusEvent } from "../../shared/events/statusEvent.js";
import { ensureActiveEffects } from "../utils/effects.js";
import { setAggroTarget } from "../utils/aggroTarget.js";

const TAUNT_INSTALLED_KEY = Symbol.for("jshack:taunt:installed");
const TAUNT_EFFECT_KEYS = Object.freeze(new Set(["taunt", "taunted"]));
const STONE_TAUNTER_IDENTITY = "stone_taunter";
const STONE_TAUNT_RADIUS = 4;
const STONE_TAUNT_TURNS = 3;
const STONE_TAUNT_POTENCY = 1;
const STONE_TAUNT_TARGET_FACTION = "enemy";

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function readPoint(raw, fallback) {
  const x = Number(raw?.x);
  const y = Number(raw?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return { x: x | 0, y: y | 0 };
  }
  return { x: fallback.x | 0, y: fallback.y | 0 };
}

/**
 * @param {any} effect
 */
function isActiveTaunt(effect) {
  if (!effect || typeof effect !== "object") return false;
  if ((Number(effect.onsetLeft || 0) | 0) > 0) return false;
  if ((Number(effect.turnsLeft || 0) | 0) <= 0) return false;
  return TAUNT_EFFECT_KEYS.has(normalizeKey(effect.key));
}

/**
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} targetId
 * @param {{ sourceId: number, turnsLeft: number, potency: number }} spec
 */
function upsertTauntEffect(world, targetId, spec) {
  const ae = ensureActiveEffects(world, targetId);
  if (!ae) return { applied: false, created: false };

  const sourceId = Number(spec.sourceId || 0) | 0;
  const turnsLeft = Math.max(1, Number(spec.turnsLeft || 0) | 0);
  const potency = Math.max(1, Number(spec.potency || 0));

  for (let i = 0; i < ae.effects.length; i++) {
    const effect = ae.effects[i];
    if (!effect || !TAUNT_EFFECT_KEYS.has(normalizeKey(effect.key))) continue;
    if ((Number(effect.sourceId || 0) | 0) !== sourceId) continue;
    effect.key = "taunt";
    effect.turnsLeft = Math.max(Number(effect.turnsLeft || 0) | 0, turnsLeft);
    effect.potency = potency;
    effect.stacks = 1;
    effect.sourceId = sourceId;
    if ((Number(effect.onsetLeft || 0) | 0) > 0) effect.onsetLeft = 0;
    return { applied: true, created: false };
  }

  ae.effects.push({
    key: "taunt",
    turnsLeft,
    potency,
    stacks: 1,
    sourceId,
  });
  return { applied: true, created: true };
}

/**
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 */
function cardinalStepToward(from, to) {
  const dxp = (to.x | 0) - (from.x | 0);
  const dyp = (to.y | 0) - (from.y | 0);
  const dx0 = Math.sign(dxp) | 0;
  const dy0 = Math.sign(dyp) | 0;
  if ((dx0 | dy0) === 0) return null;
  if (Math.abs(dxp) >= Math.abs(dyp)) return { dx: dx0, dy: 0 };
  return { dx: 0, dy: dy0 };
}

/**
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} entityId
 * @returns {number}
 */
function getTauntSourceId(world, entityId) {
  const ae = world.get(entityId, ActiveEffects);
  if (!ae || !Array.isArray(ae.effects)) return 0;

  for (let i = 0; i < ae.effects.length; i++) {
    const effect = ae.effects[i];
    if (!isActiveTaunt(effect)) continue;
    const sourceId = Number(effect.sourceId || 0) | 0;
    if (!(sourceId > 0)) continue;
    if (!world.isAlive(sourceId)) continue;
    if (!world.get(sourceId, Position)) continue;
    return sourceId;
  }
  return 0;
}

/**
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {any} payload
 */
function applyTauntArea(world, payload) {
  const sourceId = Number(payload?.sourceId || 0) | 0;
  if (!(sourceId > 0) || !world.isAlive(sourceId)) return;

  const sourcePos = world.get(sourceId, Position);
  if (!sourcePos) return;

  const center = readPoint(payload, sourcePos);
  const radius = Math.max(0, Number(payload?.radius || 0) | 0);
  const turnsLeft = Math.max(1, Number(payload?.turnsLeft || 0) | 0);
  const potency = Math.max(1, Number(payload?.potency || 0));
  const targetFaction = String(payload?.targetFaction || "enemy");

  forEachInRadius(world, center.x, center.y, radius, (id, pos) => {
    if ((id | 0) === sourceId) return;
    const faction = world.get(id, Faction);
    if (targetFaction && String(faction?.key || "") !== targetFaction) return;
    const result = upsertTauntEffect(world, id, { sourceId, turnsLeft, potency });
    if (!result.applied) return;
    world.emit?.("taunt:applied", {
      targetId: id,
      sourceId,
      turnsLeft,
      potency,
      reason: String(payload?.reason || "taunt"),
      at: { x: pos.x | 0, y: pos.y | 0 },
    });
    if (result.created) {
      try {
        world.emit?.("status", createStatusEvent({
          id,
          kind: "taunt",
          effect: "taunt",
          source: sourceId,
          at: { x: pos.x | 0, y: pos.y | 0 },
        }));
      } catch (e) { console.debug('[tauntSystem] emit status failed:', e); }
    }
  });
}

/**
 * Stone taunter aura pulse that can be reused by spawn hooks and per-turn updates.
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} sourceId
 * @param {{ x: number, y: number }} center
 */
function applyStoneTauntPulse(world, sourceId, center) {
  applyTauntArea(world, {
    sourceId,
    x: center.x | 0,
    y: center.y | 0,
    radius: STONE_TAUNT_RADIUS,
    turnsLeft: STONE_TAUNT_TURNS,
    potency: STONE_TAUNT_POTENCY,
    targetFaction: STONE_TAUNT_TARGET_FACTION,
  });
}

/**
 * Refresh taunt aura every turn so taunt remains an active area spell.
 * @param {import("../../lib/ecs-js/index.js").World} world
 */
function refreshStoneTauntAuras(world) {
  for (const [id, ni, pos] of world.query(NamedIdentity, Position)) {
    if (String(ni?.identity || "") !== STONE_TAUNTER_IDENTITY) continue;
    applyStoneTauntPulse(world, id, pos);
  }
}

/**
 * Install generic taunt event listeners once per world.
 * @param {import("../../lib/ecs-js/index.js").World} world
 */
export function installTauntListener(world) {
  if (!world || world[TAUNT_INSTALLED_KEY]) return;
  world[TAUNT_INSTALLED_KEY] = true;

  world.on("spawned", ({ id, kind, at }) => {
    const spawnedId = Number(id || 0) | 0;
    if (!(spawnedId > 0)) return;
    if (String(kind || "") !== "monster") return;

    const ni = world.get(spawnedId, NamedIdentity);
    if (String(ni?.identity || "") !== STONE_TAUNTER_IDENTITY) return;

    const pos = world.get(spawnedId, Position) || { x: 0, y: 0 };
    const center = readPoint(at, pos);
    applyStoneTauntPulse(world, spawnedId, center);
  });

  world.on("taunt:apply-area", (payload) => {
    applyTauntArea(world, payload);
  });
}

/**
 * Overwrite enemy MoveIntent toward taunt source while taunt is active.
 * @param {import("../../lib/ecs-js/index.js").World} world
 */
export function tauntSteeringSystem(world) {
  // Keep stone-taunt active over time so nearby/new enemies stay affected.
  refreshStoneTauntAuras(world);

  for (const [id, intent] of world.query(MoveIntent)) {
    if (intent.cancelled === true) continue;
    const faction = world.get(id, Faction);
    if (String(faction?.key || "") !== "enemy") continue;

    const sourceId = getTauntSourceId(world, id);
    if (!(sourceId > 0)) continue;

    const pos = world.get(id, Position);
    const sourcePos = world.get(sourceId, Position);
    if (!pos || !sourcePos) continue;

    const step = cardinalStepToward(pos, sourcePos);
    if (!step) continue;

    const aggro = world.get(id, AggroState);
    if (aggro) setAggroTarget(world, id, aggro, sourceId, "taunt");

    intent.dx = step.dx;
    intent.dy = step.dy;
  }
}
