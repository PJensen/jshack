import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  ITEM_ICON_ATLAS,
  SPELL_ICON_ATLAS,
  STATUS_ICON_ATLAS,
  CORPSE_ICON_ATLAS,
  CLASS_ICON_ATLAS,
  ICON_ATLASES,
  getIconAtlas,
  resolveIconReference,
  applyAtlasIcon,
} from "../src/display/ui/atlasIcons.js";
import classManifest from "../assets/icons/classes/manifest.js";

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
  assert(ITEM_ICON_ATLAS.entries.has("wand_arcane"));
  assert(ITEM_ICON_ATLAS.entries.has("scroll_unknown"));
  assertEquals(ITEM_ICON_ATLAS.entries.get("wand_arcane"), { x: 2, y: 21 });
  assertEquals(ITEM_ICON_ATLAS.entries.get("scroll_unknown"), { x: 1, y: 21 });
  assertEquals(ITEM_ICON_ATLAS.entries.get("wand_arcane").x === ITEM_ICON_ATLAS.entries.get("wand_frost").x, false);
  assertEquals(ITEM_ICON_ATLAS.entries.get("key_tavern_cellar"), ITEM_ICON_ATLAS.entries.get("key"));
  assert(CORPSE_ICON_ATLAS.entries.has("corpse_rat"));
  assert(STATUS_ICON_ATLAS.entries.has("satiated"));
  assert(STATUS_ICON_ATLAS.entries.has("stunned"));
  assert(STATUS_ICON_ATLAS.entries.has("unknown"));
  assert(SPELL_ICON_ATLAS.sheetUrl.endsWith("/assets/icons/spells/sheet.webp"));
  assert(ITEM_ICON_ATLAS.sheetUrl.endsWith("/assets/icons/items/sheet.webp"));
  assert(CORPSE_ICON_ATLAS.sheetUrl.endsWith("/assets/icons/corpses/sheet.webp"));
  assertEquals(ICON_ATLASES.corpses, CORPSE_ICON_ATLAS);
});

Deno.test("class atlas consumes the manifest-selected sheet", () => {
  assertStringIncludes(CLASS_ICON_ATLAS.sheetUrl, `/assets/icons/classes/${classManifest.image}`);
});

Deno.test("item atlas uses explicit 32px cells and valid coordinates", async () => {
  assertEquals(ITEM_ICON_ATLAS.columns, 24);
  assertEquals(ITEM_ICON_ATLAS.rows, 22);
  assertEquals(ITEM_ICON_ATLAS.entries.size, 522);
  for (const [id, entry] of ITEM_ICON_ATLAS.entries) {
    assert(entry.x >= 0 && entry.x < ITEM_ICON_ATLAS.columns, `${id} x is out of bounds`);
    assert(entry.y >= 0 && entry.y < ITEM_ICON_ATLAS.rows, `${id} y is out of bounds`);
    assert(Number.isInteger(entry.x) && Number.isInteger(entry.y), `${id} is not on a cell boundary`);
  }
  const sheet = await Deno.readFile(new URL("../assets/icons/items/sheet.webp", import.meta.url));
  assertEquals(String.fromCharCode(...sheet.slice(0, 4)), "RIFF");
  assertEquals(String.fromCharCode(...sheet.slice(8, 12)), "WEBP");
});

Deno.test("all canonical content item identities have atlas entries", async () => {
  const contentDir = new URL("../src/content/items/", import.meta.url);
  const sourceIds = new Set();
  for await (const entry of Deno.readDir(contentDir)) {
    if (!entry.isFile || !entry.name.endsWith(".js")) continue;
    const source = await Deno.readTextFile(new URL(entry.name, contentDir));
    for (const match of source.matchAll(/defineItem\(\s*["'`]([^"'`]+)["'`]/g)) sourceIds.add(match[1]);
  }
  for (const id of sourceIds) assert(ITEM_ICON_ATLAS.entries.has(id), `${id} is missing from the item atlas`);
});

Deno.test("applyAtlasIcon renders a mapped icon and falls back for unknown IDs", () => {
  const mapped = stubElement();
  assert(applyAtlasIcon(mapped, { atlas: SPELL_ICON_ATLAS, id: "lightning" }, "⚡", 28));
  assertEquals(mapped.textContent, "");
  assertEquals(mapped.style.width, "28px");
  assertEquals(mapped.style.height, "28px");
  assertEquals(mapped.attributes["aria-hidden"], "true");
  assertStringIncludes(mapped.style.backgroundImage, "sheet.webp");

  const fallback = stubElement();
  assert(!applyAtlasIcon(fallback, { atlas: SPELL_ICON_ATLAS, id: "satiated" }, "🍽️", 28));
  assertEquals(fallback.textContent, "🍽️");
});

Deno.test("item atlas sampling stays on exact cell boundaries", () => {
  const element = stubElement();
  assert(applyAtlasIcon(element, { atlas: ITEM_ICON_ATLAS, id: "wand_arcane" }, "", 24));
  assertEquals(element.style.backgroundSize, "576px 528px");
  assertEquals(element.style.backgroundPosition, "-48px -504px");
});

Deno.test("corpse identities use the dedicated corpse atlas through item surfaces", () => {
  const corpse = stubElement();
  assert(applyAtlasIcon(corpse, resolveIconReference({ iconAtlas: "corpses", iconId: "corpse_rat" }), "%", 38));
  assertStringIncludes(corpse.style.backgroundImage, "/assets/icons/corpses/sheet.webp");
  assertEquals(corpse.style.backgroundSize, "342px 304px");
});

Deno.test("resolveIconReference centralizes corpse and unidentified item selection", () => {
  const corpse = resolveIconReference({ type: "food", identity: "corpse_rat", iconAtlas: "corpses" });
  assertEquals(corpse.atlas, CORPSE_ICON_ATLAS);
  assertEquals(corpse.id, "corpse_rat");

  const minimalCorpse = resolveIconReference({ type: "food", identity: "corpse_rat" });
  assertEquals(minimalCorpse.atlas, CORPSE_ICON_ATLAS);
  assertEquals(minimalCorpse.id, "corpse_rat");

  const staleItemAtlas = resolveIconReference({ type: "food", identity: "corpse_rat", iconAtlas: "items" });
  assertEquals(staleItemAtlas.atlas, CORPSE_ICON_ATLAS);

  const hidden = resolveIconReference({ type: "food", identity: "corpse_rat", iconAtlas: "corpses", identified: false });
  assertEquals(hidden.atlas, CORPSE_ICON_ATLAS);
  assertEquals(hidden.id, "");

  const unknownScroll = resolveIconReference({ type: "scroll", identity: "scroll_fire", identified: false });
  assertEquals(unknownScroll.atlas, ITEM_ICON_ATLAS);
  assertEquals(unknownScroll.id, "scroll_unknown");
});
