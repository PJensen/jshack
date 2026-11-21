import { defineComponent } from "../../lib/ecs-js/index.js";

export const RiftState = defineComponent("RiftState", {
  active: false,
  riftId: "",
  seed: 0,
  levels: 0,
  originDepth: 0,
  originX: 0,
  originY: 0,
  currentLevel: 0,
  portalId: 0,
  inside: false,
  planeId: "",
  templateId: "",
});
