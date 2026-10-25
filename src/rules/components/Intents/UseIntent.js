import { defineComponent } from "../../../lib/ecs-js/index.js";

/**
 * UseIntent — request for an actor to use an item (e.g., consume, activate, equip).
 * actor entity holds this component for one tick; systems will consume and remove it.
 * Fields:
 * - itemId: entity id of the item to use
 * - targetId: optional entity id of the target (e.g., target actor)
 * - x, y: optional target tile coordinates (for targeted item effects)
 */
export const UseIntent = defineComponent("UseIntent", {
    itemId: 0,
    abilityId: "",
    targetId: null,
    x: null,
    y: null,
});
