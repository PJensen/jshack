import { defineComponent } from "../../lib/ecs-js/index.js";

export const FloodState = defineComponent(
  "FloodState",
  {
    remainingVolume: 0,
    spreadPerTurn: 1,
    nextStep: 0,
    frontier: null,
    floodedTiles: null,
  },
  {
    validate(rec) {
      if (!rec) throw new Error("FloodState record required");
      if (!Number.isInteger(rec.remainingVolume) || rec.remainingVolume < 0) {
        throw new Error("FloodState.remainingVolume must be a non-negative integer");
      }
      if (!Number.isInteger(rec.spreadPerTurn) || rec.spreadPerTurn < 1) {
        throw new Error("FloodState.spreadPerTurn must be a positive integer");
      }
      if (!Array.isArray(rec.frontier) || !Array.isArray(rec.floodedTiles)) {
        throw new Error("FloodState tile lists must be arrays");
      }
      return true;
    },
  },
);
