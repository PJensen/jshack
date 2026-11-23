import { EcsEvent } from "../lib/ecs-js/index.js";
import { normalizeGridPoint } from "../shared/math/point.js";

export class WaterTrapOpened extends EcsEvent {
  constructor({ trapId, at }) {
    super();
    this.trapId = trapId | 0;
    const point = normalizeGridPoint(at);
    this.at = point ? Object.freeze(point) : null;
    Object.freeze(this);
  }
}
