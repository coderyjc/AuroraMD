import { Minus, Square, X } from "lucide-react";
import { type MouseEvent as ReactMouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function AppTitlebar({ title, subtitle }: { title: string; subtitle: string }) {
  function handleDrag(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const appWindow = getCurrentWindow();
    if (event.detail >= 2) {
      void appWindow.toggleMaximize();
      return;
    }
    void appWindow.startDragging();
  }

  return (
    <div className="desktop-titlebar" onMouseDown={handleDrag}>
      <div className="titlebar-brand" data-tauri-drag-region>
        <span className="titlebar-mark" aria-hidden="true" />
        <div className="titlebar-copy">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
      </div>
      <div className="window-controls">
        <button
          type="button"
          className="window-control"
          title="最小化"
          aria-label="最小化"
          onClick={() => void getCurrentWindow().minimize()}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className="window-control"
          title="最大化或还原"
          aria-label="最大化或还原"
          onClick={() => void getCurrentWindow().toggleMaximize()}
        >
          <Square size={13} />
        </button>
        <button
          type="button"
          className="window-control close"
          title="关闭"
          aria-label="关闭"
          onClick={() => void getCurrentWindow().close()}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
