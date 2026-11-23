import { defineArchetype } from "../../lib/ecs-js/archetype.js";
import { Position } from "../components/Position.js";
import { Trap } from "../components/Trap.js";
import { NamedIdentity } from "../components/NamedIdentity.js";

// Spike trap — percentage-based HP damage on trigger
export const SpikeTrap = defineArchetype(
    "SpikeTrap",
    [Position, (p) => ({ x: p.x ?? 0, y: p.y ?? 0 })],
    [Trap, (p) => ({
        type: 'spike',
        script: 'trap_spike',
        params: p.trapParams ?? { percent: 0.50 },
        revealed: false,
        armed: true,
        difficulty: p.difficulty ?? 8,
    })],
    [NamedIdentity, () => ({ name: 'Spike Trap', identity: 'trap_spike' })],
);

// Snake trap — spawns snakes on trigger
export const SnakeTrap = defineArchetype(
    "SnakeTrap",
    [Position, (p) => ({ x: p.x ?? 0, y: p.y ?? 0 })],
    [Trap, (p) => ({
        type: 'snake',
        script: 'trap_snake',
        params: p.trapParams ?? { count: 4 },
        revealed: false,
        armed: true,
        difficulty: p.difficulty ?? 12,
    })],
    [NamedIdentity, () => ({ name: 'Snake Trap', identity: 'trap_snake' })],
);

// Shock trap — electric damage + sensory overload (stun, blindness, deafness) on trigger
// Damage is 15% of max HP (down from 30%) because sensory impairment is now a real penalty.
export const ShockTrap = defineArchetype(
    "ShockTrap",
    [Position, (p) => ({ x: p.x ?? 0, y: p.y ?? 0 })],
    [Trap, (p) => ({
        type: 'shock',
        script: 'trap_shock',
        params: p.trapParams ?? { percent: 0.15 },
        revealed: false,
        armed: true,
        difficulty: p.difficulty ?? 15,
    })],
    [NamedIdentity, () => ({ name: 'Shock Trap', identity: 'trap_shock' })],
);

// Pit trap — forced reposition plus minor impact damage
export const PitTrap = defineArchetype(
    "PitTrap",
    [Position, (p) => ({ x: p.x ?? 0, y: p.y ?? 0 })],
    [Trap, (p) => ({
        type: "pit",
        script: "trap_pit",
        params: p.trapParams ?? { dropDepth: 1, percent: 0.08 },
        revealed: false,
        armed: true,
        difficulty: p.difficulty ?? 14,
    })],
    [NamedIdentity, () => ({ name: "Pit Trap", identity: "trap_pit" })],
);

// Siphon trap — drains a resource and can transfer it to nearby hostiles
export const SiphonTrap = defineArchetype(
    "SiphonTrap",
    [Position, (p) => ({ x: p.x ?? 0, y: p.y ?? 0 })],
    [Trap, (p) => ({
        type: "siphon",
        script: "trap_siphon",
        params: p.trapParams ?? { resource: "drain", percent: 0.15, healNearestEnemy: false },
        revealed: false,
        armed: true,
        difficulty: p.difficulty ?? 13,
    })],
    [NamedIdentity, () => ({ name: "Siphon Trap", identity: "trap_siphon" })],
);

// Rust trap — anti-gear pressure through temporary stat suppression
export const RustTrap = defineArchetype(
    "RustTrap",
    [Position, (p) => ({ x: p.x ?? 0, y: p.y ?? 0 })],
    [Trap, (p) => ({
        type: "rust",
        script: "trap_rust",
        params: p.trapParams ?? { stat: "armor", amount: 2, duration: 20 },
        revealed: false,
        armed: true,
        difficulty: p.difficulty ?? 12,
    })],
    [NamedIdentity, () => ({ name: "Rust Trap", identity: "trap_rust" })],
);

// Swarm trap — many weak creatures instead of one elite threat
export const SwarmTrap = defineArchetype(
    "SwarmTrap",
    [Position, (p) => ({ x: p.x ?? 0, y: p.y ?? 0 })],
    [Trap, (p) => ({
        type: "swarm",
        script: "trap_swarm",
        params: p.trapParams ?? { monsterId: "spider", count: 6 },
        revealed: false,
        armed: true,
        difficulty: p.difficulty ?? 11,
    })],
    [NamedIdentity, () => ({ name: "Swarm Trap", identity: "trap_swarm" })],
);

// Arrow trap — reusable pressure plate aimed from a nearby cardinal wall
export const ArrowTrap = defineArchetype(
    "ArrowTrap",
    [Position, (p) => ({ x: p.x ?? 0, y: p.y ?? 0 })],
    [Trap, (p) => ({
        type: "arrow",
        script: "trap_arrow",
        params: p.trapParams ?? { dice: "1d8", resetsEvery: 1 },
        revealed: false,
        armed: true,
        difficulty: p.difficulty ?? 14,
    })],
    [NamedIdentity, () => ({ name: "Arrow Trap", identity: "trap_arrow" })],
);

// Water trap — opens the ceiling and spreads shallow water over several turns.
export const WaterTrap = defineArchetype(
    "WaterTrap",
    [Position, (p) => ({ x: p.x ?? 0, y: p.y ?? 0 })],
    [Trap, (p) => ({
        type: "water",
        script: "trap_water",
        params: p.trapParams ?? { volume: 18, spreadPerTurn: 3 },
        revealed: false,
        armed: true,
        difficulty: p.difficulty ?? 14,
    })],
    [NamedIdentity, () => ({ name: "Water Trap", identity: "trap_water" })],
);
