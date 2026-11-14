import { assertEquals } from "jsr:@std/assert";

import { resolveEquipmentIcon } from "../src/display/ui/characterOverlay.js";
import { ITEM_ICON_ATLAS, SPELL_ICON_ATLAS } from "../src/display/ui/atlasIcons.js";

Deno.test("equipment icon resolution keeps unidentified gear artwork safe", () => {
  const icon = resolveEquipmentIcon({
    type: "potion",
    identity: "potion_fire",
    identified: false,
    glyph: "hidden-canonical-glyph",
  }, "ring");

  assertEquals(icon.atlas, ITEM_ICON_ATLAS);
  assertEquals(icon.id, "");
  assertEquals(icon.fallback, "◈");
});

Deno.test("equipment icon resolution uses canonical item art for identified gear", () => {
  const icon = resolveEquipmentIcon({
    type: "equip",
    identity: "armor_vanguard",
    identified: true,
    glyph: "◆",
  }, "armor");

  assertEquals(icon.atlas, ITEM_ICON_ATLAS);
  assertEquals(icon.id, "armor_vanguard");
});

Deno.test("equipment icon resolution uses spell atlas for Brain", () => {
  const icon = resolveEquipmentIcon({
    type: "spell",
    id: "spell:frost",
    spellId: "frost",
    symbol: "❄",
  }, "brain");

  assertEquals(icon.atlas, SPELL_ICON_ATLAS);
  assertEquals(icon.id, "frost");
  assertEquals(icon.fallback, "❄");
});
