import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Check,
  FileText,
  FolderPlus,
  Grid3X3,
  Highlighter,
  List,
  Maximize2,
  MessageSquare,
  Minimize2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Settings,
  Square,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { availableMonitors, cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createAnnotation,
  createAutoBackup,
  createExportPreset,
  applyAiRewrite,
  cancelAiRewrite,
  clearChapterReadingProgress,
  deleteAnnotation,
  deleteBook,
  deleteChapter,
  deleteExportPreset,
  exportAnnotations,
  exportBackup,
  getLatestReadingProgress,
  getSettings,
  getDefaultAutoBackupDirectory,
  importBookSelection,
  listLaunchMarkdownPaths,
  listBooks,
  listChapters,
  listExportPresets,
  listNoteItems,
  listReadingProgress,
  listSystemFonts,
  markBookOpened,
  markAnnotationsStatus,
  openBookFolder,
  openChapterInExplorer,
  openMarkdownFile,
  openProjectRepository,
  pickBookFolder,
  pickAutoBackupDirectory,
  pickMarkdownFiles,
  previewImportBookFolder,
  readChapter,
  readChapterVersion,
  refreshChapterVersion,
  reorderChapters,
  runAiRewrite,
  restoreBackup,
  saveReadingProgress,
  syncBookFolder,
  updateBookName,
  updateBookPinned,
  updateAnnotation,
  updateExportPreset,
  updateSettings,
} from "./api";
import { AnnotationWorkbench, type NoteFilterStatus } from "./components/home/AnnotationWorkbench";
import {
  BatchExportModal,
  BookContextMenu,
  type BookMenuState,
  DeleteBookModal,
  DeleteBooksModal,
  HomeSettingsModal,
  ImportBookModal,
  NoteDetailModal,
  RenameBookModal,
  type RenameBookState,
  SearchModal,
  SyncReportModal,
  VersionManagerModal,
} from "./components/home/HomeModals";
import {
  AnnotationCard,
  AnnotationContextMenu,
  AnnotationDetailModal,
  ChapterContextMenu,
  DeleteChapterModal,
  ExportModal,
  NewAnnotationModal,
  SettingsPanel,
  SortChaptersModal,
  TopNotice,
  type AiRewritePhase,
  type RewriteDiffSegment,
  type SelectionDraft,
} from "./components/reader/ReaderComponents";
import {
  defaultHomeTableColumns,
  defaultSettings,
  getDefaultThemeForSeries,
  getEffectiveThemeSeries,
  homePageSizeOptions,
} from "./constants";
import {
  applyDomHighlights,
  findSelectionOffset,
  getContextFromText,
  getHeadingPath,
  getMarkdownReadableText,
  getRenderedSelectionAnchor,
  renderMarkdownToReadableText,
  renderMarkdownWithAnnotations,
  type ChangeHighlight,
  type SearchHighlight,
} from "./markdown";
import { renderMermaidDiagrams } from "./mermaid";
import type {
  Annotation,
  AnnotationPayload,
  AnnotationStatus,
  AppSettings,
  BackupResult,
  Book,
  BookSummary,
  Chapter,
  ContentSearchResult,
  ExportPreset,
  ExportPresetPayload,
  ExportTaskGoal,
  ExportTemplate,
  FolderSyncReport,
  HomeLibraryView,
  HomeTableColumnKey,
  HomeView,
  ImportBookPreview,
  NoteItem,
  ReadChapterResponse,
  ReadingProgress,
  ShortcutAction,
  SystemFont,
} from "./types";
import { chapterFileName } from "./utils/chapters";
import { diffMarkdownLines } from "./utils/diff";
import { parseHighlightPalette } from "./utils/highlights";
import { matchShortcut, parseShortcutBindings, shouldIgnoreShortcut } from "./utils/shortcuts";

interface ContextMenuState {
  x: number;
  y: number;
}

type AnnotationMenuState = ContextMenuState & { annotation: Annotation };
type ChapterMenuState = ContextMenuState & { chapter: Chapter };
type ReaderBook = Book | BookSummary;

interface ReaderSearchMatch {
  id: string;
  startOffset: number;
  endOffset: number;
  matchedText: string;
  excerpt: string;
}

interface FullscreenReveal {
  top: boolean;
  left: boolean;
  right: boolean;
}

interface ImagePreviewState {
  src: string;
  alt: string;
  scale: number;
  x: number;
  y: number;
  kind: "image" | "mermaid";
}

interface ChangeHighlightBase {
  targetVersionId: string;
  baseVersionId: string;
  content: string;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

type BookTableSortKey =
  | "name"
  | "rootPath"
  | "chapterCount"
  | "annotationCount"
  | "createdAt"
  | "lastOpenedAt";
type SortDirection = "asc" | "desc";
type BookTableResizableColumnKey = HomeTableColumnKey | "name";

interface BookTableSortState {
  key: BookTableSortKey;
  direction: SortDirection;
}

interface PaginationState {
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  total: number;
  startIndex: number;
  endIndex: number;
  visible: boolean;
}

const defaultBookTableSort: BookTableSortState = { key: "lastOpenedAt", direction: "desc" };

const defaultBookTableColumnWidths: Record<BookTableResizableColumnKey, number> = {
  rowNumber: 72,
  name: 360,
  rootPath: 320,
  chapterCount: 116,
  annotationCount: 116,
  createdAt: 156,
  lastOpenedAt: 156,
};

const bookTableColumnMinWidths: Record<BookTableResizableColumnKey, number> = {
  rowNumber: 56,
  name: 220,
  rootPath: 220,
  chapterCount: 96,
  annotationCount: 96,
  createdAt: 128,
  lastOpenedAt: 128,
};

const bookTableColumnMaxWidths: Record<BookTableResizableColumnKey, number> = {
  rowNumber: 120,
  name: 620,
  rootPath: 680,
  chapterCount: 180,
  annotationCount: 180,
  createdAt: 240,
  lastOpenedAt: 240,
};

const uiExitMs = 150;
const readerMotionMs = 220;
const noticeAutoDismissMs = 2000;
const fullscreenEdgePx = 24;
const fullscreenTopKeepPx = 126;
const fullscreenSideKeepPaddingPx = 36;
const fullscreenTopPollMs = 80;
const fullscreenTopCursorPx = 8;
const readingProgressCompleteThreshold = 0.995;
const readingProgressCompleteRemainingPx = 2;
const windowPlacementStorageKey = "auroramd.windowPlacement.v1";
const legacyWindowPlacementStorageKeys = ["annotaloop.windowPlacement.v1"];
const windowPlacementSaveDelayMs = 320;
const minimumRestoredWindowSize = 360;
const initialWindowWidthRatio = 0.69;
const initialWindowHeightRatio = 0.82;
const initialWindowMinWidth = 980;
const initialWindowMinHeight = 680;
const initialWindowEdgePaddingPx = 32;
const markdownOverflowWrapperSelector =
  ".markdown-overflow-frame[data-overflow-wrapper='true']";
const markdownOverflowBlockSelector = "p, blockquote, h1, h2, h3, h4, h5, h6";
const markdownOverflowTolerancePx = 2;

interface WindowPlacementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SavedWindowPlacement extends WindowPlacementBounds {
  savedAt: number;
}

interface WindowPlacementMonitor {
  position: PhysicalPosition;
  workArea: {
    position: PhysicalPosition;
    size: PhysicalSize;
  };
}

interface ChapterReadChoice {
  reader: ReadChapterResponse;
  scrollTop: number;
  rememberedProgress: ReadingProgress | null;
}

function enhanceMarkdownOverflow(root: HTMLElement) {
  resetMarkdownOverflow(root);
  if (root.clientWidth <= 0) return;

  const wrappers: HTMLElement[] = [];
  for (const table of Array.from(root.querySelectorAll<HTMLTableElement>("table"))) {
    if (!canWrapMarkdownOverflowElement(root, table)) continue;
    wrappers.push(wrapMarkdownOverflowElement(table, "table"));
  }

  for (const element of Array.from(
    root.querySelectorAll<HTMLElement>(markdownOverflowBlockSelector),
  )) {
    if (!canWrapMarkdownOverflowElement(root, element)) continue;
    if (isMarkdownElementOverflowing(element)) {
      wrappers.push(wrapMarkdownOverflowElement(element, "block"));
    }
  }

  updateMarkdownOverflowFrameStates(wrappers);
}

function resetMarkdownOverflow(root: HTMLElement) {
  for (const wrapper of Array.from(
    root.querySelectorAll<HTMLElement>(markdownOverflowWrapperSelector),
  )) {
    unwrapMarkdownOverflowElement(wrapper);
  }
}

function canWrapMarkdownOverflowElement(root: HTMLElement, element: HTMLElement) {
  if (!root.contains(element) || !element.parentNode) return false;
  if (element.closest(markdownOverflowWrapperSelector)) return false;
  if (element.closest("pre, .mermaid-figure")) return false;
  if (element instanceof HTMLTableElement) return true;
  return !element.closest("table");
}

function isMarkdownElementOverflowing(element: HTMLElement) {
  if (element.clientWidth <= 0) return false;
  if (element.scrollWidth > element.clientWidth + markdownOverflowTolerancePx) return true;
  const parent = element.parentElement;
  if (!parent) return false;
  const elementRect = element.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  return elementRect.right > parentRect.right + markdownOverflowTolerancePx;
}

function wrapMarkdownOverflowElement(element: HTMLElement, kind: "block" | "table") {
  const wrapper = document.createElement("div");
  wrapper.className = `markdown-overflow-frame markdown-overflow-${kind}`;
  wrapper.dataset.overflowWrapper = "true";
  wrapper.setAttribute(
    "aria-label",
    kind === "table" ? "Scrollable markdown table" : "Scrollable markdown content",
  );
  element.parentNode?.insertBefore(wrapper, element);
  wrapper.appendChild(element);
  return wrapper;
}

function updateMarkdownOverflowFrameStates(wrappers: HTMLElement[]) {
  for (const wrapper of wrappers) {
    const isOverflowing =
      wrapper.scrollWidth > wrapper.clientWidth + markdownOverflowTolerancePx;
    wrapper.classList.toggle("is-overflowing", isOverflowing);
    if (isOverflowing) {
      wrapper.tabIndex = 0;
    } else {
      wrapper.removeAttribute("tabindex");
    }
  }
}

function unwrapMarkdownOverflowElement(wrapper: HTMLElement) {
  const parent = wrapper.parentNode;
  if (!parent) return;
  while (wrapper.firstChild) {
    parent.insertBefore(wrapper.firstChild, wrapper);
  }
  parent.removeChild(wrapper);
}

function shouldPreferCurrentChapterVersion(
  progress: ReadingProgress,
  currentVersion: ReadChapterResponse["version"],
) {
  if (progress.chapterVersionId === currentVersion.id) return false;
  const progressTime = Date.parse(progress.updatedAt);
  const currentVersionTime = Date.parse(currentVersion.createdAt);
  if (!Number.isFinite(progressTime) || !Number.isFinite(currentVersionTime)) {
    return true;
  }
  return progressTime <= currentVersionTime;
}

function AppTitlebar({ title, subtitle }: { title: string; subtitle: string }) {
  function handleDrag(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const appWindow = getCurrentWindow();
    if (event.detail >= 2) {
      void appWindow.toggleMaximize();
      return;
    }
    void appWindow.startDragging();
  }

  return (
    <div className="desktop-titlebar" onMouseDown={handleDrag}>
      <div className="titlebar-brand" data-tauri-drag-region>
        <span className="titlebar-mark" aria-hidden="true" />
        <div className="titlebar-copy">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
      </div>
      <div className="window-controls">
        <button
          type="button"
          className="window-control"
          title="最小化"
          aria-label="最小化"
          onClick={() => void getCurrentWindow().minimize()}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className="window-control"
          title="最大化或还原"
          aria-label="最大化或还原"
          onClick={() => void getCurrentWindow().toggleMaximize()}
        >
          <Square size={13} />
        </button>
        <button
          type="button"
          className="window-control close"
          title="关闭"
          aria-label="关闭"
          onClick={() => void getCurrentWindow().close()}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function deriveImportBookName(preview: ImportBookPreview, filePaths: string[]) {
  if (filePaths.length === 1) {
    if (preview.files.length === 1) return preview.defaultName;
    return preview.files.find((file) => file.path === filePaths[0])?.name ?? preview.defaultName;
  }
  return preview.defaultName;
}

function normalizeHomeLibraryView(value: string): HomeLibraryView {
  return value === "table" ? "table" : "grid";
}

function normalizeHomePageSize(value: number) {
  return homePageSizeOptions.includes(value as (typeof homePageSizeOptions)[number])
    ? value
    : defaultSettings.homePageSize;
}

function buildPaginationState(total: number, requestedPageIndex: number, pageSize: number): PaginationState {
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

function getVisiblePaginationItems(pageIndex: number, pageCount: number) {
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

function parseHomeTableColumns(value: string): Record<HomeTableColumnKey, boolean> {
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

function formatBookDate(value?: string | null) {
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

function compareBookValues(left: BookSummary, right: BookSummary, key: BookTableSortKey) {
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

function buildRewriteDiffSegments(oldContent: string, newContent: string): RewriteDiffSegment[] {
  return diffMarkdownLines(oldContent, newContent).map((block) => ({
    id: block.id,
    type: block.type,
    oldStart: block.oldStart,
    newStart: block.newStart,
    oldLines: block.oldLines,
    newLines: block.newLines,
  }));
}

function composeSelectedRewriteContent(
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

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function App() {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [homeView, setHomeView] = useState<HomeView>(defaultSettings.homeDefaultView);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [exportPresets, setExportPresets] = useState<ExportPreset[]>([]);
  const [workbenchBookId, setWorkbenchBookId] = useState("all");
  const [workbenchChapterId, setWorkbenchChapterId] = useState("all");
  const [workbenchStatus, setWorkbenchStatus] = useState<NoteFilterStatus>("all");
  const [commentOnly, setCommentOnly] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [workbenchChapters, setWorkbenchChapters] = useState<Chapter[]>([]);
  const [workbenchNoteDetail, setWorkbenchNoteDetail] = useState<NoteItem | null>(null);
  const [importDragActive, setImportDragActive] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportBookPreview | null>(null);
  const [importBookName, setImportBookName] = useState("");
  const [importBookNameEdited, setImportBookNameEdited] = useState(false);
  const [selectedImportFilePaths, setSelectedImportFilePaths] = useState<string[]>([]);
  const [importModalClosing, setImportModalClosing] = useState(false);
  const [activeBook, setActiveBook] = useState<ReaderBook | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterProgress, setChapterProgress] = useState<Record<string, ReadingProgress>>({});
  const [reader, setReader] = useState<ReadChapterResponse | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [systemFonts, setSystemFonts] = useState<SystemFont[]>([]);
  const [defaultAutoBackupDirectory, setDefaultAutoBackupDirectory] = useState("");
  const [homeSettingsOpen, setHomeSettingsOpen] = useState(false);
  const [homeSettingsClosing, setHomeSettingsClosing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchClosing, setSearchClosing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [bookMenu, setBookMenu] = useState<BookMenuState | null>(null);
  const [bookMenuClosing, setBookMenuClosing] = useState(false);
  const [renameBookDraft, setRenameBookDraft] = useState<RenameBookState | null>(null);
  const [renameBookClosing, setRenameBookClosing] = useState(false);
  const [deleteBookDraft, setDeleteBookDraft] = useState<BookSummary | null>(null);
  const [deleteBookClosing, setDeleteBookClosing] = useState(false);
  const [batchDeleteBookDraft, setBatchDeleteBookDraft] = useState<BookSummary[] | null>(null);
  const [batchDeleteBookClosing, setBatchDeleteBookClosing] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
  const [libraryPage, setLibraryPage] = useState(0);
  const [notesPage, setNotesPage] = useState(0);
  const [bookTableSort, setBookTableSort] = useState<BookTableSortState>(defaultBookTableSort);
  const [bookTableColumnWidths, setBookTableColumnWidths] = useState(defaultBookTableColumnWidths);
  const [bookTableUploadOpen, setBookTableUploadOpen] = useState(false);
  const [syncReport, setSyncReport] = useState<FolderSyncReport | null>(null);
  const [syncReportClosing, setSyncReportClosing] = useState(false);
  const [versionManagerBook, setVersionManagerBook] = useState<BookSummary | null>(null);
  const [versionManagerClosing, setVersionManagerClosing] = useState(false);
  const [batchExportOpen, setBatchExportOpen] = useState(false);
  const [batchExportClosing, setBatchExportClosing] = useState(false);
  const [batchExportText, setBatchExportText] = useState("");
  const [draft, setDraft] = useState<SelectionDraft | null>(null);
  const [pendingDraft, setPendingDraft] = useState<SelectionDraft | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [contextMenuClosing, setContextMenuClosing] = useState(false);
  const selectionMenuCloseTokenRef = useRef(0);
  const suppressNextSelectionMouseUpRef = useRef(false);
  const selectionDismissPointerRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [annotationMenu, setAnnotationMenu] = useState<AnnotationMenuState | null>(null);
  const [annotationMenuClosing, setAnnotationMenuClosing] = useState(false);
  const [chapterMenu, setChapterMenu] = useState<ChapterMenuState | null>(null);
  const [chapterMenuClosing, setChapterMenuClosing] = useState(false);
  const [deleteChapterDraft, setDeleteChapterDraft] = useState<Chapter | null>(null);
  const [deleteChapterClosing, setDeleteChapterClosing] = useState(false);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [detailAnnotationId, setDetailAnnotationId] = useState<string | null>(null);
  const [detailAnnotationClosing, setDetailAnnotationClosing] = useState(false);
  const [activeSearchHighlight, setActiveSearchHighlight] = useState<
    (SearchHighlight & { chapterVersionId: string }) | null
  >(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortClosing, setSortClosing] = useState(false);
  const [sortDraft, setSortDraft] = useState<Chapter[]>([]);
  const [sortDragChapterId, setSortDragChapterId] = useState<string | null>(null);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(true);
  const [isReadingFullscreen, setIsReadingFullscreen] = useState(false);
  const [fullscreenReveal, setFullscreenReveal] = useState<FullscreenReveal>({
    top: false,
    left: false,
    right: false,
  });
  const [leftPaneWidth, setLeftPaneWidth] = useState(284);
  const [rightPaneWidth, setRightPaneWidth] = useState(344);
  const [chapterPaneHeight, setChapterPaneHeight] = useState(320);
  const [readerSearchPaneHeight, setReaderSearchPaneHeight] = useState(260);
  const [resizeTarget, setResizeTarget] = useState<
    "left" | "right" | "chapters" | "readerSearch" | null
  >(null);
  const [readerSearchQuery, setReaderSearchQuery] = useState("");
  const [readerSearchMatches, setReaderSearchMatches] = useState<ReaderSearchMatch[]>([]);
  const [activeReaderSearchIndex, setActiveReaderSearchIndex] = useState(-1);
  const [readerMotion, setReaderMotion] = useState<"content" | "jump" | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportClosing, setExportClosing] = useState(false);
  const [exportTemplate, setExportTemplate] = useState<ExportTemplate>("ai-pack");
  const [exportTaskGoal, setExportTaskGoal] = useState<ExportTaskGoal>("rewrite");
  const [exportPresetId, setExportPresetId] = useState("");
  const [exportText, setExportText] = useState("");
  const [rewritePhase, setRewritePhase] = useState<AiRewritePhase>("idle");
  const [rewriteProgress, setRewriteProgress] = useState(0);
  const [rewriteVisibleText, setRewriteVisibleText] = useState("");
  const [rewriteDraftText, setRewriteDraftText] = useState("");
  const [rewriteSegments, setRewriteSegments] = useState<RewriteDiffSegment[]>([]);
  const [selectedRewriteSegmentIds, setSelectedRewriteSegmentIds] = useState<string[]>([]);
  const [rewriteApplyConfirmOpen, setRewriteApplyConfirmOpen] = useState(false);
  const [rewriteResultUnread, setRewriteResultUnread] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draftClosing, setDraftClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [topNoticeClosing, setTopNoticeClosing] = useState(false);
  const [pendingScroll, setPendingScroll] = useState<number | null>(null);
  const [noteDetailClosing, setNoteDetailClosing] = useState(false);
  const [enhancedMarkdownKey, setEnhancedMarkdownKey] = useState("");
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null);
  const [imagePreviewClosing, setImagePreviewClosing] = useState(false);
  const [imagePreviewDragging, setImagePreviewDragging] = useState(false);
  const [showChangeHighlights, setShowChangeHighlights] = useState(false);
  const [changeHighlightBusy, setChangeHighlightBusy] = useState(false);
  const [changeHighlightBase, setChangeHighlightBase] = useState<ChangeHighlightBase | null>(null);
  const [changeHighlights, setChangeHighlights] = useState<ChangeHighlight[]>([]);
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);

  const articleRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const outlineListRef = useRef<HTMLDivElement | null>(null);
  const readerLeftRef = useRef<HTMLElement | null>(null);
  const readerRightRef = useRef<HTMLElement | null>(null);
  const readerSearchInputRef = useRef<HTMLInputElement | null>(null);
  const bookCollectionRef = useRef<HTMLElement | null>(null);
  const readerMotionTimerRef = useRef<number | null>(null);
  const imagePreviewDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const imagePreviewDidDragRef = useRef(false);
  const latestSettingsRef = useRef<AppSettings>(defaultSettings);
  const autoBackupInFlightRef = useRef(false);
  const searchThemeSnapshotRef = useRef<Pick<AppSettings, "themeSeries" | "theme"> | null>(null);
  const rewriteProgressTimerRef = useRef<number | null>(null);
  const rewriteRevealRunRef = useRef(0);
  const rewriteRequestRunRef = useRef(0);
  const rewriteCancelRequestedRef = useRef(false);
  const exportModalVisibleRef = useRef(false);

  latestSettingsRef.current = settings;

  const annotationHighlightColors = useMemo(
    () => parseHighlightPalette(settings.highlightColors),
    [settings.highlightColors],
  );

  useEffect(() => {
    void boot();
  }, []);

  useEffect(() => {
    const existingBookIds = new Set(books.map((book) => book.id));
    setSelectedBookIds((current) => current.filter((bookId) => existingBookIds.has(bookId)));
  }, [books]);

  useEffect(() => {
    const existingNoteIds = new Set(notes.map((note) => note.id));
    setSelectedNoteIds((current) => current.filter((noteId) => existingNoteIds.has(noteId)));
  }, [notes]);

  useEffect(() => {
    if (!bookTableUploadOpen) return;
    const close = () => setBookTableUploadOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [bookTableUploadOpen]);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const unlisteners: Array<() => void> = [];
    let cancelled = false;
    let restored = false;
    let saveTimer: number | null = null;

    async function applyWindowPlacement(placement: WindowPlacementBounds) {
      await appWindow.setSize(new PhysicalSize(placement.width, placement.height));
      await appWindow.setPosition(new PhysicalPosition(placement.x, placement.y));
    }

    async function restoreWindowPlacement() {
      const saved = readSavedWindowPlacement();
      const monitors = await availableMonitors();
      if (saved && isWindowPlacementVisible(saved, monitors)) {
        await applyWindowPlacement(saved);
        return;
      }
      if (saved) {
        localStorage.removeItem(windowPlacementStorageKey);
        legacyWindowPlacementStorageKeys.forEach((key) => localStorage.removeItem(key));
      }
      const monitor = monitors[0] ?? null;
      const initialPlacement = getInitialWindowPlacement(monitor);
      if (!initialPlacement) return;
      await applyWindowPlacement(initialPlacement);
    }

    async function saveWindowPlacement() {
      saveTimer = null;
      try {
        const [isMaximized, isFullscreen] = await Promise.all([
          appWindow.isMaximized(),
          appWindow.isFullscreen(),
        ]);
        if (isMaximized || isFullscreen) return;
        const [position, size] = await Promise.all([
          appWindow.outerPosition(),
          appWindow.outerSize(),
        ]);
        writeSavedWindowPlacement({
          x: Math.round(position.x),
          y: Math.round(position.y),
          width: Math.round(size.width),
          height: Math.round(size.height),
          savedAt: Date.now(),
        });
      } catch {
        // Window placement is a convenience; failure should not interrupt reading.
      }
    }

    function scheduleSaveWindowPlacement() {
      if (!restored || cancelled) return;
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        void saveWindowPlacement();
      }, windowPlacementSaveDelayMs);
    }

    void restoreWindowPlacement()
      .catch(() => {
        localStorage.removeItem(windowPlacementStorageKey);
        legacyWindowPlacementStorageKeys.forEach((key) => localStorage.removeItem(key));
      })
      .finally(() => {
        if (cancelled) return;
        restored = true;
        void appWindow.onMoved(() => scheduleSaveWindowPlacement()).then((unlisten) => {
          if (cancelled) {
            unlisten();
          } else {
            unlisteners.push(unlisten);
          }
        });
        void appWindow.onResized(() => scheduleSaveWindowPlacement()).then((unlisten) => {
          if (cancelled) {
            unlisten();
          } else {
            unlisteners.push(unlisten);
          }
        });
      });

    return () => {
      cancelled = true;
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    return () => {
      if (readerMotionTimerRef.current !== null) {
        window.clearTimeout(readerMotionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!notice && !error) return;
    setTopNoticeClosing(false);
    const closeTimer = window.setTimeout(() => {
      setTopNoticeClosing(true);
    }, noticeAutoDismissMs);
    const clearTimer = window.setTimeout(() => {
      setError("");
      setNotice("");
      setTopNoticeClosing(false);
    }, noticeAutoDismissMs + uiExitMs);
    return () => {
      window.clearTimeout(closeTimer);
      window.clearTimeout(clearTimer);
    };
  }, [notice, error]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const shell = document.querySelector<HTMLElement>(".app-shell");
      const shellBackground = shell
        ? getComputedStyle(shell).getPropertyValue("--shell-bg").trim()
        : "";
      document.documentElement.style.setProperty(
        "--app-root-bg",
        shellBackground || "#eef0ea",
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, [settings.theme, settings.themeSeries, activeBook]);

  useEffect(() => {
    if (activeBook) {
      setImportDragActive(false);
      return;
    }

    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (isHomeImportDragBlocked()) {
          setImportDragActive(false);
          return;
        }
        if (payload.type === "enter" || payload.type === "over") {
          setImportDragActive(isImportDropPosition(payload.position));
          return;
        }
        if (payload.type === "leave") {
          setImportDragActive(false);
          return;
        }
        if (payload.type === "drop") {
          const shouldImport = isImportDropPosition(payload.position);
          setImportDragActive(false);
          if (shouldImport && payload.paths[0]) {
            void importDroppedPaths(payload.paths);
          }
        }
      })
      .then((nextUnlisten) => {
        if (cancelled) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      })
      .catch((err) => setError(readError(err)));

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [activeBook, busy]);

  useEffect(() => {
    if (activeBook || !isReadingFullscreen) return;
    setIsReadingFullscreen(false);
    setFullscreenReveal({ top: false, left: false, right: false });
    void getCurrentWindow()
      .setFullscreen(false)
      .catch((err) => setError(readError(err)));
  }, [activeBook, isReadingFullscreen]);

  useEffect(() => {
    if (!isReadingFullscreen) return;

    let cancelled = false;
    let sampling = false;
    const appWindow = getCurrentWindow();

    async function sampleTopEdge() {
      if (cancelled || sampling) return;
      sampling = true;
      try {
        const [cursor, windowPosition] = await Promise.all([
          cursorPosition(),
          appWindow.outerPosition(),
        ]);
        if (cancelled) return;
        if (cursor.y - windowPosition.y <= fullscreenTopCursorPx) {
          revealFullscreenChrome("top");
        }
      } catch {
        // Edge reveal still works through pointer events when cursor sampling is unavailable.
      } finally {
        sampling = false;
      }
    }

    void sampleTopEdge();
    const timer = window.setInterval(() => {
      void sampleTopEdge();
    }, fullscreenTopPollMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isReadingFullscreen]);

  useEffect(() => {
    if (!reader || pendingScroll === null) return;
    const frame = window.requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = pendingScroll;
      }
      setPendingScroll(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [reader, pendingScroll]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeFromPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".selection-menu")) return;
      suppressNextSelectionMouseUpRef.current = true;
      selectionDismissPointerRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
      closeSelectionContextMenu({ clearPendingDraft: true });
    };
    const allowNewSelectionAfterDrag = (event: PointerEvent) => {
      const dismissPointer = selectionDismissPointerRef.current;
      if (!dismissPointer || dismissPointer.pointerId !== event.pointerId) return;
      const distance = Math.hypot(
        event.clientX - dismissPointer.startX,
        event.clientY - dismissPointer.startY,
      );
      if (distance > 6) {
        suppressNextSelectionMouseUpRef.current = false;
      }
    };
    const releaseDismissPointer = (event: PointerEvent) => {
      const dismissPointer = selectionDismissPointerRef.current;
      if (dismissPointer && dismissPointer.pointerId === event.pointerId) {
        selectionDismissPointerRef.current = null;
        window.setTimeout(() => {
          suppressNextSelectionMouseUpRef.current = false;
        }, 0);
      }
    };
    const closeFromScroll = () => closeSelectionContextMenu();
    window.addEventListener("pointerdown", closeFromPointer);
    window.addEventListener("pointermove", allowNewSelectionAfterDrag);
    window.addEventListener("pointerup", releaseDismissPointer);
    window.addEventListener("pointercancel", releaseDismissPointer);
    window.addEventListener("scroll", closeFromScroll, true);
    return () => {
      window.removeEventListener("pointerdown", closeFromPointer);
      window.removeEventListener("pointermove", allowNewSelectionAfterDrag);
      window.removeEventListener("pointerup", releaseDismissPointer);
      window.removeEventListener("pointercancel", releaseDismissPointer);
      window.removeEventListener("scroll", closeFromScroll, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!bookMenu) return;
    const close = () => closeBookMenu();
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [bookMenu]);

  useEffect(() => {
    if (!annotationMenu) return;
    const close = () => closeAnnotationMenu();
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [annotationMenu]);

  useEffect(() => {
    if (!chapterMenu) return;
    const close = () => closeChapterMenu();
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [chapterMenu]);

  useEffect(() => {
    if (workbenchBookId === "all") {
      setWorkbenchChapters([]);
      setWorkbenchChapterId("all");
      return;
    }

    let cancelled = false;
    void listChapters(workbenchBookId)
      .then((nextChapters) => {
        if (!cancelled) setWorkbenchChapters(nextChapters);
      })
      .catch((err) => {
        if (!cancelled) setError(readError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [workbenchBookId]);

  useEffect(() => {
    if (!reader || !activeBook || !scrollRef.current) return;
    const element = scrollRef.current;
    let timeout: number | undefined;
    const onScroll = () => {
      if (isChapterProgressComplete(chapterProgress[reader.chapter.id])) return;
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        if (isChapterProgressComplete(chapterProgress[reader.chapter.id])) return;
        void saveReadingProgress(
          activeBook.id,
          reader.chapter.id,
          reader.version.id,
          element.scrollTop,
          getScrollProgressRatio(element),
        )
          .then((saved) => {
            setChapterProgress((current) => ({
              ...current,
              [saved.chapterId]: saved,
            }));
          })
          .catch((err) => setError(readError(err)));
      }, 500);
    };
    element.addEventListener("scroll", onScroll);
    return () => {
      if (timeout) window.clearTimeout(timeout);
      element.removeEventListener("scroll", onScroll);
    };
  }, [activeBook, chapterProgress, reader]);

  const renderedHtml = useMemo(() => {
    if (!reader) return "";
    return renderMarkdownWithAnnotations(reader.content, reader.chapter.filePath, reader.outline);
  }, [reader?.chapter.filePath, reader?.content, reader?.outline]);

  useEffect(() => {
    if (!reader || !scrollRef.current || !articleRef.current) {
      setActiveOutlineId(null);
      return;
    }

    const surface = scrollRef.current;
    let frame = 0;

    const updateActiveOutline = () => {
      frame = 0;
      const headings = syncReaderOutlineHeadings();
      if (!headings.length || !scrollRef.current) {
        setActiveOutlineId(null);
        return;
      }

      const surfaceRect = scrollRef.current.getBoundingClientRect();
      const activationY = surfaceRect.top + Math.min(160, Math.max(72, scrollRef.current.clientHeight * 0.24));
      let nextOutlineId = headings[0].dataset.outlineId ?? null;

      for (const heading of headings) {
        const outlineId = heading.dataset.outlineId;
        if (!outlineId) continue;
        if (heading.getBoundingClientRect().top <= activationY) {
          nextOutlineId = outlineId;
        } else {
          break;
        }
      }

      setActiveOutlineId((current) => (current === nextOutlineId ? current : nextOutlineId));
    };

    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActiveOutline);
    };

    scheduleUpdate();
    surface.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      surface.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [reader?.outline, reader?.version.id, renderedHtml]);

  useEffect(() => {
    if (!activeOutlineId || !outlineListRef.current) return;
    const activeButton = Array.from(
      outlineListRef.current.querySelectorAll<HTMLButtonElement>("button[data-outline-id]"),
    ).find((button) => button.dataset.outlineId === activeOutlineId);
    activeButton?.scrollIntoView({ block: "nearest" });
  }, [activeOutlineId]);

  const markdownEnhancementKey = useMemo(() => {
    if (!reader) return "";
    return [
      reader.version.id,
      reader.content.length,
      settings.themeSeries,
      settings.theme,
    ].join(":");
  }, [reader?.content.length, reader?.version.id, settings.theme, settings.themeSeries]);

  useEffect(() => {
    if (
      !reader ||
      !activeAnnotationId ||
      !articleRef.current ||
      enhancedMarkdownKey !== markdownEnhancementKey
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const mark = articleRef.current?.querySelector<HTMLElement>(
        `[data-annotation-id="${activeAnnotationId}"]`,
      );
      mark?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeAnnotationId, enhancedMarkdownKey, markdownEnhancementKey, reader]);

  useEffect(() => {
    if (
      !reader ||
      !activeSearchHighlight ||
      !articleRef.current ||
      enhancedMarkdownKey !== markdownEnhancementKey
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const mark = articleRef.current?.querySelector<HTMLElement>("[data-search-hit='true']");
      const activeMark =
        articleRef.current?.querySelector<HTMLElement>('[data-search-id="global-search"]') ?? mark;
      activeMark?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSearchHighlight, enhancedMarkdownKey, markdownEnhancementKey, reader]);

  useEffect(() => {
    if (
      !reader ||
      activeReaderSearchIndex < 0 ||
      !articleRef.current ||
      enhancedMarkdownKey !== markdownEnhancementKey
    ) {
      return;
    }
    const match = readerSearchMatches[activeReaderSearchIndex];
    if (!match) return;
    const frame = window.requestAnimationFrame(() => {
      const mark = articleRef.current?.querySelector<HTMLElement>(
        `[data-search-id="${match.id}"]`,
      );
      mark?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    activeReaderSearchIndex,
    enhancedMarkdownKey,
    markdownEnhancementKey,
    reader,
    readerSearchMatches,
  ]);

  const readerStats = useMemo(() => getReadingStats(reader?.content ?? ""), [reader?.content]);

  const currentChapterIndex = useMemo(() => {
    if (!reader) return -1;
    return chapters.findIndex((chapter) => chapter.id === reader.chapter.id);
  }, [chapters, reader]);

  const previousChapter = currentChapterIndex > 0 ? chapters[currentChapterIndex - 1] : null;
  const nextChapter =
    currentChapterIndex >= 0 && currentChapterIndex < chapters.length - 1
      ? chapters[currentChapterIndex + 1]
      : null;

  const previousReaderVersion = useMemo(() => {
    if (!reader) return null;
    return (
      reader.versions
        .filter((version) => version.versionNumber < reader.version.versionNumber)
        .sort((left, right) => {
          const numberDelta = right.versionNumber - left.versionNumber;
          if (numberDelta !== 0) return numberDelta;
          return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        })[0] ?? null
    );
  }, [reader]);

  const activeGlobalSearchHighlight = useMemo<SearchHighlight | null>(() => {
    if (!reader || activeSearchHighlight?.chapterVersionId !== reader.version.id) return null;
    return {
      id: "global-search",
      startOffset: activeSearchHighlight.startOffset,
      endOffset: activeSearchHighlight.endOffset,
      matchedText: activeSearchHighlight.matchedText,
      active: true,
    };
  }, [activeSearchHighlight, reader]);

  const readerSearchHighlights = useMemo<SearchHighlight[]>(
    () =>
      readerSearchMatches.map((match, index) => ({
        id: match.id,
        startOffset: match.startOffset,
        endOffset: match.endOffset,
        matchedText: match.matchedText,
        active: index === activeReaderSearchIndex,
      })),
    [activeReaderSearchIndex, readerSearchMatches],
  );

  const visibleSearchHighlights = useMemo(
    () => [
      ...(activeGlobalSearchHighlight ? [activeGlobalSearchHighlight] : []),
      ...readerSearchHighlights,
    ],
    [activeGlobalSearchHighlight, readerSearchHighlights],
  );

  useEffect(() => {
    if (!reader || !articleRef.current) {
      setEnhancedMarkdownKey("");
      return;
    }

    let cancelled = false;
    setEnhancedMarkdownKey("");
    const frame = window.requestAnimationFrame(() => {
      const root = articleRef.current;
      if (!root) return;
      void renderMermaidDiagrams(root)
        .catch((err) => {
          if (!cancelled) setError(readError(err));
        })
        .finally(() => {
          if (!cancelled) setEnhancedMarkdownKey(markdownEnhancementKey);
        });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [markdownEnhancementKey, renderedHtml]);

  useEffect(() => {
    if (
      !reader ||
      !articleRef.current ||
      enhancedMarkdownKey !== markdownEnhancementKey
    ) {
      return;
    }

    const root = articleRef.current;
    let frame = 0;
    const scheduleEnhancement = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        enhanceMarkdownOverflow(root);
      });
    };
    const resizeObserver = new ResizeObserver(scheduleEnhancement);

    scheduleEnhancement();
    resizeObserver.observe(root);
    window.addEventListener("resize", scheduleEnhancement);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleEnhancement);
      resetMarkdownOverflow(root);
    };
  }, [
    enhancedMarkdownKey,
    markdownEnhancementKey,
    reader,
    settings.contentWidth,
    settings.fontSize,
    settings.lineHeight,
    settings.paragraphSpacing,
    settings.readerCjkFontFamily,
    settings.readerFontFamily,
    settings.readerLatinFontFamily,
  ]);

  useEffect(() => {
    if (
      !reader ||
      !articleRef.current ||
      enhancedMarkdownKey !== markdownEnhancementKey
    ) {
      setReaderSearchMatches([]);
      setActiveReaderSearchIndex(-1);
      return;
    }
    const nextMatches = buildReaderSearchMatches(
      getMarkdownReadableText(articleRef.current),
      readerSearchQuery,
    );
    setReaderSearchMatches(nextMatches);
    setActiveReaderSearchIndex(-1);
  }, [enhancedMarkdownKey, markdownEnhancementKey, reader, readerSearchQuery]);

  useEffect(() => {
    if (
      !reader ||
      !articleRef.current ||
      enhancedMarkdownKey !== markdownEnhancementKey
    ) {
      return;
    }
    applyDomHighlights(
      articleRef.current,
      reader.annotations,
      visibleSearchHighlights,
      showChangeHighlights ? changeHighlights : [],
    );
  }, [
    changeHighlights,
    enhancedMarkdownKey,
    markdownEnhancementKey,
    reader,
    showChangeHighlights,
    visibleSearchHighlights,
  ]);

  useEffect(() => {
    if (!showChangeHighlights || !reader || !previousReaderVersion) {
      setChangeHighlightBase(null);
      setChangeHighlightBusy(false);
      return;
    }

    let cancelled = false;
    setChangeHighlightBase(null);
    setChangeHighlightBusy(true);
    void readChapterVersion(previousReaderVersion.id)
      .then((baseReader) => {
        if (cancelled) return;
        setChangeHighlightBase({
          targetVersionId: reader.version.id,
          baseVersionId: previousReaderVersion.id,
          content: baseReader.content,
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setChangeHighlightBase(null);
          setError(readError(err));
        }
      })
      .finally(() => {
        if (!cancelled) setChangeHighlightBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [previousReaderVersion?.id, reader?.version.id, showChangeHighlights]);

  useEffect(() => {
    if (
      !showChangeHighlights ||
      !reader ||
      !articleRef.current ||
      enhancedMarkdownKey !== markdownEnhancementKey ||
      !changeHighlightBase ||
      changeHighlightBase.targetVersionId !== reader.version.id
    ) {
      setChangeHighlights([]);
      return;
    }

    setChangeHighlights(
      buildChangeHighlights(
        articleRef.current,
        changeHighlightBase.content,
        reader.content,
        reader.chapter.filePath,
      ),
    );
  }, [changeHighlightBase, enhancedMarkdownKey, markdownEnhancementKey, reader, showChangeHighlights]);

  const detailAnnotation = useMemo(() => {
    if (!reader || !detailAnnotationId) return null;
    return reader.annotations.find((annotation) => annotation.id === detailAnnotationId) ?? null;
  }, [detailAnnotationId, reader]);

  const shortcutBindings = useMemo(
    () => parseShortcutBindings(settings.shortcutBindings),
    [settings.shortcutBindings],
  );
  const homePageSize = normalizeHomePageSize(settings.homePageSize);

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      if (workbenchBookId !== "all" && note.bookId !== workbenchBookId) return false;
      if (workbenchChapterId !== "all" && note.chapterId !== workbenchChapterId) return false;
      if (workbenchStatus !== "all" && note.status !== workbenchStatus) return false;
      if (commentOnly && !note.comment.trim()) return false;
      return true;
    });
  }, [commentOnly, notes, workbenchBookId, workbenchChapterId, workbenchStatus]);

  const selectedNotes = useMemo(
    () => filteredNotes.filter((note) => selectedNoteIds.includes(note.id)),
    [filteredNotes, selectedNoteIds],
  );
  const notesPagination = useMemo(
    () => buildPaginationState(filteredNotes.length, notesPage, homePageSize),
    [filteredNotes.length, homePageSize, notesPage],
  );
  const pagedNotes = useMemo(
    () => filteredNotes.slice(notesPagination.startIndex, notesPagination.endIndex),
    [filteredNotes, notesPagination.endIndex, notesPagination.startIndex],
  );

  const homeTableColumns = useMemo(
    () => parseHomeTableColumns(settings.homeTableColumns),
    [settings.homeTableColumns],
  );

  const sortedBooks = useMemo(() => {
    return [...books].sort((left, right) => {
      if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
      const direction = bookTableSort.direction === "asc" ? 1 : -1;
      const value = compareBookValues(left, right, bookTableSort.key) * direction;
      if (value !== 0) return value;
      return left.name.localeCompare(right.name, "zh-CN", { numeric: true, sensitivity: "base" });
    });
  }, [bookTableSort, books]);
  const gridPagination = useMemo(
    () => buildPaginationState(books.length, libraryPage, homePageSize),
    [books.length, homePageSize, libraryPage],
  );
  const pagedGridBooks = useMemo(
    () => books.slice(gridPagination.startIndex, gridPagination.endIndex),
    [books, gridPagination.endIndex, gridPagination.startIndex],
  );
  const tablePagination = useMemo(
    () => buildPaginationState(sortedBooks.length, libraryPage, homePageSize),
    [homePageSize, libraryPage, sortedBooks.length],
  );
  const pagedTableBooks = useMemo(
    () => sortedBooks.slice(tablePagination.startIndex, tablePagination.endIndex),
    [sortedBooks, tablePagination.endIndex, tablePagination.startIndex],
  );

  const selectedBooks = useMemo(
    () => books.filter((book) => selectedBookIds.includes(book.id)),
    [books, selectedBookIds],
  );

  const bookTableGridTemplate = useMemo(() => {
    const columns = ["42px"];
    if (homeTableColumns.rowNumber) columns.push(`${bookTableColumnWidths.rowNumber}px`);
    columns.push(`${bookTableColumnWidths.name}px`);
    if (homeTableColumns.rootPath) columns.push(`${bookTableColumnWidths.rootPath}px`);
    if (homeTableColumns.chapterCount) columns.push(`${bookTableColumnWidths.chapterCount}px`);
    if (homeTableColumns.annotationCount) columns.push(`${bookTableColumnWidths.annotationCount}px`);
    if (homeTableColumns.createdAt) columns.push(`${bookTableColumnWidths.createdAt}px`);
    if (homeTableColumns.lastOpenedAt) columns.push(`${bookTableColumnWidths.lastOpenedAt}px`);
    return columns.join(" ");
  }, [bookTableColumnWidths, homeTableColumns]);

  useEffect(() => {
    if (libraryPage !== gridPagination.pageIndex) {
      setLibraryPage(gridPagination.pageIndex);
    }
  }, [gridPagination.pageIndex, libraryPage]);

  useEffect(() => {
    if (notesPage !== notesPagination.pageIndex) {
      setNotesPage(notesPagination.pageIndex);
    }
  }, [notesPage, notesPagination.pageIndex]);

  useEffect(() => {
    setLibraryPage(0);
    setNotesPage(0);
  }, [homePageSize]);

  useEffect(() => {
    if (!settings.autoBackupEnabled) return;
    const requestedInterval = Number(settings.autoBackupIntervalMinutes);
    const intervalMinutes = Math.round(
      clamp(
        Number.isFinite(requestedInterval)
          ? requestedInterval
          : defaultSettings.autoBackupIntervalMinutes,
        5,
        14400,
      ),
    );
    const intervalMs = intervalMinutes * 60 * 1000;
    const runAutoBackup = async () => {
      if (autoBackupInFlightRef.current) return;
      autoBackupInFlightRef.current = true;
      try {
        const result = await createAutoBackup(settings.autoBackupDirectory || null);
        setNotice(`自动备份已保存：${result.path}`);
      } catch (err) {
        setError(readError(err));
      } finally {
        autoBackupInFlightRef.current = false;
      }
    };
    const intervalId = window.setInterval(() => {
      void runAutoBackup();
    }, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [
    settings.autoBackupDirectory,
    settings.autoBackupEnabled,
    settings.autoBackupIntervalMinutes,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeTopModal()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key === "Escape" && isReadingFullscreen) {
        event.preventDefault();
        event.stopPropagation();
        exitReadingFullscreen();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        return;
      }
      if (
        activeBook &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        focusReaderSearchInput();
        return;
      }
      if (shouldIgnoreShortcut(event)) return;
      const action = matchShortcut(event, shortcutBindings);
      if (!action) return;
      event.preventDefault();
      runShortcutAction(action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    shortcutBindings,
    activeBook,
    reader,
    chapters,
    pendingDraft,
    detailAnnotationId,
    draft,
    contextMenu,
    annotationMenu,
    chapterMenu,
    searchOpen,
    settingsOpen,
    exportOpen,
    sortOpen,
    deleteChapterDraft,
    batchExportOpen,
    workbenchNoteDetail,
    homeSettingsOpen,
    versionManagerBook,
    syncReport,
    deleteBookDraft,
    renameBookDraft,
    bookMenu,
    importPreview,
    isReadingFullscreen,
  ]);

  const readerStyle = useMemo(
    () =>
      ({
        "--interface-font-family": composeLanguageFontStack(
          "Aurora Interface Latin",
          "Aurora Interface CJK",
          "sans-serif",
        ),
        "--reader-font-family": composeLanguageFontStack(
          "Aurora Reader Latin",
          "Aurora Reader CJK",
          "serif",
        ),
        "--reader-font-size": `${settings.fontSize}px`,
        "--reader-line-height": settings.lineHeight,
        "--reader-width": `${settings.contentWidth}px`,
        "--reader-padding": `${settings.pagePadding}px`,
        "--reader-paragraph-spacing": `${settings.paragraphSpacing}px`,
        "--reader-left-width": `${leftPaneWidth}px`,
        "--reader-right-width": `${rightPaneWidth}px`,
        "--chapter-list-height": `${chapterPaneHeight}px`,
        "--reader-search-height": `${readerSearchPaneHeight}px`,
      }) as CSSProperties,
    [chapterPaneHeight, leftPaneWidth, readerSearchPaneHeight, rightPaneWidth, settings],
  );

  const homeStyle = useMemo(
    () =>
      ({
        "--interface-font-family": composeLanguageFontStack(
          "Aurora Interface Latin",
          "Aurora Interface CJK",
          "sans-serif",
        ),
      }) as CSSProperties,
    [],
  );

  const languageFontFaceCss = useMemo(
    () =>
      [
        createLanguageFontFace("Aurora Interface Latin", settings.interfaceLatinFontFamily, "latin"),
        createLanguageFontFace("Aurora Interface CJK", settings.interfaceCjkFontFamily, "cjk"),
        createLanguageFontFace("Aurora Reader Latin", settings.readerLatinFontFamily, "latin"),
        createLanguageFontFace("Aurora Reader CJK", settings.readerCjkFontFamily, "cjk"),
      ]
        .filter(Boolean)
        .join("\n"),
    [
      settings.interfaceCjkFontFamily,
      settings.interfaceLatinFontFamily,
      settings.readerCjkFontFamily,
      settings.readerLatinFontFamily,
    ],
  );

  async function boot() {
    setError("");
    try {
      const [
        nextBooks,
        nextSettings,
        nextNotes,
        nextExportPresets,
        nextSystemFonts,
        nextDefaultAutoBackupDirectory,
        launchMarkdownPaths,
      ] = await Promise.all([
        listBooks(),
        getSettings(),
        listNoteItems(),
        listExportPresets(),
        listSystemFonts().catch(() => []),
        getDefaultAutoBackupDirectory().catch(() => ""),
        listLaunchMarkdownPaths().catch(() => []),
      ]);
      setBooks(nextBooks);
      setSettings(nextSettings);
      setHomeView(normalizeHomeLibraryView(nextSettings.homeDefaultView));
      setNotes(nextNotes);
      setExportPresets(nextExportPresets);
      setSystemFonts(nextSystemFonts);
      setDefaultAutoBackupDirectory(nextDefaultAutoBackupDirectory);
      if (launchMarkdownPaths[0]) {
        await openLaunchMarkdownFile(launchMarkdownPaths[0], launchMarkdownPaths.length);
      }
    } catch (err) {
      setError(readError(err));
    }
  }

  async function refreshBooks() {
    const nextBooks = await listBooks();
    setBooks(nextBooks);
  }

  async function refreshNotes() {
    const nextNotes = await listNoteItems();
    setNotes(nextNotes);
  }

  async function refreshExportPresets() {
    const nextPresets = await listExportPresets();
    setExportPresets(nextPresets);
    if (exportPresetId && !nextPresets.some((preset) => preset.id === exportPresetId)) {
      setExportPresetId("");
    }
    return nextPresets;
  }

  async function handleChooseFolder() {
    setError("");
    setBusy(true);
    try {
      const selected = await pickBookFolder();
      if (selected) {
        await openImportPreview(selected);
      }
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleChooseMarkdownFiles() {
    setError("");
    setBusy(true);
    try {
      const selected = await pickMarkdownFiles();
      if (selected[0]) {
        await openImportPreview(selected[0], selected);
      }
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function importDroppedPaths(paths: string[]) {
    const importPaths = paths.map((path) => path.trim()).filter(Boolean);
    if (!importPaths[0] || busy) return;
    setError("");
    setBusy(true);
    try {
      await openImportPreview(importPaths[0], importPaths);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  function isImportDropPosition(position: { x: number; y: number }) {
    const shelf = bookCollectionRef.current;
    if (!shelf) return false;
    const rect = shelf.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const x = position.x / scale;
    const y = position.y / scale;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  async function openImportPreview(path: string, preferredFilePaths?: string[]) {
    const preview = await previewImportBookFolder(path);
    const preferredSet = new Set(preferredFilePaths?.map((filePath) => filePath.trim()).filter(Boolean));
    const initialFilePaths = preferredSet.size
      ? preview.files.filter((file) => preferredSet.has(file.path)).map((file) => file.path)
      : preview.files.map((file) => file.path);
    const selectedPaths = initialFilePaths.length ? initialFilePaths : preview.files.map((file) => file.path);
    setImportPreview(preview);
    setImportBookNameEdited(false);
    setImportBookName(deriveImportBookName(preview, selectedPaths));
    setSelectedImportFilePaths(selectedPaths);
    setImportModalClosing(false);
  }

  function updateImportBookName(name: string) {
    setImportBookNameEdited(true);
    setImportBookName(name);
  }

  function updateImportFileSelection(filePaths: string[]) {
    setSelectedImportFilePaths(filePaths);
    if (!importBookNameEdited && importPreview) {
      setImportBookName(deriveImportBookName(importPreview, filePaths));
    }
  }

  async function confirmImportBook() {
    if (!importPreview) return;
    setError("");
    setBusy(true);
    try {
      const imported = await importBookSelection({
        rootPath: importPreview.rootPath,
        bookName: importBookName.trim(),
        sourceType: importPreview.sourceType,
        filePaths: selectedImportFilePaths,
      });
      await refreshBooks();
      setNotice(`已导入《${imported.book.name}》，共 ${imported.chapters.length} 个章节。`);
      closeImportModal();
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function openLaunchMarkdownFile(path: string, pathCount: number) {
    setError("");
    setBusy(true);
    try {
      const opened = await openMarkdownFile(path);
      const nextBooks = await listBooks();
      setBooks(nextBooks);
      const book = nextBooks.find((item) => item.id === opened.book.id) ?? opened.book;
      if (pathCount > 1) {
        setNotice("已打开第一个 Markdown 文件。");
      }
      await openBook(book, opened.targetChapterId);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function recordBookOpened(bookId: string) {
    const openedBook = await markBookOpened(bookId);
    setBooks((current) =>
      current.map((item) =>
        item.id === openedBook.id ? { ...item, lastOpenedAt: openedBook.lastOpenedAt } : item,
      ),
    );
    return openedBook;
  }

  async function rememberChapterVersionOpening(
    nextReader: ReadChapterResponse,
  ): Promise<ReadingProgress | null> {
    try {
      return await saveReadingProgress(
        nextReader.chapter.bookId,
        nextReader.chapter.id,
        nextReader.version.id,
        0,
        0,
      );
    } catch (err) {
      setError(readError(err));
      return null;
    }
  }

  async function readChapterWithVersionMemory(
    chapter: Chapter,
    progress?: ReadingProgress,
  ): Promise<ChapterReadChoice> {
    if (!progress) {
      return {
        reader: await readChapter(chapter.id),
        scrollTop: 0,
        rememberedProgress: null,
      };
    }

    if (progress.chapterVersionId !== chapter.currentVersionId) {
      const currentReader = await readChapter(chapter.id);
      if (shouldPreferCurrentChapterVersion(progress, currentReader.version)) {
        return {
          reader: currentReader,
          scrollTop: 0,
          rememberedProgress: await rememberChapterVersionOpening(currentReader),
        };
      }
    }

    try {
      return {
        reader: await readChapterVersion(progress.chapterVersionId),
        scrollTop: progress.scrollTop,
        rememberedProgress: null,
      };
    } catch {
      const currentReader = await readChapter(chapter.id);
      return {
        reader: currentReader,
        scrollTop: 0,
        rememberedProgress: await rememberChapterVersionOpening(currentReader),
      };
    }
  }

  async function openBook(book: ReaderBook, targetChapterId?: string) {
    setBusy(true);
    setError("");
    setExportText("");
    setExportOpen(false);
    setSortOpen(false);
    setDraft(null);
    setActiveSearchHighlight(null);
    setActiveAnnotationId(null);
    setDetailAnnotationId(null);
    setAnnotationMenu(null);
    setChapterMenu(null);
    setDeleteChapterDraft(null);
    try {
      const [nextChapters, progressItems] = await Promise.all([
        listChapters(book.id),
        listReadingProgress(book.id),
      ]);
      if (!nextChapters.length) {
        throw new Error("这本书没有可读章节。");
      }
      let nextReader: ReadChapterResponse;
      let rememberedProgress: ReadingProgress | null = null;
      if (targetChapterId && nextChapters.some((chapter) => chapter.id === targetChapterId)) {
        const targetChapter =
          nextChapters.find((chapter) => chapter.id === targetChapterId) ?? nextChapters[0];
        const progress = progressItems.find((item) => item.chapterId === targetChapter.id);
        const choice = await readChapterWithVersionMemory(targetChapter, progress);
        nextReader = choice.reader;
        rememberedProgress = choice.rememberedProgress;
        setPendingScroll(choice.scrollTop);
      } else {
        const progress = progressItems[0] ?? (await getLatestReadingProgress(book.id));
        const progressChapter = progress
          ? nextChapters.find((chapter) => chapter.id === progress.chapterId)
          : null;
        const choice = await readChapterWithVersionMemory(
          progressChapter ?? nextChapters[0],
          progressChapter ? progress ?? undefined : undefined,
        );
        nextReader = choice.reader;
        rememberedProgress = choice.rememberedProgress;
        setPendingScroll(choice.scrollTop);
      }
      const openedBook = await recordBookOpened(book.id);
      runViewTransition(() => {
        const progressMap = buildChapterProgressMap(progressItems);
        if (rememberedProgress) {
          progressMap[rememberedProgress.chapterId] = rememberedProgress;
        }
        setActiveBook({ ...book, lastOpenedAt: openedBook.lastOpenedAt });
        setChapters(nextChapters);
        setChapterProgress(progressMap);
        setReader(nextReader);
      });
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function openNote(note: NoteItem) {
    setBusy(true);
    setError("");
    setDraft(null);
    setExportText("");
    setExportOpen(false);
    setSortOpen(false);
    setActiveSearchHighlight(null);
    setDetailAnnotationId(null);
    setAnnotationMenu(null);
    setChapterMenu(null);
    try {
      const [nextChapters, progressItems] = await Promise.all([
        listChapters(note.bookId),
        listReadingProgress(note.bookId),
      ]);
      const nextReader = await readChapterVersion(note.chapterVersionId).catch(() =>
        readChapter(note.chapterId),
      );
      const book = books.find((item) => item.id === note.bookId);
      const openedBook = await recordBookOpened(note.bookId).catch(() => null);
      runViewTransition(() => {
        setActiveBook(
          book
            ? { ...book, lastOpenedAt: openedBook?.lastOpenedAt ?? book.lastOpenedAt }
            : {
            id: note.bookId,
            name: note.bookName,
            rootPath: "",
            viewMode: "grid",
            isPinned: false,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
            lastOpenedAt: openedBook?.lastOpenedAt ?? null,
            chapterCount: nextChapters.length,
            annotationCount: notes.filter((item) => item.bookId === note.bookId).length,
          },
        );
        setChapters(nextChapters);
        setChapterProgress(buildChapterProgressMap(progressItems));
        setReader(nextReader);
      });
      selectReaderAnnotation(note.id);
      setPendingScroll(0);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function openContentSearchResult(result: ContentSearchResult) {
    setBusy(true);
    setError("");
    setDraft(null);
    setExportText("");
    setExportOpen(false);
    setSortOpen(false);
    setSearchOpen(false);
    setActiveAnnotationId(null);
    setDetailAnnotationId(null);
    setAnnotationMenu(null);
    setChapterMenu(null);
    try {
      const [nextChapters, progressItems] = await Promise.all([
        listChapters(result.bookId),
        listReadingProgress(result.bookId),
      ]);
      const nextReader = await readChapterVersion(result.chapterVersionId).catch(() =>
        readChapter(result.chapterId),
      );
      const book = books.find((item) => item.id === result.bookId);
      const openedBook = await recordBookOpened(result.bookId).catch(() => null);
      runViewTransition(() => {
        setActiveBook(
          book
            ? { ...book, lastOpenedAt: openedBook?.lastOpenedAt ?? book.lastOpenedAt }
            : {
            id: result.bookId,
            name: result.bookName,
            rootPath: "",
            viewMode: "grid",
            isPinned: false,
            createdAt: "",
            updatedAt: "",
            lastOpenedAt: openedBook?.lastOpenedAt ?? null,
            chapterCount: nextChapters.length,
            annotationCount: notes.filter((item) => item.bookId === result.bookId).length,
          },
        );
        setChapters(nextChapters);
        setChapterProgress(buildChapterProgressMap(progressItems));
        setReader(nextReader);
      });
      setActiveSearchHighlight({
        chapterVersionId: result.chapterVersionId,
        startOffset: result.startOffset,
        endOffset: result.endOffset,
        matchedText: result.matchedText,
      });
      playReaderMotion("jump");
      setPendingScroll(null);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function selectChapter(chapterId: string) {
    setBusy(true);
    setDraft(null);
    setExportText("");
    setActiveSearchHighlight(null);
    setActiveAnnotationId(null);
    setDetailAnnotationId(null);
    setAnnotationMenu(null);
    setChapterMenu(null);
    try {
      const chapter = chapters.find((item) => item.id === chapterId);
      if (!chapter) return;
      const progress = chapterProgress[chapterId];
      const choice = await readChapterWithVersionMemory(chapter, progress);
      playReaderMotion("content");
      setReader(choice.reader);
      setPendingScroll(choice.scrollTop);
      const rememberedProgress = choice.rememberedProgress;
      if (rememberedProgress) {
        setChapterProgress((current) => ({
          ...current,
          [rememberedProgress.chapterId]: rememberedProgress,
        }));
      }
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function selectVersion(chapterVersionId: string) {
    setBusy(true);
    setDraft(null);
    setActiveSearchHighlight(null);
    setActiveAnnotationId(null);
    setDetailAnnotationId(null);
    setAnnotationMenu(null);
    setChapterMenu(null);
    try {
      const nextReader = await readChapterVersion(chapterVersionId);
      const rememberedProgress = await rememberChapterVersionOpening(nextReader);
      playReaderMotion("content");
      setReader(nextReader);
      setPendingScroll(0);
      if (rememberedProgress) {
        setChapterProgress((current) => ({
          ...current,
          [rememberedProgress.chapterId]: rememberedProgress,
        }));
      }
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  function handleChapterContextMenu(
    event: ReactMouseEvent<HTMLButtonElement>,
    chapter: Chapter,
  ) {
    event.preventDefault();
    event.stopPropagation();
    closeSelectionContextMenu();
    closeAnnotationMenu();
    setChapterMenuClosing(false);
    setChapterMenu({
      chapter,
      x: Math.min(event.clientX, window.innerWidth - 218),
      y: Math.min(event.clientY, window.innerHeight - 176),
    });
  }

  async function markChapterUnreadFromMenu(chapter: Chapter) {
    closeChapterMenu();
    setError("");
    try {
      await clearChapterReadingProgress(chapter.id);
      setChapterProgress((current) => {
        const next = { ...current };
        delete next[chapter.id];
        return next;
      });
      setNotice(`已将“${chapterFileName(chapter)}”标为未读。`);
    } catch (err) {
      setError(readError(err));
    }
  }

  async function refreshChapterFromMenu(chapter: Chapter) {
    closeChapterMenu();
    setBusy(true);
    setError("");
    setDraft(null);
    setPendingDraft(null);
    setActiveSearchHighlight(null);
    setActiveAnnotationId(null);
    setDetailAnnotationId(null);
    try {
      const previousVersionId = chapter.currentVersionId;
      const refreshedVersion = await refreshChapterVersion(chapter.id);
      const nextChapters = await listChapters(chapter.bookId);
      const hasNewVersion = refreshedVersion.id !== previousVersionId;
      setChapters(nextChapters);
      if (hasNewVersion) {
        setChapterProgress((current) => {
          const next = { ...current };
          delete next[chapter.id];
          return next;
        });
      }
      setActiveBook((current) => {
        if (!current || current.id !== chapter.bookId || !("chapterCount" in current)) {
          return current;
        }
        return { ...current, chapterCount: nextChapters.length };
      });
      if (reader?.chapter.id === chapter.id) {
        const nextReader = await readChapter(chapter.id);
        playReaderMotion("content");
        setReader(nextReader);
        setPendingScroll(hasNewVersion ? 0 : chapterProgress[chapter.id]?.scrollTop ?? 0);
      }
      void refreshBooks();
      void refreshNotes();
      const chapterName = chapterFileName(chapter);
      setNotice(
        !hasNewVersion
          ? `章节“${chapterName}”已经是最新。`
          : `已更新章节“${chapterName}”，生成 v${refreshedVersion.versionNumber}。`,
      );
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function openChapterSourceInExplorer(chapter: Chapter) {
    closeChapterMenu();
    setBusy(true);
    setError("");
    try {
      await openChapterInExplorer(chapter.id);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  function requestDeleteReaderChapter(chapter: Chapter) {
    closeChapterMenu();
    setDeleteChapterClosing(false);
    setDeleteChapterDraft(chapter);
  }

  async function confirmDeleteReaderChapter() {
    if (!deleteChapterDraft) return;
    const draft = deleteChapterDraft;
    const previousChapters = chapters;
    const deletedIndex = Math.max(0, previousChapters.findIndex((chapter) => chapter.id === draft.id));
    const deletedWasActive = reader?.chapter.id === draft.id;
    setBusy(true);
    setError("");
    setDraft(null);
    setPendingDraft(null);
    setActiveSearchHighlight(null);
    setActiveAnnotationId(null);
    setDetailAnnotationId(null);
    try {
      const nextChapters = await deleteChapter(draft.id);
      const nextSelected = nextChapters[Math.min(deletedIndex, nextChapters.length - 1)] ?? null;
      closeDeleteChapterModal();
      setChapters(nextChapters);
      setChapterProgress((current) => {
        const next = { ...current };
        delete next[draft.id];
        return next;
      });
      setActiveBook((current) => {
        if (!current || current.id !== draft.bookId || !("chapterCount" in current)) {
          return current;
        }
        return { ...current, chapterCount: nextChapters.length };
      });
      if (deletedWasActive) {
        if (nextSelected) {
          setReader(null);
          const nextReader = await readChapter(nextSelected.id);
          playReaderMotion("content");
          setReader(nextReader);
          setPendingScroll(0);
        } else {
          runViewTransition(() => {
            setActiveBook(null);
            setReader(null);
            setChapters([]);
            setChapterProgress({});
          });
        }
      }
      void refreshBooks();
      void refreshNotes();
      setNotice(
        nextChapters.length
          ? `已删除章节“${chapterFileName(draft)}”。`
          : `已删除章节“${chapterFileName(draft)}”，这本书已没有可读章节。`,
      );
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  function handleTextSelection(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (suppressNextSelectionMouseUpRef.current) {
      suppressNextSelectionMouseUpRef.current = false;
      selectionDismissPointerRef.current = null;
      setPendingDraft(null);
      closeSelectionContextMenu({ clearPendingDraft: true });
      return;
    }
    const nextDraft = buildDraftFromSelection(false);
    setPendingDraft(nextDraft);
    if (!settings.slideAnnotate || !nextDraft) {
      closeSelectionContextMenu();
      return;
    }
    openSelectionContextMenu(getSelectionMenuPosition(event));
  }

  function handleReaderContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    if (!articleRef.current) return;
    event.preventDefault();
    const nextDraft = buildDraftFromSelection(true) ?? pendingDraft;
    if (!nextDraft) {
      closeSelectionContextMenu();
      return;
    }
    setPendingDraft(nextDraft);
    openSelectionContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 156),
      y: Math.min(event.clientY, window.innerHeight - 56),
    });
  }

  function getSelectionMenuPosition(event: ReactMouseEvent<HTMLDivElement>) {
    const menuWidth = 156;
    const menuHeight = 56;
    const edgePadding = 12;
    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const rect = range?.getBoundingClientRect();
    const hasSelectionRect = rect && (rect.width > 0 || rect.height > 0);
    const rawX = hasSelectionRect ? rect.left + rect.width / 2 - menuWidth / 2 : event.clientX;
    const rawY = hasSelectionRect ? rect.top - menuHeight - 8 : event.clientY + 10;
    const fallbackY = hasSelectionRect && rawY < edgePadding ? rect.bottom + 8 : rawY;

    return {
      x: clamp(Math.round(rawX), edgePadding, window.innerWidth - menuWidth - edgePadding),
      y: clamp(Math.round(fallbackY), edgePadding, window.innerHeight - menuHeight - edgePadding),
    };
  }

  function suppressNativeContextMenu(event: React.MouseEvent) {
    event.preventDefault();
  }

  function buildDraftFromSelection(showError: boolean): SelectionDraft | null {
    if (!reader || !articleRef.current) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    if (selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    if (!articleRef.current.contains(range.commonAncestorContainer)) return null;
    const renderedSelection = getRenderedSelectionAnchor(articleRef.current, selection);
    if (!renderedSelection) return null;
    const selectedText = renderedSelection.selectedText;
    if (selectedText.length < 2) return null;
    const sourceStartOffset = findSelectionOffset(reader.content, selectedText);
    if (sourceStartOffset < 0 && renderedSelection.startOffset < 0) {
      if (showError) {
        setError("没有在章节源码中稳定定位到这段文本，请尝试少选一点上下文。");
      }
      return null;
    }
    const startOffset = sourceStartOffset >= 0 ? sourceStartOffset : renderedSelection.startOffset;
    const endOffset =
      sourceStartOffset >= 0
        ? sourceStartOffset + selectedText.length
        : renderedSelection.endOffset;
    setError("");
    setActiveAnnotationId(null);
    setDetailAnnotationId(null);
    setAnnotationMenu(null);
    return {
      selectedText,
      startOffset,
      endOffset,
      renderedStartOffset: renderedSelection.startOffset,
      renderedEndOffset: renderedSelection.endOffset,
      renderedText: renderedSelection.fullText,
      highlightColor: annotationHighlightColors[0],
      comment: "",
    };
  }

  function openPendingDraft() {
    if (!pendingDraft) return;
    setDraftClosing(false);
    setDraft(pendingDraft);
    closeSelectionContextMenu();
  }

  async function saveDraft() {
    if (!reader || !draft) return;
    const context = getContextFromText(
      draft.renderedText,
      draft.renderedStartOffset,
      draft.renderedEndOffset,
      settings.annotationContextChars,
    );
    const payload: AnnotationPayload = {
      bookId: reader.chapter.bookId,
      chapterId: reader.chapter.id,
      chapterVersionId: reader.version.id,
      selectedText: draft.selectedText,
      startOffset: draft.startOffset,
      endOffset: draft.endOffset,
      renderedStartOffset: draft.renderedStartOffset,
      renderedEndOffset: draft.renderedEndOffset,
      contextBefore: context.before,
      contextAfter: context.after,
      headingPath: getHeadingPath(reader.content, draft.startOffset),
      highlightColor: draft.highlightColor,
      comment: draft.comment,
      tags: "",
    };

    try {
      const annotation = await createAnnotation(payload);
      setReader({
        ...reader,
        annotations: sortReaderAnnotations([...reader.annotations, annotation]),
      });
      setPendingDraft(null);
      closeDraftModal();
      closeSelectionContextMenu();
      void refreshNotes();
    } catch (err) {
      setError(readError(err));
    }
  }

  async function handleDeleteAnnotation(annotationId: string) {
    if (!reader) return;
    try {
      await deleteAnnotation(annotationId);
      setReader({
        ...reader,
        annotations: reader.annotations.filter((annotation) => annotation.id !== annotationId),
      });
      if (activeAnnotationId === annotationId) setActiveAnnotationId(null);
      if (detailAnnotationId === annotationId) setDetailAnnotationId(null);
      void refreshNotes();
    } catch (err) {
      setError(readError(err));
    }
  }

  async function handleUpdateAnnotation(
    annotation: Annotation,
    patch: Partial<Annotation>,
    options: { closeDetail?: boolean } = { closeDetail: true },
  ) {
    if (!reader) return false;
    try {
      const updated = await updateAnnotation(annotation.id, {
        highlightColor: patch.highlightColor,
        comment: patch.comment,
        tags: patch.tags,
        status: patch.status,
        isPinned: patch.isPinned,
      });
      setReader({
        ...reader,
        annotations: sortReaderAnnotations(
          reader.annotations.map((item) => (item.id === updated.id ? updated : item)),
        ),
      });
      if (options.closeDetail ?? true) closeReaderAnnotationDetail();
      void refreshNotes();
      return true;
    } catch (err) {
      setError(readError(err));
      return false;
    }
  }

  function handleAnnotationClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const image = target.closest<HTMLImageElement>("img[data-reader-image]");
    if (image && articleRef.current?.contains(image)) {
      event.preventDefault();
      event.stopPropagation();
      openImagePreview(image);
      return;
    }

    const mermaidDiagram = target.closest<HTMLElement>(".mermaid-diagram.is-rendered");
    if (mermaidDiagram && articleRef.current?.contains(mermaidDiagram)) {
      event.preventDefault();
      event.stopPropagation();
      openMermaidPreview(mermaidDiagram);
      return;
    }

    const mark = target.closest<HTMLElement>("[data-annotation-id]");
    if (mark) {
      const annotationId = mark.dataset.annotationId;
      if (annotationId) openReaderAnnotationDetail(annotationId);
    }
  }

  function handleReaderArticleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;

    const target = event.target as HTMLElement;
    const mermaidDiagram = target.closest<HTMLElement>(".mermaid-diagram.is-rendered");
    if (!mermaidDiagram || !articleRef.current?.contains(mermaidDiagram)) return;

    event.preventDefault();
    openMermaidPreview(mermaidDiagram);
  }

  function openImagePreview(image: HTMLImageElement) {
    closeSelectionContextMenu();
    closeAnnotationMenu();
    closeChapterMenu();
    setImagePreviewClosing(false);
    setImagePreview({
      src: image.currentSrc || image.src,
      alt: image.alt || "Markdown 图片",
      scale: 1,
      x: 0,
      y: 0,
      kind: "image",
    });
  }

  function openMermaidPreview(diagram: HTMLElement) {
    const svg = diagram.querySelector<SVGSVGElement>("svg");
    if (!svg) return;

    closeSelectionContextMenu();
    closeAnnotationMenu();
    closeChapterMenu();
    setImagePreviewClosing(false);
    setImagePreview({
      src: serializeSvgToDataUrl(svg),
      alt: svg.querySelector("title")?.textContent?.trim() || "Mermaid 图表",
      scale: 1,
      x: 0,
      y: 0,
      kind: "mermaid",
    });
  }

  function serializeSvgToDataUrl(svg: SVGSVGElement) {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    if (!clone.getAttribute("xmlns")) {
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  }

  function closeImagePreview() {
    if (!imagePreview || imagePreviewClosing) return;
    imagePreviewDragRef.current = null;
    imagePreviewDidDragRef.current = false;
    setImagePreviewDragging(false);
    animateClose(setImagePreviewClosing, () => setImagePreview(null));
  }

  function handleImagePreviewWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const direction = event.deltaY < 0 ? 1 : -1;
    setImagePreview((preview) => {
      if (!preview) return preview;
      return {
        ...preview,
        scale: clamp(preview.scale + direction * 0.16, 0.28, 5),
      };
    });
  }

  function handleImagePreviewPointerDown(event: ReactPointerEvent<HTMLImageElement>) {
    if (event.button !== 0 || !imagePreview) return;
    event.preventDefault();
    event.stopPropagation();
    imagePreviewDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: imagePreview.x,
      originY: imagePreview.y,
    };
    imagePreviewDidDragRef.current = false;
    setImagePreviewDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleImagePreviewPointerMove(event: ReactPointerEvent<HTMLImageElement>) {
    const drag = imagePreviewDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 3) {
      imagePreviewDidDragRef.current = true;
    }
    setImagePreview((preview) =>
      preview
        ? {
            ...preview,
            x: drag.originX + deltaX,
            y: drag.originY + deltaY,
          }
        : preview,
    );
  }

  function handleImagePreviewPointerEnd(event: ReactPointerEvent<HTMLImageElement>) {
    const drag = imagePreviewDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    imagePreviewDragRef.current = null;
    setImagePreviewDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleImagePreviewImageClick(event: ReactMouseEvent<HTMLImageElement>) {
    event.stopPropagation();
    if (imagePreviewDidDragRef.current) {
      imagePreviewDidDragRef.current = false;
      return;
    }
    closeImagePreview();
  }

  function handleAnnotationContextMenu(
    event: ReactMouseEvent<HTMLButtonElement>,
    annotation: Annotation,
  ) {
    event.preventDefault();
    event.stopPropagation();
    closeSelectionContextMenu();
    setAnnotationMenuClosing(false);
    setAnnotationMenu({
      annotation,
      x: Math.min(event.clientX, window.innerWidth - 188),
      y: Math.min(event.clientY, window.innerHeight - 92),
    });
  }

  async function toggleAnnotationPinned(annotation: Annotation) {
    const nextPinned = !annotation.isPinned;
    closeAnnotationMenu();
    const saved = await handleUpdateAnnotation(annotation, { isPinned: nextPinned }, { closeDetail: false });
    if (saved) setNotice(nextPinned ? "批注已置顶。" : "批注已取消置顶。");
  }

  function deleteAnnotationFromMenu(annotation: Annotation) {
    closeAnnotationMenu();
    void handleDeleteAnnotation(annotation.id);
  }

  function openSortModal() {
    setSortDraft(chapters);
    setSortDragChapterId(null);
    setSortClosing(false);
    setSortOpen(true);
  }

  function moveSortDraft(targetChapterId: string, movedChapterId?: string | null) {
    if (!movedChapterId || movedChapterId === targetChapterId) return;
    setSortDraft((current) => {
      const from = current.findIndex((chapter) => chapter.id === movedChapterId);
      const to = current.findIndex((chapter) => chapter.id === targetChapterId);
      if (from < 0 || to < 0) return current;

      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function saveSortDraft() {
    if (!activeBook) return;
    setBusy(true);
    setError("");
    try {
      const saved = await reorderChapters(
        activeBook.id,
        sortDraft.map((chapter) => chapter.id),
      );
      setChapters(saved);
      closeSortModal();
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  function syncReaderOutlineHeadings() {
    if (!reader || !articleRef.current) return [];
    const renderedHeadings = Array.from(
      articleRef.current.querySelectorAll<HTMLElement>(
        "h1[data-outline-id], h2[data-outline-id], h3[data-outline-id], h4[data-outline-id], h5[data-outline-id], h6[data-outline-id]",
      ),
    );
    if (renderedHeadings.length > 0) return renderedHeadings;

    const outlineHeadings: HTMLElement[] = [];
    const headings = articleRef.current.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6");
    headings.forEach((heading, index) => {
      const outlineItem = reader.outline[index];
      if (!outlineItem) {
        heading.removeAttribute("data-outline-id");
        return;
      }
      heading.dataset.outlineId = outlineItem.id;
      heading.id = `outline-${outlineItem.id}`;
      outlineHeadings.push(heading);
    });
    return outlineHeadings;
  }

  function scrollToHeading(outlineId: string) {
    const heading = syncReaderOutlineHeadings().find((item) => item.dataset.outlineId === outlineId);
    if (!heading) return;
    setActiveOutlineId(outlineId);
    playReaderMotion("jump");
    heading.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleExport() {
    if (!activeBook || !reader) return;
    const validAnnotations = reader.annotations.filter((annotation) => annotation.comment.trim());
    if (validAnnotations.length === 0) {
      setExportText("");
      resetAiRewriteDraft();
      setError("当前章节没有带评论的批注，无法生成 AI 重写修改包。");
      return;
    }
    setBusy(true);
    setError("");
    resetAiRewriteDraft();
    setRewritePhase("generating-markdown");
    try {
      const selectedPreset =
        exportPresets.find((preset) => preset.id === exportPresetId) ?? null;
      const markdown = await exportAnnotations(
        { chapterId: reader.chapter.id, chapterVersionId: reader.version.id },
        selectedPreset?.baseTemplateId ?? exportTemplate,
        selectedPreset ? undefined : exportTaskGoal,
        selectedPreset?.id,
        false,
      );
      setExportText(markdown);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
      setRewritePhase("idle");
    }
  }

  async function copyExport() {
    if (!exportText) return;
    try {
      await navigator.clipboard.writeText(exportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setNotice("当前环境无法直接写入剪贴板，可以手动复制导出内容。");
    }
  }

  async function handleAiRewrite() {
    if (!reader) return;
    if (!exportText.trim()) {
      setError("请先生成当前章节的 Markdown 修改包。");
      return;
    }
    if (!settings.aiBaseUrl.trim() || !settings.aiApiKey.trim() || !settings.aiModel.trim()) {
      setError("还没有配置 AI API，请先到主页设置的 AI配置中填写 Base URL、API Key 和模型名称。");
      return;
    }

    const sourceReader = reader;
    const runId = rewriteRequestRunRef.current + 1;
    rewriteRequestRunRef.current = runId;
    rewriteCancelRequestedRef.current = false;
    setBusy(true);
    setError("");
    setRewriteResultUnread(false);
    setRewriteDraftText("");
    setRewriteVisibleText("");
    setRewriteSegments([]);
    setSelectedRewriteSegmentIds([]);
    setRewriteApplyConfirmOpen(false);
    setRewritePhase("rewriting");
    startAiRewriteProgress();

    try {
      const result = await runAiRewrite({
        chapterId: sourceReader.chapter.id,
        chapterTitle: sourceReader.chapter.title,
        originalMarkdown: sourceReader.content,
        annotationMarkdown: exportText,
      });
      if (rewriteCancelRequestedRef.current || rewriteRequestRunRef.current !== runId) return;
      stopAiRewriteProgress();
      setRewriteProgress(92);
      setRewritePhase("revealing");
      setRewriteDraftText(result.content);
      await revealRewriteDraft(result.content);
      if (rewriteCancelRequestedRef.current || rewriteRequestRunRef.current !== runId) return;
      const segments = buildRewriteDiffSegments(sourceReader.content, result.content);
      setRewriteSegments(segments);
      setSelectedRewriteSegmentIds(segments.map((segment) => segment.id));
      setRewritePhase("ready");
      setRewriteProgress(100);
      setNotice("AI 重写已完成，草稿 Diff 已生成。");
      setRewriteResultUnread(!exportModalVisibleRef.current);
    } catch (err) {
      const message = readError(err);
      stopAiRewriteProgress();
      if (
        rewriteCancelRequestedRef.current ||
        rewriteRequestRunRef.current !== runId ||
        message.includes("AI 重写已停止")
      ) {
        return;
      }
      setRewritePhase("idle");
      setRewriteProgress(0);
      setError(message);
    } finally {
      if (rewriteCancelRequestedRef.current || rewriteRequestRunRef.current === runId) {
        setBusy(false);
      }
    }
  }

  async function stopAiRewrite(showNotice = true) {
    if (rewritePhase !== "rewriting" && rewritePhase !== "revealing") return;
    rewriteCancelRequestedRef.current = true;
    rewriteRequestRunRef.current += 1;
    rewriteRevealRunRef.current += 1;
    stopAiRewriteProgress();
    setBusy(false);
    setError("");
    setRewriteResultUnread(false);
    setRewritePhase("idle");
    setRewriteProgress(0);
    setRewriteVisibleText("");
    setRewriteDraftText("");
    setRewriteSegments([]);
    setSelectedRewriteSegmentIds([]);
    setRewriteApplyConfirmOpen(false);
    try {
      await cancelAiRewrite();
      if (showNotice) setNotice("已停止本次 AI 重写。");
    } catch (err) {
      if (showNotice) setError(readError(err));
    }
  }

  async function handleApplyAiRewrite() {
    if (!reader || !rewriteDraftText.trim()) return;
    const selectedSet = new Set(selectedRewriteSegmentIds);
    const finalContent = composeSelectedRewriteContent(reader.content, rewriteDraftText, rewriteSegments, selectedSet);
    setBusy(true);
    setError("");
    setRewritePhase("applying");
    try {
      const updated = await applyAiRewrite(reader.chapter.id, finalContent);
      setReader(updated);
      setChapters((current) =>
        current.map((chapter) => (chapter.id === updated.chapter.id ? updated.chapter : chapter)),
      );
      setActiveAnnotationId(null);
      setDetailAnnotationId(null);
      setRewriteApplyConfirmOpen(false);
      setNotice("已替换源文件，并创建新的章节版本快照。");
      closeExportModal();
    } catch (err) {
      setRewritePhase("ready");
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  function toggleRewriteSegment(segmentId: string, selected: boolean) {
    setSelectedRewriteSegmentIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(segmentId);
      } else {
        next.delete(segmentId);
      }
      return Array.from(next);
    });
    setRewriteApplyConfirmOpen(false);
  }

  function resetAiRewriteDraft() {
    stopAiRewriteProgress();
    rewriteRevealRunRef.current += 1;
    setRewritePhase("idle");
    setRewriteProgress(0);
    setRewriteVisibleText("");
    setRewriteDraftText("");
    setRewriteSegments([]);
    setSelectedRewriteSegmentIds([]);
    setRewriteApplyConfirmOpen(false);
    setRewriteResultUnread(false);
  }

  function startAiRewriteProgress() {
    stopAiRewriteProgress();
    setRewriteProgress(8);
    rewriteProgressTimerRef.current = window.setInterval(() => {
      setRewriteProgress((current) => (current >= 88 ? current : current + Math.max(0.8, (90 - current) * 0.08)));
    }, 180);
  }

  function stopAiRewriteProgress() {
    if (rewriteProgressTimerRef.current !== null) {
      window.clearInterval(rewriteProgressTimerRef.current);
      rewriteProgressTimerRef.current = null;
    }
  }

  async function revealRewriteDraft(content: string) {
    const runId = rewriteRevealRunRef.current + 1;
    rewriteRevealRunRef.current = runId;
    setRewriteVisibleText("");
    const lines = content.split("\n");
    const delayMs = Math.max(6, Math.min(22, Math.round(900 / Math.max(lines.length, 1))));
    for (let index = 0; index < lines.length; index += 1) {
      if (rewriteRevealRunRef.current !== runId) return;
      setRewriteVisibleText(lines.slice(0, index + 1).join("\n"));
      setRewriteProgress(92 + ((index + 1) / Math.max(lines.length, 1)) * 8);
      await delay(delayMs);
    }
  }

  function applySettings(patch: Partial<AppSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
    void updateSettings(patch)
      .then(setSettings)
      .catch((err) => setError(readError(err)));
  }

  async function openRepositoryLink() {
    try {
      await openProjectRepository();
    } catch (err) {
      setError(readError(err));
    }
  }

  function startReaderColumnResize(
    target: "left" | "right",
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = target === "left" ? leftPaneWidth : rightPaneWidth;
    const siblingWidth =
      target === "left"
        ? isRightCollapsed ? 0 : rightPaneWidth
        : isLeftCollapsed ? 0 : leftPaneWidth;
    const minWidth = target === "left" ? 248 : 260;
    const maxWidth = Math.min(
      target === "left" ? 520 : 560,
      window.innerWidth - siblingWidth - 480,
    );

    setResizeTarget(target);
    document.body.classList.add("pane-resize-active", "pane-resize-column");

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta =
        target === "left" ? moveEvent.clientX - startX : startX - moveEvent.clientX;
      const nextWidth = clamp(startWidth + delta, minWidth, maxWidth);
      if (target === "left") {
        setLeftPaneWidth(nextWidth);
      } else {
        setRightPaneWidth(nextWidth);
      }
    };

    const stopResize = () => {
      setResizeTarget(null);
      document.body.classList.remove("pane-resize-active", "pane-resize-column");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  function startChapterOutlineResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !readerLeftRef.current) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = chapterPaneHeight;
    const leftRect = readerLeftRef.current.getBoundingClientRect();
    const maxHeight = leftRect.height - 76 - 42 - 42 - 8 - 140;

    setResizeTarget("chapters");
    document.body.classList.add("pane-resize-active", "pane-resize-row");

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextHeight = clamp(startHeight + moveEvent.clientY - startY, 120, maxHeight);
      setChapterPaneHeight(nextHeight);
    };

    const stopResize = () => {
      setResizeTarget(null);
      document.body.classList.remove("pane-resize-active", "pane-resize-row");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  function startReaderSearchResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !readerRightRef.current) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = readerSearchPaneHeight;
    const rightRect = readerRightRef.current.getBoundingClientRect();
    const maxHeight = Math.max(180, rightRect.height - 42 - 150 - 8);

    setResizeTarget("readerSearch");
    document.body.classList.add("pane-resize-active", "pane-resize-row");

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextHeight = clamp(startHeight - (moveEvent.clientY - startY), 156, maxHeight);
      setReaderSearchPaneHeight(nextHeight);
    };

    const stopResize = () => {
      setResizeTarget(null);
      document.body.classList.remove("pane-resize-active", "pane-resize-row");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  async function saveExportPreset(
    presetId: string | null,
    payload: ExportPresetPayload,
  ): Promise<ExportPreset> {
    setBusy(true);
    setError("");
    try {
      const saved = presetId
        ? await updateExportPreset(presetId, payload)
        : await createExportPreset(payload);
      await refreshExportPresets();
      setNotice(presetId ? "导出预设已更新。" : "导出预设已创建。");
      return saved;
    } catch (err) {
      setError(readError(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function removeExportPreset(presetId: string) {
    setBusy(true);
    setError("");
    try {
      await deleteExportPreset(presetId);
      await refreshExportPresets();
      setNotice("导出预设已删除。");
    } catch (err) {
      setError(readError(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }

  function handleBookContextMenu(event: React.MouseEvent, book: BookSummary) {
    event.preventDefault();
    setBookMenuClosing(false);
    setBookMenu({
      book,
      x: Math.min(event.clientX, window.innerWidth - 190),
      y: Math.min(event.clientY, window.innerHeight - 160),
    });
  }

  async function saveBookRename() {
    if (!renameBookDraft) return;
    setBusy(true);
    setError("");
    try {
      await updateBookName(renameBookDraft.book.id, renameBookDraft.name);
      closeRenameBookModal();
      await refreshBooks();
      setNotice("书籍名称已更新。");
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function openBookInExplorer(book: BookSummary) {
    setBusy(true);
    setError("");
    closeBookMenu();
    try {
      await openBookFolder(book.id);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleBookPinned(book: BookSummary) {
    const nextPinned = !book.isPinned;
    setBusy(true);
    setError("");
    closeBookMenu();
    try {
      await updateBookPinned(book.id, nextPinned);
      await refreshBooks();
      setNotice(nextPinned ? `已置顶《${book.name}》。` : `已取消置顶《${book.name}》。`);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteBook() {
    if (!deleteBookDraft) return;
    const deletedBook = deleteBookDraft;
    setBusy(true);
    setError("");
    try {
      await deleteBook(deletedBook.id);
      closeDeleteBookModal();
      setSelectedBookIds((current) => current.filter((bookId) => bookId !== deletedBook.id));
      if (workbenchBookId === deletedBook.id) {
        setWorkbenchBookId("all");
        setWorkbenchChapterId("all");
        setSelectedNoteIds([]);
      }
      await Promise.all([refreshBooks(), refreshNotes()]);
      setNotice(`已删除《${deletedBook.name}》的本地索引。`);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmBatchDeleteBooks() {
    if (!batchDeleteBookDraft?.length) return;
    const deletedBooks = batchDeleteBookDraft;
    const deletedIds = new Set(deletedBooks.map((book) => book.id));
    setBusy(true);
    setError("");
    try {
      for (const book of deletedBooks) {
        await deleteBook(book.id);
      }
      closeBatchDeleteBooksModal();
      setSelectedBookIds([]);
      if (workbenchBookId !== "all" && deletedIds.has(workbenchBookId)) {
        setWorkbenchBookId("all");
        setWorkbenchChapterId("all");
        setSelectedNoteIds([]);
      }
      await Promise.all([refreshBooks(), refreshNotes()]);
      setNotice(`已删除 ${deletedBooks.length} 本书籍的本地索引。`);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function syncBook(book: BookSummary) {
    setBusy(true);
    setError("");
    closeBookMenu();
    try {
      const report = await syncBookFolder(book.id);
      setSyncReportClosing(false);
      setSyncReport(report);
      await refreshBooks();
      void refreshNotes();
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  function setHomeLibraryView(view: HomeLibraryView) {
    runViewTransition(() => setHomeView(view));
  }

  function toggleBookTableSort(key: BookTableSortKey) {
    setLibraryPage(0);
    setBookTableSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "name" ? "asc" : "desc" },
    );
  }

  function toggleBookSelection(bookId: string) {
    setSelectedBookIds((current) =>
      current.includes(bookId) ? current.filter((id) => id !== bookId) : [...current, bookId],
    );
  }

  function toggleAllTableBooks() {
    const tableBookIds = pagedTableBooks.map((book) => book.id);
    const allSelected =
      tableBookIds.length > 0 && tableBookIds.every((bookId) => selectedBookIds.includes(bookId));
    setSelectedBookIds((current) =>
      allSelected
        ? current.filter((bookId) => !tableBookIds.includes(bookId))
        : Array.from(new Set([...current, ...tableBookIds])),
    );
  }

  function openBatchDeleteBooksModal() {
    if (!selectedBooks.length) return;
    setBatchDeleteBookClosing(false);
    setBatchDeleteBookDraft(selectedBooks);
  }

  function startBookTableColumnResize(
    event: ReactPointerEvent<HTMLSpanElement>,
    column: BookTableResizableColumnKey,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = bookTableColumnWidths[column];
    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = clamp(
        startWidth + moveEvent.clientX - startX,
        bookTableColumnMinWidths[column],
        bookTableColumnMaxWidths[column],
      );
      setBookTableColumnWidths((current) => ({ ...current, [column]: nextWidth }));
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  function toggleNoteSelection(noteId: string) {
    setSelectedNoteIds((current) =>
      current.includes(noteId) ? current.filter((id) => id !== noteId) : [...current, noteId],
    );
  }

  function toggleAllFilteredNotes() {
    const pageNoteIds = pagedNotes.map((note) => note.id);
    const allSelected =
      pageNoteIds.length > 0 && pageNoteIds.every((noteId) => selectedNoteIds.includes(noteId));
    setSelectedNoteIds((current) =>
      allSelected
        ? current.filter((noteId) => !pageNoteIds.includes(noteId))
        : Array.from(new Set([...current, ...pageNoteIds])),
    );
  }

  async function updateSelectedNoteStatus(status: AnnotationStatus) {
    if (selectedNoteIds.length === 0) return;
    setBusy(true);
    setError("");
    try {
      await markAnnotationsStatus(selectedNoteIds, status);
      setSelectedNoteIds([]);
      await refreshNotes();
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function exportSelectedNotes() {
    if (selectedNoteIds.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const markdown = await exportAnnotations(
        { annotationIds: selectedNoteIds },
        "ai-pack",
        exportTaskGoal,
        undefined,
        true,
      );
      setBatchExportText(markdown);
      setBatchExportClosing(false);
      setBatchExportOpen(true);
      await markAnnotationsStatus(selectedNoteIds, "exported");
      await refreshNotes();
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyBatchExport() {
    if (!batchExportText) return;
    try {
      await navigator.clipboard.writeText(batchExportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setNotice("当前环境无法直接写入剪贴板，可以手动复制导出内容。");
    }
  }

  async function runBackupExport() {
    setBusy(true);
    setError("");
    try {
      const result = await exportBackup();
      setNotice(`备份已导出：${result.path}`);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function runBackupRestore() {
    setBusy(true);
    setError("");
    try {
      const result: BackupResult = await restoreBackup();
      await boot();
      setNotice(`备份已恢复：${result.path}`);
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function chooseAutoBackupDirectory() {
    setError("");
    try {
      const selected = await pickAutoBackupDirectory();
      if (selected) applySettings({ autoBackupDirectory: selected });
    } catch (err) {
      setError(readError(err));
    }
  }

  function openSearchModal() {
    const latestSettings = latestSettingsRef.current;
    searchThemeSnapshotRef.current = {
      themeSeries: latestSettings.themeSeries,
      theme: latestSettings.theme,
    };
    setSearchQuery("");
    setSearchClosing(false);
    setSearchOpen(true);
  }

  function closeSearchModal() {
    const snapshot = searchThemeSnapshotRef.current;
    if (snapshot) {
      setSettings((current) => ({ ...current, ...snapshot }));
      searchThemeSnapshotRef.current = null;
    }
    animateClose(setSearchClosing, () => {
      setSearchOpen(false);
      setSearchQuery("");
    });
  }

  function previewSearchTheme(themeSeries: string, theme?: string) {
    const previewTheme = theme ?? getDefaultThemeForSeries(themeSeries);
    if (!searchThemeSnapshotRef.current) {
      const latestSettings = latestSettingsRef.current;
      searchThemeSnapshotRef.current = {
        themeSeries: latestSettings.themeSeries,
        theme: latestSettings.theme,
      };
    }
    setSettings((current) => {
      if (current.themeSeries === themeSeries && current.theme === previewTheme) return current;
      return { ...current, themeSeries, theme: previewTheme };
    });
  }

  function commitSearchTheme(themeSeries: string, theme: string) {
    searchThemeSnapshotRef.current = null;
    applySettings({ themeSeries, theme });
  }

  function openHomeSettingsModal() {
    setHomeSettingsClosing(false);
    setHomeSettingsOpen(true);
  }

  function closeHomeSettingsModal() {
    animateClose(setHomeSettingsClosing, () => setHomeSettingsOpen(false));
  }

  function openReaderSettingsPanel() {
    setSettingsClosing(false);
    setSettingsOpen(true);
  }

  function closeReaderSettingsPanel() {
    animateClose(setSettingsClosing, () => setSettingsOpen(false));
  }

  function openExportModal() {
    const hasAiRewriteSession =
      rewritePhase === "rewriting" ||
      rewritePhase === "revealing" ||
      (rewritePhase === "ready" && Boolean(rewriteDraftText.trim()));
    exportModalVisibleRef.current = true;
    setExportClosing(false);
    setRewriteResultUnread(false);
    if (!hasAiRewriteSession) {
      setExportText("");
      resetAiRewriteDraft();
    }
    setExportOpen(true);
  }

  function closeExportModal() {
    exportModalVisibleRef.current = false;
    if (rewritePhase !== "rewriting" && rewritePhase !== "revealing") {
      resetAiRewriteDraft();
    }
    animateClose(setExportClosing, () => setExportOpen(false));
  }

  async function toggleReadingFullscreen() {
    const next = !isReadingFullscreen;
    setIsReadingFullscreen(next);
    setFullscreenReveal({ top: false, left: false, right: false });
    try {
      await getCurrentWindow().setFullscreen(next);
    } catch (err) {
      setIsReadingFullscreen(!next);
      setError(readError(err));
    }
  }

  function exitReadingFullscreen() {
    setIsReadingFullscreen(false);
    setFullscreenReveal({ top: false, left: false, right: false });
    void getCurrentWindow()
      .setFullscreen(false)
      .catch((err) => setError(readError(err)));
  }

  function handleReadingFullscreenPointerMove(event: ReactMouseEvent<HTMLDivElement>) {
    if (!isReadingFullscreen) return;

    const { clientX, clientY } = event;
    const viewportWidth = window.innerWidth;

    setFullscreenReveal((current) => {
      const next = {
        top: clientY <= fullscreenEdgePx || (current.top && clientY <= fullscreenTopKeepPx),
        left:
          clientX <= fullscreenEdgePx ||
          (current.left && clientX <= leftPaneWidth + fullscreenSideKeepPaddingPx),
        right:
          clientX >= viewportWidth - fullscreenEdgePx ||
          (current.right && clientX >= viewportWidth - rightPaneWidth - fullscreenSideKeepPaddingPx),
      };

      if (next.top === current.top && next.left === current.left && next.right === current.right) {
        return current;
      }

      return next;
    });
  }

  function hideReadingFullscreenChrome() {
    if (!isReadingFullscreen) return;
    setFullscreenReveal({ top: false, left: false, right: false });
  }

  function revealFullscreenChrome(edge: keyof FullscreenReveal) {
    setFullscreenReveal((current) => (current[edge] ? current : { ...current, [edge]: true }));
  }

  function closeWorkbenchNoteDetail() {
    animateClose(setNoteDetailClosing, () => setWorkbenchNoteDetail(null));
  }

  function openWorkbenchNoteDetail(note: NoteItem) {
    setNoteDetailClosing(false);
    setWorkbenchNoteDetail(note);
  }

  function closeImportModal() {
    if (!importPreview) return;
    animateClose(setImportModalClosing, () => {
      setImportPreview(null);
      setImportBookName("");
      setImportBookNameEdited(false);
      setSelectedImportFilePaths([]);
    });
  }

  function closeRenameBookModal() {
    if (!renameBookDraft) return;
    animateClose(setRenameBookClosing, () => setRenameBookDraft(null));
  }

  function closeDeleteBookModal() {
    if (!deleteBookDraft) return;
    animateClose(setDeleteBookClosing, () => setDeleteBookDraft(null));
  }

  function closeBatchDeleteBooksModal() {
    if (!batchDeleteBookDraft) return;
    animateClose(setBatchDeleteBookClosing, () => setBatchDeleteBookDraft(null));
  }

  function closeSyncReportModal() {
    if (!syncReport) return;
    animateClose(setSyncReportClosing, () => setSyncReport(null));
  }

  function closeVersionManagerModal() {
    if (!versionManagerBook) return;
    animateClose(setVersionManagerClosing, () => setVersionManagerBook(null));
  }

  function closeBatchExportModal() {
    if (!batchExportOpen) return;
    animateClose(setBatchExportClosing, () => setBatchExportOpen(false));
  }

  function closeSortModal() {
    if (!sortOpen) return;
    animateClose(setSortClosing, () => {
      setSortOpen(false);
      setSortDragChapterId(null);
    });
  }

  function closeDraftModal() {
    if (!draft) return;
    animateClose(setDraftClosing, () => {
      setDraft(null);
      window.getSelection()?.removeAllRanges();
    });
  }

  function closeTopNotice() {
    if (!notice && !error) return;
    animateClose(setTopNoticeClosing, () => {
      setError("");
      setNotice("");
    });
  }

  function closeBookMenu() {
    if (!bookMenu) return;
    animateClose(setBookMenuClosing, () => setBookMenu(null));
  }

  function openSelectionContextMenu(position: ContextMenuState) {
    selectionMenuCloseTokenRef.current += 1;
    setContextMenuClosing(false);
    setContextMenu(position);
  }

  function closeSelectionContextMenu(options: { clearPendingDraft?: boolean } = {}) {
    if (options.clearPendingDraft) setPendingDraft(null);
    if (!contextMenu) return;
    const closeToken = selectionMenuCloseTokenRef.current + 1;
    selectionMenuCloseTokenRef.current = closeToken;
    setContextMenuClosing(true);
    window.setTimeout(() => {
      if (selectionMenuCloseTokenRef.current !== closeToken) return;
      setContextMenu(null);
      setContextMenuClosing(false);
    }, uiExitMs);
  }

  function closeAnnotationMenu() {
    if (!annotationMenu) return;
    animateClose(setAnnotationMenuClosing, () => setAnnotationMenu(null));
  }

  function closeChapterMenu() {
    if (!chapterMenu) return;
    animateClose(setChapterMenuClosing, () => setChapterMenu(null));
  }

  function closeDeleteChapterModal() {
    if (!deleteChapterDraft) return;
    animateClose(setDeleteChapterClosing, () => setDeleteChapterDraft(null));
  }

  function closeReaderAnnotationDetail() {
    if (!detailAnnotationId) return;
    animateClose(setDetailAnnotationClosing, () => setDetailAnnotationId(null));
  }

  function closeTopModal() {
    if (imagePreview) {
      closeImagePreview();
      return true;
    }

    if (activeBook) {
      if (deleteChapterDraft) {
        closeDeleteChapterModal();
        return true;
      }
      if (detailAnnotationId) {
        closeReaderAnnotationDetail();
        return true;
      }
      if (draft) {
        closeDraftModal();
        return true;
      }
      if (annotationMenu) {
        closeAnnotationMenu();
        return true;
      }
      if (chapterMenu) {
        closeChapterMenu();
        return true;
      }
      if (contextMenu) {
        closeSelectionContextMenu();
        return true;
      }
      if (searchOpen) {
        closeSearchModal();
        return true;
      }
      if (settingsOpen) {
        closeReaderSettingsPanel();
        return true;
      }
      if (exportOpen) {
        closeExportModal();
        return true;
      }
      if (sortOpen) {
        closeSortModal();
        return true;
      }
      return false;
    }

    if (batchExportOpen) {
      closeBatchExportModal();
      return true;
    }
    if (bookTableUploadOpen) {
      setBookTableUploadOpen(false);
      return true;
    }
    if (importPreview) {
      closeImportModal();
      return true;
    }
    if (searchOpen) {
      closeSearchModal();
      return true;
    }
    if (workbenchNoteDetail) {
      closeWorkbenchNoteDetail();
      return true;
    }
    if (homeSettingsOpen) {
      closeHomeSettingsModal();
      return true;
    }
    if (versionManagerBook) {
      closeVersionManagerModal();
      return true;
    }
    if (syncReport) {
      closeSyncReportModal();
      return true;
    }
    if (batchDeleteBookDraft) {
      closeBatchDeleteBooksModal();
      return true;
    }
    if (deleteBookDraft) {
      closeDeleteBookModal();
      return true;
    }
    if (renameBookDraft) {
      closeRenameBookModal();
      return true;
    }
    if (bookMenu) {
      closeBookMenu();
      return true;
    }
    return false;
  }

  function runViewTransition(callback: () => void) {
    const startViewTransition = (document as ViewTransitionDocument).startViewTransition;
    if (typeof startViewTransition === "function") {
      startViewTransition.call(document, callback);
      return;
    }
    callback();
  }

  function animateClose(setClosing: (closing: boolean) => void, finish: () => void) {
    setClosing(true);
    window.setTimeout(() => {
      finish();
      setClosing(false);
    }, uiExitMs);
  }

  function playReaderMotion(kind: "content" | "jump") {
    if (readerMotionTimerRef.current !== null) {
      window.clearTimeout(readerMotionTimerRef.current);
    }
    setReaderMotion(null);
    window.requestAnimationFrame(() => {
      setReaderMotion(kind);
      readerMotionTimerRef.current = window.setTimeout(() => {
        setReaderMotion(null);
        readerMotionTimerRef.current = null;
      }, readerMotionMs);
    });
  }

  function focusReaderSearchInput() {
    setIsRightCollapsed(false);
    if (isReadingFullscreen) {
      setFullscreenReveal((current) => ({ ...current, right: true }));
    }
    window.setTimeout(() => {
      readerSearchInputRef.current?.focus();
      readerSearchInputRef.current?.select();
    }, 0);
  }

  function updateReaderSearchQuery(query: string) {
    setReaderSearchQuery(query);
    setActiveReaderSearchIndex(-1);
    setActiveSearchHighlight(null);
  }

  function selectReaderSearchMatch(index: number) {
    if (!readerSearchMatches[index]) return;
    playReaderMotion("jump");
    setActiveSearchHighlight(null);
    setActiveReaderSearchIndex(index);
  }

  function selectReaderAnnotation(annotationId: string) {
    playReaderMotion("jump");
    setActiveAnnotationId(annotationId);
  }

  function openReaderAnnotationDetail(annotationId: string) {
    selectReaderAnnotation(annotationId);
    setDetailAnnotationClosing(false);
    setDetailAnnotationId(annotationId);
  }

  function handleReaderSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      updateReaderSearchQuery("");
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      selectReaderSearchMatch(activeReaderSearchIndex >= 0 ? activeReaderSearchIndex : 0);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!readerSearchMatches.length) return;
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        activeReaderSearchIndex < 0
          ? direction > 0
            ? 0
            : readerSearchMatches.length - 1
          : (activeReaderSearchIndex + direction + readerSearchMatches.length) %
            readerSearchMatches.length;
      selectReaderSearchMatch(nextIndex);
    }
  }

  function selectAdjacentChapter(direction: 1 | -1) {
    if (!reader) return;
    const index = chapters.findIndex((chapter) => chapter.id === reader.chapter.id);
    const next = chapters[index + direction];
    if (next) void selectChapter(next.id);
  }

  function runShortcutAction(action: ShortcutAction) {
    if (action === "search") {
      openSearchModal();
      return;
    }
    if (action === "nextChapter") {
      selectAdjacentChapter(1);
      return;
    }
    if (action === "previousChapter") {
      selectAdjacentChapter(-1);
      return;
    }
    if (action === "highlight") {
      const nextDraft = pendingDraft ?? buildDraftFromSelection(true);
      if (nextDraft) {
        setPendingDraft(nextDraft);
        setDraftClosing(false);
        setDraft(nextDraft);
      }
      return;
    }
    if (action === "export") {
      if (reader) openExportModal();
      return;
    }
    if (action === "submit") {
      return;
    }
    if (action === "toggleLeft") {
      if (activeBook) setIsLeftCollapsed((value) => !value);
      return;
    }
    if (action === "toggleRight" && activeBook) {
      setIsRightCollapsed((value) => !value);
    }
  }

  const allTableBooksSelected =
    pagedTableBooks.length > 0 && pagedTableBooks.every((book) => selectedBookIds.includes(book.id));

  const renderBookTableHeaderCell = (
    column: BookTableResizableColumnKey,
    label: string,
    sortKey?: BookTableSortKey,
  ) => (
    <div className={`book-table-cell book-table-header-cell ${sortKey ? "sortable" : ""}`}>
      {sortKey ? (
        <button type="button" onClick={() => toggleBookTableSort(sortKey)}>
          <span>{label}</span>
          <span className="book-table-sort-indicator" aria-hidden="true">
            {bookTableSort.key === sortKey ? (bookTableSort.direction === "asc" ? "↑" : "↓") : "↕"}
          </span>
        </button>
      ) : (
        <span>{label}</span>
      )}
      <span
        className="book-table-resizer"
        role="separator"
        aria-label={`调整${label}列宽`}
        onPointerDown={(event) => startBookTableColumnResize(event, column)}
      />
    </div>
  );

  const renderHomePagination = (
    pagination: PaginationState,
    onPageChange: (pageIndex: number) => void,
    label: string,
  ) => {
    if (!pagination.visible) return null;
    const pageItems = getVisiblePaginationItems(pagination.pageIndex, pagination.pageCount);
    return (
      <nav className="home-pagination" aria-label={`${label}分页`}>
        <span className="home-pagination-summary">
          {pagination.startIndex + 1}-{pagination.endIndex} / {pagination.total}
        </span>
        <button
          type="button"
          className="home-pagination-nav"
          onClick={() => onPageChange(Math.max(0, pagination.pageIndex - 1))}
          disabled={pagination.pageIndex === 0}
          aria-label="上一页"
        >
          <ChevronLeft size={15} />
        </button>
        <div className="home-pagination-pages">
          {pageItems.map((item, index) =>
            item === "ellipsis" ? (
              <span key={`ellipsis-${index}`}>...</span>
            ) : (
              <button
                key={item}
                type="button"
                className={item === pagination.pageIndex ? "active" : ""}
                onClick={() => onPageChange(item)}
                aria-current={item === pagination.pageIndex ? "page" : undefined}
              >
                {item + 1}
              </button>
            ),
          )}
        </div>
        <button
          type="button"
          className="home-pagination-nav"
          onClick={() => onPageChange(Math.min(pagination.pageCount - 1, pagination.pageIndex + 1))}
          disabled={pagination.pageIndex >= pagination.pageCount - 1}
          aria-label="下一页"
        >
          <ChevronRight size={15} />
        </button>
      </nav>
    );
  };

  const effectiveThemeSeries = getEffectiveThemeSeries(settings.themeSeries);

  if (!activeBook) {
    return (
      <div
        className={`app-shell home-shell series-${effectiveThemeSeries} theme-${settings.theme}`}
        style={homeStyle}
        onContextMenu={suppressNativeContextMenu}
      >
        <style>{languageFontFaceCss}</style>
        <AppTitlebar title="AuroraMD" subtitle="首页" />
        <TopNotice error={error} notice={notice} closing={topNoticeClosing} onClose={closeTopNotice} />
        <header className="home-header">
          <div>
            <p className="eyebrow">Local Markdown Annotation Studio</p>
            <h1>AuroraMD</h1>
            <p className="home-subtitle">把 AI 生成的 Markdown 文档读完、批注好，再导出成下一轮 AI 可以直接消化的材料。</p>
          </div>
          <div className="header-actions">
            <button
              className={`icon-button ${homeView === "grid" ? "active" : ""}`}
              title="画廊视图"
              onClick={() => setHomeLibraryView("grid")}
            >
              <Grid3X3 size={18} />
            </button>
            <button
              className={`icon-button ${homeView === "table" ? "active" : ""}`}
              title="表格视图"
              onClick={() => setHomeLibraryView("table")}
            >
              <List size={18} />
            </button>
            <button
              className={`icon-button ${homeView === "notes" ? "active" : ""}`}
              title="笔记视图"
              onClick={() => {
                runViewTransition(() => setHomeView("notes"));
                void refreshNotes();
              }}
            >
              <MessageSquare size={18} />
            </button>
            <button className="icon-button" title="设置" onClick={openHomeSettingsModal}>
              <Settings size={18} />
            </button>
          </div>
        </header>

        {homeView === "notes" ? (
          <AnnotationWorkbench
            books={books}
            notes={pagedNotes}
            resultCount={filteredNotes.length}
            allNotesCount={notes.length}
            chapters={workbenchChapters}
            bookId={workbenchBookId}
            chapterId={workbenchChapterId}
            status={workbenchStatus}
            commentOnly={commentOnly}
            selectedIds={selectedNoteIds}
            selectedCount={selectedNotes.length}
            busy={busy}
            onBookChange={(bookId) => {
              setWorkbenchBookId(bookId);
              setWorkbenchChapterId("all");
              setNotesPage(0);
              setSelectedNoteIds([]);
            }}
            onChapterChange={(chapterId) => {
              setWorkbenchChapterId(chapterId);
              setNotesPage(0);
              setSelectedNoteIds([]);
            }}
            onStatusChange={(status) => {
              setWorkbenchStatus(status);
              setNotesPage(0);
              setSelectedNoteIds([]);
            }}
            onCommentOnlyChange={(enabled) => {
              setCommentOnly(enabled);
              setNotesPage(0);
              setSelectedNoteIds([]);
            }}
            onToggleNote={toggleNoteSelection}
            onToggleAll={toggleAllFilteredNotes}
            onOpenNote={openWorkbenchNoteDetail}
            onExportSelected={() => void exportSelectedNotes()}
            onMarkStatus={(status) => void updateSelectedNoteStatus(status)}
            pagination={renderHomePagination(notesPagination, setNotesPage, "批注")}
          />
        ) : homeView === "table" ? (
          <main
            ref={bookCollectionRef}
            className={`book-collection table ${importDragActive ? "is-import-drag-active" : ""}`}
          >
            <div className="book-table-toolbar">
              <div>
                <strong>书籍表格</strong>
                <small>
                  {books.length} 本书
                  {selectedBooks.length ? ` / 已选 ${selectedBooks.length} 本` : ""}
                </small>
              </div>
              <div className="book-table-actions">
                {selectedBooks.length > 0 && (
                  <button
                    type="button"
                    className="book-table-action danger"
                    onClick={openBatchDeleteBooksModal}
                    disabled={busy}
                  >
                    <Trash2 size={15} /> 删除选中
                  </button>
                )}
                <div className="book-table-upload" onPointerDown={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    className="book-table-action primary"
                    onClick={() => setBookTableUploadOpen((open) => !open)}
                    disabled={busy}
                  >
                    <FolderPlus size={15} /> 上传
                  </button>
                  {bookTableUploadOpen && (
                    <div className="book-table-upload-menu">
                      <button
                        type="button"
                        onClick={() => {
                          setBookTableUploadOpen(false);
                          void handleChooseMarkdownFiles();
                        }}
                      >
                        <FileText size={15} /> Markdown 文件
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBookTableUploadOpen(false);
                          void handleChooseFolder();
                        }}
                      >
                        <FolderPlus size={15} /> 文件夹
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className={`book-table-drop-zone ${importDragActive ? "drag-active" : ""}`}>
              <div className="book-table-scroll">
                <div
                  className="book-table"
                  style={{ "--book-table-grid": bookTableGridTemplate } as CSSProperties}
                >
                  <div className="book-table-row book-table-head">
                    <div className="book-table-cell book-table-check-cell">
                      <input
                        type="checkbox"
                        checked={allTableBooksSelected}
                        disabled={pagedTableBooks.length === 0}
                        aria-label="选择当前页书籍"
                        onChange={toggleAllTableBooks}
                      />
                    </div>
                    {homeTableColumns.rowNumber &&
                      renderBookTableHeaderCell("rowNumber", "行号")}
                    {renderBookTableHeaderCell("name", "标题", "name")}
                    {homeTableColumns.rootPath &&
                      renderBookTableHeaderCell("rootPath", "来源目录", "rootPath")}
                    {homeTableColumns.chapterCount &&
                      renderBookTableHeaderCell("chapterCount", "章节数量", "chapterCount")}
                    {homeTableColumns.annotationCount &&
                      renderBookTableHeaderCell("annotationCount", "批注数量", "annotationCount")}
                    {homeTableColumns.createdAt &&
                      renderBookTableHeaderCell("createdAt", "上传时间", "createdAt")}
                    {homeTableColumns.lastOpenedAt &&
                      renderBookTableHeaderCell("lastOpenedAt", "打开时间", "lastOpenedAt")}
                  </div>
                  {pagedTableBooks.map((book, index) => {
                    const selected = selectedBookIds.includes(book.id);
                    return (
                      <div
                        key={book.id}
                        className={`book-table-row book-table-body-row ${
                          selected ? "selected" : ""
                        } ${book.isPinned ? "is-pinned" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => void openBook(book)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            void openBook(book);
                          }
                        }}
                        onContextMenu={(event) => handleBookContextMenu(event, book)}
                      >
                        <div
                          className="book-table-cell book-table-check-cell"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            aria-label={`选择《${book.name}》`}
                            onChange={() => toggleBookSelection(book.id)}
                          />
                        </div>
                        {homeTableColumns.rowNumber && (
                          <div className="book-table-cell book-table-index-cell">
                            {tablePagination.startIndex + index + 1}
                          </div>
                        )}
                        <div className="book-table-cell book-table-title-cell">
                          <strong>{book.name}</strong>
                        </div>
                        {homeTableColumns.rootPath && (
                          <div className="book-table-cell book-table-path-cell">{book.rootPath}</div>
                        )}
                        {homeTableColumns.chapterCount && (
                          <div className="book-table-cell number">{book.chapterCount}</div>
                        )}
                        {homeTableColumns.annotationCount && (
                          <div className="book-table-cell number">{book.annotationCount}</div>
                        )}
                        {homeTableColumns.createdAt && (
                          <div className="book-table-cell date">{formatBookDate(book.createdAt)}</div>
                        )}
                        {homeTableColumns.lastOpenedAt && (
                          <div className="book-table-cell date">
                            {formatBookDate(book.lastOpenedAt)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {sortedBooks.length === 0 && (
                    <div className="book-table-empty">
                      <FolderPlus size={22} />
                      <strong>还没有书籍</strong>
                      <span>点击上传，或把 Markdown 文件/文件夹拖到这里。</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {renderHomePagination(tablePagination, setLibraryPage, "书籍表格")}
          </main>
        ) : (
          <main
            ref={bookCollectionRef}
            className={`book-collection ${homeView} ${importDragActive ? "is-import-drag-active" : ""}`}
          >
            {pagedGridBooks.map((book) => (
              <button
                key={book.id}
                className={`book-card book-entry ${book.isPinned ? "is-pinned" : ""}`}
                onClick={() => void openBook(book)}
                onContextMenu={(event) => handleBookContextMenu(event, book)}
              >
                <strong>{book.name}</strong>
                <span>{book.chapterCount} 章 · {book.annotationCount} 条批注</span>
                <small>{book.rootPath}</small>
              </button>
            ))}
            <button
              type="button"
              className={`book-card import-book-card ${importDragActive ? "drag-active" : ""}`}
              onClick={handleChooseFolder}
              disabled={busy}
            >
              <span className="import-card-icon">
                <FolderPlus size={23} />
              </span>
              <strong>{busy ? "正在导入" : "导入 Markdown 文件夹"}</strong>
              <span>拖入文件夹 / 点击选择</span>
              <small>作为画廊末尾的新书籍入口</small>
            </button>
            {renderHomePagination(gridPagination, setLibraryPage, "书籍画廊")}
          </main>
        )}

        {bookMenu && (
          <BookContextMenu
            menu={bookMenu}
            closing={bookMenuClosing}
            onTogglePinned={() => void toggleBookPinned(bookMenu.book)}
            onRename={() => {
              setRenameBookClosing(false);
              setRenameBookDraft({ book: bookMenu.book, name: bookMenu.book.name });
              closeBookMenu();
            }}
            onOpenFolder={() => void openBookInExplorer(bookMenu.book)}
            onSync={() => void syncBook(bookMenu.book)}
            onVersions={() => {
              setVersionManagerClosing(false);
              setVersionManagerBook(bookMenu.book);
              closeBookMenu();
            }}
            onDelete={() => {
              setDeleteBookClosing(false);
              setDeleteBookDraft(bookMenu.book);
              closeBookMenu();
            }}
          />
        )}
        {importPreview && (
          <ImportBookModal
            closing={importModalClosing}
            preview={importPreview}
            bookName={importBookName}
            selectedFilePaths={selectedImportFilePaths}
            busy={busy}
            submitShortcut={shortcutBindings.submit}
            onBookNameChange={updateImportBookName}
            onSelectionChange={updateImportFileSelection}
            onClose={closeImportModal}
            onImport={() => void confirmImportBook()}
          />
        )}
        {renameBookDraft && (
          <RenameBookModal
            closing={renameBookClosing}
            draft={renameBookDraft}
            busy={busy}
            submitShortcut={shortcutBindings.submit}
            onChange={(name) => setRenameBookDraft({ ...renameBookDraft, name })}
            onClose={closeRenameBookModal}
            onSave={() => void saveBookRename()}
          />
        )}
        {deleteBookDraft && (
          <DeleteBookModal
            closing={deleteBookClosing}
            book={deleteBookDraft}
            busy={busy}
            onClose={closeDeleteBookModal}
            onConfirm={() => void confirmDeleteBook()}
          />
        )}
        {batchDeleteBookDraft && (
          <DeleteBooksModal
            closing={batchDeleteBookClosing}
            books={batchDeleteBookDraft}
            busy={busy}
            onClose={closeBatchDeleteBooksModal}
            onConfirm={() => void confirmBatchDeleteBooks()}
          />
        )}
        {syncReport && (
          <SyncReportModal
            closing={syncReportClosing}
            report={syncReport}
            onClose={closeSyncReportModal}
          />
        )}
        {versionManagerBook && (
          <VersionManagerModal
            closing={versionManagerClosing}
            book={versionManagerBook}
            onClose={closeVersionManagerModal}
            onError={setError}
            onChanged={() => {
              void refreshBooks();
              void refreshNotes();
            }}
          />
        )}
        {homeSettingsOpen && (
          <HomeSettingsModal
            closing={homeSettingsClosing}
            settings={settings}
            systemFonts={systemFonts}
            defaultAutoBackupDirectory={defaultAutoBackupDirectory}
            exportPresets={exportPresets}
            busy={busy}
            onBackupExport={() => void runBackupExport()}
            onBackupRestore={() => void runBackupRestore()}
            onChooseAutoBackupDirectory={() => void chooseAutoBackupDirectory()}
            onChange={applySettings}
            onSaveExportPreset={saveExportPreset}
            onDeleteExportPreset={removeExportPreset}
            onOpenRepository={() => void openRepositoryLink()}
            onClose={closeHomeSettingsModal}
          />
        )}
        {workbenchNoteDetail && (
          <NoteDetailModal
            closing={noteDetailClosing}
            note={workbenchNoteDetail}
            onClose={closeWorkbenchNoteDetail}
            onJump={() => {
              const note = workbenchNoteDetail;
              closeWorkbenchNoteDetail();
              void openNote(note);
            }}
          />
        )}
        {searchOpen && (
          <SearchModal
            closing={searchClosing}
            query={searchQuery}
            books={books}
            notes={notes}
            settings={settings}
            onQueryChange={setSearchQuery}
            onClose={closeSearchModal}
            onPreviewTheme={previewSearchTheme}
            onCommitTheme={commitSearchTheme}
            onOpenBook={(book) => {
              closeSearchModal();
              void openBook(book);
            }}
            onOpenNote={(note) => {
              closeSearchModal();
              void openNote(note);
            }}
            onOpenContentResult={(result) => {
              closeSearchModal();
              void openContentSearchResult(result);
            }}
          />
        )}
        {batchExportOpen && (
          <BatchExportModal
            closing={batchExportClosing}
            text={batchExportText}
            copied={copied}
            onCopy={() => void copyBatchExport()}
            onClose={closeBatchExportModal}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={`app-shell reader-shell series-${effectiveThemeSeries} theme-${settings.theme} ${
        isLeftCollapsed ? "left-collapsed" : ""
      } ${isRightCollapsed ? "right-collapsed" : ""} ${
        resizeTarget ? "resizing-panes" : ""
      } ${isReadingFullscreen ? "reading-fullscreen" : ""} ${
        fullscreenReveal.top ? "fullscreen-top-open" : ""
      } ${fullscreenReveal.left ? "fullscreen-left-open" : ""} ${
        fullscreenReveal.right ? "fullscreen-right-open" : ""
      }`}
      style={readerStyle}
      onContextMenu={suppressNativeContextMenu}
      onMouseMove={handleReadingFullscreenPointerMove}
      onMouseLeave={hideReadingFullscreenChrome}
    >
      <style>{languageFontFaceCss}</style>
      <AppTitlebar title={activeBook.name} subtitle={reader?.chapter.title ?? "AuroraMD"} />
      <TopNotice error={error} notice={notice} closing={topNoticeClosing} onClose={closeTopNotice} />
      {imagePreview && (
        <div
          className={`modal-backdrop image-preview-backdrop ${
            imagePreviewClosing ? "is-closing" : ""
          }`}
          role="dialog"
          aria-modal="true"
          aria-label={imagePreview.alt}
          onClick={closeImagePreview}
          onWheel={handleImagePreviewWheel}
        >
          <div
            className={`image-preview-frame ${
              imagePreview.kind === "mermaid" ? "is-mermaid" : ""
            } ${imagePreviewDragging ? "is-dragging" : ""}`}
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={imagePreview.src}
              alt={imagePreview.alt}
              style={{
                transform: `translate3d(${imagePreview.x}px, ${imagePreview.y}px, 0) scale(${imagePreview.scale})`,
              }}
              onClick={handleImagePreviewImageClick}
              onPointerDown={handleImagePreviewPointerDown}
              onPointerMove={handleImagePreviewPointerMove}
              onPointerUp={handleImagePreviewPointerEnd}
              onPointerCancel={handleImagePreviewPointerEnd}
              draggable={false}
            />
            <span className="image-preview-zoom">
              {Math.round(imagePreview.scale * 100)}%
            </span>
          </div>
        </div>
      )}
      {isReadingFullscreen && (
        <>
          <div
            className="fullscreen-edge fullscreen-edge-top"
            aria-hidden="true"
            onMouseEnter={() => revealFullscreenChrome("top")}
          />
          <div
            className="fullscreen-edge fullscreen-edge-left"
            aria-hidden="true"
            onMouseEnter={() => revealFullscreenChrome("left")}
          />
          <div
            className="fullscreen-edge fullscreen-edge-right"
            aria-hidden="true"
            onMouseEnter={() => revealFullscreenChrome("right")}
          />
        </>
      )}
      <aside className="reader-left" ref={readerLeftRef}>
        <div className="reader-bookbar">
          <button className="icon-button" title="返回首页" onClick={() => {
            runViewTransition(() => {
              setActiveBook(null);
              setReader(null);
              setChapters([]);
              setChapterProgress({});
            });
            void refreshBooks();
            void refreshNotes();
          }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <strong>{activeBook.name}</strong>
            <span>{chapters.length} 章</span>
          </div>
        </div>

        <div className="pane-header chapter-heading">
          <span>章节</span>
          <button className="pane-action" onClick={openSortModal}>
            排序
          </button>
        </div>
        <div className="chapter-list">
          {chapters.map((chapter) => {
            const progress = chapterProgress[chapter.id];
            return (
              <button
                key={chapter.id}
                className={`chapter-row ${reader?.chapter.id === chapter.id ? "active" : ""}`}
                onClick={() => void selectChapter(chapter.id)}
                onContextMenu={(event) => handleChapterContextMenu(event, chapter)}
              >
                <ChapterProgressIcon progress={progress} />
                <span>{chapterFileName(chapter)}</span>
              </button>
            );
          })}
        </div>

        <div
          className="reader-section-resizer"
          role="separator"
          aria-label="调整章节和大纲高度"
          onPointerDown={startChapterOutlineResize}
        />

        <div className="pane-header outline-heading">
          <span>大纲</span>
        </div>
        <div className="outline-list" ref={outlineListRef}>
          {reader?.outline.length ? (
            reader.outline.map((item) => (
              <button
                key={item.id}
                className={item.id === activeOutlineId ? "active" : ""}
                data-outline-id={item.id}
                aria-current={item.id === activeOutlineId ? "location" : undefined}
                style={{ paddingLeft: `${8 + item.level * 10}px` }}
                onClick={() => scrollToHeading(item.id)}
              >
                {item.title}
              </button>
            ))
          ) : (
            <p className="muted">当前章节没有标题。</p>
          )}
        </div>
      </aside>

      <div
        className="reader-column-resizer left-resizer"
        role="separator"
        aria-label="调整左栏宽度"
        onPointerDown={(event) => startReaderColumnResize("left", event)}
      />

      <main className="reader-main">
        <header className="reader-toolbar">
          <button
            className={`icon-button reader-sidebar-toggle is-left ${!isLeftCollapsed ? "active" : ""}`}
            title={isLeftCollapsed ? "展开左栏" : "收起左栏"}
            aria-label={isLeftCollapsed ? "展开左栏" : "收起左栏"}
            aria-pressed={!isLeftCollapsed}
            onClick={() => setIsLeftCollapsed((value) => !value)}
          >
            {isLeftCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <div className="reader-toolbar-title">
            <p className="eyebrow">Chapter</p>
            <h2>{reader?.chapter.title}</h2>
          </div>
          <div className="toolbar-controls">
            <button
              className={`icon-button reader-ai-rewrite-button ${
                rewritePhase === "rewriting" || rewritePhase === "revealing" ? "is-rewriting" : ""
              } ${rewriteResultUnread ? "has-finished-draft" : ""}`}
              title={
                rewritePhase === "rewriting" || rewritePhase === "revealing"
                  ? "AI重写生成中"
                  : rewriteResultUnread
                    ? "查看 AI 重写草稿"
                    : "AI重写"
              }
              onClick={openExportModal}
            >
              <WandSparkles size={18} />
            </button>
            <button
              className={`icon-button ${isReadingFullscreen ? "active" : ""}`}
              title={isReadingFullscreen ? "退出全屏阅读 (Esc)" : "全屏阅读"}
              onClick={() => void toggleReadingFullscreen()}
            >
              {isReadingFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button className="icon-button" title="阅读器设置" onClick={openReaderSettingsPanel}>
              <Settings size={18} />
            </button>
          </div>
          <button
            className={`icon-button reader-sidebar-toggle is-right ${!isRightCollapsed ? "active" : ""}`}
            title={isRightCollapsed ? "展开右栏" : "收起右栏"}
            aria-label={isRightCollapsed ? "展开右栏" : "收起右栏"}
            aria-pressed={!isRightCollapsed}
            onClick={() => setIsRightCollapsed((value) => !value)}
          >
            {isRightCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
          </button>
        </header>

        <div
          className={`reading-surface border-${settings.borderStyle} ${
            readerMotion ? `reader-motion-${readerMotion}` : ""
          }`}
          ref={scrollRef}
        >
          {reader && (
            <div className="reading-stats" aria-live="polite">
              <span>本文共 {readerStats.wordCount.toLocaleString()} 字</span>
              <span>阅读需要 {readerStats.minutes} 分钟</span>
            </div>
          )}
          <article
            ref={articleRef}
            className={`markdown-body ${settings.focusMode ? "focus-mode" : ""}`}
            onMouseUp={handleTextSelection}
            onContextMenu={handleReaderContextMenu}
            onClick={handleAnnotationClick}
            onKeyDown={handleReaderArticleKeyDown}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
          {reader && (
            <nav className="chapter-bottom-nav" aria-label="章节导航">
              <button
                type="button"
                onClick={() => previousChapter && void selectChapter(previousChapter.id)}
                disabled={!previousChapter || busy}
              >
                <ChevronLeft size={17} />
                <span>上一篇</span>
              </button>
              <span className="chapter-bottom-index">
                {currentChapterIndex >= 0 ? currentChapterIndex + 1 : 0} / {chapters.length}
              </span>
              <button
                type="button"
                onClick={() => nextChapter && void selectChapter(nextChapter.id)}
                disabled={!nextChapter || busy}
              >
                <span>下一篇</span>
                <ChevronRight size={17} />
              </button>
            </nav>
          )}
        </div>
      </main>

      <div
        className="reader-column-resizer right-resizer"
        role="separator"
        aria-label="调整右栏宽度"
        onPointerDown={(event) => startReaderColumnResize("right", event)}
      />

      <aside className="reader-right" ref={readerRightRef}>
        <section className="reader-annotations-panel">
          <div className="pane-header">
            <span>批注</span>
            <small>{reader?.annotations.length ?? 0}</small>
          </div>

          <div className="annotation-list">
            {reader?.annotations.length ? (
              reader.annotations.map((annotation) => (
                <AnnotationCard
                  key={annotation.id}
                  annotation={annotation}
                  active={annotation.id === activeAnnotationId}
                  onSelect={() => selectReaderAnnotation(annotation.id)}
                  onOpen={() => openReaderAnnotationDetail(annotation.id)}
                  onContextMenu={(event) => handleAnnotationContextMenu(event, annotation)}
                />
              ))
            ) : (
              <div className="empty-panel">
                <MessageSquare size={28} />
                <p>选中正文后可以创建高亮和评论。</p>
              </div>
            )}
          </div>
        </section>

        <div
          className="reader-section-resizer reader-search-resizer"
          role="separator"
          aria-label="调整批注和搜索面板高度"
          onPointerDown={startReaderSearchResize}
        />

        <section className="reader-search-panel">
          <div className="pane-header reader-search-heading">
            <span>正文搜索</span>
            <small>{readerSearchQuery.trim() ? `${readerSearchMatches.length} 处` : "Ctrl+F"}</small>
          </div>
          <label className="reader-search-box">
            <Search size={15} />
            <input
              ref={readerSearchInputRef}
              value={readerSearchQuery}
              onChange={(event) => updateReaderSearchQuery(event.target.value)}
              onKeyDown={handleReaderSearchKeyDown}
              placeholder="搜索当前章节"
            />
          </label>
          <div className="reader-search-results">
            {!readerSearchQuery.trim() ? (
              <p className="reader-search-empty">输入关键词后会在正文中标出所有命中。</p>
            ) : readerSearchMatches.length ? (
              readerSearchMatches.map((match, index) => (
                <button
                  key={match.id}
                  className={`reader-search-result ${
                    index === activeReaderSearchIndex ? "active" : ""
                  }`}
                  onClick={() => selectReaderSearchMatch(index)}
                >
                  <span>{index + 1}</span>
                  <em>{match.excerpt}</em>
                </button>
              ))
            ) : (
              <p className="reader-search-empty">没有找到匹配内容。</p>
            )}
          </div>
        </section>
      </aside>

      {sortOpen && (
        <SortChaptersModal
          closing={sortClosing}
          chapters={sortDraft}
          activeChapterId={reader?.chapter.id}
          dragChapterId={sortDragChapterId}
          busy={busy}
          onDragStart={setSortDragChapterId}
          onMove={moveSortDraft}
          onClose={closeSortModal}
          onSave={() => void saveSortDraft()}
        />
      )}
      {exportOpen && (
        <ExportModal
          closing={exportClosing}
          template={exportTemplate}
          taskGoal={exportTaskGoal}
          presets={exportPresets}
          presetId={exportPresetId}
          exportText={exportText}
          rewritePhase={rewritePhase}
          rewriteProgress={rewriteProgress}
          rewriteVisibleText={rewriteVisibleText}
          rewriteSegments={rewriteSegments}
          selectedRewriteSegmentIds={selectedRewriteSegmentIds}
          applyConfirmOpen={rewriteApplyConfirmOpen}
          copied={copied}
          busy={busy}
          onTemplateChange={setExportTemplate}
          onTaskGoalChange={setExportTaskGoal}
          onPresetChange={setExportPresetId}
          onExport={() => void handleExport()}
          onAiRewrite={() => void handleAiRewrite()}
          onStopRewrite={() => void stopAiRewrite()}
          onCopy={() => void copyExport()}
          onToggleRewriteSegment={toggleRewriteSegment}
          onSelectAllRewriteSegments={() => {
            setSelectedRewriteSegmentIds(rewriteSegments.map((segment) => segment.id));
            setRewriteApplyConfirmOpen(false);
          }}
          onClearRewriteSegments={() => {
            setSelectedRewriteSegmentIds([]);
            setRewriteApplyConfirmOpen(false);
          }}
          onRequestApply={() => setRewriteApplyConfirmOpen(true)}
          onCancelApply={() => setRewriteApplyConfirmOpen(false)}
          onConfirmApply={() => void handleApplyAiRewrite()}
          onClose={closeExportModal}
        />
      )}
      {settingsOpen && (
        <SettingsPanel
          closing={settingsClosing}
          settings={settings}
          systemFonts={systemFonts}
          currentVersionId={reader?.version.id ?? null}
          currentChapterVersionId={reader?.chapter.currentVersionId ?? null}
          versions={reader?.versions ?? []}
          showChangeHighlights={showChangeHighlights}
          changeHighlightBusy={changeHighlightBusy}
          hasPreviousVersion={Boolean(previousReaderVersion)}
          onChange={applySettings}
          onVersionChange={(chapterVersionId) => void selectVersion(chapterVersionId)}
          onChangeHighlightToggle={setShowChangeHighlights}
          onClose={closeReaderSettingsPanel}
        />
      )}
      {searchOpen && (
        <SearchModal
          closing={searchClosing}
          query={searchQuery}
          books={books}
          notes={notes}
          settings={settings}
          onQueryChange={setSearchQuery}
          onClose={closeSearchModal}
          onPreviewTheme={previewSearchTheme}
          onCommitTheme={commitSearchTheme}
          onOpenBook={(book) => {
            closeSearchModal();
            void openBook(book);
          }}
          onOpenNote={(note) => {
            closeSearchModal();
            void openNote(note);
          }}
          onOpenContentResult={(result) => {
            closeSearchModal();
            void openContentSearchResult(result);
          }}
        />
      )}
      {contextMenu && pendingDraft && (
        <div
          className={`selection-menu ${contextMenuClosing ? "is-closing" : ""}`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button onClick={openPendingDraft}>
            <Highlighter size={16} />
            添加批注
          </button>
        </div>
      )}
      {annotationMenu && (
        <AnnotationContextMenu
          annotation={annotationMenu.annotation}
          x={annotationMenu.x}
          y={annotationMenu.y}
          closing={annotationMenuClosing}
          onTogglePinned={() => void toggleAnnotationPinned(annotationMenu.annotation)}
          onDelete={() => deleteAnnotationFromMenu(annotationMenu.annotation)}
        />
      )}
      {chapterMenu && (
        <ChapterContextMenu
          chapter={chapterMenu.chapter}
          x={chapterMenu.x}
          y={chapterMenu.y}
          closing={chapterMenuClosing}
          onMarkUnread={() => void markChapterUnreadFromMenu(chapterMenu.chapter)}
          onRefresh={() => void refreshChapterFromMenu(chapterMenu.chapter)}
          onOpenInExplorer={() => void openChapterSourceInExplorer(chapterMenu.chapter)}
          onDelete={() => requestDeleteReaderChapter(chapterMenu.chapter)}
        />
      )}
      {draft && (
        <NewAnnotationModal
          closing={draftClosing}
          draft={draft}
          highlightColors={annotationHighlightColors}
          submitShortcut={shortcutBindings.submit}
          onChange={setDraft}
          onCancel={closeDraftModal}
          onSave={() => void saveDraft()}
        />
      )}
      {detailAnnotation && (
        <AnnotationDetailModal
          closing={detailAnnotationClosing}
          annotation={detailAnnotation}
          highlightColors={annotationHighlightColors}
          submitShortcut={shortcutBindings.submit}
          onClose={closeReaderAnnotationDetail}
          onDelete={() => void handleDeleteAnnotation(detailAnnotation.id)}
          onSave={(patch) => void handleUpdateAnnotation(detailAnnotation, patch)}
        />
      )}
      {deleteChapterDraft && (
        <DeleteChapterModal
          closing={deleteChapterClosing}
          chapter={deleteChapterDraft}
          busy={busy}
          onClose={closeDeleteChapterModal}
          onConfirm={() => void confirmDeleteReaderChapter()}
        />
      )}
    </div>
  );
}

function readError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return translateErrorMessage(message);
}

function translateErrorMessage(message: string) {
  const exactMessages: Record<string, string> = {
    "Selected path is not a folder.": "选择的路径不是文件夹。",
    "No Markdown files were found in this folder.": "这个文件夹中没有找到 Markdown 文件。",
    "Book folder no longer exists.": "书籍文件夹不存在或已被移动。",
    "Book root folder is missing.": "书籍根文件夹不存在或已被移动。",
    "Book was not found.": "没有找到这本书。",
    "Book name cannot be empty.": "书籍名称不能为空。",
    "Chapter not found.": "没有找到章节。",
    "Chapter source file no longer exists.": "章节源文件不存在或已被移动。",
    "Current chapter version cannot be deleted. Switch to or create another current version first.":
      "当前章节版本不能删除，请先切换或创建另一个当前版本。",
    "Preset name cannot be empty.": "预设名称不能为空。",
    "Backup path cannot be the active database file.": "备份路径不能是当前正在使用的数据库文件。",
    "Auto backup path must be a folder.": "自动备份路径必须是文件夹。",
    "Database lock is poisoned.": "数据库锁状态异常，请重启应用后再试。",
    "Unknown annotation status.": "未知的批注状态。",
    "Unknown export template.": "未知的导出模板。",
  };
  if (exactMessages[message]) return exactMessages[message];

  const prefixes: Array<[string, string]> = [
    ["Failed to open folder picker:", "打开文件夹选择器失败："],
    ["Folder picker failed:", "文件夹选择器失败："],
    ["Failed to open backup save dialog:", "打开备份保存窗口失败："],
    ["Backup save dialog failed:", "备份保存窗口失败："],
    ["Failed to open backup file dialog:", "打开备份文件窗口失败："],
    ["Backup file dialog failed:", "备份文件窗口失败："],
    ["Failed to open auto backup folder picker:", "打开自动备份文件夹选择器失败："],
    ["Auto backup folder picker failed:", "自动备份文件夹选择器失败："],
    ["Failed to create auto backup folder:", "创建自动备份文件夹失败："],
    ["Failed to replace existing auto backup file:", "替换已有自动备份文件失败："],
    ["Failed to create auto backup:", "创建自动备份失败："],
    ["Failed to resolve folder path:", "解析文件夹路径失败："],
    ["Failed to read book folder:", "读取书籍文件夹失败："],
    ["Failed to read folder entry:", "读取文件夹条目失败："],
    ["Failed to resolve chapter path:", "解析章节路径失败："],
    ["Failed to open folder in Explorer:", "在资源管理器中打开文件夹失败："],
    ["Failed to open chapter in Explorer:", "在资源管理器中打开章节失败："],
    ["Failed to open chapter file:", "打开章节文件失败："],
    ["Failed to open chapter folder:", "打开章节文件夹失败："],
    ["Failed to open folder:", "打开文件夹失败："],
    ["Failed to update pinned state:", "更新置顶状态失败："],
    ["Failed to save chapter order:", "保存章节顺序失败："],
    ["Failed to start chapter deletion:", "启动章节删除失败："],
    ["Failed to delete chapter:", "删除章节失败："],
    ["Failed to save chapter deletion:", "保存章节删除失败："],
    ["Failed to update annotation:", "更新批注失败："],
    ["Failed to update annotation status:", "更新批注状态失败："],
    ["Failed to save annotation status:", "保存批注状态失败："],
    ["Failed to update export preset:", "更新导出预设失败："],
    ["Failed to export backup:", "导出备份失败："],
    ["Failed to open backup database:", "打开备份数据库失败："],
    ["Failed to restore backup:", "恢复备份失败："],
    ["Failed to restore reading progress ratios:", "恢复阅读进度百分比失败："],
    ["Failed to restore annotation anchors:", "恢复批注锚点失败："],
    ["Failed to restore focus mode setting:", "恢复聚焦模式设置失败："],
    ["Failed to restore slide annotation setting:", "恢复划动批注设置失败："],
    ["Failed to restore theme series setting:", "恢复主题系列设置失败："],
    ["Failed to restore pinned books:", "恢复置顶书籍失败："],
    ["Failed to restore pinned annotations:", "恢复置顶批注失败："],
    ["Failed to restore export presets:", "恢复导出预设失败："],
    ["Failed to restore auto backup settings:", "恢复自动备份设置失败："],
    ["Failed to update settings:", "更新设置失败："],
    ["Failed to save reading progress:", "保存阅读进度失败："],
    ["Failed to clear chapter reading progress:", "清除章节阅读进度失败："],
    ["Failed to start import transaction:", "启动导入事务失败："],
    ["Failed to create book:", "创建书籍失败："],
    ["Failed to create chapter:", "创建章节失败："],
    ["Failed to create chapter version:", "创建章节版本失败："],
    ["Failed to finish import:", "完成导入失败："],
    ["Failed to rename book:", "重命名书籍失败："],
    ["Failed to read ", "读取文件失败："],
    ["Failed to update renamed chapter:", "更新改名章节失败："],
    ["Failed to add new chapter:", "添加新章节失败："],
    ["Failed to add new chapter version:", "添加新章节版本失败："],
    ["Failed to start version transaction:", "启动版本事务失败："],
    ["Failed to update current chapter version:", "更新当前章节版本失败："],
    ["Failed to save new chapter version:", "保存新章节版本失败："],
    ["Book not found:", "没有找到书籍："],
    ["Chapter not found:", "没有找到章节："],
    ["Chapter version not found:", "没有找到章节版本："],
    ["Chapter snapshot not found:", "没有找到章节快照："],
    ["Export preset not found:", "没有找到导出预设："],
    ["Annotation not found:", "没有找到批注："],
    ["Database error:", "数据库错误："],
  ];
  for (const [prefix, translatedPrefix] of prefixes) {
    if (message.startsWith(prefix)) {
      return `${translatedPrefix}${message.slice(prefix.length).trimStart()}`;
    }
  }
  return message;
}

function clamp(value: number, min: number, max: number) {
  const upper = Math.max(min, max);
  return Math.min(Math.max(value, min), upper);
}

function buildChapterProgressMap(progressItems: ReadingProgress[]) {
  return progressItems.reduce<Record<string, ReadingProgress>>((map, item) => {
    if (!map[item.chapterId]) {
      map[item.chapterId] = item;
    }
    return map;
  }, {});
}

function getScrollProgressRatio(element: HTMLElement) {
  const maxScroll = element.scrollHeight - element.clientHeight;
  if (maxScroll <= 1) return 1;
  const remainingScroll = maxScroll - element.scrollTop;
  const ratio = clamp(element.scrollTop / maxScroll, 0, 1);
  return remainingScroll <= readingProgressCompleteRemainingPx ||
    ratio >= readingProgressCompleteThreshold
    ? 1
    : ratio;
}

function isChapterProgressComplete(progress?: ReadingProgress) {
  return Boolean(
    progress && clamp(progress.progressRatio, 0, 1) >= readingProgressCompleteThreshold,
  );
}

function ChapterProgressIcon({ progress }: { progress?: ReadingProgress }) {
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

function isHomeImportDragBlocked() {
  return Boolean(document.querySelector(".modal-backdrop, .settings-backdrop"));
}

function getInitialWindowPlacement(monitor: WindowPlacementMonitor | null): WindowPlacementBounds | null {
  if (!monitor) return null;
  const area = monitor.workArea;
  const usableWidth = Math.max(1, area.size.width);
  const usableHeight = Math.max(1, area.size.height);
  const maxWidth = Math.max(minimumRestoredWindowSize, usableWidth - initialWindowEdgePaddingPx * 2);
  const maxHeight = Math.max(minimumRestoredWindowSize, usableHeight - initialWindowEdgePaddingPx * 2);
  const minWidth = Math.min(initialWindowMinWidth, maxWidth);
  const minHeight = Math.min(initialWindowMinHeight, maxHeight);
  const width = Math.round(clamp(usableWidth * initialWindowWidthRatio, minWidth, maxWidth));
  const height = Math.round(clamp(usableHeight * initialWindowHeightRatio, minHeight, maxHeight));
  return {
    x: Math.round(area.position.x + (usableWidth - width) / 2),
    y: Math.round(area.position.y + (usableHeight - height) / 2),
    width,
    height,
  };
}

function readSavedWindowPlacement() {
  try {
    const storageKey = [windowPlacementStorageKey, ...legacyWindowPlacementStorageKeys].find((key) =>
      localStorage.getItem(key),
    );
    if (!storageKey) return null;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedWindowPlacement>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number" ||
      parsed.width < minimumRestoredWindowSize ||
      parsed.height < minimumRestoredWindowSize
    ) {
      return null;
    }
    return {
      x: Math.round(parsed.x),
      y: Math.round(parsed.y),
      width: Math.round(parsed.width),
      height: Math.round(parsed.height),
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function writeSavedWindowPlacement(placement: SavedWindowPlacement) {
  localStorage.setItem(windowPlacementStorageKey, JSON.stringify(placement));
  legacyWindowPlacementStorageKeys.forEach((key) => localStorage.removeItem(key));
}

function isWindowPlacementVisible(
  placement: SavedWindowPlacement,
  monitors: WindowPlacementMonitor[],
) {
  return monitors.some((monitor) => {
    const area = monitor.workArea;
    const left = area.position.x;
    const top = area.position.y;
    const right = left + area.size.width;
    const bottom = top + area.size.height;
    return (
      placement.x + minimumRestoredWindowSize > left &&
      placement.x < right - minimumRestoredWindowSize &&
      placement.y + minimumRestoredWindowSize > top &&
      placement.y < bottom - minimumRestoredWindowSize
    );
  });
}

function sortReaderAnnotations(annotations: Annotation[]) {
  return [...annotations].sort((left, right) => {
    if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
    if (left.startOffset !== right.startOffset) return left.startOffset - right.startOffset;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

function getReadingStats(content: string) {
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

function buildChangeHighlights(
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

function buildReaderSearchMatches(rootText: string, query: string) {
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

function composeLanguageFontStack(
  latinAlias: string,
  cjkAlias: string,
  fallback: "sans-serif" | "serif",
) {
  return `${quoteCssString(latinAlias)}, ${quoteCssString(cjkAlias)}, ${fallback}`;
}

function createLanguageFontFace(alias: string, fontFamilyStack: string, script: "latin" | "cjk") {
  const localSources = splitFontStack(fontFamilyStack)
    .filter((family) => !isGenericFontFamily(family))
    .map((family) => `local(${quoteCssString(stripFontQuotes(family))})`);

  if (!localSources.length) return "";

  const unicodeRange =
    script === "latin"
      ? "U+0000-024F, U+1E00-1EFF, U+2000-206F, U+2070-209F, U+20A0-20CF, U+2100-214F, U+2150-218F"
      : "U+2E80-2EFF, U+2F00-2FDF, U+3000-303F, U+3040-30FF, U+3100-312F, U+31A0-31BF, U+31F0-31FF, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FF00-FFEF, U+20000-2FA1F";

  return [
    "@font-face {",
    `  font-family: ${quoteCssString(alias)};`,
    `  src: ${localSources.join(", ")};`,
    `  unicode-range: ${unicodeRange};`,
    "  font-display: swap;",
    "}",
  ].join("\n");
}

function splitFontStack(value: string) {
  const families: string[] = [];
  let current = "";
  let quote: string | null = null;
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      current += character;
      escaped = true;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'") {
      current += character;
      quote = character;
      continue;
    }
    if (character === ",") {
      if (current.trim()) families.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }

  if (current.trim()) families.push(current.trim());
  return families;
}

function isGenericFontFamily(family: string) {
  return ["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"].includes(
    stripFontQuotes(family).toLowerCase(),
  );
}

function stripFontQuotes(value: string) {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).replace(/\\(["'\\])/g, "$1");
    }
  }
  return trimmed;
}

function quoteCssString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\A ")}"`;
}
