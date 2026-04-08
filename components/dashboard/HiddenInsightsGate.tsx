"use client";

import { useRef, useState, type ReactNode } from "react";

const TAP_WINDOW_MS = 3000;
const UNLOCK_TAPS = 3;

export function HiddenInsightsGate({
  topPostsSection,
  insightsSection,
}: {
  topPostsSection: ReactNode;
  insightsSection: ReactNode;
}) {
  const [isInsightsVisible, setIsInsightsVisible] = useState(false);
  const tapCountRef = useRef(0);
  const firstTapAtRef = useRef<number | null>(null);

  const handleUnlockTap = () => {
    if (isInsightsVisible) return;

    const now = Date.now();
    const firstTapAt = firstTapAtRef.current;

    if (firstTapAt == null || now - firstTapAt > TAP_WINDOW_MS) {
      firstTapAtRef.current = now;
      tapCountRef.current = 1;
      return;
    }

    tapCountRef.current += 1;
    if (tapCountRef.current >= UNLOCK_TAPS) {
      setIsInsightsVisible(true);
      tapCountRef.current = 0;
      firstTapAtRef.current = null;
    }
  };

  return (
    <>
      <div className="insights-unlock-target">
        {topPostsSection}
        <button
          type="button"
          className="insights-unlock-hotspot"
          aria-label="Unlock content attractiveness insights"
          onClick={handleUnlockTap}
        />
      </div>
      {isInsightsVisible ? insightsSection : null}
    </>
  );
}
