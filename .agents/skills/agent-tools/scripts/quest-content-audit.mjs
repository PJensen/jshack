#!/usr/bin/env deno run --allow-read

import { getMonster } from "../../../../src/rules/data/monsters.js";
import "../../../../src/content/monsters/index.js";
import { getQuestDef } from "../../../../src/rules/quests/registry.js";
import { UNDERWORLD_REGION_TEMPLATES } from "../../../../src/rules/environment/dungeon/underworldRegions.js";
import { LANDMARK_DEFS } from "../../../../src/rules/data/buildings/buildingRegistry.js";

function containsEntrance(value, templateId) {
  if (!value || typeof value !== "object") return false;
  if (String(value?.params?.entranceTemplateId || "") === templateId) return true;
  if (Array.isArray(value)) return value.some((entry) => containsEntrance(entry, templateId));
  return Object.values(value).some((entry) => containsEntrance(entry, templateId));
}

function authoredMonsterIds(template) {
  const ids = new Set();
  for (const entry of template?.content?.monsters || []) {
    if (typeof entry === "string") ids.add(entry);
    if (entry && typeof entry === "object") {
      if (typeof entry.id === "string") ids.add(entry.id);
      for (const id of entry.pool || []) if (typeof id === "string") ids.add(id);
    }
  }
  return ids;
}

export function auditQuestTemplate(template, quest, landmarks) {
  const errors = [];
  const templateId = String(template?.templateId || "");
  const questId = String(template?.questId || "");
  if (!templateId || !questId) return errors;
  if (!quest) errors.push(`missing quest definition for ${questId}`);
  if (String(quest?.tracker?.destinationTemplateId || "") !== templateId) {
    errors.push(`${questId} tracker must target ${templateId}`);
  }
  if (!containsEntrance(landmarks, templateId)) {
    errors.push(`${templateId} has no authored landmark entrance`);
  }
  for (const id of authoredMonsterIds(template)) {
    if (!getMonster(id)) errors.push(`${templateId} references unknown monster ${id}`);
  }
  return errors;
}

async function importQuestDefinitions() {
  const dir = new URL("../../../../src/rules/quests/definitions/", import.meta.url);
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith(".js")) continue;
    await import(new URL(entry.name, dir).href);
  }
}

async function main() {
  await importQuestDefinitions();
  const requested = Deno.args.find((arg) => !arg.startsWith("-")) || "rootbound_grotto";
  const entries = Object.entries(UNDERWORLD_REGION_TEMPLATES)
    .filter(([, template]) => template.templateId === requested);
  if (entries.length === 0) throw new Error(`unknown dungeon template '${requested}'`);

  const errors = [];
  for (const [key, template] of entries) {
    const quest = getQuestDef(template.questId);
    for (const error of auditQuestTemplate(template, quest, LANDMARK_DEFS)) {
      errors.push(`${key}: ${error}`);
    }
  }
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    Deno.exit(1);
  }
  console.log(`quest content audit passed (${entries.length} template${entries.length === 1 ? "" : "s"})`);
}

if (import.meta.main) await main();
