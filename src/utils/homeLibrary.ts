import { defaultHomeTableColumns, defaultSettings, homePageSizeOptions } from "../constants";
import type { BookSummary, HomeLibraryView, HomeTableColumnKey, ImportBookPreview } from "../types";
import { clamp } from "./math";

export type BookTableSortKey =
  | "name"
  | "rootPath"
  | "chapterCount"
  | "annotationCount"
  | "createdAt"
  | "lastOpenedAt";
export type SortDirection = "asc" | "desc";
export type BookTableResizableColumnKey = HomeTableColumnKey | "name";

export interface BookTableSortState {
  key: BookTableSortKey;
  direction: SortDirection;
}

export interface PaginationState {
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  total: number;
  startIndex: number;
  endIndex: number;
  visible: boolean;
}

export const defaultBookTableSort: BookTableSortState = { key: "lastOpenedAt", direction: "desc" };

export const defaultBookTableColumnWidths: Record<BookTableResizableColumnKey, number> = {
  rowNumber: 72,
  name: 360,
  rootPath: 320,
  chapterCount: 116,
  annotationCount: 116,
  createdAt: 156,
  lastOpenedAt: 156,
};

export const bookTableColumnMinWidths: Record<BookTableResizableColumnKey, number> = {
  rowNumber: 56,
  name: 220,
  rootPath: 220,
  chapterCount: 96,
  annotationCount: 96,
  createdAt: 128,
  lastOpenedAt: 128,
};

export const bookTableColumnMaxWidths: Record<BookTableResizableColumnKey, number> = {
  rowNumber: 120,
  name: 620,
  rootPath: 680,
  chapterCount: 180,
  annotationCount: 180,
  createdAt: 240,
  lastOpenedAt: 240,
};

export function deriveImportBookName(preview: ImportBookPreview, filePaths: string[]) {
  if (filePaths.length === 1) {
    if (preview.files.length === 1) return preview.defaultName;
    return preview.files.find((file) => file.path === filePaths[0])?.name ?? preview.defaultName;
  }
  return preview.defaultName;
}

export function normalizeHomeLibraryView(value: string): HomeLibraryView {
  return value === "table" ? "table" : "grid";
}

export function normalizeHomePageSize(value: number) {
  return homePageSizeOptions.includes(value as (typeof homePageSizeOptions)[number])
    ? value
    : defaultSettings.homePageSize;
}

export function buildPaginationState(total: number, requestedPageIndex: number, pageSize: number): PaginationState {
  const normalizedPageSize = normalizeHomePageSize(pageSize);
  const pageCount = Math.max(1, Math.ceil(total / normalizedPageSize));
  const pageIndex = clamp(requestedPageIndex, 0, pageCount - 1);
  const startIndex = pageIndex * normalizedPageSize;
  const endIndex = Math.min(total, startIndex + normalizedPageSize);
  return {
    pageIndex,
    pageCount,
    pageSize: normalizedPageSize,
    total,
    startIndex,
    endIndex,
    visible: total > normalizedPageSize,
  };
}

export function getVisiblePaginationItems(pageIndex: number, pageCount: number) {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index);
  }

  const items: Array<number | "ellipsis"> = [0];
  const start = Math.max(1, pageIndex - 1);
  const end = Math.min(pageCount - 2, pageIndex + 1);
  if (start > 1) items.push("ellipsis");
  for (let index = start; index <= end; index += 1) {
    items.push(index);
  }
  if (end < pageCount - 2) items.push("ellipsis");
  items.push(pageCount - 1);
  return items;
}

export function parseHomeTableColumns(value: string): Record<HomeTableColumnKey, boolean> {
  try {
    const parsed = JSON.parse(value) as Partial<Record<HomeTableColumnKey, unknown>>;
    return {
      rowNumber: parsed.rowNumber === undefined ? true : Boolean(parsed.rowNumber),
      rootPath: parsed.rootPath === undefined ? true : Boolean(parsed.rootPath),
      chapterCount: parsed.chapterCount === undefined ? true : Boolean(parsed.chapterCount),
      annotationCount: parsed.annotationCount === undefined ? true : Boolean(parsed.annotationCount),
      createdAt: parsed.createdAt === undefined ? true : Boolean(parsed.createdAt),
      lastOpenedAt: parsed.lastOpenedAt === undefined ? true : Boolean(parsed.lastOpenedAt),
    };
  } catch {
    return defaultHomeTableColumns;
  }
}

export function formatBookDate(value?: string | null) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function compareBookValues(left: BookSummary, right: BookSummary, key: BookTableSortKey) {
  if (key === "name") {
    return left.name.localeCompare(right.name, "zh-CN", { numeric: true, sensitivity: "base" });
  }
  if (key === "rootPath") {
    return left.rootPath.localeCompare(right.rootPath, "zh-CN", { numeric: true, sensitivity: "base" });
  }
  if (key === "chapterCount") return left.chapterCount - right.chapterCount;
  if (key === "annotationCount") return left.annotationCount - right.annotationCount;
  const leftTime = new Date(key === "createdAt" ? left.createdAt : left.lastOpenedAt ?? "").getTime();
  const rightTime = new Date(key === "createdAt" ? right.createdAt : right.lastOpenedAt ?? "").getTime();
  return (Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime);
}

export function isHomeImportDragBlocked() {
  return Boolean(document.querySelector(".modal-backdrop, .settings-backdrop"));
}
