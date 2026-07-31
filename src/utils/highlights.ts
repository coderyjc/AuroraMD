import { highlightColors, highlightPaletteSize } from "../constants";

export interface HighlightColorParts {
  hex: string;
  alpha: number;
  css: string;
}

export interface HighlightPenbox {
  id: string;
  name: string;
  colors: string[];
}

export interface HighlightPenboxSettings {
  activePenboxId: string;
  penboxes: HighlightPenbox[];
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface HsvColor {
  hue: number;
  saturation: number;
  value: number;
}

const defaultPenboxId = "default";
const defaultPenboxName = "默认笔盒";

export function parseHighlightPalette(value: string | null | undefined) {
  return getActiveHighlightPenbox(parseHighlightPenboxSettings(value)).colors;
}

export function parseHighlightPenboxSettings(value: string | null | undefined): HighlightPenboxSettings {
  let parsed: unknown = null;
  try {
    parsed = value ? JSON.parse(value) : null;
  } catch {
    parsed = null;
  }
  if (Array.isArray(parsed)) {
    return normalizeHighlightPenboxSettings({
      activePenboxId: defaultPenboxId,
      penboxes: [{ id: defaultPenboxId, name: defaultPenboxName, colors: parsed }],
    });
  }
  if (isRecord(parsed)) {
    const activePenboxId =
      stringValue(parsed.activePenboxId) ??
      stringValue(parsed.activePaletteId) ??
      stringValue(parsed.activeId) ??
      defaultPenboxId;
    const rawPenboxes = Array.isArray(parsed.penboxes)
      ? parsed.penboxes
      : Array.isArray(parsed.palettes)
        ? parsed.palettes
        : Array.isArray(parsed.colors)
          ? [{ id: defaultPenboxId, name: defaultPenboxName, colors: parsed.colors }]
          : [];
    return normalizeHighlightPenboxSettings({ activePenboxId, penboxes: rawPenboxes });
  }
  return normalizeHighlightPenboxSettings({
    activePenboxId: defaultPenboxId,
    penboxes: [{ id: defaultPenboxId, name: defaultPenboxName, colors: highlightColors }],
  });
}

export function serializeHighlightPalette(colors: string[]) {
  return serializeHighlightPenboxSettings({
    activePenboxId: defaultPenboxId,
    penboxes: [{ id: defaultPenboxId, name: defaultPenboxName, colors }],
  });
}

export function serializeHighlightPenboxSettings(settings: HighlightPenboxSettings) {
  return JSON.stringify(normalizeHighlightPenboxSettings(settings));
}

export function createHighlightPenbox(name: string, colors = highlightColors): HighlightPenbox {
  return {
    id: createHighlightPenboxId(),
    name: name.trim() || "新笔盒",
    colors: normalizeHighlightPalette(colors),
  };
}

export function getActiveHighlightPenbox(settings: HighlightPenboxSettings) {
  return (
    settings.penboxes.find((penbox) => penbox.id === settings.activePenboxId) ??
    settings.penboxes[0] ??
    normalizeHighlightPenboxSettings({
      activePenboxId: defaultPenboxId,
      penboxes: [{ id: defaultPenboxId, name: defaultPenboxName, colors: highlightColors }],
    }).penboxes[0]
  );
}

export function normalizeHighlightPenboxSettings(settings: {
  activePenboxId?: unknown;
  penboxes?: unknown[];
}): HighlightPenboxSettings {
  const usedIds = new Set<string>();
  const sourcePenboxes = Array.isArray(settings.penboxes) ? settings.penboxes : [];
  const penboxes = sourcePenboxes
    .map((rawPenbox, index) => normalizeHighlightPenbox(rawPenbox, index, usedIds))
    .filter((penbox): penbox is HighlightPenbox => Boolean(penbox));

  if (!penboxes.length) {
    penboxes.push({
      id: defaultPenboxId,
      name: defaultPenboxName,
      colors: normalizeHighlightPalette(highlightColors),
    });
  }

  const requestedActiveId = stringValue(settings.activePenboxId);
  const activePenboxId = penboxes.some((penbox) => penbox.id === requestedActiveId)
    ? requestedActiveId!
    : penboxes[0].id;

  return { activePenboxId, penboxes };
}

export function normalizeHighlightPalette(colors: unknown[]) {
  return Array.from({ length: highlightPaletteSize }, (_, index) => {
    const fallback = highlightColors[index] ?? highlightColors[0];
    const raw = typeof colors[index] === "string" ? colors[index] : fallback;
    return readHighlightColorParts(raw, fallback).css;
  });
}

export function readHighlightColorParts(value: string, fallback = highlightColors[0]): HighlightColorParts {
  const fallbackParts = parseHighlightColor(fallback) ?? {
    hex: "#f7d86a",
    alpha: 1,
  };
  const parts = parseHighlightColor(value) ?? fallbackParts;
  return {
    hex: parts.hex,
    alpha: parts.alpha,
    css: composeHighlightColor(parts.hex, parts.alpha),
  };
}

export function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  const shortMatch = /^#?([0-9a-f]{3})$/i.exec(trimmed);
  if (shortMatch) {
    return `#${shortMatch[1]
      .split("")
      .map((char) => char + char)
      .join("")
      .toLowerCase()}`;
  }
  const fullMatch = /^#?([0-9a-f]{6})$/i.exec(trimmed);
  if (fullMatch) return `#${fullMatch[1].toLowerCase()}`;
  return null;
}

export function composeHighlightColor(hex: string, alpha: number) {
  const normalizedHex = normalizeHexColor(hex) ?? "#f7d86a";
  const normalizedAlpha = clampAlpha(alpha);
  if (normalizedAlpha >= 0.995) return normalizedHex;
  const rgb = hexToRgb(normalizedHex);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${formatAlpha(normalizedAlpha)})`;
}

export function hexToHsv(hex: string): HsvColor {
  const { r, g, b } = hexToRgb(normalizeHexColor(hex) ?? "#f7d86a");
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === red) {
      hue = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
      hue = 60 * ((blue - red) / delta + 2);
    } else {
      hue = 60 * ((red - green) / delta + 4);
    }
  }
  return {
    hue: hue < 0 ? hue + 360 : hue,
    saturation: max === 0 ? 0 : delta / max,
    value: max,
  };
}

export function hsvToHex(hue: number, saturation: number, value: number) {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const clampedSaturation = clamp(saturation, 0, 1);
  const clampedValue = clamp(value, 0, 1);
  const chroma = clampedValue * clampedSaturation;
  const huePrime = normalizedHue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const m = clampedValue - chroma;
  const [red, green, blue] =
    huePrime < 1
      ? [chroma, x, 0]
      : huePrime < 2
        ? [x, chroma, 0]
        : huePrime < 3
          ? [0, chroma, x]
          : huePrime < 4
            ? [0, x, chroma]
            : huePrime < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return rgbToHex({
    r: Math.round((red + m) * 255),
    g: Math.round((green + m) * 255),
    b: Math.round((blue + m) * 255),
  });
}

export function clampAlpha(value: number) {
  return clamp(Number.isFinite(value) ? value : 1, 0.08, 1);
}

function parseHighlightColor(value: string): { hex: string; alpha: number } | null {
  const trimmed = value.trim();
  const normalizedHex = normalizeHexColor(trimmed);
  if (normalizedHex) return { hex: normalizedHex, alpha: 1 };

  const hexAlphaMatch = /^#?([0-9a-f]{8})$/i.exec(trimmed);
  if (hexAlphaMatch) {
    const raw = hexAlphaMatch[1];
    return {
      hex: `#${raw.slice(0, 6).toLowerCase()}`,
      alpha: clampAlpha(parseInt(raw.slice(6), 16) / 255),
    };
  }

  const rgbMatch = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.exec(
    trimmed,
  );
  if (!rgbMatch) return null;
  return {
    hex: rgbToHex({
      r: clamp(Math.round(Number(rgbMatch[1])), 0, 255),
      g: clamp(Math.round(Number(rgbMatch[2])), 0, 255),
      b: clamp(Math.round(Number(rgbMatch[3])), 0, 255),
    }),
    alpha: clampAlpha(rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4])),
  };
}

function hexToRgb(hex: string): RgbColor {
  const normalized = normalizeHexColor(hex) ?? "#f7d86a";
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: RgbColor) {
  return `#${[r, g, b]
    .map((channel) => clamp(channel, 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function formatAlpha(alpha: number) {
  return clampAlpha(alpha).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHighlightPenbox(
  rawPenbox: unknown,
  index: number,
  usedIds: Set<string>,
): HighlightPenbox | null {
  if (!isRecord(rawPenbox)) return null;
  const rawId = stringValue(rawPenbox.id) ?? `penbox-${index + 1}`;
  const id = uniquePenboxId(sanitizePenboxId(rawId) || `penbox-${index + 1}`, usedIds);
  const name = (stringValue(rawPenbox.name) ?? `笔盒 ${index + 1}`).trim() || `笔盒 ${index + 1}`;
  const colors = Array.isArray(rawPenbox.colors)
    ? rawPenbox.colors
    : Array.isArray(rawPenbox.palette)
      ? rawPenbox.palette
      : highlightColors;
  return {
    id,
    name,
    colors: normalizeHighlightPalette(colors),
  };
}

function createHighlightPenboxId() {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return `penbox-${randomId}`;
  return `penbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizePenboxId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
}

function uniquePenboxId(id: string, usedIds: Set<string>) {
  let nextId = id;
  let suffix = 2;
  while (usedIds.has(nextId)) {
    nextId = `${id}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(nextId);
  return nextId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}
