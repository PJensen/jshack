// A phone-friendly, opt-in spell showcase for ?spellreel.
// It drives the normal CastSpellIntent path; it is not part of ordinary runs.

import { listSpells } from "../../rules/data/spells.js";
import { Brain } from "../../rules/components/Brain.js";
import { Mana } from "../../rules/components/Mana.js";
import { Stamina } from "../../rules/components/Stamina.js";
import { Vitality } from "../../rules/components/Vitality.js";
import { Position } from "../../rules/components/Position.js";
import { NamedIdentity } from "../../rules/components/NamedIdentity.js";
import { Player } from "../../rules/components/Player.js";
import { CastSpellIntent } from "../../rules/components/Intents/CastSpellIntent.js";

const REEL_EXCLUDED_SPELLS = new Set([
  // These change the run location or require a special world state rather than
  // producing a useful combat showcase frame.
  "fishing",
  "hearthstone",
  "homecoming",
  "resurrection",
]);

const READY_DELAY_MS = 900;
const CAST_DELAY_MS = 2200;

function findPlayer(world) {
  for (const [id] of world.query(Player)) return id;
  return 0;
}

function findShowcaseTarget(world, playerId) {
  let fallback = 0;
  const playerPos = world.get(playerId, Position);
  for (const [id, identity] of world.query(NamedIdentity)) {
    if (id === playerId || identity?.identity === "audio_sign") continue;
    if (!world.has(id, Vitality)) continue;
    fallback = id;
    const pos = world.get(id, Position);
    if (pos) {
      // Pull the first stasis monster beside the player so every effect stays
      // inside the phone-sized camera framing of the existing ?audio stage.
      if (playerPos) {
        world.set(id, Position, { x: playerPos.x + 4, y: playerPos.y });
        return { id, x: playerPos.x + 4, y: playerPos.y };
      }
      return { id, x: pos.x, y: pos.y };
    }
  }
  return fallback ? { id: fallback, x: 0, y: 0 } : { id: 0, x: 0, y: 0 };
}

function makeOverlay(total) {
  if (typeof document === "undefined" || !document.body) return null;
  const root = document.createElement("div");
  root.id = "jshack-spell-reel";
  Object.assign(root.style, {
    position: "fixed",
    left: "50%",
    bottom: "18px",
    transform: "translateX(-50%)",
    zIndex: "8000",
    width: "min(92vw, 520px)",
    padding: "12px 14px",
    border: "1px solid rgba(139, 212, 255, 0.42)",
    borderRadius: "10px",
    background: "rgba(7, 12, 23, 0.88)",
    color: "#d6ecff",
    font: "13px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    boxSizing: "border-box",
    backdropFilter: "blur(5px)",
  });

  const title = document.createElement("div");
  title.textContent = "SPELL REEL";
  title.style.cssText = "letter-spacing:.12em;color:#8bd4ff;font-weight:700;margin-bottom:4px";
  const status = document.createElement("div");
  status.textContent = `Ready — ${total} spells`;
  status.style.cssText = "min-height:1.4em;color:#cffff4";
  const controls = document.createElement("div");
  controls.style.cssText = "display:flex;gap:8px;margin-top:9px";
  const buttonStyle = "border:1px solid rgba(139,212,255,.38);border-radius:6px;padding:6px 10px;background:rgba(40,80,120,.42);color:#d6ecff;font:inherit";
  const start = document.createElement("button");
  start.type = "button";
  start.textContent = "Start";
  start.style.cssText = buttonStyle;
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "Next";
  next.style.cssText = buttonStyle;
  const hint = document.createElement("span");
  hint.textContent = "Record your screen and game audio on your phone.";
  hint.style.cssText = "margin-left:auto;align-self:center;color:#86a7bf;font-size:11px;text-align:right";
  controls.append(start, next, hint);
  root.append(title, status, controls);
  document.body.append(root);
  return { root, status, start, next };
}

export function startSpellReel({ world, intervalMs = CAST_DELAY_MS } = {}) {
  if (!world || typeof window === "undefined") return null;
  const playerId = findPlayer(world);
  if (!playerId) return null;

  const spells = listSpells().filter((spell) => !REEL_EXCLUDED_SPELLS.has(spell.id));
  const brain = world.get(playerId, Brain);
  if (brain) brain.learnedSpellIds = spells.map((spell) => spell.id);

  // Give the reel enough resources to show the authored effects without
  // changing the normal player setup outside this opt-in mode.
  const mana = world.get(playerId, Mana);
  if (mana) { mana.maxMana = 100000; mana.mana = 100000; mana.manaRegen = 0; }
  const stamina = world.get(playerId, Stamina);
  if (stamina) { stamina.maxStamina = 100000; stamina.stamina = 100000; stamina.staminaRegen = 0; }
  const vitality = world.get(playerId, Vitality);
  if (vitality) { vitality.maxHp = 100000; vitality.hp = 100000; }

  const target = findShowcaseTarget(world, playerId);
  const overlay = makeOverlay(spells.length);
  let index = 0;
  let running = false;
  let timer = 0;

  function updateStatus(prefix = "Ready") {
    const spell = spells[index];
    if (overlay) overlay.status.textContent = spell
      ? `${prefix} — ${index + 1}/${spells.length}: ${spell.symbol || "✦"} ${spell.name}`
      : "Complete — all showcase spells finished";
  }

  function advance() {
    if (index >= spells.length) {
      running = false;
      if (overlay) overlay.start.textContent = "Replay";
      updateStatus("Complete");
      return;
    }
    const spell = spells[index++];
    updateStatus("Casting");
    const pos = world.get(playerId, Position);
    const targetPos = world.get(target.id, Position);
    const x = Number.isFinite(targetPos?.x) ? targetPos.x : (pos?.x || 0) + 3;
    const y = Number.isFinite(targetPos?.y) ? targetPos.y : (pos?.y || 0);
    try {
      if (world.has(playerId, CastSpellIntent)) world.remove(playerId, CastSpellIntent);
      world.add(playerId, CastSpellIntent, {
        spellId: spell.id,
        targetId: target.id || playerId,
        x,
        y,
      });
      // Let cast-time spells resolve through the same scheduler before the
      // next reel entry replaces the player's intent.
      const turns = Math.max(1, (Number(spell.castTime) || 0) + 1);
      world.tick(turns);
    } catch (error) {
      console.warn(`[?spellreel] Failed to cast ${spell.id}:`, error);
    }
    if (running) timer = window.setTimeout(advance, intervalMs);
  }

  function start() {
    if (index >= spells.length) index = 0;
    running = true;
    if (overlay) overlay.start.textContent = "Pause";
    updateStatus("Starting");
    window.clearTimeout(timer);
    timer = window.setTimeout(advance, READY_DELAY_MS);
  }

  function toggle() {
    if (running) {
      running = false;
      window.clearTimeout(timer);
      if (overlay) overlay.start.textContent = "Resume";
      updateStatus("Paused");
    } else start();
  }

  overlay?.start.addEventListener("click", toggle);
  overlay?.next.addEventListener("click", () => {
    running = false;
    window.clearTimeout(timer);
    advance();
  });
  updateStatus();
  return { start, stop: () => { running = false; window.clearTimeout(timer); overlay?.root.remove(); } };
}
