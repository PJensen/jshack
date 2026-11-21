import { assert, assertEquals } from "jsr:@std/assert";
import { ITEM_CATALOG } from "../src/rules/data/itemCatalog.js";
import { LOOT_TABLES } from "../src/rules/data/lootTables.js";
import { createRng } from "../src/lib/ecs-js/rng.js";
import { resolveLootTable } from "../src/rules/data/lootResolver.js";
import { buildLootCoverageReport, validateLootTables } from "../.agents/skills/agent-tools/scripts/loot-coverage-audit.mjs";

function collectEquipPoolsFromLootTables() {
  const seen = new Set();

  /**
   * @param {string} tableId
   * @param {Set<string>} stack
   */
  function walkTable(tableId, stack = new Set()) {
    if (stack.has(tableId)) return;
    const table = LOOT_TABLES[tableId];
    if (!table) return;

    const nextStack = new Set(stack);
    nextStack.add(tableId);

    for (const entry of table.entries || []) {
      if (entry.type === "equip" && Array.isArray(entry.pool)) {
        for (const equipId of entry.pool) seen.add(equipId);
      }
      if (entry.type === "table" && entry.tableId) {
        walkTable(entry.tableId, nextStack);
      }
    }
  }

  for (const tableId of Object.keys(LOOT_TABLES)) {
    walkTable(tableId);
  }
  return seen;
}

// Items only obtainable via crafting/smithing — not dropped as loot.
const CRAFTED_ONLY_EQUIPMENT = new Set(["tool_hatchet", "tool_kitchen_knife"]);

Deno.test("equipment catalog ids are represented in loot table equip pools", () => {
  const allEquipmentIds = Object.values(ITEM_CATALOG)
    .filter((def) => def?.catalogKind === "equipment" && !CRAFTED_ONLY_EQUIPMENT.has(def.id))
    .map((def) => def.id)
    .sort();

  const pooled = collectEquipPoolsFromLootTables();
  const missing = allEquipmentIds.filter((id) => !pooled.has(id));

  assertEquals(
    missing,
    [],
    `Found equipment ids missing from loot table equip pools: ${missing.join(", ")}`
  );
});

Deno.test("all authored loot tables pass static coverage validation", () => {
  const report = validateLootTables(LOOT_TABLES);
  assertEquals(report.issues, []);
  assertEquals(Object.keys(report.nestedRefs).sort(), Object.keys(LOOT_TABLES).sort());
});

Deno.test("all authored loot tables resolve through the canonical resolver", () => {
  for (const tableId of Object.keys(LOOT_TABLES)) {
    for (let seed = 1; seed <= 8; seed++) {
      const drops = resolveLootTable(tableId, createRng(seed), 5);
      assert(Array.isArray(drops), `${tableId} should resolve to a drop array`);
    }
  }
});

Deno.test("loot coverage report accounts for dynamic tier routing and nested tables", async () => {
  const report = await buildLootCoverageReport({ roots: ["src", "tests", "docs"] });
  assertEquals(report.issueCount, 0);
  assertEquals(report.uncoveredRuntime, []);
  assert(report.dynamicRoutes.some((route) => route.pattern === "drop:tier${tier}"));
  assertEquals(
    report.rows.find((row) => row.tableId === "sub:fishing_epic_weapon")?.runtimeCoverage,
    "nested-or-dynamic",
  );
});
