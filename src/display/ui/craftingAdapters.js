function count(value) {
  return Math.max(0, Number(value || 0) | 0);
}

function fallbackLabel(key) {
  return String(key || "ingredient").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function makeRequirements(requirements, available, labels = {}, identities = {}, consumes = null) {
  return Object.entries(requirements && typeof requirements === "object" ? requirements : {})
    .map(([key, value]) => ({
      key,
      label: String(labels[key] || fallbackLabel(key)),
      identity: String(identities[key] || key),
      required: count(value),
      available: count(available?.[key]),
      consumed: consumes == null ? true : Object.hasOwn(consumes, key) && consumes[key] !== false,
    }))
    .filter((req) => req.required > 0);
}

function missingText(requirements) {
  const missing = requirements.filter((req) => req.available < req.required);
  if (!missing.length) return "";
  return `Missing: ${missing.map((req) => `${req.required - req.available} ${req.label}`).join(", ")}`;
}

function baseRecipe(recipe, requirements, action) {
  return {
    ...recipe,
    key: String(recipe.key || ""),
    name: String(recipe.name || recipe.label || recipe.outputName || "Recipe"),
    outputName: String(recipe.outputName || recipe.label || "Crafted item"),
    requirements,
    missingText: missingText(requirements),
    action,
  };
}

export function adaptEnchantingState(state = {}) {
  const ingredients = state.ingredients || {};
  const recipes = (Array.isArray(state.recipes) ? state.recipes : []).map((recipe) => {
    const requirements = makeRequirements(
      recipe.requirements,
      ingredients,
      recipe.requirementLabels || {},
      recipe.requirementIdentities || {},
    );
    return baseRecipe(recipe, requirements, { eventName: "ui:requestCraftEnchant", detail: { benchId: state.benchId, recipe: recipe.key } });
  });
  return {
    discipline: "enchanting",
    title: state.title || "✧ Enchanting Bench",
    subtitle: state.subtitle || "Bind reagents and gold into a scroll, then apply it to your gear.",
    stationId: state.benchId,
    actionLabel: "Scribe",
    closeEvent: "ui:closeEnchantingBench",
    recipes,
  };
}

export function adaptSmithingState(state = {}) {
  const materials = state.materials || {};
  const recipes = (Array.isArray(state.recipes) ? state.recipes : []).map((recipe) => {
    const source = { iron: recipe.iron, lumber: recipe.lumber };
    const requirements = makeRequirements(source, materials, recipe.requirementLabels || {}, recipe.requirementIdentities || {});
    return baseRecipe({ ...recipe, outputIdentity: recipe.itemId }, requirements, { eventName: "ui:requestForgeAtAnvil", detail: { anvilId: state.anvilId, recipe: recipe.key } });
  });
  return {
    discipline: "smithing",
    title: "⚒ Blacksmithing",
    subtitle: "Choose a pattern to inspect the materials and forge it at the anvil.",
    stationId: state.anvilId,
    actionLabel: "Forge",
    closeEvent: "ui:closeAnvil",
    recipes,
  };
}

export function adaptCookingState(state = {}) {
  const ingredients = state.ingredients || {};
  const recipes = (Array.isArray(state.recipes) ? state.recipes : []).map((recipe) => {
    const requirements = makeRequirements(recipe.requirements, ingredients, recipe.requirementLabels || {}, recipe.requirementIdentities || {}, recipe.consumes || {});
    return baseRecipe(recipe, requirements, { eventName: "ui:requestCookRecipe", detail: { fireId: state.fireId, recipe: recipe.key } });
  });
  const corpseRecipes = (Array.isArray(state.corpses) ? state.corpses : []).map((corpse) => ({
    key: `corpse:${Number(corpse?.id || 0) | 0}`,
    name: `Cook ${String(corpse?.name || "Corpse")}`,
    outputName: "Cooked ration",
    outputIdentity: String(corpse?.identity || ""),
    description: "Cook this corpse directly into a ration.",
    canCraft: true,
    requirements: [{ key: "corpse", label: "Corpse", identity: String(corpse?.identity || "corpse"), required: 1, available: 1, consumed: true }],
    action: { eventName: "ui:requestCook", detail: { fireId: state.fireId, itemId: Number(corpse?.id || 0) | 0 } },
  }));
  return {
    discipline: "cooking",
    title: "🔥 Cooking Fire",
    subtitle: "Choose a meal or cook a corpse directly into a ration.",
    stationId: state.fireId,
    actionLabel: "Cook",
    closeEvent: "ui:closeCookingFire",
    recipes: [...recipes, ...corpseRecipes],
  };
}
