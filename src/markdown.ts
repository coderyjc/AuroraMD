import { convertFileSrc } from "@tauri-apps/api/core";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdownLanguage from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import MarkdownIt from "markdown-it";
import type { Annotation } from "./types";

export interface SearchHighlight {
  id?: string;
  startOffset: number;
  endOffset: number;
  matchedText: string;
  active?: boolean;
}

export interface RenderedSelectionAnchor {
  selectedText: string;
  startOffset: number;
  endOffset: number;
  fullText: string;
}

interface DomHighlightRange {
  id?: string;
  startOffset: number;
  endOffset: number;
  className: string;
  color?: string;
  search?: boolean;
  active?: boolean;
}

interface TextNodeSpan {
  node: Text;
  startOffset: number;
  endOffset: number;
}

interface TextNodeSegment {
  startOffset: number;
  endOffset: number;
  range: DomHighlightRange;
}

registerHighlightLanguages();

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(code, language) {
    return highlightCode(code, language);
  },
});

function registerHighlightLanguages() {
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("c", c);
  hljs.registerLanguage("cpp", cpp);
  hljs.registerLanguage("csharp", csharp);
  hljs.registerLanguage("css", css);
  hljs.registerLanguage("diff", diff);
  hljs.registerLanguage("go", go);
  hljs.registerLanguage("ini", ini);
  hljs.registerLanguage("java", java);
  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("markdown", markdownLanguage);
  hljs.registerLanguage("php", php);
  hljs.registerLanguage("python", python);
  hljs.registerLanguage("ruby", ruby);
  hljs.registerLanguage("rust", rust);
  hljs.registerLanguage("sql", sql);
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("yaml", yaml);
}

const defaultImageRule = md.renderer.rules.image;
const defaultFenceRule = md.renderer.rules.fence;

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const srcIndex = token.attrIndex("src");
  if (srcIndex >= 0 && token.attrs) {
    const src = token.attrs[srcIndex][1];
    token.attrs[srcIndex][1] = resolveImageSrc(src, env.chapterFilePath);
  }
  token.attrSet("data-reader-image", "true");
  token.attrSet("draggable", "false");
  if (token.attrIndex("loading") < 0) token.attrSet("loading", "lazy");
  return defaultImageRule
    ? defaultImageRule(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
};

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const language = token.info.trim().split(/\s+/)[0]?.toLowerCase();
  if (language === "mermaid") {
    return renderMermaidPlaceholder(token.content);
  }
  return defaultFenceRule
    ? defaultFenceRule(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
};

export function renderMarkdownWithAnnotations(
  content: string,
  chapterFilePath: string,
) {
  return md.render(content, { chapterFilePath });
}

export function getMarkdownReadableText(root: HTMLElement) {
  return collectTextNodes(root).map((span) => span.node.data).join("");
}

export function getRenderedSelectionAnchor(root: HTMLElement, selection: Selection) {
  if (selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const fullText = getMarkdownReadableText(root);
  const rawStart = getBoundaryTextOffset(root, range.startContainer, range.startOffset);
  const rawEnd = getBoundaryTextOffset(root, range.endContainer, range.endOffset);
  const start = Math.min(rawStart, rawEnd);
  const end = Math.max(rawStart, rawEnd);
  const selectedFromTextContent = fullText.slice(start, end);
  const leadingWhitespace = selectedFromTextContent.match(/^\s*/)?.[0].length ?? 0;
  const trailingWhitespace = selectedFromTextContent.match(/\s*$/)?.[0].length ?? 0;
  const trimmedStart = start + leadingWhitespace;
  const trimmedEnd = Math.max(trimmedStart, end - trailingWhitespace);
  const selectedText = selection.toString().trim() || fullText.slice(trimmedStart, trimmedEnd);

  if (!selectedText || trimmedEnd <= trimmedStart) return null;
  return {
    selectedText,
    startOffset: trimmedStart,
    endOffset: trimmedEnd,
    fullText,
  } satisfies RenderedSelectionAnchor;
}

export function getContextFromText(content: string, start: number, end: number, chars: number) {
  return {
    before: content.slice(Math.max(0, start - chars), start),
    after: content.slice(end, Math.min(content.length, end + chars)),
  };
}

export function applyDomHighlights(
  root: HTMLElement,
  annotations: Annotation[],
  searchHighlights?: SearchHighlight | SearchHighlight[] | null,
) {
  clearDomHighlights(root);
  const rootText = getMarkdownReadableText(root);
  const annotationRanges = annotations
    .map((annotation) => resolveAnnotationRange(rootText, annotation))
    .filter((range): range is DomHighlightRange => Boolean(range));
  const normalizedAnnotationRanges = normalizeNonOverlappingRanges(annotationRanges, rootText.length);
  const ranges = [...normalizedAnnotationRanges];
  const searchRanges = (Array.isArray(searchHighlights)
    ? searchHighlights
    : searchHighlights
      ? [searchHighlights]
      : [])
    .map((highlight) => resolveSearchRange(rootText, highlight))
    .filter((range): range is DomHighlightRange => Boolean(range))
    .filter(
      (searchRange) =>
        !normalizedAnnotationRanges.some(
          (range) =>
            searchRange.startOffset < range.endOffset &&
            searchRange.endOffset > range.startOffset,
        ),
    );
  if (searchRanges.length > 0) {
    ranges.push(...normalizeNonOverlappingRanges(searchRanges, rootText.length));
  }

  wrapDomRanges(root, ranges);
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

export function locateAnnotationInText(rootText: string, annotation: Annotation) {
  if (
    annotation.startOffset >= 0 &&
    annotation.endOffset > annotation.startOffset &&
    annotation.endOffset <= rootText.length &&
    rootText.slice(annotation.startOffset, annotation.endOffset) === annotation.selectedText
  ) {
    return {
      startOffset: annotation.startOffset,
      endOffset: annotation.endOffset,
      method: "source-offset" as const,
    };
  }

  const anchoredStart = findAnchoredTextOffset(
    rootText,
    annotation.selectedText,
    annotation.contextBefore,
    annotation.contextAfter,
  );
  if (anchoredStart >= 0) {
    return {
      startOffset: anchoredStart,
      endOffset: anchoredStart + annotation.selectedText.length,
      method: "anchored-text" as const,
    };
  }

  return null;
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

function resolveImageSrc(src: string, chapterFilePath?: string) {
  const trimmedSrc = src.trim();
  if (
    !chapterFilePath ||
    !trimmedSrc ||
    /^(https?:|data:|blob:|asset:|file:|#)/i.test(trimmedSrc)
  ) {
    return src;
  }

  const separator = chapterFilePath.includes("\\") ? "\\" : "/";
  const separatorIndex = Math.max(chapterFilePath.lastIndexOf("\\"), chapterFilePath.lastIndexOf("/"));
  const chapterDir = separatorIndex >= 0 ? chapterFilePath.slice(0, separatorIndex) : "";
  const { path, suffix } = splitImageSrcSuffix(trimmedSrc);
  const localPath = resolveLocalImagePath(path, chapterDir, separator);
  if (!localPath) return src;

  try {
    return `${convertFileSrc(localPath)}${suffix}`;
  } catch {
    return `${localPath}${suffix}`;
  }
}

function highlightCode(code: string, language: string) {
  const normalizedLanguage = normalizeCodeLanguage(language);
  if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
    try {
      return hljs.highlight(code, {
        language: normalizedLanguage,
        ignoreIllegals: true,
      }).value;
    } catch {
      return escapeHtml(code);
    }
  }
  return escapeHtml(code);
}

function normalizeCodeLanguage(language: string) {
  const rawLanguage = language.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const aliases: Record<string, string> = {
    "c++": "cpp",
    "c#": "csharp",
    cjs: "javascript",
    js: "javascript",
    jsx: "javascript",
    htm: "xml",
    html: "xml",
    md: "markdown",
    mjs: "javascript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    shell: "bash",
    sh: "bash",
    ts: "typescript",
    tsx: "typescript",
    yml: "yaml",
  };
  return aliases[rawLanguage] ?? rawLanguage;
}

function splitImageSrcSuffix(src: string) {
  const queryIndex = src.indexOf("?");
  const hashIndex = src.indexOf("#");
  const suffixIndex = [queryIndex, hashIndex]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (suffixIndex === undefined) {
    return { path: src, suffix: "" };
  }
  return {
    path: src.slice(0, suffixIndex),
    suffix: src.slice(suffixIndex),
  };
}

function resolveLocalImagePath(rawPath: string, chapterDir: string, separator: string) {
  const decodedPath = decodeImagePath(rawPath);
  const localPath = isAbsoluteLocalPath(decodedPath)
    ? decodedPath
    : chapterDir
      ? `${chapterDir}${separator}${decodedPath}`
      : decodedPath;
  return normalizeLocalFilePath(localPath, separator);
}

function decodeImagePath(path: string) {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

function isAbsoluteLocalPath(path: string) {
  return /^[a-z]:[\\/]/i.test(path) || path.startsWith("\\\\") || path.startsWith("/");
}

function normalizeLocalFilePath(path: string, preferredSeparator: string) {
  const separator = path.includes("\\") || preferredSeparator === "\\" ? "\\" : "/";
  let prefix = "";
  let rest = path;

  const driveMatch = /^([a-z]:)[\\/]/i.exec(path);
  if (driveMatch) {
    prefix = `${driveMatch[1]}${separator}`;
    rest = path.slice(driveMatch[0].length);
  } else if (path.startsWith("\\\\")) {
    prefix = "\\\\";
    rest = path.slice(2);
  } else if (path.startsWith("/")) {
    prefix = "/";
    rest = path.slice(1);
  }

  const segments: string[] = [];
  for (const segment of rest.split(/[\\/]+/)) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length > 0 && segments[segments.length - 1] !== "..") {
        segments.pop();
      } else if (!prefix) {
        segments.push(segment);
      }
      continue;
    }
    segments.push(segment);
  }

  return `${prefix}${segments.join(separator)}`;
}

function renderMermaidPlaceholder(source: string) {
  const encodedSource = escapeHtmlAttribute(encodeURIComponent(source));
  const escapedSource = escapeHtml(source);
  return [
    `<figure class="mermaid-figure">`,
    `<div class="mermaid-diagram" role="img" aria-label="Mermaid 图表" data-mermaid-source="${encodedSource}">`,
    escapedSource,
    `</div>`,
    `</figure>`,
  ].join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function getBoundaryTextOffset(root: HTMLElement, container: Node, offset: number) {
  const textNodes = collectTextNodes(root);
  let textOffset = 0;

  for (const textNode of textNodes) {
    if (textNode.node === container) {
      return textOffset + Math.min(Math.max(offset, 0), textNode.node.data.length);
    }
    if (!isTextNodeBeforeBoundary(textNode.node, container, offset)) {
      break;
    }
    textOffset += textNode.node.data.length;
  }

  return textOffset;
}

function clearDomHighlights(root: HTMLElement) {
  const marks = Array.from(
    root.querySelectorAll<HTMLElement>("mark.annotation-mark, mark.search-hit-mark"),
  );
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  }
}

function resolveAnnotationRange(rootText: string, annotation: Annotation): DomHighlightRange | null {
  const renderedStart = annotation.renderedStartOffset;
  const renderedEnd = annotation.renderedEndOffset;
  if (
    typeof renderedStart === "number" &&
    typeof renderedEnd === "number" &&
    renderedStart >= 0 &&
    renderedEnd > renderedStart &&
    renderedEnd <= rootText.length
  ) {
    return {
      id: annotation.id,
      startOffset: renderedStart,
      endOffset: renderedEnd,
      className: "annotation-mark",
      color: annotation.highlightColor || "#f5d76e",
    };
  }

  const anchoredStart = findAnchoredTextOffset(
    rootText,
    annotation.selectedText,
    annotation.contextBefore,
    annotation.contextAfter,
  );
  if (anchoredStart >= 0) {
    return {
      id: annotation.id,
      startOffset: anchoredStart,
      endOffset: anchoredStart + annotation.selectedText.length,
      className: "annotation-mark",
      color: annotation.highlightColor || "#f5d76e",
    };
  }

  if (
    annotation.startOffset >= 0 &&
    annotation.endOffset > annotation.startOffset &&
    annotation.endOffset <= rootText.length &&
    rootText.slice(annotation.startOffset, annotation.endOffset) === annotation.selectedText
  ) {
    return {
      id: annotation.id,
      startOffset: annotation.startOffset,
      endOffset: annotation.endOffset,
      className: "annotation-mark",
      color: annotation.highlightColor || "#f5d76e",
    };
  }

  return null;
}

function resolveSearchRange(
  rootText: string,
  searchHighlight?: SearchHighlight | null,
): DomHighlightRange | null {
  if (!searchHighlight) return null;
  if (
    searchHighlight.startOffset >= 0 &&
    searchHighlight.endOffset > searchHighlight.startOffset &&
    searchHighlight.endOffset <= rootText.length &&
    rootText.slice(searchHighlight.startOffset, searchHighlight.endOffset) ===
      searchHighlight.matchedText
  ) {
    return {
      id: searchHighlight.id,
      startOffset: searchHighlight.startOffset,
      endOffset: searchHighlight.endOffset,
      className: searchHighlight.active ? "search-hit-mark is-active" : "search-hit-mark",
      search: true,
      active: searchHighlight.active,
    };
  }

  const start = rootText.indexOf(searchHighlight.matchedText);
  if (start < 0) return null;
  return {
    id: searchHighlight.id,
    startOffset: start,
    endOffset: start + searchHighlight.matchedText.length,
    className: searchHighlight.active ? "search-hit-mark is-active" : "search-hit-mark",
    search: true,
    active: searchHighlight.active,
  };
}

function findAnchoredTextOffset(
  rootText: string,
  selectedText: string,
  contextBefore: string,
  contextAfter: string,
) {
  if (!selectedText) return -1;
  const candidates: number[] = [];
  let cursor = 0;
  while (cursor <= rootText.length) {
    const index = rootText.indexOf(selectedText, cursor);
    if (index < 0) break;
    candidates.push(index);
    cursor = index + Math.max(1, selectedText.length);
  }
  if (candidates.length === 0) return -1;
  if (candidates.length === 1) return candidates[0];

  const beforeHint = contextBefore.slice(-40);
  const afterHint = contextAfter.slice(0, 40);
  let best = candidates[0];
  let bestScore = -1;
  for (const candidate of candidates) {
    const before = rootText.slice(Math.max(0, candidate - beforeHint.length), candidate);
    const after = rootText.slice(
      candidate + selectedText.length,
      candidate + selectedText.length + afterHint.length,
    );
    const score = commonSuffixLength(before, beforeHint) + commonPrefixLength(after, afterHint);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function commonPrefixLength(left: string, right: string) {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while (index < length && left[index] === right[index]) index += 1;
  return index;
}

function commonSuffixLength(left: string, right: string) {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while (index < length && left[left.length - 1 - index] === right[right.length - 1 - index]) {
    index += 1;
  }
  return index;
}

function normalizeNonOverlappingRanges(ranges: DomHighlightRange[], textLength: number) {
  const normalized: DomHighlightRange[] = [];
  let lastEnd = -1;
  for (const range of [...ranges].sort((a, b) => a.startOffset - b.startOffset)) {
    if (
      range.startOffset < 0 ||
      range.endOffset <= range.startOffset ||
      range.endOffset > textLength ||
      range.startOffset < lastEnd
    ) {
      continue;
    }
    normalized.push(range);
    lastEnd = range.endOffset;
  }
  return normalized;
}

function wrapDomRanges(root: HTMLElement, ranges: DomHighlightRange[]) {
  if (ranges.length === 0) return;
  const textNodes = collectTextNodes(root);
  const segmentsByNode = new Map<Text, TextNodeSegment[]>();

  for (const textNode of textNodes) {
    for (const range of ranges) {
      if (textNode.endOffset <= range.startOffset || textNode.startOffset >= range.endOffset) {
        continue;
      }
      const segment: TextNodeSegment = {
        startOffset: Math.max(0, range.startOffset - textNode.startOffset),
        endOffset: Math.min(textNode.node.data.length, range.endOffset - textNode.startOffset),
        range,
      };
      if (segment.endOffset > segment.startOffset) {
        const existing = segmentsByNode.get(textNode.node) ?? [];
        existing.push(segment);
        segmentsByNode.set(textNode.node, existing);
      }
    }
  }

  for (const [node, segments] of segmentsByNode) {
    wrapTextNodeSegments(node, segments);
  }
}

function collectTextNodes(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return isExcludedFromReadableText(root, node)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: TextNodeSpan[] = [];
  let offset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const length = node.data.length;
    nodes.push({
      node,
      startOffset: offset,
      endOffset: offset + length,
    });
    offset += length;
  }
  return nodes;
}

function isExcludedFromReadableText(root: HTMLElement, node: Node) {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  const excluded = element?.closest(".mermaid-figure");
  return Boolean(excluded && root.contains(excluded));
}

function isTextNodeBeforeBoundary(textNode: Text, container: Node, offset: number) {
  const textRange = document.createRange();
  const boundaryRange = document.createRange();
  textRange.selectNodeContents(textNode);
  boundaryRange.setStart(container, offset);
  boundaryRange.collapse(true);
  const isBefore = textRange.compareBoundaryPoints(Range.END_TO_START, boundaryRange) <= 0;
  textRange.detach();
  boundaryRange.detach();
  return isBefore;
}

function wrapTextNodeSegments(node: Text, segments: TextNodeSegment[]) {
  const parent = node.parentNode;
  if (!parent) return;
  const normalizedSegments = normalizeSegments(segments, node.data.length);
  if (normalizedSegments.length === 0) return;

  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const segment of normalizedSegments) {
    if (segment.startOffset > cursor) {
      fragment.append(document.createTextNode(node.data.slice(cursor, segment.startOffset)));
    }
    const mark = document.createElement("mark");
    mark.className = segment.range.className;
    if (segment.range.search) {
      mark.dataset.searchHit = segment.range.active ? "active" : "true";
      if (segment.range.id) mark.dataset.searchId = segment.range.id;
    } else if (segment.range.id) {
      mark.dataset.annotationId = segment.range.id;
    }
    if (segment.range.color) mark.style.setProperty("--mark-color", segment.range.color);
    mark.textContent = node.data.slice(segment.startOffset, segment.endOffset);
    fragment.append(mark);
    cursor = segment.endOffset;
  }
  if (cursor < node.data.length) {
    fragment.append(document.createTextNode(node.data.slice(cursor)));
  }
  parent.replaceChild(fragment, node);
}

function normalizeSegments(segments: TextNodeSegment[], textLength: number) {
  const normalized: TextNodeSegment[] = [];
  let lastEnd = -1;
  for (const segment of [...segments].sort((a, b) => a.startOffset - b.startOffset)) {
    if (
      segment.startOffset < 0 ||
      segment.endOffset <= segment.startOffset ||
      segment.endOffset > textLength ||
      segment.startOffset < lastEnd
    ) {
      continue;
    }
    normalized.push(segment);
    lastEnd = segment.endOffset;
  }
  return normalized;
}
