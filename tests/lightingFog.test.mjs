import { assert, assertEquals } from "jsr:@std/assert";
import {
  createLightingEngine,
  resolveDarknessAlpha,
  resolveMaterialLightingResponse,
  resolveShelteredExteriorDarkening,
} from "../src/display/lighting/engine.js";
import { computeAmbient } from "../src/display/lighting/sources/index.js";
import { getMaterialIntrinsic } from "../src/rules/data/materials.js";

function sum(rgb) {
  return rgb[0] + rgb[1] + rgb[2];
}

Deno.test("daylight ambient keeps a fog veil outside current vision", () => {
  const noonAmbient = computeAmbient({
    isOverworld: true,
    turnInDay: 365,
    moonBrightness: 0.15,
  });
  const ambientSum = sum(noonAmbient);

  const unseenAlpha = resolveDarknessAlpha({
    lightSum: ambientSum,
    ambientLightSum: ambientSum,
    sight: 0,
    dark: 210,
  });
  const visibleAlpha = resolveDarknessAlpha({
    lightSum: ambientSum,
    ambientLightSum: ambientSum,
    sight: 1,
    dark: 210,
  });

  assert(unseenAlpha >= 72, "daylight memory cells should retain a visible veil");
  assertEquals(visibleAlpha, 0, "visible daylight cells should stay bright");
});

Deno.test("local light can still punch through the daylight memory veil", () => {
  const noonAmbient = computeAmbient({
    isOverworld: true,
    turnInDay: 365,
    moonBrightness: 0.15,
  });
  const ambientSum = sum(noonAmbient);

  const alpha = resolveDarknessAlpha({
    lightSum: ambientSum + 2.5,
    ambientLightSum: ambientSum,
    sight: 0,
    dark: 210,
  });

  assertEquals(alpha, 0);
});

Deno.test("night ambient remains darker than day ambient", () => {
  const noonAmbient = computeAmbient({
    isOverworld: true,
    turnInDay: 365,
    moonBrightness: 0.15,
  });
  const nightAmbient = computeAmbient({
    isOverworld: true,
    turnInDay: 0,
    moonBrightness: 0.15,
  });

  assert(sum(nightAmbient) < sum(noonAmbient));
});

Deno.test("underground floors do not receive sky ambient", () => {
  assertEquals(computeAmbient({ isOverworld: false }), null);
});

Deno.test("cells without sky ambient remain fully dark when unseen", () => {
  const alpha = resolveDarknessAlpha({
    lightSum: 0,
    ambientLightSum: 0,
    sight: 0,
    dark: 210,
  });

  assertEquals(alpha, 210);
});

Deno.test("shelter nearly blacks out cells outside the current building", () => {
  const outside = resolveShelteredExteriorDarkening({
    playerSheltered: true,
    shelterInterior: false,
  });
  const inside = resolveShelteredExteriorDarkening({
    playerSheltered: true,
    shelterInterior: true,
  });
  const unsheltered = resolveShelteredExteriorDarkening({
    playerSheltered: false,
    shelterInterior: false,
  });

  assert(outside >= 180, "outside the current building should be near-black");
  assertEquals(inside, 0);
  assertEquals(unsheltered, 0);
});

Deno.test("lighting keeps shelter and floor relief changes local to the frames that need them", () => {
  const previousDocument = globalThis.document;
  const frames = [];
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: ({ data }) => frames.push(data.slice()),
      }),
    }),
  };
  try {
    const engine = createLightingEngine();
    const ctx = { save() {}, restore() {}, drawImage() {} };
    let shelterLookups = 0;
    function render(playerSheltered = false) {
      frames.length = 0;
      engine.render(ctx, [], () => false, -3, -3, 3, 3, null, 140, null, null, [], 0, 0, {
        playerSheltered,
        isShelterInterior: (x, y) => {
          shelterLookups++;
          return x === 0 && y === 0;
        },
      });
      return frames.slice();
    }
    const flat = render();
    assertEquals(shelterLookups, 0);
    assert(render(true)[0].some((value, i) => value > flat[0][i]));
    assert(shelterLookups > 0);

    engine.setFloorNoise(0.4, 0.2);
    assert(render()[1].some((value, i) => value !== flat[1][i]));
    engine.clearFloorRelief();
    assertEquals(render(), flat);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

Deno.test("material optical fields alter lighting response", () => {
  const gold = resolveMaterialLightingResponse(getMaterialIntrinsic("gold"));
  const voidstone = resolveMaterialLightingResponse(getMaterialIntrinsic("voidstone"));
  const glass = resolveMaterialLightingResponse(getMaterialIntrinsic("glass"));

  assert(gold.albedoR > voidstone.albedoR, "reflective gold should catch warmer light than voidstone");
  assert(glass.normal > 0.4, "transparent glass should still produce surface response");
  assert(voidstone.void > 0.8, "voidstone should participate in void absorption");
});

Deno.test("void darkness is independent from positive light lift", () => {
  const lit = resolveDarknessAlpha({
    lightSum: 2.4,
    ambientLightSum: 0,
    sight: 0,
    dark: 210,
  });
  const voided = resolveDarknessAlpha({
    lightSum: 2.4,
    ambientLightSum: 0,
    sight: 0,
    dark: 210,
    voidAmount: 2.4,
  });

  assertEquals(lit, 0);
  assert(voided > 150, "void field should darken even where positive light exists");
});
