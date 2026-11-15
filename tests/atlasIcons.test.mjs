import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  ITEM_ICON_ATLAS,
  SPELL_ICON_ATLAS,
  STATUS_ICON_ATLAS,
  CORPSE_ICON_ATLAS,
  ICON_ATLASES,
  getIconAtlas,
  resolveIconReference,
  applyAtlasIcon,
} from "../src/display/ui/atlasIcons.js";

function stubElement() {
  return {
    textContent: "",
    style: {},
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
}

Deno.test("icon atlases point at WebP sheets and preserve status fallbacks", () => {
  assert(SPELL_ICON_ATLAS.entries.has("lightning"));
  assert(ITEM_ICON_ATLAS.entries.has("scroll_identify"));
  assert(ITEM_ICON_ATLAS.entries.has("potion_health"));
  assert(ITEM_ICON_ATLAS.entries.has("healing_potion"));
  assert(CORPSE_ICON_ATLAS.entries.has("corpse_rat"));
  assert(STATUS_ICON_ATLAS.entries.has("satiated"));
  assert(STATUS_ICON_ATLAS.entries.has("stunned"));
  assert(STATUS_ICON_ATLAS.entries.has("unknown"));
  assert(SPELL_ICON_ATLAS.sheetUrl.endsWith("/assets/icons/spells/sheet.webp"));
  assert(ITEM_ICON_ATLAS.sheetUrl.endsWith("/assets/icons/items/sheet.webp"));
  assert(CORPSE_ICON_ATLAS.sheetUrl.endsWith("/assets/icons/corpses/sheet.webp"));
  assertEquals(ICON_ATLASES.corpses, CORPSE_ICON_ATLAS);
});

Deno.test("applyAtlasIcon renders a mapped icon and falls back for unknown IDs", () => {
  const mapped = stubElement();
  assert(applyAtlasIcon(mapped, SPELL_ICON_ATLAS, "lightning", "⚡", 28));
  assertEquals(mapped.textContent, "");
  assertEquals(mapped.style.width, "28px");
  assertEquals(mapped.style.height, "28px");
  assertEquals(mapped.attributes["aria-hidden"], "true");
  assertStringIncludes(mapped.style.backgroundImage, "sheet.webp");

  const fallback = stubElement();
  assert(!applyAtlasIcon(fallback, SPELL_ICON_ATLAS, "satiated", "🍽️", 28));
  assertEquals(fallback.textContent, "🍽️");
});

Deno.test("corpse identities use the dedicated corpse atlas through item surfaces", () => {
  const corpse = stubElement();
  assert(applyAtlasIcon(corpse, getIconAtlas("corpses"), "corpse_rat", "%", 38));
  assertStringIncludes(corpse.style.backgroundImage, "/assets/icons/corpses/sheet.webp");
  assertEquals(corpse.style.backgroundSize, "900% 800%");
});

Deno.test("resolveIconReference centralizes corpse and unidentified item selection", () => {
  const corpse = resolveIconReference({ type: "food", identity: "corpse_rat", iconAtlas: "corpses" });
  assertEquals(corpse.atlas, CORPSE_ICON_ATLAS);
  assertEquals(corpse.id, "corpse_rat");

  const hidden = resolveIconReference({ type: "food", identity: "corpse_rat", iconAtlas: "corpses", identified: false });
  assertEquals(hidden.atlas, CORPSE_ICON_ATLAS);
  assertEquals(hidden.id, "");
});
