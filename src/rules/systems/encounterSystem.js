import { defineExtension } from "../../lib/ecs-js/index.js";
import { EncounterActivated } from "../../events/EncounterActivated.js";
import { EncounterState, ENCOUNTER_STATES } from "../components/EncounterState.js";
import { DeathApplied } from "../components/DeathApplied.js";
import { DungeonState } from "../components/DungeonState.js";
import { Position } from "../components/Position.js";
import { getAllEncounters, getEncounter } from "../data/encounters.js";
import { getMonster } from "../data/monsters.js";
import { spawnMonsterEntity } from "../utils/spawnMonsterEntity.js";
import { toMonsterSpawnParams } from "../utils/monsterSpawnParams.js";
import { attachEntityToCurrentFloor } from "../utils/floorEntities.js";
import { isWalkable } from "../environment/dungeon/tileMap.js";
import { findEncounterState } from "../utils/encounters.js";
import { playerEntity } from "../utils/queries.js";

function matchesActivation(activation, eventName, payload) {
  if (!activation || typeof activation !== "object") return false;
  if (Array.isArray(activation.any)) {
    return activation.any.some((entry) => matchesActivation(entry, eventName, payload));
  }
  if (Array.isArray(activation.all)) {
    return activation.all.every((entry) => matchesActivation(entry, eventName, payload));
  }
  if (String(activation.type || "") !== eventName) return false;
  if (eventName === "questCompleted") {
    return String(activation.questId || "") === String(payload?.questId || "");
  }
  return false;
}

function activateEncounter(world, def, source) {
  if (findEncounterState(world, def.id)) return 0;
  const id = world.create();
  world.add(id, EncounterState, {
    encounterId: def.id,
    status: ENCOUNTER_STATES.active,
    activeEntityId: 0,
    activationStep: world.step | 0,
    activationSource: source,
  });
  world.emit(new EncounterActivated({
    encounterId: def.id,
    creatureId: def.creatureId || "",
    stateId: id,
    source,
    step: world.step | 0,
  }));
  return id;
}

function currentDepth(world) {
  for (const [, ds] of world.query(DungeonState)) return Number(ds?.currentDepth || 0) | 0;
  return 0;
}

function placementMatches(world, def) {
  const placement = def.placement || {};
  const depth = currentDepth(world);
  const plane = String(placement.plane || "");
  if (plane === "overworld" && depth !== 0) return false;
  if (plane === "underworld" && depth <= 0) return false;
  if (Number.isFinite(placement.minDepth) && depth < (Number(placement.minDepth) | 0)) return false;
  if (Number.isFinite(placement.maxDepth) && depth > (Number(placement.maxDepth) | 0)) return false;
  return true;
}

function occupied(world, x, y) {
  for (const [, pos] of world.query(Position)) {
    if ((pos.x | 0) === (x | 0) && (pos.y | 0) === (y | 0)) return true;
  }
  return false;
}

function findNearPlayer(world) {
  const player = playerEntity(world);
  const pos = player ? world.get(player.id, Position) : null;
  if (!pos) return null;
  for (let radius = 3; radius <= 8; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = (pos.x | 0) + dx;
        const y = (pos.y | 0) + dy;
        if (!isWalkable(x, y) || occupied(world, x, y)) continue;
        return { x, y };
      }
    }
  }
  return null;
}

function materializeSingleton(world, def, state) {
  if (String(def.materialization || "") !== "near_player") return;
  if (!placementMatches(world, def)) return;
  if ((Number(state.activeEntityId || 0) | 0) > 0 && world.isAlive(state.activeEntityId)) return;
  const monster = getMonster(def.creatureId);
  const at = findNearPlayer(world);
  if (!monster || !at) return;
  const id = spawnMonsterEntity(world, {
    ...toMonsterSpawnParams(monster, currentDepth(world)),
    x: at.x,
    y: at.y,
  });
  attachEntityToCurrentFloor(world, id);
  state.activeEntityId = id;
}

function resolveDefeatedSingletons(world) {
  for (const [, death] of world.query(DeathApplied)) {
    const targetId = Number(death?.target || 0) | 0;
    if (!(targetId > 0)) continue;
    for (const [, state] of world.query(EncounterState)) {
      if ((Number(state.activeEntityId || 0) | 0) !== targetId) continue;
      const def = getEncounter(state.encounterId);
      if (def?.uniqueness === "run") state.status = ENCOUNTER_STATES.resolved;
    }
  }
}

export const encounterListenerExtension = defineExtension(
  "jshack:rules:encounters:listeners",
  (world) => {
    const onQuestCompleted = (payload) => {
      for (const def of getAllEncounters()) {
        if (matchesActivation(def.activation, "questCompleted", payload)) {
          activateEncounter(world, def, `quest:${String(payload?.questId || "")}`);
        }
      }
    };
    return world.on("quest:completed", onQuestCompleted);
  },
);

export function encounterSystem(world) {
  resolveDefeatedSingletons(world);
  for (const [, state] of world.query(EncounterState)) {
    const def = getAllEncounters().find((entry) => entry.id === state.encounterId);
    if (!def || state.status !== ENCOUNTER_STATES.active) continue;
    materializeSingleton(world, def, state);
  }
}
