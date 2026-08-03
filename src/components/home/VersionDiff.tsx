import { Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { locateAnnotationInText } from "../../markdown";
import type { Annotation, ChapterUploadReport, ChapterVersion, ReadChapterResponse } from "../../types";
import { type DiffBlock, diffMarkdownLines } from "../../utils/diff";

export interface VersionDiffResult {
  base: ReadChapterResponse;
  target: ReadChapterResponse;
  blocks: DiffBlock[];
  annotationChecks: AnnotationLocationCheck[];
}

interface AnnotationLocationCheck {
  annotation: Annotation;
  located: boolean;
  targetStartOffset?: number;
  method?: "source-offset" | "anchored-text";
}

export function buildVersionDiff(base: ReadChapterResponse, target: ReadChapterResponse): VersionDiffResult {
  return {
    base,
    target,
    blocks: diffMarkdownLines(base.content, target.content),
    annotationChecks: base.annotations.map((annotation) => {
      const location = locateAnnotationInText(target.content, annotation);
      return {
        annotation,
        located: Boolean(location),
        targetStartOffset: location?.startOffset,
        method: location?.method,
      };
    }),
  };
}

export function VersionDiffView({
  result,
  baseVersion,
  targetVersion,
}: {
  result: VersionDiffResult;
  baseVersion: ChapterVersion | null;
  targetVersion: ChapterVersion | null;
}) {
  const added = result.blocks.filter((block) => block.type === "added").length;
  const removed = result.blocks.filter((block) => block.type === "removed").length;
  const modified = result.blocks.filter((block) => block.type === "modified").length;
  const locatedAnnotations = result.annotationChecks.filter((item) => item.located).length;

  return (
    <div className="version-diff-result">
      <div className="diff-summary-grid">
        <span>
          <small>基准</small>
          <strong>{baseVersion ? formatVersionLabel(baseVersion, result.base.chapter.currentVersionId) : "版本 A"}</strong>
        </span>
        <span>
          <small>目标</small>
          <strong>{targetVersion ? formatVersionLabel(targetVersion, result.target.chapter.currentVersionId) : "版本 B"}</strong>
        </span>
        <span>
          <small>新增</small>
          <strong>{added}</strong>
        </span>
        <span>
          <small>删除</small>
          <strong>{removed}</strong>
        </span>
        <span>
          <small>修改</small>
          <strong>{modified}</strong>
        </span>
        <span>
          <small>批注定位</small>
          <strong>
            {locatedAnnotations}/{result.annotationChecks.length}
          </strong>
        </span>
      </div>

      <section className="diff-section">
        <div className="diff-section-heading">
          <strong>正文差异</strong>
          <small>{result.blocks.length ? `${result.blocks.length} 个变化块` : "没有正文变化"}</small>
        </div>
        {result.blocks.length ? (
          <div className="diff-block-list">
            {result.blocks.map((block) => (
              <DiffBlockCard key={block.id} block={block} />
            ))}
          </div>
        ) : (
          <p className="muted">两个版本的正文快照一致。</p>
        )}
      </section>

      <section className="diff-section">
        <div className="diff-section-heading">
          <strong>批注定位</strong>
          <small>检查基准版本批注能否在目标版本中找到同一段文本</small>
        </div>
        {result.annotationChecks.length ? (
          <div className="annotation-location-list">
            {result.annotationChecks.map((item) => (
              <article key={item.annotation.id} className={item.located ? "located" : "lost"}>
                <span className="annotation-dot" style={{ background: item.annotation.highlightColor }} />
                <div>
                  <strong>{item.located ? "仍可定位" : "无法定位"}</strong>
                  <p>{item.annotation.selectedText}</p>
                  <small>
                    {item.located
                      ? `${item.method === "source-offset" ? "原始偏移" : "上下文锚点"} · 目标位置 ${item.targetStartOffset}`
                      : "目标版本中未稳定找到这段批注文本"}
                    {item.annotation.comment.trim() ? ` · ${item.annotation.comment.trim()}` : ""}
                  </small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">基准版本没有批注。</p>
        )}
      </section>
    </div>
  );
}

function DiffBlockCard({ block }: { block: DiffBlock }) {
  return (
    <article className={`diff-block ${block.type}`}>
      <header>
        <strong>{diffBlockLabel(block.type)}</strong>
        <small>
          原 {block.oldStart} · 新 {block.newStart}
        </small>
      </header>
      {block.type === "added" ? (
        <DiffLines lines={block.newLines} prefix="+" />
      ) : block.type === "removed" ? (
        <DiffLines lines={block.oldLines} prefix="-" />
      ) : (
        <div className="modified-lines">
          <DiffLines lines={block.oldLines} prefix="-" />
          <DiffLines lines={block.newLines} prefix="+" />
        </div>
      )}
    </article>
  );
}

function DiffLines({ lines, prefix }: { lines: string[]; prefix: "+" | "-" }) {
  return (
    <pre className={prefix === "+" ? "added-lines" : "removed-lines"}>
      {lines.map((line, index) => (
        <code key={`${index}-${line}`}>
          <span>{prefix}</span>
          {line || " "}
        </code>
      ))}
    </pre>
  );
}

function diffBlockLabel(type: DiffBlock["type"]) {
  const labels: Record<DiffBlock["type"], string> = {
    added: "新增",
    removed: "删除",
    modified: "修改",
  };
  return labels[type];
}

export function formatVersionLabel(version: ChapterVersion, currentVersionId?: string) {
  const base = version.id === currentVersionId ? `当前版本 v${version.versionNumber}` : `v${version.versionNumber}`;
  return version.label.trim() ? `${base} · ${version.label.trim()}` : base;
}

export function formatUploadNotice(report: ChapterUploadReport) {
  if (report.added > 0 && report.skipped > 0) {
    return `已上传 ${report.added} 个章节，跳过 ${report.skipped} 个已存在文件。`;
  }
  if (report.added > 0) {
    return `已上传 ${report.added} 个章节。`;
  }
  if (report.skipped > 0) {
    return `没有新增章节，${report.skipped} 个文件已存在于这本书中。`;
  }
  return "没有新增章节。";
}

export function VersionRow({
  version,
  isCurrent,
  busy,
  onSaveLabel,
  onDelete,
}: {
  version: ChapterVersion;
  isCurrent: boolean;
  busy: boolean;
  onSaveLabel: (version: ChapterVersion, label: string) => void;
  onDelete: (version: ChapterVersion) => void;
}) {
  const [label, setLabel] = useState(version.label);

  useEffect(() => {
    setLabel(version.label);
  }, [version.label]);

  return (
    <article className="version-row">
      <div>
        <strong>{isCurrent ? `当前版本 v${version.versionNumber}` : `v${version.versionNumber}`}</strong>
        <small>{new Date(version.createdAt).toLocaleString()}</small>
      </div>
      <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="版本别名，例如 初稿" />
      <button onClick={() => onSaveLabel(version, label)} disabled={busy}>
        <Save size={15} /> 保存
      </button>
      <button className="danger" onClick={() => onDelete(version)} disabled={busy || isCurrent}>
        <Trash2 size={15} /> 删除
      </button>
    </article>
  );
}
