import { FloatText } from "../passes/vfx/text/floatText.js";
import { createStatusEmitterController } from "../passes/vfx/particles/statusEmitterController.js";
import { createBoltFxController } from "../fx/boltFxController.js";
import { createDelayedDeathFxController } from "../fx/delayedDeathFxController.js";
import { createProjectileFxController } from "../fx/projectileFx.js";
import { createSpellAreaFxController } from "../fx/spellAreaFx.js";
import { createCloudFxController } from "../fx/cloudFx.js";
import { createSurfaceAreaFxController } from "../fx/surfaceAreaFx.js";
import { createSpiritWispFxController } from "../fx/spiritWispFx.js";
import { createSparksFxController } from "../fx/sparksFxController.js";
import { createStatusPresentationDelayController } from "../fx/statusPresentationDelayController.js";
import { createBumpFxController } from "../fx/bumpFxController.js";
import { createRecoilFxController } from "../fx/recoilFxController.js";
import { createHitstopController } from "../fx/hitstopController.js";
import { createMeleeSlashFxController } from "../fx/meleeSlashFx.js";
import { createAggroFxController } from "../fx/aggroFxController.js";
import { createDeathEssenceFxController } from "../fx/deathEssenceFxController.js";
import { startShake } from "../camera/shake.js";
import { startZoomPunch, startZoomLerp } from "../camera/zoomPunch.js";
import { installFloatTextWiring } from "../ui/wiring/floatTextWiring.js";
import { createFountainPresentationExtension } from "../ui/wiring/fountainPresentationExtension.js";
import { createFountainUiExtension } from "../ui/wiring/fountainUiExtension.js";
import { installEventUiWiring } from "../ui/wiring/eventUiWiring.js";
import { createDeathVfxController } from "../fx/deathVfxController.js";
import { createTeleportFxController } from "../fx/teleportFxController.js";
import { createPuffFxExtension } from "../fx/puffFx.js";
import { installAudioWiring } from "../audio/audioWiring.js";
import { createFountainAmbientController } from "../audio/fountainAmbientController.js";
import { createLocalEmitterAmbientController } from "../audio/localEmitterAmbientController.js";
import { createWorldAmbientController } from "../audio/worldAmbientController.js";
import { createBiomeAmbientController } from "../audio/biomeAmbientController.js";
import { installContentVfxWiring } from "../../content/vfxWiring.js";

export function buildAudioItemInfo({ id, info, getItemMaterial, getEntityIdentity, resolveItemDisplayName }) {
  if (!info) return null;
  const material = typeof getItemMaterial === "function" ? getItemMaterial(id) : null;
  const materialKind = typeof material === "string" ? material : material?.kind;
  const identity = typeof getEntityIdentity === "function" ? getEntityIdentity(id) : null;
  const name = typeof resolveItemDisplayName === "function" ? resolveItemDisplayName(id) : null;
  return {
    ...info,
    id: info.id || info.identity || identity || "",
    identity: info.identity || identity || "",
    name: info.name || name || "",
    material: materialKind || info.material || "",
  };
}

/**
 * Configure display-owned runtime controllers and event wiring.
 * Returns live controller instances used by the frame loop and render pass.
 */
export function setupDisplayRuntime({
  world,
  cam,
  fx,
  PERF,
  getFxTime,
  getActiveSpellId,
  setActiveSpell,
  getPosition,
  getEntityIdentity,
  getEntityVitality,
  isVisibleAt,
  isPet,
  isPlayer,
  getPlayerEntity,
  getHiddenTrapPositions,
  getSacredSitePositions,
  getItemInfo,
  getItemMaterial,
  resolveItemDisplayName,
  dispatchRulesAction,
  classifySurfaceTile,
  sculptFloor,
  sculptFloorBrush,
  getActiveReliefKey,
  sampleMood,
  getDepth,
}) {
  const statusEmitterFx = createStatusEmitterController({ world, fx });
  statusEmitterFx.installListeners();
  const statusPresentationDelayFx = createStatusPresentationDelayController({ world, getFxTime });
  statusPresentationDelayFx.installListeners();

  const boltFx = createBoltFxController({ world, cam, fx, getPosition });
  boltFx.installListeners();

  const delayedDeathFx = createDelayedDeathFxController({ world, getFxTime, getPosition });
  delayedDeathFx.installListeners();

  const projectileFx = createProjectileFxController({ world, cam, fx, getPosition });
  projectileFx.installListeners();

  const ftext = new FloatText();
  try {
    /** @type any */ (window).float_text = (x, y, text, opts) => ftext.add(x, y, text, opts || {});
  } catch (e) { console.debug("[setupDisplayRuntime] float_text global setup failed:", e); }

  const spellAreaFx = createSpellAreaFxController({ world, cam, fx, PERF, getFxTime, getPosition, ftext, sculptFloor, sculptFloorBrush, getActiveReliefKey });
  spellAreaFx.installListeners();

  const cloudFx = createCloudFxController({ world, cam, fx, getFxTime, getPosition });
  cloudFx.installListeners();
  const surfaceAreaFx = createSurfaceAreaFxController({ getFxTime, classifySurfaceTile, fx, PERF });

  const deathEssenceFx = createDeathEssenceFxController({
    world,
    getFxTime,
    getPosition,
    getEntityIdentity,
    getEntityVitality,
  });
  deathEssenceFx.installListeners();

  const spiritWispFx = createSpiritWispFxController({
    world,
    fx,
    getPosition,
    getPlayerEntity,
    sampleMood,
    getHiddenTrapPositions,
    getSacredSitePositions,
    deathEssenceFx,
  });
  spiritWispFx.installListeners();

  const sparksFx = createSparksFxController({ world, fx, getPosition, isVisibleAt });
  sparksFx.installListeners();

  const bumpFx = createBumpFxController();
  bumpFx.installListeners({ world, getPosition, isPlayer });

  const meleeSlashFx = createMeleeSlashFxController();
  meleeSlashFx.installListeners({ world, getPosition, isPlayer });

  const aggroFx = createAggroFxController({ world, getPosition, isPet });
  aggroFx.installListeners();

  const recoilFx = createRecoilFxController();
  recoilFx.installListeners({ world, getPosition, isPlayer });

  const hitstopFx = createHitstopController();
  hitstopFx.installListeners({ world, isPlayer, bumpFx });

  const deathVfx = createDeathVfxController();
  const teleportFx = createTeleportFxController({ world, cam, isPlayer });
  world.install(createPuffFxExtension({ fx }));

  // ── Melee camera shake — scales with damage ───────────────────────
  world.on('damaged', ({ cause, amount, critical }) => {
    if (cause !== 'melee') return;
    const dmg = Number(amount) || 0;
    if (dmg < 1) return;
    // Amplitude: 1.0 at 1dmg, ramps to ~5 at 15+dmg, crits get 1.4x
    const base = 1.0 + Math.min(4.0, Math.log(1 + dmg / 2.5) * 2.2);
    const amp = critical ? base * 1.4 : base;
    // Duration: 0.06s baseline, scales gently with damage
    const dur = 0.06 + Math.min(0.10, dmg * 0.004);
    startShake(cam, amp, dur);
    // Crit zoom-punch: brief scale pulse that sells the weight of a big hit
    if (critical) startZoomPunch(cam, 0.025, 0.14);
  });

  // Chest openings get a tiny physical payoff. Scale it from the best item so
  // a legendary reveal lands harder without turning ordinary loot into combat
  // noise. This is display-only camera feedback; the rules event is unchanged.
  world.on('chest:burst', ({ actor, drops }) => {
    if (!isPlayer(actor)) return;
    const burstDrops = Array.isArray(drops) ? drops : [];
    let bestRank = 1;
    for (let i = 0; i < burstDrops.length; i++) {
      const info = getItemInfo(Number(burstDrops[i]?.itemId || 0) | 0);
      const rarity = String(info?.rarityName || 'common').toLowerCase();
      const rank = rarity === 'legendary' ? 5
        : rarity === 'epic' ? 4
        : rarity === 'rare' ? 3
        : rarity === 'uncommon' ? 2 : 1;
      if (rank > bestRank) bestRank = rank;
    }
    startShake(cam, 1.15 + bestRank * 0.42, 0.08 + bestRank * 0.012);
    startZoomLerp(cam, 0.025 + bestRank * 0.006, 0.16, 0.07, 0.32 + bestRank * 0.035);
  });

  // The reward should land when the item reaches the player, not only when it
  // is first spotted. Rare+ pickups get a tiny ownership pulse; ordinary
  // pickups keep the existing loot-suck animation and audio unchanged.
  world.on('item:pickup', ({ actor, itemId }) => {
    if (!isPlayer(actor)) return;
    const info = getItemInfo(Number(itemId || 0) | 0);
    const rarity = String(info?.rarityName || 'common').toLowerCase();
    const rank = rarity === 'legendary' ? 5
      : rarity === 'epic' ? 4 : rarity === 'rare' ? 3 : 1;
    if (rank < 3) return;
    startZoomLerp(cam, 0.018 + rank * 0.0025, 0.12, 0.04, 0.24 + rank * 0.025);
    if (rank >= 4) startShake(cam, 0.45 + rank * 0.08, 0.055);
  });

  const { goreTick } = installFloatTextWiring({ world, ftext, fx, getPosition, isVisibleAt, isPet, isPlayer, getFxTime });
  world.install(createFountainPresentationExtension({ ftext, fx, getPosition, isVisibleAt }));
  world.install(createFountainUiExtension({ getPlayerEntity, getItemInfo, resolveItemDisplayName }));
  installContentVfxWiring({ world, ftext, fx, getPosition, isVisibleAt });
  installEventUiWiring({
    world,
    ftext,
    getActiveSpellId,
    setActiveSpell,
    getPlayerEntity,
    getPosition,
    getItemInfo,
    resolveItemDisplayName,
    dispatchRulesAction,
  });

  const audioReferenceZoomScale = cam?.targetScale || cam?.scale || 1;
  installAudioWiring({
    world,
    isPlayer,
    getItemInfo: (id) => {
      const info = getItemInfo(id);
      return buildAudioItemInfo({ id, info, getItemMaterial, getEntityIdentity, resolveItemDisplayName });
    },
    getPosition,
    getIdentity: getEntityIdentity,
    getPlayerPosition: () => {
      const pe = getPlayerEntity();
      return pe ? getPosition(pe.id ?? pe) : null;
    },
    getDepth: getDepth || (() => 0),
    getZoomScale: () => cam?.scale || cam?.targetScale || 1,
    getReferenceZoomScale: () => audioReferenceZoomScale,
  });

  const fountainAmbientFx = createFountainAmbientController({ world });
  fountainAmbientFx.installListeners();
  const localEmitterAmbientFx = createLocalEmitterAmbientController();
  const worldAmbientFx = createWorldAmbientController();
  const biomeAmbientFx = createBiomeAmbientController();

  return { statusEmitterFx, statusPresentationDelayFx, boltFx, delayedDeathFx, projectileFx, spellAreaFx, cloudFx, surfaceAreaFx, spiritWispFx, sparksFx, bumpFx, meleeSlashFx, aggroFx, recoilFx, hitstopFx, deathEssenceFx, deathVfx, teleportFx, fountainAmbientFx, localEmitterAmbientFx, worldAmbientFx, biomeAmbientFx, ftext, goreTick };
}
