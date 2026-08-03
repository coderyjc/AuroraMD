import type { RewriteDiffSegment } from "../components/reader/ReaderComponents";
import { diffMarkdownLines } from "./diff";

export function buildRewriteDiffSegments(oldContent: string, newContent: string): RewriteDiffSegment[] {
  return diffMarkdownLines(oldContent, newContent).map((block) => ({
    id: block.id,
    type: block.type,
    oldStart: block.oldStart,
    newStart: block.newStart,
    oldLines: block.oldLines,
    newLines: block.newLines,
  }));
}

export function composeSelectedRewriteContent(
  oldContent: string,
  newContent: string,
  segments: RewriteDiffSegment[],
  selectedSegmentIds: Set<string>,
) {
  if (segments.length === 0) return newContent;

  const oldLines = splitMarkdownLines(oldContent);
  const newLines = splitMarkdownLines(newContent);
  const finalLines: string[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  for (const segment of segments) {
    const oldStartIndex = Math.max(0, segment.oldStart - 1);
    const newStartIndex = Math.max(0, segment.newStart - 1);
    finalLines.push(...oldLines.slice(oldIndex, oldStartIndex));

    if (selectedSegmentIds.has(segment.id)) {
      finalLines.push(...segment.newLines);
    } else {
      finalLines.push(...segment.oldLines);
    }

    oldIndex = oldStartIndex + segment.oldLines.length;
    newIndex = newStartIndex + segment.newLines.length;
  }

  finalLines.push(...oldLines.slice(oldIndex));
  if (oldIndex >= oldLines.length && newIndex < newLines.length) {
    finalLines.push(...newLines.slice(newIndex));
  }
  return finalLines.join("\n");
}

function splitMarkdownLines(content: string) {
  return content.replace(/\r\n/g, "\n").split("\n");
}

export function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
