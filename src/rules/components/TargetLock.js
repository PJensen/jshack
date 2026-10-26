import { defineComponent } from "../../lib/ecs-js/index.js";

/** Persistent hostile target selected by the player. */
export const TargetLock = defineComponent("TargetLock", { targetId: 0 });
