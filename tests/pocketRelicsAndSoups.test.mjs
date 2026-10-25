import './helpers/installContentCatalog.mjs';
import { assert, assertEquals } from 'jsr:@std/assert';
import { World } from '../src/lib/ecs-js/index.js';
import { createRng } from '../src/lib/ecs-js/rng.js';
import { Charges, Faction, Inventory, NamedIdentity, Player, Position, Stamina, Vitality } from '../src/rules/components/index.js';
import { Hunger } from '../src/rules/components/Hunger.js';
import { Mana } from '../src/rules/components/Mana.js';
import { UseIntent } from '../src/rules/components/Intents/UseIntent.js';
import { getCatalogItem } from '../src/rules/data/itemCatalog.js';
import { materializeDrop, resolveLootTable } from '../src/rules/data/lootResolver.js';
import { useItemSystem } from '../src/rules/systems/useItemSystem.js';
import { effectSystem } from '../src/rules/systems/effectSystem.js';
import { createItemById } from '../src/rules/utils/itemFactory.js';
import { addToInventory } from '../src/rules/utils/inventoryFacade.js';
import { snapshotEffectInstances } from '../src/rules/utils/effectInstances.js';
import { statusStrength } from '../src/rules/utils/statusFacade.js';
import { buildEffectRows } from '../src/main/ui/effectRows.js';
import { buildPalette } from '../src/display/palette/index.js';
import { clearAll, loadChunk } from '../src/rules/environment/dungeon/tileMap.js';
import { CHUNK_SIZE, TILE_FLOOR } from '../src/rules/environment/dungeon/constants.js';

const RELICS = ['bloodglass_hourglass', 'widows_spool', 'drowned_bell', 'brass_cricket'];
const SOUPS = ['food_pilgrim_stew', 'food_moonmilk_chowder', 'food_witchlight_broth'];

function setup() {
  clearAll();
  loadChunk(-1, -1, new Uint8Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_FLOOR));
  const world = new World({ seed: 621 });
  const actor = world.create();
  world.add(actor, Player, {});
  world.add(actor, Inventory, { capacity: 20 });
  world.add(actor, Position, { x: -8, y: -8 });
  world.add(actor, Faction, { key: 'player' });
  world.add(actor, Vitality, { hp: 40, maxHp: 100 });
  world.add(actor, Mana, { mana: 20, maxMana: 100 });
  world.add(actor, Stamina, { stamina: 0, maxStamina: 100, staminaRegen: 0 });
  world.add(actor, Hunger, { hunger: 500 });
  const target = world.create();
  world.add(target, NamedIdentity, { identity: 'goblin', name: 'Goblin' });
  world.add(target, Position, { x: -6, y: -8 });
  world.add(target, Faction, { key: 'enemy' });
  world.add(target, Vitality, { hp: 40, maxHp: 100 });
  world.setScheduler(effectSystem);
  const take = (id) => {
    const item = createItemById(world, id);
    assert(addToInventory(world, actor, item));
    return item;
  };
  const use = (itemId) => {
    let result;
    const off = world.on('interaction:result', (event) => { result = event; });
    world.add(actor, UseIntent, { itemId, targetId: target });
    useItemSystem(world);
    off();
    assert(result?.ok, result?.reason);
  };
  const turns = (count) => { for (let i = 0; i < count; i++) world.tick(1); };
  return { world, actor, target, take, use, turns };
}

Deno.test('all seven new items roll from ordinary tier loot and materialize with their authored glyphs', () => {
  const palette = buildPalette();
  for (const tier of [0, 1, 2, 3]) {
    const missing = new Set([...RELICS, ...SOUPS]);
    const world = new World({ seed: 622 });
    for (let seed = 1; seed <= 12000 && missing.size; seed++) {
      for (const drop of resolveLootTable(`drop:tier${tier}`, createRng(seed), tier * 5 + 1)) {
        const id = drop.params?.itemId;
        if (!missing.has(id)) continue;
        const item = materializeDrop(world, drop, { x: -3, y: -4 });
        assert(item > 0, `${id} must materialize from real loot`);
        assertEquals(world.get(item, NamedIdentity).identity, id);
        assertEquals(world.get(item, Position), { x: -3, y: -4 });
        assert(palette[id]?.glyph && palette[id]?.fg && palette[id]?.glow, `${id} needs a complete palette`);
        assertEquals(getCatalogItem(id).slot, 'bag');
        if (getCatalogItem(id).chargePool) assertEquals(world.get(item, Charges).current, getCatalogItem(id).chargePool.current);
        missing.delete(id);
      }
    }
    assertEquals([...missing], [], `tier ${tier} should reach every new item`);
  }
});

Deno.test('bloodglass keeps its paired price and reward under one persistent badge', () => {
  const { world, actor, take, use, turns } = setup();
  const presentations = [];
  world.on('script:present', (event) => presentations.push(event));
  use(take('bloodglass_hourglass'));
  assertEquals(buildEffectRows(world, actor).map((row) => [row.name, row.glyph]), [['Bloodglass Tithe', '⌛']]);
  assertEquals(presentations.length, 1);
  turns(6);
  assertEquals(world.get(actor, Vitality).hp, 34);
  assertEquals(world.get(actor, Mana).mana, 38);
  assertEquals(snapshotEffectInstances(world, actor), []);
});

Deno.test('widow spool stacks real targeted damage to three while consuming its own charges', () => {
  const { world, target, take, use, turns } = setup();
  const spool = take('widows_spool');
  for (let i = 0; i < 4; i++) { use(spool); turns(1); }
  assertEquals(world.get(target, Vitality).hp, 31); // 1 + 2 + 3 + 3
  assertEquals(world.get(spool, Charges).current, 2);
  assertEquals(snapshotEffectInstances(world, target).map((row) => row.stacks), [3]);
  turns(5);
  assertEquals(world.get(target, Vitality).hp, 16);
  assertEquals(snapshotEffectInstances(world, target), []);
});

Deno.test('drowned bell grants the same enemy both stun and healing, then removes both', () => {
  const { world, actor, target, take, use, turns } = setup();
  const bell = take('drowned_bell');
  use(bell);
  assertEquals(statusStrength(world, target, 'stunned'), 1);
  assertEquals(snapshotEffectInstances(world, actor), []);
  assertEquals(world.get(bell, Charges).current, 2);
  turns(3);
  assertEquals(world.get(target, Vitality).hp, 46);
  assertEquals(statusStrength(world, target, 'stunned'), 0);
  assertEquals(snapshotEffectInstances(world, target), []);
});

Deno.test('cricket windings overlap as independent songs and expire on separate turns', () => {
  const { world, actor, take, use, turns } = setup();
  const cricket = take('brass_cricket');
  use(cricket);
  turns(2);
  use(cricket);
  const rows = buildEffectRows(world, actor);
  assertEquals(rows.map((row) => row.turns), [4, 6]);
  assert(rows[0].instanceId !== rows[1].instanceId);
  turns(4);
  assertEquals(snapshotEffectInstances(world, actor).map((row) => row.turns), [2]);
  turns(2);
  assertEquals(world.get(actor, Stamina).stamina, 36);
  assertEquals(world.get(actor, Vitality).hp, 34);
  assertEquals(world.get(cricket, Charges).current, 2);
  assertEquals(snapshotEffectInstances(world, actor), []);
});

Deno.test('soups feed normally and their composite effects outlive the eaten bowl', () => {
  for (const [id, duration, hp, mana, stamina] of [
    ['food_pilgrim_stew', 60, 52, 20, 40],
    ['food_moonmilk_chowder', 24, 56, 14, 0],
    ['food_witchlight_broth', 12, 36, 38, 0],
  ]) {
    const { world, actor, take, use, turns } = setup();
    const bowl = take(id);
    use(bowl);
    assert(!world.isAlive(bowl), `${id} must be eaten`);
    assertEquals(world.get(actor, Hunger).hunger, 500 - getCatalogItem(id)._contentFood.consumable.effectParams.nutrition);
    assertEquals(buildEffectRows(world, actor).map((row) => row.glyph), ['♨']);
    turns(duration);
    assertEquals(world.get(actor, Vitality).hp, hp, id);
    assertEquals(world.get(actor, Mana).mana, mana, id);
    assertEquals(world.get(actor, Stamina).stamina, stamina, id);
    assertEquals(snapshotEffectInstances(world, actor), []);
  }
});

Deno.test('a second pilgrim bowl refreshes one supper instead of duplicating recovery', () => {
  const { world, actor, take, use, turns } = setup();
  use(take('food_pilgrim_stew'));
  turns(5);
  const instanceId = snapshotEffectInstances(world, actor)[0].instanceId;
  use(take('food_pilgrim_stew'));
  assertEquals(snapshotEffectInstances(world, actor).map((row) => [row.instanceId, row.turns]), [[instanceId, 60]]);
  turns(5);
  assertEquals(world.get(actor, Vitality).hp, 42);
});
