import { assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { ActiveEffects } from "../src/rules/components/ActiveEffects.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { ProcPackageNode } from "../src/rules/components/ProcPackageNode.js";
import { addAttachedComponent } from "../src/rules/utils/statProcAuthoring.js";
import { attachGemSocketNodes } from "../src/rules/data/gemSocketAffixes.js";
import { attachProcPackage } from "../src/rules/data/procPackages.js";
import { resolveWeaponVisualAffinity } from "../src/rules/data/weaponVisualAffinity.js";

function addWeapon(world, identity = "test_sword", info = {}) {
  const id = world.create();
  world.add(id, NamedIdentity, { name: identity, identity });
  world.add(id, ItemInfo, {
    type: "equip",
    slot: "weapon",
    weight: 1,
    value: 0,
    description: "",
    count: 1,
    bonuses: {},
    rarity: 1,
    rarityName: "common",
    affixes: [],
    damageDice: "1d6",
    damageType: "slash",
    ...info,
  });
  return id;
}

Deno.test("weapon visual affinity resolves poison coatings and fire affixes", () => {
  const world = new World({ seed: 1 });
  const poisoned = addWeapon(world, "plain_dagger", { coating: { kind: "poison", charges: 4 } });
  const poisonAffinity = resolveWeaponVisualAffinity(world, { weaponId: poisoned });
  assertEquals(poisonAffinity?.id, "poison");
  assertEquals(poisonAffinity?.elementTint, "poison");
  assertEquals(poisonAffinity?.swingStyle, "poison");

  const flaming = addWeapon(world, "plain_sword", { affixes: ["flaming"] });
  const flameAffinity = resolveWeaponVisualAffinity(world, { weaponId: flaming });
  assertEquals(flameAffinity?.id, "fire");
  assertEquals(flameAffinity?.elementTint, "fire");
  assertEquals(flameAffinity?.swingStyle, "flame");

  const firestorm = addWeapon(world, "plain_axe", { affixes: ["affix:firestorm1"] });
  const firestormAffinity = resolveWeaponVisualAffinity(world, { weaponId: firestorm });
  assertEquals(firestormAffinity?.id, "fire");
  assertEquals(firestormAffinity?.swingStyle, "flame");
});

Deno.test("weapon visual affinity resolves socketed gem authored affinities", () => {
  const cases = [
    ["gem_ruby", "fire", "flame"],
    ["gem_emerald", "poison", "poison"],
    ["gem_topaz", "electric", "electric"],
    ["gem_voidstone", "void", "void"],
  ];

  for (const [gemId, expectedId, expectedStyle] of cases) {
    const world = new World({ seed: 2 });
    const weapon = addWeapon(world, `socketed_${gemId}`);
    attachGemSocketNodes(world, weapon, gemId);
    const affinity = resolveWeaponVisualAffinity(world, { weaponId: weapon });
    assertEquals(affinity?.id, expectedId, `${gemId} should resolve visual affinity`);
    assertEquals(affinity?.swingStyle, expectedStyle);
  }
});

Deno.test("weapon visual affinity resolves authored proc package affinity without generic magic fallback", () => {
  const world = new World({ seed: 3 });
  const shadowWeapon = addWeapon(world, "toll_blade");
  attachProcPackage(world, shadowWeapon, "tollwarden");
  const shadow = resolveWeaponVisualAffinity(world, { weaponId: shadowWeapon });
  assertEquals(shadow?.id, "shadow");
  assertEquals(shadow?.swingStyle, "shadow");

  const plain = addWeapon(world, "plain_magic_sword", { rarity: 2, rarityName: "magic" });
  assertEquals(resolveWeaponVisualAffinity(world, { weaponId: plain }), null);

  const paralysis = addWeapon(world, "paralysis_dagger", { coating: { kind: "paralysis", charges: 3 } });
  assertEquals(resolveWeaponVisualAffinity(world, { weaponId: paralysis }), null);

  const unstyledPackage = addWeapon(world, "unstyled_package_blade");
  addAttachedComponent(world, unstyledPackage, ProcPackageNode, { packageId: "arrowInstinct" });
  assertEquals(resolveWeaponVisualAffinity(world, { weaponId: unstyledPackage }), null);
});

Deno.test("weapon visual affinity includes active weapon-buff effects", () => {
  const world = new World({ seed: 4 });
  const actor = world.create();
  const weapon = addWeapon(world, "plain_sword");
  world.add(actor, ActiveEffects, { effects: [{ key: "fire_weapon", turnsLeft: 3, potency: 1, stacks: 1 }] });

  const affinity = resolveWeaponVisualAffinity(world, { actorId: actor, weaponId: weapon });
  assertEquals(affinity?.id, "fire");
  assertEquals(affinity?.swingStyle, "flame");
});

Deno.test("weapon visual affinity treats ignite_weapons like a flame weapon", () => {
  const world = new World({ seed: 5 });
  const actor = world.create();
  const weapon = addWeapon(world, "plain_sword");
  world.add(actor, ActiveEffects, { effects: [{ key: "ignite_weapons", turnsLeft: 3, potency: 1, stacks: 1 }] });

  const affinity = resolveWeaponVisualAffinity(world, { actorId: actor, weaponId: weapon });
  assertEquals(affinity?.id, "fire");
  assertEquals(affinity?.swingStyle, "flame");
});
