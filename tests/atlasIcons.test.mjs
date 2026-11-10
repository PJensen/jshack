import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  ITEM_ICON_ATLAS,
  SPELL_ICON_ATLAS,
  STATUS_ICON_ATLAS,
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
  assert(STATUS_ICON_ATLAS.entries.has("satiated"));
  assert(STATUS_ICON_ATLAS.entries.has("stunned"));
  assert(STATUS_ICON_ATLAS.entries.has("unknown"));
  assert(SPELL_ICON_ATLAS.sheetUrl.endsWith("/assets/icons/spells/sheet.webp"));
  assert(ITEM_ICON_ATLAS.sheetUrl.endsWith("/assets/icons/items/sheet.webp"));
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
