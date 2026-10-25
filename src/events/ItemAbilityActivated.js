import { EcsEvent } from "../lib/ecs-js/index.js";

export class ItemAbilityActivated extends EcsEvent {
  constructor(payload = {}) {
    super();
    this.actor = Number(payload.actor || 0) | 0;
    this.itemId = Number(payload.itemId || 0) | 0;
    this.targetId = Number(payload.targetId || 0) | 0;
    this.abilityId = String(payload.abilityId || "");
    Object.freeze(this);
  }
}
