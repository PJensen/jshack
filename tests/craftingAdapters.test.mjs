import { assert, assertEquals } from "jsr:@std/assert";
import { adaptAlchemyState, adaptCookingState, adaptEnchantingState, adaptSmithingState } from "../src/display/ui/craftingAdapters.js";

Deno.test("crafting adapters preserve unavailable recipes for inspection", () => {
  const model = adaptSmithingState({
    anvilId: 12,
    materials: { iron: 2, lumber: 0 },
    recipes: [{ key: "iron_shield", itemId: "shield_iron", iron: 2, lumber: 1, outputName: "Iron Shield", canCraft: false }],
  });

  assertEquals(model.recipes.length, 1);
  assertEquals(model.recipes[0].canCraft, false);
  assertEquals(model.recipes[0].requirements[0].available, 2);
  assertEquals(model.recipes[0].requirements[1].available, 0);
  assert(model.recipes[0].action.detail.recipe === "iron_shield");
});

Deno.test("crafting adapters preserve cooking requirement and consumption distinctions", () => {
  const model = adaptCookingState({
    fireId: 7,
    ingredients: { flour: 1, wheat: 1, water: 1, firewood: 0 },
    recipes: [{
      key: "trail_bread",
      outputIdentity: "food_trail_bread",
      outputName: "Trail Bread",
      requirements: { flour: 1, wheat: 1, water: 1, firewood: 1 },
      consumes: { flour: 1, wheat: 1, firewood: 1 },
      canCraft: false,
    }],
  });

  const requirements = model.recipes[0].requirements;
  assertEquals(requirements.find((req) => req.key === "water")?.consumed, false);
  assertEquals(requirements.find((req) => req.key === "firewood")?.available, 0);
  assertEquals(model.recipes[0].missingText, "Missing: 1 firewood");
});

Deno.test("enchanting adapter maps canonical reagent identities and action contract", () => {
  const model = adaptEnchantingState({
    benchId: 5,
    ingredients: { emberRoot: 2, ashes: 1, oil: 1, runeFragment: 1, gold: 70 },
    recipes: [{
      key: "firestorm_script",
      outputIdentity: "scroll_enchant_fire",
      outputName: "Scroll of Firestorm Binding",
      requirements: { emberRoot: 2, ashes: 1, oil: 1, runeFragment: 1, gold: 70 },
      requirementLabels: { emberRoot: "Ember Root", ashes: "Ashes", oil: "Flask of Oil", runeFragment: "Rune Fragment", gold: "Gold" },
      requirementIdentities: { emberRoot: "reagent_ember_root", ashes: "ashes", oil: "potion_oil", runeFragment: "reagent_rune_fragment", gold: "gold" },
      canCraft: true,
    }],
  });

  assertEquals(model.recipes[0].canCraft, true);
  assertEquals(model.recipes[0].requirements.find((req) => req.key === "emberRoot")?.identity, "reagent_ember_root");
  assertEquals(model.recipes[0].action.eventName, "ui:requestCraftEnchant");
});

Deno.test("alchemy adapter maps potion outputs and canonical reagent identities", () => {
  const model = adaptAlchemyState({
    benchId: 8,
    ingredients: { thornPods: 2, venomFronds: 3 },
    recipes: [{
      key: "caustic_venom",
      label: "Caustic Venom",
      outputIdentity: "potion_poison",
      outputName: "Potion of Poison",
      outputCount: 2,
      requirements: { thornPods: 2, venomFronds: 3 },
      requirementLabels: { thornPods: "Thorn Pods", venomFronds: "Venom Fronds" },
      requirementIdentities: { thornPods: "reagent_thorn_pod", venomFronds: "reagent_venom_frond" },
      canCraft: true,
    }],
  });

  assertEquals(model.actionLabel, "Distill");
  assertEquals(model.recipes[0].canCraft, true);
  assertEquals(model.recipes[0].outputCount, 2);
  assertEquals(model.recipes[0].requirements.find((req) => req.key === "thornPods")?.identity, "reagent_thorn_pod");
  assertEquals(model.recipes[0].action.eventName, "ui:requestAlchemyBrew");
});
