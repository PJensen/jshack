import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { createRng } from "../src/lib/ecs-js/rng.js";
import { resolveLootTable } from "../src/rules/data/lootResolver.js";
import { getCatalogItem } from "../src/rules/data/itemCatalog.js";

Deno.test("known spells are suppressed from spellbook drops", () => {
  // Run many seeds — sub:spellbooks should never produce a known spell
  const knownSpells = new Set(["lightning", "meteor"]);
  const opts = { knownSpells };

  let totalBooks = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rng = createRng(seed);
    const drops = resolveLootTable("sub:spellbooks", rng, 5, 0, opts);
    for (const drop of drops) {
      assert(drop.kind === "item", "sub:spellbooks should only produce items");
      const spellId = drop.params.itemId.replace(/^book_/, "");
      assert(!knownSpells.has(spellId),
        `seed ${seed}: got book_${spellId} but spell "${spellId}" is known`);
      totalBooks++;
    }
  }
  // We should still get books from the remaining unknown pool.
  assert(totalBooks > 0, "should still drop unknown spellbooks");
});

Deno.test("all spells known suppresses entire spellbook sub-table", () => {
  const knownSpells = new Set([
    "lightning", "meteor", "blastwave", "frost", "frost_nova", "blizzard", "firestorm",
    "fireball", "scorch", "magic_missile", "arcane_barrage", "void_hole", "arcane_bolt",
    "iron_flesh", "bloodthirst", "cleave", "war_cry", "earthshatter",
    "rampage", "primal_roar",
    "heal", "barkskin", "thorn_burst", "entangle", "verdant_ward",
    "harmony_ward", "poison_blade", "plague_swarm",
    "quicken", "blind", "fear", "shadow_veil", "smoke_bomb", "phase_strike",
    "blink", "ignite_weapons",
    "shadow_bolt", "agony", "mark_of_death", "drain_life", "summon_skeleton", "resurrection",
    "flash_heal", "smite", "divine_shield", "purify", "consecrate",
    "evocation", "homecoming", "hearthstone",
  ]);
  const opts = { knownSpells };

  for (let seed = 1; seed <= 50; seed++) {
    const rng = createRng(seed);
    const drops = resolveLootTable("sub:spellbooks", rng, 5, 0, opts);
    assertEquals(drops.length, 0,
      `seed ${seed}: should get no drops when all spells known`);
  }
});

Deno.test("without opts, spellbooks drop normally", () => {
  let totalBooks = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const rng = createRng(seed);
    const drops = resolveLootTable("sub:spellbooks", rng, 5);
    totalBooks += drops.length;
  }
  assert(totalBooks > 0, "should drop spellbooks without filtering");
});

Deno.test("known-spell filter does not affect non-book item entries", () => {
  // Potions are "item" type entries but not books — should be unaffected
  const knownSpells = new Set(["lightning", "meteor"]);
  const opts = { knownSpells };

  let totalPotions = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const rng = createRng(seed);
    const drops = resolveLootTable("sub:potions", rng, 5, 0, opts);
    totalPotions += drops.filter(d => d.kind === "item").length;
  }
  assert(totalPotions > 0, "non-book item entries should still drop");
});

Deno.test("floor loot favors varied arcade pickups over plain gold", () => {
  const kinds = new Set();
  let gold = 0;
  let total = 0;

  for (let seed = 1; seed <= 300; seed++) {
    const drops = resolveLootTable("floor:common", createRng(seed), 3);
    for (const drop of drops) {
      total++;
      kinds.add(drop.kind);
      if (drop.kind === "gold") gold++;
    }
  }

  assert(kinds.has("equip"), "floor:common should surface equipment");
  assert(kinds.has("item"), "floor:common should surface catalog magic/consumable items");
  assert(kinds.has("gem"), "floor:common should surface gems");
  assert(gold / total < 0.25, `expected gold under 25% of floor drops, got ${gold}/${total}`);
});

Deno.test("sub:equip_common can naturally drop helm_iron", () => {
  let seen = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rng = createRng(seed);
    const drops = resolveLootTable("sub:equip_common", rng, 2);
    for (const drop of drops) {
      if (drop.kind === "equip" && drop.params?.equipId === "helm_iron") {
        seen++;
      }
    }
  }
  assert(seen > 0, "expected to see helm_iron in common equipment drops");
});

Deno.test("sub:equip_uncommon exposes the authored green gear band", () => {
  const ids = new Set();
  for (let seed = 1; seed <= 500; seed++) {
    const drops = resolveLootTable("sub:equip_uncommon", createRng(seed), 3);
    for (const drop of drops) {
      if (drop.kind === "equip") ids.add(drop.params?.equipId);
    }
  }

  assertEquals(ids.size, 8, "all uncommon gear should be reachable");
  for (const id of ids) {
    assertEquals(getCatalogItem(id)?.rarityName, "uncommon", `${id} should be green-tier gear`);
  }
});

Deno.test("sub:potions can naturally drop potion_water", () => {
  let seen = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const rng = createRng(seed);
    const drops = resolveLootTable("sub:potions", rng, 5);
    for (const drop of drops) {
      if (drop.kind === "item" && drop.params?.itemId === "potion_water") seen++;
    }
  }
  assert(seen > 0, "expected to see potion_water in potion drops");
});

Deno.test("spell-proc offhands are suppressed when required spells are unknown", () => {
  const blocked = new Set(["glacier_sigil", "conduction_lens", "echo_grimoire"]);
  const opts = { knownSpells: new Set() };
  let seenBlocked = 0;
  for (let seed = 1; seed <= 700; seed++) {
    const rareDrops = resolveLootTable("sub:equip_rare", createRng(seed), 4, 0, opts);
    const epicDrops = resolveLootTable("sub:equip_epic", createRng(seed + 1000), 5, 0, opts);
    for (const drop of [...rareDrops, ...epicDrops]) {
      if (drop.kind !== "equip") continue;
      if (blocked.has(String(drop.params?.equipId || ""))) seenBlocked++;
    }
  }
  assertEquals(seenBlocked, 0, "spell-proc offhands should not drop with no known spells");
});

Deno.test("spell-proc offhands become eligible when matching spells are known", () => {
  const seen = new Set();
  const opts = { knownSpells: new Set(["frost", "lightning"]) };
  for (let seed = 1; seed <= 1400; seed++) {
    const rareDrops = resolveLootTable("sub:equip_rare", createRng(seed), 4, 0, opts);
    const epicDrops = resolveLootTable("sub:equip_epic", createRng(seed + 5000), 5, 0, opts);
    for (const drop of [...rareDrops, ...epicDrops]) {
      if (drop.kind !== "equip") continue;
      const id = String(drop.params?.equipId || "");
      if (id === "glacier_sigil" || id === "conduction_lens" || id === "echo_grimoire") seen.add(id);
    }
    if (seen.size === 3) break;
  }
  assert(seen.has("glacier_sigil"), "glacier_sigil should become eligible when frost is known");
  assert(seen.has("conduction_lens"), "conduction_lens should become eligible when lightning is known");
  assert(seen.has("echo_grimoire"), "echo_grimoire should become eligible once any spell is known");
});

Deno.test("gemstone loot pool produces varied real gems", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 1200; seed++) {
    const rng = createRng(seed);
    const drops = resolveLootTable("sarcophagus:contents", rng, 5);
    for (const drop of drops) {
      if (drop.kind !== "gem") continue;
      const id = String(drop.params?.gemId || "");
      if (id.startsWith("glass_") || id.startsWith("stone_")) {
        throw new Error(`unexpected non-gemstone in gemstone pool: ${id}`);
      }
      seen.add(id);
    }
  }
  assert(seen.size > 1, `expected varied gemstone identities, got ${Array.from(seen).join(", ") || "none"}`);
  assert(!seen.has("gem_dilithium") || seen.size > 2, "gemstone pool should not collapse to dilithium-only");
});
