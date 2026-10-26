import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { createRng } from "../src/lib/ecs-js/rng.js";
import { Position } from "../src/rules/components/Position.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { Material } from "../src/rules/components/Material.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { buildCatalogItem } from "../src/rules/data/itemCatalogLoader.js";
import { materializeDrop } from "../src/rules/data/lootResolver.js";
import { pickGem } from "../src/rules/data/gems.js";
import { createItemById } from "../src/rules/utils/itemFactory.js";
import "../src/content/items/fishingRod.js";
import { installContent } from "../src/content/install.js";
installContent();

Deno.test("buildCatalogItem applies material and charges from item defs", () => {
  const world = new World({ seed: 11 });
  const wandId = buildCatalogItem(world, "wand_lightning");

  const mat = world.get(wandId, Material);
  const info = world.get(wandId, ItemInfo);
  assert(mat && mat.kind === "wood", "wand should carry wood material");
  assert(info, "wand should have item info");
  assertEquals(info.count, 3);
});

Deno.test("buildCatalogItem carries optional combatFlavor for weapons", () => {
  const world = new World({ seed: 17 });
  const pickaxeId = buildCatalogItem(world, "iron_pickaxe");
  const info = world.get(pickaxeId, ItemInfo);
  assert(info, "pickaxe should have item info");
  assertEquals(info.combatFlavor, "brutal");
});

Deno.test("materializeDrop item path preserves material and placement", () => {
  const world = new World({ seed: 12 });
  const id = materializeDrop(
    world,
    { kind: "item", params: { itemId: "scroll_blastwave" } },
    { x: 4, y: 7 },
  );

  assert(id != null, "item drop should materialize");
  const mat = world.get(id, Material);
  const pos = world.get(id, Position);
  assert(mat && mat.kind === "paper", "scroll should carry paper material");
  assert(pos && pos.x === 4 && pos.y === 7, "drop should be placed at target tile");
});

Deno.test("digging gem pool can roll flint", () => {
  let sawFlint = false;
  for (let seed = 1; seed <= 600; seed++) {
    const gem = pickGem(createRng(seed));
    if (gem?.id === "stone_flint") {
      sawFlint = true;
      break;
    }
  }
  assert(sawFlint, "stone_flint should be reachable through the mining gem picker");
});

Deno.test("createItemById routes magic items through materialized loader", () => {
  const world = new World({ seed: 13 });
  const id = createItemById(world, "book_meteor");
  assert(id != null, "book should be creatable");

  const mat = world.get(id, Material);
  assert(mat && mat.kind === "paper", "spellbook should carry paper material");
});

Deno.test("createItemById keeps wand default charges when count is omitted", () => {
  const world = new World({ seed: 15 });
  const id = createItemById(world, "wand_frost");
  assert(id != null, "wand should be creatable");
  const info = world.get(id, ItemInfo);
  assert(info && info.count === 10, `wand should spawn with catalog charges, got ${info?.count}`);
});

Deno.test("createItemById propagates noQuickChip from catalog", () => {
  const world = new World({ seed: 16 });
  const id = createItemById(world, "scroll_identify");
  assert(id != null, "scroll of identify should be creatable");
  const info = world.get(id, ItemInfo);
  assert(info, "scroll should have item info");
  assertEquals(info.noQuickChip, true);
});

Deno.test("createItemById creates fishing_rod for debug give", () => {
  const world = new World({ seed: 704 });
  const id = createItemById(world, "fishing_rod");
  assert(id > 0, "expected fishing_rod to be creatable");
  const ni = world.get(id, NamedIdentity);
  const info = world.get(id, ItemInfo);
  assertEquals(ni?.identity, "fishing_rod");
  assertEquals(info?.type, "equip");
});

Deno.test("simple archetype items carry baseline materials", () => {
  const world = new World({ seed: 14 });

  const cases = [
    ["gold", "gold"],
    ["potion_health", "glass"],
    ["ammo_arrows", "wood"],
    ["ammo_piercing_arrows", "wood"],
    ["ammo_bodkin_arrows", "wood"],
    ["ammo_blunt_arrows", "wood"],
    ["ammo_bomb_arrows", "iron"],
    ["scroll_mapping", "paper"],
  ];

  for (let i = 0; i < cases.length; i++) {
    const [itemId, expectedMaterial] = cases[i];
    const id = createItemById(world, itemId);
    assert(id != null, `expected item for ${itemId}`);
    const mat = world.get(id, Material);
    assert(mat && mat.kind === expectedMaterial, `${itemId} should use ${expectedMaterial}`);
  }
});
