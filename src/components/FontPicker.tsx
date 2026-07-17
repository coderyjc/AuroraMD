import { Check, ChevronDown, Search } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { SystemFont } from "../types";

interface FontPickerProps {
  label: string;
  description: string;
  value: string;
  fallbackGeneric: "sans-serif" | "serif";
  systemFonts: SystemFont[];
  onChange: (value: string) => void;
}

const maxVisibleFontOptions = 80;

export function FontPicker({
  label,
  description,
  value,
  fallbackGeneric,
  systemFonts,
  onChange,
}: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const currentFamily = getPrimaryFontFamily(value);

  const fontFamilies = useMemo(() => {
    const families = new Map<string, string>();
    const addFamily = (family: string) => {
      const normalized = family.trim();
      if (!normalized) return;
      families.set(normalized.toLocaleLowerCase(), normalized);
    };

    addFamily(currentFamily);
    systemFonts.forEach((font) => addFamily(font.family));
    return Array.from(families.values()).sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" }),
    );
  }, [currentFamily, systemFonts]);

  const filteredFonts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const matches = normalizedQuery
      ? fontFamilies.filter((family) => family.toLocaleLowerCase().includes(normalizedQuery))
      : fontFamilies;
    return matches.slice(0, maxVisibleFontOptions);
  }, [fontFamilies, query]);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const chooseFont = (family: string) => {
    onChange(toCssFontFamily(family, fallbackGeneric));
    setQuery("");
    setOpen(false);
  };

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Enter" && filteredFonts[0]) {
      event.preventDefault();
      chooseFont(filteredFonts[0]);
    }
  };

  return (
    <div className="font-picker-field" ref={rootRef}>
      <div className="font-picker-label">
        <strong>{label}</strong>
        <small>{description}</small>
      </div>
      <button
        type="button"
        className={`font-picker-trigger ${open ? "active" : ""}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span style={{ fontFamily: value }}>{currentFamily || "选择字体"}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="font-picker-popover">
          <div className="font-picker-search">
            <Search size={15} />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="搜索系统字体"
            />
          </div>
          <div className="font-picker-list" role="listbox" aria-label={label}>
            {filteredFonts.length > 0 ? (
              filteredFonts.map((family) => {
                const active = family.toLocaleLowerCase() === currentFamily.toLocaleLowerCase();
                return (
                  <button
                    key={family}
                    type="button"
                    className={active ? "active" : ""}
                    onClick={() => chooseFont(family)}
                    role="option"
                    aria-selected={active}
                  >
                    <span style={{ fontFamily: toCssFontFamily(family, fallbackGeneric) }}>{family}</span>
                    {active && <Check size={15} />}
                  </button>
                );
              })
            ) : (
              <p>没有匹配的系统字体</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getPrimaryFontFamily(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("\"") || trimmed.startsWith("'")) {
    const quote = trimmed[0];
    let escaped = false;
    for (let index = 1; index < trimmed.length; index += 1) {
      const char = trimmed[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        return trimmed.slice(1, index).replace(/\\(["'\\])/g, "$1");
      }
    }
  }
  return trimmed.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
}

function toCssFontFamily(family: string, fallbackGeneric: "sans-serif" | "serif") {
  const escaped = family.trim().replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  return escaped ? `"${escaped}", ${fallbackGeneric}` : fallbackGeneric;
}
