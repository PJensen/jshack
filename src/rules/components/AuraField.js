import { defineComponent } from "../../lib/ecs-js/index.js";

export const AuraField = defineComponent(
  "AuraField",
  {
    sourceId: 0,
    sourceKey: "",
    effectKey: "",
    effectTurns: 2,
    potency: 1,
    targetRelation: "allied",
    woundedOnly: false,
    turnsLeft: 1,
    radius: 1,
  },
  {
    validate(rec) {
      if (!rec) throw new Error("AuraField record required");
      rec.sourceId = Number.isFinite(rec.sourceId) ? (rec.sourceId | 0) : 0;
      rec.sourceKey = String(rec.sourceKey || "");
      rec.effectKey = String(rec.effectKey || "");
      rec.effectTurns = Number.isFinite(rec.effectTurns) ? Math.max(1, rec.effectTurns | 0) : 2;
      rec.potency = Number.isFinite(rec.potency) ? Math.max(1, rec.potency) : 1;
      rec.targetRelation = String(rec.targetRelation || "allied").toLowerCase();
      rec.woundedOnly = rec.woundedOnly === true;
      rec.turnsLeft = Number.isFinite(rec.turnsLeft) ? Math.max(1, rec.turnsLeft | 0) : 1;
      rec.radius = Number.isFinite(rec.radius) ? Math.max(0, rec.radius | 0) : 1;
      return true;
    },
  },
);
