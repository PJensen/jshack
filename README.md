![JSHack logo](https://raw.githubusercontent.com/PJensen/JSHack/refs/heads/master/logo.jpg)

[🎮 Play JSHack](https://jshack.net/) · [GitHub Pages fallback](https://pjensen.github.io/JSHack/)

[![NW.js Release](https://github.com/PJensen/JSHack/actions/workflows/release-nwjs.yml/badge.svg)](https://github.com/PJensen/JSHack/actions/workflows/release-nwjs.yml) [![CI](https://github.com/PJensen/JSHack/actions/workflows/deno.yml/badge.svg)](https://github.com/PJensen/JSHack/actions/workflows/deno.yml)

**A mobile-first roguelike built to be played, studied, and hacked.**

Pure JavaScript. Zero dependencies. No build step. Serve the folder, open the page, and play. Edit a file, refresh, and the world changes.

JSHack is both a game and a living source artifact: transparent enough to inspect, simple enough to modify, and strange enough to keep surprising you.

---

## What is JSHack?

JSHack is a turn-based roguelike about surviving a strange, reactive world one tile at a time.

It chases the lost spirit of older games: consequence, improvisation, mystery, and systems that surprise you back. The difference is that JSHack is built for now: phone-first, browser-native, quick to enter, and dense enough that the dungeon still has secrets after the hundredth run.

You are choosing when to fight, when to run, when to drink the questionable potion, when to sell the loot, when to pray, and when to head back underground.

A run should make sense in your hand: tap to move, swipe into inventory, double-tap to grab what is underfoot, pinch the map when you need a better read. Keyboard controls are there because roguelike players deserve them, but touch is the primary interface.

---

## Design promise

JSHack is built around readable chaos.

The world should feel systemic, but not opaque. Items should interact. Monsters should behave strangely. Town choices should echo later. A good run should leave behind a story that feels discovered, not scripted.

The goal is not nostalgia for old roguelikes as they were. The goal is to recover what made them dangerous and alive, then rebuild that feeling for modern play.

JSHack is still growing quickly, but it is already a game with enough moving parts to reward player judgment. The technical obsession exists to serve one thing: a world that keeps reacting after the first obvious answer fails.

---

## What you do

* Explore procedural dungeons and an overworld village.
* Fight monsters with melee weapons, thrown items, spells, pets, traps, and whatever else you can bend into a tactic.
* Loot, identify, equip, curse, bless, buy, sell, eat, drink, apply, throw, and craft items.
* Manage hunger, carrying weight, mana, status effects, weather, fire, faction trouble, deity favor, and town economy consequences.
* Learn the map through field of view, fog of war, memory, messages, and risk.
* Survive long enough for your build to become a story.

---

## Current game surface

* **9 classes**: Warden, Druid, Outlaw, Archeologist, Warlock, Mage, Mireborn, Pilgrim, and Cleric.
* **58 monsters**: rats and goblins up through dragons, mind flayers, serpentine multi-tile creatures, mimics, undead, bugs, spellcasters, and stranger dungeon ecology.
* **338 catalog items**: 215 equipment entries, 105 magic items, food, materials, seeds, tools, gems, wands, scrolls, potions, weapons, and armor.
* **64 spells**: destruction, support, summoning, teleportation, channeling, class abilities, monster magic, wands, scrolls, and gear-driven spell interactions.
* **Combat**: D&D-style attack rolls, armor class, crits, damage types, resistances, shields, dual wielding, 34 affixes, status procs, gaze attacks, and spell crits.
* **World simulation**: 12 townfolk roles, shops, economy chains, farming, seasons, lunar calendar, weather, plant growth, fire spread, and harvestable resources.
* **Dungeon play**: multi-floor procedural dungeons, biome slices, traps, boulder puzzles, chests, stairs, FOV, exploration memory, monster spawners, and 69 status/effect definitions.
* **Character pressure**: hunger, encumbrance, cursed equipment, unidentified items, pets with behavior, deity boons and wrath, and a score system.

---

## Getting Started

### Play it in 30 seconds

```bash
git clone https://github.com/PJensen/JSHack.git
cd JSHack
python3 -m http.server 8000
# Open http://localhost:8000
```

Any static HTTP server works because ES modules need to be served over HTTP, not opened as `file://` URLs.

No `npm install`. No `npm run build`. Just serve and play.

---

## Controls

### Touch / mobile

* **Tap screen sides**: Move in that direction
* **Double-tap**: Pick up items at your feet
* **Pinch**: Zoom in/out
* **Swipe right**: Open inventory
* **Swipe down**: Open message log

### Keyboard

* **Arrow keys / WASD / HJKL**: Move
* **. (period)**: Wait a turn
* **, (comma)**: Pick up items
* **Q**: Drink a potion
* **+/- (or numpad)**: Zoom in/out
* **0**: Reset zoom
* **X**: Camera shake demo

---

## Performance tuning

On older phones or when you want better framerates, add URL params:

```text
index.html?quality=low    # Fast mode: no glow, fewer particles
index.html?quality=high   # Full eye candy
index.html?dprCap=1       # Force 1x pixel density for a speed boost
```

These only affect visuals. The deterministic simulation stays identical.

---

## Why this is different

### Mobile-first, touch-first

This is not a desktop roguelike squeezed onto a phone. Touch controls are primary. The game is designed for thumbs, short sessions, and readable decisions on a small screen.

Keyboard works too, because roguelike players deserve it.

### Deterministic and replayable

Every run is seeded. Same seed plus same inputs means same outcome, every time.

That makes bugs replayable, tests stable, and interesting seeds shareable.

```js
const world = new World({ seed: 0xDEADBEEF });
world.tick(1); // Perfectly reproducible
```

### Zero build step, zero dependencies

No npm. No webpack. No babel. No TypeScript. Just pure ES modules that run directly in the browser.

Serve the folder, open the page, and play. Edit `src/rules/systems/movementSystem.js`, refresh, and your changes are live.

### ECS architecture you can actually see

JSHack is built on a clean Entity-Component-System architecture. Not hidden behind abstractions. You can see exactly how entities, components, and systems work.

* **Entities** are IDs.
* **Components** are plain objects.
* **Systems** are functions that query and modify components.

No framework ceremony. No magic. Just composable logic.

### One file = one idea

Every file has a single, clear purpose.

Want to change movement? Open [movementSystem.js](src/rules/systems/movementSystem.js).

Want to add a monster? Create an archetype in [Creatures.js](src/rules/archetypes/Creatures.js).

The codebase is organized for humans, agents, and curiosity — not bundlers.

### Rules and display stay separate

The deterministic simulation lives in `rules/`. Rendering, particles, camera, UI, and input live in `display/`. They talk through `bridge/`.

The rules layer has zero DOM, zero rendering, and zero async code. It is pure, testable game logic. The display layer consumes stable snapshots and renders them.

See [SEPARATION_MANIFEST.md](docs/arch/SEPARATION_MANIFEST.md) for the philosophy.

### Built to be hacked

JSHack is a playground. Open your console, poke around, break things, fix them.

Every decision prioritizes hackability:

* No transpilation
* No bundling
* No frameworks
* No hidden build system
* No mysterious runtime layer

If you can `console.log` it, you can understand it.

---

## How it works

### The 30-second architecture tour

```text
src/
  rules/     — Pure deterministic simulation
  bridge/    — Stable contract between rules and display
  display/   — Rendering, particles, camera, input handling
  main/      — Application wiring
```

Rules never import Display. Display never imports Rules. They communicate through Bridge contracts.

This keeps the simulation deterministic while letting the presentation layer move freely.

### Turn-based simulation

Strict turn order:

```text
player acts → monsters act → effects trigger → cleanup runs → back to player
```

Actions that consume a turn:

* Moving one tile
* Attacking something
* Using an item
* Waiting

### Combat rules

Combat uses D&D-style rolls:

```text
Attacker rolls: d20 + attackBonus
Target has: armorClass

Hit if roll ≥ AC
Natural 1: always miss
Natural 20: always crit

Damage: roll(minDamage, maxDamage) - defense
```

Equipment modifies your stats. Affixes add special effects. Crits matter.

### Systems run in phases

Systems are organized into three phases:

1. **intents**: AI, player input, movement, combat, interactions
2. **effects**: status effects, equipment bonuses, hunger, mana regen, spawners
3. **cleanup**: dead entity removal, spatial index updates, end-of-turn maintenance

See [scheduler.js](src/main/scheduler.js) for the full registration order.

Systems never call other systems directly. They emit events instead.

### Action transactions vs intents

JSHack also has a rules-layer action transaction utility at `src/rules/interaction/mutations.js` for commit-or-cancel behavior inside item use, apply, and eat actions.

Use **intents + phases** for system ordering and turn flow.

Use **action transactions** only for local all-or-nothing mutation batches inside a single action resolver.

Do not treat action transactions as a second scheduler or engine queue. ECS-js remains the only engine-level deferred command system.

### Components are just frozen objects

```js
export const Position = Object.freeze({
  x: 0,
  y: 0,
});

export const Vitality = Object.freeze({
  hp: 10,
  maxHp: 10,
});
```

No classes. No inheritance. Just data.

### Archetypes spawn entities

```js
import { Goblin } from './rules/archetypes/Creatures.js';
import { createFrom } from './lib/ecs-js/archetype.js';

const goblinId = createFrom(world, Goblin, { x: 10, y: 10 });
```

Archetypes are templates. Spawn as many as you want. Modify their components. They are just entities.

---

## Hacking on JSHack

### Make a new monster in 2 minutes

1. Open [src/rules/archetypes/Creatures.js](src/rules/archetypes/Creatures.js)
2. Copy an existing monster definition
3. Change the stats, XP, glyph, name, and behavior
4. Refresh your browser
5. Your monster spawns

No compilation. No bundling. Just edit and refresh.

### Add a new system

Create `src/rules/systems/mySystem.js`:

```js
export function mySystem(world, dt) {
  for (const [id, pos, thing] of world.query(Position, Thing)) {
    // Your logic here
  }
}
```

Register it in [src/main/scheduler.js](src/main/scheduler.js):

```js
import { mySystem } from '../rules/systems/mySystem.js';

registerSystem(mySystem, 'intents'); // or 'effects' or 'cleanup'
```

Refresh the browser. Your system runs every tick.

### Debug with determinism

```js
// In your browser console
const world = new World({ seed: 0xC0FFEE });

// Set up your scenario...
world.tick(1);
world.tick(1);

// Same seed, same setup, same result.
```

Replay bugs. Share seeds. Build regression tests. Determinism is your superpower.

### Emit events, not calls

Systems communicate via events, never direct calls:

```js
// Good: emit an event
world.emit('combat:hit', { attackerId, targetId, damage });

// Bad: call another system
combatSystem(world, dt);
```

Events keep the scheduler in control and execution order predictable.

---

## What's inside?

### Core features

* **Turn-based roguelike gameplay** — dungeon survival, overworld trouble, and systems that collide in useful ways
* **9 character classes** — Warden, Druid, Outlaw, Archeologist, Warlock, Mage, Mireborn, Pilgrim, Cleric
* **Monster AI** — 10-level intelligence tiers driving pack alerting, retreat, ambush, and scurry
* **58 monsters across dungeon tiers** — rats to dragons, with flying creatures, mimics, serpentine multi-tile creatures, spellcasters, death hooks, and gaze attacks
* **Item system** — 338 catalog items including potions, scrolls, weapons, armor, wands, gems, food, seeds, and crafting materials
* **Magic system** — 64 spells across destruction, support, summoning, teleportation, class, monster, and item-driven magic
* **Dual-wielding** — equip two one-handed weapons with offhand penalties
* **Equipment** — canonical gear slots with affix modifiers
* **Status effects** — 69 effect definitions including poison, burn, regen, stun, berserk, curse, confusion, paralysis, and more
* **Hunger and survival** — eat food or suffer; carry weight and encumbrance matter
* **Deity favor** — worship gods, gain boons, invoke wrath, and deal with ascetic and dietary tracking
* **Pet companions** — they follow, fight, and have opinions
* **Overworld village** — 12 NPC townfolk roles with scheduled daily routines and an economy chain
* **Weather system** — rain and heavy rain with gameplay effects
* **Calendar** — 13 lunar months, 8 moon phases, archaic week, 4 seasons
* **Plant growth and farming** — crops grow through visual stages and harvestable resources regrow
* **Quests** — quest system with NPC quest givers and economy-driven objectives
* **Crafting** — alchemy bench, smithing window, cooking with stateful furnace
* **Traps** — pressure plates, arrow traps, spike pits, and disarming
* **Shops** — buy and sell items with appraisal pricing
* **Dungeon generation** — procedural levels with biome slices, Perlin noise, and boulder puzzles
* **FOV and exploration** — shadowcasting visibility, fog of war, lantern vision
* **Identification and curses** — unidentified items and cursed gear
* **Score system** — your performance is quantified
* **Fire spread** — flames propagate and can be extinguished by rain

### Emergent simulation mechanics

The rules layer is designed so systems interact instead of resolving as isolated
set pieces. A single turn can move an item through several material states,
change the shape of a creature, alter a town's food supply, and change how a
deity treats the player. Every outcome still comes from the seeded ECS
simulation, so surprising events are reproducible.

* **Water changes what you carry** — Dipping a metal item can rust it; paper and
  scrolls waterlog and can be ruined; potions dilute and fizzle; food becomes
  soggy and loses nutrition; and a swollen wooden wand can misfire instead of
  discharging.
* **Fire, gas, and weather form a connected hazard system** — A torch or flame
  can ignite nearby gas. Fire then spreads stochastically across webs, trees,
  fences, doors, and roof-bearing structures. Rain extinguishes active flames,
  and can restore burned roof structures from the destruction ledger while also
  watering crops.
* **Monsters can change topology** — Killing any segment of a giant centipede
  unlinks the body and promotes the tail-side segment into a new hunting head,
  complete with its own chain and AI state. A creature encounter can therefore
  become two independent threats.
* **The battlefield remembers blood** — Blood pools heal living creatures in
  their radius, but deal holy damage to undead. Hazard tiles are simulation
  participants, not just visual effects.
* **Bargains have teeth** — Ratatoskr is a roaming messenger who can offer a
  legendary item, but accepting the bargain makes the item cursed and applies a
  long-lived curse to the buyer.
* **Deities respond to how and where you act** — Standing reacts to kill streaks
  and spell schools as well as offerings, worship, and creature tags. Near a
  shrine, that standing scales combat damage with distance: favor strengthens
  you closest to the shrine, while wrath becomes a liability.
* **The town is a supply chain** — Wheat is milled into flour, townfolk haul
  supplies between work sites, and the tavern turns flour + firewood + water +
  a kitchen knife into stew. Those stores feed villagers, shortages affect town
  pressure, and weather changes the pace of production.
* **Smart monsters use trained policies** — High-INT mobs can replace basic
  chase behavior with a tiny neural policy that chooses movement, spells, or
  ranged attacks from local state. Its weights are trained in deterministic,
  headless arena mini-simulations and then run inside the ECS rules phase.

### Developer tools

* **Deterministic replay** — seeded RNG for reproducibility
* **Rules profiler** — per-system timing with `?rulesProfile=1`
* **Event system** — inter-system communication without coupling
* **Spatial indexing** — fast radius queries for AI and effects
* **Script system** — attach behavior to entities without hardcoding
* **Hot reload** — edit JS, refresh browser, see changes instantly
* **2,003 tests** across 344 test files — Deno-powered, deterministic, no flakes
* **PWA** — installable on mobile, no app store required
* **Debug console** — spawn monsters, inspect state, and reuse prior commands

### Content

* **85 systems** — movement, combat, AI, items, effects, weather, economy, crafting, spawning, cleanup
* **129 component modules** — Position, Vitality, Inventory, Brain, Equipment, WeatherState, CalendarState, TownfolkJob, and more
* **16 archetype files** — Player, Creatures, Items, Tiles, Doors, Stairs, Traps, Food, TownGoods, Overworld, and more
* **64 spells** — lightning, meteor, blizzard, firestorm, shadow bolt, healing, summoning, teleportation, class abilities, and monster magic
* **58 monsters** — rats and goblins up through dragons, mind flayers, mimics, serpentine multi-tile creatures, and ancient wyrms
* **338 catalog items** — equipment, magic entries, food, materials, seeds, tools, gems, weapons, armor, potions, scrolls, and wands
* **12 NPC townfolk roles** — farmer, smith, miner, barkeep, herbalist, and more
* **4-deity pantheon** — gods with unique mechanics, dietary tracking, and ascetic hooks
* **34 affixes and 69 effects** — proc gear, resistances, status pressure, and build-defining item behavior

All data-driven. All modifiable. All in plain JavaScript files.

---

## Project structure

```text
JSHack/
├── index.html              # Entry point
├── src/
│   ├── rules/              # Pure deterministic simulation
│   │   ├── systems/        # 85 game logic systems
│   │   ├── components/     # 129 component modules
│   │   ├── archetypes/     # Entity templates
│   │   ├── scripts/        # Behavior hooks
│   │   ├── data/           # Spells, monsters, items, loot tables, calendar
│   │   ├── quests/         # Quest definitions and runtime
│   │   ├── content/        # Interactions, dialog, NPC behaviors
│   │   └── environment/    # Dungeon generation, overworld, FOV, tiles
│   ├── bridge/             # Rules ↔ Display contract
│   │   └── schema/         # WorldView, MapView DTOs
│   ├── display/            # Rendering and presentation
│   │   ├── passes/         # Render pipeline
│   │   ├── fx/             # Weather, projectile, cloud, spell area VFX
│   │   ├── camera/         # Camera controller, follow, shake, zoom
│   │   ├── input/          # Touch and keyboard input routing
│   │   ├── ui/             # HUD, inventory, messages, overlays
│   │   └── palette/        # Visual mappings
│   ├── main/               # Application wiring
│   │   ├── scheduler.js    # System registration and phases
│   │   └── input/          # Input → Intent conversion
│   ├── shared/             # Pure utilities
│   └── lib/                # Vendored libraries
├── tests/                  # 344 test files, 2,003 tests
├── reference/              # Demos and examples
└── AGENTS.md               # Guide for AI/autonomous agents
```

Import boundaries enforce separation. Rules cannot import Display. Display cannot import Rules. Bridge is the contract.

See [SEPARATION_MANIFEST.md](docs/arch/SEPARATION_MANIFEST.md) for details.

---

## Philosophy

This project believes in:

* **Zero build steps** — pure ES modules, instant feedback
* **Determinism** — seeded RNG, reproducible runs, testable logic
* **Transparency** — no frameworks, no magic, readable code
* **Hackability** — one file = one idea, easy to modify
* **Mobile-first design** — touch is primary, phones are the platform
* **Fun** — hacking, exploring, breaking, fixing, and letting the game stay weird

This project avoids:

* Build tools
* Frameworks
* Dependencies
* TypeScript
* Node runtime requirements
* Backwards compatibility rituals
* Art asset pipelines

Every glyph is Unicode. Zero sprites. Zero textures. Zero asset pipeline.

**If you can't `console.log` it and understand it immediately, something is wrong.**

For more on why this project rejects the modern web toolchain, read [The Modern Web is a UX Crime Scene](https://pjensen.substack.com/p/the-modern-web-is-a-ux-crime-scene).

JSHack shows what native browser tooling can do on its own — and what agentic AI development looks like when the codebase is simple enough for both humans and agents to reason about.

---

## Advanced topics

### Status effects

Apply effects to entities:

```js
const effects = world.get(entityId, ActiveEffects) || { effects: [] };

effects.effects.push({
  key: 'poison',
  turnsLeft: 5,
  potency: 2,
});

world.set(entityId, ActiveEffects, effects);
```

Effects tick automatically. Poison damages. Regen heals. Stun stuns. Current statuses are mirrored to the `Status` component each tick for easy querying.

### Scripting system

Attach behavior to entities without hardcoding systems:

```js
// In src/rules/scripts/myScript.js
import { registerScript, ScriptVerb } from '../scripting.js';

registerScript('lightning_wand', {
  [ScriptVerb.ItemUse]: (world, ctx) => {
    const { userId, targetX, targetY } = ctx;

    // Zap logic here
    world.emit('damage', { id: targetId, amount: 10 });
  }
});

// Attach to entity
world.set(wandId, ScriptRef, { ref: 'lightning_wand' });
```

Scripts respond to verbs such as `spell:cast`, `item:use`, `trap:trigger`, and `affix:onHit`.

### Event system

Systems communicate through events:

```js
// System A emits
world.emit('combat:hit', { attackerId, targetId, damage });

// System B listens once at startup
const INSTALLED = Symbol.for('jshack:combatLogger:installed');

if (!world[INSTALLED]) {
  world[INSTALLED] = true;

  world.on('combat:hit', ({ attackerId, targetId, damage }) => {
    console.log(`Entity ${attackerId} hit ${targetId} for ${damage} damage`);
  });
}
```

Events flow through the world. Systems stay decoupled. Order remains predictable.

### Spatial queries

Fast radius queries support AI, explosions, and area effects:

```js
import { forEachInRadius } from './rules/utils/spatialIndex.js';

forEachInRadius(world, x, y, radius, (entityId) => {
  // Apply damage, effects, etc.
});
```

The spatial index is maintained automatically by `spatialIndexSystem` in the cleanup phase.

---

## Testing

Deno is used for testing:

```bash
deno test --allow-read tests/
deno run tests/movementSystem.test.js
```

Performance and headless simulation:

```bash
deno task bench
deno task headless --turns 500 --report-every 100
```

Headless runtime details and action-schedule format:

* [docs/headless-runtime.md](docs/headless-runtime.md)

Tests are simple:

```js
import { World } from '../src/lib/ecs-js/index.js';
import { movementSystem } from '../src/rules/systems/movementSystem.js';

const world = new World({ seed: 42 });

// Set up scenario...
movementSystem(world, 1);

// Assert result...
```

Deterministic seeds mean tests are reproducible. No flaky tests. No "works on my machine."

---

## Contributing

Contributions that align with the project's vision are welcome.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, guidelines, and expectations.

The short version: keep it simple, test your changes, and do not break the constraints in [TEN_COMMANDMENTS.md](docs/arch/TEN_COMMANDMENTS.md).

---

## For AI agents and copilots

If you are an autonomous agent or LLM-based copilot reading this:

**Read [AGENTS.md](AGENTS.md) first.**

It has the operating rules for this codebase.

Key constraints:

* ECS-js is external; only fix genuine bugs.
* No system-to-system calls; use events with Symbol tracking.
* Mobile-first always.
* Rules and display stay separated.
* Deno, not Node.

---

## Resources

### Documentation

* [AGENTS.md](AGENTS.md) — Guide for AI agents and autonomous operators
* [TEN_COMMANDMENTS.md](docs/arch/TEN_COMMANDMENTS.md) — Project philosophy and constraints
* [SEPARATION_MANIFEST.md](docs/arch/SEPARATION_MANIFEST.md) — Layer boundaries and import rules
* [ecs-js](http://github.com/pjensen/ecs-js) — Canonical ECS library
* [ecs-js README](src/lib/ecs-js/README.md) — Vendored ECS core API docs
* [ecs-js AGENTS.md](src/lib/ecs-js/AGENTS.md) — ECS-specific guidance

### Inspiration

* [Roguelike Development Guide](http://www.roguebasin.com/)
* [ECS Architecture](https://en.wikipedia.org/wiki/Entity_component_system)
* Classic roguelikes, especially the parts that make player choice, consequence, and improvisation matter

---

## License

Human-Scale Source License (HSSL) v1.2

See [LICENSE](LICENSE) for terms.

---

## Why JSHack?

Because mobile deserves real roguelikes, not watered-down ones.

Because JavaScript can still be immediate, readable, and powerful without a tower of tooling.

Because deterministic simulations are beautiful.

Because the old dungeon feeling — danger, consequence, improvisation, mystery — still works.

Because hacking should be fun.

**Serve the folder. Edit a file. Refresh. Hack.**

---

JSHack is built through agentic development: a human directs the architecture, taste, constraints, and iteration; AI agents do the implementation work.

Agentic development demands architecture, judgment, and relentless iteration. When the codebase is simple enough for both humans and agents to reason about, it works.

**Follow development:** [hackjs.substack.com](http://hackjs.substack.com/)

---

*Built with ☕ `0xC0FFEE` and pure JavaScript.*
