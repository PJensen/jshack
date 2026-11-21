import { defineExtension } from "../../lib/ecs-js/index.js";

export const AUDIO_WIRING_EXTENSION_KEY = Symbol.for("jshack:display:audioWiring");

export const AUDIO_INTERACTION_ROUTES = Object.freeze([
  Object.freeze({
    event: "interaction",
    action: "toggleDoor",
    sound: ({ result }) => result === "opened" ? "door:open" : "door:close",
    position: ({ targetId }, ctx) => targetId != null ? ctx.getPosition?.(targetId) || null : null,
    options: Object.freeze({ priority: 1, volume: 1.25 }),
  }),
  Object.freeze({
    event: "interaction",
    action: "toggleLantern",
    sound: ({ result }) => result === "lit" ? "action:switch_on" : "action:switch_off",
    position: ({ targetId }, ctx) => targetId != null ? ctx.getPosition?.(targetId) || null : null,
    options: Object.freeze({ priority: 1 }),
  }),
]);

export function resolveInteractionSoundId(payload) {
  const plan = resolveAudioRoutePlan(AUDIO_INTERACTION_ROUTES, "interaction", payload);
  return plan?.soundId || null;
}

export function resolveAudioRoutePlan(routes, event, payload, ctx = {}) {
  for (const route of routes || []) {
    if (route.event !== event) continue;
    if (route.action && route.action !== payload?.action) continue;
    if (typeof route.when === "function" && !route.when(payload, ctx)) continue;

    const soundId = typeof route.sound === "function" ? route.sound(payload, ctx) : route.sound;
    if (!soundId) continue;

    return {
      soundId,
      position: typeof route.position === "function" ? route.position(payload, ctx) : null,
      options: route.options || null,
    };
  }
  return null;
}

export function createAudioWiringExtension(deps) {
  const ctx = {
    getPosition: typeof deps?.getPosition === "function" ? deps.getPosition : () => null,
    getPlayerPosition: typeof deps?.getPlayerPosition === "function" ? deps.getPlayerPosition : () => null,
    getZoomGain: typeof deps?.getZoomGain === "function" ? deps.getZoomGain : () => 1,
    playAt: typeof deps?.playAt === "function" ? deps.playAt : null,
  };

  return defineExtension("jshack:display:audioWiring", (world) => {
    const routes = [...AUDIO_INTERACTION_ROUTES, ...(deps?.oneShotRoutes || [])];
    const playSoundOnce = (event, payload) => {
      const plan = resolveAudioRoutePlan(routes, event, payload, ctx);
      if (!plan || typeof ctx.playAt !== "function") return;
      ctx.playAt(plan.soundId, plan.position, ctx.getPlayerPosition(), plan.options, ctx.getZoomGain());
    };
    const unsubscribers = [...new Set(routes.map(({ event }) => event))]
      .map((event) => world.on(event, (payload) => playSoundOnce(event, payload)));

    return () => unsubscribers.forEach((off) => off());
  }, { key: AUDIO_WIRING_EXTENSION_KEY });
}
