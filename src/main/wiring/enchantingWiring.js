import { isPlayerAdjacentTo } from "./wiringUtils.js";
import { ENCHANTING_INGREDIENTS } from "../../rules/content/enchanting/enchantCatalog.js";

const INSTALLED = Symbol.for("jshack:main:enchantingWiring:installed");
const EMPTY_INGREDIENTS = Object.freeze({
  emberRoot: 0,
  moonleaf: 0,
  thornPods: 0,
  venomFronds: 0,
  spiderLeg: 0,
  venomGland: 0,
  resin: 0,
  boneDust: 0,
  ectoplasm: 0,
  runeFragment: 0,
  frostCore: 0,
  beastClaw: 0,
  cursedThread: 0,
  oil: 0,
  water: 0,
  ashes: 0,
  gold: 0,
});

export function installEnchantingWiring({ world, playerEntity, dispatchRules, log }) {
  if (!world || typeof playerEntity !== "function" || typeof dispatchRules !== "function") return;
  if (world[INSTALLED]) return;
  world[INSTALLED] = true;

  const writeLog = typeof log === "function" ? log : () => {};
  let activeBenchId = 0;

  world.on("enchanting:open", ({ actor, targetId, ingredients, recipes, title, subtitle }) => {
    const pe = playerEntity(world);
    if (!pe || Number(actor || 0) !== pe.id) return;
    const benchId = Number(targetId || 0) | 0;
    if (!(benchId > 0)) return;
    activeBenchId = benchId;
    try { window.dispatchEvent(new CustomEvent("ui:openEnchantingBench", { detail: { benchId } })); } catch (e) { console.debug("[enchantingWiring] dispatch ui:openEnchantingBench:", e); }
    try {
      window.dispatchEvent(new CustomEvent("ui:enchantingBenchData", {
        detail: {
          benchId,
          ingredients: ingredients && typeof ingredients === "object" ? ingredients : { ...EMPTY_INGREDIENTS },
          recipes: Array.isArray(recipes) ? recipes.map((recipe) => ({
            ...recipe,
            requirementLabels: Object.fromEntries(Object.entries(ENCHANTING_INGREDIENTS).map(([key, def]) => [key, def.label])),
            requirementIdentities: Object.fromEntries(Object.entries(ENCHANTING_INGREDIENTS).map(([key, def]) => [key, def.identity])),
          })) : [],
          title: String(title || ""),
          subtitle: String(subtitle || ""),
        },
      }));
    } catch (e) { console.debug("[enchantingWiring] dispatch ui:enchantingBenchData:", e); }
  });

  world.on("moved", ({ id }) => {
    const pe = playerEntity(world);
    if (!pe || Number(id || 0) !== pe.id) return;
    if (!(activeBenchId > 0)) return;
    if (isPlayerAdjacentTo(world, activeBenchId)) return;
    activeBenchId = 0;
    try { window.dispatchEvent(new CustomEvent("ui:closeEnchantingBench")); } catch (e) { console.debug("[enchantingWiring] dispatch ui:closeEnchantingBench:", e); }
  });

  addEventListener("ui:requestCraftEnchant", (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const benchId = Number(e?.detail?.benchId || activeBenchId || 0) | 0;
    const recipe = String(e?.detail?.recipe || "").trim().toLowerCase();
    if (!(benchId > 0) || !recipe) return;
    if (!isPlayerAdjacentTo(world, benchId)) {
      writeLog("You need to stand next to the enchanting station.");
      activeBenchId = 0;
      try { window.dispatchEvent(new CustomEvent("ui:closeEnchantingBench")); } catch (err) { console.debug("[enchantingWiring] dispatch ui:closeEnchantingBench:", err); }
      return;
    }
    dispatchRules({ type: "rules.craftEnchant", payload: { benchId, recipe } });
  });
}
