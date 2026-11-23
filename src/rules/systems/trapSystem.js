import { Position } from "../components/Position.js";
import { Trap } from "../components/Trap.js";
import { Vitality } from "../components/Vitality.js";
import { Player } from "../components/Player.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { runScript, ScriptVerb } from "../scripting.js";
import { resolveCanonicalStats } from "../utils/canonicalStats.js";
import { mulberry32, rngInt, combatSeed, pct } from "../utils/rng.js";
import { statusStrength } from "../utils/statusFacade.js";
import { chebyshevScalar } from "../utils/distance.js";
import { defineExtension } from "../../lib/ecs-js/index.js";
import { TrapStepQueueResource } from "../resources/trapStepQueue.js";
import { TrapDodgePromptStateResource } from "../resources/trapDodgePromptState.js";
import { TrapDodgePrompted } from "../../events/TrapDodgePrompted.js";
import { TrapDodgeResolved } from "../../events/TrapDodgeResolved.js";
import { TrapDodgeUiEnabled } from "../../events/TrapDodgeUiEnabled.js";
import { resolveDisarmTrapAttempt } from "./disarmTrapSystem.js";

// Traps only arm when the player is within this radius.  Monsters wander freely
// beyond it so the dungeon feels alive; once the player closes in, traps go hot
// and any monster that blunders onto one triggers it in full view.
const TRAP_ARM_RADIUS = 12;

function resetEveryTurns(t) {
  const raw = Number(t?.params?.resetsEvery || 0);
  return Number.isFinite(raw) && raw > 0 ? Math.max(1, raw | 0) : 0;
}

function triggeredTrapState(t, world) {
  const resetsEvery = resetEveryTurns(t);
  if (resetsEvery <= 0) return { ...t, revealed: true, armed: false };
  return {
    ...t,
    revealed: true,
    armed: false,
    params: {
      ...(t.params || {}),
      resetAtStep: (Number(world.step || 0) | 0) + resetsEvery,
    },
  };
}

function rearmDueTraps(world) {
  const now = Number(world.step || 0) | 0;
  for (const [tid, , t] of world.query(Position, Trap)) {
    if (!t || t.armed) continue;
    const resetAtStep = Number(t?.params?.resetAtStep || 0) | 0;
    if (resetAtStep <= 0 || now < resetAtStep) continue;
    const params = { ...(t.params || {}) };
    delete params.resetAtStep;
    try { world.set(tid, Trap, { ...t, armed: true, params }); } catch {}
  }
}

function trapIsArmedNow(t, world) {
  if (!t) return false;
  if (t.armed) return true;
  const resetAtStep = Number(t?.params?.resetAtStep || 0) | 0;
  return resetAtStep > 0 && (Number(world.step || 0) | 0) >= resetAtStep;
}

function clearResetMarker(t) {
  if (!t?.params?.resetAtStep) return t;
  const params = { ...(t.params || {}) };
  delete params.resetAtStep;
  return { ...t, params };
}

function fallbackScriptForTrap(type) {
  const fallbackScripts = {
    spike: "trap_spike",
    snake: "trap_snake",
    shock: "trap_shock",
    pit: "trap_pit",
    siphon: "trap_siphon",
    rust: "trap_rust",
    swarm: "trap_swarm",
    arrow: "trap_arrow",
    water: "trap_water",
  };
  return fallbackScripts[type] || "";
}

function ensureTrapIdentity(world, trapId, t) {
  const ident = world.get(trapId, NamedIdentity);
  if (ident) return;
  const trapNames = {
    spike: "Spike Trap",
    snake: "Snake Trap",
    shock: "Shock Trap",
    pit: "Pit Trap",
    siphon: "Siphon Trap",
    rust: "Rust Trap",
    swarm: "Swarm Trap",
    arrow: "Arrow Trap",
  };
  const name = trapNames[t.type] || "Trap";
  const identity = "trap_" + (t.type || "spike");
  try { world.add(trapId, NamedIdentity, { name, identity }); } catch {}
}

function resolveTrapHit(world, trapId, t, victimId) {
  ensureTrapIdentity(world, trapId, t);
  world.emit("trap:triggered", { trapId, victimId, type: t.type });

  const scriptKey = t.script || fallbackScriptForTrap(t.type);
  if (scriptKey) {
    runScript(scriptKey, ScriptVerb.TrapTrigger, world, {
      trapId,
      targetId: victimId,
      trap: t,
      params: t.params || {},
    });
  }

  try { world.set(trapId, Trap, triggeredTrapState(clearResetMarker(t), world)); } catch {}
  return true;
}

function resolveTrapDodge(world, trapId, t, victimId) {
  try { world.set(trapId, Trap, { ...clearResetMarker(t), revealed: true, armed: true }); } catch {}
  world.emit("trap:avoided", { victimId, trapId, type: t.type });
  return false;
}

function trapDodgeContext(world, trapId, t, victimId) {
  const dc = t.difficulty || 10;
  const stats = resolveCanonicalStats(world, victimId);
  const evade = Number(stats?.evade || 0);
  const avoidSeed = combatSeed(world.seed, world.step, victimId, trapId, 0x7A9);
  const avoidRng = mulberry32(avoidSeed);
  const avoidRoll = rngInt(avoidRng, 1, 20);
  let avoided = (avoidRoll + evade) >= (dc + 5);

  const luck = Number(stats?.luck || 0) + statusStrength(world, victimId, "lucky");
  if (!avoided && luck > 0) {
    avoided = pct(avoidRng, luck);
  } else if (avoided && luck < 0) {
    avoided = !pct(avoidRng, -luck);
  }

  const durationMs = Math.max(500, Math.min(2200, 850 + Math.max(0, evade) * 70));
  const angleDeg = rngInt(avoidRng, 0, 359);
  return { avoided, evade, durationMs, angleDeg };
}

function triggerTrap(world, trapId, t, victimId, playerId) {
  const isPlayerVictim = victimId === playerId;

  if (!isPlayerVictim) {
    return resolveTrapHit(world, trapId, t, victimId);
  }

  if (t.revealed) {
    if (!t.armed && trapIsArmedNow(t, world)) {
      try { world.set(trapId, Trap, { ...clearResetMarker(t), armed: true }); } catch {}
    }
    return resolveDisarmTrapAttempt(world, victimId, { trapId });
  }

  const dodge = trapDodgeContext(world, trapId, t, victimId);
  const promptState = world.resource(TrapDodgePromptStateResource);
  if (promptState.enabled) {
    const promptId = [
      "trap",
      Number(world.step || 0) | 0,
      victimId,
      trapId,
    ].join(":");
    promptState.pending.set(promptId, {
      trapId,
      victimId,
      trap: clearResetMarker(t),
    });
    world.emit(new TrapDodgePrompted({
      promptId,
      victimId,
      trapId,
      type: t.type,
      durationMs: dodge.durationMs,
      angleDeg: dodge.angleDeg,
      evade: dodge.evade,
    }));
    return false;
  }

  return dodge.avoided
    ? resolveTrapDodge(world, trapId, t, victimId)
    : resolveTrapHit(world, trapId, t, victimId);
}

export const trapDodgePromptExtension = defineExtension("jshack:trap:dodgePrompt", (world) => {
  world.on(TrapDodgeUiEnabled, (event) => {
    world.resource(TrapDodgePromptStateResource).enabled = event.enabled !== false;
  });

  world.on(TrapDodgeResolved, (event) => {
    const promptState = world.resource(TrapDodgePromptStateResource);
    const pending = promptState.pending.get(event.promptId);
    if (!pending) return;
    promptState.pending.delete(event.promptId);
    if (pending.victimId !== event.victimId || pending.trapId !== event.trapId) return;
    if (!world.isAlive(pending.victimId)) return;
    const current = world.get(pending.trapId, Trap);
    if (!current || !trapIsArmedNow(current, world)) return;

    if (event.dodged) {
      resolveTrapDodge(world, pending.trapId, current, pending.victimId);
    } else {
      resolveTrapHit(world, pending.trapId, current, pending.victimId);
    }
  });
});

function findPlayer(world) {
  for (const [id, pos] of world.query(Position, Player)) {
    if (!pos) continue;
    return { id, x: pos.x | 0, y: pos.y | 0 };
  }
  return null;
}

function processTrapArrival(world, arrival) {
  const player = findPlayer(world);
  if (!player) return false;

  const victimId = Number(arrival.actor || 0) | 0;
  if (!(victimId > 0) || !world.isAlive(victimId)) return false;
  const vit = world.get(victimId, Vitality);
  if (!vit || Number(vit.hp || 0) <= 0) return false;

  for (const [tid, tpos, t] of world.query(Position, Trap)) {
    if (!tpos || !t || !trapIsArmedNow(t, world)) continue;
    if ((tpos.x | 0) !== arrival.x || (tpos.y | 0) !== arrival.y) continue;
    if (chebyshevScalar(tpos.x | 0, tpos.y | 0, player.x, player.y) > TRAP_ARM_RADIUS) continue;
    triggerTrap(world, tid, t, victimId, player.id);
    return true;
  }
  return false;
}

export const trapStepListenerExtension = defineExtension("jshack:trap:stepListener", (world) => {
  world.on("moved", ({ id, from, to }) => {
    const actor = Number(id || 0) | 0;
    if (!(actor > 0)) return;
    const tx = Number.isFinite(to?.x) ? (to.x | 0) : 0;
    const ty = Number.isFinite(to?.y) ? (to.y | 0) : 0;
    const fx = Number.isFinite(from?.x) ? (from.x | 0) : tx;
    const fy = Number.isFinite(from?.y) ? (from.y | 0) : ty;
    if (fx === tx && fy === ty) return;
    if (!processTrapArrival(world, { actor, x: tx, y: ty })) {
      world.resource(TrapStepQueueResource).push({ actor, x: tx, y: ty });
    }
  });
});

/** @param {import('../../lib/ecs-js/index.js').World} world */
export function trapSystem(world) {
  rearmDueTraps(world);

  const arrivals = world.resource(TrapStepQueueResource).splice(0);
  for (const arrival of arrivals) {
    processTrapArrival(world, arrival);
  }
}
