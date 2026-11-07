import { assert, assertStringIncludes } from "jsr:@std/assert";

Deno.test("HUD uses the labeled linear vitals surface and keeps the vitals event contract", async () => {
  const hud = await Deno.readTextFile("src/display/ui/hud.js");
  const bars = await Deno.readTextFile("src/display/ui/linearResourceBars.js");
  assertStringIncludes(hud, "createLinearResourceBars");
  assertStringIncludes(hud, "vitals.id = 'hud-vitals'");
  assertStringIncludes(hud, "window.addEventListener('ui:updateVitals'");
  assertStringIncludes(hud, "hpValue: hpVal");
  assertStringIncludes(hud, "staminaMax");
  assertStringIncludes(hud, "vitalsBars.set");
  assert(!hud.includes("vitalsGauge.set"), "HUD must not retain the removed circular gauge updater");
  assertStringIncludes(hud, "width: '420px'");
  assertStringIncludes(hud, "maxWidth: 'calc(100vw - 16px)'");
  assertStringIncludes(hud, "alignSelf: 'flex-end'");
  assertStringIncludes(hud, "height: 'auto'");
  assertStringIncludes(hud, "left: 'auto'");
  assertStringIncludes(hud, "top: 'calc(50px + env(safe-area-inset-top, 0px))'");
  assertStringIncludes(hud, "width: '250px', maxWidth: 'calc(100vw - 16px)'");
  assertStringIncludes(hud, "maxWidth: '100%'");
  assertStringIncludes(hud, "background: 'transparent'");
  assertStringIncludes(hud, "minHeight: '44px'");
  assertStringIncludes(hud, "background: 'rgba(22,18,10,0.42)'");
  assertStringIncludes(hud, "boxShadow: 'none'");
  assertStringIncludes(bars, "value.textContent = '— / —'");
  assertStringIncludes(bars, "justifyContent: 'space-between'");
  assert(!hud.includes("createConcentricGauge"), "player HUD should not instantiate the circular gauge");
});
