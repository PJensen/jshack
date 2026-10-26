import { getAmmoHookScripts } from "../data/ammo.js";
import { ProjectileImpactCallbackContext } from "../data/callbacks/projectile.js";
import { runScript, ScriptVerb } from "../scripting.js";

const PROJECTILE_HOOK_TO_VERB = Object.freeze({
  onProjectileActorImpact: ScriptVerb.ProjectileActorImpact,
  onProjectileWallImpact: ScriptVerb.ProjectileWallImpact,
  onProjectileGroundImpact: ScriptVerb.ProjectileGroundImpact,
  onProjectileMiss: ScriptVerb.ProjectileMiss,
});

/**
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {string} ammoIdentity
 * @param {"onProjectileActorImpact"|"onProjectileWallImpact"|"onProjectileGroundImpact"|"onProjectileMiss"} hookName
 * @param {any} frame
 * @returns {ProjectileImpactCallbackContext|null}
 */
export function runAmmoScripts(world, ammoIdentity, hookName, frame) {
  const verb = PROJECTILE_HOOK_TO_VERB[hookName];
  if (!verb) return null;
  const scriptRefs = getAmmoHookScripts(ammoIdentity, hookName);
  if (!Array.isArray(scriptRefs) || scriptRefs.length === 0) return null;
  const ctx = new ProjectileImpactCallbackContext(world, frame);
  for (let i = 0; i < scriptRefs.length; i++) {
    runScript(scriptRefs[i], verb, world, ctx);
  }
  return ctx;
}
