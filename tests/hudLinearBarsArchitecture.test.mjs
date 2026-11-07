import { assert, assertStringIncludes } from "jsr:@std/assert";

Deno.test("HUD uses the labeled linear vitals surface and keeps the vitals event contract", async () => {
  const hud = await Deno.readTextFile("src/display/ui/hud.js");
  assertStringIncludes(hud, "createLinearResourceBars");
  assertStringIncludes(hud, "vitals.id = 'hud-vitals'");
  assertStringIncludes(hud, "window.addEventListener('ui:updateVitals'");
  assertStringIncludes(hud, "hpValue: hpVal");
  assertStringIncludes(hud, "staminaMax");
  assert(!hud.includes("createConcentricGauge"), "player HUD should not instantiate the circular gauge");
});
