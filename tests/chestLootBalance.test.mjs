import { assert } from "jsr:@std/assert";
import "./helpers/installContentCatalog.mjs";
import { resolveLootTable } from "../src/rules/data/lootResolver.js";
import { createRng } from "../src/lib/ecs-js/rng.js";
import { getCatalogItem } from "../src/rules/data/itemCatalog.js";
import { LOOT_TABLES } from "../src/rules/data/lootTables.js";

function assertChestRollBounds(tableId, depth, seeds) {
  const table = LOOT_TABLES[tableId];
  const maxRolls = Number(table?.rolls?.max ?? 0);
  const guaranteedCount = Array.isArray(table?.guaranteedTables) ? table.guaranteedTables.length : 0;
  for (let seed = 0; seed < seeds; seed++) {
    const drops = resolveLootTable(tableId, createRng(seed), depth);
    assert(
      drops.length >= guaranteedCount && drops.length <= maxRolls + guaranteedCount,
      `${tableId} seed ${seed}: expected ${guaranteedCount}-${maxRolls + guaranteedCount} drops, got ${drops.length}`,
    );
  }
}

function assertChestGuaranteesEquipment(tableId, depth, seeds) {
  for (let seed = 0; seed < seeds; seed++) {
    const drops = resolveLootTable(tableId, createRng(seed), depth);
    assert(drops.some((drop) => drop.kind === "equip"), `${tableId} seed ${seed}: expected guaranteed equipment`);
  }
}

function assertChestEquipEntriesResolve(tableId, depth, seeds) {
  for (let seed = 0; seed < seeds; seed++) {
    const drops = resolveLootTable(tableId, createRng(seed), depth);
    for (const drop of drops) {
      if (drop.kind !== "equip") continue;
      const equipId = String(drop?.params?.equipId || "");
      const def = getCatalogItem(equipId);
      assert(def, `${tableId} seed ${seed}: unresolved equipId ${equipId}`);
    }
  }
}

Deno.test("chest:basic drop count stays non-empty and within max roll bound", () => {
  assertChestRollBounds("chest:basic", 1, 120);
});

Deno.test("teleportation scroll has elevated escape-scroll weight", () => {
  const entry = LOOT_TABLES["sub:scrolls"].entries
    .find((candidate) => candidate.itemId === "scroll_teleportation");
  assert(entry, "scroll_teleportation should remain in the canonical scroll table");
  assert(entry.weight >= 20, `expected elevated teleportation weight, got ${entry.weight}`);
});

Deno.test("chest:magic drop count stays non-empty and within max roll bound", () => {
  assertChestRollBounds("chest:magic", 3, 120);
});

Deno.test("chest:legendary drop count stays non-empty and within max roll bound", () => {
  assertChestRollBounds("chest:legendary", 5, 80);
});

Deno.test("every chest tier guarantees an equipment reward", () => {
  assertChestGuaranteesEquipment("chest:basic", 1, 120);
  assertChestGuaranteesEquipment("chest:magic", 3, 120);
  assertChestGuaranteesEquipment("chest:epic", 10, 120);
  assertChestGuaranteesEquipment("chest:legendary", 14, 120);
});

Deno.test("chest drops never emit unresolved equipment ids", () => {
  assertChestEquipEntriesResolve("chest:basic", 1, 120);
  assertChestEquipEntriesResolve("chest:magic", 3, 120);
  assertChestEquipEntriesResolve("chest:legendary", 5, 80);
});

Deno.test("chest:basic never drops more than 1 weapon", () => {
  for (let seed = 0; seed < 100; seed++) {
    const rng = createRng(seed);
    const drops = resolveLootTable("chest:basic", rng, 1);
    
    const weapons = drops.filter(drop => {
      if (drop.kind !== "equip") return false;
      const def = getCatalogItem(drop.params.equipId);
      return def && def.slot === "weapon";
    });
    
    assert(weapons.length <= 1, `seed ${seed}: got ${weapons.length} weapons, expected max 1`);
  }
});

Deno.test("chest:magic never drops more than 1 weapon", () => {
  for (let seed = 0; seed < 100; seed++) {
    const rng = createRng(seed);
    const drops = resolveLootTable("chest:magic", rng, 3);
    
    const weapons = drops.filter(drop => {
      if (drop.kind !== "equip") return false;
      const def = getCatalogItem(drop.params.equipId);
      return def && def.slot === "weapon";
    });
    
    assert(weapons.length <= 1, `seed ${seed}: got ${weapons.length} weapons, expected max 1`);
  }
});

Deno.test("chest:legendary never drops more than 1 weapon", () => {
  for (let seed = 0; seed < 50; seed++) {
    const rng = createRng(seed);
    const drops = resolveLootTable("chest:legendary", rng, 5);
    
    const weapons = drops.filter(drop => {
      if (drop.kind !== "equip") return false;
      const def = getCatalogItem(drop.params.equipId);
      return def && def.slot === "weapon";
    });
    
    assert(weapons.length <= 1, `seed ${seed}: got ${weapons.length} weapons, expected max 1`);
  }
});
