import {
  AlertTriangle,
  Check,
  Copy,
  FileText,
  FolderOpen,
  GitCompare,
  GripVertical,
  Pin,
  PinOff,
  RefreshCw,
  Replace,
  RotateCcw,
  Save,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react";

import { FontPicker } from "../FontPicker";
import { highlightColors } from "../../constants";
import type {
  Annotation,
  AppSettings,
  Chapter,
  ChapterVersion,
  ExportPreset,
  ExportTaskGoal,
  ExportTemplate,
  SystemFont,
} from "../../types";
import { chapterFileName } from "../../utils/chapters";
import type { DiffBlockType } from "../../utils/diff";

export interface SelectionDraft {
  selectedText: string;
  startOffset: number;
  endOffset: number;
  renderedStartOffset: number;
  renderedEndOffset: number;
  renderedText: string;
  highlightColor: string;
  comment: string;
}

export function AnnotationCard({
  annotation,
  active,
  onSelect,
  onOpen,
  onContextMenu,
}: {
  annotation: Annotation;
  active: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onContextMenu: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const comment = annotation.comment.trim();
  const summary = comment || annotation.selectedText.replace(/\s+/g, " ").trim();

  return (
    <button
      className={`annotation-card compact ${active ? "active" : ""} ${
        annotation.isPinned ? "is-pinned" : ""
      }`}
      onClick={onSelect}
      onDoubleClick={(event) => {
        event.preventDefault();
        onOpen();
      }}
      onContextMenu={onContextMenu}
      title="单击跳转，双击查看详情"
    >
      <span className="annotation-dot" style={{ background: annotation.highlightColor }} />
      <span className={`annotation-summary ${comment ? "" : "source-preview"}`}>{summary}</span>
      {annotation.isPinned && <Pin className="annotation-pin-icon" size={13} aria-hidden="true" />}
    </button>
  );
}

export type AiRewritePhase = "idle" | "generating-markdown" | "rewriting" | "revealing" | "ready" | "applying";

export interface RewriteDiffSegment {
  id: string;
  type: DiffBlockType;
  oldStart: number;
  newStart: number;
  oldLines: string[];
  newLines: string[];
}

export function AnnotationContextMenu({
  annotation,
  x,
  y,
  closing,
  onTogglePinned,
  onDelete,
}: {
  annotation: Annotation;
  x: number;
  y: number;
  closing: boolean;
  onTogglePinned: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`context-menu annotation-context-menu ${closing ? "is-closing" : ""}`}
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
    >
      <button onClick={onTogglePinned}>
        {annotation.isPinned ? <PinOff size={15} /> : <Pin size={15} />}
        {annotation.isPinned ? "取消置顶" : "置顶"}
      </button>
      <button className="danger" onClick={onDelete}>
        <Trash2 size={15} /> 删除
      </button>
    </div>
  );
}

export function ChapterContextMenu({
  chapter,
  x,
  y,
  closing,
  onMarkUnread,
  onRefresh,
  onOpenInExplorer,
  onDelete,
}: {
  chapter: Chapter;
  x: number;
  y: number;
  closing: boolean;
  onMarkUnread: () => void;
  onRefresh: () => void;
  onOpenInExplorer: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`context-menu chapter-context-menu ${closing ? "is-closing" : ""}`}
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
      aria-label={`${chapterFileName(chapter)} 操作`}
    >
      <button onClick={onMarkUnread}>
        <RotateCcw size={15} /> 标为未读
      </button>
      <button onClick={onRefresh}>
        <RefreshCw size={15} /> 更新
      </button>
      <button onClick={onOpenInExplorer}>
        <FolderOpen size={15} /> 在资源管理器打开
      </button>
      <button className="danger" onClick={onDelete}>
        <Trash2 size={15} /> 删除
      </button>
    </div>
  );
}

export function DeleteChapterModal({
  closing,
  chapter,
  busy,
  onClose,
  onConfirm,
}: {
  closing: boolean;
  chapter: Chapter;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="annotation-modal compact-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Chapter</p>
            <h2>删除章节</h2>
          </div>
          <button className="icon-button" title="关闭" onClick={onClose} disabled={busy}>
            <X size={18} />
          </button>
        </header>
        <div className="delete-book-warning">
          <AlertTriangle size={20} />
          <div>
            <strong>删除章节“{chapterFileName(chapter)}”？</strong>
            <p>会同步删除这个章节的所有版本、批注和阅读进度；不会删除磁盘上的 Markdown 源文件。</p>
          </div>
        </div>
        <div className="modal-actions">
          <button onClick={onClose} disabled={busy}>取消</button>
          <button className="danger" onClick={onConfirm} disabled={busy}>
            <Trash2 size={16} /> 确认删除
          </button>
        </div>
      </section>
    </div>
  );
}

export function SortChaptersModal({
  closing,
  chapters,
  activeChapterId,
  dragChapterId,
  busy,
  onDragStart,
  onMove,
  onClose,
  onSave,
}: {
  closing: boolean;
  chapters: Chapter[];
  activeChapterId?: string;
  dragChapterId: string | null;
  busy: boolean;
  onDragStart: (chapterId: string | null) => void;
  onMove: (targetChapterId: string, movedChapterId?: string | null) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const dragIdRef = useRef<string | null>(null);

  useEffect(() => {
    dragIdRef.current = dragChapterId;
  }, [dragChapterId]);

  useEffect(() => {
    if (!dragChapterId) return;

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const row = element?.closest<HTMLElement>("[data-sort-chapter-id]");
      const targetChapterId = row?.dataset.sortChapterId;
      if (targetChapterId) {
        onMove(targetChapterId, dragIdRef.current);
      }
    };

    const handlePointerEnd = () => {
      dragIdRef.current = null;
      onDragStart(null);
    };

    document.body.classList.add("sorting-drag-active");
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      document.body.classList.remove("sorting-drag-active");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [dragChapterId, onDragStart, onMove]);

  return (
    <div
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="annotation-modal sort-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Chapter Order</p>
            <h2>调整章节顺序</h2>
          </div>
          <button className="icon-button" title="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="sort-list">
          {chapters.map((chapter, index) => (
            <div
              key={chapter.id}
              data-sort-chapter-id={chapter.id}
              className={`sort-row ${chapter.id === activeChapterId ? "active" : ""} ${
                chapter.id === dragChapterId ? "dragging" : ""
              }`}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                dragIdRef.current = chapter.id;
                onDragStart(chapter.id);
              }}
            >
              <span className="sort-index">{String(index + 1).padStart(2, "0")}</span>
              <GripVertical size={16} />
              <strong>{chapterFileName(chapter)}</strong>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary-button" onClick={onSave} disabled={busy || chapters.length === 0}>
            <Save size={17} />
            保存顺序
          </button>
        </div>
      </section>
    </div>
  );
}

export function ExportModal({
  closing,
  template,
  taskGoal,
  presets,
  presetId,
  exportText,
  rewritePhase,
  rewriteProgress,
  rewriteVisibleText,
  rewriteSegments,
  selectedRewriteSegmentIds,
  applyConfirmOpen,
  copied,
  busy,
  onTemplateChange,
  onTaskGoalChange,
  onPresetChange,
  onExport,
  onAiRewrite,
  onStopRewrite,
  onCopy,
  onToggleRewriteSegment,
  onSelectAllRewriteSegments,
  onClearRewriteSegments,
  onRequestApply,
  onCancelApply,
  onConfirmApply,
  onClose,
}: {
  closing: boolean;
  template: ExportTemplate;
  taskGoal: ExportTaskGoal;
  presets: ExportPreset[];
  presetId: string;
  exportText: string;
  rewritePhase: AiRewritePhase;
  rewriteProgress: number;
  rewriteVisibleText: string;
  rewriteSegments: RewriteDiffSegment[];
  selectedRewriteSegmentIds: string[];
  applyConfirmOpen: boolean;
  copied: boolean;
  busy: boolean;
  onTemplateChange: (template: ExportTemplate) => void;
  onTaskGoalChange: (goal: ExportTaskGoal) => void;
  onPresetChange: (presetId: string) => void;
  onExport: () => void;
  onAiRewrite: () => void;
  onStopRewrite: () => void;
  onCopy: () => void;
  onToggleRewriteSegment: (segmentId: string, selected: boolean) => void;
  onSelectAllRewriteSegments: () => void;
  onClearRewriteSegments: () => void;
  onRequestApply: () => void;
  onCancelApply: () => void;
  onConfirmApply: () => void;
  onClose: () => void;
}) {
  const selectedPreset = presets.find((preset) => preset.id === presetId) ?? null;
  const hasRewriteDraft = rewriteSegments.length > 0;
  const isGenerating = rewritePhase === "generating-markdown";
  const isRewriting = rewritePhase === "rewriting" || rewritePhase === "revealing";

  return (
    <div
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="annotation-modal export-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">AI Rewrite</p>
            <h2>AI重写</h2>
          </div>
          <button className="icon-button" title="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="export-control-grid">
          <label className="modal-field">
            Prompt 预设
            <select value={presetId} onChange={(event) => onPresetChange(event.target.value)}>
              <option value="">使用内置任务目标</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>
          <label className="modal-field">
            模板
            <select
              value={selectedPreset?.baseTemplateId ?? template}
              onChange={(event) => onTemplateChange(event.target.value as ExportTemplate)}
              disabled={Boolean(selectedPreset)}
            >
              <option value="reading-notes">阅读笔记模板</option>
              <option value="ai-pack">AI 修改包模板</option>
              <option value="question-list">问题清单模板</option>
              <option value="annotation-index">全书批注索引</option>
            </select>
          </label>
          <label className="modal-field">
            任务目标
            <select
              value={taskGoal}
              onChange={(event) => onTaskGoalChange(event.target.value as ExportTaskGoal)}
              disabled={Boolean(selectedPreset)}
            >
              <option value="polish">润色这一章</option>
              <option value="rewrite">根据批注重写</option>
              <option value="expand">扩展某些段落</option>
              <option value="questions">生成问题清单</option>
              <option value="creative">生成二次创作指令</option>
            </select>
          </label>
        </div>
        {selectedPreset && (
          <div className="preset-export-summary">
            <strong>{selectedPreset.name}</strong>
            <span>正文结构：{exportTemplateLabel(selectedPreset.baseTemplateId)}</span>
          </div>
        )}
        <div className="modal-actions export-actions">
          <button onClick={onExport} disabled={busy}>
            <FileText size={16} />
            {isGenerating ? "生成中" : "生成 Markdown"}
          </button>
          <button
            className={isRewriting ? "danger" : "primary-button"}
            onClick={isRewriting ? onStopRewrite : onAiRewrite}
            disabled={isRewriting ? false : busy || !exportText.trim()}
          >
            {isRewriting ? <X size={16} /> : <WandSparkles size={16} />}
            {isRewriting ? "停止" : "AI重写"}
          </button>
          <button onClick={onCopy} disabled={!exportText}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "已复制" : "复制修改包"}
          </button>
        </div>
        {isRewriting && (
          <div className="ai-rewrite-progress" role="status" aria-live="polite">
            <div>
              <strong>{rewritePhase === "revealing" ? "整理重写稿" : "正在请求 AI"}</strong>
              <span>{Math.round(rewriteProgress)}%</span>
            </div>
            <i aria-hidden="true">
              <b style={{ width: `${rewriteProgress}%` }} />
            </i>
            {rewriteVisibleText && (
              <pre className="rewrite-draft-stream">
                {rewriteVisibleText.split("\n").map((line, index) => (
                  <code key={`${index}-${line}`}>{line || " "}</code>
                ))}
              </pre>
            )}
          </div>
        )}
        {hasRewriteDraft ? (
          <AiRewriteDiffPreview
            segments={rewriteSegments}
            selectedSegmentIds={selectedRewriteSegmentIds}
            applyConfirmOpen={applyConfirmOpen}
            busy={busy}
            onToggleSegment={onToggleRewriteSegment}
            onSelectAll={onSelectAllRewriteSegments}
            onClear={onClearRewriteSegments}
            onRequestApply={onRequestApply}
            onCancelApply={onCancelApply}
            onConfirmApply={onConfirmApply}
          />
        ) : (
          <textarea
            className="export-output"
            value={exportText}
            readOnly
            placeholder="先生成当前章节的 Markdown 修改包，再发起 AI 重写"
            aria-label="AI重写修改包"
          />
        )}
      </section>
    </div>
  );
}

function AiRewriteDiffPreview({
  segments,
  selectedSegmentIds,
  applyConfirmOpen,
  busy,
  onToggleSegment,
  onSelectAll,
  onClear,
  onRequestApply,
  onCancelApply,
  onConfirmApply,
}: {
  segments: RewriteDiffSegment[];
  selectedSegmentIds: string[];
  applyConfirmOpen: boolean;
  busy: boolean;
  onToggleSegment: (segmentId: string, selected: boolean) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onRequestApply: () => void;
  onCancelApply: () => void;
  onConfirmApply: () => void;
}) {
  const selectedSet = new Set(selectedSegmentIds);
  const selectedCount = segments.filter((segment) => selectedSet.has(segment.id)).length;

  return (
    <div className="rewrite-diff-preview">
      <div className="rewrite-diff-toolbar">
        <div>
          <strong>
            <GitCompare size={16} /> 草稿 Diff
          </strong>
          <small>
            已选择 {selectedCount}/{segments.length} 个变化块替换，取消勾选将保留原文。
          </small>
        </div>
        <div className="rewrite-diff-toolbar-actions">
          <button
            className="rewrite-action-button primary"
            onClick={onSelectAll}
            disabled={busy || segments.length === 0}
          >
            <Check size={15} /> 全部替换
          </button>
          <button className="rewrite-action-button" onClick={onClear} disabled={busy || segments.length === 0}>
            <RotateCcw size={15} /> 全部保留原文
          </button>
        </div>
      </div>
      {segments.length ? (
        <div className="rewrite-diff-list">
          {segments.map((segment) => {
            const selected = selectedSet.has(segment.id);
            return (
              <article key={segment.id} className={`rewrite-diff-block ${segment.type} ${selected ? "selected" : ""}`}>
                <header>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => onToggleSegment(segment.id, event.target.checked)}
                      disabled={busy}
                    />
                    <span>{selected ? "替换" : "保留原文"}</span>
                  </label>
                  <small>
                    {diffBlockLabel(segment.type)} · 原 {segment.oldStart} / 新 {segment.newStart}
                  </small>
                </header>
                <div className="rewrite-diff-columns">
                  <DiffColumn title="原文" lines={segment.oldLines} emptyText="没有原文行" tone="old" />
                  <DiffColumn title="重写稿" lines={segment.newLines} emptyText="没有重写行" tone="new" />
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="muted">重写稿与原文一致。</p>
      )}
      {applyConfirmOpen && (
        <div className="rewrite-apply-confirm" role="alertdialog" aria-modal="false">
          <div>
            <strong>确认应用到原文？</strong>
            <small>会覆盖当前章节的 Markdown 文件，并立即生成新的章节版本快照。</small>
          </div>
          <div className="rewrite-confirm-actions">
            <button className="rewrite-action-button" onClick={onCancelApply} disabled={busy}>
              <X size={15} /> 取消
            </button>
            <button className="rewrite-action-button danger" onClick={onConfirmApply} disabled={busy}>
              <Replace size={15} /> 确定应用
            </button>
          </div>
        </div>
      )}
      <div className="modal-actions rewrite-apply-actions">
        <button className="primary-button" onClick={onRequestApply} disabled={busy || segments.length === 0}>
          <Replace size={16} /> 应用到原文
        </button>
      </div>
    </div>
  );
}

function DiffColumn({
  title,
  lines,
  emptyText,
  tone,
}: {
  title: string;
  lines: string[];
  emptyText: string;
  tone: "old" | "new";
}) {
  return (
    <section className={`rewrite-diff-column ${tone}`}>
      <strong>{title}</strong>
      {lines.length ? (
        <pre>
          {lines.map((line, index) => (
            <code key={`${index}-${line}`}>{line || " "}</code>
          ))}
        </pre>
      ) : (
        <p>{emptyText}</p>
      )}
    </section>
  );
}

export function NewAnnotationModal({
  closing,
  draft,
  onChange,
  onCancel,
  onSave,
}: {
  closing: boolean;
  draft: SelectionDraft;
  onChange: (draft: SelectionDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <section className="annotation-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">New Note</p>
            <h2>添加批注</h2>
          </div>
          <button className="icon-button" title="关闭" onClick={onCancel}>
            <X size={18} />
          </button>
        </header>
        <blockquote>{draft.selectedText}</blockquote>
        <ColorSwatches
          value={draft.highlightColor}
          onChange={(highlightColor) => onChange({ ...draft, highlightColor })}
        />
        <textarea
          autoFocus
          value={draft.comment}
          onChange={(event) => onChange({ ...draft, comment: event.target.value })}
          placeholder="写下评论、修改意图或想追问 AI 的问题"
        />
        <div className="modal-actions">
          <button onClick={onCancel}>取消</button>
          <button className="primary-button" onClick={onSave}>
            <Save size={17} />
            保存批注
          </button>
        </div>
      </section>
    </div>
  );
}

export function AnnotationDetailModal({
  closing,
  annotation,
  onClose,
  onDelete,
  onSave,
}: {
  closing: boolean;
  annotation: Annotation;
  onClose: () => void;
  onDelete: () => void;
  onSave: (patch: Partial<Annotation>) => void;
}) {
  const [comment, setComment] = useState(annotation.comment);
  const [highlightColor, setHighlightColor] = useState(annotation.highlightColor);

  useEffect(() => {
    setComment(annotation.comment);
    setHighlightColor(annotation.highlightColor);
  }, [annotation]);

  return (
    <div
      className={`modal-backdrop ${closing ? "is-closing" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="annotation-modal detail" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Note Detail</p>
            <h2>批注详情</h2>
          </div>
          <button className="icon-button" title="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="annotation-meta">
          <span style={{ background: highlightColor }} />
          <small>{annotation.headingPath || "无标题路径"}</small>
        </div>
        <blockquote>{annotation.selectedText}</blockquote>
        <ColorSwatches value={highlightColor} onChange={setHighlightColor} />
        <textarea value={comment} onChange={(event) => setComment(event.target.value)} />
        <div className="modal-actions">
          <button className="danger" onClick={onDelete}>
            <Trash2 size={16} />
            删除
          </button>
          <button className="primary-button" onClick={() => onSave({ comment, highlightColor })}>
            <Save size={17} />
            保存
          </button>
        </div>
      </section>
    </div>
  );
}

export function SettingsPanel({
  closing,
  settings,
  systemFonts,
  currentVersionId,
  currentChapterVersionId,
  versions,
  showChangeHighlights,
  changeHighlightBusy,
  hasPreviousVersion,
  onChange,
  onVersionChange,
  onChangeHighlightToggle,
  onClose,
}: {
  closing: boolean;
  settings: AppSettings;
  systemFonts: SystemFont[];
  currentVersionId: string | null;
  currentChapterVersionId: string | null;
  versions: ChapterVersion[];
  showChangeHighlights: boolean;
  changeHighlightBusy: boolean;
  hasPreviousVersion: boolean;
  onChange: (patch: Partial<AppSettings>) => void;
  onVersionChange: (chapterVersionId: string) => void;
  onChangeHighlightToggle: (enabled: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div
      className={`settings-backdrop ${closing ? "is-closing" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="settings-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Settings</p>
            <h2>阅读器设置</h2>
          </div>
          <button className="icon-button" title="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <label className="reader-version-setting">
          <span>
            <strong>当前版本</strong>
          </span>
          <select
            value={currentVersionId ?? ""}
            onChange={(event) => onVersionChange(event.target.value)}
            disabled={!versions.length}
          >
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.id === currentChapterVersionId
                  ? `当前版本 v${version.versionNumber}`
                  : `v${version.versionNumber}`}
              </option>
            ))}
          </select>
        </label>

        <div className="settings-toggle-grid">
          <label className="settings-toggle">
            <span>
              <strong>聚焦模式</strong>
              <small>仅当前段落与相邻段落保持清晰。</small>
            </span>
            <input
              type="checkbox"
              checked={settings.focusMode}
              onChange={(event) => onChange({ focusMode: event.target.checked })}
            />
            <i aria-hidden="true" />
          </label>

          <label className={`settings-toggle ${changeHighlightBusy ? "loading" : ""}`}>
            <span>
              <strong>高亮变更</strong>
              <small>
                {hasPreviousVersion
                  ? "显示相对上一版本增加和更改的内容。"
                  : "首个版本没有上一版本可对比。"}
              </small>
            </span>
            <input
              type="checkbox"
              checked={showChangeHighlights}
              onChange={(event) => onChangeHighlightToggle(event.target.checked)}
            />
            <i aria-hidden="true" />
          </label>
        </div>

        <section className="settings-group">
          <h3>字体设置</h3>
          <div className="reader-font-setting-grid">
            <FontPicker
              label="阅读器英文字体"
              description="只改变阅读器正文中的英文和数字。"
              value={settings.readerLatinFontFamily}
              fallbackGeneric="serif"
              systemFonts={systemFonts}
              onChange={(value) => onChange({ readerLatinFontFamily: value })}
            />
            <FontPicker
              label="阅读器中文字体"
              description="只改变阅读器正文中的中文内容。"
              value={settings.readerCjkFontFamily}
              fallbackGeneric="serif"
              systemFonts={systemFonts}
              onChange={(value) => onChange({ readerCjkFontFamily: value })}
            />
          </div>
        </section>

        <section className="settings-group">
          <h3>页面设置</h3>
          <div className="settings-control-stack">
            <RangeControl
              label="字号"
              min={14}
              max={24}
              step={1}
              value={settings.fontSize}
              onChange={(value) => onChange({ fontSize: value })}
            />
            <RangeControl
              label="行距"
              min={1.35}
              max={2.1}
              step={0.05}
              value={settings.lineHeight}
              onChange={(value) => onChange({ lineHeight: value })}
            />
            <RangeControl
              label="正文宽度"
              min={620}
              max={1040}
              step={20}
              value={settings.contentWidth}
              onChange={(value) => onChange({ contentWidth: value })}
            />
            <RangeControl
              label="页边距"
              min={24}
              max={88}
              step={4}
              value={settings.pagePadding}
              onChange={(value) => onChange({ pagePadding: value })}
            />
            <RangeControl
              label="段落间距"
              min={8}
              max={30}
              step={1}
              value={settings.paragraphSpacing}
              onChange={(value) => onChange({ paragraphSpacing: value })}
            />
          </div>
        </section>

        <label>
          边框
          <select value={settings.borderStyle} onChange={(event) => onChange({ borderStyle: event.target.value })}>
            <option value="hairline">细线</option>
            <option value="rail">侧栏线</option>
            <option value="none">无边框</option>
          </select>
        </label>
      </section>
    </div>
  );
}

export function TopNotice({
  error,
  notice,
  closing,
  onClose,
}: {
  error: string;
  notice: string;
  closing: boolean;
  onClose: () => void;
}) {
  const text = error || notice;
  if (!text) return null;
  return (
    <div
      className={`top-notice ${error ? "error" : ""} ${closing ? "is-closing" : ""}`}
      role={error ? "alert" : "status"}
    >
      <span>{text}</span>
      <svg className="notice-ring" viewBox="0 0 18 18" aria-hidden="true">
        <circle className="notice-ring-track" cx="9" cy="9" r="7" />
        <circle className="notice-ring-progress" cx="9" cy="9" r="7" />
      </svg>
      <button className="icon-button small" onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  );
}

function exportTemplateLabel(templateId: ExportTemplate) {
  const labels: Record<ExportTemplate, string> = {
    "reading-notes": "阅读笔记模板",
    "ai-pack": "AI 修改包模板",
    "question-list": "问题清单模板",
    "annotation-index": "全书批注索引",
  };
  return labels[templateId];
}

function diffBlockLabel(type: DiffBlockType) {
  const labels: Record<DiffBlockType, string> = {
    added: "新增",
    removed: "删除",
    modified: "修改",
  };
  return labels[type];
}

function ColorSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="color-swatches">
      {highlightColors.map((color) => (
        <button
          key={color}
          className={value === color ? "active" : ""}
          style={{ background: color }}
          title={color}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}

function RangeControl({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>
        {label}
        <strong>{value}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
