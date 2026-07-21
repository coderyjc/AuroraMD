import { Archive, Check, Download, Filter, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import type { AnnotationStatus, BookSummary, Chapter, NoteItem } from "../../types";
import { annotationStatusLabel } from "../../utils/annotations";
import { chapterFileName } from "../../utils/chapters";

export type NoteFilterStatus = "all" | AnnotationStatus;

interface AnnotationWorkbenchProps {
  books: BookSummary[];
  notes: NoteItem[];
  resultCount: number;
  allNotesCount: number;
  chapters: Chapter[];
  bookId: string;
  chapterId: string;
  status: NoteFilterStatus;
  commentOnly: boolean;
  selectedIds: string[];
  selectedCount: number;
  busy: boolean;
  onBookChange: (bookId: string) => void;
  onChapterChange: (chapterId: string) => void;
  onStatusChange: (status: NoteFilterStatus) => void;
  onCommentOnlyChange: (enabled: boolean) => void;
  onToggleNote: (noteId: string) => void;
  onToggleAll: () => void;
  onOpenNote: (note: NoteItem) => void;
  onExportSelected: () => void;
  onMarkStatus: (status: AnnotationStatus) => void;
  pagination?: ReactNode;
}

export function AnnotationWorkbench({
  books,
  notes,
  resultCount,
  allNotesCount,
  chapters,
  bookId,
  chapterId,
  status,
  commentOnly,
  selectedIds,
  selectedCount,
  busy,
  onBookChange,
  onChapterChange,
  onStatusChange,
  onCommentOnlyChange,
  onToggleNote,
  onToggleAll,
  onOpenNote,
  onExportSelected,
  onMarkStatus,
  pagination,
}: AnnotationWorkbenchProps) {
  const allSelected = notes.length > 0 && notes.every((note) => selectedIds.includes(note.id));

  return (
    <main className="notes-board workbench">
      <div className="notes-board-header">
        <div>
          <p className="eyebrow">Annotation Desk</p>
          <h2>批注工作台</h2>
        </div>
        <span>
          {resultCount} / {allNotesCount} 条
        </span>
      </div>

      <section className="workbench-filters">
        <label>
          书籍
          <select value={bookId} onChange={(event) => onBookChange(event.target.value)}>
            <option value="all">全部书籍</option>
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          章节
          <select
            value={chapterId}
            onChange={(event) => onChapterChange(event.target.value)}
            disabled={bookId === "all"}
          >
            <option value="all">全部章节</option>
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapterFileName(chapter)}
              </option>
            ))}
          </select>
        </label>
        <label>
          状态
          <select value={status} onChange={(event) => onStatusChange(event.target.value as NoteFilterStatus)}>
            <option value="all">全部状态</option>
            <option value="pending">未处理</option>
            <option value="processed">已处理</option>
            <option value="exported">已导出</option>
            <option value="ignored">搁置</option>
          </select>
        </label>
        <label className="check-filter">
          <input
            type="checkbox"
            checked={commentOnly}
            onChange={(event) => onCommentOnlyChange(event.target.checked)}
          />
          只看有评论
        </label>
      </section>

      <section className="workbench-actions">
        <button onClick={onToggleAll} disabled={notes.length === 0}>
          {allSelected ? <Check size={16} /> : <Filter size={16} />}
          {allSelected ? "取消当前页" : "选择当前页"}
        </button>
        <button onClick={onExportSelected} disabled={busy || selectedCount === 0}>
          <Download size={16} />
          批量导出
        </button>
        <button onClick={() => onMarkStatus("processed")} disabled={busy || selectedCount === 0}>
          <Check size={16} />
          标记已处理
        </button>
        <button onClick={() => onMarkStatus("pending")} disabled={busy || selectedCount === 0}>
          <Archive size={16} />
          标记未处理
        </button>
      </section>

      {notes.length === 0 ? (
        <div className="empty-state">
          <MessageSquare size={42} />
          <h2>没有匹配的批注</h2>
          <p>调整筛选条件，或在阅读器中添加新的高亮和评论。</p>
        </div>
      ) : (
        <div className="note-grid workbench-grid">
          {notes.map((note) => (
            <article
              key={note.id}
              className={`note-card selectable ${selectedIds.includes(note.id) ? "selected" : ""}`}
            >
              <button className="note-select" onClick={() => onToggleNote(note.id)} title="选择批注">
                {selectedIds.includes(note.id) ? <Check size={14} /> : null}
              </button>
              <button className="note-open" onClick={() => onOpenNote(note)}>
                <span className="note-color" style={{ background: note.highlightColor }} />
                <strong>{note.comment.trim() || "无评论批注"}</strong>
                <small>
                  {note.bookName} / {note.chapterTitle} · {annotationStatusLabel(note.status)}
                </small>
                <p>{note.selectedText}</p>
              </button>
            </article>
          ))}
        </div>
      )}
      {pagination}
    </main>
  );
}
