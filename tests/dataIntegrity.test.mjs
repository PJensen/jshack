import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals } from "jsr:@std/assert";
import { SPELL_DEFS, getSpell, listSpells } from '../src/rules/data/spells.js';
import { ITEM_CATALOG, getCatalogItem, listCatalogItems } from '../src/rules/data/itemCatalog.js';
import { getAffix, listAffixEntries, listAffixes } from '../src/rules/data/affixes.js';
import { getAllMonsters } from '../src/rules/data/monsters.js';
const MONSTERS = getAllMonsters();
import { registerScript, runScript, listRegisteredScripts, ScriptVerb } from '../src/rules/scripting.js';

Deno.test("spell definitions are valid", () => {
  assert(Object.keys(SPELL_DEFS).length > 0, 'SPELL_DEFS should not be empty');

  for (const [id, spell] of Object.entries(SPELL_DEFS)) {
    assert(spell.id === id, `spell key ${id} should match spell.id ${spell.id}`);
    assert(typeof spell.name === 'string' && spell.name.length > 0, `spell ${id} must have name`);
    assert(typeof spell.manaCost === 'number' && spell.manaCost >= 0, `spell ${id} must have non-negative manaCost`);
  }

  assert(getSpell('lightning') !== null, 'getSpell should find lightning');
  assert(getSpell('nonexistent') === null, 'getSpell should return null for missing');
  assert(listSpells().length === Object.keys(SPELL_DEFS).length, 'listSpells length should match');
});

Deno.test("martial scaling profiles are explicit in the spell catalog", () => {
  const ids = listSpells().filter((spell) => spell.scaling === 'martial').map((spell) => spell.id).sort();
  assertEquals(ids, [
    'charge', 'cheap_shot', 'cleave', 'death_volley', 'goblin_dirty_trick',
    'holy_strike', 'rend', 'savage_strike', 'shield_bash',
  ]);
});

Deno.test("item catalog definitions are valid", () => {
  assert(Object.keys(ITEM_CATALOG).length > 0, 'ITEM_CATALOG should not be empty');

  for (const [id, item] of Object.entries(ITEM_CATALOG)) {
    assert(item.id === id, `item key ${id} should match item.id`);
    assert(typeof item.name === 'string' && item.name.length > 0, `item ${id} must have name`);
    assert(typeof item.type === 'string', `item ${id} must have type`);
    assert(typeof item.catalogKind === 'string' && item.catalogKind.length > 0, `item ${id} must have catalogKind`);
    assert(typeof item.material === 'string' && item.material.length > 0, `item ${id} must have material`);

    // Items that are inventory objects and not purely metadata (e.g. scripts) must declare weight.
    const shouldHaveWeight = [
      'equip', 'weapon', 'armor', 'potion', 'scroll', 'learn', 'book', 'wand',
      'tool', 'food', 'material', 'seed', 'ingredient', 'ring', 'neck', 'belt',
      'gloves', 'legs', 'head', 'offhand', 'ammo', 'currency'
    ].includes(item.type) || ['magic', 'equipment', 'food', 'material', 'seed', 'ingredient'].includes(item.catalogKind);

    if (shouldHaveWeight) {
      assert(typeof item.weight === 'number' && item.weight > 0, `item ${id} should have positive numeric weight`);
    }
  }

  assert(getCatalogItem('book_lightning') !== null, 'getCatalogItem should find book_lightning');
  assert(getCatalogItem('nonexistent') === null, 'getCatalogItem should return null for missing');
  assert(listCatalogItems().length === Object.keys(ITEM_CATALOG).length, 'listCatalogItems length should match');
});

Deno.test("blunt weapon and skeleton vulnerability data are wired", () => {
  const bluntIds = [
    'iron_mace',
    'morningstar',
    'flail',
    'warhammer',
    'stormtouched_mace',
    'warhammer_of_fury',
    'smoldering_club',
    'pyreheart_mace',
    'howling_maul',
  ];

  for (const id of bluntIds) {
    const item = ITEM_CATALOG[id];
    assert(item && item.damageType === 'blunt', `${id} should declare damageType='blunt'`);
  }

  const skeletalIds = ['skeleton_archer', 'bone_bowman', 'skeleton', 'skeletal_marksman', 'skeleton_sharpshooter'];
  for (const id of skeletalIds) {
    const def = MONSTERS.find((m) => m.id === id);
    const bluntMult = Number(def?.resistances?.kinetic?.bluntMult ?? 1);
    assert(bluntMult > 1, `${id} should be vulnerable to blunt damage`);
  }
});

Deno.test("affix definitions are valid", () => {
  const entries = listAffixEntries();
  assert(entries.length > 0, 'affix registry should not be empty');

  for (const { id, record: affix } of entries) {
    if (id.startsWith('test_')) continue;
    assert(typeof affix.name === 'string', `affix ${id} must have name`);
    assert(Array.isArray(affix.slots), `affix ${id} must have slots array`);
    assert(typeof affix.triggerScripts === 'object', `affix ${id} must have triggerScripts object`);
    assert(typeof affix.weight === 'number', `affix ${id} must have numeric weight`);
  }

  assert(getAffix('fierce') !== null, 'getAffix should find fierce');
  assert(getAffix('nonexistent') === null, 'getAffix should return null for missing');
  assert(listAffixes().length >= entries.length, 'listAffixes should return all');
});

Deno.test("scripting registry works", () => {
  let called = false;
  registerScript('test:data_integrity', {
    ['test:verb']: (_world, ctx) => { called = true; ctx.result = 42; }
  });

  const ctx = {};
  runScript('test:data_integrity', 'test:verb', null, ctx);
  assert(called, 'registered script should be callable');
  assert(ctx.result === 42, 'script should mutate context');

  runScript('nonexistent:key', 'test:verb', null, {});

  const scripts = listRegisteredScripts();
  assert(scripts.includes('test:data_integrity'), 'registered script should appear in list');
});
