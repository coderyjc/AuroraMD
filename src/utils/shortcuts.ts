import { defaultShortcutBindings } from "../constants";
import type { ShortcutAction, ShortcutBindings } from "../types";

type ShortcutEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

export function parseShortcutBindings(value: string): ShortcutBindings {
  try {
    return { ...defaultShortcutBindings, ...(JSON.parse(value) as Partial<ShortcutBindings>) };
  } catch {
    return defaultShortcutBindings;
  }
}

export function normalizeShortcut(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function eventShortcut(event: ShortcutEvent) {
  const parts = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  if (event.metaKey) parts.push("meta");
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
  parts.push(key);
  return parts.join("+");
}

export function shortcutMatchesEvent(shortcut: string, event: ShortcutEvent) {
  return Boolean(shortcut.trim()) && normalizeShortcut(shortcut) === eventShortcut(event);
}

export function matchShortcut(event: ShortcutEvent, bindings: ShortcutBindings): ShortcutAction | null {
  const pressed = eventShortcut(event);
  for (const action of Object.keys(bindings) as ShortcutAction[]) {
    if (normalizeShortcut(bindings[action]) === pressed) return action;
  }
  return null;
}

export function shouldIgnoreShortcut(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName.toLowerCase();
  if (event.key === "Escape") return false;
  return tag === "input" || tag === "textarea" || tag === "select" || Boolean(target?.isContentEditable);
}

export function shortcutActionLabel(action: ShortcutAction) {
  const labels: Record<ShortcutAction, string> = {
    search: "搜索",
    nextChapter: "下一章",
    previousChapter: "上一章",
    highlight: "添加高亮",
    export: "AI重写",
    submit: "提交",
    toggleLeft: "左栏",
    toggleRight: "右栏",
  };
  return labels[action];
}
