import { Interactable } from "../components/Interactable.js";
import { getAuthoredInteractable } from "./interactableRegistry.js";

function normalizeAffordance(raw, action, targetId) {
  if (!raw || typeof raw !== "object") return null;
  const label = String(raw.label || raw.button || "").trim();
  const title = String(raw.title || raw.name || label || "").trim();
  if (!title && !label) return null;
  return Object.freeze({
    targetId: Number(targetId || 0) | 0,
    action: String(action || ""),
    mode: String(raw.mode || ""),
    title: title || label,
    hint: String(raw.hint || raw.description || "").trim(),
    label: label || title,
  });
}

export function resolveInteractableAffordance(world, targetId) {
  const id = Number(targetId || 0) | 0;
  if (!(id > 0)) return null;
  const inter = world.get(id, Interactable);
  const action = String(inter?.action || "");
  if (!action) return null;
  const definition = getAuthoredInteractable(action);
  const affordance = definition?.affordance;
  if (!affordance && action === "talkToNPC" && String(inter.params?.dialogId || "").trim()) {
    return normalizeAffordance({
      title: "Talk",
      label: "Talk",
      hint: String(inter.params?.dialogue || "Speak with this character."),
    }, action, id);
  }
  if (!affordance) return null;
  const raw = typeof affordance === "function" ? affordance(world, id) : affordance;
  return normalizeAffordance(raw, action, id);
}
