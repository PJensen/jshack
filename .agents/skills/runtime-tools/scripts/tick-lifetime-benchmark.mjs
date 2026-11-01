import { World } from "../../../../src/lib/ecs-js/index.js";

function parseArgs(argv) {
  const out = {
    ticks: 3000,
    commandsPerTick: 1005,
    warmup: 100,
    window: 200,
    reportEvery: 500,
  };
  for (let i = 0; i < argv.length; i++) {
    const raw = String(argv[i] || "");
    if (!raw.startsWith("--")) continue;
    const [flag, inline] = raw.split("=", 2);
    const key = flag.slice(2);
    const value = inline != null ? inline : argv[i + 1];
    if (inline == null && value != null && !String(value).startsWith("--")) i++;
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    if (key === "ticks") out.ticks = Math.max(1, n | 0);
    else if (key === "commands-per-tick") {
      out.commandsPerTick = Math.max(0, n | 0);
    } else if (key === "warmup") out.warmup = Math.max(0, n | 0);
    else if (key === "window") out.window = Math.max(1, n | 0);
    else if (key === "report-every") out.reportEvery = Math.max(1, n | 0);
  }
  out.window = Math.min(out.window, out.ticks);
  out.warmup = Math.min(out.warmup, Math.max(0, out.ticks - out.window));
  return out;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

function mean(values) {
  if (!values.length) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

function sampleWindow(samples, start, length) {
  const values = samples.slice(start, start + length);
  return {
    avgMs: Number(mean(values).toFixed(6)),
    p95Ms: Number(percentile(values, 95).toFixed(6)),
    p99Ms: Number(percentile(values, 99).toFixed(6)),
  };
}

const opts = parseArgs(Deno.args);
const world = new World({ seed: 1 });
world.setScheduler((w) => {
  for (let i = 0; i < opts.commandsPerTick; i++) w.command(() => {});
});

const tickMs = [];
const pending = [];
for (let i = 0; i < opts.ticks; i++) {
  const t0 = performance.now();
  world.tick(1);
  tickMs.push(performance.now() - t0);
  const tick = i + 1;
  if (tick % opts.reportEvery === 0 || tick === opts.ticks) {
    pending.push({ tick, pendingOps: world.pendingOps().length });
  }
}

const early = sampleWindow(tickMs, opts.warmup, opts.window);
const lateStart = Math.max(0, opts.ticks - opts.window);
const late = sampleWindow(tickMs, lateStart, opts.window);
const denominator = Math.max(1, lateStart - opts.warmup);

console.log(JSON.stringify(
  {
    scenario: "stable deferred command overload",
    ticks: opts.ticks,
    commandsPerTick: opts.commandsPerTick,
    earlyWindow: { startTick: opts.warmup + 1, length: opts.window, ...early },
    lateWindow: { startTick: lateStart + 1, length: opts.window, ...late },
    avgGrowthRatio: Number(
      (late.avgMs / Math.max(early.avgMs, 0.000001)).toFixed(3),
    ),
    slopeAvgMsPerTick: Number(
      ((late.avgMs - early.avgMs) / denominator).toFixed(9),
    ),
    pending,
    entitiesAlive: world.alive.size,
    memory: Deno.memoryUsage(),
  },
  null,
  2,
));
