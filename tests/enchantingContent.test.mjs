import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { getDialog } from "../src/rules/dialogues/registry.js";
import { LOOT_TABLES } from "../src/rules/data/lootTables.js";
import { generateAlchemyShopItem } from "../src/rules/data/shopStock.js";
import "../src/rules/dialogues/townfolkDialogs.js";

Deno.test("enchantress dialog exposes enchanting services as a dedicated NPC", () => {
  const dialog = getDialog("townfolk:enchantress");
  assert(dialog);
  const rootChoices = dialog?.nodes?.root?.choices || [];
  assert(rootChoices.some((choice) => choice.id === "open_services"));
  assert(rootChoices.some((choice) => choice.id === "ask_reagents"));
});

Deno.test("loot tables define thematic enchanting reagent families", () => {
  assert(LOOT_TABLES["drop:spider"]);
  assert(LOOT_TABLES["drop:witch"]);
  assert(LOOT_TABLES["drop:plant"]);
  const beastEntries = LOOT_TABLES["sub:reagents_beast"]?.entries || [];
  assert(beastEntries.some((entry) => entry.itemId === "reagent_beast_claw"));
  const undeadEntries = LOOT_TABLES["sub:reagents_undead"]?.entries || [];
  assert(undeadEntries.some((entry) => entry.itemId === "reagent_bone_dust"));
  assertEquals(Array.isArray(LOOT_TABLES["drop:witch"]?.entries), true);
});

Deno.test("loot and alchemy shops bias toward reagents instead of finished enchant scrolls", () => {
  const scrollEntries = LOOT_TABLES["sub:scrolls"]?.entries || [];
  assert(scrollEntries.some((entry) => entry.itemId === "scroll_enchant_guarded"));
  assert(scrollEntries.some((entry) => entry.itemId === "scroll_enchant_healthy"));
  assert(scrollEntries.some((entry) => entry.itemId === "scroll_enchant_attuned"));
  assert(scrollEntries.some((entry) => entry.itemId === "scroll_enchant_lucky"));
  assert(scrollEntries.some((entry) => entry.itemId === "scroll_enchant_fierce"));

  const world = new World({ seed: 1210 });
  const rng = { next: () => 0.99 };
  for (let i = 0; i < 24; i++) {
    const itemId = generateAlchemyShopItem(world, rng);
    const identity = world.get(itemId, NamedIdentity)?.identity || "";
    assert(!identity.startsWith("scroll_enchant_"), `alchemy shop generated finished enchant scroll ${identity}`);
  }
});
