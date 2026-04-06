import Link from "next/link";

function pillClass(active: boolean) {
  return active ? "year-pill active" : "year-pill";
}

export function DashboardYearFilter({
  years,
  selectedYear,
}: {
  years: number[];
  selectedYear: number | null;
}) {
  const selectedNum =
    selectedYear == null ? null : Number(selectedYear);

  return (
    <nav className="year-filter" aria-label="Filter top notes by year">
      <Link
        href="/"
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
            href={`/?year=${yNum}`}
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
  );
}
