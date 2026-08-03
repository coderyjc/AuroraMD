import type { Annotation } from "../types";
import { getMarkdownReadableText, renderMarkdownToReadableText, type ChangeHighlight } from "../markdown";
import { diffMarkdownLines } from "./diff";

export interface ReaderSearchMatch {
  id: string;
  startOffset: number;
  endOffset: number;
  matchedText: string;
  excerpt: string;
}

export function sortReaderAnnotations(annotations: Annotation[]) {
  return [...annotations].sort((left, right) => {
    if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
    if (left.startOffset !== right.startOffset) return left.startOffset - right.startOffset;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function getReadingStats(content: string) {
  const plainText = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/[#>*_~\-|[\]()`]/g, " ");
  const cjkCount = plainText.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const latinWordCount =
    plainText
      .replace(/[\u3400-\u9fff\uf900-\ufaff]/g, " ")
      .match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g)?.length ?? 0;
  const wordCount = cjkCount + latinWordCount;
  return {
    wordCount,
    minutes: wordCount === 0 ? 0 : Math.max(1, Math.ceil(wordCount / 500)),
  };
}

export function buildChangeHighlights(
  root: HTMLElement,
  oldContent: string,
  newContent: string,
  chapterFilePath: string,
) {
  const rootText = getMarkdownReadableText(root);
  if (!rootText || oldContent === newContent) return [];

  const highlights: ChangeHighlight[] = [];
  let searchCursor = 0;
  for (const block of diffMarkdownLines(oldContent, newContent)) {
    if ((block.type !== "added" && block.type !== "modified") || block.newLines.length === 0) {
      continue;
    }

    const changedText = normalizeReadableChangeText(
      renderMarkdownToReadableText(block.newLines.join("\n"), chapterFilePath),
    );
    if (!changedText) continue;

    const startOffset = findReadableChangeOffset(rootText, changedText, searchCursor);
    if (startOffset < 0) continue;

    const endOffset = startOffset + changedText.length;
    highlights.push({
      id: block.id,
      type: block.type,
      startOffset,
      endOffset,
      changedText,
    });
    searchCursor = endOffset;
  }

  return highlights;
}

function normalizeReadableChangeText(value: string) {
  return value.replace(/\u00a0/g, " ").trim();
}

function findReadableChangeOffset(rootText: string, changedText: string, preferredStart: number) {
  const fromCursor = rootText.indexOf(changedText, preferredStart);
  if (fromCursor >= 0) return fromCursor;
  return rootText.indexOf(changedText);
}

export function buildReaderSearchMatches(rootText: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const haystack = rootText.toLowerCase();
  const needle = trimmed.toLowerCase();
  const matches: ReaderSearchMatch[] = [];
  let cursor = 0;

  while (cursor <= haystack.length && matches.length < 200) {
    const index = haystack.indexOf(needle, cursor);
    if (index < 0) break;
    const endOffset = index + needle.length;
    const matchedText = rootText.slice(index, endOffset);
    matches.push({
      id: `reader-search-${matches.length}-${index}`,
      startOffset: index,
      endOffset,
      matchedText,
      excerpt: buildReaderSearchExcerpt(rootText, index, endOffset),
    });
    cursor = Math.max(endOffset, index + 1);
  }

  return matches;
}

function buildReaderSearchExcerpt(rootText: string, startOffset: number, endOffset: number) {
  const before = rootText.slice(Math.max(0, startOffset - 54), startOffset);
  const match = rootText.slice(startOffset, endOffset);
  const after = rootText.slice(endOffset, Math.min(rootText.length, endOffset + 86));
  const prefix = startOffset > 54 ? "..." : "";
  const suffix = endOffset + 86 < rootText.length ? "..." : "";
  return collapseReaderSearchWhitespace(`${prefix}${before}${match}${after}${suffix}`);
}

function collapseReaderSearchWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}


