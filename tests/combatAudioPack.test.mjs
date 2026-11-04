import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals, assertExists } from "jsr:@std/assert";
import { allUrls, resolve, resolveUrls } from "../src/display/audio/sounds.js";
import { allAdapterCombatSoundIds, planMeleeDeath, planWeaponDeflect, planWeaponDrop, planWeaponImpact, planWeaponReady, planWeaponWhoosh } from "../src/display/audio/combatAudioAdapter.js";
import { allCombatPackFiles, COMBAT_PACK, COMBAT_SOUNDS, combatSoundId } from "../src/display/audio/combatPack.js";
import { buildAudioItemInfo } from "../src/display/composition/setupDisplayRuntime.js";
import { World } from "../src/lib/ecs-js/index.js";
import { ITEM_CATALOG } from "../src/rules/data/itemCatalog.js";
import { buildCatalogItem } from "../src/rules/data/itemCatalogLoader.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { WEAPON_FAMILIES } from "../src/rules/data/weaponFamilies.js";
import {
  resolveCombatFamily,
  resolveCombatSoundPlan,
  resolveGoreAction,
  resolveImpactAction,
  resolveWhooshAction,
} from "../src/display/audio/combatSoundResolver.js";

function collectCombatFiles() {
  const files = [];
  function walk(dir, prefix) {
    for (const entry of Deno.readDirSync(dir)) {
      const path = `${dir}/${entry.name}`;
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory) walk(path, name);
      else if (entry.isFile && entry.name.endsWith(".mp3")) files.push(`combat/${name}`);
    }
  }
  walk("assets/audio/combat", "");
  return files.sort();
}


Deno.test("combat audio pack manifest covers every normalized purchased clip", () => {
  const actual = collectCombatFiles();
  const generated = allCombatPackFiles().slice().sort();
  assertEquals(generated, actual);
});

Deno.test("combat audio pack exposes expected family pools", () => {
  for (const family of ["axe_large", "axe_small", "dagger", "flail", "hammer_large", "mace", "spear", "sword_large", "sword_small", "wooden_staff"]) {
    assertExists(COMBAT_PACK[family], `missing combat family ${family}`);
    for (const action of ["whoosh_short", "whoosh_long", "impact_hard", "impact_soft", "deflect", "equip", "unequip", "finisher"]) {
      assert(COMBAT_PACK[family][action]?.length > 0, `missing ${family}.${action}`);
      assertExists(resolve(combatSoundId(family, action)), `missing sound registry id for ${family}.${action}`);
    }
  }

  for (const family of ["shield_metal", "shield_wood"]) {
    assert(COMBAT_PACK[family].deflect.length > 0, `missing ${family}.deflect`);
    assert(COMBAT_PACK[family].equip.length > 0, `missing ${family}.equip`);
  }

  for (const action of ["impact_small", "impact_medium", "impact_large", "slice_small", "slice_medium", "slice_large", "stab_small", "stab_medium", "stab_large"]) {
    assert(COMBAT_PACK.gore[action]?.length > 0, `missing gore.${action}`);
    assertExists(resolve(combatSoundId("gore", action)), `missing gore sound id ${action}`);
  }
});

Deno.test("sounds registry preloads nested combat pack urls", () => {
  const urls = new Set(allUrls());
  assert(urls.has("./assets/audio/combat/AXE LARGE/AXE LARGE-Whoosh Long-01.mp3"));
  assert(urls.has("./assets/audio/combat/DAGGER/DAGGER-Whoosh Long-07.mp3"));
  assert(urls.has("./assets/audio/combat/WOODEN STAFF/WOODEN STAFF-Equip-07.mp3"));
  assert(urls.has("./assets/audio/combat/GORE/GORE-Impact Small-05.mp3"));
});

Deno.test("combat sound resolver maps current melee equipment into pack families", () => {
  const expected = {
    staff_oak: [{ name: "Oak Staff", slot: "weapon", damageDice: "1d6", damageType: "blunt", material: "wood" }, "wooden_staff"],
    longsword: [{ name: "Longsword", slot: "weapon", damageDice: "1d8", damageType: "slash", twoHanded: true, weight: 2.8 }, "sword_large"],
    sword_plain: [{ name: "Short Sword", slot: "weapon", damageDice: "1d6", damageType: "slash", weight: 1.2 }, "sword_small"],
    dagger_quick: [{ name: "Dagger", slot: "weapon", damageDice: "1d4", damageType: "pierce", weight: 0.5 }, "dagger"],
    axe_heavy: [{ name: "Axe", slot: "weapon", damageDice: "1d8", damageType: "slash", weight: 3.0 }, "axe_large"],
    iron_mace: [{ name: "Iron Mace", slot: "weapon", damageDice: "1d8", damageType: "blunt", weight: 3.2 }, "mace"],
    morningstar: [{ name: "Morningstar", slot: "weapon", damageDice: "1d8", damageType: "blunt", weight: 3.0 }, "mace"],
    warhammer: [{ name: "Warhammer", slot: "weapon", damageDice: "1d8", damageType: "blunt", weight: 3.4 }, "hammer_large"],
    flail: [{ name: "Flail", slot: "weapon", damageDice: "1d8", damageType: "blunt", weight: 3.2 }, "flail"],
    cataclysm_warspear: [{ name: "Cataclysm Warspear", slot: "weapon", damageDice: "1d10", damageType: "pierce", weight: 4.0 }, "spear"],
    shield_wood: [{ name: "Wooden Shield", slot: "offhand", material: "wood" }, "shield_wood"],
    shield_iron: [{ name: "Iron Shield", slot: "offhand", material: "iron" }, "shield_metal"],
    shield_steel: [{ name: "Steel Shield", slot: "offhand", material: "steel" }, "shield_metal"],
  };

  for (const [id, [info, family]] of Object.entries(expected)) {
    assertEquals(resolveCombatFamily({ id, ...info }), family, id);
  }
});

Deno.test("combat sound resolver supports every purchased weapon and shield family", () => {
  const supported = Object.freeze({
    axe_large: { id: "execution_axe", name: "Execution Axe", slot: "weapon", damageDice: "1d10", damageType: "slash", twoHanded: true, weight: 4.2 },
    axe_small: { id: "hand_axe", name: "Hand Axe", slot: "weapon", damageDice: "1d6", damageType: "slash", weight: 1.4 },
    dagger: { id: "dagger_quick", name: "Dagger", slot: "weapon", damageDice: "1d4", damageType: "pierce", weight: 0.5 },
    flail: { id: "flail", name: "Flail", slot: "weapon", damageDice: "1d8", damageType: "blunt", weight: 3.2 },
    hammer_large: { id: "warhammer", name: "Warhammer", slot: "weapon", damageDice: "1d8", damageType: "blunt", weight: 3.4 },
    mace: { id: "iron_mace", name: "Iron Mace", slot: "weapon", damageDice: "1d8", damageType: "blunt", weight: 3.0 },
    shield_metal: { id: "shield_iron", name: "Iron Shield", slot: "offhand", material: "iron" },
    shield_wood: { id: "shield_wood", name: "Wooden Shield", slot: "offhand", material: "wood" },
    spear: { id: "training_spear", name: "Training Spear", slot: "weapon", damageDice: "1d8", damageType: "pierce", weight: 2.2 },
    sword_large: { id: "greatsword", name: "Greatsword", slot: "weapon", damageDice: "1d10", damageType: "slash", twoHanded: true, weight: 3.4 },
    sword_small: { id: "sword_plain", name: "Short Sword", slot: "weapon", damageDice: "1d6", damageType: "slash", weight: 1.2 },
    wooden_staff: { id: "staff_oak", name: "Oak Staff", slot: "weapon", damageDice: "1d6", damageType: "blunt", material: "wood", twoHanded: true, weight: 2.5 },
  });

  assertEquals(new Set(Object.keys(supported)), new Set(Object.keys(COMBAT_PACK).filter((family) => family !== "gore")));

  for (const [family, info] of Object.entries(supported)) {
    assertEquals(resolveCombatFamily(info), family, family);
    assertExists(resolveCombatSoundPlan({ itemInfo: info, action: "whoosh" })?.id, `${family} should resolve whoosh audio`);
    assertExists(resolveCombatSoundPlan({ itemInfo: info, action: "impact_soft" })?.id, `${family} should resolve impact audio`);
    assert(planWeaponReady({ itemInfo: info, action: "equip" }).some((x) => x.id === `combat:weapon:${family}:equip`), `${family} should resolve equip audio`);
    assertEquals(planWeaponDrop({ itemInfo: info }).map((x) => x.id), [`combat:weapon:${family}:impact_soft`], `${family} pickup/drop should use soft impact audio only`);
  }
});

Deno.test("materialized flail keeps flail audio even from raw ItemInfo", () => {
  const world = new World({ seed: 0xC0FFEE });
  const itemId = buildCatalogItem(world, "flail");
  const info = world.get(itemId, ItemInfo);
  const actions = [
    "deflect",
    "deflect_body",
    "deflect_tail",
    "equip",
    "finisher",
    "impact_hard",
    "impact_hard_body",
    "impact_hard_tail",
    "impact_soft",
    "unequip",
    "whoosh_long",
    "whoosh_short",
  ];

  assertEquals(info?.subtype, "flail");
  assertEquals(info?.weaponFamily, "flail");
  assertEquals(resolveCombatFamily(info), "flail");
  for (const action of actions) {
    assertEquals(resolveCombatSoundPlan({ itemInfo: info, action })?.id, `combat:weapon:flail:${action}`);
  }
  assertEquals(resolveCombatSoundPlan({ itemInfo: info, action: "whoosh" })?.id, "combat:weapon:flail:whoosh_short");
});

Deno.test("combat audio adapter plans every flail playback path through flail assets", () => {
  const world = new World({ seed: 0xC0FFEE });
  const itemId = buildCatalogItem(world, "flail");
  const info = world.get(itemId, ItemInfo);

  assertEquals(planWeaponReady({ itemInfo: info, action: "equip" }).map((x) => x.id), ["combat:weapon:flail:equip"]);
  assertEquals(planWeaponReady({ itemInfo: info, action: "unequip" }).map((x) => x.id), ["combat:weapon:flail:unequip"]);
  assertEquals(planWeaponWhoosh({ itemInfo: info }).map((x) => x.id), ["combat:weapon:flail:whoosh_short"]);
  assert(planWeaponDeflect({ itemInfo: info }).every((x) => x.id.startsWith("combat:weapon:flail:deflect")));
  assert(planWeaponImpact({ itemInfo: info, type: "blunt", amount: 2 }).some((x) => x.id === "combat:weapon:flail:impact_soft"));
  assert(planWeaponImpact({ itemInfo: info, type: "blunt", amount: 12, critical: true }).some((x) => x.id === "combat:weapon:flail:impact_hard"));
  assert(planMeleeDeath({ itemInfo: info, damageType: "blunt", amount: 12, critical: true }).some((x) => x.id === "combat:weapon:flail:finisher"));
});

Deno.test("materialized melee weapons carry raw ItemInfo weapon families, including all staffs", () => {
  const expectedStaffs = new Set([
    "ashwood_staff",
    "bloodwood_staff",
    "bone_staff",
    "emberstaff",
    "ironbark_staff",
    "moonroot_staff",
    "resonant_quarterstaff",
    "staff_oak",
    "stormglass_staff",
    "sunken_crown_staff",
    "walking_staff",
  ]);
  const seenStaffs = new Set();
  const supported = new Set(Object.values(WEAPON_FAMILIES));

  for (const [id, rec] of Object.entries(ITEM_CATALOG)) {
    if (rec?.catalogKind !== "equipment" || rec?.slot !== "weapon") continue;

    const world = new World({ seed: 0xA77A77 });
    const itemId = buildCatalogItem(world, id);
    const info = world.get(itemId, ItemInfo);
    const family = resolveCombatFamily(info);

    assert(supported.has(String(info?.weaponFamily || "")), `${id} (${rec.name}) should carry a supported weaponFamily on ItemInfo`);
    assert(family, `${id} (${rec.name}) should resolve to a combat audio family`);
    assertEquals(family, info?.weaponFamily, `${id} (${rec.name}) should resolve from raw ItemInfo weaponFamily`);

    if (id.includes("staff") || String(rec.name || "").toLowerCase().includes("staff")) {
      seenStaffs.add(id);
      assertEquals(family, "wooden_staff", `${id} should use WOODEN STAFF combat audio`);
      assertEquals(planWeaponReady({ itemInfo: info, action: "equip" }).map((x) => x.id), ["combat:weapon:wooden_staff:equip"]);
      assertEquals(resolveCombatSoundPlan({ itemInfo: info, action: "whoosh" })?.id, "combat:weapon:wooden_staff:whoosh_long");
    }
  }

  assertEquals(seenStaffs, expectedStaffs);
});

Deno.test("materialized shields equip and unequip through shield combat pack ids", () => {
  const expected = {
    shield_fireward: "shield_metal",
    shield_wood: "shield_wood",
    shield_iron: "shield_metal",
    shield_spiked_pavise: "shield_metal",
    shield_steel: "shield_metal",
  };

  for (const [id, family] of Object.entries(expected)) {
    const world = new World({ seed: 0xA77A77 });
    const itemId = buildCatalogItem(world, id);
    const info = world.get(itemId, ItemInfo);

    assertEquals(resolveCombatFamily(info), family, `${id} should resolve to ${family}`);
    assertEquals(planWeaponReady({ itemInfo: info, action: "equip" }).map((x) => x.id), [`combat:weapon:${family}:equip`], `${id} equip`);
    assertEquals(planWeaponReady({ itemInfo: info, action: "unequip" }).map((x) => x.id), [`combat:weapon:${family}:unequip`], `${id} unequip`);
    assertEquals(planWeaponWhoosh({ itemInfo: info, fallbackFamily: null }).map((x) => x.id), [`combat:weapon:${family}:whoosh_short`], `${id} thrown whoosh`);
  }
});


Deno.test("authored equipment currently represents every purchased combat family", () => {
  const seen = new Set();
  for (const [id, rec] of Object.entries(ITEM_CATALOG)) {
    if (rec?.catalogKind !== "equipment") continue;
    const slot = String(rec.slot || "");
    if (slot !== "weapon" && slot !== "offhand" && slot !== "shield") continue;
    const family = resolveCombatFamily({ id, identity: id, ...rec });
    if (family) seen.add(family);
  }

  assertEquals(seen, new Set(Object.keys(COMBAT_PACK).filter((family) => family !== "gore")));
});

Deno.test("combat sound resolver does not route non-equipment shield text into shield audio", () => {
  assertEquals(resolveCombatFamily({
    id: "book_divine_shield",
    name: "Spellbook of Divine Shield",
    type: "book",
    slot: "bag",
  }), null);
});

Deno.test("display audio bridge preserves item identity/name/material for weapon family routing", () => {
  const mace = buildAudioItemInfo({
    id: 10,
    info: { type: "equip", slot: "weapon", damageDice: "1d6", damageType: "blunt" },
    getItemMaterial: () => ({ kind: "iron" }),
    getEntityIdentity: () => "mace",
    resolveItemDisplayName: () => "Iron Mace",
  });
  const staff = buildAudioItemInfo({
    id: 11,
    info: { type: "equip", slot: "weapon", damageDice: "1d6", damageType: "blunt" },
    getItemMaterial: () => ({ kind: "wood" }),
    getEntityIdentity: () => "staff_oak",
    resolveItemDisplayName: () => "Oak Staff",
  });

  assertEquals(resolveCombatFamily(mace), "mace");
  assertEquals(resolveCombatFamily(staff), "wooden_staff");
});

Deno.test("combat audio plans mace and staff equip/unequip through purchased pack ids", () => {
  const mace = { id: "mace", identity: "mace", name: "Iron Mace", type: "equip", slot: "weapon", damageDice: "1d6", damageType: "blunt" };
  const staff = { id: "staff_oak", identity: "staff_oak", name: "Oak Staff", type: "equip", slot: "weapon", damageDice: "1d6", damageType: "blunt", material: "wood" };

  assertEquals(planWeaponReady({ itemInfo: mace, action: "equip" }).map((x) => x.id), ["combat:weapon:mace:equip"]);
  assertEquals(planWeaponReady({ itemInfo: mace, action: "unequip" }).map((x) => x.id), ["combat:weapon:mace:unequip"]);
  assertEquals(planWeaponReady({ itemInfo: staff, action: "equip" }).map((x) => x.id), ["combat:weapon:wooden_staff:equip"]);
  assertEquals(planWeaponReady({ itemInfo: staff, action: "unequip" }).map((x) => x.id), ["combat:weapon:wooden_staff:unequip"]);
});

Deno.test("combat audio plans gore layers for blunt slash and pierce hits/deaths", () => {
  const bluntHit = planWeaponImpact({ itemInfo: { name: "Iron Mace", slot: "weapon", damageDice: "1d6" }, type: "blunt", amount: 6 });
  const slashHit = planWeaponImpact({ itemInfo: { name: "Short Sword", slot: "weapon", damageDice: "1d6" }, type: "slash", amount: 3 });
  const pierceDeath = planMeleeDeath({ itemInfo: { name: "Spear", slot: "weapon", damageDice: "1d8" }, damageType: "pierce", amount: 12, critical: true });

  assert(bluntHit.some((x) => x.id === "combat:gore:impact_medium"));
  assert(slashHit.some((x) => x.id === "combat:gore:slice_small"));
  assert(pierceDeath.some((x) => x.id === "combat:gore:stab_large"));
});

Deno.test("combat sound resolver produces action-specific sound plans", () => {
  const longsword = { id: "longsword", name: "Longsword", slot: "weapon", damageDice: "1d8", damageType: "slash", twoHanded: true };
  const dagger = { id: "dagger_quick", name: "Dagger", slot: "weapon", damageDice: "1d4", damageType: "pierce" };
  assertEquals(resolveWhooshAction("sword_large"), "whoosh_long");
  assertEquals(resolveWhooshAction("sword_large", true), "whoosh_short");
  assertEquals(resolveCombatSoundPlan({ itemInfo: longsword, action: "whoosh" })?.id, "combat:weapon:sword_large:whoosh_long");
  assertEquals(resolveCombatSoundPlan({ itemInfo: dagger, action: "whoosh" })?.id, "combat:weapon:dagger:whoosh_short");
  assertEquals(resolveImpactAction({ family: "sword_large", amount: 10 }), "impact_hard");
  assertEquals(resolveImpactAction({ family: "sword_large", amount: 2 }), "impact_soft");
  assertEquals(resolveGoreAction({ damageType: "slash", amount: 3, sizeClass: "S" }), "slice_small");
  assertEquals(resolveGoreAction({ damageType: "pierce", amount: 6 }), "stab_medium");
  assertEquals(resolveGoreAction({ damageType: "blunt", critical: true }), "impact_large");
});

Deno.test("combat sound resolver keeps normal melee on pack ids instead of legacy generic ids", () => {
  const sword = { id: "sword_plain", name: "Short Sword", slot: "weapon", damageDice: "1d6", damageType: "slash" };
  const mace = { id: "iron_mace", name: "Iron Mace", slot: "weapon", damageDice: "1d8", damageType: "blunt", weight: 3.2 };
  const shield = { id: "shield_iron", name: "Iron Shield", slot: "offhand", material: "iron" };

  const swordWhoosh = resolveCombatSoundPlan({ itemInfo: sword, action: "whoosh" })?.id;
  const maceImpact = resolveCombatSoundPlan({ itemInfo: mace, action: "impact_hard" })?.id;
  const shieldDeflect = resolveCombatSoundPlan({ itemInfo: shield, action: "deflect" })?.id;

  assertEquals(swordWhoosh, "combat:weapon:sword_small:whoosh_short");
  assertEquals(maceImpact, "combat:weapon:mace:impact_hard");
  assertEquals(shieldDeflect, "combat:weapon:shield_metal:deflect");
  assert(swordWhoosh !== "melee:miss");
  assert(maceImpact !== "melee:hit");
  assert(maceImpact !== "melee:crit");
  assert(shieldDeflect !== "shield:blocked");
});

Deno.test("combat audio adapter covers every purchased pack sound id", () => {
  const adapterIds = allAdapterCombatSoundIds();
  const packIds = new Set(Object.keys(COMBAT_SOUNDS));
  assertEquals(adapterIds, packIds);
});

Deno.test("combat audio adapter resolves every normalized purchased clip through engine sound ids", () => {
  const actualFiles = new Set(collectCombatFiles());
  const adapterFiles = new Set();
  for (const id of allAdapterCombatSoundIds()) {
    for (const url of resolveUrls(id)) adapterFiles.add(url.replace("./assets/audio/", ""));
    assertExists(resolve(id), `adapter sound id must resolve: ${id}`);
  }
  assertEquals(adapterFiles, actualFiles);
});

Deno.test("ranged audio stays on ranged assets instead of weapon pack aliases", () => {
  assertExists(resolve("ranged:shot"), "ranged:shot must resolve");
  assertExists(resolve("travel:arrow"), "travel:arrow must resolve");
});
