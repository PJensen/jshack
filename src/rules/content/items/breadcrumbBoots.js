import { defineExtension } from "../../../lib/ecs-js/index.js";
import { Charges } from "../../components/Charges.js";
import { Equipment } from "../../components/Equipment.js";
import { NamedIdentity } from "../../components/NamedIdentity.js";
import { Player } from "../../components/Player.js";
import { ScriptState } from "../../components/ScriptState.js";
import { Vitality } from "../../components/Vitality.js";
import { leaveBreadcrumb } from "../../utils/breadcrumbs.js";

export const breadcrumbBootsMovementExtension = defineExtension(
  "jshack:rules:breadcrumb-boots-movement",
  (world) => {
    world.on("moved", ({ id: actorId, from }) => {
      if (!world.has(actorId, Player) || !from) return;
      const vitality = world.get(actorId, Vitality);
      if (vitality && vitality.hp <= 0) return;
      const itemId = Number(world.get(actorId, Equipment)?.feet || 0) | 0;
      if (!(itemId > 0)) return;
      const identity = String(world.get(itemId, NamedIdentity)?.identity || "").toLowerCase();
      if (identity !== "breadcrumb_boots") return;

      const state = world.get(itemId, ScriptState);
      if (!state) return;
      const nextStep = (Number(state.data?.stepsTowardCrumb || 0) | 0) + 1;
      if (nextStep < 4) {
        world.set(itemId, ScriptState, { data: { ...state.data, stepsTowardCrumb: nextStep } });
        return;
      }
      world.set(itemId, ScriptState, { data: { ...state.data, stepsTowardCrumb: 0 } });
      leaveBreadcrumb(world, { actorId, itemId, x: from.x, y: from.y });

      const charges = world.get(itemId, Charges);
      if (charges && charges.current < charges.max) {
        world.set(itemId, Charges, { ...charges, current: charges.current + 1 });
      }
    });
  },
);
