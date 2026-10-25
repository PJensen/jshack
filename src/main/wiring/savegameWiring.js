import { defineExtension } from "../../lib/ecs-js/index.js";
import { getIdentifiedSnapshot } from "../../rules/data/identification.js";
import { getGemPricingSnapshot } from "../../rules/data/gemPricing.js";
import { getSavegameRegistryNames, serializeSavegameWorld } from "./savegameSerializationRegistry.js";
import { SAVEGAME_KEY, clearSavegamePayload } from "./savegameLoad.js";

const INSTALLED = Symbol.for("jshack:main:savegameWiring:installed");

/**
 * Minimal autosave wiring: persist a full world snapshot when the player rests at bed.
 * @param {{
 *   world: import("../../lib/ecs-js/index.js").World,
 *   playerEntity: (world: import("../../lib/ecs-js/index.js").World) => ({id:number,pos:{x:number,y:number}}|null),
 *   getActiveSpellId?: () => (string|null),
 *   getActionBarSlots?: () => (string|null)[],
 *   getPinnedSpellSlots?: () => (string|null)[],
 *   log?: (msg: string) => void,
 * }} opts
 */
export function installSavegameWiring({ world, playerEntity, getActiveSpellId, getActionBarSlots, getPinnedSpellSlots, log }) {
  if (!world || typeof playerEntity !== "function") return;
  world.install(defineExtension("jshack:main:savegameWiring", () => {
    createSavegameListeners({ world, playerEntity, getActiveSpellId, getActionBarSlots, getPinnedSpellSlots, log });
  }, { key: INSTALLED }));
}

function createSavegameListeners({ world, playerEntity, getActiveSpellId, getActionBarSlots, getPinnedSpellSlots, log }) {
  world.on("bed:rested", ({ actor }) => {
    const pe = playerEntity(world);
    if (!pe || Number(actor || 0) !== pe.id) return;
    const registryNames = getSavegameRegistryNames(world);

    const payload = {
      v: 1,
      savedAt: Date.now(),
      reason: "bed:rested",
      world: serializeSavegameWorld(world, { note: "sleep_autosave", include: registryNames }),
      schema: { registry: registryNames },
      identified: getIdentifiedSnapshot(),
      gemPricing: getGemPricingSnapshot(),
      app: {
        activeSpellId: typeof getActiveSpellId === "function" ? (getActiveSpellId() || null) : null,
        actionBarSlots: typeof getActionBarSlots === "function" ? getActionBarSlots() : null,
        pinnedSpellSlots: typeof getPinnedSpellSlots === "function" ? getPinnedSpellSlots() : null,
      },
    };

    try {
      localStorage.setItem(SAVEGAME_KEY, JSON.stringify(payload));
      if (typeof log === "function") log("Game saved.");
    } catch {
      if (typeof log === "function") log("Save failed.");
    }
  });

  world.on("died", ({ id }) => {
    const pe = playerEntity(world);
    if (!pe || Number(id || 0) !== pe.id) return;
    clearSavegamePayload();
  });
}
