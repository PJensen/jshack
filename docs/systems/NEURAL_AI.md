# Neural Monster AI

Policy layer for high-intelligence monsters (intel ≥ 7). A tiny feedforward neural network runs after `aiChaseSystem` each tick, overriding movement and spell decisions with learned behavior.

---

## Files

| File | Purpose |
|------|---------|
| `src/rules/ai/tinyMLP.js` | Forward-pass neural net (20→24→16→14, ReLU+softmax), weight serialization |
| `src/rules/ai/policyFeatures.js` | Extracts 20-float feature vector from world state |
| `src/rules/ai/policyAction.js` | Maps net output index → MoveIntent / CastSpellIntent |
| `src/rules/systems/aiPolicySystem.js` | ECS system: runs after aiChaseSystem in `ai` phase |
| `src/rules/data/aiWeights.js` | Trained weights for `tier_tactical` and `tier_caster` |
| `.agents/skills/monster-ai-training/scripts/trainAI.js` | Headless (1+λ)-ES trainer — pure JS mini-sim, no ECS |

---

## Architecture

```
aiScurrySystem   ← dumb (intel ≤ 3)
aiChaseSystem    ← all monsters: alert state, whileLOS hooks, movement
aiPolicySystem   ← intel ≥ 7, hunting, canActThisTurn only
```

**Integration contract:**
- If entity already has `CastSpellIntent` (set by a `whileLOS` hook) → policy skips it
- Otherwise: features → forward pass → argmax → `applyAction`
- `applyAction` can replace `MoveIntent` direction, add `CastSpellIntent`, or remove `MoveIntent` (hold)
- Spell casts mark the shared `Symbol.for("jshack:ai:castSpellOnLOS:cooldown")` so they don't double-fire with hooks

---

## Feature Vector (20 floats)

| idx | feature | range |
|-----|---------|-------|
| 0 | `dist / 20` | 0–1 |
| 1 | `dx / 20` | −1–1 |
| 2 | `dy / 20` | −1–1 |
| 3 | own HP ratio | 0–1 |
| 4 | target HP ratio | 0–1 |
| 5 | own mana ratio | 0–1 |
| 6 | isRetreating | 0/1 |
| 7 | nearby allies / 5 | 0–1 |
| 8–11 | spell[0–3] ready (off-cooldown + has mana) | 0/1 each |
| 12 | has ranged weapon + ammo | 0/1 |
| 13 | walkable cardinal neighbors / 4 | 0–1 |
| 14 | depth / 15 | 0–1 |
| 15 | intelligence / 10 | 0–1 |
| 16 | target has burn/stun/frozen | 0/1 |
| 17 | dist ≤ 1 (adjacent) | 0/1 |
| 18 | dist > 6 (far) | 0/1 |
| 19 | own HP ratio < 0.3 (critical) | 0/1 |

---

## Action Space (14 outputs)

| idx | action |
|-----|--------|
| 0–7 | Move N, NE, E, SE, S, SW, W, NW |
| 8 | Wait / hold position (removes MoveIntent) |
| 9–12 | Cast learnedSpells[0–3] |
| 13 | Use ranged weapon |

---

## Intelligence Tiers

| tier | intel | monsters | ideal range |
|------|-------|---------|-------------|
| `tactical` | 7–8 | wraith, orc_warchief, kobold_shaman, dark_knight | ≤ 1 tile (melee-dominant) |
| `caster` | 9–10 | lich, skeletal_agony_warlock, dark_acolyte | 3–7 tiles (kite + cast) |

---

## Training

```bash
# Quick smoke-test (~5 seconds)
deno run --allow-read --allow-write .agents/skills/monster-ai-training/scripts/trainAI.js --tier caster --gens 50

# Full retrain and auto-patch aiWeights.js
deno run --allow-read --allow-write .agents/skills/monster-ai-training/scripts/trainAI.js \
  --tier caster   --gens 2000 --lambda 20 --trials 50 \
  --out src/rules/data/aiWeights.js

deno run --allow-read --allow-write .agents/skills/monster-ai-training/scripts/trainAI.js \
  --tier tactical --gens 2000 --lambda 20 --trials 50 \
  --out src/rules/data/aiWeights.js
```

### CLI options

| flag | default | description |
|------|---------|-------------|
| `--tier tactical\|caster` | `caster` | Which archetype to train |
| `--gens N` | 500 | Generations |
| `--lambda N` | 10 | Offspring per generation |
| `--sigma F` | 0.08 | Initial perturbation std-dev (auto-adapts) |
| `--trials N` | 30 | Combat trials per candidate |
| `--turns N` | 60 | Max turns per trial |
| `--out path` | *(print only)* | Patch this file in-place with trained weights |
| `--seed N` | random | RNG seed for reproducibility |

### Fitness function

```
fitness = damageDealt × 2
        + spellsCast × 5
        + positionScore × 1    (turns at ideal range)
        - damageTaken × 0.5
        + playerKilled × 200
        + survived × 50
```

### Training mini-sim

Pure JS — no ECS, no tile map. Runs at ~10K trials/second.

- Monster starts at configurable distance from player
- Player walks toward monster every turn and attacks when adjacent
- Arena types: open (4 walkable neighbors), corridor (2), room (3)
- Multiple start distances tested per evaluation: 2, 4, 8, 12 tiles

---

## Network shape

```
20 inputs → Dense(24) → ReLU → Dense(16) → ReLU → Dense(14) → Softmax
Total params: 1142 scalars (Float64)
```

Forward pass uses pre-allocated scratch buffers (no GC pressure per tick).

---

## Future directions

- **Online adaptation**: after taking damage, run 1-gen perturbation against a mental model of the current encounter — monsters adapt mid-fight
- **Per-monster weights**: lich vs warlock have different optimal ranges; tier weights are a starting point
- **Higher-fidelity training**: import actual tile maps + movement system for real corridor geometry
- **Observation memory**: add last-N-turns delta features (player closing? player retreating?) for reactive tactics
- **Cooperative training**: multi-agent sim where monsters train together to flank / cut off escape routes
