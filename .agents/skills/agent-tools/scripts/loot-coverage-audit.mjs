#!/usr/bin/env deno run --allow-read

import { ITEM_CATALOG } from "../../../../src/rules/data/itemCatalog.js";
import { LOOT_TABLES } from "../../../../src/rules/data/lootTables.js";
import "../../../../src/content/items/index.js";
import { allContentItems } from "../../../../src/content/registry.js";

const INSTALLED_ITEM_CATALOG = { ...ITEM_CATALOG };
for (const [id, def] of allContentItems()) INSTALLED_ITEM_CATALOG[id] = def;

const ENTRY_TYPES = new Set([
  "nothing", "gold", "archetype", "equip", "item", "gem", "table",
]);

const ARCHETYPES = new Set([
  "HealthPotion", "GoldStack", "ArrowsStack", "FireArrowsStack",
  "PiercingArrowsStack", "BodkinArrowsStack", "BluntHeadArrowsStack",
  "BombArrowsStack", "ScrollOfMapping", "Bone", "Ashes", "Ration",
  "IronRation", "WildBerries", "WildHerbs",
]);

const ARCHETYPE_ITEM_ALIASES = new Map([
  ["food_ration", "Ration"],
  ["food_iron_ration", "IronRation"],
  ["food_wild_berries", "WildBerries"],
  ["food_wild_herbs", "WildHerbs"],
  ["scroll_mapping", "ScrollOfMapping"],
]);

const DEFAULT_ROOTS = ["src", "tests", "docs"];

export function parseArgs(argv) {
  const opts = {
    format: "summary",
    roots: DEFAULT_ROOTS,
    failOnIssues: false,
    failOnUncovered: false,
    failOnCatalogGaps: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i] || "");
    if (arg === "--format" && argv[i + 1]) opts.format = String(argv[++i]);
    else if (arg === "--roots" && argv[i + 1]) {
      opts.roots = String(argv[++i]).split(",").map((v) => v.trim()).filter(Boolean);
    } else if (arg === "--fail-on-issues") opts.failOnIssues = true;
    else if (arg === "--fail-on-uncovered") opts.failOnUncovered = true;
    else if (arg === "--fail-on-catalog-gaps") opts.failOnCatalogGaps = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
  }
  return opts;
}

export function usage() {
  return `Usage:
  deno run --allow-read .agents/skills/agent-tools/scripts/loot-coverage-audit.mjs
  deno run --allow-read .agents/skills/agent-tools/scripts/loot-coverage-audit.mjs --format csv

Audits every LOOT_TABLES entry for schema/reference problems and reports
runtime reachability, dynamic routes, test references, and reverse catalog
coverage.`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function collectFiles(root, out = []) {
  const stat = await Deno.stat(root).catch(() => null);
  if (!stat) return out;
  if (stat.isFile) {
    if (/\.(js|mjs|md)$/.test(root)) out.push(root);
    return out;
  }
  for await (const entry of Deno.readDir(root)) {
    const path = `${root.replace(/\/$/, "")}/${entry.name}`;
    if (path.includes("/.git/") || path.includes("/src/lib/")) continue;
    if (entry.isDirectory) await collectFiles(path, out);
    else if (entry.isFile && /\.(js|mjs|md)$/.test(entry.name)) out.push(path);
  }
  return out;
}

function countLiteral(text, id) {
  const match = text.match(new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(id)}(?![A-Za-z0-9_])`, "g"));
  return match?.length || 0;
}

function addIssue(issues, tableId, code, detail) {
  issues.push({ tableId, code, detail });
}

export function validateLootTables(tables = LOOT_TABLES, catalog = INSTALLED_ITEM_CATALOG) {
  const issues = [];
  const nestedRefs = Object.fromEntries(Object.keys(tables).map((id) => [id, []]));
  const tableIds = new Set(Object.keys(tables));

  for (const [tableId, table] of Object.entries(tables)) {
    if (!table || typeof table !== "object") {
      addIssue(issues, tableId, "invalid-table", "table must be an object");
      continue;
    }
    const min = Number(table.rolls?.min);
    const max = Number(table.rolls?.max);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
      addIssue(issues, tableId, "invalid-rolls", "rolls must be integer min/max with 1 <= min <= max");
    }
    if (!Array.isArray(table.entries) || table.entries.length === 0) {
      addIssue(issues, tableId, "empty-entries", "table must contain at least one entry");
      continue;
    }
    let positiveWeight = false;
    for (let index = 0; index < table.entries.length; index++) {
      const entry = table.entries[index];
      const label = `entry ${index + 1}`;
      if (!entry || typeof entry !== "object") {
        addIssue(issues, tableId, "invalid-entry", `${label} must be an object`);
        continue;
      }
      const type = String(entry.type || "");
      const weight = Number(entry.weight);
      if (!ENTRY_TYPES.has(type)) addIssue(issues, tableId, "unknown-entry-type", `${label} has type ${JSON.stringify(type)}`);
      if (!Number.isFinite(weight) || weight <= 0) addIssue(issues, tableId, "invalid-weight", `${label} must have a positive weight`);
      else positiveWeight = true;

      if (type === "item" && !catalog[entry.itemId]) {
        addIssue(issues, tableId, "missing-item", `${label} references unknown item ${JSON.stringify(entry.itemId)}`);
      }
      if (type === "equip") {
        if (!Array.isArray(entry.pool) || entry.pool.length === 0) {
          addIssue(issues, tableId, "empty-equip-pool", `${label} has no equipment pool`);
        } else {
          for (const equipId of entry.pool) {
            if (!catalog[equipId]) addIssue(issues, tableId, "missing-equipment", `${label} references unknown catalog id ${JSON.stringify(equipId)}`);
            else if (catalog[equipId].catalogKind !== "equipment") addIssue(issues, tableId, "non-equipment-pool", `${label} references non-equipment ${JSON.stringify(equipId)}`);
          }
        }
      }
      if (type === "archetype" && !ARCHETYPES.has(String(entry.archetype || ""))) {
        addIssue(issues, tableId, "missing-archetype", `${label} references unknown archetype ${JSON.stringify(entry.archetype)}`);
      }
      if (type === "table") {
        const target = String(entry.tableId || "");
        if (!target) addIssue(issues, tableId, "missing-table-id", `${label} has no tableId`);
        else {
          nestedRefs[tableId].push(target);
          if (!tableIds.has(target)) addIssue(issues, tableId, "missing-table", `${label} references unknown table ${JSON.stringify(target)}`);
        }
      }
    }
    if (!positiveWeight) addIssue(issues, tableId, "zero-weight-table", "no entry can ever be selected");
    for (const guaranteedTableId of table.guaranteedTables || []) {
      const target = String(guaranteedTableId || "");
      if (!tableIds.has(target)) addIssue(issues, tableId, "missing-guaranteed-table", `guaranteedTables references unknown table ${JSON.stringify(target)}`);
      else nestedRefs[tableId].push(target);
    }
  }

  for (const tableId of tableIds) {
    const visiting = new Set();
    const visit = (current) => {
      if (visiting.has(current)) {
        addIssue(issues, tableId, "table-cycle", `nested table cycle includes ${JSON.stringify(current)}`);
        return;
      }
      visiting.add(current);
      for (const target of nestedRefs[current] || []) visit(target);
      visiting.delete(current);
    };
    visit(tableId);
  }
  return { issues, nestedRefs };
}

function buildReachableSet(roots, nestedRefs) {
  const reachable = new Set();
  const visit = (id) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const target of nestedRefs[id] || []) visit(target);
  };
  for (const root of roots) visit(root);
  return reachable;
}

function collectReachableLootRefs(tables, reachableTables) {
  const itemRefs = new Set();
  const equipRefs = new Set();
  const archetypeRefs = new Set();
  for (const tableId of reachableTables) {
    for (const entry of tables[tableId]?.entries || []) {
      if (entry.type === "item" && entry.itemId) itemRefs.add(String(entry.itemId));
      if (entry.type === "equip") for (const equipId of entry.pool || []) equipRefs.add(String(equipId));
      if (entry.type === "archetype" && entry.archetype) archetypeRefs.add(String(entry.archetype));
    }
  }
  return { itemRefs, equipRefs, archetypeRefs };
}

function coverageRow(ids, refs, archetypeRefs = new Set(), aliases = new Map()) {
  const covered = [];
  const missing = [];
  const coveredByArchetype = [];
  for (const id of ids.sort()) {
    if (refs.has(id)) covered.push(id);
    else if (aliases.has(id) && archetypeRefs.has(aliases.get(id))) {
      covered.push(id);
      coveredByArchetype.push(id);
    } else missing.push(id);
  }
  return {
    total: ids.length,
    covered: covered.length,
    missing: missing.length,
    missingIds: missing,
    coveredByArchetype,
  };
}

export function auditCatalogCoverage(catalog = INSTALLED_ITEM_CATALOG, tables = LOOT_TABLES, reachableTables = new Set(Object.keys(tables))) {
  const refs = collectReachableLootRefs(tables, reachableTables);
  const equipmentIds = Object.keys(catalog).filter((id) => catalog[id]?.catalogKind === "equipment");
  const magicIds = Object.keys(catalog).filter((id) => catalog[id]?.catalogKind === "magic");
  const reagentIds = Object.keys(catalog).filter((id) => id.startsWith("reagent_"));
  const equipment = coverageRow(equipmentIds, refs.equipRefs);
  const magic = coverageRow(magicIds, refs.itemRefs, refs.archetypeRefs, ARCHETYPE_ITEM_ALIASES);
  const reagents = coverageRow(reagentIds, refs.itemRefs);
  return {
    equipment,
    magic,
    reagents,
    reachableTableCount: reachableTables.size,
    itemReferenceCount: refs.itemRefs.size,
    equipmentReferenceCount: refs.equipRefs.size,
    archetypeReferenceCount: refs.archetypeRefs.size,
  };
}

function dynamicRuntimeRoutes(textByFile, tableIds) {
  const routes = [];
  for (const [file, text] of textByFile) {
    if (!file.startsWith("src/")) continue;
    if (/drop:tier\$\{/.test(text)) {
      const matches = [...tableIds].filter((id) => id.startsWith("drop:tier"));
      if (matches.length) routes.push({ pattern: "drop:tier${tier}", file, tableIds: matches });
    }
  }
  return routes;
}

export async function buildLootCoverageReport({ tables = LOOT_TABLES, catalog = INSTALLED_ITEM_CATALOG, roots = DEFAULT_ROOTS } = {}) {
  const validation = validateLootTables(tables, catalog);
  const tableIds = Object.keys(tables).sort();
  const files = [];
  for (const root of roots) await collectFiles(root, files);
  const uniqueFiles = [...new Set(files)].sort();
  const textByFile = new Map();
  for (const file of uniqueFiles) textByFile.set(file, await Deno.readTextFile(file).catch(() => ""));

  const runtimeRoots = new Set();
  const rows = tableIds.map((tableId) => {
    const runtimeFiles = [];
    const testFiles = [];
    const docFiles = [];
    for (const [file, text] of textByFile) {
      if (file === "src/rules/data/lootTables.js") continue;
      if (countLiteral(text, tableId) <= 0) continue;
      if (file.startsWith("tests/")) testFiles.push(file);
      else if (file.startsWith("src/")) {
        runtimeFiles.push(file);
        runtimeRoots.add(tableId);
      } else if (file.startsWith("docs/")) docFiles.push(file);
    }
    return {
      tableId,
      entryCount: Array.isArray(tables[tableId]?.entries) ? tables[tableId].entries.length : 0,
      totalWeight: Array.isArray(tables[tableId]?.entries) ? tables[tableId].entries.reduce((sum, e) => sum + Number(e?.weight || 0), 0) : 0,
      runtimeRefCount: runtimeFiles.length,
      runtimeFiles,
      testRefCount: testFiles.length,
      testFiles,
      docRefCount: docFiles.length,
      nestedRefs: validation.nestedRefs[tableId] || [],
    };
  });
  const routes = dynamicRuntimeRoutes(textByFile, new Set(tableIds));
  for (const route of routes) for (const tableId of route.tableIds) runtimeRoots.add(tableId);
  const reachable = buildReachableSet(runtimeRoots, validation.nestedRefs);
  for (const row of rows) {
    row.runtimeCoverage = row.runtimeRefCount > 0 ? "direct" : reachable.has(row.tableId) ? "nested-or-dynamic" : "unreachable";
    row.testCoverage = row.testRefCount > 0 ? "referenced" : "unreferenced";
  }
  const catalogCoverage = auditCatalogCoverage(catalog, tables, reachable);
  const catalogGapCount = catalogCoverage.equipment.missing + catalogCoverage.magic.missing + catalogCoverage.reagents.missing;
  return {
    tableCount: rows.length,
    issueCount: validation.issues.length,
    issues: validation.issues,
    dynamicRoutes: routes,
    runtimeRoots: [...runtimeRoots].sort(),
    rows,
    uncoveredRuntime: rows.filter((row) => row.runtimeCoverage === "unreachable").map((row) => row.tableId),
    unreferencedTests: rows.filter((row) => row.testCoverage === "unreferenced").map((row) => row.tableId),
    catalogCoverage,
    catalogGapCount,
  };
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function formatCsv(report) {
  const fields = ["table_id", "entry_count", "total_weight", "runtime_coverage", "test_coverage", "runtime_ref_count", "test_ref_count", "nested_refs"];
  return [fields.join(","), ...report.rows.map((row) => [row.tableId, row.entryCount, row.totalWeight, row.runtimeCoverage, row.testCoverage, row.runtimeRefCount, row.testRefCount, row.nestedRefs].map(csvCell).join(","))].join("\n");
}

export function formatSummary(report) {
  const unreachable = report.uncoveredRuntime.length ? report.uncoveredRuntime.join(", ") : "none";
  const untested = report.unreferencedTests.length ? report.unreferencedTests.join(", ") : "none";
  const issues = report.issueCount ? report.issues.map((issue) => `${issue.tableId}: ${issue.code} (${issue.detail})`).join("\n  ") : "none";
  const routes = report.dynamicRoutes.length ? report.dynamicRoutes.map((route) => `${route.pattern} -> ${route.tableIds.join(", ")} (${route.file})`).join("\n  ") : "none";
  const catalog = Object.entries(report.catalogCoverage).filter(([, value]) => value && typeof value.total === "number").map(([kind, value]) => `${kind}: ${value.covered}/${value.total} covered; missing ${value.missing ? value.missingIds.join(", ") : "none"}`).join("\n  ");
  return [
    `loot tables: ${report.tableCount}`,
    `validation issues: ${report.issueCount}`,
    `runtime-unreachable: ${unreachable}`,
    `without direct test references: ${untested}`,
    `dynamic runtime routes:\n  ${routes}`,
    `catalog coverage gaps: ${report.catalogGapCount}`,
    `catalog coverage:\n  ${catalog}`,
    `issues:\n  ${issues}`,
  ].join("\n");
}

export async function main() {
  const opts = parseArgs(Deno.args);
  if (opts.help) {
    console.log(usage());
    return;
  }
  const report = await buildLootCoverageReport({ roots: opts.roots });
  if (opts.format === "json") console.log(JSON.stringify(report, null, 2));
  else if (opts.format === "csv") console.log(formatCsv(report));
  else console.log(formatSummary(report));
  if (opts.failOnIssues && report.issueCount > 0) Deno.exit(1);
  if (opts.failOnCatalogGaps && report.catalogGapCount > 0) Deno.exit(1);
  if (opts.failOnUncovered && (report.uncoveredRuntime.length > 0 || report.unreferencedTests.length > 0 || report.catalogGapCount > 0)) Deno.exit(1);
}

if (import.meta.main) await main();
