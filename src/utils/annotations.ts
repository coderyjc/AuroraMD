import type { AnnotationStatus } from "../types";

export function annotationStatusLabel(status: AnnotationStatus) {
  const labels: Record<AnnotationStatus, string> = {
    pending: "未处理",
    processed: "已处理",
    exported: "已导出",
    ignored: "搁置",
  };
  return labels[status] ?? status;
}
