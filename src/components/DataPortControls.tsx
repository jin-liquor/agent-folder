/**
 * 数据导入导出控件。
 *
 * 导出用于备份或换机迁移；导入是**合并**而非覆盖，已存在的路径会被跳过。
 */
import { useState } from "react";
import * as commands from "../lib/commands";
import { errorText } from "../lib/errors";
import { pickOpenPath, pickSavePath } from "../lib/system";

interface Props {
  /** 操作完成后通知外层刷新列表与提示。 */
  onImported: () => void;
  onToast: (message: string) => void;
}

const JSON_FILTER = [{ name: "JSON 文件", extensions: ["json"] }];

/** 导出文件的默认文件名，带日期便于区分多次备份。 */
function defaultFileName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  return `agent-folder-${stamp}.json`;
}

export default function DataPortControls({ onImported, onToast }: Props) {
  const [busy, setBusy] = useState<"export" | "import" | null>(null);

  const handleExport = async () => {
    setBusy("export");
    try {
      const path = await pickSavePath(defaultFileName(), JSON_FILTER);
      if (!path) return;
      const count = await commands.exportData(path);
      onToast(`已导出 ${count} 条记录`);
    } catch (error) {
      onToast(`导出失败：${errorText(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async () => {
    setBusy("import");
    try {
      const path = await pickOpenPath(JSON_FILTER);
      if (!path) return;
      const summary = await commands.importData(path);
      onImported();
      const parts = [`新增并保留 ${summary.added} 条`];
      if (summary.trimmed > 0) parts.push(`因容量上限裁剪 ${summary.trimmed} 条`);
      if (summary.skipped > 0) parts.push(`跳过 ${summary.skipped} 条（已存在或无效）`);
      onToast(`导入完成：${parts.join("，")}`);
    } catch (error) {
      onToast(`导入失败：${errorText(error)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={busy !== null}
        className="rounded-md border border-[var(--glass-border)] px-2 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
      >
        {busy === "export" ? "导出中…" : "导出"}
      </button>
      <button
        type="button"
        onClick={() => void handleImport()}
        disabled={busy !== null}
        className="rounded-md border border-[var(--glass-border)] px-2 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
      >
        {busy === "import" ? "导入中…" : "导入"}
      </button>
    </div>
  );
}
