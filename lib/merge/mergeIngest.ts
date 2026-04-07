import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { DomainWorkbookResult, ParsedAccountDailyRow, ParsedNoteRow } from "@/lib/excel/domainTypes";
import type { MergeIngestResult, TableMergeStats } from "./mergeStats";

/**
 * Bulk lookup of composite keys in few round-trips (vs one small OR-query per 20 rows).
 * Keep chunk modest so planner + parameter count stay predictable.
 */
const EXISTING_KEY_CHUNK = 250;

/** Parallel upserts per batch inside one transaction (faster than strict serial). */
const UPSERT_BATCH = 80;

/** Default interactive tx timeout is 5s; large Excel merges exceed it → P2028. */
const MERGE_TX_MAX_WAIT_MS = 60_000;
const MERGE_TX_TIMEOUT_MS = 300_000;

function noteKey(n: Pick<ParsedNoteRow, "title" | "publishedDate">): string {
  return `${n.title}\0${n.publishedDate.toISOString().slice(0, 10)}`;
}

function dailyKey(d: ParsedAccountDailyRow): string {
  return `${d.date.toISOString().slice(0, 10)}\0${d.metricKey}`;
}

async function existingNoteKeys(
  prisma: PrismaClient,
  rows: ParsedNoteRow[],
): Promise<Set<string>> {
  const uniqueByKey = new Map<string, ParsedNoteRow>();
  for (const n of rows) {
    const k = noteKey(n);
    if (!uniqueByKey.has(k)) uniqueByKey.set(k, n);
  }
  const uniqueRows = [...uniqueByKey.values()];
  const keys = new Set<string>();
  if (uniqueRows.length === 0) return keys;

  for (let i = 0; i < uniqueRows.length; i += EXISTING_KEY_CHUNK) {
    const slice = uniqueRows.slice(i, i + EXISTING_KEY_CHUNK);
    const valueRows = slice.map(
      (n) => Prisma.sql`(${n.title}::text, ${n.publishedDate}::date)`,
    );
    const found = await prisma.$queryRaw<{ title: string; published_date: Date }[]>(
      Prisma.sql`
        SELECT n.title, n.published_date
        FROM notes AS n
        INNER JOIN (VALUES ${Prisma.join(valueRows, ", ")})
          AS v(title, published_date)
          ON n.title = v.title AND n.published_date = v.published_date
      `,
    );
    for (const r of found) {
      keys.add(noteKey({ title: r.title, publishedDate: r.published_date }));
    }
  }
  return keys;
}

async function existingDailyKeys(
  prisma: PrismaClient,
  rows: ParsedAccountDailyRow[],
): Promise<Set<string>> {
  const uniqueByKey = new Map<string, ParsedAccountDailyRow>();
  for (const r of rows) {
    const k = dailyKey(r);
    if (!uniqueByKey.has(k)) uniqueByKey.set(k, r);
  }
  const uniqueRows = [...uniqueByKey.values()];
  const keys = new Set<string>();
  if (uniqueRows.length === 0) return keys;

  for (let i = 0; i < uniqueRows.length; i += EXISTING_KEY_CHUNK) {
    const slice = uniqueRows.slice(i, i + EXISTING_KEY_CHUNK);
    const valueRows = slice.map(
      (r) => Prisma.sql`(${r.date}::date, ${r.metricKey}::text)`,
    );
    const found = await prisma.$queryRaw<{ date: Date; metric_key: string }[]>(
      Prisma.sql`
        SELECT d.date, d.metric_key
        FROM account_daily AS d
        INNER JOIN (VALUES ${Prisma.join(valueRows, ", ")})
          AS v(date, metric_key)
          ON d.date = v.date AND d.metric_key = v.metric_key
      `,
    );
    for (const r of found) {
      keys.add(dailyKey({ date: r.date, metricKey: r.metric_key, value: 0 }));
    }
  }
  return keys;
}

function tableStats(
  existingKeys: Set<string>,
  incomingKeys: string[],
): Pick<TableMergeStats, "inserted" | "updated"> {
  let inserted = 0;
  let updated = 0;
  const seen = new Set<string>();
  for (const k of incomingKeys) {
    if (seen.has(k)) continue;
    seen.add(k);
    if (existingKeys.has(k)) updated += 1;
    else inserted += 1;
  }
  return { inserted, updated };
}

/**
 * Upsert PRD merge: same key overwrites row; keys absent from upload stay in DB.
 * `untouched` = rows still in DB whose key was not present in this payload (per table).
 */
export async function mergeDomainIntoDb(
  prisma: PrismaClient,
  domain: DomainWorkbookResult,
): Promise<MergeIngestResult> {
  const notes = domain.notes;
  const daily = domain.accountDaily;

  const noteKeysList = notes.map(noteKey);
  const dailyKeysList = daily.map(dailyKey);

  const [preNoteExisting, preDailyExisting] = await Promise.all([
    existingNoteKeys(prisma, notes),
    existingDailyKeys(prisma, daily),
  ]);

  const noteIU = tableStats(preNoteExisting, noteKeysList);
  const dailyIU = tableStats(preDailyExisting, dailyKeysList);

  await prisma.$transaction(
    async (tx) => {
      for (let i = 0; i < notes.length; i += UPSERT_BATCH) {
        const slice = notes.slice(i, i + UPSERT_BATCH);
        await Promise.all(
          slice.map((n) =>
            tx.note.upsert({
              where: {
                title_publishedDate: {
                  title: n.title,
                  publishedDate: n.publishedDate,
                },
              },
              create: {
                title: n.title,
                publishedDate: n.publishedDate,
                format: n.format,
                impressions: n.impressions,
                views: n.views,
                likes: n.likes,
                comments: n.comments,
                saves: n.saves,
                shares: n.shares,
                followerGain: n.followerGain,
              },
              update: {
                format: n.format,
                impressions: n.impressions,
                views: n.views,
                likes: n.likes,
                comments: n.comments,
                saves: n.saves,
                shares: n.shares,
                followerGain: n.followerGain,
              },
            }),
          ),
        );
      }

      for (let i = 0; i < daily.length; i += UPSERT_BATCH) {
        const slice = daily.slice(i, i + UPSERT_BATCH);
        await Promise.all(
          slice.map((r) => {
            const dec = new Prisma.Decimal(String(r.value));
            return tx.accountDaily.upsert({
              where: {
                date_metricKey: {
                  date: r.date,
                  metricKey: r.metricKey,
                },
              },
              create: {
                date: r.date,
                metricKey: r.metricKey,
                value: dec,
              },
              update: { value: dec },
            });
          }),
        );
      }
    },
    {
      maxWait: MERGE_TX_MAX_WAIT_MS,
      timeout: MERGE_TX_TIMEOUT_MS,
    },
  );

  const [totalNotes, totalDaily] = await Promise.all([
    prisma.note.count(),
    prisma.accountDaily.count(),
  ]);

  const uniqueNoteCount = new Set(noteKeysList).size;
  const uniqueDailyCount = new Set(dailyKeysList).size;

  const notesUntouched = Math.max(0, totalNotes - uniqueNoteCount);
  const dailyUntouched = Math.max(0, totalDaily - uniqueDailyCount);

  const nInserted = noteIU.inserted;
  const nUpdated = noteIU.updated;
  const dInserted = dailyIU.inserted;
  const dUpdated = dailyIU.updated;

  return {
    inserted: nInserted + dInserted,
    updated: nUpdated + dUpdated,
    untouched: notesUntouched + dailyUntouched,
    notes: {
      inserted: nInserted,
      updated: nUpdated,
      untouched: notesUntouched,
    },
    accountDaily: {
      inserted: dInserted,
      updated: dUpdated,
      untouched: dailyUntouched,
    },
  };
}
