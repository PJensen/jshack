// rules/data/cookingRecipes.js
// Recipe definitions for cooking fires.

export const COOKING_INGREDIENTS = Object.freeze({
  corpse: Object.freeze({ label: "corpse", identityPrefix: "corpse_" }),
  herbs: Object.freeze({ label: "wild herbs", identity: "food_wild_herbs" }),
  berries: Object.freeze({ label: "wild berries", identity: "food_wild_berries" }),
  mushrooms: Object.freeze({ label: "dungeon mushrooms", identity: "food_mushrooms" }),
  flour: Object.freeze({ label: "flour", identity: "food_flour" }),
  wheat: Object.freeze({ label: "wheat", identity: "food_wheat" }),
  carrot: Object.freeze({ label: "carrot", identity: "food_carrot" }),
  corn: Object.freeze({ label: "corn", identity: "food_corn" }),
  fish: Object.freeze({ label: "raw fish", identity: "food_raw_fish" }),
  water: Object.freeze({ label: "water", identity: "water_bucket" }),
  firewood: Object.freeze({ label: "firewood", identity: "fuel_firewood" }),
  knife: Object.freeze({ label: "kitchen knife", identity: "tool_kitchen_knife", tool: true }),
  emberRoot: Object.freeze({ label: "ember root", identity: "reagent_ember_root" }),
  spiderLeg: Object.freeze({ label: "spider leg", identity: "reagent_spider_leg" }),
  venomGland: Object.freeze({ label: "venom gland", identity: "reagent_venom_gland" }),
  beastClaw: Object.freeze({ label: "beast claw", identity: "reagent_beast_claw" }),
  boneDust: Object.freeze({ label: "bone dust", identity: "reagent_bone_dust" }),
  ectoplasm: Object.freeze({ label: "ectoplasm", identity: "reagent_ectoplasm" }),
  kelp: Object.freeze({ label: "kelp", identity: "fishing_kelp" }),
});

export const COOKING_RECIPES = Object.freeze([
  Object.freeze({
    key: "hearty_stew",
    label: "Hearty Stew",
    outputIdentity: "food_hearty_stew",
    outputName: "Hearty Stew",
    requirements: Object.freeze({ corpse: 1, carrot: 1, firewood: 1 }),
    consumes: Object.freeze({ corpse: 1, carrot: 1, firewood: 1 }),
    flavor: "A rich stew that keeps wounds closing for a long while.",
  }),
  Object.freeze({
    key: "trail_bread",
    label: "Trail Bread",
    outputIdentity: "food_trail_bread",
    outputName: "Trail Bread",
    requirements: Object.freeze({ wheat: 1, firewood: 1 }),
    consumes: Object.freeze({ wheat: 1, firewood: 1 }),
    flavor: "Dense fire-baked bread that steadies long marches.",
  }),
  Object.freeze({
    key: "mushroom_broth",
    label: "Mushroom Broth",
    outputIdentity: "food_mushroom_broth",
    outputName: "Mushroom Broth",
    requirements: Object.freeze({ mushrooms: 1, firewood: 1 }),
    consumes: Object.freeze({ mushrooms: 1, firewood: 1 }),
    flavor: "Earthy broth that helps the body shrug off venom.",
  }),
  Object.freeze({
    key: "ember_roast",
    label: "Ember Roast",
    outputIdentity: "food_ember_roast",
    outputName: "Ember Roast",
    requirements: Object.freeze({ corpse: 1, firewood: 1 }),
    consumes: Object.freeze({ corpse: 1, firewood: 1 }),
    flavor: "Peppery roast meat that leaves a banked heat under the skin.",
  }),
  Object.freeze({
    key: "spider_skewer",
    label: "Spider Skewer",
    outputIdentity: "food_spider_skewer",
    outputName: "Spider Skewer",
    requirements: Object.freeze({ spiderLeg: 1, firewood: 1 }),
    consumes: Object.freeze({ spiderLeg: 1, firewood: 1 }),
    flavor: "Carefully charred legs and gland oil, risky-looking but bracing.",
  }),
  Object.freeze({
    key: "hunter_hash",
    label: "Hunter Hash",
    outputIdentity: "food_hunter_hash",
    outputName: "Hunter Hash",
    requirements: Object.freeze({ beastClaw: 1, firewood: 1 }),
    consumes: Object.freeze({ beastClaw: 1, firewood: 1 }),
    flavor: "A tough camp hash that lends the hands a predator's certainty.",
  }),
  Object.freeze({
    key: "grave_bisque",
    label: "Grave Bisque",
    outputIdentity: "food_grave_bisque",
    outputName: "Grave Bisque",
    requirements: Object.freeze({ mushrooms: 1, firewood: 1 }),
    consumes: Object.freeze({ mushrooms: 1, firewood: 1 }),
    flavor: "A pale bisque that quiets hostile magic around the bones.",
  }),
  Object.freeze({
    key: "fisher_supper",
    label: "Fisher's Supper",
    outputIdentity: "food_fisher_supper",
    outputName: "Fisher's Supper",
    requirements: Object.freeze({ fish: 1, firewood: 1 }),
    consumes: Object.freeze({ fish: 1, firewood: 1 }),
    flavor: "A clean coastal meal that sharpens sight and patience.",
  }),
]);

export function getCookingRecipe(key) {
  const normalized = String(key || "").trim().toLowerCase();
  if (!normalized) return null;
  for (const recipe of COOKING_RECIPES) {
    if (recipe.key === normalized) return recipe;
  }
  return null;
}
