import { TOWNFOLK } from "../data/townfolk.js";
import { getDistrictBulletin } from "../utils/townInterpretationVirtuals.js";
import { registerDialog } from "./registry.js";
import { getQuestDef } from "../quests/registry.js";
import { STARTER_PRIEST_FETCH_QUEST_ID, getQuestRecord } from "../quests/runtime.js";
import { RAT_INFESTATION_QUEST_ID, REQUIRED_RAT_KILLS } from "../quests/definitions/ratInfestation.js";
import { canTurnInStarterFetch } from "../quests/definitions/graveyardWatch.js";
import { canAcceptPriestRift, ensurePriestRiftQuest, PRIEST_RIFT_QUEST_ID } from "../quests/definitions/priestRift.js";
import { ensureRootboundGrottoQuest, ROOTBOUND_GROTTO_QUEST_ID } from "../quests/definitions/rootboundGrotto.js";
import { canTurnInRunContract, RUN_CONTRACT_QUEST_ID } from "../quests/definitions/runContract.js";
import { ensureFarmerMillRunQuest, FARMER_MILL_RUN_QUEST_ID } from "../quests/definitions/farmerMillRun.js";
import {
  ensureFisherBaitQuest,
  FISHER_BAIT_QUEST_ID,
  FISHER_FIRST_CATCH_QUEST_ID,
  getFisherQuest,
} from "../quests/definitions/fisherChain.js";
import { getTownState, getWeather } from "../utils/townStateAccess.js";
import { Vitality } from "../components/Vitality.js";
import { Equipment, NON_AMMO_GEAR_SLOTS } from "../components/Equipment.js";
import { Status } from "../components/Status.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { isItemCursed } from "../utils/curseUtils.js";
import { BarkeepStoryRequested } from "../../events/BarkeepStoryRequested.js";
import { inventoryHasIdentity } from "../utils/townEconomy.js";

const MOOD_POOLS = {
  farmer: [
    { text: "Crops won't wait. But when there's no one buying, what's the point?", cond: (ts) => ts.lowFood },
    { text: "The heavens are angry today. Lost two hours' work to that downpour.", cond: (ts, w) => w === "heavy_rain" },
    { text: "Sell the surplus, plant anew, pray for sun. That's all any of us do.", cond: (ts) => ts.morale < 35 },
  ],
  woodcutter: [
    { text: "Timber's rotting in the yard faster than anyone can carry it off.", cond: (ts) => ts.lowMaterials },
    { text: "Can't fell a tree in this muck. The whole forest's turned to marsh.", cond: (ts, w) => w === "heavy_rain" },
    { text: "Everything feels heavy lately. Even the axe.", cond: (ts) => ts.morale < 35 },
  ],
  miner: [
    { text: "Ore's getting scarce. Dig deeper, find worse. That's how it works.", cond: (ts) => ts.lowMaterials },
    { text: "Something stirred down there. Came up darker. The ground feels wrong.", cond: (ts) => ts.threatLevel > 0 },
    { text: "Dust in my lungs, stone in my heart. Hard to remember why I go down.", cond: (ts) => ts.morale < 35 },
  ],
  smith: [
    { text: "No iron, no coal — I'm hammering air these days. Come back when the shipment arrives.", cond: (ts) => ts.lowMaterials },
    { text: "The forge goes cold when supplies run low. Nothing to do but wait.", cond: (ts) => ts.morale < 35 },
  ],
  priest: [
    { text: "The sick are piling up. We're running short on medicines and shorter on answers.", cond: (ts) => ts.lowMedicine },
    { text: "Something stirs in the dark below. The prayers feel thin against it.", cond: (ts) => ts.threatLevel > 0 },
    { text: "The gods seem distant lately. I pray less now. It helps more.", cond: (ts) => ts.morale < 35 },
  ],
  barkeep: [
    { text: "Kitchen's nearly empty. The travelers aren't coming, but the mouths still need feeding.", cond: (ts) => ts.lowFood },
    { text: "Nobody's buying ale when they're scared for their lives. Escort work is all.", cond: (ts) => ts.threatLevel > 0 },
    { text: "This town's forgetting how to laugh. Quiet nights. Worried faces.", cond: (ts) => ts.morale < 35 },
  ],
  villager: [
    { text: "There's not enough to eat and too many people. The sums don't work.", cond: (ts) => ts.lowFood },
    { text: "Something's wrong under the streets. We all feel it.", cond: (ts) => ts.threatLevel > 0 },
    { text: "Nothing left to hope about. Just getting through the day.", cond: (ts) => ts.morale < 35 },
  ],
  mason: [
    { text: "The walls are cracking faster than I can patch them. Something's shifting underneath.", cond: (ts) => ts.lowMaterials },
    { text: "The rain gets in everywhere now. Rot spreads like a sickness.", cond: (ts, w) => w === "heavy_rain" },
    { text: "Stones don't fail. The town fails. And I get to watch it happen.", cond: (ts) => ts.morale < 35 },
  ],
  herbalist: [
    { text: "The sick are coming faster than the herbs grow. I'll run dry soon.", cond: (ts) => ts.lowMedicine },
    { text: "The rain carries sickness in it. The plants know. They won't grow.", cond: (ts, w) => w === "heavy_rain" },
    { text: "Healing's just delaying. We're all just delaying.", cond: (ts) => ts.morale < 35 },
  ],
  alchemist: [
    { text: "Reagents are scarce. The deeper plants are wilting. The market won't replace them fast enough.", cond: (ts) => ts.lowMedicine },
    { text: "Potions don't work on despair. Trust me, I've tried.", cond: (ts) => ts.morale < 35 },
  ],
  gem_vendor: [
    { text: "Gems don't sell when people are starving. Beauty's a luxury.", cond: (ts) => ts.lowFood },
    { text: "The fear in this town is real. Nobody's buying pretty things when they're buying weapons.", cond: (ts) => ts.threatLevel > 0 },
  ],
  book_vendor: [
    { text: "Stories don't feed anyone. But at least I've still got the stock.", cond: (ts) => ts.lowFood },
    { text: "The apocalypse sells better than romance these days.", cond: (ts) => ts.threatLevel > 0 },
  ],
};

const PLAYER_OBSERVATION_POOLS = {
  generic_near_death: [
    "You're barely standing. If you step much further, you'll fall.",
    "The gods must favor you to still be breathing.",
  ],
  generic_wounded: [
    "That's a nasty wound. Might get worse if you're not careful.",
    "You've seen some trouble down there.",
  ],
  herbalist_poisoned: [
    "You've got venom in your blood. I've got something for that, if you're willing to pay.",
    "That poison's marked you. Let me brew a counter before it spreads.",
  ],
  priest_poisoned: [
    "The gods grant protection against venom. Let me pray over you.",
  ],
  generic_poisoned: [
    "That color in your blood — that's poison. You should fix that.",
  ],
  herbalist_cursed: [
    "A curse sits on you heavy. The plants recoil from you.",
    "Curses fade, but slowly. Bring rare herbs and I'll weaken it.",
  ],
  priest_cursed: [
    "I feel the darkness clinging to you. Come, we will banish it together.",
    "A curse has marked you. The church can help, but the price is steep.",
  ],
  generic_cursed: [
    "You're carrying something dark. Be careful it doesn't spread.",
  ],
  barkeep_hungry: [
    "You look half-starved. Bowl of stew's on the house — you need it more than I do.",
    "When was the last time you ate a proper meal?",
  ],
  farmer_hungry: [
    "You're looking lean. Hard on the road, is it?",
  ],
  generic_hungry: [
    "You should eat something. You're going to need the strength.",
  ],
  smith_fine_weapon: [
    "That's quality work on your weapon. Mine? I recognize the polish.",
  ],
  generic_fine_weapon: [
    "That's a good blade you're carrying. Where'd you find it?",
  ],
  priest_blessed: [
    "The light follows you. You've been blessed.",
  ],
};

function getPlayerObservation(world, playerId, npcRole) {
  if (!(playerId > 0)) return null;

  const vit = world.get(playerId, Vitality);
  const status = world.get(playerId, Status);
  const eq = world.get(playerId, Equipment);

  const hpRatio = vit ? vit.hp / Math.max(1, vit.maxHp) : 1;

  // Near death (highest priority)
  if (hpRatio < 0.25) {
    const pool = PLAYER_OBSERVATION_POOLS.generic_near_death;
    return pool[Math.floor(world.rand?.() * pool.length || 0)];
  }

  // Wounded
  if (hpRatio < 0.5) {
    const pool = PLAYER_OBSERVATION_POOLS.generic_wounded;
    return pool[Math.floor(world.rand?.() * pool.length || 0)];
  }

  // Check for notable status conditions
  const statuses = status?.statuses || [];
  const statusStrs = new Set(statuses.map(s => String(s.type || "")));

  // Also detect cursed from equipped items — Status component misses Beatitude.
  if (!statusStrs.has("cursed") && eq) {
    for (let i = 0; i < NON_AMMO_GEAR_SLOTS.length; i++) {
      const slotId = Number(eq[NON_AMMO_GEAR_SLOTS[i]] || 0) | 0;
      if (slotId > 0 && isItemCursed(world, slotId)) { statusStrs.add("cursed"); break; }
    }
  }

  // Poison: herbalist/priest react specifically
  if (statusStrs.has("poisoned")) {
    if (npcRole === "herbalist") {
      const pool = PLAYER_OBSERVATION_POOLS.herbalist_poisoned;
      return pool[Math.floor(world.rand?.() * pool.length || 0)];
    }
    if (npcRole === "priest") {
      const pool = PLAYER_OBSERVATION_POOLS.priest_poisoned;
      if (pool.length) return pool[Math.floor(world.rand?.() * pool.length || 0)];
    }
    const pool = PLAYER_OBSERVATION_POOLS.generic_poisoned;
    return pool[Math.floor(world.rand?.() * pool.length || 0)];
  }

  // Curse: priest reacts strongly
  if (statusStrs.has("cursed")) {
    if (npcRole === "priest") {
      const pool = PLAYER_OBSERVATION_POOLS.priest_cursed;
      return pool[Math.floor(world.rand?.() * pool.length || 0)];
    }
    if (npcRole === "herbalist") {
      const pool = PLAYER_OBSERVATION_POOLS.herbalist_cursed;
      return pool[Math.floor(world.rand?.() * pool.length || 0)];
    }
    const pool = PLAYER_OBSERVATION_POOLS.generic_cursed;
    return pool[Math.floor(world.rand?.() * pool.length || 0)];
  }

  // Hunger: barkeep/farmer react
  if (statusStrs.has("hungry") || statusStrs.has("famished") || statusStrs.has("starving")) {
    if (npcRole === "barkeep") {
      const pool = PLAYER_OBSERVATION_POOLS.barkeep_hungry;
      return pool[Math.floor(world.rand?.() * pool.length || 0)];
    }
    if (npcRole === "farmer") {
      const pool = PLAYER_OBSERVATION_POOLS.farmer_hungry;
      return pool[Math.floor(world.rand?.() * pool.length || 0)];
    }
    const pool = PLAYER_OBSERVATION_POOLS.generic_hungry;
    return pool[Math.floor(world.rand?.() * pool.length || 0)];
  }

  // Blessed: priest notices
  if (statusStrs.has("blessed") && npcRole === "priest") {
    const pool = PLAYER_OBSERVATION_POOLS.priest_blessed;
    return pool[Math.floor(world.rand?.() * pool.length || 0)];
  }

  // Check equipment: notable weapons
  if (eq?.weapon > 0) {
    const weaponId = eq.weapon;
    const weaponIdent = String(world.get(weaponId, NamedIdentity)?.identity || "");
    const isFine = weaponIdent.includes("boss") || weaponIdent.includes("elite") ||
                   weaponIdent.includes("void") || weaponIdent.includes("runed") ||
                   weaponIdent.includes("divine") || weaponIdent.includes("ancient");
    if (isFine) {
      if (npcRole === "smith") {
        const pool = PLAYER_OBSERVATION_POOLS.smith_fine_weapon;
        return pool[Math.floor(world.rand?.() * pool.length || 0)];
      }
      const pool = PLAYER_OBSERVATION_POOLS.generic_fine_weapon;
      return pool[Math.floor(world.rand?.() * pool.length || 0)];
    }
  }

  return null;
}

function priestQuest(world, actorId) {
  return getQuestRecord(world, STARTER_PRIEST_FETCH_QUEST_ID, actorId);
}

function priestRiftQuest(world, actorId) {
  ensurePriestRiftQuest(world, { playerId: actorId });
  return getQuestRecord(world, PRIEST_RIFT_QUEST_ID, actorId);
}

function smithAmbientText(ctx, fallback) {
  const bulletin = getDistrictBulletin(ctx.world, "workshop_row");
  if (!bulletin) return fallback;
  if (bulletin.shortageBand === "scarce" || bulletin.shortageBand === "panic") {
    return "Repair queue's gone ugly. No iron worth the name and too many hands asking for steel.";
  }
  if (bulletin.pressureBand === "active" || bulletin.pressureBand === "bleeding") {
    return "Every hammer stroke lands on somebody's worry these days.";
  }
  return fallback;
}

function barkeepAmbientText(ctx, fallback) {
  const bulletin = getDistrictBulletin(ctx.world, "market_green");
  if (!bulletin) return fallback;
  if (bulletin.dangerBand === "dangerous" || bulletin.dangerBand === "closed") {
    return "Travelers are drinking fast and leaving faster. Escort work is all anyone asks after.";
  }
  if (bulletin.shortageBand === "strained" || bulletin.shortageBand === "scarce" || bulletin.shortageBand === "panic") {
    return "Kitchen's running tight tonight. If the stew gets any thinner, it'll learn to walk off on its own.";
  }
  return fallback;
}

function masonAmbientText(ctx, fallback) {
  const bulletin = getDistrictBulletin(ctx.world, "civic_core");
  if (!bulletin) return fallback;
  if (bulletin.opportunities.includes("mason_repairs")) {
    return "Cellars are settling wrong again. Give me dry stone and a free afternoon and I'll keep the town standing.";
  }
  if (bulletin.dangerBand === "dangerous" || bulletin.dangerBand === "closed") {
    return "When the drains groan, walls follow. That's when everyone remembers my name.";
  }
  return fallback;
}

function priestAmbientText(ctx, fallback) {
  const bulletin = getDistrictBulletin(ctx.world, "churchyard");
  if (!bulletin) return fallback;
  if (bulletin.pressureBand === "active" || bulletin.pressureBand === "bleeding") {
    return "The churchyard feels wrong tonight. Keep your prayers short and your lamp trimmed.";
  }
  if (bulletin.shortageBand === "scarce" || bulletin.shortageBand === "panic") {
    return "We are burning incense faster than the market can replace it.";
  }
  return fallback;
}

function ambientTownfolkText(def, ctx) {
  const fallback = String(def?.dialogue || "Good day.");
  const role = String(def?.role || "");

  // Priority 1: Player observation (most immediate)
  const observation = getPlayerObservation(ctx.world, ctx.targetId, role);
  if (observation) return observation;

  // Priority 2: Mood variance from town state
  const townState = getTownState(ctx.world);
  const weather = getWeather(ctx.world);
  if (townState) {
    const moodPool = MOOD_POOLS[role];
    if (moodPool) {
      for (const entry of moodPool) {
        if (entry.cond(townState, weather)) {
          return entry.text;
        }
      }
    }
  }

  // Priority 3: Existing bulletin-based variation
  switch (role) {
    case "smith":
      return smithAmbientText(ctx, fallback);
    case "barkeep":
      return barkeepAmbientText(ctx, fallback);
    case "mason":
      return masonAmbientText(ctx, fallback);
    case "priest":
      return priestAmbientText(ctx, fallback);
    default:
      return fallback;
  }
}

function barkeepQuest(world, actorId) {
  return getQuestRecord(world, RAT_INFESTATION_QUEST_ID, actorId);
}

function farmerMillRunQuest(world, actorId, giverId = 0) {
  ensureFarmerMillRunQuest(world, { playerId: actorId, giverId });
  return getQuestRecord(world, FARMER_MILL_RUN_QUEST_ID, actorId);
}

function fisherQuest(world, actorId, giverId = 0) {
  ensureFisherBaitQuest(world, { playerId: actorId, giverId });
  return getFisherQuest(world, actorId);
}

function runContractQuest(world, actorId) {
  return getQuestRecord(world, RUN_CONTRACT_QUEST_ID, actorId);
}

function runContractRewardChoice(world, actorId, index) {
  const choices = runContractQuest(world, actorId)?.vars?.data?.rewardChoices;
  return Array.isArray(choices) ? choices[index] || null : null;
}

function questRewardChoice(world, actorId, questId, index) {
  const quest = getQuestRecord(world, questId, actorId);
  const choices = quest?.vars?.data?.rewardChoices || getQuestDef(questId)?.journal?.rewardChoices;
  return Array.isArray(choices) ? choices[index] || null : null;
}

function rootboundGrottoQuest(world, actorId, giverId) {
  ensureRootboundGrottoQuest(world, { playerId: actorId, giverId });
  return getQuestRecord(world, ROOTBOUND_GROTTO_QUEST_ID, actorId);
}

for (const def of Object.values(TOWNFOLK)) {
  if (def.role === "priest" || def.role === "barkeep" || def.role === "mason" || def.role === "enchantress" || def.role === "fisher") continue;
  registerDialog({
    id: `townfolk:${def.role}`,
    start: "root",
    nodes: {
      root: {
        text: (ctx) => ambientTownfolkText(def, ctx),
        choices: [
          { id: "leave", label: "Goodbye.", close: true },
        ],
      },
    },
  });
}

registerDialog({
  id: "townfolk:farmer",
  start: "root",
  nodes: {
    root: {
      text: (ctx) => {
        const quest = farmerMillRunQuest(ctx.world, ctx.actorId, ctx.targetId);
        const state = quest?.state;
        const vars = quest?.vars?.data || {};
        if (!state) return ambientTownfolkText(TOWNFOLK.farmer, ctx);
        if (String(state.status || "") === "complete") {
          return "The mill's turning and the tavern's fed. That's a good day's work. Keep those seeds planted.";
        }
        if (String(state.node || "") === "offer") {
          return "I've got wheat ready in the field, but the tavern needs flour. Harvest a sheaf, grind it at the mill, and take the flour to the barkeep. Then come back and I'll make it worth your while.";
        }
        if (String(state.node || "") === "harvest") return "Take a ripe sheaf from the field, then bring it to the millstone.";
        if (String(state.node || "") === "mill") return "The wheat needs grinding. The windmill is just beyond the fields.";
        if (String(state.node || "") === "barkeep") return "The barkeep is waiting on that flour. Take it straight to the tavern kitchen.";
        if (String(state.node || "") === "return") return "You got the flour delivered? Good. Choose one of these rewards for carrying the work through town.";
        if (String(state.node || "") === "reward") {
          return `Pick one: ${[0, 1, 2].map((index) => String(questRewardChoice(ctx.world, ctx.actorId, FARMER_MILL_RUN_QUEST_ID, index)?.label || "reward")).join(", ")}.`;
        }
        return ambientTownfolkText(TOWNFOLK.farmer, ctx);
      },
      choices: [
        {
          id: "accept_farmer_mill_run",
          label: "I'll carry the flour to the tavern.",
          visible: (ctx) => String(farmerMillRunQuest(ctx.world, ctx.actorId, ctx.targetId)?.state?.node || "") === "offer",
          emits: [{ name: "dialog:accepted", payload: (ctx) => ({ questId: FARMER_MILL_RUN_QUEST_ID, playerId: ctx.actorId, speakerId: ctx.targetId }) }],
          to: "accept_ack",
        },
        {
          id: "report_farmer_mill_run",
          label: "The flour is delivered.",
          visible: (ctx) => String(farmerMillRunQuest(ctx.world, ctx.actorId, ctx.targetId)?.state?.node || "") === "return",
          emits: [{ name: "dialog:reported", payload: (ctx) => ({ questId: FARMER_MILL_RUN_QUEST_ID, playerId: ctx.actorId, speakerId: ctx.targetId }) }],
          close: true,
        },
        { id: "leave", label: "Goodbye.", close: true },
      ],
    },
    accept_ack: {
      text: "The ripe wheat is in the field. The millstone will do the rest; just remember where the flour is meant to go.",
      choices: [{ id: "leave", label: "I'll get moving.", close: true }],
    },
    reward: {
      text: "The farmer wipes flour from his hands and nods toward the shelves.",
      choices: [{ id: "leave", label: "Let me choose.", to: "root" }],
    },
    reward_ack: {
      text: "A fair trade. The next loaf is partly yours.",
      choices: [{ id: "leave", label: "Thank you.", close: true }],
    },
  },
});

registerDialog({
  id: "townfolk:herbalist",
  start: "root",
  nodes: {
    root: {
      text: (ctx) => {
        const quest = rootboundGrottoQuest(ctx.world, ctx.actorId, ctx.targetId);
        const state = quest?.state;
        if (!state) return ambientTownfolkText(TOWNFOLK.herbalist, ctx);
        if (String(state.status || "") === "complete") {
          return "The roots have gone quiet. Keep that book dry; some knowledge only grows underground.";
        }
        if (String(state.node || "") === "offer") {
          return "The Strange Grove has opened beneath itself. Something down there is teaching wounded creatures to survive. Go into the Rootbound Grotto and break the circle before it spreads into the living forest.";
        }
        if (String(state.node || "") === "hunt") {
          return "The Rootbound Grotto lies beneath the Strange Grove. Find one of its healers and stop the lesson at its source.";
        }
        if (String(state.node || "") === "report") {
          return "You broke the rootbound circle? Then choose one gift from what grew beneath it.";
        }
        return ambientTownfolkText(TOWNFOLK.herbalist, ctx);
      },
      choices: [
        {
          id: "accept_rootbound_grotto",
          label: "I'll go beneath the grove.",
          visible: (ctx) => String(rootboundGrottoQuest(ctx.world, ctx.actorId, ctx.targetId)?.state?.node || "") === "offer",
          emits: [{
            name: "dialog:accepted",
            payload: (ctx) => ({
              questId: ROOTBOUND_GROTTO_QUEST_ID,
              playerId: ctx.actorId,
              speakerId: ctx.targetId,
            }),
          }],
          to: "accept_ack",
        },
        {
          id: "report_rootbound_grotto",
          label: "The rootbound circle is broken.",
          visible: (ctx) => String(rootboundGrottoQuest(ctx.world, ctx.actorId, ctx.targetId)?.state?.node || "") === "report",
          emits: [{
            name: "dialog:reported",
            payload: (ctx) => ({
              questId: ROOTBOUND_GROTTO_QUEST_ID,
              playerId: ctx.actorId,
              speakerId: ctx.targetId,
            }),
          }],
          close: true,
        },
        { id: "leave", label: "Goodbye.", close: true },
      ],
    },
    accept_ack: {
      text: "The stair is beneath the Strange Grove. Find one of the healers below and do not let it finish its work.",
      choices: [{ id: "leave", label: "I'll return.", close: true }],
    },
    report_ack: {
      text: "Good. The grove can breathe again. Spend the gift wisely, and come find me if the roots stir.",
      choices: [{ id: "leave", label: "Goodbye.", close: true }],
    },
    rootbound_reward_offer: {
      text: "The herbalist has set your reward aside. Choose it from the completed quest in your journal.",
      choices: [{ id: "leave", label: "I'll choose it from my journal.", close: true }],
    },
  },
});

registerDialog({
  id: "townfolk:fisher",
  start: "root",
  nodes: {
    root: {
      text: (ctx) => {
        const quest = fisherQuest(ctx.world, ctx.actorId, ctx.targetId);
        const state = quest?.state;
        if (!state) return ambientTownfolkText(TOWNFOLK.fisher, ctx);
        if (String(state.status || "") === "complete") return "The nets are mended and the water is calm. Keep your line wet while the luck lasts.";
        if (String(quest.def?.id || "") === FISHER_BAIT_QUEST_ID) {
          if (String(state.node || "") === "offer") return "I can make a bait that brings the little fish close, but I need five bunches of wild herbs. Bring them to me and I'll give you a proper rod.";
          return "The herbs need to be fresh. Bring me five bunches and I'll set you up with a fishing rod.";
        }
        if (String(quest.def?.id || "") === FISHER_FIRST_CATCH_QUEST_ID) {
          if (String(state.node || "") === "offer") return "Now prove the rod is more than a walking stick. Bring me three fish from the nearby water.";
          if (String(state.node || "") === "report") return "Three fish already? Good. Bring them in and take this supper for the road.";
          return `Keep casting. You've brought in ${Number(quest.vars?.data?.catchCount || 0)} of 3 fish.`;
        }
        if (String(state.node || "") === "offer") return "The sand crabs are tearing at my nets and eating the bait. Clear out five of them and I'll pay you for the trouble.";
        if (String(state.node || "") === "report") return "The reeds are quiet again. You did the fishery a good turn.";
        return `The crabs are still at it. You've dealt with ${Number(quest.vars?.data?.killCount || 0)} of 5.`;
      },
      choices: [
        {
          id: "accept_fisher_quest",
          label: (ctx) => String(fisherQuest(ctx.world, ctx.actorId, ctx.targetId)?.def?.id || "") === FISHER_BAIT_QUEST_ID
            ? "I'll gather the herbs."
            : String(fisherQuest(ctx.world, ctx.actorId, ctx.targetId)?.def?.id || "") === FISHER_FIRST_CATCH_QUEST_ID
              ? "I'll bring you three fish."
              : "I'll clear out the crabs.",
          visible: (ctx) => String(fisherQuest(ctx.world, ctx.actorId, ctx.targetId)?.state?.node || "") === "offer",
          emits: [{ name: "dialog:accepted", payload: (ctx) => ({ questId: fisherQuest(ctx.world, ctx.actorId, ctx.targetId)?.def?.id, playerId: ctx.actorId, speakerId: ctx.targetId }) }],
          to: "accepted",
        },
        {
          id: "report_fisher_quest",
          label: (ctx) => String(fisherQuest(ctx.world, ctx.actorId, ctx.targetId)?.def?.id || "") === FISHER_BAIT_QUEST_ID ? "Here are the herbs." : "The job is done.",
          visible: (ctx) => String(fisherQuest(ctx.world, ctx.actorId, ctx.targetId)?.state?.node || "") === "report",
          emits: [{ name: "dialog:reported", payload: (ctx) => ({ questId: fisherQuest(ctx.world, ctx.actorId, ctx.targetId)?.def?.id, playerId: ctx.actorId, speakerId: ctx.targetId }) }],
          close: true,
        },
        {
          id: "report_fisher_herbs",
          label: "Here are the herbs.",
          visible: (ctx) => String(fisherQuest(ctx.world, ctx.actorId, ctx.targetId)?.def?.id || "") === FISHER_BAIT_QUEST_ID
            && String(fisherQuest(ctx.world, ctx.actorId, ctx.targetId)?.state?.node || "") === "collect"
            && inventoryHasIdentity(ctx.world, ctx.actorId, "food_wild_herbs", 5),
          emits: [{ name: "dialog:reported", payload: (ctx) => ({ questId: FISHER_BAIT_QUEST_ID, playerId: ctx.actorId, speakerId: ctx.targetId }) }],
          close: true,
        },
        { id: "leave", label: "Goodbye.", close: true },
      ],
    },
    accepted: {
      text: "Good. The water is close, and the shore plants are hard to miss. Come back when you've got what I need.",
      choices: [{ id: "leave", label: "I'll get moving.", close: true }],
    },
  },
});

registerDialog({
  id: "townfolk:mason",
  start: "root",
  nodes: {
    root: {
      text: (ctx) => {
        const quest = runContractQuest(ctx.world, ctx.actorId);
        const state = quest?.state;
        const vars = quest?.vars?.data || {};
        if (!state) return masonAmbientText(ctx, TOWNFOLK.mason.dialogue);
        if (String(state.status || "") === "complete") {
          return `That ${String(vars.relicTitle || "trophy")} has given the town something to boast about. You did well.`;
        }
        if (String(state.node || "") === "offer") {
          return `The town wants proof the roads below are getting safer. Hunt ${String(vars.bossName || "the marked threat")} on floor ${Number(vars.bossDepth || 1) | 0} of ${String(vars.entranceLabel || "the marked dungeon")}, and bring me ${String(vars.relicTitle || "its trophy")}.`;
        }
        if (String(state.node || "") === "return" && canTurnInRunContract(ctx.world, ctx.actorId)) {
          return `You have ${String(vars.relicTitle || "the trophy")}. Hand it over and I'll see the reward paid.`;
        }
        if (String(state.node || "") === "reward") {
          return `The ${String(vars.relicTitle || "trophy")} is secured. Choose the reward that best serves the next descent.`;
        }
        if (String(state.node || "") === "reward") {
          return `The ${String(vars.relicTitle || "trophy")} is secured. Choose the reward that best serves the next descent.`;
        }
        if (String(state.node || "") === "recover") {
          return `The beast is dead. Search its remains for ${String(vars.relicTitle || "the trophy")}, then bring it to me.`;
        }
        return `Use the entrance to ${String(vars.entranceLabel || "the marked dungeon")}. ${String(vars.bossName || "The target")} is on floor ${Number(vars.bossDepth || 1) | 0}.`;
      },
      choices: [
        {
          id: "accept_run_contract",
          label: "I'll bring the town its trophy.",
          visible: (ctx) => String(runContractQuest(ctx.world, ctx.actorId)?.state?.node || "") === "offer",
          emits: [{
            name: "dialog:accepted",
            payload: (ctx) => ({
              questId: RUN_CONTRACT_QUEST_ID,
              playerId: ctx.actorId,
              speakerId: ctx.targetId,
            }),
          }],
          to: "accept_ack",
        },
        {
          id: "turn_in_run_contract",
          label: "Here is the trophy.",
          visible: (ctx) => (
            String(runContractQuest(ctx.world, ctx.actorId)?.state?.node || "") === "return"
            && canTurnInRunContract(ctx.world, ctx.actorId)
          ),
          emits: [{
            name: "dialog:reported",
            payload: (ctx) => ({
              questId: RUN_CONTRACT_QUEST_ID,
              playerId: ctx.actorId,
              speakerId: ctx.targetId,
            }),
          }],
          close: true,
        },
        { id: "leave", label: "Goodbye.", close: true },
      ],
    },
    accept_ack: {
      text: (ctx) => {
        const vars = runContractQuest(ctx.world, ctx.actorId)?.vars?.data || {};
        return `Good. Enter ${String(vars.entranceLabel || "the marked dungeon")} and find ${String(vars.bossName || "the target")} on floor ${Number(vars.bossDepth || 1) | 0}. Bring the relic back to me, not merely to town.`;
      },
      choices: [{ id: "leave", label: "I'll return with it.", close: true }],
    },
    report_ack: {
      text: "This will hang where everyone can see it. Here's your pay — the town keeps its word.",
      choices: [{ id: "leave", label: "Goodbye.", close: true }],
    },
    reward_offer: {
      text: "The trophy is secured. Choose your town reward from the completed quest in your journal.",
      choices: [{ id: "leave", label: "I'll choose it from my journal.", close: true }],
    },
  },
});

registerDialog({
  id: "townfolk:enchantress",
  start: "root",
  presentation: "overlay",
  nodes: {
    root: {
      text: (ctx) => ambientTownfolkText(TOWNFOLK.enchantress, ctx),
      choices: [
        {
          id: "open_services",
          label: "Show me your enchanting services.",
          emits: [{
            name: "enchanting:openRequest",
            payload: (ctx) => ({
              actorId: ctx.actorId,
              targetId: ctx.targetId,
              title: "✧ Enchantress",
              subtitle: "Bring themed reagents, gold, and the gear you want changed forever.",
            }),
          }],
          close: true,
        },
        { id: "ask_reagents", label: "What reagents are you after?", to: "reagents" },
        { id: "ask_work", label: "What bindings can you make?", to: "services" },
        { id: "leave", label: "Goodbye.", close: true },
      ],
    },
    reagents: {
      text: "Spider legs and venom glands for poisons. Ash, runes, and ember root for fire. Moonleaf, water, and frost cores for cold. Bone dust, resin, and cursed thread keep wards from slipping loose.",
      choices: [
        { id: "services", label: "And the bindings?", to: "services" },
        { id: "open_services", label: "Let's start enchanting.", emits: [{
          name: "enchanting:openRequest",
          payload: (ctx) => ({
            actorId: ctx.actorId,
            targetId: ctx.targetId,
            title: "✧ Enchantress",
            subtitle: "Pick a binding, pay the gold, and I'll give you a scroll worth using.",
          }),
        }], close: true },
        { id: "leave", label: "Later.", close: true },
      ],
    },
    services: {
      text: "Venom for blades. Fire and frost for killing edges. Wards for armor, shields, rings, and amulets. I bind the scroll; you decide what piece earns it.",
      choices: [
        { id: "open_services", label: "Make me a scroll.", emits: [{
          name: "enchanting:openRequest",
          payload: (ctx) => ({
            actorId: ctx.actorId,
            targetId: ctx.targetId,
            title: "✧ Enchantress",
            subtitle: "Choose the binding you want and I'll scribe the scroll if you've brought the price.",
          }),
        }], close: true },
        { id: "reagents", label: "Remind me of the materials.", to: "reagents" },
        { id: "leave", label: "That's enough for now.", close: true },
      ],
    },
  },
});

registerDialog({
  id: "townfolk:barkeep",
  start: "root",
  nodes: {
    root: {
      text: (ctx) => {
        const farmerQuest = farmerMillRunQuest(ctx.world, ctx.actorId);
        if (String(farmerQuest?.state?.node || "") === "barkeep") {
          return "The farmer's flour? Hand it over and I'll put it straight to work in the kitchen.";
        }
        const quest = barkeepQuest(ctx.world, ctx.actorId);
        const state = quest?.state;
        if (!state) return barkeepAmbientText(ctx, "What'll it be?");
        const vars = quest?.vars?.data || {};
        if (String(state.status || "") === "complete") {
          if (String(vars.resolution || "") === "genocide") {
            return "Cellar's quiet now. Too quiet. Haven't heard a scratch, squeak, or floorboard shift since you read that scroll.";
          }
          return "Cellar's been quiet since you cleared those rats. Drinks are on me.";
        }
        if (String(state.node || "") === "offer") {
          return "Damn rats have been crawling up from the cellar. " +
            `Kill ${REQUIRED_RAT_KILLS} of the wretches down there and I'll make it worth your while.`;
        }
        if (String(state.node || "") === "hunt") {
          const kills = Number(quest.vars?.data?.killCount || 0);
          return `You've got ${kills} of ${REQUIRED_RAT_KILLS} so far. Keep at it.`;
        }
        if (String(state.node || "") === "report") {
          if (String(vars.resolution || "") === "genocide") {
            return "You did what? I wanted the rats gone, not... whatever that silence is. Still, a deal's a deal.";
          }
          return "You got them all? Good. I owe you one.";
        }
        return barkeepAmbientText(ctx, "What'll it be?");
      },
      choices: [
        {
          id: "turn_in_farmer_flour",
          label: "Deliver the farmer's flour.",
          visible: (ctx) => String(farmerMillRunQuest(ctx.world, ctx.actorId)?.state?.node || "") === "barkeep",
          emits: [{
            name: "dialog:reported",
            payload: (ctx) => ({ questId: FARMER_MILL_RUN_QUEST_ID, playerId: ctx.actorId, speakerId: ctx.targetId }),
          }],
          to: "farmer_flour_ack",
        },
        {
          id: "accept_rat_quest",
          label: "I'll clear them out.",
          visible: (ctx) => {
            const quest = barkeepQuest(ctx.world, ctx.actorId);
            return String(quest?.state?.status || "active") === "active"
              && String(quest?.state?.node || "") === "offer";
          },
          emits: [
            {
              name: "dialog:accepted",
              payload: (ctx) => ({
                questId: RAT_INFESTATION_QUEST_ID,
                playerId: ctx.actorId,
                speakerId: ctx.targetId,
              }),
            },
          ],
          to: "accept_ack",
        },
        {
          id: "turn_in_rats",
          label: (ctx) => {
            const quest = barkeepQuest(ctx.world, ctx.actorId);
            const vars = quest?.vars?.data || {};
            if (String(vars.resolution || "") === "genocide") return "There are no rats anymore.";
            return "The rats are dead.";
          },
          visible: (ctx) => {
            const quest = barkeepQuest(ctx.world, ctx.actorId);
            return String(quest?.state?.status || "active") === "active"
              && String(quest?.state?.node || "") === "report";
          },
          emits: [
            {
              name: "dialog:reported",
              payload: (ctx) => ({
                questId: RAT_INFESTATION_QUEST_ID,
                playerId: ctx.actorId,
                speakerId: ctx.targetId,
              }),
            },
          ],
          close: true,
        },
        {
          id: "progress",
          label: "How many more?",
          visible: (ctx) => {
            const quest = barkeepQuest(ctx.world, ctx.actorId);
            return String(quest?.state?.status || "active") === "active"
              && String(quest?.state?.node || "") === "hunt";
          },
          to: "progress_reminder",
        },
        {
          id: "barkeep_story",
          label: "Tell me a story.",
          onSelect: (ctx) => {
            ctx.world.emit(new BarkeepStoryRequested({
              actor: ctx.actorId,
              targetId: ctx.targetId,
            }));
          },
          close: true,
        },
        {
          id: "leave",
          label: "Goodbye.",
          close: true,
        },
      ],
    },
    accept_ack: {
      text: "Head down through the hatch in the back. Take this bow and arrows — there are bats down there too.",
      choices: [
        { id: "leave", label: "I'll be back.", close: true },
      ],
    },
    progress_reminder: {
      text: (ctx) => {
        const quest = barkeepQuest(ctx.world, ctx.actorId);
        const kills = Number(quest?.vars?.data?.killCount || 0);
        const remaining = REQUIRED_RAT_KILLS - kills;
        return `${remaining} more to go. The cellar hatch is right here in the tavern.`;
      },
      choices: [
        { id: "leave", label: "On it.", close: true },
      ],
    },
    report_ack: {
      text: (ctx) => {
        const quest = barkeepQuest(ctx.world, ctx.actorId);
        const vars = quest?.vars?.data || {};
        if (String(vars.resolution || "") === "genocide") {
          return "That's a cold kind of answer. Here — take the reward I set aside, 150 gold, and a hot meal. Maybe keep that scroll-work out of the common room.";
        }
        return "That's a load off my mind. Here — take the reward I set aside, 150 gold, and a hot meal on the house.";
      },
      choices: [
        { id: "leave", label: "Cheers.", close: true },
      ],
    },
    rat_reward_offer: {
      text: "The barkeep has set your reward aside. Choose it from the completed quest in your journal.",
      choices: [{ id: "leave", label: "I'll choose it from my journal.", close: true }],
    },
    farmer_flour_ack: {
      text: "That'll make a fine batch of bread. Tell the farmer the town appreciates the work.",
      choices: [{ id: "leave", label: "I'll let him know.", close: true }],
    },
  },
});

registerDialog({
  id: "townfolk:priest",
  start: "root",
  nodes: {
    root: {
      text: (ctx) => {
        const quest = priestQuest(ctx.world, ctx.actorId);
        const riftQuest = priestRiftQuest(ctx.world, ctx.actorId);
        const riftState = riftQuest?.state;
        const riftVars = riftQuest?.vars?.data || {};
        if (String(riftState?.status || "") === "complete") {
          return "The rift is quiet. For now, that is the closest thing to mercy I can offer.";
        }
        if (String(riftState?.node || "") === "offer") {
          return "The book did not end the matter. It named a wound under the world. I can open it shallow and narrow, but you must close what answers.";
        }
        if (String(riftState?.node || "") === "cleanse") {
          return `The rift is open. Go down three levels and kill ${String(riftVars.bossName || "what waits there")}.`;
        }
        if (String(riftState?.node || "") === "return") {
          return "You came back with the rift's silence on you. Tell me it is done.";
        }
        if (String(riftState?.node || "") === "reward") {
          return "The rift is closed. Choose the church's answer to what you faced below.";
        }
        const state = quest?.state;
        if (!state) return priestAmbientText(ctx, "May the gods watch over you.");
        if (String(state.status || "") === "complete") {
          return "You brought back the old volume. I will keep it out of hungry hands.";
        }
        if (String(state.node || "") === "offer") {
          const prefix = priestAmbientText(ctx, "");
          const base = "There is an old book below the church stairs. Bring me the Book of the Dead, and do not linger with it.";
          return prefix ? `${prefix} ${base}` : base;
        }
        if (String(state.node || "") === "recover") {
          if (canTurnInStarterFetch(ctx.world, ctx.actorId)) return "You found it. Hand it here, and I will see it warded.";
          return "Go below and search the first dungeon level. The book should lie near the deeper stair.";
        }
        return "May the gods watch over you.";
      },
      choices: [
        {
          id: "accept_priest_rift",
          label: "Open the rift. I will go.",
          visible: (ctx) => canAcceptPriestRift(ctx.world, ctx.actorId),
          emits: [
            {
              name: "dialog:accepted",
              payload: (ctx) => ({
                questId: PRIEST_RIFT_QUEST_ID,
                playerId: ctx.actorId,
                speakerId: ctx.targetId,
              }),
            },
          ],
          to: "rift_ack",
        },
        {
          id: "turn_in_priest_rift",
          label: "The rift is quiet.",
          visible: (ctx) => {
            const quest = priestRiftQuest(ctx.world, ctx.actorId);
            return String(quest?.state?.status || "active") === "active"
              && String(quest?.state?.node || "") === "return";
          },
          emits: [
            {
              name: "dialog:reported",
              payload: (ctx) => ({
                questId: PRIEST_RIFT_QUEST_ID,
                playerId: ctx.actorId,
                speakerId: ctx.targetId,
              }),
            },
          ],
          close: true,
        },
        {
          id: "accept_priest_fetch",
          label: "I will bring it back.",
          visible: (ctx) => {
            const quest = priestQuest(ctx.world, ctx.actorId);
            return String(quest?.state?.status || "active") === "active"
              && String(quest?.state?.node || "") === "offer";
          },
          emits: [
            {
              name: "dialog:accepted",
              payload: (ctx) => ({
                questId: STARTER_PRIEST_FETCH_QUEST_ID,
                playerId: ctx.actorId,
                speakerId: ctx.targetId,
              }),
            },
          ],
          to: "accept_ack",
        },
        {
          id: "turn_in_priest_fetch",
          label: "Here is the book.",
          visible: (ctx) => {
            const quest = priestQuest(ctx.world, ctx.actorId);
            return String(quest?.state?.status || "active") === "active"
              && String(quest?.state?.node || "") === "recover"
              && canTurnInStarterFetch(ctx.world, ctx.actorId);
          },
          emits: [
            {
              name: "dialog:reported",
              payload: (ctx) => ({
                questId: STARTER_PRIEST_FETCH_QUEST_ID,
                playerId: ctx.actorId,
                speakerId: ctx.targetId,
              }),
            },
          ],
          to: "report_ack",
        },
        {
          id: "reminder",
          label: "Remind me what to do.",
          visible: (ctx) => {
            const quest = priestQuest(ctx.world, ctx.actorId);
            return String(quest?.state?.status || "active") === "active"
              && String(quest?.state?.node || "") === "recover"
              && !canTurnInStarterFetch(ctx.world, ctx.actorId);
          },
          to: "recover_reminder",
        },
        {
          id: "leave",
          label: "Goodbye.",
          close: true,
        },
      ],
    },
    accept_ack: {
      text: "The stair below the church will take you there. Bring the book back intact.",
      choices: [
        { id: "leave", label: "I will return.", close: true },
      ],
    },
    recover_reminder: {
      text: "Go below the church and search the first dungeon floor. The deeper stair is the likeliest place for it.",
      choices: [
        { id: "leave", label: "Understood.", close: true },
      ],
    },
    report_ack: {
      text: "Good. I will lock it away before sunset. Here — 200 gold and a vial of holy water from the parish stores. You have earned it.",
      choices: [
        { id: "leave", label: "Goodbye.", close: true },
      ],
    },
    rift_ack: {
      text: "Three levels. Compact, crowded, and wrong. Do not chase glory down there; cut out the heart and climb back.",
      choices: [
        { id: "leave", label: "I will return.", close: true },
      ],
    },
    rift_report_ack: {
      text: "Then the book told the truth, and you answered it. Take this. The church has little enough, but it remembers its debts.",
      choices: [
        { id: "leave", label: "Goodbye.", close: true },
      ],
    },
    rift_reward_offer: {
      text: "The church has set your reward aside. Choose it from the completed quest in your journal.",
      choices: [{ id: "leave", label: "I'll choose it from my journal.", close: true }],
    },
  },
});
