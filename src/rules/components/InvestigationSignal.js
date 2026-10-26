import { defineComponent } from "../../lib/ecs-js/index.js";

/** A short-lived world entity that invites curious creatures to investigate its position. */
export const InvestigationSignal = defineComponent("InvestigationSignal", {
  range: 8,
  priority: 1,
  createdAt: 0,
  sourceActorId: 0,
  sourceItemId: 0,
  kind: "",
});

/** Marker identity and provenance for persistent breadcrumb entities. */
export const Breadcrumb = defineComponent("Breadcrumb", {
  sourceActorId: 0,
  sourceItemId: 0,
  kind: "trail",
  createdAt: 0,
});
