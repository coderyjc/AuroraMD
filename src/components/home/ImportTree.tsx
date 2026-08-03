import { FileText, FolderOpen } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ImportPreviewFile } from "../../types";

export interface ImportTreeNode {
  id: string;
  name: string;
  file?: ImportPreviewFile;
  children: ImportTreeNode[];
  filePaths: string[];
}

export function ImportTreeRows({
  nodes,
  level,
  selectedSet,
  onToggleFile,
  onToggleGroup,
}: {
  nodes: ImportTreeNode[];
  level: number;
  selectedSet: Set<string>;
  onToggleFile: (path: string, checked: boolean) => void;
  onToggleGroup: (paths: string[], checked: boolean) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const isFile = Boolean(node.file);
        const selectedChildren = node.filePaths.filter((path) => selectedSet.has(path)).length;
        const checked = isFile
          ? Boolean(node.file && selectedSet.has(node.file.path))
          : selectedChildren === node.filePaths.length && node.filePaths.length > 0;
        const indeterminate = !isFile && selectedChildren > 0 && selectedChildren < node.filePaths.length;
        return (
          <div key={node.id} role="treeitem" aria-selected={checked}>
            <label
              className={`import-tree-row ${isFile ? "file" : "folder"}`}
              style={{ paddingLeft: `${12 + level * 18}px` }}
            >
              <TreeCheckbox
                checked={checked}
                indeterminate={indeterminate}
                onChange={(nextChecked) =>
                  node.file
                    ? onToggleFile(node.file.path, nextChecked)
                    : onToggleGroup(node.filePaths, nextChecked)
                }
              />
              {isFile ? <FileText size={15} /> : <FolderOpen size={15} />}
              <span>
                <strong>{node.name}</strong>
                {node.file ? (
                  <small>{formatBytes(node.file.size)}</small>
                ) : (
                  <small>{node.filePaths.length} 个 Markdown 文件</small>
                )}
              </span>
            </label>
            {!isFile && node.children.length > 0 && (
              <ImportTreeRows
                nodes={node.children}
                level={level + 1}
                selectedSet={selectedSet}
                onToggleFile={onToggleFile}
                onToggleGroup={onToggleGroup}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function TreeCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.currentTarget.checked)}
    />
  );
}

export function buildImportTree(files: ImportPreviewFile[]): ImportTreeNode {
  const root: ImportTreeNode = {
    id: "root",
    name: "root",
    children: [],
    filePaths: files.map((file) => file.path),
  };

  for (const file of files) {
    const parts = file.relativePath.split(/[\\/]+/).filter(Boolean);
    let current = root;
    parts.forEach((part, index) => {
      const isLeaf = index === parts.length - 1;
      if (isLeaf) {
        current.children.push({
          id: file.path,
          name: part || file.name,
          file,
          children: [],
          filePaths: [file.path],
        });
        return;
      }
      let next = current.children.find((child) => !child.file && child.name === part);
      if (!next) {
        next = {
          id: `${current.id}/${part}`,
          name: part,
          children: [],
          filePaths: [],
        };
        current.children.push(next);
      }
      next.filePaths.push(file.path);
      current = next;
    });
  }

  sortImportTree(root);
  return root;
}

function sortImportTree(node: ImportTreeNode) {
  node.children.sort((left, right) => {
    if (left.file && !right.file) return 1;
    if (!left.file && right.file) return -1;
    return left.name.localeCompare(right.name, "zh-Hans-CN");
  });
  node.children.forEach(sortImportTree);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function isMarkdownPath(path: string) {
  return path.toLowerCase().endsWith(".md");
}
