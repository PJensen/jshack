import { assert, assertEquals } from "jsr:@std/assert";
import { World, attach } from "../src/lib/ecs-js/index.js";
import { ActivationGate } from "../src/rules/components/ActivationGate.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { ProcEffect } from "../src/rules/components/ProcEffect.js";
import { ProcNode } from "../src/rules/components/ProcNode.js";
import { ProcPackageNode } from "../src/rules/components/ProcPackageNode.js";
import { buildItemDisplayData } from "../src/main/wiring/itemName.js";
import { identify, resetIdentification } from "../src/rules/data/identification.js";
import "../src/content/items/sunsword.js";
import "../src/content/items/belts.js";
import "../src/content/items/pocketRelics.js";
import "../src/content/items/fishingRod.js";
import "../src/content/items/lodbrokSerpentBoundBreeches.js";
import "../src/content/items/boots.js";
import { installContent } from "../src/content/install.js";
import { buildCatalogItem } from "../src/rules/data/itemCatalogLoader.js";

Deno.test("buildItemDisplayData enriches spell-linked items with target effects", () => {
  resetIdentification();
  const world = new World({ seed: 1 });
  const wand = world.create();
  identify("wand_frost"); // Item must be identified to reveal spell details
  world.add(wand, NamedIdentity, { identity: "wand_frost", name: "Wand of Frost" });
  world.add(wand, ItemInfo, {
    type: "wand",
    slot: "ranged",
    count: 1,
    rarityName: "rare",
    description: "fallback description",
    bonuses: {},
    affixes: [],
  });

  const data = buildItemDisplayData(world, wand);
  assert(data, "display data should exist");
  assertEquals(data.spellId, "frost");
  assert(Array.isArray(data.detailLines) && data.detailLines.length > 0, "detail lines should be present");
  assert(Array.isArray(data.targetEffects) && data.targetEffects.length > 0, "target effects should be present");
  assert(String(data.description).toLowerCase().includes("winter"), "description should come from spell flavor text");
});

Deno.test("buildItemDisplayData includes proc-node summaries for gear items", () => {
  resetIdentification();
  const world = new World({ seed: 7 });
  const sword = world.create();
  identify("test_proc_sword");
  world.add(sword, NamedIdentity, { identity: "test_proc_sword", name: "Proc Sword" });
  world.add(sword, ItemInfo, {
    type: "equip",
    slot: "weapon",
    count: 1,
    identified: true,
    bonuses: {},
    affixes: [],
  });

  const pkg = world.create();
  world.add(pkg, ProcPackageNode, { packageId: "echoStrike" });
  attach(world, pkg, sword);

  const proc = world.create();
  world.add(proc, ProcNode, { enabled: true, priority: 0 });
  attach(world, proc, pkg);

  const gate = world.create();
  world.add(gate, ActivationGate, { kind: "eventKind", a: "onHit", b: 0, c: "", enabled: true, priority: 0 });
  attach(world, gate, proc);

  const chance = world.create();
  world.add(chance, ActivationGate, { kind: "chance", a: "", b: 0.35, c: "", enabled: true, priority: 0 });
  attach(world, chance, proc);

  const effect = world.create();
  world.add(effect, ProcEffect, { kind: "bonusDamageFlat", a: 1, b: 4, c: "fire", enabled: true, priority: 0 });
  attach(world, effect, proc);

  const data = buildItemDisplayData(world, sword);
  assert(data, "display data should exist");
  assert(Array.isArray(data.procNodes), "procNodes should be present");
  assertEquals(data.procNodes.length, 1);
  assertEquals(data.procNodes[0].source, "Package: Echo Strike");
  assertEquals(data.procNodes[0].trigger, "On Hit");
  assert(data.procNodes[0].qualifiers.includes("35%"), "chance gate should be represented in qualifiers");
  assert(data.procNodes[0].effects.some((line) => String(line).includes("+1-4 Fire Damage")), "effect summary should include damage range and type");
});

Deno.test("buildItemDisplayData exposes Sunsword mechanics separately from stats", () => {
  resetIdentification();
  identify("sunsword");
  installContent();
  const world = new World({ seed: 23 });
  const sword = buildCatalogItem(world, "sunsword");

  const data = buildItemDisplayData(world, sword);
  assert(data, "display data should exist");
  assertEquals(data.bonuses.attack, 2);
  assertEquals(data.mechanics, [
    { context: "Use — Blinding Ray", text: "A searing ray of sunlight that blinds the target. Range: 6 tiles. Cooldown: 12 turns." },
  ]);
});

Deno.test("buildItemDisplayData exposes Bombardier metadata-backed mechanics", () => {
  resetIdentification();
  installContent();
  const world = new World({ seed: 29 });
  const belt = buildCatalogItem(world, "belt_bombardier");

  const data = buildItemDisplayData(world, belt);
  assert(data, "display data should exist");
  assertEquals(data.mechanics, [
    { context: "Wearing", text: "Bomb arrows gain +1 hazard radius." },
    { context: "Loot", text: "Bomb arrows appear at 1.4× weighting." },
  ]);
});

Deno.test("buildItemDisplayData exposes authored pocket relic mechanics", () => {
  resetIdentification();
  installContent();
  const world = new World({ seed: 31 });

  const hourglass = buildItemDisplayData(world, buildCatalogItem(world, "bloodglass_hourglass"));
  assertEquals(hourglass.mechanics, [
    { context: "Use — Turn the Glass", text: "Restore 3 mana each turn for 6 turns, but take 2 damage every 2 turns. Cooldown: 18 turns." },
  ]);

  const spool = buildItemDisplayData(world, buildCatalogItem(world, "widows_spool"));
  assertEquals(spool.mechanics, [
    { context: "Use — Stitch Venom", text: "Knot a venom thread for 6 turns. Each thread deals 1 poison damage per turn; stacks to 3. Range: 5 tiles. Cooldown: 1 turn. Cost: 1 charge." },
  ]);

  const bell = buildItemDisplayData(world, buildCatalogItem(world, "drowned_bell"));
  assertEquals(bell.mechanics, [
    { context: "Use — Merciful Toll", text: "Stun the enemy for 3 turns, but heal it for 2 HP each turn. Range: 4 tiles. Cooldown: 12 turns. Cost: 1 charge." },
  ]);

  const cricket = buildItemDisplayData(world, buildCatalogItem(world, "brass_cricket"));
  assertEquals(cricket.mechanics, [
    { context: "Use — Wind the Cricket", text: "Restore 3 stamina each turn for 6 turns, but take 1 damage every 2 turns. Songs overlap independently. Cooldown: 2 turns. Cost: 1 charge." },
  ]);
});

Deno.test("buildItemDisplayData exposes authored mechanics for fishing rod, breeches, and boots", () => {
  resetIdentification();
  installContent();
  const world = new World({ seed: 37 });

  const rod = buildItemDisplayData(world, buildCatalogItem(world, "fishing_rod"));
  assertEquals(rod.mechanics, [
    { context: "Use — Cast Line", text: "Cast into nearby water and channel the catch for 12 turns." },
  ]);

  const breeches = buildItemDisplayData(world, buildCatalogItem(world, "lodbrok_serpent_bound_breeches"));
  assertEquals(breeches.mechanics, [
    { context: "Use — Laugh at the Pit", text: "Breaks snares, roots, webs, freezing, grapples, and constriction. Summons 3 spectral serpents for 10 turns and grants serpent-hide for 8 turns. Cooldown: 100 turns." },
  ]);

  const boots = buildItemDisplayData(world, buildCatalogItem(world, "breadcrumb_boots"));
  assertEquals(boots.mechanics, [
    { context: "Use — Scatter", text: "Every 4 steps, leave a glowing crumb that lingers for 8 turns. Scatter lays 4 decoy crumbs nearby. Cooldown: 20 turns. Cost: 4 charges." },
  ]);
});

Deno.test("buildItemDisplayData preserves rarityName for unidentified items", () => {
  resetIdentification();
  const world = new World({ seed: 19 });
  const wand = world.create();
  world.add(wand, NamedIdentity, { identity: "wand_frost", name: "Wand of Frost" });
  world.add(wand, ItemInfo, {
    type: "wand",
    slot: "ranged",
    count: 1,
    rarityName: "epic",
    bonuses: { spellHit: 2 },
    affixes: [{ id: "arcane_focus", tier: 1 }],
    description: "A freezing focus",
  });

  const data = buildItemDisplayData(world, wand);
  assert(data, "display data should exist");
  assertEquals(data.identified, false, "wand should remain unidentified by default");
  assertEquals(data.rarityName, "epic", "rarity should be preserved for UI chip coloring");
  assertEquals(data.description, "", "unidentified items should still hide description");
  assertEquals(data.affixes, [], "unidentified items should still hide affixes");
});
