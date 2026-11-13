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
import "../src/content/items/rangedWeapons.js";
import "../src/content/items/weapons.js";
import "../src/content/items/helms.js";
import "../src/content/items/scrolls.js";
import { installContent } from "../src/content/install.js";
import { buildCatalogItem } from "../src/rules/data/itemCatalogLoader.js";
import { attachEnchantmentNode } from "../src/rules/utils/enchantmentTopology.js";

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

Deno.test("buildItemDisplayData formats authored proc packages as equip mechanics", () => {
  resetIdentification();
  installContent();
  const world = new World({ seed: 24 });
  const blade = buildItemDisplayData(world, buildCatalogItem(world, "blade_of_echoes"));

  assertEquals(blade.mechanics, [
    { context: "Equip", text: "Stores the last landed hit and replays part of it as spectral force on the next swing." },
  ]);
  assertEquals(blade.detailLines, []);
  assertEquals(blade.procNodes, []);

  const tollingBlade = buildItemDisplayData(world, buildCatalogItem(world, "tolling_blade"));
  assertEquals(tollingBlade.mechanics, [
    { context: "Equip", text: "Repeated hits build a 3-hit countdown that resets after 9 turns and detonates for shadow damage (minimum 4) plus a 1-turn stun." },
  ]);
  assertEquals(tollingBlade.detailLines, []);

  const bloodCirclet = buildItemDisplayData(world, buildCatalogItem(world, "blood_circlet"));
  assertEquals(bloodCirclet.mechanics, [
    { context: "Equip", text: "Spend 2 HP before each hit for +4 fire damage and restore 2 mana, then recover 2 HP on kill." },
  ]);
});

Deno.test("buildItemDisplayData does not repeat Mirror Bow package mechanics as proc nodes", () => {
  resetIdentification();
  installContent();
  const world = new World({ seed: 183 });
  const data = buildItemDisplayData(world, buildCatalogItem(world, "bow_mirror"));

  assertEquals(data.mechanics, [
    { context: "Equip", text: "Wall-adjacent hits refract into a nearby hostile as arcane backlash." },
  ]);
  assertEquals(data.procNodes, []);
  assertEquals(data.detailLines, []);
});

Deno.test("buildItemDisplayData formats Leech Blade's authored affix as equip mechanics", () => {
  resetIdentification();
  installContent();
  const world = new World({ seed: 184 });
  const data = buildItemDisplayData(world, buildCatalogItem(world, "leech_blade"));

  assertEquals(data.mechanics, [
    { context: "Equip", text: "On hit, 18% chance to heal for half the damage dealt." },
  ]);
  assertEquals(data.procNodes, []);
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
    { context: "Equip", text: "On hit, chance to coat in serpent-hide and thorns. Dodges/parries prime a nature riposte that can slow. Spectral-serpent windows poison melee attackers." },
  ]);

  const boots = buildItemDisplayData(world, buildCatalogItem(world, "breadcrumb_boots"));
  assertEquals(boots.mechanics, [
    { context: "Use — Drop Breadcrumb", text: "Drop one glowing crumb nearby that lingers for 8 turns and draws curious creatures toward it. Cooldown: 5 turns. Cost: 1 charges." },
    { context: "Equip", text: "Banks breadcrumb charges while you travel; use them to drop a decoy crumb." },
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

Deno.test("buildItemDisplayData exposes enchantment scroll effects as authored mechanics", () => {
  resetIdentification();
  identify("scroll_enchant_fire");
  const world = new World({ seed: 23 });
  const scroll = buildCatalogItem(world, "scroll_enchant_fire");

  const data = buildItemDisplayData(world, scroll);
  assert(data, "display data should exist");
  assert(data.mechanics.some((entry) =>
    entry.context === "Enchant" && String(entry.text).includes("kindle lingering fire damage"),
  ));
});

Deno.test("buildItemDisplayData projects socketed gems with canonical detail lines", () => {
  resetIdentification();
  identify("test_socketed_blade");
  const world = new World({ seed: 29 });
  const blade = world.create();
  world.add(blade, NamedIdentity, { identity: "test_socketed_blade", name: "Socketed Blade" });
  world.add(blade, ItemInfo, {
    type: "equip",
    slot: "weapon",
    count: 1,
    identified: true,
    sockets: ["gem_ruby"],
    maxSockets: 2,
    bonuses: {},
    affixes: [],
  });

  const data = buildItemDisplayData(world, blade);
  assertEquals(data.socketedGems?.[0]?.name, "Ruby");
  assert(data.socketedGems[0].detailLines.some((line) => line.startsWith("Socketed:")));
});

Deno.test("buildItemDisplayData keeps standalone gem effects in one mechanic block", () => {
  resetIdentification();
  identify("gem_ruby");
  const world = new World({ seed: 30 });
  const gem = world.create();
  world.add(gem, NamedIdentity, { identity: "gem_ruby", name: "Ruby" });
  world.add(gem, ItemInfo, {
    type: "gem",
    count: 1,
    identified: true,
    description: "Red Gem",
    details: "Socketed: +10% fire resist. On hit: 25% chance to ignite the target.",
    detailLines: ["Socketed: +10% fire resist.", "On hit: 25% chance to ignite the target."],
    bonuses: {},
    affixes: [],
  });

  const data = buildItemDisplayData(world, gem);
  assertEquals(data.description, "");
  assertEquals(data.detailLines, []);
  assertEquals(data.mechanics.map((entry) => entry.context), ["Socket", "On hit"]);
});

Deno.test("buildItemDisplayData labels topology-backed enchantments separately", () => {
  resetIdentification();
  identify("test_enchanted_blade");
  const world = new World({ seed: 31 });
  const blade = world.create();
  world.add(blade, NamedIdentity, { identity: "test_enchanted_blade", name: "Enchanted Blade" });
  world.add(blade, ItemInfo, {
    type: "equip",
    slot: "weapon",
    count: 1,
    identified: true,
    bonuses: {},
    affixes: [],
  });
  attachEnchantmentNode(world, blade, { affixId: "fierce", sourceKey: "scroll_enchant_fierce" });

  const data = buildItemDisplayData(world, blade);
  assert(data.mechanics.some((entry) =>
    entry.context === "Enchant"
      && String(entry.text).includes("+1 damage")
      && entry.iconId === "scroll_enchant_fierce",
  ), JSON.stringify(data.mechanics));
  assertEquals(data.procNodes, []);
});
