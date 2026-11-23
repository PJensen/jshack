// main/debug/consoleCommands.js
// Built-in commands for the debug console.

import { transitionToDepth } from "../../rules/environment/dungeon/transition.js";
import { playerEntity, findNearestValidTileAround } from "../../rules/utils/queries.js";
import { manhattanScalar } from "../../rules/utils/distance.js";
import { Inventory } from "../../rules/components/Inventory.js";
import { ActiveEffects } from "../../rules/components/ActiveEffects.js";
import { Position } from "../../rules/components/Position.js";
import { Vitality } from "../../rules/components/Vitality.js";
import { DungeonState } from "../../rules/components/DungeonState.js";
import { createItemById } from "../../rules/utils/itemFactory.js";
import { addToInventory, inventoryItems } from "../../rules/utils/inventoryFacade.js";
import { getAllMonsters } from "../../rules/data/monsters.js";
import { markExplored } from "../../rules/environment/dungeon/exploredMap.js";
import { spawnDebugMonsterNearPlayer } from "./spawnDebugMonster.js";
import { createDebugRift, activeRiftRecord, currentPlaneId, destroyActiveRift } from "../../rules/utils/riftRuntime.js";
import { WeatherState } from "../../rules/components/WeatherState.js";
import { Equipment, GEAR_SLOTS } from "../../rules/components/Equipment.js";
import { ItemInfo } from "../../rules/components/ItemInfo.js";
import { NamedIdentity } from "../../rules/components/NamedIdentity.js";
import { Faction } from "../../rules/components/Faction.js";
import { TownfolkJob } from "../../rules/components/TownfolkJob.js";
import { attachProcPackage, listProcPackageIds } from "../../rules/data/procPackages.js";
import { ensureActiveEffects } from "../../rules/utils/effects.js";
import { explainDerivedStats } from "../../rules/utils/derivedStats.js";
import { resolveCanonicalStats } from "../../rules/utils/canonicalStats.js";
import { CorpseAdaptation } from "../../rules/components/CorpseAdaptation.js";
import { ProcPackageNode } from "../../rules/components/ProcPackageNode.js";
import { getParent } from "../../lib/ecs-js/hierarchy.js";
import { setTile, getTile } from "../../rules/environment/dungeon/tileMap.js";
import { dealDamage } from "../../rules/utils/dealDamage.js";
import { RiftCloseRequested } from "../../events/RiftCloseRequested.js";
import { materializeSpawn } from "../../rules/environment/dungeon/populate.js";
import {
  TILE_FLOOR,
  TILE_WALL,
  TILE_LAVA,
  TILE_SHALLOW_WATER,
  TILE_WATER,
  TILE_WATER_DEEP,
  TILE_GRASS,
  TILE_ICE,
  TILE_COBBLESTONE,
} from "../../rules/environment/dungeon/constants.js";

const TILE_KIND_TO_ID = Object.freeze({
  floor: TILE_FLOOR,
  wall: TILE_WALL,
  lava: TILE_LAVA,
  shallow: TILE_SHALLOW_WATER,
  shallow_water: TILE_SHALLOW_WATER,
  water: TILE_WATER,
  deep: TILE_WATER_DEEP,
  deep_water: TILE_WATER_DEEP,
  grass: TILE_GRASS,
  ice: TILE_ICE,
  cobble: TILE_COBBLESTONE,
  cobblestone: TILE_COBBLESTONE,
});

const TILE_ID_TO_KIND = new Map(Object.entries(TILE_KIND_TO_ID).map(([k, v]) => [v, k]));

function describeItem(world, itemId) {
  const info = world.get(itemId, ItemInfo);
  const named = world.get(itemId, NamedIdentity);
  const identity = named?.identity || "unknown";
  const label = info?.name || named?.name || identity;
  const count = Math.max(1, Number(info?.count || 1) | 0);
  return `#${itemId} ${label} <${identity}> x${count}`;
}

export function formatNpcWorkStatus(world) {
  const rows = [];
  for (const [id, job] of world.query(TownfolkJob)) {
    const pos = world.get(id, Position);
    const named = world.get(id, NamedIdentity);
    const x = pos ? String(pos.x | 0) : "?";
    const y = pos ? String(pos.y | 0) : "?";
    const targetX = Number.isFinite(Number(job?.targetX)) ? String(Number(job.targetX) | 0) : "?";
    const targetY = Number.isFinite(Number(job?.targetY)) ? String(Number(job.targetY) | 0) : "?";
    const carrying = String(job?.carrying || "");
    const carryCount = Math.max(0, Number(job?.carryCount || 0) | 0);
    rows.push({
      id,
      role: String(job?.role || "unknown"),
      x,
      y,
      status: String(job?.state || "unknown"),
      workSite: String(job?.workSiteKind || "-"),
      target: `${targetX}:${targetY}`,
      workTurns: String(Math.max(0, Number(job?.workTurns || 0) | 0)),
      carrying: carrying ? `${carrying}:${carryCount}` : "-",
      name: String(named?.name || named?.identity || "-"),
    });
  }

  if (!rows.length) return "No NPC work status found.";

  rows.sort((a, b) => {
    if (a.role !== b.role) return a.role.localeCompare(b.role);
    return a.id - b.id;
  });

  return [
    "id, role, x, y, status, workSite, target, workTurns, carrying, name",
    ...rows.map((row) =>
      [
        row.id,
        row.role,
        row.x,
        row.y,
        row.status,
        row.workSite,
        row.target,
        row.workTurns,
        row.carrying,
        row.name,
      ].join(", ")
    ),
  ].join("\n");
}

/**
 * Register all built-in debug commands.
 * @param {{ registerCommand(name: string, helpText: string, handler: function): void }} console
 * @param {{ world: object, messageLog: { log(msg: object): void }, lightingEngine?: any }} deps
 */
export function registerBuiltinCommands(console, { world, messageLog, lightingEngine }) {

  function formatSfxDebugLine(event) {
    const parts = [`[sfx] ${event.id || 'unknown'}`];
    if (event.bus) parts.push(`bus:${event.bus}`);
    if (Number.isFinite(Number(event.volume))) parts.push(`vol:${Number(event.volume).toFixed(2)}`);
    if (Number.isFinite(Number(event.pan))) parts.push(`pan:${Number(event.pan).toFixed(2)}`);
    if (Number.isFinite(Number(event.priority))) parts.push(`prio:${Number(event.priority) | 0}`);
    if (event.file) parts.push(`file:${event.file}`);
    return `  ${parts.join('  ')}`;
  }

  function applyEffectToPlayer(rawKey, rawTurns) {
    const key = String(rawKey || "").trim().toLowerCase();
    if (!key) return "Usage: effect <key> [turns]";
    const turnsLeft = parseInt(String(rawTurns ?? "5"), 10) || 5;
    const pe = playerEntity(world);
    if (!pe) return "No player entity found.";
    const ae = ensureActiveEffects(world, pe.id);
    if (!ae) return "Could not create ActiveEffects component.";
    ae.effects.push({ key, turnsLeft, potency: 1, stacks: 1 });
    return `Applied ${key} for ${turnsLeft} turn(s)`;
  }

  // ---- give <item_id> [count] ----
  console.registerCommand('give', 'give <item_id> [count] — spawn item in inventory', (argsStr) => {
    const parts = argsStr.split(/\s+/).filter(Boolean);
    if (!parts.length) return 'Usage: give <item_id> [count]';
    const itemId = parts[0];
    const count = parseInt(parts[1] || '1', 10) || 1;

    const pe = playerEntity(world);
    if (!pe) return 'No player entity found.';
    const inv = world.get(pe.id, Inventory);
    if (!inv) return 'Player has no inventory.';

    const createdId = createItemById(world, itemId, { count });
    if (createdId === null) return `Unknown item: "${itemId}"`;
    addToInventory(world, pe.id, createdId);
    return `Created ${count}x ${itemId}`;
  });

  // ---- effect <key> [turns] ----
  console.registerCommand('effect', 'effect <key> [turns] — apply status effect', (argsStr) => {
    const parts = argsStr.split(/\s+/).filter(Boolean);
    if (!parts.length) return "Usage: effect <key> [turns]";
    return applyEffectToPlayer(parts[0], parts[1] || "5");
  });

  // ---- slowed [turns] ----
  console.registerCommand("slowed", "slowed [turns] — apply slowed effect to player", (argsStr) => {
    const parts = String(argsStr || "").split(/\s+/).filter(Boolean);
    const turns = parts[0] || "5";
    return applyEffectToPlayer("slowed", turns);
  });

  // ---- slow [turns] ----
  console.registerCommand("slow", "slow [turns] — alias for slowed", (argsStr) => {
    const parts = String(argsStr || "").split(/\s+/).filter(Boolean);
    const turns = parts[0] || "5";
    return applyEffectToPlayer("slowed", turns);
  });

  // ---- heal ----
  console.registerCommand('heal', 'Fully heal the player', () => {
    const pe = playerEntity(world);
    if (!pe) return 'No player entity found.';
    const vit = world.get(pe.id, Vitality);
    if (!vit) return 'Player has no Vitality component.';
    vit.hp = vit.maxHp;
    return `Healed to ${vit.hp}/${vit.maxHp}`;
  });

  // ---- lockpick [pins] [difficulty] ----
  console.registerCommand('lockpick', 'lockpick [pins] [difficulty] — open glyph lock picker overlay', (argsStr) => {
    const parts = String(argsStr || '').split(/\s+/).filter(Boolean);
    const pins = Number.parseInt(parts[0] || '5', 10);
    const pinCount = Number.isFinite(pins) ? pins : 5;
    const difficulty = parts[1] || 'normal';
    if (typeof globalThis.window?.dispatchEvent !== 'function') return 'Lock picker UI is unavailable.';
    globalThis.window.dispatchEvent(new CustomEvent('ui:openLockPicking', {
      detail: { pinCount, difficulty },
    }));
    return `Opened lock picker (${pinCount} pins, ${difficulty}).`;
  });

  // ---- tp <x> <y> ----
  console.registerCommand('tp', 'tp <x> <y> — teleport player to world coordinates', (argsStr) => {
    const parts = argsStr.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return 'Usage: tp <x> <y>';
    const x = parseInt(parts[0], 10);
    const y = parseInt(parts[1], 10);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 'Coordinates must be numbers.';

    const pe = playerEntity(world);
    if (!pe) return 'No player entity found.';
    const pos = world.get(pe.id, Position);
    if (!pos) return 'Player has no Position.';
    pos.x = x;
    pos.y = y;
    return `Teleported to (${x}, ${y})`;
  });

  function resolveTileTarget(parts) {
    if (parts.length >= 3) {
      const x = Number.parseInt(parts[1], 10);
      const y = Number.parseInt(parts[2], 10);
      if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
      return null;
    }
    const pe = playerEntity(world);
    if (!pe) return null;
    const pos = world.get(pe.id, Position);
    if (!pos) return null;
    return { x: pos.x | 0, y: pos.y | 0 };
  }

  function applyTileReliefPreset(kind, x, y) {
    if (!lightingEngine || typeof lightingEngine.setFloorTileDelta !== 'function') return null;
    if (kind === 'lava') return lightingEngine.setFloorTileDelta(x, y, -0.5);
    if (kind === 'floor') return lightingEngine.setFloorTileDelta(x, y, 0);
    return null;
  }

  // ---- settile <kind> [x y] ----
  console.registerCommand('settile', 'settile <kind> [x y] — set terrain tile (lava/water/floor/...)', (argsStr) => {
    const parts = String(argsStr || '').split(/\s+/).filter(Boolean);
    if (!parts.length) return `Usage: settile <${Object.keys(TILE_KIND_TO_ID).join('|')}> [x y]`;
    const kind = String(parts[0] || '').toLowerCase();
    const tile = TILE_KIND_TO_ID[kind];
    if (!Number.isInteger(tile)) return `Unknown tile kind "${kind}".`;
    const target = resolveTileTarget(parts);
    if (!target) return 'No player/position found.';
    const prev = getTile(target.x, target.y);
    const ok = setTile(target.x, target.y, tile);
    if (!ok) return `Failed to set tile at (${target.x}, ${target.y}).`;
    const relief = applyTileReliefPreset(kind, target.x, target.y);
    const prevKind = TILE_ID_TO_KIND.get(prev) || `tile:${prev}`;
    if (relief == null) return `Tile (${target.x}, ${target.y}) ${prevKind} -> ${kind}`;
    return `Tile (${target.x}, ${target.y}) ${prevKind} -> ${kind}; relief=${relief.toFixed(3)}`;
  });

  function setTileAlias(kind, argsStr) {
    const parts = [kind, ...String(argsStr || "").split(/\s+/).filter(Boolean)];
    const tile = TILE_KIND_TO_ID[kind];
    const target = resolveTileTarget(parts);
    if (!target) return 'No player/position found.';
    const prev = getTile(target.x, target.y);
    const ok = setTile(target.x, target.y, tile);
    if (!ok) return `Failed to set tile at (${target.x}, ${target.y}).`;
    const relief = applyTileReliefPreset(kind, target.x, target.y);
    const prevKind = TILE_ID_TO_KIND.get(prev) || `tile:${prev}`;
    if (relief == null) return `Tile (${target.x}, ${target.y}) ${prevKind} -> ${kind}`;
    return `Tile (${target.x}, ${target.y}) ${prevKind} -> ${kind}; relief=${relief.toFixed(3)}`;
  }

  // Easy aliases for common substance edits.
  console.registerCommand('setlava', 'setlava [x y] — set tile to lava + relief -0.5', (argsStr) => setTileAlias('lava', argsStr));
  console.registerCommand('setwater', 'setwater [x y] — set tile to water', (argsStr) => setTileAlias('water', argsStr));
  console.registerCommand('setshallow', 'setshallow [x y] — set tile to shallow water', (argsStr) => setTileAlias('shallow', argsStr));
  console.registerCommand('setdeepwater', 'setdeepwater [x y] — set tile to deep water', (argsStr) => setTileAlias('deep_water', argsStr));
  console.registerCommand('setfloor', 'setfloor [x y] — set tile to floor + relief 0', (argsStr) => setTileAlias('floor', argsStr));

  // ---- dig <amount> ----
  console.registerCommand('dig', 'dig <amount> — lower current tile in floor relief field', (argsStr) => {
    if (!lightingEngine || (typeof lightingEngine.addFloorTileDelta !== 'function' && typeof lightingEngine.addFloorRadialDelta !== 'function')) {
      return 'Floor relief debug is unavailable.';
    }
    const amount = Number((argsStr || '').trim() || '0.5');
    if (!Number.isFinite(amount) || amount <= 0) return 'Usage: dig <amount>';
    const pe = playerEntity(world);
    if (!pe) return 'No player entity found.';
    const pos = world.get(pe.id, Position);
    if (!pos) return 'Player has no Position.';
    if (typeof lightingEngine.addFloorRadialDelta === 'function') {
      const count = lightingEngine.addFloorRadialDelta(
        pos.x + 0.5,
        pos.y + 0.5,
        -amount,
        0.62,
        { falloff: 1.3, roughness: 0.22, depthNoise: 0.10 },
      );
      return `Dig @ (${pos.x}, ${pos.y}) by ${amount.toFixed(3)} -> radial stamps ${count}`;
    }
    const next = lightingEngine.addFloorTileDelta(pos.x, pos.y, -amount);
    return `Dig @ (${pos.x}, ${pos.y}) by ${amount.toFixed(3)} -> tile relief ${next.toFixed(3)}`;
  });

  // ---- pile <amount> ----
  console.registerCommand('pile', 'pile <amount> — raise current tile in floor relief field', (argsStr) => {
    if (!lightingEngine || (typeof lightingEngine.addFloorTileDelta !== 'function' && typeof lightingEngine.addFloorRadialDelta !== 'function')) {
      return 'Floor relief debug is unavailable.';
    }
    const amount = Number((argsStr || '').trim() || '0.5');
    if (!Number.isFinite(amount) || amount <= 0) return 'Usage: pile <amount>';
    const pe = playerEntity(world);
    if (!pe) return 'No player entity found.';
    const pos = world.get(pe.id, Position);
    if (!pos) return 'Player has no Position.';
    if (typeof lightingEngine.addFloorRadialDelta === 'function') {
      const count = lightingEngine.addFloorRadialDelta(
        pos.x + 0.5,
        pos.y + 0.5,
        amount,
        0.62,
        { falloff: 1.25, roughness: 0.16, depthNoise: 0.08 },
      );
      return `Pile @ (${pos.x}, ${pos.y}) by ${amount.toFixed(3)} -> radial stamps ${count}`;
    }
    const next = lightingEngine.addFloorTileDelta(pos.x, pos.y, amount);
    return `Pile @ (${pos.x}, ${pos.y}) by ${amount.toFixed(3)} -> tile relief ${next.toFixed(3)}`;
  });

  // ---- reliefnoise <amp> [freq] ----
  console.registerCommand('reliefnoise', 'reliefnoise <amp> [freq] — set smooth floor noise baseline', (argsStr) => {
    if (!lightingEngine || typeof lightingEngine.setFloorNoise !== 'function') {
      return 'Floor relief debug is unavailable.';
    }
    const parts = argsStr.split(/\s+/).filter(Boolean);
    if (!parts.length) return 'Usage: reliefnoise <amp> [freq]';
    const amp = Number(parts[0]);
    const freq = parts.length > 1 ? Number(parts[1]) : undefined;
    if (!Number.isFinite(amp)) return 'Usage: reliefnoise <amp> [freq]';
    const next = lightingEngine.setFloorNoise(amp, freq);
    const state = lightingEngine.getFloorReliefState?.();
    return `Relief noise amp=${next.toFixed(3)} freq=${Number(state?.noiseFreq || 0).toFixed(3)}`;
  });

  // ---- reliefclear ----
  console.registerCommand('reliefclear', 'reliefclear [all] — reset floor relief on current depth or all depths', (argsStr) => {
    if (!lightingEngine || typeof lightingEngine.clearFloorRelief !== 'function') {
      return 'Floor relief debug is unavailable.';
    }
    const mode = String(argsStr || '').trim().toLowerCase();
    lightingEngine.clearFloorRelief(mode === 'all' ? 'all' : undefined);
    return mode === 'all' ? 'Floor relief reset for all depths.' : 'Floor relief reset for current depth.';
  });

  // ---- god ----
  const GOD_SYM = Symbol.for("jshack:debug:godMode");
  function toggleGodMode() {
    world[GOD_SYM] = !world[GOD_SYM];
    const pe = playerEntity(world);
    if (!pe) return 'No player entity found.';
    if (world[GOD_SYM]) {
      const ae = ensureActiveEffects(world, pe.id);
      if (ae && !ae.effects.some(e => e.key === 'invulnerable')) {
        ae.effects.push({ key: 'invulnerable', turnsLeft: 999999, potency: 1, stacks: 1 });
      }
    } else {
      const ae = world.get(pe.id, ActiveEffects);
      if (ae) ae.effects = ae.effects.filter(e => e.key !== 'invulnerable');
    }
    const msg = `God mode ${world[GOD_SYM] ? 'ON' : 'OFF'}`;
    messageLog.log({ text: msg, type: 'system' });
    return msg;
  }
  console.registerCommand('god', 'Toggle god mode (invincibility)', toggleGodMode);

  // Allow keyboard cheat code (IDDQD) to trigger god mode
  try {
    window.addEventListener('debug:toggleGodMode', () => {
      toggleGodMode();
      world.tick(0);
    });
  } catch { /* no window in test env */ }

  // ---- spawn <monster_id> ----
  console.registerCommand('spawn', 'spawn <monster_id> — spawn monster near player', (argsStr) => {
    const monsterId = argsStr.trim();
    if (!monsterId) {
      const ids = getAllMonsters().map(m => m.id).join(', ');
      return `Usage: spawn <monster_id>\nAvailable: ${ids}`;
    }
    const result = spawnDebugMonsterNearPlayer(world, monsterId);
    if (!result.ok) return result.error;
    return `Spawned ${result.name} at (${result.x}, ${result.y})`;
  });

  // ---- spawntrap <type> [x y] ----
  console.registerCommand('spawntrap', 'spawntrap <type> [x y] — place an armed trap', (argsStr) => {
    const parts = String(argsStr || '').split(/\s+/).filter(Boolean);
    const type = String(parts[0] || '').toLowerCase();
    const allowed = new Set(['spike', 'snake', 'shock', 'pit', 'siphon', 'rust', 'swarm', 'arrow', 'water']);
    if (!allowed.has(type)) return `Usage: spawntrap <${Array.from(allowed).join('|')}> [x y]`;
    const target = resolveTileTarget(['trap', ...parts.slice(1)]);
    if (!target) return 'No player/position found.';
    const id = materializeSpawn(world, {
      x: target.x,
      y: target.y,
      kind: 'trap',
      params: { type },
    });
    return `Spawned ${type} trap #${id} at (${target.x}, ${target.y})`;
  });

  // ---- create rift [levels] ----
  console.registerCommand('create', 'create rift [levels] — spawn a debug rift portal', (argsStr) => {
    const parts = String(argsStr || '').split(/\s+/).filter(Boolean);
    if (String(parts[0] || '').toLowerCase() !== 'rift') return 'Usage: create rift [levels]';
    const requested = Number.parseInt(parts[1] || '0', 10);
    if (!Number.isFinite(requested) || requested < 0) return 'Usage: create rift [levels] (levels >= 0)';
    const result = createDebugRift(world, requested);
    if (!result.ok) return result.error;
    return `Created rift ${result.riftId} seed=${(result.seed >>> 0).toString(16)} levels=${result.levels} portal=#${result.portalId} @ (${result.x}, ${result.y})`;
  });

  // ---- close rift ----
  console.registerCommand('close', 'close rift — close the active debug rift', (argsStr) => {
    const parts = String(argsStr || '').split(/\s+/).filter(Boolean);
    if (String(parts[0] || '').toLowerCase() !== 'rift') return 'Usage: close rift';
    const rec = activeRiftRecord(world);
    if (!rec?.state) return 'No active rift.';
    const pe = playerEntity(world);
    const plane = currentPlaneId(world);
    if (!rec.state.inside && plane !== rec.state.planeId) {
      const riftId = rec.state.riftId;
      destroyActiveRift(world, { actor: pe?.id || 0, riftId, reason: "closed" });
      return `Closed rift ${riftId}.`;
    }
    world.emit(new RiftCloseRequested({
      actor: pe?.id || 0,
      riftId: rec.state.riftId,
    }));
    return `Closing rift ${rec.state.riftId}; returning to origin...`;
  });

  // ---- chicken [hen|rooster|chick] ----
  const CHICKEN_KINDS = {
    hen: "chicken_hen",
    rooster: "chicken_rooster",
    chick: "chick",
  };
  console.registerCommand('chicken', 'chicken [hen|rooster|chick] — spawn a chicken near player', (argsStr) => {
    const kind = (argsStr.trim() || "hen").toLowerCase();
    const monsterId = CHICKEN_KINDS[kind];
    if (!monsterId) return `Unknown kind: "${kind}". Available: ${Object.keys(CHICKEN_KINDS).join(', ')}`;
    const result = spawnDebugMonsterNearPlayer(world, monsterId);
    if (!result.ok) return result.error;
    return `Spawned ${result.name} at (${result.x}, ${result.y})`;
  });

  // ---- monsters ----
  console.registerCommand('monsters', 'List hostile monsters on the current floor', () => {
    const pe = playerEntity(world);
    const playerPos = pe ? world.get(pe.id, Position) : null;

    const rows = [];
    for (const [id, pos, vit, named, faction] of world.query(Position, Vitality, NamedIdentity, Faction)) {
      if (faction?.key !== 'enemy') continue;
      const name = named?.name || named?.identity || `entity ${id}`;
      const identity = named?.identity || 'unknown';
      const hp = `${Number(vit?.hp ?? 0)}/${Number(vit?.maxHp ?? 0)}`;
      const dist = playerPos ? manhattanScalar(pos.x, pos.y, playerPos.x, playerPos.y) : null;
      rows.push({
        id,
        x: pos.x,
        y: pos.y,
        hp,
        name,
        identity,
        dist: dist ?? Number.POSITIVE_INFINITY,
      });
    }

    if (!rows.length) return 'No hostile monsters on the current floor.';

    rows.sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      if (a.y !== b.y) return a.y - b.y;
      if (a.x !== b.x) return a.x - b.x;
      return a.id - b.id;
    });

    return rows
      .map((row) => `#${row.id} ${row.name} <${row.identity}> @ (${row.x}, ${row.y}) HP ${row.hp}${Number.isFinite(row.dist) ? ` d=${row.dist}` : ''}`)
      .join('\n');
  });

  // ---- npc-work-status ----
  console.registerCommand('npc-work-status', 'npc-work-status — list town NPC work state', () => {
    return formatNpcWorkStatus(world);
  });

  // ---- inventory [list] ----
  console.registerCommand('inventory', 'inventory list — list player inventory item ids', (argsStr) => {
    const action = argsStr.trim().toLowerCase();
    if (action && action !== 'list') return 'Usage: inventory list';

    const pe = playerEntity(world);
    if (!pe) return 'No player entity found.';

    const items = inventoryItems(world, pe.id);
    if (!items.length) return 'Inventory is empty.';
    return items.map((itemId) => describeItem(world, itemId)).join('\n');
  });

  // ---- equipment [list] ----
  console.registerCommand('equipment', 'equipment list — list equipped item ids by slot', (argsStr) => {
    const action = argsStr.trim().toLowerCase();
    if (action && action !== 'list') return 'Usage: equipment list';

    const pe = playerEntity(world);
    if (!pe) return 'No player entity found.';
    const eq = world.get(pe.id, Equipment);
    if (!eq) return 'Player has no Equipment component.';

    const lines = [];
    for (const slot of GEAR_SLOTS) {
      const itemId = Number(eq[slot] || 0) | 0;
      if (itemId > 0) {
        lines.push(`${slot}: ${describeItem(world, itemId)}`);
      } else {
        lines.push(`${slot}: empty`);
      }
    }
    return lines.join('\n');
  });

  // ---- enchant <item-id|slot:<name>> <proc-package-id> ----
  console.registerCommand('enchant', 'enchant <item-id|slot:ranged> <proc-package-id> — attach a proc package to an item', (argsStr) => {
    const parts = argsStr.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      return `Usage: enchant <item-id|slot:ranged> <proc-package-id>\nAvailable packages: ${listProcPackageIds().join(', ')}`;
    }

    const targetRef = parts[0];
    const packageId = parts[1];
    const pe = playerEntity(world);
    if (!pe) return 'No player entity found.';

    let itemId = 0;
    if (targetRef.startsWith('slot:')) {
      const slot = targetRef.slice(5);
      if (!GEAR_SLOTS.includes(slot)) return `Unknown equipment slot: "${slot}"`;
      const eq = world.get(pe.id, Equipment);
      if (!eq) return 'Player has no Equipment component.';
      itemId = Number(eq[slot] || 0) | 0;
      if (!(itemId > 0)) return `No item equipped in slot "${slot}"`;
    } else {
      itemId = Number.parseInt(targetRef, 10) | 0;
      if (!(itemId > 0) || !world.isAlive?.(itemId) || !world.has(itemId, ItemInfo)) {
        return `Invalid item id: "${targetRef}"`;
      }
    }

    const rootId = attachProcPackage(world, itemId, packageId);
    if (!(rootId > 0)) {
      return `Failed to attach proc package "${packageId}". Available: ${listProcPackageIds().join(', ')}`;
    }
    return `Attached ${packageId} to ${describeItem(world, itemId)} via package node #${rootId}`;
  });

  // ---- depth <n> ----
  console.registerCommand('depth', 'depth <n> — jump to dungeon floor N', (argsStr) => {
    const n = parseInt(argsStr.trim(), 10);
    if (!Number.isFinite(n) || n < 0) return 'Usage: depth <n> (n >= 0)';

    let currentDepth = 0;
    for (const [, ds] of world.query(DungeonState)) {
      currentDepth = ds.currentDepth;
      break;
    }
    if (n === currentDepth) return `Already on floor ${n}.`;

    const pe = playerEntity(world);
    const pos = pe ? world.get(pe.id, Position) : null;
    const targetPos = pos ? { x: pos.x | 0, y: pos.y | 0 } : undefined;
    world.emit('dungeon:teleport-depth', { targetDepth: n, targetPos });
    return `Transitioning to floor ${n}...`;
  });

  // ---- z <delta> ----
  console.registerCommand('z', 'z <delta> — debug-only exact XY depth shift; changes Z only', (argsStr) => {
    const delta = parseInt(String(argsStr || '').trim(), 10);
    if (!Number.isFinite(delta) || delta === 0) return 'Usage: z <delta> (non-zero integer)';

    let currentDepth = 0;
    for (const [, ds] of world.query(DungeonState)) {
      currentDepth = Number(ds?.currentDepth || 0) | 0;
      break;
    }

    const pe = playerEntity(world);
    if (!pe) return 'No player entity found.';
    const pos = world.get(pe.id, Position);
    if (!pos) return 'Player has no Position.';

    const targetDepth = Math.max(0, currentDepth + delta);
    if (targetDepth === currentDepth) return `Already on floor ${targetDepth}.`;

    transitionToDepth(world, targetDepth, { x: pos.x | 0, y: pos.y | 0 });
    return `Shifted Z from ${currentDepth} to ${targetDepth} at (${pos.x | 0}, ${pos.y | 0}).`;
  });

  // ---- zabs <n> ----
  console.registerCommand('zabs', 'zabs <n> — debug-only exact XY jump to absolute depth', (argsStr) => {
    const targetDepth = parseInt(String(argsStr || '').trim(), 10);
    if (!Number.isFinite(targetDepth) || targetDepth < 0) return 'Usage: zabs <n> (n >= 0)';

    let currentDepth = 0;
    for (const [, ds] of world.query(DungeonState)) {
      currentDepth = Number(ds?.currentDepth || 0) | 0;
      break;
    }
    if (targetDepth === currentDepth) return `Already on floor ${targetDepth}.`;

    const pe = playerEntity(world);
    if (!pe) return 'No player entity found.';
    const pos = world.get(pe.id, Position);
    if (!pos) return 'Player has no Position.';

    transitionToDepth(world, targetDepth, { x: pos.x | 0, y: pos.y | 0 });
    return `Shifted Z from ${currentDepth} to ${targetDepth} at (${pos.x | 0}, ${pos.y | 0}).`;
  });

  // ---- reveal ----
  let _revealed = false;
  console.registerCommand('reveal', 'Toggle full map visibility (fog of war)', () => {
    _revealed = !_revealed;
    if (_revealed) {
      // Mark all loaded chunk tiles as explored
      // Iterate over a large area around the player
      const pe = playerEntity(world);
      const pos = pe ? world.get(pe.id, Position) : null;
      const cx = pos ? pos.x : 0;
      const cy = pos ? pos.y : 0;
      const radius = 200;
      for (let y = cy - radius; y <= cy + radius; y++) {
        for (let x = cx - radius; x <= cx + radius; x++) {
          markExplored(x, y);
        }
      }
      return 'Map revealed (200-tile radius). Run again to toggle off (next FOV update restores fog).';
    }
    return 'Reveal OFF — fog of war will restore on next move.';
  });

  // ---- noclip ----
  const NOCLIP_SYM = Symbol.for("jshack:debug:noclip");
  console.registerCommand('noclip', 'Toggle noclip (walk through walls)', () => {
    world[NOCLIP_SYM] = !world[NOCLIP_SYM];
    return `Noclip ${world[NOCLIP_SYM] ? 'ON' : 'OFF'}`;
  });

  // ---- weather [clear|rain|heavy_rain] ----
  const WEATHER_TYPES = ['clear', 'rain', 'heavy_rain'];
  console.registerCommand('weather', 'weather [clear|rain|heavy_rain] — view or set weather', (argsStr) => {
    const arg = argsStr.trim().toLowerCase();

    // Query current weather
    let wsId = 0;
    let ws = null;
    for (const [id, w] of world.query(WeatherState)) {
      wsId = id;
      ws = w;
      break;
    }

    if (!ws) return 'No WeatherState entity found (are you on the overworld?)';

    if (!arg) return `Current weather: ${ws.current} (${ws.turnsRemaining} turns remaining)`;

    if (!WEATHER_TYPES.includes(arg)) {
      return `Unknown weather type: "${arg}"\nAvailable: ${WEATHER_TYPES.join(', ')}`;
    }

    const prev = ws.current;
    world.set(wsId, WeatherState, {
      current: arg,
      turnsRemaining: 100,
      transitionCooldown: 100,
    });
    world.emit?.("weather:changed", { weather: arg, prev });
    return `Weather set to ${arg} (100 turns)`;
  });

  // ---- stats [filter] ----
  console.registerCommand('stats', 'stats [filter] — show stat tree with sources', (argsStr) => {
    const pe = playerEntity(world);
    if (!pe) return 'No player entity found.';

    const filter = argsStr.trim().toLowerCase();
    const { sheet, trace } = explainDerivedStats(world, pe.id);
    const canonical = resolveCanonicalStats(world, pe.id);

    // Group trace entries by target stat
    const grouped = new Map();
    for (const entry of trace) {
      const key = entry.target;
      if (filter && !key.toLowerCase().includes(filter)) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(entry);
    }

    const lines = [];
    lines.push('=== Stat Tree ===');

    // Show grouped trace entries
    for (const [stat, entries] of grouped) {
      const final = Number(canonical[stat] ?? sheet[stat] ?? 0);
      lines.push(`\n${stat}: ${fmtNum(final)}`);
      for (const e of entries) {
        let label = `  #${e.entityId}`;
        label += ` ${describeStatSource(world, e.entityId)}`;
        const delta = e.after - e.before;
        label += ` ${e.kind} ${delta >= 0 ? '+' : ''}${fmtNum(delta)}`;
        label += ` (${fmtNum(e.before)} → ${fmtNum(e.after)})`;
        lines.push(label);
      }
    }

    // Show stats with no trace entries but non-zero canonical values
    if (!filter) {
      const shownKeys = new Set(grouped.keys());
      const extraLines = [];
      for (const [key, val] of Object.entries(canonical)) {
        if (shownKeys.has(key)) continue;
        const n = Number(val || 0);
        if (n === 0) continue;
        extraLines.push(`${key}: ${fmtNum(n)}`);
      }
      if (extraLines.length) {
        lines.push('\n--- Passive / Equipment ---');
        lines.push(...extraLines);
      }
    }

    return lines.join('\n');
  });

  // ---- kill self / kill <entity-id> ----
  console.registerCommand('kill', 'kill self | kill <entity-id> — instantly kill player or entity', (argsStr) => {
    const arg = argsStr.trim().toLowerCase();
    if (arg === 'self' || arg === 'me' || arg === 'player') {
      const pe = playerEntity(world);
      if (!pe) return 'No player entity found.';
      const vit = world.get(pe.id, Vitality);
      if (!vit) return 'Player has no Vitality.';
      dealDamage(world, {
        target: pe.id,
        amount: vit.maxHp * 10,
        type: 'physical',
        cause: 'debug kill',
        bypassInvuln: true,
      });
      return 'Player killed.';
    }
    const targetId = parseInt(arg, 10);
    if (!Number.isFinite(targetId) || targetId <= 0) return 'Usage: kill self | kill <entity-id>';
    if (!world.isAlive(targetId)) return `Entity #${targetId} does not exist.`;
    const vit = world.get(targetId, Vitality);
    if (!vit) return `Entity #${targetId} has no Vitality.`;
    dealDamage(world, {
      target: targetId,
      amount: vit.maxHp * 10,
      type: 'physical',
      cause: 'debug kill',
      bypassInvuln: true,
    });
    return `Killed entity #${targetId}.`;
  });

  // ══════════════════════════════════════════════════════════
  //  Audio debug commands
  // ══════════════════════════════════════════════════════════

  let _audio = null;
  function audio() {
    if (!_audio) {
      try { _audio = import("../../display/audio/index.js"); } catch (_) {}
    }
    return _audio;
  }
  let _sounds = null;
  function sounds() {
    if (!_sounds) {
      try { _sounds = import("../../display/audio/sounds.js"); } catch (_) {}
    }
    return _sounds;
  }

  const writeSfxDebugLine = (event) => {
    console.log(formatSfxDebugLine(event), 'debug');
  };

  console.registerCommand('sfx', 'sfx <sound-id> [volume] [pitch] | sfx list | sfx debug <enable|disable> — play a sound or inspect SFX debug logging', async (argsStr) => {
    const [id, volStr, pitchStr] = argsStr.trim().split(/\s+/);
    if (!id) return 'Usage: sfx <sound-id> [volume 0-1] [randomPitch cents]\n       sfx list\n       sfx debug <enable|disable>';
    if (id === 'debug') {
      const a = await audio();
      const mode = String(volStr || '').toLowerCase();
      if (!mode) return `SFX debug is ${a.isSfxDebugEnabled?.() ? 'enabled' : 'disabled'}.\nUsage: sfx debug <enable|disable>`;
      if (mode !== 'enable' && mode !== 'disable') return 'Usage: sfx debug <enable|disable>';
      const enabled = mode === 'enable';
      a.setSfxDebugLogger?.(enabled ? writeSfxDebugLine : null);
      a.setSfxDebugEnabled?.(enabled);
      return enabled
        ? 'SFX debug enabled. Triggered sounds will append to the debug console.'
        : 'SFX debug disabled.';
    }
    if (id === 'list') {
      const s = await sounds();
      const ids = s.allIds();
      const loaded = [];
      const missing = [];
      for (const sid of ids) {
        const r = s.resolve(sid);
        // Check cache by trying to see if url would resolve
        (r ? loaded : missing).push(sid);
      }
      return `${ids.length} registered sounds:\n${ids.map(i => {
        const r = s.resolve(i);
        return `  ${i}  →  ${r?.file || '?'}  [${r?.bus || '?'}]`;
      }).join('\n')}`;
    }
    const a = await audio();
    const s = await sounds();
    const resolved = s.resolve(id);
    if (!resolved) return `Unknown sound ID: "${id}"\nUse "sfx list" to see all IDs.`;
    const opts = {
      bus: resolved.bus,
      maxVoices: resolved.maxVoices,
      volume: resolved.volume,
      rate: resolved.rate,
      detune: resolved.detune,
      randomPitch: resolved.randomPitch,
    };
    if (volStr) opts.volume = Math.max(0, Math.min(1, parseFloat(volStr)));
    if (pitchStr) opts.randomPitch = Math.abs(parseInt(pitchStr, 10));
    a.play(resolved.url, opts);
    a.reportSfxDebugInvocation?.({
      source: 'console',
      id,
      bus: resolved.bus,
      file: resolved.file,
      volume: opts.volume,
      priority: 1,
    });
    return `▶ ${id} → ${resolved.file} [bus:${resolved.bus}]${opts.volume != null ? ` vol:${opts.volume}` : ''}${opts.randomPitch ? ` pitch:±${opts.randomPitch}¢` : ''}`;
  });

  console.registerCommand('sfx-volume', 'sfx-volume [0-1] — get/set master volume', async (argsStr) => {
    const a = await audio();
    const v = argsStr.trim();
    if (!v) return `Master volume: ${a.getVolume().toFixed(2)}`;
    const n = Math.max(0, Math.min(1, parseFloat(v)));
    a.setVolume(n);
    return `Master volume set to ${n.toFixed(2)}`;
  });

  console.registerCommand('sfx-bus', 'sfx-bus [name] [0-1] — get/set bus volume (combat/spells/items/ambient/ui)', async (argsStr) => {
    const a = await audio();
    const [name, volStr] = argsStr.trim().split(/\s+/);
    if (!name) {
      const buses = ['combat', 'spells', 'items', 'ambient', 'ui'];
      return buses.map(b => `  ${b}: ${a.getBusVolume(b).toFixed(2)}`).join('\n');
    }
    if (!volStr) return `${name}: ${a.getBusVolume(name).toFixed(2)}`;
    const n = Math.max(0, Math.min(1, parseFloat(volStr)));
    a.setBusVolume(name, n);
    return `${name} bus volume set to ${n.toFixed(2)}`;
  });

  console.registerCommand('sfx-mute', 'sfx-mute — toggle mute', async () => {
    const a = await audio();
    a.setMuted(!a.isMuted());
    return a.isMuted() ? 'Audio muted' : 'Audio unmuted';
  });

  console.registerCommand('sfx-reverb', 'sfx-reverb [0-1] — get/set reverb wet mix', async (argsStr) => {
    const a = await audio();
    const v = argsStr.trim();
    if (!v) return `Reverb mix: ${a.getReverbMix().toFixed(2)}`;
    const n = Math.max(0, Math.min(1, parseFloat(v)));
    a.setReverbMix(n);
    return `Reverb mix set to ${n.toFixed(2)}`;
  });

  console.registerCommand('sfx-test', 'sfx-test [bus] — play all sounds in a bus (or all sounds)', async (argsStr) => {
    const a = await audio();
    const s = await sounds();
    const filterBus = argsStr.trim().toLowerCase() || null;
    const ids = s.allIds();
    let count = 0;
    let delay = 0;
    for (const id of ids) {
      const r = s.resolve(id);
      if (!r) continue;
      if (filterBus && r.bus !== filterBus) continue;
      if (r.file === 'weather_rain.mp3') continue; // skip loops
      a.play(r.url, {
        bus: r.bus,
        maxVoices: r.maxVoices,
        volume: r.volume,
        rate: r.rate,
        detune: r.detune,
        randomPitch: r.randomPitch,
        delay,
      });
      delay += 0.6;
      count++;
    }
    return `Playing ${count} sounds with 0.6s spacing${filterBus ? ` (bus: ${filterBus})` : ''}…`;
  });
}

function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
}

function describeStatSource(world, entityId) {
  // Corpse adaptation — co-located on the expression entity
  const ca = world.has(entityId, CorpseAdaptation)
    ? world.get(entityId, CorpseAdaptation) : null;
  if (ca) return `[corpse:${ca.source}]`;

  // Walk ancestors looking for proc package or named item
  const parts = [];
  let cursor = entityId;
  for (let depth = 0; depth < 8; depth++) {
    const parentId = getParent(world, cursor);
    if (!parentId) break;

    const pkg = world.has(parentId, ProcPackageNode)
      ? world.get(parentId, ProcPackageNode) : null;
    if (pkg?.packageId) parts.unshift(`proc:${pkg.packageId}`);

    const named = world.get(parentId, NamedIdentity);
    if (named?.name || named?.identity) {
      parts.unshift(named.name || named.identity);
    }

    cursor = parentId;
  }

  if (parts.length) return `[${parts.join(' > ')}]`;

  // Fallback: check the entity itself
  const named = world.get(entityId, NamedIdentity);
  if (named?.name) return `[${named.name}]`;
  if (named?.identity) return `[${named.identity}]`;
  return '';
}
