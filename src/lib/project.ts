/**
 * 项目类型的展示元数据。
 *
 * 与后端 `src-tauri/src/services/project.rs` 的规则一一对应：
 * 后端负责识别并写入 `record.kind`，这里只决定显示什么。
 */

/** 每种项目类型对应的短标签与强调色。 */
const PROJECT_STYLES: Record<string, { label: string; color: string }> = {
  tauri: { label: "Tauri", color: "#ffc131" },
  rust: { label: "Rust", color: "#f97316" },
  node: { label: "Node", color: "#84cc16" },
  python: { label: "Python", color: "#3b82f6" },
  go: { label: "Go", color: "#06b6d4" },
  java: { label: "Java", color: "#ef4444" },
  dotnet: { label: ".NET", color: "#8b5cf6" },
  php: { label: "PHP", color: "#6366f1" },
  ruby: { label: "Ruby", color: "#e11d48" },
  cpp: { label: "C/C++", color: "#0ea5e9" },
};

/** 取项目类型的展示信息；未知类型返回 `null`，调用方按普通文件夹处理。 */
export function projectStyle(kind?: string | null) {
  if (!kind) return null;
  return PROJECT_STYLES[kind] ?? null;
}
