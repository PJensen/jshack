import { assertEquals } from "jsr:@std/assert";
import { bakeOpeningLandscape, drawOpeningLandscape } from "../src/display/camera/openingLandscape.js";

Deno.test("opening landscape bakes each strip once and composites one image per frame", async () => {
  const transforms = [];
  const draws = [];
  const strips = [];
  let yields = 0;
  const ctx = {
    fillRect() {},
    save() {},
    restore() {},
    getTransform: () => ({ a: 2, d: 2 }),
    setTransform: (...args) => transforms.push(args),
    drawImage: (...args) => draws.push(args),
  };
  const surface = { getContext: () => ctx };
  const landscape = await bakeOpeningLandscape(surface,
    { minX: -24, minY: -12, maxX: 23, maxY: 12 },
    (_context, ...bounds) => strips.push(bounds),
    () => { yields++; },
  );
  assertEquals(strips, [[-24, -12, 23, -1], [-24, 0, 23, 11], [-24, 12, 23, 12]]);
  assertEquals(yields, 2);
  assertEquals([surface.width, surface.height], [384, 200]);
  assertEquals(transforms[0], [8, 0, 0, 8, 196, 100]);
  const cam = { x: -10, y: 4, scale: 20, shakeX: 0, shakeY: 0 };
  drawOpeningLandscape(ctx, { width: 800, height: 600 }, cam, landscape);
  drawOpeningLandscape(ctx, { width: 800, height: 600 }, cam, landscape, 0.5);
  assertEquals(draws, Array(2).fill([surface, -24.5, -12.5, 48, 25]));
  assertEquals(transforms[1], [40, 0, 0, 40, 800, 140]);
});
