import { convertFileSrc } from "@tauri-apps/api/core";
import MarkdownIt from "markdown-it";
import type { Annotation } from "./types";

export interface SearchHighlight {
  startOffset: number;
  endOffset: number;
  matchedText: string;
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

const defaultImageRule = md.renderer.rules.image;

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const srcIndex = token.attrIndex("src");
  if (srcIndex >= 0 && token.attrs) {
    const src = token.attrs[srcIndex][1];
    token.attrs[srcIndex][1] = resolveImageSrc(src, env.chapterFilePath);
  }
  return defaultImageRule
    ? defaultImageRule(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
};

export function renderMarkdownWithAnnotations(
  content: string,
  annotations: Annotation[],
  chapterFilePath: string,
  searchHighlight?: SearchHighlight | null,
) {
  const marked = applyAnnotationMarks(content, annotations, searchHighlight);
  return md.render(marked, { chapterFilePath });
}

export function findSelectionOffset(content: string, selectedText: string) {
  const trimmed = selectedText.trim();
  if (!trimmed) return -1;

  const exact = content.indexOf(trimmed);
  if (exact >= 0) return exact;

  const compact = trimmed.replace(/\s+/g, " ");
  const contentCompact = content.replace(/\s+/g, " ");
  const compactIndex = contentCompact.indexOf(compact);
  if (compactIndex < 0) return -1;

  let compactCursor = 0;
  for (let index = 0; index < content.length; index += 1) {
    if (/\s/.test(content[index])) {
      if (compactCursor > 0 && contentCompact[compactCursor] === " ") {
        compactCursor += 1;
      }
      continue;
    }
    if (compactCursor >= compactIndex) return index;
    compactCursor += 1;
  }

  return -1;
}

export function getContext(content: string, start: number, end: number, chars: number) {
  return {
    before: content.slice(Math.max(0, start - chars), start),
    after: content.slice(end, Math.min(content.length, end + chars)),
  };
}

export function getHeadingPath(content: string, offset: number) {
  const headings: Array<{ level: number; title: string; offset: number }> = [];
  let cursor = 0;
  for (const line of content.split("\n")) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line.trimStart());
    if (match) {
      headings.push({
        level: match[1].length,
        title: match[2].trim(),
        offset: cursor,
      });
    }
    cursor += line.length + 1;
  }

  const stack: Array<{ level: number; title: string }> = [];
  for (const heading of headings) {
    if (heading.offset > offset) break;
    while (stack.length && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }
    stack.push(heading);
  }

  return stack.map((heading) => heading.title).join(" > ");
}

function applyAnnotationMarks(
  content: string,
  annotations: Annotation[],
  searchHighlight?: SearchHighlight | null,
) {
  const ranges = annotations
    .filter((annotation) => {
      const start = annotation.startOffset;
      const end = annotation.endOffset;
      return (
        start >= 0 &&
        end > start &&
        end <= content.length &&
        content.slice(start, end) === annotation.selectedText
      );
    })
    .map((annotation) => ({
      startOffset: annotation.startOffset,
      endOffset: annotation.endOffset,
      open: `<mark class="annotation-mark" style="--mark-color: ${escapeAttribute(annotation.highlightColor || "#f5d76e")};" data-annotation-id="${escapeAttribute(annotation.id)}">`,
      close: "</mark>",
    }));

  if (
    searchHighlight &&
    searchHighlight.startOffset >= 0 &&
    searchHighlight.endOffset > searchHighlight.startOffset &&
    searchHighlight.endOffset <= content.length &&
    content.slice(searchHighlight.startOffset, searchHighlight.endOffset) ===
      searchHighlight.matchedText &&
    !ranges.some(
      (range) =>
        searchHighlight.startOffset < range.endOffset &&
        searchHighlight.endOffset > range.startOffset,
    )
  ) {
    ranges.push({
      startOffset: searchHighlight.startOffset,
      endOffset: searchHighlight.endOffset,
      open: '<mark class="search-hit-mark" data-search-hit="true">',
      close: "</mark>",
    });
  }

  ranges.sort((a, b) => {
    if (a.startOffset !== b.startOffset) return b.startOffset - a.startOffset;
    return a.endOffset - b.endOffset;
  });

  let output = content;
  for (const range of ranges) {
    output = `${output.slice(0, range.startOffset)}${range.open}${output.slice(
      range.startOffset,
      range.endOffset,
    )}${range.close}${output.slice(range.endOffset)}`;
  }

  return output;
}

function resolveImageSrc(src: string, chapterFilePath?: string) {
  if (
    !chapterFilePath ||
    /^(https?:|data:|blob:|asset:|file:|#)/i.test(src) ||
    src.startsWith("/")
  ) {
    return src;
  }

  const separatorIndex = Math.max(chapterFilePath.lastIndexOf("\\"), chapterFilePath.lastIndexOf("/"));
  if (separatorIndex < 0) return src;

  const base = chapterFilePath.slice(0, separatorIndex);
  const joined = `${base}${chapterFilePath.includes("\\") ? "\\" : "/"}${src}`;
  try {
    return convertFileSrc(joined);
  } catch {
    return joined;
  }
}

function escapeAttribute(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
