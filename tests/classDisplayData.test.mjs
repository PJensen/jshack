import { assert, assertEquals } from "jsr:@std/assert";
import { listClassIds } from "../src/rules/data/classes.js";
import { buildClassDisplayData } from "../src/main/classDisplayData.js";
import classManifest from "../assets/icons/classes/manifest.js";

Deno.test("character creation display data includes every registered class", () => {
  const registered = listClassIds().toSorted();
  const displayed = buildClassDisplayData().map((entry) => entry.id).toSorted();
  assertEquals(displayed, registered);
});

Deno.test("valkyrie class has character creation presentation data", () => {
  const valkyrie = buildClassDisplayData().find((entry) => entry.id === "valkyrie");
  assert(valkyrie, "valkyrie should appear in character creation display data");
  assertEquals(valkyrie.name, "Valkyrie");
  assertEquals(valkyrie.glyph, "@");
  assertEquals(valkyrie.icon, "🪽");
  assertEquals(valkyrie.iconAtlas, "classes");
  assertEquals(valkyrie.iconId, "valkyrie");
  assert(valkyrie.description.length > 0);
  assert(valkyrie.deityName.length > 0);
});

Deno.test("character creation class display data resolves every class icon", () => {
  const sprites = classManifest.sprites;
  for (const entry of buildClassDisplayData()) {
    assert(sprites[entry.iconId], `missing class icon sprite: ${entry.iconId}`);
  }
});
