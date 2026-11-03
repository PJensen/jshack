# The Story of JSHack

*A truthful account of how a roguelike got built, almost didn't, got rebuilt, almost didn't again, and came back different.*

---

## The Game That Arrived Already Assembled

October 15th, 2025. The first commit is called "init," which is the lie every project tells at its own birth. This wasn't a beginning — it was a reveal. The game arrived in the repository already breathing: an overworld with Perlin noise terrain, mountains clustered by noise function, water at the edges, grass shaded in subtle variations. Stairs that descend into dungeons. Fog of war. An inventory. Auto-pickup that persists between sessions. Game-over tombstones saved to localStorage. Fountains, altars, thrones, sinks, graves — all with basic interactions. Gold. Rings. A shield. Lightning that rendered as canvas glow lines with endpoint sparks instead of the ASCII characters everyone else used.

The README was polished. The philosophy was articulated: *hackable, transparent, fun.* Zero dependencies. No build step. Edit a file, hit refresh, see your changes. "This is JavaScript the way it was meant to be." The favicon was already a custom inline SVG.

Someone had been building this privately, getting it to a point they were proud of, and then decided to let it be a thing that exists in the world. The "init" commit is a door being opened, not a foundation being laid.

---

## The Decision

Two days later, at 12:48pm on a Friday, a commit message reads: *"moving to modular arch + ecs."*

The diff tells the story. The entire contents of `index.html` — three thousand lines of JavaScript, all of it working — gets moved to `reference-implementation.html`. Not deleted. Preserved. Then four new files appear: `src/ecs/core.js`, `src/ecs/archetype.js`, `src/ecs/hierarchy.js`, `src/ecs/serialization.js`. And a new `src/main.js`, one hundred and seven lines.

This is a developer who has been here before. They know what a 3,000-line monolith becomes in three months. They knew it on day two. The original is kept because you might need to look back at how something worked, but the architecture it represents is not the future. A new ECS foundation is built from scratch, cleanly, with the old thing still visible through the window for reference.

The discipline of that decision — to throw away working code in order to build the right thing — is the first sign of what this project actually is.

---

## The First Good Week

The ECS rebuild goes well. Player component, data scaffolding, archetypes: Explorer, Threat, WorldAnchor, Ephemeral. Projectile and lifetime systems wired in. Bresenham's line algorithm added early, because line-of-sight is coming and you want the math ready. Movement. Camera. The event bus.

On October 22nd, everything is working well enough that the developer can be playful. A "dumb nightly delight" gets committed: when gold is picked up, another gold coin spawns at a random location somewhere in the dungeon. No good reason for this. It made the developer laugh. It got committed. The commit message says as much: *"Dumb nightly delight: when gold is picked up, spawn another gold in a random location."* This is someone enjoying themselves.

That evening, the lighting starts.

---

## The First Trap

October 23rd. The commits tell the story without needing interpretation:

*"lighting early"* → *"shadows"* → *"smooth lighting"* → *"smoothing"* → *"tightening radial FOV"* → *"item shad opposite source"* → *"light-grid-update"* → *"wall-wall"*

Eight commits. One day. Every single one is about light. No gameplay was added. The game does not become more fun to play on October 23rd. But the lighting looks good.

October 24th: two commits called *"night-night."* The developer is working late. The lighting is consuming the nights. There are also commits called *"organizing"* and *"perf-test"* — the kind of commits that appear when you've been deep in something long enough that you need to tidy around yourself just to see straight.

The Ten Commandments document, which will be written five days later, names this date explicitly. *"Oct 23, 2025: 564 lines of lighting infrastructure in one evening."* The line count was remembered. These things leave marks.

---

## The Incident

October 25th is the most interesting day in the repository.

It starts productively. The dungeon generator appears: *"dungeon-gen-0."* Then *"d-gen-2"*. Then *"d-gen-3."* Then *"d-gen-4."* Then *"d-gen-5-tor."* Five iterations of the dungeon generator, each better than the last, across a single afternoon. This is good work. This is exactly what should be happening.

And then.

Fog of war. Combat basics. A target dummy. Hallucination mode (added and immediately disabled — *"disable hallu on start"* — it was too much). Float text with motion presets. Torches — emitter system, emitter wiring, emitter tweaks, then the torch archetype itself. Flickering improved. Darkening applied at distance. No light far away. Walls interacting with lights. Mobile device scaling. Pixelated rendering mode. Fog of war again. FOV toggle. A second renderer pass. Doors. ECS backport for doors. A wall-line renderer.

And then the commit messages start changing.

*"cb." "cb." "cb." "cb."*

Then:

*"a." "a." "a." "a." "a." "a."*

Six commits. All single letters. The developer is in a flow state. Something interesting is being solved. The problem is that the interesting thing being solved is an engine problem, not a game problem.

The Ten Commandments would later call this "the commit message canary." Commandment VI: *"When commit messages degrade to single letters, you are in a flow state solving the wrong problem. Stop. `git stash`. Walk away. Come back and ask: is this a game feature or an engine feature? If it's engine, kill it."*

The canary was singing. Nobody stopped.

October 26th: more single-letter commits.

---

## The Reset

Tuesday, October 28th, 5:50pm.

*"project reset, key concepts retained offline"*

159 files changed. 774 lines added. 12,924 lines deleted.

In the same push, two new files appear: `TEN_COMMANDMENTS.md` and `.github/custom-instructions.md` — the same content in both places, to make sure neither the repository nor any future AI assistant could miss it.

The Ten Commandments are forensic. They're not abstract principles — they're autopsies. Commandment II doesn't just say "don't build a lighting engine." It says: *"No raycasting. No shadow volumes. No specular fields. No emissive light polygons. No smooth glow renderers. If a file has 'kernel' in its name, delete it."* That level of specificity comes from knowing exactly how you fell down.

Commandment XI is the most honest:

> *"Oct 23, 2025: 564 lines of lighting infrastructure in one evening. Deleted 12,924 lines six days later. Nov 6, 2025: 921-line GeometryKernel reintroduced two days after the clean rebuild. Same mistake. Same rabbit hole. Different hat.*
>
> *If you are excited about the math, that is the warning sign."*

The November 6th date is in there as a prophecy, written before it had happened. Or as a warning, which amounted to the same thing.

---

## The Disciplined Rebuild

November 1st. The new codebase begins.

The difference from October is visible in the commit messages alone. *"actions + actionManager."* *"intent wiring 0."* *"item pickup/drop tests."* *"effects + tests."* The tests come with the systems. The Ten Commandments are being followed — not because someone is checking, but because the person who wrote them is the same person writing the code.

In four days, the project has more playable game than anything from October. Items, equipment, affixes, ScriptRef, creatures, intent wiring, auto-pickup with a chooser for when multiple items are stacked. Real commit messages. One system at a time.

The gold still spawns more gold when you pick it up. Some good ideas survive resets.

---

## The Second Trap

It happened on November 6th. The Ten Commandments document had already named the date, somehow.

The analytic dungeon kernel arrived. Continuous movement. Capsule collision. `Math.hypot`. A 921-line geometry system for a game in which positions are integers. Everything Commandments I, II, III, and IX explicitly forbid.

The project survived this time. The code got integrated, eventually became real features: multi-floor dungeons with portals, a demo scene that worked. By November 12th, the game had multiple floors and same-level teleportation. By November 15th, someone added a news section to the site.

Then the project went quiet for eighty-three days.

---

## The Winter

November 15th to February 7th. No commits. The code sat in the repository while something was presumably being figured out.

This kind of gap is hard to read from the outside. It could be burnout, or real life, or the project going dormant. But the February return suggests something different — that the time was being spent thinking rather than not thinking. The developer came back with sharper opinions, a different runtime, and a clearer picture of what the architecture needed to be.

The winter wasn't abandonment. It was incubation.

---

## The Return

February 7th, 2026. The first commit back is: *"bye bye node, hello deno."*

Deno, not Node, because Deno has a built-in test runner, a permission model, and a design philosophy that aligns with a project that cares about determinism and explicit dependencies. This wasn't an impulsive choice. Someone spent the winter deciding what runtime a test-driven, determinism-first roguelike should run on, and came back with an answer.

The archive was reopened. Everything was brought back over — combat, ranged weapons, spawners, items, affixes, spells, blastwave, meteor — but differently. Not ported wholesale. Rebuilt with the architecture that the winter had clarified.

Materials were removed on the first day back. *"bye bye materials."* They'd be back in a week, redesigned from scratch with material reaction profiles and conduction. The temporary removal was intentional — the old version wasn't worth porting, but the concept was.

---

## February

The month moved fast.

Gods arrived. A deity system with neglect counters and offerings and wrath. Kills became spiritual events. Hitting your pet angered the appropriate divine power.

A cat arrived. The cat had a state machine. The cat's deliveries appeared on visible, adjacent ground so you could find them. The cat could be on guard without consuming your turn. The eating-your-pet situation was handled.

Hunger. Stamina. An iron pickaxe. The first wand (Frost). A basic shop. Engravings you could carve into the floor. Ambient sound. Status effects: confused, weakened, poisoned. A Book of the Dead.

Material science came back bigger: reaction profiles, conductivity, resistance. Damage flowed through pipes. Stacking utilities. A plasma cloud VFX with a quad-bezier trajectory because the math was correct and the effect was worth having.

The Scroll of Homecoming arrived on February 17th and was immediately fixed five times. The first version did nothing. The second resolved before the anchor was ready. The third had the wrong depth. The fourth put the portal in the wrong location. The fifth one works: you use the scroll, you go home, a portal appears where you land so you can go back to where you were. Five commits, all honest, all named. This is what progress looks like in a codebase with real commit hygiene.

On February 18th, after a late session formalizing the architecture — mechanics in verb pipelines, behavior in data-space hooks, one runtime for everything — the developer wrote: *"big night that should massively boost content item creation velocity — it's practically a DSL."*

That phrase, "practically a DSL," is the payoff for the winter and the Ten Commandments and the two resets. When the architecture is right, adding things is fast. When you're fighting the architecture, every new feature costs you. The goal of all the architectural work — the ECS pivot, the Great Reset, the return with Deno, the verb pipelines and data hooks — was always to get here: a system where content is data, behavior is hooks, and adding a new item means filling in a definition, not writing a new branch in a switch statement.

---

## What It Actually Is

The Ten Commandments document has twelve commandments (the title stayed at ten). The twelfth was added later, after yet another temptation had been identified and named. The document grows. The list of specific mistakes that can be made is specific because each one was made.

Commandment XI ends with: *"If you are excited about the math, that is the warning sign."*

This is not a rule about mathematics. It's a rule about the difference between problems that are interesting and problems that matter. The lighting was genuinely interesting. The geometry kernel was elegant. The quad-bezier plasma cloud trajectory is satisfying to implement. None of those things made the game more fun to play, until the architecture was solid enough to support them without consuming the project.

The real story of JSHack is the story of a developer who kept making the same mistake — getting seduced by beautiful, interesting, technically-impressive work that didn't serve the game — and who was self-aware enough to write it down each time, with exact line counts and dates, so that the mistake could be recognized faster the next time it arrived.

It arrived again. It usually does.

The game exists. It has gods and pets and hunger and material conduction and a Scroll of Homecoming that works. The architecture is becoming a DSL. The TODO says *"Do Not Drift"* at the top.

---

## The DSL Pays Off

Late February was the proof that the architecture had worked.

On February 20th, a single commit message runs to eleven lines: *"CC took 5 tries to change a constant. Plasma, lightning, and electric. Fixed bypass invoke and bypass resist on DOTs. Fixing CC's stuff again. SHOCKING. Fixing CC's hallucinations. Shock trap. Shocked. Bleed pulse. FX table container. Frozen. Glow adjust. Hallu status. Status VFX. Fixed combat issue. Msg log. Combat log. More UX. Concentric gauge. MV HUD. Apply btn. Adding throw to bar, dropping use and apply. Inventory UX first visit. UX pass on inventory."*

That's one commit. Twenty-two changes. The developer is moving so fast that the commit messages can barely keep up, but every change is a game feature, not an engine feature. This is what it looks like when the DSL is working — when adding a shock trap means adding data, not writing plumbing.

February 22nd alone produced forty commits. Weapon racks, sarcophagi, webs, berserk mode, cooking, trap disarming, a score system, two-handed weapons. The architecture is invisible. The developer is just making a game.

On February 26th, there's a commit that reads: *"I don't want to hard code prices if I can help it — added a basic appraisal subroutine to stave off hardcoding prices for just a bit longer."* This is a developer talking to themselves in commit messages, negotiating between the right thing and the fast thing, and choosing the right thing because the architecture makes the right thing fast enough.

---

## The Collaborator

There is a second voice in the repository now.

CC — Copilot, the AI — appears in the commit messages the way a junior developer appears in a codebase: with enthusiasm, with speed, and with a specific flavor of wrongness that requires cleanup.

*"CC took 5 tries to change a constant."* *"FIXED: CC's awkward implementations around altars and offerings."* *"FIXED: a small handful of CC's oversights."* *"LOL: not what I meant by 'tunes'."* *"FIXING: more of CCs issues."* *"FIXED: CC's BADNESS."* *"FIXED: more CC junk."*

And then, on March 29th: *"CC is on fire today."* And that evening: *"MEGA TUNES -- CC IS ON FIRE."*

The relationship is visible in the log. CC submits pull requests — well-formatted, with plans and tests. The developer merges some, rewrites others, and occasionally writes commit messages that read like exasperated post-it notes left on a colleague's monitor. The dynamic is a team, not a tool. CC hallucinates things that don't exist, builds systems that miss the point, and occasionally solves exactly the right problem at exactly the right moment. The developer's job is knowing which is which.

By March, the merge requests have real substance. CC fixes the floating eye's gaze beam. CC adds long-press continuous walking. CC implements sensory overload for lightning spells. The developer stops saying "FIXED: CC's stuff" and starts saying "Merge pull request #123." The collaborator is learning the codebase. Or the developer is learning how to brief the collaborator. Probably both.

---

## Building a Village

March 8th is the day the overworld stopped being terrain and became a place.

The commit messages shift from systems language to place language: *"OVERWORLD: adjusting footprint before we go heuristic procedural on it."* Then *"OVERWORLD: more reworking."* Then *"ADDED: rooflines."* Then *"FIXED: door vis."* Then *"OVERWORLD: added church."*

Roofs that burn and then fall. Fences. Houses. A smithy. A church. And then, at 8:23pm: *"ADDED: town folk (early)."*

The townfolk are the most ambitious thing in the codebase, and they almost don't work. March 15th: *"CHECKPOINT: npc work, yikes."* Then, forty minutes later: *"ADDRESSING: an abysmal failure."* The NPCs were supposed to have daily schedules — wake up, go to work, eat, go to the pub, sleep. The reality was pathfinding bugs, stalled state machines, missing entrances, locked doors with nobody holding the key.

*"FIXED: gave the herbalist the key to the alchemy shoppe."*

That commit is funny, and it tells you everything about the difference between designing a system and making it live. The economy was architecturally sound — miners deliver ore, smiths forge tools, barkeeps cook stew. But someone forgot to give the herbalist a key. The game is in the details that no design document accounts for.

By March 15th, the village works. Ten NPCs wake up, walk to their jobs, produce goods, deliver them, eat dinner at the tavern, and sleep. The economy runs whether or not the player is watching. A message board appears in the town square. A bell rings — and the commit says *"there is a hint here."*

---

## The Canary Sings in a New Key

March 29th, 2026. A Saturday morning. 9:18am.

*"EXPERIMENTAL: lighting engine"*

Five months. Five months since "Thou shalt not build a lighting engine" was carved into `TEN_COMMANDMENTS.md` with the specificity of someone who remembered exactly how many lines they'd written and exactly how many they'd deleted. Five months since Commandment XI: *"If you are excited about the math, that is the warning sign."*

9:48am: *"amazing -- continued."*

9:52am: *"VFX: lighting continued."*

11:57am: *"snap."*

12:26pm: *"checkpoint."*

12:35pm: *"incredible."*

The commit messages look exactly like October 23rd. Short. Breathless. Piling up. The developer is in a flow state. Something interesting is being solved. The canary is singing.

But look at what comes *before* the lighting engine this time. Not before it in the commit — before it in the project. By March 29th there are fifty-seven monsters with intelligence tiers and pack alerting. Nine character classes. Four deities who track your eating habits. An overworld village where NPCs cook stew and a calendar with moon phases. Weather that extinguishes fires. Dungeon biome slices. Trap disarming. A spirit guide. Over a thousand tests. Combat with hitstop and recoil. The architecture is a DSL and the game is *fun*.

On October 23rd, the lighting engine was the third thing built. Before items. Before monsters had behaviors. Before the dungeon had rooms that connected properly. It was the interesting thing, not the important thing.

On March 29th, the lighting engine was the *last* thing built.

The gold got a glow. Then it got dialed back — *"DIAL BACK: gold glow"* — because restraint matters even when you've earned the indulgence. Corner torches appeared in dungeons. Sacred spaces got decorated. The floating eye's gaze beam got its own lighting pass, clipped by line-of-sight blockers so it stops at walls.

On April 1st: *"LIGHTING ENGINE TUNES."* Then *"VOID LIGHT"* — light in empty spaces, the inverse of shadow. The lighting engine was getting polish. It was being tuned. It was not consuming the project.

Commandment II — *"Thou shalt not build a lighting engine"* — was never a permanent prohibition. It was a question of timing. The same math that killed the project in October became a reward in March. The same excitement. The same rabbit hole. The same developer who deleted 12,924 lines wrote *"incredible"* five months later, and this time nobody needed to stop.

The canary was singing, but it was singing in a different key.

---

## Game Feel

Early April brought a shift that is hard to see in the feature list but obvious in the commit messages.

*"WEIGHTS." "WEIGHTS." "WEIGHTs." "WEIGHTS." "WEIGHt." "WEIGHTS." "WEIGHTS."*

Seven commits with the same word, each slightly different in capitalization, the way someone types when they're deep in a thing and the commit is muscle memory. Then: *"IMPULSE 0." "IMPLULSE 1."* — misspelled, because who cares about the commit message when the hit feels right. Then: *"VNICE." "FEEL." "WINCE." "VISCERAL TUNES."*

This is the developer discovering game feel. Not combat math — that was solved months ago. This is the moment when a hit stops being a number and starts being a sensation. Hitstop. Recoil. Bump FX that communicates contact. Float text that staggers so the offhand damage arrives after the main hit, the way a punch and its follow-through are two distinct moments.

The commit message canary would say these are short, breathless messages — the warning sign. But the commandments were written about engine work. This is game work. The difference between *"WEIGHTS"* repeated seven times for combat feel and *"a." "a." "a."* repeated six times for a geometry kernel is the difference between solving a problem the player can feel and solving a problem the player will never see.

Commandment IX: *"Thou shalt not solve problems the player cannot see."*

The player can feel hitstop. The player can see the wince. This is allowed.

---

## The Spirit Guide Problem

The spirit guide was the hardest thing to get right, and not for technical reasons.

The guide appears in early April. The intent is onboarding — teach new players how to play a roguelike without reading a manual. The danger is obvious: tutorials kill roguelikes. The moment a game tells you what to do next, it stops being a game about discovery and becomes a game about following instructions.

The developer's own rule, stated explicitly: *"Never add tutorial rails; spirit guide must feel organic, not hand-holdy."*

The commit log for the spirit guide is the longest tuning sequence in the project. *"SPIRIT TUNES." "GUIDE TUNES." "SPIRIT GUIDANCE." "DONT BURN LOCAL on GUIDE DISABLE." "RESUME GUIDE PARTIAL." "GUIDE." "GUIDE GATING."* Each commit is a small adjustment to when the guide speaks, what it says, and — critically — when it shuts up.

The guide knows whether you're on a phone or a desktop. It teaches differently based on device. It watches what you pick up and offers context. It gates itself so it doesn't pile on. You can disable it and it doesn't burn your local state on the way out.

The attention lavished on making the guide *not annoying* — the number of commits spent on the negative space of what the guide doesn't do — is the same kind of discipline that produced the Ten Commandments. The interesting problem is building a clever tutorialization system. The important problem is making sure the player never feels tutorialized.

---

## Sound and Silence

For five months, the game had been silent.

Movement was visual. Combat was visual. Weather was visual. The overworld economy — miners walking to the quarry, the smith hammering at the anvil, the barkeep stirring stew — all of it happened in silence. The game worked. The silence was not a bug. But it was an absence.

The audio engine arrived in early April. File-based Web Audio with buses and spatial panning. Randomized pitches so no two sword swings sound the same. Travel sounds that change with the terrain. Then, almost immediately: *"AUDIO CLEANUP."* The first version was too much. The second version was tuned.

This is the same pattern as the lighting engine. The technology is interesting. The restraint is more interesting. The audio engine works because it arrived after the game was fun without it, and because the first thing the developer did after building it was dial it back.

---

## The Commit Messages of April 6th

*"BENCH." "BENCH." "NODE KIND." "BH." "NG DEFAULT." "NG." "NG."*

Short commits. Rapid fire. On any other day in this project's history, this would be a warning. The canary. The sign that someone is solving the wrong problem.

But these are not engine commits. *"NG"* is new game flow. *"BENCH"* is benchmarking. *"BH"* is behavior tuning. These are the commits of someone playing their own game over and over, tweaking what doesn't feel right, and committing the fix in the time it takes to notice it. The messages are short because the changes are small. The changes are small because the architecture is right.

1,350 commits. Sixty-two active days of development across six months. The commit messages started as descriptions, became commandments, degraded into single letters, recovered into systems, and finally settled into the shorthand of someone who knows the codebase well enough that the message is a bookmark, not an explanation.

The project that started with *"init"* — which was a lie — and survived two near-fatal encounters with its own developer's enthusiasm for beautiful math, is now a game that runs on a phone in your pocket. Zero dependencies. No build step. Pure JavaScript. The architecture is invisible, which was always the point. You edit a file, you hit refresh, you see your changes.

The Ten Commandments are still in the repository. They haven't been updated. They don't need to be. The lighting engine exists now, and the game didn't die. That's the update.

---

## The Holy Sword

The sunsword arrived in mid-April as a commit called *"ADDED: SUNSWORD."*

This is the kind of item that could have been a one-liner — a sword with a fire damage flag, tagged holy, done. Instead there are twelve commits about the sunsword before it stabilizes. *"SUNSWORD: USE (early)." "SUNSWORD BEAM." "BEAM TUNES." "SUNSWORD BEAM DURATION." "PERMA B ON SUNSWORD."* A dedicated DSL expression, `sunsword dsl`, so future items of its type can be authored the same way. A fixed light beam that clips at walls. An abilities system that the sunsword appears to have motivated into existence.

The sunsword emits a beam. The beam has a duration. The beam is holy. The beam stops at walls because the lighting engine can do that now. The beam has its own entry in `getActiveLights` — 0.45 seconds with a fade curve, distinct from the brief flash that spell bolts produce. The developer noted this in the commit message: *"spell:bolt → getActiveLights → brief flash, 0.14s ✓ content:beam:vfx (sunsword only) → _holyBeams in lighting engine → maxAge: 0.45s with fade curve."* That's not a commit message. That's a specification written in past tense after the fact, to document an architectural decision that had just been made.

The barrow wight arrived around the same time — a new monster appropriate to a game that now has a sunsword. Skeletal archers got arrows, because of course they should have had arrows already.

---

## The Sound of Everything

The audio engine had arrived by early April. By late April, it was everywhere.

The commit log from this period is almost entirely audio. Not one system — dozens. Ambient loops that crossfade when you descend into a dungeon. Biome-specific music: forest, meadow, swamp, dungeon, night. Creature voices: a large creature snarl, a cat eating. Status sounds: frozen, electrocuted (then renamed), slimed. A jump scare system, complete with scare range tuning. Channeling sounds. Eating sounds. Spell sounds replaced, then replaced again. Death. Pickup sounds for gems, food, gold, generic items. Door sounds. Chest open. Equip weapon.

*"ADDED: jump scare system."*

That commit is six words and it's a whole design philosophy. A roguelike with jump scares. The developer added a jump scare system, tuned the scare range, and then left it in the game. No commit was needed to explain why — the scare range commit is the explanation. Somebody tested it at various ranges, found the right one, committed the fix. Moving on.

The audio engine got a priority ordering system in late April — *"ADDED: AUDIO ENGINE PRIORITY ORDERING"* — because once you have dozens of sounds competing for channels, some sounds need to win. The engine had grown complicated enough to need a scheduler of its own. A deterministic pitch bucket was added so audio randomization is seeded properly. An audio manifest, an audio downloader tool from he audio engineers dropbox, silence trimming, normalization. The audio work became its own project running parallel to the game.

The audio engine is complex enough now to have non-obvious bugs. That's what it means for a system to be real.

---

## The Status Effects Are Having a Moment

*"CONFUSED (IS SUPER COOL)."*

That commit message, mid-April, is the developer stepping back from the implementation and experiencing it as a player. The confused status effect causes movement to snap in unexpected directions — you intend to go north and you go northeast instead. The visual marker is distinct from stun. There's a float text indicator. The commit before it says *"FIXED VISUAL CONFUSION BETWEEN STUNNED AND CONFUSED"* — the game had two similar CC states, and one of them was being mistaken for the other, and the fix is a dedicated visual language for each.

Entangle — a rooting spell — got its own VFX around the same time. *"ROOTED VFX."* Then a series of commits that read like surgery: *"CC MESSING WITH ENTANGLE." "CHECK ENTANGLE." "FIXED? ORDER G." "ENTANGLE CHURN FINAL." "ENT EARLY."* The collaborator touched entangle and the developer spent several sessions untangling the result. This is a recurring pattern now: CC adds something, the developer fixes the ordering, the sequencing, the interaction with other systems. The collaborator is faster at first implementations. The developer is faster at the second ones.

Spore clouds got fixed twice. Vision range got fixed. The ring of conflict — which makes everything in your LOS target each other — had its LOS behavior adjusted. The combat status space is complex enough now that each effect has to negotiate with all the others, and the negotiations occasionally fail.

---

## Minerals That Think About Light

The gem system had been updated before April — material-specific drops, fourteen new entries in the material catalog. What happened in April was the gems learning to interact with their environment.

*"ADDED: gem dispersion and refraction." "ADDED: new temporal patterns for gems." "ADDED: dark flouro shrine (early)." "ADDED: REACTIVE / ADAPTIVE SHRINE LIGHTING."*

Gems found on the floor now cast light based on their mineral composition. Fluorite glows under high-energy sources. A fluorite socket proc was added — *"Phosphorescent Discharge"* — where killing near a shrine with sufficient standing causes a fluorite stone to manifest at the player's feet. The deity system, the material system, the lighting system, and the kill event pipeline all have to agree for this to work. Four systems. One proc. Six months ago this would have required touching four files and hoping nothing broke. Now it's a data hook.

The developer ran into a subtle bug: *"FIXED: getActiveLights should not be used for certain types of BOLTS!"* Some light sources should flash briefly. Others should linger. Spell bolts and the sunsword's holy beam needed different treatment, and the existing lighting API wasn't distinguishing them. The fix is in the commit message, in full: the architectural boundary was drawn and documented in the same breath.

*"Glints"* arrived. Then *"GLINTS CONTINUED."* Small sparkle VFX for gems and metallic surfaces. The developer who once deleted 12,924 lines of lighting infrastructure was now adding particle sparkles to gem tiles, and it was fine, because the game had earned them.

---

## The Dungeon as Architecture

The dungeon generator has always produced rooms and corridors. In April, the dungeon started producing *places*.

*"ADDED: chain winch, pressure plates, steam vent, bone chime."*

Four dungeon features in one commit. Each one is a mechanical object — something that responds when you interact with it or when something else interacts with it. The hydraulics room, which had existed as a concept since late April, got its portcullis wired to the pressure plinth: stand on the plinth, the gate opens. The pit trap was fixed — *"FIXED: pit-trap now drops you to the floor below as initially intended"* — because the original implementation had been wrong about where dropping into a pit should take you. A void pit variant was added. Two pre-fab rooms appeared in the commit log.

Then: *"ADDED: TARGET DUMMY."* Then *"EFFIGY CONT."*

A target dummy. Something you can hit that doesn't hit back, that exists in the dungeon specifically so you can calibrate how the combat feels. The developer needs this because the combat has become detailed enough — hitstop, recoil, visual slash profiles, tints, cleave — that testing it on live monsters is noisy. The target dummy is a testing instrument that shipped as a game feature.

---

## Fishing

*"FISHING: fishing in normal water tiles is allowed as it is now; we generate a specialized harvest node for better fishing spots — increased the number of fishing turns to 12 — created rare fish(es) that can appear in normal spots, but are somewhat common in fishing spots, a 'fishing spot' (a water tile) now has a VFX-particle swirl, a 'fishing spot' may now be exhausted and replenished on a cooldown. while fishing — other items may be reeled in — added a specialized loot-table entry for fishing nodes. (Soggy Boot, Kelp, Epic Weapon, Legendary Weapon)"*

That single commit message tells you everything about how the developer thinks about features. The feature is complete in one go — mechanics, VFX, exhaustion loop, loot table, edge cases. The parenthetical at the end (Soggy Boot, Kelp, Epic Weapon, Legendary Weapon) is the developer noting, perhaps with some amusement, that the fishing loot table has the full range from garbage to rare.

The fishing rod ended up in the general store. Rain improves the odds. Repeatedly fishing the same spot exhausts the resource. A second commit refined the rod to be tile-aware — you can only fish where there's water. The VFX accumulated incorrectly on visibility changes and was fixed. The fishing spots got their own audio.

Fishing is a contemplative counterpoint to everything else in the game. You stand at the edge of water. You wait twelve turns. Something happens or it doesn't. The game has gods and dungeon traps and a sword that emits holy beams — and also fishing, as a thing you do when you want the game to slow down.

---

## The Enchanting Table

The enchanting system arrived as a pull request — *"feat: add enchanting bench and scroll-based gear enchants"* — which is how the bigger CC contributions appear in the log now. A bench in the dungeon where you can apply scrolls to gear. A dedicated NPC enchanter in the overworld with a reagent economy. Polish and validation fixes in a followup commit. A refactor of the inventory action helpers. Then *"ENCHANTING: adjusting test ++ better isolation"* and *"ENCHANTING: followup legibility and fixes."*

The pattern is legible: CC submits, the developer reviews and follows up. The followup commits are shorter than the original PR and they fix the things CC doesn't know to fix — the ordering, the edge cases, the places where the new system steps on existing assumptions. The merger message is terse: *"Merge pull request #136 from PJensen/copilot/add-gear-enchanting-system."* No editorializing. It works, it's in, moving on.

---

## The World Gets Wider

The overworld had been a village surrounded by terrain. In April it became a region.

*"OVERWORLD: jagged coastline, rivers, ponds; fix biome walkability."*

One commit. Coastlines. Rivers. Ponds. Swamp added. Ocean added. A graveyard stamp. A farm stamp. The town compression commit — *"TOWN COMPRESSION"* — suggests the village got smaller so the world could get bigger around it. Walkways appeared. The fountain got adjusted.

Town gossip arrived: *"TOWN GOSSIP."* The NPCs now have things to say to each other. The overworld that started as a terrain generator with a village attached now has a shoreline you can walk along, a graveyard outside town, a farm by the road, and villagers who gossip. This is what a world feels like — not features stacked on a foundation, but details accumulating until the place has texture.

The developer committed a clock face — *"CLOCK"* — and then fixed the hand sequencing two weeks later. Moon phases are tracked. The quest pulse was moved higher in the display and given a linger time. These are the commits of someone who is playing the game for hours and noticing the small things that don't feel right.

---

## Legendary Items

*"ADDED: lodbrok_serpent_bound_breeches."*

This is a legendary item, and the name is doing all the work. Not "pants of snakes." Not "cursed leggings." The item has a proper noun in it — a person's name, suggesting history, ownership, a story that predates the player's encounter with these breeches. The proc: spectral snakes spawn from an ability, not a passive, with lightning-fast aggression. A fix: *"FIXED: proc nod on lod breeches."* Then *"BUFF: spectral snakes lightning-fast aggression."* Then *"TWEAK SPECTRAL."* The snakes were too slow, then fast enough, then right.

Monsters started carrying gear. *"MOB GEAR." "MORE MONSTER GEAR." "INFER SLOTS FROM ITEM."* The slot inference is the interesting bit — the system can look at an item and figure out where it would be equipped, rather than requiring explicit slot declarations in the monster definition. This is the architecture making content authoring easier, which is still the point.

---

## The Architecture Thinking About Itself

*"ARCH: hasEquippedTag — newer concept for managing behavior modification more succinctly across systems."*

This commit message is the developer pausing to name a pattern. `hasEquippedTag` is a query — does the player have an equipped item with this tag? — and it's powerful enough to replace a whole class of item-behavior conditionals. Instead of each system checking which items are equipped and what their properties are, systems can query for tags. The ring of conflict works by tag. The sunsword's beam behavior works by tag. The item is data; the tag is the interface; the system doesn't need to know what the item is.

The skip-list scheduler is the other architectural event from this period. Fountains and harvest nodes had been running on every tick, which was wasteful. The skip-list lets you schedule a future action — *"check this fountain in N turns"* — and skip all the intervening ticks. Then a series of benchmarking commits: *"BENCH." "BENCH." "BENCH."* followed by performance commits. The developer profiled something, found the bottleneck, fixed it, and committed the benchmark to track whether it stayed fixed.

*"RULES LEAK (CONTAINERS)." "FIXING MORE RULES VIOLATIONS." "MORE RULES LEAKS."*

Three commits in a row about architectural rules being violated — display layer reaching into rules layer, systems calling each other directly. The boundaries are enforced actively, which means they're being found, not just declared. A codebase that has rules it enforces is different from one that has rules it writes down.

---

## What April Built

The closing section of this document, written on April 6th, ended with: *"The Ten Commandments are still in the repository. They haven't been updated. They don't need to be."*

Three weeks later, the game has a holy sword that emits a beam clipped by line-of-sight. It has jump scares. It has fishing. It has legendary breeches that spawn spectral snakes. It has a coastline. It has enchanting. It has fluorite that glows under the right conditions and a deity who rewards you with a stone for killing at their shrine. It has gossip. It has a graveyard stamp and a farm stamp and rivers and ponds and ocean at the edge of the world.

The commit count passed 1,600. The commit messages are still short. The changes are still small. The architecture is still invisible. You edit a file, hit refresh, see your changes — and now you can also go fishing while you do it.

The Ten Commandments remain unedited. The work continues.

---

## The World Starts Remembering

May began with a question that sounds small until you follow it through the
whole game: what happens when the player takes something from a shop without
paying?

The answer became shop debt, then shop law. A shopkeeper could remember an
incident. A debt could survive the ordinary interaction that created it. Value
could be extracted through routes that did not look like a purchase — reading a
book, quaffing an unpaid potion, carrying something out — and the ledger could
still notice. The game was no longer merely simulating rooms and turns. It was
simulating institutions with memory.

The architecture followed the design. Virtuals and hierarchy replaced scattered
checks. Shop enforcement became a mediated surface instead of a collection of
doorway conditions. The shopkeeper could speak through a chat bubble, and the
player could be refused, pursued, or given credit. A roguelike had acquired a
small economy and, more importantly, consequences that outlived the action that
caused them.

Then the memory spread beyond shops.

Disposition became the immediate social response. Reputation became the longer
public shadow. Threat became the tactical language between them. Friendly fire
could be attributed. Witnesses could remember what they saw, or fail to see it,
and creatures could become aggressive because of an offense rather than because
the player happened to be standing nearby. Social memory was not just another
aggro flag. It was a reason for aggro to exist.

Polymorph arrived in the same season, with policy, diminishing returns, passive
stat bonuses, and eventually a chooser. The player could become something else,
but the transformation had rules about what kinds of something else were
allowed. Even the strange behavior got a boundary.

This was the point at which JSHack stopped feeling like a collection of clever
systems and started feeling like a world with opinions.

## Objects Become Affordances

June was a month of turning special cases into surfaces.

Interactables were generalized. A mailbox appeared in town. Rifts and portals
became real places rather than teleport code hidden behind a button. Locked
shops became pickable. Fires could expire into ashes through the skip list.
Fishing, cooking, taming, genocide scrolls, offerings, traps, and dungeon
features all found their way into authored interactions.

The important change was not the number of objects. It was that an object could
declare what it afforded: a verb, a prompt, a condition, a result. The engine
could mediate the interaction without every new object requiring bespoke wiring.
This was the content-first promise finally paying rent in the town square.

The work also became more honest about canonical paths. Healing joined damage
as a centralized operation. Encumbrance was treated as a real derived concern
instead of a display calculation. Creature bodies, shop identity, dungeon
transitions, and spawned fires all exposed the places where a game can appear to
work while quietly maintaining two versions of the truth.

Those places were found and consolidated. Not dramatically. Usually in commits
with titles like *"arch: small cleanup"* or *"fixed: small handful of issues"*.
That is what maintenance looks like after a system becomes real.

## The Barkeep Knows a Story

In July, the town acquired a new kind of memory.

The barkeep could request a story generated by an LLM in realtime. The request
crossed a deliberate boundary: rules could describe the situation and emit an
event; the main and wiring layers could decide how an external model should
respond; the town dialogue could present the result. The simulation did not
need to become asynchronous in order for the world to become conversational.

This was a very JSHack feature. The game had spent months making sure systems
communicated through events and that rules did not reach into presentation. Now
those boundaries were useful for something delightfully impractical: asking a
barkeep what they had heard.

The same period brought an early rift quest, a dedicated enchanting shop, more
Ratatoskr personality, fear and frost nova, richer weapon effects, and the
small connective work that makes a town feel inhabited: portraits, labels,
ambient audio, shop hours, beds, nighttime, and the fact that a shopkeeper
should remain themselves after a transition.

By August, speech bubbles had been lifted above everything else in the display.
It is a small visual fix, but it says something about the accumulated world:
there are now enough layers, characters, effects, overlays, and messages that
being heard requires deliberate altitude.

## The Pause

The last feature before the pause was intentionally modest: the Potion of
Echoing Focus. It grants `keen_eye` and `lucky` for twenty turns, has a violet
palette entry and a glyph, and enters the general potion loot table through the
content registry.

Then came the natural question: what happens when it is thrown?

The answer exposed the edge of the current system. The potion can be drunk,
but throwing it onto the ground or at a creature currently leaves it intact.
There is no impact damage, splash, or status application. The item works as a
potion, but not yet as a physical object with a distinct thrown meaning.

That is a fitting place to stop. After nearly a year of development, the
unanswered question was no longer *can the game support this?* It was *what
should this one small object mean when it leaves the player's hand?*

The repository now contains over 2,200 commits on its main line. It has 96
registered systems, hundreds of tests, a five-phase scheduler, and guardrails
that report no current layer-boundary or determinism violations. The game has
grown large enough to need a map, but the map is there.

The work continues — after a pause, with newer models, and with the useful
kind of uncertainty that comes from having more possibilities than time.

---

## The Autumn Return

The repository did not so much resume in September as twitch.

On September 11th, auras arrived in several increasingly confident passes:
*"feat: more auras," "vfx: draw aura,"* and *"feat: aura cont."* These were
not merely decorative halos. Monster aura fields, hazard interaction, spell
definitions, and tests appeared together, which is the JSHack version of
putting a little candle on the table and discovering that the candle has a
registry, a scheduler contract, and a test file of its own.

Then came *"feat: agent view (experimental)."* It added a read-only runtime
view and a player tool for observing the game. Two days later, *"feat: replay
checkpoint"* taught that tool to save and replay an action trace. A subsequent
commit called *"data: an interesting capture"* checked in a 733-line trace.
This was not autonomy. It was something more useful and less cinematic: a
machine-readable way to ask what happened, then do it again. The distinction
matters. The agent could observe and replay a bounded run; it could not be
credited with wanting anything.

September also produced encounters and a stasis rewrite, complete with a
design handoff large enough to prove that “temporary pause” is a dangerous
phrase in a simulation. The season's first lesson was that experimentation
had become easier to preserve. The second was that preserved experiments still
needed somebody to decide whether they were the game.

## The Machinery Wakes Up

By October 25th, the project had found its old pulse. *"feat: experimental
effect arch"* moved item abilities toward explicit effect instances, periodic
effects, and a lifecycle document. The next day was less a feature than a
small civil war among interfaces: *"arch: targeting, overhaul," "arch:
projectiles impact," "arch: onHit and re-usable proc for dawnBreaker,"* and
*"arch: proc evals continued."*

The results are concrete. Ranged attacks now distinguish a persistent target
lock from temporary point targeting. A shot follows a physical ray and can
end at an actor, a wall, or the ground. Ammo receives the resolved impact
instead of being told only whether some abstract defender was hit. Proc
packages moved out of one-off weapon hooks into reusable data and evaluator
paths. The architecture acquired the ability to say what a projectile hit,
which is a surprisingly high bar for a game that has been firing arrows for
months.

It also acquired the ability to be wrong in more interesting ways. The final
commit of the period is *"fixed: ground shots are not misses."* That is not a
metaphor. A ground shot had been falling through the semantic gap between
“not an actor” and “not a miss.” The fix and its regression test are a neat
summary of October: the game is no longer short of systems; it is short of
places where those systems agree about what a thing means.

## The Agent Gets an Operating Manual for Its Operating Manuals

The most consequential October work did not add a monster or a spell. On
October 30th, GREENLIGHT support appeared in a commit that changed two files.
That is the verified fact. The grander workflow around it was then assembled
in November: *"docs: organize agent skills and tools," "docs: route runtime
proving tools,"* and *"docs: capture skills incrementally."*

Issue #156 had diagnosed the broad problem: the skills described content
authoring, but some of their instructions still pointed agents toward old
catalogs and old paths. The follow-up did not pretend that a giant manual was
the answer. It created routes for searching, reviewing, replaying, explaining,
and handing off work, while keeping real deterministic tools beside the skills
that own them.

Then issue #173 made the arrangement physical. Inspection scripts moved into
`agent-tools`; headless runs, replay, and profiling moved into `runtime-tools`;
the seeded monster trainer received its own skill. The repository now says,
with a straight face, that tools establish facts, skills encode judgment, and
agents compose capabilities. This is a reasonable operating principle. It is
also machinery for building the machinery that builds the game.

The old Ten Commandments warned against building an engine instead of a game.
The new response is to build diagnostic instruments, ownership matrices,
checkpoint transcripts, health reports, and a routing doctrine so the engine
building can be inspected properly. The author may have tamed the machinery.
He may instead have made it sophisticated enough to indulge him with better
instruments. The evidence supports both readings, which is inconveniently
appropriate.

## The Dead Become Useful

On November 2nd, the necromancer arrived in a sequence of commits whose
spelling occasionally looked as though it had been resurrected from a draft:
*"added: new class `necromancer`," "feat: necromancer starts with bone ring,"
"added: resurection spell,"* and *"feat: re-animated label and unead tag."*
The class is real: bone staff, bone ring, Molkhar, Agony, and Resurrection.

Resurrection consumes an eligible corpse and creates a temporary allied undead
with ownership, a visible reanimated glow, and a lifespan. A goblin can rise
for eighty turns; a powerful corpse burns out sooner. If the ally dies, it
leaves bones rather than producing an edible corpse, closing the most obvious
corpse-to-minion-to-corpse exploit. The tests demonstrate all of this. The
dead are not flavor text anymore. They are a resource with a lifecycle.

But open issue #169 asks for more than the shipped slice: an explicit Grave
Claim action, active-minion limits, failure-safe corpse consumption, command
semantics, floor transitions, and corpse provenance. Those ambitions should
not be smuggled into the historical record as completed features. The
necromancer has been born. The necromancer's full profession has not.

## The Player Needs a Reason

This is where the autumn became uncomfortable. Issues #170, #171, and #172 do
not complain that JSHack lacks simulation. They complain that simulation is
not automatically a reason to care. The town has memory, the land has
biomes, the dungeons have traps, and the player can now shoot a precise arrow
into the ground. None of that guarantees that a player wants to leave town,
knows where to go, recognizes a place as a place, or feels a meaningful arc
when a run improves.

The repository's `PROGRESSION_RESONANCE_PLAN.md` says the diagnosis plainly:
the weak point is not feature count but the reward contract. A quest can have
a strong setup and still collapse into gold at the end. A world can have
landmarks and still feel like a map asking to be admired. These are plans and
design diagnoses, not shipped fixes. The game has gained a reason to ask the
question. It has not yet answered it.

That is the latest shape of JSHack. The autumn return made the experiments
repeatable, the combat machinery more semantically honest, and the agent
workflow increasingly inspectable. It also produced a necromancer who can
raise a corpse while the development process raises old tools into new skills.
Underneath the checkpoints, flight plans, target locks, corpse lifespans, and
the machinery for checking the machinery, there is still allegedly a
roguelike. On November 2nd, at least, it fired at the ground and admitted that
the ground was not a miss.

*The repository is at https://github.com/PJensen/JSHack.*
*The Ten Commandments are in [TEN_COMMANDMENTS.md](docs/architecture/TEN_COMMANDMENTS.md).*
*The first commit was October 15, 2025.*
*The latest verified work is November 2, 2026.*
*The work continues.*
