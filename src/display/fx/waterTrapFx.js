import { WaterTrapOpened } from "../../events/WaterTrapOpened.js";
import { defineExtension } from "../../lib/ecs-js/index.js";
import { makeRng } from "../../shared/utils/rng.js";
import { Particle } from "../passes/vfx/particles/particlePool.js";

export function createWaterTrapFxExtension({ fx, isVisibleAt }) {
  return defineExtension("jshack:display:waterTrapFx", (world) =>
    world.on(WaterTrapOpened, ({ trapId, at }) => {
      if (!at) return;
      const { x, y } = at;
      if (isVisibleAt && !isVisibleAt(x, y)) return;
      const random = makeRng(trapId);
      const centerX = x + 0.5;
      const centerY = y + 0.5;

      // A narrow column of falling drops and a wider burst of floor spray.
      for (let i = 0; i < 20; i++) {
        const height = 0.35 + random() * 1.15;
        const speed = 3.8 + random() * 2;
        fx.pool.spawn(new Particle({
          x: centerX + (random() - 0.5) * 0.48,
          y: centerY - height,
          vx: (random() - 0.5) * 0.5,
          vy: speed,
          life: height / speed,
          size0: 0.15,
          size1: 0.06,
          r: 94, g: 174, b: 255, a0: 0.9, a1: 0.35,
        }));
      }

      for (let i = 0; i < 24; i++) {
        const angle = i * Math.PI * 2 / 24;
        const speed = 1.4 + random() * 1.9;
        fx.pool.spawn(new Particle({
          x: centerX + Math.cos(angle) * 0.14,
          y: centerY + Math.sin(angle) * 0.1,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed * 0.6,
          life: 0.24 + random() * 0.27,
          size0: 0.07 + random() * 0.11,
          size1: 0.025,
          r: 134, g: 212, b: 255, a0: 0.85,
        }));
      }
    }),
    { key: Symbol.for("jshack:display:waterTrapFx") },
  );
}
