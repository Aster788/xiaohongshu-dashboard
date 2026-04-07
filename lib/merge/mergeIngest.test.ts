import test from "node:test";
import assert from "node:assert/strict";
import { mergeDomainIntoDb } from "./mergeIngest";

function makeNote(i: number) {
  return {
    title: `note-${i}`,
    publishedDate: new Date(`2026-03-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`),
    format: i % 2 === 0 ? "图文" : "视频",
    impressions: BigInt(1000 + i),
    views: 2000 + i,
    likes: 300 + i,
    comments: 40 + i,
    saves: 50 + i,
    shares: 20 + i,
    followerGain: 5 + i,
  };
}

function makeDaily(i: number) {
  return {
    date: new Date(`2026-04-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`),
    metricKey: `view.views_trend.metric_${i}`,
    value: i + 0.5,
  };
}

test("mergeDomainIntoDb batches large writes through raw SQL", async () => {
  const notes = Array.from({ length: 81 }, (_, i) => makeNote(i));
  const accountDaily = Array.from({ length: 81 }, (_, i) => makeDaily(i));

  const executeRawCalls: unknown[] = [];
  let queryRawCalls = 0;

  const prisma = {
    $queryRaw: async () => {
      queryRawCalls += 1;
      if (queryRawCalls === 1) {
        return [{ title: notes[0].title, published_date: notes[0].publishedDate }];
      }
      return [{ date: accountDaily[0].date, metric_key: accountDaily[0].metricKey }];
    },
    $transaction: async (fn: (tx: { $executeRaw: (...args: unknown[]) => Promise<number> }) => Promise<void>) =>
      fn({
        $executeRaw: async (...args: unknown[]) => {
          executeRawCalls.push(args);
          return 1;
        },
      }),
    note: {
      count: async () => 100,
    },
    accountDaily: {
      count: async () => 200,
    },
  };

  const result = await mergeDomainIntoDb(prisma as never, {
    notes,
    accountDaily,
    warnings: [],
  });

  assert.equal(result.inserted, 160);
  assert.equal(result.updated, 2);
  assert.equal(result.untouched, 138);
  assert.ok(executeRawCalls.length > 0);
  assert.ok(executeRawCalls.length <= 4);
});
