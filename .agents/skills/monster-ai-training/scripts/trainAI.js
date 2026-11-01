#!/usr/bin/env -S deno run --allow-read --allow-write
// .agents/skills/monster-ai-training/scripts/trainAI.js
// Neural AI policy trainer using (1+λ)-Evolution Strategy.
//
// Usage:
//   deno run --allow-read --allow-write .agents/skills/monster-ai-training/scripts/trainAI.js [options]
//
// Options:
//   --tier tactical        Train for intelligence 7-8 monsters (melee-dominant)
//   --tier caster          Train for intelligence 9-10 monsters (spell-dominant)
//   --gens 500             Number of generations (default 500)
//   --lambda 10            Offspring per generation (default 10)
//   --sigma 0.08           Initial perturbation std-dev (default 0.08)
//   --trials 30            Combat trials per candidate (default 30)
//   --turns 60             Max turns per trial (default 60)
//   --out src/rules/data/aiWeights.js   Patch output file (default: print only)
//   --seed 42              RNG seed for reproducible runs
//
// Output: JS snippet to paste into src/rules/data/aiWeights.js
//
// Training scenario (mini-sim — no ECS, runs fast):
//   Monster starts 8 tiles from player, player walks toward monster every turn.
//   Multiple arena types per trial: open, corridor, near-start.
//   Fitness = damageDealt*2 + spellCastCount*5 + positionScore - damageTaken*0.5
//     positionScore: turns monster spends at ideal range (2-6 for casters, ≤1 for melee)

import { createMLP, forward, getWeights, setWeights, serializeNet, totalWeightCount, FEATURE_DIM, OUT_SIZE } from '../../../../src/rules/ai/tinyMLP.js';
import { MOVE_DIRS, ACTION_WAIT, ACTION_SPELL_0, ACTION_SPELL_MAX, ACTION_RANGED, ACTION_COUNT } from '../../../../src/rules/ai/policyAction.js';

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    tier:   'caster',
    gens:   500,
    lambda: 10,
    sigma:  0.08,
    trials: 30,
    turns:  60,
    out:    null,
    seed:   0xBEEF1234,
  };
  for (let i = 0; i < argv.length; i++) {
    const raw = String(argv[i] || '');
    if (!raw.startsWith('--')) continue;
    const key = raw.slice(2);
    const val = argv[i + 1] && !String(argv[i + 1]).startsWith('--') ? String(argv[++i]) : 'true';
    switch (key) {
      case 'tier':   opts.tier   = val; break;
      case 'gens':   opts.gens   = Number(val); break;
      case 'lambda': opts.lambda = Number(val); break;
      case 'sigma':  opts.sigma  = Number(val); break;
      case 'trials': opts.trials = Number(val); break;
      case 'turns':  opts.turns  = Number(val); break;
      case 'out':    opts.out    = val; break;
      case 'seed':   opts.seed   = Number(val); break;
    }
  }
  return opts;
}

// ── Seeded RNG (xorshift32) ───────────────────────────────────────────────────

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return {
    next() {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 0x100000000;
    },
    nextInt(n) { return (this.next() * n) | 0; },
    nextGaussian() {
      // Box-Muller
      const u1 = this.next() || 1e-10;
      const u2 = this.next();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
  };
}

// ── Monster archetypes ────────────────────────────────────────────────────────

const ARCHETYPES = {
  tactical: {
    name:        'tactical',
    intel:       0.75,      // feat[15] = intel/10
    numSpells:   0,         // mostly melee
    hasRanged:   0,
    baseHp:      28,
    attack:      7,
    retreatPct:  0.25,
    idealRange:  [0, 1],   // wants to be adjacent
  },
  caster: {
    name:        'caster',
    intel:       1.0,       // feat[15] = 10/10
    numSpells:   3,
    hasRanged:   0,
    baseHp:      22,
    attack:      4,         // weak melee
    spellDamage: 10,        // damage per cast
    retreatPct:  0.25,
    idealRange:  [3, 7],   // wants to maintain spell range
  },
};

// ── Arena types ───────────────────────────────────────────────────────────────

// Returns a function (mx, my) → walkable neighbors count  (0-4 cardinals)
function makeArena(type) {
  switch (type) {
    case 'open':     return () => 4;
    case 'corridor': return (x) => (x % 2 === 0 ? 2 : 2); // N/S only
    case 'room':     return () => 3; // partially boxed
    default:         return () => 4;
  }
}

const ARENA_TYPES = ['open', 'open', 'open', 'corridor', 'room'];

// ── Spell cooldown table (simple per-slot counter) ────────────────────────────

function makeCooldowns(numSpells) {
  return new Int32Array(numSpells);
}

function spellReady(cooldowns, idx) {
  return cooldowns[idx] <= 0;
}

function useSpell(cooldowns, idx) {
  cooldowns[idx] = 8; // 8 turns cooldown (matches POLICY_SPELL_COOLDOWN)
}

function tickCooldowns(cooldowns) {
  for (let i = 0; i < cooldowns.length; i++) if (cooldowns[i] > 0) cooldowns[i]--;
}

// ── Feature extraction (mini-sim version) ────────────────────────────────────

function buildFeatures(
  mx, my, px, py,
  myHpRatio, targetHpRatio, manaRatio,
  isRetreating, numAllies, spellReady0, spellReady1, spellReady2, spellReady3,
  hasRanged, corridorFactor, depth, intel,
  targetHasBadStatus,
) {
  const dx   = px - mx;
  const dy   = py - my;
  const dist = Math.max(Math.abs(dx), Math.abs(dy));

  const feat = new Float64Array(FEATURE_DIM);
  feat[0]  = Math.min(1, dist / 20);
  feat[1]  = Math.max(-1, Math.min(1, dx / 20));
  feat[2]  = Math.max(-1, Math.min(1, dy / 20));
  feat[3]  = myHpRatio;
  feat[4]  = targetHpRatio;
  feat[5]  = manaRatio;
  feat[6]  = isRetreating;
  feat[7]  = Math.min(1, numAllies / 5);
  feat[8]  = spellReady0;
  feat[9]  = spellReady1;
  feat[10] = spellReady2;
  feat[11] = spellReady3;
  feat[12] = hasRanged;
  feat[13] = corridorFactor;
  feat[14] = Math.min(1, depth / 15);
  feat[15] = intel;
  feat[16] = targetHasBadStatus;
  feat[17] = dist <= 1 ? 1 : 0;
  feat[18] = dist > 6  ? 1 : 0;
  feat[19] = myHpRatio < 0.3 ? 1 : 0;
  return feat;
}

// ── Argmax ────────────────────────────────────────────────────────────────────

function argmax(probs) {
  let best = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
  return best;
}

// ── Single combat trial ───────────────────────────────────────────────────────

/**
 * Run one mini-combat trial.  Returns a fitness contribution.
 *
 * @param {ReturnType<typeof createMLP>} net
 * @param {object} archetype
 * @param {string} arenaType
 * @param {object} rng
 * @param {number} startDist   initial chebyshev distance
 * @param {number} maxTurns
 * @returns {number}
 */
function runTrial(net, archetype, arenaType, rng, startDist, maxTurns) {
  const getWalkable = makeArena(arenaType);

  // Positions (1D simplification: monster on y=0, player starts at y=startDist)
  let mx = 10, my = 10;
  let px = 10, py = 10 + startDist;

  const maxMana    = archetype.numSpells > 0 ? 50 : 0;
  let mana         = maxMana;
  let monsterHp    = archetype.baseHp;
  let playerHp     = 30;
  let damageDealt  = 0;
  let spellsCast   = 0;
  let posScore     = 0;
  let damageTaken  = 0;

  const cooldowns = makeCooldowns(archetype.numSpells);
  const depth     = 4;
  const [idealMin, idealMax] = archetype.idealRange;

  for (let t = 0; t < maxTurns; t++) {
    const dist = Math.max(Math.abs(mx - px), Math.abs(my - py));

    // Position quality score
    if (dist >= idealMin && dist <= idealMax) posScore++;

    // Mana regen
    if (maxMana > 0) mana = Math.min(maxMana, mana + 2);

    const isRetreating = (monsterHp / archetype.baseHp) < archetype.retreatPct ? 1 : 0;

    const feats = buildFeatures(
      mx, my, px, py,
      monsterHp / archetype.baseHp,
      playerHp  / 30,
      maxMana > 0 ? mana / maxMana : 0,
      isRetreating,
      0, // numAllies
      archetype.numSpells > 0 ? (spellReady(cooldowns, 0) ? 1 : 0) : 0,
      archetype.numSpells > 1 ? (spellReady(cooldowns, 1) ? 1 : 0) : 0,
      archetype.numSpells > 2 ? (spellReady(cooldowns, 2) ? 1 : 0) : 0,
      0, // spell3
      archetype.hasRanged,
      getWalkable(mx, my) / 4,
      depth,
      archetype.intel,
      0, // targetHasBadStatus
    );

    const probs  = forward(net, feats);
    let action = argmax(probs);

    // Apply action
    if (action >= ACTION_SPELL_0 && action <= ACTION_SPELL_MAX) {
      const spellIdx = action - ACTION_SPELL_0;
      if (spellIdx < archetype.numSpells && spellReady(cooldowns, spellIdx) && mana >= 8) {
        // Cast spell — deal damage to player if in range
        if (dist <= 8) {
          const dmg = archetype.spellDamage ?? 10;
          playerHp  -= dmg;
          damageDealt += dmg;
          mana -= 12;
          useSpell(cooldowns, spellIdx);
          spellsCast++;
        }
        // No movement this turn
      } else {
        action = ACTION_WAIT; // spell unavailable, hold
      }
    } else if (action === ACTION_WAIT) {
      // hold — no movement
    } else if (action === ACTION_RANGED) {
      // ranged attack if in range
      if (archetype.hasRanged && dist > 1 && dist <= 8) {
        const dmg = 6;
        playerHp  -= dmg;
        damageDealt += dmg;
      }
    } else if (action <= 7) {
      // Move in chosen direction
      const dir = MOVE_DIRS[action];
      const nmx = mx + dir.dx;
      const nmy = my + dir.dy;
      mx = nmx;
      my = nmy;

      // Melee if adjacent after move
      const newDist = Math.max(Math.abs(mx - px), Math.abs(my - py));
      if (newDist <= 1) {
        const dmg = archetype.attack + rng.nextInt(4);
        playerHp   -= dmg;
        damageDealt += dmg;
      }
    }

    tickCooldowns(cooldowns);

    // Player moves toward monster (pressure)
    const pdx = Math.sign(mx - px);
    const pdy = Math.sign(my - py);
    px += pdx;
    py += pdy;

    // Player attacks if adjacent
    const pDist = Math.max(Math.abs(mx - px), Math.abs(my - py));
    if (pDist <= 1) {
      const pdmg = 8 + rng.nextInt(4);
      monsterHp  -= pdmg;
      damageTaken += pdmg;
    }

    if (playerHp <= 0 || monsterHp <= 0) break;
  }

  // Fitness components
  const survived     = monsterHp > 0 ? 1 : 0;
  const killedPlayer = playerHp <= 0 ? 1 : 0;

  return damageDealt * 2
       + spellsCast  * 5
       + posScore    * 1
       - damageTaken * 0.5
       + killedPlayer * 200
       + survived    * 50;
}

// ── Evaluate a weight vector ──────────────────────────────────────────────────

function evaluate(weights, archetype, rng, trials, maxTurns) {
  const net = createMLP();
  setWeights(net, weights);

  let total = 0;
  const startDists = [2, 4, 8, 12];
  const arenas     = ARENA_TYPES;

  for (let t = 0; t < trials; t++) {
    const startDist = startDists[t % startDists.length];
    const arena     = arenas[t % arenas.length];
    total += runTrial(net, archetype, arena, rng, startDist, maxTurns);
  }
  return total / trials;
}

// ── (1+λ) Evolution Strategy ──────────────────────────────────────────────────

async function train(opts) {
  const archetype = ARCHETYPES[opts.tier];
  if (!archetype) {
    console.error(`Unknown tier '${opts.tier}'. Valid: tactical, caster`);
    Deno.exit(1);
  }

  const rng    = makeRng(opts.seed);
  const nWeights = totalWeightCount();
  console.log(`Training tier=${opts.tier}  weights=${nWeights}  gens=${opts.gens}  λ=${opts.lambda}  σ=${opts.sigma}`);

  // Initialise with default Xavier weights
  const parentNet  = createMLP();
  let parentW      = getWeights(parentNet);
  let parentFit    = evaluate(parentW, archetype, makeRng(opts.seed), opts.trials, opts.turns);
  let sigma        = opts.sigma;

  console.log(`Initial fitness: ${parentFit.toFixed(2)}`);

  const logEvery = Math.max(1, (opts.gens / 20) | 0);

  for (let gen = 1; gen <= opts.gens; gen++) {
    let bestChildW   = null;
    let bestChildFit = -Infinity;

    for (let c = 0; c < opts.lambda; c++) {
      const childW = new Float64Array(nWeights);
      for (let i = 0; i < nWeights; i++) {
        childW[i] = parentW[i] + rng.nextGaussian() * sigma;
      }
      const fit = evaluate(childW, archetype, makeRng(opts.seed + gen * opts.lambda + c), opts.trials, opts.turns);
      if (fit > bestChildFit) { bestChildFit = fit; bestChildW = childW; }
    }

    if (bestChildFit >= parentFit) {
      parentW   = bestChildW;
      parentFit = bestChildFit;
      sigma     = Math.min(0.3, sigma * 1.02); // widen slightly on success
    } else {
      sigma = Math.max(0.01, sigma * 0.98); // shrink on failure
    }

    if (gen % logEvery === 0 || gen === opts.gens) {
      console.log(`gen ${String(gen).padStart(5)}  fit=${parentFit.toFixed(2)}  σ=${sigma.toFixed(4)}`);
    }
  }

  console.log(`\nFinal fitness: ${parentFit.toFixed(2)}`);

  // Serialise result
  const finalNet = createMLP();
  setWeights(finalNet, parentW);
  const serialized = serializeNet(finalNet);

  const jsSnippet = `  tier_${opts.tier}: ${JSON.stringify(serialized, null, 4)},`;
  console.log('\n// ── Paste into src/rules/data/aiWeights.js ───────────────────────────────');
  console.log(`// tier: ${opts.tier}  final_fitness: ${parentFit.toFixed(2)}`);
  console.log(jsSnippet);

  // Optionally patch aiWeights.js
  if (opts.out) {
    await patchWeightsFile(opts.out, opts.tier, serialized, parentFit);
    console.log(`\nPatched ${opts.out}`);
  }
}

// ── Patch aiWeights.js in-place ───────────────────────────────────────────────

async function patchWeightsFile(filePath, tier, serialized, fitness) {
  let src;
  try { src = await Deno.readTextFile(filePath); } catch { src = ''; }

  const key    = `tier_${tier}`;
  const value  = JSON.stringify(serialized);
  const marker = `  ${key}:`;

  // Try to replace existing key
  const lineRe = new RegExp(`^(\\s*)${key}:\\s*.*$`, 'm');
  if (lineRe.test(src)) {
    src = src.replace(lineRe, `$1${key}: ${value}, // fitness=${fitness.toFixed(2)}`);
  } else {
    // Insert before closing } of TRAINED_WEIGHTS
    src = src.replace(
      /^(export const TRAINED_WEIGHTS\s*=\s*\{)([\s\S]*?)(\};)/m,
      (_, open, body, close) => {
        const trimmed = body.trimEnd();
        const sep = trimmed.endsWith(',') ? '\n' : ',\n';
        return `${open}${trimmed}${sep}  ${key}: ${value}, // fitness=${fitness.toFixed(2)}\n${close}`;
      }
    );
  }

  await Deno.writeTextFile(filePath, src);
}

// ── Entry point ───────────────────────────────────────────────────────────────

const opts = parseArgs(Deno.args);
await train(opts);
