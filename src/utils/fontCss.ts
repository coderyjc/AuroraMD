export function composeLanguageFontStack(
  latinAlias: string,
  cjkAlias: string,
  fallback: "sans-serif" | "serif",
) {
  return `${quoteCssString(latinAlias)}, ${quoteCssString(cjkAlias)}, ${fallback}`;
}

export function createLanguageFontFace(alias: string, fontFamilyStack: string, script: "latin" | "cjk") {
  const localSources = splitFontStack(fontFamilyStack)
    .filter((family) => !isGenericFontFamily(family))
    .map((family) => `local(${quoteCssString(stripFontQuotes(family))})`);

  if (!localSources.length) return "";

  const unicodeRange =
    script === "latin"
      ? "U+0000-024F, U+1E00-1EFF, U+2000-206F, U+2070-209F, U+20A0-20CF, U+2100-214F, U+2150-218F"
      : "U+2E80-2EFF, U+2F00-2FDF, U+3000-303F, U+3040-30FF, U+3100-312F, U+31A0-31BF, U+31F0-31FF, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FF00-FFEF, U+20000-2FA1F";

  return [
    "@font-face {",
    `  font-family: ${quoteCssString(alias)};`,
    `  src: ${localSources.join(", ")};`,
    `  unicode-range: ${unicodeRange};`,
    "  font-display: swap;",
    "}",
  ].join("\n");
}

function splitFontStack(value: string) {
  const families: string[] = [];
  let current = "";
  let quote: string | null = null;
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      current += character;
      escaped = true;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'") {
      current += character;
      quote = character;
      continue;
    }
    if (character === ",") {
      if (current.trim()) families.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }

  if (current.trim()) families.push(current.trim());
  return families;
}

function isGenericFontFamily(family: string) {
  return ["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"].includes(
    stripFontQuotes(family).toLowerCase(),
  );
}

function stripFontQuotes(value: string) {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).replace(/\\(["'\\])/g, "$1");
    }
  }
  return trimmed;
}

function quoteCssString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\A ")}"`;
}
