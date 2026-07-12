import type { Chapter } from "../types";

export function chapterFileName(chapter: Chapter) {
  if (chapter.title.trim()) return chapter.title;
  const normalizedPath = chapter.filePath.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").filter(Boolean).pop();
  return fileName || chapter.title;
}
