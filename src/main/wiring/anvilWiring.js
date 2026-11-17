import { isPlayerAdjacentTo } from "./wiringUtils.js";
import { getCatalogItem } from "../../rules/data/itemCatalog.js";

const INSTALLED = Symbol.for("jshack:main:anvilWiring:installed");
const EMPTY_MATERIALS = Object.freeze({ iron: 0, lumber: 0 });

export function installAnvilWiring({ world, playerEntity, dispatchRules, log }) {
  if (!world || typeof playerEntity !== "function" || typeof dispatchRules !== "function") return;
  if (world[INSTALLED]) return;
  world[INSTALLED] = true;

  const writeLog = typeof log === "function" ? log : () => {};
  let activeAnvilId = 0;

  world.on("smithy:open", ({ actor, targetId, station, materials, recipes }) => {
    if (String(station || "") !== "anvil") return;
    const pe = playerEntity(world);
    if (!pe || Number(actor || 0) !== pe.id) return;
    const anvilId = Number(targetId || 0) | 0;
    if (!(anvilId > 0)) return;
    activeAnvilId = anvilId;
    try { window.dispatchEvent(new CustomEvent("ui:openAnvil", { detail: { anvilId } })); } catch (e) { console.debug("[anvilWiring] dispatch ui:openAnvil:", e); }
    try {
      window.dispatchEvent(new CustomEvent("ui:anvilData", {
        detail: {
          anvilId,
          materials: materials && typeof materials === "object" ? materials : { ...EMPTY_MATERIALS },
          recipes: Array.isArray(recipes) ? recipes.map((recipe) => ({
            ...recipe,
            description: String(recipe?.description || getCatalogItem(recipe?.itemId)?.description || ""),
            requirementLabels: { iron: "Iron Bars", lumber: "Lumber" },
            requirementIdentities: { iron: "material_iron", lumber: "material_lumber" },
          })) : [],
        },
      }));
    } catch (e) { console.debug("[anvilWiring] dispatch ui:anvilData:", e); }
  });

  world.on("moved", ({ id }) => {
    const pe = playerEntity(world);
    if (!pe || Number(id || 0) !== pe.id) return;
    if (!(activeAnvilId > 0)) return;
    if (isPlayerAdjacentTo(world, activeAnvilId)) return;
    activeAnvilId = 0;
    try { window.dispatchEvent(new CustomEvent("ui:closeAnvil")); } catch (e) { console.debug("[anvilWiring] dispatch ui:closeAnvil:", e); }
  });

  addEventListener("ui:requestForgeAtAnvil", (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const anvilId = Number(e?.detail?.anvilId || activeAnvilId || 0) | 0;
    const recipe = String(e?.detail?.recipe || "").trim().toLowerCase();
    if (!(anvilId > 0) || !recipe) return;
    if (!isPlayerAdjacentTo(world, anvilId)) {
      writeLog("You need to stand next to the anvil.");
      activeAnvilId = 0;
      try { window.dispatchEvent(new CustomEvent("ui:closeAnvil")); } catch (err) { console.debug("[anvilWiring] dispatch ui:closeAnvil:", err); }
      return;
    }
    dispatchRules({ type: "rules.forgeAtAnvil", payload: { anvilId, recipe } });
  });
}
