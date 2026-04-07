"use client";

import { useEffect, useRef, useState } from "react";
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
}: {
  years: number[];
  selectedYear: number | null;
  selectedSort: TopNotesSortKey;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const selectedNum =
    selectedYear == null ? null : Number(selectedYear);
  const selectedSortOption =
    SORT_OPTIONS.find((option) => option.value === selectedSort) ?? SORT_OPTIONS[0]!;

  function createHref(year: number | null, sort: TopNotesSortKey) {
    const params = new URLSearchParams();
    if (year != null) {
      params.set("year", String(year));
    }
    if (sort !== "views") {
      params.set("sort", sort);
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function handleSortSelect(nextSort: TopNotesSortKey) {
    setSortOpen(false);
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

  return (
    <div className="top-filter-bar">
      <nav className="year-filter" aria-label="Filter top notes by year">
        <Link
          href={createHref(null, selectedSort)}
          className={pillClass(selectedNum == null)}
          prefetch={false}
          scroll={false}
        >
          All
        </Link>
        {years.map((y) => {
          const yNum = Number(y);
          return (
            <Link
              key={yNum}
              href={createHref(yNum, selectedSort)}
              className={pillClass(
                selectedNum != null &&
                  Number.isInteger(selectedNum) &&
                  selectedNum === yNum,
              )}
              prefetch={false}
              scroll={false}
            >
              {yNum}
            </Link>
          );
        })}
      </nav>

      <div className="sort-filter" ref={dropdownRef}>
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
