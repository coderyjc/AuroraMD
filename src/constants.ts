import type { AppSettings, ShortcutBindings } from "./types";

export const highlightColors = ["#f7d86a", "#83d9b7", "#f2a0a1", "#9db7ff", "#d7b7ff"];

export const defaultShortcutBindings: ShortcutBindings = {
  search: "Ctrl+K",
  nextChapter: "N",
  previousChapter: "P",
  highlight: "H",
  export: "E",
  toggleLeft: "[",
  toggleRight: "]",
};

export const defaultSettings: AppSettings = {
  annotationContextChars: 100,
  theme: "paper",
  fontFamily: "Literata, Georgia, serif",
  fontSize: 18,
  lineHeight: 1.72,
  contentWidth: 820,
  pagePadding: 52,
  paragraphSpacing: 18,
  surface: "warm",
  borderStyle: "hairline",
  shortcutBindings: JSON.stringify(defaultShortcutBindings),
};
