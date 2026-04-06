export type ParsedNoteRow = {
  title: string;
  publishedDate: Date;
  format: string | null;
  impressions: bigint | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  followerGain: number | null;
};

export type ParsedAccountDailyRow = {
  date: Date;
  metricKey: string;
  value: number;
};

export type DomainWorkbookResult = {
  notes: ParsedNoteRow[];
  accountDaily: ParsedAccountDailyRow[];
  /** Non-fatal observability (English, safe for logs). */
  warnings: string[];
};
