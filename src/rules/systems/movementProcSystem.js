import { defineExtension } from "../../lib/ecs-js/index.js";
import { applyReactionProcPhase } from "../utils/procPhases.js";

/**
 * Evaluate equipped item proc trees for genuine movement steps.
 * Displacement paths such as knockback and teleport continue to emit `moved`,
 * but only movement-system steps carry the onStep trigger.
 */
export const movementProcExtension = defineExtension(
  "jshack:rules:movement-procs",
  (world) => {
    world.on("moved", ({ id: actor, from, to, kind }) => {
      if (kind !== "step" || !from || !to) return;
      applyReactionProcPhase(world, actor, {
        kind: "onStep",
        source: actor,
        from: { x: from.x | 0, y: from.y | 0 },
        to: { x: to.x | 0, y: to.y | 0 },
      });
    });
  },
);
