import { defineComponent } from "../../lib/ecs-js/index.js";

export const DEATH_MODES = Object.freeze({
  permadeath: "permadeath",
  mercy: "mercy",
  dropBackpack: "drop_backpack",
  dropAllButOne: "drop_all_but_one",
});

export const DEATH_MODE_SET = Object.freeze(new Set(Object.values(DEATH_MODES)));

export const RunState = defineComponent("RunState", {
  difficulty: "normal",
  deathMode: DEATH_MODES.dropBackpack,
  resurrectionCount: 0,
  kills: 0,
  spellsCast: 0,
  prayers: 0,
  thefts: 0,
  petsLost: 0,
  corpsesDesecrated: 0,
}, {
  validate(rec) {
    if (!rec || typeof rec !== "object") throw new Error("RunState record required");
    rec.difficulty = String(rec.difficulty || "normal");
    rec.deathMode = String(rec.deathMode || DEATH_MODES.dropBackpack);
    if (!DEATH_MODE_SET.has(rec.deathMode)) {
      throw new Error(`RunState.deathMode must be one of: ${Array.from(DEATH_MODE_SET).join(", ")}`);
    }
    rec.resurrectionCount = Math.max(0, Number(rec.resurrectionCount || 0) | 0);
    for (const key of ["kills", "spellsCast", "prayers", "thefts", "petsLost", "corpsesDesecrated"]) {
      rec[key] = Math.max(0, Number(rec[key] || 0) | 0);
    }
    return true;
  },
});
