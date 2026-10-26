// rules/environment/dungeon/populate.js
// Generate spawn points for a chunk based on rooms and depth.

import { createRng } from '../../../lib/ecs-js/rng.js';
import { createFrom } from '../../../lib/ecs-js/archetype.js';
import { Position } from '../../components/Position.js';
import { NamedIdentity } from '../../components/NamedIdentity.js';
import { ItemInfo } from '../../components/ItemInfo.js';
import { Interactable } from '../../components/Interactable.js';
import { Collider } from '../../components/Collider.js';
import { Tombstone as TombstoneComponent } from '../../components/Tombstone.js';
import { Material } from '../../components/Material.js';
import { Polymorph } from '../../components/Polymorph.js';
import { DoorKey } from '../../components/DoorKey.js';
import { DoorLock } from '../../components/DoorLock.js';
import { DoorState } from '../../components/DoorState.js';
import { AudioEmitter } from '../../components/AudioEmitter.js';
import { Shopkeeper, Human } from '../../archetypes/Creatures.js';
import { Equipment } from '../../components/Equipment.js';
import { ShopInventory } from '../../components/ShopInventory.js';
import * as shopStock from '../../data/shopStock.js';
import { Unpaid } from '../../components/Unpaid.js';
import { HealthPotion, GoldStack, ArrowsStack, FireArrowsStack, PiercingArrowsStack, BodkinArrowsStack, BluntHeadArrowsStack, BombArrowsStack, ScrollOfMapping } from '../../archetypes/Items.js';
import { buildCatalogItem } from '../../data/itemCatalogLoader.js';
import { getCatalogItem, listCatalogItems } from '../../data/itemCatalog.js';
import { pickMonster, pickSentinelMonster, pickItem, pickTrap, pickSpawner, pickSpecificMonster, pickSpecificSpawner, pickEncounterGroup } from './tables.js';
import { Chest } from '../../archetypes/Chest.js';
import { SpikeTrap, SnakeTrap, ShockTrap, PitTrap, SiphonTrap, RustTrap, SwarmTrap, ArrowTrap } from '../../archetypes/Traps.js';
import { Spawner } from '../../archetypes/Spawner.js';
import { Tombstone, generateEpitaph } from '../../archetypes/Tombstone.js';
import {
  HomeBed,
  HomeChest,
  HomeSign,
  FishingSpot,
  BerryBush,
  HerbPatch,
  ThornBramble,
  VenomFern,
  MoonleafCluster,
  EmberRootPatch,
  OreVeinIron,
  OreVeinCoal,
  OreVeinStone,
  TreeNode,
  AlchemyBench,
  EnchantingBench,
  Anvil,
  Furnace,
  CookingFire,
  CropWheat,
  CropCarrot,
  CropCorn,
  Well,
  Scarecrow,
  TavernKeg,
  TavernTable,
  TavernBench,
  TavernPillar,
  TavernSign,
  Millstone,
  ChurchAltar,
  ChurchPew,
  ChurchSign,
  ChurchFont,
  ChurchWindow,
  WindowArched,
  WindowIronGrate,
  WindowShuttered,
  WindowRound,
  WindowRect,
  FlowerRose,
  FlowerSunflower,
  FlowerTulip,
  FlowerDaisy,
  FlowerBluebell,
  SmithyChest,
  MillChest,
  LumberChest,
  SmithySign,
  PotionShelf,
  HerbChest,
  TavernChest,
  ApothecarySign,
  BookShopSign,
  EnchanterShopSign,
  GeneralStoreSign,
  GemShopSign,
  GemDisplayCase,
  MessageBoard,
  Mailbox,
  GraveTombstone,
  TownBell,
  Barrel,
  Crate,
  Woodpile,
  HayBale,
  LanternPost,
  RainBarrel,
  Wheelbarrow,
  MarketStall,
  Bench,
  Boulder,
  FallenLog,
  LilyPad,
  Cattail,
  Birdbath,
  Trellis,
} from '../../archetypes/Overworld.js';
import { pickDungeonBook } from '../../data/dungeonBooks.js';
import { TOWNFOLK } from '../../data/townfolk.js';
import { TownfolkJob } from '../../components/TownfolkJob.js';
import { Inventory } from '../../components/Inventory.js';
import { resolveLootTable, materializeDrop } from '../../data/lootResolver.js';
import { getAllMonsters, getMonster } from '../../data/monsters.js';
import { RoomMetadata } from '../../components/RoomMetadata.js';
import { addToInventory, inventoryItems } from '../../utils/inventoryFacade.js';
import { createItemById } from '../../utils/itemFactory.js';
import {
  CHUNK_SIZE, TILE_FLOOR, TILE_DOOR, TILE_STAIR_DOWN, TILE_STAIR_UP,
  TILE_ICE, TILE_SHALLOW_WATER, TILE_LAVA, TILE_WALL,
} from './constants.js';
import { setTile, getTile } from './tileMap.js';
import { isPitLandingViable } from './floorPlan.js';
import { appraiseItemValue, getUnidentifiedGemAppraisal } from '../../utils/shopAppraisal.js';
import { spawnMonsterEntity } from '../../utils/spawnMonsterEntity.js';
import { spawnCentipede } from '../../utils/spawnCentipede.js';
import { getUnderworldRegionTemplate } from './underworldRegions.js';
import {
  Fountain, Altar, Shrine, Statue, Runestone,
  Sarcophagus, Pillar, WeaponRack, Mushrooms, Web, Torch, Urn,
  FlayedMan, HangingChains, Portcullis, ChainWinch, FloodGateWheel,
  DrainThroat, SteamVent, PressurePlinth, BoneChimeRack, Effigy,
  CandleCluster, EmberBrazier, GlowcapPatch, WebMoteCluster,
  ArmorStand, PolishedMirror, VoidCrack, DarkReliquary, MistVent,
} from '../../archetypes/RoomFeatures.js';

// Simple spawn kinds: just `createFrom(world, Archetype, { x, y })` with no extra logic.
const SIMPLE_SPAWN_TABLE = {
  home_bed: HomeBed, home_chest: HomeChest, home_sign: HomeSign,
  fishing_spot: FishingSpot,
  harvest_berries: BerryBush, harvest_herbs: HerbPatch,
  harvest_thorn_bramble: ThornBramble, harvest_venom_fern: VenomFern,
  harvest_moonleaf: MoonleafCluster, harvest_ember_root: EmberRootPatch,
  harvest_iron_ore: OreVeinIron, harvest_coal_ore: OreVeinCoal,
  harvest_stone: OreVeinStone, tree_node: TreeNode,
  alchemy_bench: AlchemyBench, enchanting_bench: EnchantingBench, anvil: Anvil, furnace: Furnace,
  cooking_fire: CookingFire,
  crop_wheat: CropWheat, crop_carrot: CropCarrot, crop_corn: CropCorn,
  well: Well, scarecrow: Scarecrow,
  tavern_keg: TavernKeg, tavern_table: TavernTable, tavern_bench: TavernBench,
  tavern_pillar: TavernPillar, tavern_sign: TavernSign,
  millstone: Millstone,
  church_altar: ChurchAltar, church_pew: ChurchPew, church_sign: ChurchSign,
  church_font: ChurchFont, church_window: ChurchWindow,
  window_arched: WindowArched, window_iron_grate: WindowIronGrate,
  window_shuttered: WindowShuttered, window_round: WindowRound, window_rect: WindowRect,
  town_bell: TownBell,
  flower_rose: FlowerRose, flower_sunflower: FlowerSunflower,
  flower_tulip: FlowerTulip, flower_daisy: FlowerDaisy, flower_bluebell: FlowerBluebell,
  smithy_chest: SmithyChest, mill_chest: MillChest, lumber_chest: LumberChest,
  smithy_sign: SmithySign, herb_chest: HerbChest, tavern_chest: TavernChest,
  apothecary_sign: ApothecarySign, gem_shop_sign: GemShopSign, book_shop_sign: BookShopSign,
  enchanter_shop_sign: EnchanterShopSign,
  general_store_sign: GeneralStoreSign,
  message_board: MessageBoard, mailbox: Mailbox,
  barrel: Barrel, crate: Crate, woodpile: Woodpile, hay_bale: HayBale,
  lantern_post: LanternPost, rain_barrel: RainBarrel, wheelbarrow: Wheelbarrow,
  market_stall: MarketStall, bench: Bench,
  boulder: Boulder, fallen_log: FallenLog, lily_pad: LilyPad, cattail: Cattail,
  birdbath: Birdbath, trellis: Trellis,
  fountain: Fountain, altar: Altar, runestone: Runestone, shrine: Shrine, statue: Statue, pillar: Pillar,
  mushrooms: Mushrooms, web: Web, torch: Torch, urn: Urn,
  flayed_man: FlayedMan, hanging_chains: HangingChains,
  portcullis: Portcullis,
  chain_winch: ChainWinch,
  flood_gate_wheel: FloodGateWheel,
  drain_throat: DrainThroat,
  steam_vent: SteamVent,
  pressure_plinth: PressurePlinth,
  bone_chime_rack: BoneChimeRack,
  effigy: Effigy,
  candle_cluster: CandleCluster,
  ember_brazier: EmberBrazier,
  glowcap_patch: GlowcapPatch,
  web_mote_cluster: WebMoteCluster,
  armor_stand: ArmorStand,
  polished_mirror: PolishedMirror,
  void_crack: VoidCrack,
  dark_reliquary: DarkReliquary,
  mist_vent: MistVent,
};

// Weighted room feature table. Weight determines relative likelihood.
const ROOM_FEATURES = [
  { kind: 'fountain',    weight: 8 },
  { kind: 'altar',       weight: 6 },
  { kind: 'shrine',      weight: 6 },
  { kind: 'runestone',    weight: 6 },
  { kind: 'statue',      weight: 10 },
  { kind: 'sarcophagus', weight: 7 },
  { kind: 'pillar',      weight: 10 },
  { kind: 'weapon_rack', weight: 12 },
  { kind: 'mushrooms',   weight: 8 },
  { kind: 'torch',       weight: 0 }, // handled by dedicated wall-torch pass
  { kind: 'urn',         weight: 7 },
];
const ROOM_FEATURE_TOTAL_WEIGHT = ROOM_FEATURES.reduce((s, f) => s + f.weight, 0);
const DEAD_END_ROOM_THEMES = [
  { kind: 'treasure', weight: 14 },
  { kind: 'trapped_treasure', weight: 8 },
  { kind: 'sanctuary', weight: 6 },
  { kind: 'lore_nook', weight: 5 },
  { kind: 'lair', weight: 5 },
  { kind: 'alchemist_den', weight: 4 },
  { kind: 'crypt', weight: 6 },
  { kind: 'armory', weight: 6 },
  { kind: 'obliiette', weight: 4 },
  { kind: 'kitchen', weight: 6 },
  { kind: 'hydraulics', weight: 5 },
  { kind: 'spider_nest', weight: 5 },
  { kind: 'mirror_reliquary', weight: 4 },
  { kind: 'dragon_hoard', weight: 3 },
];

const DEAD_END_THEME_TOTAL_WEIGHT = DEAD_END_ROOM_THEMES.reduce((s, f) => s + f.weight, 0);
// Mimics should be encountered mostly in shops; wild dungeon mimics stay uncommon.
const SHOP_MIMIC_CHANCE = 0.12;
const ROOM_MIMIC_CHANCE = 0.003;
const ROOM_CHEST_CHANCE = 0.05;
const CLOSET_SURPRISE_CHANCE = 0.35;
const CLOSET_SURPRISE_MAX_PER_CHUNK = 1;
const SHOP_MAX_ROOM_WIDTH = 6;
const SHOP_MAX_ROOM_HEIGHT = 6;
const SHOP_MIN_INTERIOR_TILES = 2;
const DEAD_END_CONTENT_CHANCE = 1.0;
// Torch placement tuning: authored pools of light carry dungeon readability.
const SACRED_ROOM_TORCH_CHANCE = 0.35;
const WALL_TORCH_ROOM_CHANCE = 0.45;
const LARGE_ROOM_EXTRA_TORCH_CHANCE = 0.55;
const DISPLAY_CONTAINER_IDENTITIES = new Set(["potion_shelf", "gem_display_case"]);
const DECOR_MIMIC_DISGUISE_POOL = Object.freeze(['chest', 'barrel', 'urn', 'crate', 'sarcophagus']);
function isPitTrapLandingViable(worldSeed, floorPlan, x, y) {
  return isPitLandingViable(
    worldSeed,
    floorPlan.depth + 1,
    x,
    y,
    Array.isArray(floorPlan.pitLandingPriorDownStairPositions)
      ? floorPlan.pitLandingPriorDownStairPositions
      : null,
  );
}

function catalogMimicItemIds({ premiumOnly = false } = {}) {
  return listCatalogItems()
    .filter((def) => {
      if (typeof def?.id !== 'string' || def.id.length <= 0) return false;
      if (!premiumOnly) return true;
      const rarity = Number(def?.rarity || 1);
      const rarityName = String(def?.rarityName || '').toLowerCase();
      return rarity >= 2 || /rare|epic|legendary|magic/.test(rarityName);
    })
    .map((def) => def.id);
}

function authoredBudgetEntry(entry) {
  if (typeof entry === 'string' || typeof entry === 'function') {
    return { count: 1, pool: Object.freeze([entry]) };
  }
  if (!entry || typeof entry !== 'object') return null;
  const rawPool = entry.pool ?? entry.id ?? entry.monsterId ?? entry.ids ?? entry.filter ?? entry.predicate;
  const pool = Array.isArray(rawPool) ? rawPool : [rawPool];
  return {
    count: Math.max(0, Number(entry.count ?? entry.budget ?? 0) | 0),
    pool: Object.freeze(pool.filter((selector) => typeof selector === 'string' || typeof selector === 'function')),
  };
}

function authoredPoolFilter(pool) {
  return (def) => {
    if (!def) return false;
    for (const selector of pool || []) {
      if (typeof selector === 'string' && String(def.id || '') === selector) return true;
      if (typeof selector === 'function') {
        try {
          if (selector(def)) return true;
        } catch {
          // Bad authoring predicates should fail closed for this selector.
        }
      }
    }
    return false;
  };
}

function authoredDepthEligible(def, depth) {
  if (!def || def.disabled) return false;
  return true;
}

function pickAuthoredMonster(rng, depth, pool) {
  const filter = authoredPoolFilter(pool);
  const candidates = getAllMonsters().filter((def) => authoredDepthEligible(def, depth) && filter(def));
  if (candidates.length === 0) return null;
  for (let tries = 0; tries < candidates.length; tries++) {
    const def = candidates[rng.int(0, candidates.length - 1)];
    const params = pickSpecificMonster(def.id, depth);
    if (params) return params;
  }
  return null;
}

function pickAuthoredSpawner(rng, depth, pool) {
  const filter = authoredPoolFilter(pool);
  const candidates = getAllMonsters().filter((def) => authoredDepthEligible(def, depth) && filter(def));
  if (candidates.length === 0) return null;
  for (let tries = 0; tries < candidates.length; tries++) {
    const def = candidates[rng.int(0, candidates.length - 1)];
    const params = pickSpecificSpawner(rng, def.id, depth);
    if (params) return params;
  }
  return null;
}

function pickMimicDisguiseIdentity(rng, { preferPremium = false } = {}) {
  const catalogItemIds = catalogMimicItemIds();
  const premiumCatalogItemIds = catalogMimicItemIds({ premiumOnly: true });
  const hasCatalogItems = catalogItemIds.length > 0;
  const hasPremiumCatalogItems = premiumCatalogItemIds.length > 0;

  if (hasCatalogItems) {
    const allowDecorFallback = !preferPremium && rng.next() < 0.10;
    if (!allowDecorFallback) {
      const usePremiumPool = hasPremiumCatalogItems && (preferPremium || rng.next() < 0.45);
      const pool = usePremiumPool ? premiumCatalogItemIds : catalogItemIds;
      return pool[rng.int(0, pool.length - 1)];
    }
  }

  return DECOR_MIMIC_DISGUISE_POOL[rng.int(0, DECOR_MIMIC_DISGUISE_POOL.length - 1)];
}

function findDoorEntityAt(world, x, y) {
  for (const [id, pos] of world.query(Position, DoorState)) {
    if (pos.x === x && pos.y === y) return id;
  }
  return 0;
}

const SHOP_KEY_META = {
  gem_vendor:  { label: "Gem Shop Key",  identity: "key_gem_shop",   desc: "the gem shop" },
  alchemist:   { label: "Apothecary Key", identity: "key_apothecary", desc: "the apothecary" },
  book_vendor: { label: "Book Shop Key",  identity: "key_book_shop",  desc: "the book shop" },
  general_vendor: { label: "General Store Key", identity: "key_general_store", desc: "the general store" },
  enchantress: { label: "Enchanter Shop Key", identity: "key_enchanter_shop", desc: "the enchanter shop" },
};

function createShopDoorKey(world, lockId, role) {
  const itemId = world.create();
  const meta = SHOP_KEY_META[role] || { label: "Shop Key", identity: "key_shop", desc: "a shop" };
  world.add(itemId, NamedIdentity, { name: meta.label, identity: meta.identity });
  world.add(itemId, ItemInfo, {
    type: "tool",
    slot: "",
    weight: 0.1,
    value: 0,
    description: `A shop key cut for ${meta.desc} door.`,
    count: 1,
  });
  world.add(itemId, Material, { kind: "iron" });
  world.add(itemId, DoorKey, { lockId });
  return itemId;
}

function shopDoorLockId(role, x, y) {
  return `overworld:shop:${String(role || "vendor")}:${Number(x) | 0},${Number(y) | 0}`;
}

function actorHasShopDoorKey(world, actorId, lockId) {
  for (const itemId of inventoryItems(world, actorId)) {
    if (String(world.get(itemId, DoorKey)?.lockId || "") === lockId) return true;
  }
  return false;
}

function ensureShopDoorAccess(world, actorId, role, doorId) {
  if (!(actorId > 0) || !(doorId > 0)) return;
  const pos = world.get(doorId, Position);
  if (!pos) return;

  const lockId = shopDoorLockId(role, pos.x, pos.y);
  if (world.has(doorId, DoorLock)) world.set(doorId, DoorLock, { lockId });
  else world.add(doorId, DoorLock, { lockId });

  const doorState = world.get(doorId, DoorState);
  if (doorState) {
    world.set(doorId, DoorState, { ...doorState, open: false, locked: true });
  }

  if (!actorHasShopDoorKey(world, actorId, lockId)) {
    const keyId = createShopDoorKey(world, lockId, String(role || ""));
    addToInventory(world, actorId, keyId);
  }
}

function assignShopDoorKey(world, actorId, role, shopDoor) {
  if (!(actorId > 0) || !shopDoor) return;
  const doorId = findDoorEntityAt(world, Number(shopDoor.x) | 0, Number(shopDoor.y) | 0);
  const lockId = shopDoorLockId(role, Number(shopDoor.x) | 0, Number(shopDoor.y) | 0);
  if (!actorHasShopDoorKey(world, actorId, lockId)) {
    const keyId = createShopDoorKey(world, lockId, String(role || ""));
    addToInventory(world, actorId, keyId);
  }
  if (doorId > 0) ensureShopDoorAccess(world, actorId, role, doorId);
}

function isDoorOnRoomPerimeter(pos, room) {
  if (!pos || !room) return false;
  if (pos.x < room.x || pos.x >= room.x + room.w || pos.y < room.y || pos.y >= room.y + room.h) return false;
  return pos.x === room.x
    || pos.x === (room.x + room.w - 1)
    || pos.y === room.y
    || pos.y === (room.y + room.h - 1);
}

function findRoomDoor(world, room) {
  for (const [id, pos] of world.query(Position, DoorState)) {
    if (isDoorOnRoomPerimeter(pos, room)) return id;
  }
  return 0;
}

export function reconcileShopDoorAccess(world) {
  for (const [, room] of world.query(RoomMetadata)) {
    if (room.roomType !== "shop") continue;
    const actorId = Number(room.shopkeeperId || 0) | 0;
    if (!(actorId > 0)) continue;
    const job = world.get(actorId, TownfolkJob);
    if (!job) continue;
    const doorId = findRoomDoor(world, room);
    if (!(doorId > 0)) continue;
    ensureShopDoorAccess(world, actorId, job.role, doorId);
  }
}

function stockDisplayContainer(world, id, spawn, stockKind) {
  const inv = /** @type {any} */ (world.get(id, Inventory));
  if (!inv) return id;

  const seed = ((world.seed >>> 0) ^ ((id * 0x9e3779b9) >>> 0) ^ ((spawn.x * 0x45d9f3b) >>> 0) ^ ((spawn.y * 0x119de1f3) >>> 0)) >>> 0;
  const rng = createRng(seed);
  const count = stockKind === "gem" ? rng.int(2, 4) : rng.int(2, 3);

  for (let i = 0; i < count; i++) {
    let itemId = null;
    if (stockKind === "alchemy") itemId = shopStock.generateAlchemyShopItem(world, rng);
    else if (stockKind === "gem") itemId = shopStock.generateGemDisplayItem(world, rng, {
      stockTier: spawn?.params?.stockTier || null,
    });
    if (!(itemId > 0)) continue;
    const info = world.get(itemId, ItemInfo);
    if (info) world.mutate(itemId, ItemInfo, (r) => { r.identified = true; });
    addToInventory(world, id, itemId);
  }

  return id;
}

function pickRoomFeature(rng) {
  let roll = rng.next() * ROOM_FEATURE_TOTAL_WEIGHT;
  for (const f of ROOM_FEATURES) {
    roll -= f.weight;
    if (roll <= 0) return f.kind;
  }
  return ROOM_FEATURES[ROOM_FEATURES.length - 1].kind;
}

/** Pick a feature kind, optionally restricted to a string[] pool. */
function _pickFeature(rng, pool) {
  if (!pool) return pickRoomFeature(rng);
  const candidates = ROOM_FEATURES.filter(f => pool.includes(f.kind));
  if (candidates.length === 0) return pickRoomFeature(rng);
  const total = candidates.reduce((s, f) => s + f.weight, 0);
  let roll = rng.next() * total;
  for (const f of candidates) {
    roll -= f.weight;
    if (roll <= 0) return f.kind;
  }
  return candidates[candidates.length - 1].kind;
}

function pickDeadEndTheme(rng) {
  let roll = rng.next() * DEAD_END_THEME_TOTAL_WEIGHT;
  for (const theme of DEAD_END_ROOM_THEMES) {
    roll -= theme.weight;
    if (roll <= 0) return theme.kind;
  }
  return DEAD_END_ROOM_THEMES[DEAD_END_ROOM_THEMES.length - 1].kind;
}

function isWalkableDungeonTile(tile) {
  return tile === TILE_FLOOR || tile === TILE_DOOR || tile === TILE_STAIR_DOWN || tile === TILE_STAIR_UP;
}

function isInBoundsLocal(x, y) {
  return x >= 0 && y >= 0 && x < CHUNK_SIZE && y < CHUNK_SIZE;
}

function getClosetEndpoint(chunk, doorLocalX, doorLocalY, startX, startY) {
  if (!isInBoundsLocal(startX, startY)) return null;
  if (!isWalkableDungeonTile(chunk.tiles[startY * CHUNK_SIZE + startX])) return null;

  let prevX = doorLocalX;
  let prevY = doorLocalY;
  let curX = startX;
  let curY = startY;
  let steps = 1;

  while (true) {
    const next = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = curX + dx;
      const ny = curY + dy;
      if (!isInBoundsLocal(nx, ny)) continue;
      if (nx === prevX && ny === prevY) continue;
      if (nx === doorLocalX && ny === doorLocalY) continue;
      const t = chunk.tiles[ny * CHUNK_SIZE + nx];
      if (isWalkableDungeonTile(t)) next.push([nx, ny]);
    }

    if (next.length === 0) return { x: curX, y: curY, steps };
    if (next.length > 1) return null;
    if (steps >= 2) return null;

    prevX = curX; prevY = curY;
    curX = next[0][0]; curY = next[0][1];
    steps++;
  }
}

function addClosetSurprises(chunk, floorPlan, rng, spawns, isSolid, markSolid) {
  if (!Array.isArray(chunk.doors) || chunk.doors.length === 0) return;
  const ox = chunk.chunkX * CHUNK_SIZE;
  const oy = chunk.chunkY * CHUNK_SIZE;
  const candidates = [];

  for (const d of chunk.doors) {
    const lx = d.x - ox;
    const ly = d.y - oy;
    if (!isInBoundsLocal(lx, ly)) continue;

    const n = chunk.tiles[(ly - 1) * CHUNK_SIZE + lx];
    const s = chunk.tiles[(ly + 1) * CHUNK_SIZE + lx];
    const e = chunk.tiles[ly * CHUNK_SIZE + (lx + 1)];
    const w = chunk.tiles[ly * CHUNK_SIZE + (lx - 1)];
    const nsWalls = (n === TILE_WALL) && (s === TILE_WALL);
    const ewWalls = (e === TILE_WALL) && (w === TILE_WALL);

    const sides = [];
    if (nsWalls) sides.push([lx - 1, ly], [lx + 1, ly]);
    else if (ewWalls) sides.push([lx, ly - 1], [lx, ly + 1]);
    else continue;

    for (const [sx, sy] of sides) {
      const end = getClosetEndpoint(chunk, lx, ly, sx, sy);
      if (!end || end.steps > 2) continue;
      const wx = ox + end.x;
      const wy = oy + end.y;
      if (isSolid(wx, wy)) continue;
      candidates.push({ x: wx, y: wy });
    }
  }

  if (candidates.length === 0) return;
  let placed = 0;
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = tmp;
  }

  for (const c of candidates) {
    if (placed >= CLOSET_SURPRISE_MAX_PER_CHUNK) break;
    if (rng.next() >= CLOSET_SURPRISE_CHANCE) continue;
    const monster = pickSentinelMonster(rng, floorPlan.depth, floorPlan.profile?.monsterFilter ?? null);
    spawns.push({ x: c.x, y: c.y, kind: 'monster', params: monster });
    markSolid(c.x, c.y);
    placed++;
  }
}

/**
 * @typedef {Object} SpawnPoint
 * @property {number} x - world X
 * @property {number} y - world Y
 * @property {string} kind - 'monster', 'mimic', 'gold', 'potion', 'equipment'
 * @property {Object} params
 */

/**
 * Generate spawn points for a chunk.
 * @param {import('./chunk.js').ChunkData} chunk
 * @param {{difficultyMult:number, depth:number}} floorPlan
 * @param {Object} rng - createRng() instance
 * @param {Object} [tombstoneRepo] - Tombstone repository for placing tombstones
 * @returns {SpawnPoint[]}
 */
export function populateChunk(chunk, floorPlan, rng, tombstoneRepo = null, worldSeed = 0) {
  const spawns = [];
  const diff = floorPlan.difficultyMult;
  const templateId = String(floorPlan.activeTemplateId || "");
  const authoredContent = getUnderworldRegionTemplate(templateId)?.content || null;
  const hasAuthoredFeatures = Array.isArray(authoredContent?.features);
  const SPAWNER_CHANCE_PER_MONSTER = 0.35; // Convert room monster budget into a per-room nest chance.

  // Track occupied positions for solid/immovable features (decorations, chests, tombstones,
  // spawners) so nothing gets placed on top of something else solid.
  const solidPositions = new Set(); // "x,y" string keys
  const isSolid = (x, y) => solidPositions.has(`${x},${y}`);
  const markSolid = (x, y) => solidPositions.add(`${x},${y}`);

  // Cap shrine and altar spawns to max 1 each per floor
  const featureCounts = { shrine: 0, altar: 0 };

  // Pre-mark stair tiles so monsters, traps, and other spawns never land on them.
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const t = chunk.tiles[ly * CHUNK_SIZE + lx];
      if (t === TILE_STAIR_DOWN || t === TILE_STAIR_UP) {
        markSolid(chunk.chunkX * CHUNK_SIZE + lx, chunk.chunkY * CHUNK_SIZE + ly);
      }
    }
  }

  // Tiny door closets can hold an occasional deterministic "surprise" monster.
  addClosetSurprises(chunk, floorPlan, rng, spawns, isSolid, markSolid);

  // Identify the player's entry room so we don't clutter it with a feature
  const entryRoom = (chunk.chunkX === 0 && chunk.chunkY === 0 && chunk.rooms.length > 0)
    ? chunk.rooms[0]
    : null;
  const eligibleDeadEndRooms = chunk.rooms.filter((room) => {
    if (room.isolated) return false;
    const isDeadEnd = countRoomEntrances(room, chunk) === 1;
    const hasStair = roomContainsStairTile(room, chunk);
    const isEntryRoom = !!entryRoom &&
      room.x === entryRoom.x &&
      room.y === entryRoom.y &&
      room.w === entryRoom.w &&
      room.h === entryRoom.h;
    return isDeadEnd && !isEntryRoom && !hasStair;
  });
  const eligibleShopRooms = eligibleDeadEndRooms.filter((room) => (
    room.w <= SHOP_MAX_ROOM_WIDTH
    && room.h <= SHOP_MAX_ROOM_HEIGHT
    && countRoomOpeningTiles(room, chunk) === 1
    && (Math.max(1, room.w - 2) * Math.max(1, room.h - 2)) >= SHOP_MIN_INTERIOR_TILES
  ));

  // Solid spawn kinds that should be marked solid in the solidPositions set.
  // Every archetype with Collider { solid: true } must be listed here so that
  // (a) it gets tracked in solidPositions, and (b) the narrow-passage guard
  // can skip placement when the tile would block the only walkable path.
  const SOLID_PREFAB_KINDS = new Set([
    'statue', 'urn', 'pillar', 'sarcophagus', 'fountain', 'altar', 'shrine',
    'mushrooms', 'weapon_rack', 'web', 'flayed_man', 'hanging_chains',
    'portcullis', 'chain_winch', 'flood_gate_wheel', 'bone_chime_rack',
    'armor_stand', 'polished_mirror', 'dark_reliquary',
  ]);
  const SACRED_FEATURE_KINDS = new Set(['altar', 'shrine', 'church_altar']);

  for (const room of chunk.rooms) {
    if (room.isolated) continue;

    // Prefab rooms use their own spawn list — skip normal population entirely.
    if (room.prefab && Array.isArray(room.prefabSpawns)) {
      for (const s of room.prefabSpawns) {
        const params = { ...(s.params || {}) };
        if (s.kind === "monster" && typeof params.monsterId === "string") {
          const resolved = pickSpecificMonster(params.monsterId, floorPlan.depth);
          if (!resolved) continue;
          spawns.push({ x: s.x, y: s.y, kind: "monster", params: resolved });
          continue;
        }
        spawns.push({ x: s.x, y: s.y, kind: s.kind, params });
        if (SOLID_PREFAB_KINDS.has(s.kind)) markSolid(s.x, s.y);
      }
      continue;
    }

    const area = room.w * room.h;

    // Place a room feature (~50% of non-entry rooms get one)
    const isEntryRoom = room === entryRoom;
    const roomIsStarting = roomContainsStairUpTile(room, chunk);
    let roomHasWeaponRack = false;
    let roomIsSacred = false;
    const featureRate = floorPlan.profile?.doorFeatureRate ?? 0.50;
    if (!hasAuthoredFeatures && !isEntryRoom && rng.next() < featureRate) {
      let featureKind = _pickFeature(rng, floorPlan.profile?.featurePool ?? null);

      // Cap shrine and altar to 1 each per floor
      if (featureKind === 'shrine' && featureCounts.shrine > 0) {
        featureKind = 'pillar'; // fallback to pillar
      }
      if (featureKind === 'altar' && featureCounts.altar > 0) {
        featureKind = 'pillar'; // fallback to pillar
      }

      const cx = room.x + Math.floor(room.w / 2);
      const cy = room.y + Math.floor(room.h / 2);

      // Solid features must not block narrow passages in any dungeon type.
      let skipFeature = false;
      if (SOLID_PREFAB_KINDS.has(featureKind)) {
        const lx = cx - chunk.chunkX * CHUNK_SIZE;
        const ly = cy - chunk.chunkY * CHUNK_SIZE;
        const inBounds = lx >= 0 && ly >= 0 && lx < CHUNK_SIZE && ly < CHUNK_SIZE;
        if (!inBounds || chunk.tiles[ly * CHUNK_SIZE + lx] !== TILE_FLOOR) {
          skipFeature = true;
        } else {
          let floorN = 0;
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nx = lx + dx, ny = ly + dy;
            if (nx >= 0 && ny >= 0 && nx < CHUNK_SIZE && ny < CHUNK_SIZE
                && chunk.tiles[ny * CHUNK_SIZE + nx] === TILE_FLOOR) floorN++;
          }
          if (floorN < 3) skipFeature = true;
        }
      }

      // Don't place a feature on a stair (or any other already-solid tile).
      if (!skipFeature && !isSolid(cx, cy)) {
        spawns.push({ x: cx, y: cy, kind: featureKind, params: { depth: floorPlan.depth } });
        if (featureKind === 'weapon_rack') roomHasWeaponRack = true;
        if (featureKind === 'shrine') featureCounts.shrine++;
        if (featureKind === 'altar') featureCounts.altar++;
        if (SACRED_FEATURE_KINDS.has(featureKind)) roomIsSacred = true;
        markSolid(cx, cy);

        // Sacred rooms (altar or shrine) only sometimes get a single anchor torch.
        // Keep the room's own aura dominant rather than flooding with warm light.
        const isSacred = featureKind === 'altar' || featureKind === 'shrine';
        if (isSacred && room.w >= 4 && room.h >= 4 && rng.next() < SACRED_ROOM_TORCH_CHANCE) {
          const corners = [
            { x: room.x, y: room.y },
            { x: room.x + room.w - 1, y: room.y },
            { x: room.x, y: room.y + room.h - 1 },
            { x: room.x + room.w - 1, y: room.y + room.h - 1 },
          ];
          const c = corners[rng.int(0, corners.length - 1)];
          if (!isSolid(c.x, c.y)) {
            spawns.push({ x: c.x, y: c.y, kind: 'torch', params: {} });
            markSolid(c.x, c.y);
          }
        }
      }
    }

    // Wall torches: prefer room corners, fall back to wall-adjacent cells.
    // Darkness-first baseline: only some rooms get torches.
    if (room.w >= 3 && room.h >= 3) {
      const shouldTorchRoom = isEntryRoom || rng.next() < WALL_TORCH_ROOM_CHANCE;
      if (shouldTorchRoom) {
        const isLargeRoom = room.w >= 8 && room.h >= 8;
        const torchBudget = 1 + (isLargeRoom && rng.next() < LARGE_ROOM_EXTRA_TORCH_CHANCE ? 1 : 0);
        // Corners first (most natural sconce positions)
        const corners = [
          { x: room.x,              y: room.y },
          { x: room.x + room.w - 1, y: room.y },
          { x: room.x,              y: room.y + room.h - 1 },
          { x: room.x + room.w - 1, y: room.y + room.h - 1 },
        ];
        // Shuffle corners deterministically
        for (let i = corners.length - 1; i > 0; i--) {
          const j = rng.int(0, i);
          const tmp = corners[i]; corners[i] = corners[j]; corners[j] = tmp;
        }
        let placed = 0;
        for (const c of corners) {
          if (placed >= torchBudget) break;
          if (isSolid(c.x, c.y)) continue;
          const lx = c.x - chunk.chunkX * CHUNK_SIZE;
          const ly = c.y - chunk.chunkY * CHUNK_SIZE;
          if (lx < 0 || ly < 0 || lx >= CHUNK_SIZE || ly >= CHUNK_SIZE) continue;
          if (chunk.tiles[ly * CHUNK_SIZE + lx] !== TILE_FLOOR) continue;
          spawns.push({ x: c.x, y: c.y, kind: 'torch', params: {} });
          markSolid(c.x, c.y);
          placed++;
        }
        // Fall back to any wall-adjacent floor cell if corners were blocked
        if (placed < torchBudget) {
          const wallCells = [];
          for (let ty = room.y; ty < room.y + room.h; ty++) {
            for (let tx = room.x; tx < room.x + room.w; tx++) {
              if (isSolid(tx, ty)) continue;
              const lx = tx - chunk.chunkX * CHUNK_SIZE;
              const ly = ty - chunk.chunkY * CHUNK_SIZE;
              if (lx < 0 || ly < 0 || lx >= CHUNK_SIZE || ly >= CHUNK_SIZE) continue;
              if (chunk.tiles[ly * CHUNK_SIZE + lx] !== TILE_FLOOR) continue;
              let nearWall = false;
              for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nx = lx + dx, ny = ly + dy;
                if (nx < 0 || ny < 0 || nx >= CHUNK_SIZE || ny >= CHUNK_SIZE) { nearWall = true; break; }
                if (chunk.tiles[ny * CHUNK_SIZE + nx] === TILE_WALL) { nearWall = true; break; }
              }
              if (nearWall) wallCells.push({ x: tx, y: ty });
            }
          }
          for (let i = wallCells.length - 1; i > 0; i--) {
            const j = rng.int(0, i);
            const tmp = wallCells[i]; wallCells[i] = wallCells[j]; wallCells[j] = tmp;
          }
          for (const c of wallCells) {
            if (placed >= torchBudget) break;
            if (isSolid(c.x, c.y)) continue;
            spawns.push({ x: c.x, y: c.y, kind: 'torch', params: {} });
            markSolid(c.x, c.y);
            placed++;
          }
        }
      }
    }

    // Monster density: arcade-forward pressure, scaled by depth.
    // Stair-up rooms are safe — no monsters near arrival points.
    const totalMonsterBudget = roomIsStarting ? (rng.int(13, 21), 0) : Math.max(0, Math.floor(area / rng.int(13, 21) * diff));
    const spawnerChance = Math.min(0.50, totalMonsterBudget * SPAWNER_CHANCE_PER_MONSTER);
    const spawnerBudget = (!roomIsSacred && !roomIsStarting && totalMonsterBudget > 0 && rng.next() < spawnerChance) ? 1 : 0;
    const monsterBudget = Math.max(0, totalMonsterBudget - spawnerBudget);

    // Place spawners (create monster packs)
    // Never place a spawner on top of a dungeon decoration.
    let roomHasSpider = false;
    const roomSpawners = [];
    for (let i = 0; i < spawnerBudget; i++) {
      let mx, my, attempts = 0;
      do {
        mx = room.x + 1 + rng.int(0, Math.max(0, room.w - 3));
        my = room.y + 1 + rng.int(0, Math.max(0, room.h - 3));
        attempts++;
      } while (isSolid(mx, my) && attempts < 10);
      const sp = pickSpawner(rng, floorPlan.depth, floorPlan.profile?.monsterFilter ?? null);
      const isSpiderSpawner = sp.monsterType?.identity === 'spider' || sp.monsterType?.identity === 'cave_spider';
      if (!isSolid(mx, my)) {
        markSolid(mx, my);
        spawns.push({ x: mx, y: my, kind: 'spawner', params: sp });
        if (isSpiderSpawner) roomHasSpider = true;
        roomSpawners.push({ x: mx, y: my, isSpider: isSpiderSpawner });
      }
    }

    // Encounter group: ~30% chance to spawn a themed group instead of random individuals
    let groupBudgetUsed = 0;
    if (monsterBudget >= 2 && rng.next() < 0.30) {
      const group = pickEncounterGroup(rng, floorPlan.depth, monsterBudget);
      if (group) {
        const placeGroupMember = (params) => {
          if (groupBudgetUsed >= monsterBudget) return;
          let mx, my, att = 0;
          do {
            mx = room.x + 1 + rng.int(0, Math.max(0, room.w - 3));
            my = room.y + 1 + rng.int(0, Math.max(0, room.h - 3));
            att++;
          } while (isSolid(mx, my) && att < 10);
          if (!isSolid(mx, my)) {
            spawns.push({ x: mx, y: my, kind: 'monster', params });
            const id = params.identity;
            if (id === 'spider' || id === 'cave_spider' || id === 'phase_spider') roomHasSpider = true;
            groupBudgetUsed++;
          }
        };
        if (group.leader) placeGroupMember(group.leader);
        for (const follower of group.followers) placeGroupMember(follower);
      }
    }

    // Place remaining individual monsters — avoid solid features
    const remainingBudget = Math.max(0, monsterBudget - groupBudgetUsed);
    for (let i = 0; i < remainingBudget; i++) {
      let mx, my, attempts = 0;
      do {
        mx = room.x + 1 + rng.int(0, Math.max(0, room.w - 3));
        my = room.y + 1 + rng.int(0, Math.max(0, room.h - 3));
        attempts++;
      } while (isSolid(mx, my) && attempts < 10);
      if (isSolid(mx, my)) continue;
      const mp = pickSentinelMonster(rng, floorPlan.depth, floorPlan.profile?.monsterFilter ?? null);
      if (mp.identity === 'centipede') {
        const segCount = rng.int(4, 7);
        spawns.push({ x: mx, y: my, kind: 'centipede', params: { ...mp, segmentCount: segCount } });
      } else {
        spawns.push({ x: mx, y: my, kind: 'monster', params: mp });
      }
      if (mp.identity === 'spider' || mp.identity === 'cave_spider') roomHasSpider = true;
    }

    // Scatter webs across ~30% of floor tiles in spider rooms.
    // Don't place webs on non-spider spawners; spider spawners are the exception.
    if (roomHasSpider) {
      for (let wy = room.y + 1; wy < room.y + room.h - 1; wy++) {
        for (let wx = room.x + 1; wx < room.x + room.w - 1; wx++) {
          if (rng.next() < 0.30) {
            const spawnerHere = roomSpawners.find(s => s.x === wx && s.y === wy);
            if ((!spawnerHere || spawnerHere.isSpider) && !isSolid(wx, wy)) {
              spawns.push({ x: wx, y: wy, kind: 'web', params: {} });
            }
          }
        }
      }
    }

    // Item density: visible singleton loot keeps exploration rewarding between fights.
    const itemBudget = roomContainsStairTile(room, chunk)
      ? 0
      : Math.max(0, Math.floor(area / rng.int(18, 30)));
    for (let i = 0; i < itemBudget; i++) {
      const ix = room.x + 1 + rng.int(0, Math.max(0, room.w - 3));
      const iy = room.y + 1 + rng.int(0, Math.max(0, room.h - 3));
      const item = pickItem(rng, floorPlan.depth);
      if (isSolid(ix, iy)) continue;
      spawns.push({
        x: ix, y: iy,
        kind: item.kind,
        params: item,
      });
    }

    // Trap density: ~33% of rooms get a trap (infrequent enough to lull players)
    // Stair-up rooms are safe — no traps near arrival points.
    if (!roomIsStarting && rng.next() < 0.33) {
      const trapBudget = area >= 64 ? rng.int(1, 2) : 1;
      for (let i = 0; i < trapBudget; i++) {
        let tx, ty, attempts = 0;
        do {
          tx = room.x + 1 + rng.int(0, Math.max(0, room.w - 3));
          ty = room.y + 1 + rng.int(0, Math.max(0, room.h - 3));
          attempts++;
        } while (isSolid(tx, ty) && attempts < 10);
        if (isSolid(tx, ty)) continue;
        const trap = pickTrap(rng, floorPlan.depth);
        if (trap.type === 'pit' && !isPitTrapLandingViable(worldSeed, floorPlan, tx, ty)) continue;
        spawns.push({ x: tx, y: ty, kind: 'trap', params: trap });
      }
    }

    // Chest: uncommon per-room payoff. Most loot should be visible floor items;
    // frequent chests flatten the excitement of finding one.
    // Never place on top of a decoration, sarcophagus, tombstone, spawner, or any other solid feature.
    if (!roomHasWeaponRack && rng.next() < ROOM_CHEST_CHANCE) {
      let chx, chy, chAttempts = 0;
      do {
        chx = room.x + 1 + rng.int(0, Math.max(0, room.w - 3));
        chy = room.y + 1 + rng.int(0, Math.max(0, room.h - 3));
        chAttempts++;
      } while (isSolid(chx, chy) && chAttempts < 10);
      if (!isSolid(chx, chy)) {
        markSolid(chx, chy);
        const d = floorPlan.depth;
        const tableId = pickChestLootTable(d, rng);
        spawns.push({ x: chx, y: chy, kind: 'chest', params: { lootTable: tableId, depth: d } });
      }
    }

    // Rare room mimic: very low chance per non-entry room to keep wild mimics uncommon.
    // as a common dungeon decoration. Placed after monsters/chests to avoid blocking them.
    if (!isEntryRoom && rng.next() < ROOM_MIMIC_CHANCE) {
      let mx = room.x + 1 + rng.int(0, Math.max(0, room.w - 3));
      let my = room.y + 1 + rng.int(0, Math.max(0, room.h - 3));
      let attempts = 0;
      while (isSolid(mx, my) && attempts < 8) {
        mx = room.x + 1 + rng.int(0, Math.max(0, room.w - 3));
        my = room.y + 1 + rng.int(0, Math.max(0, room.h - 3));
        attempts++;
      }
      if (!isSolid(mx, my)) {
        const disguise = pickMimicDisguiseIdentity(rng);
        spawns.push({
          x: mx, y: my,
          kind: 'mimic',
          params: { depth: floorPlan.depth, disguiseIdentity: disguise },
        });
        markSolid(mx, my);
      }
    }

    // Hazard tile patches — paint ice / shallow water / lava near room center
    if (!isEntryRoom && room.w >= 4 && room.h >= 4) {
      const depth = floorPlan.depth;
      const bias = floorPlan.profile?.hazardBias ?? null;
      let patchTile = 0;
      if (bias === 'water') {
        if (rng.next() < 0.20) patchTile = TILE_SHALLOW_WATER;
      } else if (bias === 'lava') {
        if (rng.next() < 0.15) patchTile = TILE_LAVA;
      } else if (bias === 'ice') {
        if (rng.next() < 0.15) patchTile = TILE_ICE;
      } else {
        patchTile =
          depth >= 12 && rng.next() < 0.05 ? TILE_LAVA :
          depth >= 8  && rng.next() < 0.08 ? TILE_SHALLOW_WATER :
          depth >= 3  && rng.next() < 0.08 ? TILE_ICE :
          0;
      }
      if (patchTile) {
        const pcx = room.x + Math.floor(room.w / 2);
        const pcy = room.y + Math.floor(room.h / 2);
        const painted = [];
        // Diamond/cross pattern: center + cardinal neighbors (3-5 tiles)
        const offsets = [[0,0], [-1,0], [1,0], [0,-1], [0,1]];
        for (const [ox, oy] of offsets) {
          const px = pcx + ox;
          const py = pcy + oy;
          if (px >= room.x && px < room.x + room.w &&
              py >= room.y && py < room.y + room.h) {
            painted.push({ x: px, y: py, tile: patchTile });
          }
        }
        if (painted.length > 0) {
          spawns.push({ x: 0, y: 0, kind: 'tile_paint', params: { tiles: painted } });
        }
      }
    }
  }

  // Hallway monsters: lone wanderers in corridors (floor tiles outside any room).
  // ~8% of corridor tiles are candidates; place 1-3 per chunk.
  {
    const ox = chunk.chunkX * CHUNK_SIZE;
    const oy = chunk.chunkY * CHUNK_SIZE;
    const corridorCandidates = [];
    for (let ly = 1; ly < CHUNK_SIZE - 1; ly++) {
      for (let lx = 1; lx < CHUNK_SIZE - 1; lx++) {
        const t = chunk.tiles[ly * CHUNK_SIZE + lx];
        if (t !== TILE_FLOOR) continue;
        const wx = ox + lx;
        const wy = oy + ly;
        if (isSolid(wx, wy)) continue;
        // Skip tiles inside any room
        let inRoom = false;
        for (const room of chunk.rooms) {
          if (wx >= room.x && wx < room.x + room.w && wy >= room.y && wy < room.y + room.h) {
            inRoom = true;
            break;
          }
        }
        if (!inRoom) corridorCandidates.push({ x: wx, y: wy });
      }
    }
    const hallwayCap = floorPlan.profile?.hallwayMonsterCap ?? 3;
    const hallwayBudget = Math.min(hallwayCap, Math.floor(corridorCandidates.length * 0.08));
    for (let i = 0; i < hallwayBudget && corridorCandidates.length > 0; i++) {
      const idx = rng.int(0, corridorCandidates.length - 1);
      const pos = corridorCandidates.splice(idx, 1)[0];
      const mp = pickSentinelMonster(rng, floorPlan.depth, floorPlan.profile?.monsterFilter ?? null);
      if (mp.identity === 'centipede') {
        const segCount = rng.int(4, 7);
        spawns.push({ x: pos.x, y: pos.y, kind: 'centipede', params: { ...mp, segmentCount: segCount } });
      } else {
        spawns.push({ x: pos.x, y: pos.y, kind: 'monster', params: mp });
      }
    }

    // Grotto trap scatter: noise-generated floors have tiny synthetic rooms, so
    // the per-room trap logic barely places any. Scatter traps across the open
    // cave floor using leftover corridor candidates.
    if (floorPlan.profile?.generator && corridorCandidates.length > 0) {
      const trapScatterBudget = Math.floor(corridorCandidates.length * 0.012);
      for (let i = 0; i < trapScatterBudget && corridorCandidates.length > 0; i++) {
        const idx = rng.int(0, corridorCandidates.length - 1);
        const pos = corridorCandidates.splice(idx, 1)[0];
        const trap = pickTrap(rng, floorPlan.depth);
        if (trap.type === 'pit' && !isPitTrapLandingViable(worldSeed, floorPlan, pos.x, pos.y)) continue;
        spawns.push({ x: pos.x, y: pos.y, kind: 'trap', params: trap });
      }
    }
  }

  // Depth 1 guaranteed content: skeleton archer, a rare monster,
  // and two mixed vermin/humanoid nests to preserve rat fodder and variety.
  // Only inject into the origin chunk so they appear once per floor.
  if (floorPlan.depth === 1 && chunk.chunkX === 0 && chunk.chunkY === 0) {
    const nonEntryRooms = chunk.rooms.filter((r) => (
      r !== entryRoom
      && !roomHasSpawnKind(spawns, r, SACRED_FEATURE_KINDS)
    ));
    if (nonEntryRooms.length >= 1) {
      let roomIdx = 0;
      const nextRoom = () => nonEntryRooms[roomIdx++ % nonEntryRooms.length];

      // Guaranteed skeleton archer
      const archerRoom = nextRoom();
      const ax = archerRoom.x + 1 + rng.int(0, Math.max(0, archerRoom.w - 3));
      const ay = archerRoom.y + 1 + rng.int(0, Math.max(0, archerRoom.h - 3));
      const archerParams = pickSpecificMonster('skeleton_archer', 1);
      if (archerParams) spawns.push({ x: ax, y: ay, kind: 'monster', params: archerParams });

      // Guaranteed rare monster (pit viper)
      const rareRoom = nextRoom();
      const rx = rareRoom.x + 1 + rng.int(0, Math.max(0, rareRoom.w - 3));
      const ry = rareRoom.y + 1 + rng.int(0, Math.max(0, rareRoom.h - 3));
      const rareParams = pickSpecificMonster('pit_viper', 1);
      if (rareParams) spawns.push({ x: rx, y: ry, kind: 'monster', params: rareParams });

      // Guaranteed mixed spawners (2 nests, preserving rat fodder and adding variety)
      const verminIds = ['rat', 'cave_spider', 'goblin'];
      for (let i = 0; i < 2; i++) {
        const vRoom = nextRoom();
        let vx, vy, vAttempts = 0;
        do {
          vx = vRoom.x + 1 + rng.int(0, Math.max(0, vRoom.w - 3));
          vy = vRoom.y + 1 + rng.int(0, Math.max(0, vRoom.h - 3));
          vAttempts++;
        } while (isSolid(vx, vy) && vAttempts < 10);
        const verminId = rng.choice(verminIds);
        const sp = pickSpecificSpawner(rng, verminId, 1);
        if (sp && !isSolid(vx, vy)) {
          markSolid(vx, vy);
          spawns.push({ x: vx, y: vy, kind: 'spawner', params: sp });
          // Scatter webs if this is a spider spawner
          if (verminId === 'cave_spider') {
            for (let wy = vRoom.y + 1; wy < vRoom.y + vRoom.h - 1; wy++) {
              for (let wx = vRoom.x + 1; wx < vRoom.x + vRoom.w - 1; wx++) {
                if (rng.next() < 0.30 && !isSolid(wx, wy)) {
                  spawns.push({ x: wx, y: wy, kind: 'web', params: {} });
                }
              }
            }
          }
        }
      }
    }
  }

  // Shopkeeper: one per chunk, only in small dead-end rooms (exactly one perimeter entrance), ~30% chance.
  // Extra rule: never use the origin chunk's spawn room (rooms[0] in chunk 0,0).
  const shopChance = floorPlan.profile?.shopChance ?? 0.30;
  let shopRoom = null;
  if (eligibleShopRooms.length > 0 && rng.next() < shopChance) {
    shopRoom = eligibleShopRooms[rng.int(0, eligibleShopRooms.length - 1)];
  }
  if (shopRoom) {
    const room = shopRoom;

    // Pick a shop archetype: general, book, jewelry, potion
    const SHOP_ARCHETYPES = ["general", "book", "jewelry", "potion"];
    const shopType = SHOP_ARCHETYPES[rng.int(0, SHOP_ARCHETYPES.length - 1)];

    // Shop rooms are curated spaces. Strip all pre-existing room content
    // (monsters, traps, room features, random loot, etc.) before laying out
    // canonical shop content so dead-end shops never inherit shrine/fountain/sarc clutter.
    removeRoomSpawns(spawns, room, () => true);

    const minX = room.x + 1;
    const maxX = room.x + Math.max(1, room.w - 2);
    const minY = room.y + 1;
    const maxY = room.y + Math.max(1, room.h - 2);
    const shopTiles = [];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        shopTiles.push({ x, y });
      }
    }

    for (let i = shopTiles.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      const tmp = shopTiles[i];
      shopTiles[i] = shopTiles[j];
      shopTiles[j] = tmp;
    }
    const takeShopTile = () => shopTiles.pop() || null;

    const shopkeeperTile = takeShopTile();
    if (!shopkeeperTile) {
      return spawns;
    }
    const sx = shopkeeperTile.x;
    const sy = shopkeeperTile.y;

    spawns.push({
      x: sx,
      y: sy,
      kind: 'shopkeeper',
      params: {
        depth: floorPlan.depth,
        room: { x: room.x, y: room.y, w: room.w, h: room.h },
        shopType,
      }
    });

    // Rare trap-chest in shops: looks like a chest until touched.
    if (rng.next() < SHOP_MIMIC_CHANCE) {
      const mimicTile = takeShopTile();
      if (mimicTile) {
        spawns.push({
          x: mimicTile.x,
          y: mimicTile.y,
          kind: 'mimic',
          params: {
            depth: floorPlan.depth,
            disguiseIdentity: pickMimicDisguiseIdentity(rng, { preferPremium: true }),
          },
        });
      }
    }

    // Scatter shop items on the floor throughout the room
    const SHOP_ITEM_COUNTS = { general: [5, 12], book: [4, 8], jewelry: [4, 8], potion: [5, 10] };
    const [minItems, maxItems] = SHOP_ITEM_COUNTS[shopType] || [5, 12];
    const requestedItemCount = rng.int(minItems, maxItems);
    const itemCount = Math.min(requestedItemCount, shopTiles.length);
    for (let i = 0; i < itemCount; i++) {
      const tile = takeShopTile();
      if (!tile) break;
      spawns.push({
        x: tile.x,
        y: tile.y,
        kind: 'shop_item',
        params: { depth: floorPlan.depth, shopType }
      });
    }
  }

  for (const room of eligibleDeadEndRooms) {
    if (shopRoom && room.x === shopRoom.x && room.y === shopRoom.y && room.w === shopRoom.w && room.h === shopRoom.h) {
      continue;
    }
    if (rng.next() >= DEAD_END_CONTENT_CHANCE) continue;

    const theme = pickDeadEndTheme(rng);
    applyDeadEndTheme({
      room,
      rng,
      spawns,
      floorPlan,
      chunk,
      isSolid,
      markSolid,
      theme,
      worldSeed,
      featureCounts,
    });
  }

  // Tombstone spawning: retrieve tombstones for this depth
  if (tombstoneRepo && chunk.rooms.length > 0) {
    // Get random tombstones for this depth (1-3 per chunk, based on availability)
    const tombstoneCount = Math.min(3, chunk.rooms.length);
    const tombstones = tombstoneRepo.getRandomForDepth(
      floorPlan.depth,
      tombstoneCount,
      rng
    );

    // Place tombstones in random rooms, avoiding solid features.
    for (const tombstoneData of tombstones) {
      const roomIdx = Math.floor(rng.next() * chunk.rooms.length);
      const room = chunk.rooms[roomIdx];
      if (!room) continue;
      const rngAny = /** @type {any} */ (rng);
      let tx, ty, tAttempts = 0;
      do {
        tx = room.x + 1 + rngAny.int(0, Math.max(0, room.w - 3));
        ty = room.y + 1 + rngAny.int(0, Math.max(0, room.h - 3));
        tAttempts++;
      } while (isSolid(tx, ty) && tAttempts < 10);
      if (!isSolid(tx, ty)) {
        markSolid(tx, ty);
        spawns.push({ x: tx, y: ty, kind: 'tombstone', params: tombstoneData });
      }
    }
  }

  if (authoredContent) {
    const occupied = new Set([...solidPositions]);
    for (const spawn of spawns) occupied.add(`${spawn.x | 0},${spawn.y | 0}`);
    const openTiles = [];
    const roomBuckets = [];
    for (const room of chunk.rooms) {
      const bucket = [];
      for (let y = room.y + 1; y < room.y + Math.max(1, room.h - 1); y++) {
        for (let x = room.x + 1; x < room.x + Math.max(1, room.w - 1); x++) {
          const lx = x - chunk.chunkX * CHUNK_SIZE;
          const ly = y - chunk.chunkY * CHUNK_SIZE;
          if (!isInBoundsLocal(lx, ly)) continue;
          if (chunk.tiles[ly * CHUNK_SIZE + lx] !== TILE_FLOOR) continue;
          if (occupied.has(`${x},${y}`)) continue;
          const pos = { x, y };
          openTiles.push(pos);
          bucket.push(pos);
        }
      }
      if (bucket.length > 0) roomBuckets.push(bucket);
    }
    for (let i = openTiles.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      const tmp = openTiles[i];
      openTiles[i] = openTiles[j];
      openTiles[j] = tmp;
    }
    for (const bucket of roomBuckets) {
      for (let i = bucket.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        const tmp = bucket[i];
        bucket[i] = bucket[j];
        bucket[j] = tmp;
      }
    }
    for (let i = roomBuckets.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      const tmp = roomBuckets[i];
      roomBuckets[i] = roomBuckets[j];
      roomBuckets[j] = tmp;
    }
    let roomCursor = 0;
    const takeTile = () => {
      for (let attempts = 0; attempts < roomBuckets.length; attempts++) {
        const bucket = roomBuckets[roomCursor % roomBuckets.length];
        roomCursor++;
        while (bucket.length > 0) {
          const pos = bucket.pop();
          const key = `${pos.x},${pos.y}`;
          if (occupied.has(key)) continue;
          occupied.add(key);
          return pos;
        }
      }
      while (openTiles.length > 0) {
        const pos = openTiles.pop();
        const key = `${pos.x},${pos.y}`;
        if (occupied.has(key)) continue;
        occupied.add(key);
        return pos;
      }
      return null;
    };
    const addAt = (kind, params = {}) => {
      const pos = takeTile();
      if (!pos) return;
      spawns.push({ x: pos.x, y: pos.y, kind, params });
    };

    for (const entry of authoredContent.monsters || []) {
      const budget = authoredBudgetEntry(entry);
      if (!budget || budget.pool.length === 0) continue;
      const target = budget.count;
      const matches = authoredPoolFilter(budget.pool);
      const existing = spawns.filter((spawn) => spawn.kind === "monster" && matches(getMonster(String(spawn?.params?.identity || spawn?.params?.monsterId || "")))).length;
      for (let i = existing; i < target; i++) {
        const params = pickAuthoredMonster(rng, floorPlan.depth, budget.pool);
        if (params) addAt("monster", params);
      }
    }
    for (const entry of authoredContent.spawners || []) {
      const budget = authoredBudgetEntry(entry);
      if (!budget || budget.pool.length === 0) continue;
      const target = budget.count;
      for (let i = 0; i < target; i++) {
        const params = pickAuthoredSpawner(rng, floorPlan.depth, budget.pool);
        if (params) addAt("spawner", params);
      }
    }
    for (const feature of authoredContent.features || []) {
      addAt(String(feature || ""));
    }
    for (const npc of authoredContent.npcs || []) {
      const townfolkId = String(npc?.townfolkId || "");
      const count = Math.max(0, Number(npc?.count || 0) | 0);
      for (let i = 0; i < count; i++) {
        addAt("townfolk", { townfolkId, scheduleEnabled: false });
      }
    }
    for (const trap of authoredContent.traps || []) {
      addAt("trap", trap);
    }
    for (const chest of authoredContent.chests || []) {
      addAt("chest", { ...chest, depth: floorPlan.depth });
    }
    for (const bookId of authoredContent.books || []) {
      addAt("book", { bookId });
    }
  }

  // Decorative book spawning: ~15% chance per chunk, at most one per chunk
  if (chunk.rooms.length > 0 && rng.next() < 0.15) {
    const room = chunk.rooms[rng.int(0, chunk.rooms.length - 1)];
    const bx = room.x + 1 + rng.int(0, Math.max(0, room.w - 3));
    const by = room.y + 1 + rng.int(0, Math.max(0, room.h - 3));
    const book = pickDungeonBook(rng);
    if (!isSolid(bx, by)) {
      spawns.push({ x: bx, y: by, kind: 'book', params: { bookId: book.id } });
    }
  }

  return spawns;
}

/**
 * Count contiguous perimeter openings from a room into passable non-room space.
 * This models "entrances" (dead-end detection), not literal door tiles.
 * @param {{x:number,y:number,w:number,h:number}} room
 * @param {{chunkX:number,chunkY:number,tiles:Uint8Array}} chunk
 * @returns {number}
 */
function countRoomEntrances(room, chunk) {
  const ox = chunk.chunkX * CHUNK_SIZE;
  const oy = chunk.chunkY * CHUNK_SIZE;
  const rx = room.x - ox;
  const ry = room.y - oy;
  const rw = room.w;
  const rh = room.h;
  const tiles = chunk.tiles;

  function getTile(x, y) {
    if (x < 0 || y < 0 || x >= CHUNK_SIZE || y >= CHUNK_SIZE) return -1;
    return tiles[y * CHUNK_SIZE + x];
  }

  function isPassable(tile) {
    return tile === TILE_FLOOR || tile === TILE_DOOR || tile === TILE_STAIR_DOWN || tile === TILE_STAIR_UP;
  }

  let entrances = 0;

  // West openings: outside cells at (rx-1, ry..ry+rh-1)
  {
    let prevOpen = false;
    for (let y = ry; y < ry + rh; y++) {
      const open = isPassable(getTile(rx - 1, y));
      if (open && !prevOpen) entrances++;
      prevOpen = open;
    }
  }
  // East openings: outside cells at (rx+rw, ry..ry+rh-1)
  {
    let prevOpen = false;
    for (let y = ry; y < ry + rh; y++) {
      const open = isPassable(getTile(rx + rw, y));
      if (open && !prevOpen) entrances++;
      prevOpen = open;
    }
  }
  // North openings: outside cells at (rx..rx+rw-1, ry-1)
  {
    let prevOpen = false;
    for (let x = rx; x < rx + rw; x++) {
      const open = isPassable(getTile(x, ry - 1));
      if (open && !prevOpen) entrances++;
      prevOpen = open;
    }
  }
  // South openings: outside cells at (rx..rx+rw-1, ry+rh)
  {
    let prevOpen = false;
    for (let x = rx; x < rx + rw; x++) {
      const open = isPassable(getTile(x, ry + rh));
      if (open && !prevOpen) entrances++;
      prevOpen = open;
    }
  }
  return entrances;
}

/**
 * Count perimeter floor tiles in a room that open directly into passable non-room space.
 * Shops require exactly one opening tile to guarantee a true single-entry dead end.
 * @param {{x:number,y:number,w:number,h:number}} room
 * @param {{chunkX:number,chunkY:number,tiles:Uint8Array}} chunk
 * @returns {number}
 */
function countRoomOpeningTiles(room, chunk) {
  const ox = chunk.chunkX * CHUNK_SIZE;
  const oy = chunk.chunkY * CHUNK_SIZE;
  const rx = room.x - ox;
  const ry = room.y - oy;
  const rw = room.w;
  const rh = room.h;
  const tiles = chunk.tiles;

  function getTile(x, y) {
    if (x < 0 || y < 0 || x >= CHUNK_SIZE || y >= CHUNK_SIZE) return -1;
    return tiles[y * CHUNK_SIZE + x];
  }

  function isPassable(tile) {
    return tile === TILE_FLOOR || tile === TILE_DOOR || tile === TILE_STAIR_DOWN || tile === TILE_STAIR_UP;
  }

  function roomHas(x, y) {
    return x >= rx && x < rx + rw && y >= ry && y < ry + rh;
  }

  let openings = 0;
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const isPerimeter = (x === rx || x === rx + rw - 1 || y === ry || y === ry + rh - 1);
      if (!isPerimeter) continue;
      if (!isPassable(getTile(x, y))) continue;

      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];

      let opensOut = false;
      for (const [nx, ny] of neighbors) {
        if (roomHas(nx, ny)) continue;
        if (isPassable(getTile(nx, ny))) {
          opensOut = true;
          break;
        }
      }
      if (opensOut) openings++;
    }
  }

  return openings;
}

function roomContainsStairTile(room, chunk) {
  const ox = chunk.chunkX * CHUNK_SIZE;
  const oy = chunk.chunkY * CHUNK_SIZE;
  const rx = room.x - ox;
  const ry = room.y - oy;
  const rw = room.w;
  const rh = room.h;

  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const tile = chunk.tiles[(ry + y) * CHUNK_SIZE + (rx + x)];
      if (tile === TILE_STAIR_DOWN || tile === TILE_STAIR_UP) return true;
    }
  }
  return false;
}

function roomContainsStairUpTile(room, chunk) {
  const ox = chunk.chunkX * CHUNK_SIZE;
  const oy = chunk.chunkY * CHUNK_SIZE;
  const rx = room.x - ox;
  const ry = room.y - oy;

  for (let y = 0; y < room.h; y++) {
    for (let x = 0; x < room.w; x++) {
      if (chunk.tiles[(ry + y) * CHUNK_SIZE + (rx + x)] === TILE_STAIR_UP) return true;
    }
  }
  return false;
}

function isPointInRoom(x, y, room) {
  return x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
}

function isSameRoom(a, b) {
  return !!a && !!b
    && a.x === b.x
    && a.y === b.y
    && a.w === b.w
    && a.h === b.h;
}

/** Pick chest loot table using depth + RNG roll (shared by room and dead-end themes). */
function pickChestLootTable(depth, rng) {
  const cr = rng.next();
  return (depth >= 14 || cr < 0.02) ? 'chest:legendary'
       : (depth >= 10 || cr < 0.08) ? 'chest:epic'
       : (depth >= 8  || cr < 0.15) ? 'chest:magic'
       : 'chest:basic';
}

function removeRoomSpawns(spawns, room, predicate) {
  for (let i = spawns.length - 1; i >= 0; i--) {
    const spawn = spawns[i];
    if (!isPointInRoom(spawn.x, spawn.y, room)) continue;
    if (predicate(spawn)) spawns.splice(i, 1);
  }
}

function roomHasSpawnKind(spawns, room, kinds) {
  const kindSet = kinds instanceof Set ? kinds : new Set(kinds || []);
  if (kindSet.size <= 0) return false;
  for (let i = 0; i < spawns.length; i++) {
    const s = spawns[i];
    if (!isPointInRoom(s.x, s.y, room)) continue;
    if (kindSet.has(String(s.kind || ''))) return true;
  }
  return false;
}

function pickRoomInteriorSpot(room, rng, isBlocked, reserved = new Set(), tries = 16) {
  if (room.w <= 2 || room.h <= 2) return null;
  for (let attempt = 0; attempt < tries; attempt++) {
    const x = room.x + 1 + rng.int(0, Math.max(0, room.w - 3));
    const y = room.y + 1 + rng.int(0, Math.max(0, room.h - 3));
    const key = `${x},${y}`;
    if (reserved.has(key)) continue;
    if (isBlocked(x, y)) continue;
    reserved.add(key);
    return { x, y };
  }

  const fallbackX = room.x + Math.floor(room.w / 2);
  const fallbackY = room.y + Math.floor(room.h / 2);
  const fallbackKey = `${fallbackX},${fallbackY}`;
  if (!reserved.has(fallbackKey) && !isBlocked(fallbackX, fallbackY)) {
    reserved.add(fallbackKey);
    return { x: fallbackX, y: fallbackY };
  }
  return null;
}

/**
 * Find a corridor tile adjacent to a room that could be used to place
 * a blocking feature like a portcullis. Returns the FURTHEST exit by
 * distance from room center. Returns world coords {x, y} or null.
 */
function findRoomExitCorridor(room, chunk) {
  const ox = chunk.chunkX * CHUNK_SIZE;
  const oy = chunk.chunkY * CHUNK_SIZE;
  const rx = room.x - ox;
  const ry = room.y - oy;
  const rw = room.w;
  const rh = room.h;
  const tiles = chunk.tiles;

  function getTile(x, y) {
    if (x < 0 || y < 0 || x >= CHUNK_SIZE || y >= CHUNK_SIZE) return -1;
    return tiles[y * CHUNK_SIZE + x];
  }

  function isPassable(tile) {
    return tile === TILE_FLOOR || tile === TILE_DOOR;
  }

  // Find all exits and retain the direction away from the room. A gate belongs
  // in the approach corridor, not on top of an existing door entity.
  const exits = [];

  // Check west exit
  for (let y = ry; y < ry + rh; y++) {
    if (isPassable(getTile(rx - 1, y))) {
      exits.push({ x: ox + rx - 1, y: oy + y, dx: -1, dy: 0 });
    }
  }

  // Check east exit
  for (let y = ry; y < ry + rh; y++) {
    if (isPassable(getTile(rx + rw, y))) {
      exits.push({ x: ox + rx + rw, y: oy + y, dx: 1, dy: 0 });
    }
  }

  // Check north exit
  for (let x = rx; x < rx + rw; x++) {
    if (isPassable(getTile(x, ry - 1))) {
      exits.push({ x: ox + x, y: oy + ry - 1, dx: 0, dy: -1 });
    }
  }

  // Check south exit
  for (let x = rx; x < rx + rw; x++) {
    if (isPassable(getTile(x, ry + rh))) {
      exits.push({ x: ox + x, y: oy + ry + rh, dx: 0, dy: 1 });
    }
  }

  if (exits.length === 0) return null;

  const exit = exits[Math.floor(exits.length / 2)];
  const localX = exit.x - ox;
  const localY = exit.y - oy;
  if (getTile(localX, localY) === TILE_DOOR) {
    const beyondX = localX + exit.dx;
    const beyondY = localY + exit.dy;
    if (getTile(beyondX, beyondY) === TILE_FLOOR) {
      return { x: ox + beyondX, y: oy + beyondY, dx: exit.dx, dy: exit.dy };
    }
  }
  return exit;
}

function pickValveSpot(room, exit, isSolid) {
  if (!exit) return null;
  const wallX = exit.dx < 0 ? room.x : room.x + room.w - 1;
  const wallY = exit.dy < 0 ? room.y : room.y + room.h - 1;
  const candidates = exit.dx !== 0
    ? [
      { x: wallX, y: exit.y - 1 },
      { x: wallX, y: exit.y + 1 },
    ]
    : [
      { x: exit.x - 1, y: wallY },
      { x: exit.x + 1, y: wallY },
    ];
  return candidates.find((pos) => (
    pos.x >= room.x && pos.x < room.x + room.w
    && pos.y >= room.y && pos.y < room.y + room.h
    && !isSolid(pos.x, pos.y)
  )) || null;
}

function applyDeadEndTheme(ctx) {
  const { room, rng, spawns, floorPlan, chunk, isSolid, markSolid, theme, worldSeed = 0, featureCounts } = ctx;
  const reserved = new Set();
  const addDecor = (kind, solid = false, params = {}) => {
    const pos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
    if (!pos) return null;
    if (solid) markSolid(pos.x, pos.y);
    spawns.push({ x: pos.x, y: pos.y, kind, params });
    return pos;
  };
  const lightKinds = new Set(['torch', 'candle_cluster', 'ember_brazier', 'glowcap_patch', 'cooking_fire']);

  switch (theme) {
    case 'treasure': {
      const chestPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (chestPos) {
        markSolid(chestPos.x, chestPos.y);
        spawns.push({
          x: chestPos.x,
          y: chestPos.y,
          kind: 'chest',
          params: { depth: floorPlan.depth, lootTable: pickChestLootTable(floorPlan.depth, rng) },
        });
      }
      const goldPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (goldPos) {
        spawns.push({
          x: goldPos.x,
          y: goldPos.y,
          kind: 'gold',
          params: { count: rng.int(12, 36) + floorPlan.depth * 3 },
        });
      }
      break;
    }
    case 'trapped_treasure': {
      const chestPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (chestPos) {
        markSolid(chestPos.x, chestPos.y);
        spawns.push({
          x: chestPos.x,
          y: chestPos.y,
          kind: 'chest',
          params: { depth: floorPlan.depth, lootTable: pickChestLootTable(floorPlan.depth, rng) },
        });
      }
      const trapPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (trapPos) {
        const trap = pickTrap(rng, floorPlan.depth);
        if (trap.type !== 'pit' || isPitTrapLandingViable(worldSeed, floorPlan, trapPos.x, trapPos.y)) {
          spawns.push({ x: trapPos.x, y: trapPos.y, kind: 'trap', params: trap });
        }
      }
      break;
    }
    case 'sanctuary': {
      removeRoomSpawns(spawns, room, (spawn) => spawn.kind === 'monster' || spawn.kind === 'spawner' || spawn.kind === 'trap');
      let featureRoll = rng.next();
      let sanctuaryKind = featureRoll < 0.34 ? 'fountain' : (featureRoll < 0.67 ? 'shrine' : 'altar');

      // Cap shrine and altar to 1 each per floor
      if (sanctuaryKind === 'shrine' && featureCounts.shrine > 0) {
        sanctuaryKind = 'fountain';
      } else if (sanctuaryKind === 'altar' && featureCounts.altar > 0) {
        sanctuaryKind = 'fountain';
      }

      const featurePos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (featurePos) {
        markSolid(featurePos.x, featurePos.y);
        spawns.push({ x: featurePos.x, y: featurePos.y, kind: sanctuaryKind, params: { depth: floorPlan.depth } });
        if (sanctuaryKind === 'shrine') featureCounts.shrine++;
        if (sanctuaryKind === 'altar') featureCounts.altar++;
      }
      const itemPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (itemPos) {
        const item = pickItem(rng, floorPlan.depth);
        spawns.push({ x: itemPos.x, y: itemPos.y, kind: item.kind, params: item });
      }
      addDecor('candle_cluster');
      break;
    }
    case 'lore_nook': {
      const statuePos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (statuePos) {
        markSolid(statuePos.x, statuePos.y);
        spawns.push({ x: statuePos.x, y: statuePos.y, kind: rng.next() < 0.5 ? 'statue' : 'urn', params: { depth: floorPlan.depth } });
      }
      const bookPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (bookPos) {
        const book = pickDungeonBook(rng);
        spawns.push({ x: bookPos.x, y: bookPos.y, kind: 'book', params: { bookId: book.id } });
      }
      addDecor('candle_cluster');
      break;
    }
    case 'lair': {
      const chestPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (chestPos) {
        markSolid(chestPos.x, chestPos.y);
        spawns.push({
          x: chestPos.x,
          y: chestPos.y,
          kind: 'chest',
          params: { depth: floorPlan.depth, lootTable: pickChestLootTable(floorPlan.depth, rng) },
        });
      }
      const monsterPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (monsterPos) {
        const gmp = pickMonster(rng, floorPlan.depth, floorPlan.profile?.monsterFilter ?? null);
        if (gmp.identity === 'centipede') {
          const segCount = rng.int(4, 7);
          spawns.push({ x: monsterPos.x, y: monsterPos.y, kind: 'centipede', params: { ...gmp, segmentCount: segCount } });
        } else {
          spawns.push({ x: monsterPos.x, y: monsterPos.y, kind: 'monster', params: gmp });
        }
      }
      break;
    }
    case 'alchemist_den': {
      removeRoomSpawns(spawns, room, (s) => s.kind === 'monster' || s.kind === 'spawner');
      const benchPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (benchPos) {
        markSolid(benchPos.x, benchPos.y);
        spawns.push({ x: benchPos.x, y: benchPos.y, kind: 'alchemy_bench', params: { depth: floorPlan.depth } });
      }
      const potionPool = [
        'potion_vigor', 'potion_mana', 'potion_endurance', 'potion_stoneskin',
        'potion_resist_fire', 'potion_resist_poison',
        'potion_sickness', 'potion_confusion', 'potion_paralysis',
        'potion_weakness', 'potion_hallucination', 'potion_blindness',
      ];
      const potionCount = rng.int(3, 4);
      for (let i = 0; i < potionCount; i++) {
        const pos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
        if (pos) {
          spawns.push({ x: pos.x, y: pos.y, kind: 'catalog_item', params: { itemId: rng.choice(potionPool) } });
        }
      }
      addDecor('glowcap_patch');
      const trapPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (trapPos) {
        const trap = pickTrap(rng, floorPlan.depth);
        if (trap.type !== 'pit' || isPitTrapLandingViable(worldSeed, floorPlan, trapPos.x, trapPos.y)) {
          spawns.push({ x: trapPos.x, y: trapPos.y, kind: 'trap', params: trap });
        }
      }
      break;
    }
    case 'crypt': {
      const sarcPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (sarcPos) {
        markSolid(sarcPos.x, sarcPos.y);
        spawns.push({ x: sarcPos.x, y: sarcPos.y, kind: 'sarcophagus', params: { depth: floorPlan.depth } });
      }
      const urnCount = rng.int(1, 2);
      for (let i = 0; i < urnCount; i++) {
        const pos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
        if (pos) {
          markSolid(pos.x, pos.y);
          spawns.push({ x: pos.x, y: pos.y, kind: 'urn', params: { depth: floorPlan.depth } });
        }
      }
      // Mirror-image pillars
      const p1 = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (p1) {
        markSolid(p1.x, p1.y);
        spawns.push({ x: p1.x, y: p1.y, kind: 'pillar', params: { depth: floorPlan.depth } });
        const cx = room.x + Math.floor(room.w / 2);
        const mirrorX = cx + (cx - p1.x);
        const mirrorKey = `${mirrorX},${p1.y}`;
        if (mirrorX > room.x && mirrorX < room.x + room.w - 1 && !isSolid(mirrorX, p1.y) && !reserved.has(mirrorKey)) {
          reserved.add(mirrorKey);
          markSolid(mirrorX, p1.y);
          spawns.push({ x: mirrorX, y: p1.y, kind: 'pillar', params: { depth: floorPlan.depth } });
        }
      }
      // Undead guardian
      const monsterPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (monsterPos) {
        const undeadId = floorPlan.depth >= 12 ? 'wraith' : 'wight';
        let gmp = pickSpecificMonster(undeadId, floorPlan.depth);
        if (!gmp) gmp = pickMonster(rng, floorPlan.depth, floorPlan.profile?.monsterFilter ?? null);
        if (gmp) spawns.push({ x: monsterPos.x, y: monsterPos.y, kind: 'monster', params: gmp });
      }
      addDecor('candle_cluster');
      addDecor('ember_brazier');
      break;
    }
    case 'armory': {
      const rackPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (rackPos) {
        markSolid(rackPos.x, rackPos.y);
        spawns.push({ x: rackPos.x, y: rackPos.y, kind: 'weapon_rack', params: { depth: floorPlan.depth } });
      }
      addDecor('armor_stand', true);
      const equipCount = rng.int(1, 2);
      for (let i = 0; i < equipCount; i++) {
        const pos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
        if (pos) {
          const item = pickItem(rng, floorPlan.depth);
          spawns.push({ x: pos.x, y: pos.y, kind: item.kind, params: item });
        }
      }
      const trapPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (trapPos) {
        const trap = pickTrap(rng, floorPlan.depth);
        if (trap.type !== 'pit' || isPitTrapLandingViable(worldSeed, floorPlan, trapPos.x, trapPos.y)) {
          spawns.push({ x: trapPos.x, y: trapPos.y, kind: 'trap', params: trap });
        }
      }
      addDecor('ember_brazier');
      break;
    }
    case 'dragon_hoard': {
      // Dragon hoards should have one explicit guardian and treasure payload.
      // Remove any room-populated hostiles so the lair doesn't double-stack monsters.
      removeRoomSpawns(
        spawns,
        room,
        (spawn) => (
          spawn.kind === 'monster'
          || spawn.kind === 'centipede'
          || spawn.kind === 'spawner'
          || spawn.kind === 'mimic'
        ),
      );
      const monsterPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (monsterPos) {
        let gmp = pickSpecificMonster('dragon_whelp', floorPlan.depth);
        if (!gmp) gmp = pickMonster(rng, floorPlan.depth, floorPlan.profile?.monsterFilter ?? null);
        if (gmp) spawns.push({ x: monsterPos.x, y: monsterPos.y, kind: 'monster', params: gmp });
      }
      const goldCount = rng.int(4, 6);
      for (let i = 0; i < goldCount; i++) {
        const pos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
        if (pos) {
          spawns.push({ x: pos.x, y: pos.y, kind: 'gold', params: { count: rng.int(20, 50) + floorPlan.depth * 5 } });
        }
      }
      const chestPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (chestPos) {
        markSolid(chestPos.x, chestPos.y);
        spawns.push({
          x: chestPos.x, y: chestPos.y, kind: 'chest',
          params: { depth: floorPlan.depth, lootTable: pickChestLootTable(floorPlan.depth, rng) },
        });
      }
      break;
    }
    case 'obliiette': {
      if (roomContainsStairTile(room, chunk)) break;
      // Bleak prison-cell dead-end: one centerpiece body with chained clutter.
      removeRoomSpawns(
        spawns,
        room,
        (spawn) => (
          spawn.kind === 'monster'
          || spawn.kind === 'centipede'
          || spawn.kind === 'spawner'
          || spawn.kind === 'shopkeeper'
        ),
      );

      const flayedPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (flayedPos) {
        markSolid(flayedPos.x, flayedPos.y);
        spawns.push({ x: flayedPos.x, y: flayedPos.y, kind: 'flayed_man', params: { depth: floorPlan.depth } });
      }

      const chainCount = rng.int(2, 4);
      for (let i = 0; i < chainCount; i++) {
        const chainPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
        if (!chainPos) break;
        markSolid(chainPos.x, chainPos.y);
        spawns.push({ x: chainPos.x, y: chainPos.y, kind: 'hanging_chains', params: { depth: floorPlan.depth } });
      }

      const bookPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (bookPos) {
        const book = pickDungeonBook(rng);
        spawns.push({ x: bookPos.x, y: bookPos.y, kind: 'book', params: { bookId: book.id } });
      }
      addDecor('candle_cluster');
      break;
    }
    case 'hydraulics': {
      if (roomContainsStairTile(room, chunk)) break;
      removeRoomSpawns(
        spawns,
        room,
        (spawn) => (
          spawn.kind === 'monster'
          || spawn.kind === 'centipede'
          || spawn.kind === 'spawner'
          || spawn.kind === 'shopkeeper'
        ),
      );

      const linkId = `hyd:${floorPlan.depth}:${room.x},${room.y}`;
      const thresholdWeight = rng.int(20, 40);
      const exitCorridor = findRoomExitCorridor(room, chunk);

      const valvePos = pickValveSpot(room, exitCorridor, isSolid)
        || pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (valvePos) {
        reserved.add(`${valvePos.x},${valvePos.y}`);
        markSolid(valvePos.x, valvePos.y);
        spawns.push({
          x: valvePos.x,
          y: valvePos.y,
          kind: 'flood_gate_wheel',
          params: { depth: floorPlan.depth, linkId },
        });
      }

      const plinthPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (plinthPos) {
        spawns.push({
          x: plinthPos.x,
          y: plinthPos.y,
          kind: 'pressure_plinth',
          params: { depth: floorPlan.depth, linkId, thresholdWeight },
        });
      }

      // Place portcullis on corridor to block exit from hydraulics room
      if (exitCorridor && !isSolid(exitCorridor.x, exitCorridor.y)) {
        markSolid(exitCorridor.x, exitCorridor.y);
        spawns.push({
          x: exitCorridor.x,
          y: exitCorridor.y,
          kind: 'portcullis',
          params: { depth: floorPlan.depth, linkId },
        });
      }

      const ventPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (ventPos) {
        const dirs = [
          { dx: 1, dy: 0 },
          { dx: -1, dy: 0 },
          { dx: 0, dy: 1 },
          { dx: 0, dy: -1 },
        ];
        const dir = dirs[rng.int(0, dirs.length - 1)];
        spawns.push({
          x: ventPos.x,
          y: ventPos.y,
          kind: 'steam_vent',
          params: {
            periodTurns: rng.int(5, 8),
            activeTurns: rng.int(1, 2),
            range: rng.int(3, 5),
            dirX: dir.dx,
            dirY: dir.dy,
            pushForce: 1,
            damage: rng.int(1, 3),
          },
        });
      }
      addDecor('mist_vent');

      if (rng.next() < 0.45) {
        const chimePos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
        if (chimePos) {
          markSolid(chimePos.x, chimePos.y);
          spawns.push({ x: chimePos.x, y: chimePos.y, kind: 'bone_chime_rack', params: {} });
        }
      }
      break;
    }
    case 'kitchen': {
      if (roomContainsStairTile(room, chunk)) break;
      // Kitchen dead end: food cache + active fire, inspired by tavern corner usage.
      removeRoomSpawns(
        spawns,
        room,
        (spawn) => (
          spawn.kind === 'monster'
          || spawn.kind === 'centipede'
          || spawn.kind === 'spawner'
          || spawn.kind === 'shopkeeper'
        ),
      );

      const corners = [
        { x: room.x + 1, y: room.y + 1 },
        { x: room.x + room.w - 2, y: room.y + 1 },
        { x: room.x + 1, y: room.y + room.h - 2 },
        { x: room.x + room.w - 2, y: room.y + room.h - 2 },
      ].filter((p) => p.x > room.x && p.x < room.x + room.w - 1 && p.y > room.y && p.y < room.y + room.h - 1);

      const availableCorners = corners.filter((p) => !isSolid(p.x, p.y));
      const fireCorner = availableCorners.length > 0 ? availableCorners[0] : null;
      if (fireCorner) {
        reserved.add(`${fireCorner.x},${fireCorner.y}`);
        markSolid(fireCorner.x, fireCorner.y);
        spawns.push({ x: fireCorner.x, y: fireCorner.y, kind: 'cooking_fire', params: { depth: floorPlan.depth } });
      }

      const chestCorner = availableCorners.find((p) => !fireCorner || p.x !== fireCorner.x || p.y !== fireCorner.y) || null;
      const chestPos = chestCorner || pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (chestPos) {
        reserved.add(`${chestPos.x},${chestPos.y}`);
        markSolid(chestPos.x, chestPos.y);
        const ingredientChestDrops = [
          'food_flour',
          'food_wild_herbs',
          'food_mushrooms',
          'food_wild_berries',
          'food_raw_fish',
          'food_carrot',
          'food_corn',
          'reagent_ember_root',
          'reagent_spider_leg',
          'reagent_beast_claw',
          'reagent_bone_dust',
          'fishing_kelp',
          'water_bucket',
          'fuel_firewood',
          'tool_kitchen_knife',
        ];
        spawns.push({
          x: chestPos.x,
          y: chestPos.y,
          kind: 'chest',
          params: {
            depth: floorPlan.depth,
            lootTable: 'chest:basic',
            fixedDrops: ingredientChestDrops,
          },
        });
      }

      const pantryPool = [
        'food_flour',
        'food_mushrooms',
        'food_wild_berries',
        'food_wild_herbs',
        'food_wheat',
        'food_carrot',
        'food_corn',
        'food_raw_fish',
        'reagent_ember_root',
        'reagent_spider_leg',
        'reagent_venom_gland',
        'reagent_beast_claw',
        'reagent_bone_dust',
        'reagent_ectoplasm',
        'fishing_kelp',
        'water_bucket',
        'fuel_firewood',
      ];

      let pantryPlaced = 0;
      for (const corner of availableCorners) {
        const key = `${corner.x},${corner.y}`;
        if (reserved.has(key) || isSolid(corner.x, corner.y)) continue;
        reserved.add(key);
        spawns.push({
          x: corner.x,
          y: corner.y,
          kind: 'catalog_item',
          params: { itemId: pantryPool[pantryPlaced % pantryPool.length] },
        });
        pantryPlaced++;
      }

      const extraPantry = rng.int(1, 3);
      for (let i = 0; i < extraPantry; i++) {
        const pos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
        if (!pos) break;
        spawns.push({
          x: pos.x,
          y: pos.y,
          kind: 'catalog_item',
          params: { itemId: pantryPool[rng.int(0, pantryPool.length - 1)] },
        });
      }
      addDecor('ember_brazier');
      break;
    }
    case 'spider_nest': {
      if (roomContainsStairTile(room, chunk)) break;
      removeRoomSpawns(
        spawns,
        room,
        (spawn) => spawn.kind === 'shopkeeper',
      );

      addDecor('web', true);
      addDecor('glowcap_patch');
      addDecor('web_mote_cluster');
      addDecor('web_mote_cluster');

      const eggPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (eggPos) {
        const gmp = pickSpecificMonster('spider', floorPlan.depth) || pickMonster(rng, floorPlan.depth, floorPlan.profile?.monsterFilter ?? null);
        if (gmp) spawns.push({ x: eggPos.x, y: eggPos.y, kind: 'monster', params: gmp });
      }
      const trapPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (trapPos) {
        spawns.push({ x: trapPos.x, y: trapPos.y, kind: 'trap', params: { type: 'swarm', params: { monsterId: 'spider', count: rng.int(3, 6) } } });
      }
      break;
    }
    case 'mirror_reliquary': {
      if (roomContainsStairTile(room, chunk)) break;
      removeRoomSpawns(
        spawns,
        room,
        (spawn) => spawn.kind === 'shopkeeper',
      );

      addDecor('dark_reliquary', true);
      addDecor('polished_mirror', true);
      addDecor('void_crack');
      addDecor('candle_cluster');

      const bookPos = pickRoomInteriorSpot(room, rng, isSolid, reserved);
      if (bookPos) {
        const book = pickDungeonBook(rng);
        spawns.push({ x: bookPos.x, y: bookPos.y, kind: 'book', params: { bookId: book.id } });
      }
      break;
    }
  }

  // Terminal rooms should read as authored destinations even when their theme
  // rolled mostly loot or monsters. Give every one a small thematic light pool.
  if (!roomHasSpawnKind(spawns, room, lightKinds)) {
    const accent = (theme === 'alchemist_den' || theme === 'spider_nest')
      ? 'glowcap_patch'
      : (theme === 'armory' || theme === 'hydraulics' || theme === 'dragon_hoard')
      ? 'ember_brazier'
      : 'candle_cluster';
    addDecor(accent);
  }
}

/**
 * Equip a monster entity with items defined in its equipment spec.
 * @param {import('../../../lib/ecs-js/index.js').World} world
 * @param {number} entityId
 * @param {{ranged?:string, ammo?:string}} equipment
 */
export function equipMonster(world, entityId, equipment) {
  const eq = world.get(entityId, Equipment);
  if (!eq) return;
  if (equipment.ranged) {
    const bowId = buildCatalogItem(world, equipment.ranged);
    eq.ranged = bowId;
  }
  if (equipment.ammo) {
    const ammoKey = String(equipment.ammo || '').toLowerCase();
    let ammoArch = ArrowsStack;
    if (ammoKey === 'fire_arrows' || ammoKey === 'ammo_fire_arrows') ammoArch = FireArrowsStack;
    else if (ammoKey === 'piercing_arrows' || ammoKey === 'ammo_piercing_arrows') ammoArch = PiercingArrowsStack;
    else if (ammoKey === 'bodkin_arrows' || ammoKey === 'ammo_bodkin_arrows') ammoArch = BodkinArrowsStack;
    else if (
      ammoKey === 'blunt_arrows'
      || ammoKey === 'blunt_head_arrows'
      || ammoKey === 'ammo_blunt_arrows'
    ) ammoArch = BluntHeadArrowsStack;
    else if (ammoKey === 'bomb_arrows' || ammoKey === 'ammo_bomb_arrows') ammoArch = BombArrowsStack;
    const arrowId = createFrom(world, ammoArch, {});
    eq.ammo = arrowId;
  }
}

/**
 * Materialize a spawn point into an ECS entity.
 * @param {import('../../../lib/ecs-js/index.js').World} world
 * @param {SpawnPoint} spawn
 * @returns {number|null} entity ID
 */
export function materializeSpawn(world, spawn) {
  // Fast path: trivial spawn kinds that are just createFrom(arch, { x, y }).
  const simpleArch = SIMPLE_SPAWN_TABLE[spawn.kind];
  if (simpleArch) {
    const extra = (spawn.params && typeof spawn.params === "object") ? spawn.params : null;
    return createFrom(world, simpleArch, { x: spawn.x, y: spawn.y, ...(extra || {}) });
  }

  switch (spawn.kind) {
    case 'monster': {
      const raw = spawn.params || {};
      const resolved = typeof raw.monsterId === "string"
        ? pickSpecificMonster(raw.monsterId, Number.isFinite(raw.depth) ? raw.depth : 1)
        : null;
      const p = resolved ? { ...resolved, ...raw } : raw;
      const id = spawnMonsterEntity(world, {
        x: spawn.x, y: spawn.y,
        name: p.name,
        identity: p.identity,
        maxHp: p.maxHp,
        faction: p.faction,
        solid: p.solid,
        blocksSight: p.blocksSight,
        accuracyDerived: p.accuracyDerived,
        damagePowerDerived: p.damagePowerDerived,
        evadeDerived: p.evadeDerived,
        naturalDamageDice: p.naturalDamageDice,
        naturalScript: p.naturalScript,
        sizeClass: p.sizeClass,
        massKg: p.massKg,
        resistances: p.resistances,
        speed: p.speed,
        equipment: p.equipment,
        wielding: p.wielding,
        equipped: p.equipped,
        inventory: p.inventory,
        learnedSpellIds: p.learnedSpellIds,
        maxMana: p.maxMana,
        manaRegen: p.manaRegen,
        creatureType: p.creatureType,
        guardianRole: p.guardianRole,
        sleep: p.sleep,
      });
      return id;
    }
    case 'centipede': {
      const p = spawn.params;
      const seed = ((world.seed >>> 0) ^ ((spawn.x * 0x45d9f3b) >>> 0) ^ ((spawn.y * 0x119de1f3) >>> 0)) >>> 0;
      const cRng = createRng(seed);
      const ids = spawnCentipede(world, p, spawn.x, spawn.y, p.segmentCount || 5, cRng);
      return ids[0];
    }
    case 'gold': {
      const id = createFrom(world, GoldStack, {});
      world.add(id, Position, { x: spawn.x, y: spawn.y });
      world.mutate(id, ItemInfo, r => { r.count = spawn.params.count; });
      return id;
    }
    case 'potion': {
      const id = createFrom(world, HealthPotion, {});
      world.add(id, Position, { x: spawn.x, y: spawn.y });
      return id;
    }
    case 'equipment': {
      const id = buildCatalogItem(world, spawn.params.equipId, {
        affixes: spawn.params.affixes || [],
      });
      world.add(id, Position, { x: spawn.x, y: spawn.y });
      return id;
    }
    case 'arrows': {
      const id = createFrom(world, ArrowsStack, {});
      world.add(id, Position, { x: spawn.x, y: spawn.y });
      return id;
    }
    case 'fire_arrows': {
      const id = createFrom(world, FireArrowsStack, {});
      world.add(id, Position, { x: spawn.x, y: spawn.y });
      return id;
    }
    case 'piercing_arrows': {
      const id = createFrom(world, PiercingArrowsStack, {});
      world.add(id, Position, { x: spawn.x, y: spawn.y });
      return id;
    }
    case 'bodkin_arrows': {
      const id = createFrom(world, BodkinArrowsStack, {});
      world.add(id, Position, { x: spawn.x, y: spawn.y });
      return id;
    }
    case 'blunt_arrows': {
      const id = createFrom(world, BluntHeadArrowsStack, {});
      world.add(id, Position, { x: spawn.x, y: spawn.y });
      return id;
    }
    case 'bomb_arrows': {
      const id = createFrom(world, BombArrowsStack, {});
      world.add(id, Position, { x: spawn.x, y: spawn.y });
      return id;
    }
    case 'scroll': {
      const id = createFrom(world, ScrollOfMapping, {});
      world.add(id, Position, { x: spawn.x, y: spawn.y });
      return id;
    }
    case 'chest': {
      const id = createFrom(world, Chest, { x: spawn.x, y: spawn.y });
      world.add(id, Collider, { solid: true, blocksSight: false });
      world.add(id, Interactable, { action: "openChest", params: spawn.params?.interact ?? null });
      // Pre-populate chest inventory from loot table
      const lootTableChoices = Array.isArray(spawn.params?.lootTableChoices)
        ? spawn.params.lootTableChoices.filter((entry) => typeof entry === 'string' && entry)
        : null;
      const chestSeed = ((world.seed >>> 0) ^ ((id * 0x9e3779b9) >>> 0) ^ 0xCE57) >>> 0;
      const chestRng = createRng(chestSeed);
      const lootTable = lootTableChoices?.length
        ? lootTableChoices[chestRng.int(0, lootTableChoices.length - 1)]
        : (spawn.params.lootTable || 'chest:basic');
      // Set identity to reflect rarity tier so palette and glow effects can key off it
      const ni = world.get(id, NamedIdentity);
      if (ni) {
        if (lootTable === 'chest:legendary') { ni.identity = 'legendary_chest'; ni.name = 'Legendary Chest'; }
        else if (lootTable === 'chest:epic') { ni.identity = 'epic_chest'; ni.name = 'Epic Chest'; }
        else if (lootTable === 'chest:magic') { ni.identity = 'magic_chest'; ni.name = 'Magic Chest'; }
        else { ni.identity = 'basic_chest'; }
      }
      const depth = spawn.params.depth || 1;
      const drops = resolveLootTable(lootTable, chestRng, depth);
      const inv = world.get(id, Inventory);
      if (inv) {
        const dummyPos = { x: spawn.x, y: spawn.y };
        for (const drop of drops) {
          const eid = materializeDrop(world, drop, dummyPos);
          if (eid != null) {
            try { world.remove(eid, Position); } catch {} // ECS: may not exist
            addToInventory(world, id, eid);
          }
        }
        const fixedDrops = Array.isArray(spawn.params.fixedDrops) ? spawn.params.fixedDrops : [];
        for (const itemId of fixedDrops) {
          if (typeof itemId !== 'string' || !itemId) continue;
          let eid = null;
          try {
            eid = buildCatalogItem(world, itemId, { count: 1 });
          } catch {
            eid = null;
          }
          if (!(eid > 0)) continue;
          try { world.remove(eid, Position); } catch {}
          addToInventory(world, id, eid);
        }
      }
      return id;
    }
    case 'mimic': {
      // Resolve disguise archetype — defaults to Chest (shop mimics)
      const disguise = String(spawn.params?.disguiseIdentity || 'chest');
      const catalogDef = getCatalogItem(disguise);
      let id;
      if (catalogDef) {
        id = buildCatalogItem(world, disguise, { count: 1 });
        world.add(id, Position, { x: spawn.x, y: spawn.y });
      } else {
        const DisguiseArch = SIMPLE_SPAWN_TABLE[disguise] || Chest;
        id = createFrom(world, DisguiseArch, { x: spawn.x, y: spawn.y });
      }
      world.add(id, Collider, { solid: true, blocksSight: false });
      world.add(id, Interactable, { action: 'touchMimic', params: null });
      world.add(id, Polymorph, {
        targetIdentity: 'mimic',
        trigger: 'touch',
        once: true,
        revealed: false,
        hookKey: 'mimic_touch',
        depth: Math.max(1, spawn.params?.depth | 0),
      });
      return id;
    }
    case 'trap': {
      const p = spawn.params;
      const arch = p.type === "snake"
        ? SnakeTrap
        : p.type === "shock"
          ? ShockTrap
          : p.type === "pit"
            ? PitTrap
            : p.type === "siphon"
              ? SiphonTrap
              : p.type === "rust"
                ? RustTrap
                : p.type === "swarm"
                  ? SwarmTrap
                  : p.type === "arrow"
                    ? ArrowTrap
                  : SpikeTrap;
      return createFrom(world, arch, {
        x: spawn.x, y: spawn.y,
        trapParams: p.params || {},
      });
    }
    case 'spawner': {
      const p = spawn.params;
      const monsterParams = p.monsterType;
      // Create spawner with specific identity for display palette lookup.
      // Starts dormant — monsterSpawnerSystem activates once area is explored.
      return createFrom(world, Spawner, {
        x: spawn.x,
        y: spawn.y,
        name: `${monsterParams.name} Nest`,
        identity: 'spawner',  // Used by display layer to lookup glyph/color
        spawnParams: monsterParams,
        totalToSpawn: p.packSize,
        cooldownTicks: p.cooldownTicks ?? 15,
        maxConcurrent: p.maxConcurrent ?? 3,
        spawnRadius: 2,
        isActive: false,       // dormant until explored
        maxHp: 50,  // Make spawners destructible but not too fragile
      });
    }
    case 'shopkeeper': {
      const id = createFrom(world, Shopkeeper, { x: spawn.x, y: spawn.y });
      const depth = spawn.params.depth || 1;

      // Name the shopkeeper based on shop archetype
      const SHOP_NAMES = { book: "Bookseller", jewelry: "Jeweler", potion: "Apothecary", general: "Shopkeeper" };
      const shopName = SHOP_NAMES[spawn.params.shopType] || "Shopkeeper";
      if (shopName !== "Shopkeeper") {
        world.mutate(id, NamedIdentity, r => { r.name = shopName; });
      }

      // Create a room metadata entity to mark this as a shop
      if (spawn.params.room) {
        const roomEntity = world.create();
        world.add(roomEntity, RoomMetadata, {
          roomType: 'shop',
          x: spawn.params.room.x,
          y: spawn.params.room.y,
          w: spawn.params.room.w,
          h: spawn.params.room.h,
          shopkeeperId: id,
        });
      }

      return id;
    }
    case 'shop_item': {
      const depth = spawn.params.depth || 1;
      const shopRng = createRng(((world.seed >>> 0) ^ ((spawn.x * 0x9e3779b9) >>> 0) ^ (spawn.y * 0x45d9f3b) ^ 0x5470) >>> 0);

      // Generate exactly one item for this floor spawn, chosen by shop archetype.
      let itemId;
      switch (spawn.params.shopType) {
        case 'book':    itemId = shopStock.generateBookShopItem(world, shopRng); break;
        case 'jewelry': itemId = shopStock.generateGemDisplayItem(world, shopRng); break;
        case 'potion':  itemId = shopStock.generateAlchemyShopItem(world, shopRng); break;
        default:        itemId = shopStock.generateShopItem(world, depth, shopRng); break;
      }
      if (itemId == null) return null;

      // Place it on the floor
      world.add(itemId, Position, { x: spawn.x, y: spawn.y });

      // Shop items are pre-identified on the entity — no identify mask.
      const info = world.get(itemId, ItemInfo);
      if (info) {
        world.mutate(itemId, ItemInfo, r => { r.identified = true; });
      }

      // Calculate price (will be added as Unpaid in post-processing)
      if (info) {
        const baseValue = appraiseItemValue(world, itemId, {
          unidentifiedGemValue: getUnidentifiedGemAppraisal(world, itemId),
        });
        const price = Math.ceil(baseValue * 1.3); // 30% markup
        // Store price temporarily in spawn params for post-processing
        spawn._calculatedPrice = price;
        spawn._itemId = itemId;
      }

      return itemId;
    }
    case 'alchemy_shop_item': {
      const shopRng = createRng(((world.seed >>> 0) ^ ((spawn.x * 0x9e3779b9) >>> 0) ^ (spawn.y * 0x45d9f3b) ^ 0xA1C8) >>> 0);

      const itemId = shopStock.generateAlchemyShopItem(world, shopRng);
      if (itemId == null) return null;

      world.add(itemId, Position, { x: spawn.x, y: spawn.y });

      const info = world.get(itemId, ItemInfo);
      if (info) {
        world.mutate(itemId, ItemInfo, r => { r.identified = true; });
      }

      if (info) {
        const baseValue = appraiseItemValue(world, itemId, {
          unidentifiedGemValue: getUnidentifiedGemAppraisal(world, itemId),
        });
        const price = Math.ceil(baseValue * 1.3);
        spawn._calculatedPrice = price;
        spawn._itemId = itemId;
      }

      return itemId;
    }
    case 'book': {
      let id = null;
      try {
        id = buildCatalogItem(world, spawn.params.bookId, { count: 1 });
      } catch {
        return null;
      }
      if (!(id > 0)) return null;
      world.add(id, Position, { x: spawn.x, y: spawn.y });
      return id;
    }
    case 'catalog_item': {
      let id = null;
      try {
        id = buildCatalogItem(world, spawn.params.itemId, { count: 1 });
      } catch {
        return null;
      }
      if (!(id > 0)) return null;
      world.add(id, Position, { x: spawn.x, y: spawn.y });
      return id;
    }
    case 'potion_shelf':
      return stockDisplayContainer(world, createFrom(world, PotionShelf, { x: spawn.x, y: spawn.y }), spawn, "alchemy");
    case 'gem_display_case':
      return stockDisplayContainer(world, createFrom(world, GemDisplayCase, { x: spawn.x, y: spawn.y }), spawn, "gem");
    case 'book_shop_item': {
      const shopRng = createRng(((world.seed >>> 0) ^ ((spawn.x * 0x9e3779b9) >>> 0) ^ (spawn.y * 0x45d9f3b) ^ 0xB00C) >>> 0);
      const itemId = shopStock.generateBookShopItem(world, shopRng);
      if (itemId == null) return null;
      world.add(itemId, Position, { x: spawn.x, y: spawn.y });
      const info = world.get(itemId, ItemInfo);
      if (info) {
        world.mutate(itemId, ItemInfo, r => { r.identified = true; });
        const price = Math.ceil(appraiseItemValue(world, itemId, {
          unidentifiedGemValue: getUnidentifiedGemAppraisal(world, itemId),
        }) * 1.2);
        spawn._calculatedPrice = price;
        spawn._itemId = itemId;
      }
      return itemId;
    }
    case 'general_store_item': {
      const depth = spawn.params.depth || 1;
      const shopRng = createRng(((world.seed >>> 0) ^ ((spawn.x * 0x9e3779b9) >>> 0) ^ (spawn.y * 0x45d9f3b) ^ 0x6E57) >>> 0);
      const itemId = shopStock.generateShopItem(world, depth, shopRng);
      if (itemId == null) return null;
      world.add(itemId, Position, { x: spawn.x, y: spawn.y });
      const info = world.get(itemId, ItemInfo);
      if (info) {
        world.mutate(itemId, ItemInfo, r => { r.identified = true; });
        spawn._calculatedPrice = Math.ceil(appraiseItemValue(world, itemId, {
          unidentifiedGemValue: getUnidentifiedGemAppraisal(world, itemId),
        }) * 1.3);
        spawn._itemId = itemId;
      }
      return itemId;
    }
    case 'grave_tombstone':
      {
        const id = createFrom(world, GraveTombstone, { x: spawn.x, y: spawn.y });
        const data = spawn?.params?.tombstoneData || null;
        if (id > 0 && data) {
          const epitaph = generateEpitaph(data);
          world.add(id, TombstoneComponent, {
            playerName: data.playerName || 'Hero',
            depth: Number.isFinite(data.depth) ? (data.depth | 0) : 0,
            cause: data.cause || 'unknown',
            killerName: data.killerName || null,
            turn: Number.isFinite(data.turn) ? (data.turn | 0) : 0,
            epitaph,
          });
          world.set(id, Interactable, { action: 'readTombstone', params: null });
        }
        return id;
      }
    case 'tombstone': {
      const data = spawn.params;
      const epitaph = generateEpitaph(data);

      return createFrom(world, Tombstone, {
        x: spawn.x,
        y: spawn.y,
        playerName: data.playerName,
        depth: data.depth,
        cause: data.cause,
        killerName: data.killerName,
        turn: data.turn,
        epitaph: epitaph,
      });
    }
    case 'sarcophagus':
      return createFrom(world, Sarcophagus, { x: spawn.x, y: spawn.y, depth: /** @type {any} */ (spawn.params)?.depth || 1 });
    case 'weapon_rack': {
      const id = createFrom(world, WeaponRack, { x: spawn.x, y: spawn.y });
      const d = /** @type {any} */ (spawn.params)?.depth || 1;
      const tableId = d >= 8 ? 'rack:weapons:magic' : 'rack:weapons';
      const rackSeed = ((world.seed >>> 0) ^ ((id * 0x9e3779b9) >>> 0) ^ 0xBAC5) >>> 0;
      const rackRng = createRng(rackSeed);
      const drops = resolveLootTable(tableId, rackRng, d);
      const inv = /** @type {any} */ (world.get(id, Inventory));
      if (inv) {
        for (const drop of drops) {
          const eid = materializeDrop(world, drop, { x: spawn.x, y: spawn.y });
          if (eid != null) {
            try { world.remove(eid, Position); } catch {}
            addToInventory(world, id, eid);
          }
        }
      }
      return id;
    }
    case 'tile_paint': {
      const tiles = /** @type {any} */ (spawn.params)?.tiles;
      if (Array.isArray(tiles)) {
        for (const t of tiles) {
          // Only paint over floor tiles to avoid overwriting doors/stairs
          if (getTile(t.x, t.y) === TILE_FLOOR) setTile(t.x, t.y, t.tile);
        }
      }
      return null;
    }
    case 'townfolk': {
      const def = TOWNFOLK[spawn.params.townfolkId];
      if (!def) return null;
      const homeX = Number.isFinite(spawn.params.homeX) ? spawn.params.homeX : spawn.x;
      const homeY = Number.isFinite(spawn.params.homeY) ? spawn.params.homeY : spawn.y;
      const bedX = Number.isFinite(spawn.params.bedX) ? spawn.params.bedX : homeX;
      const bedY = Number.isFinite(spawn.params.bedY) ? spawn.params.bedY : homeY;
      const workX = Number.isFinite(spawn.params.workX) ? spawn.params.workX : spawn.x;
      const workY = Number.isFinite(spawn.params.workY) ? spawn.params.workY : spawn.y;
      const workAuxX = Number.isFinite(spawn.params.workAuxX) ? spawn.params.workAuxX : workX;
      const workAuxY = Number.isFinite(spawn.params.workAuxY) ? spawn.params.workAuxY : workY;
      const pubX = Number.isFinite(spawn.params.pubX) ? spawn.params.pubX : homeX;
      const pubY = Number.isFinite(spawn.params.pubY) ? spawn.params.pubY : homeY;
      const deliverX = Number.isFinite(spawn.params.deliverX) ? spawn.params.deliverX : 0;
      const deliverY = Number.isFinite(spawn.params.deliverY) ? spawn.params.deliverY : 0;
      const id = createFrom(world, Human, {
        x: spawn.x,
        y: spawn.y,
        name: def.name,
        identity: def.identity,
        faction: "townfolk",
        maxHp: def.maxHp,
        speed: def.speed,
        capacity: 6,
        intelligence: 10,
      });
      world.add(id, AudioEmitter, { emitters: [{ profile: "town", interior: false }] });
      world.add(id, TownfolkJob, {
        role: def.role,
        state: "idle",
        scheduleEnabled: Boolean(spawn.params.scheduleEnabled),
        homeX,
        homeY,
        bedX,
        bedY,
        workX,
        workY,
        workAuxX,
        workAuxY,
        pubX,
        pubY,
        targetX: homeX,
        targetY: homeY,
        workTurns: 0,
        idleTurns: 2 + Math.floor((world.rand?.() ?? 0) * 5),
        workSiteKind: "",
        routineKind: "",
        lastPhase: "",
        carrying: "",
        carryCount: 0,
        carryMax: def.role === "farmer" ? 4 : def.role === "herbalist" ? 3 : 0,
        deliverX,
        deliverY,
        stuckTurns: 0,
      });
      // Alchemist is a shopkeeper — use openShop action instead of talkToNPC
      if (def.role === "alchemist") {
        world.add(id, Interactable, {
          action: "openShop",
          params: { dialogue: def.dialogue, townfolkId: spawn.params.townfolkId },
        });
        world.add(id, ShopInventory, { buyMarkup: 1.3, sellDiscount: 0.5 });
        assignShopDoorKey(world, id, spawn.params.shopDoorRole || def.role, spawn.params.shopDoor);
        if (spawn.params.shopRoom) {
          const roomEntity = world.create();
          world.add(roomEntity, RoomMetadata, {
            roomType: 'shop',
            x: spawn.params.shopRoom.x,
            y: spawn.params.shopRoom.y,
            w: spawn.params.shopRoom.w,
            h: spawn.params.shopRoom.h,
            shopkeeperId: id,
          });
        }
      } else if (def.role === "enchantress") {
        world.add(id, Interactable, {
          action: "openEnchantressServices",
          params: {
            dialogue: def.dialogue,
            townfolkId: spawn.params.townfolkId,
            dialogId: "townfolk:enchantress",
          },
        });
        if (spawn.params.shopDoor) {
          assignShopDoorKey(world, id, spawn.params.shopDoorRole || def.role, spawn.params.shopDoor);
        }
        if (spawn.params.shopRoom) {
          const roomEntity = world.create();
          world.add(roomEntity, RoomMetadata, {
            roomType: 'shop',
            x: spawn.params.shopRoom.x,
            y: spawn.params.shopRoom.y,
            w: spawn.params.shopRoom.w,
            h: spawn.params.shopRoom.h,
            shopkeeperId: id,
          });
        }
      } else if (def.role === "gem_vendor") {
        world.add(id, Interactable, {
          action: "openGemVendor",
          params: { dialogue: def.dialogue, townfolkId: spawn.params.townfolkId },
        });
        world.add(id, ShopInventory, { buyMarkup: 1.5, sellDiscount: 0.5 });
        assignShopDoorKey(world, id, spawn.params.shopDoorRole || def.role, spawn.params.shopDoor);
        if (spawn.params.shopRoom) {
          const roomEntity = world.create();
          world.add(roomEntity, RoomMetadata, {
            roomType: 'shop',
            x: spawn.params.shopRoom.x,
            y: spawn.params.shopRoom.y,
            w: spawn.params.shopRoom.w,
            h: spawn.params.shopRoom.h,
            shopkeeperId: id,
          });
          // Pre-stock gem shop with gem items placed inside the shop room
          const gemRng = createRng(((world.seed >>> 0) ^ (spawn.x * 0x9e3779b9) ^ (spawn.y * 0x1f2d3c4e)) >>> 0);
          const gemItems = shopStock.generateGemShopStock(world, gemRng);
          const sr = spawn.params.shopRoom;
          for (let gi = 0; gi < gemItems.length; gi++) {
            const itemId = gemItems[gi];
            // Place items in a row inside the shop room
            const px = sr.x + 1 + (gi % Math.max(1, sr.w - 2));
            const py = sr.y + 1 + Math.floor(gi / Math.max(1, sr.w - 2));
            world.add(itemId, Position, { x: px, y: py });
            const info = world.get(itemId, ItemInfo);
            const price = info ? Math.ceil(Number(info.value || 50) * 1.5) : 50;
            try { world.add(itemId, Unpaid, { shopkeeperId: id, price }); } catch {}
          }
        }
      } else if (def.role === "book_vendor") {
        world.add(id, Interactable, {
          action: "openBookVendor",
          params: { dialogue: def.dialogue, townfolkId: spawn.params.townfolkId },
        });
        world.add(id, ShopInventory, { buyMarkup: 1.2, sellDiscount: 0.5 });
        assignShopDoorKey(world, id, spawn.params.shopDoorRole || def.role, spawn.params.shopDoor);
        if (spawn.params.shopRoom) {
          const roomEntity = world.create();
          world.add(roomEntity, RoomMetadata, {
            roomType: 'shop',
            x: spawn.params.shopRoom.x,
            y: spawn.params.shopRoom.y,
            w: spawn.params.shopRoom.w,
            h: spawn.params.shopRoom.h,
            shopkeeperId: id,
          });
          const sr = spawn.params.shopRoom;
          for (const [itemId, pos, info] of world.query(Position, ItemInfo)) {
            if (!pos || !info) continue;
            if (pos.x < sr.x || pos.x >= sr.x + sr.w || pos.y < sr.y || pos.y >= sr.y + sr.h) continue;
            const kind = String(info.type || "");
            if (kind !== "book" && kind !== "learn" && kind !== "scroll") continue;
            const price = Math.ceil(appraiseItemValue(world, itemId, {
              unidentifiedGemValue: getUnidentifiedGemAppraisal(world, itemId),
            }) * 1.2);
            try { world.add(itemId, Unpaid, { shopkeeperId: id, price }); } catch {}
          }
        }
      } else if (def.role === "general_vendor") {
        world.add(id, Interactable, {
          action: "openShop",
          params: { dialogue: def.dialogue, townfolkId: spawn.params.townfolkId },
        });
        world.add(id, ShopInventory, { buyMarkup: 1.3, sellDiscount: 0.5 });
        assignShopDoorKey(world, id, spawn.params.shopDoorRole || def.role, spawn.params.shopDoor);
        if (spawn.params.shopRoom) {
          const roomEntity = world.create();
          world.add(roomEntity, RoomMetadata, {
            roomType: 'shop',
            x: spawn.params.shopRoom.x,
            y: spawn.params.shopRoom.y,
            w: spawn.params.shopRoom.w,
            h: spawn.params.shopRoom.h,
            shopkeeperId: id,
          });
        }
      } else {
        world.add(id, Interactable, {
          action: "talkToNPC",
          params: {
            dialogue: def.dialogue,
            townfolkId: spawn.params.townfolkId,
            dialogId: `townfolk:${def.role}`,
          },
        });
        if (spawn.params.shopDoor) {
          assignShopDoorKey(world, id, spawn.params.shopDoorRole || def.role, spawn.params.shopDoor);
        }
      }
      // Miner spawns with pickaxe equipped
      if (def.role === "miner") {
        const pickId = createItemById(world, "iron_pickaxe");
        if (pickId) {
          addToInventory(world, id, pickId);
          const eq = world.get(id, Equipment);
          if (eq) eq.weapon = pickId;
        }
      }
      if (def.role === "woodcutter") {
        const hatchetId = createItemById(world, "tool_hatchet");
        if (hatchetId) {
          addToInventory(world, id, hatchetId);
          const eq = world.get(id, Equipment);
          if (eq) eq.weapon = hatchetId;
        }
      }
      return id;
    }
    default:
      return null;
  }
}
