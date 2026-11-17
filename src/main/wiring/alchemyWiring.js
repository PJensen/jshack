import { isPlayerAdjacentTo } from "./wiringUtils.js";
import { ALCHEMY_INGREDIENTS } from "../../rules/content/alchemy/benchGame.js";

const INSTALLED = Symbol.for("jshack:main:alchemyWiring:installed");
const EMPTY_INGREDIENTS = Object.freeze({
  berries: 0,
  herbs: 0,
  thornPods: 0,
  venomFronds: 0,
  moonleaf: 0,
  emberRoot: 0,
});

/**
 * @param {{
 *   world: import("../../lib/ecs-js/index.js").World,
 *   playerEntity: (world: import("../../lib/ecs-js/index.js").World) => ({ id:number, pos:{x:number,y:number} }|null),
 *   dispatchRules: (action: { type:string, payload?:Record<string, unknown> }) => void,
 *   log?: (msg: string) => void,
 }} opts
 */
export function installAlchemyWiring({ world, playerEntity, dispatchRules, log }) {
  if (!world || typeof playerEntity !== "function" || typeof dispatchRules !== "function") return;
  if (world[INSTALLED]) return;
  world[INSTALLED] = true;

  const writeLog = typeof log === "function" ? log : () => {};
  let activeBenchId = 0;

  world.on("alchemy:open", ({ actor, targetId, ingredients, recipes }) => {
    const pe = playerEntity(world);
    if (!pe || Number(actor || 0) !== pe.id) return;
    const benchId = Number(targetId || 0) | 0;
    if (!(benchId > 0)) return;
    activeBenchId = benchId;
    try { window.dispatchEvent(new CustomEvent("ui:openAlchemyBench", { detail: { benchId } })); } catch (e) { console.debug('[alchemyWiring] dispatch ui:openAlchemyBench:', e); }
    try {
      window.dispatchEvent(new CustomEvent("ui:alchemyBenchData", {
        detail: {
          benchId,
          ingredients: ingredients && typeof ingredients === "object" ? ingredients : { ...EMPTY_INGREDIENTS },
          recipes: Array.isArray(recipes) ? recipes.map((recipe) => ({
            ...recipe,
            requirementLabels: Object.fromEntries(Object.entries(ALCHEMY_INGREDIENTS).map(([key, def]) => [key, String(def.label).replace(/\b\w/g, (char) => char.toUpperCase())])),
            requirementIdentities: Object.fromEntries(Object.entries(ALCHEMY_INGREDIENTS).map(([key, def]) => [key, def.identity])),
          })) : [],
        },
      }));
    } catch (e) { console.debug('[alchemyWiring] dispatch ui:alchemyBenchData:', e); }
  });

  world.on("moved", ({ id }) => {
    const pe = playerEntity(world);
    if (!pe || Number(id || 0) !== pe.id) return;
    if (!(activeBenchId > 0)) return;
    if (isPlayerAdjacentTo(world, activeBenchId)) return;
    activeBenchId = 0;
    try { window.dispatchEvent(new CustomEvent("ui:closeAlchemyBench")); } catch (e) { console.debug('[alchemyWiring] dispatch ui:closeAlchemyBench:', e); }
  });

  addEventListener("ui:requestAlchemyBrew", (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const benchId = Number(e?.detail?.benchId || activeBenchId || 0) | 0;
    const recipe = String(e?.detail?.recipe || "").trim().toLowerCase();
    if (!(benchId > 0) || !recipe) return;
    if (!isPlayerAdjacentTo(world, benchId)) {
      writeLog("You need to stand next to the alchemy bench.");
      activeBenchId = 0;
      try { window.dispatchEvent(new CustomEvent("ui:closeAlchemyBench")); } catch (e) { console.debug('[alchemyWiring] dispatch ui:closeAlchemyBench:', e); }
      return;
    }
    dispatchRules({ type: "rules.brewAlchemy", payload: { benchId, recipe } });
  });
}
