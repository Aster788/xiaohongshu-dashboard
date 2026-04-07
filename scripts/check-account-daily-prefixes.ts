/**
 * Diagnostic: row counts in account_daily for dashboard trend prefixes.
 * Run from repo root: npx dotenv-cli -c development -- npx tsx scripts/check-account-daily-prefixes.ts
 */
import { prisma } from "../lib/db";

const PREFIXES = [
  ["view.cover_ctr.", "Cover CTR (dashboard)"],
  ["engage.likes_trend.", "Likes trend"],
  ["engage.saves_trend.", "Saves trend"],
  ["view.views_trend.", "Views trend"],
  ["follower.net_trend.", "Net follower trend"],
  ["follower.new_follows_trend.", "New follows trend (dashboard merge)"],
  ["follower.unfollows_trend.", "Unfollows trend (dashboard merge)"],
] as const;

async function main() {
  console.log("account_daily row counts (metric_key startsWith):\n");
  for (const [prefix, label] of PREFIXES) {
    const n = await prisma.accountDaily.count({
      where: { metricKey: { startsWith: prefix } },
    });
    console.log(`  ${label.padEnd(28)} ${prefix.padEnd(22)} ${n}`);
  }

  const total = await prisma.accountDaily.count();
  console.log(`\n  Total account_daily rows: ${total}`);

  const sample = await prisma.accountDaily.findMany({
    select: { metricKey: true },
    distinct: ["metricKey"],
    orderBy: { metricKey: "asc" },
    take: 40,
  });
  if (sample.length > 0) {
    console.log("\nSample distinct metric_key (up to 40):");
    for (const s of sample) {
      console.log(`  ${s.metricKey}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
