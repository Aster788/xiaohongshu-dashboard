"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { TopNotesSortKey } from "@/lib/dashboard/types";

function pillClass(active: boolean) {
  return active ? "year-pill active" : "year-pill";
}

const SORT_OPTIONS: Array<{ value: TopNotesSortKey; label: string }> = [
  { value: "views", label: "Views" },
  { value: "impressions", label: "Impressions" },
  { value: "likes-saves", label: "Likes & saves" },
  { value: "shares", label: "Shares" },
  { value: "new-followers", label: "New followers" },
];

export function DashboardYearFilter({
  years,
  selectedYear,
  selectedSort,
  onYearChange,
  onSortChange,
  sortTieBreakHint,
}: {
  years: number[];
  selectedYear: number | null;
  selectedSort: TopNotesSortKey;
  onYearChange?: (year: number | null) => void;
  onSortChange?: (sort: TopNotesSortKey) => void;
  /** Shown in a hover tooltip next to “Sorted by” (e.g. tie-break rules). */
  sortTieBreakHint?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const prefetchedHrefsRef = useRef<Set<string>>(new Set());
  const [sortOpen, setSortOpen] = useState(false);
  const selectedNum =
    selectedYear == null ? null : Number(selectedYear);
  const selectedSortOption =
    SORT_OPTIONS.find((option) => option.value === selectedSort) ?? SORT_OPTIONS[0]!;

  const createHref = useCallback((year: number | null, sort: TopNotesSortKey) => {
    const params = new URLSearchParams();
    if (year != null) {
      params.set("year", String(year));
    }
    if (sort !== "views") {
      params.set("sort", sort);
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname]);

  const prefetchHref = useCallback((href: string) => {
    if (prefetchedHrefsRef.current.has(href)) return;
    prefetchedHrefsRef.current.add(href);
    router.prefetch(href);
  }, [router]);

  function handleSortSelect(nextSort: TopNotesSortKey) {
    setSortOpen(false);
    if (onSortChange) {
      onSortChange(nextSort);
      return;
    }
    router.push(createHref(selectedNum, nextSort), { scroll: false });
  }

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setSortOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSortOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (onYearChange || onSortChange) return;
    prefetchHref(createHref(null, selectedSort));
    for (const year of years) {
      prefetchHref(createHref(Number(year), selectedSort));
    }
    for (const option of SORT_OPTIONS) {
      prefetchHref(createHref(selectedNum, option.value));
    }
  }, [onYearChange, onSortChange, selectedNum, selectedSort, years, createHref, prefetchHref]);

  return (
    <div className="top-filter-bar">
      <nav className="year-filter" aria-label="Filter top notes by year">
        {onYearChange ? (
          <button
            type="button"
            className={pillClass(selectedNum == null)}
            onClick={() => onYearChange(null)}
          >
            All
          </button>
        ) : (
          <Link
            href={createHref(null, selectedSort)}
            className={pillClass(selectedNum == null)}
            scroll={false}
            onMouseEnter={() => prefetchHref(createHref(null, selectedSort))}
          >
            All
          </Link>
        )}
        {years.map((y) => {
          const yNum = Number(y);
          const active =
            selectedNum != null &&
            Number.isInteger(selectedNum) &&
            selectedNum === yNum;
          if (onYearChange) {
            return (
              <button
                key={yNum}
                type="button"
                className={pillClass(active)}
                onClick={() => onYearChange(yNum)}
              >
                {yNum}
              </button>
            );
          }
          return (
            <Link
              key={yNum}
              href={createHref(yNum, selectedSort)}
              className={pillClass(active)}
              scroll={false}
              onMouseEnter={() => prefetchHref(createHref(yNum, selectedSort))}
            >
              {yNum}
            </Link>
          );
        })}
      </nav>

      <div className="sort-filter" ref={dropdownRef}>
        {sortTieBreakHint ? (
          <div className="sort-tiebreak-wrap">
            <button type="button" className="sort-tiebreak-trigger">
              <span className="sr-only">{sortTieBreakHint}</span>
              <span className="sort-tiebreak-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
                  <rect x="10.75" y="3" width="2.5" height="13" rx="1.25" fill="currentColor" />
                  <circle cx="12" cy="20" r="2.35" fill="currentColor" />
                </svg>
              </span>
            </button>
            <div className="sort-tiebreak-tooltip" aria-hidden="true">
              {sortTieBreakHint}
            </div>
          </div>
        ) : null}
        <span className="sort-filter-label">Sorted by</span>
        <button
          type="button"
          className={sortOpen ? "sort-filter-trigger open" : "sort-filter-trigger"}
          aria-haspopup="listbox"
          aria-expanded={sortOpen}
          aria-label="Sort top posts by metric"
          onClick={() => setSortOpen((open) => !open)}
        >
          <span className="sort-filter-trigger-text">
            {selectedSortOption.label}
          </span>
          <span className="sort-filter-trigger-icon" aria-hidden="true">
            <svg viewBox="0 0 18 18">
              <path
                d="M4.5 7 9 11.5 13.5 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>

        {sortOpen ? (
          <div className="sort-filter-menu" role="listbox" aria-label="Sort top posts by metric">
            {SORT_OPTIONS.map((option) => {
              const active = option.value === selectedSort;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={active ? "sort-filter-option active" : "sort-filter-option"}
                  onMouseEnter={() => {
                    if (!onSortChange) prefetchHref(createHref(selectedNum, option.value));
                  }}
                  onClick={() => handleSortSelect(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
