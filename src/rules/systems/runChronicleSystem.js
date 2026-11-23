import { defineExtension } from "../../lib/ecs-js/index.js";
import { Player } from "../components/Player.js";
import { Pet } from "../components/Pet.js";
import { Owner } from "../components/Owner.js";
import { RunState } from "../components/RunState.js";
import { DeathApplied } from "../components/DeathApplied.js";
import { getRunState } from "../utils/deathModes.js";
import { resolvePlayerKillCredit } from "../utils/killCredit.js";

function playerIdFor(world, actor) {
  const id = Number(actor || 0) | 0;
  if (world.has(id, Player)) return id;
  if (!world.has(id, Pet)) return 0;
  return Number(world.get(id, Owner)?.ownerId || 0) | 0;
}

function updateRun(world, patch = {}) {
  const { id, state } = getRunState(world);
  world.set(id, RunState, { ...state, ...patch });
}

function increment(world, field) {
  const { state } = getRunState(world);
  updateRun(world, { [field]: Math.max(0, Number(state?.[field] || 0) | 0) + 1 });
}

export const runChronicleExtension = defineExtension(
  "jshack:run:chronicle",
  (world) => {
    world.on("castSpell", ({ actor }) => {
      if (playerIdFor(world, actor) <= 0) return;
      increment(world, "spellsCast");
    });
    world.on("prayer", ({ actor }) => {
      if (playerIdFor(world, actor) <= 0) return;
      increment(world, "prayers");
    });
    world.on("shop:theft-escaped", ({ actor }) => {
      if (playerIdFor(world, actor) <= 0) return;
      increment(world, "thefts");
    });
    world.on("corpse:desecrated", ({ actor }) => {
      if (playerIdFor(world, actor) <= 0) return;
      increment(world, "corpsesDesecrated");
    });
    world.on("pet:died", ({ ownerId }) => {
      if (playerIdFor(world, ownerId) > 0) increment(world, "petsLost");
    });
  },
);

export function runChronicleSystem(world) {
  for (const [, death] of world.query(DeathApplied)) {
    const playerId = resolvePlayerKillCredit(world, death.killer);
    if (playerId <= 0 || world.has(death.target, Player)) continue;
    increment(world, "kills");
  }
}

export function installRunChronicle(world) {
  world.install(runChronicleExtension);
}
