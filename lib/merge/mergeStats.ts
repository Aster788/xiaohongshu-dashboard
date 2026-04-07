export type TableMergeStats = {
  inserted: number;
  updated: number;
  untouched: number;
};

export type MergeIngestResult = {
  inserted: number;
  updated: number;
  untouched: number;
  notes: TableMergeStats;
  accountDaily: TableMergeStats;
};
