import { defineComponent } from "../../lib/ecs-js/index.js";

export const ENCOUNTER_STATES = Object.freeze({
  active: "active",
  resolved: "resolved",
});

/** Runtime state for one logical encounter definition. */
export const EncounterState = defineComponent("EncounterState", {
  encounterId: "",
  status: ENCOUNTER_STATES.active,
  activeEntityId: 0,
  activationStep: 0,
  activationSource: "",
}, {
  validate(rec) {
    rec.encounterId = String(rec.encounterId || "");
    rec.status = String(rec.status || ENCOUNTER_STATES.active);
    rec.activeEntityId = Math.max(0, Number(rec.activeEntityId || 0) | 0);
    rec.activationStep = Number.isFinite(rec.activationStep) ? (rec.activationStep | 0) : 0;
    rec.activationSource = String(rec.activationSource || "");
    return rec.encounterId.length > 0;
  },
});
