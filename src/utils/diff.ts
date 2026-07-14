export type DiffBlockType = "added" | "removed" | "modified";

export interface DiffBlock {
  id: string;
  type: DiffBlockType;
  oldStart: number;
  newStart: number;
  oldLines: string[];
  newLines: string[];
}

type DiffOp =
  | { type: "equal"; oldLine: string; newLine: string; oldLineNumber: number; newLineNumber: number }
  | { type: "delete"; line: string; oldLineNumber: number; newLineNumber: number }
  | { type: "insert"; line: string; oldLineNumber: number; newLineNumber: number };

export function diffMarkdownLines(oldContent: string, newContent: string): DiffBlock[] {
  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);
  const operations = buildLineOperations(oldLines, newLines);
  return compactOperations(operations);
}

function splitLines(content: string) {
  return content.replace(/\r\n/g, "\n").split("\n");
}

function buildLineOperations(oldLines: string[], newLines: string[]) {
  const rowSize = newLines.length + 1;
  const cells = (oldLines.length + 1) * rowSize;
  if (cells > 16_000_000) {
    return buildLinearFallback(oldLines, newLines);
  }

  const dp = new Uint32Array(cells);
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      const cell = oldIndex * rowSize + newIndex;
      if (oldLines[oldIndex] === newLines[newIndex]) {
        dp[cell] = dp[(oldIndex + 1) * rowSize + newIndex + 1] + 1;
      } else {
        dp[cell] = Math.max(dp[(oldIndex + 1) * rowSize + newIndex], dp[oldIndex * rowSize + newIndex + 1]);
      }
    }
  }

  const operations: DiffOp[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      operations.push({
        type: "equal",
        oldLine: oldLines[oldIndex],
        newLine: newLines[newIndex],
        oldLineNumber: oldIndex + 1,
        newLineNumber: newIndex + 1,
      });
      oldIndex += 1;
      newIndex += 1;
      continue;
    }

    if (dp[(oldIndex + 1) * rowSize + newIndex] >= dp[oldIndex * rowSize + newIndex + 1]) {
      operations.push({
        type: "delete",
        line: oldLines[oldIndex],
        oldLineNumber: oldIndex + 1,
        newLineNumber: newIndex + 1,
      });
      oldIndex += 1;
    } else {
      operations.push({
        type: "insert",
        line: newLines[newIndex],
        oldLineNumber: oldIndex + 1,
        newLineNumber: newIndex + 1,
      });
      newIndex += 1;
    }
  }

  while (oldIndex < oldLines.length) {
    operations.push({
      type: "delete",
      line: oldLines[oldIndex],
      oldLineNumber: oldIndex + 1,
      newLineNumber: newIndex + 1,
    });
    oldIndex += 1;
  }

  while (newIndex < newLines.length) {
    operations.push({
      type: "insert",
      line: newLines[newIndex],
      oldLineNumber: oldIndex + 1,
      newLineNumber: newIndex + 1,
    });
    newIndex += 1;
  }

  return operations;
}

function buildLinearFallback(oldLines: string[], newLines: string[]) {
  const operations: DiffOp[] = [];
  const length = Math.max(oldLines.length, newLines.length);
  for (let index = 0; index < length; index += 1) {
    const oldLine = oldLines[index];
    const newLine = newLines[index];
    if (oldLine !== undefined && newLine !== undefined && oldLine === newLine) {
      operations.push({
        type: "equal",
        oldLine,
        newLine,
        oldLineNumber: index + 1,
        newLineNumber: index + 1,
      });
    } else {
      if (oldLine !== undefined) {
        operations.push({
          type: "delete",
          line: oldLine,
          oldLineNumber: index + 1,
          newLineNumber: index + 1,
        });
      }
      if (newLine !== undefined) {
        operations.push({
          type: "insert",
          line: newLine,
          oldLineNumber: index + 1,
          newLineNumber: index + 1,
        });
      }
    }
  }
  return operations;
}

function compactOperations(operations: DiffOp[]) {
  const blocks: DiffBlock[] = [];
  let index = 0;
  while (index < operations.length) {
    if (operations[index].type === "equal") {
      index += 1;
      continue;
    }

    const oldLines: string[] = [];
    const newLines: string[] = [];
    const first = operations[index];
    const oldStart = "oldLineNumber" in first ? first.oldLineNumber : 1;
    const newStart = "newLineNumber" in first ? first.newLineNumber : 1;

    while (index < operations.length && operations[index].type !== "equal") {
      const operation = operations[index];
      if (operation.type === "delete") {
        oldLines.push(operation.line);
      } else if (operation.type === "insert") {
        newLines.push(operation.line);
      }
      index += 1;
    }

    const type: DiffBlockType =
      oldLines.length > 0 && newLines.length > 0
        ? "modified"
        : oldLines.length > 0
          ? "removed"
          : "added";
    blocks.push({
      id: `${blocks.length}-${type}-${oldStart}-${newStart}`,
      type,
      oldStart,
      newStart,
      oldLines,
      newLines,
    });
  }

  return blocks;
}
