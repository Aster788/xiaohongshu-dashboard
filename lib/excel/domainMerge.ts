import type { DomainWorkbookResult, ParsedAccountDailyRow, ParsedNoteRow } from "./domainTypes";

export function dedupeNotes(rows: ParsedNoteRow[]): ParsedNoteRow[] {
  const m = new Map<string, ParsedNoteRow>();
  for (const r of rows) {
    const k = `${r.title}\0${r.publishedDate.toISOString().slice(0, 10)}`;
    m.set(k, r);
  }
  return [...m.values()];
}

export function dedupeDaily(rows: ParsedAccountDailyRow[]): ParsedAccountDailyRow[] {
  const m = new Map<string, ParsedAccountDailyRow>();
  for (const r of rows) {
    const k = `${r.date.toISOString().slice(0, 10)}\0${r.metricKey}`;
    m.set(k, r);
  }
  return [...m.values()];
}

/** Merge several per-file ingest results (multi-select upload). Last row wins on duplicate keys. */
export function combineDomainIngests(parts: DomainWorkbookResult[]): DomainWorkbookResult {
  const notes: ParsedNoteRow[] = [];
  const accountDaily: ParsedAccountDailyRow[] = [];
  const warnings: string[] = [];

  for (const p of parts) {
    notes.push(...p.notes);
    accountDaily.push(...p.accountDaily);
    warnings.push(...p.warnings);
  }

  return {
    notes: dedupeNotes(notes),
    accountDaily: dedupeDaily(accountDaily),
    warnings,
  };
}
