import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { EFFECT_DEFS } from "../src/rules/data/effectDefs.js";
import { buildEffectRows } from "../src/main/ui/effectRows.js";
import { World } from "../src/lib/ecs-js/index.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { getSpell } from "../src/rules/data/spells.js";

Deno.test("VIS effect badges intercept pointer input before canvas movement", async () => {
  const hud = await Deno.readTextFile("src/display/ui/hud.js");

  assertStringIncludes(hud, "installBadgeInputGuards");
  assertStringIncludes(hud, "stopImmediatePropagation");
  assertStringIncludes(hud, "addEventListener('pointerdown', stop, { capture: true })");
  assertStringIncludes(hud, "addEventListener('touchstart', stop, { capture: true, passive: true })");
  assertStringIncludes(hud, "addEventListener('click', open, { capture: true, passive: false })");
  assertStringIncludes(hud, "touchAction: 'pan-x'");
  assertStringIncludes(hud, "showEffectDetails");
  assertStringIncludes(hud, "renderItemDetails");
});

Deno.test("VIS covers the approved unmapped status keys", async () => {
  const hud = await Deno.readTextFile("src/display/ui/hud.js");
  const start = hud.indexOf("const VIS = {");
  const end = hud.indexOf("  };\n\n  const hsla", start);
  assert(start >= 0 && end > start, "HUD should expose its VIS registry source");
  const vis = hud.slice(start, end);
  const expected = [
    ["town_stew", "\\u{1F372}"], ["staggered", "\\u{1F974}"], ["hastened", "\\u{1F3C3}"],
    ["silenced", "\\u{1F910}"], ["sleep", "\\u{1F4A4}"], ["serpent_hide", "\\u{1F40D}"],
    ["crit_boost", "\\u{1F4A5}"], ["shield_guard", "\\u{1F6E1}\\uFE0F"],
    ["shield_broken", "\\u{1F494}"], ["agony", "\\u{1F616}"], ["swarmed", "\\u{1F41C}"],
    ["esp_sense", "\\u{1F4E1}"], ["bloodthirst", "\\u{1F9DB}"], ["fire_weapon", "\\u{1F525}"],
    ["marked", "\\u{1F3AF}"], ["stasis", "\\u23F8\\uFE0F"],
  ];
  for (const [key, glyph] of expected) {
    // Timed spell effects (Bloodthirst) are authored on the spell rather than
    // in the generic per-turn effect operation registry.
    const definition = EFFECT_DEFS.find((def) => def.statuses.includes(key)) || getSpell(key)?.activeEffect;
    assert(definition, `an authored status or timed spell should include '${key}'`);
    assertStringIncludes(vis, `${key}:`);
    assertStringIncludes(vis, `glyph: '${glyph}'`);
  }
});

Deno.test("town stew keeps authored visual identity ahead of generic VIS fallback", () => {
  const world = new World({ seed: 155 });
  const actor = world.create();
  world.add(actor, ActiveEffects, { effects: [{ key: "town_stew", turnsLeft: 3, potency: 1 }] });
  const row = buildEffectRows(world, actor)[0];
  assertEquals([row?.name, row?.glyph, row?.glyphColor], ["Town Stew", "%", "#c88a4a"]);
});
