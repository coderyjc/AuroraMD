import { Check, FileText } from "lucide-react";
import { type CSSProperties } from "react";
import type { ReadingProgress } from "../types";
import { clamp } from "./math";

const readingProgressCompleteThreshold = 0.995;
const readingProgressCompleteRemainingPx = 2;

export function buildChapterProgressMap(progressItems: ReadingProgress[]) {
  return progressItems.reduce<Record<string, ReadingProgress>>((map, item) => {
    if (!map[item.chapterId]) {
      map[item.chapterId] = item;
    }
    return map;
  }, {});
}

export function getScrollProgressRatio(element: HTMLElement) {
  const maxScroll = element.scrollHeight - element.clientHeight;
  if (maxScroll <= 1) return 1;
  const remainingScroll = maxScroll - element.scrollTop;
  const ratio = clamp(element.scrollTop / maxScroll, 0, 1);
  return remainingScroll <= readingProgressCompleteRemainingPx ||
    ratio >= readingProgressCompleteThreshold
    ? 1
    : ratio;
}

export function isChapterProgressComplete(progress?: ReadingProgress) {
  return Boolean(
    progress && clamp(progress.progressRatio, 0, 1) >= readingProgressCompleteThreshold,
  );
}

export function ChapterProgressIcon({ progress }: { progress?: ReadingProgress }) {
  if (!progress) return <FileText className="chapter-file-icon" size={15} aria-hidden="true" />;
  const ratio = clamp(progress.progressRatio, 0, 1);
  if (isChapterProgressComplete(progress)) {
    return <Check className="chapter-progress-complete" size={15} aria-label="Completed" />;
  }
  const displayRatio = ratio > 0 ? ratio : progress.scrollTop > 0 ? 0.02 : 0;
  const percent = Math.round(displayRatio * 100);
  return (
    <svg
      className="chapter-progress-ring"
      viewBox="0 0 18 18"
      aria-label={`阅读进度 ${percent}%`}
      style={
        {
          "--chapter-progress-offset": `${(43.98 * (1 - displayRatio)).toFixed(2)}`,
        } as CSSProperties
      }
    >
      <circle className="chapter-progress-track" cx="9" cy="9" r="7" />
      <circle className="chapter-progress-value" cx="9" cy="9" r="7" />
    </svg>
  );
}
