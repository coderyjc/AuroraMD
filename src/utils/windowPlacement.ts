import type { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { clamp } from "./math";

export interface WindowPlacementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SavedWindowPlacement extends WindowPlacementBounds {
  savedAt: number;
}

export interface WindowPlacementMonitor {
  position: PhysicalPosition;
  workArea: {
    position: PhysicalPosition;
    size: PhysicalSize;
  };
}

export const windowPlacementStorageKey = "auroramd.windowPlacement.v1";
export const legacyWindowPlacementStorageKeys = ["annotaloop.windowPlacement.v1"];
export const windowPlacementSaveDelayMs = 320;
const minimumRestoredWindowSize = 360;
const initialWindowWidthRatio = 0.69;
const initialWindowHeightRatio = 0.82;
const initialWindowMinWidth = 980;
const initialWindowMinHeight = 680;
const initialWindowEdgePaddingPx = 32;

export function getInitialWindowPlacement(monitor: WindowPlacementMonitor | null): WindowPlacementBounds | null {
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

export function readSavedWindowPlacement() {
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

export function writeSavedWindowPlacement(placement: SavedWindowPlacement) {
  localStorage.setItem(windowPlacementStorageKey, JSON.stringify(placement));
  legacyWindowPlacementStorageKeys.forEach((key) => localStorage.removeItem(key));
}

export function isWindowPlacementVisible(
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
