import { defineExtension } from "../../lib/ecs-js/index.js";
import { PuffSpawned } from "../../events/PuffSpawned.js";
import { Teleported } from "../../events/Teleported.js";
import { AggroState, AGGRO_LEVELS } from "../components/AggroState.js";
import { Inventory } from "../components/Inventory.js";
import { Interactable } from "../components/Interactable.js";
import { MoveIntent } from "../components/Intents/MoveIntent.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { Position } from "../components/Position.js";
import { ScriptState } from "../components/ScriptState.js";
import { ShopInventory } from "../components/ShopInventory.js";
import { Unpaid } from "../components/Unpaid.js";
import { isWalkable } from "../environment/dungeon/tileMap.js";
import { CARDINAL_DIRS } from "../utils/directions.js";
import { isEntityOnCurrentFloor } from "../utils/floorEntities.js";
import { playerEntity } from "../utils/queries.js";
import { currentDepth } from "../utils/worldAccess.js";
import { getMonster } from "../data/monsters.js";
import { toMonsterSpawnParams } from "../utils/monsterSpawnParams.js";
import { spawnMonsterEntity } from "../utils/spawnMonsterEntity.js";
import { findActiveEncounter } from "../utils/encounters.js";

const APPEAR_MIN_TURNS = 45;
const APPEAR_SPREAD_TURNS = 90;
const NEAR_RADIUS_MIN = 4;
const NEAR_RADIUS_MAX = 9;
const VANISH_MIN_TURNS = 4;
const VANISH_SPREAD_TURNS = 4;
const RATATOSKR_LISTENERS_KEY = Symbol.for("jshack:ratatoskr:listeners");

const RATATOSKR_STATES = Object.freeze({
  dormant: "dormant",
  appearing: "appearing",
  present: "present",
  conversing: "conversing",
  coolingOff: "cooling_off",
  vanishing: "vanishing",
});

function chebyshev(a, b) {
  return Math.max(Math.abs((a.x | 0) - (b.x | 0)), Math.abs((a.y | 0) - (b.y | 0)));
}

function ensureRatatoskrState(world, id) {
  let state = world.get(id, ScriptState);
  if (!state) {
    try { world.add(id, ScriptState, { data: {} }); } catch {}
    state = world.get(id, ScriptState);
  }
  if (!state || !state.data || typeof state.data !== "object") return null;
  if (!state.data.ratatoskr || typeof state.data.ratatoskr !== "object") {
    state.data.ratatoskr = {
      state: RATATOSKR_STATES.dormant,
      nextAppearTurn: (world.step | 0) + APPEAR_MIN_TURNS,
      visits: 0,
      lastBarkTurn: -9999,
      vanishTurn: 0,
      trigger: "",
    };
  }
  if (!state.data.ratatoskr.state) state.data.ratatoskr.state = RATATOSKR_STATES.dormant;
  if (!Number.isFinite(Number(state.data.ratatoskr.vanishTurn))) state.data.ratatoskr.vanishTurn = 0;
  if (typeof state.data.ratatoskr.trigger !== "string") state.data.ratatoskr.trigger = "";
  return state.data.ratatoskr;
}

function ensureRatatoskrAffordances(world, id) {
  if (!world.has(id, Interactable)) {
    try {
      world.add(id, Interactable, {
        action: "talkToNPC",
        params: { dialogId: "norse:ratatoskr", dialogue: "Ratatoskr vibrates with news." },
      });
    } catch {}
  }
  if (!world.has(id, ShopInventory)) {
    try { world.add(id, ShopInventory, { buyMarkup: 3.0, sellDiscount: 0.15 }); } catch {}
  }
  if (!world.has(id, Inventory)) {
    try { world.add(id, Inventory, { capacity: 12 }); } catch {}
  } else {
    const inv = world.get(id, Inventory);
    if (inv && (Number(inv.capacity || 0) | 0) < 12) inv.capacity = 12;
  }
  const aggro = world.get(id, AggroState);
  if (aggro && aggro.alertLevel !== AGGRO_LEVELS.unaware) {
    aggro.alertLevel = AGGRO_LEVELS.unaware;
    aggro.targetId = 0;
  }
}

function clearFloorCache(world, shopkeeperId) {
  const dead = [];
  for (const [itemId, unpaid] of world.query(Unpaid)) {
    if ((unpaid.shopkeeperId | 0) === (shopkeeperId | 0) && world.has(itemId, Position)) dead.push(itemId);
  }
  for (const itemId of dead) {
    if (world.isAlive(itemId)) world.destroy(itemId);
  }
}

function pickNearPlayer(world, playerPos) {
  const px = playerPos.x | 0;
  const py = playerPos.y | 0;
  const start = Math.floor(world.rand() * CARDINAL_DIRS.length) | 0;
  for (let ring = NEAR_RADIUS_MIN; ring <= NEAR_RADIUS_MAX; ring++) {
    for (let i = 0; i < CARDINAL_DIRS.length; i++) {
      const dir = CARDINAL_DIRS[(start + i) % CARDINAL_DIRS.length];
      const side = world.rand() < 0.5 ? -1 : 1;
      const skew = Math.floor(world.rand() * (ring + 1)) * side;
      const x = px + dir.dx * ring + (dir.dy !== 0 ? skew : 0);
      const y = py + dir.dy * ring + (dir.dx !== 0 ? skew : 0);
      if (isWalkable(x, y)) return { x, y };
    }
  }
  return null;
}

function scheduleNext(world, state) {
  state.nextAppearTurn = (world.step | 0) + APPEAR_MIN_TURNS + (Math.floor(world.rand() * APPEAR_SPREAD_TURNS) | 0);
  state.trigger = "";
}

function scheduleVanish(world, state) {
  state.state = RATATOSKR_STATES.coolingOff;
  state.vanishTurn = (world.step | 0) + VANISH_MIN_TURNS + (Math.floor(world.rand() * VANISH_SPREAD_TURNS) | 0);
}

function bark(world, id, text) {
  world.emit?.("npc:dialogue", {
    actor: id,
    text,
  });
}

function ratatoskrEntities(world) {
  const out = [];
  for (const [id, ni] of world.query(NamedIdentity)) {
    if (String(ni?.identity || "") === "ratatoskr") out.push({ id, pos: world.get(id, Position) });
  }
  return out;
}

function ensureActivatedRatatoskr(world, encounter) {
  const state = encounter?.state;
  const existingId = Number(state?.activeEntityId || 0) | 0;
  if (existingId > 0 && world.isAlive(existingId)) return existingId;

  const def = getMonster("ratatoskr");
  if (!def) return 0;
  const id = spawnMonsterEntity(world, {
    ...toMonsterSpawnParams(def, 0),
    x: 0,
    y: 0,
  });
  if (world.has(id, Position)) world.remove(id, Position);
  state.activeEntityId = id;
  return id;
}

function emitRatatoskrTeleport(world, id, from, to) {
  world.emit(new Teleported({ id, from, to, source: "ratatoskr" }));
}

function emitRatatoskrPuff(world, at) {
  world.emit(new PuffSpawned({ at, source: "ratatoskr", kind: "smoke" }));
}

function setRatatoskrPosition(world, id, pos) {
  if (world.has(id, Position)) {
    world.set(id, Position, pos);
  } else {
    world.add(id, Position, pos);
  }
}

function appearRatatoskr(world, id, state, dest, from = null) {
  state.state = RATATOSKR_STATES.appearing;
  clearFloorCache(world, id);
  if (from) emitRatatoskrPuff(world, from);
  setRatatoskrPosition(world, id, dest);
  emitRatatoskrTeleport(world, id, from, dest);
  emitRatatoskrPuff(world, dest);
  state.visits = (Number(state.visits || 0) | 0) + 1;
  state.lastBarkTurn = world.step | 0;
  state.vanishTurn = 0;
  state.state = RATATOSKR_STATES.present;
  bark(world, id, state.trigger === "quest:completed"
    ? "A red-brown streak lands nearby. 'Someone finished a story. That always starts a worse one.'"
    : "A red-brown streak drops out of nowhere. 'Wrong tree, right customer.'");
  scheduleNext(world, state);
}

function vanishRatatoskr(world, id, state, pos) {
  if (!pos) return;
  state.state = RATATOSKR_STATES.vanishing;
  clearFloorCache(world, id);
  emitRatatoskrPuff(world, pos);
  emitRatatoskrTeleport(world, id, pos, null);
  try { if (world.has(id, Position)) world.remove(id, Position); } catch {}
  state.vanishTurn = 0;
  state.state = RATATOSKR_STATES.dormant;
  scheduleNext(world, state);
}

function markRatatoskrTrigger(world, reason) {
  for (const { id } of ratatoskrEntities(world)) {
    const state = ensureRatatoskrState(world, id);
    if (!state) continue;
    if (state.state !== RATATOSKR_STATES.dormant) continue;
    state.trigger = String(reason || "omen");
    state.nextAppearTurn = Math.min(Number(state.nextAppearTurn || 0) | 0, (world.step | 0) + 2);
  }
}

function scheduleRatatoskrVanish(world, targetId) {
  const id = Number(targetId || 0) | 0;
  if (!(id > 0)) return;
  const ni = world.get(id, NamedIdentity);
  if (String(ni?.identity || "") !== "ratatoskr") return;
  const state = ensureRatatoskrState(world, id);
  if (!state) return;
  scheduleVanish(world, state);
}

export const ratatoskrListeners = defineExtension("jshack:ratatoskr:listeners", (world) => {
  const offOpened = world.on("dialog:opened", (payload) => {
    if (String(payload?.dialogId || "") !== "norse:ratatoskr") return;
    const state = ensureRatatoskrState(world, Number(payload?.targetId || 0) | 0);
    if (state) {
      state.state = RATATOSKR_STATES.conversing;
      state.vanishTurn = 0;
    }
  });
  const offClosed = world.on("dialog:closed", (payload) => {
    if (String(payload?.dialogId || "") !== "norse:ratatoskr") return;
    scheduleRatatoskrVanish(world, payload?.targetId);
  });
  const offQuest = world.on("quest:completed", () => {
    markRatatoskrTrigger(world, "quest:completed");
  });
  return () => { offOpened(); offClosed(); offQuest(); };
}, { key: RATATOSKR_LISTENERS_KEY });

export function installRatatoskrListeners(world) {
  world.install(ratatoskrListeners);
}

export function ratatoskrSystem(world) {
  if (currentDepth(world, 1) !== 0) return;
  const player = playerEntity(world);
  if (!player) return;

  const activatedEncounter = findActiveEncounter(world, "norse:ratatoskr");
  const existing = ratatoskrEntities(world);
  if (activatedEncounter) {
    ensureActivatedRatatoskr(world, activatedEncounter);
  } else if (existing.length === 0) {
    return;
  }

  for (const rec of ratatoskrEntities(world)) {
    const id = rec.id;
    const stateBeforeFloor = ensureRatatoskrState(world, id);
    if (rec.pos && !isEntityOnCurrentFloor(world, id, { fallbackWhenNoDungeonState: true })) continue;
    ensureRatatoskrAffordances(world, id);
    const state = stateBeforeFloor;
    if (!state) continue;
    if (activatedEncounter && state.state === RATATOSKR_STATES.dormant && state.trigger === "" && String(activatedEncounter.state.activationSource || "").startsWith("quest:")) {
      state.trigger = "quest:completed";
      state.nextAppearTurn = Math.min(Number(state.nextAppearTurn || 0) | 0, (world.step | 0) + 2);
    }
    const phase = String(state.state || RATATOSKR_STATES.dormant);

    if (phase === RATATOSKR_STATES.dormant) {
      const dist = rec.pos ? chebyshev(rec.pos, player.pos) : Infinity;
      if (rec.pos && dist <= 2) {
        state.state = RATATOSKR_STATES.present;
        continue;
      }
      if (rec.pos && (Number(state.visits || 0) | 0) <= 0 && (world.step | 0) < (Number(state.nextAppearTurn || 0) | 0)) {
        try { world.remove(id, Position); } catch {}
      }
      if ((world.step | 0) >= (Number(state.nextAppearTurn || 0) | 0)) {
        const dest = pickNearPlayer(world, player.pos);
        if (dest) appearRatatoskr(world, id, state, dest, rec.pos || null);
      }
      continue;
    }

    if (!rec.pos) {
      state.state = RATATOSKR_STATES.dormant;
      continue;
    }

    if ((Number(state.vanishTurn || 0) | 0) > 0 && (world.step | 0) >= (Number(state.vanishTurn || 0) | 0)) {
      vanishRatatoskr(world, id, state, rec.pos);
      continue;
    }

    const dist = chebyshev(rec.pos, player.pos);
    if (dist <= 2) {
      state.nextAppearTurn = Math.max(Number(state.nextAppearTurn || 0) | 0, (world.step | 0) + 20);
      if ((world.step | 0) - (Number(state.lastBarkTurn || 0) | 0) >= 80) {
        state.lastBarkTurn = world.step | 0;
        bark(world, id, "Ratatoskr says, 'If you hear your name from underground, answer in someone else's voice.'");
      }
      continue;
    }

    if (dist <= 10 && !world.has(id, MoveIntent) && world.rand() < 0.30) {
      const dir = CARDINAL_DIRS[Math.floor(world.rand() * CARDINAL_DIRS.length)];
      const nx = (rec.pos.x | 0) + dir.dx;
      const ny = (rec.pos.y | 0) + dir.dy;
      if (isWalkable(nx, ny)) {
        try { world.add(id, MoveIntent, { dx: dir.dx, dy: dir.dy }); } catch {}
      }
    }
  }
}
