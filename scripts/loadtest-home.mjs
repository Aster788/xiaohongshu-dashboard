import { performance } from "node:perf_hooks";

const target = process.env.TARGET_URL ?? "http://localhost:3000/";
const concurrency = Number(process.env.CONCURRENCY ?? 500);
const durationMs = Number(process.env.DURATION_MS ?? 20000);

const latencies = [];
let ok = 0;
let failed = 0;
let stop = false;

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function worker() {
  while (!stop) {
    const started = performance.now();
    try {
      const response = await fetch(target, {
        method: "GET",
        cache: "no-store",
      });
      const elapsed = performance.now() - started;
      latencies.push(elapsed);
      if (response.ok) ok += 1;
      else failed += 1;
      await response.arrayBuffer();
    } catch {
      const elapsed = performance.now() - started;
      latencies.push(elapsed);
      failed += 1;
    }
  }
}

async function main() {
  console.log(`[loadtest] target=${target}`);
  console.log(`[loadtest] concurrency=${concurrency}, durationMs=${durationMs}`);

  const workers = Array.from({ length: concurrency }, () => worker());
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  stop = true;
  await Promise.all(workers);

  const sorted = [...latencies].sort((a, b) => a - b);
  const total = ok + failed;
  const avg = sorted.length ? sorted.reduce((sum, n) => sum + n, 0) / sorted.length : null;
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);
  const rps = total / (durationMs / 1000);

  console.log("\n[loadtest] summary");
  console.log(`requests=${total}, ok=${ok}, failed=${failed}, failRate=${total ? ((failed / total) * 100).toFixed(2) : "0.00"}%`);
  console.log(`rps=${rps.toFixed(2)}`);
  console.log(`latencyMs avg=${avg?.toFixed(2) ?? "n/a"} p50=${p50?.toFixed(2) ?? "n/a"} p95=${p95?.toFixed(2) ?? "n/a"} p99=${p99?.toFixed(2) ?? "n/a"}`);
}

main().catch((error) => {
  console.error("[loadtest] fatal", error);
  process.exit(1);
});
