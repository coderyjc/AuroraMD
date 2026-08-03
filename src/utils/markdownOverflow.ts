const markdownOverflowWrapperSelector =
  ".markdown-overflow-frame[data-overflow-wrapper='true']";
const markdownOverflowBlockSelector = "p, blockquote, h1, h2, h3, h4, h5, h6";
const markdownOverflowTolerancePx = 2;

export function enhanceMarkdownOverflow(root: HTMLElement) {
  resetMarkdownOverflow(root);
  if (root.clientWidth <= 0) return;

  const wrappers: HTMLElement[] = [];
  for (const table of Array.from(root.querySelectorAll<HTMLTableElement>("table"))) {
    if (!canWrapMarkdownOverflowElement(root, table)) continue;
    wrappers.push(wrapMarkdownOverflowElement(table, "table"));
  }

  for (const element of Array.from(
    root.querySelectorAll<HTMLElement>(markdownOverflowBlockSelector),
  )) {
    if (!canWrapMarkdownOverflowElement(root, element)) continue;
    if (isMarkdownElementOverflowing(element)) {
      wrappers.push(wrapMarkdownOverflowElement(element, "block"));
    }
  }

  updateMarkdownOverflowFrameStates(wrappers);
}

export function resetMarkdownOverflow(root: HTMLElement) {
  for (const wrapper of Array.from(
    root.querySelectorAll<HTMLElement>(markdownOverflowWrapperSelector),
  )) {
    unwrapMarkdownOverflowElement(wrapper);
  }
}

function canWrapMarkdownOverflowElement(root: HTMLElement, element: HTMLElement) {
  if (!root.contains(element) || !element.parentNode) return false;
  if (element.closest(markdownOverflowWrapperSelector)) return false;
  if (element.closest("pre, .mermaid-figure")) return false;
  if (element instanceof HTMLTableElement) return true;
  return !element.closest("table");
}

function isMarkdownElementOverflowing(element: HTMLElement) {
  if (element.clientWidth <= 0) return false;
  if (element.scrollWidth > element.clientWidth + markdownOverflowTolerancePx) return true;
  const parent = element.parentElement;
  if (!parent) return false;
  const elementRect = element.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  return elementRect.right > parentRect.right + markdownOverflowTolerancePx;
}

function wrapMarkdownOverflowElement(element: HTMLElement, kind: "block" | "table") {
  const wrapper = document.createElement("div");
  wrapper.className = `markdown-overflow-frame markdown-overflow-${kind}`;
  wrapper.dataset.overflowWrapper = "true";
  wrapper.setAttribute(
    "aria-label",
    kind === "table" ? "Scrollable markdown table" : "Scrollable markdown content",
  );
  element.parentNode?.insertBefore(wrapper, element);
  wrapper.appendChild(element);
  return wrapper;
}

function updateMarkdownOverflowFrameStates(wrappers: HTMLElement[]) {
  for (const wrapper of wrappers) {
    const isOverflowing =
      wrapper.scrollWidth > wrapper.clientWidth + markdownOverflowTolerancePx;
    wrapper.classList.toggle("is-overflowing", isOverflowing);
    if (isOverflowing) {
      wrapper.tabIndex = 0;
    } else {
      wrapper.removeAttribute("tabindex");
    }
  }
}

function unwrapMarkdownOverflowElement(wrapper: HTMLElement) {
  const parent = wrapper.parentNode;
  if (!parent) return;
  while (wrapper.firstChild) {
    parent.insertBefore(wrapper.firstChild, wrapper);
  }
  parent.removeChild(wrapper);
}
